/**
 * IndexedDB 仓库层：UI 组件只调用这里的函数，不直接操作 IndexedDB。
 */

import { getDb } from "./db";
import { STORES, META_KEYS } from "./schema";
import type { Workspace, Novel, Chapter, ChatSession, ChatMessage } from "@/lib/domain/types";

// ---- Workspace ----

export async function putWorkspace(ws: Workspace): Promise<void> {
  const db = await getDb();
  await db.put(STORES.workspaces, ws);
}

export async function getAllWorkspaces(): Promise<Workspace[]> {
  const db = await getDb();
  return db.getAll(STORES.workspaces);
}

export async function deleteWorkspace(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORES.workspaces, id);
}

// ---- Novel ----

export async function putNovel(novel: Novel): Promise<void> {
  const db = await getDb();
  await db.put(STORES.novels, novel);
}

export async function getNovel(id: string): Promise<Novel | undefined> {
  const db = await getDb();
  return db.get(STORES.novels, id);
}

export async function getAllNovels(): Promise<Novel[]> {
  const db = await getDb();
  return db.getAll(STORES.novels);
}

export async function getNovelsByWorkspace(workspaceId: string): Promise<Novel[]> {
  const novels = await getAllNovels();
  return novels.filter((n) => n.workspaceId === workspaceId);
}

export async function deleteNovel(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORES.novels, id);
}

// ---- Chapter ----

export async function putChapter(chapter: Chapter): Promise<void> {
  const db = await getDb();
  await db.put(STORES.chapters, chapter);
}

export async function getChapter(id: string): Promise<Chapter | undefined> {
  const db = await getDb();
  return db.get(STORES.chapters, id);
}

export async function getAllChapters(): Promise<Chapter[]> {
  const db = await getDb();
  return db.getAll(STORES.chapters);
}

export async function getChaptersByNovel(novelId: string): Promise<Chapter[]> {
  const chapters = await getAllChapters();
  return chapters
    .filter((c) => c.novelId === novelId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function deleteChapter(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORES.chapters, id);
}

// ---- Chat ----

export async function putChatSession(session: ChatSession): Promise<void> {
  const db = await getDb();
  await db.put(STORES.chatSessions, session);
}

export async function putChatMessage(message: ChatMessage): Promise<void> {
  const db = await getDb();
  await db.put(STORES.chatMessages, message);
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  const all = await db.getAll(STORES.chatMessages);
  return all
    .filter((m) => m.sessionId === sessionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

// ---- Meta ----

export async function getMeta(key: string): Promise<string | undefined> {
  const db = await getDb();
  const row = (await db.get(STORES.meta, key)) as { key: string; value: string } | undefined;
  return row?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.put(STORES.meta, { key, value });
}

export async function getSyncCursor(): Promise<string | undefined> {
  return getMeta(META_KEYS.syncCursor);
}

export async function setSyncCursor(cursor: string): Promise<void> {
  await setMeta(META_KEYS.syncCursor, cursor);
}
