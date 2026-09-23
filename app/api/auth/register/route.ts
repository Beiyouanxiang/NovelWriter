import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { generateCsrfToken, CSRF_COOKIE, csrfCookieOptions } from "@/lib/auth/csrf";
import { authLimiter } from "@/lib/server/auth-rate-limit";
import { getClientIp } from "@/lib/server/client-ip";
import { json, jsonError, readJsonBody } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(64).optional(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = authLimiter.check(`register:${ip}`);
  if (!limit.allowed) {
    return jsonError(429, "注册请求过于频繁，请稍后再试", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const body = await readJsonBody(request, 64 * 1024);
  if (!body.ok) return body.response;

  const parsed = registerSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(400, "邮箱格式不正确，或密码长度需在 8-128 位之间");
  }

  const { email, password, displayName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return jsonError(409, "该邮箱已注册");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: displayName || email.split("@")[0] || "作者",
    },
  });

  // 自动创建默认工作区（owner）
  await prisma.workspace.create({
    data: {
      name: "我的工作区",
      ownerId: user.id,
      members: { create: { userId: user.id, role: "owner" } },
    },
  });

  const token = await signSession({
    sub: user.id,
    email: user.email,
    displayName: user.displayName,
  });
  const csrf = generateCsrfToken();

  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
  store.set(CSRF_COOKIE, csrf, csrfCookieOptions());

  return json(201, {
    user: { id: user.id, email: user.email, displayName: user.displayName },
  });
}
