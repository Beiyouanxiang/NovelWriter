"use client";

import { useEffect, useRef, useState } from "react";
import { getCsrfToken } from "@/lib/client/api";
import type { Novel, Chapter } from "@/lib/domain/types";

interface ChatMessageView {
  role: "user" | "assistant";
  content: string;
  incomplete?: boolean;
}

interface ProviderInfo {
  id: string;
  label: string;
  models: string[];
  defaultModel: string;
}

interface ChatPanelProps {
  novel: Novel | null;
  chapter: Chapter | null;
  online: boolean;
  readOnly: boolean;
}

const QUICK_ACTIONS: Array<{ label: string; instruction: string }> = [
  { label: "续写正文", instruction: "请基于当前正文与当前章节目标，继续续写下一段。直接输出正文内容，不要附加解释。" },
  { label: "润色", instruction: "请润色当前正文：优化措辞与句式，保持原意与文风。直接输出润色后的全文。" },
  { label: "扩写", instruction: "请在当前正文基础上扩写，丰富细节，保持情节一致。直接输出扩写后的正文。" },
  { label: "改写对白", instruction: "请改写当前正文中的对白，使其更贴合人物性格与情境。直接输出改写后的对白。" },
  { label: "检查剧情逻辑", instruction: "请检查当前正文的剧情逻辑，分别指出：问题、原因、修改建议。" },
  { label: "生成章节大纲", instruction: "请基于当前章节目标，为本章生成一份分点大纲。" },
];

export default function ChatPanel({ novel, chapter, online, readOnly }: ChatPanelProps) {
  const [provider, setProvider] = useState("deepseek");
  const [model, setModel] = useState("");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 拉取可用的 provider 与模型列表
  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => {
        if (d?.providers?.length) {
          setProviders(d.providers);
          const first = d.providers[0] as ProviderInfo;
          setProvider(first.id);
          setModel(first.defaultModel || first.models[0] || "");
        }
      })
      .catch(() => {
        // 拉取失败时用默认（provider=deepseek，model 留空走服务端默认）
      });
  }, []);

  const currentProvider = providers.find((p) => p.id === provider);

  function selectProvider(p: string) {
    setProvider(p);
    const info = providers.find((x) => x.id === p);
    setModel(info?.defaultModel || info?.models[0] || "");
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, error]);

  const canUse = !!novel && online && !readOnly;

  async function send(instruction: string, history?: ChatMessageView[]) {
    if (streaming || !novel) return;
    const controller = new AbortController();
    abortRef.current = controller;

    const base = history ?? messages;
    const newHistory = [...base, { role: "user" as const, content: instruction }];
    setMessages(newHistory);

    setStreaming(true);
    setStreamingText("");
    pendingRef.current = "";
    setError(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-CSRF-Token": getCsrfToken(),
      };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        credentials: "same-origin",
        body: JSON.stringify({
          provider,
          model: model || undefined,
          novelId: novel.id,
          chapterId: chapter?.id,
          instruction,
          recentMessages: base.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let msg = `请求失败（HTTP ${res.status}）`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          /* ignore */
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
        setMessages([...newHistory, { role: "assistant", content: full }]);
      }
    } catch (err) {
      const partial = pendingRef.current;
      if (controller.signal.aborted) {
        // 用户主动停止：保留已生成部分，标记未完整
        if (partial) {
          setMessages([...newHistory, { role: "assistant", content: partial, incomplete: true }]);
        }
        setError("已停止生成（内容已保留）");
      } else {
        // 网络/中断：保留部分并标记未完整
        if (partial) {
          setMessages([...newHistory, { role: "assistant", content: partial, incomplete: true }]);
        }
        setError(
          err instanceof Error ? `${err.message}（已保留生成的部分内容）` : "生成失败"
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleSubmit() {
    const text = input.trim();
    if (!text || streaming || !canUse) return;
    setInput("");
    void send(text);
  }

  function handleQuick(action: { instruction: string }) {
    if (!canUse || streaming) return;
    void send(action.instruction);
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleClear() {
    if (streaming) return;
    if (window.confirm("确定清空当前对话吗？")) setMessages([]);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#e7e2d8] px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#2b2a27]">AI 对话</h2>
          <button className="btn !px-2 !py-1 text-xs" onClick={handleClear} disabled={streaming || messages.length === 0}>
            清空
          </button>
        </div>
        <div className="mt-2 flex gap-1 rounded-md bg-[#efeae0] p-1">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => selectProvider(p.id)}
              className={`flex-1 rounded px-2 py-1 text-xs ${
                provider === p.id ? "bg-[#fbfaf7] text-[#2b2a27] shadow-sm" : "text-[#6b675f]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {currentProvider && currentProvider.models.length > 1 && (
          <select
            className="field-input mt-2 !py-1 text-xs"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={streaming}
          >
            {currentProvider.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streaming && (
          <div className="pt-8 text-center text-sm text-[#b5ad9e]">
            从下方快捷操作开始，或输入创作需求。
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-[#efe6d9] px-3 py-2 text-sm">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-start">
              <div className="max-w-[92%] whitespace-pre-wrap rounded-lg rounded-tl-sm border border-[#e7e2d8] bg-[#fbfaf7] px-3 py-2 text-sm leading-relaxed">
                {m.content}
                {m.incomplete && (
                  <span className="ml-1 text-xs text-amber-600">（未完整生成）</span>
                )}
              </div>
            </div>
          )
        )}

        {streaming && (
          <div className="max-w-[92%] whitespace-pre-wrap rounded-lg border border-[#e7e2d8] bg-[#fbfaf7] px-3 py-2 text-sm leading-relaxed">
            {streamingText}
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#8a5a44] align-text-bottom" />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {!online && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            当前离线，内容已保存在本机，联网后可继续生成。
          </div>
        )}
      </div>

      <div className="border-t border-[#e7e2d8] px-4 py-2">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              className="btn !px-2.5 !py-1 text-xs"
              onClick={() => handleQuick(a)}
              disabled={streaming || !canUse}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-[#e7e2d8] p-3">
        <textarea
          className="field-input resize-none font-writing text-base leading-relaxed"
          rows={3}
          value={input}
          placeholder="输入创作需求，Enter 发送，Shift+Enter 换行…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <div className="mt-2 flex justify-end gap-2">
          {streaming ? (
            <button className="btn" onClick={handleStop}>
              停止生成
            </button>
          ) : (
            <button className="btn-primary" onClick={handleSubmit} disabled={!input.trim() || !canUse}>
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
