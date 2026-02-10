import { respData, respErr } from '@/shared/lib/resp';
import {
  findAITaskById,
  UpdateAITask,
  updateAITaskById,
} from '@/shared/models/ai_task';
import { getUserInfo } from '@/shared/models/user';
import { getAIService } from '@/shared/services/ai';
import { resolveAssetRefsWithSignedUrls } from '@/shared/services/media-asset';

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

export async function POST(req: Request) {
  try {
    const { taskId } = await req.json();
    if (!taskId) {
      return respErr('invalid params');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const task = await findAITaskById(taskId);
    if (!task || !task.taskId) {
      return respErr('task not found');
    }

    if (task.userId !== user.id) {
      return respErr('no permission');
    }

    const aiService = await getAIService();
    const aiProvider = aiService.getProvider(task.provider);
    if (!aiProvider) {
      return respErr('invalid ai provider');
    }

    const result = await aiProvider?.query?.({
      taskId: task.taskId,
      mediaType: task.mediaType,
      model: task.model,
      userId: user.id,
    });

    if (!result?.taskStatus) {
      return respErr('query ai task failed');
    }

    // update ai task
    const updateAITask: UpdateAITask = {
      status: result.taskStatus,
      taskInfo: result.taskInfo ? JSON.stringify(result.taskInfo) : null,
      taskResult: result.taskResult ? JSON.stringify(result.taskResult) : null,
      creditId: task.creditId, // credit consumption record id
    };

    const hasStatusChanged = updateAITask.status !== task.status;
    const hasTaskInfoChanged = updateAITask.taskInfo !== task.taskInfo;
    const hasTaskResultChanged = updateAITask.taskResult !== task.taskResult;
    if (hasStatusChanged || hasTaskInfoChanged || hasTaskResultChanged) {
      await updateAITaskById(task.id, updateAITask);
    }

    const resolvedTask = {
      ...task,
      status: updateAITask.status || '',
      taskInfo: updateAITask.taskInfo || null,
      taskResult: updateAITask.taskResult || null,
    };

    const parsedTaskInfo = safeParseJson(resolvedTask.taskInfo);
    if (parsedTaskInfo) {
      const signedTaskInfo = await resolveAssetRefsWithSignedUrls({
        value: parsedTaskInfo,
        userId: user.id,
      });
      resolvedTask.taskInfo = JSON.stringify(signedTaskInfo);
    }

    return respData(resolvedTask);
  } catch (e: any) {
    console.log('ai query failed', e);
    return respErr(e.message);
  }
}
