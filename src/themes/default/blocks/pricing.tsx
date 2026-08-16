'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { PaymentModal } from '@/shared/blocks/payment/payment-modal';
import { Button } from '@/shared/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
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
  initialGroup,
}: {
  items: PricingItem[];
  groups?: PricingType['groups'];
  currentProductId?: string | null;
  initialGroup?: string;
}): string {
  if (!items.length) return '';

  const requestedGroup = initialGroup
    ? groups?.find((group) => group.name === initialGroup)?.name
    : undefined;
  const currentItem = currentProductId
    ? items.find((i) => i.product_id === currentProductId)
    : undefined;
  const featuredGroup = groups?.find((g) => g.is_featured);

  return (
    requestedGroup ||
    featuredGroup?.name ||
    currentItem?.group ||
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
  creditUnits,
  currentSubscription,
}: {
  items: PricingItem[];
  itemCurrencies: Record<
    string,
    { selectedCurrency: string; displayedItem: PricingItem }
  >;
  handlePayment: (item: PricingItem) => void;
  isLoading: boolean;
  activeProductId: string | undefined;
  processingText: string;
  currentPlanText: string;
  creditUnits: {
    monthly: string;
    yearly: string;
    oneTime: string;
    perCredit: string;
  };
  currentSubscription?: Subscription;
}) {
  const gridClass =
    items.length <= 3 ? 'bb-credit-grid bb-credit-grid--3' : 'bb-credit-grid';

  return (
    <div className={cn(gridClass, 'mx-auto w-full')}>
      {items.map((item) => {
        const displayedItem =
          itemCurrencies[item.product_id]?.displayedItem || item;
        const isSubscription = item.interval !== 'one-time';
        const rawCredits = item.credits ?? 0;
        const displayCredits = rawCredits;
        const creditUnit =
          item.interval === 'year'
            ? creditUnits.yearly
            : item.interval === 'month'
              ? creditUnits.monthly
              : creditUnits.oneTime;

        const dollarAmt = displayedItem.amount / 100;
        const perCreditCents =
          rawCredits > 0 ? (dollarAmt / rawCredits) * 100 : 0;

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
            <div className="bb-credit-count">
              {displayCredits.toLocaleString()}
            </div>
            <div className="bb-credit-unit">{creditUnit}</div>

            {isSubscription && perCreditCents > 0 && (
              <div className="bb-credit-per">
                {perCreditCents.toFixed(1)}¢<span>{creditUnits.perCredit}</span>
              </div>
            )}

            <div className="bb-credit-price-row">
              <span className="bb-credit-price">{displayedItem.price}</span>
              {displayedItem.unit && (
                <span className="bb-credit-period">{displayedItem.unit}</span>
              )}
              {displayedItem.original_price && (
                <span className="bb-credit-orig">
                  {displayedItem.original_price}
                </span>
              )}
            </div>

            {item.tip && (
              <div className="bb-credit-billing-note">{item.tip}</div>
            )}

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
  initialGroup,
}: {
  section: PricingType;
  className?: string;
  currentSubscription?: Subscription;
  initialGroup?: string;
}) {
  const locale = useLocale();
  const t = useTranslations('pages.pricing.messages');
  const sectionTip = (section as PricingType & { tip?: string }).tip;

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
      initialGroup,
    });
  });
  const [hasUserSelectedGroup, setHasUserSelectedGroup] = useState(false);

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
        initialGroup,
      })
    );
  }, [
    group,
    visibleGroupNames,
    visibleGroups,
    visibleItems,
    currentSubscription?.productId,
    initialGroup,
  ]);

  useEffect(() => {
    if (
      initialGroup ||
      hasUserSelectedGroup ||
      currentSubscription?.interval === 'year' ||
      group !== 'yearly' ||
      !visibleGroupNames.has('monthly')
    ) {
      return;
    }

    const timer = window.setTimeout(() => setGroup('monthly'), 2000);
    return () => window.clearTimeout(timer);
  }, [
    currentSubscription?.interval,
    group,
    hasUserSelectedGroup,
    initialGroup,
    visibleGroupNames,
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
          <div className="mx-auto mt-8 mb-16 flex w-full justify-center md:max-w-2xl">
            <Tabs
              value={group}
              onValueChange={(nextGroup) => {
                setHasUserSelectedGroup(true);
                setGroup(nextGroup);
              }}
              className="w-full"
            >
              <TabsList
                aria-label={section.title}
                className="bb-pricing-tabs"
              >
                {visibleGroups.map((item, i) => {
                  return (
                    <TabsTrigger
                      key={i}
                      value={item.name || ''}
                      className={cn(
                        'bb-pricing-tab',
                        item.name === 'credits' &&
                          'bb-pricing-tab--credits'
                      )}
                    >
                      <span className="bb-pricing-tab-title">
                        {item.title}
                      </span>
                      {item.label && (
                        <span className="bb-pricing-tab-corner">
                          {item.label}
                        </span>
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
          creditUnits={{
            monthly: t('credits_monthly'),
            yearly: t('credits_yearly'),
            oneTime: t('credits_one_time'),
            perCredit: t('per_credit'),
          }}
          currentSubscription={currentSubscription}
        />
        {sectionTip && (
          <p className="text-muted-foreground mx-auto mt-8 max-w-3xl text-center text-sm leading-6">
            {sectionTip}
          </p>
        )}
      </div>

      <PaymentModal
        isLoading={isLoading}
        pricingItem={pricingItem}
        onCheckout={(item, paymentProvider) => checkout(item, paymentProvider)}
      />
    </section>
  );
}
