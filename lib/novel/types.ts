/**
 * NovelWriter —— 小说业务核心类型定义
 *
 * 前端与小说业务代码只能依赖本文件里的抽象类型，
 * 以及 `runtime.ts` 里的 NovelRuntime 接口，
 * 不能直接依赖某一家模型厂商或 Harness SDK。
 */

/** 小说项目设定（作品设定） */
export interface NovelSettings {
  /** 小说名称 */
  title: string;
  /** 类型 */
  genre: string;
  /** 故事简介 */
  summary: string;
  /** 写作风格 */
  style: string;
  /** 世界观 */
  worldview: string;
  /** 主要人物 */
  characters: string;
  /** 故事大纲 */
  outline: string;
  /** 当前章节目标 */
  chapterGoal: string;
}

/** 单条对话消息 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** 当前章节正文状态 */
export interface ManuscriptState {
  chapterTitle: string;
  content: string;
}

/** 发往服务端、用于组装 Prompt 的完整上下文 */
export interface NovelContext {
  settings: NovelSettings;
  manuscript: ManuscriptState;
  /** 最近几轮对话 */
  recentMessages: ChatMessage[];
}

/** 客户端请求 /api/chat 的请求体 */
export interface ChatRequest {
  provider: string;
  context: NovelContext;
  /** 用户本次指令 */
  instruction: string;
}

// ---------------------------------------------------------------------------
// Runtime 抽象层（服务端）
// ---------------------------------------------------------------------------

/**
 * 与 DeepSeek Harness 的接入数据映射预留字段。
 * 目前 DirectApiRuntime 只用到 session / prompt / instruction / model，
 * 其余字段（tools / storage 等）为未来 Harness 预留。
 */
export interface NovelAgentInput {
  /** 会话（多轮对话历史） */
  session: {
    id?: string;
    messages: ChatMessage[];
  };
  /** 服务端组装好的 System Prompt */
  prompt: string;
  /** 用户本次指令 */
  instruction: string;
  /** 模型信息 */
  model: {
    provider: string;
    modelId: string;
  };
  /** 预留：工具定义 */
  tools?: unknown[];
  /** 预留：存储 / 状态对象 */
  storage?: unknown;
  /** 原始小说上下文（供未来 Harness 做结构化注入） */
  novelContext: NovelContext;
}

/** 运行时产生的流式事件 */
export type NovelAgentEvent =
  | { type: "delta"; content: string }
  | { type: "done"; finishReason?: string }
  | { type: "error"; message: string };

/**
 * 统一 Runtime 接口。
 * 前端和小说业务代码只依赖此接口，不依赖具体实现。
 */
export interface NovelRuntime {
  run(
    input: NovelAgentInput,
    signal?: AbortSignal
  ): AsyncIterable<NovelAgentEvent>;
}

/** Runtime 类型 */
export type NovelRuntimeKind = "direct" | "harness";
