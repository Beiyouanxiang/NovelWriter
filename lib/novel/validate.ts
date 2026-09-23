import type { ChatRequest } from "./types";

/**
 * 请求校验：请求大小、消息数量、消息长度。
 * 纯函数，便于单元测试。
 */

export const LIMITS = {
  /** 请求体最大字节数（约 2MB） */
  MAX_BODY_SIZE: 2 * 1024 * 1024,
  /** 单次请求最多携带的历史消息条数 */
  MAX_MESSAGES: 40,
  /** 单条消息最大字符数 */
  MAX_MESSAGE_LENGTH: 20000,
  /** 用户本次指令最大字符数 */
  MAX_INSTRUCTION_LENGTH: 20000,
  /** 单个设定字段最大字符数 */
  MAX_SETTING_LENGTH: 20000,
  /** 正文最大字符数 */
  MAX_MANUSCRIPT_LENGTH: 200000,
} as const;

export interface ValidationResult {
  ok: boolean;
  error?: string;
  value?: ChatRequest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, maxLength: number, name: string): string | null {
  if (typeof value !== "string") {
    return `字段 ${name} 必须是字符串`;
  }
  if (value.length > maxLength) {
    return `字段 ${name} 超过最大长度 ${maxLength}`;
  }
  return null;
}

/**
 * 校验客户端提交的 ChatRequest。
 * @param body 已 JSON.parse 的请求体
 * @param allowedProviders 允许的 provider 列表
 */
export function validateChatRequest(
  body: unknown,
  allowedProviders: string[]
): ValidationResult {
  if (!isRecord(body)) {
    return { ok: false, error: "请求体必须是 JSON 对象" };
  }

  const { provider, instruction, context } = body;

  const providerErr = asString(provider, 32, "provider");
  if (providerErr) return { ok: false, error: providerErr };
  const providerName = (provider as string).toLowerCase().trim();
  if (!allowedProviders.includes(providerName)) {
    return {
      ok: false,
      error: `不支持的 provider：${provider}（允许：${allowedProviders.join(", ")}）`,
    };
  }

  const instructionErr = asString(instruction, LIMITS.MAX_INSTRUCTION_LENGTH, "instruction");
  if (instructionErr) return { ok: false, error: instructionErr };
  if (!(instruction as string).trim()) {
    return { ok: false, error: "指令内容不能为空" };
  }

  if (!isRecord(context)) {
    return { ok: false, error: "字段 context 必须是对象" };
  }

  const { settings, manuscript, recentMessages } = context as Record<
    string,
    unknown
  >;

  if (!isRecord(settings)) {
    return { ok: false, error: "字段 context.settings 必须是对象" };
  }

  // 校验作品设定各字段
  const settingFields = [
    "title",
    "genre",
    "summary",
    "style",
    "worldview",
    "characters",
    "outline",
    "chapterGoal",
  ] as const;
  for (const field of settingFields) {
    const err = asString(
      (settings as Record<string, unknown>)[field],
      LIMITS.MAX_SETTING_LENGTH,
      `settings.${field}`
    );
    if (err) return { ok: false, error: err };
  }

  if (!isRecord(manuscript)) {
    return { ok: false, error: "字段 context.manuscript 必须是对象" };
  }
  const chapterTitleErr = asString(
    (manuscript as Record<string, unknown>).chapterTitle,
    LIMITS.MAX_SETTING_LENGTH,
    "manuscript.chapterTitle"
  );
  if (chapterTitleErr) return { ok: false, error: chapterTitleErr };
  const contentErr = asString(
    (manuscript as Record<string, unknown>).content,
    LIMITS.MAX_MANUSCRIPT_LENGTH,
    "manuscript.content"
  );
  if (contentErr) return { ok: false, error: contentErr };

  if (!Array.isArray(recentMessages)) {
    return { ok: false, error: "字段 context.recentMessages 必须是数组" };
  }
  if (recentMessages.length > LIMITS.MAX_MESSAGES) {
    return {
      ok: false,
      error: `历史消息数量超过上限 ${LIMITS.MAX_MESSAGES}`,
    };
  }
  for (let i = 0; i < recentMessages.length; i++) {
    const msg = recentMessages[i];
    if (!isRecord(msg)) {
      return { ok: false, error: `recentMessages[${i}] 必须是对象` };
    }
    if (msg.role !== "user" && msg.role !== "assistant") {
      return { ok: false, error: `recentMessages[${i}].role 非法` };
    }
    const msgErr = asString(msg.content, LIMITS.MAX_MESSAGE_LENGTH, `recentMessages[${i}].content`);
    if (msgErr) return { ok: false, error: msgErr };
  }

  return {
    ok: true,
    value: body as unknown as ChatRequest,
  };
}

/** 估算字符串 UTF-8 字节数 */
export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
