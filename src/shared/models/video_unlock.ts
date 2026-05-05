import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/core/db';
import { videoUnlock } from '@/config/db/schema';

export type VideoUnlock = typeof videoUnlock.$inferSelect;
export type NewVideoUnlock = typeof videoUnlock.$inferInsert;
export type UpdateVideoUnlock = Partial<
  Omit<NewVideoUnlock, 'id' | 'createdAt'>
>;

export enum VideoUnlockStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  REFUNDED = 'refunded',
  CANCELED = 'canceled',
}

export async function createVideoUnlock(newVideoUnlock: NewVideoUnlock) {
  const [result] = await db()
    .insert(videoUnlock)
    .values(newVideoUnlock)
    .returning();

  return result;
}

export async function findVideoUnlockByOrderNo(orderNo: string) {
  const [result] = await db()
    .select()
    .from(videoUnlock)
    .where(eq(videoUnlock.orderNo, orderNo))
    .limit(1);

  return result;
}

export async function findActiveVideoUnlock({
  userId,
  taskId,
  assetId,
}: {
  userId: string;
  taskId: string;
  assetId?: string;
}) {
  const [result] = await db()
    .select()
    .from(videoUnlock)
    .where(
      and(
        eq(videoUnlock.userId, userId),
        eq(videoUnlock.taskId, taskId),
        assetId ? eq(videoUnlock.assetId, assetId) : undefined,
        eq(videoUnlock.status, VideoUnlockStatus.ACTIVE)
      )
    )
    .orderBy(desc(videoUnlock.createdAt))
    .limit(1);

  return result;
}

export async function getActiveVideoUnlocksForTasks({
  userId,
  taskIds,
}: {
  userId: string;
  taskIds: string[];
}) {
  const ids = Array.from(new Set(taskIds.filter(Boolean)));
  if (!ids.length) {
    return [] as VideoUnlock[];
  }

  const result = await db()
    .select()
    .from(videoUnlock)
    .where(
      and(
        eq(videoUnlock.userId, userId),
        inArray(videoUnlock.taskId, ids),
        eq(videoUnlock.status, VideoUnlockStatus.ACTIVE)
      )
    );

  return result;
}

export async function updateVideoUnlockByOrderNo({
  orderNo,
  updateVideoUnlock,
}: {
  orderNo: string;
  updateVideoUnlock: UpdateVideoUnlock;
}) {
  const [result] = await db()
    .update(videoUnlock)
    .set(updateVideoUnlock)
    .where(eq(videoUnlock.orderNo, orderNo))
    .returning();

  return result;
}
