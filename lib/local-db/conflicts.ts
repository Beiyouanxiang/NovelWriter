/**
 * 冲突记录（本地存储）。
 */

import { getDb } from "./db";
import { STORES } from "./schema";

export interface ConflictRecord {
  operationId: string;
  entityType: "novel" | "chapter";
  entityId: string;
  serverRevision: number;
  localContent: string;
  serverContent: string;
  createdAt: string;
}

export async function putConflict(record: ConflictRecord): Promise<void> {
  const db = await getDb();
  await db.put(STORES.conflicts, record);
}

export async function getConflicts(): Promise<ConflictRecord[]> {
  const db = await getDb();
  return (await db.getAll(STORES.conflicts)) as ConflictRecord[];
}

export async function removeConflict(operationId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORES.conflicts, operationId);
}
