import { describe, it, expect, afterEach } from "vitest";
import { getProviderModels, isModelAllowed } from "./models";

const ORIGINAL_ENV = { ...process.env };

describe("models 模型列表", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("从 LLM_ALLOWED_PROVIDERS 返回 provider 列表", () => {
    process.env.LLM_ALLOWED_PROVIDERS = "deepseek,kimi,glm";
    process.env.DEEPSEEK_MODEL = "deepseek-chat";
    process.env.DEEPSEEK_MODELS = "deepseek-chat,deepseek-reasoner";
    const providers = getProviderModels();
    expect(providers.map((p) => p.id)).toEqual(["deepseek", "kimi", "glm"]);
    const ds = providers.find((p) => p.id === "deepseek")!;
    expect(ds.models).toEqual(["deepseek-chat", "deepseek-reasoner"]);
    expect(ds.defaultModel).toBe("deepseek-chat");
  });

  it("未配置 MODELS 时回退到单个 MODEL", () => {
    process.env.LLM_ALLOWED_PROVIDERS = "deepseek";
    process.env.DEEPSEEK_MODEL = "deepseek-chat";
    delete process.env.DEEPSEEK_MODELS;
    const p = getProviderModels()[0];
    expect(p.models).toEqual(["deepseek-chat"]);
  });

  it("isModelAllowed 校验白名单", () => {
    process.env.LLM_ALLOWED_PROVIDERS = "deepseek,glm";
    process.env.DEEPSEEK_MODEL = "deepseek-chat";
    process.env.DEEPSEEK_MODELS = "deepseek-chat,deepseek-reasoner";
    process.env.GLM_MODEL = "glm-4-flash";
    process.env.GLM_MODELS = "glm-4-flash,glm-4-plus";
    expect(isModelAllowed("deepseek", "deepseek-chat")).toBe(true);
    expect(isModelAllowed("deepseek", "glm-4-flash")).toBe(false);
    expect(isModelAllowed("glm", "glm-4-plus")).toBe(true);
    expect(isModelAllowed("kimi", "anything")).toBe(false);
  });
});
