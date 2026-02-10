import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  isNull,
  like,
  or,
  sql,
  sum,
} from 'drizzle-orm';

import { db } from '@/core/db';
import { credit } from '@/config/db/schema';
import { getSnowId, getUuid } from '@/shared/lib/hash';

import { getAllConfigs } from './config';
import { appendUserToResult, User } from './user';

export type Credit = typeof credit.$inferSelect & {
  user?: User;
};
export type NewCredit = typeof credit.$inferInsert;
export type UpdateCredit = Partial<
  Omit<NewCredit, 'id' | 'transactionNo' | 'createdAt'>
>;

export enum CreditStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  DELETED = 'deleted',
}

export enum CreditTransactionType {
  GRANT = 'grant', // grant credit
  CONSUME = 'consume', // consume credit
}

export enum CreditTransactionScene {
  PAYMENT = 'payment', // payment
  SUBSCRIPTION = 'subscription', // subscription
  RENEWAL = 'renewal', // renewal
  GIFT = 'gift', // gift
  REWARD = 'reward', // reward
}

// Calculate credit expiration time based on order and subscription info
export function calculateCreditExpirationTime({
  creditsValidDays,
  currentPeriodEnd,
}: {
  creditsValidDays: number;
  currentPeriodEnd?: Date;
}): Date | null {
  const now = new Date();

  // Check if credits should never expire
  if (!creditsValidDays || creditsValidDays <= 0) {
    // never expires
    return null;
  }

  const expiresAt = new Date();

  if (currentPeriodEnd) {
    // For subscription: credits expire at the end of current period
    expiresAt.setTime(currentPeriodEnd.getTime());
  } else {
    // For one-time payment: use configured validity days
    expiresAt.setDate(now.getDate() + creditsValidDays);
  }

  return expiresAt;
}

// Helper function to create expiration condition for queries
export function createExpirationCondition() {
  const currentTime = new Date();
  // Credit is valid if: expires_at IS NULL OR expires_at > current_time
  return or(isNull(credit.expiresAt), gt(credit.expiresAt, currentTime));
}

// create credit
export async function createCredit(newCredit: NewCredit) {
  const [result] = await db().insert(credit).values(newCredit).returning();
  return result;
}

export async function findCreditByOrderNo(orderNo: string) {
  const normalized = String(orderNo || '').trim();
  if (!normalized) return;

  const [result] = await db()
    .select()
    .from(credit)
    .where(eq(credit.orderNo, normalized))
    .limit(1);

  return result;
}

export async function findCreditByTransactionNo(transactionNo: string) {
  const normalized = String(transactionNo || '').trim();
  if (!normalized) return;

  const [result] = await db()
    .select()
    .from(credit)
    .where(eq(credit.transactionNo, normalized))
    .limit(1);

  return result;
}

