'use client';

import {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Check,
  ChevronDown,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  Paperclip,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Link, useRouter } from '@/core/i18n/navigation';
import { AIMediaType, AITaskStatus } from '@/extensions/ai/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { useAppContext } from '@/shared/contexts/app';
import {
  consumeAITaskReuseHandoff,
  normalizeRestoredMediaReference,
  readFirstStringFromOptionArray,
  readStringOption,
} from '@/shared/lib/ai-task-reuse-handoff';
import {
  extractAssetIdFromMediaUrl,
  resolveMediaValueToApiPath,
  toAssetRef,
} from '@/shared/lib/asset-ref';
import { cn } from '@/shared/lib/utils';
import {
  BABY_IMAGE_COST_CREDITS,
  BABY_IMAGE_DEFAULT_MODEL,
  BABY_IMAGE_DEFAULT_RESOLUTION,
  BABY_IMAGE_PROVIDER,
  BABY_IMAGE_RESOLUTIONS,
  BABY_IMAGE_SCENE_IMAGE,
  BABY_IMAGE_SCENE_TEXT,
  BabyImageResolution,
  isBabyImageResolution,
} from '@/shared/services/baby-image/config';
import {
  BABY_STYLE_IDS,
  BabyStyleId,
  isBabyStyleId,
} from '@/shared/services/baby-image/styles';
import {
  BABY_SAFETY_CONFIRMATION_OPTION,
  isBabySafetyConfirmationRequiredMessage,
  isBabySafetyContentPolicyMessage,
} from '@/shared/services/content-safety';

import './baby-image.css';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const POLL_INTERVAL = 5000;
const GENERATION_TIMEOUT = 180000;
const MAX_PROMPT_LENGTH = 500;
const DEFAULT_STYLE: BabyStyleId = 'pixar-3d';
const ASPECT_RATIO_OPTIONS = ['1:1', '3:4', '4:3', '9:16', '16:9'] as const;
const HANDOFF_STORAGE_KEY = 'babyboogey:baby-image-handoff';
const HANDOFF_TTL_MS = 30 * 60 * 1000;
const MAX_UPLOAD_MB = 10;
const SAFETY_CONFIRMED_KEY = 'babyboogey:safety-confirmed';

const STYLE_THUMB_FILES: Record<BabyStyleId, string> = {
  'pixar-3d': 'ai-baby-photo-pixar-3d-animation-style.webp',
  ghibli: 'ai-baby-photo-hand-drawn-fantasy-style.webp',
  anime: 'ai-baby-photo-classic-anime-style.webp',
  claymation: 'ai-baby-photo-claymation-sculpt-style.webp',
  chibi: 'ai-baby-photo-chibi-kawaii-style.webp',
  watercolor: 'ai-baby-photo-watercolor-storybook-style.webp',
  plush: 'ai-baby-photo-plush-doll-style.webp',
  'pixel-art': 'ai-baby-photo-pixel-art-retro-style.webp',
};

const STYLE_THUMB_URL = (id: BabyStyleId) =>
  `https://r2.babyboogey.com/assets/imgs/showcases/ai-baby-image-generator/${STYLE_THUMB_FILES[id]}`;

function isBabyImageAspectRatio(
  value: unknown
): value is (typeof ASPECT_RATIO_OPTIONS)[number] {
  return (
    typeof value === 'string' &&
    (ASPECT_RATIO_OPTIONS as readonly string[]).includes(value)
  );
}

// Emoji + AI prompt are locale-independent; label/subtitle are read from i18n
// (ai.baby-image.generator.suggestions[i]) and kept in sync by index.
const SUGGESTION_META: { emoji: string; prompt: string }[] = [
  {
    emoji: '🎂',
    prompt:
      'A joyful baby at their first birthday party in a sunlit garden full of balloons and flowers.',
  },
  {
    emoji: '🧙',
    prompt:
      'A tiny baby wizard wearing a pointed hat, sitting on a mossy log in an enchanted forest at sunrise.',
  },
  {
    emoji: '🏖',
    prompt:
      'A curious baby on a sunny beach, holding a seashell, waves in the background, golden hour light.',
  },
  {
    emoji: '🚀',
    prompt:
      'An adorable baby astronaut floating among stars and planets, dreamy cosmic backdrop.',
  },
];

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface BabyImageGeneratorProps {
  maxSizeMB?: number;
  srOnlyTitle?: string;
  className?: string;
}

interface GeneratedImage {
  id: string;
  url: string;
  prompt?: string;
  styleId?: BabyStyleId;
}

interface AttachedImage {
  assetId: string;
  assetRef: string;
  previewUrl: string;
  fileName: string;
  uploading: boolean;
  error?: string;
}

interface UserChatMessage {
  id: string;
  type: 'user';
  prompt: string;
  styleId: BabyStyleId;
  aspectRatio: string;
  referenceImageUrl?: string;
  timestamp: number;
}

interface AssistantChatMessage {
  id: string;
  type: 'assistant';
  userMessageId: string;
  status: AITaskStatus;
  images: GeneratedImage[];
  taskId?: string;
  startTime: number;
  endTime?: number;
  errorMessage?: string;
}

type ChatMessage = UserChatMessage | AssistantChatMessage;

