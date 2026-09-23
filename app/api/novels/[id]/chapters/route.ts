import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/server/auth-context";
import { requireRole } from "@/lib/server/permissions";
import { json, jsonError, readJsonBody, requireCsrf } from "@/lib/server/http";
import { serializeChapter } from "@/lib/server/serialize";
import { recordRevision, chapterSnapshot } from "@/lib/server/revisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().max(5000).optional(),
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

  const chapters = await prisma.chapter.findMany({
    where: { novelId: id, deletedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  return json(200, { chapters: chapters.map(serializeChapter) });
}

export async function POST(
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

  const parsed = createSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(400, "章节标题不合法");

  const maxOrder = await prisma.chapter.aggregate({
    where: { novelId: id },
    _max: { sortOrder: true },
  });

  const chapter = await prisma.chapter.create({
    data: {
      novelId: id,
      title: parsed.data.title ?? "新章节",
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
  await recordRevision("chapter", chapter.id, 1, chapterSnapshot(chapter), session.sub);

  return json(201, { chapter: serializeChapter(chapter) });
}
