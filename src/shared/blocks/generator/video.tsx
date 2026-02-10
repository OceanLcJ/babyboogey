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
}

interface BackendTask {
  id: string;
  status: string;
  provider: string;
  model: string;
  prompt: string | null;
  taskInfo: string | null;
  taskResult: string | null;
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

const POLL_INTERVAL = 15000;
const GENERATION_TIMEOUT = 600000;
const MAX_PROMPT_LENGTH = 500;
const MAX_IMAGE_ORIENTATION_SECONDS = 10;

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

function extractVideoUrls(result: any): string[] {
  if (!result) {
    return [];
  }

  const videos = result.videos;
  if (videos && Array.isArray(videos)) {
    return videos
      .map((item: any) => {
        if (!item) return null;
        if (typeof item === 'string') return item;
        if (typeof item === 'object') {
          return (
            item.url ?? item.uri ?? item.video ?? item.src ?? item.videoUrl
          );
        }
        return null;
      })
      .filter(Boolean);
  }

  const output = result.output ?? result.video ?? result.data;

  if (!output) {
    return [];
  }

  if (typeof output === 'string') {
    return [output];
  }

  if (Array.isArray(output)) {
    return output
      .flatMap((item) => {
        if (!item) return [];
        if (typeof item === 'string') return [item];
        if (typeof item === 'object') {
          const candidate =
            item.url ?? item.uri ?? item.video ?? item.src ?? item.videoUrl;
          return typeof candidate === 'string' ? [candidate] : [];
        }
        return [];
      })
      .filter(Boolean);
  }

  if (typeof output === 'object') {
    const candidate =
      output.url ?? output.uri ?? output.video ?? output.src ?? output.videoUrl;
    if (typeof candidate === 'string') {
      return [candidate];
    }
  }

  return [];
}

const uploadImageFile = async (file: File) => {
  const formData = new FormData();
  formData.append('files', file);

  const response = await fetch('/api/storage/upload-image', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }

  const result = await response.json();
  if (result.code !== 0 || !result.data?.urls?.length) {
    throw new Error(result.message || 'Upload failed');
  }

  return result.data.urls[0] as string;
};

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
  const [taskId, setTaskId] = useState<string | null>(null);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(
    null
  );
  const [taskStatus, setTaskStatus] = useState<AITaskStatus | null>(null);
  const [downloadingVideoId, setDownloadingVideoId] = useState<string | null>(
    null
  );
  const [isMounted, setIsMounted] = useState(false);

  const {
    user,
    isCheckSign,
    setIsShowSignModal,
    fetchUserCredits,
    fetchUserInfo,
  } =
    useAppContext();
  const searchParams = useSearchParams();

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

  const taskStatusLabel = useMemo(() => {
    if (!taskStatus) {
      return '';
    }

    switch (taskStatus) {
      case AITaskStatus.PENDING:
        return 'Waiting for the model to start';
      case AITaskStatus.PROCESSING:
        return 'Generating your video...';
      case AITaskStatus.SUCCESS:
        return 'Video generation completed';
      case AITaskStatus.FAILED:
        return 'Generation failed';
      default:
        return '';
    }
  }, [taskStatus]);

