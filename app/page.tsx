"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/client/use-workspace";
import { useAuth } from "@/components/auth/AuthProvider";
import TopBar from "@/components/workspace/TopBar";
import Sidebar from "@/components/workspace/Sidebar";
import MembersPanel from "@/components/workspace/MembersPanel";
import ChatPanel from "@/components/chat/ChatPanel";
import ChapterEditor from "@/components/editor/ChapterEditor";

type Tab = "settings" | "chat" | "editor";

export default function Home() {
  const ws = useWorkspace();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("editor");
  const [showMembers, setShowMembers] = useState(false);

  const currentWorkspace = ws.workspaces.find((w) => w.id === ws.currentWorkspaceId);
  const role = currentWorkspace?.role ?? "owner";
  const readOnly = role === "viewer";

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        workspaces={ws.workspaces}
        novels={ws.novels}
        currentWorkspaceId={ws.currentWorkspaceId}
        currentNovelId={ws.currentNovelId}
        onWorkspaceChange={(id) => {
          ws.setCurrentWorkspaceId(id);
          ws.setCurrentNovelId(null);
          ws.setCurrentChapterId(null);
        }}
        onNovelChange={(id) => {
          ws.setCurrentNovelId(id);
          ws.setCurrentChapterId(null);
        }}
        online={ws.online}
        saveStatus={ws.saveStatus}
        syncStatus={ws.syncStatus}
        pendingCount={ws.pendingCount}
        onSync={() => void ws.doSync()}
        onNewWorkspace={() => {
          const name = window.prompt("新工作区名称：");
          if (name) void ws.createWorkspace(name);
        }}
      />

      {/* 移动端标签栏 */}
      <nav className="flex shrink-0 border-b border-[#e7e2d8] bg-[#fbfaf7] lg:hidden">
        {(
          [
            ["settings", "设定"],
            ["chat", "对话"],
            ["editor", "正文"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 text-sm ${
              tab === id ? "border-b-2 border-[#8a5a44] text-[#2b2a27]" : "text-[#6b675f]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* 成员管理入口 */}
      {user && currentWorkspace && (
        <div className="flex shrink-0 items-center justify-between border-b border-[#e7e2d8] bg-[#fbfaf7] px-4 py-1.5 text-xs text-[#6b675f]">
          <span>
            {ws.currentNovelId ? "已选择小说" : "请选择小说"} · 角色：{role}
          </span>
          <button className="text-[#8a5a44] hover:underline" onClick={() => setShowMembers(true)}>
            管理成员
          </button>
        </div>
      )}

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_minmax(0,1.15fr)]">
        <section
          className={`h-full min-h-0 overflow-hidden border-b border-[#e7e2d8] lg:border-b-0 lg:border-r ${
            tab === "settings" ? "block" : "hidden lg:block"
          }`}
        >
          <Sidebar
            novels={ws.novels}
            chapters={ws.chapters}
            currentNovelId={ws.currentNovelId}
            currentChapterId={ws.currentChapterId}
            currentNovel={ws.currentNovel}
            onSelectNovel={(id) => {
              ws.setCurrentNovelId(id);
              ws.setCurrentChapterId(null);
            }}
            onSelectChapter={(id) => ws.setCurrentChapterId(id)}
            onNewNovel={(title) => void ws.createNovel(title)}
            onNewChapter={() => void ws.createChapter()}
            onDeleteChapter={(id) => void ws.deleteChapter(id)}
            onUpdateNovel={(id, patch) => void ws.updateNovel(id, patch)}
            readOnly={readOnly}
          />
        </section>

        <section
          className={`h-full min-h-0 overflow-hidden border-b border-[#e7e2d8] lg:border-b-0 lg:border-r ${
            tab === "chat" ? "block" : "hidden lg:block"
          }`}
        >
          <ChatPanel novel={ws.currentNovel} chapter={ws.currentChapter} online={ws.online} readOnly={readOnly} />
        </section>

        <section
          className={`h-full min-h-0 overflow-hidden ${tab === "editor" ? "block" : "hidden lg:block"}`}
        >
          <ChapterEditor
            chapter={ws.currentChapter}
            novels={ws.novels}
            chapters={ws.chapters}
            online={ws.online}
            saveStatus={ws.saveStatus}
            syncStatus={ws.syncStatus}
            pendingCount={ws.pendingCount}
            conflicts={ws.conflicts}
            readOnly={readOnly}
            onUpdateChapter={(id, patch) => ws.updateChapter(id, patch)}
            onFlush={() => void ws.flush()}
            onResolveConflict={(r, c) => void ws.resolveConflict(r, c)}
          />
        </section>
      </main>

      {showMembers && currentWorkspace && (
        <MembersPanel
          workspaceId={currentWorkspace.id}
          role={role}
          onClose={() => setShowMembers(false)}
        />
      )}
    </div>
  );
}
