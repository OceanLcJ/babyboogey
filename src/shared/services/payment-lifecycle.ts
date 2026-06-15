import { and, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { credit, order as orderTable, paymentRefund } from '@/config/db/schema';
import {
  PaymentEvent,
  PaymentEventType,
  PaymentProvider,
  PaymentSession,
  PaymentStatus,
  PaymentType,
} from '@/extensions/payment/types';
import { getUuid } from '@/shared/lib/hash';
import {
  CreditStatus,
  CreditTransactionScene,
  CreditTransactionType,
  NewCredit,
} from '@/shared/models/credit';
import {
  findOrderByInvoiceId,
  findOrderByOrderNo,
  findOrderByPaymentSessionId,
  findOrderByTransactionId,
  Order,
  OrderStatus,
} from '@/shared/models/order';
import {
  createPaymentAuditLog,
  createSubscriptionPlanChange,
  PaymentRefundStatus,
  SubscriptionPlanChangeStatus,
  SubscriptionPlanChangeType,
  upsertPaymentRefund,
} from '@/shared/models/payment-lifecycle';
import {
  Subscription,
  SubscriptionStatus,
  updateSubscriptionBySubscriptionNo,
} from '@/shared/models/subscription';

const SERVER_OWNED_METADATA_KEYS = new Set([
  'app_name',
  'order_no',
  'user_id',
  'customer_id',
  'customer_email',
  'payment_user_id',
  'payment_email',
  'payer_id',
  'subscriber_id',
]);

export interface PricingPlanSnapshot {
  productId: string;
  productName?: string;
  planName?: string;
  amount: number;
  currency: string;
  interval?: string;
  intervalCount?: number;
  creditsAmount?: number;
  creditsValidDays?: number;
  paymentProductId: string;
}

export function getSubscriptionCheckoutRouting({
  hasCurrentSubscription,
  currentProductId,
  targetProductId,
  paymentType,
}: {
  hasCurrentSubscription: boolean;
  currentProductId?: string | null;
  targetProductId: string;
  paymentType: PaymentType;
}): 'new_checkout' | 'current_plan' | 'change_plan' {
  if (paymentType !== PaymentType.SUBSCRIPTION || !hasCurrentSubscription) {
    return 'new_checkout';
  }

  if (currentProductId === targetProductId) {
    return 'current_plan';
  }

  return 'change_plan';
}

export function calculateRefundCreditReversal({
  grantedCredits,
  remainingCredits,
}: {
  grantedCredits: number;
  remainingCredits: number;
}) {
  const invalidatedCredits = Math.max(remainingCredits, 0);
  const negativeAdjustmentCredits = Math.max(
    Number(grantedCredits || 0) - invalidatedCredits,
    0
  );

  return {
    invalidatedCredits,
    negativeAdjustmentCredits,
  };
}

export function sanitizeClientPaymentMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  const sanitized: Record<string, UnsafeAny> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SERVER_OWNED_METADATA_KEYS.has(key)) {
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}

export function buildServerPaymentMetadata({
  appName,
  orderNo,
  userId,
  metadata,
}: {
  appName: string;
  orderNo: string;
  userId: string;
  metadata?: unknown;
}): Record<string, UnsafeAny> {
  return {
    ...sanitizeClientPaymentMetadata(metadata),
    app_name: appName,
    order_no: orderNo,
    user_id: userId,
  };
}

function normalizeCurrency(value?: string | null) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function metadataString(
  metadata: Record<string, UnsafeAny> | null | undefined
) {
  return metadata && typeof metadata === 'object' ? metadata : {};
}

export function collectPaymentSessionIdentifiers(session: PaymentSession) {
  const identifiers = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      identifiers.add(value.trim());
    }
  };

  add(session.paymentInfo?.transactionId);
  add(session.subscriptionId);
  add(session.paymentInfo?.invoiceId);
  add((session.paymentResult as UnsafeAny)?.id);
  add((session.paymentResult as UnsafeAny)?.checkout_id);
  add((session.paymentResult as UnsafeAny)?.checkout?.id);
  add((session.paymentResult as UnsafeAny)?.order?.id);
  add(
    (session.paymentResult as UnsafeAny)?.supplementary_data?.related_ids
      ?.order_id
  );
  add((session.subscriptionResult as UnsafeAny)?.id);
  add((session.refundInfo as UnsafeAny)?.paymentSessionId);

  return identifiers;
}

