# BabyBoogey (AI Baby Dance Generator)

将宝宝照片一键变成可爱的跳舞视频（Next.js + Cloudflare Workers + D1/Drizzle）。

> 注意：本项目基于 ShipAny AI SaaS Boilerplate，受 `LICENSE` 约束，**禁止公开发布源代码**。

## 快速开始（本地）

**前置要求**
- Node.js（建议 20+）
- pnpm（仓库已固定 `pnpm@10.x`，见 `package.json#packageManager`）

**安装依赖**
```bash
pnpm install
```

**配置环境变量**
```bash
cp .env.example .env.development
# 按需编辑 .env.development
```

**启动开发环境**
```bash
pnpm dev
```

打开 `http://localhost:3000`

## 常用命令

```bash
pnpm dev            # Next.js dev（Turbopack）
pnpm build          # Next.js build
pnpm start          # Next.js start
pnpm lint           # ESLint
pnpm format         # Prettier（写入）
pnpm format:check   # Prettier（检查）
```

## 环境变量

最小集合参考 `.env.example`，常用项如下：
- `NEXT_PUBLIC_APP_URL`：站点 URL（本地一般为 `http://localhost:3000`）
- `NEXT_PUBLIC_APP_NAME`：应用名称
- `NEXT_PUBLIC_DEFAULT_LOCALE`：默认语言（`en` / `zh`）
- `DATABASE_PROVIDER`：`postgresql` / `mysql` / `sqlite` / `turso` / `d1`
- `DATABASE_URL`：数据库连接（D1 在 Workers 环境下可不依赖该值）
- `AUTH_SECRET`：鉴权密钥（`openssl rand -base64 32`）
- `AUTH_TRUSTED_ORIGINS`：多域名/预览环境时的可信 Origin 列表（逗号分隔）

## 数据库与迁移（Drizzle）

Schema 位于 `src/config/db/`，迁移文件默认输出到 `src/config/db/migrations`（可通过 env 覆盖）。

```bash
pnpm db:generate    # 生成 migrations
pnpm db:migrate     # 执行 migrations
pnpm db:push        # 直接推送 schema（谨慎使用）
pnpm db:studio      # Drizzle Studio
```

**切换 env 文件运行脚本（可选）**
```bash
ENV_FILE=.env.production pnpm db:generate
```

**D1（Cloudflare）说明**
- Workers 运行时通过 `wrangler.toml` 绑定 D1：`[[d1_databases]] binding = "DB"`
- 若在 Node 环境使用 `DATABASE_PROVIDER=d1`，需要提供 `DATABASE_URL` 作为本地 SQLite/Turso 回退（例如 `file:./.tmp/dev.db`），或改用 Cloudflare 预览运行（见下节）。

## Cloudflare（OpenNext）

本项目集成了 `@opennextjs/cloudflare`：

```bash
pnpm cf:preview     # Cloudflare 本地预览（OpenNext）
pnpm -s cf:deploy   # 部署到 Cloudflare
pnpm cf:typegen     # 生成 Cloudflare Env 类型（可选）
```

配置参考 `wrangler.toml.example`，生产配置可见 `wrangler.toml`。

### R2 Incremental Cache（性能优化）

项目已启用 R2 作为 ISR/SSG 缓存存储，优势如下：
- ✅ 减小 Worker 包体积（缓存数据存储在 R2，不打包到 Worker）
- ✅ 提升部署速度（Worker 包更小，上传和启动更快）
- ✅ 突破缓存限制（R2 无限存储 vs Worker 10MB 限制）
- ✅ 多实例共享缓存

**配置要求**：
1. 在 Cloudflare Dashboard 创建 R2 bucket（如 `babyboogey-cache`）
2. 在 `wrangler.toml` 中配置 R2 绑定（已配置）：
   ```toml
   [[r2_buckets]]
   binding = "NEXT_CACHE_BUCKET"
   bucket_name = "babyboogey-cache"
   ```
3. `open-next.config.ts` 已启用 `r2IncrementalCache`

参考：[OpenNext Cloudflare Caching 文档](https://opennext.js.org/cloudflare/caching)

## 内容系统（Docs / Blog / Updates）

本项目使用 Fumadocs + MDX，内容目录如下：
- `content/docs` → `/docs`
- `content/posts` → `/blog`
- `content/logs` → `/updates`
- `content/pages` → `/`

多语言：默认支持 `en` / `zh`，中文内容使用 `*.zh.mdx` 文件（见 `src/core/docs/source.ts`）。

## 管理与排障（支付）

内置支付诊断与修复接口：
- `GET /api/admin/check-orders`：HTML 报告
- `GET /api/admin/diagnose-payment`：JSON 诊断
- `POST /api/admin/fix-stuck-orders`：修复卡在 `created` 的订单

详细用法见：`docs/FIX_STUCK_ORDERS.md`

## License

请阅读 `LICENSE`。该协议禁止将本仓库源代码公开分发。
