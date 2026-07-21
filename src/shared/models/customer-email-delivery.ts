import { getCloudflareContext } from '@opennextjs/cloudflare';
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { customerEmailDelivery } from '@/config/db/schema';
import type { EmailManager } from '@/extensions/email';
import { getUuid } from '@/shared/lib/hash';
import { getEmailService } from '@/shared/services/email';

import type { CustomerEmailContent } from '../services/customer-email-content';

const CLAIM_STALE_AFTER_MS = 15 * 60 * 1000;
export const CUSTOMER_EMAIL_MAX_ATTEMPTS = 5;

export const CUSTOMER_EMAIL_KINDS = {
  OPERATOR_PAYMENT_ALERT: 'operator_payment_alert',
  PAYMENT_RECEIPT: 'payment_receipt',
  SUBSCRIPTION_REMINDER: 'subscription_reminder',
  VERIFICATION: 'verification',
  WELCOME: 'welcome',
} as const;

export type CustomerEmailKind =
  (typeof CUSTOMER_EMAIL_KINDS)[keyof typeof CUSTOMER_EMAIL_KINDS];

export type CustomerEmailDeliveryStatus =
  | 'failed'
  | 'pending'
  | 'sending'
  | 'sent';

export type CustomerEmailDelivery = typeof customerEmailDelivery.$inferSelect;
export type NewCustomerEmailDelivery =
  typeof customerEmailDelivery.$inferInsert;

export type CustomerEmailDeliveryResult =
  | 'duplicate'
  | 'exhausted'
  | 'failed'
  | 'sent';

export interface QueueCustomerEmailInput extends CustomerEmailContent {
  userId: string;
  kind: CustomerEmailKind;
  dedupeKey: string;
  referenceId?: string;
  recipient: string;
}

function getDatabase(database?: UnsafeAny): UnsafeAny {
  return database ?? db();
}

function boundedErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

export function buildCustomerEmailDeliveryRow(
  input: QueueCustomerEmailInput,
  now = new Date()
): NewCustomerEmailDelivery {
  return {
    id: getUuid(),
    userId: input.userId,
    kind: input.kind,
    dedupeKey: input.dedupeKey,
    referenceId: input.referenceId || null,
    recipient: input.recipient.trim().toLowerCase(),
    subject: input.subject,
    html: input.html,
    text: input.text,
    status: 'pending',
    attempts: 0,
    maxAttempts: CUSTOMER_EMAIL_MAX_ATTEMPTS,
    createdAt: now,
    updatedAt: now,
  };
}

export async function insertCustomerEmailDeliveries(
  deliveries: NewCustomerEmailDelivery[],
  database?: UnsafeAny
): Promise<void> {
  const databaseClient = getDatabase(database);
  for (const delivery of deliveries) {
    await databaseClient
      .insert(customerEmailDelivery)
      .values(delivery)
      .onConflictDoUpdate({
        target: customerEmailDelivery.dedupeKey,
        // Preserve the first rendered body and delivery state on webhook replay.
        set: { dedupeKey: delivery.dedupeKey },
      });
  }
}

export async function queueCustomerEmail(
  input: QueueCustomerEmailInput,
  database?: UnsafeAny
): Promise<void> {
  await insertCustomerEmailDeliveries(
    [buildCustomerEmailDeliveryRow(input)],
    database
  );
}

