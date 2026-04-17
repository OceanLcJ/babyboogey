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
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Paperclip,
  Send,
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
  extractAssetIdFromMediaUrl,
  resolveMediaValueToApiPath,
  toAssetRef,
} from '@/shared/lib/asset-ref';
import { cn } from '@/shared/lib/utils';
import {
  BABY_IMAGE_COST_CREDITS,
  BABY_IMAGE_DEFAULT_MODEL,
  BABY_IMAGE_PROVIDER,
  BABY_IMAGE_SCENE_IMAGE,
  BABY_IMAGE_SCENE_TEXT,
} from '@/shared/services/baby-image/config';
import {
  BABY_STYLE_IDS,
  BabyStyleId,
} from '@/shared/services/baby-image/styles';

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

const STYLE_THUMB_URL = (id: BabyStyleId) =>
  `https://r2.babyboogey.com/assets/imgs/showcases/ai-baby-image-generator/${id}-after.webp`;

// Short English descriptors for the style popover. Kept inline to avoid
// expanding the i18n message files for this first landing — translations can
// be added later against these keys.
const STYLE_DESCRIPTIONS: Record<BabyStyleId, string> = {
  'pixar-3d': 'Big eyes, cinematic lighting, film polish',
  ghibli: 'Dreamy watercolor, whimsical light',
  anime: 'Bold line art, vibrant cel-shading',
  claymation: 'Stop-motion warmth, clay seams',
  chibi: 'Kawaii, sticker-ready, blush cheeks',
  watercolor: 'Soft washes, storybook paper',
  plush: 'Felt, fluff, stitched seams',
  'pixel-art': '16-bit nostalgia, limited palette',
};

