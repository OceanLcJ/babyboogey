import {
  extractAssetIdFromMediaUrl,
  isAssetRef,
  resolveMediaValueToApiPath,
  toAssetRef,
} from '@/shared/lib/asset-ref';

export const AI_TASK_REUSE_HANDOFF_KEY = 'babyboogey:ai-task-reuse-handoff';

export const AI_TASK_REUSE_HANDOFF_TTL_MS = 30 * 60 * 1000;

export type AITaskReuseMediaType = 'image' | 'video';

export type AITaskReuseHandoffPayload = {
  mediaType: AITaskReuseMediaType;
  prompt?: string;
  scene?: string;
  options?: Record<string, unknown>;
  taskId: string;
  expiresAt: number;
};

export type AITaskReuseHandoffDraft = Omit<
  AITaskReuseHandoffPayload,
  'expiresAt'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeMediaType(value: unknown): AITaskReuseMediaType | null {
  return value === 'image' || value === 'video' ? value : null;
}

export function normalizeAITaskReuseOptions(
  value: unknown
): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeAITaskReuseHandoff(
  draft: AITaskReuseHandoffDraft
): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.localStorage.setItem(
      AI_TASK_REUSE_HANDOFF_KEY,
      JSON.stringify({
        ...draft,
        expiresAt: Date.now() + AI_TASK_REUSE_HANDOFF_TTL_MS,
      })
    );
    return true;
  } catch (error) {
    console.warn('Failed to persist AI task reuse handoff:', error);
    return false;
  }
}

export function consumeAITaskReuseHandoff(): AITaskReuseHandoffPayload | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AI_TASK_REUSE_HANDOFF_KEY);
    if (!raw) {
      return null;
    }

    window.localStorage.removeItem(AI_TASK_REUSE_HANDOFF_KEY);
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }

    const mediaType = normalizeMediaType(parsed.mediaType);
    const taskId = typeof parsed.taskId === 'string' ? parsed.taskId : '';
    const expiresAt =
      typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0;

    if (!mediaType || !taskId || !expiresAt || Date.now() > expiresAt) {
      return null;
    }

    return {
      mediaType,
      taskId,
      expiresAt,
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : undefined,
      scene: typeof parsed.scene === 'string' ? parsed.scene : undefined,
      options: normalizeAITaskReuseOptions(parsed.options),
    };
  } catch (error) {
    console.warn('Failed to consume AI task reuse handoff:', error);
    return null;
  }
}

export function readStringOption(
  options: Record<string, unknown> | undefined,
  keys: string[]
) {
  if (!options) {
    return undefined;
  }

  for (const key of keys) {
    const value = options[key];
    if (typeof value === 'string' && value) {
      return value;
    }
  }

  return undefined;
}

export function readFirstStringFromOptionArray(
  options: Record<string, unknown> | undefined,
  keys: string[]
) {
  if (!options) {
    return undefined;
  }

  for (const key of keys) {
    const value = options[key];
    if (typeof value === 'string' && value) {
      return value;
    }
    if (!Array.isArray(value)) {
      continue;
    }
    const firstString = value.find(
      (item): item is string => typeof item === 'string' && item.length > 0
    );
    if (firstString) {
      return firstString;
    }
  }

  return undefined;
}

export function normalizeRestoredMediaReference(value?: string | null) {
  if (!value) {
    return null;
  }

  const assetId = extractAssetIdFromMediaUrl(value);
  const assetRef = assetId ? toAssetRef(assetId) : value;

  return {
    assetRef,
    previewUrl: resolveMediaValueToApiPath(assetRef),
    recoveredAssetRef: Boolean(assetId) || isAssetRef(value),
  };
}
