#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { eq, isNotNull } from 'drizzle-orm';

import { envConfigs } from '@/config';
import { db } from '@/core/db';
import { aiTask, post, user } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';
import { toAssetRef } from '@/shared/lib/asset-ref';
import {
  createMediaAsset,
  MediaAssetOwnerType,
  MediaAssetPurpose,
  MediaAssetSource,
  MediaAssetStatus,
} from '@/shared/models/media_asset';
import {
  buildMediaObjectKey,
  inferMediaTypeFromMime,
} from '@/shared/services/media-asset';
import { getStorageService } from '@/shared/services/storage';

const DEFAULT_MANIFEST_PATH = path.resolve(
  process.cwd(),
  'docs/media-asset-migration-manifest.json'
);
const SYSTEM_OWNER_ID = 'system';

type Args = {
  dryRun: boolean;
  limit?: number;
  manifestPath: string;
};

type ManifestEntryStatus = 'migrated' | 'failed' | 'skipped' | 'dry-run';

type ManifestEntry = {
  entity: 'user' | 'post' | 'ai_task';
  entityId: string;
  field: string;
  from: string;
  to?: string;
  ownerType: string;
  ownerId: string;
  purpose: string;
  status: ManifestEntryStatus;
  error?: string;
};

type Manifest = {
  schemaVersion: number;
  generatedAt: string;
  dryRun: boolean;
  summary: {
    migrated: number;
    failed: number;
    skipped: number;
    dryRun: number;
  };
  entries: ManifestEntry[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--limit') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --limit');
      args.limit = Number(next);
      i += 1;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      args.limit = Number(arg.split('=')[1]);
      continue;
    }
    if (arg === '--manifest') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --manifest');
      args.manifestPath = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (arg.startsWith('--manifest=')) {
      args.manifestPath = path.resolve(process.cwd(), arg.split('=')[1]);
      continue;
    }
  }

  if (args.limit !== undefined) {
    if (!Number.isFinite(args.limit) || args.limit <= 0) {
      throw new Error(`Invalid --limit value: ${args.limit}`);
    }
    args.limit = Math.floor(args.limit);
  }

  return args;
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeManifest(manifestPath: string, manifest: Manifest) {
  ensureDir(manifestPath);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
  };
  return map[mimeType.toLowerCase()] || '';
}

function extFromUrl(rawUrl: string): string {
  const clean = rawUrl.split('?')[0].split('#')[0];
  const ext = clean.split('.').pop();
  return ext ? ext.toLowerCase() : '';
}

