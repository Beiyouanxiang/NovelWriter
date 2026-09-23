import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DirectApiRuntime, resolveProviderConfig } from "./direct-api";
import type { NovelAgentInput } from "@/lib/novel/types";

const ORIGINAL_ENV = { ...process.env };

function makeInput(provider: string): NovelAgentInput {
  return {
    session: { messages: [] },
    prompt: "system",
    instruction: "续写",
    model: { provider, modelId: "" },
    novelContext: {
      settings: {
        title: "",
        genre: "",
        summary: "",
        style: "",
        worldview: "",
        characters: "",
        outline: "",
        chapterGoal: "",
      },
      manuscript: { chapterTitle: "", content: "" },
      recentMessages: [],
    },
  };
}

describe("resolveProviderConfig", () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "sk-deepseek";
    process.env.DEEPSEEK_MODEL = "deepseek-chat";
    process.env.KIMI_API_KEY = "sk-kimi";
    process.env.KIMI_MODEL = "moonshot-v1-8k";
    process.env.GLM_API_KEY = "sk-glm";
    process.env.GLM_MODEL = "glm-4-flash";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("映射 deepseek 配置", () => {
    const cfg = resolveProviderConfig("deepseek");
    expect(cfg?.baseUrl).toBe("https://api.deepseek.com");
    expect(cfg?.apiKey).toBe("sk-deepseek");
    expect(cfg?.model).toBe("deepseek-chat");
  });

  it("映射 kimi 配置（默认 base url 含 /v1）", () => {
    const cfg = resolveProviderConfig("kimi");
    expect(cfg?.baseUrl).toBe("https://api.moonshot.ai/v1");
    expect(cfg?.apiKey).toBe("sk-kimi");
    expect(cfg?.model).toBe("moonshot-v1-8k");
  });

  it("映射 glm 配置（智谱 OpenAI 兼容接口）", () => {
    const cfg = resolveProviderConfig("glm");
    expect(cfg?.baseUrl).toBe("https://open.bigmodel.cn/api/paas/v4");
    expect(cfg?.apiKey).toBe("sk-glm");
    expect(cfg?.model).toBe("glm-4-flash");
  });

  it("未知 provider 返回 null", () => {
    expect(resolveProviderConfig("openai")).toBeNull();
  });
});

describe("DirectApiRuntime", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("未配置 API Key 时返回清晰错误事件", async () => {
    delete process.env.KIMI_API_KEY;
    const runtime = new DirectApiRuntime();
    const events = [];
    for await (const event of runtime.run(makeInput("kimi"))) {
      events.push(event);
    }
    expect(events[0].type).toBe("error");
    expect((events[0] as { message: string }).message).toContain("KIMI_API_KEY");
  });

  it("未配置模型时返回清晰错误事件", async () => {
    process.env.KIMI_API_KEY = "sk-kimi";
    delete process.env.KIMI_MODEL;
    const runtime = new DirectApiRuntime();
    const events = [];
    for await (const event of runtime.run(makeInput("kimi"))) {
      events.push(event);
    }
    expect(events[0].type).toBe("error");
    expect((events[0] as { message: string }).message).toContain("KIMI_MODEL");
  });

  it("不支持的 provider 返回错误事件", async () => {
    const runtime = new DirectApiRuntime();
    const events = [];
    for await (const event of runtime.run(makeInput("openai"))) {
      events.push(event);
    }
    expect(events[0].type).toBe("error");
    expect((events[0] as { message: string }).message).toContain("不支持的 provider");
  });
});
