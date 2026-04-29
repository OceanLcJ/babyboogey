# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 项目定位

BabyBoogey（AI Baby Dance Generator）是一个 SaaS 应用：将宝宝照片生成跳舞视频。代码基于 **ShipAny AI SaaS Boilerplate**（`LICENSE` 禁止公开分发源代码）。生产运行在 **Cloudflare Workers + D1 + R2**，通过 `@opennextjs/cloudflare` 适配 Next.js。

## 常用命令

```bash
pnpm dev              # 本地开发（Turbopack）
pnpm build            # 构建
pnpm lint             # ESLint（next/core-web-vitals + next/typescript）
pnpm check:deploy     # lint + tsc --noEmit，部署闸门
pnpm format           # Prettier 写入
pnpm cf:preview       # Cloudflare Workers 本地预览（OpenNext）
pnpm cf:deploy        # 快路径部署（cf:build + deploy --minify，不跑 lint/typecheck）
pnpm cf:deploy:strict # 先 check:deploy 再部署，发布前使用
pnpm cf:deploy:reuse  # 复用现有 .next / .open-next 产物直接部署
pnpm cf:typegen       # 生成 src/shared/types/cloudflare.d.ts 的 Env 类型
```

**Drizzle 迁移**：`pnpm db:generate | db:migrate | db:push | db:studio`。这些脚本包在 [scripts/with-env.ts](scripts/with-env.ts) 里，优先级：`--env` 参数 > `ENV_FILE` env var > `.env.{NODE_ENV}` > `.env.development`。使用示例：`ENV_FILE=.env.production pnpm db:generate`。

**RBAC 种子**：`pnpm rbac:init`（初始化角色/权限），`pnpm rbac:assign`（给用户赋角色），均经过 `with-env.ts`。

**不存在单测命令**——仓库未配置测试框架。

## 图片 → R2 迁移流程

两阶段、幂等：

1. `pnpm images:optimize` 生成 webp + 写入清单 [docs/image-migration-manifest.json](docs/image-migration-manifest.json)
2. 设置 `R2_PUBLIC_BUCKET` / `R2_PUBLIC_DOMAIN` / `R2_KEY_PREFIX` 后 `pnpm images:upload:r2`
3. `pnpm images:rewrite:refs` 只改"已上传"条目的 `src/` 与 `content/` 引用
4. `pnpm images:prune:local --dry-run` 预览 → `pnpm images:prune:local` 删本地原图

## 高阶架构

### 三层目录切分（务必遵守）

- [src/config/](src/config/) —— **配置层**：环境变量导出（[src/config/index.ts](src/config/index.ts)）、多方言 DB schema（`schema.postgres.ts` / `schema.mysql.ts` / `schema.sqlite.ts`，通过 `DB_SCHEMA_FILE` 切换）、locale 列表、主题。
- [src/core/](src/core/) —— **基础设施层**：Drizzle 访问器（[src/core/db/index.ts](src/core/db/index.ts)）、better-auth（[src/core/auth/](src/core/auth/)）、RBAC、next-intl 路由、Fumadocs source。
- [src/extensions/](src/extensions/) —— **可插拔 provider**：`ai/`（kie / replicate / gemini / fal）、`payment/`（stripe / paypal / creem）、`storage/`（r2 / s3）、`email/`、`analytics/`、`affiliate/`、`ads/`、`customer-service/`。每个目录有 `index.ts` 注册入口 + 各 provider 独立文件。
- [src/shared/](src/shared/) —— **业务代码**：`blocks/`（UI 块：chat / landing / dashboard / panel 等）、`components/`、`models/`（Drizzle 查询封装）、`services/`（跨 model 流程）、`hooks/`、`contexts/`、`lib/`、`types/`。
- [src/app/](src/app/) —— **Next App Router**：所有页面落在 `[locale]/` 下并按路由组划分：`(landing)` / `(auth)` / `(chat)` / `(docs)` / `(admin)`；`(landing)/(ai)/` 聚合 AI 落地页，`(landing)/[...slug]/` 负责 MDX pages 兜底。

### 多方言数据库（关键抽象）

[src/core/db/index.ts](src/core/db/index.ts) 的 `db()` 返回 `any`——因为 Drizzle 的 Postgres / SQLite / MySQL 类型不兼容。同一文件里的 `withMysqlCompat` 和 `withSqliteCompat` 两个 Proxy shim 解决了跨方言差异：
- MySQL 的 `.returning()` 用 values/set 载荷回填；`onConflictDoUpdate` 映射到 `onDuplicateKeyUpdate`
- SQLite/D1 的 `.for('update')` 变成 no-op；D1 在 Workers 上的 `BEGIN` 失败会降级为"无事务"回调

