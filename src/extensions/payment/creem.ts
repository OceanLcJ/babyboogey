import {
  PaymentProvider,
  PaymentConfigs,
  PaymentRequest,
  PaymentStatus,
  PaymentSession,
  PaymentWebhookResult,
  PaymentInterval,
} from ".";

/**
 * Creem payment provider configs
 * @docs https://docs.creem.io/
 */
export interface CreemConfigs extends PaymentConfigs {
  apiKey: string;
  webhookSecret?: string;
  environment?: "sandbox" | "production";
}

/**
 * Creem payment provider implementation
 * @website https://creem.io/
 */
export class CreemProvider implements PaymentProvider {
  readonly name = "creem";
  configs: CreemConfigs;

  private baseUrl: string;

  constructor(configs: CreemConfigs) {
    this.configs = configs;
    this.baseUrl =
      configs.environment === "production"
        ? "https://api.creem.io"
        : "https://test-api.creem.io";
  }

  // create payment
  async createPayment(request: PaymentRequest): Promise<PaymentSession> {
    try {
      if (!request.productId) {
        throw new Error("productId is required");
      }

      // build payment payload
      const payload: any = {
        product_id: request.productId,
        request_id: request.requestId || undefined,
        units: 1,
        discount_code: request.discount
          ? {
              code: request.discount.code,
            }
          : undefined,
        customer: request.customer
          ? {
              id: request.customer.id,
              email: request.customer.email,
            }
          : undefined,
        custom_fields: request.customFields
          ? request.customFields.map((customField) => ({
              type: customField.type,
              key: customField.name,
              label: customField.label,
              optional: !customField.isRequired,
              text: customField.metadata,
            }))
          : undefined,
        success_url: request.successUrl,
        metadata: request.metadata,
      };

      const result = await this.makeRequest("/v1/checkouts", "POST", payload);

      // create payment failed
      if (result.error) {
        throw new Error(result.error.message || "create payment failed");
      }

      // create payment success
      return {
        success: true,
        provider: this.name,
        checkoutParams: payload,
        checkoutInfo: {
          provider: this.name,
          sessionId: result.id,
          checkoutUrl: result.checkout_url,
        },
        checkoutResult: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "create payment failed",
        provider: this.name,
      };
    }
  }

  // get payment by session id
  // @docs https://docs.creem.io/api-reference/endpoint/get-checkout
  async getPayment({
    sessionId,
  }: {
    sessionId: string;
  }): Promise<PaymentSession> {
    try {
      if (!sessionId) {
        throw new Error("sessionId is required");
      }

      // retrieve payment
      const session = await this.makeRequest(
        `/v1/checkouts?checkout_id=${sessionId}`,
        "GET"
      );

      if (!session.id || !session.order) {
        throw new Error(session.error || "get payment failed");
      }

      let subscription: any | undefined = undefined;
      let billingUrl = "";

      if (session.subscription) {
        subscription = session.subscription;
      }

      const result: PaymentSession = {
        success: true,
        provider: this.name,
        paymentStatus: this.mapCreemStatus(session),
        paymentInfo: {
          discountCode: "",
          discountAmount: undefined,
          discountCurrency: undefined,
          paymentAmount: session.order.amount_paid || 0,
          paymentCurrency: session.order.currency || "",
          paymentEmail: session.customer?.email || undefined,
          paidAt: session.order.updated_at
            ? new Date(session.order.updated_at)
            : undefined,
        },
        paymentResult: session,
      };

      if (subscription) {
        result.subscriptionId = subscription.id;

        result.subscriptionInfo = {
          subscriptionId: subscription.id,
          productId: session.product?.id,
          planId: "",
          description: session.product?.description || "",
          amount: session.order.amount_paid || 0,
          currency: session.order.currency,
          currentPeriodStart: new Date(subscription.current_period_start_date),
          currentPeriodEnd: new Date(subscription.current_period_end_date),
          interval:
            session.product?.billing_period === "every-month"
              ? PaymentInterval.MONTH
              : subscription.product?.billing_period === "every-year"
                ? PaymentInterval.YEAR
                : subscription.product?.billing_period === "every-week"
                  ? PaymentInterval.WEEK
                  : subscription.product?.billing_period === "every-day"
                    ? PaymentInterval.DAY
                    : undefined,
          intervalCount: 1,
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
        throw new Error("webhookSecret not configured");
      }

      // parse the webhook payload
      const payload =
        typeof rawBody === "string"
          ? JSON.parse(rawBody)
          : JSON.parse(rawBody.toString());

      // Verify webhook signature if provided
      if (signature && this.configs.webhookSecret) {
        const crypto = require("crypto");
        const expectedSignature = crypto
          .createHmac("sha256", this.configs.webhookSecret)
          .update(rawBody)
          .digest("hex");

        if (signature !== expectedSignature) {
          throw new Error("Invalid webhook signature");
        }
      }

      // Process the webhook event
      console.log(`Creem webhook event: ${payload.event_type}`, payload.data);

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

  private async makeRequest(endpoint: string, method: string, data?: any) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "x-api-key": this.configs.apiKey,
      "Content-Type": "application/json",
    };

    const config: RequestInit = {
      method,
      headers,
    };

    if (data) {
      config.body = JSON.stringify(data);
    }

    const response = await fetch(url, config);
    if (!response.ok) {
      throw new Error(`request failed with status: ${response.status}`);
    }

    return await response.json();
  }

  private mapCreemStatus(session: any): PaymentStatus {
    const status = session.status;

    switch (status) {
      case "pending":
        return PaymentStatus.PROCESSING;
      case "processing":
        return PaymentStatus.PROCESSING;
      case "completed":
      case "paid":
        return PaymentStatus.SUCCESS;
      case "failed":
        return PaymentStatus.FAILED;
      case "cancelled":
      case "expired":
        return PaymentStatus.CANCELLED;
      default:
        throw new Error(`Unknown Creem status: ${status}`);
    }
  }
}

/**
 * Create Creem provider with configs
 */
export function createCreemProvider(configs: CreemConfigs): CreemProvider {
  return new CreemProvider(configs);
}