// get credits
export async function getCredits({
  userId,
  status,
  transactionType,
  getUser = false,
  page = 1,
  limit = 30,
}: {
  userId?: string;
  status?: CreditStatus;
  transactionType?: CreditTransactionType;
  getUser?: boolean;
  page?: number;
  limit?: number;
}): Promise<Credit[]> {
  const result = await db()
    .select()
    .from(credit)
    .where(
      and(
        userId ? eq(credit.userId, userId) : undefined,
        status ? eq(credit.status, status) : undefined,
        transactionType
          ? eq(credit.transactionType, transactionType)
          : undefined
      )
    )
    .orderBy(desc(credit.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  if (getUser) {
    return appendUserToResult(result);
  }

  return result;
}

// get credits count
export async function getCreditsCount({
  userId,
  status,
  transactionType,
}: {
  userId?: string;
  status?: CreditStatus;
  transactionType?: CreditTransactionType;
}): Promise<number> {
  const [result] = await db()
    .select({ count: count() })
    .from(credit)
    .where(
      and(
        userId ? eq(credit.userId, userId) : undefined,
        status ? eq(credit.status, status) : undefined,
        transactionType
          ? eq(credit.transactionType, transactionType)
          : undefined
      )
    );

  return result?.count || 0;
}

// consume credits
export async function consumeCredits({
  userId,
  credits,
  scene,
  description,
  metadata,
  tx,
}: {
  userId: string;
  credits: number; // credits to consume
  scene?: string;
  description?: string;
  metadata?: string;
  tx?: any;
}) {
  const currentTime = new Date();

  // consume credits
  const execute = async (tx: any) => {
    // 1. check credits balance
    const [creditsBalance] = await tx
      .select({
        total: sum(credit.remainingCredits),
      })
      .from(credit)
      .where(
        and(
          eq(credit.userId, userId),
          eq(credit.transactionType, CreditTransactionType.GRANT),
          eq(credit.status, CreditStatus.ACTIVE),
          gt(credit.remainingCredits, 0),
          or(
            isNull(credit.expiresAt), // Never expires
            gt(credit.expiresAt, currentTime) // Not yet expired
          )
        )
      );

    // balance is not enough
    if (
      !creditsBalance ||
      !creditsBalance.total ||
      parseInt(creditsBalance.total) < credits
    ) {
      throw new Error(
        `Insufficient credits, ${creditsBalance?.total || 0} < ${credits}`
      );
    }

    // 2. get available credits, FIFO queue with expiresAt, batch query
    let remainingToConsume = credits; // remaining credits to consume

    // Only deal with 10k grant rows in a single consumption to keep this bounded.
    let batchNo = 0;
    const maxBatchNo = 10;
    const batchSize = 1000;
    let processedRows = 0;
    const consumedItems: any[] = [];

    while (remainingToConsume > 0) {
      batchNo += 1;
      if (batchNo > maxBatchNo) {
        throw new Error(`Too many batches: ${batchNo} > ${maxBatchNo}`);
      }

      // get batch credits
      const batchCredits = await tx
        .select()
        .from(credit)
        .where(
          and(
            eq(credit.userId, userId),
            eq(credit.transactionType, CreditTransactionType.GRANT),
            eq(credit.status, CreditStatus.ACTIVE),
            gt(credit.remainingCredits, 0),
            or(
              isNull(credit.expiresAt), // Never expires
              gt(credit.expiresAt, currentTime) // Not yet expired
            )
          )
        )
        .orderBy(
          // FIFO queue: expiring credits first, then by expiration date.
          // Keep NULL (never expires) last across sqlite/pg/mysql.
          asc(sql`case when ${credit.expiresAt} is null then 1 else 0 end`),
          asc(credit.expiresAt)
        )
        .limit(batchSize) // batch size
        .for('update'); // lock for update

      // no more credits
      if (batchCredits?.length === 0) {
        break;
      }

      // consume credits for each item
      for (const item of batchCredits) {
        // no need to consume more
        if (remainingToConsume <= 0) {
          break;
        }
        const toConsume = Math.min(remainingToConsume, item.remainingCredits);

        processedRows += 1;
        if (processedRows > batchSize * maxBatchNo) {
          throw new Error(
            `Too many credit rows processed: ${processedRows} > ${batchSize * maxBatchNo}`
          );
        }

        // update remaining credits
        await tx
          .update(credit)
          .set({
            // Use a relative update to avoid lost-updates across dialects.
            remainingCredits: sql`${credit.remainingCredits} - ${toConsume}`,
          })
          .where(eq(credit.id, item.id));

        // update consumed items
        consumedItems.push({
          creditId: item.id,
          transactionNo: item.transactionNo,
          expiresAt: item.expiresAt,
          creditsToConsume: remainingToConsume,
          creditsConsumed: toConsume,
          creditsBefore: item.remainingCredits,
          creditsAfter: item.remainingCredits - toConsume,
          batchSize: batchSize,
          batchNo: batchNo,
        });

        remainingToConsume -= toConsume;
      }
    }

    // Defensive: if this happens, it likely means concurrent consumption drained credits
    // between our balance check and row updates.
    if (remainingToConsume > 0) {
      throw new Error(
        `Insufficient credits during consumption (remaining: ${remainingToConsume})`
      );
    }

    // 3. create consumed credit
    const consumedCredit: NewCredit = {
      id: getUuid(),
      transactionNo: getSnowId(),
      transactionType: CreditTransactionType.CONSUME,
      transactionScene: scene,
      userId: userId,
      status: CreditStatus.ACTIVE,
      description: description,
      credits: -credits,
      consumedDetail: JSON.stringify(consumedItems),
      metadata: metadata,
    };
    await tx.insert(credit).values(consumedCredit);

    return consumedCredit;
  };

  // use provided transaction
  if (tx) {
    return await execute(tx);
  }

  // use default transaction
  return await db().transaction(execute);
}

// get remaining credits
export async function getRemainingCredits(userId: string): Promise<number> {
  const currentTime = new Date();

  const [result] = await db()
    .select({
      total: sum(credit.remainingCredits),
    })
    .from(credit)
    .where(
      and(
        eq(credit.userId, userId),
        eq(credit.transactionType, CreditTransactionType.GRANT),
        eq(credit.status, CreditStatus.ACTIVE),
        gt(credit.remainingCredits, 0),
        or(
          isNull(credit.expiresAt), // Never expires
          gt(credit.expiresAt, currentTime) // Not yet expired
        )
      )
    );

  return parseInt(result?.total || '0');
}

// grant credits for new user
export async function grantCreditsForNewUser(user: User) {
  // get configs from db
  const configs = await getAllConfigs();

  // if initial credits enabled
  if (configs.initial_credits_enabled !== 'true') {
    return;
  }

  // get initial credits amount and valid days
  const credits = parseInt(configs.initial_credits_amount as string) || 0;
  if (credits <= 0) {
    return;
  }

  const creditsValidDays =
    parseInt(configs.initial_credits_valid_days as string) || 0;

  const description = configs.initial_credits_description || 'initial credits';

  const newCredit = await grantCreditsForUser({
    user: user,
    credits: credits,
    validDays: creditsValidDays,
    description: description,
  });

  return newCredit;
}

// grant credits for user's first successful login (session creation)
type FirstLoginRiskContext = {
  signupIp?: string;
  claimIp?: string;
  country?: string;
};

function parseIso2CountryList(raw: string | undefined | null): Set<string> {
  const set = new Set<string>();
  const normalized = String(raw || '').trim();
  if (!normalized) return set;

  for (const token of normalized.split(/[\s,]+/g)) {
    const code = token.trim().toUpperCase();
    if (!code) continue;
    if (/^[A-Z]{2}$/.test(code)) {
      set.add(code);
    }
  }

  return set;
}

function normalizeIp(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // Keep compatible with MySQL varchar(45) for IPv6.
  return raw.trim().slice(0, 45);
}

function normalizeCountry(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // ISO-2 (best-effort). Keep compatible with MySQL varchar(2).
  return raw.trim().toUpperCase().slice(0, 2);
}

async function countRecentFirstLoginGrantsBySignupIp(opts: {
  signupIp: string;
  windowStart: Date;
}) {
  const ip = normalizeIp(opts.signupIp);
  if (!ip) return 0;

  const [row] = await db()
    .select({ count: count() })
    .from(credit)
    .where(
      and(
        eq(credit.transactionType, CreditTransactionType.GRANT),
        like(credit.transactionNo, 'first_login:%'),
        gt(credit.createdAt, opts.windowStart),
        eq(credit.signupIp, ip)
      )
    )
    .limit(1);

  return Number(row?.count || 0);
}

async function countRecentFirstLoginGrantsByClaimIp(opts: {
  claimIp: string;
  windowStart: Date;
}) {
  const ip = normalizeIp(opts.claimIp);
  if (!ip) return 0;

  const [row] = await db()
    .select({ count: count() })
    .from(credit)
    .where(
      and(
        eq(credit.transactionType, CreditTransactionType.GRANT),
        like(credit.transactionNo, 'first_login:%'),
        gt(credit.createdAt, opts.windowStart),
        eq(credit.claimIp, ip)
      )
    )
    .limit(1);

  return Number(row?.count || 0);
}

export async function grantCreditsForFirstLogin(
  user: User,
  ctx: FirstLoginRiskContext = {}
) {
  // get configs from db
  const configs = await getAllConfigs();

  // if initial credits enabled
  if (configs.initial_credits_enabled !== 'true') {
    return;
  }

  // get initial credits amount and valid days
  const credits = parseInt(configs.initial_credits_amount as string) || 0;
  if (credits <= 0) {
    return;
  }

  const creditsValidDays =
    parseInt(configs.initial_credits_valid_days as string) || 0;

  const description =
    configs.initial_credits_description || 'first login bonus';

  // Idempotency: transaction_no is unique across all credits.
  // Use a deterministic key so we can safely retry across devices/logins.
  const transactionNo = `first_login:${user.id}`;

  const existing = await findCreditByTransactionNo(transactionNo);
  if (existing) {
    return existing;
  }

  const signupIp = normalizeIp(ctx.signupIp);
  const claimIp = normalizeIp(ctx.claimIp);
  const country = normalizeCountry(ctx.country);

  // Country rules (best-effort; never blocks login, only affects the bonus).
  const countryMode = String(
    configs.initial_credits_country_mode || 'denylist'
  )
    .trim()
    .toLowerCase();
  const countryList = parseIso2CountryList(
    configs.initial_credits_country_list || 'KP,IR,MM,IN'
  );

  if (countryMode === 'denylist') {
    if (country && countryList.has(country)) {
      console.log('initial credits blocked', {
        reason: 'country_blocked',
        userId: user.id,
        signupIp: signupIp || undefined,
        claimIp: claimIp || undefined,
        country,
        countryMode,
      });
      return;
    }
  } else if (countryMode === 'allowlist') {
    // If we can't determine a country, fail closed for allowlist mode.
    if (!country || !countryList.has(country)) {
      console.log('initial credits blocked', {
        reason: 'country_not_allowed',
        userId: user.id,
        signupIp: signupIp || undefined,
        claimIp: claimIp || undefined,
        country: country || undefined,
        countryMode,
      });
      return;
    }
  }

  // IP limit rules.
  const ipLimitEnabled =
    String(configs.initial_credits_ip_limit_enabled ?? 'true') !== 'false';
  const ipLimitMax = Math.max(
    1,
    parseInt(String(configs.initial_credits_ip_limit_max ?? '1'), 10) || 1
  );
  const ipLimitWindowDays = Math.max(
    1,
    parseInt(String(configs.initial_credits_ip_limit_window_days ?? '7'), 10) ||
      7
  );
  const ipLimitSource = String(configs.initial_credits_ip_limit_source || 'both')
    .trim()
    .toLowerCase();

  if (ipLimitEnabled && ipLimitMax > 0 && ipLimitWindowDays > 0) {
    const windowStart = new Date(
      Date.now() - ipLimitWindowDays * 24 * 60 * 60 * 1000
    );

    if (ipLimitSource === 'signup' || ipLimitSource === 'both') {
      if (signupIp) {
        const signupCount = await countRecentFirstLoginGrantsBySignupIp({
          signupIp,
          windowStart,
        });
        if (signupCount >= ipLimitMax) {
          console.log('initial credits blocked', {
            reason: 'ip_limit_signup',
            userId: user.id,
            signupIp,
            claimIp: claimIp || undefined,
            country: country || undefined,
            windowDays: ipLimitWindowDays,
            max: ipLimitMax,
            count: signupCount,
          });
          return;
        }
      }
    }

    if (ipLimitSource === 'claim' || ipLimitSource === 'both') {
      if (claimIp) {
        const claimCount = await countRecentFirstLoginGrantsByClaimIp({
          claimIp,
          windowStart,
        });
        if (claimCount >= ipLimitMax) {
          console.log('initial credits blocked', {
            reason: 'ip_limit_claim',
            userId: user.id,
            signupIp: signupIp || undefined,
            claimIp,
            country: country || undefined,
            windowDays: ipLimitWindowDays,
            max: ipLimitMax,
            count: claimCount,
          });
          return;
        }
      }
    }
  }

  const expiresAt = calculateCreditExpirationTime({
    creditsValidDays,
  });

  const newCredit: NewCredit = {
    id: getUuid(),
    userId: user.id,
    userEmail: user.email,
    orderNo: '',
    subscriptionNo: '',
    transactionNo,
    transactionType: CreditTransactionType.GRANT,
    transactionScene: CreditTransactionScene.REWARD,
    signupIp: signupIp || null,
    claimIp: claimIp || null,
    claimCountry: country || null,
    credits,
    remainingCredits: credits,
    description,
    expiresAt,
    status: CreditStatus.ACTIVE,
    metadata: JSON.stringify({ type: 'first-login' }),
  };

  try {
    return await createCredit(newCredit);
  } catch (error) {
    // Race-safe: another session could have inserted it after our existence check.
    const after = await findCreditByTransactionNo(transactionNo);
    if (after) return after;
    throw error;
  }
}

// grant credits for user
export async function grantCreditsForUser({
  user,
  credits,
  validDays,
  description,
}: {
  user: User;
  credits: number;
  validDays?: number;
  description?: string;
}) {
  if (credits <= 0) {
    return;
  }

  const creditsValidDays = validDays && validDays > 0 ? validDays : 0;

  const expiresAt = calculateCreditExpirationTime({
    creditsValidDays: creditsValidDays,
  });

  const creditDescription = description || 'grant credits';

  const newCredit: NewCredit = {
    id: getUuid(),
    userId: user.id,
    userEmail: user.email,
    orderNo: '',
    subscriptionNo: '',
    transactionNo: getSnowId(),
    transactionType: CreditTransactionType.GRANT,
    transactionScene: CreditTransactionScene.GIFT,
    credits: credits,
    remainingCredits: credits,
    description: creditDescription,
    expiresAt: expiresAt,
    status: CreditStatus.ACTIVE,
  };

  await createCredit(newCredit);

  return newCredit;
}
