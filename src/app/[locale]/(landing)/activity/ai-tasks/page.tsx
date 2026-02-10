import { getTranslations } from 'next-intl/server';

import { AITaskStatus } from '@/extensions/ai';
import { AudioPlayer, Empty, LazyImage } from '@/shared/blocks/common';
import { TableCard } from '@/shared/blocks/table';
import { resolveMediaValueToApiPath } from '@/shared/lib/asset-ref';
import {
  AITask,
  getAITaskMediaTypeCounts,
  getAITasks,
  getAITasksCount,
} from '@/shared/models/ai_task';
import { getUserInfo } from '@/shared/models/user';
import { Button, Tab } from '@/shared/types/blocks/common';
import { type Table } from '@/shared/types/blocks/table';

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

          let taskInfo: any;
          try {
            taskInfo = JSON.parse(item.taskInfo);
          } catch {
            return '-';
          }

          if (taskInfo.errorMessage) {
            return <div className="text-red-500">Failed: {taskInfo.errorMessage}</div>;
          }

          if (taskInfo.songs && taskInfo.songs.length > 0) {
            const songs: any[] = taskInfo.songs.filter((song: any) => song.audioUrl);
            if (songs.length > 0) {
              return (
                <div className="flex flex-col gap-2">
                  {songs.map((song: any, index: number) => (
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

          if (taskInfo.images && taskInfo.images.length > 0) {
            return (
              <div className="flex flex-col gap-2">
                {taskInfo.images.map((image: any, index: number) => (
                  <LazyImage
                    key={index}
                    src={resolveMediaValueToApiPath(image.imageUrl)}
                    alt="Generated image"
                    className="h-32 w-auto"
                  />
                ))}
              </div>
            );
          }

          if (taskInfo.videos && taskInfo.videos.length > 0) {
            return (
              <div className="flex flex-col gap-3">
                {taskInfo.videos.map((video: any, index: number) => {
                  const videoUrl = resolveMediaValueToApiPath(video.videoUrl);
                  const thumbnailUrl = resolveMediaValueToApiPath(
                    video.thumbnailUrl
                  );
                  return (
                    <div key={`${item.id}-video-${index}`} className="flex flex-col gap-2">
                      <video
                        src={videoUrl}
                        poster={thumbnailUrl || undefined}
                        controls
                        className="h-40 w-72 rounded-md border bg-black/70"
                        preload="metadata"
                      />
                      <a
                        href={videoUrl}
                        download
                        className="w-fit rounded border px-2 py-1 text-xs hover:bg-black/5"
                      >
                        Download
                      </a>
                    </div>
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
