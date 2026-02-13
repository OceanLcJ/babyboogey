import { getTranslations } from 'next-intl/server';

import { AITaskStatus } from '@/extensions/ai';
import { AudioPlayer, Empty, LazyImage } from '@/shared/blocks/common';
import { WatermarkedVideoResult } from '@/shared/blocks/common/watermarked-video-result';
import { TableCard } from '@/shared/blocks/table';
import { resolveMediaValueToApiPath } from '@/shared/lib/asset-ref';
import { normalizeWatermarkType } from '@/shared/lib/watermark';
import {
  AITask,
  getAITaskMediaTypeCounts,
  getAITasks,
  getAITasksCount,
} from '@/shared/models/ai_task';
import { getUserInfo } from '@/shared/models/user';
import { Button, Tab } from '@/shared/types/blocks/common';
import { type Table } from '@/shared/types/blocks/table';
import type { VideoWatermarkConfig } from '@/shared/types/watermark';

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

function resolveVideoUrlFromTaskInfoItem(video: unknown): string | null {
  if (typeof video === 'string') {
    return video;
  }

  if (!video || typeof video !== 'object' || Array.isArray(video)) {
    return null;
  }

  const record = video as Record<string, unknown>;
  const candidate =
    record.videoUrl ?? record.url ?? record.uri ?? record.video ?? record.src;
  return typeof candidate === 'string' && candidate ? candidate : null;
}

function resolveVideoThumbnailFromTaskInfoItem(video: unknown): string | null {
  if (!video || typeof video !== 'object' || Array.isArray(video)) {
    return null;
  }

  const record = video as Record<string, unknown>;
  const candidate =
    record.thumbnailUrl ?? record.thumbnail ?? record.poster ?? record.cover;
  return typeof candidate === 'string' && candidate ? candidate : null;
}

function getTaskWatermarkConfig(task: AITask): VideoWatermarkConfig {
  const watermarkType = normalizeWatermarkType(task.watermarkMode);
  const watermarkApplied =
    Boolean(task.watermarkApplied) && watermarkType === 'dynamic_overlay';

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

  const opacityRaw = Number(policy.watermarkOpacity);
  const intervalRaw = Number(policy.watermarkIntervalSeconds);

  return {
    watermarkApplied,
    watermarkType: watermarkApplied ? watermarkType : 'none',
    watermarkOpacity: Number.isFinite(opacityRaw)
      ? Math.min(0.9, Math.max(0.05, opacityRaw))
      : 0.28,
    watermarkIntervalSeconds: Number.isFinite(intervalRaw)
      ? Math.min(30, Math.max(1, intervalRaw))
      : 3,
    watermarkText: String(policy.watermarkText || 'BabyBoogey').slice(0, 64),
  };
}

function mergeVideoWatermarkConfig({
  video,
  taskWatermark,
}: {
  video: unknown;
  taskWatermark: VideoWatermarkConfig;
}): VideoWatermarkConfig {
  if (!video || typeof video !== 'object' || Array.isArray(video)) {
    return taskWatermark;
  }

  const record = video as Record<string, unknown>;
  const appliedFromVideo =
    typeof record.watermarkApplied === 'boolean'
      ? record.watermarkApplied
      : taskWatermark.watermarkApplied;
  const typeFromVideo = normalizeWatermarkType(
    String(record.watermarkType || taskWatermark.watermarkType)
  );
  const watermarkApplied = appliedFromVideo && typeFromVideo === 'dynamic_overlay';

  const opacityRaw = Number(record.watermarkOpacity);
  const intervalRaw = Number(record.watermarkIntervalSeconds);

  return {
    watermarkApplied,
    watermarkType: watermarkApplied ? typeFromVideo : 'none',
    watermarkOpacity: Number.isFinite(opacityRaw)
      ? Math.min(0.9, Math.max(0.05, opacityRaw))
      : taskWatermark.watermarkOpacity,
    watermarkIntervalSeconds: Number.isFinite(intervalRaw)
      ? Math.min(30, Math.max(1, intervalRaw))
      : taskWatermark.watermarkIntervalSeconds,
    watermarkText:
      typeof record.watermarkText === 'string' && record.watermarkText
        ? record.watermarkText.slice(0, 64)
        : taskWatermark.watermarkText,
  };
}

