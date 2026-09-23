/**
 * 增量读取请求体，超过字节上限时立即取消读取。
 *
 * 避免 `request.text()` 在无 / 伪造 Content-Length 时
 * 先把超大 chunked body 整体读入内存。
 */

export async function readBodyWithLimit(
  request: Request,
  maxBytes: number
): Promise<string | null> {
  // 快速路径：Content-Length 可信且超限，直接拒绝
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > maxBytes) {
    return null;
  }

  const body = request.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    // 读取失败视为非法请求体
    return null;
  }

  if (chunks.length === 0) return "";

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
