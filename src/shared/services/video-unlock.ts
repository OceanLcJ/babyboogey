import { AIMediaType, AITaskStatus } from '@/extensions/ai/types';
import {
  VIDEO_UNLOCK_AMOUNT_CENTS,
  VIDEO_UNLOCK_CURRENCY,
  VIDEO_UNLOCK_INTENT,
  VIDEO_UNLOCK_PRODUCT_ID,
} from '@/shared/constants/video-unlock';
import {
  extractAssetIdFromMediaUrl,
  getAssetIdFromRef,
} from '@/shared/lib/asset-ref';
import { getUuid } from '@/shared/lib/hash';
import {
  findAITaskById,
  findAITaskByProviderTaskId,
} from '@/shared/models/ai_task';
import {
  findMediaAssetById,
  MediaAsset,
  MediaAssetOwnerType,
  MediaAssetPurpose,
  MediaAssetStatus,
} from '@/shared/models/media_asset';
import { Order } from '@/shared/models/order';
import {
  createVideoUnlock,
  findActiveVideoUnlock,
  findVideoUnlockByOrderNo,
  updateVideoUnlockByOrderNo,
  VideoUnlock,
  VideoUnlockStatus,
} from '@/shared/models/video_unlock';

export {
  VIDEO_UNLOCK_AMOUNT_CENTS,
  VIDEO_UNLOCK_CURRENCY,
  VIDEO_UNLOCK_INTENT,
  VIDEO_UNLOCK_PRODUCT_ID,
} from '@/shared/constants/video-unlock';

type MetadataRecord = Record<string, UnsafeAny>;

export function isVideoUnlockProductId(productId?: string | null) {
  return String(productId || '').trim() === VIDEO_UNLOCK_PRODUCT_ID;
}

export function getVideoUnlockPricingItem() {
  return {
    product_id: VIDEO_UNLOCK_PRODUCT_ID,
    product_name: 'Unlock This Video',
    description: 'Remove watermark and download the clean HD video.',
    interval: 'one-time',
    amount: VIDEO_UNLOCK_AMOUNT_CENTS,
    currency: VIDEO_UNLOCK_CURRENCY,
    price: '$2.99',
    credits: 0,
    group: 'video_unlock',
  };
}

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

function normalizeMetadata(value: unknown): MetadataRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return { ...(value as MetadataRecord) };
}

export function buildVideoUnlockCheckoutMetadata({
  clientMetadata,
  taskId,
  assetId,
}: {
  clientMetadata?: unknown;
  taskId: string;
  assetId: string;
}) {
  const metadata = normalizeMetadata(clientMetadata);
  delete metadata.intent;
  delete metadata.task_id;
  delete metadata.asset_id;

  return {
    task_id: taskId,
    asset_id: assetId,
    intent: VIDEO_UNLOCK_INTENT,
    ...metadata,
  };
}

function readFirstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value) {
      return value;
    }
  }

  return null;
}

function getAssetIdFromMediaValue(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return null;
  }

  return getAssetIdFromRef(value) || extractAssetIdFromMediaUrl(value);
}

function collectVideoAssetIds(candidate: unknown, assetIds: Set<string>) {
  if (!candidate) {
    return;
  }

  if (typeof candidate === 'string') {
    const assetId = getAssetIdFromMediaValue(candidate);
    if (assetId) {
      assetIds.add(assetId);
    }
    return;
  }

  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      collectVideoAssetIds(item, assetIds);
    }
    return;
  }

  if (typeof candidate === 'object') {
    const record = candidate as Record<string, unknown>;
    const directAssetId = readFirstString(record, [
      'assetId',
      'asset_id',
      'mediaAssetId',
      'media_asset_id',
    ]);
    if (directAssetId) {
      assetIds.add(directAssetId);
    }

    const direct = readFirstString(record, [
      'videoUrl',
      'url',
      'uri',
      'video',
      'src',
    ]);
    const assetId = getAssetIdFromMediaValue(direct);
    if (assetId) {
      assetIds.add(assetId);
    }
  }
}

export function extractVideoAssetIdsFromTaskInfo(taskInfo?: string | null) {
  const parsed = safeParseJson(taskInfo);
  if (!parsed || typeof parsed !== 'object') {
    return [] as string[];
  }

  const info = parsed as Record<string, unknown>;
  const assetIds = new Set<string>();
  collectVideoAssetIds(info.videos, assetIds);
  collectVideoAssetIds(info.output, assetIds);
  collectVideoAssetIds(info.video, assetIds);
  collectVideoAssetIds(info.data, assetIds);

  return Array.from(assetIds);
}

export function extractFirstVideoAssetIdFromTaskInfo(taskInfo?: string | null) {
  return extractVideoAssetIdsFromTaskInfo(taskInfo)[0] || null;
}

export function getVideoUnlockReturnPath(taskId?: string | null) {
  const params = new URLSearchParams({ type: 'video' });
  if (taskId) {
    params.set('task', taskId);
  }

  return `/activity/ai-tasks?${params.toString()}`;
}

