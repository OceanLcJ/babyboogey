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
pnpm run check:deploy      # 部署前校验（lint + typecheck）
pnpm run cf:build          # 仅构建 Next + OpenNext worker
pnpm -s cf:deploy          # 快路径部署（默认，含 minify）
pnpm -s cf:deploy:strict   # 严格部署（先校验再部署）
pnpm -s cf:deploy:reuse    # 复用已有构建产物直接部署
pnpm -s cf:upload          # 上传版本（含构建）
pnpm -s cf:upload:reuse    # 复用已有构建产物上传版本
pnpm cf:preview            # Cloudflare 本地预览（OpenNext）
pnpm cf:typegen            # 生成 Cloudflare Env 类型（可选）
```

配置参考 `wrangler.toml.example`，生产配置可见 `wrangler.toml`。

### 部署模式说明

- **快路径（推荐）**：`cf:deploy`
  - 包含 `cf:build + deploy --minify`
  - 不执行 lint/typecheck，追求更快部署
- **严格模式**：`cf:deploy:strict`
  - 先跑 `check:deploy` 再部署，适合发布前闸门
- **复用模式**：`cf:deploy:reuse` / `cf:upload:reuse`
  - 仅在你确认 `.next` 与 `.open-next` 产物已是最新时使用

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
   binding = "NEXT_INC_CACHE_R2_BUCKET"
   bucket_name = "babyboogey-cache"
   ```
3. `open-next.config.ts` 已启用 `r2IncrementalCache`

参考：[OpenNext Cloudflare Caching 文档](https://opennext.js.org/cloudflare/caching)

## 图片瘦身与 R2 迁移

本仓库支持“先迁移、后删除”的双阶段流程：先把大图转 `webp`、上传到 R2、改引用；验证稳定后再删本地原图。

### 阶段一：优化、上传、改引用（不删本地）

```bash
# 1) 生成 webp 与迁移清单（默认 quality=78）
pnpm images:optimize

# 2) 上传到 R2（需要 bucket）
R2_PUBLIC_BUCKET=<bucket> \
R2_PUBLIC_DOMAIN=https://img.aibabydance.org \
R2_KEY_PREFIX=assets/imgs \
pnpm images:upload:r2

# 3) 仅重写已上传条目的 src/content 引用
pnpm images:rewrite:refs
```

迁移清单默认写入：`docs/image-migration-manifest.json`。

### 阶段二：清理本地原图（第二步）

```bash
# 先预览将被删除的文件
pnpm images:prune:local --dry-run

# 执行删除（仅删除满足条件条目）
pnpm images:prune:local
```

删除条件：
- `uploaded=true && rewritten=true`
- 或“仓库内无引用的大图”且 `uploaded=true && reversible=true`

### 回滚说明

- 引用回滚：回退 `src/`、`content/` 相关改动（例如使用 `git restore` 或回滚提交）
- 本地图回滚：按 `docs/image-migration-manifest.json` 中 `sourcePath` 恢复文件
- 线上资源保持不变：R2 资源可继续保留，不影响回滚到本地路径

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
