import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/server/auth-context";
import { json, jsonError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return jsonError(401, "未登录");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, displayName: true },
  });
  if (!user) {
    return jsonError(401, "未登录");
  }
  return json(200, { user });
}
