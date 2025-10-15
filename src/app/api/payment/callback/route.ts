import { envConfigs } from "@/config";
import { PaymentStatus, PaymentType } from "@/extensions/payment";
import { getSnowId, getUuid } from "@/shared/lib/hash";
import {
  CreditTransactionScene,
  CreditTransactionType,
  NewCredit,
  CreditStatus,
  calculateCreditExpirationTime,
} from "@/shared/services/credit";
import {
  findOrderByOrderNo,
  OrderStatus,
  UpdateOrder,
  updateOrderByOrderNo,
  updateOrderInTransaction,
} from "@/shared/services/order";
import { getPaymentService } from "@/shared/services/payment";
import {
  NewSubscription,
  SubscriptionStatus,
} from "@/shared/services/subscription";
import { getUserInfo } from "@/shared/services/user";
import { redirect } from "next/navigation";

export async function GET(req: Request) {
  let redirectUrl = "";

  try {
    const { searchParams } = new URL(req.url);
    const orderNo = searchParams.get("order_no");

    if (!orderNo) {
      throw new Error("invalid callback params");
    }

    // get sign user
    const user = await getUserInfo();
    if (!user || !user.email) {
      throw new Error("no auth, please sign in");
    }

    // get order
    const order = await findOrderByOrderNo(orderNo);
    if (!order) {
      throw new Error("order not found");
    }

    // validate order and user
    if (order.userId !== user.id) {
      throw new Error("order and user not match");
    }

    if (!order.paymentSessionId || !order.paymentProvider) {
      throw new Error("payment session id or provider not found");
    }

    // check order status
    const paymentService = await getPaymentService();

    const paymentProvider = paymentService.getProvider(order.paymentProvider);
    if (!paymentProvider) {
      throw new Error("payment provider not found");
    }

    const session = await paymentProvider.getPayment({
      sessionId: order.paymentSessionId,
    });

    if (order.paymentType === PaymentType.SUBSCRIPTION) {
      if (!session.subscriptionId) {
        throw new Error("subscription id not found");
      }
    }

    console.log("payment callback", order, session);
    return;

    // payment success
    if (session.paymentStatus === PaymentStatus.SUCCESS) {
      // update order status to be paid
      const updateOrder: UpdateOrder = {
        status: OrderStatus.PAID,
        paymentResult: JSON.stringify(session.paymentResult),
        paymentAmount: session.paymentInfo?.paymentAmount,
        paymentCurrency: session.paymentInfo?.paymentCurrency,
        paymentEmail: session.paymentInfo?.paymentEmail,
        paidAt: session.paymentInfo?.paidAt,
      };

      // new subscription
      let newSubscription: NewSubscription | undefined = undefined;
      const subscriptionInfo = session.subscriptionInfo;

      if (subscriptionInfo) {
        // create subscription, before update order

        // new subscription
        newSubscription = {
          id: getUuid(),
          subscriptionNo: getSnowId(),
          userId: order.userId,
          userEmail: order.paymentEmail || order.userEmail,
          status: SubscriptionStatus.ACTIVE,
          paymentProvider: order.paymentProvider,
          subscriptionId: subscriptionInfo.subscriptionId,
          subscriptionResult: JSON.stringify(session.subscriptionResult),
          productId: order.productId,
          description: subscriptionInfo.description,
          amount: subscriptionInfo.amount,
          currency: subscriptionInfo.currency,
          interval: subscriptionInfo.interval,
          intervalCount: subscriptionInfo.intervalCount,
          trialPeriodDays: subscriptionInfo.trialPeriodDays,
          currentPeriodStart: subscriptionInfo.currentPeriodStart,
          currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
          billingUrl: subscriptionInfo.billingUrl,
          planName: order.planName || order.productName,
        };

        updateOrder.subscriptionId = session.subscriptionId;
        updateOrder.subscriptionResult = JSON.stringify(
          session.subscriptionResult
        );
      } else {
        // not subscription
      }

      const credits = order.creditsAmount || 0;
      const expiresAt =
        credits > 0
          ? calculateCreditExpirationTime(order, subscriptionInfo)
          : null;

      // grant credit for order
      const newCredit: NewCredit = {
        id: getUuid(),
        userId: order.userId,
        userEmail: order.userEmail,
        orderNo: order.orderNo,
        subscriptionId: subscriptionInfo?.subscriptionId,
        transactionNo: getSnowId(),
        transactionType: CreditTransactionType.GRANT,
        transactionScene:
          order.paymentType === PaymentType.SUBSCRIPTION
            ? CreditTransactionScene.SUBSCRIPTION
            : CreditTransactionScene.PAYMENT,
        credits: credits,
        remainingCredits: credits,
        description: `Grant credit`,
        expiresAt: expiresAt,
        status: CreditStatus.ACTIVE,
      };

      await updateOrderInTransaction({
        orderNo,
        updateOrder,
        newSubscription,
        newCredit,
      });

      redirectUrl =
        order.callbackUrl ||
        (order.paymentType === PaymentType.SUBSCRIPTION
          ? `${envConfigs.app_url}/settings/billing`
          : `${envConfigs.app_url}/settings/payments`);
    } else if (
      session.paymentStatus === PaymentStatus.FAILED ||
      session.paymentStatus === PaymentStatus.CANCELLED
    ) {
      // update order status to be failed
      await updateOrderByOrderNo(orderNo, {
        status: OrderStatus.FAILED,
        paymentResult: JSON.stringify(session.paymentResult),
      });

      redirectUrl = `${envConfigs.app_url}/pricing`;
    } else if (session.paymentStatus === PaymentStatus.PROCESSING) {
      // update order payment result
      await updateOrderByOrderNo(orderNo, {
        paymentResult: JSON.stringify(session.paymentResult),
      });

      redirectUrl = `${envConfigs.app_url}/settings/billing`;
    } else {
      throw new Error("unknown payment status");
    }
  } catch (e: any) {
    console.log("checkout callback failed:", e);
    redirectUrl = `${envConfigs.app_url}/pricing`;
  }

  redirect(redirectUrl);
}
