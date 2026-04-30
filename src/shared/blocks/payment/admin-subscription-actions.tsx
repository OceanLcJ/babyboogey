'use client';

import { useState } from 'react';
import { Ban, CalendarClock, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/shared/components/ui/button';

type SubscriptionAction = 'cancel' | 'refund_cancel_now' | 'cancel_at_period_end';

const actionIcons = {
  cancel: Ban,
  refund_cancel_now: RotateCcw,
  cancel_at_period_end: CalendarClock,
};

export function AdminSubscriptionActions({
  subscriptionNo,
  disabled,
  labels,
  confirmMessages,
  reasonPrompt,
  successMessage,
}: {
  subscriptionNo: string;
  disabled?: boolean;
  labels: Record<SubscriptionAction, string>;
  confirmMessages: Record<SubscriptionAction, string>;
  reasonPrompt: string;
  successMessage: string;
}) {
  const [loadingAction, setLoadingAction] = useState<SubscriptionAction | null>(
    null
  );

  const runAction = async (action: SubscriptionAction) => {
    if (disabled || loadingAction) return;
    if (!window.confirm(confirmMessages[action])) return;

    const reason = window.prompt(reasonPrompt) || '';
    setLoadingAction(action);
    try {
      const response = await fetch('/api/admin/subscriptions/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionNo, action, reason }),
      });
      const result = await response.json();
      if (!response.ok || result.code !== 0) {
        throw new Error(result.message || 'subscription action failed');
      }
      toast.success(successMessage);
      window.location.reload();
    } catch (error: UnsafeAny) {
      toast.error(error.message || 'subscription action failed');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(labels) as SubscriptionAction[]).map((action) => {
        const Icon = actionIcons[action];
        return (
          <Button
            key={action}
            type="button"
            size="sm"
            variant={action === 'refund_cancel_now' ? 'destructive' : 'outline'}
            disabled={disabled || Boolean(loadingAction)}
            onClick={() => runAction(action)}
          >
            <Icon />
            {labels[action]}
          </Button>
        );
      })}
    </div>
  );
}