  const maxBytes = maxSizeMB * 1024 * 1024;

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
    toast(
      'This template is longer than 10 seconds, so orientation was switched to Video.'
    );
  }, [orientation, selectedTemplateDurationSeconds]);

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
      const url = await uploadImageFile(file);
      setUploadedImage({ preview: url, url, status: 'uploaded' });
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
    setIsGenerating(false);
    setProgress(0);
    setTaskId(null);
    setGenerationStartTime(null);
    setTaskStatus(null);
  }, []);

  const pollTaskStatus = useCallback(
    async (id: string) => {
      try {
        if (
          generationStartTime &&
          Date.now() - generationStartTime > GENERATION_TIMEOUT
        ) {
          resetTaskState();
          toast.error('Video generation timed out. Please try again.');
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

        const task = data as BackendTask;
        const currentStatus = task.status as AITaskStatus;
        setTaskStatus(currentStatus);

        const parsedResult = parseTaskResult(task.taskInfo);
        const videoUrls = extractVideoUrls(parsedResult);

        if (currentStatus === AITaskStatus.PENDING) {
          setProgress((prev) => Math.max(prev, 20));
          return false;
        }

        if (currentStatus === AITaskStatus.PROCESSING) {
          if (videoUrls.length > 0) {
            setGeneratedVideos(
              videoUrls.map((url, index) => ({
                id: `${task.id}-${index}`,
                url,
                provider: task.provider,
                model: task.model,
                prompt: task.prompt ?? undefined,
              }))
            );
            setProgress((prev) => Math.max(prev, 85));
          } else {
            setProgress((prev) => Math.min(prev + 5, 80));
          }
          return false;
        }

        if (currentStatus === AITaskStatus.SUCCESS) {
          if (videoUrls.length === 0) {
            toast.error('The provider returned no videos. Please retry.');
          } else {
            setGeneratedVideos(
              videoUrls.map((url, index) => ({
                id: `${task.id}-${index}`,
                url,
                provider: task.provider,
                model: task.model,
                prompt: task.prompt ?? undefined,
              }))
            );
            toast.success('Video generated successfully');
          }

          setProgress(100);
          resetTaskState();
          return true;
        }

        if (currentStatus === AITaskStatus.FAILED) {
          const errorMessage =
            parsedResult?.errorMessage || 'Generate video failed';
          toast.error(errorMessage);
          resetTaskState();

          fetchUserCredits();

          return true;
        }

        setProgress((prev) => Math.min(prev + 3, 95));
        return false;
      } catch (error: any) {
        console.error('Error polling video task:', error);
        toast.error(`Query task failed: ${error.message}`);
        resetTaskState();

        fetchUserCredits();

        return true;
      }
    },
    [generationStartTime, resetTaskState, fetchUserCredits]
  );

  useEffect(() => {
    if (!taskId || !isGenerating) {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (!taskId) {
        return;
      }
      const completed = await pollTaskStatus(taskId);
      if (completed) {
        cancelled = true;
      }
    };

    tick();

    const interval = setInterval(async () => {
      if (cancelled || !taskId) {
        clearInterval(interval);
        return;
      }
      const completed = await pollTaskStatus(taskId);
      if (completed) {
        clearInterval(interval);
      }
    }, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [taskId, isGenerating, pollTaskStatus]);

  const handleGenerate = async () => {
    if (!user) {
      setIsShowSignModal(true);
      return;
    }

    if (remainingCredits < currentCost) {
      toast.error('Insufficient credits. Please top up to keep creating.');
      return;
    }

    if (!uploadedImage?.url) {
      toast.error('Please upload a baby photo before generating.');
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
      toast.error(
        'Image orientation supports reference videos up to 10 seconds. Please choose Video orientation.'
      );
      return;
    }

    setIsGenerating(true);
    setProgress(15);
    setTaskStatus(AITaskStatus.PENDING);
    setGeneratedVideos([]);
    setGenerationStartTime(Date.now());

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
        throw new Error(message || 'Failed to create a video task');
      }

      const newTaskId = data?.id;
      if (!newTaskId) {
        throw new Error('Task id missing in response');
      }

      if (data.status === AITaskStatus.SUCCESS && data.taskInfo) {
        const parsedResult = parseTaskResult(data.taskInfo);
        const videoUrls = extractVideoUrls(parsedResult);

        if (videoUrls.length > 0) {
          setGeneratedVideos(
            videoUrls.map((url, index) => ({
              id: `${newTaskId}-${index}`,
              url,
              provider: VIDEO_PROVIDER,
              model: VIDEO_MODEL,
            }))
          );
          toast.success('Video generated successfully');
          setProgress(100);
          resetTaskState();
          await fetchUserCredits();
          return;
        }
      }

      setTaskId(newTaskId);
      setProgress(25);

      await fetchUserCredits();
    } catch (error: any) {
      console.error('Failed to generate video:', error);
      toast.error(`Failed to generate video: ${error.message}`);
      resetTaskState();
    }
  };

  const handleDownloadVideo = async (video: GeneratedVideo) => {
    if (!video.url) {
      return;
    }

    try {
      setDownloadingVideoId(video.id);
      const resp = await fetch(
        `/api/proxy/file?url=${encodeURIComponent(video.url)}`
      );
      if (!resp.ok) {
        throw new Error('Failed to fetch video');
      }

      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${video.id}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 200);
      toast.success('Video downloaded');
    } catch (error) {
      console.error('Failed to download video:', error);
      toast.error('Failed to download video');
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
                <div className="space-y-2 rounded-lg border p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span>{t('progress')}</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                  {taskStatusLabel && (
                    <p className="text-muted-foreground text-center text-xs">
                      {taskStatusLabel}
                    </p>
                  )}
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
                  {generatedVideos.map((video) => (
                    <div key={video.id} className="space-y-3">
                      <div className="bg-muted relative flex max-h-[600px] items-center justify-center overflow-hidden rounded-lg border">
                        <video
                          src={video.url}
                          controls
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="h-auto max-h-[600px] w-full object-contain"
                          preload="auto"
                        />
                      </div>
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
                  ))}
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
