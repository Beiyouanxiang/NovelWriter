# DeepSeek Harness 接入方案

本文说明未来如何把 NovelWriter 的数据映射到 **DeepSeek Harness**。当前版本**不安装、不强绑定** Harness SDK；Harness 可能以插件、独立进程或 JSON-RPC 等方式运行，因此预留了独立适配层，页面组件里不写任何 Harness 逻辑。

## 设计原则

1. 前端与小说业务代码只依赖 `NovelRuntime` 接口（`lib/runtime/runtime.ts`）。
2. Harness 相关的全部逻辑封装在 `lib/runtime/deepseek-harness.ts` 一个文件内。
3. 通过环境变量 `NOVEL_RUNTIME=harness` 切换到 Harness 实现；未配置时返回清晰错误，不静默失败。

## 数据映射

`NovelAgentInput`（见 `lib/novel/types.ts`）承载了 Harness 需要的全部输入，各字段映射如下：

### 1. session

| NovelWriter | DeepSeek Harness | 说明 |
| --- | --- | --- |
| `input.session.id` | `session_id` | 会话唯一标识；当前版本为空，接入 Harness 后可传入持久会话 ID |
| `input.session.messages` | `messages[]` | 多轮对话历史（`role: user/assistant`），按顺序映射 |

### 2. prompt

| NovelWriter | DeepSeek Harness | 说明 |
| --- | --- | --- |
| `input.prompt` | `system_prompt` | 由 `lib/novel/prompt.ts` 组装，已包含作品设定、人物、大纲、章节目标、当前正文 |
| `input.instruction` | 最新一条 `user` 消息 | 用户本次指令，作为对话的最后一轮用户输入 |

### 3. model

| NovelWriter | DeepSeek Harness | 说明 |
| --- | --- | --- |
| `input.model.provider` | 选择 Harness 内部的模型路由 | `deepseek` / `kimi` |
| `input.model.modelId` | `model` | 当前由 Runtime 从环境变量读取；接入 Harness 后可由 Harness 自行决定 |

### 4. tools

| NovelWriter | DeepSeek Harness | 说明 |
| --- | --- | --- |
| `input.tools` | `tools` | 预留字段，当前为 `undefined`；可注入「生成大纲」「检索设定」等工具定义 |

### 5. storage

| NovelWriter | DeepSeek Harness | 说明 |
| --- | --- | --- |
| `input.storage` | `storage` / `state` | 预留字段，可用于向 Harness 传递持久化状态（如长篇记忆、世界观快照） |

### 6. streaming events

`NovelRuntime.run()` 返回 `AsyncIterable<NovelAgentEvent>`，映射到 Harness 的流式输出：

| NovelAgentEvent | DeepSeek Harness | 说明 |
| --- | --- | --- |
| `{ type: "delta", content }` | 增量 token | 逐段推送生成文本 |
| `{ type: "done" }` | 流结束信号 | 标记一次生成完成 |
| `{ type: "error", message }` | 错误事件 | 异常时返回清晰错误 |

## 实现步骤（未来）

1. 在 `lib/runtime/deepseek-harness.ts` 中，将 `DeepSeekHarnessRuntime` 的占位错误实现替换为真实调用。
2. 若 Harness 以 **JSON-RPC / 独立进程** 运行：在该文件内建立连接、序列化 `NovelAgentInput`、订阅流式事件，再转成 `NovelAgentEvent` 产出。
3. 若 Harness 以 **插件/SDK** 运行：在运行时按需 `import()` 对应包，避免首屏打包体积膨胀。
4. 保持 `getRuntime()`（`lib/runtime/runtime.ts`）接口不变，业务代码零改动即可切换。

## 约束

- 不要在前端组件中直接引入任何 Harness SDK。
- API Key 仍只存在于服务端环境变量。
- Harness 尚未配置时，`DeepSeekHarnessRuntime` 必须返回可读的错误提示（当前已实现）。
