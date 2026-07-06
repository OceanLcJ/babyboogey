# 安全加固记录（2026-07-06）

一轮以“支付是否泄漏密钥 + 全项目风险排查”为起点的安全加固，全部已合入 `main` 并部署到生产。

## 结论：支付无密钥泄漏风险

- **Webhook 均验签**：Stripe `webhooks.constructEvent`、Creem HMAC 比对（空密钥直接抛错）、PayPal `verify-webhook-signature`（生产环境缺签/验签失败一律拒绝）。伪造“已支付”事件骗积分的攻击被挡住。
- **密钥不进客户端**：用真实 `AUTH_SECRET` / `DATABASE_URL` 值 grep 客户端产物（`.next/static`），命中数为 0。客户端 bundle 里的 `process.env.AUTH_SECRET` 等在浏览器运行时被替换为空串。
- **生产密钥不入库**：`.env.production` 中密钥为空值，真实值经 Cloudflare secret 注入。

## 已修复项

| 严重度 | 位置 | 问题 | 修复 |
| --- | --- | --- | --- |
| 高 | `api/admin/check-orders`、`api/admin/diagnose-payment` | 仅校验“已登录”，任意登录用户可拉取全站订单/积分/邮箱 | 补 `hasPermission(ADMIN_ACCESS)` → 403 |
| 中 | 多个 API catch | 把 `e.message` 原样返回客户端（内部/DB 错误外泄） | `safeErrorMessage()`：生产返回通用文案，详情仅落服务端日志（dev 保留详情） |
| 中 | `api/storage/upload-media` | 接受任意 MIME（SVG 存储型 XSS）、无大小上限 | MIME 白名单（禁 SVG）+ 分类型大小上限，读入内存前校验 |
| 中 | `api/storage/assets/[assetId]` | 用户内容按存储 MIME 内联返回 | 加 `X-Content-Type-Options: nosniff` 与 `Content-Security-Policy: sandbox` |
| 中 | `core/auth/index.ts` | 生产 `AUTH_SECRET` 为空时 better-auth 静默降级 | `getAuth()` 运行时 fail-closed（`isCloudflareWorker` 守护，不影响构建） |
| 中 | better-auth | 认证限流未生效（详见下节） | 显式 `enabled` + Cloudflare 客户端 IP + D1 共享存储 |
| 低 | `shared/contexts/app.tsx` | 客户端组件引用含密钥的 `envConfigs` | 移除引用，顺带修掉 SSR/client 水合不一致 |
| 运维 | `.dev.vars` | 被 git 跟踪 | 停止跟踪并 gitignore（仅含无引用的 `NEXTJS_ENV`，零影响） |

`safeErrorMessage()` 定义在 [src/shared/lib/resp.ts](../src/shared/lib/resp.ts)。

## 认证限流（better-auth + D1 共享存储）

目标：让限流计数跨 Cloudflare Workers isolate 全局一致（默认 memory 存储是 per-isolate 的）。

### 落地方式

- `rate_limit` 表加入三方言 schema 并从 `schema.ts` 选择器 re-export，供 better-auth 的 drizzle adapter 解析 `rateLimit` 模型。`lastRequest` 存毫秒 → sqlite/D1 用 64 位 integer，pg/mysql 用 bigint。
- 手写幂等 D1 迁移 `src/config/db/migrations-d1/0004_rate_limit.sql`（wrangler 应用）。
- 存储由环境变量 `AUTH_RATE_LIMIT_STORAGE` 控制，见 [wrangler.toml](../wrangler.toml) 的 `[vars]`：`"database"` 用 D1 共享表，其他值/未设置回退 memory。
- 配置见 [src/core/auth/config.ts](../src/core/auth/config.ts) 的 `rateLimit` 块。

### 排查过的三个真实坑（黑盒验证暴露）

限流一开始完全不生效（无 429、无 D1 写入），逐一定位：

1. **`enabled` 未显式开**：better-auth 默认按 `NODE_ENV==='production'` 自动开，但该变量在 Workers 模块求值期尚未被 OpenNext 注入（按请求注入），自动探测读到 `undefined` → 关闭。改为显式 `enabled: true`。
2. **取不到客户端 IP**：限流按 IP 生成 key，better-auth 默认只读 `x-forwarded-for`，而 Cloudflare Worker 真实 IP 在 `cf-connecting-ip`。无 IP → 跳过所有限流。配 `advanced.ipAddress.ipAddressHeaders: ['cf-connecting-ip','x-real-ip','x-forwarded-for']`（与 [src/shared/lib/ip.ts](../src/shared/lib/ip.ts) 一致）。
3. **`/get-session` 是 better-auth 默认豁免路径**：高频轮询，不计入限流。初期用它测试导致误判。

### 生效验证（生产实测）

130 并发打 `POST /api/auth/sign-in/social`：

```text
27 × 200 + 103 × 429      # 超过基础限额 100/60s 后开始拒绝
D1 rate_limit 写入 15 行  # key = <cf-connecting-ip>/sign-in/social，count 累加
```

### 现状与说明

- 本站为 **Google OAuth**（邮箱密码登录关闭），`emailAndPassword.enabled = configs.email_auth_enabled !== 'false'` 在生产解析为关闭。
- 因此针对 `/sign-in/email`、`/sign-up/email`、`/forget-password`、`/reset-password` 的 `customRules` 目前**不触发**（这些端点被禁用会提前返回）；一旦开启邮箱登录即自动生效。
- 当前实际生效的是**基础限额 `window: 60, max: 100`**，覆盖 `/sign-in/social`、OAuth 回调等可达路径。

## 回退与开关

- **关掉 D1 限流、回退 memory**：删除或改掉 `wrangler.toml` 的 `AUTH_RATE_LIMIT_STORAGE`，重新部署即可。表保留无害。
- **完全关限流**：把 `src/core/auth/config.ts` 的 `rateLimit.enabled` 改为 `false`。

## 待确认运维项

- **PayPal 环境**：`configs.environment` 生产须为 `production`，否则 sandbox 分支会放行未验签事件。这是配置项而非代码缺陷。
