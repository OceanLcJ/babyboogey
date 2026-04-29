import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Download,
  FileQuestion,
  ImageIcon,
  Loader2,
  Music2,
  RefreshCw,
  Sparkles,
  Video,
} from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/core/i18n/navigation';
import { AITaskStatus } from '@/extensions/ai';
import { AudioPlayer, Empty, LazyImage } from '@/shared/blocks/common';
import { Pagination } from '@/shared/blocks/common/pagination';
import { WatermarkedVideoResult } from '@/shared/blocks/common/watermarked-video-result';
import {
  normalizeAITaskReuseOptions,
  type AITaskReuseHandoffDraft,
} from '@/shared/lib/ai-task-reuse-handoff';
import { resolveMediaValueToApiPath } from '@/shared/lib/asset-ref';
import { cn } from '@/shared/lib/utils';
import { normalizeWatermarkType } from '@/shared/lib/watermark';
import {
  AITask,
  getAITaskMediaTypeCounts,
  getAITasks,
  getAITasksCount,
} from '@/shared/models/ai_task';
import { getUserInfo } from '@/shared/models/user';
import type { VideoWatermarkConfig } from '@/shared/types/watermark';

import { AITaskReuseAction } from './reuse-action';

type TaskSong = {
  id: string;
  audioUrl: string;
  title: string;
};

type TaskImage = {
  imageUrl: string;
};

type TaskVideo = {
  videoUrl: string;
  thumbnailUrl: string | undefined;
  watermark: VideoWatermarkConfig;
};

type TaskResult = {
  errorMessage: string;
  songs: TaskSong[];
  images: TaskImage[];
  videos: TaskVideo[];
  parsed: boolean;
};

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

function readFirstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate) {
      return candidate;
    }
  }

  return null;
}

function resolveImageUrlFromTaskInfoItem(image: unknown): string | null {
  if (typeof image === 'string') {
    return image;
  }

  if (!image || typeof image !== 'object' || Array.isArray(image)) {
    return null;
  }

  return readFirstString(image as Record<string, unknown>, [
    'imageUrl',
    'url',
    'uri',
    'image',
    'src',
  ]);
}

function resolveVideoUrlFromTaskInfoItem(video: unknown): string | null {
  if (typeof video === 'string') {
    return video;
  }

  if (!video || typeof video !== 'object' || Array.isArray(video)) {
    return null;
  }

  return readFirstString(video as Record<string, unknown>, [
    'videoUrl',
    'url',
    'uri',
    'video',
    'src',
  ]);
}

function resolveVideoThumbnailFromTaskInfoItem(video: unknown): string | null {
  if (!video || typeof video !== 'object' || Array.isArray(video)) {
    return null;
  }

  return readFirstString(video as Record<string, unknown>, [
    'thumbnailUrl',
    'thumbnail',
    'poster',
    'cover',
  ]);
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
  const watermarkApplied =
    appliedFromVideo && typeFromVideo === 'dynamic_overlay';

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

function extractTaskResult(task: AITask): TaskResult {
  const parsedTaskInfo = safeParseJson(task.taskInfo);
  if (
    !parsedTaskInfo ||
    typeof parsedTaskInfo !== 'object' ||
    Array.isArray(parsedTaskInfo)
  ) {
    return {
      errorMessage: '',
      songs: [],
      images: [],
      videos: [],
      parsed: false,
    };
  }

  const taskInfo = parsedTaskInfo as Record<string, unknown>;
  const errorMessage =
    typeof taskInfo.errorMessage === 'string' ? taskInfo.errorMessage : '';

  const songs = (Array.isArray(taskInfo.songs) ? taskInfo.songs : [])
    .map((song) => {
      if (!song || typeof song !== 'object' || Array.isArray(song)) {
        return null;
      }

      const songRecord = song as Record<string, unknown>;
      const audioUrl = readFirstString(songRecord, ['audioUrl', 'url', 'src']);
      if (!audioUrl) {
        return null;
      }

      return {
        id: typeof songRecord.id === 'string' ? songRecord.id : '',
        audioUrl,
        title: typeof songRecord.title === 'string' ? songRecord.title : '',
      };
    })
    .filter((song): song is TaskSong => Boolean(song));

  const images = (Array.isArray(taskInfo.images) ? taskInfo.images : [])
    .map((image) => {
      const imageUrl = resolveImageUrlFromTaskInfoItem(image);
      return imageUrl ? { imageUrl } : null;
    })
    .filter((image): image is TaskImage => Boolean(image));

  const taskWatermark = getTaskWatermarkConfig(task);
  const videos = (Array.isArray(taskInfo.videos) ? taskInfo.videos : [])
    .map((video) => {
      const videoUrl = resolveVideoUrlFromTaskInfoItem(video);
      if (!videoUrl) {
        return null;
      }

      const thumbnailUrl = resolveVideoThumbnailFromTaskInfoItem(video);
      return {
        videoUrl,
        thumbnailUrl: thumbnailUrl || undefined,
        watermark: mergeVideoWatermarkConfig({
          video,
          taskWatermark,
        }),
      };
    })
    .filter((video): video is TaskVideo => Boolean(video));

  return {
    errorMessage,
    songs,
    images,
    videos,
    parsed: true,
  };
}

function formatRelativeDate(value: string | Date | null, locale: string) {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const thresholds: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];

  for (const [unit, seconds] of thresholds) {
    if (Math.abs(diffSeconds) >= seconds || unit === 'minute') {
      return formatter.format(Math.round(diffSeconds / seconds), unit);
    }
  }

  return formatter.format(diffSeconds, 'second');
}