export async function attemptCustomerEmailDelivery(
  dedupeKey: string,
  options: { database?: UnsafeAny; emailService?: EmailManager } = {}
): Promise<CustomerEmailDeliveryResult> {
  const databaseClient = getDatabase(options.database);
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_AFTER_MS);
  const [claimed] = await databaseClient
    .update(customerEmailDelivery)
    .set({
      status: 'sending',
      attempts: sql`${customerEmailDelivery.attempts} + 1`,
      claimedAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(customerEmailDelivery.dedupeKey, dedupeKey),
        isNull(customerEmailDelivery.sentAt),
        sql`${customerEmailDelivery.attempts} < ${customerEmailDelivery.maxAttempts}`,
        or(
          eq(customerEmailDelivery.status, 'pending'),
          eq(customerEmailDelivery.status, 'failed'),
          and(
            eq(customerEmailDelivery.status, 'sending'),
            or(
              isNull(customerEmailDelivery.claimedAt),
              lt(customerEmailDelivery.claimedAt, staleBefore)
            )
          )
        )
      )
    )
    .returning({
      id: customerEmailDelivery.id,
      recipient: customerEmailDelivery.recipient,
      subject: customerEmailDelivery.subject,
      html: customerEmailDelivery.html,
      text: customerEmailDelivery.text,
    });

  if (!claimed) {
    const [existing] = await databaseClient
      .select({
        attempts: customerEmailDelivery.attempts,
        maxAttempts: customerEmailDelivery.maxAttempts,
        sentAt: customerEmailDelivery.sentAt,
        status: customerEmailDelivery.status,
      })
      .from(customerEmailDelivery)
      .where(eq(customerEmailDelivery.dedupeKey, dedupeKey))
      .limit(1);
    if (existing?.sentAt) return 'duplicate';
    if (existing && existing.attempts < existing.maxAttempts) {
      return 'duplicate';
    }
    return 'exhausted';
  }

  try {
    const emailService = options.emailService ?? (await getEmailService());
    const result = await emailService.sendEmail({
      to: claimed.recipient,
      subject: claimed.subject,
      html: claimed.html,
      text: claimed.text,
    });
    if (!result.success) {
      throw new Error(result.error || 'Cloudflare rejected the email');
    }

    await databaseClient
      .update(customerEmailDelivery)
      .set({
        status: 'sent',
        claimedAt: null,
        sentAt: new Date(),
        providerMessageId: result.messageId || null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(customerEmailDelivery.id, claimed.id));
    console.info('[customer-email] delivery accepted', { dedupeKey });
    return 'sent';
  } catch (error) {
    const message = boundedErrorMessage(error);
    await databaseClient
      .update(customerEmailDelivery)
      .set({
        status: 'failed',
        claimedAt: null,
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(customerEmailDelivery.id, claimed.id));
    console.error('[customer-email] delivery failed', {
      dedupeKey,
      error: message,
    });
    return 'failed';
  }
}

export async function retryCustomerEmailDeliveries(
  options: {
    database?: UnsafeAny;
    emailService?: EmailManager;
    limit?: number;
  } = {}
): Promise<{ attempted: number; sent: number }> {
  const databaseClient = getDatabase(options.database);
  const staleBefore = new Date(Date.now() - CLAIM_STALE_AFTER_MS);
  const pending = await databaseClient
    .select({ dedupeKey: customerEmailDelivery.dedupeKey })
    .from(customerEmailDelivery)
    .where(
      and(
        isNull(customerEmailDelivery.sentAt),
        sql`${customerEmailDelivery.attempts} < ${customerEmailDelivery.maxAttempts}`,
        or(
          eq(customerEmailDelivery.status, 'pending'),
          eq(customerEmailDelivery.status, 'failed'),
          and(
            eq(customerEmailDelivery.status, 'sending'),
            or(
              isNull(customerEmailDelivery.claimedAt),
              lt(customerEmailDelivery.claimedAt, staleBefore)
            )
          )
        )
      )
    )
    .orderBy(asc(customerEmailDelivery.updatedAt))
    .limit(options.limit ?? 25);

  let sent = 0;
  for (const delivery of pending) {
    const result = await attemptCustomerEmailDelivery(delivery.dedupeKey, {
      database: databaseClient,
      emailService: options.emailService,
    });
    if (result === 'sent') sent += 1;
  }

  return { attempted: pending.length, sent };
}

export function scheduleCustomerEmailDispatch(limit = 10): void {
  try {
    const { ctx } = getCloudflareContext();
    ctx.waitUntil(retryCustomerEmailDeliveries({ limit }));
  } catch {
    // `next dev` may not have a Worker context. The durable row remains pending
    // and will be claimed by the hourly Cron once deployed.
  }
}
