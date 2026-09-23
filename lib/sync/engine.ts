/**
 * 客户端同步引擎：推拉 + 冲突处理。
 *
 * - 推送：按工作区分组，逐个 operation 提交；applied 移除队列，conflict 保留本地并记录冲突。
 * - 拉取：游标增量拉取服务端实体，合并进 IndexedDB（有未同步本地修改的实体不被覆盖）。
 * - 冲突解决：本地版 / 服务端版 / 手动合并。
 */

import { apiFetch } from "@/lib/client/api";
import * as repo from "@/lib/local-db/repository";
import * as queue from "@/lib/local-db/operation-queue";
import {
  putConflict,
  removeConflict,
  getConflicts,
  type ConflictRecord,
} from "@/lib/local-db/conflicts";
import type {
  Novel,
  Chapter,
  SyncOperationInput,
  SyncPushResult,
  SyncPullResponse,
  Workspace,
} from "@/lib/domain/types";

export type PendingOperation = SyncOperationInput & { workspaceId: string };

export interface PushOutcome {
  results: SyncPushResult[];
  conflicts: ConflictRecord[];
}

export function newOperationId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function enqueueChapterUpsert(
  workspaceId: string,
  chapter: Chapter,
  baseRevision: number
): Promise<void> {
  const op: PendingOperation = {
    operationId: newOperationId(),
    workspaceId,
    entityType: "chapter",
    entityId: chapter.id,
    operation: "upsert",
    payload: {
      novelId: chapter.novelId,
      title: chapter.title,
      content: chapter.content,
      chapterGoal: chapter.chapterGoal,
      sortOrder: chapter.sortOrder,
    },
    baseRevision,
  };
  await queue.enqueueOperation(op);
}

export async function enqueueNovelUpsert(
  workspaceId: string,
  novel: Novel,
  changedFields: Record<string, string>
): Promise<void> {
  const op: PendingOperation = {
    operationId: newOperationId(),
    workspaceId,
    entityType: "novel",
    entityId: novel.id,
    operation: "upsert",
    payload: { changedFields },
    baseRevision: novel.revision,
  };
  await queue.enqueueOperation(op);
}

export async function enqueueDelete(
  workspaceId: string,
  entityType: "novel" | "chapter",
  entityId: string
): Promise<void> {
  const op: PendingOperation = {
    operationId: newOperationId(),
    workspaceId,
    entityType,
    entityId,
    operation: "delete",
    payload: {},
    baseRevision: 0,
  };
  await queue.enqueueOperation(op);
}

/** 推送所有待同步操作，按工作区分组。返回冲突列表。 */
export async function pushAllPending(): Promise<PushOutcome> {
  const ops = (await queue.getPendingOperations()) as PendingOperation[];
  const byWorkspace = new Map<string, PendingOperation[]>();
  for (const op of ops) {
    const list = byWorkspace.get(op.workspaceId) ?? [];
    list.push(op);
    byWorkspace.set(op.workspaceId, list);
  }

  const allResults: SyncPushResult[] = [];
  const allConflicts: ConflictRecord[] = [];

  for (const [workspaceId, list] of byWorkspace) {
    const data = await apiFetch<{ results: SyncPushResult[] }>("/api/sync/push", {
      method: "POST",
      body: { workspaceId, operations: list },
    });
    allResults.push(...data.results);

    for (let i = 0; i < data.results.length; i++) {
      const result = data.results[i];
      const op = list[i];
      if (result.status === "applied") {
        await queue.removeOperation(op.operationId);
      } else if (result.status === "conflict") {
        // 保留本地版，记录冲突（服务端版来自 409 响应）
        const serverEntity = result.serverEntity as
          | { content?: string; title?: string; revision?: number }
          | undefined;
        const record: ConflictRecord = {
          operationId: op.operationId,
          entityType: op.entityType as "novel" | "chapter",
          entityId: op.entityId,
          serverRevision: result.serverRevision ?? 0,
          localContent: (op.payload as { content?: string })?.content ?? "",
          serverContent: serverEntity?.content ?? "",
          createdAt: new Date().toISOString(),
        };
        await putConflict(record);
        allConflicts.push(record);
      }
      // error：保留在队列，等待重试
    }
  }

  return { results: allResults, conflicts: allConflicts };
}

