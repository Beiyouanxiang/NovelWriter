import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/server/auth-context";
import { requireRole } from "@/lib/server/permissions";
import { json, jsonError, readJsonBody, requireCsrf } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roleSchema = z.object({
  role: z.enum(["editor", "viewer"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const { id, userId } = await params;
  const perm = await requireRole(id, session.sub, "owner");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  const body = await readJsonBody(request, 64 * 1024);
  if (!body.ok) return body.response;

  const parsed = roleSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(400, "角色不合法");

  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId } },
  });
  if (!target) return jsonError(404, "成员不存在");

  // 不能把最后一个 owner 降级
  if (target.role === "owner") {
    const ownerCount = await prisma.workspaceMember.count({
      where: { workspaceId: id, role: "owner" },
    });
    if (ownerCount <= 1) {
      return jsonError(400, "不能修改最后一个 owner 的角色");
    }
  }

  await prisma.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId: id, userId } },
    data: { role: parsed.data.role },
  });

  return json(200, { ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const { id, userId } = await params;
  const perm = await requireRole(id, session.sub, "owner");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId } },
  });
  if (!target) return jsonError(404, "成员不存在");

  if (target.role === "owner") {
    const ownerCount = await prisma.workspaceMember.count({
      where: { workspaceId: id, role: "owner" },
    });
    if (ownerCount <= 1) {
      return jsonError(400, "不能移除最后一个 owner");
    }
  }

  await prisma.workspaceMember.delete({
    where: { workspaceId_userId: { workspaceId: id, userId } },
  });

  return json(200, { ok: true });
}
