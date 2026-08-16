'use client';

import { useEffect } from 'react';

import { trackAnalyticsEvent } from '@/shared/lib/analytics-events';

const PAYMENT_QUERY_KEYS = [
  'payment_status',
  'payment_order',
  'payment_product',
  'payment_value',
  'payment_currency',
] as const;

export function PaymentReturnTracker() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const paymentStatus = url.searchParams.get('payment_status');
    if (paymentStatus !== 'success' && paymentStatus !== 'cancelled') {
      return;
    }

    const transactionId = url.searchParams.get('payment_order') || '';
    const productId = url.searchParams.get('payment_product') || '';
    const currency = (
      url.searchParams.get('payment_currency') || 'USD'
    ).toUpperCase();
    const value = Number(url.searchParams.get('payment_value') || 0);
    const dedupeKey = `bb_${paymentStatus}_${transactionId || productId}`;
    let alreadyTracked = false;

    try {
      alreadyTracked =
        Boolean(transactionId) && sessionStorage.getItem(dedupeKey) === '1';
    } catch {
      // Tracking should still work when sessionStorage is unavailable.
    }

    if (!alreadyTracked) {
      const properties = {
        transaction_id: transactionId || undefined,
        currency,
        value: Number.isFinite(value) ? value : 0,
        items: productId
          ? [
              {
                item_id: productId,
                quantity: 1,
              },
            ]
          : undefined,
      };

      if (paymentStatus === 'success') {
        trackAnalyticsEvent('purchase', properties);
        trackAnalyticsEvent('checkout_completed', properties);
      } else {
        trackAnalyticsEvent('checkout_cancelled', properties);
      }

      if (transactionId) {
        try {
          sessionStorage.setItem(dedupeKey, '1');
        } catch {
          // The query parameters are removed below to prevent refresh repeats.
        }
      }
    }

    for (const key of PAYMENT_QUERY_KEYS) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, '', url.toString());
  }, []);

  return null;
}
