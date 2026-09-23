import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRuntime } from "@/lib/runtime/runtime";
import { buildSystemPrompt } from "@/lib/novel/prompt";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { getClientIp } from "@/lib/server/client-ip";
import { getSession } from "@/lib/server/auth-context";
import { requireRole } from "@/lib/server/permissions";
import { requireCsrf } from "@/lib/server/http";
import { readBodyWithLimit } from "@/lib/server/body-limit";
import type { NovelSettings, ManuscriptState, NovelAgentEvent, NovelAgentInput } from "@/lib/novel/types";

/**
 * POST /api/chat
 *
 * 服务端唯一的大模型入口。要求登录 + 工作区成员（editor 及以上）。
 * 从数据库加载小说设定与章节正文组装 Prompt，不信任客户端传入的作品内容。
 * API Key 只存在于服务端环境变量。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const chatSchema = z.object({
  provider: z.string().min(1).max(32),
  novelId: z.string().min(1).max(64),
  chapterId: z.string().max(64).optional(),
  instruction: z.string().min(1).max(20000),
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(20000),
      })
    )
    .max(40),
});

function getAllowedProviders(): string[] {
  return (process.env.LLM_ALLOWED_PROVIDERS || "deepseek,kimi,glm")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
}

function jsonError2(status: number, message: string, headers?: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export async function POST(request: Request) {
  // 1) 登录校验
  const session = await getSession();
  if (!session) return jsonError2(401, "未登录");

  // 2) CSRF
  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  // 3) 限流
  const ip = getClientIp(request);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return jsonError2(429, rate.reason || "请求过于频繁，请稍后再试", {
      "Retry-After": String(rate.retryAfterSeconds),
    });
  }

  // 4) 读取并校验请求体
  const text = await readBodyWithLimit(request, 2 * 1024 * 1024);
  if (text === null) return jsonError2(413, "请求体过大");

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonError2(400, "请求体不是合法的 JSON");
  }
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) return jsonError2(400, "请求参数不合法");

  const { provider, novelId, chapterId, instruction, recentMessages } = parsed.data;

  // 5) 校验 provider 白名单
  const providerName = provider.toLowerCase();
  if (!getAllowedProviders().includes(providerName)) {
    return jsonError2(400, `不支持的 provider：${provider}`);
  }

  // 6) 从数据库加载小说与章节，校验成员身份（editor）
  const novel = await prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel || novel.deletedAt) return jsonError2(404, "小说不存在");

  const perm = await requireRole(novel.workspaceId, session.sub, "editor");
  if (!perm.ok) return jsonError2(perm.status, perm.error);

  const chapter = chapterId
    ? await prisma.chapter.findUnique({ where: { id: chapterId } })
    : null;
  if (chapterId && (!chapter || chapter.deletedAt || chapter.novelId !== novelId)) {
    return jsonError2(404, "章节不存在");
  }

  // 7) 组装服务端 Prompt（来自数据库，不信任客户端）
  const settings: NovelSettings = {
    title: novel.title,
    genre: novel.genre,
    summary: novel.summary,
    style: novel.style,
    worldview: novel.worldview,
    characters: novel.characters,
    outline: novel.outline,
    chapterGoal: chapter?.chapterGoal ?? "",
  };
  const manuscript: ManuscriptState = {
    chapterTitle: chapter?.title ?? "",
    content: chapter?.content ?? "",
  };
  const systemPrompt = buildSystemPrompt(settings, manuscript);

  const input: NovelAgentInput = {
    session: { messages: recentMessages },
    prompt: systemPrompt,
    instruction,
    model: { provider: providerName, modelId: "" },
    novelContext: {
      settings,
      manuscript,
      recentMessages,
    },
  };

  // 8) 流式返回
  const runtime = getRuntime();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: NovelAgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        for await (const event of runtime.run(input, request.signal)) {
          send(event);
          if (event.type === "done" || event.type === "error") break;
        }
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "内部错误",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
