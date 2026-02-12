import { cookies } from 'next/headers';

import { envConfigs } from '@/config';
import { AIGenerateParams, AIMediaType } from '@/extensions/ai';
import { getUuid } from '@/shared/lib/hash';
import { respData, respErr } from '@/shared/lib/resp';
import { createAITask, NewAITask } from '@/shared/models/ai_task';
import { getAllConfigs } from '@/shared/models/config';
import { getRemainingCredits } from '@/shared/models/credit';
import { hasPaidOrder } from '@/shared/models/order';
import { getCurrentSubscription } from '@/shared/models/subscription';
import { getUserInfo } from '@/shared/models/user';
import { getAIService } from '@/shared/services/ai';
import {
  collectAssetIdsFromValue,
  GUEST_UPLOAD_SESSION_COOKIE,
  resolveAssetRefsWithSignedUrls,
} from '@/shared/services/media-asset';

type VideoWatermarkMode = 'none' | 'dynamic_overlay';

function normalizeVideoWatermarkMode(value: unknown): VideoWatermarkMode {
  return String(value || '').trim().toLowerCase() === 'dynamic_overlay'
    ? 'dynamic_overlay'
    : 'none';
}

function parseConfigBoolean(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return !['false', '0', 'off', 'no'].includes(normalized);
}

function parseConfigNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function decorateGeneratedTaskInfoWithWatermark({
  taskInfo,
  watermarkPolicy,
}: {
  taskInfo: unknown;
  watermarkPolicy?: {
    watermarkApplied: boolean;
    watermarkType: Exclude<VideoWatermarkMode, 'none'>;
    watermarkOpacity: number;
    watermarkIntervalSeconds: number;
    watermarkText: string;
  };
}) {
  if (!watermarkPolicy || !taskInfo || typeof taskInfo !== 'object') {
    return taskInfo;
  }

  const info = taskInfo as Record<string, unknown>;
  if (!Array.isArray(info.videos)) {
    return taskInfo;
  }

  return {
    ...info,
    videos: info.videos.map((videoItem) => {
      if (typeof videoItem === 'string') {
        return {
          videoUrl: videoItem,
          watermarkApplied: watermarkPolicy.watermarkApplied,
          watermarkType: watermarkPolicy.watermarkType,
          watermarkOpacity: watermarkPolicy.watermarkOpacity,
          watermarkIntervalSeconds: watermarkPolicy.watermarkIntervalSeconds,
          watermarkText: watermarkPolicy.watermarkText,
        };
      }

      if (videoItem && typeof videoItem === 'object') {
        return {
          ...(videoItem as Record<string, unknown>),
          watermarkApplied: watermarkPolicy.watermarkApplied,
          watermarkType: watermarkPolicy.watermarkType,
          watermarkOpacity: watermarkPolicy.watermarkOpacity,
          watermarkIntervalSeconds: watermarkPolicy.watermarkIntervalSeconds,
          watermarkText: watermarkPolicy.watermarkText,
        };
      }

      return videoItem;
    }),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { provider, mediaType, model, prompt } = body;
    const { options } = body;
    let { scene } = body;
    const normalizedPrompt = typeof prompt === 'string' ? prompt : '';
    const normalizedOptions =
      options &&
      typeof options === 'object' &&
      !Array.isArray(options)
        ? options
        : undefined;

    if (!provider || !mediaType || !model) {
      throw new Error('invalid params');
    }

    if (!normalizedPrompt && !normalizedOptions) {
      throw new Error('prompt or options is required');
    }

    const aiService = await getAIService();

    // check generate type
    if (!aiService.getMediaTypes().includes(mediaType)) {
      throw new Error('invalid mediaType');
    }

    // check ai provider
    const aiProvider = aiService.getProvider(provider);
    if (!aiProvider) {
      throw new Error('invalid provider');
    }

    // get current user
    const user = await getUserInfo();
    if (!user) {
      throw new Error('no auth, please sign in');
    }

    // todo: get cost credits from settings
    let costCredits = 2;
    let watermarkApplied = false;
    let watermarkMode: VideoWatermarkMode = 'none';
    let watermarkPolicy:
      | {
          watermarkApplied: boolean;
          watermarkType: Exclude<VideoWatermarkMode, 'none'>;
          watermarkOpacity: number;
          watermarkIntervalSeconds: number;
          watermarkText: string;
        }
      | undefined;

    if (mediaType === AIMediaType.IMAGE) {
      // generate image
      if (scene === 'image-to-image') {
        costCredits = 4;
      } else if (scene === 'text-to-image') {
        costCredits = 2;
      } else {
        throw new Error('invalid scene');
      }
    } else if (mediaType === AIMediaType.VIDEO) {
      // generate video
      // Keep backend billing consistent with the UI:
      // 720p costs 60 credits, 1080p costs 120 credits.
      const resolution = String(normalizedOptions?.resolution || '').toLowerCase();
      costCredits = resolution === '1080p' ? 120 : 60;

      const configs = await getAllConfigs();
      const freeVideoWatermarkEnabled = parseConfigBoolean(
        configs.free_video_watermark_enabled,
        true
      );
      const configuredMode = normalizeVideoWatermarkMode(
        configs.free_video_watermark_mode || 'dynamic_overlay'
      );
      const [paidOrder, currentSubscription] = await Promise.all([
        hasPaidOrder(user.id),
        getCurrentSubscription(user.id),
      ]);
      const hasPaidMembership = paidOrder || Boolean(currentSubscription);

      if (freeVideoWatermarkEnabled && configuredMode !== 'none' && !hasPaidMembership) {
        const watermarkOpacity = parseConfigNumber(
          configs.free_video_watermark_opacity,
          0.28,
          0.05,
          0.9
        );
        const watermarkIntervalSeconds = parseConfigNumber(
          configs.free_video_watermark_interval_sec,
          3,
          1,
          30
        );
        watermarkApplied = true;
        watermarkMode = configuredMode;
        watermarkPolicy = {
          watermarkApplied: true,
          watermarkType: configuredMode,
          watermarkOpacity,
          watermarkIntervalSeconds,
          watermarkText: String(envConfigs.app_name || 'BabyBoogey').slice(0, 50),
        };
      }

      if (
        scene !== 'text-to-video' &&
        scene !== 'image-to-video' &&
        scene !== 'video-to-video'
      ) {
        throw new Error('invalid scene');
      }
    } else if (mediaType === AIMediaType.MUSIC) {
      // generate music
      costCredits = 10;
      scene = 'text-to-music';
    } else {
      throw new Error('invalid mediaType');
    }

    // check credits
    const remainingCredits = await getRemainingCredits(user.id);
    if (remainingCredits < costCredits) {
      throw new Error('insufficient credits');
    }
    const cookieStore = await cookies();
    const guestSessionId =
      cookieStore.get(GUEST_UPLOAD_SESSION_COOKIE)?.value || null;

    const resolvedProviderOptions = normalizedOptions
      ? await resolveAssetRefsWithSignedUrls({
          value: normalizedOptions,
          userId: user.id,
          guestSessionId,
          expiresInSeconds: 60 * 10,
          absolute: true,
        })
      : normalizedOptions;
    const unresolvedAssetIds = Array.from(
      collectAssetIdsFromValue(resolvedProviderOptions)
    );
    if (unresolvedAssetIds.length > 0) {
      throw new Error('invalid or inaccessible media reference');
    }

    const persistedTaskOptions =
      watermarkPolicy && mediaType === AIMediaType.VIDEO
        ? {
            ...((resolvedProviderOptions as Record<string, unknown>) || {}),
            watermarkPolicy,
          }
        : resolvedProviderOptions;

    const callbackUrl = `${envConfigs.app_url}/api/ai/notify/${provider}`;

    const params: AIGenerateParams = {
      mediaType,
      model,
      prompt: normalizedPrompt,
      callbackUrl,
      options: resolvedProviderOptions,
      userId: user.id,
    };

    // generate content
    const result = await aiProvider.generate({ params });
    if (!result?.taskId) {
      throw new Error(
        `ai generate failed, mediaType: ${mediaType}, provider: ${provider}, model: ${model}`
      );
    }

    // create ai task
    const newAITask: NewAITask = {
      id: getUuid(),
      userId: user.id,
      mediaType,
      provider,
      model,
      prompt: normalizedPrompt,
      scene,
      options: persistedTaskOptions ? JSON.stringify(persistedTaskOptions) : null,
      status: result.taskStatus,
      costCredits,
      taskId: result.taskId,
      taskInfo: result.taskInfo ? JSON.stringify(result.taskInfo) : null,
      taskResult: result.taskResult ? JSON.stringify(result.taskResult) : null,
      watermarkApplied,
      watermarkMode,
      watermarkedAssetId: null,
    };
    await createAITask(newAITask);

    const responseTask = {
      ...newAITask,
      taskInfo: newAITask.taskInfo,
    };

    if (result.taskInfo) {
      const taskInfoForResponse =
        mediaType === AIMediaType.VIDEO
          ? decorateGeneratedTaskInfoWithWatermark({
              taskInfo: result.taskInfo,
              watermarkPolicy,
            })
          : result.taskInfo;
      const signedTaskInfo = await resolveAssetRefsWithSignedUrls({
        value: taskInfoForResponse,
        userId: user.id,
      });
      responseTask.taskInfo = JSON.stringify(signedTaskInfo);
    }

    return respData(responseTask);
  } catch (e: unknown) {
    console.log('generate failed', e);
    const message = e instanceof Error ? e.message : 'generate failed';
    return respErr(message);
  }
}
