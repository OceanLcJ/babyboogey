import { redirect } from '@/core/i18n/navigation';
import { AITaskStatus } from '@/extensions/ai';
import { Empty } from '@/shared/blocks/common';
import { findAITaskById, updateAITaskById } from '@/shared/models/ai_task';
import { getUserInfo } from '@/shared/models/user';
import { getAIService } from '@/shared/services/ai';

export default async function RefreshAITaskPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth, please sign in" />;
  }

  const task = await findAITaskById(id);
  if (!task || !task.taskId || !task.provider || !task.status) {
    return <Empty message="Task not found" />;
  }
  if (task.userId !== user.id) {
    return <Empty message="no permission" />;
  }

  // query task
  if (
    [AITaskStatus.PENDING, AITaskStatus.PROCESSING].includes(
      task.status as AITaskStatus
    )
  ) {
    const aiService = await getAIService();
    const aiProvider = aiService.getProvider(task.provider);
    if (!aiProvider) {
      return <Empty message="Invalid AI provider" />;
    }

    const result = await aiProvider?.query?.({
      taskId: task.taskId,
      mediaType: task.mediaType,
      model: task.model,
      userId: user.id,
    });

    if (result && result.taskStatus) {
      const nextStatus = result.taskStatus;
      const nextTaskInfo = result.taskInfo ? JSON.stringify(result.taskInfo) : null;
      const nextTaskResult = result.taskResult
        ? JSON.stringify(result.taskResult)
        : null;

      const hasChanged =
        nextStatus !== task.status ||
        nextTaskInfo !== task.taskInfo ||
        nextTaskResult !== task.taskResult;

      if (hasChanged) {
        await updateAITaskById(task.id, {
          status: nextStatus,
          taskInfo: nextTaskInfo,
          taskResult: nextTaskResult,
        });
      }
    }
  }

  redirect({ href: `/activity/ai-tasks`, locale });
}
