import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/server/auth-context";
import { requireRole } from "@/lib/server/permissions";
import { json, jsonError, readJsonBody, requireCsrf } from "@/lib/server/http";
import { serializeChapter } from "@/lib/server/serialize";
import { recordRevision, chapterSnapshot } from "@/lib/server/revisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  title: z.string().max(5000).optional(),
  content: z.string().max(200000).optional(),
  chapterGoal: z.string().max(20000).optional(),
  sortOrder: z.number().int().optional(),
});

async function resolveChapter(id: string) {
  const chapter = await prisma.chapter.findUnique({ where: { id } });
  if (!chapter) return null;
  const novel = await prisma.novel.findUnique({ where: { id: chapter.novelId } });
  if (!novel) return null;
  return { chapter, workspaceId: novel.workspaceId };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const { id } = await params;
  const resolved = await resolveChapter(id);
  if (!resolved || resolved.chapter.deletedAt) return jsonError(404, "章节不存在");

  const perm = await requireRole(resolved.workspaceId, session.sub, "viewer");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  return json(200, { chapter: serializeChapter(resolved.chapter) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const { id } = await params;
  const resolved = await resolveChapter(id);
  if (!resolved || resolved.chapter.deletedAt) return jsonError(404, "章节不存在");

  const perm = await requireRole(resolved.workspaceId, session.sub, "editor");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  const body = await readJsonBody(request, 512 * 1024);
  if (!body.ok) return body.response;

  const parsed = updateSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(400, "章节字段不合法");

  const updated = await prisma.chapter.update({
    where: { id },
    data: { ...parsed.data, revision: { increment: 1 } },
  });
  await recordRevision("chapter", updated.id, updated.revision, chapterSnapshot(updated), session.sub);

  return json(200, { chapter: serializeChapter(updated) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const { id } = await params;
  const resolved = await resolveChapter(id);
  if (!resolved || resolved.chapter.deletedAt) return jsonError(404, "章节不存在");

  const perm = await requireRole(resolved.workspaceId, session.sub, "editor");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  // 软删除
  await prisma.chapter.update({ where: { id }, data: { deletedAt: new Date() } });
  return json(200, { ok: true });
}
