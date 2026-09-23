import type { NovelRuntime, NovelAgentInput, NovelAgentEvent } from "@/lib/novel/types";
import {
  streamChatCompletion,
  type ChatCompletionMessage,
} from "@/lib/providers/openai-compatible";

/**
 * DirectApiRuntime —— 直接调用 DeepSeek / Kimi 的 OpenAI 兼容接口。
 *
 * 模型 ID 一律从服务端环境变量读取，绝不写死；API Key 只存在于服务端。
 */

interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface ProviderEnvSpec {
  baseUrlEnv: string;
  apiKeyEnv: string;
  modelEnv: string;
  defaultBaseUrl: string;
}

const PROVIDER_ENV: Record<string, ProviderEnvSpec> = {
  deepseek: {
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    defaultBaseUrl: "https://api.deepseek.com",
  },
  kimi: {
    baseUrlEnv: "KIMI_BASE_URL",
    apiKeyEnv: "KIMI_API_KEY",
    modelEnv: "KIMI_MODEL",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
  },
  glm: {
    baseUrlEnv: "GLM_BASE_URL",
    apiKeyEnv: "GLM_API_KEY",
    modelEnv: "GLM_MODEL",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
  },
};

/** 读取 provider 的运行时配置（每次调用时读取，便于测试与热更新） */
export function resolveProviderConfig(provider: string): ProviderConfig | null {
  const spec = PROVIDER_ENV[provider.toLowerCase()];
  if (!spec) return null;
  return {
    baseUrl: process.env[spec.baseUrlEnv] || spec.defaultBaseUrl,
    apiKey: process.env[spec.apiKeyEnv] || "",
    model: process.env[spec.modelEnv] || "",
  };
}

export function isProviderSupported(provider: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROVIDER_ENV, provider.toLowerCase());
}

export class DirectApiRuntime implements NovelRuntime {
  async *run(
    input: NovelAgentInput,
    signal?: AbortSignal
  ): AsyncIterable<NovelAgentEvent> {
    const provider = input.model.provider.toLowerCase();
    const config = resolveProviderConfig(provider);

    if (!config) {
      yield {
        type: "error",
        message: `不支持的 provider：${input.model.provider}`,
      };
      return;
    }
    if (!config.apiKey) {
      yield {
        type: "error",
        message: `未配置 ${provider.toUpperCase()}_API_KEY，请在服务端环境变量中设置`,
      };
      return;
    }
    if (!config.model) {
      yield {
        type: "error",
        message: `未配置 ${provider.toUpperCase()}_MODEL，请在服务端环境变量中设置`,
      };
      return;
    }

    const messages: ChatCompletionMessage[] = [
      { role: "system", content: input.prompt },
      ...input.session.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: input.instruction },
    ];

    // 模型：请求里显式指定的 modelId 优先，否则回退到环境变量默认值
    const model = input.model.modelId || config.model;
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 30000);

    try {
      for await (const delta of streamChatCompletion(
        {
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model,
          timeoutMs,
        },
        messages,
        signal
      )) {
        yield { type: "delta", content: delta };
      }
      yield { type: "done" };
    } catch (err) {
      yield {
        type: "error",
        message:
          err instanceof Error ? err.message : "生成失败，请稍后重试",
      };
    }
  }
}