写 DB 代码时**不要直接 import 特定方言**——调用 `db()` 并接受 `UnsafeAny` 类型，兼容层会处理其余。需要锁定方言时用 `dbPostgres()` / `dbMysql()` / `dbSqlite()`。

### Cloudflare D1 vs 本地 SQLite

`DATABASE_PROVIDER=d1` 在 Workers 运行时走 D1 绑定（`wrangler.toml` 里 `binding = "DB"`）；Node 环境（如本地跑迁移）需要 `DATABASE_URL=file:./.tmp/dev.db` 作为 SQLite 回退。D1 的迁移产物输出到 `src/config/db/migrations-d1`，与 Postgres 的 `src/config/db/migrations` 分开。

### middleware 责任链

[src/middleware.ts](src/middleware.ts) 做三件事（顺序固定）：
1. `babyboogey.com` → `www.babyboogey.com` 308 重定向
2. 通过 `next-intl` 的 `createIntlMiddleware` 处理 locale 前缀（`as-needed` 策略）
3. 对 `/admin` / `/settings` / `/activity` 检查 better-auth session cookie（仅轻量校验，实际权限在 layout / API 里用 `requirePermission()`）
4. 公开页面剥掉 `Set-Cookie` 并注入 `s-maxage=3600, stale-while-revalidate=14400` 的 CDN 缓存头

新增需要鉴权的路由前缀时，必须同步修改 middleware 中两处判断列表。

### i18n

三种语言 `en` / `zh` / `ja`，定义在 [src/config/locale/index.ts](src/config/locale/index.ts)。消息文件拆包（`common` / `landing` / `pricing` / `settings/*` / `admin/*` / `ai/*` / `pages/*`），新增页面翻译时必须把 key 加进 `localeMessagesPaths` 否则加载不到。Fumadocs 内容的中文版用 `*.zh.mdx` / 日语 `*.ja.mdx` 命名。

### 内容系统（Fumadocs + MDX）

[source.config.ts](source.config.ts) + [src/core/docs/source.ts](src/core/docs/source.ts) 暴露四个 source：
- `content/docs` → `/docs`
- `content/posts` → `/blog`
- `content/logs` → `/updates`
- `content/pages` → `/`（由 `(landing)/[...slug]/page.tsx` 拉取）

`pageExtensions` 含 `md` / `mdx`，`postinstall` 会跑 `fumadocs-mdx` 生成 `.source/`。Vercel 构建下 `mdxRs` 实验标志被关掉以兼容 fumadocs-mdx，本地开发保持开启。

### AI Provider 注册

[src/extensions/ai/index.ts](src/extensions/ai/index.ts) 导出单例 `aiManager`，各 provider 在进程启动时调用 `addProvider(provider, isDefault)` 注册。`saveFiles` 统一处理"外部生成结果 → 下载 → 上传存储 → 落 `media_asset` 表 → 返回 `asset://` 引用"流水线，所有 provider 共用。新增 provider 时加到 `src/extensions/ai/` 并在 index 里 `export *`。

### 支付 & 订单

诊断接口仅限管理员：
- `GET /api/admin/check-orders` — HTML 报告
- `GET /api/admin/diagnose-payment` — JSON
- `POST /api/admin/fix-stuck-orders` — 修复 `created` 卡单

详细用法见 [docs/FIX_STUCK_ORDERS.md](docs/FIX_STUCK_ORDERS.md)。

## 约定与陷阱

- `UnsafeAny` 是全局声明的 `any` 别名，用于跨方言 DB 场景，不要替换成具体类型。
- 路径别名：`@/*` → `./src/*`，`@/.source` → `./.source/index.ts`（Fumadocs 生成物）。
- `output: 'standalone'` 在 Vercel 下会被关闭（`next.config.mjs` 里通过 `process.env.VERCEL` 判断）。
- `serverExternalPackages` 必须包含 `@libsql/client`——否则 OpenNext bundler 在 workerd 环境下 resolve 失败。
- Workers 构建若要复用 `.next` + `.open-next`，用 `cf:deploy:reuse`；否则永远跑完整 `cf:build`。
- `reactStrictMode: false`——有副作用代码依赖此设定，改动前先确认。
- 项目使用 **pnpm 10.x**（`package.json#packageManager`），不要用 npm/yarn。
- 当前 [open-next.config.ts](open-next.config.ts) 的 R2 incremental cache **已临时禁用**（注释里注明"Wrangler r2 bulk commands 兼容问题"）——README 中描述的 R2 缓存是目标态，不是当前态。
