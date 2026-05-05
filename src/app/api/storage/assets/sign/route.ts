import { NextRequest, NextResponse } from 'next/server';

import { getAssetIdFromRef, toAssetRef } from '@/shared/lib/asset-ref';
import {
  findMediaAssetById,
  MediaAssetStatus,
} from '@/shared/models/media_asset';
import { getUserInfo } from '@/shared/models/user';
import {
  canAccessMediaAssetForRequest,
  createSignedAssetUrl,
  DEFAULT_SIGNED_ASSET_EXPIRES_SECONDS,
  GUEST_UPLOAD_SESSION_COOKIE,
  MediaAssetAccessMode,
} from '@/shared/services/media-asset';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const inputAssetIds = Array.isArray(body?.assetIds) ? body.assetIds : [];
    const inputAssetRefs = Array.isArray(body?.assetRefs) ? body.assetRefs : [];
    const expiresInSecondsRaw =
      Number(body?.expiresInSeconds) || DEFAULT_SIGNED_ASSET_EXPIRES_SECONDS;
    const expiresInSeconds = Math.max(
      30,
      Math.min(60 * 60 * 24, expiresInSecondsRaw)
    );
    const accessMode: MediaAssetAccessMode =
      body?.accessMode === 'original' ? 'original' : 'preview';

    const assetIdsFromRefs = inputAssetRefs
      .map((item: unknown) => getAssetIdFromRef(item))
      .filter(Boolean);

    const assetIds = Array.from(
      new Set(
        [...inputAssetIds, ...assetIdsFromRefs]
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      )
    );

    if (!assetIds.length) {
      return NextResponse.json({
        code: -1,
        message: 'assetIds or assetRefs is required',
      });
    }

    const user = await getUserInfo();
    const guestSessionId =
      req.cookies.get(GUEST_UPLOAD_SESSION_COOKIE)?.value || null;

    const results: Array<{
      assetId: string;
      assetRef: string;
      url?: string;
      expiresAt?: string;
      error?: string;
    }> = [];

    for (const assetId of assetIds) {
      const asset = await findMediaAssetById(assetId);
      if (!asset || asset.status === MediaAssetStatus.DELETED) {
        results.push({
          assetId,
          assetRef: toAssetRef(assetId),
          error: 'asset not found',
        });
        continue;
      }

      if (asset.expiresAt && new Date(asset.expiresAt).getTime() < Date.now()) {
        results.push({
          assetId,
          assetRef: toAssetRef(assetId),
          error: 'asset expired',
        });
        continue;
      }

      const allowed = await canAccessMediaAssetForRequest({
        asset,
        userId: user?.id,
        guestSessionId,
        accessMode,
      });
      if (!allowed) {
        results.push({
          assetId,
          assetRef: toAssetRef(assetId),
          error: 'no permission',
        });
        continue;
      }

      const signed = createSignedAssetUrl({
        assetId,
        expiresInSeconds,
        accessMode,
      });
      results.push({
        assetId,
        assetRef: toAssetRef(assetId),
        url: signed.url,
        expiresAt: new Date(signed.expiresAtEpochSeconds * 1000).toISOString(),
      });
    }

    return NextResponse.json({
      code: 0,
      message: 'ok',
      data: {
        results,
      },
    });
  } catch (error: UnsafeAny) {
    console.error('sign assets failed:', error);
    return NextResponse.json({
      code: -1,
      message: error?.message || 'sign assets failed',
    });
  }
}
