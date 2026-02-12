import { createHmac, timingSafeEqual } from 'node:crypto';

import { envConfigs } from '@/config';
import { getUuid } from '@/shared/lib/hash';
import { getAssetIdFromRef } from '@/shared/lib/asset-ref';
import {
  findMediaAssetsByIds,
  MediaAsset,
  MediaAssetOwnerType,
  MediaAssetStatus,
} from '@/shared/models/media_asset';

export const GUEST_UPLOAD_SESSION_COOKIE = 'guest_upload_session';
export const DEFAULT_SIGNED_ASSET_EXPIRES_SECONDS = 60 * 10;
export const GUEST_UPLOAD_EXPIRES_SECONDS = 60 * 60 * 24;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function mediaAssetSecret() {
  return (
    envConfigs.auth_secret ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'media-asset-dev-secret'
  );
}

function signAssetPayload(payload: string): string {
  return base64url(
    createHmac('sha256', mediaAssetSecret()).update(payload).digest()
  );
}

function trimTrailingSlash(input: string): string {
  return input.endsWith('/') ? input.slice(0, -1) : input;
}

function safePathSegment(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100) || 'unknown';
}

export function issueGuestUploadSessionId(): string {
  return getUuid();
}

export function buildMediaObjectKey({
  ownerType,
  ownerId,
  purpose,
  extension,
  now = new Date(),
}: {
  ownerType: string;
  ownerId: string;
  purpose: string;
  extension: string;
  now?: Date;
}) {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = extension.replace(/^\./, '').toLowerCase() || 'bin';
  return [
    'private',
    'media',
    safePathSegment(ownerType),
    safePathSegment(ownerId),
    safePathSegment(purpose),
    yyyy,
    mm,
    `${getUuid()}.${ext}`,
  ].join('/');
}

export function createSignedAssetToken({
  assetId,
  expiresAtEpochSeconds,
}: {
  assetId: string;
  expiresAtEpochSeconds: number;
}) {
  const payload = `${assetId}.${expiresAtEpochSeconds}`;
  const signature = signAssetPayload(payload);
  return `v1.${expiresAtEpochSeconds}.${signature}`;
}

export function verifySignedAssetToken({
  assetId,
  token,
}: {
  assetId: string;
  token?: string | null;
}) {
  if (!token) {
    return false;
  }

  const [version, expiresAtRaw, signatureRaw] = String(token).split('.');
  if (version !== 'v1' || !expiresAtRaw || !signatureRaw) {
    return false;
  }

  const expiresAtEpochSeconds = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAtEpochSeconds)) {
    return false;
  }

  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  if (expiresAtEpochSeconds < nowEpochSeconds) {
    return false;
  }

  const payload = `${assetId}.${expiresAtEpochSeconds}`;
  const expectedSignature = signAssetPayload(payload);

  const actual = Buffer.from(signatureRaw);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

export function createSignedAssetUrl({
  assetId,
  expiresInSeconds = DEFAULT_SIGNED_ASSET_EXPIRES_SECONDS,
  absolute = false,
}: {
  assetId: string;
  expiresInSeconds?: number;
  absolute?: boolean;
}) {
  const ttl = Math.max(30, Math.min(60 * 60 * 24, Math.floor(expiresInSeconds)));
  const expiresAtEpochSeconds = Math.floor(Date.now() / 1000) + ttl;
  const token = createSignedAssetToken({
    assetId,
    expiresAtEpochSeconds,
  });
  const path = `/api/storage/assets/${encodeURIComponent(assetId)}?token=${encodeURIComponent(token)}`;

  if (!absolute) {
    return {
      url: path,
      expiresAtEpochSeconds,
    };
  }

  const baseUrl = trimTrailingSlash(envConfigs.app_url || 'http://localhost:3000');
  return {
    url: `${baseUrl}${path}`,
    expiresAtEpochSeconds,
  };
}

export function canAccessMediaAsset({
  asset,
  userId,
  guestSessionId,
}: {
  asset: MediaAsset;
  userId?: string | null;
  guestSessionId?: string | null;
}) {
  if (!asset) {
    return false;
  }

  if (asset.expiresAt && new Date(asset.expiresAt).getTime() < Date.now()) {
    return false;
  }

  if (asset.ownerType === MediaAssetOwnerType.SYSTEM) {
    return true;
  }

  if (asset.ownerType === MediaAssetOwnerType.USER) {
    return Boolean(userId && asset.ownerId === userId);
  }

  if (asset.ownerType === MediaAssetOwnerType.GUEST) {
    return Boolean(guestSessionId && asset.ownerId === guestSessionId);
  }

  return false;
}

export function resolveMediaRefForDisplayUrl(value?: string | null): string {
  if (!value) {
    return '';
  }

  const assetId = getAssetIdFromRef(value);
  if (!assetId) {
    return value;
  }

  return `/api/storage/assets/${encodeURIComponent(assetId)}`;
}

export function inferMediaTypeFromMime(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

export function collectAssetIdsFromValue(
  value: unknown,
  assetIds: Set<string> = new Set()
): Set<string> {
  if (typeof value === 'string') {
    const assetId = getAssetIdFromRef(value);
    if (assetId) {
      assetIds.add(assetId);
    }
    return assetIds;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectAssetIdsFromValue(item, assetIds);
    }
    return assetIds;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      collectAssetIdsFromValue(item, assetIds);
    }
  }

  return assetIds;
}

function replaceAssetRefsWithUrlMap(
  value: unknown,
  urlMap: Map<string, string>
): unknown {
  if (typeof value === 'string') {
    const assetId = getAssetIdFromRef(value);
    if (!assetId) {
      return value;
    }

    return urlMap.get(assetId) || value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceAssetRefsWithUrlMap(item, urlMap));
  }

  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      result[key] = replaceAssetRefsWithUrlMap(item, urlMap);
    }
    return result;
  }

  return value;
}

export async function resolveAssetRefsWithSignedUrls({
  value,
  userId,
  guestSessionId,
  expiresInSeconds = DEFAULT_SIGNED_ASSET_EXPIRES_SECONDS,
  absolute = false,
}: {
  value: unknown;
  userId?: string | null;
  guestSessionId?: string | null;
  expiresInSeconds?: number;
  absolute?: boolean;
}) {
  const assetIds = Array.from(collectAssetIdsFromValue(value));
  if (!assetIds.length) {
    return value;
  }

  const assets = await findMediaAssetsByIds(assetIds);
  if (!assets.length) {
    return value;
  }

  const urlMap = new Map<string, string>();
  for (const asset of assets) {
    if (!asset || asset.status === MediaAssetStatus.DELETED) {
      continue;
    }
    if (asset.expiresAt && new Date(asset.expiresAt).getTime() < Date.now()) {
      continue;
    }

    const allowed = canAccessMediaAsset({
      asset,
      userId,
      guestSessionId,
    });
    if (!allowed) {
      continue;
    }

    const signed = createSignedAssetUrl({
      assetId: asset.id,
      expiresInSeconds,
      absolute,
    });
    urlMap.set(asset.id, signed.url);
  }

  if (!urlMap.size) {
    return value;
  }

  return replaceAssetRefsWithUrlMap(value, urlMap);
}
