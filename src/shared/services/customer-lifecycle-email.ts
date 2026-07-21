import { and, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';

import { db } from '@/core/db';
import { envConfigs } from '@/config';
import { subscription, user } from '@/config/db/schema';
import type { EmailManager } from '@/extensions/email';
import { md5 } from '@/shared/lib/hash';
import {
  buildCustomerEmailDeliveryRow,
  CUSTOMER_EMAIL_KINDS,
  insertCustomerEmailDeliveries,
  queueCustomerEmail,
  retryCustomerEmailDeliveries,
  scheduleCustomerEmailDispatch,
  type NewCustomerEmailDelivery,
} from '@/shared/models/customer-email-delivery';
import type { Order } from '@/shared/models/order';

import {
  buildCustomerPaymentReceiptEmail,
  buildOperatorPaymentAlertEmail,
  buildSubscriptionReminderEmail,
  buildVerificationEmail,
  buildWelcomeEmail,
  getSubscriptionReminderMilestones,
  getSubscriptionReminderMode,
} from './customer-email-content';

const REMINDER_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;

function appUrl(path: string, baseUrl = envConfigs.app_url): string {
  return new URL(path, `${baseUrl.replace(/\/$/, '')}/`).toString();
}

function paymentReference(
  order: Pick<
    Order,
    | 'invoiceId'
    | 'orderNo'
    | 'paymentProvider'
    | 'paymentSessionId'
    | 'subscriptionId'
    | 'transactionId'
  >,
  periodEnd?: Date | null
): string {
  const provider = order.paymentProvider.toLowerCase();
  if (provider === 'creem' && order.subscriptionId && periodEnd) {
    return `${order.subscriptionId}:${periodEnd.getTime()}`;
  }
  return (
    order.invoiceId ||
    order.transactionId ||
    order.paymentSessionId ||
    order.orderNo
  );
}

export async function queueWelcomeCustomerEmail(newUser: {
  id: string;
  name: string;
  email: string;
}): Promise<void> {
  const content = buildWelcomeEmail({
    customerName: newUser.name,
    createUrl: appUrl('/'),
  });
  await queueCustomerEmail({
    userId: newUser.id,
    kind: CUSTOMER_EMAIL_KINDS.WELCOME,
    dedupeKey: `welcome:${newUser.id}`,
    referenceId: newUser.id,
    recipient: newUser.email,
    ...content,
  });
  scheduleCustomerEmailDispatch();
}

export async function queueVerificationCustomerEmail({
  userId,
  recipient,
  verificationUrl,
}: {
  userId: string;
  recipient: string;
  verificationUrl: string;
}): Promise<void> {
  const content = buildVerificationEmail({ verificationUrl });
  await queueCustomerEmail({
    userId,
    kind: CUSTOMER_EMAIL_KINDS.VERIFICATION,
    dedupeKey: `verification:${userId}:${md5(verificationUrl)}`,
    referenceId: userId,
    recipient,
    ...content,
  });
  scheduleCustomerEmailDispatch();
}

export function buildPaymentEmailDeliveryRows(
  order: Order,
  periodEnd?: Date | null,
  now = new Date()
): NewCustomerEmailDelivery[] {
  const recipient = (order.paymentEmail || order.userEmail || '').trim();
  if (!recipient) {
    throw new Error(`Payment order ${order.orderNo} has no customer email`);
  }

  const referenceId = paymentReference(order, periodEnd);
  const provider = order.paymentProvider.toLowerCase();
  const purchaseName =
    order.planName ||
    order.productName ||
    order.description ||
    'BabyBoogey purchase';
  const customerName = order.paymentUserName || '';
  const amount = order.paymentAmount ?? order.amount;
  const currency = order.paymentCurrency || order.currency;
  const receipt = buildCustomerPaymentReceiptEmail({
    customerName,
    amount,
    currency,
    purchaseName,
    provider,
    referenceId,
    periodEnd,
    billingUrl: appUrl('/settings/payments'),
  });

  const rows: NewCustomerEmailDelivery[] = [
    buildCustomerEmailDeliveryRow(
      {
        userId: order.userId,
        kind: CUSTOMER_EMAIL_KINDS.PAYMENT_RECEIPT,
        dedupeKey: `customer-payment:${provider}:${referenceId}`,
        referenceId,
        recipient,
        ...receipt,
      },
      now
    ),
  ];

  const operatorRecipient = envConfigs.payment_alert_email.trim();
  if (operatorRecipient) {
    const alert = buildOperatorPaymentAlertEmail({
      amount,
      currency,
      customerEmail: recipient,
      customerName,
      purchaseName,
      provider,
      referenceId,
    });
    rows.push(
      buildCustomerEmailDeliveryRow(
        {
          userId: order.userId,
          kind: CUSTOMER_EMAIL_KINDS.OPERATOR_PAYMENT_ALERT,
          dedupeKey: `operator-payment:${provider}:${referenceId}`,
          referenceId,
          recipient: operatorRecipient,
          ...alert,
        },
        now
      )
    );
  }

  return rows;
}

export async function queuePaymentLifecycleEmails(
  order: Order,
  periodEnd?: Date | null,
  database?: UnsafeAny
): Promise<void> {
  await insertCustomerEmailDeliveries(
    buildPaymentEmailDeliveryRows(order, periodEnd),
    database
  );
  scheduleCustomerEmailDispatch();
}

export async function queueDueSubscriptionReminders({
  database,
  now = new Date(),
  baseUrl = envConfigs.app_url,
}: {
  database?: UnsafeAny;
  now?: Date;
  baseUrl?: string;
} = {}): Promise<{ due: number }> {
  const databaseClient = database ?? db();
  const horizon = new Date(now.getTime() + REMINDER_LOOKAHEAD_MS);
  const subscriptions = await databaseClient
    .select({
      id: subscription.id,
      subscriptionId: subscription.subscriptionId,
      subscriptionNo: subscription.subscriptionNo,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      canceledEndAt: subscription.canceledEndAt,
      planName: subscription.planName,
      productName: subscription.productName,
      userId: user.id,
      customerEmail: user.email,
      customerName: user.name,
    })
    .from(subscription)
    .innerJoin(user, eq(subscription.userId, user.id))
    .where(
      and(
        isNull(subscription.deletedAt),
        inArray(subscription.status, ['active', 'trialing', 'pending_cancel']),
        or(
          and(
            gt(subscription.currentPeriodEnd, now),
            lte(subscription.currentPeriodEnd, horizon)
          ),
          and(
            eq(subscription.status, 'pending_cancel'),
            gt(subscription.canceledEndAt, now),
            lte(subscription.canceledEndAt, horizon)
          )
        )
      )
    );

  let due = 0;
  for (const record of subscriptions) {
    const mode = getSubscriptionReminderMode(record.status);
    const periodEnd =
      mode === 'ending'
        ? record.canceledEndAt || record.currentPeriodEnd
        : record.currentPeriodEnd;
    if (!mode || !periodEnd) continue;

    const milestones = getSubscriptionReminderMilestones(periodEnd, now);
    const subscriptionReference =
      record.subscriptionId || record.subscriptionNo || record.id;
    for (const daysBefore of milestones) {
      due += 1;
      const content = buildSubscriptionReminderEmail({
        customerName: record.customerName,
        planName: record.planName || record.productName || 'BabyBoogey plan',
        periodEnd,
        daysBefore,
        mode,
        billingUrl: appUrl('/settings/billing', baseUrl),
      });
      await queueCustomerEmail(
        {
          userId: record.userId,
          kind: CUSTOMER_EMAIL_KINDS.SUBSCRIPTION_REMINDER,
          dedupeKey: [
            'subscription-reminder',
            subscriptionReference,
            periodEnd.getTime(),
            daysBefore,
          ].join(':'),
          referenceId: subscriptionReference,
          recipient: record.customerEmail,
          ...content,
        },
        databaseClient
      );
    }
  }

  return { due };
}

export async function runCustomerEmailMaintenance({
  database,
  emailService,
  now = new Date(),
  baseUrl = envConfigs.app_url,
}: {
  database?: UnsafeAny;
  emailService?: EmailManager;
  now?: Date;
  baseUrl?: string;
} = {}): Promise<{
  reminders: { due: number };
  deliveries: { attempted: number; sent: number };
}> {
  const reminders = await queueDueSubscriptionReminders({
    database,
    now,
    baseUrl,
  });
  const deliveries = await retryCustomerEmailDeliveries({
    database,
    emailService,
    limit: 25,
  });
  console.info('[customer-email] maintenance complete', {
    reminders,
    deliveries,
  });
  return { reminders, deliveries };
}
