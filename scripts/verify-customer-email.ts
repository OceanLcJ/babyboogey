import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

const testEnv = process.env as Record<string, string | undefined>;
testEnv.DATABASE_PROVIDER = 'sqlite';
testEnv.DATABASE_URL = 'file::memory:';
testEnv.NEXT_PUBLIC_APP_URL = 'https://www.babyboogey.com';

async function main() {
  const [
    { CloudflareEmailProvider, EmailManager },
    {
      CUSTOMER_EMAIL_KINDS,
      attemptCustomerEmailDelivery,
      buildCustomerEmailDeliveryRow,
      insertCustomerEmailDeliveries,
      queueCustomerEmail,
      retryCustomerEmailDeliveries,
    },
    {
      buildCheckoutAbandonedReactivationEmail,
      buildCustomerPaymentReceiptEmail,
      buildSubscriptionReminderEmail,
      buildUnusedCreditsReactivationEmail,
      buildWelcomeEmail,
      getSubscriptionReminderMilestones,
      getSubscriptionReminderMode,
    },
    { runCustomerEmailMaintenance },
    { queueDueReactivationEmails },
    {
      createMarketingUnsubscribeToken,
      unsubscribeMarketingEmail,
      verifyMarketingUnsubscribeToken,
    },
  ] = await Promise.all([
    import('@/extensions/email'),
    import('@/shared/models/customer-email-delivery'),
    import('@/shared/services/customer-email-content'),
    import('@/shared/services/customer-lifecycle-email'),
    import('@/shared/services/customer-reactivation-email'),
    import('@/shared/services/marketing-email-preference'),
  ]);

  const client = createClient({ url: 'file::memory:' });
  await client.executeMultiple(`
  CREATE TABLE "user" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "email" text NOT NULL UNIQUE,
    "locale" text NOT NULL DEFAULT '',
    "created_at" integer NOT NULL
  );
  CREATE TABLE "subscription" (
    "id" text PRIMARY KEY NOT NULL,
    "subscription_no" text NOT NULL,
    "user_id" text NOT NULL,
    "status" text NOT NULL,
    "subscription_id" text NOT NULL,
    "current_period_end" integer,
    "canceled_end_at" integer,
    "plan_name" text,
    "product_name" text,
    "deleted_at" integer
  );
  CREATE TABLE "credit" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "transaction_type" text NOT NULL,
    "status" text NOT NULL,
    "remaining_credits" integer NOT NULL,
    "expires_at" integer
  );
  CREATE TABLE "ai_task" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "created_at" integer NOT NULL
  );
  CREATE TABLE "order" (
    "id" text PRIMARY KEY NOT NULL,
    "order_no" text NOT NULL UNIQUE,
    "user_id" text NOT NULL,
    "status" text NOT NULL,
    "amount" integer NOT NULL,
    "currency" text NOT NULL,
    "payment_session_id" text,
    "payment_amount" integer,
    "paid_at" integer,
    "created_at" integer NOT NULL,
    "description" text,
    "plan_name" text,
    "product_name" text
  );
`);
  const migration = await readFile(
    resolve(
      process.cwd(),
      'src/config/db/migrations-d1/0005_customer_lifecycle_email.sql'
    ),
    'utf8'
  );
  await client.executeMultiple(migration);
  const reactivationMigration = await readFile(
    resolve(
      process.cwd(),
      'src/config/db/migrations-d1/0007_reactivation_email.sql'
    ),
    'utf8'
  );
  await client.executeMultiple(reactivationMigration);
  await client.execute({
    sql: 'INSERT INTO "user" ("id", "name", "email", "locale", "created_at") VALUES (?, ?, ?, ?, ?)',
    args: [
      'user-1',
      'A <Baby>',
      'customer@example.com',
      'zh',
      new Date('2026-07-10T00:00:00.000Z').getTime(),
    ],
  });
  const database = drizzle(client) as UnsafeAny;

  function createEmailService(
    send: (message: UnsafeAny) => Promise<{ messageId: string }>
  ) {
    const manager = new EmailManager();
    manager.addProvider(
      new CloudflareEmailProvider({
        binding: { send },
        defaultFromEmail: 'support@babyboogey.com',
        defaultFromName: 'BabyBoogey',
        defaultReplyTo: 'support@babyboogey.com',
      }),
      true
    );
    return manager;
  }

  const welcome = buildWelcomeEmail({
    customerName: 'A <Baby>',
    createUrl: 'https://www.babyboogey.com/',
  });
  assert.match(welcome.html, /A &lt;Baby&gt;/);
  assert.doesNotMatch(welcome.html, /A <Baby>/);
  assert.match(welcome.text, /Create your first dance/);

  const receipt = buildCustomerPaymentReceiptEmail({
    customerName: 'Buyer',
    amount: 299,
    currency: 'usd',
    purchaseName: 'Clean video download',
    provider: 'stripe',
    referenceId: 'pi_123',
    billingUrl: 'https://www.babyboogey.com/settings/payments',
  });
  assert.match(receipt.subject, /\$2\.99/);
  assert.match(receipt.text, /pi_123/);

  const now = new Date('2026-07-22T00:00:00.000Z');
  assert.deepEqual(
    getSubscriptionReminderMilestones(
      new Date(now.getTime() + 6.5 * 24 * 60 * 60 * 1000),
      now
    ),
    [7]
  );
  assert.deepEqual(
    getSubscriptionReminderMilestones(
      new Date(now.getTime() + 12 * 60 * 60 * 1000),
      now
    ),
    [1]
  );
  assert.equal(getSubscriptionReminderMode('active'), 'renewal');
  assert.equal(getSubscriptionReminderMode('trialing'), 'trial');
  assert.equal(getSubscriptionReminderMode('pending_cancel'), 'ending');
  assert.match(
    buildSubscriptionReminderEmail({
      customerName: 'Buyer',
      planName: 'Dance Pro',
      periodEnd: new Date(now.getTime() + 12 * 60 * 60 * 1000),
      daysBefore: 1,
      mode: 'ending',
      billingUrl: 'https://www.babyboogey.com/settings/billing',
    }).subject,
    /subscription ends tomorrow/
  );

  const unsubscribeSecret =
    'test-only-reactivation-unsubscribe-secret-32-characters';
  const unsubscribeToken = await createMarketingUnsubscribeToken({
    userId: 'user-1',
    secret: unsubscribeSecret,
  });
  assert.deepEqual(
    await verifyMarketingUnsubscribeToken({
      token: unsubscribeToken,
      secret: unsubscribeSecret,
    }),
    { userId: 'user-1' }
  );
  assert.equal(
    await verifyMarketingUnsubscribeToken({
      token: `${unsubscribeToken.slice(0, -1)}x`,
      secret: unsubscribeSecret,
    }),
    null
  );
  const unusedCreditsContent = buildUnusedCreditsReactivationEmail({
    customerName: '小宝',
    remainingCredits: 75,
    createUrl: 'https://www.babyboogey.com/zh',
    unsubscribeUrl:
      'https://www.babyboogey.com/api/email/unsubscribe?token=test',
    marketingPostalAddress: 'Test business address',
    locale: 'zh',
  });
  assert.match(unusedCreditsContent.subject, /75/);
  assert.match(unusedCreditsContent.html, /退订产品提醒/);
  assert.match(unusedCreditsContent.text, /Test business address/);
  assert.match(
    buildCheckoutAbandonedReactivationEmail({
      customerName: 'A <Baby>',
      purchaseName: 'Dance credits',
      amount: 299,
      currency: 'usd',
      pricingUrl: 'https://www.babyboogey.com/pricing',
      unsubscribeUrl:
        'https://www.babyboogey.com/api/email/unsubscribe?token=test',
      marketingPostalAddress: 'Test business address',
      locale: 'en',
    }).html,
    /A &lt;Baby&gt;/
  );

  let providerCalls = 0;
  const testRecipientService = createEmailService(async () => {
    providerCalls += 1;
    return { messageId: 'unexpected' };
  });
  await queueCustomerEmail(
    {
      userId: 'user-1',
      kind: CUSTOMER_EMAIL_KINDS.WELCOME,
      dedupeKey: 'welcome:user-1',
      referenceId: 'user-1',
      recipient: 'e2e@example.test',
      ...welcome,
    },
    database
  );
  await retryCustomerEmailDeliveries({
    database,
    emailService: testRecipientService,
  });
  assert.equal(providerCalls, 0, '@example.test must not call Cloudflare');

  await queueCustomerEmail(
    {
      userId: 'user-1',
      kind: CUSTOMER_EMAIL_KINDS.WELCOME,
      dedupeKey: 'welcome:user-1',
      referenceId: 'user-1',
      recipient: 'e2e@example.test',
      ...welcome,
    },
    database
  );
  const duplicateCount = await client.execute({
    sql: 'SELECT COUNT(*) AS count FROM customer_email_delivery WHERE dedupe_key = ?',
    args: ['welcome:user-1'],
  });
  assert.equal(Number(duplicateCount.rows[0]?.count), 1);

  await client.execute('DELETE FROM customer_email_delivery');
  let concurrentCalls = 0;
  const concurrentService = createEmailService(async () => {
    concurrentCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { messageId: 'cf-concurrent-1' };
  });
  await queueCustomerEmail(
    {
      userId: 'user-1',
      kind: CUSTOMER_EMAIL_KINDS.PAYMENT_RECEIPT,
      dedupeKey: 'customer-payment:stripe:pi_concurrent',
      referenceId: 'pi_concurrent',
      recipient: 'customer@example.com',
      ...receipt,
    },
    database
  );
  await Promise.all([
    attemptCustomerEmailDelivery('customer-payment:stripe:pi_concurrent', {
      database,
      emailService: concurrentService,
    }),
    attemptCustomerEmailDelivery('customer-payment:stripe:pi_concurrent', {
      database,
      emailService: concurrentService,
    }),
  ]);
  assert.equal(concurrentCalls, 1, 'atomic claim must prevent duplicate sends');

  await client.execute('DELETE FROM customer_email_delivery');
  let failedCalls = 0;
  const failedService = createEmailService(async () => {
    failedCalls += 1;
    throw new Error('temporary provider failure');
  });
  const exhaustedRow = buildCustomerEmailDeliveryRow({
    userId: 'user-1',
    kind: CUSTOMER_EMAIL_KINDS.PAYMENT_RECEIPT,
    dedupeKey: 'customer-payment:stripe:pi_exhausted',
    referenceId: 'pi_exhausted',
    recipient: 'customer@example.com',
    ...receipt,
  });
  exhaustedRow.maxAttempts = 1;
  await insertCustomerEmailDeliveries([exhaustedRow], database);
  assert.equal(
    await attemptCustomerEmailDelivery('customer-payment:stripe:pi_exhausted', {
      database,
      emailService: failedService,
    }),
    'failed'
  );
  assert.equal(
    await attemptCustomerEmailDelivery('customer-payment:stripe:pi_exhausted', {
      database,
      emailService: failedService,
    }),
    'exhausted'
  );
  assert.equal(failedCalls, 1);

  await client.execute('DELETE FROM customer_email_delivery');
  await client.execute({
    sql: `INSERT INTO "subscription" (
    "id", "subscription_no", "user_id", "status", "subscription_id",
    "current_period_end", "plan_name", "product_name", "deleted_at"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    args: [
      'sub-row-1',
      'sub-no-1',
      'user-1',
      'active',
      'sub-provider-1',
      now.getTime() + 6.5 * 24 * 60 * 60 * 1000,
      'Dance Pro',
      'Dance Pro',
    ],
  });
  let scheduledCalls = 0;
  const scheduledService = createEmailService(async () => {
    scheduledCalls += 1;
    return { messageId: 'cf-reminder-1' };
  });
  const maintenance = await runCustomerEmailMaintenance({
    database,
    emailService: scheduledService,
    now,
    baseUrl: 'https://www.babyboogey.com',
  });
  assert.deepEqual(maintenance.reminders, { due: 1 });
  assert.equal(maintenance.deliveries.sent, 1);
  assert.equal(scheduledCalls, 1);

  await client.execute('DELETE FROM customer_email_delivery');
  await client.execute({
    sql: `INSERT INTO "credit" (
      "id", "user_id", "transaction_type", "status", "remaining_credits", "expires_at"
    ) VALUES (?, ?, ?, ?, ?, NULL)`,
    args: ['credit-1', 'user-1', 'grant', 'active', 75],
  });
  await client.execute({
    sql: `INSERT INTO "order" (
      "id", "order_no", "user_id", "status", "amount", "currency",
      "payment_session_id", "created_at", "description"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      'order-1',
      'order-no-1',
      'user-1',
      'failed',
      299,
      'usd',
      'cs_test_1',
      now.getTime() - 3 * 60 * 60 * 1000,
      'Dance credits',
    ],
  });
  const reactivation = await queueDueReactivationEmails({
    database,
    now,
    baseUrl: 'https://www.babyboogey.com',
    enabled: true,
    unsubscribeSecret,
    marketingPostalAddress: '',
  });
  assert.equal(reactivation.enabled, true);
  assert.equal(reactivation.unusedCredits.queued, 1);
  assert.equal(reactivation.checkoutAbandoned.queued, 1);
  const marketingRows = await client.execute(
    'SELECT kind, headers FROM customer_email_delivery ORDER BY kind'
  );
  assert.equal(marketingRows.rows.length, 2);
  assert.ok(
    marketingRows.rows.every((row) =>
      String(row.headers).includes('List-Unsubscribe')
    )
  );

  // A later successful purchase must suppress the already queued checkout
  // reminder while allowing the still-relevant unused-credit reminder.
  await client.execute({
    sql: 'UPDATE "order" SET status = ?, payment_amount = ?, paid_at = ? WHERE id = ?',
    args: ['paid', 299, now.getTime(), 'order-1'],
  });
  let reactivationProviderCalls = 0;
  const reactivationService = createEmailService(async () => {
    reactivationProviderCalls += 1;
    return { messageId: `cf-reactivation-${reactivationProviderCalls}` };
  });
  const reactivationDelivery = await retryCustomerEmailDeliveries({
    database,
    emailService: reactivationService,
  });
  assert.equal(reactivationDelivery.attempted, 2);
  assert.equal(reactivationDelivery.sent, 1);
  assert.equal(reactivationProviderCalls, 1);
  const suppressedCheckout = await client.execute({
    sql: 'SELECT status, last_error FROM customer_email_delivery WHERE kind = ?',
    args: ['reactivation_checkout_abandoned'],
  });
  assert.equal(suppressedCheckout.rows[0]?.status, 'suppressed');
  assert.equal(
    suppressedCheckout.rows[0]?.last_error,
    'checkout_no_longer_unpaid'
  );

  await client.execute('DELETE FROM customer_email_delivery');
  await queueCustomerEmail(
    {
      userId: 'user-1',
      kind: CUSTOMER_EMAIL_KINDS.REACTIVATION_UNUSED_CREDITS,
      dedupeKey: 'reactivation:unsubscribe-test:user-1',
      referenceId: 'user-1',
      recipient: 'customer@example.com',
      ...unusedCreditsContent,
    },
    database
  );
  await unsubscribeMarketingEmail({
    userId: 'user-1',
    database,
    now,
  });
  const optedOutRow = await client.execute({
    sql: 'SELECT status, last_error FROM customer_email_delivery WHERE dedupe_key = ?',
    args: ['reactivation:unsubscribe-test:user-1'],
  });
  assert.equal(optedOutRow.rows[0]?.status, 'suppressed');
  assert.equal(optedOutRow.rows[0]?.last_error, 'marketing_unsubscribed');

  await client.close();
  console.log('customer lifecycle and reactivation email verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
