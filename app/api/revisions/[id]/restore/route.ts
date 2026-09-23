import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/server/auth-context";
import { requireRole } from "@/lib/server/permissions";
import { json, jsonError, requireCsrf } from "@/lib/server/http";
import { serializeNovel, serializeChapter } from "@/lib/server/serialize";
import { recordRevision, novelSnapshot, chapterSnapshot } from "@/lib/server/revisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  const { id } = await params;
  const revision = await prisma.revision.findUnique({ where: { id } });
  if (!revision || !revision.snapshot) return jsonError(404, "版本不存在");

  // 解析工作区并校验权限
  let workspaceId: string | null = null;
  if (revision.entityType === "novel") {
    const n = await prisma.novel.findUnique({ where: { id: revision.entityId }, select: { workspaceId: true } });
    workspaceId = n?.workspaceId ?? null;
  } else if (revision.entityType === "chapter") {
    const c = await prisma.chapter.findUnique({
      where: { id: revision.entityId },
      select: { novel: { select: { workspaceId: true } } },
    });
    workspaceId = c?.novel.workspaceId ?? null;
  }
  if (!workspaceId) return jsonError(404, "内容不存在");

  const perm = await requireRole(workspaceId, session.sub, "editor");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  const snapshot = revision.snapshot as Record<string, unknown>;

  if (revision.entityType === "novel") {
    const updated = await prisma.novel.update({
      where: { id: revision.entityId },
      data: {
        title: (snapshot.title as string) ?? "",
        genre: (snapshot.genre as string) ?? "",
        summary: (snapshot.summary as string) ?? "",
        style: (snapshot.style as string) ?? "",
        worldview: (snapshot.worldview as string) ?? "",
        characters: (snapshot.characters as string) ?? "",
        outline: (snapshot.outline as string) ?? "",
        revision: { increment: 1 },
      },
    });
    // 恢复操作本身生成新 revision
    await recordRevision("novel", updated.id, updated.revision, novelSnapshot(updated), session.sub);
    return json(200, { novel: serializeNovel(updated) });
  }

  const updated = await prisma.chapter.update({
    where: { id: revision.entityId },
    data: {
      title: (snapshot.title as string) ?? "",
      content: (snapshot.content as string) ?? "",
      chapterGoal: (snapshot.chapterGoal as string) ?? "",
      sortOrder: (snapshot.sortOrder as number) ?? 0,
      revision: { increment: 1 },
    },
  });
  await recordRevision("chapter", updated.id, updated.revision, chapterSnapshot(updated), session.sub);
  return json(200, { chapter: serializeChapter(updated) });
}
