import { cookies } from 'next/headers';

import { envConfigs } from '@/config';
import { AIMediaType } from '@/extensions/ai';
import { getUuid } from '@/shared/lib/hash';
import { respData, respErr } from '@/shared/lib/resp';
import { createAITask, NewAITask } from '@/shared/models/ai_task';
import { getRemainingCredits } from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';
import { getAIService } from '@/shared/services/ai';
import {
  collectAssetIdsFromValue,
  GUEST_UPLOAD_SESSION_COOKIE,
  resolveAssetRefsWithSignedUrls,
} from '@/shared/services/media-asset';

export async function POST(request: Request) {
  try {
    let { provider, mediaType, model, prompt, options, scene } =
      await request.json();

    if (!provider || !mediaType || !model) {
      throw new Error('invalid params');
    }

    if (!prompt && !options) {
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
      const resolution = String(options?.resolution || '').toLowerCase();
      costCredits = resolution === '1080p' ? 120 : 60;

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

    const resolvedOptions = options
      ? await resolveAssetRefsWithSignedUrls({
          value: options,
          userId: user.id,
          guestSessionId,
          expiresInSeconds: 60 * 10,
          absolute: true,
        })
      : options;
    const unresolvedAssetIds = Array.from(
      collectAssetIdsFromValue(resolvedOptions)
    );
    if (unresolvedAssetIds.length > 0) {
      throw new Error('invalid or inaccessible media reference');
    }

    const callbackUrl = `${envConfigs.app_url}/api/ai/notify/${provider}`;

    const params: any = {
      mediaType,
      model,
      prompt,
      callbackUrl,
      options: resolvedOptions,
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
      prompt,
      scene,
      options: resolvedOptions ? JSON.stringify(resolvedOptions) : null,
      status: result.taskStatus,
      costCredits,
      taskId: result.taskId,
      taskInfo: result.taskInfo ? JSON.stringify(result.taskInfo) : null,
      taskResult: result.taskResult ? JSON.stringify(result.taskResult) : null,
    };
    await createAITask(newAITask);

    const responseTask = {
      ...newAITask,
      taskInfo: newAITask.taskInfo,
    };

    if (result.taskInfo) {
      const signedTaskInfo = await resolveAssetRefsWithSignedUrls({
        value: result.taskInfo,
        userId: user.id,
      });
      responseTask.taskInfo = JSON.stringify(signedTaskInfo);
    }

    return respData(responseTask);
  } catch (e: any) {
    console.log('generate failed', e);
    return respErr(e.message);
  }
}
