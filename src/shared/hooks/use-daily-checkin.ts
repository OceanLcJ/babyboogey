'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { useAppContext } from '@/shared/contexts/app';

const STORAGE_KEY = 'babyboogey_checkin';

export function useDailyCheckin() {
  const { user, fetchUserCredits } = useAppContext();
  const attempted = useRef(false);

  useEffect(() => {
    if (!user?.id || attempted.current) return;

    const today = new Date().toISOString().slice(0, 10);
    const lastCheckin =
      typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (lastCheckin === today) return;

    attempted.current = true;

    fetch('/api/user/checkin', { method: 'POST' })
      .then((r) => r.json())
      .then((res) => {
        if (res.code !== 0) return;
        localStorage.setItem(STORAGE_KEY, today);
        if (!res.data.alreadyClaimed) {
          toast.success(`+${res.data.credits} credits — daily check-in!`);
          fetchUserCredits();
        }
      })
      .catch(() => {});
  }, [user?.id, fetchUserCredits]);
}
