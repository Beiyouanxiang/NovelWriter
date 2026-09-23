# NovelWriter · 小说创作工作台

一个与 AI 协作的中文长篇小说创作工具。桌面端三栏工作台（作品设定 / AI 对话 / 正文编辑器），移动端自适应；第一版使用 `localStorage` 保存作品，无需数据库与登录系统。

## 技术栈

- **Next.js 15**（App Router）
- **TypeScript**
- **React 19**
- **Tailwind CSS 3**

## 功能特性

### 1. 小说项目设定
小说名称、类型、故事简介、写作风格、世界观、主要人物、故事大纲、当前章节目标，全部自动保存到 `localStorage`。

### 2. AI 对话区
- 支持 **DeepSeek** 与 **Kimi**，可随时切换 Provider
- 多轮对话 + 流式输出（SSE）
- 支持停止生成、重新生成、清空对话
- 快捷操作：续写正文 / 润色 / 扩写 / 改写对白 / 检查剧情逻辑 / 生成章节大纲

### 3. 正文编辑器
章节标题、正文编辑、实时字数统计、将 AI 回复追加/替换到正文、复制正文、导出 Markdown。

### 4. 页面设计
页面名「小说创作工作台」，桌面三栏、移动端标签切换，中文界面，简洁沉浸、适合长时间写作。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local`，并填入真实值：

```bash
cp .env.example .env.local
```

| 变量 | 说明 | 必填 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 使用 DeepSeek 时必填 |
| `DEEPSEEK_MODEL` | DeepSeek 模型 ID（如 `deepseek-chat`） | 使用 DeepSeek 时必填 |
| `DEEPSEEK_BASE_URL` | DeepSeek 接口地址 | 可选，默认 `https://api.deepseek.com` |
| `KIMI_API_KEY` | Kimi（Moonshot）API Key | 使用 Kimi 时必填 |
| `KIMI_MODEL` | Kimi 模型 ID（如 `moonshot-v1-8k`） | 使用 Kimi 时必填 |
| `KIMI_BASE_URL` | Kimi 接口地址 | 可选，默认 `https://api.moonshot.ai/v1` |
| `LLM_TIMEOUT_MS` | 单次请求超时（毫秒） | 可选，默认 `30000` |
| `LLM_ALLOWED_PROVIDERS` | 允许的 provider 列表 | 可选，默认 `deepseek,kimi` |
| `NOVEL_RUNTIME` | 运行模式：`direct` 或 `harness` | 可选，默认 `direct` |
| `NOVEL_ACCESS_TOKEN` | 服务端访问口令（设置后前端需填入相同值，否则 401） | 可选，默认空（不校验） |
| `TRUSTED_IP_HEADER` | 可信代理头（默认空=不信任客户端头，见下） | 可选，默认空 |
| `NOVEL_RATE_IP_PER_MINUTE` / `_PER_DAY` | 单 IP 分钟/每日额度 | 可选，默认 `30` / `300` |
| `NOVEL_RATE_GLOBAL_PER_MINUTE` / `_PER_DAY` | 全局分钟/每日额度 | 可选，默认 `120` / `5000` |
| `NOVEL_RATE_MAX_IP_ENTRIES` | IP 窗口最大条目数 | 可选，默认 `10000` |
| `NOVEL_RATE_LIMIT_DISABLED` | 设为 `1` 关闭限流 | 可选，默认空（启用） |

> **安全说明**：API Key 只保存在服务端环境变量中，前端通过 `/api/chat` 间接调用，绝不进入浏览器、`localStorage`、日志或响应。

### 3. 启动开发服务器

```bash
npm run dev
```

打开 <http://localhost:3000>。

### 4. 生产构建

```bash
npm run build
npm run start
```

## 常用命令

```bash
npm run dev     # 开发服务器
npm run build   # 生产构建
npm run start   # 生产启动
npm run lint    # ESLint 检查
npm test        # 运行单元测试（vitest）
```

## 安全与限流

`/api/chat` 会消耗你的 DeepSeek/Kimi 额度，公网部署前建议开启以下防护（应用层已内置，Nginx 层按需补充）：

### 应用层（已内置）

