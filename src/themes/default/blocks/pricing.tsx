'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { useLocale, useTranslations } from 'next-intl';

import { PaymentModal } from '@/shared/blocks/payment/payment-modal';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { useAppContext } from '@/shared/contexts/app';
import { usePricingCheckout } from '@/shared/hooks/use-pricing-checkout';
import { cn } from '@/shared/lib/utils';
import { Subscription } from '@/shared/models/subscription';
import {
  PricingCurrency,
  PricingItem,
  Pricing as PricingType,
} from '@/shared/types/blocks/pricing';

// Helper function to get all available currencies from a pricing item
function getCurrenciesFromItem(item: PricingItem | null): PricingCurrency[] {
  if (!item) return [];

  // Always include the default currency first
  const defaultCurrency: PricingCurrency = {
    currency: item.currency,
    amount: item.amount,
    price: item.price || '',
    original_price: item.original_price || '',
  };

  // Add additional currencies if available
  if (item.currencies && item.currencies.length > 0) {
    return [defaultCurrency, ...item.currencies];
  }

  return [defaultCurrency];
}

// Helper function to select initial currency based on locale
function getInitialCurrency(
  currencies: PricingCurrency[],
  locale: string,
  defaultCurrency: string
): string {
  if (currencies.length === 0) return defaultCurrency;

  // If locale is 'zh', prefer CNY
  if (locale === 'zh') {
    const cnyCurrency = currencies.find(
      (c) => c.currency.toLowerCase() === 'cny'
    );
    if (cnyCurrency) {
      return cnyCurrency.currency;
    }
  }

  // Otherwise return default currency
  return defaultCurrency;
}

function resolveDefaultGroup({
  items,
  groups,
  currentProductId,
}: {
  items: PricingItem[];
  groups?: PricingType['groups'];
  currentProductId?: string | null;
}): string {
  if (!items.length) return '';

  const currentItem = currentProductId
    ? items.find((i) => i.product_id === currentProductId)
    : undefined;
  const featuredGroup = groups?.find((g) => g.is_featured);

  return (
    currentItem?.group ||
    featuredGroup?.name ||
    groups?.[0]?.name ||
    items[0]?.group ||
    ''
  );
}

