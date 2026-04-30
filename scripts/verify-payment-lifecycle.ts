import assert from 'node:assert/strict';

import { PaymentManager } from '@/extensions/payment';
import {
  PaymentEventType,
  PaymentStatus,
  PaymentType,
} from '@/extensions/payment/types';
import { OrderStatus, type Order } from '@/shared/models/order';
import { type Subscription } from '@/shared/models/subscription';
import {
  buildPaymentEventLedgerKey,
  buildServerPaymentMetadata,
  calculateRefundCreditReversal,
  classifyPlanChange,
  getSubscriptionCheckoutRouting,
  validatePaymentSessionForOrder,
} from '@/shared/services/payment-lifecycle';

function fakeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-id',
    orderNo: '1001',
    userId: 'user-1',
    userEmail: 'user@example.com',
    status: OrderStatus.CREATED,
    amount: 2000,
    currency: 'usd',
    productId: 'pro',
    paymentType: PaymentType.ONE_TIME,
    paymentInterval: 'one-time',
    paymentProvider: 'stripe',
    paymentSessionId: 'cs_test_1',
    checkoutInfo: '{}',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    checkoutResult: null,
    paymentResult: null,
    discountCode: null,
    discountAmount: null,
    discountCurrency: null,
    paymentEmail: null,
    paymentAmount: null,
    paymentCurrency: null,
    paidAt: null,
    description: null,
    productName: null,
    subscriptionId: null,
    subscriptionResult: null,
    checkoutUrl: null,
    callbackUrl: null,
    creditsAmount: 100,
    creditsValidDays: 30,
    planName: null,
    paymentProductId: null,
    invoiceId: null,
    invoiceUrl: null,
    subscriptionNo: null,
    transactionId: null,
    paymentUserName: null,
    paymentUserId: null,
    ...overrides,
  };
}

function fakeSubscription(
  overrides: Partial<Subscription> = {}
): Subscription {
  return {
    id: 'sub-row-id',
    subscriptionNo: 'sub-no',
    userId: 'user-1',
    userEmail: 'user@example.com',
    status: 'active',
    paymentProvider: 'stripe',
    subscriptionId: 'sub_provider',
    subscriptionResult: null,
    productId: 'basic',
    description: null,
    amount: 1000,
    currency: 'usd',
    interval: 'month',
    intervalCount: 1,
    trialPeriodDays: null,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    planName: 'Basic',
    billingUrl: null,
    productName: 'Basic',
    creditsAmount: 100,
    creditsValidDays: 30,
    paymentProductId: 'price_basic',
    paymentUserId: null,
    canceledAt: null,
    canceledEndAt: null,
    canceledReason: null,
    canceledReasonType: null,
    ...overrides,
  };
}

function assertThrowsMessage(fn: () => void, message: string) {
  assert.throws(fn, (error) => {
    assert(error instanceof Error);
    return error.message === message;
  });
}

const metadata = buildServerPaymentMetadata({
  appName: 'BabyBoogey',
  orderNo: 'server-order',
  userId: 'server-user',
  metadata: {
    order_no: 'client-order',
    user_id: 'client-user',
    app_name: 'client-app',
    affiliate: 'ok',
  },
});
assert.equal(metadata.order_no, 'server-order');
assert.equal(metadata.user_id, 'server-user');
assert.equal(metadata.app_name, 'BabyBoogey');
assert.equal(metadata.affiliate, 'ok');

const paymentManager = new PaymentManager();
paymentManager.addProvider({ name: 'stripe', configs: {} } as UnsafeAny, true);
paymentManager.addProvider({ name: 'paypal', configs: {} } as UnsafeAny);
assert.equal(paymentManager.getProvider('paypal')?.name, 'paypal');
assert.equal(paymentManager.getProvider('creem'), undefined);
assert.equal(paymentManager.getDefaultProvider()?.name, 'stripe');

assertThrowsMessage(
  () =>
    validatePaymentSessionForOrder({
      order: fakeOrder(),
      session: {
        provider: 'stripe',
        paymentStatus: PaymentStatus.SUCCESS,
        paymentInfo: {
          transactionId: 'cs_test_1',
          paymentAmount: 100,
          paymentCurrency: 'usd',
        },
        metadata: {
          order_no: '1001',
          user_id: 'user-1',
        },
      },
    }),
  'payment amount mismatch'
);

