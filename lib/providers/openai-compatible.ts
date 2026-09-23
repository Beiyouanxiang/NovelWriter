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

  // 内部 AbortController：同时承接「超时」与「外部取消」两种信号
  const controller = new AbortController();
  let timedOut = false;

  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", onAbort);
    }
  }

  // 超时定时器：每次读到数据前重新计时，覆盖「等待响应头」和「生成中途停滞」两段。
  // 若两次数据间隔超过 timeoutMs，则判定为卡住并中止。
  let timer: ReturnType<typeof setTimeout> | null = null;
  const armTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };
  const disarmTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  try {
    armTimer();
    const res = await fetch(buildUrl(baseUrl), {
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
        armTimer();
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
    } finally {
      // 读取结束或异常时取消 reader，释放底层连接（超时/取消时尤为重要）
      await reader.cancel().catch(() => {});
    }
  } catch (err) {
    if (timedOut) {
      throw new OpenAICompatibleError("请求超时，请稍后重试");
    }
    if (signal?.aborted) {
      throw new OpenAICompatibleError("生成已停止");
    }
    if (err instanceof OpenAICompatibleError) {
      throw err;
    }
    throw new OpenAICompatibleError(
      err instanceof Error ? err.message : "网络或读取流错误"
    );
  } finally {
    // 清理统一放在 finally，确保覆盖整个流读取过程
    disarmTimer();
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}