function normalizeUrl(rawUrl: string): string | null {
  const value = String(rawUrl || '').trim();
  if (!value) {
    return null;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  if (value.startsWith('/')) {
    const base = String(envConfigs.app_url || '').replace(/\/$/, '');
    if (!base) {
      return null;
    }
    return `${base}${value}`;
  }

  return null;
}

async function fetchBinary(rawUrl: string) {
  const fetchUrl = normalizeUrl(rawUrl);
  if (!fetchUrl) {
    throw new Error('unsupported url format');
  }

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`download failed (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const body = new Uint8Array(arrayBuffer);
  const mimeTypeHeader = (response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const mimeType = mimeTypeHeader || 'application/octet-stream';

  return {
    body,
    mimeType,
  };
}

function isEmptyOrAssetRef(value?: string | null) {
  const current = String(value || '').trim();
  if (!current) {
    return true;
  }
  if (current.startsWith('asset://')) {
    return true;
  }
  if (
    current.startsWith('/api/storage/assets/') ||
    current.includes('/api/storage/assets/')
  ) {
    return true;
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest: Manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    summary: {
      migrated: 0,
      failed: 0,
      skipped: 0,
      dryRun: 0,
    },
    entries: [],
  };

  const cache = new Map<string, string>();
  const storageService = args.dryRun ? null : await getStorageService();

  const pushEntry = (entry: ManifestEntry) => {
    manifest.entries.push(entry);
    if (entry.status === 'migrated') manifest.summary.migrated += 1;
    if (entry.status === 'failed') manifest.summary.failed += 1;
    if (entry.status === 'skipped') manifest.summary.skipped += 1;
    if (entry.status === 'dry-run') manifest.summary.dryRun += 1;
  };

  const migrateSingleUrl = async ({
    entity,
    entityId,
    field,
    rawUrl,
    ownerType,
    ownerId,
    purpose,
    linkedTaskId,
  }: {
    entity: ManifestEntry['entity'];
    entityId: string;
    field: string;
    rawUrl: string;
    ownerType: MediaAssetOwnerType;
    ownerId: string;
    purpose: MediaAssetPurpose;
    linkedTaskId?: string | null;
  }): Promise<string | null> => {
    if (isEmptyOrAssetRef(rawUrl)) {
      pushEntry({
        entity,
        entityId,
        field,
        from: rawUrl,
        to: rawUrl,
        ownerType,
        ownerId,
        purpose,
        status: 'skipped',
      });
      return rawUrl;
    }

    const normalized = normalizeUrl(rawUrl);
    if (!normalized) {
      pushEntry({
        entity,
        entityId,
        field,
        from: rawUrl,
        ownerType,
        ownerId,
        purpose,
        status: 'skipped',
        error: 'unsupported url format',
      });
      return rawUrl;
    }

    const cacheKey = [ownerType, ownerId, purpose, normalized].join('|');
    const cached = cache.get(cacheKey);
    if (cached) {
      pushEntry({
        entity,
        entityId,
        field,
        from: rawUrl,
        to: cached,
        ownerType,
        ownerId,
        purpose,
        status: args.dryRun ? 'dry-run' : 'migrated',
      });
      return cached;
    }

    if (args.dryRun) {
      const dryRunAssetRef = toAssetRef(`dryrun-${createHash('md5').update(cacheKey).digest('hex').slice(0, 16)}`);
      cache.set(cacheKey, dryRunAssetRef);
      pushEntry({
        entity,
        entityId,
        field,
        from: rawUrl,
        to: dryRunAssetRef,
        ownerType,
        ownerId,
        purpose,
        status: 'dry-run',
      });
      return dryRunAssetRef;
    }

    try {
      const { body, mimeType } = await fetchBinary(rawUrl);
      const ext = extFromMime(mimeType) || extFromUrl(normalized) || 'bin';
      const objectKey = buildMediaObjectKey({
        ownerType,
        ownerId,
        purpose,
        extension: ext,
      });

      const uploadResult = await storageService!.uploadFile({
        body,
        key: objectKey,
        contentType: mimeType,
        disposition: 'inline',
      });

      if (!uploadResult.success || !uploadResult.key) {
        throw new Error(uploadResult.error || 'upload failed');
      }

      const checksumSha256 = createHash('sha256').update(body).digest('hex');
      const assetId = getUuid();
      const mediaAsset = await createMediaAsset({
        id: assetId,
        ownerType,
        ownerId,
        purpose,
        mediaType: inferMediaTypeFromMime(mimeType),
        provider: uploadResult.provider,
        bucket: uploadResult.bucket || null,
        objectKey: uploadResult.key,
        mimeType,
        sizeBytes: body.length,
        checksumSha256,
        status: MediaAssetStatus.ACTIVE,
        source: MediaAssetSource.MIGRATION,
        linkedTaskId: linkedTaskId || null,
        expiresAt: null,
      });

      const assetRef = toAssetRef(mediaAsset.id);
      cache.set(cacheKey, assetRef);
      pushEntry({
        entity,
        entityId,
        field,
        from: rawUrl,
        to: assetRef,
        ownerType,
        ownerId,
        purpose,
        status: 'migrated',
      });
      return assetRef;
    } catch (error: any) {
      pushEntry({
        entity,
        entityId,
        field,
        from: rawUrl,
        ownerType,
        ownerId,
        purpose,
        status: 'failed',
        error: error?.message || 'unknown error',
      });
      return rawUrl;
    }
  };

  // 1) user.image -> avatar (owner: user)
  const users = await db()
    .select({
      id: user.id,
      image: user.image,
    })
    .from(user)
    .where(isNotNull(user.image));

  for (const row of users.slice(0, args.limit || users.length)) {
    const current = String(row.image || '').trim();
    if (!current) continue;

    const migrated = await migrateSingleUrl({
      entity: 'user',
      entityId: row.id,
      field: 'image',
      rawUrl: current,
      ownerType: MediaAssetOwnerType.USER,
      ownerId: row.id,
      purpose: MediaAssetPurpose.AVATAR,
    });

    if (!args.dryRun && migrated && migrated !== current) {
      await db().update(user).set({ image: migrated }).where(eq(user.id, row.id));
    }
  }

  // 2) post.image / post.authorImage -> system owner
  const posts = await db()
    .select({
      id: post.id,
      image: post.image,
      authorImage: post.authorImage,
    })
    .from(post)
    .where(isNotNull(post.id));

  for (const row of posts.slice(0, args.limit || posts.length)) {
    const image = String(row.image || '').trim();
    if (image) {
      const migrated = await migrateSingleUrl({
        entity: 'post',
        entityId: row.id,
        field: 'image',
        rawUrl: image,
        ownerType: MediaAssetOwnerType.SYSTEM,
        ownerId: SYSTEM_OWNER_ID,
        purpose: MediaAssetPurpose.POST_IMAGE,
      });
      if (!args.dryRun && migrated && migrated !== image) {
        await db().update(post).set({ image: migrated }).where(eq(post.id, row.id));
      }
    }

    const authorImage = String(row.authorImage || '').trim();
    if (authorImage) {
      const migrated = await migrateSingleUrl({
        entity: 'post',
        entityId: row.id,
        field: 'authorImage',
        rawUrl: authorImage,
        ownerType: MediaAssetOwnerType.SYSTEM,
        ownerId: SYSTEM_OWNER_ID,
        purpose: MediaAssetPurpose.POST_AUTHOR_IMAGE,
      });
      if (!args.dryRun && migrated && migrated !== authorImage) {
        await db()
          .update(post)
          .set({ authorImage: migrated })
          .where(eq(post.id, row.id));
      }
    }
  }

  // 3) ai_task.taskInfo urls -> user owner
  const aiTasks = await db()
    .select({
      id: aiTask.id,
      userId: aiTask.userId,
      taskInfo: aiTask.taskInfo,
    })
    .from(aiTask)
    .where(isNotNull(aiTask.taskInfo));

  for (const row of aiTasks.slice(0, args.limit || aiTasks.length)) {
    const rawTaskInfo = String(row.taskInfo || '').trim();
    if (!rawTaskInfo) continue;

    let parsed: any;
    try {
      parsed = JSON.parse(rawTaskInfo);
    } catch {
      pushEntry({
        entity: 'ai_task',
        entityId: row.id,
        field: 'taskInfo',
        from: rawTaskInfo,
        ownerType: MediaAssetOwnerType.USER,
        ownerId: row.userId,
        purpose: 'mixed',
        status: 'failed',
        error: 'invalid taskInfo JSON',
      });
      continue;
    }

    let changed = false;

    if (Array.isArray(parsed?.images)) {
      for (let i = 0; i < parsed.images.length; i += 1) {
        const item = parsed.images[i];
        if (!item?.imageUrl) continue;
        const next = await migrateSingleUrl({
          entity: 'ai_task',
          entityId: row.id,
          field: `taskInfo.images[${i}].imageUrl`,
          rawUrl: String(item.imageUrl),
          ownerType: MediaAssetOwnerType.USER,
          ownerId: row.userId,
          purpose: MediaAssetPurpose.GENERATED_IMAGE,
          linkedTaskId: row.id,
        });
        if (next && next !== item.imageUrl) {
          parsed.images[i].imageUrl = next;
          changed = true;
        }
      }
    }

    if (Array.isArray(parsed?.videos)) {
      for (let i = 0; i < parsed.videos.length; i += 1) {
        const item = parsed.videos[i];
        if (item?.videoUrl) {
          const next = await migrateSingleUrl({
            entity: 'ai_task',
            entityId: row.id,
            field: `taskInfo.videos[${i}].videoUrl`,
            rawUrl: String(item.videoUrl),
            ownerType: MediaAssetOwnerType.USER,
            ownerId: row.userId,
            purpose: MediaAssetPurpose.GENERATED_VIDEO,
            linkedTaskId: row.id,
          });
          if (next && next !== item.videoUrl) {
            parsed.videos[i].videoUrl = next;
            changed = true;
          }
        }

        if (item?.thumbnailUrl) {
          const nextThumbnail = await migrateSingleUrl({
            entity: 'ai_task',
            entityId: row.id,
            field: `taskInfo.videos[${i}].thumbnailUrl`,
            rawUrl: String(item.thumbnailUrl),
            ownerType: MediaAssetOwnerType.USER,
            ownerId: row.userId,
            purpose: MediaAssetPurpose.GENERATED_IMAGE,
            linkedTaskId: row.id,
          });
          if (nextThumbnail && nextThumbnail !== item.thumbnailUrl) {
            parsed.videos[i].thumbnailUrl = nextThumbnail;
            changed = true;
          }
        }
      }
    }

    if (Array.isArray(parsed?.songs)) {
      for (let i = 0; i < parsed.songs.length; i += 1) {
        const item = parsed.songs[i];
        if (item?.audioUrl) {
          const nextAudio = await migrateSingleUrl({
            entity: 'ai_task',
            entityId: row.id,
            field: `taskInfo.songs[${i}].audioUrl`,
            rawUrl: String(item.audioUrl),
            ownerType: MediaAssetOwnerType.USER,
            ownerId: row.userId,
            purpose: MediaAssetPurpose.GENERATED_AUDIO,
            linkedTaskId: row.id,
          });
          if (nextAudio && nextAudio !== item.audioUrl) {
            parsed.songs[i].audioUrl = nextAudio;
            changed = true;
          }
        }

        if (item?.imageUrl) {
          const nextImage = await migrateSingleUrl({
            entity: 'ai_task',
            entityId: row.id,
            field: `taskInfo.songs[${i}].imageUrl`,
            rawUrl: String(item.imageUrl),
            ownerType: MediaAssetOwnerType.USER,
            ownerId: row.userId,
            purpose: MediaAssetPurpose.GENERATED_IMAGE,
            linkedTaskId: row.id,
          });
          if (nextImage && nextImage !== item.imageUrl) {
            parsed.songs[i].imageUrl = nextImage;
            changed = true;
          }
        }
      }
    }

    if (changed && !args.dryRun) {
      await db()
        .update(aiTask)
        .set({ taskInfo: JSON.stringify(parsed) })
        .where(eq(aiTask.id, row.id));
    }
  }

  manifest.generatedAt = new Date().toISOString();
  writeManifest(args.manifestPath, manifest);

  console.log('media migration finished');
  console.log(`manifest: ${args.manifestPath}`);
  console.log(
    `migrated=${manifest.summary.migrated} failed=${manifest.summary.failed} skipped=${manifest.summary.skipped} dryRun=${manifest.summary.dryRun}`
  );
}

main().catch((error) => {
  console.error('media migration failed:', error);
  process.exit(1);
});
