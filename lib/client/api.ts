/**
 * 客户端 API 封装：自动携带 Cookie、CSRF Token、统一错误处理。
 * 登录 Token 仅在 HttpOnly Cookie 中，不进入 localStorage 或请求体。
 */

export class ApiError extends Error {
  status: number;
  data?: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)novelwriter_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  csrf?: boolean;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  let body: string | undefined;

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  if (method !== "GET" && options.csrf !== false) {
    headers["X-CSRF-Token"] = getCsrfToken();
  }

  const res = await fetch(path, {
    method,
    headers,
    body,
    credentials: "same-origin",
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // 非 JSON 响应（如流式），忽略
  }

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in (data as object)
        ? String((data as { error: string }).error)
        : `请求失败（HTTP ${res.status}）`;
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}
