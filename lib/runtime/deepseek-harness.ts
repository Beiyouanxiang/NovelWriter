import type { NovelRuntime, NovelAgentInput, NovelAgentEvent } from "@/lib/novel/types";

/**
 * DeepSeekHarnessRuntime —— 未来接入 DeepSeek Harness 的占位实现。
 *
 * 当前版本不安装、不强绑定 Harness SDK。
 * Harness 可能以插件、独立进程或 JSON-RPC 等方式运行，
 * 具体数据映射方案见 HARNESS_INTEGRATION.md。
 *
 * 在 Harness 尚未配置时，返回清晰错误，避免静默失败。
 */
export class DeepSeekHarnessRuntime implements NovelRuntime {
  async *run(
    _input: NovelAgentInput,
    _signal?: AbortSignal
  ): AsyncIterable<NovelAgentEvent> {
    // 占位实现：参数暂不使用，接入 Harness 后消费
    void _input;
    void _signal;
    yield {
      type: "error",
      message:
        "DeepSeek Harness 尚未配置。请参考 HARNESS_INTEGRATION.md 完成接入，" +
        "或将环境变量 NOVEL_RUNTIME 设置为 direct 使用直接调用模式。",
    };
  }
}
