/**
 * IndexedDB schema 常量与类型。
 */

export const DB_NAME = "novelwriter-local";
export const DB_VERSION = 1;

export const STORES = {
  workspaces: "workspaces",
  novels: "novels",
  chapters: "chapters",
  chatSessions: "chatSessions",
  chatMessages: "chatMessages",
  pendingOps: "pendingOps",
  meta: "meta",
  snapshots: "snapshots",
  conflicts: "conflicts",
} as const;

export const META_KEYS = {
  migrationVersion: "migrationVersion",
  syncCursor: "syncCursor",
  lastSyncAt: "lastSyncAt",
} as const;

/** 本地未同步工作区的固定 ID（登录前 / 尚未同步到云端的内容） */
export const LOCAL_WORKSPACE_ID = "local";