- **访问口令**：设置 `NOVEL_ACCESS_TOKEN` 后，前端在「作品设定 → 服务端访问口令」填入相同值即可，否则接口返回 `401`。
- **限流**：单 IP 与全局的分钟/每日额度，超限返回 `429` + `Retry-After`。额度由 `NOVEL_RATE_*` 环境变量控制，`NOVEL_RATE_LIMIT_DISABLED=1` 可关闭。全局限流优先检查、IP 窗口带过期清理与容量上限，防止伪造 IP 绕过或内存耗尽。
- **可信 IP**：默认不信任任何客户端可伪造的代理头，所有请求按 `unknown` 计；仅在配置 `TRUSTED_IP_HEADER` 后读取指定头（需 Nginx 以覆盖方式写入）。
- **请求体限制**：增量读取请求体，超过 2 MB 立即取消。
- **超时**：`LLM_TIMEOUT_MS` 覆盖「等待响应头」与「生成中途停滞」两段，卡住即中止。

> 限流为**内存级**，仅单实例（单进程）生效。若用 PM2 cluster / 多实例部署，请替换为 Redis 等共享存储，或在 Nginx 层额外限流。

### Nginx 层（可选，推荐）

在反代该服务的 `server` 块中补充请求体与请求频率限制：

```nginx
# 请求体大小上限（与应用的 2MB 一致）
client_max_body_size 2m;

# 请求频率限制（需先在 http 块定义 limit_req_zone）
# limit_req_zone $binary_remote_addr zone=novel:10m rate=5r/s;
limit_req zone=novel burst=20 nodelay;

# 用「覆盖」方式写入真实客户端 IP（$remote_addr 为 TCP 对端地址，客户端无法伪造）
proxy_set_header X-Real-IP $remote_addr;
```

> 注意：**不要**使用 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
> ——它会保留客户端伪造的 `X-Forwarded-For`。请使用覆盖式的 `X-Real-IP $remote_addr`，
> 并在 `.env` 中设置 `TRUSTED_IP_HEADER=x-real-ip`，应用才会读取该头。

### 供应商后台

建议同时在 DeepSeek / Kimi 控制台设置**单日消费上限**，作为兜底。

## 目录结构

```
app/
  page.tsx               # 小说创作工作台主页（三栏布局）
  layout.tsx             # 根布局
  globals.css            # 全局样式 + Tailwind
  api/chat/route.ts      # POST /api/chat 服务端大模型入口（SSE 流式）
components/
  ProjectSettings.tsx    # 作品设定面板
  ChatPanel.tsx          # AI 对话面板（含快捷操作、流式、停止/重新生成/清空）
  ManuscriptEditor.tsx   # 正文编辑器（字数统计、复制、导出 Markdown）
lib/
  novel/
    types.ts             # 核心类型（NovelSettings / NovelRuntime / NovelAgentEvent 等）
    prompt.ts            # 服务端 Prompt 组装
    validate.ts          # 请求校验（大小 / 消息数量 / 消息长度）
  runtime/
    runtime.ts           # 运行时选择器（NOVEL_RUNTIME 切换）
    direct-api.ts        # DirectApiRuntime：直连 DeepSeek / Kimi
    deepseek-harness.ts  # DeepSeekHarnessRuntime：占位实现
  providers/
    openai-compatible.ts # 统一 OpenAI 兼容 Provider Adapter
  server/
    rate-limit.ts        # 内存级限流（单 IP + 全局）
    body-limit.ts        # 请求体增量读取与大小限制
  storage/
    local.ts             # localStorage 封装
.env.example             # 环境变量示例
HARNESS_INTEGRATION.md   # DeepSeek Harness 接入方案
```

## 架构说明

前后端只依赖统一的 `NovelRuntime` 抽象，不直接依赖某一家模型厂商或 Harness SDK：

```ts
interface NovelRuntime {
  run(input: NovelAgentInput, signal?: AbortSignal): AsyncIterable<NovelAgentEvent>;
}
```

- 当前实现：`DirectApiRuntime`（直接调用 DeepSeek / Kimi 的 OpenAI 兼容接口）
- 未来实现：`DeepSeekHarnessRuntime`（详见 `HARNESS_INTEGRATION.md`）
- 通过 `NOVEL_RUNTIME=direct|harness` 选择；Harness 未配置时返回清晰错误
