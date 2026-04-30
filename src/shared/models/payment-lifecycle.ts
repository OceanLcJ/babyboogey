import { and, desc, eq } from 'drizzle-orm';

import {
  paymentAuditLog,
  paymentEvent,
  paymentRefund,
  subscriptionPlanChange,
} from '@/config/db/schema';
import { db } from '@/core/db';
import { getUuid } from '@/shared/lib/hash';

export type PaymentEventLedger = typeof paymentEvent.$inferSelect;
export type NewPaymentEventLedger = typeof paymentEvent.$inferInsert;
export type UpdatePaymentEventLedger = Partial<
  Omit<NewPaymentEventLedger, 'id' | 'provider' | 'eventId' | 'createdAt'>
>;

export type PaymentRefund = typeof paymentRefund.$inferSelect;
export type NewPaymentRefund = typeof paymentRefund.$inferInsert;
export type UpdatePaymentRefund = Partial<
  Omit<NewPaymentRefund, 'id' | 'provider' | 'refundId' | 'createdAt'>
>;

export type SubscriptionPlanChange =
  typeof subscriptionPlanChange.$inferSelect;
export type NewSubscriptionPlanChange =
  typeof subscriptionPlanChange.$inferInsert;
export type UpdateSubscriptionPlanChange = Partial<
  Omit<NewSubscriptionPlanChange, 'id' | 'createdAt'>
>;

export type NewPaymentAuditLog = typeof paymentAuditLog.$inferInsert;

export enum PaymentEventLedgerStatus {
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  IGNORED = 'ignored',
  FAILED = 'failed',
}

export enum PaymentRefundStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

export enum SubscriptionPlanChangeType {
  UPGRADE = 'upgrade',
  DOWNGRADE = 'downgrade',
}

export enum SubscriptionPlanChangeStatus {
  APPLIED = 'applied',
  PENDING_PROVIDER_APPROVAL = 'pending_provider_approval',
  SCHEDULED = 'scheduled',
  FAILED = 'failed',
}

function isDuplicateKeyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|duplicate|constraint/i.test(message);
}

export async function findPaymentEventByProviderEventId({
  provider,
  eventId,
}: {
  provider: string;
  eventId: string;
}) {
  const [result] = await db()
    .select()
    .from(paymentEvent)
    .where(
      and(eq(paymentEvent.provider, provider), eq(paymentEvent.eventId, eventId))
    )
    .limit(1);

  return result;
}

export async function beginPaymentEvent({
  provider,
  eventId,
  eventType,
  resourceId,
  payload,
}: {
  provider: string;
  eventId: string;
  eventType: string;
  resourceId?: string;
  payload?: string;
}): Promise<{ event: PaymentEventLedger; duplicate: boolean }> {
  const newEvent: NewPaymentEventLedger = {
    id: getUuid(),
    provider,
    eventId,
    eventType,
    resourceId,
    status: PaymentEventLedgerStatus.PROCESSING,
    payload,
  };

  try {
    const [result] = await db().insert(paymentEvent).values(newEvent).returning();
    return { event: result || newEvent, duplicate: false };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const existing = await findPaymentEventByProviderEventId({
      provider,
      eventId,
    });
    if (!existing) {
      throw error;
    }

    return { event: existing, duplicate: true };
  }
}

export async function updatePaymentEvent(
  id: string,
  updateEvent: UpdatePaymentEventLedger
) {
  const [result] = await db()
    .update(paymentEvent)
    .set(updateEvent)
    .where(eq(paymentEvent.id, id))
    .returning();

  return result;
}

export async function findPaymentRefundByProviderRefundId({
  provider,
  refundId,
}: {
  provider: string;
  refundId: string;
}) {
  const [result] = await db()
    .select()
    .from(paymentRefund)
    .where(
      and(
        eq(paymentRefund.provider, provider),
        eq(paymentRefund.refundId, refundId)
      )
    )
    .limit(1);

  return result;
}

export async function upsertPaymentRefund(
  newRefund: NewPaymentRefund
): Promise<{ refund: PaymentRefund; duplicate: boolean }> {
  try {
    const [result] = await db()
      .insert(paymentRefund)
      .values(newRefund)
      .returning();
    return { refund: result || newRefund, duplicate: false };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const existing = await findPaymentRefundByProviderRefundId({
      provider: newRefund.provider,
      refundId: newRefund.refundId,
    });
    if (!existing) {
      throw error;
    }

    return { refund: existing, duplicate: true };
  }
}

export async function updatePaymentRefund(
  id: string,
  updateRefund: UpdatePaymentRefund
) {
  const [result] = await db()
    .update(paymentRefund)
    .set(updateRefund)
    .where(eq(paymentRefund.id, id))
    .returning();

  return result;
}

export async function createSubscriptionPlanChange(
  newPlanChange: NewSubscriptionPlanChange
) {
  const [result] = await db()
    .insert(subscriptionPlanChange)
    .values(newPlanChange)
    .returning();

  return result;
}

export async function findLatestPendingPlanChange(subscriptionNo: string) {
  const [result] = await db()
    .select()
    .from(subscriptionPlanChange)
    .where(
      and(
        eq(subscriptionPlanChange.subscriptionNo, subscriptionNo),
        eq(subscriptionPlanChange.status, SubscriptionPlanChangeStatus.SCHEDULED)
      )
    )
    .orderBy(desc(subscriptionPlanChange.createdAt))
    .limit(1);

  return result;
}

export async function updateSubscriptionPlanChange(
  id: string,
  updatePlanChange: UpdateSubscriptionPlanChange
) {
  const [result] = await db()
    .update(subscriptionPlanChange)
    .set(updatePlanChange)
    .where(eq(subscriptionPlanChange.id, id))
    .returning();

  return result;
}

export async function createPaymentAuditLog(newAuditLog: NewPaymentAuditLog) {
  const [result] = await db()
    .insert(paymentAuditLog)
    .values(newAuditLog)
    .returning();

  return result;
}
