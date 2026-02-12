# 修复卡住的订单

## 问题描述

当客户支付成功但订单状态卡在 `created` 状态时，会导致：
- ✅ 支付成功，收到钱
- ✅ 管理员后台能看到订单
- ❌ 用户界面看不到订单（因为只显示 `paid` 状态）
- ❌ 没有积分（因为只有状态变为 `paid` 时才创建积分）

**原因：** Webhook 通知处理失败，订单状态没有从 `created` 更新为 `paid`

## 解决方案

使用修复 API：`POST /api/admin/fix-stuck-orders`

### 步骤 1：预览模式（查看将要执行的操作）

```bash
curl -X POST https://你的域名/api/admin/fix-stuck-orders \
  -H "Content-Type: application/json" \
  -H "Cookie: 你的登录cookie" \
  -d '{
    "orderNos": [
      "787436407878743649865650607",
      "787436140690880697069880697"
    ],
    "dryRun": true
  }'
```

**响应示例：**
```json
{
  "dryRun": true,
  "timestamp": "2024-01-20T10:30:00.000Z",
  "orders": [
    {
      "orderNo": "787436407878743649865650607",
      "status": "dry-run",
      "currentStatus": "created",
      "userId": "25ebc-4fb2-86b7-ab2cde4b5617656d7a06",
      "userEmail": "admin@admin.com",
      "amount": 499,
      "currency": "usd",
      "creditsAmount": 200,
      "actions": [
        "Would update order status from created to PAID",
        "Would set paidAt to current time",
        "Would create credit record: 200 credits"
      ]
    }
  ]
}
```

### 步骤 2：实际修复

确认预览结果无误后，设置 `dryRun: false` 执行实际修复：

```bash
curl -X POST https://你的域名/api/admin/fix-stuck-orders \
  -H "Content-Type: application/json" \
  -H "Cookie: 你的登录cookie" \
  -d '{
    "orderNos": [
      "787436407878743649865650607",
      "787436140690880697069880697"
    ],
    "dryRun": false
  }'
```

**响应示例：**
```json
{
  "dryRun": false,
  "timestamp": "2024-01-20T10:35:00.000Z",
  "orders": [
    {
      "orderNo": "787436407878743649865650607",
      "status": "fixed",
      "currentStatus": "created",
      "userId": "25ebc-4fb2-86b7-ab2cde4b5617656d7a06",
      "amount": 499,
      "creditsAmount": 200,
      "actions": [
        "✓ Updated order status to PAID",
        "✓ Set paidAt to 2024-01-20T10:35:00.000Z",
        "✓ Created credit record: 200 credits (transaction: 1234567890)"
      ],
      "creditTransactionNo": "1234567890"
    }
  ]
}
```

## 使用浏览器

### 方法 1：使用开发者工具

1. 在浏览器中登录到您的应用
2. 打开开发者工具（F12）
3. 切换到 Console 标签
4. 粘贴以下代码：

```javascript
// 预览模式
fetch('/api/admin/fix-stuck-orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    orderNos: [
      '787436407878743649865650607',
      '787436140690880697069880697'
    ],
    dryRun: true  // 设为 false 以实际修复
  })
})
.then(r => r.json())
.then(console.log);
```

### 方法 2：使用 Postman 或类似工具

1. 创建一个 POST 请求到 `https://你的域名/api/admin/fix-stuck-orders`
2. 设置 Headers：
   - `Content-Type: application/json`
   - 添加登录 Cookie
3. 设置 Body (JSON):
   ```json
   {
     "orderNos": [
       "787436407878743649865650607",
       "787436140690880697069880697"
     ],
     "dryRun": true
   }
   ```

## 验证修复结果

修复后，检查：

1. **访问诊断页面** 查看订单状态：
   ```
   https://你的域名/api/admin/check-orders
   ```
   订单状态应该显示为 `PAID`

2. **让用户登录查看**：
   - 访问 `/settings/payments` 应该能看到订单
   - 访问 `/settings/credits` 应该能看到积分

## 安全说明

- ✅ API 需要用户登录才能访问
- ✅ 只更新 `CREATED` 状态的订单
- ✅ 如果订单已经是 `PAID` 状态，会自动跳过
- ✅ 如果积分已存在，不会重复创建
- ✅ 有详细的操作日志

## 当前需要修复的订单

根据您提供的数据，有 2 个订单需要修复：

```json
{
  "orderNos": [
    "787436407878743649865650607",
    "787436140690880697069880697"
  ],
  "dryRun": false
}
```

**订单信息：**
- User: admin@admin.com
- User ID: 25ebc-4fb2-86b7-ab2cde4b5617656d7a06
- 金额: 499 USD
- 积分: 200
- 当前状态: created → 需要改为 paid
