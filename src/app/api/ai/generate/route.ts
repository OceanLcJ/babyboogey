import { cookies } from 'next/headers';

import { envConfigs } from '@/config';
import { AIGenerateParams, AIMediaType } from '@/extensions/ai';
import { getUuid } from '@/shared/lib/hash';
import { respData, respErr } from '@/shared/lib/resp';
import { createAITask, NewAITask } from '@/shared/models/ai_task';
import { getAllConfigs } from '@/shared/models/config';
import { getRemainingCredits } from '@/shared/models/credit';
import { hasMonetizedPaidOrder } from '@/shared/models/order';
import { getCurrentSubscription } from '@/shared/models/subscription';
import { getUserInfo } from '@/shared/models/user';
import { getAIService } from '@/shared/services/ai';
import {
  BABY_IMAGE_DEFAULT_MODEL,
  BABY_IMAGE_PROVIDER,
  BABY_IMAGE_SCENE_IMAGE,
  BABY_IMAGE_SCENE_TEXT,
  getBabyImageCostCredits,
  isBabyImageScene,
  resolveBabyImageResolution,
} from '@/shared/services/baby-image/config';
import {
  BABY_VIDEO_MOTION_MODEL,
  BABY_VIDEO_PROVIDER,
  getVideoCostCredits,
  resolveVideoResolution,
  resolveVideoTemplateDurationSeconds,
} from '@/shared/services/baby-video/config';
import { buildBabyImagePrompt } from '@/shared/services/baby-image/prompts';
import {
  assertBabyGenerationPromptSafe,
  assertBabySafetyConfirmation,
  normalizeBabySafetyErrorMessage,
} from '@/shared/services/content-safety';
import {
  assertBabyGenerationOpenAIModerationSafe,
  collectBabyModerationImageInputs,
} from '@/shared/services/content-safety-openai';
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
    let normalizedPrompt = typeof prompt === 'string' ? prompt : '';
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

    const configs = await getAllConfigs();
    const aiService = await getAIService(configs);

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
    let requiresBabySafetyModeration = false;
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
      const requiresBabyImageSafety =
        isBabyImageScene(scene) ||
        (provider === BABY_IMAGE_PROVIDER &&
          model === BABY_IMAGE_DEFAULT_MODEL);

      // generate image
      if (scene === 'image-to-image') {
        costCredits = 4;
      } else if (scene === 'text-to-image') {
        costCredits = 2;
      } else if (isBabyImageScene(scene)) {
        const babyImageResolution = resolveBabyImageResolution(
          normalizedOptions?.resolution
        );
        costCredits = getBabyImageCostCredits(babyImageResolution);
        const hasImageInput =
          Array.isArray(normalizedOptions?.image_input) &&
          (normalizedOptions?.image_input as unknown[]).length > 0;
        // Scene split is an ops-side analytics signal; we still cross-check
        // against the actual payload so a client can't arbitrage the text
        // scene while uploading a photo.
        if (scene === BABY_IMAGE_SCENE_IMAGE && !hasImageInput) {
          throw new Error('baby-image-image scene requires image_input');
        }
        if (scene === BABY_IMAGE_SCENE_TEXT && hasImageInput) {
          throw new Error('baby-image-text scene must not include image_input');
        }
        const styleId =
          typeof normalizedOptions?.styleId === 'string'
            ? normalizedOptions.styleId
            : undefined;
        normalizedPrompt = buildBabyImagePrompt({
          styleId,
          userPrompt: normalizedPrompt,
          hasImageInput,
        });
      } else {
        throw new Error('invalid scene');
      }

      if (requiresBabyImageSafety) {
        assertBabySafetyConfirmation(normalizedOptions);
        assertBabyGenerationPromptSafe(normalizedPrompt);
        requiresBabySafetyModeration = true;
      }
    } else if (mediaType === AIMediaType.VIDEO) {
      // generate video — billed per second using a server-side duration
      // whitelist keyed by templateId. The client may hint `templateId` and
      // `durationSeconds`; the server always resolves the authoritative
      // duration from the whitelist to keep billing tamper-proof.
      if (
        scene !== 'text-to-video' &&
        scene !== 'image-to-video' &&
        scene !== 'video-to-video'
      ) {
        throw new Error('invalid scene');
      }

      if (provider === BABY_VIDEO_PROVIDER && model === BABY_VIDEO_MOTION_MODEL) {
        assertBabySafetyConfirmation(normalizedOptions);
        assertBabyGenerationPromptSafe(normalizedPrompt);
        requiresBabySafetyModeration = true;
      }

      const videoResolution = resolveVideoResolution(
        normalizedOptions?.resolution || normalizedOptions?.mode
      );
      const videoDurationSeconds = resolveVideoTemplateDurationSeconds(
        normalizedOptions?.templateId
      );
      costCredits = getVideoCostCredits(videoResolution, videoDurationSeconds);

      const freeVideoWatermarkEnabled = parseConfigBoolean(
        configs.free_video_watermark_enabled,
        true
      );
      const configuredMode = normalizeVideoWatermarkMode(
        configs.free_video_watermark_mode || 'dynamic_overlay'
      );
      const [hasMonetizedOrder, currentSubscription] = await Promise.all([
        hasMonetizedPaidOrder(user.id),
        getCurrentSubscription(user.id),
      ]);
      const hasPaidMembership = hasMonetizedOrder || Boolean(currentSubscription);

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

    if (requiresBabySafetyModeration) {
      await assertBabyGenerationOpenAIModerationSafe({
        apiKey: configs.openai_api_key,
        prompt: normalizedPrompt,
        imageInputs: collectBabyModerationImageInputs(resolvedProviderOptions),
      });
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
    try {
      await createAITask(newAITask);
    } catch (dbError) {
      console.error('[ai/generate] createAITask failed', dbError);
      throw new Error('task_persistence_failed');
    }

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
    const rawMessage = e instanceof Error ? e.message : 'generate failed';
    const safetyMessage = normalizeBabySafetyErrorMessage(rawMessage);
    if (safetyMessage && safetyMessage !== rawMessage) {
      return respErr(safetyMessage);
    }
    // Never leak raw SQL / DB diagnostics to the client. Whitelist short,
    // user-meaningful messages; collapse everything else into a generic code.
    const isSafeMessage =
      rawMessage.length <= 120 &&
      !/failed query|insert into|update\s|select\s|drizzle|sqlite|d1_error/i.test(
        rawMessage
      );
    const message = isSafeMessage ? rawMessage : 'task_persistence_failed';
    return respErr(message);
  }
}
