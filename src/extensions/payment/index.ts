/**
 * Payment price interface
 */
export interface PaymentPrice {
  amount: number;
  currency: string;
}

/**
 * Payment discount interface
 */
export interface PaymentDiscount {
  code: string;
}

/**
 * Payment customer interface
 */
export interface PaymentCustomer {
  id?: string;
  email?: string;
  name?: string;
  metadata?: Record<string, any>;
}

export interface PaymentCustomField {
  type: string;
  name: string;
  label: string;
  isRequired?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Payment product interface
 */
export interface PaymentProduct {
  id: string;
  name?: string;
  description?: string;
  price: PaymentPrice;
  metadata?: Record<string, any>;
}

export enum PaymentType {
  ONE_TIME = "one-time",
  SUBSCRIPTION = "subscription",
  RENEW = "renew",
}

export enum PaymentInterval {
  ONE_TIME = "one-time",
  DAY = "day",
  WEEK = "week",
  MONTH = "month",
  YEAR = "year",
}

export enum PaymentStatus {
  PROCESSING = "processing", // processing means waiting for payment
  // final status
  SUCCESS = "paid", // paid means payment success
  FAILED = "failed", // failed means payment failed
  CANCELLED = "cancelled", // cancelled means payment cancelled
}

/**
 * Payment subscription plan interface
 */
export interface PaymentSubscriptionPlan {
  id?: string;
  name: string;
  description?: string;
  interval: PaymentInterval;
  intervalCount?: number;
  trialPeriodDays?: number;
  metadata?: Record<string, any>;
}

/**
 * Payment request interface
 */
export interface PaymentRequest {
  provider?: string; // optional
  type?: PaymentType; // optional
  productId?: string; // create product first
  requestId?: string; // request id
  price?: PaymentPrice; // required if productId is not provided
  discount?: PaymentDiscount; // discount code
  quantity?: number; // quantity
  customer?: PaymentCustomer;
  description?: string; // checkout description
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, any>;
  plan?: PaymentSubscriptionPlan; // required for subscription
  customFields?: PaymentCustomField[]; // optional for custom fields
}

/**
 * Checkout info interface
 */
export interface CheckoutInfo {
  provider?: string;
  sessionId?: string;
  checkoutUrl?: string;
}

/**
 * Payment info interface
 */
export interface PaymentInfo {
  discountCode?: string;
  discountAmount?: number;
  discountCurrency?: string;
  paymentAmount: number;
  paymentCurrency: string;
  paymentEmail?: string;
  paidAt?: Date;
}

export interface SubscriptionInfo {
  subscriptionId: string;
  planId?: string;
  productId?: string;
  description?: string;
  amount?: number;
  currency?: string;
  interval?: PaymentInterval;
  intervalCount?: number;
  trialPeriodDays?: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  billingUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * Payment session interface
 */
export interface PaymentSession {
  success: boolean;
  error?: string;
  provider: string;

  // checkout session
  checkoutParams?: any; // checkout request params
  checkoutInfo?: CheckoutInfo; // checkout info after checkout success
  checkoutResult?: any; // provider checkout result

  // payment info
  paymentStatus?: PaymentStatus; // payment status
  paymentInfo?: PaymentInfo; // payment info after payment success
  paymentResult?: any; // provider payment result

  // subscription info
  subscriptionId?: string;
  subscriptionInfo?: SubscriptionInfo; // subscription info after subscription success
  subscriptionResult?: any; // provider subscription result
}

/**
 * Payment webhook notification interface
 */
export interface PaymentWebhookEvent {
  id: string;
  type: string;
  data: any;
  provider: string;
  created: Date;
}

/**
 * Payment webhook result interface
 */
export interface PaymentWebhookResult {
  success: boolean;
  error?: string;
  acknowledged: boolean;
}

/**
 * Payment configs interface
 */
export interface PaymentConfigs {
  [key: string]: any;
}

/**
 * Payment provider interface
 */
export interface PaymentProvider {
  // provider name
  readonly name: string;

  // provider configs
  configs: PaymentConfigs;

  // create payment
  createPayment(request: PaymentRequest): Promise<PaymentSession>;

  // get payment session
  getPayment({
    sessionId,
    provider,
  }: {
    sessionId: string;
    provider?: string;
  }): Promise<PaymentSession>;

  // handle payment callback
  handleCallback?({
    searchParams,
    provider,
  }: {
    searchParams: URLSearchParams;
    provider?: string;
  }): Promise<PaymentSession>;

  // handle webhook notification
  handleWebhook({
    rawBody,
    signature,
    headers,
    provider,
  }: {
    rawBody: string | Buffer;
    signature?: string;
    headers?: Record<string, string>;
    provider?: string;
  }): Promise<PaymentWebhookResult>;
}

/**
 * Payment manager to manage all payment providers
 */
export class PaymentManager {
  // payment providers
  private providers: PaymentProvider[] = [];
  private defaultProvider?: PaymentProvider;

  // add payment provider
  addProvider(provider: PaymentProvider, isDefault = false) {
    this.providers.push(provider);
    if (isDefault) {
      this.defaultProvider = provider;
    }
  }

  // get provider by name
  getProvider(name: string): PaymentProvider | undefined {
    const provider = this.providers.find((p) => p.name === name);

    if (!provider && this.defaultProvider) {
      return this.defaultProvider;
    }

    return provider;
  }

  // get all provider names
  getProviderNames(): string[] {
    return this.providers.map((p) => p.name);
  }

  getDefaultProvider(): PaymentProvider | undefined {
    // set default provider if not set
    if (!this.defaultProvider && this.providers.length > 0) {
      this.defaultProvider = this.providers[0];
    }

    return this.defaultProvider;
  }

  // create payment using default provider
  async createPayment(request: PaymentRequest): Promise<PaymentSession> {
    if (request.provider) {
      const provider = this.getProvider(request.provider);
      if (!provider) {
        throw new Error(`Payment provider '${request.provider}' not found`);
      }
      return provider.createPayment(request);
    }

    const defaultProvider = this.getDefaultProvider();
    if (!defaultProvider) {
      throw new Error("No payment provider configured");
    }

    return defaultProvider.createPayment(request);
  }

  // get payment session using default provider
  async getPayment(sessionId: string): Promise<PaymentSession | null> {
    const defaultProvider = this.getDefaultProvider();
    if (!defaultProvider) {
      throw new Error("No payment provider configured");
    }

    return defaultProvider.getPayment({ sessionId });
  }

  // create payment using specific provider
  async createPaymentWithProvider(
    request: PaymentRequest,
    providerName: string
  ): Promise<PaymentSession> {
    const provider = this.getProvider(providerName);
    if (!provider) {
      throw new Error(`Payment provider '${providerName}' not found`);
    }
    return provider.createPayment(request);
  }

  // handle webhook using specific provider
  async handleWebhook(
    providerName: string,
    rawBody: string | Buffer,
    signature?: string,
    headers?: Record<string, string>
  ): Promise<PaymentWebhookResult> {
    const provider = this.getProvider(providerName);
    if (!provider) {
      throw new Error(`Payment provider '${providerName}' not found`);
    }
    return provider.handleWebhook({ rawBody, signature, headers });
  }
}

// Global payment manager instance
export const paymentManager = new PaymentManager();

// Export all providers
export * from "./stripe";
export * from "./creem";
export * from "./paypal";
