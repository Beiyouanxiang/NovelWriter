# NovelWriter · 小说创作工作台

本地优先、支持协作的中文长篇小说创作工具。刷新、断网、请求失败都不易丢失已输入内容；登录后支持跨设备同步、创建工作区并邀请协作者。

## 技术栈

- **Next.js 15**（App Router）+ **TypeScript** + **React 19** + **Tailwind CSS 3**
- **Prisma** + **PostgreSQL**（正式数据源，非内存存储）
- **IndexedDB**（本地优先持久化）+ **PWA**（离线可用）
- 认证：bcrypt 密码哈希 + JWT（`jose`）HttpOnly Cookie + CSRF

## 核心能力

- **账号与认证**：注册 / 登录 / 退出，HttpOnly+Secure+SameSite Cookie，CSRF 防护，登录注册限流
- **工作区与协作**：创建工作区、邀请（按邮箱）、成员角色 owner/editor/viewer、权限服务端校验
- **本地优先保存**：输入即时更新 React 状态 → 300–500ms 防抖写 IndexedDB → 模糊/离开页立即 flush；刷新后从 IndexedDB 恢复；localStorage 旧数据一次性迁移
- **离线与 PWA**：缓存应用壳，断网可编辑，离线操作入队，联网自动同步，AI 请求离线时禁用
- **跨设备同步**：operation 幂等 + revision 冲突检测（章节正文冲突保留本地版与服务端版）+ 游标增量拉取 + 软删除墓碑
- **版本历史**：小说设定与章节正文自动快照，预览/恢复，保留最近 30 版
- **AI 对话**：DeepSeek / Kimi 切换、流式输出、停止/重新生成/清空、6 个快捷操作，绑定小说与章节

## 快速开始

### 1. 数据库

```bash
docker compose up -d          # 起 PostgreSQL（或自建）
```

### 2. 环境变量

```bash
cp .env.example .env
# 必填：DATABASE_URL、JWT_SECRET（openssl rand -hex 32）、DEEPSEEK_API_KEY 或 KIMI_API_KEY
```

### 3. 安装 + 迁移 + 构建

```bash
npm install
npm run db:migrate            # 应用 prisma/migrations/0001_init
npm run build
npm run start
```

> 生产登录必须在 HTTPS 下（会话 Cookie 的 Secure 属性依赖 HTTPS）。详见 `docs/DEPLOYMENT.md`。

## 数据架构（PostgreSQL）

| 表 | 说明 |
| --- | --- |
| `User` | 账号（email 唯一，passwordHash） |
| `Workspace` / `WorkspaceMember` | 工作区与成员（owner/editor/viewer） |
| `Novel` / `Chapter` | 小说与章节（`revision` 递增，`deletedAt` 软删除） |
| `ChatSession` / `ChatMessage` | 对话 |
| `Revision` | 版本历史快照 |
| `SyncOperation` | 同步操作（`operationId` 唯一幂等 + 审计） |

## 同步协议

- 客户端每次修改生成 `{ operationId, entityType, entityId, operation, payload, baseRevision }`
- 服务端 `POST /api/sync/push`：`operationId` 幂等去重；章节正文严格 `baseRevision` 校验，冲突返回 409 + 服务端版
- `POST /api/sync/pull`：游标增量拉取（`updatedAt`），含软删除墓碑
- 冲突策略：小说设定字段级自动合并；章节正文冲突保留双方，冲突解决页可选本地版/服务端版/手动合并

## 安全

- API Key 仅存服务端环境变量，前端不直连厂商；有「密钥不进入客户端源码」测试
- 所有数据接口按当前用户 + 工作区成员角色鉴权，绝不信任前端传入的 userId/workspaceId
- 登录、注册、AI 接口限流；请求体增量读取限流；`TRUSTED_IP_HEADER` 默认不信任客户端代理头
- 不记录正文/设定/对话全文到普通日志；错误响应不泄露堆栈、密钥或连接串

## 目录结构（要点）

```
app/api/                 # auth / workspaces / novels / chapters / revisions / sync / chat
components/              # auth / workspace / editor / chat / pwa
lib/
  auth/                  # password / session / csrf
  db/                    # Prisma client
  domain/types.ts        # 实体类型
  server/                # permissions / sync / revisions / rate-limit / http
  local-db/              # IndexedDB schema/repository/migration/operation-queue/recovery
  sync/engine.ts         # 客户端同步引擎（推拉 + 冲突）
  novel/                 # Runtime 抽象（DeepSeek/Kimi）、prompt、validate
prisma/schema.prisma     # 数据模型
prisma/migrations/       # 迁移 SQL
docker-compose.yml       # 本地 PostgreSQL
docs/DEPLOYMENT.md       # 部署、迁移、备份、外部操作清单
```

## 命令

```bash
npm run dev / build / start
npm run lint
npm test
npm run db:migrate / db:generate / db:studio
```