assertThrowsMessage(
  () =>
    validatePaymentSessionForOrder({
      order: fakeOrder(),
      session: {
        provider: 'stripe',
        paymentStatus: PaymentStatus.SUCCESS,
        paymentInfo: {
          transactionId: 'cs_test_1',
          paymentAmount: 2000,
          paymentCurrency: 'eur',
        },
        metadata: {
          order_no: '1001',
          user_id: 'user-1',
        },
      },
    }),
  'payment currency mismatch'
);

assert.doesNotThrow(() =>
  validatePaymentSessionForOrder({
    order: fakeOrder({
      paymentProvider: 'paypal',
      paymentSessionId: 'ORDER-1',
    }),
    session: {
      provider: 'paypal',
      paymentStatus: PaymentStatus.SUCCESS,
      paymentInfo: {
        transactionId: 'CAPTURE-1',
        invoiceId: 'CAPTURE-1',
        paymentAmount: 2000,
        paymentCurrency: 'usd',
      },
      paymentResult: {
        id: 'CAPTURE-1',
        supplementary_data: {
          related_ids: {
            order_id: 'ORDER-1',
          },
        },
      },
      metadata: {
        order_no: '1001',
        user_id: 'user-1',
      },
    },
  })
);

const eventKeyA = buildPaymentEventLedgerKey({
  provider: 'paypal',
  event: {
    eventId: 'WH-1',
    resourceId: 'CAPTURE-1',
    eventType: PaymentEventType.PAYMENT_SUCCESS,
    eventResult: {},
  },
});
const eventKeyB = buildPaymentEventLedgerKey({
  provider: 'paypal',
  event: {
    eventId: 'WH-1',
    resourceId: 'CAPTURE-1',
    eventType: PaymentEventType.PAYMENT_SUCCESS,
    eventResult: {},
  },
});
assert.deepEqual(eventKeyA, eventKeyB);

assert.deepEqual(
  buildPaymentEventLedgerKey({
    provider: 'paypal',
    event: {
      eventType: PaymentEventType.PAYMENT_REFUNDED,
      eventResult: {},
      paymentSession: {
        provider: 'paypal',
        refundInfo: {
          refundId: 'REFUND-1',
          paymentTransactionId: 'CAPTURE-1',
          amount: 2000,
          currency: 'USD',
          status: 'succeeded',
        },
      },
    },
  }),
  {
    eventId: 'paypal:payment.refunded:REFUND-1',
    resourceId: 'REFUND-1',
  }
);

assert.deepEqual(
  calculateRefundCreditReversal({ grantedCredits: 100, remainingCredits: 25 }),
  { invalidatedCredits: 25, negativeAdjustmentCredits: 75 }
);

assert.equal(
  getSubscriptionCheckoutRouting({
    hasCurrentSubscription: true,
    currentProductId: 'basic',
    targetProductId: 'pro',
    paymentType: PaymentType.SUBSCRIPTION,
  }),
  'change_plan'
);
assert.equal(
  getSubscriptionCheckoutRouting({
    hasCurrentSubscription: true,
    currentProductId: 'basic',
    targetProductId: 'credits-100',
    paymentType: PaymentType.ONE_TIME,
  }),
  'new_checkout'
);

assert.equal(
  classifyPlanChange({
    subscription: fakeSubscription({ creditsAmount: 100 }),
    target: {
      productId: 'pro',
      amount: 2000,
      currency: 'usd',
      creditsAmount: 250,
      paymentProductId: 'price_pro',
    },
  }),
  'upgrade'
);
assert.equal(
  classifyPlanChange({
    subscription: fakeSubscription({ creditsAmount: 250 }),
    target: {
      productId: 'basic',
      amount: 1000,
      currency: 'usd',
      creditsAmount: 100,
      paymentProductId: 'price_basic',
    },
  }),
  'downgrade'
);

console.log('payment lifecycle verification passed');
