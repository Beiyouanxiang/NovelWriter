import { describe, it, expect } from "vitest";
import { generateCsrfToken, verifyCsrfToken } from "./csrf";

describe("csrf", () => {
  it("生成 64 位十六进制 token", () => {
    const token = generateCsrfToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it("头与 Cookie 一致时通过", () => {
    const token = generateCsrfToken();
    expect(verifyCsrfToken(token, token)).toBe(true);
  });

  it("头与 Cookie 不一致时拒绝", () => {
    expect(verifyCsrfToken(generateCsrfToken(), generateCsrfToken())).toBe(false);
  });

  it("缺失任一项时拒绝", () => {
    expect(verifyCsrfToken(null, generateCsrfToken())).toBe(false);
    expect(verifyCsrfToken(generateCsrfToken(), null)).toBe(false);
    expect(verifyCsrfToken("", "")).toBe(false);
  });
});
