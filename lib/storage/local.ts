import type { NovelSettings, ManuscriptState, ChatMessage } from "@/lib/novel/types";

/**
 * 本地存储（localStorage）封装。
 *
 * 第一版使用 localStorage 保存作品，不依赖数据库与登录系统。
 * 所有读写都在浏览器端，服务端不感知这些数据。
 * 具备 SSR 安全（服务端渲染时静默跳过）。
 */

const PREFIX = "novelwriter:";

export const STORAGE_KEYS = {
  settings: `${PREFIX}settings`,
  manuscript: `${PREFIX}manuscript`,
  chat: `${PREFIX}chat`,
  provider: `${PREFIX}provider`,
} as const;

export const DEFAULT_SETTINGS: NovelSettings = {
  title: "",
  genre: "",
  summary: "",
  style: "",
  worldview: "",
  characters: "",
  outline: "",
  chapterGoal: "",
};

export const DEFAULT_MANUSCRIPT: ManuscriptState = {
  chapterTitle: "",
  content: "",
};

export const DEFAULT_PROVIDER = "deepseek";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储失败（如配额满）时静默忽略，不影响写作流程
  }
}

function remove(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadSettings(): NovelSettings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<NovelSettings>>(STORAGE_KEYS.settings, {}) };
}

export function saveSettings(settings: NovelSettings): void {
  write(STORAGE_KEYS.settings, settings);
}

export function loadManuscript(): ManuscriptState {
  return {
    ...DEFAULT_MANUSCRIPT,
    ...read<Partial<ManuscriptState>>(STORAGE_KEYS.manuscript, {}),
  };
}

export function saveManuscript(manuscript: ManuscriptState): void {
  write(STORAGE_KEYS.manuscript, manuscript);
}

export function loadChat(): ChatMessage[] {
  const value = read<unknown>(STORAGE_KEYS.chat, []);
  if (!Array.isArray(value)) return [];
  return value.filter(
    (m): m is ChatMessage =>
      typeof m === "object" &&
      m !== null &&
      (m as ChatMessage).role !== undefined &&
      typeof (m as ChatMessage).content === "string"
  );
}

export function saveChat(messages: ChatMessage[]): void {
  write(STORAGE_KEYS.chat, messages);
}

export function loadProvider(): string {
  const value = read<string>(STORAGE_KEYS.provider, DEFAULT_PROVIDER);
  return value === "kimi" ? "kimi" : DEFAULT_PROVIDER;
}

export function saveProvider(provider: string): void {
  write(STORAGE_KEYS.provider, provider);
}

export function clearAll(): void {
  remove(STORAGE_KEYS.settings);
  remove(STORAGE_KEYS.manuscript);
  remove(STORAGE_KEYS.chat);
  remove(STORAGE_KEYS.provider);
}
