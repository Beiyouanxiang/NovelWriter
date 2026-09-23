import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_SETTINGS,
  DEFAULT_MANUSCRIPT,
  DEFAULT_PROVIDER,
  loadSettings,
  saveSettings,
  loadManuscript,
  saveManuscript,
  loadChat,
  saveChat,
  loadProvider,
  saveProvider,
  clearAll,
} from "./local";

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

describe("localStorage 存储", () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: makeStorage(),
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("无数据时返回默认值", () => {
    expect(loadSettings().title).toBe("");
    expect(loadManuscript().content).toBe("");
    expect(loadChat()).toEqual([]);
    expect(loadProvider()).toBe(DEFAULT_PROVIDER);
  });

  it("settings 保存后可读取", () => {
    saveSettings({ ...DEFAULT_SETTINGS, title: "长安夜雨" });
    expect(loadSettings().title).toBe("长安夜雨");
  });

  it("manuscript 保存后可读取", () => {
    saveManuscript({ ...DEFAULT_MANUSCRIPT, content: "正文" });
    expect(loadManuscript().content).toBe("正文");
  });

  it("chat 保存后可读取", () => {
    saveChat([
      { role: "user", content: "继续" },
      { role: "assistant", content: "好的" },
    ]);
    expect(loadChat()).toHaveLength(2);
    expect(loadChat()[0].role).toBe("user");
  });

  it("chat 过滤损坏数据", () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: () => JSON.stringify([{ bad: true }, { role: "user", content: "ok" }]),
        setItem: () => {},
        removeItem: () => {},
      },
    };
    const loaded = loadChat();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].content).toBe("ok");
  });

  it("provider 保存后可读取", () => {
    saveProvider("kimi");
    expect(loadProvider()).toBe("kimi");
  });

  it("clearAll 清空全部数据", () => {
    saveSettings({ ...DEFAULT_SETTINGS, title: "x" });
    saveManuscript({ ...DEFAULT_MANUSCRIPT, content: "y" });
    clearAll();
    expect(loadSettings().title).toBe("");
    expect(loadManuscript().content).toBe("");
  });
});
