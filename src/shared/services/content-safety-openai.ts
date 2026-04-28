import {
  AIMediaType,
  AITaskResult,
  AITaskStatus,
} from '@/extensions/ai/types';
import {
  BABY_SAFETY_CONTENT_POLICY_MESSAGE,
  normalizeBabySafetyErrorMessage,
} from '@/shared/services/content-safety';
import {
  BABY_IMAGE_DEFAULT_MODEL,
  BABY_IMAGE_PROVIDER,
  isBabyImageScene,
} from '@/shared/services/baby-image/config';
import { resolveAssetRefsWithSignedUrls } from '@/shared/services/media-asset';

export const OPENAI_MODERATION_MODEL = 'omni-moderation-latest';

const OPENAI_MODERATION_URL = 'https://api.openai.com/v1/moderations';
const OPENAI_MODERATION_TIMEOUT_MS = 8000;
const MODERATABLE_IMAGE_OPTION_KEYS = new Set([
  'image',
  'image_input',
  'image_url',
  'imageUrl',
  'input_urls',
  'images',
]);

type OpenAIModerationInput =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
      };
    };

type OpenAIModerationResult = {
  flagged?: boolean;
  categories?: Record<string, boolean>;
};

function getOpenAIApiKey(apiKey?: unknown): string {
  return String(apiKey || process.env.OPENAI_API_KEY || '').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isModeratableImageInput(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  return (
    /^https?:\/\//i.test(trimmed) ||
    /^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)
  );
}

function collectImageInputValue(
  value: unknown,
  imageInputs: Set<string>,
  imageContext = false
) {
  if (imageContext && isModeratableImageInput(value)) {
    imageInputs.add(value.trim());
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageInputValue(item, imageInputs, imageContext);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (imageContext && isModeratableImageInput(value.url)) {
    imageInputs.add(value.url.trim());
  }
  if (isRecord(value.image_url) && isModeratableImageInput(value.image_url.url)) {
    imageInputs.add(value.image_url.url.trim());
  }

  for (const [key, item] of Object.entries(value)) {
    collectImageInputValue(
      item,
      imageInputs,
      imageContext || MODERATABLE_IMAGE_OPTION_KEYS.has(key)
    );
  }
}

export function collectBabyModerationImageInputs(options: unknown): string[] {
  const imageInputs = new Set<string>();
  collectImageInputValue(options, imageInputs, false);
  return Array.from(imageInputs);
}

function collectFlaggedCategories(results: OpenAIModerationResult[]): string[] {
  const categories = new Set<string>();
  for (const result of results) {
    if (!isRecord(result.categories)) {
      continue;
    }
    for (const [category, flagged] of Object.entries(result.categories)) {
      if (flagged === true) {
        categories.add(category);
      }
    }
  }
  return Array.from(categories);
}

function hasExplicitViolation(results: OpenAIModerationResult[]): boolean {
  return results.some((result) => {
    if (result.flagged === true) {
      return true;
    }
    return collectFlaggedCategories([result]).length > 0;
  });
}

export async function assertBabyGenerationOpenAIModerationSafe({
  apiKey,
  prompt,
  imageInputs,
}: {
  apiKey?: unknown;
  prompt?: unknown;
  imageInputs?: string[];
}) {
  const resolvedApiKey = getOpenAIApiKey(apiKey);
  if (!resolvedApiKey) {
    return;
  }

  const inputs: OpenAIModerationInput[] = [];
  const promptText = typeof prompt === 'string' ? prompt.trim() : '';
  if (promptText) {
    inputs.push({
      type: 'text',
      text: promptText,
    });
  }

  for (const imageInput of imageInputs || []) {
    if (!isModeratableImageInput(imageInput)) {
      continue;
    }
    inputs.push({
      type: 'image_url',
      image_url: {
        url: imageInput.trim(),
      },
    });
  }

  if (!inputs.length) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    OPENAI_MODERATION_TIMEOUT_MS
  );

  try {
    const response = await fetch(OPENAI_MODERATION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODERATION_MODEL,
        input: inputs,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn('[content-safety] OpenAI moderation skipped', {
        status: response.status,
      });
      return;
    }

    const payload = (await response.json()) as {
      results?: OpenAIModerationResult[];
    };
    const results = Array.isArray(payload.results) ? payload.results : [];
    if (!hasExplicitViolation(results)) {
      return;
    }

    console.warn('[content-safety] OpenAI moderation blocked baby generation', {
      categories: collectFlaggedCategories(results),
    });
    throw new Error(BABY_SAFETY_CONTENT_POLICY_MESSAGE);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === BABY_SAFETY_CONTENT_POLICY_MESSAGE
    ) {
      throw error;
    }

    const reason =
      error instanceof Error && error.name === 'AbortError'
        ? 'timeout'
        : 'request_error';
    console.warn('[content-safety] OpenAI moderation skipped', { reason });
  } finally {
    clearTimeout(timeout);
  }
}

function shouldModerateBabyImageOutput(task: {
  mediaType?: string | null;
  scene?: string | null;
  provider?: string | null;
  model?: string | null;
}) {
  return (
    task.mediaType === AIMediaType.IMAGE &&
    (isBabyImageScene(task.scene) ||
      (task.provider === BABY_IMAGE_PROVIDER &&
        task.model === BABY_IMAGE_DEFAULT_MODEL))
  );
}

function buildBlockedOutputResult(result: AITaskResult): AITaskResult {
  return {
    taskId: result.taskId,
    taskStatus: AITaskStatus.FAILED,
    taskInfo: {
      status: AITaskStatus.FAILED,
      errorCode: BABY_SAFETY_CONTENT_POLICY_MESSAGE,
      errorMessage: BABY_SAFETY_CONTENT_POLICY_MESSAGE,
    },
    taskResult: {
      blockedBy: 'openai_moderation',
      model: OPENAI_MODERATION_MODEL,
      errorCode: BABY_SAFETY_CONTENT_POLICY_MESSAGE,
    },
  };
}

export async function moderateBabyImageOutputResult({
  apiKey,
  result,
  task,
  userId,
}: {
  apiKey?: unknown;
  result: AITaskResult;
  task: {
    mediaType?: string | null;
    scene?: string | null;
    provider?: string | null;
    model?: string | null;
  };
  userId?: string | null;
}): Promise<AITaskResult> {
  if (
    result.taskStatus !== AITaskStatus.SUCCESS ||
    !result.taskInfo ||
    !shouldModerateBabyImageOutput(task)
  ) {
    return result;
  }

  const signedTaskInfo = await resolveAssetRefsWithSignedUrls({
    value: result.taskInfo,
    userId,
    expiresInSeconds: 60 * 10,
    absolute: true,
  });
  const imageInputs = collectBabyModerationImageInputs(signedTaskInfo);
  if (!imageInputs.length) {
    return result;
  }

  try {
    await assertBabyGenerationOpenAIModerationSafe({
      apiKey,
      imageInputs,
    });
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : BABY_SAFETY_CONTENT_POLICY_MESSAGE;
    if (
      normalizeBabySafetyErrorMessage(message) ===
      BABY_SAFETY_CONTENT_POLICY_MESSAGE
    ) {
      return buildBlockedOutputResult(result);
    }
    throw error;
  }
}
