import {
  PaymentEventType,
  SubscriptionCycleType,
} from '@/extensions/payment/types';
import {
  findOrderByOrderNo,
  findOrderByTransactionId,
} from '@/shared/models/order';
import {
  beginPaymentEvent,
  PaymentEventLedgerStatus,
  updatePaymentEvent,
} from '@/shared/models/payment-lifecycle';
import { findSubscriptionByProviderSubscriptionId } from '@/shared/models/subscription';
import {
  ensureCreditForOrder,
  getPaymentService,
  handleCheckoutSuccess,
  handleSubscriptionCanceled,
  handleSubscriptionRenewal,
  handleSubscriptionUpdated,
} from '@/shared/services/payment';
import {
  buildPaymentEventLedgerKey,
  handlePaymentRefunded,
} from '@/shared/services/payment-lifecycle';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  let activeLedgerId: string | undefined;
  try {
    const { provider } = await params;

    if (!provider) {
      throw new Error('provider is required');
    }

    const paymentService = await getPaymentService();
    const paymentProvider = paymentService.getProvider(provider);
    if (!paymentProvider) {
      throw new Error('payment provider not found');
    }

    // get payment event from webhook notification
    const event = await paymentProvider.getPaymentEvent({ req });
    if (!event) {
      throw new Error('payment event not found');
    }

    const eventType = event.eventType;
    if (!eventType) {
      throw new Error('event type not found');
    }

    const { eventId, resourceId } = buildPaymentEventLedgerKey({
      provider,
      event,
    });
    const ledger = await beginPaymentEvent({
      provider,
      eventId,
      eventType,
      resourceId,
      payload: JSON.stringify(event.eventResult),
    });
    activeLedgerId = ledger.event.id;

    if (
      ledger.duplicate &&
      ledger.event.status !== PaymentEventLedgerStatus.FAILED
    ) {
      return Response.json({
        message: 'success',
        duplicate: true,
      });
    }

    if (ledger.duplicate) {
      await updatePaymentEvent(ledger.event.id, {
        status: PaymentEventLedgerStatus.PROCESSING,
        errorMessage: null,
      });
    }

    // payment session
    const session = event.paymentSession;
    if (eventType === PaymentEventType.UNKNOWN) {
      await updatePaymentEvent(ledger.event.id, {
        status: PaymentEventLedgerStatus.IGNORED,
        processedAt: new Date(),
      });
      return Response.json({ message: 'success' });
    }

    if (!session) {
      throw new Error('payment session not found');
    }

    // console.log('notify payment session', session);

    const markEventSucceeded = async (
      extra: {
        orderNo?: string;
        subscriptionNo?: string;
        transactionId?: string;
      } = {}
    ) => {
      await updatePaymentEvent(ledger.event.id, {
        status: PaymentEventLedgerStatus.SUCCEEDED,
        orderNo:
          extra.orderNo ||
          (typeof session.metadata?.order_no === 'string'
            ? session.metadata.order_no
            : session.refundInfo?.orderNo),
        subscriptionNo: extra.subscriptionNo,
        transactionId:
          extra.transactionId ||
          session.paymentInfo?.transactionId ||
          session.refundInfo?.paymentTransactionId,
        processedAt: new Date(),
      });
    };

    if (eventType === PaymentEventType.CHECKOUT_SUCCESS) {
      // one-time payment or subscription first payment
      const orderNo =
        typeof session.metadata?.order_no === 'string'
          ? session.metadata.order_no
          : '';

      if (!orderNo) {
        throw new Error('order no not found');
      }

      const order = await findOrderByOrderNo(orderNo);
      if (!order) {
        throw new Error('order not found');
      }

      await handleCheckoutSuccess({
        order,
        session,
      });
    } else if (eventType === PaymentEventType.PAYMENT_SUCCESS) {
      // handle subscription payment or one-time payment
      if (session.subscriptionId && session.subscriptionInfo) {
        // Find existing subscription in database
        const existingSubscription =
          await findSubscriptionByProviderSubscriptionId({
            provider: provider,
            subscriptionId: session.subscriptionId,
          });

        if (existingSubscription) {
          // Determine if this is a renewal or first payment
          const subscriptionCycleType =
            session.paymentInfo?.subscriptionCycleType;
          const transactionId = session.paymentInfo?.transactionId;

          // Method 1: Use subscriptionCycleType if available (Stripe, Creem, PayPal all provide this)
          if (subscriptionCycleType) {
            if (subscriptionCycleType === SubscriptionCycleType.CREATE) {
              console.log(
                `Subscription ${session.subscriptionId}: subscriptionCycleType is CREATE, ` +
                  'skipping PAYMENT_SUCCESS as this is the first payment (already handled)'
              );
              await markEventSucceeded({
                subscriptionNo: existingSubscription.subscriptionNo,
                transactionId,
              });
              return Response.json({ message: 'success' });
            }

            if (subscriptionCycleType === SubscriptionCycleType.RENEWAL) {
              // Idempotency check: skip if transaction already processed
              if (transactionId) {
                const existingOrder = await findOrderByTransactionId({
                  transactionId,
                  paymentProvider: provider,
                });
                if (existingOrder) {
                  console.log(
                    `Subscription ${session.subscriptionId}: transaction ${transactionId} already processed, skipping`
                  );
                  await ensureCreditForOrder({ order: existingOrder, session });
                  await markEventSucceeded({
                    orderNo: existingOrder.orderNo,
                    subscriptionNo: existingSubscription.subscriptionNo,
                    transactionId,
                  });
                  return Response.json({ message: 'success' });
                }
              }

              console.log(
                `Subscription ${session.subscriptionId}: subscriptionCycleType is RENEWAL, treating as RENEWAL`
              );

              await handleSubscriptionRenewal({
                subscription: existingSubscription,
                session,
              });
              await markEventSucceeded({
                subscriptionNo: existingSubscription.subscriptionNo,
                transactionId,
              });
              return Response.json({ message: 'success' });
            }
          }

          // Method 2: Fall back to transactionId-based idempotency check
          // If subscriptionCycleType is not available, check if this transaction already exists
          if (transactionId) {
            const existingOrder = await findOrderByTransactionId({
              transactionId,
              paymentProvider: provider,
            });
            if (existingOrder) {
              console.log(
                `Subscription ${session.subscriptionId}: transaction ${transactionId} already processed, skipping`
              );
              await ensureCreditForOrder({ order: existingOrder, session });
              await markEventSucceeded({
                orderNo: existingOrder.orderNo,
                subscriptionNo: existingSubscription.subscriptionNo,
                transactionId,
              });
              return Response.json({ message: 'success' });
            }

            // Transaction not found - treat as renewal (subscription exists but transaction is new)
            console.log(
              `Subscription ${session.subscriptionId}: new transaction ${transactionId}, treating as RENEWAL`
            );

            await handleSubscriptionRenewal({
              subscription: existingSubscription,
              session,
            });
          } else {
            console.log(
              `Subscription ${session.subscriptionId}: no subscriptionCycleType and no transactionId, cannot determine if renewal`
            );
          }
        } else {
          // Subscription not in database - this might be first payment
          // But first payment should be handled via CHECKOUT_SUCCESS or SUBSCRIBE_UPDATED
          console.log(
            `Subscription ${session.subscriptionId} not found in database, ` +
              `subscriptionCycleType: ${session.paymentInfo?.subscriptionCycleType}, ` +
              'not handling via PAYMENT_SUCCESS'
          );
        }
      } else {
        // handle one-time payment
        const orderNo = session.metadata?.order_no;

        if (!orderNo) {
          console.log(
            'one-time payment: order_no not found in metadata, skipping'
          );
          await updatePaymentEvent(ledger.event.id, {
            status: PaymentEventLedgerStatus.IGNORED,
            processedAt: new Date(),
          });
          return Response.json({ message: 'success' });
        }

        const order = await findOrderByOrderNo(orderNo);
        if (!order) {
          throw new Error('order not found');
        }

        // handleCheckoutSuccess has idempotency check and optimistic lock
        await handleCheckoutSuccess({
          order,
          session,
        });
      }
    } else if (eventType === PaymentEventType.PAYMENT_FAILED) {
      const orderNo =
        typeof session.metadata?.order_no === 'string'
          ? session.metadata.order_no
          : '';

      if (!orderNo) {
        console.log('payment failed: order_no not found in metadata, skipping');
        await updatePaymentEvent(ledger.event.id, {
          status: PaymentEventLedgerStatus.IGNORED,
          processedAt: new Date(),
        });
        return Response.json({ message: 'success' });
      }

      const order = await findOrderByOrderNo(orderNo);
      if (!order) {
        throw new Error('order not found');
      }

      await handleCheckoutSuccess({
        order,
        session,
      });
    } else if (eventType === PaymentEventType.SUBSCRIBE_UPDATED) {
      // only handle subscription update
      if (!session.subscriptionId || !session.subscriptionInfo) {
        throw new Error('subscription id or subscription info not found');
      }

      const existingSubscription =
        await findSubscriptionByProviderSubscriptionId({
          provider: provider,
          subscriptionId: session.subscriptionId,
        });
      if (!existingSubscription) {
        throw new Error('subscription not found');
      }

      await handleSubscriptionUpdated({
        subscription: existingSubscription,
        session,
      });
    } else if (eventType === PaymentEventType.SUBSCRIBE_CANCELED) {
      // only handle subscription cancellation
      if (!session.subscriptionId || !session.subscriptionInfo) {
        throw new Error('subscription id or subscription info not found');
      }

      const existingSubscription =
        await findSubscriptionByProviderSubscriptionId({
          provider: provider,
          subscriptionId: session.subscriptionId,
        });
      if (!existingSubscription) {
        throw new Error('subscription not found');
      }

      await handleSubscriptionCanceled({
        subscription: existingSubscription,
        session,
      });
    } else if (eventType === PaymentEventType.PAYMENT_REFUNDED) {
      await handlePaymentRefunded({
        provider,
        session,
      });
    } else {
      console.log('not handle other event type: ' + eventType);
    }

    await markEventSucceeded();

    return Response.json({
      message: 'success',
    });
  } catch (err: UnsafeAny) {
    if (activeLedgerId) {
      await updatePaymentEvent(activeLedgerId, {
        status: PaymentEventLedgerStatus.FAILED,
        errorMessage: err.message || String(err),
        processedAt: new Date(),
      });
    }
    console.log('handle payment notify failed', err);
    return Response.json(
      {
        message: `handle payment notify failed: ${err.message}`,
      },
      {
        status: 500,
      }
    );
  }
}
