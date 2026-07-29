import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { operatorEmailDelivery } from '@/config/db/schema';
import type { EmailManager } from '@/extensions/email';
import { getUuid } from '@/shared/lib/hash';
import { getEmailService } from '@/shared/services/email';

const CLAIM_STALE_AFTER_MS = 15 * 60 * 1000;
export const OPERATOR_EMAIL_MAX_ATTEMPTS = 5;
export const DAILY_OPERATIONS_REPORT_KIND = 'daily_operations_report';

export type OperatorEmailDeliveryResult =
  | 'duplicate'
  | 'exhausted'
  | 'failed'
  | 'sent';

export type NewOperatorEmailDelivery =
  typeof operatorEmailDelivery.$inferInsert;

export interface QueueOperatorEmailInput {
  kind: string;
  dedupeKey: string;
  reportDate: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
}

function getDatabase(database?: UnsafeAny): UnsafeAny {
  return database ?? db();
}

function boundedErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

export function buildOperatorEmailDeliveryRow(
  input: QueueOperatorEmailInput,
  now = new Date()
): NewOperatorEmailDelivery {
  return {
    id: getUuid(),
    kind: input.kind,
    dedupeKey: input.dedupeKey,
    reportDate: input.reportDate,
    recipient: input.recipient.trim().toLowerCase(),
    subject: input.subject,
    html: input.html,
    text: input.text,
    status: 'pending',
    attempts: 0,
    maxAttempts: OPERATOR_EMAIL_MAX_ATTEMPTS,
    createdAt: now,
    updatedAt: now,
  };
}

export async function hasOperatorEmailDelivery(
  dedupeKey: string,
  database?: UnsafeAny
): Promise<boolean> {
  const [existing] = await getDatabase(database)
    .select({ id: operatorEmailDelivery.id })
    .from(operatorEmailDelivery)
    .where(eq(operatorEmailDelivery.dedupeKey, dedupeKey))
    .limit(1);
  return Boolean(existing);
}

export async function queueOperatorEmail(
  input: QueueOperatorEmailInput,
  database?: UnsafeAny
): Promise<void> {
  const row = buildOperatorEmailDeliveryRow(input);
  await getDatabase(database)
    .insert(operatorEmailDelivery)
    .values(row)
    .onConflictDoUpdate({
      target: operatorEmailDelivery.dedupeKey,
      // Preserve the first complete snapshot if Cron is replayed.
      set: { dedupeKey: row.dedupeKey },
    });
}

export async function attemptOperatorEmailDelivery(
  dedupeKey: string,
  options: { database?: UnsafeAny; emailService?: EmailManager } = {}
): Promise<OperatorEmailDeliveryResult> {
  const databaseClient = getDatabase(options.database);
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_AFTER_MS);
  const [claimed] = await databaseClient
    .update(operatorEmailDelivery)
    .set({
      status: 'sending',
      attempts: sql`${operatorEmailDelivery.attempts} + 1`,
      claimedAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(operatorEmailDelivery.dedupeKey, dedupeKey),
        isNull(operatorEmailDelivery.sentAt),
        sql`${operatorEmailDelivery.attempts} < ${operatorEmailDelivery.maxAttempts}`,
        or(
          eq(operatorEmailDelivery.status, 'pending'),
          eq(operatorEmailDelivery.status, 'failed'),
          and(
            eq(operatorEmailDelivery.status, 'sending'),
            or(
              isNull(operatorEmailDelivery.claimedAt),
              lt(operatorEmailDelivery.claimedAt, staleBefore)
            )
          )
        )
      )
    )
    .returning({
      id: operatorEmailDelivery.id,
      recipient: operatorEmailDelivery.recipient,
      subject: operatorEmailDelivery.subject,
      html: operatorEmailDelivery.html,
      text: operatorEmailDelivery.text,
    });

  if (!claimed) {
    const [existing] = await databaseClient
      .select({
        attempts: operatorEmailDelivery.attempts,
        maxAttempts: operatorEmailDelivery.maxAttempts,
        sentAt: operatorEmailDelivery.sentAt,
      })
      .from(operatorEmailDelivery)
      .where(eq(operatorEmailDelivery.dedupeKey, dedupeKey))
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
      .update(operatorEmailDelivery)
      .set({
        status: 'sent',
        claimedAt: null,
        sentAt: new Date(),
        providerMessageId: result.messageId || null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(operatorEmailDelivery.id, claimed.id));
    console.info('[operator-email] delivery accepted', { dedupeKey });
    return 'sent';
  } catch (error) {
    const message = boundedErrorMessage(error);
    await databaseClient
      .update(operatorEmailDelivery)
      .set({
        status: 'failed',
        claimedAt: null,
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(operatorEmailDelivery.id, claimed.id));
    console.error('[operator-email] delivery failed', {
      dedupeKey,
      error: message,
    });
    return 'failed';
  }
}

export async function retryOperatorEmailDeliveries(
  options: {
    database?: UnsafeAny;
    emailService?: EmailManager;
    limit?: number;
  } = {}
): Promise<{ attempted: number; sent: number }> {
  const databaseClient = getDatabase(options.database);
  const staleBefore = new Date(Date.now() - CLAIM_STALE_AFTER_MS);
  const pending = await databaseClient
    .select({ dedupeKey: operatorEmailDelivery.dedupeKey })
    .from(operatorEmailDelivery)
    .where(
      and(
        isNull(operatorEmailDelivery.sentAt),
        sql`${operatorEmailDelivery.attempts} < ${operatorEmailDelivery.maxAttempts}`,
        or(
          eq(operatorEmailDelivery.status, 'pending'),
          eq(operatorEmailDelivery.status, 'failed'),
          and(
            eq(operatorEmailDelivery.status, 'sending'),
            or(
              isNull(operatorEmailDelivery.claimedAt),
              lt(operatorEmailDelivery.claimedAt, staleBefore)
            )
          )
        )
      )
    )
    .orderBy(asc(operatorEmailDelivery.updatedAt))
    .limit(options.limit ?? 10);

  let sent = 0;
  for (const delivery of pending) {
    const result = await attemptOperatorEmailDelivery(delivery.dedupeKey, {
      database: databaseClient,
      emailService: options.emailService,
    });
    if (result === 'sent') sent += 1;
  }

  return { attempted: pending.length, sent };
}
