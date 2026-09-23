/**
 * CSRF 防护：double-submit cookie 模式。
 *
 * 服务端生成一个随机 token，同时写入一个非 HttpOnly 的 Cookie，
 * 前端读取该 Cookie 并在写请求中通过 X-CSRF-Token 头回传；
 * 服务端比对头与 Cookie 是否一致。跨站请求既读不到该 Cookie，
 * 也无法携带自定义头（触发 CORS 预检），从而阻断 CSRF。
 */

import { randomBytes } from "node:crypto";

export const CSRF_COOKIE = "novelwriter_csrf";

export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

export function csrfCookieOptions(): {
  httpOnly: false;
  sameSite: "lax";
  secure: boolean;
  path: string;
} {
  return {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function verifyCsrfToken(header: string | null, cookie: string | null): boolean {
  if (!header || !cookie) return false;
  if (header.length !== 64 || cookie.length !== 64) return false;
  // 常量时间比较，避免时序侧信道
  const a = Buffer.from(header);
  const b = Buffer.from(cookie);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
