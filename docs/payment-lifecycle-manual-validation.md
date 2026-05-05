# 支付全链路人工验收清单

## Traceability

- Related plan: [payment-lifecycle-security-hardening-plan.md](./payment-lifecycle-security-hardening-plan.md)
- Branch: `codex/payment-lifecycle-security-hardening`
- Created: 2026-04-30
- Scope: Stripe、PayPal、Creem checkout / webhook / refund / subscription / plan change / credits ledger

## 0. 验收前置条件

- 使用 sandbox/test 环境，禁止直接用 production key 首次验收。
- 已执行数据库迁移，确认存在：
  - `payment_event`
  - `payment_refund`
  - `subscription_plan_change`
  - `payment_audit_log`
- 已执行 `pnpm rbac:init`，管理员拥有：
  - `admin.payments.write`
  - `admin.subscriptions.write`
- 已配置 provider webhook endpoint：
  - `/api/payment/notify/stripe`
  - `/api/payment/notify/paypal`
  - `/api/payment/notify/creem`
- Pricing 配置中的 provider plan/price/product id 必须稳定存在；缺失映射的套餐不得进入自动换套餐。
- 本地自动验证应先通过：
  - `pnpm verify:payment-lifecycle`
  - `pnpm check:deploy`

## 1. Checkout 安全验收

### 1.1 Metadata 覆盖攻击

步骤：

1. 登录测试用户 A。
2. 调用 checkout API，手动在请求 body 的 `metadata` 中传入伪造字段：
   - `order_no`
   - `user_id`
   - `app_name`
   - `customer_id`
   - `payment_email`
3. 完成支付或只检查创建出的 provider checkout payload。

期望：

- 本地订单使用服务端生成的 `order_no`。
- 本地订单 `user_id` 是当前登录用户 A。
- provider metadata 中的 server-owned 字段均为服务端值，不是请求中的伪造值。
- 非敏感自定义 metadata 可以保留。

### 1.2 显式 provider 严格匹配

步骤：

1. 保持默认 provider 为 Stripe。
2. 对一个只允许 Stripe 的套餐，请求 `payment_provider=paypal`。
3. 对一个未启用或不存在的 provider 发起 checkout。

期望：

- API 返回 provider 不支持或未配置错误。
- 不得 fallback 到默认 Stripe 创建 checkout。
- 本地不应出现错误 provider 的可支付订单。

### 1.3 重复订阅拦截

步骤：

1. 用户 A 购买一个订阅套餐并使本地订阅进入 `active` 或 `trialing`。
2. 用户 A 再次点击同一个订阅套餐。
3. 用户 A 点击另一个订阅套餐。

期望：

- 同套餐返回当前计划，不创建第二条订阅。
- 不同套餐进入换套餐流程，不创建新的独立订阅 checkout。
- 积分包仍允许购买。

## 2. PayPal 重点验收

PayPal 是本次最需要手动跑通的 provider。

### 2.1 PayPal 新订阅

步骤：

1. 使用 PayPal sandbox buyer 购买订阅套餐。
2. 等待 PayPal webhook 到达，必要时访问 callback。
3. 检查本地订单、订阅、积分。

期望：

- `order.status = paid`。
- `subscription.status = active` 或符合 PayPal sandbox 返回状态。
- `order.payment_provider = paypal`。
- `order.payment_session_id` 对应 PayPal subscription/order id。
- 只发放一次订阅 credits。
- `payment_event` 中事件状态为 `succeeded`，重复事件不会重复发放。

### 2.2 PayPal 取消订阅

步骤：

1. 在后台或用户侧取消 PayPal 订阅。
2. 等待 `BILLING.SUBSCRIPTION.CANCELLED` webhook。

期望：

- provider 订阅被取消。
- 本地订阅变为 `canceled` 或 `pending_cancel`，取决于操作类型。
- `payment_event` 记录成功。
- 不额外发放 credits。

### 2.3 PayPal 立即退款并取消

步骤：

1. 管理员进入 subscriptions 或 payments 后台。
2. 对一条 PayPal 已支付订阅执行“立即退款并取消”。
3. 检查 PayPal refund capture 结果。
4. 等待 `PAYMENT.CAPTURE.REFUNDED` webhook，可重复投递一次。

期望：

- `payment_refund` 产生一条 refund 记录。
- 原订单状态变为 `refunded`。
- 原 credit grant 的 `remaining_credits` 被清零且状态作废。
- 已消耗积分对应一条负向 active grant，允许余额变为负数。
- 重复 refund webhook 不会再次扣减积分。
- `payment_audit_log` 有管理员操作记录。

### 2.4 PayPal 退款后重新订阅同套餐

步骤：

1. 用户订阅 PayPal 套餐。
2. 管理员执行退款并取消。
3. 几天后同一用户重新购买同一个 PayPal 套餐。

期望：

- 退款取消后的订阅不再阻止新订阅。
- 新订单和新订阅可以正常创建。
- 新发 credits 会先体现在余额中；如果此前余额为负，业务消费时应表现为先抵扣负余额。
- 不得复活已退款订单的权益。

### 2.5 PayPal 升级 / 降级

升级步骤：

