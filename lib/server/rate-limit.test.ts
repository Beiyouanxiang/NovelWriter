import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkRateLimit, resetRateLimiter } from "./rate-limit";

const ORIGINAL_ENV = { ...process.env };

function setLimits(ipMinute: number, ipDay: number, gMinute: number, gDay: number) {
  process.env.NOVEL_RATE_LIMIT_DISABLED = "";
  process.env.NOVEL_RATE_IP_PER_MINUTE = String(ipMinute);
  process.env.NOVEL_RATE_IP_PER_DAY = String(ipDay);
  process.env.NOVEL_RATE_GLOBAL_PER_MINUTE = String(gMinute);
  process.env.NOVEL_RATE_GLOBAL_PER_DAY = String(gDay);
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetRateLimiter();
  });

  it("未超限时放行", () => {
    setLimits(30, 300, 120, 5000);
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("1.2.3.4", i * 1000).allowed).toBe(true);
    }
  });

  it("超过单 IP 分钟额度后拒绝并返回 Retry-After", () => {
    setLimits(3, 1000, 1000, 100000);
    expect(checkRateLimit("9.9.9.9", 0).allowed).toBe(true);
    expect(checkRateLimit("9.9.9.9", 1000).allowed).toBe(true);
    expect(checkRateLimit("9.9.9.9", 2000).allowed).toBe(true);
    const blocked = checkRateLimit("9.9.9.9", 3000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("单 IP 每分钟");
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("窗口过期后重新放行", () => {
    setLimits(1, 1000, 1000, 100000);
    expect(checkRateLimit("8.8.8.8", 0).allowed).toBe(true);
    expect(checkRateLimit("8.8.8.8", 1000).allowed).toBe(false);
    // 60 秒后窗口重置
    expect(checkRateLimit("8.8.8.8", 60_000 + 1).allowed).toBe(true);
  });

  it("全局额度对任意 IP 生效", () => {
    setLimits(1000, 1000, 2, 100000);
    expect(checkRateLimit("a.a.a.a", 0).allowed).toBe(true);
    expect(checkRateLimit("b.b.b.b", 1000).allowed).toBe(true);
    const blocked = checkRateLimit("c.c.c.c", 2000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("全局每分钟");
  });

  it("禁用限流时始终放行", () => {
    setLimits(1, 1, 1, 1);
    process.env.NOVEL_RATE_LIMIT_DISABLED = "1";
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("x.x.x.x", i).allowed).toBe(true);
    }
  });
});
