'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { toast } from 'sonner';

import { useAppContext } from '@/shared/contexts/app';
import {
  clearWatermarkAttribution,
  getWatermarkAttributionAgeMs,
  hasRecentWatermarkAttribution,
  trackAnalyticsEvent,
} from '@/shared/lib/analytics-events';
import { getCookie } from '@/shared/lib/cookie';
import type { PricingItem } from '@/shared/types/blocks/pricing';

export function usePricingCheckout() {
  const locale = useLocale();
  const { user, setIsShowSignModal, setIsShowPaymentModal, configs } =
    useAppContext();

  const [pricingItem, setPricingItem] = useState<PricingItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);

  const getAffiliateMetadata = ({
    paymentProvider,
  }: {
    paymentProvider: string;
  }) => {
    const affiliateMetadata: Record<string, string> = {};

    if (
      configs.affonso_enabled === 'true' &&
      ['stripe', 'creem'].includes(paymentProvider)
    ) {
      affiliateMetadata.affonso_referral =
        getCookie('affonso_referral') || '';
    }

    if (
      configs.promotekit_enabled === 'true' &&
      ['stripe'].includes(paymentProvider)
    ) {
      affiliateMetadata.promotekit_referral =
        typeof window !== 'undefined' &&
        (window as UnsafeAny).promotekit_referral
          ? (window as UnsafeAny).promotekit_referral
          : getCookie('promotekit_referral') || '';
    }

    return affiliateMetadata;
  };

  const checkout = async (item: PricingItem, paymentProvider?: string) => {
    try {
      if (!user) {
        setIsShowSignModal(true);
        return;
      }

      const selectedPaymentProvider = paymentProvider || '';
      const affiliateMetadata = getAffiliateMetadata({
        paymentProvider: selectedPaymentProvider,
      });
      const shouldTrackWatermarkAttribution = hasRecentWatermarkAttribution();
      const watermarkAttributionAgeMs = shouldTrackWatermarkAttribution
        ? getWatermarkAttributionAgeMs()
        : null;

      setIsLoading(true);
      setProductId(item.product_id);

      const response = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: item.product_id,
          currency: item.currency,
          locale: locale || 'en',
          payment_provider: selectedPaymentProvider,
          metadata: affiliateMetadata,
        }),
      });

      if (response.status === 401) {
        setIsLoading(false);
        setProductId(null);
        setPricingItem(null);
        setIsShowSignModal(true);
        return;
      }

      if (!response.ok) {
        throw new Error(`request failed with status ${response.status}`);
      }

      const { code, message, data } = await response.json();
      if (code !== 0) {
        throw new Error(message);
      }

      const { checkoutUrl } = data;
      if (!checkoutUrl) {
        throw new Error('checkout url not found');
      }

      if (shouldTrackWatermarkAttribution) {
        trackAnalyticsEvent('upgrade_from_watermark', {
          product_id: item.product_id,
          currency: item.currency,
          payment_provider: selectedPaymentProvider,
          attribution_age_ms: watermarkAttributionAgeMs ?? undefined,
        });
        clearWatermarkAttribution();
      }

      window.location.href = checkoutUrl;
    } catch (e: UnsafeAny) {
      console.log('checkout failed: ', e);
      toast.error('checkout failed: ' + e.message);

      setIsLoading(false);
      setProductId(null);
    }
  };

  const startPayment = async (item: PricingItem) => {
    if (!user) {
      setIsShowSignModal(true);
      return;
    }

    if (configs.select_payment_enabled === 'true') {
      setPricingItem(item);
      setIsShowPaymentModal(true);
      return;
    }

    await checkout(item, configs.default_payment_provider);
  };

  return {
    pricingItem,
    isLoading,
    productId,
    checkout,
    startPayment,
  };
}
