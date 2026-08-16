'use client';

import { Check, Loader2, ShieldCheck, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/core/i18n/navigation';
import { PaymentModal } from '@/shared/blocks/payment/payment-modal';
import { useAppContext } from '@/shared/contexts/app';
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

type SubscriptionPlanItem = PricingItem & {
  planKey: 'starter' | 'standard' | 'premium';
  monthlyEquivalent?: string;
};

// Keep these product snapshots aligned with the server-owned pricing locale
// files. Checkout resolves product_id against server pricing, so these client
// values are display-only and cannot change the amount charged.
const MONTHLY_SUBSCRIPTIONS: SubscriptionPlanItem[] = [
  {
    product_id: 'starter-monthly',
    product_name: 'Starter Monthly',
    plan_name: 'Starter',
    planKey: 'starter',
    title: 'Starter',
    amount: 999,
    currency: 'USD',
    price: '$9.99/mo',
    credits: 430,
    valid_days: 30,
    interval: 'month',
  },
  {
    product_id: 'standard-monthly',
    product_name: 'Standard Monthly',
    plan_name: 'Standard',
    planKey: 'standard',
    title: 'Standard',
    amount: 1899,
    currency: 'USD',
    price: '$18.99/mo',
    credits: 1170,
    valid_days: 30,
    interval: 'month',
  },
  {
    product_id: 'premium-monthly',
    product_name: 'Premium Monthly',
    plan_name: 'Premium',
    planKey: 'premium',
    title: 'Premium',
    amount: 3599,
    currency: 'USD',
    price: '$35.99/mo',
    credits: 2880,
    valid_days: 30,
    interval: 'month',
  },
];

const YEARLY_SUBSCRIPTIONS: SubscriptionPlanItem[] = [
  {
    product_id: 'starter-yearly',
    product_name: 'Starter Yearly',
    plan_name: 'Starter',
    planKey: 'starter',
    title: 'Starter',
    amount: 8388,
    currency: 'USD',
    price: '$83.88/year',
    monthlyEquivalent: '$6.99/mo',
    credits: 5160,
    valid_days: 365,
    interval: 'year',
  },
  {
    product_id: 'standard-yearly',
    product_name: 'Standard Yearly',
    plan_name: 'Standard',
    planKey: 'standard',
    title: 'Standard',
    amount: 15948,
    currency: 'USD',
    price: '$159.48/year',
    monthlyEquivalent: '$13.29/mo',
    credits: 14040,
    valid_days: 365,
    interval: 'year',
  },
  {
    product_id: 'premium-yearly',
    product_name: 'Premium Yearly',
    plan_name: 'Premium',
    planKey: 'premium',
    title: 'Premium',
    amount: 30228,
    currency: 'USD',
    price: '$302.28/year',
    monthlyEquivalent: '$25.19/mo',
    credits: 34560,
    valid_days: 365,
    interval: 'year',
  },
];

const ALL_SUBSCRIPTIONS = [
  ...MONTHLY_SUBSCRIPTIONS,
  ...YEARLY_SUBSCRIPTIONS,
];

const CREDIT_PACKS: PricingItem[] = [
  {
    product_id: 'single-video',
    product_name: 'Single Video Credit Pack',
    title: 'Single Video',
    amount: 599,
    currency: 'USD',
    price: '$5.99',
    credits: 150,
    interval: 'one-time',
  },
  {
    product_id: 'starter',
    product_name: 'Starter Credit Pack',
    title: 'Starter',
    amount: 1499,
    currency: 'USD',
    price: '$14.99',
    credits: 410,
    interval: 'one-time',
  },
  {
    product_id: 'standard',
    product_name: 'Standard Credit Pack',
    title: 'Standard',
    amount: 2999,
    currency: 'USD',
    price: '$29.99',
    credits: 1170,
    interval: 'one-time',
  },
  {
    product_id: 'premium',
    product_name: 'Premium Credit Pack',
    title: 'Premium',
    amount: 5999,
    currency: 'USD',
    price: '$59.99',
    credits: 3040,
    interval: 'one-time',
  },
];

function recommendSubscription({
  creditsNeeded,
  hasSubscription,
  currentProductId,
  preferredInterval,
}: {
  creditsNeeded: number;
  hasSubscription: boolean;
  currentProductId?: string | null;
  preferredInterval: 'month' | 'year';
}) {
  const preferredPlans =
    preferredInterval === 'year'
      ? YEARLY_SUBSCRIPTIONS
      : MONTHLY_SUBSCRIPTIONS;

  if (!hasSubscription) {
    return (
      preferredPlans.find(
        (item) => Number(item.credits || 0) >= creditsNeeded
      ) || null
    );
  }

  const currentPlan = ALL_SUBSCRIPTIONS.find(
    (item) => item.product_id === currentProductId
  );
  if (!currentPlan) {
    return null;
  }

  const currentCredits = Number(currentPlan.credits || 0);
  const plans =
    currentPlan.interval === 'year'
      ? YEARLY_SUBSCRIPTIONS
      : preferredPlans;
  const currentPlanIndex = plans.findIndex(
    (item) => item.planKey === currentPlan.planKey
  );
  const eligiblePlans =
    preferredInterval === 'year' && currentPlan.interval === 'month'
      ? plans.slice(Math.max(0, currentPlanIndex))
      : plans;

  return (
    eligiblePlans.find(
      (item) =>
        Number(item.credits || 0) > currentCredits &&
        Number(item.credits || 0) - currentCredits >= creditsNeeded
    ) || null
  );
}

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
  const { user } = useAppContext();
  const { pricingItem, isLoading, productId, checkout, startPayment } =
    usePricingCheckout();

  const creditsNeeded = Math.max(0, requiredCredits - remainingCredits);
  const hasSubscription = Boolean(user?.membership?.hasSubscription);
  const currentProductId = user?.membership?.subscription?.productId;
  const currentPlan = ALL_SUBSCRIPTIONS.find(
    (item) => item.product_id === currentProductId
  );

  const recommendedPlan = recommendSubscription({
    creditsNeeded,
    hasSubscription,
    currentProductId,
    preferredInterval: 'month',
  });
  const currentPlanGroup =
    currentPlan?.interval === 'year'
      ? YEARLY_SUBSCRIPTIONS
      : MONTHLY_SUBSCRIPTIONS;
  const isHighestSubscription = Boolean(
    currentPlan &&
      currentPlanGroup.at(-1)?.product_id === currentPlan.product_id
  );
  const recommendedPack = !recommendedPlan && isHighestSubscription
    ? CREDIT_PACKS.find(
        (item) => Number(item.credits || 0) >= creditsNeeded
      ) || null
    : null;
  const recommendedItem = recommendedPlan || recommendedPack;
  const itemCredits = Number(recommendedItem?.credits || 0);
  const grantedCredits = recommendedPack
    ? itemCredits
    : hasSubscription
      ? Math.max(0, itemCredits - Number(currentPlan?.credits || 0))
      : itemCredits;
  const itemPrice = recommendedItem?.price || '';
  const monthlyEquivalent = recommendedPlan?.monthlyEquivalent || '';
  const creditsAfterPurchase = remainingCredits + grantedCredits;
  const isBuying = isLoading && productId === recommendedItem?.product_id;
  const pricingGroup = recommendedPack
    ? 'credits'
    : (recommendedPlan || currentPlan)?.interval === 'year'
      ? 'yearly'
      : 'monthly';
  const localizedPlanName = recommendedPlan
    ? recommendedPlan.planKey === 'starter'
      ? t('plans.starter')
      : recommendedPlan.planKey === 'standard'
        ? t('plans.standard')
        : t('plans.premium')
    : '';

  const handleBuy = () => {
    if (!recommendedItem) return;
    onClose();
    void startPayment(recommendedItem);
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

          {recommendedItem ? (
            <div className="border-primary/20 from-primary/10 rounded-xl border bg-gradient-to-br to-amber-50/70 p-4 dark:to-amber-950/20">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-primary text-xs font-semibold tracking-wide uppercase">
                    {recommendedPack
                      ? t('pack_recommended')
                      : recommendedPlan?.interval === 'year'
                        ? t('annual_recommended')
                        : t('recommended')}
                  </p>
                  <p className="mt-1 font-semibold">
                    {recommendedPack
                      ? t('pack_title', { credits: itemCredits })
                      : t('plan_title', { plan: localizedPlanName })}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {recommendedPack
                      ? t('pack_subtitle')
                      : t('plan_credits', {
                          credits: itemCredits,
                          period:
                            recommendedPlan?.interval === 'year'
                              ? t('period_year')
                              : t('period_month'),
                        })}
                  </p>
                </div>
                <p className="text-2xl font-bold">{itemPrice}</p>
              </div>
              <div className="space-y-1.5 text-sm">
                <p className="flex items-center gap-2">
                  <Check className="text-primary h-4 w-4" aria-hidden="true" />
                  {recommendedPack
                    ? t('pack_enough_for_video', {
                        available: creditsAfterPurchase,
                        required: requiredCredits,
                      })
                    : t('enough_for_video', {
                        available: creditsAfterPurchase,
                        required: requiredCredits,
                      })}
                </p>
                <p className="flex items-center gap-2">
                  <ShieldCheck
                    className="text-primary h-4 w-4"
                    aria-hidden="true"
                  />
                  {recommendedPack ? t('pack_trust_note') : t('trust_note')}
                </p>
              </div>
            </div>
          ) : (
            <div className="border-primary/20 bg-primary/5 rounded-xl border p-4 text-sm">
              <p className="font-semibold">{t('manage_title')}</p>
              <p className="text-muted-foreground mt-1">
                {t('manage_description')}
              </p>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {recommendedItem ? (
              <>
                <Button
                  className="w-full"
                  onClick={handleBuy}
                  disabled={isBuying}
                >
                  {isBuying ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="mr-2 h-4 w-4" />
                  )}
                  {recommendedPack
                    ? t('cta_buy_pack', {
                        credits: itemCredits,
                        price: itemPrice,
                      })
                    : hasSubscription
                      ? t('cta_upgrade', { plan: localizedPlanName })
                      : t('cta_subscribe', {
                          plan: localizedPlanName,
                          price: itemPrice,
                        })}
                </Button>
                {recommendedPlan?.interval === 'year' &&
                  monthlyEquivalent && (
                    <p className="text-muted-foreground -mt-1 text-center text-xs">
                      {t('annual_billing_note', { price: monthlyEquivalent })}
                    </p>
                  )}
              </>
            ) : (
              <Button className="w-full" asChild>
                <Link href="/settings/billing" onClick={onClose}>
                  {t('cta_manage')}
                </Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link
                href={`/pricing?group=${pricingGroup}`}
                onClick={onClose}
              >
                {recommendedPack ? t('cta_packs') : t('cta_plans')}
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
