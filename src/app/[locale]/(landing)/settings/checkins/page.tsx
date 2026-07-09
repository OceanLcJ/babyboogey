import { CalendarDays, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/core/i18n/navigation';
import { Empty } from '@/shared/blocks/common';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';
import {
  CHECKIN_REWARD_SCHEDULE,
  CreditTransactionScene,
  getCredits,
  type Credit,
} from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';

type CalendarCell = {
  dateKey: string;
  day: number;
};

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeMonthKey(month?: string) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    return month;
  }

  return todayDateKey().slice(0, 7);
}

function addMonths(monthKey: string, amount: number) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}`;
}

function formatMonthTitle(monthKey: string, locale: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function buildMonthCells(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cells: Array<CalendarCell | null> = Array.from(
    { length: firstWeekday },
    () => null
  );

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      dateKey: `${monthKey}-${String(day).padStart(2, '0')}`,
      day,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function getCheckinDateKey(item: Credit) {
  const transactionDate = item.transactionNo?.match(
    /^checkin:[^:]+:(\d{4}-\d{2}-\d{2})$/
  )?.[1];
  if (transactionDate) return transactionDate;

  if (item.metadata) {
    try {
      const metadata = JSON.parse(item.metadata);
      if (typeof metadata.date === 'string') return metadata.date;
    } catch {
      // Ignore malformed legacy metadata and fall back to createdAt.
    }
  }

  return item.createdAt
    ? new Date(item.createdAt).toISOString().slice(0, 10)
    : '';
}

export default async function CheckinsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const [{ locale }, { month }] = await Promise.all([params, searchParams]);
  const monthKey = normalizeMonthKey(month);
  const currentDateKey = todayDateKey();

  const [user, t] = await Promise.all([
    getUserInfo(),
    getTranslations('settings.checkins'),
  ]);
  if (!user) {
    return <Empty message="no auth" />;
  }

  const baseQuery = {
    userId: user.id,
    transactionScene: CreditTransactionScene.CHECKIN,
  };
  const monthQuery = {
    ...baseQuery,
    transactionNoPrefix: `checkin:${user.id}:${monthKey}`,
  };

  const monthCheckins = await getCredits({
    ...monthQuery,
    page: 1,
    limit: 31,
  });

  const checkinsByDateKey = new Map<string, Credit>();
  for (const item of monthCheckins) {
    const dateKey = getCheckinDateKey(item);
    if (dateKey) {
      checkinsByDateKey.set(dateKey, item);
    }
  }

  const checkedDateKeys = new Set(checkinsByDateKey.keys());
  const checkedDaysCount = checkedDateKeys.size;
  const monthCredits = monthCheckins.reduce(
    (sum, item) => sum + Number(item.credits || 0),
    0
  );
  const isTodayInMonth = currentDateKey.startsWith(monthKey);
  const isTodayChecked = checkedDateKeys.has(currentDateKey);
  const weekdays = t.raw('calendar.weekdays') as string[];
  const calendarCells = buildMonthCells(monthKey);
  const minRewardCredits = CHECKIN_REWARD_SCHEDULE[0];
  const maxRewardCredits =
    CHECKIN_REWARD_SCHEDULE[CHECKIN_REWARD_SCHEDULE.length - 1];

  return (
    <Card className="border-border/60 gap-4 overflow-hidden py-4 sm:py-5">
      <CardHeader className="border-border/50 gap-4 border-b px-4 pb-4 sm:px-5 sm:pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md sm:size-10">
              <CalendarDays className="size-4 sm:size-5" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <CardTitle className="text-lg sm:text-xl">
                {t('calendar.title')}
              </CardTitle>
              <p className="text-muted-foreground max-w-2xl text-xs leading-relaxed sm:text-sm">
                {t('calendar.description')}
              </p>
            </div>
          </div>

          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
            <Button variant="outline" size="icon-sm" asChild>
              <Link
                href={`/settings/checkins?month=${addMonths(monthKey, -1)}`}
                aria-label={t('calendar.previous_month')}
              >
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
            <div className="border-border/60 bg-background min-w-0 flex-1 rounded-md border px-3 py-1.5 text-center text-xs font-medium sm:min-w-36 sm:flex-none sm:text-sm">
              {formatMonthTitle(monthKey, locale)}
            </div>
            <Button variant="outline" size="icon-sm" asChild>
              <Link
                href={`/settings/checkins?month=${addMonths(monthKey, 1)}`}
                aria-label={t('calendar.next_month')}
              >
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/40 rounded-md px-3 py-2">
            <div className="text-muted-foreground text-[11px] leading-tight font-medium">
              {t('calendar.month_checked')}
            </div>
            <div className="text-foreground mt-1 text-lg font-semibold sm:text-xl">
              {checkedDaysCount}
            </div>
          </div>
          <div className="bg-muted/40 rounded-md px-3 py-2">
            <div className="text-muted-foreground text-[11px] leading-tight font-medium">
              {t('calendar.month_credits')}
            </div>
            <div className="text-foreground mt-1 text-lg font-semibold sm:text-xl">
              {monthCredits}
            </div>
          </div>
          <div className="bg-muted/40 rounded-md px-3 py-2">
            <div className="text-muted-foreground text-[11px] leading-tight font-medium">
              {t('calendar.today_status')}
            </div>
            <div className="mt-1">
              <Badge
                variant={isTodayChecked ? 'default' : 'outline'}
                className="h-6 px-1.5 text-[11px] sm:px-2"
              >
                {isTodayChecked
                  ? t('calendar.today_checked')
                  : t('calendar.today_pending')}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
        <div className="mx-auto w-full max-w-2xl space-y-2.5">
          <div className="text-muted-foreground grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold sm:gap-2 sm:text-xs">
            {weekdays.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {calendarCells.map((cell, idx) => {
              if (!cell) {
                return <div key={`empty-${idx}`} className="aspect-square" />;
              }

              const checkin = checkinsByDateKey.get(cell.dateKey);
              const isChecked = Boolean(checkin);
              const isToday = cell.dateKey === currentDateKey;
              const rewardCredits = Number(checkin?.credits || 0);

              return (
                <div
                  key={cell.dateKey}
                  className={cn(
                    'relative flex aspect-square min-h-9 items-center justify-center rounded-md border text-xs transition-colors sm:min-h-12 sm:text-sm md:min-h-14',
                    isChecked
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border/60 bg-muted/20 text-foreground',
                    !isChecked && isToday
                      ? 'border-primary/70 bg-primary/5'
                      : null
                  )}
                >
                  <span className="absolute top-1 left-1 text-[10px] leading-none font-medium sm:top-1.5 sm:left-1.5 sm:text-xs">
                    {cell.day}
                  </span>

                  {isChecked ? (
                    <>
                      <Check className="size-4 sm:size-5" />
                      <span className="sr-only">{t('calendar.checked')}</span>
                      <span className="absolute right-1 bottom-1 text-[10px] leading-none font-semibold sm:right-1.5 sm:bottom-1.5 sm:text-xs">
                        +{rewardCredits}
                      </span>
                    </>
                  ) : isToday ? (
                    <span className="text-primary text-[10px] font-semibold sm:text-xs">
                      {t('calendar.today')}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-border/60 bg-muted/30 rounded-md border p-2.5">
          <div className="text-muted-foreground mb-2 text-[11px] font-medium sm:text-xs">
            {t('calendar.streak_cycle')}
          </div>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {CHECKIN_REWARD_SCHEDULE.map((credits, index) => (
              <div
                key={`${index}-${credits}`}
                className="bg-background/70 flex min-h-11 flex-col items-center justify-center rounded-md border px-1 py-1 text-center"
              >
                <span className="text-muted-foreground text-[10px] leading-none">
                  {t('calendar.day_short', { day: index + 1 })}
                </span>
                <span className="text-foreground mt-1 text-xs leading-none font-semibold sm:text-sm">
                  +{credits}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-muted-foreground flex flex-col gap-2 text-[11px] sm:flex-row sm:items-center sm:justify-between sm:text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="inline-flex items-center gap-2">
              <span className="bg-primary size-2.5 rounded-sm" />
              {t('calendar.legend_checked')}
            </span>
            {isTodayInMonth && (
              <span className="inline-flex items-center gap-2">
                <span className="border-primary/70 bg-primary/5 size-2.5 rounded-sm border" />
                {t('calendar.legend_today')}
              </span>
            )}
          </div>
          <span>
            {t('calendar.reward', {
              max: maxRewardCredits,
              min: minRewardCredits,
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
