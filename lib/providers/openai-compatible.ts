/**
 * 统一的 OpenAI 兼容 Provider Adapter。
 *
 * DeepSeek 与 Kimi（Moonshot）都提供 OpenAI 兼容的 /chat/completions 接口，
 * 本模块负责把它们统一抽象为流式文本输出（AsyncIterable<string>）。
 *
 * 只暴露抽象能力，不关心具体厂商；API Key 仅存在于服务端环境变量。
 */

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class OpenAICompatibleError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "OpenAICompatibleError";
    this.status = status;
  }
}

/**
 * 从一条 SSE `data:` 行的原始内容中提取增量文本。
 * 纯函数，便于单元测试。
 *
 * @param data SSE data 字段去掉 "data:" 前缀后的原始字符串
 * @returns 增量文本；若该行不是有效文本增量（如 [DONE]、非文本字段、非法 JSON）则返回 null
 */
export function extractDeltaFromSSEData(data: string): string | null {
  const trimmed = data.trim();
  if (trimmed === "[DONE]" || trimmed === "") return null;
  try {
    const json = JSON.parse(trimmed);
    const delta = json?.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      return delta;
    }
    return null;
  } catch {
    return null;
  }
}

function buildUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  // Kimi 的 BASE_URL 已含 /v1；DeepSeek 的不含，两者均以 /chat/completions 收尾
  return `${base}/chat/completions`;
}

/**
 * 流式调用 OpenAI 兼容的 chat completions 接口，产出增量文本。
 *
 * @param config provider 配置（baseUrl / apiKey / model / timeoutMs）
 * @param messages OpenAI 格式消息数组
 * @param signal 外部取消信号（用于「停止生成」）
 */
export async function* streamChatCompletion(
  config: OpenAICompatibleConfig,
  messages: ChatCompletionMessage[],
  signal?: AbortSignal
): AsyncIterable<string> {
  const { baseUrl, apiKey, model, timeoutMs = 30000 } = config;

  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", onAbort);
    }
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
    if (timedOut) {
      throw new OpenAICompatibleError("请求超时，请稍后重试");
    }
    if (signal?.aborted) {
      throw new OpenAICompatibleError("生成已停止");
    }
    throw new OpenAICompatibleError(
      `网络错误：${err instanceof Error ? err.message : "无法连接服务"}`
    );
  }

  clearTimeout(timer);
  if (signal) signal.removeEventListener("abort", onAbort);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `请求失败（HTTP ${res.status}）`;
    try {
      const json = JSON.parse(text);
      if (json?.error?.message) {
        message = json.error.message;
      }
    } catch {
      // 响应体非 JSON，忽略
    }
    // 注意：错误信息不回传 API Key，也不写入日志
    throw new OpenAICompatibleError(message, res.status);
  }

  if (!res.body) {
    throw new OpenAICompatibleError("响应体为空");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const delta = extractDeltaFromSSEData(trimmed.slice("data:".length));
        if (delta !== null) {
          yield delta;
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) {
      throw new OpenAICompatibleError("生成已停止");
    }
    if (err instanceof OpenAICompatibleError) {
      throw err;
    }
    throw new OpenAICompatibleError(
      err instanceof Error ? err.message : "读取流失败"
    );
  }
}
