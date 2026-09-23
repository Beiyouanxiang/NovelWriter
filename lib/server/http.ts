/**
 * 服务端 HTTP 工具：JSON 响应、CSRF 校验、带大小限制的 JSON body 读取。
 */

import { readBodyWithLimit } from "@/lib/server/body-limit";
import { verifyCsrfToken, CSRF_COOKIE } from "@/lib/auth/csrf";

export function json(
  status: number,
  body: unknown,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function jsonError(
  status: number,
  message: string,
  headers?: Record<string, string>
): Response {
  return json(status, { error: message }, headers);
}

/** 读取并解析带大小限制的 JSON 请求体；失败返回 { ok: false, response } */
export async function readJsonBody(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> {
  const text = await readBodyWithLimit(request, maxBytes);
  if (text === null) {
    return { ok: false, response: jsonError(413, "请求体过大") };
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, response: jsonError(400, "请求体不是合法的 JSON") };
  }
}

/** 校验 CSRF（写请求）。失败返回 403 响应，成功返回 null */
export function requireCsrf(request: Request): Response | null {
  const header = request.headers.get("x-csrf-token");
  const cookie = request.headers.get("cookie") ?? "";
  const csrfCookie = readCookie(cookie, CSRF_COOKIE);
  if (!verifyCsrfToken(header, csrfCookie)) {
    return jsonError(403, "CSRF 校验失败");
  }
  return null;
}

function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}
