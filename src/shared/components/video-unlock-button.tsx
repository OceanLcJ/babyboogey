'use client';

import { useState, type ComponentProps } from 'react';
import { Loader2, LockKeyhole } from 'lucide-react';
import { useLocale } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

type ButtonVariant = ComponentProps<typeof Button>['variant'];
type ButtonSize = ComponentProps<typeof Button>['size'];

export function VideoUnlockButton({
  taskId,
  assetId,
  productId,
  label,
  processingLabel,
  errorLabel,
  className,
  variant = 'default',
  size = 'sm',
  onStart,
}: {
  taskId: string;
  assetId: string;
  productId: string;
  label: string;
  processingLabel: string;
  errorLabel: string;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onStart?: () => void;
}) {
  const locale = useLocale();
  const [isLoading, setIsLoading] = useState(false);

  const handleUnlock = async () => {
    if (isLoading) {
      return;
    }

    try {
      setIsLoading(true);
      onStart?.();

      const response = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: productId,
          task_id: taskId,
          asset_id: assetId,
          locale,
        }),
      });

      if (!response.ok) {
        throw new Error(`request failed with status ${response.status}`);
      }

      const { code, message, data } = await response.json();
      if (code !== 0) {
        throw new Error(message || errorLabel);
      }

      if (!data?.checkoutUrl) {
        throw new Error('checkout url not found');
      }

      window.location.href = data.checkoutUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : errorLabel;
      toast.error(`${errorLabel}: ${message}`);
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn('gap-1.5', className)}
      onClick={handleUnlock}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <LockKeyhole className="h-3.5 w-3.5" />
      )}
      {isLoading ? processingLabel : label}
    </Button>
  );
}