interface BackendTask {
  id: string;
  status: string;
  provider: string;
  model: string;
  prompt: string | null;
  taskInfo: string | null;
  taskResult: string | null;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function parseTaskResult(taskResult: string | null): UnsafeAny {
  if (!taskResult) return null;
  try {
    return JSON.parse(taskResult);
  } catch (error) {
    console.warn('Failed to parse taskResult:', error);
    return null;
  }
}

function extractImageUrls(result: UnsafeAny): string[] {
  if (!result) return [];
  const images = result.images;
  if (!Array.isArray(images)) return [];
  return images
    .map((entry: UnsafeAny) => {
      if (!entry) return '';
      if (typeof entry === 'string') return entry;
      return entry.imageUrl || entry.url || '';
    })
    .filter((url: string): url is string => Boolean(url));
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function aspectRatioIconClass(ratio: string): string {
  return `bb-ar-${ratio.replace(':', '')}`;
}

const ROMAN_LOWER = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];
function toRomanLower(n: number): string {
  return ROMAN_LOWER[n - 1] ?? String(n);
}

function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 60) return 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d`;
}

function mapBabyImageErrorToUserMessage(
  rawMessage: string | undefined,
  t: (key: string) => string
): string {
  if (isBabySafetyConfirmationRequiredMessage(rawMessage)) {
    return t('safety.required');
  }

  if (isBabySafetyContentPolicyMessage(rawMessage)) {
    return t('safety.blocked');
  }

  const message = (rawMessage || '').toLowerCase();
  if (
    message.includes('insufficient credits') ||
    message.includes('not enough credits')
  ) {
    return t('errors.insufficient_credits');
  }

  return rawMessage || t('errors.generate_failed');
}

async function uploadReferenceImage(file: File): Promise<{
  assetId: string;
  assetRef: string;
  previewUrl: string;
}> {
  const formData = new FormData();
  formData.append('files', file);
  formData.append('purpose', 'reference_image');
  formData.append('source', 'upload');

  const resp = await fetch('/api/storage/upload-media', {
    method: 'POST',
    body: formData,
  });

  if (!resp.ok) {
    throw new Error(`Upload failed with status ${resp.status}`);
  }

  const json = await resp.json();
  if (json.code !== 0 || !json.data?.assetId || !json.data?.assetRef) {
    throw new Error(json.message || 'Upload failed');
  }

  const assetId = json.data.assetId as string;
  return {
    assetId,
    assetRef: json.data.assetRef as string,
    previewUrl: `/api/storage/assets/${encodeURIComponent(assetId)}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function BabyImageGenerator({
  maxSizeMB = MAX_UPLOAD_MB,
  srOnlyTitle,
  className,
}: BabyImageGeneratorProps) {
  const t = useTranslations('ai.baby-image.generator');
  const router = useRouter();
  const { user, isCheckSign, setIsShowSignModal, fetchUserCredits } =
    useAppContext();

  /* -------- state -------- */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] =
    useState<BabyStyleId>(DEFAULT_STYLE);
  const [aspectRatio, setAspectRatio] =
    useState<(typeof ASPECT_RATIO_OPTIONS)[number]>('1:1');
  const [resolution, setResolution] = useState<BabyImageResolution>(
    BABY_IMAGE_DEFAULT_RESOLUTION
  );
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(
    null
  );
  const [stylePopoverOpen, setStylePopoverOpen] = useState(false);
  const [aspectPopoverOpen, setAspectPopoverOpen] = useState(false);
  const [resolutionPopoverOpen, setResolutionPopoverOpen] = useState(false);
  const [downloadingImageId, setDownloadingImageId] = useState<string | null>(
    null
  );
  const [handoffImageId, setHandoffImageId] = useState<string | null>(null);
  const [isCardFullscreen, setIsCardFullscreen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [attemptedWithoutSafety, setAttemptedWithoutSafety] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
    setSafetyConfirmed(localStorage.getItem(SAFETY_CONFIRMED_KEY) === '1');
  }, []);

  useEffect(() => {
    const handoff = consumeAITaskReuseHandoff();
    if (!handoff || handoff.mediaType !== AIMediaType.IMAGE) {
      return;
    }

    const options = handoff.options;
    const styleId = readStringOption(options, ['styleId', 'style_id']);
    const nextAspectRatio = readStringOption(options, [
      'aspect_ratio',
      'aspectRatio',
    ]);
    const nextResolution = readStringOption(options, ['resolution']);
    const referenceImageInput = readFirstStringFromOptionArray(options, [
      'image_input',
      'input_images',
      'referenceImageUrl',
      'reference_image',
    ]);
    const referenceImage = normalizeRestoredMediaReference(referenceImageInput);

    if (handoff.prompt) {
      setPrompt(handoff.prompt);
    }
    if (isBabyStyleId(styleId)) {
      setSelectedStyle(styleId);
    }
    if (isBabyImageAspectRatio(nextAspectRatio)) {
      setAspectRatio(nextAspectRatio);
    }
    if (isBabyImageResolution(nextResolution)) {
      setResolution(nextResolution);
    }
    if (referenceImage) {
      setAttachedImage({
        assetId: '',
        assetRef: referenceImage.assetRef,
        previewUrl: referenceImage.previewUrl,
        fileName: t('restore.reference_filename'),
        uploading: false,
      });
    }

    toast.success(t('restore.ready'));
    const expectsReferenceImage =
      handoff.scene === BABY_IMAGE_SCENE_IMAGE || Boolean(referenceImageInput);
    if (
      expectsReferenceImage &&
      (!referenceImage || !referenceImage.recoveredAssetRef)
    ) {
      toast(t('restore.media_unavailable'));
    }
  }, [t]);

  useEffect(() => {
    if (!isCardFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setIsCardFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isCardFullscreen]);

  /* -------- derived -------- */
  const promptLength = prompt.trim().length;
  const isPromptTooLong = promptLength > MAX_PROMPT_LENGTH;
  const remainingCredits = user?.credits?.remainingCredits ?? 0;
  const currentCostCredits = BABY_IMAGE_COST_CREDITS[resolution];

  const activeAssistant = useMemo(
    () =>
      messages.find(
        (m) =>
          m.type === 'assistant' &&
          (m.status === AITaskStatus.PENDING ||
            m.status === AITaskStatus.PROCESSING)
      ) as AssistantChatMessage | undefined,
    [messages]
  );

  const isGenerating = Boolean(activeAssistant);
  const activeTaskId = activeAssistant?.taskId ?? null;

  const canSend =
    !isGenerating &&
    !isPromptTooLong &&
    !attachedImage?.uploading &&
    !attachedImage?.error &&
    (prompt.trim().length > 0 || Boolean(attachedImage));

  /* -------- message updaters -------- */
  const updateAssistant = useCallback(
    (id: string, update: Partial<AssistantChatMessage>) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.type === 'assistant' && m.id === id ? { ...m, ...update } : m
        )
      );
    },
    []
  );

  useEffect(() => {
    if (!isGenerating) {
      setElapsedSeconds(0);
      return;
    }
    setElapsedSeconds(0);
    const id = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [isGenerating]);

  useEffect(() => {
    if (!lightboxImage) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxImage]);

  /* -------- scroll on new messages -------- */
  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    // small delay to let layout settle
    const timer = window.setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [messages.length, activeAssistant?.images.length]);

  /* -------- polling -------- */
  const pollTaskStatus = useCallback(
    async (taskId: string, assistantId: string, startTime: number) => {
      try {
        if (Date.now() - startTime > GENERATION_TIMEOUT) {
          updateAssistant(assistantId, {
            status: AITaskStatus.FAILED,
            errorMessage: t('errors.timeout'),
            endTime: Date.now(),
          });
          toast.error(t('errors.timeout'));
          return true;
        }

        const resp = await fetch('/api/ai/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId }),
        });

        if (!resp.ok) {
          throw new Error(`request failed with status: ${resp.status}`);
        }

        const { code, message, data } = await resp.json();
        if (code !== 0) {
          throw new Error(message || 'Query task failed');
        }

        const task = data as BackendTask;
        const currentStatus = task.status as AITaskStatus;
        const parsedResult = parseTaskResult(task.taskInfo);
        const imageUrls = extractImageUrls(parsedResult);
        const images: GeneratedImage[] = imageUrls.map((url, index) => ({
          id: `${task.id}-${index}`,
          url: resolveMediaValueToApiPath(url),
          prompt: task.prompt ?? undefined,
          styleId: selectedStyle,
        }));

        if (currentStatus === AITaskStatus.SUCCESS) {
          if (imageUrls.length === 0) {
            updateAssistant(assistantId, {
              status: AITaskStatus.FAILED,
              errorMessage: t('errors.empty_result'),
              endTime: Date.now(),
            });
            toast.error(t('errors.empty_result'));
          } else {
            updateAssistant(assistantId, {
              status: AITaskStatus.SUCCESS,
              images,
              endTime: Date.now(),
            });
            toast.success(t('toasts.success'));
          }
          return true;
        }

        if (currentStatus === AITaskStatus.FAILED) {
          const errorMessage = mapBabyImageErrorToUserMessage(
            parsedResult?.errorMessage,
            (key) => t(key as UnsafeAny)
          );
          updateAssistant(assistantId, {
            status: AITaskStatus.FAILED,
            errorMessage,
            endTime: Date.now(),
          });
          toast.error(errorMessage);
          fetchUserCredits();
          return true;
        }

        // PROCESSING: surface partial images if present
        if (currentStatus === AITaskStatus.PROCESSING && images.length > 0) {
          updateAssistant(assistantId, {
            status: AITaskStatus.PROCESSING,
            images,
          });
        } else {
          updateAssistant(assistantId, { status: currentStatus });
        }

        return false;
      } catch (error: UnsafeAny) {
        console.error('Error polling baby image task:', error);
        const mapped = mapBabyImageErrorToUserMessage(error?.message, (key) =>
          t(key as UnsafeAny)
        );
        const friendly =
          mapped === error?.message ? t('errors.query_failed') : mapped;
        toast.error(friendly);
        updateAssistant(assistantId, {
          status: AITaskStatus.FAILED,
          errorMessage: friendly,
          endTime: Date.now(),
        });
        fetchUserCredits();
        return true;
      }
    },
    [selectedStyle, updateAssistant, fetchUserCredits, t]
  );

  useEffect(() => {
    if (!activeTaskId || !activeAssistant) return;
    const assistantId = activeAssistant.id;
    const startTime = activeAssistant.startTime;
    let cancelled = false;

    const tick = async () => {
      const done = await pollTaskStatus(activeTaskId, assistantId, startTime);
      if (done) cancelled = true;
    };

    tick();

    const interval = setInterval(async () => {
      if (cancelled) {
        clearInterval(interval);
        return;
      }
      const done = await pollTaskStatus(activeTaskId, assistantId, startTime);
      if (done) clearInterval(interval);
    }, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // activeTaskId + assistant.startTime uniquely identify a polling session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId]);

  /* -------- attach / detach reference image -------- */
  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow re-selecting the same file later
      if (!file) return;

      if (file.size > maxSizeMB * 1024 * 1024) {
        toast.error(`Max ${maxSizeMB}MB`);
        return;
      }

      const localPreview = URL.createObjectURL(file);
      setAttachedImage({
        assetId: '',
        assetRef: '',
        previewUrl: localPreview,
        fileName: file.name,
        uploading: true,
      });

      try {
        const uploaded = await uploadReferenceImage(file);
        URL.revokeObjectURL(localPreview);
        setAttachedImage({
          ...uploaded,
          fileName: file.name,
          uploading: false,
        });
      } catch (error: UnsafeAny) {
        console.error('Upload failed:', error);
        URL.revokeObjectURL(localPreview);
        setAttachedImage({
          assetId: '',
          assetRef: '',
          previewUrl: '',
          fileName: file.name,
          uploading: false,
          error: error.message || 'Upload failed',
        });
        toast.error(t('form.some_images_failed_to_upload'));
      }
    },
    [maxSizeMB, t]
  );

  const handleRemoveAttachment = useCallback(() => {
    setAttachedImage(null);
  }, []);

  /* -------- send generation -------- */
  const handleSend = useCallback(
    async (overrides?: {
      prompt?: string;
      styleId?: BabyStyleId;
      aspectRatio?: string;
      referenceImageUrl?: string;
    }) => {
      if (!user) {
        setIsShowSignModal(true);
        return;
      }

      if (isGenerating) return;

      if (!safetyConfirmed) {
        toast.error(t('safety.required'));
        setAttemptedWithoutSafety(true);
        window.setTimeout(() => setAttemptedWithoutSafety(false), 650);
        return;
      }

      if (remainingCredits < currentCostCredits) {
        toast.error(t('errors.insufficient_credits'));
        return;
      }

      const sendPrompt = (overrides?.prompt ?? prompt).trim();
      const sendStyle = overrides?.styleId ?? selectedStyle;
      const sendAspect = overrides?.aspectRatio ?? aspectRatio;
      const sendRefUrl =
        overrides?.referenceImageUrl ??
        (attachedImage && !attachedImage.uploading && !attachedImage.error
          ? attachedImage.assetRef
          : undefined);

      if (!sendPrompt && !sendRefUrl) {
        toast.error(t('errors.need_prompt_or_photo'));
        return;
      }

      const userMsg: UserChatMessage = {
        id: makeId('u'),
        type: 'user',
        prompt: sendPrompt,
        styleId: sendStyle,
        aspectRatio: sendAspect,
        referenceImageUrl: sendRefUrl,
        timestamp: Date.now(),
      };

      const assistantMsg: AssistantChatMessage = {
        id: makeId('a'),
        type: 'assistant',
        userMessageId: userMsg.id,
        status: AITaskStatus.PENDING,
        images: [],
        startTime: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      // clear composer prompt after send (keep style / aspect / attachment for follow-ups)
      if (!overrides) setPrompt('');

      try {
        const options: UnsafeAny = {
          styleId: sendStyle,
          aspect_ratio: sendAspect,
          resolution,
          [BABY_SAFETY_CONFIRMATION_OPTION]: true,
        };
        if (sendRefUrl) {
          options.image_input = [sendRefUrl];
        }

        const resp = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaType: AIMediaType.IMAGE,
            scene: sendRefUrl ? BABY_IMAGE_SCENE_IMAGE : BABY_IMAGE_SCENE_TEXT,
            provider: BABY_IMAGE_PROVIDER,
            model: BABY_IMAGE_DEFAULT_MODEL,
            prompt: sendPrompt,
            options,
          }),
        });

        if (!resp.ok) {
          throw new Error(`request failed with status: ${resp.status}`);
        }

        const { code, message, data } = await resp.json();
        if (code !== 0) {
          throw new Error(message || t('errors.create_task_failed'));
        }

        const newTaskId = data?.id;
        if (!newTaskId) {
          throw new Error(t('errors.task_id_missing'));
        }

        // Early-success path (rare): backend already returned the images
        if (data.status === AITaskStatus.SUCCESS && data.taskInfo) {
          const parsedResult = parseTaskResult(data.taskInfo);
          const imageUrls = extractImageUrls(parsedResult);
          if (imageUrls.length > 0) {
            updateAssistant(assistantMsg.id, {
              status: AITaskStatus.SUCCESS,
              images: imageUrls.map((url, index) => ({
                id: `${newTaskId}-${index}`,
                url: resolveMediaValueToApiPath(url),
                prompt: sendPrompt,
                styleId: sendStyle,
              })),
              endTime: Date.now(),
            });
            toast.success(t('toasts.success'));
            await fetchUserCredits();
            return;
          }
        }

        // Otherwise fall through to polling
        updateAssistant(assistantMsg.id, {
          taskId: newTaskId,
          status: AITaskStatus.PENDING,
        });
        await fetchUserCredits();
      } catch (error: UnsafeAny) {
        console.error('Failed to generate baby image:', error);
        const mapped = mapBabyImageErrorToUserMessage(error?.message, (key) =>
          t(key as UnsafeAny)
        );
        const friendly =
          mapped === error?.message ? t('errors.generate_failed') : mapped;
        toast.error(friendly);
        updateAssistant(assistantMsg.id, {
          status: AITaskStatus.FAILED,
          errorMessage: friendly,
          endTime: Date.now(),
        });
      }
    },
    [
      user,
      isGenerating,
      remainingCredits,
      currentCostCredits,
      prompt,
      selectedStyle,
      aspectRatio,
      resolution,
      attachedImage,
      safetyConfirmed,
      setIsShowSignModal,
      t,
      updateAssistant,
      fetchUserCredits,
    ]
  );

  /* -------- composer keypress -------- */
  const handleTextareaKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        if (canSend) handleSend();
      }
    },
    [canSend, handleSend]
  );

  /* -------- download -------- */
  const handleDownloadImage = useCallback(
    async (image: GeneratedImage) => {
      if (!image.url) return;
      try {
        setDownloadingImageId(image.id);
        const resp = await fetch(image.url);
        if (!resp.ok) throw new Error('Failed to fetch image');
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${image.id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 200);
        toast.success(t('toasts.downloaded'));
      } catch (error) {
        console.error('Failed to download image:', error);
        toast.error(t('errors.download_failed'));
      } finally {
        setDownloadingImageId(null);
      }
    },
    [t]
  );

  /* -------- make them dance handoff -------- */
  const handleMakeThemDance = useCallback(
    (image: GeneratedImage) => {
      const assetId = extractAssetIdFromMediaUrl(image.url);
      if (!assetId) {
        toast.error(t('errors.handoff_failed'));
        return;
      }
      try {
        setHandoffImageId(image.id);
        window.localStorage.setItem(
          HANDOFF_STORAGE_KEY,
          JSON.stringify({
            assetRef: toAssetRef(assetId),
            previewUrl: image.url,
            styleId: image.styleId,
            expiresAt: Date.now() + HANDOFF_TTL_MS,
          })
        );
      } catch (error) {
        console.warn('Failed to persist handoff payload:', error);
      }
      router.push('/ai-video-generator');
    },
    [router, t]
  );

  /* -------- follow-up handlers -------- */
  const handleRegenerate = useCallback(
    (userMsg: UserChatMessage) => {
      handleSend({
        prompt: userMsg.prompt,
        styleId: userMsg.styleId,
        aspectRatio: userMsg.aspectRatio,
        referenceImageUrl: userMsg.referenceImageUrl,
      });
    },
    [handleSend]
  );

  const handleChangeAspectFollowup = useCallback(
    (nextAspect: string, userMsg: UserChatMessage) => {
      setAspectRatio(nextAspect as (typeof ASPECT_RATIO_OPTIONS)[number]);
      handleSend({
        prompt: userMsg.prompt,
        styleId: userMsg.styleId,
        aspectRatio: nextAspect,
        referenceImageUrl: userMsg.referenceImageUrl,
      });
    },
    [handleSend]
  );

  const handleSuggestion = useCallback((suggestion: string) => {
    setPrompt(suggestion);
    textareaRef.current?.focus();
  }, []);

  /* -------- render helpers -------- */
  const hasMessages = messages.length > 0;

  return (
    <section
      className={cn(
        'bb-studio py-10 md:py-14',
        isCardFullscreen && 'bb-studio-fullscreen',
        className
      )}
    >
      {srOnlyTitle && <h2 className="sr-only">{srOnlyTitle}</h2>}
      <div
        className={cn(
          'container max-w-3xl',
          isCardFullscreen && 'bb-container-fullscreen'
        )}
      >
        <div
          className={cn('bb-chat-card', isCardFullscreen && 'is-fullscreen')}
        >
          {/* ============== Head ============== */}
          <div className="bb-chat-head">
            <span className="bb-brand-dot" aria-hidden="true">
              👶
            </span>
            <div>
              <div className="bb-chat-head-title">{t('title')}</div>
              <div className="bb-chat-head-sub">
                <span className="bb-model-pill">Nano Banana Pro</span>
                <span>
                  {hasMessages
                    ? t('session_count', { count: messages.length })
                    : t('session_ready')}
                </span>
              </div>
            </div>
            <div className="bb-head-right">
              {isMounted && user ? (
                <span className="bb-credits-pill">
                  <span className="bb-credits-pill-star" aria-hidden="true" />
                  <span>{remainingCredits}</span>
                  <span className="bb-credits-pill-unit">
                    {t('credits_unit')}
                  </span>
                </span>
              ) : (
                <span className="bb-credits-pill">
                  <span className="bb-credits-pill-star" aria-hidden="true" />
                  <span>—</span>
                </span>
              )}
              <button
                type="button"
                className="bb-head-icon-btn"
                aria-label={
                  isCardFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
                }
                title={
                  isCardFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
                }
                onClick={() => setIsCardFullscreen((v) => !v)}
              >
                {isCardFullscreen ? (
                  <Minimize2 className="h-4 w-4" strokeWidth={2} />
                ) : (
                  <Maximize2 className="h-4 w-4" strokeWidth={2} />
                )}
              </button>
            </div>
          </div>

          {/* ============== Stream ============== */}
          <div ref={streamRef} className="bb-chat-stream">
            {!hasMessages ? (
              <EmptyState onSuggestion={handleSuggestion} />
            ) : (
              <div className="flex flex-col gap-7">
                {messages.map((msg, idx) => {
                  if (msg.type === 'user') {
                    return <UserBubble key={msg.id} msg={msg} />;
                  }
                  const userMsg = messages.find(
                    (m) => m.type === 'user' && m.id === msg.userMessageId
                  ) as UserChatMessage | undefined;
                  return (
                    <AssistantCard
                      key={msg.id}
                      msg={msg}
                      userMsg={userMsg}
                      isLast={idx === messages.length - 1}
                      downloadingImageId={downloadingImageId}
                      handoffImageId={handoffImageId}
                      elapsedSeconds={elapsedSeconds}
                      onDownload={handleDownloadImage}
                      onDance={handleMakeThemDance}
                      onOpenLightbox={setLightboxImage}
                      onRegenerate={handleRegenerate}
                      onAspectChange={handleChangeAspectFollowup}
                      onTryStyle={() => {
                        setStylePopoverOpen(true);
                        textareaRef.current?.focus();
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* ============== Composer ============== */}
          <div className="bb-composer-wrap">
            {attachedImage && (
              <div className="bb-attach-preview">
                {attachedImage.uploading ? (
                  <div className="bg-muted flex h-[26px] w-[26px] items-center justify-center rounded-full">
                    <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
                  </div>
                ) : (
                  <div
                    className="bb-attach-preview-thumb"
                    style={{
                      backgroundImage: `url(${attachedImage.previewUrl})`,
                    }}
                  />
                )}
                <span className="bb-attach-preview-name">
                  {attachedImage.error
                    ? t('form.some_images_failed_to_upload')
                    : attachedImage.fileName}
                </span>
                <button
                  type="button"
                  className="bb-attach-preview-x"
                  aria-label="Remove attachment"
                  onClick={handleRemoveAttachment}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <div className="bb-composer">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={t('form.prompt_placeholder')}
                maxLength={MAX_PROMPT_LENGTH + 200}
              />
              <div className="bb-composer-bar">
                <div className="bb-bar-left">
                  {/* attach */}
                  <button
                    type="button"
                    className="bb-rail-chip"
                    onClick={handleAttachClick}
                    aria-label={t('form.reference_image')}
                    title={t('form.reference_image')}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    <span className="bb-chip-label">{t('form.reference_image')}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />

                  {/* style dropdown */}
                  <DropdownMenu
                    open={stylePopoverOpen}
                    onOpenChange={setStylePopoverOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="bb-rail-chip">
                        <span
                          className="bb-rail-chip-thumb"
                          style={{
                            backgroundImage: `url(${STYLE_THUMB_URL(selectedStyle)})`,
                          }}
                        />
                        <span className="bb-chip-label">{t(`styles.${selectedStyle}.label`)}</span>
                        <ChevronDown className="bb-rail-chip-caret h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="top"
                      align="start"
                      className="w-80 p-1.5"
                    >
                      <div className="text-muted-foreground px-2 pt-1 pb-2 text-[0.7rem] font-bold tracking-wider uppercase">
                        {t('form.style_label')}
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {BABY_STYLE_IDS.map((id) => (
                          <DropdownMenuItem
                            key={id}
                            className={cn(
                              'bb-popover-item focus:bg-transparent',
                              id === selectedStyle && 'bb-active'
                            )}
                            onSelect={() => {
                              setSelectedStyle(id);
                              setStylePopoverOpen(false);
                            }}
                          >
                            <span
                              className="bb-popover-item-thumb"
                              style={{
                                backgroundImage: `url(${STYLE_THUMB_URL(id)})`,
                              }}
                            />
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="bb-popover-item-name">
                                {t(`styles.${id}.label`)}
                              </span>
                              <span className="bb-popover-item-desc truncate">
                                {t(`styles.${id}.description`)}
                              </span>
                            </span>
                            {id === selectedStyle && (
                              <Check className="text-primary h-4 w-4" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* aspect dropdown */}
                  <DropdownMenu
                    open={aspectPopoverOpen}
                    onOpenChange={setAspectPopoverOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="bb-rail-chip">
                        <span
                          className={cn(
                            'bb-ar-icon',
                            aspectRatioIconClass(aspectRatio)
                          )}
                          aria-hidden="true"
                        />
                        <span className="bb-chip-label">{aspectRatio}</span>
                        <ChevronDown className="bb-rail-chip-caret h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="top"
                      align="start"
                      className="w-36 p-1"
                    >
                      {ASPECT_RATIO_OPTIONS.map((ratio) => (
                        <DropdownMenuItem
                          key={ratio}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm font-semibold',
                            ratio === aspectRatio &&
                              'bg-primary/20 text-foreground'
                          )}
                          onSelect={() => {
                            setAspectRatio(ratio);
                            setAspectPopoverOpen(false);
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <span
                              className={cn(
                                'bb-ar-icon',
                                aspectRatioIconClass(ratio)
                              )}
                              aria-hidden="true"
                            />
                            <span>{ratio}</span>
                          </span>
                          {ratio === aspectRatio && (
                            <Check className="text-primary h-3.5 w-3.5" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* resolution dropdown */}
                  <DropdownMenu
                    open={resolutionPopoverOpen}
                    onOpenChange={setResolutionPopoverOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="bb-rail-chip">
                        <span className="bb-chip-label">
                          {t(`form.resolution_${resolution}` as UnsafeAny)}
                        </span>
                        <span className="bb-chip-label-short" aria-hidden="true">
                          {resolution.toUpperCase()}
                        </span>
                        <ChevronDown className="bb-rail-chip-caret h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="top"
                      align="start"
                      className="w-44 p-1"
                    >
                      {BABY_IMAGE_RESOLUTIONS.map((r) => (
                        <DropdownMenuItem
                          key={r}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm font-semibold',
                            r === resolution && 'bg-primary/20 text-foreground'
                          )}
                          onSelect={() => {
                            setResolution(r);
                            setResolutionPopoverOpen(false);
                          }}
                        >
                          <span className="inline-flex flex-col">
                            <span>
                              {t(`form.resolution_${r}` as UnsafeAny)}
                            </span>
                            <span className="text-muted-foreground text-[11px] font-normal">
                              {t('form.resolution_credits', {
                                credits: BABY_IMAGE_COST_CREDITS[r],
                              })}
                            </span>
                          </span>
                          {r === resolution && (
                            <Check className="text-primary h-3.5 w-3.5" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* right: inline char count + send */}
                <div className="bb-bar-right">
                  <span
                    className={cn(
                      'bb-char-count',
                      isPromptTooLong && 'is-over'
                    )}
                  >
                    <b>{promptLength}</b>
                    <span>/{MAX_PROMPT_LENGTH}</span>
                  </span>
                  {!isMounted || isCheckSign ? (
                    <button
                      className="bb-send-btn bb-send-btn-icon-only"
                      disabled
                      aria-label={t('loading')}
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </button>
                  ) : !user ? (
                    <button
                      className="bb-send-btn"
                      onClick={() => setIsShowSignModal(true)}
                      aria-label={t('sign_in_to_generate')}
                    >
                      <User className="h-4 w-4" />
                      <span>{t('sign_in_to_generate')}</span>
                    </button>
                  ) : isGenerating ? (
                    <button
                      className="bb-send-btn bb-send-btn-icon-only"
                      disabled
                      aria-label={t('generating')}
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </button>
                  ) : (
                    <button
                      className="bb-send-btn"
                      disabled={!canSend}
                      onClick={() => handleSend()}
                      aria-label={t('generate')}
                    >
                      <span className="bb-send-spark" aria-hidden="true">
                        ✦
                      </span>
                      <span>{t('generate_cta')}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <label
              className={cn(
                'border-border/70 bg-background/80 text-muted-foreground mt-3 flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-[11px] leading-snug font-medium transition-colors',
                attemptedWithoutSafety && 'bb-safety-attention'
              )}
            >
              <input
                type="checkbox"
                checked={safetyConfirmed}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSafetyConfirmed(checked);
                  if (checked) {
                    localStorage.setItem(SAFETY_CONFIRMED_KEY, '1');
                    setAttemptedWithoutSafety(false);
                  } else {
                    localStorage.removeItem(SAFETY_CONFIRMED_KEY);
                  }
                }}
                className="border-border accent-primary mt-0.5 h-4 w-4 shrink-0 rounded"
              />
              <span>{t('safety.confirmation')}</span>
            </label>

            <div className="text-muted-foreground mt-2 flex items-center justify-between text-[11px] font-semibold">
              <span>
                {t('credits_cost', { credits: currentCostCredits })}
                {isPromptTooLong && (
                  <span className="text-destructive ml-2">
                    {t('form.prompt_too_long')}
                  </span>
                )}
              </span>
              {isMounted && user && remainingCredits < currentCostCredits ? (
                <Link
                  href="/pricing"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {t('buy_credits')}
                </Link>
              ) : (
                <span>
                  {t('credits_remaining', { credits: remainingCredits })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* helper text below the card (matches prototype footer) */}
        <p className="bb-foot-hint">
          <span className="bb-foot-hint-tag">{t('footer_tag')}</span>
          <span>{t('footer_hint', { credits: currentCostCredits })}</span>
        </p>
      </div>

      {lightboxImage && (
        <ImageLightbox
          image={lightboxImage}
          downloadingImageId={downloadingImageId}
          handoffImageId={handoffImageId}
          onClose={() => setLightboxImage(null)}
          onDownload={handleDownloadImage}
          onDance={handleMakeThemDance}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

function EmptyState({
  onSuggestion,
}: {
  onSuggestion: (prompt: string) => void;
}) {
  const t = useTranslations('ai.baby-image.generator');
  return (
    <div className="flex h-full flex-col items-center justify-start pt-6">
      <h3 className="bb-hero-title">
        {t.rich('empty.title', { em: (chunks) => <em>{chunks}</em> })}
      </h3>
      <p className="bb-hero-sub">{t('empty.subtitle')}</p>

      <div className="bb-try-label">{t('empty.try_label')}</div>
      <div className="bb-idea-grid">
        {SUGGESTION_META.map((meta, i) => {
          const label = t(`suggestions.${i}.label`);
          const subtitle = t(`suggestions.${i}.subtitle`);
          return (
            <button
              key={i}
              type="button"
              className="bb-idea"
              onClick={() => onSuggestion(meta.prompt)}
            >
              <span className="bb-idea-ill" aria-hidden="true">
                {meta.emoji}
              </span>
              <span className="bb-idea-body">
                <span>{label}</span>
                <span className="bb-idea-tiny">{subtitle}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* User bubble                                                                */
/* -------------------------------------------------------------------------- */

function UserBubble({ msg }: { msg: UserChatMessage }) {
  const t = useTranslations('ai.baby-image.generator');
  const [relTime, setRelTime] = useState(() =>
    formatRelativeTime(msg.timestamp)
  );
  useEffect(() => {
    const id = window.setInterval(() => {
      setRelTime(formatRelativeTime(msg.timestamp));
    }, 30000);
    return () => window.clearInterval(id);
  }, [msg.timestamp]);

  return (
    <div className="flex justify-end">
      <div className="bb-user-bubble">
        <span className="bb-user-time" aria-hidden="true">
          {relTime}
        </span>
        {msg.prompt || (
          <span className="text-muted-foreground italic">
            (reference photo only)
          </span>
        )}
        <div className="bb-user-bubble-meta">
          <span
            className="bb-user-bubble-meta-thumb"
            style={{ backgroundImage: `url(${STYLE_THUMB_URL(msg.styleId)})` }}
          />
          <span>
            {t(`styles.${msg.styleId}.label`)} · {msg.aspectRatio}
            {msg.referenceImageUrl ? ' · with photo' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Assistant card                                                             */
/* -------------------------------------------------------------------------- */

function AssistantCard({
  msg,
  userMsg,
  isLast,
  downloadingImageId,
  handoffImageId,
  elapsedSeconds,
  onDownload,
  onDance,
  onOpenLightbox,
  onRegenerate,
  onAspectChange,
  onTryStyle,
}: {
  msg: AssistantChatMessage;
  userMsg: UserChatMessage | undefined;
  isLast: boolean;
  downloadingImageId: string | null;
  handoffImageId: string | null;
  elapsedSeconds?: number;
  onDownload: (img: GeneratedImage) => void;
  onDance: (img: GeneratedImage) => void;
  onOpenLightbox?: (img: GeneratedImage) => void;
  onRegenerate: (user: UserChatMessage) => void;
  onAspectChange: (aspect: string, user: UserChatMessage) => void;
  onTryStyle: () => void;
}) {
  const t = useTranslations('ai.baby-image.generator');

  const isLoading =
    msg.status === AITaskStatus.PENDING ||
    msg.status === AITaskStatus.PROCESSING;
  const hasImages = msg.images.length > 0;
  const renderSeconds =
    msg.endTime && msg.startTime
      ? Math.max(1, Math.round((msg.endTime - msg.startTime) / 1000))
      : null;

  let statusLabel: string | null = null;
  if (msg.status === AITaskStatus.PENDING) statusLabel = t('status.pending');
  else if (msg.status === AITaskStatus.PROCESSING)
    statusLabel = t('status.processing');
  else if (msg.status === AITaskStatus.FAILED) statusLabel = t('status.failed');

  const previewStyleId = msg.images[0]?.styleId ?? userMsg?.styleId;
  const previewAspect = userMsg?.aspectRatio;

  return (
    <div>
      <div className="bb-assist-head">
        <span className="bb-brand-dot bb-brand-dot-sm" aria-hidden="true">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>
        <div className="bb-assist-head-text">
          {isLoading && !hasImages ? (
            <div className="flex items-center gap-2.5">
              <span className="bb-assist-title">
                {statusLabel || t('status.processing')}
              </span>
              <span className="bb-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              {elapsedSeconds != null && elapsedSeconds > 0 && (
                <span className="bb-elapsed">{elapsedSeconds}s</span>
              )}
            </div>
          ) : msg.status === AITaskStatus.FAILED ? (
            <div className="bb-assist-title bb-assist-error">
              {msg.errorMessage || t('errors.generate_failed')}
            </div>
          ) : (
            <>
              <div className="bb-assist-title">
                {hasImages ? (
                  <>
                    <span>Here&rsquo;s {msg.images.length}</span>
                    <em>for you</em>
                  </>
                ) : (
                  t('status.success')
                )}
              </div>
              {hasImages && (
                <div className="bb-meta-pills">
                  {renderSeconds !== null && (
                    <span className="bb-meta-pill">
                      <span aria-hidden="true">◷</span>
                      {renderSeconds}s
                    </span>
                  )}
                  {previewStyleId && (
                    <span className="bb-meta-pill">
                      <span
                        className="bb-meta-pill-sw"
                        style={{
                          backgroundImage: `url(${STYLE_THUMB_URL(
                            previewStyleId
                          )})`,
                        }}
                        aria-hidden="true"
                      />
                      {t(`styles.${previewStyleId}.label`)}
                    </span>
                  )}
                  {previewAspect && (
                    <span className="bb-meta-pill">
                      <span
                        className={cn(
                          'bb-ar-icon',
                          aspectRatioIconClass(previewAspect)
                        )}
                        aria-hidden="true"
                      />
                      {previewAspect}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {hasImages && (
        <div
          className={cn(
            'bb-result-grid',
            msg.images.length === 1 && 'is-single'
          )}
        >
          {msg.images.map((image, index) => (
            <div key={image.id} className="bb-result-item">
              <figure
                className="bb-result"
                style={
                  userMsg?.aspectRatio
                    ? ({
                        ['--bb-result-ar' as UnsafeAny]:
                          userMsg.aspectRatio.replace(':', ' / '),
                      } as UnsafeAny)
                    : undefined
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="bb-result-photo"
                  src={image.url}
                  alt={image.prompt || 'Generated baby image'}
                  onClick={() => onOpenLightbox?.(image)}
                  style={{ cursor: 'zoom-in' }}
                />
                <div className="bb-result-grain" aria-hidden="true" />
                <div className="bb-result-vignette" aria-hidden="true" />
                <span className="bb-result-no" aria-hidden="true">
                  {toRomanLower(index + 1)}.
                </span>
                <div className="bb-result-overlay">
                  <button
                    type="button"
                    className="bb-ov-btn"
                    aria-label="Make them dance"
                    title="Make them dance"
                    onClick={() => onDance(image)}
                    disabled={handoffImageId === image.id}
                  >
                    {handoffImageId === image.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span className="bb-ov-dancer" aria-hidden="true">💃</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="bb-ov-btn bb-ov-primary"
                    aria-label="Download"
                    title="Download"
                    onClick={() => onDownload(image)}
                    disabled={downloadingImageId === image.id}
                  >
                    {downloadingImageId === image.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" strokeWidth={1.9} />
                    )}
                  </button>
                </div>
              </figure>
              <button
                type="button"
                className="bb-dance-btn"
                onClick={() => onDance(image)}
                disabled={handoffImageId === image.id}
              >
                {handoffImageId === image.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span className="bb-dancer" aria-hidden="true">
                      💃
                    </span>
                    <span>{t('make_them_dance')}</span>
                    <span className="bb-arrow" aria-hidden="true">
                      →
                    </span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {isLast &&
        userMsg &&
        msg.status === AITaskStatus.SUCCESS &&
        hasImages && (
          <div className="bb-quick-chips">
            <button
              type="button"
              className="bb-followup"
              onClick={() => onRegenerate(userMsg)}
            >
              <span aria-hidden="true">↻</span>
              <span>Regenerate</span>
            </button>
            <button type="button" className="bb-followup" onClick={onTryStyle}>
              <span aria-hidden="true">🎨</span>
              <span>Try another style</span>
            </button>
            {userMsg.aspectRatio !== '3:4' && (
              <button
                type="button"
                className="bb-followup"
                onClick={() => onAspectChange('3:4', userMsg)}
              >
                <span className="bb-ar-icon bb-ar-34" aria-hidden="true" />
                <span>3:4 portrait</span>
              </button>
            )}
            {userMsg.aspectRatio !== '16:9' && (
              <button
                type="button"
                className="bb-followup"
                onClick={() => onAspectChange('16:9', userMsg)}
              >
                <span className="bb-ar-icon bb-ar-169" aria-hidden="true" />
                <span>16:9 wide</span>
              </button>
            )}
          </div>
        )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Image Lightbox                                                              */
/* -------------------------------------------------------------------------- */

function ImageLightbox({
  image,
  downloadingImageId,
  handoffImageId,
  onClose,
  onDownload,
  onDance,
}: {
  image: GeneratedImage;
  downloadingImageId: string | null;
  handoffImageId: string | null;
  onClose: () => void;
  onDownload: (img: GeneratedImage) => void;
  onDance: (img: GeneratedImage) => void;
}) {
  const t = useTranslations('ai.baby-image.generator');
  return (
    <div
      className="bb-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="bb-lightbox" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="bb-lightbox-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="bb-lightbox-img"
          src={image.url}
          alt={image.prompt || 'Generated baby image'}
        />
        <div className="bb-lightbox-actions">
          <button
            type="button"
            className="bb-ov-btn bb-ov-primary"
            aria-label="Download"
            title="Download"
            onClick={() => onDownload(image)}
            disabled={downloadingImageId === image.id}
          >
            {downloadingImageId === image.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" strokeWidth={1.9} />
            )}
          </button>
          <button
            type="button"
            className="bb-dance-btn"
            onClick={() => onDance(image)}
            disabled={handoffImageId === image.id}
          >
            {handoffImageId === image.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <span className="bb-dancer" aria-hidden="true">💃</span>
                <span>{t('make_them_dance')}</span>
                <span className="bb-arrow" aria-hidden="true">→</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
