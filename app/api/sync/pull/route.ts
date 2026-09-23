import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/server/auth-context";
import { requireRole } from "@/lib/server/permissions";
import { json, jsonError, readJsonBody } from "@/lib/server/http";
import { serializeNovel, serializeChapter } from "@/lib/server/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pullSchema = z.object({
  workspaceId: z.string().min(1).max(64),
  cursor: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const body = await readJsonBody(request, 64 * 1024);
  if (!body.ok) return body.response;

  const parsed = pullSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(400, "拉取参数不合法");

  const { workspaceId, cursor } = parsed.data;

  const perm = await requireRole(workspaceId, session.sub, "viewer");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  const since = cursor ? new Date(cursor) : new Date(0);

  const [novels, chapters, members] = await Promise.all([
    prisma.novel.findMany({
      where: { workspaceId, updatedAt: { gt: since } },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.chapter.findMany({
      where: { novel: { workspaceId }, updatedAt: { gt: since } },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { email: true, displayName: true } } },
    }),
  ]);

  const tombstone = (
    e: { entityType: string; id: string; deletedAt: Date | null }
  ) => (e.deletedAt ? { entityType: e.entityType as "novel" | "chapter", entityId: e.id, deletedAt: e.deletedAt.toISOString() } : null);

  return json(200, {
    cursor: new Date().toISOString(),
    entities: {
      novels: novels.filter((n) => !n.deletedAt).map(serializeNovel),
      chapters: chapters.filter((c) => !c.deletedAt).map(serializeChapter),
      members: members.map((m) => ({
        workspaceId,
        userId: m.userId,
        role: m.role,
        email: m.user.email,
        displayName: m.user.displayName,
        createdAt: m.createdAt.toISOString(),
      })),
      tombstones: [
        ...novels.map((n) => tombstone({ entityType: "novel", id: n.id, deletedAt: n.deletedAt })),
        ...chapters.map((c) => tombstone({ entityType: "chapter", id: c.id, deletedAt: c.deletedAt })),
      ].filter(Boolean),
    },
  });
}
