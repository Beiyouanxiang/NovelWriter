import { getSession } from "@/lib/server/auth-context";
import { json, jsonError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");
  return json(200, { ok: true, serverTime: new Date().toISOString() });
}
