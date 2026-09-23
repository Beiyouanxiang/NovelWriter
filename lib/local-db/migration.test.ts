import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { closeDb } from "./db";
import { DB_NAME } from "./schema";
import { migrateFromLocalStorage, hasLegacyData } from "./migration";
import * as repo from "./repository";

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
}

async function resetIndexedDb() {
  await closeDb();
  await new Promise<void>((resolve) => {
    const req = (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe("localStorage → IndexedDB 迁移", () => {
  beforeEach(async () => {
    await resetIndexedDb();
    (globalThis as unknown as { window?: unknown }).window = {
      localStorage: makeStorage(),
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("检测旧 localStorage 数据", () => {
    window.localStorage.setItem(
      "novelwriter:settings",
      JSON.stringify({ title: "旧小说" })
    );
    expect(hasLegacyData()).toBe(true);
  });

  it("迁移旧数据到 IndexedDB", async () => {
    window.localStorage.setItem(
      "novelwriter:settings",
      JSON.stringify({ title: "旧小说", genre: "科幻", chapterGoal: "目标" })
    );
    window.localStorage.setItem(
      "novelwriter:manuscript",
      JSON.stringify({ chapterTitle: "第一章", content: "旧正文" })
    );

    const migrated = await migrateFromLocalStorage();
    expect(migrated).toBe(true);

    const novels = await repo.getAllNovels();
    expect(novels.some((n) => n.title === "旧小说")).toBe(true);
    const chapters = await repo.getAllChapters();
    expect(chapters.some((c) => c.content === "旧正文")).toBe(true);
    expect(chapters.some((c) => c.chapterGoal === "目标")).toBe(true);
  });

  it("迁移成功后不重复导入", async () => {
    window.localStorage.setItem("novelwriter:settings", JSON.stringify({ title: "旧" }));
    await migrateFromLocalStorage();
    expect(await migrateFromLocalStorage()).toBe(false);
    // 只有一条小说
    expect(await repo.getAllNovels()).toHaveLength(1);
  });
});
