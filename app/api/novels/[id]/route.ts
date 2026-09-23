import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/server/auth-context";
import { requireRole } from "@/lib/server/permissions";
import { json, jsonError, readJsonBody, requireCsrf } from "@/lib/server/http";
import { serializeNovel } from "@/lib/server/serialize";
import { recordRevision, novelSnapshot } from "@/lib/server/revisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  title: z.string().max(5000).optional(),
  genre: z.string().max(500).optional(),
  summary: z.string().max(20000).optional(),
  style: z.string().max(10000).optional(),
  worldview: z.string().max(50000).optional(),
  characters: z.string().max(50000).optional(),
  outline: z.string().max(50000).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const { id } = await params;
  const novel = await prisma.novel.findUnique({ where: { id } });
  if (!novel || novel.deletedAt) return jsonError(404, "小说不存在");

  const perm = await requireRole(novel.workspaceId, session.sub, "viewer");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  return json(200, { novel: serializeNovel(novel) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const { id } = await params;
  const novel = await prisma.novel.findUnique({ where: { id } });
  if (!novel || novel.deletedAt) return jsonError(404, "小说不存在");

  const perm = await requireRole(novel.workspaceId, session.sub, "editor");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  const body = await readJsonBody(request, 256 * 1024);
  if (!body.ok) return body.response;

  const parsed = updateSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(400, "小说字段不合法");

  const updated = await prisma.novel.update({
    where: { id },
    data: { ...parsed.data, revision: { increment: 1 } },
  });
  await recordRevision("novel", updated.id, updated.revision, novelSnapshot(updated), session.sub);

  return json(200, { novel: serializeNovel(updated) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const { id } = await params;
  const novel = await prisma.novel.findUnique({ where: { id } });
  if (!novel || novel.deletedAt) return jsonError(404, "小说不存在");

  const perm = await requireRole(novel.workspaceId, session.sub, "editor");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  // 软删除
  await prisma.novel.update({ where: { id }, data: { deletedAt: new Date() } });
  return json(200, { ok: true });
}
