/**
 * 服务端同步引擎：应用客户端提交的 SyncOperation。
 *
 * 保证：
 * - operationId 幂等（重复提交只生效一次）
 * - 章节正文严格 baseRevision 校验，冲突返回 409（保留服务端版，绝不静默覆盖）
 * - 小说设定字段级自动合并
 * - 删除为软删除（墓碑）
 * - 越权访问一律拒绝
 */

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordRevision, novelSnapshot, chapterSnapshot } from "@/lib/server/revisions";
import { serializeNovel, serializeChapter } from "@/lib/server/serialize";
import type { SyncOperationInput, SyncPushResult } from "@/lib/domain/types";

const novelFieldsSchema = z.object({
  title: z.string().max(5000).optional(),
  genre: z.string().max(500).optional(),
  summary: z.string().max(20000).optional(),
  style: z.string().max(10000).optional(),
  worldview: z.string().max(50000).optional(),
  characters: z.string().max(50000).optional(),
  outline: z.string().max(50000).optional(),
});

const novelPayloadSchema = z.object({
  changedFields: novelFieldsSchema,
});

const chapterPayloadSchema = z.object({
  novelId: z.string().min(1),
  title: z.string().max(5000).optional(),
  content: z.string().max(200000).optional(),
  chapterGoal: z.string().max(20000).optional(),
  sortOrder: z.number().int().optional(),
});

export async function applySyncOperation(
  workspaceId: string,
  userId: string,
  op: SyncOperationInput
): Promise<SyncPushResult> {
  // 幂等：已成功应用的 operation 直接跳过
  const existing = await prisma.syncOperation.findUnique({
    where: { operationId: op.operationId },
  });
  if (existing && existing.appliedAt) {
    return { operationId: op.operationId, status: "applied" };
  }

  let result: SyncPushResult;
  if (op.operation === "delete") {
    result = await applyDelete(workspaceId, op);
  } else if (op.operation === "upsert" && op.entityType === "novel") {
    result = await applyNovelUpsert(workspaceId, userId, op);
  } else if (op.operation === "upsert" && op.entityType === "chapter") {
    result = await applyChapterUpsert(workspaceId, userId, op);
  } else {
    result = {
      operationId: op.operationId,
      status: "error",
      message: `不支持的实体类型或操作：${op.entityType}/${op.operation}`,
    };
  }

  // 记录操作（幂等 + 最小审计：不记录正文全文到普通日志，仅入 SyncOperation 表）
  const appliedAt = result.status === "applied" ? new Date() : null;
  await prisma.syncOperation.upsert({
    where: { operationId: op.operationId },
    create: {
      operationId: op.operationId,
      userId,
      workspaceId,
      entityType: op.entityType,
      entityId: op.entityId,
      operation: op.operation,
      payload: (op.payload ?? {}) as object,
      baseRevision: op.baseRevision,
      appliedAt,
    },
    update: { appliedAt },
  });

  return result;
}

async function applyNovelUpsert(
  workspaceId: string,
  userId: string,
  op: SyncOperationInput
): Promise<SyncPushResult> {
  const parsed = novelPayloadSchema.safeParse(op.payload);
  if (!parsed.success) {
    return { operationId: op.operationId, status: "error", message: "小说数据不合法" };
  }
  const fields = parsed.data.changedFields;

  const novel = await prisma.novel.findUnique({ where: { id: op.entityId } });

  if (!novel) {
    const created = await prisma.novel.create({
      data: { id: op.entityId, workspaceId, ...fields, revision: 1 },
    });
    await recordRevision("novel", created.id, 1, novelSnapshot(created), userId);
    return {
      operationId: op.operationId,
      status: "applied",
      serverRevision: 1,
      serverEntity: serializeNovel(created),
    };
  }

  if (novel.workspaceId !== workspaceId) {
    return { operationId: op.operationId, status: "error", message: "越权访问" };
  }

  // 字段级合并：小说设定字段相互独立，可自动合并
  const updated = await prisma.novel.update({
    where: { id: op.entityId },
    data: { ...fields, revision: { increment: 1 } },
  });
  await recordRevision("novel", updated.id, updated.revision, novelSnapshot(updated), userId);
  return {
    operationId: op.operationId,
    status: "applied",
    serverRevision: updated.revision,
    serverEntity: serializeNovel(updated),
  };
}

