# NovelWriter 部署指南

## 1. 前置要求

- Node.js 22+（Next.js 15 运行环境）
- PostgreSQL 16+（正式数据源，非内存存储）
- （可选）Docker / Docker Compose 用于起 PostgreSQL
- 生产登录功能**必须在 HTTPS 之后启用**（会话 Cookie 的 `Secure` 属性在非 HTTPS 下不会设置，安全基线不满足）

## 2. 启动数据库

```bash
# 方式 A：Docker Compose
docker compose up -d

# 方式 B：已有 PostgreSQL
createdb novelwriter
```

## 3. 环境变量

```bash
cp .env.example .env
# 必填：
#   DATABASE_URL=postgresql://novelwriter:novelwriter@localhost:5432/novelwriter
#   JWT_SECRET=$(openssl rand -hex 32)
#   DEEPSEEK_API_KEY=...  （或 KIMI_API_KEY）
```

> `.env` 已加入 `.gitignore`，绝不提交。

## 4. 安装依赖 + 数据库迁移 + 构建

```bash
npm install                 # 会自动 prisma generate
npm run db:migrate          # 应用 prisma/migrations/0001_init/migration.sql
npm run build               # prisma generate && next build
npm run start
```

迁移命令对照：

| 命令 | 用途 |
| --- | --- |
| `npm run db:migrate` | 生产：应用已提交的迁移（幂等） |
| `npm run db:migrate:dev` | 开发：根据 schema 生成并应用新迁移 |
| `npm run db:generate` | 仅重新生成 Prisma Client |
| `npm run db:studio` | 打开 Prisma Studio 查看数据 |

## 5. Nginx 反代（HTTPS + 安全头 + 可信 IP）

```nginx
server {
    listen 443 ssl;
    server_name your.domain.com;
    ssl_certificate ...;
    ssl_certificate_key ...;

    client_max_body_size 2m;
    limit_req_zone $binary_remote_addr zone=novel:10m rate=5r/s;
    limit_req zone=novel burst=20 nodelay;

    location / {
        proxy_pass http://127.0.0.1:3000;
        # 覆盖式写入真实 IP（客户端无法伪造）
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $host;
    }
}
```

对应 `.env` 需设置 `TRUSTED_IP_HEADER=x-real-ip`。

## 6. 数据库备份与恢复

```bash
# 备份（含 WAL 一致性）
pg_dump -Fc novelwriter > novelwriter_$(date +%F).dump

# 恢复
pg_restore -d novelwriter novelwriter_YYYY-MM-DD.dump
```

建议：每日 `pg_dump` + 保留 7 天（`pg_dump` 时数据库仍在服务，无需停机）。

## 7. 需要执行的外部操作（本项目无法代做）

以下操作涉及系统级权限或账号密钥，需你本人执行：

1. **数据库**：启动 PostgreSQL（Docker 或自建），创建库与账号，填入 `DATABASE_URL`。
2. **HTTPS**：为域名申请证书（如 certbot），登录功能在生产必须在 HTTPS 下。
3. **API Key**：把 `DEEPSEEK_API_KEY` / `KIMI_API_KEY` 填入服务器 `.env`（不要发到聊天）。
4. **JWT_SECRET**：生成并填入强随机串。
5. **Nginx**：按第 5 节配置反代、可信 IP 与限流。
6. **供应商消费上限**：在 DeepSeek / Kimi 控制台设置单日消费上限兜底。
7. **备份脚本**：配置 `pg_dump` 定时任务（cron）。

## 8. 破坏性迁移说明

- 首个迁移 `0001_init` 是**全新建表**，无破坏性变更。
- 当前版本没有「删除列/表」等破坏性迁移。
- 未来若改表，用 `prisma migrate dev` 生成增量迁移并评审后再应用。
