import { AIMediaType } from '@/extensions/ai/types';
import { respData, respErr } from '@/shared/lib/resp';
import {
  findAITaskById,
  UpdateAITask,
  updateAITaskById,
} from '@/shared/models/ai_task';
import { getUserInfo } from '@/shared/models/user';
import { getAIService } from '@/shared/services/ai';
import { resolveAssetRefsWithSignedUrls } from '@/shared/services/media-asset';

function safeParseJson(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeWatermarkType(value?: string | null): 'none' | 'dynamic_overlay' {
  return String(value || '').trim().toLowerCase() === 'dynamic_overlay'
    ? 'dynamic_overlay'
    : 'none';
}

function getTaskWatermarkPolicy(task: {
  watermarkApplied?: boolean | null;
  watermarkMode?: string | null;
  options?: string | null;
}) {
  const watermarkType = normalizeWatermarkType(task.watermarkMode);
  const applied = Boolean(task.watermarkApplied) && watermarkType !== 'none';
  const parsedOptions = safeParseJson(task.options);
  const parsedRecord =
    parsedOptions &&
    typeof parsedOptions === 'object' &&
    !Array.isArray(parsedOptions)
      ? (parsedOptions as Record<string, unknown>)
      : null;
  const policyRaw = parsedRecord?.watermarkPolicy;
  const policy =
    policyRaw && typeof policyRaw === 'object' && !Array.isArray(policyRaw)
      ? (policyRaw as Record<string, unknown>)
      : {};

  return {
    watermarkApplied: applied,
    watermarkType: applied ? watermarkType : 'none',
    watermarkOpacity:
      Number.isFinite(Number(policy?.watermarkOpacity))
        ? Number(policy?.watermarkOpacity)
        : 0.28,
    watermarkIntervalSeconds:
      Number.isFinite(Number(policy?.watermarkIntervalSeconds))
        ? Number(policy?.watermarkIntervalSeconds)
        : 3,
    watermarkText: String(policy?.watermarkText || 'BabyBoogey'),
  } as const;
}

function decorateTaskInfoVideosWithWatermark(
  taskInfo: unknown,
  watermarkPolicy: ReturnType<typeof getTaskWatermarkPolicy>
) {
  if (!taskInfo || typeof taskInfo !== 'object') {
    return taskInfo;
  }

  const info = taskInfo as Record<string, unknown>;
  const decorateOne = (videoItem: unknown) => {
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
      const record = videoItem as Record<string, unknown>;
      return {
        ...record,
        watermarkApplied:
          typeof record.watermarkApplied === 'boolean'
            ? record.watermarkApplied
            : watermarkPolicy.watermarkApplied,
        watermarkType: normalizeWatermarkType(
          String(record.watermarkType || watermarkPolicy.watermarkType)
        ),
        watermarkOpacity:
          Number.isFinite(Number(record.watermarkOpacity))
            ? Number(record.watermarkOpacity)
            : watermarkPolicy.watermarkOpacity,
        watermarkIntervalSeconds:
          Number.isFinite(Number(record.watermarkIntervalSeconds))
            ? Number(record.watermarkIntervalSeconds)
            : watermarkPolicy.watermarkIntervalSeconds,
        watermarkText:
          typeof record.watermarkText === 'string' && record.watermarkText
            ? record.watermarkText
            : watermarkPolicy.watermarkText,
      };
    }

    return videoItem;
  };

  const existingVideos = Array.isArray(info.videos) ? (info.videos as unknown[]) : [];
  if (existingVideos.length > 0) {
    return {
      ...info,
      videos: existingVideos.map(decorateOne),
    };
  }

  const output = info.output ?? info.video ?? info.data;
  if (!output) {
    return taskInfo;
  }

  const normalizedList = Array.isArray(output) ? output : [output];
  const derivedVideos = normalizedList
    .map((item) => {
      if (!item) {
        return null;
      }
      if (typeof item === 'string') {
        return item;
      }
      if (typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const candidate =
          record.url ?? record.uri ?? record.video ?? record.src ?? record.videoUrl;
        return typeof candidate === 'string' && candidate ? candidate : null;
      }
      return null;
    })
    .filter(Boolean);

  if (!derivedVideos.length) {
    return taskInfo;
  }

  return {
    ...info,
    videos: derivedVideos.map(decorateOne),
  };
}

export async function POST(req: Request) {
  try {
    const { taskId } = await req.json();
    if (!taskId) {
      return respErr('invalid params');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const task = await findAITaskById(taskId);
    if (!task || !task.taskId) {
      return respErr('task not found');
    }

    if (task.userId !== user.id) {
      return respErr('no permission');
    }

    const aiService = await getAIService();
    const aiProvider = aiService.getProvider(task.provider);
    if (!aiProvider) {
      return respErr('invalid ai provider');
    }

    const result = await aiProvider?.query?.({
      taskId: task.taskId,
      mediaType: task.mediaType,
      model: task.model,
      userId: user.id,
    });

    if (!result?.taskStatus) {
      return respErr('query ai task failed');
    }

    // update ai task
    const updateAITask: UpdateAITask = {
      status: result.taskStatus,
      taskInfo: result.taskInfo ? JSON.stringify(result.taskInfo) : null,
      taskResult: result.taskResult ? JSON.stringify(result.taskResult) : null,
      creditId: task.creditId, // credit consumption record id
    };

    const hasStatusChanged = updateAITask.status !== task.status;
    const hasTaskInfoChanged = updateAITask.taskInfo !== task.taskInfo;
    const hasTaskResultChanged = updateAITask.taskResult !== task.taskResult;
    if (hasStatusChanged || hasTaskInfoChanged || hasTaskResultChanged) {
      await updateAITaskById(task.id, updateAITask);
    }

    const resolvedTask = {
      ...task,
      status: updateAITask.status || '',
      taskInfo: updateAITask.taskInfo || null,
      taskResult: updateAITask.taskResult || null,
    };

    const parsedTaskInfo = safeParseJson(resolvedTask.taskInfo);
    if (parsedTaskInfo) {
      let taskInfoForResponse = parsedTaskInfo;
      if (resolvedTask.mediaType === AIMediaType.VIDEO) {
        const watermarkPolicy = getTaskWatermarkPolicy(resolvedTask);
        taskInfoForResponse = decorateTaskInfoVideosWithWatermark(
          parsedTaskInfo,
          watermarkPolicy
        );
      }

      const signedTaskInfo = await resolveAssetRefsWithSignedUrls({
        value: taskInfoForResponse,
        userId: user.id,
      });
      resolvedTask.taskInfo = JSON.stringify(signedTaskInfo);
    }

    return respData(resolvedTask);
  } catch (e: unknown) {
    console.log('ai query failed', e);
    const message = e instanceof Error ? e.message : 'ai query failed';
    return respErr(message);
  }
}
