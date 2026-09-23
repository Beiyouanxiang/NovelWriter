/**
 * 内存级限流器（固定窗口算法）。
 *
 * 适用于单实例部署（Node 运行时 + 单进程）。
 * 多实例 / PM2 cluster / 多进程场景下，各进程内存不共享，
 * 限流会被削弱，应替换为 Redis 等共享存储（见 README 安全章节）。
 *
 * 通过环境变量可调（见 .env.example）：
 * - NOVEL_RATE_LIMIT_DISABLED=1              禁用限流
 * - NOVEL_RATE_IP_PER_MINUTE / _PER_DAY      单 IP 分钟/每日额度
 * - NOVEL_RATE_GLOBAL_PER_MINUTE / _PER_DAY  全局分钟/每日额度
 */

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  enabled: boolean;
  ipPerMinute: number;
  ipPerDay: number;
  globalPerMinute: number;
  globalPerDay: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  enabled: true,
  ipPerMinute: 30,
  ipPerDay: 300,
  globalPerMinute: 120,
  globalPerDay: 5000,
};

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  reason: string;
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const GLOBAL_KEY = "__global__";

const ipMinute = new Map<string, Window>();
const ipDay = new Map<string, Window>();
const globalMinute = new Map<string, Window>();
const globalDay = new Map<string, Window>();

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getRateLimitOptions(): RateLimitOptions {
  return {
    enabled: process.env.NOVEL_RATE_LIMIT_DISABLED !== "1",
    ipPerMinute: intEnv("NOVEL_RATE_IP_PER_MINUTE", DEFAULT_RATE_LIMIT.ipPerMinute),
    ipPerDay: intEnv("NOVEL_RATE_IP_PER_DAY", DEFAULT_RATE_LIMIT.ipPerDay),
    globalPerMinute: intEnv(
      "NOVEL_RATE_GLOBAL_PER_MINUTE",
      DEFAULT_RATE_LIMIT.globalPerMinute
    ),
    globalPerDay: intEnv("NOVEL_RATE_GLOBAL_PER_DAY", DEFAULT_RATE_LIMIT.globalPerDay),
  };
}

function getWindow(bucket: Map<string, Window>, key: string, now: number, windowMs: number): Window {
  let w = bucket.get(key);
  if (!w || now >= w.resetAt + windowMs) {
    w = { count: 0, resetAt: now };
    bucket.set(key, w);
  }
  return w;
}

/**
 * 检查并递增限流计数。
 *
 * @param key 限流键（通常为客户端 IP；全局用固定键）
 * @param now 当前时间戳（测试时注入以精确控制窗口）
 */
export function checkRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  const opts = getRateLimitOptions();
  if (!opts.enabled) {
    return { allowed: true, retryAfterSeconds: 0, reason: "" };
  }

  const windows: Array<{
    bucket: Map<string, Window>;
    key: string;
    limit: number;
    ms: number;
    label: string;
  }> = [
    { bucket: ipMinute, key, limit: opts.ipPerMinute, ms: MINUTE_MS, label: "单 IP 每分钟" },
    { bucket: ipDay, key, limit: opts.ipPerDay, ms: DAY_MS, label: "单 IP 每日" },
    { bucket: globalMinute, key: GLOBAL_KEY, limit: opts.globalPerMinute, ms: MINUTE_MS, label: "全局每分钟" },
    { bucket: globalDay, key: GLOBAL_KEY, limit: opts.globalPerDay, ms: DAY_MS, label: "全局每日" },
  ];

  // 先检查是否任一窗口超限
  let retryAfter = 0;
  let reason = "";
  for (const w of windows) {
    if (w.limit <= 0) continue;
    const win = getWindow(w.bucket, w.key, now, w.ms);
    if (win.count >= w.limit) {
      const seconds = Math.max(1, Math.ceil((win.resetAt + w.ms - now) / 1000));
      retryAfter = Math.max(retryAfter, seconds);
      reason = `${w.label}请求次数已达上限`;
    }
  }
  if (reason) {
    return { allowed: false, retryAfterSeconds: retryAfter, reason };
  }

  // 全部通过 → 递增计数
  for (const w of windows) {
    if (w.limit <= 0) continue;
    getWindow(w.bucket, w.key, now, w.ms).count += 1;
  }

  return { allowed: true, retryAfterSeconds: 0, reason: "" };
}

/** 清空所有限流状态（仅供测试使用） */
export function resetRateLimiter(): void {
  ipMinute.clear();
  ipDay.clear();
  globalMinute.clear();
  globalDay.clear();
}
