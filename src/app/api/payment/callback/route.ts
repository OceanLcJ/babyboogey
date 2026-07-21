import { redirect } from 'next/navigation';

import { envConfigs } from '@/config';
import { PaymentStatus, PaymentType } from '@/extensions/payment/types';
import { findOrderByOrderNo } from '@/shared/models/order';
import { getUserInfo } from '@/shared/models/user';
import {
  getPaymentService,
  handleCheckoutSuccess,
} from '@/shared/services/payment';

export async function GET(req: Request) {
  let redirectUrl = '';

  try {
    // get callback params
    const { searchParams } = new URL(req.url);
    const orderNo = searchParams.get('order_no');

    if (!orderNo) {
      throw new Error('invalid callback params');
    }

    // get sign user
    const user = await getUserInfo();
    if (!user || !user.email) {
      throw new Error('no auth, please sign in');
    }

    // get order
    const order = await findOrderByOrderNo(orderNo);
    if (!order) {
      throw new Error('order not found');
    }

    // validate order and user
    if (!order.paymentSessionId || !order.paymentProvider) {
      throw new Error('invalid order');
    }

    if (order.userId !== user.id) {
      throw new Error('order and user not match');
    }

    const paymentService = await getPaymentService();

    const paymentProvider = paymentService.getProvider(order.paymentProvider);
    if (!paymentProvider) {
      throw new Error('payment provider not found');
    }

    // get payment session
    const session = await paymentProvider.getPaymentSession({
      sessionId: order.paymentSessionId,
    });

    // console.log('callback payment session', session);

    await handleCheckoutSuccess({
      order,
      session,
      // The signed webhook is authoritative for lifecycle email. Keeping the
      // browser callback fulfilment-only avoids turning an email queue issue
      // into a failed customer redirect after payment already succeeded.
      queueEmails: false,
    });

    redirectUrl =
      order.callbackUrl ||
      (order.paymentType === PaymentType.SUBSCRIPTION
        ? `${envConfigs.app_url}/settings/billing`
        : `${envConfigs.app_url}/settings/payments`);

    if (session.paymentStatus === PaymentStatus.SUCCESS) {
      const returnUrl = new URL(redirectUrl, envConfigs.app_url);
      returnUrl.searchParams.set('payment_status', 'success');
      returnUrl.searchParams.set('payment_order', order.orderNo);
      if (order.productId) {
        returnUrl.searchParams.set('payment_product', order.productId);
      }
      const paymentAmount = session.paymentInfo?.paymentAmount ?? order.amount;
      returnUrl.searchParams.set(
        'payment_value',
        String(Number(paymentAmount || 0) / 100)
      );
      returnUrl.searchParams.set(
        'payment_currency',
        session.paymentInfo?.paymentCurrency || order.currency
      );
      redirectUrl = returnUrl.toString();
    }
  } catch (e: UnsafeAny) {
    console.log('checkout callback failed:', e);
    redirectUrl = `${envConfigs.app_url}/pricing`;
  }

  redirect(redirectUrl);
}
