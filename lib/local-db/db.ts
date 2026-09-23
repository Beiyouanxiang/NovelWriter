/**
 * 打开 IndexedDB 数据库（idb 封装）。
 * 仅在浏览器调用；SSR 环境不执行。
 */

import { openDB, type IDBPDatabase } from "idb";
import { DB_NAME, DB_VERSION, STORES } from "./schema";

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORES.workspaces)) {
          db.createObjectStore(STORES.workspaces, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORES.novels)) {
          db.createObjectStore(STORES.novels, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORES.chapters)) {
          db.createObjectStore(STORES.chapters, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORES.chatSessions)) {
          db.createObjectStore(STORES.chatSessions, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORES.chatMessages)) {
          db.createObjectStore(STORES.chatMessages, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORES.pendingOps)) {
          db.createObjectStore(STORES.pendingOps, { keyPath: "operationId" });
        }
        if (!db.objectStoreNames.contains(STORES.meta)) {
          db.createObjectStore(STORES.meta, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORES.snapshots)) {
          db.createObjectStore(STORES.snapshots, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORES.conflicts)) {
          db.createObjectStore(STORES.conflicts, { keyPath: "operationId" });
        }
      },
    });
  }
  return dbPromise;
}

/** 关闭连接并重置（测试用） */
export async function closeDb(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      /* ignore */
    }
  }
  dbPromise = null;
}

/** 重置连接（测试用） */
export function resetDb(): void {
  dbPromise = null;
}
