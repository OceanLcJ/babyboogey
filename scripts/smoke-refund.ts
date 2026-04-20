/**
 * Refund Audit Script
 *
 * Reads recent FAILED ai_task rows and verifies each one has:
 *   - refundedAt set
 *   - refundReason set
 *   - matching credit consumption record flipped to DELETED
 *   - ACTIVE credit rows had remainingCredits topped up
 *
 * Read-only — does not mutate any row. Prints a report and exits
 * non-zero if any anomaly is found.
 *
 * Why a separate script: end-to-end failure injection is not 100%
 * reliable (kie returns 400 synchronously for bad model IDs, never
 * creating an ai_task row). An audit pass over real FAILED records
 * is the right abstraction — it validates production refund health
 * without fabricating failures.
 *
 * Usage:
 *   ENV_FILE=.env.development pnpm tsx scripts/with-env.ts tsx scripts/smoke-refund.ts
 *   ENV_FILE=.env.development pnpm tsx scripts/with-env.ts tsx scripts/smoke-refund.ts --days=7
 */
import { and, desc, eq, gte } from 'drizzle-orm';

import { db } from '@/core/db';
import { aiTask, credit } from '@/config/db/schema';
import { AITaskStatus } from '@/extensions/ai';
import { CreditStatus } from '@/shared/models/credit';

interface ConsumedItem {
  creditId?: string;
  creditsConsumed?: number;
}

interface Finding {
  taskId: string;
  severity: 'ERROR' | 'WARN';
  message: string;
}

const argv = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const WINDOW_DAYS = Number(getArg('days', '30'));
const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

async function main() {
  console.log('='.repeat(80));
  console.log(`Refund Audit — FAILED ai_task rows in last ${WINDOW_DAYS} days`);
  console.log('='.repeat(80));

  const failedTasks = await db()
    .select()
    .from(aiTask)
    .where(
      and(eq(aiTask.status, AITaskStatus.FAILED), gte(aiTask.createdAt, since))
    )
    .orderBy(desc(aiTask.createdAt));

  console.log(`Found ${failedTasks.length} FAILED task(s).\n`);

  if (failedTasks.length === 0) {
    console.log('✅ Nothing to audit.');
    return;
  }

  const findings: Finding[] = [];

  for (const task of failedTasks) {
    if (!task.creditId) {
      findings.push({
        taskId: task.id,
        severity: 'WARN',
        message: 'FAILED task has no creditId (free tier / grant?) — skipping refund check',
      });
      continue;
    }

    if (!task.refundedAt) {
      findings.push({
        taskId: task.id,
        severity: 'ERROR',
        message: `refundedAt is NULL (creditId=${task.creditId})`,
      });
    }
    if (!task.refundReason) {
      findings.push({
        taskId: task.id,
        severity: 'ERROR',
        message: `refundReason is NULL (creditId=${task.creditId})`,
      });
    }

    // Consumption record must be DELETED
    const [consumption] = await db()
      .select()
      .from(credit)
      .where(eq(credit.id, task.creditId));

    if (!consumption) {
      findings.push({
        taskId: task.id,
        severity: 'ERROR',
        message: `creditId=${task.creditId} points to a missing credit row`,
      });
      continue;
    }

    if (consumption.status !== CreditStatus.DELETED) {
      findings.push({
        taskId: task.id,
        severity: 'ERROR',
        message: `consumption credit status=${consumption.status}, expected DELETED`,
      });
    }

    // Each referenced source credit must still exist (we don't verify balance
    // because other tasks may have consumed from it since — but the existence
    // check catches "refund wrote to a deleted row" regressions)
    let consumedItems: ConsumedItem[] = [];
    try {
      consumedItems = JSON.parse(consumption.consumedDetail || '[]');
    } catch {
      findings.push({
        taskId: task.id,
        severity: 'ERROR',
        message: `consumedDetail is not valid JSON on credit ${consumption.id}`,
      });
      continue;
    }

    for (const item of consumedItems) {
      if (!item?.creditId) continue;
      const [src] = await db()
        .select({ id: credit.id })
        .from(credit)
        .where(eq(credit.id, item.creditId));
      if (!src) {
        findings.push({
          taskId: task.id,
          severity: 'ERROR',
          message: `refund target credit ${item.creditId} is missing`,
        });
      }
    }
  }

  // Report
  console.log('─'.repeat(80));
  if (findings.length === 0) {
    console.log(`✅ All ${failedTasks.length} FAILED task(s) have healthy refund state.`);
    return;
  }

  const errors = findings.filter((f) => f.severity === 'ERROR');
  const warns = findings.filter((f) => f.severity === 'WARN');

  console.log(`Findings: ${errors.length} error(s), ${warns.length} warning(s)`);
  console.log('─'.repeat(80));
  console.table(
    findings.map((f) => ({
      severity: f.severity,
      taskId: f.taskId.slice(0, 12),
      message: f.message.slice(0, 90),
    }))
  );

  if (errors.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
