/**
 * Fix Stuck Orders API
 * POST /api/admin/fix-stuck-orders
 *
 * Fixes orders that are stuck in non-PAID status but payment was actually successful.
 * This happens when webhook notification failed or was not processed.
 *
 * Request body:
 * {
 *   "orderNos": ["787436407878743649865650607", "787436140690880697069880697"],
 *   "dryRun": true  // Set to false to actually fix the orders
 * }
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { PERMISSIONS } from '@/core/rbac';
import { db } from '@/core/db';
import { order, credit } from '@/config/db/schema';
import { OrderStatus } from '@/shared/models/order';
import { getUserInfo } from '@/shared/models/user';
import { hasPermission } from '@/shared/services/rbac';
import { getPaymentService, handleCheckoutSuccess } from '@/shared/services/payment';
import { PaymentStatus } from '@/extensions/payment/types';

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

    const isAdmin = await hasPermission(currentUser.id, PERMISSIONS.ADMIN_ACCESS);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
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

    const paymentService = await getPaymentService();

    for (const orderNo of orderNos) {
      const result: any = {
        orderNo,
        status: 'pending',
        actions: [],
        errors: [],
      };

      try {
        const [existingOrder] = await db()
          .select()
          .from(order)
          .where(eq(order.orderNo, orderNo))
          .limit(1);

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
        result.paymentProvider = existingOrder.paymentProvider;
        result.paymentSessionId = existingOrder.paymentSessionId;
        result.transactionId = existingOrder.transactionId;

        if (!existingOrder.paymentProvider) {
          result.status = 'error';
          result.errors.push('Order has no paymentProvider');
          results.orders.push(result);
          continue;
        }

        if (!existingOrder.paymentSessionId) {
          result.status = 'error';
          result.errors.push('Order has no paymentSessionId');
          results.orders.push(result);
          continue;
        }

        const provider = paymentService.getProvider(existingOrder.paymentProvider);
        if (!provider) {
          result.status = 'error';
          result.errors.push(
            `Payment provider not found: ${existingOrder.paymentProvider}`
          );
          results.orders.push(result);
          continue;
        }

        const session = await provider.getPaymentSession({
          sessionId: existingOrder.paymentSessionId,
        });
        result.remotePaymentStatus = session.paymentStatus;

        const [existingCredit] = await db()
          .select()
          .from(credit)
          .where(eq(credit.orderNo, orderNo));

        if (existingCredit) {
          result.warnings = [
            `Credit already exists for this order: ${existingCredit.transactionNo}`,
          ];
        }

        if (dryRun) {
          // Dry run mode - just report what would be done (and show provider status)
          result.status = 'dry-run';
          result.actions.push(
            `Would check provider session: ${existingOrder.paymentProvider} / ${existingOrder.paymentSessionId}`
          );
          result.actions.push(
            `Provider reports paymentStatus=${session.paymentStatus}`
          );
          if (session.paymentStatus === PaymentStatus.SUCCESS) {
            result.actions.push(
              `Would process order via handleCheckoutSuccess (current status: ${existingOrder.status})`
            );
          } else {
            result.actions.push('Would NOT update order because paymentStatus != success');
          }
        } else {
          if (session.paymentStatus !== PaymentStatus.SUCCESS) {
            result.status = 'skipped';
            result.actions.push(
              `Skipped: provider paymentStatus=${session.paymentStatus} (expected success)`
            );
            results.orders.push(result);
            continue;
          }

          await handleCheckoutSuccess({
            order: existingOrder,
            session,
          });

          const [updatedOrder] = await db()
            .select()
            .from(order)
            .where(eq(order.orderNo, orderNo))
            .limit(1);

          result.newStatus = updatedOrder?.status;

          const [updatedCredit] = await db()
            .select()
            .from(credit)
            .where(eq(credit.orderNo, orderNo))
            .limit(1);

          result.creditTransactionNo = updatedCredit?.transactionNo;
          result.actions.push('✓ Processed via handleCheckoutSuccess');
          result.status =
            updatedOrder?.status === OrderStatus.PAID ? 'fixed' : 'partial';
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
