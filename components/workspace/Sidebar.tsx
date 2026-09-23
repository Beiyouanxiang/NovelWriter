"use client";

import { useState } from "react";
import type { Novel, Chapter } from "@/lib/domain/types";

const NOVEL_FIELDS: Array<{ key: keyof Novel; label: string; multiline?: boolean; rows?: number }> = [
  { key: "title", label: "小说名称" },
  { key: "genre", label: "类型" },
  { key: "summary", label: "故事简介", multiline: true, rows: 3 },
  { key: "style", label: "写作风格", multiline: true, rows: 3 },
  { key: "worldview", label: "世界观", multiline: true, rows: 5 },
  { key: "characters", label: "主要人物", multiline: true, rows: 6 },
  { key: "outline", label: "故事大纲", multiline: true, rows: 6 },
];

interface SidebarProps {
  novels: Novel[];
  chapters: Chapter[];
  currentNovelId: string | null;
  currentChapterId: string | null;
  currentNovel: Novel | null;
  onSelectNovel: (id: string) => void;
  onSelectChapter: (id: string) => void;
  onNewNovel: (title: string) => void;
  onNewChapter: () => void;
  onDeleteChapter: (id: string) => void;
  onUpdateNovel: (id: string, patch: Partial<Novel>) => void;
  readOnly: boolean;
}

export default function Sidebar(props: SidebarProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const chapters = props.chapters.filter((c) => c.novelId === props.currentNovelId && !c.deletedAt);

  return (
    <div className="flex h-full flex-col">
      {/* 小说列表 */}
      <div className="border-b border-[#e7e2d8] px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#2b2a27]">小说</h2>
          <div className="flex gap-1">
            <input
              className="field-input !w-32 !py-1 text-xs"
              placeholder="新小说名称"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTitle.trim()) {
                  props.onNewNovel(newTitle.trim());
                  setNewTitle("");
                }
              }}
            />
            <button
              className="btn !px-2 !py-1 text-xs"
              onClick={() => {
                if (newTitle.trim()) props.onNewNovel(newTitle.trim());
                setNewTitle("");
              }}
              disabled={props.readOnly}
            >
              新建
            </button>
          </div>
        </div>
        <ul className="mt-2 space-y-1">
          {props.novels
            .filter((n) => !n.deletedAt)
            .map((n) => (
              <li key={n.id}>
                <button
                  className={`w-full rounded px-2 py-1 text-left text-sm ${
                    props.currentNovelId === n.id
                      ? "bg-[#efe6d9] text-[#2b2a27]"
                      : "text-[#6b675f] hover:bg-[#f3efe6]"
                  }`}
                  onClick={() => props.onSelectNovel(n.id)}
                >
                  {n.title || "未命名"}
                </button>
              </li>
            ))}
        </ul>
      </div>

      {/* 章节列表 */}
      <div className="border-b border-[#e7e2d8] px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#2b2a27]">章节</h2>
          <button
            className="btn !px-2 !py-1 text-xs"
            onClick={props.onNewChapter}
            disabled={!props.currentNovelId || props.readOnly}
          >
            新建章节
          </button>
        </div>
        <ul className="mt-2 space-y-1">
          {chapters.map((c) => (
            <li key={c.id} className="group flex items-center gap-1">
              <button
                className={`flex-1 rounded px-2 py-1 text-left text-sm ${
                  props.currentChapterId === c.id
                    ? "bg-[#efe6d9] text-[#2b2a27]"
                    : "text-[#6b675f] hover:bg-[#f3efe6]"
                }`}
                onClick={() => props.onSelectChapter(c.id)}
              >
                {c.title || "未命名章节"}
              </button>
              <button
                className="hidden text-xs text-red-400 group-hover:block"
                onClick={() => props.onDeleteChapter(c.id)}
                disabled={props.readOnly}
              >
                删
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* 作品设定 */}
      <div className="flex-1 overflow-y-auto">
        <button
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-[#2b2a27]"
          onClick={() => setShowSettings((v) => !v)}
        >
          作品设定
          <span className="text-xs text-[#b5ad9e]">{showSettings ? "收起" : "展开"}</span>
        </button>
        {showSettings && props.currentNovel && (
          <div className="space-y-3 px-4 pb-4">
            {NOVEL_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="field-label">{f.label}</label>
                {f.multiline ? (
                  <textarea
                    className="field-input resize-y"
                    rows={f.rows}
                    value={(props.currentNovel![f.key] as string) ?? ""}
                    disabled={props.readOnly}
                    onChange={(e) => props.onUpdateNovel(props.currentNovel!.id, { [f.key]: e.target.value })}
                  />
                ) : (
                  <input
                    className="field-input"
                    value={(props.currentNovel![f.key] as string) ?? ""}
                    disabled={props.readOnly}
                    onChange={(e) => props.onUpdateNovel(props.currentNovel!.id, { [f.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
