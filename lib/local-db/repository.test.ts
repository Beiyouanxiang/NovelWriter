import { describe, it, expect, beforeEach } from "vitest";
import { closeDb } from "./db";
import { DB_NAME } from "./schema";
import * as repo from "./repository";
import type { Novel, Chapter } from "@/lib/domain/types";

async function resetIndexedDb() {
  await closeDb();
  await new Promise<void>((resolve) => {
    const req = (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

function makeNovel(id: string, workspaceId = "w1"): Novel {
  return {
    id,
    workspaceId,
    title: `小说${id}`,
    genre: "",
    summary: "",
    style: "",
    worldview: "",
    characters: "",
    outline: "",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

function makeChapter(id: string, novelId: string): Chapter {
  return {
    id,
    novelId,
    title: "章节",
    content: "正文内容",
    chapterGoal: "",
    sortOrder: 1,
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("IndexedDB repository（本地持久化）", () => {
  beforeEach(async () => {
    await resetIndexedDb();
  });

  it("novel 保存后可读回（刷新恢复的基础）", async () => {
    await repo.putNovel(makeNovel("n1"));
    const got = await repo.getNovel("n1");
    expect(got?.title).toBe("小说n1");
  });

  it("chapter 保存后可读回", async () => {
    await repo.putChapter(makeChapter("c1", "n1"));
    const got = await repo.getChapter("c1");
    expect(got?.content).toBe("正文内容");
  });

  it("按小说过滤章节", async () => {
    await repo.putChapter(makeChapter("c1", "n1"));
    await repo.putChapter(makeChapter("c2", "n2"));
    const chs = await repo.getChaptersByNovel("n1");
    expect(chs).toHaveLength(1);
    expect(chs[0].id).toBe("c1");
  });

  it("getAll 返回全部并支持按工作区过滤", async () => {
    await repo.putNovel(makeNovel("n1", "w1"));
    await repo.putNovel(makeNovel("n2", "w2"));
    expect(await repo.getAllNovels()).toHaveLength(2);
    expect(await repo.getNovelsByWorkspace("w1")).toHaveLength(1);
  });

  it("meta 读写（同步游标）", async () => {
    await repo.setSyncCursor("cursor-123");
    expect(await repo.getSyncCursor()).toBe("cursor-123");
  });
});