function getStatusClasses(status?: string | null) {
  switch (status) {
    case AITaskStatus.SUCCESS:
      return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300';
    case AITaskStatus.FAILED:
      return 'border-rose-400/25 bg-rose-500/10 text-rose-300';
    case AITaskStatus.PENDING:
    case AITaskStatus.PROCESSING:
      return 'border-sky-400/25 bg-sky-500/10 text-sky-300';
    case AITaskStatus.CANCELED:
      return 'border-zinc-400/25 bg-zinc-500/10 text-zinc-300';
    default:
      return 'border-border bg-secondary text-secondary-foreground';
  }
}

function getMediaIcon(mediaType?: string | null) {
  switch (mediaType) {
    case 'image':
      return <ImageIcon className="h-4 w-4" />;
    case 'video':
      return <Video className="h-4 w-4" />;
    case 'music':
    case 'audio':
      return <Music2 className="h-4 w-4" />;
    default:
      return <Sparkles className="h-4 w-4" />;
  }
}

function getMediaLabelKey(mediaType?: string | null) {
  if (
    mediaType === 'image' ||
    mediaType === 'video' ||
    mediaType === 'music' ||
    mediaType === 'audio' ||
    mediaType === 'text'
  ) {
    return mediaType;
  }

  return 'unknown';
}

function isActiveTaskStatus(status?: string | null) {
  return status === AITaskStatus.PENDING || status === AITaskStatus.PROCESSING;
}

function getReuseMediaType(
  mediaType?: string | null
): 'image' | 'video' | null {
  if (mediaType === 'image' || mediaType === 'video') {
    return mediaType;
  }

  return null;
}

function getReuseTargetHref(mediaType?: string | null) {
  switch (mediaType) {
    case 'image':
      return '/ai-baby-image-generator' as const;
    case 'video':
      return '/ai-video-generator' as const;
    default:
      return null;
  }
}

function getReuseIntent(status?: string | null): 'reuse' | 'retry' | null {
  if (status === AITaskStatus.SUCCESS) {
    return 'reuse';
  }

  if (status === AITaskStatus.FAILED || status === AITaskStatus.CANCELED) {
    return 'retry';
  }

  return null;
}

function buildReuseHandoffPayload(
  task: AITask
): AITaskReuseHandoffDraft | null {
  const mediaType = getReuseMediaType(task.mediaType);
  if (!mediaType) {
    return null;
  }

  return {
    mediaType,
    taskId: task.id,
    prompt: task.prompt || undefined,
    scene: task.scene || undefined,
    options: normalizeAITaskReuseOptions(task.options),
  };
}

function ResultShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-muted/30 border-border flex min-h-[220px] items-center justify-center overflow-hidden rounded-lg border',
        className
      )}
    >
      {children}
    </div>
  );
}

function EmptyResult({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-3 px-6 text-center text-sm">
      <div className="bg-background/70 border-border flex h-11 w-11 items-center justify-center rounded-lg border">
        {icon}
      </div>
      <span>{label}</span>
    </div>
  );
}

