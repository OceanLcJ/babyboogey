'use client';

import { useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/shared/components/ui/button';

export function AdminPaymentRefundButton({
  orderNo,
  disabled,
  label,
  confirmMessage,
  reasonPrompt,
  successMessage,
}: {
  orderNo: string;
  disabled?: boolean;
  label: string;
  confirmMessage: string;
  reasonPrompt: string;
  successMessage: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleRefund = async () => {
    if (disabled || loading) return;
    if (!window.confirm(confirmMessage)) return;

    const reason = window.prompt(reasonPrompt) || '';
    setLoading(true);
    try {
      const response = await fetch('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNo, reason }),
      });
      const result = await response.json();
      if (!response.ok || result.code !== 0) {
        throw new Error(result.message || 'refund failed');
      }
      toast.success(successMessage);
      window.location.reload();
    } catch (error: UnsafeAny) {
      toast.error(error.message || 'refund failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled || loading}
      onClick={handleRefund}
    >
      <RefreshCcw />
      {label}
    </Button>
  );
}
