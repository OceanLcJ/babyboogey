import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getUuid } from '@/shared/lib/hash';
import { toAssetRef } from '@/shared/lib/asset-ref';
import {
  createMediaAsset,
  MediaAssetOwnerType,
  MediaAssetPurpose,
  MediaAssetSource,
  MediaAssetStatus,
} from '@/shared/models/media_asset';
import { getUserInfo } from '@/shared/models/user';
import {
  buildMediaObjectKey,
  createSignedAssetUrl,
  GUEST_UPLOAD_EXPIRES_SECONDS,
  GUEST_UPLOAD_SESSION_COOKIE,
  inferMediaTypeFromMime,
  issueGuestUploadSessionId,
} from '@/shared/services/media-asset';
import { getStorageService } from '@/shared/services/storage';

const extFromMime = (mimeType: string) => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
  };
  return map[mimeType] || '';
};

function isValidPurpose(purpose: string): purpose is MediaAssetPurpose {
  return Object.values(MediaAssetPurpose).includes(purpose as MediaAssetPurpose);
}

function isValidSource(source: string): source is MediaAssetSource {
  return Object.values(MediaAssetSource).includes(source as MediaAssetSource);
}

function resolveOwnerForPurpose({
  userId,
  guestSessionId,
  purpose,
}: {
  userId?: string | null;
  guestSessionId?: string | null;
  purpose: MediaAssetPurpose;
}) {
  if (
    purpose === MediaAssetPurpose.POST_IMAGE ||
    purpose === MediaAssetPurpose.POST_AUTHOR_IMAGE
  ) {
    return {
      ownerType: MediaAssetOwnerType.SYSTEM,
      ownerId: 'system',
      status: MediaAssetStatus.ACTIVE,
      expiresAt: null as Date | null,
    };
  }

  if (userId) {
    return {
      ownerType: MediaAssetOwnerType.USER,
      ownerId: userId,
      status: MediaAssetStatus.ACTIVE,
      expiresAt: null as Date | null,
    };
  }

  return {
    ownerType: MediaAssetOwnerType.GUEST,
    ownerId: guestSessionId || issueGuestUploadSessionId(),
    status: MediaAssetStatus.TEMP,
    expiresAt: new Date(Date.now() + GUEST_UPLOAD_EXPIRES_SECONDS * 1000),
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const rawPurpose = String(
      formData.get('purpose') || MediaAssetPurpose.REFERENCE_IMAGE
    ).trim();
    const rawSource = String(
      formData.get('source') || MediaAssetSource.UPLOAD
    ).trim();

    if (!files || files.length === 0) {
      return NextResponse.json({ code: -1, message: 'No files provided' });
    }

    if (!isValidPurpose(rawPurpose)) {
      return NextResponse.json({ code: -1, message: 'Invalid purpose' });
    }
    const purpose = rawPurpose as MediaAssetPurpose;

    if (!isValidSource(rawSource)) {
      return NextResponse.json({ code: -1, message: 'Invalid source' });
    }
    const source = rawSource as MediaAssetSource;

    const user = await getUserInfo();
    const existingGuestSessionId =
      req.cookies.get(GUEST_UPLOAD_SESSION_COOKIE)?.value || '';

    if (
      !user &&
      purpose !== MediaAssetPurpose.REFERENCE_IMAGE
    ) {
      return NextResponse.json({
        code: -1,
        message: 'no auth, please sign in',
      });
    }

    const owner = resolveOwnerForPurpose({
      userId: user?.id,
      guestSessionId: existingGuestSessionId || undefined,
      purpose,
    });

    const storageService = await getStorageService();
    const results: Array<{
      assetId: string;
      assetRef: string;
      previewUrl: string;
      expiresAt: string | null;
      ownerType: MediaAssetOwnerType;
      ownerId: string;
      mimeType: string;
      purpose: MediaAssetPurpose;
      source: MediaAssetSource;
      key: string;
      sizeBytes: number;
    }> = [];

    for (const file of files) {
      if (!file || !file.size) {
        continue;
      }

      const arrayBuffer = await file.arrayBuffer();
      const body = new Uint8Array(arrayBuffer);
      const mimeType = file.type || 'application/octet-stream';
      const ext = extFromMime(mimeType) || file.name.split('.').pop() || 'bin';
      const mediaType = inferMediaTypeFromMime(mimeType);
      const objectKey = buildMediaObjectKey({
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        purpose,
        extension: ext,
      });

      const uploadResult = await storageService.uploadFile({
        body,
        key: objectKey,
        contentType: mimeType,
        disposition: 'inline',
      });

      if (!uploadResult.success || !uploadResult.key) {
        return NextResponse.json({
          code: -1,
          message: uploadResult.error || 'Upload failed',
        });
      }

      const checksumSha256 = createHash('sha256').update(body).digest('hex');
      const assetId = getUuid();
      const createdAsset = await createMediaAsset({
        id: assetId,
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        purpose,
        mediaType,
        provider: uploadResult.provider,
        bucket: uploadResult.bucket || null,
        objectKey: uploadResult.key,
        mimeType,
        sizeBytes: body.length,
        checksumSha256,
        status: owner.status,
        source,
        linkedTaskId: null,
        expiresAt: owner.expiresAt,
      });

      const signed = createSignedAssetUrl({
        assetId: createdAsset.id,
        expiresInSeconds:
          owner.ownerType === MediaAssetOwnerType.GUEST
            ? GUEST_UPLOAD_EXPIRES_SECONDS
            : 600,
      });

      results.push({
        assetId: createdAsset.id,
        assetRef: toAssetRef(createdAsset.id),
        previewUrl: signed.url,
        expiresAt: owner.expiresAt ? owner.expiresAt.toISOString() : null,
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        mimeType,
        purpose,
        source,
        key: uploadResult.key,
        sizeBytes: body.length,
      });
    }

    if (!results.length) {
      return NextResponse.json({
        code: -1,
        message: 'No valid files uploaded',
      });
    }

    const first = results[0];
    const response = NextResponse.json({
      code: 0,
      message: 'ok',
      data: {
        assetId: first.assetId,
        assetRef: first.assetRef,
        previewUrl: first.previewUrl,
        expiresAt: first.expiresAt,
        ownerType: first.ownerType,
        ownerId: first.ownerId,
        results,
      },
    });

    if (
      owner.ownerType === MediaAssetOwnerType.GUEST &&
      !existingGuestSessionId &&
      owner.ownerId
    ) {
      response.cookies.set(GUEST_UPLOAD_SESSION_COOKIE, owner.ownerId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: GUEST_UPLOAD_EXPIRES_SECONDS,
      });
    }

    return response;
  } catch (error: any) {
    console.error('upload media failed:', error);
    return NextResponse.json({
      code: -1,
      message: error?.message || 'upload media failed',
    });
  }
}
