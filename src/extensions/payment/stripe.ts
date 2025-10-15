import Stripe from "stripe";
import {
  type PaymentProvider,
  type PaymentConfigs,
  type PaymentSession,
  type PaymentWebhookResult,
  type PaymentRequest,
  PaymentStatus,
  PaymentType,
  PaymentInterval,
} from ".";
import { envConfigs } from "@/config";

/**
 * Stripe payment provider configs
 * @docs https://stripe.com/docs
 */
export interface StripeConfigs extends PaymentConfigs {
  secretKey: string;
  publishableKey: string;
  webhookSecret?: string;
  apiVersion?: string;
}

/**
 * Stripe payment provider implementation
 * @website https://stripe.com/
 */
export class StripeProvider implements PaymentProvider {
  readonly name = "stripe";
  configs: StripeConfigs;

  private client: Stripe;

  constructor(configs: StripeConfigs) {
    this.configs = configs;
    this.client = new Stripe(configs.secretKey, {
      apiVersion: (configs.apiVersion as any) || "2024-06-20",
    });
  }

  async createPayment(request: PaymentRequest): Promise<PaymentSession> {
    try {
      // check payment price
      if (!request.price) {
        throw new Error("price is required");
      }

      // create payment with dynamic product

      // build price data
      const priceData: Stripe.Checkout.SessionCreateParams.LineItem.PriceData =
        {
          currency: request.price.currency,
          unit_amount: request.price.amount, // unit: cents
          product_data: {
            name: request.description || "",
          },
        };

      if (request.type === PaymentType.SUBSCRIPTION) {
        // create subscription payment

        // check payment plan
        if (!request.plan) {
          throw new Error("plan is required");
        }

        // build recurring data
        priceData.recurring = {
          interval: request.plan
            .interval as Stripe.Checkout.SessionCreateParams.LineItem.PriceData.Recurring.Interval,
        };
      } else {
        // create one-time payment
      }

      // set or create customer
      let customerId = "";
      if (request.customer?.email) {
        const customers = await this.client.customers.list({
          email: request.customer.email,
          limit: 1,
        });

        if (customers.data.length > 0) {
          customerId = customers.data[0].id;
        } else {
          const customer = await this.client.customers.create({
            email: request.customer.email,
            name: request.customer.name,
            metadata: request.customer.metadata,
          });
          customerId = customer.id;
        }
      }

      // create payment session params
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode:
          request.type === PaymentType.SUBSCRIPTION
            ? "subscription"
            : "payment",
        line_items: [
          {
            price_data: priceData,
            quantity: 1,
          },
        ],
      };

      if (customerId) {
        sessionParams.customer = customerId;
      }

      if (request.metadata) {
        sessionParams.metadata = request.metadata;
      }

      if (request.successUrl) {
        sessionParams.success_url = request.successUrl;
      }

      if (request.cancelUrl) {
        sessionParams.cancel_url = request.cancelUrl;
      }

      const session = await this.client.checkout.sessions.create(sessionParams);
      if (!session.id || !session.url) {
        throw new Error("create payment failed");
      }

      return {
        success: true,
        provider: this.name,
        checkoutParams: sessionParams,
        checkoutInfo: {
          provider: this.name,
          sessionId: session.id,
          checkoutUrl: session.url,
        },
        checkoutResult: session,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        provider: this.name,
      };
    }
  }

  async getPayment({
    sessionId,
  }: {
    sessionId?: string;
  }): Promise<PaymentSession> {
    try {
      if (!sessionId) {
        throw new Error("sessionId is required");
      }

      const session = await this.client.checkout.sessions.retrieve(sessionId);

      if (!session.id || !session.amount_total || !session.currency) {
        throw new Error("get payment failed");
      }

      let subscription: Stripe.Response<Stripe.Subscription> | undefined =
        undefined;
      let billingUrl = "";

      if (session.subscription) {
        subscription = await this.client.subscriptions.retrieve(
          session.subscription as string
        );

        const billing = await this.client.billingPortal.sessions.create({
          customer: subscription.customer as string,

          return_url: `${envConfigs.app_url}/settings/billing`,
        });

        billingUrl = billing.url;
      }

      const result: PaymentSession = {
        success: true,
        provider: this.name,
        paymentStatus: this.mapStripeStatus(session),
        paymentInfo: {
          discountCode: "",
          discountAmount: undefined,
          discountCurrency: undefined,
          paymentAmount: session.amount_total || 0,
          paymentCurrency: session.currency || "",
          paymentEmail:
            session.customer_email ||
            session.customer_details?.email ||
            undefined,
          paidAt: session.created
            ? new Date(session.created * 1000)
            : undefined,
        },
        paymentResult: session,
      };

      if (subscription) {
        result.subscriptionId = subscription.id;

        // subscription data
        const data = subscription.items.data[0];

        result.subscriptionInfo = {
          subscriptionId: subscription.id,
          productId: data.price.product as string,
          planId: data.price.id,
          description: "",
          amount: data.price.unit_amount || 0,
          currency: data.price.currency,
          currentPeriodStart: new Date(data.current_period_start * 1000),
          currentPeriodEnd: new Date(data.current_period_end * 1000),
          interval: data.plan.interval as PaymentInterval,
          intervalCount: data.plan.interval_count || 1,
          billingUrl: billingUrl,
        };
        result.subscriptionResult = subscription;
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "get payment failed",
        provider: this.name,
      };
    }
  }

  async handleWebhook({
    rawBody,
    signature,
    headers,
  }: {
    rawBody: string | Buffer;
    signature?: string;
    headers?: Record<string, string>;
  }): Promise<PaymentWebhookResult> {
    try {
      if (!this.configs.webhookSecret) {
        throw new Error("Webhook secret not configured");
      }

      if (!signature) {
        throw new Error("Webhook signature not provided");
      }

      const event = this.client.webhooks.constructEvent(
        rawBody,
        signature,
        this.configs.webhookSecret
      );

      // Process the event based on type
      console.log(`Stripe webhook event: ${event.type}`, event.data);

      return {
        success: true,
        acknowledged: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        acknowledged: false,
      };
    }
  }

  private mapStripeStatus(
    session: Stripe.Response<Stripe.Checkout.Session>
  ): PaymentStatus {
    switch (session.status) {
      case "complete":
        // session complete, check payment status
        switch (session.payment_status) {
          case "paid":
            // payment success
            return PaymentStatus.SUCCESS;
          case "unpaid":
            // payment failed
            return PaymentStatus.PROCESSING;
          case "no_payment_required":
            // means payment not required, should be success
            return PaymentStatus.SUCCESS;
          default:
            throw new Error(
              `Unknown Stripe payment status: ${session.payment_status}`
            );
        }
      case "expired":
        // payment cancelled
        return PaymentStatus.CANCELLED;
      case "open":
        return PaymentStatus.PROCESSING;
      default:
        throw new Error(`Unknown Stripe status: ${session.status}`);
    }
  }
}

/**
 * Create Stripe provider with configs
 */
export function createStripeProvider(configs: StripeConfigs): StripeProvider {
  return new StripeProvider(configs);
}
