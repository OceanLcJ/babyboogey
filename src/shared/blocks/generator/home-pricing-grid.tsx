'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SmartIcon } from '@/shared/blocks/common';
import { PaymentModal } from '@/shared/blocks/payment/payment-modal';
import { usePricingCheckout } from '@/shared/hooks/use-pricing-checkout';
import { cn } from '@/shared/lib/utils';
import type { PricingItem } from '@/shared/types/blocks/pricing';

export function HomePricingGrid({
  items,
  popularLabel,
}: {
  items: PricingItem[];
  popularLabel?: string;
}) {
  const t = useTranslations('pages.pricing.messages');
  const { pricingItem, isLoading, productId, checkout, startPayment } =
    usePricingCheckout();

  return (
    <>
      <div className="bb-home-price-grid">
        {items.map((item, i) => {
          const isItemLoading = isLoading && item.product_id === productId;

          return (
            <article
              key={item.product_id || i}
              className={cn(
                'bb-home-price-card',
                item.is_featured && 'featured'
              )}
              data-label={item.label || popularLabel || 'Popular'}
            >
              <p className="bb-home-price-name">{item.title}</p>
              <div className="bb-home-price-amt">
                <b>{item.price}</b>
                {item.unit && <span>{item.unit}</span>}
                {item.original_price && <s>{item.original_price}</s>}
              </div>
              {item.description && (
                <p className="bb-home-price-desc">{item.description}</p>
              )}
              {item.features && item.features.length > 0 && (
                <ul className="bb-home-price-feats">
                  {item.features.map((feature, j) => (
                    <li key={j}>{feature}</li>
                  ))}
                </ul>
              )}
              {item.button?.title && (
                <button
                  type="button"
                  onClick={() => startPayment(item)}
                  disabled={isLoading}
                  className={cn(
                    item.is_featured
                      ? 'bb-home-primary-btn'
                      : 'bb-home-ghost-btn',
                    'disabled:pointer-events-none disabled:opacity-60'
                  )}
                >
                  {isItemLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{t('processing')}</span>
                    </>
                  ) : (
                    <>
                      {item.button.icon && (
                        <SmartIcon
                          name={item.button.icon as string}
                          className="h-4 w-4"
                        />
                      )}
                      <span>{item.button.title}</span>
                    </>
                  )}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <PaymentModal
        isLoading={isLoading}
        pricingItem={pricingItem}
        onCheckout={(item, paymentProvider) => checkout(item, paymentProvider)}
      />
    </>
  );
}
