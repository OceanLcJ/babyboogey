/**
 * Simple Order Check API
 * GET /api/admin/check-orders
 *
 * Returns a simple HTML page showing recent orders for easy viewing
 */

import { desc } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/core/db';
import { order, credit } from '@/config/db/schema';
import { getUserInfo } from '@/shared/models/user';

export async function GET() {
  try {
    // Check if user is logged in
    const currentUser = await getUserInfo();
    if (!currentUser) {
      return new Response('Unauthorized - Please log in first', {
        status: 401,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    // Get recent orders
    const orders = await db()
      .select({
        orderNo: order.orderNo,
        userId: order.userId,
        userEmail: order.userEmail,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        creditsAmount: order.creditsAmount,
        paymentProvider: order.paymentProvider,
        paymentSessionId: order.paymentSessionId,
        transactionId: order.transactionId,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
      })
      .from(order)
      .orderBy(desc(order.createdAt))
      .limit(20);

    // Build HTML report
    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>订单诊断报告</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      border-bottom: 3px solid #007bff;
      padding-bottom: 10px;
    }
    h2 {
      color: #666;
      margin-top: 30px;
    }
    .info {
      background: #e3f2fd;
      padding: 15px;
      border-radius: 4px;
      margin: 20px 0;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .stat {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 4px;
      text-align: center;
      border-left: 4px solid #007bff;
    }
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #007bff;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    }
    .order {
      border: 1px solid #dee2e6;
      padding: 20px;
      margin: 15px 0;
      border-radius: 4px;
      background: #fafafa;
    }
    .order-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .order-no {
      font-size: 18px;
      font-weight: bold;
      color: #333;
    }
    .status {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .status-paid { background: #d4edda; color: #155724; }
    .status-created { background: #fff3cd; color: #856404; }
    .status-pending { background: #cce5ff; color: #004085; }
    .status-failed { background: #f8d7da; color: #721c24; }
    .field {
      display: flex;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .field:last-child {
      border-bottom: none;
    }
    .field-label {
      width: 180px;
      font-weight: 600;
      color: #666;
    }
    .field-value {
      flex: 1;
      color: #333;
    }
    .critical {
      background: #f8d7da;
      color: #721c24;
      padding: 10px;
      border-radius: 4px;
      margin: 10px 0;
      border-left: 4px solid #dc3545;
    }
    .warning {
      background: #fff3cd;
      color: #856404;
      padding: 10px;
      border-radius: 4px;
      margin: 10px 0;
      border-left: 4px solid #ffc107;
    }
    .success {
      background: #d4edda;
      color: #155724;
      padding: 10px;
      border-radius: 4px;
      margin: 10px 0;
      border-left: 4px solid #28a745;
    }
    .empty {
      color: #999;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 订单诊断报告</h1>

    <div class="info">
      <strong>当前登录用户:</strong> ${currentUser.email} (ID: ${currentUser.id})<br>
      <strong>生成时间:</strong> ${new Date().toLocaleString('zh-CN')}
    </div>

    <h2>📈 订单统计</h2>
    <div class="summary">
      <div class="stat">
        <div class="stat-value">${orders.length}</div>
        <div class="stat-label">总订单数</div>
      </div>
      <div class="stat">
        <div class="stat-value">${orders.filter(o => o.status === 'paid').length}</div>
        <div class="stat-label">已支付</div>
      </div>
      <div class="stat">
        <div class="stat-value">${orders.filter(o => o.status === 'created').length}</div>
        <div class="stat-label">已创建</div>
      </div>
      <div class="stat">
        <div class="stat-value">${orders.filter(o => o.status === 'pending').length}</div>
        <div class="stat-label">待处理</div>
      </div>
      <div class="stat">
        <div class="stat-value">${orders.filter(o => o.status === 'failed').length}</div>
        <div class="stat-label">失败</div>
      </div>
    </div>

    <h2>📦 最近 20 个订单</h2>
`;

    if (orders.length === 0) {
      html += '<div class="critical">⚠️ 数据库中没有找到任何订单！</div>';
    }

    for (const o of orders) {
      let statusClass = 'status-pending';
      if (o.status === 'paid') statusClass = 'status-paid';
      else if (o.status === 'created') statusClass = 'status-created';
      else if (o.status === 'failed') statusClass = 'status-failed';

      html += `
    <div class="order">
      <div class="order-header">
        <div class="order-no">订单 ${o.orderNo}</div>
        <div class="status ${statusClass}">${o.status}</div>
      </div>
`;

      // Check for issues
      const issues = [];
      if (!o.userId) {
        issues.push('❌ 严重：订单没有 userId！');
      }
      if (o.status !== 'paid' && o.paymentSessionId) {
        issues.push(`⚠️ 有支付会话但状态是 ${o.status}，可能支付未完成或webhook未触发`);
      }
      if (o.userId !== currentUser.id) {
        issues.push(`ℹ️ 此订单属于其他用户 (userId: ${o.userId || '无'})`);
      }

      if (issues.length > 0) {
        issues.forEach(issue => {
          const issueClass = issue.startsWith('❌') ? 'critical' :
                           issue.startsWith('⚠️') ? 'warning' : 'success';
          html += `<div class="${issueClass}">${issue}</div>`;
        });
      }

      html += `
      <div class="field">
        <div class="field-label">用户 ID:</div>
        <div class="field-value">${o.userId || '<span class="empty">空</span>'}</div>
      </div>
      <div class="field">
        <div class="field-label">用户邮箱:</div>
        <div class="field-value">${o.userEmail || '<span class="empty">空</span>'}</div>
      </div>
      <div class="field">
        <div class="field-label">金额:</div>
        <div class="field-value">${o.amount} ${o.currency}</div>
      </div>
      <div class="field">
        <div class="field-label">积分数量:</div>
        <div class="field-value">${o.creditsAmount || 0}</div>
      </div>
      <div class="field">
        <div class="field-label">支付方式:</div>
        <div class="field-value">${o.paymentProvider || '<span class="empty">空</span>'}</div>
      </div>
      <div class="field">
        <div class="field-label">支付会话 ID:</div>
        <div class="field-value">${o.paymentSessionId || '<span class="empty">空</span>'}</div>
      </div>
      <div class="field">
        <div class="field-label">交易 ID:</div>
        <div class="field-value">${o.transactionId || '<span class="empty">空</span>'}</div>
      </div>
      <div class="field">
        <div class="field-label">创建时间:</div>
        <div class="field-value">${o.createdAt ? new Date(o.createdAt).toLocaleString('zh-CN') : '未知'}</div>
      </div>
      <div class="field">
        <div class="field-label">支付时间:</div>
        <div class="field-value">${o.paidAt ? new Date(o.paidAt).toLocaleString('zh-CN') : '<span class="empty">未支付</span>'}</div>
      </div>
    </div>
`;
    }

    html += `
  </div>
</body>
</html>
`;

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error: any) {
    console.error('Check orders error:', error);
    return new Response(`Error: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