export async function resolveVideoUnlockCheckoutTarget({
  userId,
  taskId,
  assetId,
}: {
  userId: string;
  taskId?: string | null;
  assetId?: string | null;
}) {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) {
    throw new Error('task_id is required');
  }

  const task = await findAITaskById(normalizedTaskId);
  if (!task || task.userId !== userId) {
    throw new Error('task not found');
  }
  if (task.mediaType !== AIMediaType.VIDEO) {
    throw new Error('video unlock is only available for video tasks');
  }
  if (task.status !== AITaskStatus.SUCCESS) {
    throw new Error('video unlock is only available after generation succeeds');
  }

  const videoAssetIds = extractVideoAssetIdsFromTaskInfo(task.taskInfo);
  const normalizedAssetId = String(assetId || '').trim();
  const selectedAssetId =
    normalizedAssetId && videoAssetIds.includes(normalizedAssetId)
      ? normalizedAssetId
      : videoAssetIds[0];

  if (!selectedAssetId) {
    throw new Error('video asset not found');
  }

  const asset = await findMediaAssetById(selectedAssetId);
  if (
    !asset ||
    asset.status === MediaAssetStatus.DELETED ||
    asset.ownerType !== MediaAssetOwnerType.USER ||
    asset.ownerId !== userId ||
    asset.purpose !== MediaAssetPurpose.GENERATED_VIDEO
  ) {
    throw new Error('video asset not found');
  }

  const activeUnlock = await findActiveVideoUnlock({
    userId,
    taskId: task.id,
    assetId: asset.id,
  });

  return {
    task,
    asset,
    activeUnlock,
  };
}

function readVideoUnlockMetadataFromOrder(order: Order) {
  const parsedCheckoutInfo = safeParseJson(order.checkoutInfo);
  const checkoutRecord =
    parsedCheckoutInfo &&
    typeof parsedCheckoutInfo === 'object' &&
    !Array.isArray(parsedCheckoutInfo)
      ? (parsedCheckoutInfo as MetadataRecord)
      : {};

  const metadata = normalizeMetadata(checkoutRecord.metadata);
  const paypalCustomId =
    Array.isArray(checkoutRecord.purchase_units) &&
    checkoutRecord.purchase_units[0]?.custom_id
      ? safeParseJson(String(checkoutRecord.purchase_units[0].custom_id))
      : null;

  return {
    ...normalizeMetadata(paypalCustomId),
    ...metadata,
  };
}

export async function createPendingVideoUnlock({
  userId,
  taskId,
  assetId,
  orderNo,
  productId = VIDEO_UNLOCK_PRODUCT_ID,
}: {
  userId: string;
  taskId: string;
  assetId: string;
  orderNo: string;
  productId?: string;
}) {
  const existing = await findVideoUnlockByOrderNo(orderNo);
  if (existing) {
    return existing;
  }

  return createVideoUnlock({
    id: getUuid(),
    userId,
    taskId,
    assetId,
    orderNo,
    productId,
    status: VideoUnlockStatus.PENDING,
  });
}

export async function ensureVideoUnlockForOrder({
  order,
  metadata,
}: {
  order: Order;
  metadata?: unknown;
}): Promise<VideoUnlock | undefined> {
  if (!isVideoUnlockProductId(order.productId)) {
    return;
  }

  const orderNo = String(order.orderNo || '').trim();
  if (!orderNo) {
    throw new Error('order number is required for video unlock');
  }

  const existing = await findVideoUnlockByOrderNo(orderNo);
  if (existing?.status === VideoUnlockStatus.ACTIVE) {
    return existing;
  }

  const metadataRecord = {
    ...readVideoUnlockMetadataFromOrder(order),
    ...normalizeMetadata(metadata),
  };
  const taskId = String(
    existing?.taskId || metadataRecord.task_id || ''
  ).trim();
  const assetId = String(
    existing?.assetId || metadataRecord.asset_id || ''
  ).trim();

  if (!taskId || !assetId) {
    throw new Error('video unlock metadata is incomplete');
  }

  const unlockedAt = new Date();
  if (existing) {
    return updateVideoUnlockByOrderNo({
      orderNo,
      updateVideoUnlock: {
        status: VideoUnlockStatus.ACTIVE,
        unlockedAt,
      },
    });
  }

  return createVideoUnlock({
    id: getUuid(),
    userId: order.userId,
    taskId,
    assetId,
    orderNo,
    productId: order.productId || VIDEO_UNLOCK_PRODUCT_ID,
    status: VideoUnlockStatus.ACTIVE,
    unlockedAt,
  });
}

export async function findAITaskForGeneratedVideoAsset(asset: MediaAsset) {
  if (
    asset.purpose !== MediaAssetPurpose.GENERATED_VIDEO ||
    !asset.linkedTaskId
  ) {
    return null;
  }

  if (asset.provider) {
    const task = await findAITaskByProviderTaskId({
      provider: asset.provider,
      taskId: asset.linkedTaskId,
    });
    if (task) {
      return task;
    }
  }

  return null;
}

export async function requiresVideoUnlockForOriginalAccess(asset: MediaAsset) {
  const task = await findAITaskForGeneratedVideoAsset(asset);
  if (!task) {
    return { required: false as const, task: null };
  }

  return {
    required:
      task.mediaType === AIMediaType.VIDEO &&
      task.status === AITaskStatus.SUCCESS &&
      Boolean(task.watermarkApplied),
    task,
  };
}
