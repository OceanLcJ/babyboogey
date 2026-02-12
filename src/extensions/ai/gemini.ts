import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';

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

import {
  AIConfigs,
  AIGenerateParams,
  AIImage,
  AIMediaType,
  AIProvider,
  AITaskResult,
  AITaskStatus,
} from './types';

/**
 * Gemini configs
 */
export interface GeminiConfigs extends AIConfigs {
  apiKey: string;
}

/**
 * Gemini provider
 */
export class GeminiProvider implements AIProvider {
  // provider name
  readonly name = 'gemini';
  // provider configs
  configs: GeminiConfigs;

  // init provider
  constructor(configs: GeminiConfigs) {
    this.configs = configs;
  }

  // generate task
  async generate({
    params,
  }: {
    params: AIGenerateParams;
  }): Promise<AITaskResult> {
    const { mediaType, model, prompt, options, userId } = params;

    if (mediaType !== AIMediaType.IMAGE) {
      throw new Error(`mediaType not supported: ${mediaType}`);
    }

    if (!model) {
      throw new Error('model is required');
    }

    if (!prompt) {
      throw new Error('prompt is required');
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.configs.apiKey}`;

    const requestParts: any[] = [
      {
        text: prompt,
      },
    ];

    if (options && options.image_input && Array.isArray(options.image_input)) {
      for (const imageUrl of options.image_input) {
        try {
          const imageResp = await fetch(imageUrl);
          if (imageResp.ok) {
            const arrayBuffer = await imageResp.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64Image = buffer.toString('base64');
            const mimeType =
              imageResp.headers.get('content-type') || 'image/jpeg';

            requestParts.push({
              inlineData: {
                mimeType,
                data: base64Image,
              },
            });
          }
        } catch (e) {
          console.error('failed to fetch image input', imageUrl, e);
        }
      }
    }

    const { image_input, ...generationConfig } = options || {};

    const payload = {
      contents: {
        role: 'user',
        parts: requestParts,
      },
      generation_config: {
        response_modalities: ['TEXT', 'IMAGE'],
        ...generationConfig,
      },
    };

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(
        `request failed with status: ${resp.status}, body: ${errorText}`
      );
    }

    const data = await resp.json();

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('no candidates returned');
    }

    const taskId = nanoid(); // Gemini API doesn't return a task ID for synchronous generation
    const candidate = data.candidates[0];
    const parts = candidate.content?.parts;

    if (!parts || parts.length === 0) {
      throw new Error('no parts returned');
    }

    const imagePart = parts.find((p: any) => p.inlineData);

    if (!imagePart) {
      throw new Error('no image part returned');
    }

    const mimeType = imagePart.inlineData.mimeType;
    const base64Data = imagePart.inlineData.data;

    // upload to storage
    const { getStorageService } = await import('@/shared/services/storage');
    const storageService = await getStorageService();
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = mimeType.split('/')[1] || 'png';
    const ownerType = userId ? MediaAssetOwnerType.USER : MediaAssetOwnerType.SYSTEM;
    const ownerId = userId || 'system';
    const key = buildMediaObjectKey({
      ownerType,
      ownerId,
      purpose: MediaAssetPurpose.GENERATED_IMAGE,
      extension: ext,
    });

    const uploadResult = await storageService.uploadFile({
      body: buffer,
      key,
      contentType: mimeType,
    });

    if (!uploadResult || !uploadResult.key) {
      throw new Error('upload image failed');
    }

    let imageUrl = uploadResult.url || '';

    if (userId) {
      const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
      const asset = await createMediaAsset({
        id: getUuid(),
        ownerType: MediaAssetOwnerType.USER,
        ownerId: userId,
        purpose: MediaAssetPurpose.GENERATED_IMAGE,
        mediaType: inferMediaTypeFromMime(mimeType),
        provider: this.name,
        bucket: uploadResult.bucket || null,
        objectKey: uploadResult.key,
        mimeType,
        sizeBytes: buffer.length,
        checksumSha256,
        status: MediaAssetStatus.ACTIVE,
        source: MediaAssetSource.AI_MIRROR,
        linkedTaskId: null,
        expiresAt: null,
      });
      imageUrl = toAssetRef(asset.id);
    }

    // replace base64 data with url to save db space
    if (imagePart.inlineData) {
      imagePart.inlineData.data = imageUrl;
      // Ensure the original data object is updated
      const partIndex = parts.findIndex((p: any) => p === imagePart);
      if (partIndex !== -1 && data.candidates?.[0]?.content?.parts) {
        // unset image base64 data
        data.candidates[0].content.parts[partIndex].inlineData.data =
          imageUrl;
        // unset thoughtSignature
        data.candidates[0].content.parts[partIndex].thoughtSignature = '';
      }
    }

    const image: AIImage = {
      id: nanoid(),
      createTime: new Date(),
      imageType: mimeType,
      imageUrl,
    };

    return {
      taskStatus: AITaskStatus.SUCCESS,
      taskId: taskId,
      taskInfo: {
        images: [image],
        status: 'success',
        createTime: new Date(),
      },
      taskResult: data,
    };
  }
}
