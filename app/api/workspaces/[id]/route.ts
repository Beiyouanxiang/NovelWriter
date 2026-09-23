import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/server/auth-context";
import { requireRole } from "@/lib/server/permissions";
import { json, jsonError, readJsonBody, requireCsrf } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const renameSchema = z.object({
  name: z.string().trim().min(1).max(100),
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

  const workspace = await prisma.workspace.findUnique({ where: { id } });
  if (!workspace) return jsonError(404, "工作区不存在");

  return json(200, {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      ownerId: workspace.ownerId,
      role: perm.role,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const { id } = await params;
  const perm = await requireRole(id, session.sub, "owner");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  const body = await readJsonBody(request, 64 * 1024);
  if (!body.ok) return body.response;

  const parsed = renameSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(400, "工作区名称需为 1-100 个字符");

  const workspace = await prisma.workspace.update({
    where: { id },
    data: { name: parsed.data.name },
  });

  return json(200, {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      ownerId: workspace.ownerId,
      role: perm.role,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const { id } = await params;
  const perm = await requireRole(id, session.sub, "owner");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  // 级联删除工作区及其下所有内容
  await prisma.workspace.delete({ where: { id } });
  return json(200, { ok: true });
}
