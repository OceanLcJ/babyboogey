import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  sum,
} from 'drizzle-orm';

import { db } from '@/core/db';
import {
  aiTask,
  credit,
  customerEmailDelivery,
  order,
  user,
} from '@/config/db/schema';
import {
  CUSTOMER_EMAIL_KINDS,
  queueCustomerEmail,
} from '@/shared/models/customer-email-delivery';

import {
  buildCheckoutAbandonedReactivationEmail,
  buildUnusedCreditsReactivationEmail,
  normalizeCustomerEmailLocale,
} from './customer-email-content';
import {
  buildMarketingUnsubscribeUrl,
  createMarketingUnsubscribeToken,
  hasMarketingEmailOptOut,
} from './marketing-email-preference';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const REACTIVATION_CAMPAIGNS = {
  CHECKOUT_ABANDONED: 'checkout-abandoned-v1',
  UNUSED_CREDITS: 'unused-credits-v1',
} as const;

export const REACTIVATION_POLICY = {
  CHECKOUT_MAX_AGE_MS: 7 * DAY_MS,
  CHECKOUT_MIN_AGE_MS: 2 * HOUR_MS,
  UNUSED_CREDITS_INACTIVITY_MS: 7 * DAY_MS,
  UNUSED_CREDITS_MIN_ACCOUNT_AGE_MS: 3 * DAY_MS,
} as const;

type CampaignResult = {
  candidates: number;
  queued: number;
};

export type ReactivationQueueResult = {
  enabled: boolean;
  skippedReason?: string;
  unusedCredits: CampaignResult;
  checkoutAbandoned: CampaignResult;
};

function getDatabase(database?: UnsafeAny): UnsafeAny {
  return database ?? db();
}

function appUrl(
  path: string,
  baseUrl: string,
  rawLocale?: string | null
): string {
  const locale = normalizeCustomerEmailLocale(rawLocale);
  const localizedPath =
    locale === 'en'
      ? path
      : `/${locale}${path === '/' ? '' : path.startsWith('/') ? path : `/${path}`}`;
  return new URL(localizedPath, `${baseUrl.replace(/\/$/, '')}/`).toString();
}

async function deliveryExists(
  dedupeKey: string,
  database: UnsafeAny
): Promise<boolean> {
  const [existing] = await database
    .select({ id: customerEmailDelivery.id })
    .from(customerEmailDelivery)
    .where(eq(customerEmailDelivery.dedupeKey, dedupeKey))
    .limit(1);
  return Boolean(existing);
}

async function listUnusedCreditCandidates({
  database,
  now,
  limit,
}: {
  database: UnsafeAny;
  now: Date;
  limit: number;
}) {
  const accountCreatedBefore = new Date(
    now.getTime() - REACTIVATION_POLICY.UNUSED_CREDITS_MIN_ACCOUNT_AGE_MS
  );
  return database
    .select({
      userId: user.id,
      customerName: user.name,
      customerEmail: user.email,
      locale: user.locale,
      remainingCredits: sum(credit.remainingCredits),
    })
    .from(user)
    .innerJoin(
      credit,
      and(
        eq(credit.userId, user.id),
        eq(credit.transactionType, 'grant'),
        eq(credit.status, 'active'),
        gt(credit.remainingCredits, 0),
        or(isNull(credit.expiresAt), gt(credit.expiresAt, now))
      )
    )
    .where(lte(user.createdAt, accountCreatedBefore))
    .groupBy(user.id, user.name, user.email, user.locale, user.createdAt)
    .orderBy(asc(user.createdAt))
    .limit(Math.max(limit * 5, 50));
}

async function queueUnusedCreditReminders({
  database,
  now,
  baseUrl,
  unsubscribeSecret,
  marketingPostalAddress,
  limit,
}: {
  database: UnsafeAny;
  now: Date;
  baseUrl: string;
  unsubscribeSecret: string;
  marketingPostalAddress: string;
  limit: number;
}): Promise<CampaignResult> {
  const rows = await listUnusedCreditCandidates({ database, now, limit });
  let candidates = 0;
  let queued = 0;
  const inactiveSince = new Date(
    now.getTime() - REACTIVATION_POLICY.UNUSED_CREDITS_INACTIVITY_MS
  );

  for (const record of rows) {
    if (queued >= limit) break;
    const remainingCredits = Number(record.remainingCredits || 0);
    if (!Number.isFinite(remainingCredits) || remainingCredits <= 0) continue;

    const [recentTask] = await database
      .select({ id: aiTask.id })
      .from(aiTask)
      .where(
        and(
          eq(aiTask.userId, record.userId),
          gte(aiTask.createdAt, inactiveSince)
        )
      )
      .limit(1);
    if (recentTask) continue;
    if (await hasMarketingEmailOptOut(record.userId, database)) continue;

    candidates += 1;
    const dedupeKey = [
      'reactivation',
      REACTIVATION_CAMPAIGNS.UNUSED_CREDITS,
      record.userId,
    ].join(':');
    if (await deliveryExists(dedupeKey, database)) continue;

    const token = await createMarketingUnsubscribeToken({
      userId: record.userId,
      secret: unsubscribeSecret,
    });
    const unsubscribeUrl = buildMarketingUnsubscribeUrl({ baseUrl, token });
    const content = buildUnusedCreditsReactivationEmail({
      customerName: record.customerName,
      remainingCredits,
      createUrl: appUrl('/', baseUrl, record.locale),
      unsubscribeUrl,
      marketingPostalAddress,
      locale: record.locale,
    });
    await queueCustomerEmail(
      {
        userId: record.userId,
        kind: CUSTOMER_EMAIL_KINDS.REACTIVATION_UNUSED_CREDITS,
        dedupeKey,
        referenceId: record.userId,
        recipient: record.customerEmail,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        ...content,
      },
      database
    );
    queued += 1;
  }

  return { candidates, queued };
}

