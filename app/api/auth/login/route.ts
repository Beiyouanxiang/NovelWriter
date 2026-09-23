import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { generateCsrfToken, CSRF_COOKIE, csrfCookieOptions } from "@/lib/auth/csrf";
import { authLimiter } from "@/lib/server/auth-rate-limit";
import { getClientIp } from "@/lib/server/client-ip";
import { json, jsonError, readJsonBody } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = authLimiter.check(`login:${ip}`);
  if (!limit.allowed) {
    return jsonError(429, "登录尝试过于频繁，请稍后再试", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const body = await readJsonBody(request, 64 * 1024);
  if (!body.ok) return body.response;

  const parsed = loginSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(400, "请输入有效的邮箱和密码");
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // 统一错误信息，避免泄露邮箱是否已注册
  if (!user) {
    return jsonError(401, "邮箱或密码错误");
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return jsonError(401, "邮箱或密码错误");
  }

  const token = await signSession({
    sub: user.id,
    email: user.email,
    displayName: user.displayName,
  });
  const csrf = generateCsrfToken();

  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
  store.set(CSRF_COOKIE, csrf, csrfCookieOptions());

  return json(200, {
    user: { id: user.id, email: user.email, displayName: user.displayName },
  });
}
