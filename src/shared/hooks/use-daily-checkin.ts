'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useAppContext } from '@/shared/contexts/app';

const STORAGE_KEY_PREFIX = 'babyboogey_checkin';

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getStorageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export function useDailyCheckin() {
  const t = useTranslations('common.sign');
  const { user, fetchUserCredits } = useAppContext();
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimedToday, setHasClaimedToday] = useState(false);

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') {
      setHasClaimedToday(false);
      return;
    }

    setHasClaimedToday(
      localStorage.getItem(getStorageKey(user.id)) === getTodayKey()
    );
  }, [user?.id]);

  const markClaimedToday = useCallback(() => {
    if (!user?.id || typeof window === 'undefined') {
      return;
    }

    localStorage.setItem(getStorageKey(user.id), getTodayKey());
    setHasClaimedToday(true);
  }, [user?.id]);

  const claimDailyCheckin = useCallback(async () => {
    if (!user?.id || isClaiming) {
      return null;
    }

    if (hasClaimedToday) {
      toast(t('daily_checkin_already_claimed'));
      return { alreadyClaimed: true, credits: 0 };
    }

    setIsClaiming(true);

    try {
      const response = await fetch('/api/user/checkin', { method: 'POST' });
      const res = await response.json();

      if (!response.ok || res.code !== 0) {
        throw new Error(res.message || t('daily_checkin_error'));
      }

      markClaimedToday();

      if (res.data?.alreadyClaimed) {
        toast(t('daily_checkin_already_claimed'));
      } else {
        toast.success(
          t('daily_checkin_success', {
            credits: res.data?.credits || 0,
            day: res.data?.cycleDay || 1,
          })
        );
        void fetchUserCredits();
      }

      return res.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('daily_checkin_error');
      toast.error(message);
      return null;
    } finally {
      setIsClaiming(false);
    }
  }, [
    user?.id,
    isClaiming,
    hasClaimedToday,
    t,
    markClaimedToday,
    fetchUserCredits,
  ]);

  return {
    claimDailyCheckin,
    isClaiming,
    canClaim: Boolean(user?.id) && !hasClaimedToday,
    hasClaimedToday,
  };
}
