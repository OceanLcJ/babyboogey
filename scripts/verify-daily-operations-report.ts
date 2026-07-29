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
  const {
    buildDailyOperationsReportEmail,
    collectD1DailyBusinessMetrics,
    createGa4AccessToken,
    getDailyReportWindow,
    queryGa4ActiveUsers,
    runDailyOperationsReport,
    shouldCreateDailyOperationsReport,
  } = await import('@/shared/services/daily-operations-report');
  const { attemptOperatorEmailDelivery, queueOperatorEmail } =
    await import('@/shared/models/operator-email-delivery');

  const client = createClient({ url: 'file::memory:' });
  await client.executeMultiple(`
    CREATE TABLE "user" (
      "id" text PRIMARY KEY NOT NULL,
      "created_at"
    );
    CREATE TABLE "order" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "status" text NOT NULL,
      "payment_amount" integer,
      "paid_at"
    );
  `);
  const migration = await readFile(
    resolve(
      process.cwd(),
      'src/config/db/migrations-d1/0006_daily_operations_report.sql'
    ),
    'utf8'
  );
  await client.executeMultiple(migration);

  const d1Database = {
    prepare(sql: string) {
      return {
        bind(...args: Array<string | number>) {
          return {
            async first() {
              const result = await client.execute({ sql, args });
              return result.rows[0] ?? null;
            },
          };
        },
      };
    },
  } as UnsafeAny;
  const database = drizzle(client) as UnsafeAny;

  const reportNow = new Date('2026-07-22T00:00:00.000Z');
  const window = getDailyReportWindow(reportNow);
  assert.equal(window.reportDate, '2026-07-21');
  assert.equal(window.start.toISOString(), '2026-07-20T16:00:00.000Z');
  assert.equal(window.end.toISOString(), '2026-07-21T16:00:00.000Z');
  assert.equal(shouldCreateDailyOperationsReport(reportNow), true);
  assert.equal(
    shouldCreateDailyOperationsReport(new Date('2026-07-21T23:59:59.999Z')),
    false
  );

  await client.batch([
    {
      sql: 'INSERT INTO "user" (id, created_at) VALUES (?, ?)',
      args: ['user-integer', window.start.getTime() + 60_000],
    },
    {
      sql: 'INSERT INTO "user" (id, created_at) VALUES (?, ?)',
      args: [
        'user-iso',
        new Date(window.start.getTime() + 120_000).toISOString(),
      ],
    },
    {
      sql: 'INSERT INTO "user" (id, created_at) VALUES (?, ?)',
      args: ['user-next-day', window.end.getTime()],
    },
    {
      sql: 'INSERT INTO "order" (id, user_id, status, payment_amount, paid_at) VALUES (?, ?, ?, ?, ?)',
      args: [
        'order-1',
        'user-integer',
        'paid',
        299,
        window.start.getTime() + 180_000,
      ],
    },
    {
      sql: 'INSERT INTO "order" (id, user_id, status, payment_amount, paid_at) VALUES (?, ?, ?, ?, ?)',
      args: [
        'order-2',
        'user-integer',
        'paid',
        499,
        window.start.getTime() + 240_000,
      ],
    },
    {
      sql: 'INSERT INTO "order" (id, user_id, status, payment_amount, paid_at) VALUES (?, ?, ?, ?, ?)',
      args: [
        'order-free',
        'user-iso',
        'paid',
        0,
        window.start.getTime() + 300_000,
      ],
    },
    {
      sql: 'INSERT INTO "order" (id, user_id, status, payment_amount, paid_at) VALUES (?, ?, ?, ?, ?)',
      args: [
        'order-failed',
        'user-iso',
        'failed',
        999,
        window.start.getTime() + 360_000,
      ],
    },
  ]);

  assert.deepEqual(await collectD1DailyBusinessMetrics(d1Database, window), {
    registrations: 2,
    payers: 1,
  });

  const generatedKey = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
  const exportedKey = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', generatedKey.privateKey)
  );
  const privateKeyBase64 = Buffer.from(exportedKey).toString('base64');
  const serviceAccountJson = JSON.stringify({
    client_email: 'babyboogey-report@example.iam.gserviceaccount.com',
    private_key: `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64}\n-----END PRIVATE KEY-----\n`,
    token_uri: 'https://oauth2.googleapis.com/token',
  });
  let tokenCalls = 0;
  const tokenFetch = (async (input: UnsafeAny, init?: RequestInit) => {
    tokenCalls += 1;
    assert.equal(String(input), 'https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(String(init?.body));
    assert.equal(
      form.get('grant_type'),
      'urn:ietf:params:oauth:grant-type:jwt-bearer'
    );
    const assertion = String(form.get('assertion'));
    assert.equal(assertion.split('.').length, 3);
    const claims = JSON.parse(
      Buffer.from(assertion.split('.')[1], 'base64url').toString('utf8')
    );
    assert.equal(
      claims.scope,
      'https://www.googleapis.com/auth/analytics.readonly'
    );
    return Response.json({ access_token: 'signed-test-token' });
  }) as typeof fetch;
  assert.equal(
    await createGa4AccessToken({
      serviceAccountJson,
      fetchFn: tokenFetch,
      now: reportNow,
    }),
    'signed-test-token'
  );
  assert.equal(tokenCalls, 1);

  let analyticsCalls = 0;
  const analyticsFetch = (async (input: UnsafeAny, init?: RequestInit) => {
    analyticsCalls += 1;
    assert.match(String(input), /properties\/522640605:runReport$/);
    assert.match(
      String(init?.headers && JSON.stringify(init.headers)),
      /Bearer test-access-token/
    );
    const requestBody = JSON.parse(String(init?.body));
    assert.deepEqual(requestBody.dateRanges, [
      { startDate: '2026-07-21', endDate: '2026-07-21' },
    ]);
    assert.deepEqual(requestBody.metrics, [{ name: 'activeUsers' }]);
    return Response.json({
      rows: [{ metricValues: [{ value: '42' }] }],
      metadata: { timeZone: 'Asia/Shanghai' },
    });
  }) as typeof fetch;
  assert.equal(
    await queryGa4ActiveUsers({
      propertyId: '522640605',
      serviceAccountJson,
      reportDate: window.reportDate,
      fetchFn: analyticsFetch,
      accessTokenProvider: async () => 'test-access-token',
    }),
    42
  );

  const content = buildDailyOperationsReportEmail({
    reportDate: window.reportDate,
    generatedAt: reportNow,
    metrics: {
      activeUsers: 42,
      registrations: 2,
      payers: 1,
      health: { online: true, statusCode: 200, latencyMs: 83 },
    },
  });
  assert.match(content.subject, /2026-07-21/);
  assert.match(content.text, /GA4 活跃用户：42/);
  assert.match(content.text, /新注册：2/);
  assert.match(content.text, /付款人数：1/);
  assert.match(content.text, /网站状态：在线/);

  let emailCalls = 0;
  const emailService = {
    async sendEmail(message: UnsafeAny) {
      emailCalls += 1;
      assert.equal(message.to, '2113191149@qq.com');
      assert.match(message.subject, /BabyBoogey 日报/);
      return { success: true, messageId: 'cf-daily-report-1' };
    },
  } as UnsafeAny;
  const runOptions = {
    database,
    d1Database,
    emailService,
    recipient: '2113191149@qq.com',
    ga4PropertyId: '522640605',
    ga4ServiceAccountJson: serviceAccountJson,
    baseUrl: 'https://www.babyboogey.com',
    now: reportNow,
    fetchFn: analyticsFetch,
    ga4AccessTokenProvider: async () => 'test-access-token',
    healthCheck: async () => ({
      online: true,
      statusCode: 200,
      latencyMs: 83,
    }),
  };
  const firstRun = await runDailyOperationsReport(runOptions);
  const secondRun = await runDailyOperationsReport(runOptions);
  assert.equal(firstRun.queued, true);
  assert.equal(firstRun.deliveries.sent, 1);
  assert.equal(secondRun.queued, false);
  assert.equal(emailCalls, 1, 'same report date must send only once');
  assert.equal(analyticsCalls, 2, 'direct query plus first report only');

  const stored = await client.execute({
    sql: 'SELECT status, attempts, provider_message_id FROM operator_email_delivery WHERE dedupe_key = ?',
    args: ['daily-operations-report:2026-07-21'],
  });
  assert.equal(stored.rows[0]?.status, 'sent');
  assert.equal(Number(stored.rows[0]?.attempts), 1);
  assert.equal(stored.rows[0]?.provider_message_id, 'cf-daily-report-1');

  await client.execute('DELETE FROM operator_email_delivery');
  let concurrentCalls = 0;
  const concurrentService = {
    async sendEmail() {
      concurrentCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { success: true, messageId: 'cf-daily-report-concurrent' };
    },
  } as UnsafeAny;
  await queueOperatorEmail(
    {
      kind: 'daily_operations_report',
      dedupeKey: 'daily-operations-report:concurrent',
      reportDate: '2026-07-21',
      recipient: '2113191149@qq.com',
      ...content,
    },
    database
  );
  await Promise.all([
    attemptOperatorEmailDelivery('daily-operations-report:concurrent', {
      database,
      emailService: concurrentService,
    }),
    attemptOperatorEmailDelivery('daily-operations-report:concurrent', {
      database,
      emailService: concurrentService,
    }),
  ]);
  assert.equal(
    concurrentCalls,
    1,
    'atomic claim must prevent duplicate reports'
  );

  await client.close();
  console.log('daily operations report verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
