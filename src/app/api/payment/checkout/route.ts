import { getTranslations } from 'next-intl/server';

import {
  PaymentInterval,
  PaymentOrder,
  PaymentPrice,
  PaymentType,
} from '@/extensions/payment/types';
import { getSnowId, getUuid } from '@/shared/lib/hash';
import { respData, respErr } from '@/shared/lib/resp';
import { getAllConfigs } from '@/shared/models/config';
import {
  createOrder,
  NewOrder,
  OrderStatus,
  updateOrderByOrderNo,
} from '@/shared/models/order';
import { getCurrentSubscription } from '@/shared/models/subscription';
import { getUserInfo } from '@/shared/models/user';
import { getPaymentService } from '@/shared/services/payment';
import {
  buildServerPaymentMetadata,
  changeSubscriptionPlanWithProvider,
  getSubscriptionCheckoutRouting,
  PricingPlanSnapshot,
} from '@/shared/services/payment-lifecycle';
import {
  buildVideoUnlockCheckoutMetadata,
  createPendingVideoUnlock,
  getVideoUnlockPricingItem,
  getVideoUnlockReturnPath,
  isVideoUnlockProductId,
  resolveVideoUnlockCheckoutTarget,
} from '@/shared/services/video-unlock';
import { PricingCurrency } from '@/shared/types/blocks/pricing';