function TaskResultPreview({
  task,
  result,
  t,
}: {
  task: AITask;
  result: TaskResult;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const isWaiting = isActiveTaskStatus(task.status);

  if (result.errorMessage) {
    return (
      <ResultShell>
        <EmptyResult
          icon={<AlertTriangle className="h-5 w-5 text-rose-300" />}
          label={result.errorMessage}
        />
      </ResultShell>
    );
  }

  if (result.images.length > 0) {
    return (
      <ResultShell className="bg-background/40 p-2">
        <div
          className={cn(
            'grid h-full w-full gap-2',
            result.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
          )}
        >
          {result.images.slice(0, 4).map((image, index) => (
            <a
              key={`${task.id}-image-${index}`}
              href={resolveMediaValueToApiPath(image.imageUrl)}
              download
              className="group relative block overflow-hidden rounded-md"
            >
              <LazyImage
                src={resolveMediaValueToApiPath(image.imageUrl)}
                alt={t('result.image_alt')}
                className="h-full min-h-[204px] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
              <span className="absolute right-2 bottom-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                <Download className="h-4 w-4" />
              </span>
            </a>
          ))}
        </div>
      </ResultShell>
    );
  }

  if (result.videos.length > 0) {
    return (
      <ResultShell className="bg-background/40 items-start justify-start p-3">
        <div className="flex w-full flex-wrap gap-3">
          {result.videos.map((video, index) => (
            <WatermarkedVideoResult
              key={`${task.id}-video-${index}`}
              videoUrl={resolveMediaValueToApiPath(video.videoUrl)}
              thumbnailUrl={
                video.thumbnailUrl
                  ? resolveMediaValueToApiPath(video.thumbnailUrl)
                  : undefined
              }
              watermark={video.watermark}
              downloadLabel={t('actions.download')}
              preparePreviewLabel={t('result.prepare_preview')}
              retryPreviewLabel={t('result.retry_preview')}
              previewOnDemandLabel={t('result.preview_on_demand')}
              preparingPreviewLabel={t('result.preparing_preview')}
              previewFailedLabel={t('result.preview_failed')}
            />
          ))}
        </div>
      </ResultShell>
    );
  }

  if (result.songs.length > 0) {
    return (
      <ResultShell className="bg-background/40 p-3">
        <div className="flex w-full flex-col gap-2">
          {result.songs.map((song, index) => (
            <AudioPlayer
              key={song.id || `${task.id}-song-${index}`}
              src={resolveMediaValueToApiPath(song.audioUrl)}
              title={song.title}
              className="w-full"
            />
          ))}
        </div>
      </ResultShell>
    );
  }

  if (isWaiting) {
    return (
      <ResultShell>
        <EmptyResult
          icon={<Loader2 className="h-5 w-5 animate-spin text-sky-300" />}
          label={t('result.processing')}
        />
      </ResultShell>
    );
  }

  if (!result.parsed && task.taskInfo) {
    return (
      <ResultShell>
        <EmptyResult
          icon={<FileQuestion className="h-5 w-5" />}
          label={t('result.unavailable')}
        />
      </ResultShell>
    );
  }

  return (
    <ResultShell>
      <EmptyResult
        icon={<FileQuestion className="h-5 w-5" />}
        label={t('result.empty')}
      />
    </ResultShell>
  );
}

function TaskAction({
  task,
  result,
  t,
}: {
  task: AITask;
  result: TaskResult;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const isWaiting = isActiveTaskStatus(task.status);
  const firstImage = result.images[0];
  const reusePayload = buildReuseHandoffPayload(task);
  const reuseIntent = getReuseIntent(task.status);
  const reuseTargetHref = getReuseTargetHref(task.mediaType);

  if (isWaiting) {
    return (
      <Link
        href={`/activity/ai-tasks/${task.id}/refresh`}
        className="border-border hover:bg-secondary inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        {t('actions.refresh')}
      </Link>
    );
  }

  return (
    <>
      {reusePayload && reuseIntent && reuseTargetHref ? (
        <AITaskReuseAction
          payload={reusePayload}
          targetHref={reuseTargetHref}
          intent={reuseIntent}
          label={
            reuseIntent === 'retry'
              ? t('actions.fix_and_retry')
              : t('actions.use_as_template')
          }
        />
      ) : null}

      {firstImage && task.status === AITaskStatus.SUCCESS ? (
        <a
          href={resolveMediaValueToApiPath(firstImage.imageUrl)}
          download
          className="border-border hover:bg-secondary inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
        >
          <Download className="h-4 w-4" />
          {t('actions.download')}
        </a>
      ) : null}
    </>
  );
}

function TaskMetaGrid({
  task,
  t,
}: {
  task: AITask;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const costCredits = Number(task.costCredits || 0);
  const items = [
    task.model ? { label: t('fields.model'), value: task.model } : null,
    task.provider
      ? { label: t('fields.provider'), value: task.provider }
      : null,
    Number.isFinite(costCredits) && costCredits > 0
      ? { label: t('fields.cost_credits'), value: String(costCredits) }
      : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  if (!items.length) {
    return null;
  }

  return (
    <dl className="grid gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="border-border bg-background/50 rounded-md border px-3 py-2"
        >
          <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            {item.label}
          </dt>
          <dd className="text-foreground mt-1 truncate text-sm font-medium">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TaskDetails({
  task,
  result,
  t,
}: {
  task: AITask;
  result: TaskResult;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <details className="border-border bg-background/40 rounded-md border px-3 py-2">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium transition-colors">
        {t('details.title')}
      </summary>
      <div className="mt-3 space-y-3">
        {result.errorMessage ? (
          <div className="rounded-md border border-rose-400/20 bg-rose-500/10 px-3 py-2">
            <div className="text-xs font-medium text-rose-200">
              {t('details.failure_reason')}
            </div>
            <p className="mt-1 text-sm leading-6 text-rose-100">
              {result.errorMessage}
            </p>
          </div>
        ) : null}
        <div>
          <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('details.original_prompt')}
          </div>
          <p className="text-foreground mt-1 max-h-32 overflow-auto text-sm leading-6 whitespace-pre-wrap">
            {task.prompt || t('result.no_prompt')}
          </p>
        </div>
      </div>
    </details>
  );
}

function TaskCard({
  task,
  locale,
  t,
}: {
  task: AITask;
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const result = extractTaskResult(task);
  const createdAt = formatRelativeDate(task.createdAt, locale);

  return (
    <article className="bg-card/70 border-border grid gap-5 rounded-lg border p-4 shadow-sm md:grid-cols-[minmax(280px,420px)_1fr]">
      <TaskResultPreview task={task} result={result} t={t} />

      <div className="flex min-w-0 flex-col justify-between gap-5">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium',
                getStatusClasses(task.status)
              )}
            >
              {task.status || t('status.unknown')}
            </span>
            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
              {getMediaIcon(task.mediaType)}
              {t(`media.${getMediaLabelKey(task.mediaType)}`)}
            </span>
            {createdAt ? (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
                <CalendarClock className="h-4 w-4" />
                {createdAt}
              </span>
            ) : null}
          </div>

          <TaskMetaGrid task={task} t={t} />
          <TaskDetails task={task} result={result} t={t} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TaskAction task={task} result={result} t={t} />
        </div>
      </div>
    </article>
  );
}

function ActiveTaskCard({
  task,
  locale,
  t,
}: {
  task: AITask;
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const createdAt = formatRelativeDate(task.createdAt, locale);

  return (
    <article className="border-border bg-card/60 flex min-w-[280px] flex-1 items-center gap-4 rounded-lg border p-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-sky-400/25 bg-sky-500/10 text-sky-300">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
              getStatusClasses(task.status)
            )}
          >
            {task.status || t('status.unknown')}
          </span>
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            {getMediaIcon(task.mediaType)}
            {t(`media.${getMediaLabelKey(task.mediaType)}`)}
          </span>
        </div>
        <p className="text-foreground line-clamp-1 text-sm font-medium">
          {t('active.status_line', {
            media: t(`media.${getMediaLabelKey(task.mediaType)}`),
          })}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {createdAt
            ? `${createdAt} · ${t('active.refresh_hint')}`
            : t('active.refresh_hint')}
        </p>
      </div>
      <Link
        href={`/activity/ai-tasks/${task.id}/refresh`}
        className="border-border hover:bg-secondary inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        {t('actions.refresh')}
      </Link>
    </article>
  );
}

function FilterLink({
  href,
  active,
  title,
  count,
}: {
  href: string;
  active: boolean;
  title: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      )}
    >
      <span>{title}</span>
      <span
        className={cn(
          'rounded px-1.5 py-0.5 text-xs',
          active ? 'bg-background/15' : 'bg-secondary'
        )}
      >
        {count}
      </span>
    </Link>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border bg-card/60 flex min-w-28 items-center justify-between gap-4 rounded-lg border px-3 py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-foreground text-lg font-semibold">{value}</span>
    </div>
  );
}

export default async function AiTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number; type?: string }>;
}) {
  const { page: pageNum, pageSize, type } = await searchParams;
  const page = Number(pageNum) > 0 ? Number(pageNum) : 1;
  const limit = Number(pageSize) > 0 ? Number(pageSize) : 12;

  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await getTranslations('activity.ai-tasks');
  const locale = await getLocale();

  const supportedMediaTypes = ['image', 'video'];
  const requestType = typeof type === 'string' ? type.toLowerCase() : '';
  const selectedType =
    requestType && supportedMediaTypes.includes(requestType)
      ? requestType
      : undefined;

  const [
    aiTasks,
    total,
    allTotal,
    mediaTypeCounts,
    pendingTotal,
    processingTotal,
    pendingTasks,
    processingTasks,
  ] = await Promise.all([
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
    getAITasksCount({
      userId: user.id,
    }),
    getAITaskMediaTypeCounts({
      userId: user.id,
    }),
    getAITasksCount({
      userId: user.id,
      status: AITaskStatus.PENDING,
    }),
    getAITasksCount({
      userId: user.id,
      status: AITaskStatus.PROCESSING,
    }),
    getAITasks({
      userId: user.id,
      mediaType: selectedType,
      status: AITaskStatus.PENDING,
      page: 1,
      limit: 4,
    }),
    getAITasks({
      userId: user.id,
      mediaType: selectedType,
      status: AITaskStatus.PROCESSING,
      page: 1,
      limit: 4,
    }),
  ]);

  const activeTotal = pendingTotal + processingTotal;
  const imageTotal = mediaTypeCounts.image ?? 0;
  const videoTotal = mediaTypeCounts.video ?? 0;
  const activeTasks = [...pendingTasks, ...processingTasks]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 4);
  const highlightedActiveTaskIds = new Set(
    activeTasks.map((task) => task.id)
  );
  const historyTasks = aiTasks.filter(
    (task) => !highlightedActiveTaskIds.has(task.id)
  );

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-foreground text-2xl font-semibold">
              {t('list.title')}
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              {t('list.description')}
            </p>
            <div className="flex flex-wrap gap-2">
              <FilterLink
                href="/activity/ai-tasks"
                active={!selectedType}
                title={t('list.tabs.all')}
                count={allTotal}
              />
              <FilterLink
                href="/activity/ai-tasks?type=image"
                active={selectedType === 'image'}
                title={t('list.tabs.image')}
                count={imageTotal}
              />
              <FilterLink
                href="/activity/ai-tasks?type=video"
                active={selectedType === 'video'}
                title={t('list.tabs.video')}
                count={videoTotal}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <StatPill label={t('stats.total')} value={allTotal} />
            <StatPill label={t('stats.images')} value={imageTotal} />
            <StatPill label={t('stats.videos')} value={videoTotal} />
            <StatPill label={t('stats.active')} value={activeTotal} />
          </div>
        </div>
      </section>

      {activeTasks.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-foreground text-lg font-semibold">
            {t('sections.now_processing')}
          </h3>
          <div className="grid gap-3 xl:grid-cols-2">
            {activeTasks.map((task) => (
              <ActiveTaskCard key={task.id} task={task} locale={locale} t={t} />
            ))}
          </div>
        </section>
      ) : null}

      {historyTasks.length > 0 ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-foreground text-lg font-semibold">
              {t('sections.history')}
            </h3>
            <span className="text-muted-foreground text-xs">
              {t('sections.newest_first')}
            </span>
          </div>
          {historyTasks.map((task) => (
            <TaskCard key={task.id} task={task} locale={locale} t={t} />
          ))}
        </section>
      ) : aiTasks.length === 0 && activeTasks.length === 0 ? (
        <section className="border-border bg-card/60 flex min-h-72 items-center justify-center rounded-lg border">
          <EmptyResult
            icon={<FileQuestion className="h-5 w-5" />}
            label={t('list.empty_message')}
          />
        </section>
      ) : null}

      <Pagination total={total} page={page} limit={limit} />
    </div>
  );
}
