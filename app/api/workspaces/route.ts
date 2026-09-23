import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/server/auth-context";
import { json, jsonError, readJsonBody, requireCsrf } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.sub },
    include: { workspace: true },
  });

  const workspaces = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    ownerId: m.workspace.ownerId,
    role: m.role,
    createdAt: m.workspace.createdAt.toISOString(),
    updatedAt: m.workspace.updatedAt.toISOString(),
  }));

  return json(200, { workspaces });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  const body = await readJsonBody(request, 64 * 1024);
  if (!body.ok) return body.response;

  const parsed = createSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(400, "工作区名称需为 1-100 个字符");

  const workspace = await prisma.workspace.create({
    data: {
      name: parsed.data.name,
      ownerId: session.sub,
      members: { create: { userId: session.sub, role: "owner" } },
    },
  });

  return json(201, {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      ownerId: workspace.ownerId,
      role: "owner",
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    },
  });
}
