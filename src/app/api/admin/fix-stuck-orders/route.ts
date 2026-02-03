/**
 * Fix Stuck Orders API
 * POST /api/admin/fix-stuck-orders
 *
 * Fixes orders that are stuck in CREATED status but payment was actually successful.
 * This happens when webhook notification failed or was not processed.
 *
 * Request body:
 * {
 *   "orderNos": ["787436407878743649865650607", "787436140690880697069880697"],
 *   "dryRun": true  // Set to false to actually fix the orders
 * }
 */

import { eq, and } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/core/db';
import { order, credit } from '@/config/db/schema';
import { OrderStatus } from '@/shared/models/order';
import { CreditStatus, CreditTransactionType, CreditTransactionScene } from '@/shared/models/credit';
import { PaymentType } from '@/extensions/payment/types';
import { getUserInfo } from '@/shared/models/user';
import { getUuid, getSnowId } from '@/shared/lib/hash';
import { calculateCreditExpirationTime } from '@/shared/models/credit';

export async function POST(req: Request) {
  try {
    // Check if user is admin
    const currentUser = await getUserInfo();
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { orderNos, dryRun = true } = body;

    if (!orderNos || !Array.isArray(orderNos) || orderNos.length === 0) {
      return NextResponse.json(
        { error: 'orderNos array is required' },
        { status: 400 }
      );
    }

    const results = {
      dryRun,
      timestamp: new Date().toISOString(),
      orders: [] as any[],
    };

    for (const orderNo of orderNos) {
      const result: any = {
        orderNo,
        status: 'pending',
        actions: [],
        errors: [],
      };

      try {
        // Get the order
        const [existingOrder] = await db()
          .select()
          .from(order)
          .where(eq(order.orderNo, orderNo));

        if (!existingOrder) {
          result.status = 'error';
          result.errors.push('Order not found');
          results.orders.push(result);
          continue;
        }

        result.currentStatus = existingOrder.status;
        result.userId = existingOrder.userId;
        result.userEmail = existingOrder.userEmail;
        result.amount = existingOrder.amount;
        result.currency = existingOrder.currency;
        result.creditsAmount = existingOrder.creditsAmount;

        // Check if already paid
        if (existingOrder.status === OrderStatus.PAID) {
          result.status = 'skipped';
          result.actions.push('Order is already PAID, no action needed');
          results.orders.push(result);
          continue;
        }

        // Check if order is in CREATED status
        if (existingOrder.status !== OrderStatus.CREATED) {
          result.status = 'error';
          result.errors.push(`Order status is ${existingOrder.status}, expected CREATED`);
          results.orders.push(result);
          continue;
        }

        // Check if userId exists
        if (!existingOrder.userId) {
          result.status = 'error';
          result.errors.push('Order has no userId, cannot fix');
          results.orders.push(result);
          continue;
        }

        // Check if credit already exists
        const [existingCredit] = await db()
          .select()
          .from(credit)
          .where(eq(credit.orderNo, orderNo));

        if (existingCredit) {
          result.warnings = [`Credit already exists for this order: ${existingCredit.transactionNo}`];
        }

        if (dryRun) {
          // Dry run mode - just report what would be done
          result.status = 'dry-run';
          result.actions.push(`Would update order status from ${existingOrder.status} to PAID`);
          result.actions.push(`Would set paidAt to current time`);

          if (existingOrder.creditsAmount && existingOrder.creditsAmount > 0 && !existingCredit) {
            result.actions.push(`Would create credit record: ${existingOrder.creditsAmount} credits`);
          }
        } else {
          // Actually fix the order
          const currentTime = new Date();

          // Update order status to PAID
          await db()
            .update(order)
            .set({
              status: OrderStatus.PAID,
              paidAt: currentTime,
            })
            .where(eq(order.orderNo, orderNo));

          result.actions.push(`✓ Updated order status to PAID`);
          result.actions.push(`✓ Set paidAt to ${currentTime.toISOString()}`);

          // Create credit if needed and doesn't already exist
          if (existingOrder.creditsAmount && existingOrder.creditsAmount > 0 && !existingCredit) {
            const credits = existingOrder.creditsAmount;

            // Calculate expiration time
            const expiresAt = calculateCreditExpirationTime({
              creditsValidDays: existingOrder.creditsValidDays || 0,
              currentPeriodEnd: undefined, // Not a subscription
            });

            const newCredit = {
              id: getUuid(),
              userId: existingOrder.userId,
              userEmail: existingOrder.userEmail,
              orderNo: existingOrder.orderNo,
              subscriptionNo: existingOrder.subscriptionNo || null,
              transactionNo: getSnowId(),
              transactionType: CreditTransactionType.GRANT,
              transactionScene:
                existingOrder.paymentType === PaymentType.SUBSCRIPTION
                  ? CreditTransactionScene.SUBSCRIPTION
                  : CreditTransactionScene.PAYMENT,
              credits: credits,
              remainingCredits: credits,
              description: `Grant credit (manual fix for order ${orderNo})`,
              expiresAt: expiresAt,
              status: CreditStatus.ACTIVE,
            };

            await db()
              .insert(credit)
              .values(newCredit);

            result.actions.push(`✓ Created credit record: ${credits} credits (transaction: ${newCredit.transactionNo})`);
            result.creditTransactionNo = newCredit.transactionNo;
          }

          result.status = 'fixed';
        }
      } catch (error: any) {
        result.status = 'error';
        result.errors.push(error.message);
      }

      results.orders.push(result);
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error: any) {
    console.error('Fix stuck orders error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