export function validatePaymentSessionForOrder({
  order,
  session,
}: {
  order: Order;
  session: PaymentSession;
}) {
  if (!session) {
    throw new Error('payment session is required');
  }

  if (order.paymentProvider && session.provider !== order.paymentProvider) {
    throw new Error('payment provider mismatch');
  }

  if (order.paymentSessionId) {
    const identifiers = collectPaymentSessionIdentifiers(session);
    if (!identifiers.has(order.paymentSessionId)) {
      throw new Error('payment session id mismatch');
    }
  }

  const metadata = metadataString(session.metadata);
  if (metadata.order_no && metadata.order_no !== order.orderNo) {
    throw new Error('order number mismatch');
  }

  if (metadata.user_id && metadata.user_id !== order.userId) {
    throw new Error('payment user mismatch');
  }

  if (
    session.paymentStatus === PaymentStatus.SUCCESS &&
    order.paymentType === PaymentType.SUBSCRIPTION &&
    (!session.subscriptionId || !session.subscriptionInfo)
  ) {
    throw new Error('subscription id or subscription info not found');
  }

  if (
    order.paymentType !== PaymentType.SUBSCRIPTION &&
    session.subscriptionInfo
  ) {
    throw new Error('payment type mismatch');
  }

  if (
    order.subscriptionId &&
    session.subscriptionId &&
    order.subscriptionId !== session.subscriptionId
  ) {
    throw new Error('subscription id mismatch');
  }

  if (session.paymentStatus === PaymentStatus.SUCCESS) {
    const paymentInfo = session.paymentInfo;
    if (!paymentInfo) {
      throw new Error('payment info not found');
    }

    const paymentAmount = Number(paymentInfo.paymentAmount ?? 0);
    const discountAmount = Number(paymentInfo.discountAmount ?? 0);
    if (paymentAmount + discountAmount < Number(order.amount || 0)) {
      throw new Error('payment amount mismatch');
    }

    if (
      normalizeCurrency(paymentInfo.paymentCurrency) !==
      normalizeCurrency(order.currency)
    ) {
      throw new Error('payment currency mismatch');
    }
  }

  const providerProductId = String(order.paymentProductId || '').trim();
  if (providerProductId && session.subscriptionInfo) {
    const sessionProductIds = [
      session.subscriptionInfo.productId,
      session.subscriptionInfo.planId,
    ]
      .filter(Boolean)
      .map((value) => String(value));

    if (
      sessionProductIds.length > 0 &&
      !sessionProductIds.includes(providerProductId)
    ) {
      throw new Error('payment product mismatch');
    }
  }
}

export function buildPaymentEventLedgerKey({
  provider,
  event,
}: {
  provider: string;
  event: PaymentEvent;
}) {
  const result = event.eventResult as UnsafeAny;
  const session = event.paymentSession;
  const refundInfo = session?.refundInfo;
  const resourceId =
    event.resourceId ||
    result?.resource?.id ||
    result?.data?.object?.id ||
    refundInfo?.refundId ||
    session?.paymentInfo?.transactionId ||
    session?.subscriptionId ||
    'unknown-resource';

  const eventId =
    event.eventId ||
    result?.id ||
    result?.event_id ||
    `${provider}:${event.eventType}:${resourceId}`;

  return {
    eventId: String(eventId),
    resourceId: resourceId ? String(resourceId) : undefined,
  };
}

async function findOrderForRefund({
  provider,
  refundInfo,
}: {
  provider: string;
  refundInfo: NonNullable<PaymentSession['refundInfo']>;
}) {
  if (refundInfo.orderNo) {
    const order = await findOrderByOrderNo(refundInfo.orderNo);
    if (order) return order;
  }

  if (refundInfo.paymentSessionId) {
    const order = await findOrderByPaymentSessionId({
      paymentSessionId: refundInfo.paymentSessionId,
      paymentProvider: provider,
    });
    if (order) return order;
  }

  if (refundInfo.paymentTransactionId) {
    const order = await findOrderByTransactionId({
      transactionId: refundInfo.paymentTransactionId,
      paymentProvider: provider,
    });
    if (order) return order;
  }

  if (refundInfo.invoiceId) {
    const order = await findOrderByInvoiceId({
      invoiceId: refundInfo.invoiceId,
      paymentProvider: provider,
    });
    if (order) return order;
  }
}

