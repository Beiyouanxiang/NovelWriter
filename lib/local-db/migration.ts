/**
 * localStorage → IndexedDB 一次性迁移。
 *
 * 旧版本数据存在 localStorage（novelwriter:settings / manuscript / chat）。
 * 首次启动检测旧数据 → 导入 IndexedDB（生成本地未同步的工作区/小说/章节），
 * 记录迁移版本，禁止重复导入；迁移失败保留原数据并允许重试。
 *
 * 旧 localStorage 数据在同步到云端前不删除，作为备份。
 */

import { getDb } from "./db";
import { STORES, META_KEYS, LOCAL_WORKSPACE_ID } from "./schema";
import { setMeta, getMeta } from "./repository";

const LEGACY_SETTINGS_KEY = "novelwriter:settings";
const LEGACY_MANUSCRIPT_KEY = "novelwriter:manuscript";
const LEGACY_CHAT_KEY = "novelwriter:chat";
const MIGRATION_VERSION = "1";

interface LegacySettings {
  title?: string;
  genre?: string;
  summary?: string;
  style?: string;
  worldview?: string;
  characters?: string;
  outline?: string;
  chapterGoal?: string;
}

interface LegacyManuscript {
  chapterTitle?: string;
  content?: string;
}

export function hasLegacyData(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(LEGACY_SETTINGS_KEY) !== null ||
    window.localStorage.getItem(LEGACY_MANUSCRIPT_KEY) !== null
  );
}

/** 执行迁移。返回是否发生了迁移。失败抛错，由调用方重试。 */
export async function migrateFromLocalStorage(): Promise<boolean> {
  const version = await getMeta(META_KEYS.migrationVersion);
  if (version === MIGRATION_VERSION) return false;

  if (!hasLegacyData()) {
    // 无旧数据，直接标记完成
    await setMeta(META_KEYS.migrationVersion, MIGRATION_VERSION);
    return false;
  }

  const settings = readJson<LegacySettings>(LEGACY_SETTINGS_KEY) ?? {};
  const manuscript = readJson<LegacyManuscript>(LEGACY_MANUSCRIPT_KEY) ?? {};
  const chat = readJson<Array<{ role: string; content: string }>>(LEGACY_CHAT_KEY) ?? [];

  const db = await getDb();

  const now = new Date().toISOString();
  const workspaceId = LOCAL_WORKSPACE_ID;
  const novelId = `${LOCAL_WORKSPACE_ID}-novel`;
  const chapterId = `${LOCAL_WORKSPACE_ID}-chapter`;

  await db.put(STORES.workspaces, {
    id: workspaceId,
    name: "本地作品（未同步）",
    ownerId: "",
    role: "owner",
    createdAt: now,
    updatedAt: now,
  });
  await db.put(STORES.novels, {
    id: novelId,
    workspaceId,
    title: settings.title || "未命名作品",
    genre: settings.genre || "",
    summary: settings.summary || "",
    style: settings.style || "",
    worldview: settings.worldview || "",
    characters: settings.characters || "",
    outline: settings.outline || "",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await db.put(STORES.chapters, {
    id: chapterId,
    novelId,
    title: manuscript.chapterTitle || "第一章",
    content: manuscript.content || "",
    chapterGoal: settings.chapterGoal || "",
    sortOrder: 1,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  // 迁移旧对话（可选）
  if (chat.length > 0) {
    const sessionId = `${LOCAL_WORKSPACE_ID}-chat`;
    await db.put(STORES.chatSessions, {
      id: sessionId,
      novelId,
      chapterId,
      provider: "deepseek",
      createdAt: now,
      updatedAt: now,
    });
    for (let i = 0; i < chat.length; i++) {
      await db.put(STORES.chatMessages, {
        id: `${sessionId}-msg-${i}`,
        sessionId,
        role: chat[i].role === "assistant" ? "assistant" : "user",
        content: chat[i].content ?? "",
        createdAt: now,
      });
    }
  }

  await setMeta(META_KEYS.migrationVersion, MIGRATION_VERSION);
  return true;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
