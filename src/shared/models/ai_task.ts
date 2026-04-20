import { and, count, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { aiTask, credit } from '@/config/db/schema';
import { AITaskStatus } from '@/extensions/ai';
import { appendUserToResult, User } from '@/shared/models/user';

import { consumeCredits, CreditStatus } from './credit';

export type AITask = typeof aiTask.$inferSelect & {
  user?: User;
};
export type NewAITask = typeof aiTask.$inferInsert;
export type UpdateAITask = Partial<Omit<NewAITask, 'id' | 'createdAt'>>;

export async function createAITask(newAITask: NewAITask) {
  const result = await db().transaction(async (tx: UnsafeAny) => {
    // 1. create task record
    const [taskResult] = await tx.insert(aiTask).values(newAITask).returning();

    if (newAITask.costCredits && newAITask.costCredits > 0) {
      // 2. consume credits
      const consumedCredit = await consumeCredits({
        userId: newAITask.userId,
        credits: newAITask.costCredits,
        scene: newAITask.scene,
        description: `generate ${newAITask.mediaType}`,
        metadata: JSON.stringify({
          type: 'ai-task',
          mediaType: taskResult.mediaType,
          taskId: taskResult.id,
        }),
        tx,
      });

      // 3. update task record with consumed credit id
      if (consumedCredit && consumedCredit.id) {
        taskResult.creditId = consumedCredit.id;
        await tx
          .update(aiTask)
          .set({ creditId: consumedCredit.id })
          .where(eq(aiTask.id, taskResult.id));
      }
    }

    return taskResult;
  });

  return result;
}

export async function findAITaskById(id: string) {
  const [result] = await db().select().from(aiTask).where(eq(aiTask.id, id));
  return result;
}

export async function findAITaskByProviderTaskId({
  provider,
  taskId,
}: {
  provider: string;
  taskId: string;
}) {
  const [result] = await db()
    .select()
    .from(aiTask)
    .where(and(eq(aiTask.provider, provider), eq(aiTask.taskId, taskId)))
    .limit(1);

  return result;
}

export async function updateAITaskById(id: string, updateAITask: UpdateAITask) {
  const result = await db().transaction(async (tx: UnsafeAny) => {
    // Idempotent refund on FAILED. Two-stage pattern that works across dialects:
    //   1) SELECT the consumption record while ACTIVE — captures `consumedDetail`.
    //      On MySQL/Postgres/local SQLite, tx isolation serializes concurrent readers.
    //      On D1 the BEGIN degrades (see CLAUDE.md), so this SELECT alone is racy.
    //   2) Atomic flip UPDATE ... WHERE status = ACTIVE with RETURNING. On D1/SQLite/
    //      Postgres this returns [row] only for the winning caller; on MySQL the shim
    //      returns a synthetic payload but tx isolation already gated the SELECT so
    //      only one caller sees the ACTIVE candidate per tx.
    //   Under concurrent notify+query on D1, only the flip-winner proceeds to add
    //   credits back — preventing double-refund.
    if (updateAITask.status === AITaskStatus.FAILED && updateAITask.creditId) {
      const [candidate] = await tx
        .select()
        .from(credit)
        .where(
          and(
            eq(credit.id, updateAITask.creditId),
            eq(credit.status, CreditStatus.ACTIVE)
          )
        );

      if (candidate) {
        const flipped = await tx
          .update(credit)
          .set({ status: CreditStatus.DELETED })
          .where(
            and(
              eq(credit.id, updateAITask.creditId),
              eq(credit.status, CreditStatus.ACTIVE)
            )
          )
          .returning();

        const winner = Array.isArray(flipped) && flipped.length > 0;
        if (winner) {
          const consumedItems = JSON.parse(candidate.consumedDetail || '[]');
          await Promise.all(
            consumedItems.map((item: UnsafeAny) => {
              if (item && item.creditId && item.creditsConsumed > 0) {
                return tx
                  .update(credit)
                  .set({
                    remainingCredits: sql`${credit.remainingCredits} + ${item.creditsConsumed}`,
                  })
                  .where(eq(credit.id, item.creditId));
              }
            })
          );
          updateAITask.refundedAt = new Date();
          if (!updateAITask.refundReason) {
            updateAITask.refundReason = 'task_failed';
          }
        }
      }
    }

    // update task
    const [result] = await tx
      .update(aiTask)
      .set(updateAITask)
      .where(eq(aiTask.id, id))
      .returning();

    return result;
  });

  return result;
}

export async function getAITasksCount({
  userId,
  status,
  mediaType,
  provider,
}: {
  userId?: string;
  status?: string;
  mediaType?: string;
  provider?: string;
}): Promise<number> {
  const [result] = await db()
    .select({ count: count() })
    .from(aiTask)
    .where(
      and(
        userId ? eq(aiTask.userId, userId) : undefined,
        mediaType ? eq(aiTask.mediaType, mediaType) : undefined,
        provider ? eq(aiTask.provider, provider) : undefined,
        status ? eq(aiTask.status, status) : undefined
      )
    );

  return result?.count || 0;
}

export async function getAITaskMediaTypeCounts({
  userId,
  status,
  provider,
}: {
  userId?: string;
  status?: string;
  provider?: string;
}): Promise<Record<string, number>> {
  const result = (await db()
    .select({
      mediaType: aiTask.mediaType,
      count: count(),
    })
    .from(aiTask)
    .where(
      and(
        userId ? eq(aiTask.userId, userId) : undefined,
        provider ? eq(aiTask.provider, provider) : undefined,
        status ? eq(aiTask.status, status) : undefined
      )
    )
    .groupBy(aiTask.mediaType)) as Array<{
    mediaType: string | null;
    count: number | string | bigint;
  }>;

  const counts: Record<string, number> = {};
  for (const item of result) {
    if (!item.mediaType) {
      continue;
    }

    counts[item.mediaType] = Number(item.count || 0);
  }

  return counts;
}

export async function getAITasks({
  userId,
  status,
  mediaType,
  provider,
  page = 1,
  limit = 30,
  getUser = false,
}: {
  userId?: string;
  status?: string;
  mediaType?: string;
  provider?: string;
  page?: number;
  limit?: number;
  getUser?: boolean;
}): Promise<AITask[]> {
  const result = await db()
    .select()
    .from(aiTask)
    .where(
      and(
        userId ? eq(aiTask.userId, userId) : undefined,
        mediaType ? eq(aiTask.mediaType, mediaType) : undefined,
        provider ? eq(aiTask.provider, provider) : undefined,
        status ? eq(aiTask.status, status) : undefined
      )
    )
    .orderBy(desc(aiTask.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  if (getUser) {
    return appendUserToResult(result);
  }

  return result;
}