/** 拉取工作区增量并合并进 IndexedDB。 */
export async function pullWorkspace(workspaceId: string): Promise<void> {
  const cursor = (await repo.getSyncCursor()) ?? undefined;
  const data = await apiFetch<SyncPullResponse>("/api/sync/pull", {
    method: "POST",
    body: { workspaceId, cursor },
  });

  const pending = (await queue.getPendingOperations()) as PendingOperation[];
  const pendingIds = new Set(pending.map((p) => p.entityId));

  for (const novel of data.entities.novels) {
    if (!pendingIds.has(novel.id)) await repo.putNovel(novel);
  }
  for (const chapter of data.entities.chapters) {
    if (!pendingIds.has(chapter.id)) await repo.putChapter(chapter);
  }
  // 成员列表缓存（当前版本暂不做 UI 展示，仅保留拉取结果）
  void data.entities.members;
  for (const tomb of data.entities.tombstones) {
    if (tomb.entityType === "novel") {
      const n = await repo.getNovel(tomb.entityId);
      if (n) await repo.putNovel({ ...n, deletedAt: tomb.deletedAt });
    } else if (tomb.entityType === "chapter") {
      const c = await repo.getChapter(tomb.entityId);
      if (c) await repo.putChapter({ ...c, deletedAt: tomb.deletedAt });
    }
  }

  await repo.setSyncCursor(data.cursor);
}

/** 完整同步：先推后拉。 */
export async function syncNow(workspaceId: string): Promise<PushOutcome> {
  const pushed = await pushAllPending();
  await pullWorkspace(workspaceId);
  return pushed;
}

/** 解决冲突。choice = "local" | "server" | "merged"（merged 时传 mergedContent）。 */
export async function resolveConflict(
  record: ConflictRecord,
  choice: "local" | "server",
  mergedContent?: string
): Promise<void> {
  const chapter = await repo.getChapter(record.entityId);

  if (choice === "server" && chapter) {
    // 用服务端版：覆盖本地，移除冲突
    await repo.putChapter({ ...chapter, content: record.serverContent });
    await queue.removeOperation(record.operationId);
    await removeConflict(record.operationId);
    return;
  }

  // local / merged：以本地（或合并）内容为准，推送覆盖服务端
  const content = choice === "local" ? record.localContent : mergedContent ?? record.localContent;
  if (chapter) {
    const updated = { ...chapter, content, revision: record.serverRevision };
    await repo.putChapter(updated);
    await queue.removeOperation(record.operationId);

    const op: PendingOperation = {
      operationId: newOperationId(),
      workspaceId: await resolveWorkspaceOfChapter(chapter.id),
      entityType: "chapter",
      entityId: chapter.id,
      operation: "upsert",
      payload: {
        novelId: chapter.novelId,
        title: chapter.title,
        content,
        chapterGoal: chapter.chapterGoal,
        sortOrder: chapter.sortOrder,
      },
      baseRevision: record.serverRevision,
    };
    await queue.enqueueOperation(op);
    await removeConflict(record.operationId);
  }
}

async function resolveWorkspaceOfChapter(chapterId: string): Promise<string> {
  const novels = await repo.getAllNovels();
  const chapters = await repo.getAllChapters();
  const chapter = chapters.find((c) => c.id === chapterId);
  const novel = chapter ? novels.find((n) => n.id === chapter.novelId) : undefined;
  return novel?.workspaceId ?? "";
}

export async function getConflictsForWorkspace(): Promise<ConflictRecord[]> {
  return getConflicts();
}

export type { Workspace };
