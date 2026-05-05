import { PERMISSIONS, getCurrentUserWithPermission } from '@/core/rbac';
import { getUuid } from '@/shared/lib/hash';
import { respData, respErr } from '@/shared/lib/resp';
import { findLatestPaidOrderBySubscriptionNo } from '@/shared/models/order';
import { createPaymentAuditLog } from '@/shared/models/payment-lifecycle';
import {
  SubscriptionStatus,
  findSubscriptionBySubscriptionNo,
  updateSubscriptionBySubscriptionNo,
} from '@/shared/models/subscription';
import { getPaymentService } from '@/shared/services/payment';
import { refundOrderWithProvider } from '@/shared/services/payment-lifecycle';

const ALLOWED_ACTIONS = new Set([
  'cancel',
  'refund_cancel_now',
  'cancel_at_period_end',
]);

export async function POST(req: Request) {
  try {
    const adminUser = await getCurrentUserWithPermission({
      code: PERMISSIONS.SUBSCRIPTIONS_WRITE,
    });
    if (!adminUser) {
      return Response.json({ message: 'permission denied' }, { status: 403 });
    }

    const { subscriptionNo, action, reason } = await req.json();
    if (!subscriptionNo || !action || !ALLOWED_ACTIONS.has(action)) {
      return respErr('invalid subscription action');
    }

    const subscription =
      await findSubscriptionBySubscriptionNo(subscriptionNo);
    if (!subscription) {
      return respErr('subscription not found');
    }

    if (!subscription.paymentProvider || !subscription.subscriptionId) {
      return respErr('subscription has no payment provider id');
    }

    const paymentService = await getPaymentService();
    const provider = paymentService.getProvider(subscription.paymentProvider);
    if (!provider || provider.name !== subscription.paymentProvider) {
      return respErr('payment provider not configured');
    }
    if (!provider.cancelSubscription) {
      return respErr('payment provider does not support subscription cancel');
    }

    const cancelAtPeriodEnd = action === 'cancel_at_period_end';
    const session = await provider.cancelSubscription({
      subscriptionId: subscription.subscriptionId,
      cancelAtPeriodEnd,
      reason,
    });

    await updateSubscriptionBySubscriptionNo(subscription.subscriptionNo, {
      status: cancelAtPeriodEnd
        ? SubscriptionStatus.PENDING_CANCEL
        : SubscriptionStatus.CANCELED,
      canceledAt: session.subscriptionInfo?.canceledAt || new Date(),
      canceledEndAt:
        session.subscriptionInfo?.canceledEndAt ||
        (cancelAtPeriodEnd ? subscription.currentPeriodEnd : new Date()),
      canceledReason: reason || session.subscriptionInfo?.canceledReason || '',
      canceledReasonType:
        session.subscriptionInfo?.canceledReasonType || 'admin',
    });

    let refundResult:
      | Awaited<ReturnType<typeof refundOrderWithProvider>>
      | undefined;
    if (action === 'refund_cancel_now') {
      const latestOrder = await findLatestPaidOrderBySubscriptionNo(
        subscription.subscriptionNo
      );
      if (!latestOrder) {
        return respErr('paid subscription order not found');
      }
      refundResult = await refundOrderWithProvider({
        order: latestOrder,
        provider,
        reason,
        actorUserId: adminUser.id,
      });
    }

    await createPaymentAuditLog({
      id: getUuid(),
      actorUserId: adminUser.id,
      action,
      targetType: 'subscription',
      targetId: subscription.subscriptionNo,
      provider: provider.name,
      payload: JSON.stringify({ reason }),
    });

    return respData({
      action,
      subscriptionNo: subscription.subscriptionNo,
      refunded: Boolean(refundResult),
    });
  } catch (error: UnsafeAny) {
    console.error('admin subscription action failed:', error);
    return respErr(error.message || 'admin subscription action failed');
  }
}
