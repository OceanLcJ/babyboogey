'use client';

import { Gift, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DropdownMenuItem } from '@/shared/components/ui/dropdown-menu';
import { useDailyCheckin } from '@/shared/hooks/use-daily-checkin';

export function DailyCheckinMenuItem() {
  const t = useTranslations('common.sign');
  const {
    claimDailyCheckin,
    isClaiming,
    canClaim,
    hasClaimedToday,
  } = useDailyCheckin();
  const disabled = isClaiming || !canClaim;

  return (
    <DropdownMenuItem
      className="w-full cursor-pointer"
      disabled={disabled}
      onSelect={(event) => {
        event.preventDefault();
        if (disabled) {
          return;
        }

        void claimDailyCheckin();
      }}
    >
      {isClaiming ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Gift className="h-4 w-4" />
      )}
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="truncate">
          {isClaiming
            ? t('daily_checkin_claiming')
            : hasClaimedToday
              ? t('daily_checkin_claimed')
              : t('daily_checkin_title')}
        </span>
        {!hasClaimedToday && (
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            {t('daily_checkin_reward_hint')}
          </span>
        )}
      </span>
    </DropdownMenuItem>
  );
}