export async function applyRefundReversal({
  order,
  provider,
  refundId,
  amount,
  currency,
  reason,
  transactionId,
  metadata,
}: {
  order: Order;
  provider: string;
  refundId: string;
  amount?: number;
  currency?: string;
  reason?: string;
  transactionId?: string;
  metadata?: Record<string, UnsafeAny>;
}) {
  const { refund } = await upsertPaymentRefund({
    id: getUuid(),
    provider,
    refundId,
    orderNo: order.orderNo,
    transactionId,
    amount,
    currency,
    status: PaymentRefundStatus.SUCCEEDED,
    reason,
    metadata: metadata ? JSON.stringify(metadata) : undefined,
  });

  if (refund.reversedAt) {
    return { order, refund, reversed: false };
  }

  const reversedAt = new Date();
  const reversalTransactionNo = `refund:${provider}:${refundId}`;

  await db().transaction(async (tx: UnsafeAny) => {
    const [grant] = await tx
      .select()
      .from(credit)
      .where(
        and(
          eq(credit.orderNo, order.orderNo),
          eq(credit.transactionType, CreditTransactionType.GRANT)
        )
      )
      .limit(1)
      .for('update');

    let consumedCredits = 0;

    if (grant) {
      const reversal = calculateRefundCreditReversal({
        grantedCredits: Number(grant.credits || 0),
        remainingCredits: Number(grant.remainingCredits || 0),
      });
      consumedCredits = reversal.negativeAdjustmentCredits;

      await tx
        .update(credit)
        .set({
          remainingCredits: 0,
          status: CreditStatus.DELETED,
          metadata: JSON.stringify({
            ...(grant.metadata ? safeJsonParse(grant.metadata) : {}),
            refundId,
            refundProvider: provider,
            invalidatedAt: reversedAt.toISOString(),
          }),
        })
        .where(eq(credit.id, grant.id));
    }

    if (consumedCredits > 0) {
      const [existingNegative] = await tx
        .select()
        .from(credit)
        .where(eq(credit.transactionNo, reversalTransactionNo))
        .limit(1);

      if (!existingNegative) {
        const negativeAdjustment: NewCredit = {
          id: getUuid(),
          userId: order.userId,
          userEmail: order.userEmail,
          orderNo: order.orderNo,
          subscriptionNo: order.subscriptionNo || '',
          transactionNo: reversalTransactionNo,
          transactionType: CreditTransactionType.GRANT,
          transactionScene: CreditTransactionScene.REFUND,
          credits: -consumedCredits,
          remainingCredits: -consumedCredits,
          description: `Refund reversal for order ${order.orderNo}`,
          status: CreditStatus.ACTIVE,
          metadata: JSON.stringify({
            refundId,
            refundProvider: provider,
            originalCredits: grant?.credits || 0,
          }),
        };

        await tx.insert(credit).values(negativeAdjustment);
      }
    }

    await tx
      .update(orderTable)
      .set({
        status: OrderStatus.REFUNDED,
      })
      .where(eq(orderTable.orderNo, order.orderNo));

    await tx
      .update(paymentRefund)
      .set({
        reversedAt,
        status: PaymentRefundStatus.SUCCEEDED,
      })
      .where(eq(paymentRefund.id, refund.id));
  });

  return { order, refund, reversed: true };
}

export async function handlePaymentRefunded({
  provider,
  session,
}: {
  provider: string;
  session: PaymentSession;
}) {
  const refundInfo = session.refundInfo;
  if (!refundInfo?.refundId) {
    throw new Error('refund info not found');
  }

  const order = await findOrderForRefund({ provider, refundInfo });
  if (!order) {
    throw new Error('refunded order not found');
  }

  return applyRefundReversal({
    order,
    provider,
    refundId: refundInfo.refundId,
    amount: refundInfo.amount,
    currency: refundInfo.currency,
    reason: refundInfo.reason,
    transactionId: refundInfo.paymentTransactionId,
    metadata: {
      ...(refundInfo.metadata || {}),
      source: PaymentEventType.PAYMENT_REFUNDED,
    },
  });
}

export async function refundOrderWithProvider({
  order,
  provider,
  reason,
  actorUserId,
}: {
  order: Order;
  provider: PaymentProvider;
  reason?: string;
  actorUserId?: string;
}) {
  if (!provider.refundPayment) {
    throw new Error(
      `payment provider ${provider.name} does not support refunds`
    );
  }

  if (order.status !== OrderStatus.PAID) {
    throw new Error('only paid orders can be refunded');
  }

  const refundResult = await provider.refundPayment({
    paymentSessionId: order.paymentSessionId || undefined,
    transactionId: order.transactionId || undefined,
    invoiceId: order.invoiceId || undefined,
    amount: order.paymentAmount || order.amount,
    currency: order.paymentCurrency || order.currency,
    reason,
    metadata: {
      order_no: order.orderNo,
      user_id: order.userId,
    },
  });

  const result = await applyRefundReversal({
    order,
    provider: provider.name,
    refundId: refundResult.refundInfo.refundId,
    amount: refundResult.refundInfo.amount,
    currency: refundResult.refundInfo.currency,
    reason,
    transactionId:
      refundResult.refundInfo.paymentTransactionId || order.transactionId || '',
    metadata: {
      source: 'admin',
      providerResult: refundResult.refundResult,
    },
  });

  await createPaymentAuditLog({
    id: getUuid(),
    actorUserId,
    action: 'refund_order',
    targetType: 'order',
    targetId: order.orderNo,
    provider: provider.name,
    payload: JSON.stringify({ reason }),
  });

  return result;
}

