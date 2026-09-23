import { describe, it, expect } from "vitest";
import { readBodyWithLimit } from "./body-limit";

function makeRequest(body: string, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("readBodyWithLimit", () => {
  it("读取正常请求体并保留中文", async () => {
    const req = makeRequest(JSON.stringify({ a: 1, b: "中文" }));
    const text = await readBodyWithLimit(req, 10_000);
    expect(JSON.parse(text as string)).toEqual({ a: 1, b: "中文" });
  });

  it("Content-Length 超限时立即拒绝", async () => {
    const req = makeRequest("x".repeat(100), { "content-length": "200" });
    expect(await readBodyWithLimit(req, 150)).toBeNull();
  });

  it("无 Content-Length 但实际字节超限时拒绝", async () => {
    const req = makeRequest("x".repeat(200));
    expect(await readBodyWithLimit(req, 100)).toBeNull();
  });

  it("空请求体返回空串", async () => {
    const req = new Request("http://localhost/api/chat", { method: "POST" });
    expect(await readBodyWithLimit(req, 1024)).toBe("");
  });
});
