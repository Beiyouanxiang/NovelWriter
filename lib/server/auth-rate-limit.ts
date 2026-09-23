/**
 * 登录 / 注册等敏感接口的独立限流（固定窗口，比 chat 接口更严格）。
 */

export class FixedWindowRateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  check(key: string, now: number = Date.now()): {
    allowed: boolean;
    retryAfterSeconds: number;
  } {
    let w = this.windows.get(key);
    if (!w || now >= w.resetAt + this.windowMs) {
      w = { count: 0, resetAt: now };
      this.windows.set(key, w);
    }
    if (w.count >= this.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt + this.windowMs - now) / 1000)),
      };
    }
    w.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  reset(): void {
    this.windows.clear();
  }
}

/** 登录/注册：每 IP 15 分钟最多 10 次 */
export const authLimiter = new FixedWindowRateLimiter(10, 15 * 60 * 1000);
