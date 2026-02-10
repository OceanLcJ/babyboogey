import { and, count, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/core/db';
import { mediaAsset } from '@/config/db/schema';

export type MediaAsset = typeof mediaAsset.$inferSelect;
export type NewMediaAsset = typeof mediaAsset.$inferInsert;
export type UpdateMediaAsset = Partial<Omit<NewMediaAsset, 'id' | 'createdAt'>>;

export enum MediaAssetOwnerType {
  USER = 'user',
  GUEST = 'guest',
  SYSTEM = 'system',
}

export enum MediaAssetStatus {
  ACTIVE = 'active',
  TEMP = 'temp',
  DELETED = 'deleted',
}

export enum MediaAssetSource {
  UPLOAD = 'upload',
  AI_MIRROR = 'ai_mirror',
  MIGRATION = 'migration',
}

export enum MediaAssetPurpose {
  AVATAR = 'avatar',
  REFERENCE_IMAGE = 'reference_image',
  POST_IMAGE = 'post_image',
  POST_AUTHOR_IMAGE = 'post_author_image',
  GENERATED_IMAGE = 'generated_image',
  GENERATED_VIDEO = 'generated_video',
  GENERATED_AUDIO = 'generated_audio',
}

export async function createMediaAsset(newMediaAsset: NewMediaAsset) {
  const [result] = await db().insert(mediaAsset).values(newMediaAsset).returning();
  return result;
}

export async function updateMediaAssetById(
  id: string,
  updateMediaAsset: UpdateMediaAsset
) {
  const [result] = await db()
    .update(mediaAsset)
    .set(updateMediaAsset)
    .where(eq(mediaAsset.id, id))
    .returning();

  return result;
}

export async function findMediaAssetById(id: string) {
  const [result] = await db()
    .select()
    .from(mediaAsset)
    .where(eq(mediaAsset.id, id))
    .limit(1);

  return result;
}

export async function findMediaAssetsByIds(ids: string[]) {
  if (!ids.length) {
    return [] as MediaAsset[];
  }

  const result = await db()
    .select()
    .from(mediaAsset)
    .where(inArray(mediaAsset.id, ids));

  return result;
}

export async function getMediaAssets({
  ownerType,
  ownerId,
  status,
  purpose,
  page = 1,
  limit = 50,
}: {
  ownerType?: MediaAssetOwnerType;
  ownerId?: string;
  status?: MediaAssetStatus;
  purpose?: MediaAssetPurpose;
  page?: number;
  limit?: number;
}) {
  const result = await db()
    .select()
    .from(mediaAsset)
    .where(
      and(
        ownerType ? eq(mediaAsset.ownerType, ownerType) : undefined,
        ownerId ? eq(mediaAsset.ownerId, ownerId) : undefined,
        status ? eq(mediaAsset.status, status) : undefined,
        purpose ? eq(mediaAsset.purpose, purpose) : undefined
      )
    )
    .orderBy(desc(mediaAsset.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return result;
}

export async function getMediaAssetsCount({
  ownerType,
  ownerId,
  status,
  purpose,
}: {
  ownerType?: MediaAssetOwnerType;
  ownerId?: string;
  status?: MediaAssetStatus;
  purpose?: MediaAssetPurpose;
}) {
  const [result] = await db()
    .select({ count: count() })
    .from(mediaAsset)
    .where(
      and(
        ownerType ? eq(mediaAsset.ownerType, ownerType) : undefined,
        ownerId ? eq(mediaAsset.ownerId, ownerId) : undefined,
        status ? eq(mediaAsset.status, status) : undefined,
        purpose ? eq(mediaAsset.purpose, purpose) : undefined
      )
    );

  return result?.count || 0;
}
