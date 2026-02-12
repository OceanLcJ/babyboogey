'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconX } from '@tabler/icons-react';
import {
  Check,
  CreditCard,
  Download,
  Image as ImageIcon,
  Loader2,
  Lock,
  User,
  Video,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { Link, useRouter } from '@/core/i18n/navigation';
import { AIMediaType, AITaskStatus } from '@/extensions/ai/types';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/label';
import { Progress } from '@/shared/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { useAppContext } from '@/shared/contexts/app';
import {
  markWatermarkCtaClick,
  trackAnalyticsEvent,
} from '@/shared/lib/analytics-events';
import { resolveMediaValueToApiPath } from '@/shared/lib/asset-ref';
import { cn } from '@/shared/lib/utils';

interface VideoGeneratorProps {
  maxSizeMB?: number;
  srOnlyTitle?: string;
}

interface GeneratedVideo {
  id: string;
  url: string;
  provider?: string;
  model?: string;
  prompt?: string;
  watermarkApplied?: boolean;
  watermarkType?: 'none' | 'dynamic_overlay';
  watermarkOpacity?: number;
  watermarkIntervalSeconds?: number;
  watermarkText?: string;
}

interface BackendTask {
  id: string;
  status: string;
  mediaType?: string;
  provider: string;
  model: string;
  prompt: string | null;
  watermarkApplied?: boolean;
  watermarkMode?: string | null;
  watermarkedAssetId?: string | null;
  taskInfo: string | null;
  taskResult: string | null;
}

interface TaskVideoMetadata {
  url: string;
  watermarkApplied: boolean;
  watermarkType: 'none' | 'dynamic_overlay';
  watermarkOpacity?: number;
  watermarkIntervalSeconds?: number;
  watermarkText?: string;
}

interface WatermarkedPlaybackState {
  status: 'processing' | 'ready' | 'error';
  blobUrl?: string;
  extension?: string;
}

interface DanceTemplate {
  id: string;
  name: string;
  nameZh: string;
  videoUrl: string;
  duration: string;
  isPro?: boolean;
  isHot?: boolean;
}

type VideoGenerationStage =
  | 'submitting'
  | 'queued'
  | 'processing'
  | 'rendering'
  | 'finalizing'
  | 'success'
  | 'failed';

const FAST_POLL_INTERVAL = 8000;
const SLOW_POLL_INTERVAL = 12000;
const FAST_POLL_PHASE_MS = 60000;
const FINALIZING_STAGE_MS = 90000;
const GENERATION_TIMEOUT = 600000;
const MAX_PROMPT_LENGTH = 500;
const MAX_IMAGE_ORIENTATION_SECONDS = 10;
const PROGRESS_ANIMATION_TICK_MS = 250;
const SUCCESS_HOLD_MS = 1200;
const PROGRESS_CAP_BEFORE_SUCCESS = 95;

const DEFAULT_NEGATIVE_PROMPT =
  'blurry, low quality, low-res, deformed face, warped hands, extra limbs, missing fingers, bad anatomy, flicker, jitter, morphing, distortion, artifacts, text, watermark, logo';

const VIDEO_PROVIDER = 'kie';
const VIDEO_MODEL = 'kling-2.6/motion-control';

const DANCE_TEMPLATE_PROMPTS: Record<string, string> = {
  'temp-05':
    "Animate the child in the photo doing a rhythmic beat dance: bouncy steps, shoulder pops, and simple hand waves. Smooth natural motion, stable background, keep identity and clothing consistent. Locked-off medium shot, high quality.",
  'viral-dance':
    'Animate the child in the photo doing a trendy viral short-form dance: energetic, playful, easy-to-follow moves with hand gestures and hip sways. Smooth motion, stable background, keep identity consistent. Locked-off medium shot, high quality.',
  'temp-01':
    'Animate the child in the photo doing cool hip-hop street dance: sharp arm hits, confident footwork, and head bobs. Smooth motion, stable background, keep identity consistent. Locked-off medium shot, high quality.',
  'temp-02':
    'Animate the child in the photo doing a fun funky groove: playful swaying, light steps, and cheerful energy. Smooth motion, stable background, keep identity consistent. Locked-off medium shot, high quality.',
  'temp-03':
    'Animate the child in the photo doing a happy bouncy dance: small hops, claps, and joyful moves. Smooth motion, stable background, keep identity consistent. Locked-off medium shot, high quality.',
  'temp-04':
    'Animate the child in the photo doing a smooth sway dance: gentle side-to-side sways with fluid arm waves. Smooth motion, stable background, keep identity consistent. Locked-off medium shot, high quality.',
  'temp-06':
    'Animate the child in the photo doing a cute wiggle dance: tiny shoulder shakes, head bops, and adorable wiggly moves. Smooth motion, stable background, keep identity consistent. Locked-off medium shot, high quality.',
  'temp-07':
    'Animate the child in the photo doing quick-step dance: fast footwork, small hops, and lively rhythm. Smooth motion, stable background, keep identity consistent. Locked-off medium shot, high quality.',
  'temp-08':
    'Animate the child in the photo doing a gentle wave dance: flowing arm waves and calm rhythmic sways. Smooth motion, stable background, keep identity consistent. Locked-off medium shot, high quality.',
  'temp-09':
    'Animate the child in the photo doing an energy burst dance: dynamic moves, quick transitions, and high-energy rhythm. Smooth motion, stable background, keep identity consistent. Locked-off medium shot, high quality.',
  'temp-10':
    'Animate the child in the photo doing playful dance steps: fun gestures, lighthearted moves, and cheerful vibe. Smooth motion, stable background, keep identity consistent. Locked-off medium shot, high quality.',
  'temp-11':
    'Animate the child in the photo doing sweet cute dance: soft gestures, charming moves, and gentle rhythm. Smooth motion, stable background, keep identity consistent. Locked-off medium shot, high quality.',
  'temp-12':
    'Animate the child in the photo doing a dynamic dance: varied moves, energetic transitions, and lively rhythm. Smooth motion, stable background, keep identity consistent. Locked-off medium shot, high quality.',
  'template-0':
    'Animate the child in the photo doing a cute upbeat dance in place. Smooth natural motion, stable background, keep identity and clothing consistent. Locked-off medium shot, high quality.',
};

function getDefaultDancePrompt(template: DanceTemplate) {
  return (
    DANCE_TEMPLATE_PROMPTS[template.id] ??
    'Animate the child in the photo dancing in place. Smooth natural motion, stable background, keep identity and clothing consistent. Locked-off medium shot, high quality.'
  );
}

function parseTemplateDurationSeconds(duration: string): number | null {
  const match = duration.match(/^(\d+):(\d{2})$/);
  if (!match) {
    return null;
  }
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return minutes * 60 + seconds;
}

const DANCE_TEMPLATES: DanceTemplate[] = [
  {
    id: 'temp-05',
    name: 'Rhythm Beat',
    nameZh: '节奏感舞步',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/temp-05.mp4',
    duration: '0:04',
  },
  {
    id: 'viral-dance',
    name: 'Viral Dance',
    nameZh: '热门舞蹈',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/effects_video_shortform_viral_dance.mp4',
    duration: '0:05',
    isHot: true,
  },
  {
    id: 'temp-01',
    name: 'Cool Moves',
    nameZh: '酷炫街舞',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/temp-01.mp4',
    duration: '0:15',
    isPro: true,
  },
  {
    id: 'temp-02',
    name: 'Fun Groove',
    nameZh: '趣味律动',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/temp-02.mp4',
    duration: '0:09',
    isPro: true,
  },
  {
    id: 'temp-03',
    name: 'Happy Bounce',
    nameZh: '欢乐蹦跳',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/temp-03.mp4',
    duration: '0:09',
    isPro: true,
  },
  {
    id: 'temp-04',
    name: 'Smooth Sway',
    nameZh: '柔和摇摆',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/temp-04.mp4',
    duration: '0:21',
    isPro: true,
  },
  {
    id: 'temp-06',
    name: 'Cute Wiggle',
    nameZh: '可爱扭动',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/temp-06.mp4',
    duration: '0:08',
    isPro: true,
  },
  {
    id: 'temp-07',
    name: 'Quick Steps',
    nameZh: '快速小步',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/temp-07.mp4',
    duration: '0:15',
    isPro: true,
  },
  {
    id: 'temp-08',
    name: 'Gentle Wave',
    nameZh: '温柔波浪',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/temp-08.mp4',
    duration: '0:09',
    isPro: true,
  },
  {
    id: 'temp-09',
    name: 'Energy Burst',
    nameZh: '活力四射',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/temp-09.mp4',
    duration: '0:19',
    isPro: true,
  },
  {
    id: 'temp-10',
    name: 'Playful Steps',
    nameZh: '俏皮舞步',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/temp-10.mp4',
    duration: '0:17',
    isPro: true,
  },
  {
    id: 'temp-11',
    name: 'Sweet Moves',
    nameZh: '甜美律动',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/temp-11.mp4',
    duration: '0:16',
    isPro: true,
  },
  {
    id: 'temp-12',
    name: 'Dynamic Dance',
    nameZh: '动感舞蹈',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/temp-12.mp4',
    duration: '0:14',
    isPro: true,
  },
  {
    id: 'template-0',
    name: 'Cute Boy',
    nameZh: '默认模板',
    videoUrl:
      'https://r2.babyboogey.com/assets/imgs/blog/template-0.mp4',
    duration: '0:14',
    isPro: true,
  },
];

const EXAMPLE_IMAGES = [
  'https://r2.babyboogey.com/assets/imgs/blog/image-1.png',
  'https://r2.babyboogey.com/assets/imgs/blog/image-2.png',
  'https://r2.babyboogey.com/assets/imgs/blog/image-3.jpg',
  'https://r2.babyboogey.com/assets/imgs/blog/image-4.jpg',
];

const RESOLUTION_OPTIONS = [
  { value: '720p', credits: 60 },
  { value: '1080p', credits: 120 },
];

function parseTaskResult(taskResult: string | null): any {
  if (!taskResult) {
    return null;
  }

  try {
    return JSON.parse(taskResult);
  } catch (error) {
    console.warn('Failed to parse taskResult:', error);
    return null;
  }
}

function normalizeWatermarkType(value?: string | null): 'none' | 'dynamic_overlay' {
  return String(value || '').trim().toLowerCase() === 'dynamic_overlay'
    ? 'dynamic_overlay'
    : 'none';
}

function isDynamicWatermarkedVideo(
  video?:
    | Pick<GeneratedVideo, 'watermarkApplied' | 'watermarkType'>
    | null
) {
  return Boolean(video?.watermarkApplied) && video?.watermarkType === 'dynamic_overlay';
}

function readTaskWatermarkFallback(task?: BackendTask | null) {
  const watermarkType = normalizeWatermarkType(task?.watermarkMode || 'none');
  const watermarkApplied = Boolean(task?.watermarkApplied) && watermarkType !== 'none';

  return {
    watermarkApplied,
    watermarkType: watermarkApplied ? watermarkType : 'none',
  } as const;
}

function toTaskVideoMetadata({
  candidate,
  fallback,
}: {
  candidate: unknown;
  fallback: ReturnType<typeof readTaskWatermarkFallback>;
}): TaskVideoMetadata | null {
  if (typeof candidate === 'string') {
    return {
      url: candidate,
      watermarkApplied: fallback.watermarkApplied,
      watermarkType: fallback.watermarkType,
    };
  }

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const item = candidate as Record<string, unknown>;
  const urlCandidate =
    item.url ?? item.uri ?? item.video ?? item.src ?? item.videoUrl;
  if (typeof urlCandidate !== 'string' || !urlCandidate.trim()) {
    return null;
  }

  const watermarkType = normalizeWatermarkType(
    String(item.watermarkType || fallback.watermarkType)
  );
  const watermarkApplied =
    typeof item.watermarkApplied === 'boolean'
      ? item.watermarkApplied
      : fallback.watermarkApplied;

  return {
    url: urlCandidate,
    watermarkApplied: watermarkApplied && watermarkType !== 'none',
    watermarkType: watermarkApplied ? watermarkType : 'none',
    watermarkOpacity: Number.isFinite(Number(item.watermarkOpacity))
      ? Number(item.watermarkOpacity)
      : undefined,
    watermarkIntervalSeconds: Number.isFinite(Number(item.watermarkIntervalSeconds))
      ? Number(item.watermarkIntervalSeconds)
      : undefined,
    watermarkText:
      typeof item.watermarkText === 'string' ? item.watermarkText : undefined,
  };
}

function extractGeneratedVideos(result: any, task?: BackendTask | null): TaskVideoMetadata[] {
  const fallback = readTaskWatermarkFallback(task);

  if (!result) {
    return [];
  }

  const videos = result.videos;
  if (videos && Array.isArray(videos)) {
    return videos
      .map((item: unknown) => toTaskVideoMetadata({ candidate: item, fallback }))
      .filter(Boolean) as TaskVideoMetadata[];
  }

  const output = result.output ?? result.video ?? result.data;

  if (!output) {
    return [];
  }

  if (typeof output === 'string') {
    const mapped = toTaskVideoMetadata({ candidate: output, fallback });
    return mapped ? [mapped] : [];
  }

  if (Array.isArray(output)) {
    return output
      .map((item: unknown) => toTaskVideoMetadata({ candidate: item, fallback }))
      .filter(Boolean) as TaskVideoMetadata[];
  }

  if (typeof output === 'object') {
    const mapped = toTaskVideoMetadata({ candidate: output, fallback });
    return mapped ? [mapped] : [];
  }

  return [];
}

function inferExtensionFromMimeType(mimeType?: string) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('mp4')) {
    return 'mp4';
  }
  if (normalized.includes('webm')) {
    return 'webm';
  }
  return 'mp4';
}

function pickMediaRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }

  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];

  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return '';
}

type CaptureStreamVideoElement = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

async function renderWatermarkedVideoBlob({
  videoUrl,
  watermarkText,
  watermarkOpacity,
  watermarkIntervalSeconds,
}: {
  videoUrl: string;
  watermarkText?: string;
  watermarkOpacity?: number;
  watermarkIntervalSeconds?: number;
}): Promise<{ blob: Blob; extension: string }> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('watermark download is only supported in browser');
  }

  if (typeof MediaRecorder === 'undefined') {
    throw new Error('media recorder is not supported');
  }

  return new Promise((resolve, reject) => {
    const source = document.createElement('video');
    source.preload = 'auto';
    source.playsInline = true;
    source.crossOrigin = 'anonymous';
    source.src = videoUrl;
    source.style.position = 'fixed';
    source.style.left = '-10000px';
    source.style.width = '1px';
    source.style.height = '1px';
    source.style.opacity = '0';
    document.body.appendChild(source);

    let rafId: number | null = null;
    let settled = false;
    let recorder: MediaRecorder | null = null;
    let composedStream: MediaStream | null = null;
    const chunks: BlobPart[] = [];

    const cleanup = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      if (composedStream) {
        composedStream.getTracks().forEach((track) => track.stop());
      }
      source.pause();
      source.removeAttribute('src');
      source.load();
      source.remove();
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error('failed to export video'));
    };

    const succeed = (blob: Blob, extension: string) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve({ blob, extension });
    };

    source.onerror = () => fail(new Error('failed to load source video'));
    source.onloadedmetadata = () => {
      const width = source.videoWidth || 0;
      const height = source.videoHeight || 0;
      if (!width || !height) {
        fail(new Error('invalid source video size'));
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        fail(new Error('canvas 2d context is unavailable'));
        return;
      }

      if (typeof canvas.captureStream !== 'function') {
        fail(new Error('captureStream is not supported'));
        return;
      }

      composedStream = canvas.captureStream(30);
      const captureVideo = source as CaptureStreamVideoElement;
      const captureFn =
        typeof captureVideo.captureStream === 'function'
          ? captureVideo.captureStream.bind(captureVideo)
          : typeof captureVideo.mozCaptureStream === 'function'
            ? captureVideo.mozCaptureStream.bind(captureVideo)
            : null;

      if (captureFn) {
        try {
          const sourceStream = captureFn();
          sourceStream
            .getAudioTracks()
            .forEach((track) => composedStream?.addTrack(track));
        } catch {
          // Continue without audio track if browser cannot capture it.
        }
      }

      const mimeType = pickMediaRecorderMimeType();
      try {
        recorder = mimeType
          ? new MediaRecorder(composedStream, { mimeType })
          : new MediaRecorder(composedStream);
      } catch (error) {
        fail(error);
        return;
      }

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = (event) => {
        fail((event as ErrorEvent).error || new Error('recording failed'));
      };
      recorder.onstop = () => {
        const finalType = recorder?.mimeType || mimeType || 'video/webm';
        const blob = new Blob(chunks, { type: finalType });
        if (!blob.size) {
          fail(new Error('empty watermark export'));
          return;
        }
        succeed(blob, inferExtensionFromMimeType(finalType));
      };

      const intervalSeconds = Math.max(1, watermarkIntervalSeconds || 3);
      const opacity = Math.min(0.9, Math.max(0.08, watermarkOpacity || 0.28));
      const displayText = (watermarkText || 'BabyBoogey').slice(0, 64);

      const drawOverlay = () => {
        if (settled) {
          return;
        }

        context.clearRect(0, 0, width, height);
        context.drawImage(source, 0, 0, width, height);

        const fontSize = Math.max(14, Math.round(Math.min(width, height) * 0.04));
        context.font = `600 ${fontSize}px sans-serif`;
        const horizontalPadding = Math.round(fontSize * 0.65);
        const verticalPadding = Math.round(fontSize * 0.45);
        const metrics = context.measureText(displayText);
        const boxWidth = Math.round(metrics.width + horizontalPadding * 2);
        const boxHeight = Math.round(fontSize + verticalPadding * 2);
        const safeMargin = 10;
        const cycle = (source.currentTime / intervalSeconds) * Math.PI * 2;

        const drawWatermarkAt = (
          baseX: number,
          baseY: number,
          driftX: number,
          driftY: number
        ) => {
          const x = Math.round(
            Math.max(
              safeMargin,
              Math.min(width - boxWidth - safeMargin, baseX + driftX)
            )
          );
          const yBottom = Math.round(
            Math.max(
              boxHeight + safeMargin,
              Math.min(height - safeMargin, baseY + driftY)
            )
          );

          context.save();
          context.globalAlpha = opacity;
          context.fillStyle = 'rgba(0, 0, 0, 0.5)';
          context.fillRect(x, yBottom - boxHeight, boxWidth, boxHeight);
          context.fillStyle = 'rgba(255, 255, 255, 0.95)';
          context.textBaseline = 'alphabetic';
          context.fillText(
            displayText,
            x + horizontalPadding,
            yBottom - verticalPadding
          );
          context.restore();
        };

        drawWatermarkAt(
          width * 0.07,
          height * 0.18,
          Math.sin(cycle) * width * 0.08,
          Math.cos(cycle * 0.8) * height * 0.06
        );
        drawWatermarkAt(
          width * 0.68,
          height * 0.88,
          Math.cos(cycle * 1.1) * width * 0.09,
          Math.sin(cycle * 0.9) * height * 0.07
        );

        if (source.ended) {
          if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
          }
          return;
        }
        rafId = requestAnimationFrame(drawOverlay);
      };

      source.onended = () => {
        if (recorder && recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      try {
        recorder.start(250);
      } catch (error) {
        fail(error);
        return;
      }

      source
        .play()
        .then(() => {
          rafId = requestAnimationFrame(drawOverlay);
        })
        .catch((error) => {
          fail(error);
        });
    };
  });
}