export async function POST(req: Request) {
  try {
    const {
      product_id,
      currency,
      locale,
      payment_provider,
      metadata,
      task_id,
      asset_id,
    } = await req.json();
    if (!product_id) {
      return respErr('product_id is required');
    }

    const t = await getTranslations({
      locale: locale || 'en',
      namespace: 'pages.pricing',
    });
    const pricing = t.raw('page.sections.pricing');

    const isVideoUnlockCheckout = isVideoUnlockProductId(product_id);
    const pricingItem = isVideoUnlockCheckout
      ? getVideoUnlockPricingItem()
      : pricing.items.find((item: UnsafeAny) => item.product_id === product_id);

    if (!pricingItem) {
      return respErr('pricing item not found');
    }

    if (!pricingItem.product_id && !pricingItem.amount) {
      return respErr('invalid pricing item');
    }

    // get sign user
    const user = await getUserInfo();
    if (!user || !user.email) {
      return respErr('no auth, please sign in');
    }

    const videoUnlockTarget = isVideoUnlockCheckout
      ? await resolveVideoUnlockCheckoutTarget({
          userId: user.id,
          taskId: task_id,
          assetId: asset_id,
        })
      : null;

    // get configs
    const configs = await getAllConfigs();

    // choose payment provider
    let paymentProviderName = payment_provider || '';
    if (!paymentProviderName) {
      paymentProviderName = configs.default_payment_provider;
    }
    if (!paymentProviderName) {
      return respErr('no payment provider configured');
    }

    // Validate payment provider against allowed providers
    // First check currency-specific payment_providers if currency is provided
    let allowedProviders: string[] | undefined;

    if (
      currency &&
      currency.toLowerCase() !== (pricingItem.currency || 'usd').toLowerCase()
    ) {
      const selectedCurrencyData = pricingItem.currencies?.find(
        (c: PricingCurrency) =>
          c.currency.toLowerCase() === currency.toLowerCase()
      );
      allowedProviders = selectedCurrencyData?.payment_providers;
    }

    // Fallback to default payment_providers if not found in currency config
    if (!allowedProviders || allowedProviders.length === 0) {
      allowedProviders = pricingItem.payment_providers;
    }

    // If payment_providers is configured, validate the selected provider
    if (allowedProviders && allowedProviders.length > 0) {
      if (!allowedProviders.includes(paymentProviderName)) {
        return respErr(
          `payment provider ${paymentProviderName} is not supported for this currency`
        );
      }
    }

    // get default payment provider
    const paymentService = await getPaymentService();

    const paymentProvider = paymentService.getProvider(paymentProviderName);
    if (!paymentProvider || !paymentProvider.name) {
      return respErr('no payment provider configured');
    }

    // checkout currency and amount - calculate from server-side data only (never trust client input)
    // Security: currency can be provided by frontend, but amount must be calculated server-side
    const defaultCurrency = (pricingItem.currency || 'usd').toLowerCase();
    let checkoutCurrency = defaultCurrency;
    let checkoutAmount = pricingItem.amount;

    // If currency is provided, validate it and find corresponding amount from server-side data
    if (currency) {
      const requestedCurrency = currency.toLowerCase();

      // Check if requested currency is the default currency
      if (requestedCurrency === defaultCurrency) {
        checkoutCurrency = defaultCurrency;
        checkoutAmount = pricingItem.amount;
      } else if (pricingItem.currencies && pricingItem.currencies.length > 0) {
        // Find amount for the requested currency in currencies list
        const selectedCurrencyData = pricingItem.currencies.find(
          (c: PricingCurrency) => c.currency.toLowerCase() === requestedCurrency
        );
        if (selectedCurrencyData) {
          // Valid currency found, use it
          checkoutCurrency = requestedCurrency;
          checkoutAmount = selectedCurrencyData.amount;
        }
        // If currency not found in list, fallback to default (already set above)
      }
      // If no currencies list exists, fallback to default (already set above)
    }

    // get payment interval
    const paymentInterval: PaymentInterval =
      pricingItem.interval || PaymentInterval.ONE_TIME;

    // get payment type
    const paymentType =
      paymentInterval === PaymentInterval.ONE_TIME
        ? PaymentType.ONE_TIME
        : PaymentType.SUBSCRIPTION;

    const currentSubscription = await getCurrentSubscription(user.id);
    if (pricingItem.group === 'credits' && !currentSubscription) {
      return respErr(t('messages.credit_pack_subscribers_only'));
    }

    const orderNo = getSnowId();

    // get payment product id from pricing table in local file
    // First try to get currency-specific payment_product_id
    let paymentProductId = '';

    // If currency is provided and different from default, check currency-specific payment_product_id
    if (currency && currency.toLowerCase() !== defaultCurrency) {
      const selectedCurrencyData = pricingItem.currencies?.find(
        (c: PricingCurrency) =>
          c.currency.toLowerCase() === currency.toLowerCase()
      );
      if (selectedCurrencyData?.payment_product_id) {
        paymentProductId = selectedCurrencyData.payment_product_id;
      }
    }

    // Fallback to default payment_product_id if not found in currency config
    if (!paymentProductId) {
      paymentProductId = pricingItem.payment_product_id || '';
    }

    // If still not found, get from payment provider's config
    if (!paymentProductId) {
      paymentProductId = await getPaymentProductId(
        pricingItem.product_id,
        paymentProviderName,
        checkoutCurrency
      );
    }

    // get preset promotion code for product_id
    const promotionCode = await getPromotionCode(
      product_id,
      paymentProviderName,
      checkoutCurrency
    );

    // build checkout price with correct amount for selected currency
    const checkoutPrice: PaymentPrice = {
      amount: checkoutAmount,
      currency: checkoutCurrency,
    };

    if (!paymentProductId) {
      // checkout price validation
      if (!checkoutPrice.amount || !checkoutPrice.currency) {
        return respErr('invalid checkout price');
      }
    } else {
      paymentProductId = paymentProductId.trim();
    }

    let callbackBaseUrl = `${configs.app_url}`;
    if (locale && locale !== configs.default_locale) {
      callbackBaseUrl += `/${locale}`;
    }

    const callbackUrl = videoUnlockTarget
      ? `${callbackBaseUrl}${getVideoUnlockReturnPath(videoUnlockTarget.task.id)}`
      : paymentType === PaymentType.SUBSCRIPTION
        ? `${callbackBaseUrl}/settings/billing`
        : `${callbackBaseUrl}/settings/payments`;

    if (videoUnlockTarget?.activeUnlock) {
      return respData({
        checkoutUrl: callbackUrl,
        videoUnlock: {
          status: videoUnlockTarget.activeUnlock.status,
          taskId: videoUnlockTarget.task.id,
          assetId: videoUnlockTarget.asset.id,
        },
      });
    }

    const subscriptionRouting = getSubscriptionCheckoutRouting({
      hasCurrentSubscription: Boolean(currentSubscription),
      currentProductId: currentSubscription?.productId,
      targetProductId: pricingItem.product_id,
      paymentType,
    });

    if (subscriptionRouting === 'current_plan') {
      return respData({
        checkoutUrl: callbackUrl,
        planChange: {
          status: 'current_plan',
          subscriptionNo: currentSubscription?.subscriptionNo,
        },
      });
    }

    if (subscriptionRouting === 'change_plan') {
      if (!currentSubscription) {
        return respErr('subscription not found');
      }

      if (!paymentProductId) {
        return respErr('missing provider plan/price/product mapping');
      }

      const currentProviderName =
        currentSubscription.paymentProvider || paymentProvider.name;
      const planChangeProvider =
        paymentService.getProvider(currentProviderName);
      if (
        !planChangeProvider ||
        !planChangeProvider.name ||
        planChangeProvider.name !== currentProviderName
      ) {
        return respErr('subscription payment provider not configured');
      }

      const targetPlan: PricingPlanSnapshot = {
        productId: pricingItem.product_id,
        productName: pricingItem.product_name,
        planName: pricingItem.plan_name || pricingItem.product_name,
        amount: checkoutAmount,
        currency: checkoutCurrency,
        interval: paymentInterval,
        intervalCount: pricingItem.interval_count || 1,
        creditsAmount: pricingItem.credits,
        creditsValidDays: pricingItem.valid_days,
        paymentProductId,
      };

      const planChange = await changeSubscriptionPlanWithProvider({
        subscription: currentSubscription,
        target: targetPlan,
        provider: planChangeProvider,
        actorUserId: user.id,
      });

      return respData({
        checkoutUrl: planChange.approvalUrl || callbackUrl,
        planChange,
      });
    }

    // build checkout order
    const checkoutOrder: PaymentOrder = {
      orderNo,
      description: pricingItem.product_name,
      customer: {
        name: user.name,
        email: user.email,
      },
      type: paymentType,
      metadata: buildServerPaymentMetadata({
        appName: configs.app_name,
        orderNo,
        userId: user.id,
        metadata: videoUnlockTarget
          ? buildVideoUnlockCheckoutMetadata({
              clientMetadata: metadata,
              taskId: videoUnlockTarget.task.id,
              assetId: videoUnlockTarget.asset.id,
            })
          : metadata,
      }),
      successUrl: `${configs.app_url}/api/payment/callback?order_no=${orderNo}`,
      cancelUrl: videoUnlockTarget ? callbackUrl : `${callbackBaseUrl}/pricing`,
    };

    // checkout with predefined product
    if (paymentProductId) {
      checkoutOrder.productId = paymentProductId;
    }

    // checkout dynamically
    checkoutOrder.price = checkoutPrice;
    if (paymentType === PaymentType.SUBSCRIPTION) {
      // subscription mode
      checkoutOrder.plan = {
        interval: paymentInterval,
        name: pricingItem.product_name,
      };
    } else {
      // one-time mode
    }

    if (promotionCode) {
      checkoutOrder.discount = {
        code: promotionCode,
      };
    }

    const currentTime = new Date();

    // build order info
    const order: NewOrder = {
      id: getUuid(),
      orderNo: orderNo,
      userId: user.id,
      userEmail: user.email,
      status: OrderStatus.PENDING,
      amount: checkoutAmount, // use the amount for selected currency
      currency: checkoutCurrency,
      productId: pricingItem.product_id,
      paymentType: paymentType,
      paymentInterval: paymentInterval,
      paymentProvider: paymentProvider.name,
      checkoutInfo: JSON.stringify(checkoutOrder),
      createdAt: currentTime,
      productName: pricingItem.product_name,
      description: pricingItem.description,
      callbackUrl: callbackUrl,
      creditsAmount: pricingItem.credits,
      creditsValidDays: pricingItem.valid_days,
      planName: pricingItem.plan_name || '',
      paymentProductId: paymentProductId,
      discountCode: promotionCode,
    };

    // create order
    await createOrder(order);
    if (videoUnlockTarget) {
      await createPendingVideoUnlock({
        userId: user.id,
        taskId: videoUnlockTarget.task.id,
        assetId: videoUnlockTarget.asset.id,
        orderNo,
        productId: pricingItem.product_id,
      });
    }

    try {
      // create payment
      const result = await paymentProvider.createPayment({
        order: checkoutOrder,
      });

      // update order status to created, waiting for payment
      await updateOrderByOrderNo(orderNo, {
        status: OrderStatus.CREATED, // means checkout created, waiting for payment
        checkoutInfo: JSON.stringify(result.checkoutParams),
        checkoutResult: JSON.stringify(result.checkoutResult),
        checkoutUrl: result.checkoutInfo.checkoutUrl,
        paymentSessionId: result.checkoutInfo.sessionId,
        paymentProvider: result.provider,
      });

      return respData(result.checkoutInfo);
    } catch (e: UnsafeAny) {
      // update order status to completed, means checkout failed
      await updateOrderByOrderNo(orderNo, {
        status: OrderStatus.COMPLETED, // means checkout failed
        checkoutInfo: JSON.stringify(checkoutOrder),
      });

      return respErr('checkout failed: ' + e.message);
    }
  } catch (e: UnsafeAny) {
    console.log('checkout failed:', e);
    return respErr('checkout failed: ' + e.message);
  }
}

