# D1 生产数据库迁移状态

## 当前结论

- 数据库：`babyboogey-db`
- D1 binding：`DB`
- Wrangler migration 状态：无待应用迁移
- 最近整理时间：2026-05-05
- 最终结构快照：[d1-production-schema-2026-05-05.sql](./d1-production-schema-2026-05-05.sql)

## 生产迁移记录

生产库 `d1_migrations` 当前记录：

| id | name | 说明 |
| --- | --- | --- |
| 1 | `0000_heavy_boom_boom.sql` | 早期建表迁移，生产已应用 |
| 2 | `0001_spooky_sentinel.sql` | 早期建表迁移，生产已应用 |
| 3 | `0002_media_asset.sql` | 早期 media asset 迁移，生产已应用 |
| 4 | `0001_ai_task_refund_fields.sql` | 字段已先手动存在，2026-05-05 补录迁移记录 |
| 5 | `0002_payment_lifecycle_hardening.sql` | 2026-05-05 通过 Wrangler 应用 |
| 6 | `0003_video_unlock.sql` | 2026-05-05 通过 Wrangler 应用 |

## 2026-05-05 处理记录

`wrangler d1 migrations apply babyboogey-db --remote` 首次执行时，`0001_ai_task_refund_fields.sql` 因生产库已存在 `ai_task.refunded_at` 报错：

```text
duplicate column name: refunded_at
```

只读校验确认生产库同时已有：

- `ai_task.refunded_at`
- `ai_task.refund_reason`

因此补录了 `0001_ai_task_refund_fields.sql` 到 `d1_migrations`，随后通过 Wrangler 正常应用：

- `0002_payment_lifecycle_hardening.sql`
- `0003_video_unlock.sql`

## 当前新增表

支付生命周期表：

- `payment_event`
- `payment_refund`
- `subscription_plan_change`
- `payment_audit_log`

视频解锁表：

- `video_unlock`

`video_unlock` 当前字段：

- `id`
- `user_id`
- `task_id`
- `asset_id`
- `order_no`
- `product_id`
- `status`
- `created_at`
- `updated_at`
- `unlocked_at`

## 操作守则

- `d1-production-schema-2026-05-05.sql` 是生产库结构快照，只用于审计和人工对照；它不是迁移文件，不应通过 Wrangler migrations apply 执行。
- 不要重命名已经应用过的迁移文件。
- 不要删除 `d1_migrations` 里的历史记录，即使本地迁移目录没有早期 `0000_*` / `0001_*` / `0002_media_asset.sql` 文件。
- 后续新增 D1 迁移时，继续放在 `src/config/db/migrations-d1/`，并在部署前执行：

```bash
pnpm exec wrangler d1 migrations list babyboogey-db --remote
pnpm exec wrangler d1 migrations apply babyboogey-db --remote
```

- 如果迁移失败，先用只读 SQL 确认 schema 现状，再决定是否补录迁移记录；不要直接删除生产表或迁移记录。
