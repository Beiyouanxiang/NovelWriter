import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/server/auth-context";
import { requireRole } from "@/lib/server/permissions";
import { json, jsonError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveWorkspace(entityType: string, entityId: string): Promise<string | null> {
  if (entityType === "novel") {
    const n = await prisma.novel.findUnique({ where: { id: entityId }, select: { workspaceId: true } });
    return n?.workspaceId ?? null;
  }
  if (entityType === "chapter") {
    const c = await prisma.chapter.findUnique({
      where: { id: entityId },
      select: { novel: { select: { workspaceId: true } } },
    });
    return c?.novel.workspaceId ?? null;
  }
  return null;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType") ?? "";
  const entityId = url.searchParams.get("entityId") ?? "";
  if (!["novel", "chapter"].includes(entityType) || !entityId) {
    return jsonError(400, "缺少 entityType 或 entityId");
  }

  const workspaceId = await resolveWorkspace(entityType, entityId);
  if (!workspaceId) return jsonError(404, "内容不存在");

  const perm = await requireRole(workspaceId, session.sub, "viewer");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  const revisions = await prisma.revision.findMany({
    where: { entityType, entityId },
    orderBy: { revision: "desc" },
    take: 30,
    include: { user: { select: { displayName: true, email: true } } },
  });

  return json(200, {
    revisions: revisions.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      revision: r.revision,
      userId: r.userId,
      displayName: r.user.displayName,
      createdAt: r.createdAt.toISOString(),
      snapshot: r.snapshot,
    })),
  });
}