export function classifyPlanChange({
  subscription,
  target,
}: {
  subscription: Subscription;
  target: PricingPlanSnapshot;
}) {
  const currentCredits = Number(subscription.creditsAmount || 0);
  const targetCredits = Number(target.creditsAmount || 0);
  if (targetCredits >= currentCredits) {
    return SubscriptionPlanChangeType.UPGRADE;
  }
  return SubscriptionPlanChangeType.DOWNGRADE;
}

export async function changeSubscriptionPlanWithProvider({
  subscription,
  target,
  provider,
  actorUserId,
}: {
  subscription: Subscription;
  target: PricingPlanSnapshot;
  provider: PaymentProvider;
  actorUserId?: string;
}) {
  if (!subscription.subscriptionId) {
    throw new Error('subscription has no provider subscription id');
  }

  if (!target.paymentProductId) {
    throw new Error('missing provider plan/price/product mapping');
  }

  if (!provider.changeSubscriptionPlan) {
    throw new Error(
      `payment provider ${provider.name} does not support plan changes`
    );
  }

  if (
    subscription.status !== SubscriptionStatus.ACTIVE &&
    subscription.status !== SubscriptionStatus.TRIALING
  ) {
    throw new Error('subscription is not active or trialing');
  }

  if (subscription.productId === target.productId) {
    return {
      status: SubscriptionPlanChangeStatus.APPLIED,
      approvalUrl: undefined,
      changeType: SubscriptionPlanChangeType.UPGRADE,
      changed: false,
    };
  }

  const changeType = classifyPlanChange({ subscription, target });
  const providerResult = await provider.changeSubscriptionPlan({
    subscriptionId: subscription.subscriptionId,
    providerPlanId: target.paymentProductId,
    changeType,
  });

  const isProviderApplied = providerResult.status === 'applied';
  const isUpgrade = changeType === SubscriptionPlanChangeType.UPGRADE;
  const effectiveAt =
    isUpgrade && isProviderApplied
      ? new Date()
      : subscription.currentPeriodEnd || new Date();
  const status =
    providerResult.status === 'pending_provider_approval'
      ? SubscriptionPlanChangeStatus.PENDING_PROVIDER_APPROVAL
      : isUpgrade && isProviderApplied
        ? SubscriptionPlanChangeStatus.APPLIED
        : SubscriptionPlanChangeStatus.SCHEDULED;

  const planChange = await createSubscriptionPlanChange({
    id: getUuid(),
    subscriptionNo: subscription.subscriptionNo,
    userId: subscription.userId,
    provider: provider.name,
    providerSubscriptionId: subscription.subscriptionId,
    fromProductId: subscription.productId || '',
    toProductId: target.productId,
    fromPaymentProductId: subscription.paymentProductId || '',
    toPaymentProductId: target.paymentProductId,
    changeType,
    status,
    approvalUrl: providerResult.approvalUrl,
    effectiveAt,
    metadata: JSON.stringify({ target, providerResult: providerResult.result }),
  });

  if (isUpgrade && isProviderApplied) {
    await updateSubscriptionBySubscriptionNo(subscription.subscriptionNo, {
      productId: target.productId,
      productName: target.productName,
      planName: target.planName,
      amount: target.amount,
      currency: target.currency,
      interval: target.interval,
      intervalCount: target.intervalCount,
      creditsAmount: target.creditsAmount,
      creditsValidDays: target.creditsValidDays,
      paymentProductId: target.paymentProductId,
    });

    const creditDiff =
      Number(target.creditsAmount || 0) -
      Number(subscription.creditsAmount || 0);
    if (creditDiff > 0) {
      await db()
        .insert(credit)
        .values({
          id: getUuid(),
          userId: subscription.userId,
          userEmail: subscription.userEmail,
          orderNo: '',
          subscriptionNo: subscription.subscriptionNo,
          transactionNo: `plan_change:${planChange.id}`,
          transactionType: CreditTransactionType.GRANT,
          transactionScene: CreditTransactionScene.SUBSCRIPTION,
          credits: creditDiff,
          remainingCredits: creditDiff,
          description: `Plan upgrade credit difference`,
          expiresAt: subscription.currentPeriodEnd,
          status: CreditStatus.ACTIVE,
          metadata: JSON.stringify({ planChangeId: planChange.id }),
        });
    }
  }

  await createPaymentAuditLog({
    id: getUuid(),
    actorUserId,
    action: `subscription_${changeType}`,
    targetType: 'subscription',
    targetId: subscription.subscriptionNo,
    provider: provider.name,
    payload: JSON.stringify({ targetProductId: target.productId, status }),
  });

  return {
    status,
    approvalUrl: providerResult.approvalUrl,
    changeType,
    changed: true,
  };
}

export function safeJsonParse(value: string): Record<string, UnsafeAny> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
