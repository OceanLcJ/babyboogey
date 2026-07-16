'use client';

import { Check, Loader2, ShieldCheck, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/core/i18n/navigation';
import { PaymentModal } from '@/shared/blocks/payment/payment-modal';
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
  product_name: 'Single Video Credit Pack',
  title: 'Single Video',
  amount: 299,
  currency: 'USD',
  price: '$2.99',
  credits: 75,
  interval: 'one-time',
};

const STARTER_ITEM: PricingItem = {
  product_id: 'starter',
  product_name: 'Starter Credit Pack',
  title: 'Starter',
  amount: 999,
  currency: 'USD',
  price: '$9.99',
  credits: 410,
  interval: 'one-time',
};

const STANDARD_ITEM: PricingItem = {
  product_id: 'standard',
  product_name: 'Standard Credit Pack',
  title: 'Standard',
  amount: 1999,
  currency: 'USD',
  price: '$19.99',
  credits: 1170,
  interval: 'one-time',
};

const CREDIT_PACKS = [SINGLE_VIDEO_ITEM, STARTER_ITEM, STANDARD_ITEM];

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
  const { pricingItem, isLoading, productId, checkout, startPayment } =
    usePricingCheckout();

  const creditsNeeded = Math.max(0, requiredCredits - remainingCredits);
  const recommendedPack =
    CREDIT_PACKS.find((item) => Number(item.credits || 0) >= creditsNeeded) ||
    STANDARD_ITEM;
  const packCredits = Number(recommendedPack.credits || 0);
  const packPrice =
    recommendedPack.price || `$${(Number(recommendedPack.amount || 0) / 100).toFixed(2)}`;
  const creditsAfterPurchase = remainingCredits + packCredits;
  const isBuying = isLoading && productId === recommendedPack.product_id;
  const handleBuy = () => {
    onClose();
    void startPayment(recommendedPack);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>
              {t('description', {
                required: requiredCredits,
                remaining: remainingCredits,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="border-primary/20 from-primary/10 rounded-xl border bg-gradient-to-br to-amber-50/70 p-4 dark:to-amber-950/20">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-primary text-xs font-semibold tracking-wide uppercase">
                  {t('recommended')}
                </p>
                <p className="mt-1 font-semibold">
                  {t('pack_title', { credits: packCredits })}
                </p>
              </div>
              <p className="text-2xl font-bold">{packPrice}</p>
            </div>
            <div className="space-y-1.5 text-sm">
              <p className="flex items-center gap-2">
                <Check className="text-primary h-4 w-4" aria-hidden="true" />
                {t('enough_for_video', {
                  available: creditsAfterPurchase,
                  required: requiredCredits,
                })}
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck
                  className="text-primary h-4 w-4"
                  aria-hidden="true"
                />
                {t('trust_note')}
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full" onClick={handleBuy} disabled={isBuying}>
              {isBuying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              {t('cta_buy', {
                credits: packCredits,
                price: packPrice,
              })}
            </Button>
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link href="/pricing" onClick={onClose}>
                {t('cta_plans')}
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentModal
        isLoading={isLoading}
        pricingItem={pricingItem}
        onCheckout={(item, paymentProvider) => checkout(item, paymentProvider)}
      />
    </>
  );
}
