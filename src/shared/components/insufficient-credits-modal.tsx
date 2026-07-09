'use client';

import { Loader2, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/core/i18n/navigation';
import { usePricingCheckout } from '@/shared/hooks/use-pricing-checkout';
import type { PricingItem } from '@/shared/types/blocks/pricing';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

const SINGLE_VIDEO_ITEM: PricingItem = {
  product_id: 'single-video',
  title: 'Single Video',
  amount: 299,
  currency: 'USD',
  price: '$2.99',
  credits: 75,
  interval: 'one-time',
};

interface InsufficientCreditsModalProps {
  open: boolean;
  onClose: () => void;
  requiredCredits: number;
  remainingCredits: number;
}

export function InsufficientCreditsModal({
  open,
  onClose,
  requiredCredits,
  remainingCredits,
}: InsufficientCreditsModalProps) {
  const t = useTranslations('ai.video.generator.insufficient_credits_modal');
  const { isLoading, productId, checkout } = usePricingCheckout();

  const isBuying = isLoading && productId === SINGLE_VIDEO_ITEM.product_id;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { required: requiredCredits, remaining: remainingCredits })}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-primary/5 border-primary/20 rounded-lg border p-4 text-center">
          <p className="text-muted-foreground mb-1 text-xs">Single Video Pack</p>
          <p className="text-2xl font-bold">$2.99</p>
          <p className="text-muted-foreground text-sm">75 credits · never expire</p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={() => checkout(SINGLE_VIDEO_ITEM)}
            disabled={isBuying}
          >
            {isBuying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-2 h-4 w-4" />
            )}
            {t('cta_buy')}
          </Button>
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/pricing" onClick={onClose}>
              {t('cta_plans')}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
