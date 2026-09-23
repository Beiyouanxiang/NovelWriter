import { getRuntime } from "@/lib/runtime/runtime";
import { buildSystemPrompt } from "@/lib/novel/prompt";
import {
  validateChatRequest,
  utf8ByteLength,
  LIMITS,
} from "@/lib/novel/validate";
import type { NovelAgentEvent, NovelAgentInput } from "@/lib/novel/types";

/**
 * POST /api/chat
 *
 * 服务端唯一的大模型入口。前端不得直接调用厂商 API，
 * API Key 只存在于服务端环境变量，绝不进入浏览器、localStorage、日志或响应。
 *
 * 支持流式响应（SSE）与 AbortSignal（停止生成）。
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

function getAllowedProviders(): string[] {
  return (process.env.LLM_ALLOWED_PROVIDERS || "deepseek,kimi")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  // 1) 请求体大小校验（Content-Length 先行，读取时再兜底）
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > LIMITS.MAX_BODY_SIZE) {
    return jsonError(413, "请求体过大");
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (utf8ByteLength(text) > LIMITS.MAX_BODY_SIZE) {
      return jsonError(413, "请求体过大");
    }
    body = JSON.parse(text);
  } catch {
    return jsonError(400, "请求体不是合法的 JSON");
  }

  // 2) 结构与内容校验
  const result = validateChatRequest(body, getAllowedProviders());
  if (!result.ok || !result.value) {
    return jsonError(400, result.error || "请求校验失败");
  }

  const { provider, context, instruction } = result.value;

  // 3) 组装服务端 Prompt
  const systemPrompt = buildSystemPrompt(context.settings, context.manuscript);

  // 4) 构造 Runtime 输入（模型 ID 由 Runtime 从环境变量读取）
  const input: NovelAgentInput = {
    session: {
      messages: context.recentMessages,
    },
    prompt: systemPrompt,
    instruction,
    model: {
      provider: provider.toLowerCase(),
      // 模型 ID 不在此处指定，由 DirectApiRuntime 从 DEEPSEEK_MODEL / KIMI_MODEL 读取
      modelId: "",
    },
    novelContext: context,
  };

  // 5) 选择 Runtime 并流式返回
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
          if (event.type === "done" || event.type === "error") {
            break;
          }
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
