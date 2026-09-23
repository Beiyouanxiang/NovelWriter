/**
 * 未同步操作队列（本地离线操作先入队，联网后按序推送）。
 */

import { getDb } from "./db";
import { STORES } from "./schema";
import type { SyncOperationInput } from "@/lib/domain/types";

export async function enqueueOperation(op: SyncOperationInput): Promise<void> {
  const db = await getDb();
  await db.put(STORES.pendingOps, op);
}

export async function getPendingOperations(): Promise<SyncOperationInput[]> {
  const db = await getDb();
  const all = (await db.getAll(STORES.pendingOps)) as SyncOperationInput[];
  return all.sort((a, b) => (a.operationId < b.operationId ? -1 : 1));
}

export async function removeOperation(operationId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORES.pendingOps, operationId);
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  return db.count(STORES.pendingOps);
}
