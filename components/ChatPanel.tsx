"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ManuscriptState, NovelSettings } from "@/lib/novel/types";

interface ChatPanelProps {
  provider: string;
  onProviderChange: (provider: string) => void;
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  settings: NovelSettings;
  manuscript: ManuscriptState;
  accessToken: string;
  onAppendToManuscript: (content: string) => void;
  onReplaceManuscript: (content: string) => void;
}

interface QuickAction {
  label: string;
  instruction: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "续写正文",
    instruction:
      "请基于当前正文与当前章节目标，继续续写下一段。直接输出正文内容，不要附加解释、标题或提示语。",
  },
  {
    label: "润色",
    instruction:
      "请润色当前正文：优化措辞与句式，修正语病，保持原意与文风不变。直接输出润色后的全文。",
  },
  {
    label: "扩写",
    instruction:
      "请在当前正文基础上扩写，丰富场景、动作与心理细节，保持情节一致、不改变主线。直接输出扩写后的正文。",
  },
  {
    label: "改写对白",
    instruction:
      "请改写当前正文中的对白，使其更贴合人物性格、身份与当下情境，自然生动。直接输出改写后的对白。",
  },
  {
    label: "检查剧情逻辑",
    instruction:
      "请检查当前正文的剧情逻辑，分别指出：问题、原因、修改建议。",
  },
  {
    label: "生成章节大纲",
    instruction:
      "请基于当前章节目标，为本章生成一份分点大纲（含每段的要点与作用）。",
  },
];

export default function ChatPanel({
  provider,
  onProviderChange,
  messages,
  onMessagesChange,
  settings,
  manuscript,
  accessToken,
  onAppendToManuscript,
  onReplaceManuscript,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, error]);

  async function send(instruction: string, baseHistory?: ChatMessage[]) {
    if (streaming) return;
    const controller = new AbortController();
    abortRef.current = controller;

    const history = baseHistory ?? messages;
    const newHistory: ChatMessage[] = [
      ...history,
      { role: "user", content: instruction },
    ];
    onMessagesChange(newHistory);

    setStreaming(true);
    setStreamingText("");
    pendingRef.current = "";
    setError(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (accessToken) {
        headers["X-Access-Token"] = accessToken;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          provider,
          context: {
            settings,
            manuscript,
            recentMessages: history.slice(-20),
          },
          instruction,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let msg = `请求失败（HTTP ${res.status}）`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      if (!res.body) throw new Error("响应体为空");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice("data:".length).trim();
          if (!payload) continue;
          let event: { type: string; content?: string; message?: string };
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }
          if (event.type === "delta" && event.content) {
            full += event.content;
            pendingRef.current = full;
            setStreamingText(full);
          } else if (event.type === "error") {
            throw new Error(event.message || "生成失败");
          }
        }
      }

      if (full) {
        onMessagesChange([
          ...newHistory,
          { role: "assistant", content: full },
        ]);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        const partial = pendingRef.current;
        if (partial) {
          onMessagesChange([
            ...newHistory,
            { role: "assistant", content: partial },
          ]);
        }
        setError("已停止生成");
      } else {
        setError(err instanceof Error ? err.message : "生成失败，请稍后重试");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleSubmit() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    void send(text);
  }

  function handleQuickAction(action: QuickAction) {
    if (streaming) return;
    void send(action.instruction);
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleRegenerate() {
    if (streaming) return;
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex === -1) return;
    const instruction = messages[lastUserIndex].content;
    const history = messages.slice(0, lastUserIndex);
    void send(instruction, history);
  }

  function handleClear() {
    if (streaming) return;
    if (window.confirm("确定清空全部对话记录吗？")) {
      onMessagesChange([]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const hasAssistant = messages.some((m) => m.role === "assistant");

  return (
    <div className="flex h-full flex-col">
      {/* 顶部：provider 切换 */}
      <div className="border-b border-[#e7e2d8] px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#2b2a27]">AI 对话</h2>
          <div className="flex items-center gap-2">
            <button
              className="btn !px-2 !py-1 text-xs"
              onClick={handleRegenerate}
              disabled={streaming || !hasAssistant}
              title="重新生成上一条回复"
            >
              重新生成
            </button>
            <button
              className="btn !px-2 !py-1 text-xs"
              onClick={handleClear}
              disabled={streaming || messages.length === 0}
              title="清空对话"
            >
              清空
            </button>
          </div>
        </div>

        <div className="mt-2 flex gap-1 rounded-md bg-[#efeae0] p-1">
          {[
            { value: "deepseek", label: "DeepSeek" },
            { value: "kimi", label: "Kimi" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => onProviderChange(opt.value)}
              className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${
                provider === opt.value
                  ? "bg-[#fbfaf7] text-[#2b2a27] shadow-sm"
                  : "text-[#6b675f] hover:text-[#2b2a27]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streaming && (
          <div className="pt-8 text-center text-sm text-[#b5ad9e]">
            <p>从下方快捷操作开始，或输入你的创作需求。</p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-[#efe6d9] px-3 py-2 text-sm text-[#2b2a27]">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-start">
              <div className="max-w-[92%] whitespace-pre-wrap rounded-lg rounded-tl-sm border border-[#e7e2d8] bg-[#fbfaf7] px-3 py-2 text-sm leading-relaxed text-[#2b2a27]">
                {m.content}
              </div>
              <div className="mt-1 flex gap-2">
                <button
                  className="text-xs text-[#8a5a44] hover:underline"
                  onClick={() => onAppendToManuscript(m.content)}
                >
                  追加到正文
                </button>
                <button
                  className="text-xs text-[#8a5a44] hover:underline"
                  onClick={() => onReplaceManuscript(m.content)}
                >
                  替换正文
                </button>
              </div>
            </div>
          )
        )}

        {streaming && (
          <div className="flex flex-col items-start">
            <div className="max-w-[92%] whitespace-pre-wrap rounded-lg rounded-tl-sm border border-[#e7e2d8] bg-[#fbfaf7] px-3 py-2 text-sm leading-relaxed text-[#2b2a27]">
              {streamingText}
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#8a5a44] align-text-bottom" />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>

      {/* 快捷操作 */}
      <div className="border-t border-[#e7e2d8] px-4 py-2">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              className="btn !px-2.5 !py-1 text-xs"
              onClick={() => handleQuickAction(action)}
              disabled={streaming}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* 输入区 */}
      <div className="border-t border-[#e7e2d8] p-3">
        <textarea
          ref={textareaRef}
          className="field-input resize-none font-writing text-base leading-relaxed"
          rows={3}
          value={input}
          placeholder="输入你的创作需求，Enter 发送，Shift+Enter 换行…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="mt-2 flex justify-end gap-2">
          {streaming ? (
            <button className="btn" onClick={handleStop}>
              停止生成
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={!input.trim()}
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