async function applyChapterUpsert(
  workspaceId: string,
  userId: string,
  op: SyncOperationInput
): Promise<SyncPushResult> {
  const parsed = chapterPayloadSchema.safeParse(op.payload);
  if (!parsed.success) {
    return { operationId: op.operationId, status: "error", message: "章节数据不合法" };
  }
  const payload = parsed.data;

  const chapter = await prisma.chapter.findUnique({ where: { id: op.entityId } });

  if (!chapter) {
    const novel = await prisma.novel.findUnique({ where: { id: payload.novelId } });
    if (!novel || novel.workspaceId !== workspaceId) {
      return { operationId: op.operationId, status: "error", message: "小说不存在或无权访问" };
    }
    const created = await prisma.chapter.create({
      data: {
        id: op.entityId,
        novelId: payload.novelId,
        title: payload.title ?? "",
        content: payload.content ?? "",
        chapterGoal: payload.chapterGoal ?? "",
        sortOrder: payload.sortOrder ?? 0,
        revision: 1,
      },
    });
    await recordRevision("chapter", created.id, 1, chapterSnapshot(created), userId);
    return {
      operationId: op.operationId,
      status: "applied",
      serverRevision: 1,
      serverEntity: serializeChapter(created),
    };
  }

  const novel = await prisma.novel.findUnique({ where: { id: chapter.novelId } });
  if (!novel || novel.workspaceId !== workspaceId) {
    return { operationId: op.operationId, status: "error", message: "章节不属于该工作区" };
  }

  // 正文冲突：严格 baseRevision 校验，不一致返回冲突（保留服务端版）
  if (op.baseRevision !== chapter.revision) {
    return {
      operationId: op.operationId,
      status: "conflict",
      serverRevision: chapter.revision,
      serverEntity: serializeChapter(chapter),
      message: "章节版本冲突",
    };
  }

  const data: Record<string, unknown> = {};
  if (payload.title !== undefined) data.title = payload.title;
  if (payload.content !== undefined) data.content = payload.content;
  if (payload.chapterGoal !== undefined) data.chapterGoal = payload.chapterGoal;
  if (payload.sortOrder !== undefined) data.sortOrder = payload.sortOrder;
  data.revision = { increment: 1 };

  const updated = await prisma.chapter.update({ where: { id: op.entityId }, data });
  await recordRevision("chapter", updated.id, updated.revision, chapterSnapshot(updated), userId);
  return {
    operationId: op.operationId,
    status: "applied",
    serverRevision: updated.revision,
    serverEntity: serializeChapter(updated),
  };
}

async function applyDelete(
  workspaceId: string,
  op: SyncOperationInput
): Promise<SyncPushResult> {
  const now = new Date();
  if (op.entityType === "novel") {
    const novel = await prisma.novel.findUnique({ where: { id: op.entityId } });
    if (!novel) return { operationId: op.operationId, status: "applied" };
    if (novel.workspaceId !== workspaceId) {
      return { operationId: op.operationId, status: "error", message: "越权访问" };
    }
    await prisma.novel.update({ where: { id: op.entityId }, data: { deletedAt: now } });
    return { operationId: op.operationId, status: "applied" };
  }
  if (op.entityType === "chapter") {
    const chapter = await prisma.chapter.findUnique({ where: { id: op.entityId } });
    if (!chapter) return { operationId: op.operationId, status: "applied" };
    const novel = await prisma.novel.findUnique({ where: { id: chapter.novelId } });
    if (!novel || novel.workspaceId !== workspaceId) {
      return { operationId: op.operationId, status: "error", message: "越权访问" };
    }
    await prisma.chapter.update({ where: { id: op.entityId }, data: { deletedAt: now } });
    return { operationId: op.operationId, status: "applied" };
  }
  return { operationId: op.operationId, status: "error", message: "不支持的删除目标" };
}