function PricingCardGrid({
  items,
  itemCurrencies,
  handlePayment,
  isLoading,
  activeProductId,
  processingText,
  currentPlanText,
  currentSubscription,
}: {
  items: PricingItem[];
  itemCurrencies: Record<string, { selectedCurrency: string; displayedItem: PricingItem }>;
  handlePayment: (item: PricingItem) => void;
  isLoading: boolean;
  activeProductId: string | undefined;
  processingText: string;
  currentPlanText: string;
  currentSubscription?: Subscription;
}) {
  const svPerCr = useMemo(() => {
    const sv = items.find((i) => i.product_id === 'single-video');
    if (!sv?.credits || !sv.amount) return 0;
    return sv.amount / 100 / sv.credits;
  }, [items]);

  const gridClass =
    items.length <= 3 ? 'bb-credit-grid bb-credit-grid--3' : 'bb-credit-grid';

  return (
    <div className={cn(gridClass, 'mx-auto w-full')}>
      {items.map((item) => {
        const displayedItem = itemCurrencies[item.product_id]?.displayedItem || item;
        const isSubscription = item.interval !== 'one-time';
        const rawCredits = item.credits ?? 0;
        const displayCredits =
          item.interval === 'year' ? Math.round(rawCredits / 12) : rawCredits;
        const creditUnit = isSubscription ? 'credits/mo' : 'credits';

        const dollarAmt = displayedItem.amount / 100;
        const perCreditCents = rawCredits > 0 ? (dollarAmt / rawCredits) * 100 : 0;

        let savingsPct = 0;
        if (displayedItem.original_price) {
          const origNum = parseFloat(
            displayedItem.original_price.replace(/[^0-9.]/g, '')
          );
          if (origNum > dollarAmt)
            savingsPct = Math.round((1 - dollarAmt / origNum) * 100);
        }

        const cheaperPct =
          !isSubscription &&
          item.product_id !== 'single-video' &&
          svPerCr > 0 &&
          perCreditCents > 0
            ? Math.round((1 - dollarAmt / rawCredits / svPerCr) * 100)
            : 0;

        const isCurrentPlan =
          !!currentSubscription &&
          currentSubscription.productId === item.product_id;

        return (
          <div
            key={item.product_id}
            className={cn(
              'bb-credit-card',
              item.is_featured && 'bb-credit-card--featured'
            )}
            data-label={item.label}
          >
            <div className="bb-credit-count">{displayCredits.toLocaleString()}</div>
            <div className="bb-credit-unit">{creditUnit}</div>

            {perCreditCents > 0 && (
              <div className="bb-credit-per">
                {perCreditCents.toFixed(1)}¢<span>/cr</span>
                {cheaperPct > 0 && (
                  <span className="bb-credit-cheaper">{cheaperPct}% cheaper</span>
                )}
              </div>
            )}

            <div className="bb-credit-price-row">
              <span className="bb-credit-price">{displayedItem.price}</span>
              {displayedItem.unit && (
                <span className="bb-credit-period">{displayedItem.unit}</span>
              )}
              {displayedItem.original_price && (
                <span className="bb-credit-orig">{displayedItem.original_price}</span>
              )}
              {savingsPct > 0 && (
                <span className="bb-credit-save">Save {savingsPct}%</span>
              )}
            </div>

            <div className="bb-credit-name">{item.title}</div>
            {item.description && (
              <div className="bb-credit-desc">{item.description}</div>
            )}

            {item.features && item.features.length > 0 && (
              <>
                <hr className="bb-credit-divider" />
                <ul className="bb-credit-feats">
                  {item.features.map((feat, i) => (
                    <li key={i}>{feat}</li>
                  ))}
                </ul>
              </>
            )}

            {isCurrentPlan ? (
              <Button variant="outline" className="mt-auto w-full" disabled>
                <span>{currentPlanText}</span>
              </Button>
            ) : (
              <Button
                onClick={() => handlePayment(item)}
                disabled={isLoading}
                variant={item.is_featured ? 'default' : 'outline'}
                className={cn(
                  'mt-auto w-full',
                  item.is_featured &&
                    'border-[0.5px] border-white/25 shadow-md shadow-black/20'
                )}
              >
                {isLoading && item.product_id === activeProductId ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>{processingText}</span>
                  </>
                ) : (
                  <span>{item.button?.title ?? 'Buy Now'}</span>
                )}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Pricing({
  section,
  className,
  currentSubscription,
}: {
  section: PricingType;
  className?: string;
  currentSubscription?: Subscription;
}) {
  const locale = useLocale();
  const t = useTranslations('pages.pricing.messages');

  const { user } = useAppContext();
  const { pricingItem, isLoading, productId, checkout, startPayment } =
    usePricingCheckout();

  const visibleGroups = useMemo(() => {
    if (!section.groups) return [];
    return section.groups;
  }, [section.groups]);

  const visibleItems = useMemo(() => {
    if (!section.items) return [];
    return section.items;
  }, [section.items]);

  const [group, setGroup] = useState(() => {
    return resolveDefaultGroup({
      items: visibleItems,
      groups: visibleGroups,
      currentProductId: currentSubscription?.productId,
    });
  });

  const visibleGroupNames = useMemo(
    () =>
      new Set(
        visibleGroups
          .map((groupItem) => groupItem.name)
          .filter((name): name is string => Boolean(name))
      ),
    [visibleGroups]
  );

  const filteredItems = useMemo(() => {
    if (!group) return visibleItems;
    return visibleItems.filter((item) => !item.group || item.group === group);
  }, [visibleItems, group]);

  useEffect(() => {
    if (!visibleGroups.length) return;

    if (group && visibleGroupNames.has(group)) {
      return;
    }

    setGroup(
      resolveDefaultGroup({
        items: visibleItems,
        groups: visibleGroups,
        currentProductId: currentSubscription?.productId,
      })
    );
  }, [
    group,
    visibleGroupNames,
    visibleGroups,
    visibleItems,
    currentSubscription?.productId,
  ]);

  // Currency state management for each item
  // Store selected currency and displayed item for each product_id
  const [itemCurrencies, setItemCurrencies] = useState<
    Record<string, { selectedCurrency: string; displayedItem: PricingItem }>
  >({});

  // Initialize currency states for all items
  useEffect(() => {
    if (section.items && section.items.length > 0) {
      const initialCurrencyStates: Record<
        string,
        { selectedCurrency: string; displayedItem: PricingItem }
      > = {};

      section.items.forEach((item) => {
        const currencies = getCurrenciesFromItem(item);
        const selectedCurrency = getInitialCurrency(
          currencies,
          locale,
          item.currency
        );

        // Create displayed item with selected currency
        const currencyData = currencies.find(
          (c) => c.currency.toLowerCase() === selectedCurrency.toLowerCase()
        );

        const displayedItem = currencyData
          ? {
              ...item,
              currency: currencyData.currency,
              amount: currencyData.amount,
              price: currencyData.price,
              original_price: currencyData.original_price,
              // Override with currency-specific payment settings if available
              payment_product_id:
                currencyData.payment_product_id || item.payment_product_id,
              payment_providers:
                currencyData.payment_providers || item.payment_providers,
            }
          : item;

        initialCurrencyStates[item.product_id] = {
          selectedCurrency,
          displayedItem,
        };
      });

      setItemCurrencies(initialCurrencyStates);
    }
  }, [section.items, locale]);

  // Handler for currency change
  const handleCurrencyChange = (productId: string, currency: string) => {
    const item = section.items?.find((i) => i.product_id === productId);
    if (!item) return;

    const currencies = getCurrenciesFromItem(item);
    const currencyData = currencies.find(
      (c) => c.currency.toLowerCase() === currency.toLowerCase()
    );

    if (currencyData) {
      const displayedItem = {
        ...item,
        currency: currencyData.currency,
        amount: currencyData.amount,
        price: currencyData.price,
        original_price: currencyData.original_price,
        // Override with currency-specific payment settings if available
        payment_product_id:
          currencyData.payment_product_id || item.payment_product_id,
        payment_providers:
          currencyData.payment_providers || item.payment_providers,
      };

      setItemCurrencies((prev) => ({
        ...prev,
        [productId]: {
          selectedCurrency: currency,
          displayedItem,
        },
      }));
    }
  };

  const handlePayment = async (item: PricingItem) => {
    const displayedItem =
      itemCurrencies[item.product_id]?.displayedItem || item;

    await startPayment(displayedItem);
  };

  return (
    <section
      id={section.id}
      className={cn('py-24 md:py-36', section.className, className)}
    >
      <div className="mx-auto mb-12 px-4 text-center md:px-8">
        {section.sr_only_title && (
          <h1 className="sr-only">{section.sr_only_title}</h1>
        )}
        <h2 className="mb-6 text-3xl font-bold text-pretty lg:text-4xl">
          {section.title}
        </h2>
        <p className="text-muted-foreground mx-auto mb-4 max-w-xl lg:max-w-none lg:text-lg">
          {section.description}
        </p>
      </div>

      <div className="container">
        {visibleGroups.length > 0 && (
          <div className="mx-auto mt-8 mb-16 flex w-full justify-center md:max-w-lg">
            <Tabs value={group} onValueChange={setGroup} className="">
              <TabsList>
                {visibleGroups.map((item, i) => {
                  return (
                    <TabsTrigger key={i} value={item.name || ''}>
                      {item.title}
                      {item.label && (
                        <Badge className="ml-2">{item.label}</Badge>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>
        )}

        <PricingCardGrid
          items={filteredItems}
          itemCurrencies={itemCurrencies}
          handlePayment={handlePayment}
          isLoading={isLoading}
          activeProductId={productId ?? undefined}
          processingText={t('processing')}
          currentPlanText={t('current_plan')}
          currentSubscription={currentSubscription}
        />
      </div>

      <PaymentModal
        isLoading={isLoading}
        pricingItem={pricingItem}
        onCheckout={(item, paymentProvider) => checkout(item, paymentProvider)}
      />
    </section>
  );
}
