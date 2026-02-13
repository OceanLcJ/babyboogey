import { NextRequest, NextResponse } from 'next/server';

import { getUserInfo } from '@/shared/models/user';
import { findMediaAssetById, MediaAssetStatus } from '@/shared/models/media_asset';
import {
  canAccessMediaAsset,
  GUEST_UPLOAD_SESSION_COOKIE,
  verifySignedAssetToken,
} from '@/shared/services/media-asset';
import { getStorageService } from '@/shared/services/storage';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await context.params;
    if (!assetId) {
      return new NextResponse('Missing assetId', { status: 400 });
    }

    const asset = await findMediaAssetById(assetId);
    if (!asset || asset.status === MediaAssetStatus.DELETED) {
      return new NextResponse('Asset not found', { status: 404 });
    }

    if (asset.expiresAt && new Date(asset.expiresAt).getTime() < Date.now()) {
      return new NextResponse('Asset expired', { status: 410 });
    }

    const token = req.nextUrl.searchParams.get('token');
    const tokenAuthorized = verifySignedAssetToken({ assetId, token });
    const guestSessionId =
      req.cookies.get(GUEST_UPLOAD_SESSION_COOKIE)?.value || null;
    const user = await getUserInfo();
    const ownerAuthorized = canAccessMediaAsset({
      asset,
      userId: user?.id,
      guestSessionId,
    });

    if (!tokenAuthorized && !ownerAuthorized) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const storageService = await getStorageService();
    const range = req.headers.get('range') || undefined;
    const objectResp = await storageService.getObject({
      key: asset.objectKey,
      bucket: asset.bucket || undefined,
      range,
    });

    if (!objectResp.ok && objectResp.status !== 206) {
      const errorText = await objectResp
        .text()
        .catch(() => 'Failed to fetch object');
      return new NextResponse(errorText || 'Failed to fetch object', {
        status: objectResp.status || 502,
      });
    }

    const headers = new Headers();
    const contentType =
      objectResp.headers.get('content-type') ||
      asset.mimeType ||
      'application/octet-stream';
    headers.set('Content-Type', contentType);

    const copyHeaders = [
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'last-modified',
      'content-disposition',
    ];
    for (const header of copyHeaders) {
      const value = objectResp.headers.get(header);
      if (value) {
        headers.set(header, value);
      }
    }

    if (asset.ownerType === 'system') {
      headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    } else {
      headers.set('Cache-Control', 'private, no-store');
    }

    return new NextResponse(objectResp.body, {
      status: objectResp.status,
      headers,
    });
  } catch (error: UnsafeAny) {
    console.error('get asset failed:', error);
    return new NextResponse(error?.message || 'Internal Server Error', {
      status: 500,
    });
  }
}
