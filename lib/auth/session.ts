/**
 * 会话管理：JWT 放在 HttpOnly Cookie 中（不落 localStorage）。
 */

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "novelwriter_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 天

export interface SessionPayload {
  sub: string;
  email: string;
  displayName: string;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET 未配置或过短（至少 32 字节），生产环境拒绝启动");
    }
    // 开发环境回退，仅用于本地调试
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-0123456789");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const secret = getJwtSecret();
  return new SignJWT({
    email: payload.email,
    displayName: payload.displayName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: (payload.email as string) ?? "",
      displayName: (payload.displayName as string) ?? "",
    };
  } catch {
    return null;
  }
}

/** Cookie 属性：HttpOnly + SameSite=Lax +（生产）Secure */
export function sessionCookieOptions(): {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function sessionCookieMaxAge(): number {
  return SESSION_TTL_SECONDS;
}
