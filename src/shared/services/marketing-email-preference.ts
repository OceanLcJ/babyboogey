import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/core/db';
import {
  customerEmailDelivery,
  customerEmailPreference,
} from '@/config/db/schema';

export const MARKETING_EMAIL_KINDS = {
  CHECKOUT_ABANDONED: 'reactivation_checkout_abandoned',
  UNUSED_CREDITS: 'reactivation_unused_credits',
} as const;

const MARKETING_KIND_VALUES = Object.values(MARKETING_EMAIL_KINDS);

type UnsubscribeTokenPayload = {
  userId: string;
  version: 1;
};

function getDatabase(database?: UnsafeAny): UnsafeAny {
  return database ?? db();
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signPayload(
  encodedPayload: string,
  secret: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(encodedPayload)
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export async function createMarketingUnsubscribeToken({
  userId,
  secret,
}: {
  userId: string;
  secret: string;
}): Promise<string> {
  if (!userId.trim()) throw new Error('Unsubscribe user ID is required');
  if (secret.trim().length < 32) {
    throw new Error('EMAIL_UNSUBSCRIBE_SECRET must be at least 32 characters');
  }

  const payload: UnsubscribeTokenPayload = {
    userId,
    version: 1,
  };
  const encodedPayload = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const signature = await signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifyMarketingUnsubscribeToken({
  token,
  secret,
}: {
  token: string;
  secret: string;
}): Promise<{ userId: string } | null> {
  try {
    if (!token || token.length > 1024 || secret.trim().length < 32) return null;
    const [encodedPayload, suppliedSignature, extra] = token.split('.');
    if (!encodedPayload || !suppliedSignature || extra) return null;

    const expectedSignature = await signPayload(encodedPayload, secret);
    if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload))
    ) as Partial<UnsubscribeTokenPayload>;
    if (
      payload.version !== 1 ||
      typeof payload.userId !== 'string' ||
      !payload.userId.trim()
    ) {
      return null;
    }
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

export function buildMarketingUnsubscribeUrl({
  baseUrl,
  token,
}: {
  baseUrl: string;
  token: string;
}): string {
  const url = new URL(
    '/api/email/unsubscribe',
    `${baseUrl.replace(/\/$/, '')}/`
  );
  url.searchParams.set('token', token);
  return url.toString();
}

export async function hasMarketingEmailOptOut(
  userId: string,
  database?: UnsafeAny
): Promise<boolean> {
  const databaseClient = getDatabase(database);
  const [preference] = await databaseClient
    .select({
      marketingOptOutAt: customerEmailPreference.marketingOptOutAt,
    })
    .from(customerEmailPreference)
    .where(eq(customerEmailPreference.userId, userId))
    .limit(1);
  return Boolean(preference?.marketingOptOutAt);
}

export async function unsubscribeMarketingEmail({
  userId,
  database,
  now = new Date(),
}: {
  userId: string;
  database?: UnsafeAny;
  now?: Date;
}): Promise<void> {
  const databaseClient = getDatabase(database);
  await databaseClient
    .insert(customerEmailPreference)
    .values({
      userId,
      marketingOptOutAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: customerEmailPreference.userId,
      set: {
        marketingOptOutAt: now,
        updatedAt: now,
      },
    });

  await databaseClient
    .update(customerEmailDelivery)
    .set({
      status: 'suppressed',
      claimedAt: null,
      lastError: 'marketing_unsubscribed',
      updatedAt: now,
    })
    .where(
      and(
        eq(customerEmailDelivery.userId, userId),
        inArray(customerEmailDelivery.kind, MARKETING_KIND_VALUES),
        isNull(customerEmailDelivery.sentAt)
      )
    );
}
