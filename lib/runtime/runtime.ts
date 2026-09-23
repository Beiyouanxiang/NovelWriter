import type { NovelRuntime, NovelRuntimeKind } from "@/lib/novel/types";
import { DirectApiRuntime } from "./direct-api";
import { DeepSeekHarnessRuntime } from "./deepseek-harness";

/**
 * 运行时选择器（仅服务端使用）。
 *
 * 通过环境变量 NOVEL_RUNTIME 选择实现：
 * - direct  ：DirectApiRuntime，直接调用 DeepSeek / Kimi 的 OpenAI 兼容接口（当前版本）
 * - harness ：DeepSeekHarnessRuntime（尚未接入，返回清晰错误）
 *
 * 前端与小说业务代码只依赖 NovelRuntime 接口，不直接依赖任何具体实现。
 */

export function resolveRuntimeKind(value?: string): NovelRuntimeKind {
  const kind = (value ?? process.env.NOVEL_RUNTIME ?? "direct").trim().toLowerCase();
  return kind === "harness" ? "harness" : "direct";
}

/** 返回当前应使用的 Runtime 实例 */
export function getRuntime(kind?: NovelRuntimeKind): NovelRuntime {
  const resolved = kind ?? resolveRuntimeKind();
  if (resolved === "harness") {
    return new DeepSeekHarnessRuntime();
  }
  return new DirectApiRuntime();
}

export type { NovelRuntime };
