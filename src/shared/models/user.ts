import { headers } from 'next/headers';
import { count, desc, eq, inArray } from 'drizzle-orm';

import { getAuth } from '@/core/auth';
import { db } from '@/core/db';
import { user } from '@/config/db/schema';
import { resolveMediaValueToApiPath } from '@/shared/lib/asset-ref';

import { Permission, Role } from '../services/rbac';
import { getRemainingCredits } from './credit';

export interface UserCredits {
  remainingCredits: number;
  expiresAt: Date | null;
}

export interface UserMembership {
  canUseProTemplates: boolean;
  hasMonetizedPaidOrder: boolean;
  hasSubscription: boolean;
  subscription: {
    status: string;
    productId: string | null;
    planName: string | null;
    currentPeriodEnd: Date | null;
  } | null;
}

export type User = typeof user.$inferSelect & {
  isAdmin?: boolean;
  credits?: UserCredits;
  membership?: UserMembership;
  roles?: Role[];
  permissions?: Permission[];
};
export type NewUser = typeof user.$inferInsert;
export type UpdateUser = Partial<Omit<NewUser, 'id' | 'createdAt' | 'email'>>;

function normalizeUserMedia(userInfo?: User | null): User | undefined {
  if (!userInfo) {
    return undefined;
  }

  return {
    ...userInfo,
    image: userInfo.image
      ? resolveMediaValueToApiPath(userInfo.image)
      : userInfo.image,
  };
}

export async function updateUser(userId: string, updatedUser: UpdateUser) {
  const [result] = await db()
    .update(user)
    .set(updatedUser)
    .where(eq(user.id, userId))
    .returning();

  return result;
}

export async function findUserById(userId: string) {
  const [result] = await db().select().from(user).where(eq(user.id, userId));

  return normalizeUserMedia(result as User);
}

export async function getUsers({
  page = 1,
  limit = 30,
  email,
}: {
  email?: string;
  page?: number;
  limit?: number;
} = {}): Promise<User[]> {
  const result = await db()
    .select()
    .from(user)
    .where(email ? eq(user.email, email) : undefined)
    .orderBy(desc(user.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return result.map((item: UnsafeAny) => normalizeUserMedia(item as User) as User);
}

export async function getUsersCount({ email }: { email?: string }) {
  const [result] = await db()
    .select({ count: count() })
    .from(user)
    .where(email ? eq(user.email, email) : undefined);
  return result?.count || 0;
}

export async function getUserByUserIds(userIds: string[]) {
  const result = await db()
    .select()
    .from(user)
    .where(inArray(user.id, userIds));

  return result.map((item: UnsafeAny) => normalizeUserMedia(item as User) as User);
}

export async function getUserInfo() {
  const signUser = await getSignUser();

  return normalizeUserMedia(signUser as User);
}

export async function getUserCredits(userId: string) {
  const remainingCredits = await getRemainingCredits(userId);

  return { remainingCredits };
}

export async function getSignUser() {
  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return normalizeUserMedia(session?.user as User);
}

export async function isEmailVerified(email: string): Promise<boolean> {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;

  const [row] = await db()
    .select({ emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.email, normalized))
    .limit(1);

  return !!row?.emailVerified;
}

export async function appendUserToResult(result: UnsafeAny) {
  if (!result || !result.length) {
    return result;
  }

  const userIds = result.map((item: UnsafeAny) => item.userId);
  const users = await getUserByUserIds(userIds);
  result = result.map((item: UnsafeAny) => {
    const user = users.find((user: UnsafeAny) => user.id === item.userId);
    return { ...item, user };
  });

  return result;
}
