/**
 * Payment Diagnosis API
 * GET /api/admin/diagnose-payment
 *
 * This API helps diagnose payment issues by checking:
 * 1. Recent PAID orders and their userId
 * 2. Corresponding credit records
 * 3. User existence
 */

import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/core/db';
import { order, credit, user } from '@/config/db/schema';
import { OrderStatus } from '@/shared/models/order';
import { getUserInfo } from '@/shared/models/user';

export async function GET() {
  try {
    // Check if user is admin (optional - remove if you want to allow any user)
    const currentUser = await getUserInfo();
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const report: any = {
      timestamp: new Date().toISOString(),
      currentUser: {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name,
      },
      summary: {
        totalOrders: 0,
        paidOrders: 0,
        createdOrders: 0,
        pendingOrders: 0,
        failedOrders: 0,
      },
      orders: [],
    };

    // Get ALL recent orders (not just PAID) to diagnose the issue
    const paidOrders = await db()
      .select({
        orderNo: order.orderNo,
        userId: order.userId,
        userEmail: order.userEmail,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        creditsAmount: order.creditsAmount,
        paymentType: order.paymentType,
        paymentProvider: order.paymentProvider,
        paymentSessionId: order.paymentSessionId,
        transactionId: order.transactionId,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
      })
      .from(order)
      .orderBy(desc(order.createdAt))
      .limit(20);  // Increased to 20 to see more orders

    report.summary.totalOrders = paidOrders.length;

    // Count by status
    paidOrders.forEach((o) => {
      if (o.status === OrderStatus.PAID) report.summary.paidOrders++;
      else if (o.status === OrderStatus.CREATED) report.summary.createdOrders++;
      else if (o.status === OrderStatus.PENDING) report.summary.pendingOrders++;
      else if (o.status === OrderStatus.FAILED) report.summary.failedOrders++;
    });

    for (const o of paidOrders) {
      const orderReport: any = {
        orderNo: o.orderNo,
        userId: o.userId,
        userEmail: o.userEmail,
        status: o.status,
        amount: o.amount,
        currency: o.currency,
        creditsAmount: o.creditsAmount,
        paymentType: o.paymentType,
        paymentProvider: o.paymentProvider,
        paymentSessionId: o.paymentSessionId,
        transactionId: o.transactionId,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        issues: [],
        user: null,
        credits: [],
      };

      // Check issues
      if (!o.userId) {
        orderReport.issues.push('❌ CRITICAL: Order has no userId!');
      }

      // Check if order should be PAID but isn't
      if (o.status !== OrderStatus.PAID && o.paymentSessionId) {
        orderReport.issues.push(
          `⚠️ Order has payment session but status is ${o.status}, should check payment provider`
        );
      }

      // Check if user exists
      if (o.userId) {
        const [userRecord] = await db()
          .select({ id: user.id, email: user.email, name: user.name })
          .from(user)
          .where(eq(user.id, o.userId));

        if (userRecord) {
          orderReport.user = userRecord;
          orderReport.userMatches = userRecord.id === currentUser.id;
        } else {
          orderReport.issues.push(
            `❌ User NOT found in database! userId=${o.userId}`
          );
        }
      }

      // Check credit records
      if (o.userId) {
        const creditRecords = await db()
          .select({
            transactionNo: credit.transactionNo,
            userId: credit.userId,
            credits: credit.credits,
            remainingCredits: credit.remainingCredits,
            status: credit.status,
            orderNo: credit.orderNo,
          })
          .from(credit)
          .where(eq(credit.orderNo, o.orderNo));

        orderReport.credits = creditRecords;

        if (creditRecords.length === 0 && o.creditsAmount && o.creditsAmount > 0) {
          orderReport.issues.push(
            `❌ CRITICAL: Order should have ${o.creditsAmount} credits but no credit records found!`
          );
        }

        // Check if credit userId matches order userId
        creditRecords.forEach((c) => {
          if (c.userId !== o.userId) {
            orderReport.issues.push(
              `⚠️ Credit userId (${c.userId}) doesn't match order userId (${o.userId})`
            );
          }
        });
      }

      report.orders.push(orderReport);
    }

    return NextResponse.json(report, { status: 200 });
  } catch (error: any) {
    console.error('Diagnosis error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
