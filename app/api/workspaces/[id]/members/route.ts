import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/server/auth-context";
import { requireRole } from "@/lib/server/permissions";
import { json, jsonError, readJsonBody, requireCsrf } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["editor", "viewer"]).default("editor"),
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

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: id },
    include: { user: { select: { email: true, displayName: true } } },
    orderBy: { createdAt: "asc" },
  });

  return json(200, {
    members: members.map((m) => ({
      workspaceId: id,
      userId: m.userId,
      role: m.role,
      email: m.user.email,
      displayName: m.user.displayName,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(
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

  const parsed = addSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(400, "请输入有效的邮箱");

  const target = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!target) return jsonError(404, "未找到该邮箱对应的用户");

  const existing = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: target.id } },
  });
  if (existing) return jsonError(409, "该用户已是工作区成员");

  await prisma.workspaceMember.create({
    data: { workspaceId: id, userId: target.id, role: parsed.data.role },
  });

  return json(201, { ok: true, userId: target.id });
}
