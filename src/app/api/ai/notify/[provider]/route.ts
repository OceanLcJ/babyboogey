import { respData, respErr } from '@/shared/lib/resp';
import {
  findAITaskByProviderTaskId,
  UpdateAITask,
  updateAITaskById,
} from '@/shared/models/ai_task';
import { getAIService } from '@/shared/services/ai';

function parseWebhookPayload(raw: string) {
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function findFirstStringByKeys(
  value: unknown,
  keys: string[],
  depth = 0
): string | undefined {
  if (depth > 5 || !value) {
    return undefined;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
      if (typeof candidate === 'number') {
        return String(candidate);
      }
    }

    for (const child of Object.values(record)) {
      const nested = findFirstStringByKeys(child, keys, depth + 1);
      if (nested) {
        return nested;
      }
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findFirstStringByKeys(item, keys, depth + 1);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}

function extractProviderTaskId(provider: string, payload: unknown): string | undefined {
  if (provider === 'replicate') {
    return findFirstStringByKeys(payload, ['id', 'prediction_id', 'taskId']);
  }
  if (provider === 'fal') {
    return findFirstStringByKeys(payload, ['request_id', 'requestId', 'taskId']);
  }
  if (provider === 'kie') {
    return findFirstStringByKeys(payload, ['taskId', 'task_id', 'id']);
  }

  return findFirstStringByKeys(payload, ['taskId', 'task_id', 'request_id', 'id']);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await context.params;
    if (!provider) {
      return respErr('invalid provider');
    }

    const aiService = await getAIService();
    const aiProvider = aiService.getProvider(provider);
    if (!aiProvider?.query) {
      return respErr('invalid ai provider');
    }

    const text = await req.text();
    const payload = parseWebhookPayload(text);
    const requestUrl = new URL(req.url);
    const taskIdFromQuery = requestUrl.searchParams.get('taskId') || undefined;
    const providerTaskId =
      taskIdFromQuery || extractProviderTaskId(provider, payload);

    if (!providerTaskId) {
      return respErr('taskId not found in notify payload');
    }

    const task = await findAITaskByProviderTaskId({
      provider,
      taskId: providerTaskId,
    });
    if (!task || !task.taskId) {
      return respData({
        skipped: true,
        reason: 'task not found',
        provider,
        providerTaskId,
      });
    }

    const result = await aiProvider.query({
      taskId: task.taskId,
      mediaType: task.mediaType,
      model: task.model,
      userId: task.userId,
    });
    if (!result?.taskStatus) {
      return respErr('query ai task failed');
    }

    const updatePayload: UpdateAITask = {
      status: result.taskStatus,
      taskInfo: result.taskInfo ? JSON.stringify(result.taskInfo) : null,
      taskResult: result.taskResult ? JSON.stringify(result.taskResult) : null,
      creditId: task.creditId,
    };

    const hasStatusChanged = updatePayload.status !== task.status;
    const hasTaskInfoChanged = updatePayload.taskInfo !== task.taskInfo;
    const hasTaskResultChanged = updatePayload.taskResult !== task.taskResult;
    const hasChanged =
      hasStatusChanged || hasTaskInfoChanged || hasTaskResultChanged;

    if (hasChanged) {
      await updateAITaskById(task.id, updatePayload);
    }

    return respData({
      updated: hasChanged,
      id: task.id,
      status: updatePayload.status,
      provider,
      providerTaskId,
    });
  } catch (e: any) {
    console.log('ai notify failed', e);
    return respErr(e.message || 'ai notify failed');
  }
}
