"use client";

import { useState } from "react";
import type { ManuscriptState } from "@/lib/novel/types";

interface ManuscriptEditorProps {
  manuscript: ManuscriptState;
  onChange: (manuscript: ManuscriptState) => void;
  lastAssistantMessage: string | null;
  onAppendAi: (content: string) => void;
  onReplaceAi: (content: string) => void;
}

/** 统计正文字数（去除空白字符，适合中文写作） */
export function countWords(text: string): number {
  return text.replace(/\s/g, "").length;
}

/** 将章节内容导出为 Markdown 文本 */
export function buildMarkdown(manuscript: ManuscriptState): string {
  const title = manuscript.chapterTitle.trim() || "未命名章节";
  return `# ${title}\n\n${manuscript.content}\n`;
}

export default function ManuscriptEditor({
  manuscript,
  onChange,
  lastAssistantMessage,
  onAppendAi,
  onReplaceAi,
}: ManuscriptEditorProps) {
  const [copied, setCopied] = useState(false);

  const wordCount = countWords(manuscript.content);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(manuscript.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function handleExport() {
    const md = buildMarkdown(manuscript);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${manuscript.chapterTitle.trim() || "未命名章节"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 */}
      <div className="flex items-center justify-between border-b border-[#e7e2d8] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#2b2a27]">正文编辑器</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6b675f]">字数 {wordCount}</span>
          <button className="btn !px-2 !py-1 text-xs" onClick={handleCopy}>
            {copied ? "已复制" : "复制正文"}
          </button>
          <button
            className="btn !px-2 !py-1 text-xs"
            onClick={handleExport}
            disabled={!manuscript.content && !manuscript.chapterTitle}
          >
            导出 Markdown
          </button>
        </div>
      </div>

      {/* AI 回复快捷应用 */}
      {lastAssistantMessage && (
        <div className="flex items-center gap-2 border-b border-[#e7e2d8] bg-[#efe6d9] px-4 py-2">
          <span className="text-xs text-[#6b675f]">最近一条 AI 回复：</span>
          <button
            className="text-xs text-[#8a5a44] hover:underline"
            onClick={() => onAppendAi(lastAssistantMessage)}
          >
            追加到正文
          </button>
          <button
            className="text-xs text-[#8a5a44] hover:underline"
            onClick={() => onReplaceAi(lastAssistantMessage)}
          >
            替换正文
          </button>
        </div>
      )}

      {/* 章节标题 */}
      <div className="border-b border-[#e7e2d8] px-4 py-3">
        <input
          className="field-input !border-0 !bg-transparent !px-0 !py-1 font-writing text-lg font-semibold placeholder-[#c5bdae]"
          placeholder="章节标题…"
          value={manuscript.chapterTitle}
          onChange={(e) => onChange({ ...manuscript, chapterTitle: e.target.value })}
        />
      </div>

      {/* 正文 */}
      <textarea
        className="flex-1 resize-none bg-transparent px-4 py-4 font-writing text-[17px] leading-loose text-[#2b2a27] placeholder-[#c5bdae]"
        placeholder="从这里开始写作…"
        value={manuscript.content}
        onChange={(e) => onChange({ ...manuscript, content: e.target.value })}
      />
    </div>
  );
}
