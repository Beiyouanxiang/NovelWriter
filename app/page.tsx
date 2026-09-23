"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ProjectSettings from "@/components/ProjectSettings";
import ChatPanel from "@/components/ChatPanel";
import ManuscriptEditor from "@/components/ManuscriptEditor";
import type {
  ChatMessage,
  ManuscriptState,
  NovelSettings,
} from "@/lib/novel/types";
import {
  DEFAULT_MANUSCRIPT,
  DEFAULT_PROVIDER,
  DEFAULT_SETTINGS,
  clearAll,
  loadAccessToken,
  loadChat,
  loadManuscript,
  loadProvider,
  loadSettings,
  saveAccessToken,
  saveChat,
  saveManuscript,
  saveProvider,
  saveSettings,
} from "@/lib/storage/local";

type Tab = "settings" | "chat" | "editor";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "settings", label: "作品设定" },
  { id: "chat", label: "AI 对话" },
  { id: "editor", label: "正文" },
];

export default function Home() {
  // 初始值固定为默认值（服务端与客户端首屏一致，避免 hydration mismatch）
  const [settings, setSettings] = useState<NovelSettings>(DEFAULT_SETTINGS);
  const [manuscript, setManuscript] = useState<ManuscriptState>(DEFAULT_MANUSCRIPT);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [provider, setProvider] = useState<string>(DEFAULT_PROVIDER);
  const [accessToken, setAccessToken] = useState<string>("");
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [hydrated, setHydrated] = useState(false);
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 挂载后（仅浏览器）才从 localStorage 加载，避免 SSR 首屏与客户端不一致
  useEffect(() => {
    setSettings(loadSettings());
    setManuscript(loadManuscript());
    setMessages(loadChat());
    setProvider(loadProvider());
    setAccessToken(loadAccessToken());
    setHydrated(true);
  }, []);

  // 作品设定：防抖自动保存（仅在加载完成后，避免默认值覆盖已有作品）
  useEffect(() => {
    if (!hydrated) return;
    setSaveState("saving");
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
    settingsTimer.current = setTimeout(() => {
      saveSettings(settings);
      setSaveState("saved");
    }, 300);
    return () => {
      if (settingsTimer.current) clearTimeout(settingsTimer.current);
    };
  }, [settings, hydrated]);

  // 正文 / 对话 / provider / 访问口令：即时自动保存（仅在加载完成后）
  useEffect(() => {
    if (hydrated) saveManuscript(manuscript);
  }, [manuscript, hydrated]);
  useEffect(() => {
    if (hydrated) saveChat(messages);
  }, [messages, hydrated]);
  useEffect(() => {
    if (hydrated) saveProvider(provider);
  }, [provider, hydrated]);
  useEffect(() => {
    if (hydrated) saveAccessToken(accessToken);
  }, [accessToken, hydrated]);

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].content;
    }
    return null;
  }, [messages]);

  function appendAiToManuscript(content: string) {
    setManuscript((prev) => ({
      ...prev,
      content: prev.content ? `${prev.content}\n\n${content}` : content,
    }));
  }

  function replaceManuscriptWithAi(content: string) {
    setManuscript((prev) => ({ ...prev, content }));
  }

  function handleNewWork() {
    if (
      !window.confirm(
        "确定新建作品？当前的作品设定、正文与对话记录都将被清空，且无法恢复。"
      )
    ) {
      return;
    }
    clearAll();
    setSettings(DEFAULT_SETTINGS);
    setManuscript(DEFAULT_MANUSCRIPT);
    setMessages([]);
    setProvider(DEFAULT_PROVIDER);
    setActiveTab("settings");
  }

  return (
    <div className="flex h-screen flex-col">
      {/* 顶栏 */}
      <header className="shrink-0 border-b border-[#e7e2d8] bg-[#fbfaf7] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold text-[#2b2a27]">
            小说创作工作台
          </h1>
          <div className="flex items-center gap-3">
            <span className="max-w-[30%] truncate text-sm text-[#6b675f]">
              {settings.title || "未命名作品"}
            </span>
            <button
              className="btn !px-2.5 !py-1 text-xs"
              onClick={handleNewWork}
              title="清空设定、正文与对话，开始新作品"
            >
              新建作品
            </button>
          </div>
        </div>
      </header>

      {/* 移动端标签栏 */}
      <nav className="shrink-0 border-b border-[#e7e2d8] bg-[#fbfaf7] lg:hidden">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-[#8a5a44] text-[#2b2a27]"
                  : "text-[#6b675f]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* 桌面三栏 / 移动单栏 */}
      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_minmax(0,1.15fr)]">
        <section
          className={`h-full min-h-0 overflow-hidden border-b border-[#e7e2d8] lg:border-b-0 lg:border-r ${
            activeTab === "settings" ? "block" : "hidden lg:block"
          }`}
        >
          <ProjectSettings
            settings={settings}
            onChange={setSettings}
            saveState={saveState}
            accessToken={accessToken}
            onAccessTokenChange={setAccessToken}
          />
        </section>

        <section
          className={`h-full min-h-0 overflow-hidden border-b border-[#e7e2d8] lg:border-b-0 lg:border-r ${
            activeTab === "chat" ? "block" : "hidden lg:block"
          }`}
        >
          <ChatPanel
            provider={provider}
            onProviderChange={setProvider}
            messages={messages}
            onMessagesChange={setMessages}
            settings={settings}
            manuscript={manuscript}
            accessToken={accessToken}
            onAppendToManuscript={appendAiToManuscript}
            onReplaceManuscript={replaceManuscriptWithAi}
          />
        </section>

        <section
          className={`h-full min-h-0 overflow-hidden ${
            activeTab === "editor" ? "block" : "hidden lg:block"
          }`}
        >
          <ManuscriptEditor
            manuscript={manuscript}
            onChange={setManuscript}
            lastAssistantMessage={lastAssistantMessage}
            onAppendAi={appendAiToManuscript}
            onReplaceAi={replaceManuscriptWithAi}
          />
        </section>
      </main>
    </div>
  );
}
