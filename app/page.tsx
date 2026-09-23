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
  loadChat,
  loadManuscript,
  loadProvider,
  loadSettings,
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
  const [settings, setSettings] = useState<NovelSettings>(() => loadSettings());
  const [manuscript, setManuscript] = useState<ManuscriptState>(() =>
    loadManuscript()
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChat());
  const [provider, setProvider] = useState<string>(() => loadProvider());
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 作品设定：防抖自动保存
  useEffect(() => {
    setSaveState("saving");
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
    settingsTimer.current = setTimeout(() => {
      saveSettings(settings);
      setSaveState("saved");
    }, 300);
    return () => {
      if (settingsTimer.current) clearTimeout(settingsTimer.current);
    };
  }, [settings]);

  // 正文 / 对话 / provider：即时自动保存
  useEffect(() => {
    saveManuscript(manuscript);
  }, [manuscript]);
  useEffect(() => {
    saveChat(messages);
  }, [messages]);
  useEffect(() => {
    saveProvider(provider);
  }, [provider]);

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

  return (
    <div className="flex h-screen flex-col">
      {/* 顶栏 */}
      <header className="shrink-0 border-b border-[#e7e2d8] bg-[#fbfaf7] px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-[#2b2a27]">
            小说创作工作台
          </h1>
          <span className="max-w-[40%] truncate text-sm text-[#6b675f]">
            {settings.title || "未命名作品"}
          </span>
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
