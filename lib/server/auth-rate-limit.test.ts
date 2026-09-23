import { describe, it, expect, beforeEach } from "vitest";
import { FixedWindowRateLimiter } from "./auth-rate-limit";

describe("FixedWindowRateLimiter（登录/注册限流）", () => {
  let limiter: FixedWindowRateLimiter;

  beforeEach(() => {
    limiter = new FixedWindowRateLimiter(3, 60_000);
  });

  it("未超限时放行", () => {
    for (let i = 0; i < 3; i++) {
      expect(limiter.check("ip1", i * 1000).allowed).toBe(true);
    }
  });

  it("超限后拒绝并给出 Retry-After", () => {
    limiter.check("ip1", 0);
    limiter.check("ip1", 1000);
    limiter.check("ip1", 2000);
    const blocked = limiter.check("ip1", 3000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("窗口过期后重新放行", () => {
    limiter.check("ip1", 0);
    expect(limiter.check("ip1", 60_001).allowed).toBe(true);
  });
});
