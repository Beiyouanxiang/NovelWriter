import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import { resetRateLimiter } from "@/lib/server/rate-limit";

const ORIGINAL_ENV = { ...process.env };

function validBody() {
  return JSON.stringify({
    provider: "deepseek",
    instruction: "续写",
    context: {
      settings: {
        title: "测试",
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
  });
}

describe("POST /api/chat 访问控制", () => {
  beforeEach(() => {
    resetRateLimiter();
    process.env.NOVEL_RUNTIME = "direct";
    delete process.env.NOVEL_ACCESS_TOKEN;
    delete process.env.DEEPSEEK_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetRateLimiter();
  });

  it("配置访问口令后，缺失口令返回 401", async () => {
    process.env.NOVEL_ACCESS_TOKEN = "secret123";
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: validBody(),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("访问口令");
  });

  it("配置访问口令后，错误口令返回 401", async () => {
    process.env.NOVEL_ACCESS_TOKEN = "secret123";
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-access-token": "wrong" },
      body: validBody(),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("超过限流返回 429 与 Retry-After", async () => {
    process.env.NOVEL_RATE_IP_PER_MINUTE = "1";
    process.env.NOVEL_RATE_IP_PER_DAY = "1000";
    process.env.NOVEL_RATE_GLOBAL_PER_MINUTE = "1000";
    process.env.NOVEL_RATE_GLOBAL_PER_DAY = "100000";

    const make = () =>
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: validBody(),
      });

    const first = await POST(make());
    expect(first.status).toBe(200);
    await first.text().catch(() => {});

    const second = await POST(make());
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });

  it("正确口令 + 合法请求：未配置 Key 时返回流式 error", async () => {
    process.env.NOVEL_ACCESS_TOKEN = "secret123";
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-access-token": "secret123" },
      body: validBody(),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain('"type":"error"');
    expect(text).toContain("DEEPSEEK_API_KEY");
  });
});