const uploadImageFile = async (file: File) => {
  const formData = new FormData();
  formData.append('files', file);
  formData.append('purpose', 'reference_image');
  formData.append('source', 'upload');

  const response = await fetch('/api/storage/upload-media', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }

  const result = await response.json();
  if (result.code !== 0 || !result.data?.assetRef || !result.data?.assetId) {
    throw new Error(result.message || 'Upload failed');
  }

  return {
    assetId: result.data.assetId as string,
    assetRef: result.data.assetRef as string,
    previewUrl:
      `/api/storage/assets/${encodeURIComponent(result.data.assetId as string)}`,
  };
};

function mapVideoErrorToUserMessage(
  rawMessage: string | undefined,
  localeContext: {
    t: (key: string) => string;
    locale?: string;
  }
): string {
  const message = (rawMessage || '').toLowerCase();
  const { t } = localeContext;

  if (
    message.includes('insufficient credits') ||
    message.includes('not enough credits')
  ) {
    return t('errors.insufficient_credits_actionable');
  }

  if (message.includes('timed out') || message.includes('timeout')) {
    return t('errors.timeout_actionable');
  }

  if (
    message.includes('no videos') ||
    message.includes('no video') ||
    message.includes('empty result')
  ) {
    return t('errors.empty_result_actionable');
  }

  if (
    message.includes('invalid provider') ||
    message.includes('invalid ai provider')
  ) {
    return t('errors.provider_unavailable_actionable');
  }

  if (message.includes('task not found')) {
    return t('errors.task_not_found_actionable');
  }

  if (
    message.includes('input_urls is required') ||
    message.includes('video_urls is required') ||
    message.includes('invalid params') ||
    message.includes('prompt or options is required')
  ) {
    return t('errors.input_missing_actionable');
  }

  if (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('request failed')
  ) {
    return t('errors.network_retry_actionable');
  }

  return t('errors.generic_retry_actionable');
}

