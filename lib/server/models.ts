/**
 * 模型列表解析：每个 provider 允许哪些模型，来自环境变量。
 * - XXX_MODEL  默认模型（单个）
 * - XXX_MODELS 允许列表（逗号分隔，可多个）；未配置则回退为 [XXX_MODEL]
 */

export interface ProviderModelInfo {
  id: string;
  label: string;
  models: string[];
  defaultModel: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  kimi: "Kimi",
  glm: "GLM",
};

function defaultProviders(): string[] {
  return (process.env.LLM_ALLOWED_PROVIDERS || "deepseek,kimi,glm")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function getProviderModels(): ProviderModelInfo[] {
  return defaultProviders()
    .filter((p) => PROVIDER_LABELS[p])
    .map((p) => {
      const prefix = p.toUpperCase();
      const defaultModel = process.env[`${prefix}_MODEL`] || "";
      const modelsEnv = process.env[`${prefix}_MODELS`] || "";
      const models = modelsEnv
        ? modelsEnv
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : defaultModel
          ? [defaultModel]
          : [];
      return { id: p, label: PROVIDER_LABELS[p], models, defaultModel };
    });
}

/** 校验某个 provider 是否允许某模型；未配置白名单时不限制（由 runtime 报错兜底） */
export function isModelAllowed(provider: string, model: string): boolean {
  const info = getProviderModels().find((p) => p.id === provider.toLowerCase());
  if (!info) return false;
  if (info.models.length === 0) return true;
  return info.models.includes(model);
}
