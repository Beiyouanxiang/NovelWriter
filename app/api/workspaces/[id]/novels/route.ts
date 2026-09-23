import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/server/auth-context";
import { requireRole } from "@/lib/server/permissions";
import { json, jsonError, readJsonBody, requireCsrf } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const { id } = await params;
  const perm = await requireRole(id, session.sub, "viewer");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  const novels = await prisma.novel.findMany({
    where: { workspaceId: id, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  return json(200, { novels: serializeNovels(novels) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const { id } = await params;
  const perm = await requireRole(id, session.sub, "editor");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  const body = await readJsonBody(request, 256 * 1024);
  if (!body.ok) return body.response;

  const parsed = createSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(400, "小说名称需为 1-200 个字符");

  const novel = await prisma.novel.create({
    data: { workspaceId: id, title: parsed.data.title },
  });

  return json(201, { novel: serializeNovel(novel) });
}

function serializeNovel(n: {
  id: string;
  workspaceId: string;
  title: string;
  genre: string;
  summary: string;
  style: string;
  worldview: string;
  characters: string;
  outline: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: n.id,
    workspaceId: n.workspaceId,
    title: n.title,
    genre: n.genre,
    summary: n.summary,
    style: n.style,
    worldview: n.worldview,
    characters: n.characters,
    outline: n.outline,
    revision: n.revision,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    deletedAt: n.deletedAt ? n.deletedAt.toISOString() : null,
  };
}

function serializeNovels(list: Parameters<typeof serializeNovel>[0][]) {
  return list.map(serializeNovel);
}