export function VideoGenerator({
  maxSizeMB = 10,
  srOnlyTitle,
}: VideoGeneratorProps) {
  const t = useTranslations('ai.video.generator');
  const locale = useLocale();
  const router = useRouter();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploadedImage, setUploadedImage] = useState<{
    preview: string;
    url?: string;
    status: 'idle' | 'uploading' | 'uploaded' | 'error';
  } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<DanceTemplate>(
    DANCE_TEMPLATES[0]
  );
  const [prompt, setPrompt] = useState('');
  const [promptTouched, setPromptTouched] = useState(false);
  const [resolution, setResolution] = useState('720p');
  const [orientation, setOrientation] = useState('video');
  const [isPublic, setIsPublic] = useState(true);

  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressTarget, setProgressTarget] = useState(0);
  const [generationStage, setGenerationStage] =
    useState<VideoGenerationStage | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(
    null
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [taskStatus, setTaskStatus] = useState<AITaskStatus | null>(null);
  const [downloadingVideoId, setDownloadingVideoId] = useState<string | null>(
    null
  );
  const [watermarkedPlaybackByVideoId, setWatermarkedPlaybackByVideoId] =
    useState<Record<string, WatermarkedPlaybackState>>({});
  const [isMounted, setIsMounted] = useState(false);
  const isPollingRef = useRef(false);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const isAliveRef = useRef(true);
  const watermarkShownTaskIdsRef = useRef<Set<string>>(new Set());
  const watermarkedPlaybackByVideoIdRef = useRef<
    Record<string, WatermarkedPlaybackState>
  >({});
  const watermarkedRenderInFlightIdsRef = useRef<Set<string>>(new Set());

  const {
    user,
    isCheckSign,
    setIsShowSignModal,
    fetchUserCredits,
    fetchUserInfo,
  } =
    useAppContext();
  const searchParams = useSearchParams();

  useEffect(() => {
    watermarkedPlaybackByVideoIdRef.current = watermarkedPlaybackByVideoId;
  }, [watermarkedPlaybackByVideoId]);

  const canUseProTemplates =
    !!user?.isAdmin || !!user?.membership?.canUseProTemplates;

  const lastBlockedTemplateIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    // Ensure membership info is loaded for gating Pro templates.
    if (user.membership === undefined) {
      fetchUserInfo();
    }
  }, [user?.id, user?.membership, fetchUserInfo]);

  useEffect(() => {
    const templateId = searchParams.get('template');
    if (!templateId) {
      lastBlockedTemplateIdRef.current = null;
      return;
    }

    if (templateId) {
      const template = DANCE_TEMPLATES.find((t) => t.id === templateId);
      if (template && (!template.isPro || canUseProTemplates)) {
        setSelectedTemplate(template);
        lastBlockedTemplateIdRef.current = null;
      } else if (
        template?.isPro &&
        user?.id &&
        user.membership !== undefined &&
        lastBlockedTemplateIdRef.current !== templateId
      ) {
        lastBlockedTemplateIdRef.current = templateId;
        toast.error(t('form.pro_template_member_only'));
      }
    }
  }, [searchParams, canUseProTemplates, user?.id, user?.membership, t]);

  useEffect(() => {
    if (!canUseProTemplates && selectedTemplate?.isPro) {
      setSelectedTemplate(DANCE_TEMPLATES[0]);
    }
  }, [canUseProTemplates, selectedTemplate]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (promptTouched) {
      return;
    }
    setPrompt(getDefaultDancePrompt(selectedTemplate));
  }, [selectedTemplate, promptTouched]);

  const remainingCredits = user?.credits?.remainingCredits ?? 0;
  const currentCost =
    RESOLUTION_OPTIONS.find((r) => r.value === resolution)?.credits ?? 60;
  const selectedTemplateDurationSeconds =
    parseTemplateDurationSeconds(selectedTemplate.duration) ?? 0;
  const translateError = useCallback(
    (key: string) => t(key as any),
    [t]
  );

  const stageLabel = useMemo(() => {
    if (!generationStage) {
      return '';
    }

    switch (generationStage) {
      case 'submitting':
        return t('status.submitting');
      case 'queued':
        return t('status.queued');
      case 'processing':
        return t('status.processing');
      case 'rendering':
        return t('status.rendering');
      case 'finalizing':
        return t('status.finalizing');
      case 'success':
        return t('status.success');
      case 'failed':
      default:
        return '';
    }
  }, [generationStage, t]);

  const etaRangeLabel = useMemo(() => {
    return resolution === '1080p'
      ? t('status.eta_range_1080p')
      : t('status.eta_range_720p');
  }, [resolution, t]);

  const maxBytes = maxSizeMB * 1024 * 1024;

  const revokeWatermarkedPlaybackBlobUrls = useCallback(
    (states: Record<string, WatermarkedPlaybackState>) => {
      Object.values(states).forEach((state) => {
        if (state.blobUrl) {
          URL.revokeObjectURL(state.blobUrl);
        }
      });
    },
    []
  );

  const prepareWatermarkedPlayback = useCallback(
    async (
      video: GeneratedVideo,
      { forceRetry = false }: { forceRetry?: boolean } = {}
    ) => {
      if (!isDynamicWatermarkedVideo(video) || !video.url) {
        return null;
      }

      const existing = watermarkedPlaybackByVideoIdRef.current[video.id];
      if (existing?.status === 'ready' && existing.blobUrl) {
        return {
          blobUrl: existing.blobUrl,
          extension: existing.extension || 'mp4',
        };
      }
      if (existing?.status === 'processing') {
        return null;
      }
      if (existing?.status === 'error' && !forceRetry) {
        return null;
      }
      if (watermarkedRenderInFlightIdsRef.current.has(video.id)) {
        return null;
      }

      watermarkedRenderInFlightIdsRef.current.add(video.id);
      setWatermarkedPlaybackByVideoId((prev) => ({
        ...prev,
        [video.id]: { status: 'processing' },
      }));

      try {
        const rendered = await renderWatermarkedVideoBlob({
          videoUrl: video.url,
          watermarkText: video.watermarkText,
          watermarkOpacity: video.watermarkOpacity,
          watermarkIntervalSeconds: video.watermarkIntervalSeconds,
        });
        const blobUrl = URL.createObjectURL(rendered.blob);

        if (!isAliveRef.current) {
          URL.revokeObjectURL(blobUrl);
          return null;
        }

        setWatermarkedPlaybackByVideoId((prev) => {
          const previousBlobUrl = prev[video.id]?.blobUrl;
          if (previousBlobUrl && previousBlobUrl !== blobUrl) {
            URL.revokeObjectURL(previousBlobUrl);
          }
          return {
            ...prev,
            [video.id]: {
              status: 'ready',
              blobUrl,
              extension: rendered.extension,
            },
          };
        });

        return {
          blobUrl,
          extension: rendered.extension,
        };
      } catch (error) {
        if (isAliveRef.current) {
          setWatermarkedPlaybackByVideoId((prev) => ({
            ...prev,
            [video.id]: { status: 'error' },
          }));
        }
        throw error;
      } finally {
        watermarkedRenderInFlightIdsRef.current.delete(video.id);
      }
    },
    []
  );

  useEffect(() => {
    const activeVideoIds = new Set(generatedVideos.map((video) => video.id));
    setWatermarkedPlaybackByVideoId((prev) => {
      let changed = false;
      const next: Record<string, WatermarkedPlaybackState> = {};

      for (const [videoId, state] of Object.entries(prev)) {
        if (activeVideoIds.has(videoId)) {
          next[videoId] = state;
          continue;
        }

        if (state.blobUrl) {
          URL.revokeObjectURL(state.blobUrl);
        }
        watermarkedRenderInFlightIdsRef.current.delete(videoId);
        changed = true;
      }

      return changed ? next : prev;
    });

    generatedVideos.forEach((video) => {
      if (!isDynamicWatermarkedVideo(video)) {
        return;
      }

      const existing = watermarkedPlaybackByVideoIdRef.current[video.id];
      if (existing?.status === 'ready' || existing?.status === 'processing') {
        return;
      }

      void prepareWatermarkedPlayback(video).catch(() => {});
    });
  }, [generatedVideos, prepareWatermarkedPlayback]);

  const mapTaskVideos = useCallback(
    (task: BackendTask, videos: TaskVideoMetadata[]): GeneratedVideo[] =>
      videos.map((video, index) => ({
        id: `${task.id}-${index}`,
        url: resolveMediaValueToApiPath(video.url),
        provider: task.provider,
        model: task.model,
        prompt: task.prompt ?? undefined,
        watermarkApplied: video.watermarkApplied,
        watermarkType: video.watermarkType,
        watermarkOpacity: video.watermarkOpacity,
        watermarkIntervalSeconds: video.watermarkIntervalSeconds,
        watermarkText: video.watermarkText,
      })),
    []
  );

  const reportWatermarkShown = useCallback(
    (taskIdentifier: string, videos: GeneratedVideo[]) => {
      if (!taskIdentifier || watermarkShownTaskIdsRef.current.has(taskIdentifier)) {
        return;
      }

      const watermarkedCount = videos.filter(
        (video) => video.watermarkApplied && video.watermarkType === 'dynamic_overlay'
      ).length;
      if (watermarkedCount === 0) {
        return;
      }

      watermarkShownTaskIdsRef.current.add(taskIdentifier);
      trackAnalyticsEvent('video_watermark_shown', {
        task_id: taskIdentifier,
        video_count: videos.length,
        watermarked_count: watermarkedCount,
      });
    },
    []
  );

  const handleRemoveWatermarkClick = useCallback(
    (video: GeneratedVideo) => {
      markWatermarkCtaClick();
      trackAnalyticsEvent('click_remove_watermark_cta', {
        provider: video.provider || '',
        model: video.model || '',
        watermark_type: video.watermarkType || 'none',
      });
      router.push('/pricing');
    },
    [router]
  );

  const clearPollingTimer = useCallback(() => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const clearSuccessHoldTimer = useCallback(() => {
    if (successHoldTimerRef.current) {
      clearTimeout(successHoldTimerRef.current);
      successHoldTimerRef.current = null;
    }
  }, []);

  const setGenerationProgressStage = useCallback(
    (stage: VideoGenerationStage, target: number) => {
      setGenerationStage(stage);
      setProgressTarget(
        Math.min(PROGRESS_CAP_BEFORE_SUCCESS, Math.max(0, target))
      );
    },
    []
  );

  const handleTemplateSelect = (template: DanceTemplate) => {
    if (template.isPro && !canUseProTemplates) {
      if (!user) {
        setIsShowSignModal(true);
        toast.error(t('form.pro_template_sign_in_first'));
        return;
      }

      if (user.membership === undefined) {
        fetchUserInfo();
        toast(t('form.checking_membership'));
        return;
      }

      toast.error(t('form.pro_template_member_only'));
      router.push('/pricing');
      return;
    }

    setSelectedTemplate(template);
  };

  useEffect(() => {
    if (orientation !== 'image') {
      return;
    }
    if (selectedTemplateDurationSeconds <= MAX_IMAGE_ORIENTATION_SECONDS) {
      return;
    }
    setOrientation('video');
    toast(t('form.orientation_auto_switched_video'));
  }, [orientation, selectedTemplateDurationSeconds, t]);

  const handleFileSelect = async (file: File) => {
    if (!file.type?.startsWith('image/')) {
      toast.error('Only image files are supported');
      return;
    }
    if (file.size > maxBytes) {
      toast.error(`File exceeds the ${maxSizeMB}MB limit`);
      return;
    }

    const preview = URL.createObjectURL(file);
    setUploadedImage({ preview, status: 'uploading' });

    try {
      const uploaded = await uploadImageFile(file);
      setUploadedImage({
        preview: uploaded.previewUrl,
        url: uploaded.assetRef,
        status: 'uploaded',
      });
    } catch (error: any) {
      console.error('Upload failed:', error);
      toast.error(error?.message || 'Upload failed');
      setUploadedImage((prev) =>
        prev ? { ...prev, status: 'error' } : null
      );
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleExampleClick = (url: string) => {
    setUploadedImage({ preview: url, url, status: 'uploaded' });
  };

  const handleRemoveImage = () => {
    if (uploadedImage?.preview.startsWith('blob:')) {
      URL.revokeObjectURL(uploadedImage.preview);
    }
    setUploadedImage(null);
  };

  const resetTaskState = useCallback(() => {
    clearPollingTimer();
    clearSuccessHoldTimer();
    isPollingRef.current = false;
    watermarkedRenderInFlightIdsRef.current.clear();

    setIsGenerating(false);
    setProgress(0);
    setProgressTarget(0);
    setGenerationStage(null);
    setTaskId(null);
    setGenerationStartTime(null);
    setElapsedSeconds(0);
    setTaskStatus(null);
    setWatermarkedPlaybackByVideoId((prev) => {
      revokeWatermarkedPlaybackBlobUrls(prev);
      return {};
    });
  }, [
    clearPollingTimer,
    clearSuccessHoldTimer,
    revokeWatermarkedPlaybackBlobUrls,
  ]);

  const completeWithSuccess = useCallback(() => {
    setGenerationStage('success');
    setProgressTarget(100);
    clearSuccessHoldTimer();
    successHoldTimerRef.current = setTimeout(() => {
      if (!isAliveRef.current) {
        return;
      }
      resetTaskState();
    }, SUCCESS_HOLD_MS);
  }, [clearSuccessHoldTimer, resetTaskState]);

  useEffect(() => {
    isAliveRef.current = true;
    return () => {
      isAliveRef.current = false;
      clearPollingTimer();
      clearSuccessHoldTimer();
      watermarkedRenderInFlightIdsRef.current.clear();
      revokeWatermarkedPlaybackBlobUrls(watermarkedPlaybackByVideoIdRef.current);
    };
  }, [
    clearPollingTimer,
    clearSuccessHoldTimer,
    revokeWatermarkedPlaybackBlobUrls,
  ]);

  useEffect(() => {
    if (!isGenerating) {
      return;
    }
    if (progress >= progressTarget) {
      return;
    }

    const timer = setTimeout(() => {
      if (!isAliveRef.current) {
        return;
      }
      setProgress((prev) => {
        if (prev >= progressTarget) {
          return prev;
        }
        const remaining = progressTarget - prev;
        const delta = Math.max(1, Math.round(remaining * 0.25));
        return Math.min(progressTarget, prev + delta);
      });
    }, PROGRESS_ANIMATION_TICK_MS);

    return () => clearTimeout(timer);
  }, [isGenerating, progress, progressTarget]);

  useEffect(() => {
    if (!isGenerating || !generationStartTime) {
      return;
    }

    const updateElapsedSeconds = () => {
      if (!isAliveRef.current) {
        return;
      }
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - generationStartTime) / 1000)));
    };

    updateElapsedSeconds();
    const timer = setInterval(updateElapsedSeconds, 1000);
    return () => clearInterval(timer);
  }, [isGenerating, generationStartTime]);

  const pollTaskStatus = useCallback(
    async (id: string) => {
      try {
        if (
          generationStartTime &&
          Date.now() - generationStartTime > GENERATION_TIMEOUT
        ) {
          setGenerationStage('failed');
          toast.error(
            mapVideoErrorToUserMessage('timeout', {
              t: translateError,
              locale,
            })
          );
          resetTaskState();
          return true;
        }

        const resp = await fetch('/api/ai/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ taskId: id }),
        });

        if (!resp.ok) {
          throw new Error(`request failed with status: ${resp.status}`);
        }

        const { code, message, data } = await resp.json();
        if (code !== 0) {
          throw new Error(message || 'Query task failed');
        }
        if (!isAliveRef.current) {
          return true;
        }

        const task = data as BackendTask;
        const currentStatus = task.status as AITaskStatus;
        setTaskStatus(currentStatus);

        const parsedResult = parseTaskResult(task.taskInfo);
        const extractedVideos = extractGeneratedVideos(parsedResult, task);

        if (currentStatus === AITaskStatus.PENDING) {
          setGenerationProgressStage('queued', 35);
          return false;
        }

        if (currentStatus === AITaskStatus.PROCESSING) {
          if (extractedVideos.length > 0) {
            const mappedVideos = mapTaskVideos(task, extractedVideos);
            setGeneratedVideos(mappedVideos);
            reportWatermarkShown(task.id, mappedVideos);
            setGenerationProgressStage('rendering', 88);
          } else {
            const elapsedMs = generationStartTime
              ? Date.now() - generationStartTime
              : 0;
            if (elapsedMs > FINALIZING_STAGE_MS) {
              setGenerationProgressStage('finalizing', PROGRESS_CAP_BEFORE_SUCCESS);
            } else {
              setGenerationProgressStage('processing', 72);
            }
          }
          return false;
        }

        if (currentStatus === AITaskStatus.SUCCESS) {
          if (extractedVideos.length === 0) {
            setGenerationStage('failed');
            toast.error(
              mapVideoErrorToUserMessage('no videos', {
                t: translateError,
                locale,
              })
            );
            resetTaskState();
          } else {
            const mappedVideos = mapTaskVideos(task, extractedVideos);
            setGeneratedVideos(mappedVideos);
            reportWatermarkShown(task.id, mappedVideos);
            toast.success(t('status.success'));
            completeWithSuccess();
          }
          fetchUserCredits();
          return true;
        }

        if (currentStatus === AITaskStatus.FAILED) {
          const errorMessage =
            parsedResult?.errorMessage || 'Generate video failed';
          setGenerationStage('failed');
          toast.error(
            mapVideoErrorToUserMessage(errorMessage, {
              t: translateError,
              locale,
            })
          );
          resetTaskState();

          fetchUserCredits();

          return true;
        }

        setGenerationProgressStage('finalizing', PROGRESS_CAP_BEFORE_SUCCESS);
        return false;
      } catch (error: any) {
        console.error('Error polling video task:', error);
        if (!isAliveRef.current) {
          return true;
        }
        setGenerationStage('failed');
        toast.error(
          mapVideoErrorToUserMessage(error?.message, {
            t: translateError,
            locale,
          })
        );
        resetTaskState();

        fetchUserCredits();

        return true;
      }
    },
    [
      completeWithSuccess,
      fetchUserCredits,
      generationStartTime,
      locale,
      mapTaskVideos,
      reportWatermarkShown,
      resetTaskState,
      setGenerationProgressStage,
      t,
      translateError,
    ]
  );

  const scheduleNextPoll = useCallback(
    (id: string) => {
      if (!isAliveRef.current || !isGenerating) {
        return;
      }

      const elapsedMs = generationStartTime
        ? Date.now() - generationStartTime
        : 0;
      const delay =
        elapsedMs < FAST_POLL_PHASE_MS ? FAST_POLL_INTERVAL : SLOW_POLL_INTERVAL;

      clearPollingTimer();
      pollingTimerRef.current = setTimeout(async () => {
        if (!isAliveRef.current || !isGenerating) {
          return;
        }
        if (isPollingRef.current) {
          scheduleNextPoll(id);
          return;
        }

        isPollingRef.current = true;
        try {
          const completed = await pollTaskStatus(id);
          if (!completed) {
            scheduleNextPoll(id);
          }
        } finally {
          isPollingRef.current = false;
        }
      }, delay);
    },
    [clearPollingTimer, generationStartTime, isGenerating, pollTaskStatus]
  );

  useEffect(() => {
    if (!taskId || !isGenerating) {
      return;
    }

    const runInitialPoll = async () => {
      if (isPollingRef.current) {
        return;
      }

      isPollingRef.current = true;
      try {
        const completed = await pollTaskStatus(taskId);
        if (!completed) {
          scheduleNextPoll(taskId);
        }
      } finally {
        isPollingRef.current = false;
      }
    };

    void runInitialPoll();

    return () => {
      clearPollingTimer();
      isPollingRef.current = false;
    };
  }, [clearPollingTimer, isGenerating, pollTaskStatus, scheduleNextPoll, taskId]);

  const handleGenerate = async () => {
    if (!user) {
      setIsShowSignModal(true);
      return;
    }

    if (remainingCredits < currentCost) {
      toast.error(
        mapVideoErrorToUserMessage('insufficient credits', {
          t: translateError,
          locale,
        })
      );
      return;
    }

    if (!uploadedImage?.url) {
      toast.error(
        mapVideoErrorToUserMessage('input missing', {
          t: translateError,
          locale,
        })
      );
      return;
    }

    const finalPrompt =
      prompt.trim() || getDefaultDancePrompt(selectedTemplate);

    if (finalPrompt.length > MAX_PROMPT_LENGTH) {
      toast.error(t('form.prompt_too_long'));
      return;
    }

    if (
      orientation === 'image' &&
      selectedTemplateDurationSeconds > MAX_IMAGE_ORIENTATION_SECONDS
    ) {
      toast.error(t('form.orientation_image_max_10s'));
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setProgressTarget(12);
    setGenerationStage('submitting');
    setTaskStatus(AITaskStatus.PENDING);
    setGeneratedVideos([]);
    setGenerationStartTime(Date.now());
    setElapsedSeconds(0);
    clearSuccessHoldTimer();
    clearPollingTimer();
    isPollingRef.current = false;

    try {
      const resp = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mediaType: AIMediaType.VIDEO,
          scene: 'image-to-video',
          provider: VIDEO_PROVIDER,
          model: VIDEO_MODEL,
          prompt: finalPrompt,
          options: {
            image_input: [uploadedImage.url],
            video_input: [selectedTemplate.videoUrl],
            character_orientation: orientation,
            mode: resolution,
            resolution,
            negative_prompt: DEFAULT_NEGATIVE_PROMPT,
          },
        }),
      });

      if (!resp.ok) {
        throw new Error(`request failed with status: ${resp.status}`);
      }

      const { code, message, data } = await resp.json();
      if (code !== 0) {
        throw new Error(message || 'create video task failed');
      }
      if (!isAliveRef.current) {
        return;
      }

      const newTaskId = data?.id;
      if (!newTaskId) {
        throw new Error('Task id missing in response');
      }

      if (data.status === AITaskStatus.SUCCESS && data.taskInfo) {
        const parsedResult = parseTaskResult(data.taskInfo);
        const immediateTask = data as BackendTask;
        const extractedVideos = extractGeneratedVideos(parsedResult, immediateTask);

        if (extractedVideos.length > 0) {
          const mappedVideos = mapTaskVideos(
            {
              ...immediateTask,
              id: newTaskId,
              status: immediateTask.status || AITaskStatus.SUCCESS,
              mediaType: immediateTask.mediaType || AIMediaType.VIDEO,
              provider: immediateTask.provider || VIDEO_PROVIDER,
              model: immediateTask.model || VIDEO_MODEL,
              prompt: immediateTask.prompt ?? finalPrompt,
              taskInfo: immediateTask.taskInfo || null,
              taskResult: immediateTask.taskResult || null,
            },
            extractedVideos
          );
          setGeneratedVideos(mappedVideos);
          reportWatermarkShown(newTaskId, mappedVideos);
          toast.success(t('status.success'));
          await fetchUserCredits();
          completeWithSuccess();
          return;
        }
        toast.error(
          mapVideoErrorToUserMessage('no videos', {
            t: translateError,
            locale,
          })
        );
        setGenerationStage('failed');
        resetTaskState();
        return;
      }

      setTaskId(newTaskId);
      setGenerationProgressStage('queued', 25);

      await fetchUserCredits();
    } catch (error: any) {
      console.error('Failed to generate video:', error);
      setGenerationStage('failed');
      toast.error(
        mapVideoErrorToUserMessage(error?.message, {
          t: translateError,
          locale,
        })
      );
      resetTaskState();
    }
  };

  const handleDownloadVideo = async (video: GeneratedVideo) => {
    if (!video.url) {
      return;
    }

    try {
      setDownloadingVideoId(video.id);
      if (isDynamicWatermarkedVideo(video)) {
        const prepared =
          (await prepareWatermarkedPlayback(video, { forceRetry: true })) ||
          (() => {
            const existing = watermarkedPlaybackByVideoIdRef.current[video.id];
            if (!existing?.blobUrl) {
              return null;
            }
            return {
              blobUrl: existing.blobUrl,
              extension: existing.extension || 'mp4',
            };
          })();

        if (!prepared?.blobUrl) {
          throw new Error('Failed to prepare watermarked video');
        }

        const link = document.createElement('a');
        link.href = prepared.blobUrl;
        link.download = `${video.id}.${prepared.extension || 'mp4'}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Video downloaded');
        return;
      }

      const resp = await fetch(video.url);
      if (!resp.ok) {
        throw new Error('Failed to fetch video');
      }
      const blob = await resp.blob();
      const extension = inferExtensionFromMimeType(blob.type) || 'mp4';
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${video.id}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 200);
      toast.success('Video downloaded');
    } catch (error) {
      console.error('Failed to download video:', error);
      if (isDynamicWatermarkedVideo(video)) {
        toast.error(t('watermark.download_failed'));
      } else {
        toast.error('Failed to download video');
      }
    } finally {
      setDownloadingVideoId(null);
    }
  };

  return (
    <section className="container">
      {srOnlyTitle && <h2 className="sr-only">{srOnlyTitle}</h2>}
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h2 className="mb-4 text-3xl font-bold">{t('title')}</h2>
        <p className="text-muted-foreground text-lg">{t('description')}</p>
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Left Card - Create */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" aria-hidden="true" />
                {t('title')}
              </CardTitle>
              <CardDescription>{t('description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              {/* Step 1: Upload Photo */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">
                  {t('form.reference_image')}
                </Label>
                <div className="space-y-4">
                  <input
                    ref={inputRef}
                    accept="image/*"
                    className="hidden"
                    type="file"
                    onChange={handleInputChange}
                  />
                  <div className="flex flex-nowrap gap-4">
                    {uploadedImage ? (
                      <div className="group border-border bg-muted/50 hover:border-border hover:bg-muted relative overflow-hidden rounded-xl border p-1 shadow-sm transition">
                        <div className="relative overflow-hidden rounded-lg">
                          <img
                            alt="Reference"
                            className="h-32 w-32 rounded-lg object-cover"
                            src={uploadedImage.preview}
                          />
                          {uploadedImage.status === 'uploading' && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-xs font-medium text-white">
                              Uploading...
                            </div>
                          )}
                          {uploadedImage.status === 'error' && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-red-500/70 text-xs font-medium text-white">
                              Failed
                            </div>
                          )}
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute right-2 top-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={handleRemoveImage}
                          >
                            <IconX className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="border-border bg-muted/50 hover:border-border hover:bg-muted flex h-[136px] w-[136px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-1 shadow-sm transition"
                        onClick={() => inputRef.current?.click()}
                      >
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Upload</span>
                      </button>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t('form.reference_image_placeholder')}
                  </div>
                </div>

                {/* Example Images */}
                <div className="space-y-1.5">
                  <p className="text-muted-foreground text-xs">
                    {t('form.try_example_images')}
                  </p>
                  <div className="flex gap-2">
                    {EXAMPLE_IMAGES.map((url, index) => (
                      <button
                        key={url}
                        className="border-muted hover:border-primary relative h-12 w-12 overflow-hidden rounded-md border-2 transition-all hover:scale-105"
                        onClick={() => handleExampleClick(url)}
                      >
                        <img
                          src={url}
                          alt={t('form.example_image_alt', { index: index + 1 })}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Step 2: Select Dance Style */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    {t('form.dance_style')}
                  </Label>
                  <span className="text-muted-foreground text-xs">
                    {t('form.dance_templates_count', {
                      count: DANCE_TEMPLATES.length,
                    })}
                  </span>
                </div>
                <div className="relative -mx-2 px-2">
                  <div className="scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent flex gap-2 overflow-x-auto pb-2">
                    {DANCE_TEMPLATES.map((template) => {
                      const isLocked =
                        !!template.isPro && !canUseProTemplates;

                      return (
                        <button
                          key={template.id}
                          className={cn(
                            'group relative w-[120px] flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all hover:scale-[1.02]',
                            isLocked && 'opacity-70',
                            selectedTemplate.id === template.id
                              ? 'border-primary ring-primary/20 ring-2'
                              : 'border-muted hover:border-primary/50'
                          )}
                          onClick={() => handleTemplateSelect(template)}
                        >
                          <div className="from-muted to-muted/50 relative aspect-[3/4] overflow-hidden bg-gradient-to-br">
                            <video
                              src={template.videoUrl}
                              className="absolute inset-0 h-full w-full object-cover"
                              muted
                              loop
                              playsInline
                              autoPlay
                              preload="auto"
                            />
                            <div className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                              {template.duration}
                            </div>
                            {selectedTemplate.id === template.id && (
                              <div className="bg-primary absolute left-1 top-1 rounded-full p-0.5">
                                <Check className="text-primary-foreground h-2.5 w-2.5" />
                              </div>
                            )}
                            {template.isHot && (
                              <div className="absolute left-1 top-1 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                                ⭐
                              </div>
                            )}
                            {template.isPro && !template.isHot && (
                              <div className="absolute bottom-1 left-1 rounded bg-blue-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                                {isLocked ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Lock className="h-3 w-3" />
                                    Pro
                                  </span>
                                ) : (
                                  '💎 Pro'
                                )}
                              </div>
                            )}
                          </div>
                          <div className="bg-background p-1.5">
                            <p className="truncate text-xs font-medium">
                              {locale === 'zh'
                                ? template.nameZh
                                : template.name}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>


              {/* Options */}
              <div className="space-y-3 rounded-lg border p-3">
                {/* Resolution */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t('form.resolution')}
                  </Label>
                  <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger className="w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOLUTION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex w-full items-center justify-between gap-4">
                            <span>
                              {t(`form.resolution_${opt.value}` as any)}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {t('form.resolution_credits', {
                                credits: opt.credits,
                              })}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Estimated Cost */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {t('form.estimated_cost')}
                  </span>
                  <span className="font-medium text-destructive">
                    {currentCost} {t('form.resolution_credits', { credits: '' }).replace('{credits}', '').trim()}
                    <span className="text-muted-foreground ml-1 font-normal">
                      ({t('form.available_credits')}: {remainingCredits})
                    </span>
                  </span>
                </div>

                {/* Orientation */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t('form.orientation')}
                  </Label>
                  <RadioGroup
                    value={orientation}
                    onValueChange={setOrientation}
                    className="grid gap-3"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="image" id="orient-image" />
                      <Label
                        htmlFor="orient-image"
                        className="cursor-pointer text-xs font-normal"
                      >
                        {t('form.orientation_image')}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="video" id="orient-video" />
                      <Label
                        htmlFor="orient-video"
                        className="cursor-pointer text-xs font-normal"
                      >
                        {t('form.orientation_video')}
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              {/* Public Toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0">
                  <Label
                    htmlFor="public-toggle"
                    className="cursor-pointer text-sm font-medium"
                  >
                    {t('form.public_toggle')}
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    {t('form.public_toggle_desc')}
                  </p>
                </div>
                <Switch
                  id="public-toggle"
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                />
              </div>

              {/* Generate Button */}
              {!isMounted ? (
                <Button className="w-full" disabled>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('loading')}
                </Button>
              ) : isCheckSign ? (
                <Button className="w-full" disabled>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('checking_account')}
                </Button>
              ) : user ? (
                <Button
                  className="w-full"
                  onClick={handleGenerate}
                  disabled={
                    isGenerating ||
                    uploadedImage?.status === 'uploading' ||
                    uploadedImage?.status === 'error' ||
                    !uploadedImage?.url
                  }
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('generating')}
                    </>
                  ) : (
                    t('generate')
                  )}
                </Button>
              ) : (
                <Button className="w-full" onClick={() => setIsShowSignModal(true)}>
                  <User className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t('sign_in_to_generate')}
                </Button>
              )}

              {/* Credits Info */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-primary">
                    {t('credits_cost', { credits: currentCost })}
                  </span>
                  <span>{t('credits_remaining', { credits: remainingCredits })}</span>
                </div>
                <Link href="/pricing">
                  <Button variant="outline" size="sm" className="w-full gap-1.5">
                    <CreditCard className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                    {t('buy_credits')}
                  </Button>
                </Link>
              </div>

              {/* Progress */}
              {isGenerating && (
                <div
                  className="space-y-2 rounded-lg border p-4"
                  data-task-status={taskStatus ?? ''}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span>{t('progress')}</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                  {stageLabel && (
                    <p className="text-muted-foreground text-center text-xs">
                      {stageLabel}
                    </p>
                  )}
                  <div className="text-muted-foreground flex items-center justify-between text-xs">
                    <span>{t('status.elapsed_seconds', { seconds: elapsedSeconds })}</span>
                    <span>{etaRangeLabel}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Card - Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" aria-hidden="true" />
                {generatedVideos.length > 0
                  ? t('generated_videos')
                  : t('preview_title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-8">
              {generatedVideos.length > 0 ? (
                <div className="space-y-4">
                  {generatedVideos.map((video) => {
                    const isWatermarked = isDynamicWatermarkedVideo(video);
                    const playbackState = watermarkedPlaybackByVideoId[video.id];
                    const playbackUrl = isWatermarked
                      ? playbackState?.blobUrl || ''
                      : video.url;
                    const canRenderVideo = Boolean(playbackUrl);

                    return (
                      <div key={video.id} className="space-y-3">
                        <div className="bg-muted relative flex max-h-[600px] items-center justify-center overflow-hidden rounded-lg border">
                          {canRenderVideo ? (
                            <video
                              src={playbackUrl}
                              controls
                              controlsList={
                                isWatermarked ? 'nodownload noremoteplayback' : undefined
                              }
                              disablePictureInPicture={isWatermarked}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="h-auto max-h-[600px] w-full object-contain"
                              preload="auto"
                              onContextMenu={
                                isWatermarked
                                  ? (event) => event.preventDefault()
                                  : undefined
                              }
                            />
                          ) : (
                            <div className="text-muted-foreground flex items-center gap-2 text-sm">
                              {playbackState?.status === 'error' ? (
                                <span>{t('watermark.preview_failed')}</span>
                              ) : (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span>{t('watermark.preparing_preview')}</span>
                                </>
                              )}
                            </div>
                          )}
                          {isWatermarked && canRenderVideo && (
                            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                              <div
                                className="rounded bg-black/20 px-2 py-1 text-[11px] font-semibold tracking-wide text-white/90 backdrop-blur-sm"
                                style={{
                                  position: 'absolute',
                                  left: '5%',
                                  top: '10%',
                                  opacity: video.watermarkOpacity ?? 0.28,
                                  animation: `bb-watermark-drift ${
                                    Math.max(
                                      5,
                                      (video.watermarkIntervalSeconds ?? 3) * 4
                                    )
                                  }s linear infinite`,
                                }}
                              >
                                {video.watermarkText || 'BabyBoogey'}
                              </div>
                              <div
                                className="rounded bg-black/20 px-2 py-1 text-[11px] font-semibold tracking-wide text-white/90 backdrop-blur-sm"
                                style={{
                                  position: 'absolute',
                                  right: '6%',
                                  bottom: '10%',
                                  opacity: video.watermarkOpacity ?? 0.28,
                                  animation: `bb-watermark-drift-reverse ${
                                    Math.max(
                                      6,
                                      (video.watermarkIntervalSeconds ?? 3) * 5
                                    )
                                  }s linear infinite`,
                                }}
                              >
                                {video.watermarkText || 'BabyBoogey'}
                              </div>
                            </div>
                          )}
                        </div>
                        {isWatermarked && (
                          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            <span>{t('watermark.free_notice')}</span>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto px-0 text-xs font-semibold text-amber-900"
                              onClick={() => handleRemoveWatermarkClick(video)}
                            >
                              {t('watermark.remove_cta')}
                            </Button>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleDownloadVideo(video)}
                          disabled={downloadingVideoId === video.id}
                        >
                          {downloadingVideoId === video.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          Download
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-muted relative flex max-h-[600px] items-center justify-center overflow-hidden rounded-lg border">
                    <video
                      src={selectedTemplate.videoUrl}
                      controls
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="h-auto max-h-[600px] w-full object-contain"
                      preload="auto"
                    />
                  </div>
                  <div className="bg-muted/50 space-y-2 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">
                        {locale === 'zh' ? selectedTemplate.nameZh : selectedTemplate.name}
                      </h3>
                      <span className="bg-primary/10 text-primary rounded-md px-2 py-1 text-xs font-medium">
                        {selectedTemplate.duration}
                      </span>
                    </div>
                  </div>
                  <div className="bg-muted/50 border-primary/20 rounded-lg border p-3">
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {t('privacy_notice')}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
