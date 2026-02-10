import { randomUUID } from 'node:crypto';

import { AIFile, AIMediaType, AIProvider } from './types';
import { toAssetRef } from '@/shared/lib/asset-ref';
import {
  createMediaAsset,
  MediaAssetOwnerType,
  MediaAssetPurpose,
  MediaAssetSource,
  MediaAssetStatus,
} from '@/shared/models/media_asset';
import { buildMediaObjectKey } from '@/shared/services/media-asset';

export * from './types';

/**
 * AI Manager to manage all AI providers
 */
export class AIManager {
  // ai providers
  private providers: AIProvider[] = [];
  // default ai provider
  private defaultProvider?: AIProvider;

  // add ai provider
  addProvider(provider: AIProvider, isDefault = false) {
    this.providers.push(provider);
    if (isDefault) {
      this.defaultProvider = provider;
    }
  }

  // get provider by name
  getProvider(name: string): AIProvider | undefined {
    return this.providers.find((p) => p.name === name);
  }

  // get all provider names
  getProviderNames(): string[] {
    return this.providers.map((p) => p.name);
  }

  // get all media types
  getMediaTypes(): string[] {
    return Object.values(AIMediaType);
  }

  getDefaultProvider(): AIProvider | undefined {
    // set default provider if not set
    if (!this.defaultProvider && this.providers.length > 0) {
      this.defaultProvider = this.providers[0];
    }

    return this.defaultProvider;
  }
}

type SaveFilesContext = {
  userId?: string;
  ownerType?: MediaAssetOwnerType;
  ownerId?: string;
  provider?: string;
  linkedTaskId?: string;
  source?: MediaAssetSource;
  status?: MediaAssetStatus;
  expiresAt?: Date | null;
  purposeByType?: Partial<Record<string, MediaAssetPurpose>>;
};

function inferPurposeByType(
  type?: string,
  purposeByType?: Partial<Record<string, MediaAssetPurpose>>
) {
  if (type && purposeByType?.[type]) {
    return purposeByType[type] as MediaAssetPurpose;
  }

  switch (type) {
    case 'video':
      return MediaAssetPurpose.GENERATED_VIDEO;
    case 'audio':
      return MediaAssetPurpose.GENERATED_AUDIO;
    case 'image':
    default:
      return MediaAssetPurpose.GENERATED_IMAGE;
  }
}

function inferMediaType(contentType: string) {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'file';
}

function extensionFromContentType(contentType: string, fallbackKey?: string) {
  const normalized = String(contentType || '').toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
  };

  if (map[normalized]) {
    return map[normalized];
  }

  const fromKey = String(fallbackKey || '')
    .split('?')[0]
    .split('#')[0]
    .split('.')
    .pop();
  if (fromKey) {
    return fromKey.toLowerCase();
  }

  return 'bin';
}

// save files to custom storage
export async function saveFiles(files: AIFile[], context: SaveFilesContext = {}) {
  try {
    const { getStorageService } = await import('@/shared/services/storage');
    const storageService = await getStorageService();

    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const ownerType =
          context.ownerType ||
          (context.userId ? MediaAssetOwnerType.USER : undefined);
        const ownerId = context.ownerId || context.userId;
        const purpose = inferPurposeByType(file.type, context.purposeByType);
        const extension = extensionFromContentType(file.contentType, file.key);
        const uploadKey =
          ownerType && ownerId
            ? buildMediaObjectKey({
                ownerType,
                ownerId,
                purpose,
                extension,
              })
            : file.key;

        const result = await storageService.downloadAndUpload({
          url: file.url,
          contentType: file.contentType,
          key: uploadKey,
        });

        let resolvedUrl = result.url || file.url;

        if (
          result.success &&
          result.key &&
          ownerType &&
          ownerId &&
          context.status !== MediaAssetStatus.DELETED
        ) {
          const mediaAsset = await createMediaAsset({
            id: randomUUID(),
            ownerType,
            ownerId,
            purpose,
            mediaType: inferMediaType(file.contentType || ''),
            provider: context.provider || result.provider,
            bucket: result.bucket || null,
            objectKey: result.key,
            mimeType: file.contentType || 'application/octet-stream',
            sizeBytes: null,
            checksumSha256: null,
            status: context.status || MediaAssetStatus.ACTIVE,
            source: context.source || MediaAssetSource.AI_MIRROR,
            linkedTaskId: context.linkedTaskId || null,
            expiresAt: context.expiresAt || null,
          });
          resolvedUrl = toAssetRef(mediaAsset.id);
        }

        return {
          ...file,
          url: resolvedUrl,
        } as AIFile;
      })
    );

    return uploadedFiles;
  } catch (error) {
    console.error('save files failed:', error);
    return undefined;
  }
}

// ai manager
export const aiManager = new AIManager();

export * from './kie';
export * from './replicate';
export * from './gemini';
export * from './fal';
