/**
 * 内存级限流器（固定窗口算法）。
 *
 * 适用于单实例部署（Node 运行时 + 单进程）。
 * 多实例 / PM2 cluster / 多进程场景下，各进程内存不共享，
 * 限流会被削弱，应替换为 Redis 等共享存储（见 README 安全章节）。
 *
 * 内存保护：
 * - 全局额度优先检查，全局超限时直接拒绝，不创建任何 IP 记录
 * - 定期清理过期 IP 窗口，并设置最大容量，防止伪造 IP 导致内存耗尽
 *
 * 通过环境变量可调（见 .env.example）：
 * - NOVEL_RATE_LIMIT_DISABLED=1              禁用限流
 * - NOVEL_RATE_IP_PER_MINUTE / _PER_DAY      单 IP 分钟/每日额度
 * - NOVEL_RATE_GLOBAL_PER_MINUTE / _PER_DAY  全局分钟/每日额度
 * - NOVEL_RATE_MAX_IP_ENTRIES                IP 窗口最大条目数（默认 10000）
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
  maxIpEntries: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  enabled: true,
  ipPerMinute: 30,
  ipPerDay: 300,
  globalPerMinute: 120,
  globalPerDay: 5000,
  maxIpEntries: 10000,
};

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  reason: string;
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const GLOBAL_KEY = "__global__";
const CLEANUP_INTERVAL_MS = 60 * 1000;

const ipMinute = new Map<string, Window>();
const ipDay = new Map<string, Window>();
const globalMinute = new Map<string, Window>();
const globalDay = new Map<string, Window>();
let lastCleanupAt = 0;

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
    maxIpEntries: intEnv("NOVEL_RATE_MAX_IP_ENTRIES", DEFAULT_RATE_LIMIT.maxIpEntries),
  };
}

function getWindow(
  bucket: Map<string, Window>,
  key: string,
  now: number,
  windowMs: number
): Window {
  let w = bucket.get(key);
  if (!w || now >= w.resetAt + windowMs) {
    w = { count: 0, resetAt: now };
    bucket.set(key, w);
  }
  return w;
}

function retryAfterSeconds(w: Window, windowMs: number, now: number): number {
  return Math.max(1, Math.ceil((w.resetAt + windowMs - now) / 1000));
}

/** 清理过期 IP 窗口（全局窗口只有固定键，由 getWindow 惰性重置） */
function sweepExpired(now: number): void {
  for (const [k, w] of ipMinute) {
    if (now >= w.resetAt + MINUTE_MS) ipMinute.delete(k);
  }
  for (const [k, w] of ipDay) {
    if (now >= w.resetAt + DAY_MS) ipDay.delete(k);
  }
  lastCleanupAt = now;
}

/**
 * 检查并递增限流计数。
 *
 * 顺序保证内存安全：
 * 1. 全局额度优先——全局超限直接拒绝，不创建 IP 记录；
 * 2. 容量保护——新 IP 且表已满时，先清过期，仍满则拒绝；
 * 3. 单 IP 额度。
 *
 * @param key 限流键（由受信代理头得到的客户端 IP，或 "unknown"）
 * @param now 当前时间戳（测试时注入以精确控制窗口）
 */
export function checkRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  const opts = getRateLimitOptions();
  if (!opts.enabled) {
    return { allowed: true, retryAfterSeconds: 0, reason: "" };
  }

  // 定期清理过期窗口
  if (now - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
    sweepExpired(now);
  }

  // 1) 全局额度优先（不创建任何 IP 记录）
  const gMinute = getWindow(globalMinute, GLOBAL_KEY, now, MINUTE_MS);
  const gDay = getWindow(globalDay, GLOBAL_KEY, now, DAY_MS);
  const gMinuteExceeded = opts.globalPerMinute > 0 && gMinute.count >= opts.globalPerMinute;
  const gDayExceeded = opts.globalPerDay > 0 && gDay.count >= opts.globalPerDay;
  if (gMinuteExceeded || gDayExceeded) {
    // Retry-After 只按「实际超限」的窗口计算，未超限的窗口不参与
    let retryAfter = 0;
    if (gMinuteExceeded) {
      retryAfter = Math.max(retryAfter, retryAfterSeconds(gMinute, MINUTE_MS, now));
    }
    if (gDayExceeded) {
      retryAfter = Math.max(retryAfter, retryAfterSeconds(gDay, DAY_MS, now));
    }
    return { allowed: false, retryAfterSeconds: retryAfter, reason: "全局请求次数已达上限" };
  }

  // 2) 容量保护：分钟与每日两个 Map 都必须受容量限制；新 IP 且已达上限时先清过期
  const entryCount = Math.max(ipMinute.size, ipDay.size);
  if (!ipMinute.has(key) && entryCount >= opts.maxIpEntries) {
    sweepExpired(now);
    if (Math.max(ipMinute.size, ipDay.size) >= opts.maxIpEntries) {
      return { allowed: false, retryAfterSeconds: 1, reason: "服务繁忙，请稍后再试" };
    }
  }

  // 3) 单 IP 额度
  const ipM = getWindow(ipMinute, key, now, MINUTE_MS);
  const ipD = getWindow(ipDay, key, now, DAY_MS);
  const ipMinuteExceeded = opts.ipPerMinute > 0 && ipM.count >= opts.ipPerMinute;
  const ipDayExceeded = opts.ipPerDay > 0 && ipD.count >= opts.ipPerDay;
  if (ipMinuteExceeded || ipDayExceeded) {
    // Retry-After 只按「实际超限」的窗口计算
    let retryAfter = 0;
    if (ipMinuteExceeded) {
      retryAfter = Math.max(retryAfter, retryAfterSeconds(ipM, MINUTE_MS, now));
    }
    if (ipDayExceeded) {
      retryAfter = Math.max(retryAfter, retryAfterSeconds(ipD, DAY_MS, now));
    }
    return { allowed: false, retryAfterSeconds: retryAfter, reason: "单 IP 请求次数已达上限" };
  }

  // 4) 全部通过 → 递增计数
  gMinute.count += 1;
  gDay.count += 1;
  ipM.count += 1;
  ipD.count += 1;

  return { allowed: true, retryAfterSeconds: 0, reason: "" };
}

/** 仅供测试：返回当前 IP 窗口条目数（用于验证内存保护） */
export function getIpEntryCount(): number {
  return ipMinute.size;
}

/** 清空所有限流状态（仅供测试使用） */
export function resetRateLimiter(): void {
  ipMinute.clear();
  ipDay.clear();
  globalMinute.clear();
  globalDay.clear();
  lastCleanupAt = 0;
}
