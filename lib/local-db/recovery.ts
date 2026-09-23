/**
 * 恢复快照：定期把关键本地数据整体快照到独立 store，
 * 用于 IndexedDB 异常时的兜底恢复。
 */

import { getDb } from "./db";
import { STORES } from "./schema";
import { getAllNovels, getAllChapters } from "./repository";

interface Snapshot {
  id: string;
  timestamp: number;
  data: {
    novels: unknown[];
    chapters: unknown[];
  };
}

const SNAPSHOT_ID = "latest";
const MAX_SNAPSHOTS = 5;

export async function saveRecoverySnapshot(): Promise<void> {
  try {
    const [novels, chapters] = await Promise.all([getAllNovels(), getAllChapters()]);
    const db = await getDb();
    await db.put(STORES.snapshots, {
      id: SNAPSHOT_ID,
      timestamp: Date.now(),
      data: { novels, chapters },
    } satisfies Snapshot);

    // 清理过旧快照（保留最新 5 个，用 timestamp 区分——简单起见仅保留 latest）
    const keys = await db.getAllKeys(STORES.snapshots);
    for (const key of keys) {
      if (key !== SNAPSHOT_ID) await db.delete(STORES.snapshots, key);
    }
  } catch {
    // 快照失败不阻塞主流程
  }
}

export async function loadRecoverySnapshot(): Promise<Snapshot | undefined> {
  try {
    const db = await getDb();
    return (await db.get(STORES.snapshots, SNAPSHOT_ID)) as Snapshot | undefined;
  } catch {
    return undefined;
  }
}

export { MAX_SNAPSHOTS };