1. 用户持有 PayPal 低档订阅。
2. 点击高档订阅。
3. 按 PayPal revise subscription 流程完成授权。

升级期望：

- provider 订阅被 revise 到目标 plan。
- 本地订阅立即更新为高档套餐。
- 本周期只发放 credits 差额。
- `subscription_plan_change.status = applied` 或等待授权时为 `pending_provider_approval`。

降级步骤：

1. 用户持有 PayPal 高档订阅。
2. 点击低档订阅。
3. 等待下一个续订周期 webhook。

降级期望：

- 当前周期 credits 不被扣减。
- 本地记录 scheduled plan change。
- 下周期续订成功后，本地订阅变为低档套餐，并按低档套餐发放 credits。

## 3. Stripe 抽样验收

### 3.1 Stripe 一次性积分包

步骤：

1. 已订阅用户购买 Stripe 积分包。
2. 等待 `checkout.session.completed` webhook。
3. 重放同一个 webhook。

期望：

- 订单变为 `paid`。
- 积分包 credits 只发放一次。
- `payment_event` 第二次返回 duplicate success，不重复处理。

### 3.2 Stripe 退款

步骤：

1. 对 Stripe paid order 执行后台退款。
2. 等待 Stripe refund/charge refunded webhook。

期望：

- Stripe refund 成功。
- 本地 `payment_refund` 与 `order.status = refunded`。
- credits 回收规则与 PayPal 一致。

### 3.3 Stripe 换套餐

步骤：

1. active 订阅从低档升级高档。
2. active 订阅从高档降级低档。

期望：

- 升级使用 proration invoice 并立即生效。
- 降级当前周期不扣 credits，下周期按新套餐生效。
- 缺少 Stripe price id 时阻止自动换套餐，并给出明确错误。

## 4. Creem 抽样验收

Creem provider API 需要重点用 sandbox 核对真实 endpoint 行为。

### 4.1 Creem 新订阅和 webhook

步骤：

1. 使用 Creem sandbox 购买订阅。
2. 等待成功 webhook。

期望：

- 本地订单、订阅、credits 和 `payment_event` 均一致。
- provider event id 幂等生效。

### 4.2 Creem 退款和取消

步骤：

1. 对 Creem paid order 执行后台退款。
2. 对 Creem subscription 执行取消。

期望：

- Creem refund/cancel API 返回成功。
- 本地 refund ledger、order status、credit reversal、audit log 都正确。
- 如 sandbox endpoint 与实现不一致，记录实际响应并修正 provider 适配。

### 4.3 Creem 换套餐

步骤：

1. 低档升级高档。
2. 高档降级低档。

期望：

- upgrade/update endpoint 与 provider 文档一致。
- 本地 plan change 状态和 credits 差额处理正确。
- 缺少 Creem product id 时禁止自动换套餐。

## 5. Webhook 幂等与乱序验收

步骤：

1. 对同一 provider event id 重放 2 次以上。
2. 先投递 subscription update，再投递 payment success。
3. 投递合法但未识别事件。
4. 投递签名错误事件。

期望：

- 重复事件只处理一次，后续返回 200。
- 可恢复的乱序事件不重复发放 credits。
- 未识别但签名合法事件写入 `payment_event`，状态为 `ignored`，返回 200。
- 签名错误事件拒绝处理，不应写入成功 ledger，也不应改变订单/积分。

## 6. 数据库核查 SQL 要点

按实际数据库方言调整 SQL。

```sql
select provider, event_id, event_type, status, order_no, subscription_no, transaction_id
from payment_event
order by created_at desc;

select provider, refund_id, order_no, transaction_id, amount, currency, status, reversed_at
from payment_refund
order by created_at desc;

select subscription_no, provider, from_product_id, to_product_id, change_type, status, effective_at
from subscription_plan_change
order by created_at desc;

select order_no, transaction_no, transaction_type, transaction_scene, credits, remaining_credits, status
from credit
where order_no = '<ORDER_NO>'
order by created_at asc;
```

重点检查：

- 一个 provider event id 只有一条 `payment_event`。
- 一个 refund id 只有一条 `payment_refund`。
- refund 后原 grant 被作废，负向 adjustment 只出现一次。
- plan change 从 scheduled 到 applied 的状态流转符合预期。

## 7. 发布前最终检查

- `pnpm verify:payment-lifecycle` 通过。
- `pnpm check:deploy` 通过。
- D1 / 目标数据库 migration 已实际执行。
- `pnpm rbac:init` 已在目标环境执行。
- PayPal sandbox 全路径已通过。
- Stripe refund / subscription update 抽样通过。
- Creem refund / cancel / upgrade endpoint 已用真实 sandbox 响应确认。
- 管理员账号能看到并执行退款/取消/期末取消操作。
- 非管理员账号无法访问后台支付操作 API。
- 退款后用户侧余额、消费失败提示、后续充值抵扣表现符合预期。

## 8. 发现问题时记录

每次人工验收发现问题，请记录：

- Provider:
- Sandbox account:
- Local user id:
- Order no:
- Subscription no:
- Provider session/subscription/capture/refund id:
- Webhook event id:
- Expected:
- Actual:
- Related DB rows:
- Fix commit:
