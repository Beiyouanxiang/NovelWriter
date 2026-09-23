import { z } from "zod";
import { getSession } from "@/lib/server/auth-context";
import { requireRole } from "@/lib/server/permissions";
import { json, jsonError, readJsonBody, requireCsrf } from "@/lib/server/http";
import { applySyncOperation } from "@/lib/server/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const operationSchema = z.object({
  operationId: z.string().min(1).max(64),
  entityType: z.enum(["novel", "chapter"]),
  entityId: z.string().min(1).max(64),
  operation: z.enum(["upsert", "delete"]),
  payload: z.unknown(),
  baseRevision: z.number().int().min(0),
});

const pushSchema = z.object({
  workspaceId: z.string().min(1).max(64),
  operations: z.array(operationSchema).min(1).max(100),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError(401, "未登录");

  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  const body = await readJsonBody(request, 2 * 1024 * 1024);
  if (!body.ok) return body.response;

  const parsed = pushSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(400, "同步数据不合法（操作数量或字段超出限制）");
  }

  const { workspaceId, operations } = parsed.data;

  const perm = await requireRole(workspaceId, session.sub, "editor");
  if (!perm.ok) return jsonError(perm.status, perm.error);

  const results = [];
  for (const op of operations) {
    results.push(await applySyncOperation(workspaceId, session.sub, op));
  }

  return json(200, { results });
}