// get payemt product id from payment provider's config
async function getPaymentProductId(
  productId: string,
  provider: string,
  checkoutCurrency: string
) {
  if (provider !== 'creem') {
    // currently only creem supports payment product id mapping
    return;
  }

  try {
    const configs = await getAllConfigs();
    const creemProductIds = configs.creem_product_ids;
    if (creemProductIds) {
      const productIds = JSON.parse(creemProductIds);
      return (
        productIds[`${productId}_${checkoutCurrency}`] || productIds[productId]
      );
    }
  } catch (e: UnsafeAny) {
    console.log('get payment product id failed:', e);
    return;
  }
}

// get promotion code from payment provider's config
async function getPromotionCode(
  productId: string,
  provider: string,
  checkoutCurrency: string
) {
  if (provider !== 'stripe') {
    // currently only stripe supports promotion code mapping
    return;
  }

  try {
    const configs = await getAllConfigs();
    const stripePromotionCodes = configs.stripe_promotion_codes;
    if (stripePromotionCodes) {
      const promotionCodes = JSON.parse(stripePromotionCodes);
      return (
        promotionCodes[`${productId}_${checkoutCurrency}`] ||
        promotionCodes[productId]
      );
    }
  } catch (e: UnsafeAny) {
    console.log('get promotion code failed:', e);
    return;
  }
}
