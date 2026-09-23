/**
 * 提取客户端 IP。
 *
 * 安全要求：默认不信任任何客户端可伪造的代理头。
 * 仅当服务明确位于受信反向代理（如 Nginx）之后、且该代理以「覆盖」方式
 * 写入 X-Real-IP（`proxy_set_header X-Real-IP $remote_addr;`）时，
 * 才应配置 TRUSTED_IP_HEADER=x-real-ip。
 *
 * 未配置 TRUSTED_IP_HEADER 时，一律返回 "unknown"（所有匿名请求共享同一桶，
 * 无法通过伪造 IP 绕过限流，也不会因伪造 IP 造成内存增长）。
 */

export function getClientIp(request: Request): string {
  const headerName = (process.env.TRUSTED_IP_HEADER || "").trim().toLowerCase();
  if (!headerName) return "unknown";

  const value = request.headers.get(headerName);
  if (value) {
    const first = value.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
