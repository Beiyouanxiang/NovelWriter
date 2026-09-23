"use client";

import { useRef, useState } from "react";
import type { Chapter, Novel } from "@/lib/domain/types";
import type { ConflictRecord } from "@/lib/local-db/conflicts";
import type { SaveStatus, SyncStatus } from "@/lib/client/use-workspace";
import { StatusIndicator } from "@/components/workspace/StatusIndicator";

function countWords(text: string): number {
  return text.replace(/\s/g, "").length;
}

interface EditorProps {
  chapter: Chapter | null;
  novels: Novel[];
  chapters: Chapter[];
  online: boolean;
  saveStatus: SaveStatus;
  syncStatus: SyncStatus;
  pendingCount: number;
  conflicts: ConflictRecord[];
  readOnly: boolean;
  onUpdateChapter: (id: string, patch: Partial<Chapter>) => void;
  onFlush: () => void;
  onResolveConflict: (record: ConflictRecord, choice: "local" | "server") => void;
}

export default function ChapterEditor(props: EditorProps) {
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const chapter = props.chapter;
  const chapterConflicts = props.conflicts.filter((c) => c.entityId === chapter?.id);

  if (!chapter) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[#b5ad9e]">
        请选择或新建一个章节开始写作
      </div>
    );
  }

  const wordCount = countWords(chapter.content);

  async function copy() {
    try {
      await navigator.clipboard.writeText(chapter!.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function exportChapterMarkdown() {
    const md = `# ${chapter!.title || "未命名章节"}\n\n${chapter!.content}\n`;
    download(`${chapter!.title || "章节"}.md`, md);
  }

  function exportNovel() {
    const novel = props.novels.find((n) => n.id === chapter!.novelId);
    const chs = props.chapters
      .filter((c) => c.novelId === chapter!.novelId && !c.deletedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const md =
      `# ${novel?.title || "未命名小说"}\n\n` +
      chs.map((c) => `## ${c.title}\n\n${c.content}\n`).join("\n");
    download(`${novel?.title || "小说"}.md`, md);
  }

  function exportNovelJson() {
    const novel = props.novels.find((n) => n.id === chapter!.novelId);
    const chs = props.chapters
      .filter((c) => c.novelId === chapter!.novelId && !c.deletedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    download(
      `${novel?.title || "小说"}.json`,
      JSON.stringify({ novel, chapters: chs }, null, 2)
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏 */}
      <div className="flex items-center justify-between border-b border-[#e7e2d8] px-4 py-2">
        <span className="text-xs text-[#6b675f]">字数 {wordCount}</span>
        <div className="flex items-center gap-2">
          <StatusIndicator
            online={props.online}
            saveStatus={props.saveStatus}
            syncStatus={props.syncStatus}
            pendingCount={props.pendingCount}
          />
          <button className="btn !px-2 !py-1 text-xs" onClick={props.onFlush}>
            手动保存
          </button>
          <button className="btn !px-2 !py-1 text-xs" onClick={copy}>
            {copied ? "已复制" : "复制"}
          </button>
          <button className="btn !px-2 !py-1 text-xs" onClick={exportChapterMarkdown}>
            导出本章
          </button>
          <button className="btn !px-2 !py-1 text-xs" onClick={exportNovel}>
            导出整本
          </button>
          <button className="btn !px-2 !py-1 text-xs" onClick={exportNovelJson}>
            导出 JSON
          </button>
        </div>
      </div>

      {/* 冲突提示 */}
      {chapterConflicts.map((c) => (
        <div
          key={c.operationId}
          className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800"
        >
          <span>本章存在版本冲突：本地版与服务端版都已保留。</span>
          <button
            className="text-[#8a5a44] underline"
            onClick={() => props.onResolveConflict(c, "local")}
          >
            用本地版
          </button>
          <button
            className="text-[#8a5a44] underline"
            onClick={() => props.onResolveConflict(c, "server")}
          >
            用服务端版
          </button>
        </div>
      ))}

      {/* 章节标题 */}
      <div className="border-b border-[#e7e2d8] px-4 py-3">
        <input
          className="field-input !border-0 !bg-transparent !px-0 !py-1 font-writing text-lg font-semibold placeholder-[#c5bdae]"
          placeholder="章节标题…"
          value={chapter.title}
          disabled={props.readOnly}
          onChange={(e) => props.onUpdateChapter(chapter.id, { title: e.target.value })}
        />
      </div>

      {/* 正文 */}
      <textarea
        className="flex-1 resize-none bg-transparent px-4 py-4 font-writing text-[17px] leading-loose text-[#2b2a27] placeholder-[#c5bdae]"
        placeholder="从这里开始写作…"
        value={chapter.content}
        disabled={props.readOnly}
        onChange={(e) => props.onUpdateChapter(chapter.id, { content: e.target.value })}
      />

      <input ref={fileRef} type="file" accept="application/json" className="hidden" />
    </div>
  );
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
