import { describe, it, expect, beforeEach } from "vitest";
import { closeDb } from "./db";
import { DB_NAME } from "./schema";
import * as queue from "./operation-queue";
import type { SyncOperationInput } from "@/lib/domain/types";

async function resetIndexedDb() {
  await closeDb();
  await new Promise<void>((resolve) => {
    const req = (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

function makeOp(id: string): SyncOperationInput & { workspaceId: string } {
  return {
    operationId: id,
    workspaceId: "w1",
    entityType: "chapter",
    entityId: "c1",
    operation: "upsert",
    payload: { content: "新内容" },
    baseRevision: 1,
  };
}

describe("operation-queue（离线操作入队）", () => {
  beforeEach(async () => {
    await resetIndexedDb();
  });

  it("断网编辑入队，可读取待同步操作", async () => {
    await queue.enqueueOperation(makeOp("op-1"));
    await queue.enqueueOperation(makeOp("op-2"));
    const pending = await queue.getPendingOperations();
    expect(pending).toHaveLength(2);
    expect(await queue.pendingCount()).toBe(2);
  });

  it("同步成功后移除操作", async () => {
    await queue.enqueueOperation(makeOp("op-1"));
    await queue.removeOperation("op-1");
    expect(await queue.pendingCount()).toBe(0);
  });
});
