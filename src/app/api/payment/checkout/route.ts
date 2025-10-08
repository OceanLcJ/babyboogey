import { envConfigs } from "@/config";
import { getSnowId, getUuid } from "@/shared/lib/hash";
import { respData, respErr } from "@/shared/lib/resp";
import {
  createOrder,
  NewOrder,
  OrderStatus,
  updateOrderByOrderNo,
} from "@/shared/services/order";
import { getUserInfo } from "@/shared/services/user";
import { getTranslations } from "next-intl/server";
import { paymentService } from "@/shared/services/payment";
import {
  PaymentRequest,
  PaymentInterval,
  PaymentType,
  PaymentPrice,
} from "@/extensions/payment";

export async function POST(req: Request) {
  try {
    const { product_id, currency } = await req.json();

    const t = await getTranslations("pricing");
    const pricing = t.raw("pricing");

    const pricingItem = pricing.items.find(
      (item: any) => item.product_id === product_id
    );

    if (!pricingItem) {
      return respErr("pricing item not found");
    }

    if (!pricingItem.product_id && !pricingItem.amount) {
      return respErr("invalid pricing item");
    }

    // get sign user
    const user = await getUserInfo();
    if (!user || !user.email) {
      return respErr("no auth, please sign in");
    }

    // checkout currency
    let checkoutCurrency = currency || pricingItem.currency || "";
    checkoutCurrency = checkoutCurrency.toLowerCase();

    // get default payment provider
    const paymentProvider = paymentService.getDefaultProvider();
    if (!paymentProvider) {
      return respErr("no payment provider configured");
    }

    // get payment interval
    const paymentInterval: PaymentInterval =
      pricingItem.interval || PaymentInterval.ONE_TIME;

    // get payment type
    const paymentType =
      paymentInterval === PaymentInterval.ONE_TIME
        ? PaymentType.ONE_TIME
        : PaymentType.SUBSCRIPTION;

    const orderNo = getSnowId();

    // todo: get payment product
    const paymentProductId = "";

    // build checkout price
    const checkoutPrice: PaymentPrice = {
      amount: pricingItem.amount,
      currency: checkoutCurrency,
    };

    if (!paymentProductId) {
      // checkout price validation
      if (!checkoutPrice.amount || !checkoutPrice.currency) {
        return respErr("invalid checkout price");
      }
    }

    // build checkout info
    const checkoutInfo: PaymentRequest = {
      description: pricingItem.product_name,
      customer: {
        name: user.name,
        email: user.email,
      },
      type: paymentType,
      metadata: {
        app_name: envConfigs.app_name,
        order_no: orderNo,
        user_id: user.id,
      },
      successUrl: `${envConfigs.app_url}/api/payment/callback?order_no=${orderNo}`,
      cancelUrl: `${envConfigs.app_url}/pricing`,
    };

    if (paymentProductId) {
      // checkout with predefined product
      checkoutInfo.productId = pricingItem.product_id;
    } else {
      checkoutInfo.price = checkoutPrice;

      // checkout dynamically
      if (paymentType === PaymentType.SUBSCRIPTION) {
        // subscription mode
        checkoutInfo.plan = {
          interval: paymentInterval,
          name: pricingItem.product_name,
        };
      } else {
        // one-time mode
      }
    }

    const currentTime = new Date();

    const callbackUrl = `${envConfigs.app_url}/settings/billing`;

    // build order info
    const order: NewOrder = {
      id: getUuid(),
      orderNo: orderNo,
      userId: user.id,
      userEmail: user.email,
      status: OrderStatus.PENDING,
      amount: pricingItem.amount,
      currency: checkoutCurrency,
      productId: pricingItem.product_id,
      paymentType: paymentType,
      paymentInterval: paymentInterval,
      paymentProvider: paymentProvider.name,
      checkoutInfo: JSON.stringify(checkoutInfo),
      createdAt: currentTime,
      productName: pricingItem.product_name,
      description: pricingItem.description,
      callbackUrl: callbackUrl,
      creditsAmount: pricingItem.credits,
      creditsValidDays: pricingItem.valid_days,
      planName: pricingItem.plan_name || "",
    };

    // create order
    await createOrder(order);

    // create payment
    const result = await paymentService.createPayment(checkoutInfo);

    if (
      !result.success ||
      !result.checkoutInfo ||
      !result.checkoutInfo.sessionId ||
      !result.checkoutInfo.checkoutUrl
    ) {
      // update order status to completed, means checkout failed
      await updateOrderByOrderNo(orderNo, {
        status: OrderStatus.COMPLETED, // means checkout failed
        checkoutInfo: JSON.stringify(checkoutInfo),
        checkoutResult: JSON.stringify(result),
      });

      return respErr("checkout failed: " + result.error);
    }

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
  } catch (e: any) {
    console.log("checkout failed:", e);
    return respErr("checkout failed: " + e.message);
  }
}