export default async function AiTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number; type?: string }>;
}) {
  const { page: pageNum, pageSize, type } = await searchParams;
  const page = Number(pageNum) > 0 ? Number(pageNum) : 1;
  const limit = Number(pageSize) > 0 ? Number(pageSize) : 20;

  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await getTranslations('activity.ai-tasks');

  const supportedMediaTypes = ['music', 'image', 'video', 'audio', 'text'];
  const requestType = typeof type === 'string' ? type.toLowerCase() : '';
  const selectedType =
    requestType && requestType !== 'all' && supportedMediaTypes.includes(requestType)
      ? requestType
      : undefined;

  const [aiTasks, total, mediaTypeCounts] = await Promise.all([
    getAITasks({
      userId: user.id,
      mediaType: selectedType,
      page,
      limit,
    }),
    getAITasksCount({
      userId: user.id,
      mediaType: selectedType,
    }),
    getAITaskMediaTypeCounts({
      userId: user.id,
    }),
  ]);

  const table: Table = {
    title: t('list.title'),
    columns: [
      {
        name: 'prompt',
        title: t('fields.prompt'),
        type: 'copy',
        className: 'max-w-[360px] xl:max-w-[420px]',
        callback: (item: AITask) => {
          const prompt = item.prompt || '-';
          return (
            <span
              className="block max-w-[360px] truncate xl:max-w-[420px]"
              title={item.prompt || ''}
            >
              {prompt}
            </span>
          );
        },
      },
      { name: 'status', title: t('fields.status'), type: 'label' },
      {
        name: 'result',
        title: t('fields.result'),
        callback: (item: AITask) => {
          if (!item.taskInfo) {
            return '-';
          }

          const parsedTaskInfo = safeParseJson(item.taskInfo);
          if (
            !parsedTaskInfo ||
            typeof parsedTaskInfo !== 'object' ||
            Array.isArray(parsedTaskInfo)
          ) {
            return '-';
          }
          const taskInfo = parsedTaskInfo as Record<string, unknown>;

          const errorMessage =
            typeof taskInfo.errorMessage === 'string' ? taskInfo.errorMessage : '';
          if (errorMessage) {
            return <div className="text-red-500">Failed: {errorMessage}</div>;
          }

          const songsRaw = Array.isArray(taskInfo.songs) ? taskInfo.songs : [];
          if (songsRaw.length > 0) {
            const songs = songsRaw
              .map((song) => {
                if (!song || typeof song !== 'object' || Array.isArray(song)) {
                  return null;
                }
                const songRecord = song as Record<string, unknown>;
                if (
                  typeof songRecord.audioUrl !== 'string' ||
                  !songRecord.audioUrl
                ) {
                  return null;
                }
                return {
                  id: typeof songRecord.id === 'string' ? songRecord.id : '',
                  audioUrl: songRecord.audioUrl,
                  title:
                    typeof songRecord.title === 'string' ? songRecord.title : '',
                };
              })
              .filter((song): song is { id: string; audioUrl: string; title: string } =>
                Boolean(song)
              );
            if (songs.length > 0) {
              return (
                <div className="flex flex-col gap-2">
                  {songs.map((song, index: number) => (
                    <AudioPlayer
                      key={song.id || `${item.id}-song-${index}`}
                      src={resolveMediaValueToApiPath(song.audioUrl)}
                      title={song.title}
                      className="w-80"
                    />
                  ))}
                </div>
              );
            }
          }

          const imagesRaw = Array.isArray(taskInfo.images) ? taskInfo.images : [];
          if (imagesRaw.length > 0) {
            return (
              <div className="flex flex-col gap-2">
                {imagesRaw.map((image, index: number) => {
                  if (!image || typeof image !== 'object' || Array.isArray(image)) {
                    return null;
                  }
                  const imageRecord = image as Record<string, unknown>;
                  if (
                    typeof imageRecord.imageUrl !== 'string' ||
                    !imageRecord.imageUrl
                  ) {
                    return null;
                  }
                  return (
                    <LazyImage
                      key={index}
                      src={resolveMediaValueToApiPath(imageRecord.imageUrl)}
                      alt="Generated image"
                      className="h-32 w-auto"
                    />
                  );
                })}
              </div>
            );
          }

          const videosRaw = Array.isArray(taskInfo.videos) ? taskInfo.videos : [];
          if (videosRaw.length > 0) {
            const taskWatermark = getTaskWatermarkConfig(item);
            return (
              <div className="flex flex-col gap-3">
                {videosRaw.map((video, index: number) => {
                  const videoUrlRaw = resolveVideoUrlFromTaskInfoItem(video);
                  if (!videoUrlRaw) {
                    return null;
                  }
                  const thumbnailUrlRaw = resolveVideoThumbnailFromTaskInfoItem(video);
                  const watermark = mergeVideoWatermarkConfig({
                    video,
                    taskWatermark,
                  });
                  return (
                    <WatermarkedVideoResult
                      key={`${item.id}-video-${index}`}
                      videoUrl={resolveMediaValueToApiPath(videoUrlRaw)}
                      thumbnailUrl={
                        thumbnailUrlRaw
                          ? resolveMediaValueToApiPath(thumbnailUrlRaw)
                          : undefined
                      }
                      watermark={watermark}
                    />
                  );
                })}
              </div>
            );
          }

          return '-';
        },
      },
      { name: 'createdAt', title: t('fields.created_at'), type: 'time' },
      {
        name: 'action',
        title: t('fields.action'),
        type: 'dropdown',
        callback: (item: AITask) => {
          const items: Button[] = [];

          if (
            item.status === AITaskStatus.PENDING ||
            item.status === AITaskStatus.PROCESSING
          ) {
            items.push({
              title: t('list.buttons.refresh'),
              url: `/activity/ai-tasks/${item.id}/refresh`,
              icon: 'RiRefreshLine',
            });
          }

          return items;
        },
      },
    ],
    data: aiTasks,
    emptyMessage: t('list.empty_message'),
    pagination: {
      total,
      page,
      limit,
    },
  };

  const mediaTypeTitles: Record<string, string> = {
    music: t('list.tabs.music'),
    image: t('list.tabs.image'),
    video: t('list.tabs.video'),
    audio: t('list.tabs.audio'),
    text: t('list.tabs.text'),
  };

  const dynamicMediaTabs = supportedMediaTypes
    .filter(
      (media) =>
        (mediaTypeCounts[media] ?? 0) > 0 || media === selectedType
    )
    .map(
      (media): Tab => ({
        name: media,
        title: mediaTypeTitles[media] ?? media,
        url: `/activity/ai-tasks?type=${media}`,
        is_active: selectedType === media,
      })
    );

  const tabs: Tab[] = [
    {
      name: 'all',
      title: t('list.tabs.all'),
      url: '/activity/ai-tasks',
      is_active: !selectedType,
    },
    ...dynamicMediaTabs,
  ];

  return (
    <div className="space-y-8">
      <TableCard title={t('list.title')} tabs={tabs} table={table} />
    </div>
  );
}
