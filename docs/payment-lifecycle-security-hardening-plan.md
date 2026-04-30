# 支付全链路安全审计与加固计划

## Traceability

- Task: Payment lifecycle security hardening
- Branch: `codex/payment-lifecycle-security-hardening`
- Created: 2026-04-30
- Source: 用户提出的支付全链路安全审计与加固计划
- Scope: Stripe、PayPal、Creem 的 checkout、webhook、订单、订阅、退款、换套餐和 credits 账本

## Summary

对 Stripe、PayPal、Creem 的 checkout、webhook、订单、订阅、退款、换套餐和 credits 账本做全量审计与加固。目标是防止低价支付换高价权益、重复订阅、退款后权益残留、webhook 重复/漏处理，以及 provider 状态与本地账本不一致。

## Key Changes

- Checkout 硬化：服务端 metadata 不允许被客户端覆盖；指定 provider 时必须严格匹配；订阅购买前阻止 active/trialing/pending_cancel 用户直接开第二条订阅，改走换套餐流程。
- 支付成功校验：订单标记 `paid` 和发放 credits 前，必须校验 provider、session id、order_no、user_id、金额、币种、payment type、subscription id、目标套餐都与本地订单匹配。
- Webhook 账本：新增 payment event ledger，按 provider event id/resource id 幂等记录处理状态；退款、失败付款、取消、订阅更新都走同一处理管线，未知但合法事件安全返回 200，签名错误拒绝。
- 退款闭环：新增退款记录/订单退款状态；后台支持“只取消 / 立即退款并取消 / 期末取消”三种动作。退款后强制回收 credits：剩余积分作废，已消耗部分记负向调整，防止退款套利。
- 自动换套餐：新增 provider 层 `changeSubscriptionPlan` 能力。升级立即补差价并生效，发放本周期 credits 差额；降级不扣当前周期 credits，记录 pending plan，下周期按新套餐发放。
- Provider 适配：PayPal 使用 refund capture、cancel subscription、revise subscription；Stripe 使用 refund、cancel/update subscription；Creem 使用 refund/cancel/upgrade/update 能力。PayPal/Stripe/Creem 的订阅套餐需要稳定 provider plan/price/product 映射，缺失配置时禁止自动换套餐并给后台明确错误。

## Interfaces And Data

- 扩展 `PaymentProvider`：增加 `refundPayment()`、`changeSubscriptionPlan()`，并让 refund webhook 能返回可处理的 `PaymentEvent`。
- 扩展订单/订阅/积分模型：增加 refund ledger、payment event ledger、subscription pending plan/change 记录、credit refund reversal scene/type。
- 后台新增操作入口：payments/subscriptions 列表或详情页提供退款、取消、换套餐、重放 webhook/对账动作，并受 RBAC 权限保护。
- 用户侧：已有订阅时 pricing 的订阅按钮改为“Change Plan”，进入换套餐流程；积分包仍允许购买。

## Test Plan

- 自动化覆盖：metadata 覆盖攻击、低价订单伪装高价订单、重复 webhook、退款 webhook、重复订阅拦截、PayPal 重订阅、升级补差发 credits、降级下周期生效。
- Provider mock 测试：模拟 Stripe/PayPal/Creem 成功、失败、重复、乱序 webhook。
- 手动沙盒验收：PayPal 订阅、取消、退款、重新订阅、升级、降级；Stripe/Creem 同路径抽样验证。
- 最终验证：`pnpm check:deploy`，并新增一个聚焦 payment lifecycle 的测试命令或脚本。

## Assumptions

- 退款第一版为后台/admin 操作，不做用户自助退款申请。
- 自动换套餐优先支持 active/trialing 订阅；canceled/expired 用户重新走正常订阅。
- 强制回收 credits 允许用户余额变为负数，后续充值/订阅先抵扣负余额。
- 执行时应先创建 Trellis 任务，写 PRD 和研究材料，再进入实现。
- 官方能力参考：
  - [PayPal refund/cancel/revise](https://developer.paypal.com/docs/api/subscriptions/v1/)
  - [Stripe refunds/subscription updates](https://docs.stripe.com/billing/subscriptions/upgrade-downgrade)
  - [Creem refunds/cancellations/upgrades](https://docs.creem.io/features/subscriptions/refunds-and-cancellations)

## Implementation Notes

- Trellis task artifacts are under `.trellis/tasks/04-29-payment-lifecycle-security-hardening`, but `.trellis/` is ignored by Git.
- This tracked document exists so the original plan remains visible in the repository history alongside the code changes.
- Deployment still requires applying the generated DB migration and running RBAC initialization for the new admin permissions.