const SUGGESTIONS: { label: string; prompt: string }[] = [
  {
    label: '🎂 First birthday in the garden',
    prompt:
      'A joyful baby at their first birthday party in a sunlit garden full of balloons and flowers.',
  },
  {
    label: '🧙 Tiny wizard in a forest',
    prompt:
      'A tiny baby wizard wearing a pointed hat, sitting on a mossy log in an enchanted forest at sunrise.',
  },
  {
    label: '🏖 Beach day with seashells',
    prompt:
      'A curious baby on a sunny beach, holding a seashell, waves in the background, golden hour light.',
  },
  {
    label: '🚀 Astronaut among the stars',
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
  const [selectedStyle, setSelectedStyle] = useState<BabyStyleId>(DEFAULT_STYLE);
  const [aspectRatio, setAspectRatio] =
    useState<(typeof ASPECT_RATIO_OPTIONS)[number]>('1:1');
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [stylePopoverOpen, setStylePopoverOpen] = useState(false);
  const [aspectPopoverOpen, setAspectPopoverOpen] = useState(false);
  const [downloadingImageId, setDownloadingImageId] = useState<string | null>(
    null
  );
  const [handoffImageId, setHandoffImageId] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  /* -------- derived -------- */
  const promptLength = prompt.trim().length;
  const isPromptTooLong = promptLength > MAX_PROMPT_LENGTH;
  const remainingCredits = user?.credits?.remainingCredits ?? 0;

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
          const errorMessage =
            parsedResult?.errorMessage || t('errors.generate_failed');
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
        toast.error(`${t('errors.query_failed')}: ${error.message}`);
        updateAssistant(assistantId, {
          status: AITaskStatus.FAILED,
          errorMessage: error.message,
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

      if (remainingCredits < BABY_IMAGE_COST_CREDITS) {
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
        };
        if (sendRefUrl) {
          options.image_input = [sendRefUrl];
        }

        const resp = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaType: AIMediaType.IMAGE,
            scene: sendRefUrl
              ? BABY_IMAGE_SCENE_IMAGE
              : BABY_IMAGE_SCENE_TEXT,
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
        toast.error(`${t('errors.generate_failed')}: ${error.message}`);
        updateAssistant(assistantMsg.id, {
          status: AITaskStatus.FAILED,
          errorMessage: error.message,
          endTime: Date.now(),
        });
      }
    },
    [
      user,
      isGenerating,
      remainingCredits,
      prompt,
      selectedStyle,
      aspectRatio,
      attachedImage,
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
    <section className={cn('py-10 md:py-14', className)}>
      {srOnlyTitle && <h2 className="sr-only">{srOnlyTitle}</h2>}
      <div className="container max-w-3xl">
        <div className="bb-chat-card">
          {/* ============== Head ============== */}
          <div className="bb-chat-head">
            <div className="flex items-center gap-3">
              <span className="bb-brand-dot">👶</span>
              <div className="leading-tight">
                <div className="text-[1.05rem] font-extrabold tracking-tight text-foreground">
                  {t('title')}
                </div>
                <div className="text-xs font-semibold text-muted-foreground">
                  Nano Banana Pro
                  {hasMessages ? ` · ${messages.length} messages` : ' · fresh session'}
                </div>
              </div>
            </div>
            {isMounted && user ? (
              <span className="bb-credits-pill">{remainingCredits}</span>
            ) : (
              <span className="bb-credits-pill">—</span>
            )}
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
                      onDownload={handleDownloadImage}
                      onDance={handleMakeThemDance}
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
              <div className="mb-2.5 flex items-center">
                <div className="bb-attach-preview">
                  {attachedImage.uploading ? (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div
                      className="bb-attach-preview-thumb"
                      style={{ backgroundImage: `url(${attachedImage.previewUrl})` }}
                    />
                  )}
                  <span className="bb-attach-preview-name">
                    {attachedImage.error ? t('form.some_images_failed_to_upload') : attachedImage.fileName}
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
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {/* attach */}
                  <button
                    type="button"
                    className="bb-rail-chip bb-rail-chip-icon"
                    onClick={handleAttachClick}
                    aria-label={t('form.reference_image')}
                    title={t('form.reference_image')}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
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
                        <span>{t(`styles.${selectedStyle}.label`)}</span>
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="top"
                      align="start"
                      className="w-80 p-1.5"
                    >
                      <div className="px-2 pt-1 pb-2 text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
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
                              style={{ backgroundImage: `url(${STYLE_THUMB_URL(id)})` }}
                            />
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="bb-popover-item-name">
                                {t(`styles.${id}.label`)}
                              </span>
                              <span className="bb-popover-item-desc truncate">
                                {STYLE_DESCRIPTIONS[id]}
                              </span>
                            </span>
                            {id === selectedStyle && (
                              <Check className="h-4 w-4 text-primary" />
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
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect x="4" y="4" width="16" height="16" rx="2" />
                        </svg>
                        <span>{aspectRatio}</span>
                        <ChevronDown className="h-3 w-3 opacity-60" />
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
                            ratio === aspectRatio && 'bg-primary/20 text-foreground'
                          )}
                          onSelect={() => {
                            setAspectRatio(ratio);
                            setAspectPopoverOpen(false);
                          }}
                        >
                          <span>{ratio}</span>
                          {ratio === aspectRatio && (
                            <Check className="h-3.5 w-3.5 text-primary" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* send */}
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {t('credits_cost', { credits: BABY_IMAGE_COST_CREDITS })}
                  </span>
                  {!isMounted || isCheckSign ? (
                    <button className="bb-send-btn" disabled>
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </button>
                  ) : !user ? (
                    <button
                      className="bb-send-btn"
                      onClick={() => setIsShowSignModal(true)}
                      aria-label={t('sign_in_to_generate')}
                    >
                      <User className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      className="bb-send-btn"
                      disabled={!canSend}
                      onClick={() => handleSend()}
                      aria-label={t('generate')}
                    >
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* inline char count inside composer footer */}
            <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span>
                {promptLength} / {MAX_PROMPT_LENGTH}
                {isPromptTooLong && (
                  <span className="ml-2 text-destructive">
                    {t('form.prompt_too_long')}
                  </span>
                )}
              </span>
              {isMounted && user && remainingCredits < BABY_IMAGE_COST_CREDITS ? (
                <Link href="/pricing" className="text-primary underline-offset-2 hover:underline">
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
        <p className="mt-5 text-center text-xs font-semibold text-muted-foreground">
          ⏎ to generate · ⇧⏎ for new line · Each image costs {BABY_IMAGE_COST_CREDITS} credits
        </p>
      </div>
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
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="bb-hero-orb">
        <Sparkles className="h-9 w-9 text-primary-foreground" strokeWidth={2.4} />
      </div>
      <h3 className="mt-7 text-2xl font-extrabold tracking-tight text-foreground">
        Imagine your baby.
      </h3>
      <p className="mt-2 max-w-[360px] text-sm font-medium text-muted-foreground">
        Pick a style, attach a photo (optional), and describe the scene.
      </p>
      <div className="mt-6 text-[0.7rem] font-bold uppercase tracking-widest text-muted-foreground">
        Try an idea
      </div>
      <div className="mt-3 flex max-w-[460px] flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            className="bb-followup"
            onClick={() => onSuggestion(s.prompt)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* User bubble                                                                */
/* -------------------------------------------------------------------------- */

function UserBubble({ msg }: { msg: UserChatMessage }) {
  const t = useTranslations('ai.baby-image.generator');
  return (
    <div className="flex justify-end">
      <div className="bb-user-bubble">
        {msg.prompt || (
          <span className="italic text-muted-foreground">
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
  onDownload,
  onDance,
  onRegenerate,
  onAspectChange,
  onTryStyle,
}: {
  msg: AssistantChatMessage;
  userMsg: UserChatMessage | undefined;
  isLast: boolean;
  downloadingImageId: string | null;
  handoffImageId: string | null;
  onDownload: (img: GeneratedImage) => void;
  onDance: (img: GeneratedImage) => void;
  onRegenerate: (user: UserChatMessage) => void;
  onAspectChange: (aspect: string, user: UserChatMessage) => void;
  onTryStyle: () => void;
}) {
  const t = useTranslations('ai.baby-image.generator');

  const isLoading =
    msg.status === AITaskStatus.PENDING || msg.status === AITaskStatus.PROCESSING;
  const hasImages = msg.images.length > 0;
  const renderSeconds =
    msg.endTime && msg.startTime
      ? Math.max(1, Math.round((msg.endTime - msg.startTime) / 1000))
      : null;

  // status label
  let statusLabel: string | null = null;
  if (msg.status === AITaskStatus.PENDING) statusLabel = t('status.pending');
  else if (msg.status === AITaskStatus.PROCESSING)
    statusLabel = t('status.processing');
  else if (msg.status === AITaskStatus.FAILED) statusLabel = t('status.failed');

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="bb-brand-dot bb-brand-dot-sm">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>
        <div className="leading-tight">
          {isLoading && !hasImages ? (
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-bold text-foreground">
                {statusLabel || t('status.processing')}
              </span>
              <span className="bb-dots">
                <span />
                <span />
                <span />
              </span>
            </div>
          ) : msg.status === AITaskStatus.FAILED ? (
            <div className="text-sm font-bold text-destructive">
              {msg.errorMessage || t('errors.generate_failed')}
            </div>
          ) : (
            <>
              <div className="text-sm font-extrabold text-foreground">
                {hasImages
                  ? `Here's ${msg.images.length} image${msg.images.length > 1 ? 's' : ''}`
                  : t('status.success')}
              </div>
              {renderSeconds !== null && (
                <div className="text-xs font-bold text-muted-foreground">
                  Rendered in {renderSeconds}s
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {hasImages && (
        <div
          className={cn(
            'grid gap-4',
            msg.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          )}
        >
          {msg.images.map((image, index) => (
            <div key={image.id}>
              <div className="bb-result">
                <div className="bb-result-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt={image.prompt || 'Generated baby image'} />
                  <button
                    type="button"
                    className="bb-result-dl"
                    aria-label="Download"
                    onClick={() => onDownload(image)}
                    disabled={downloadingImageId === image.id}
                  >
                    {downloadingImageId === image.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="bb-result-caption">
                  <span className="bb-result-stamp">
                    <span className="bb-result-stamp-num">{index + 1}</span>
                    {msg.images[index].styleId
                      ? t(`styles.${msg.images[index].styleId as BabyStyleId}.label`)
                      : ''}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="bb-dance-btn mt-3"
                onClick={() => onDance(image)}
                disabled={handoffImageId === image.id}
              >
                {handoffImageId === image.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="bb-dancer">💃</span>
                )}
                <span>{t('make_them_dance')}</span>
                <ArrowRight className="bb-arrow h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Follow-ups — only for last completed success assistant message */}
      {isLast &&
        userMsg &&
        msg.status === AITaskStatus.SUCCESS &&
        hasImages && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className="bb-followup"
              onClick={() => onRegenerate(userMsg)}
            >
              ↻ Regenerate
            </button>
            <button type="button" className="bb-followup" onClick={onTryStyle}>
              🎨 Try another style
            </button>
            {userMsg.aspectRatio !== '3:4' && (
              <button
                type="button"
                className="bb-followup"
                onClick={() => onAspectChange('3:4', userMsg)}
              >
                ↕ 3:4 portrait
              </button>
            )}
            {userMsg.aspectRatio !== '16:9' && (
              <button
                type="button"
                className="bb-followup"
                onClick={() => onAspectChange('16:9', userMsg)}
              >
                ↔ 16:9 wide
              </button>
            )}
          </div>
        )}
    </div>
  );
}