async function queueCheckoutAbandonmentReminders({
  database,
  now,
  baseUrl,
  unsubscribeSecret,
  marketingPostalAddress,
  limit,
}: {
  database: UnsafeAny;
  now: Date;
  baseUrl: string;
  unsubscribeSecret: string;
  marketingPostalAddress: string;
  limit: number;
}): Promise<CampaignResult> {
  const oldestCheckout = new Date(
    now.getTime() - REACTIVATION_POLICY.CHECKOUT_MAX_AGE_MS
  );
  const newestCheckout = new Date(
    now.getTime() - REACTIVATION_POLICY.CHECKOUT_MIN_AGE_MS
  );
  const rows = await database
    .select({
      orderNo: order.orderNo,
      userId: user.id,
      customerName: user.name,
      customerEmail: user.email,
      locale: user.locale,
      orderCreatedAt: order.createdAt,
      amount: order.amount,
      currency: order.currency,
      description: order.description,
      planName: order.planName,
      productName: order.productName,
    })
    .from(order)
    .innerJoin(user, eq(order.userId, user.id))
    .where(
      and(
        inArray(order.status, ['created', 'failed']),
        isNotNull(order.paymentSessionId),
        gte(order.createdAt, oldestCheckout),
        lte(order.createdAt, newestCheckout)
      )
    )
    .orderBy(desc(order.createdAt))
    .limit(Math.max(limit * 5, 50));

  let candidates = 0;
  let queued = 0;
  const seenUsers = new Set<string>();
  for (const record of rows) {
    if (queued >= limit) break;
    if (seenUsers.has(record.userId)) continue;
    seenUsers.add(record.userId);
    if (await hasMarketingEmailOptOut(record.userId, database)) continue;

    const [laterPaidOrder] = await database
      .select({ id: order.id })
      .from(order)
      .where(
        and(
          eq(order.userId, record.userId),
          eq(order.status, 'paid'),
          sql`coalesce(${order.paymentAmount}, ${order.amount}, 0) > 0`,
          or(
            gt(order.paidAt, record.orderCreatedAt),
            and(
              isNull(order.paidAt),
              gt(order.createdAt, record.orderCreatedAt)
            )
          )
        )
      )
      .limit(1);
    if (laterPaidOrder) continue;

    candidates += 1;
    const dedupeKey = [
      'reactivation',
      REACTIVATION_CAMPAIGNS.CHECKOUT_ABANDONED,
      record.userId,
    ].join(':');
    if (await deliveryExists(dedupeKey, database)) continue;

    const token = await createMarketingUnsubscribeToken({
      userId: record.userId,
      secret: unsubscribeSecret,
    });
    const unsubscribeUrl = buildMarketingUnsubscribeUrl({ baseUrl, token });
    const content = buildCheckoutAbandonedReactivationEmail({
      customerName: record.customerName,
      purchaseName:
        record.planName ||
        record.productName ||
        record.description ||
        'BabyBoogey credits',
      amount: record.amount,
      currency: record.currency,
      pricingUrl: appUrl('/pricing', baseUrl, record.locale),
      unsubscribeUrl,
      marketingPostalAddress,
      locale: record.locale,
    });
    await queueCustomerEmail(
      {
        userId: record.userId,
        kind: CUSTOMER_EMAIL_KINDS.REACTIVATION_CHECKOUT_ABANDONED,
        dedupeKey,
        referenceId: record.orderNo,
        recipient: record.customerEmail,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        ...content,
      },
      database
    );
    queued += 1;
  }

  return { candidates, queued };
}

export async function queueDueReactivationEmails({
  database,
  now = new Date(),
  baseUrl,
  enabled = false,
  unsubscribeSecret = '',
  marketingPostalAddress = '',
  limitPerCampaign = 10,
}: {
  database?: UnsafeAny;
  now?: Date;
  baseUrl: string;
  enabled?: boolean;
  unsubscribeSecret?: string;
  marketingPostalAddress?: string;
  limitPerCampaign?: number;
}): Promise<ReactivationQueueResult> {
  const emptyResult = {
    enabled: false,
    unusedCredits: { candidates: 0, queued: 0 },
    checkoutAbandoned: { candidates: 0, queued: 0 },
  };
  if (!enabled) {
    return { ...emptyResult, skippedReason: 'disabled' };
  }
  if (unsubscribeSecret.trim().length < 32) {
    return {
      ...emptyResult,
      skippedReason: 'missing_unsubscribe_secret',
    };
  }
  const databaseClient = getDatabase(database);
  const limit = Math.min(Math.max(Math.floor(limitPerCampaign), 1), 25);
  const unusedCredits = await queueUnusedCreditReminders({
    database: databaseClient,
    now,
    baseUrl,
    unsubscribeSecret,
    marketingPostalAddress: marketingPostalAddress.trim(),
    limit,
  });
  const checkoutAbandoned = await queueCheckoutAbandonmentReminders({
    database: databaseClient,
    now,
    baseUrl,
    unsubscribeSecret,
    marketingPostalAddress: marketingPostalAddress.trim(),
    limit,
  });

  return {
    enabled: true,
    unusedCredits,
    checkoutAbandoned,
  };
}
