import { envConfigs } from '@/config';
import type { EmailManager } from '@/extensions/email';
import {
  DAILY_OPERATIONS_REPORT_KIND,
  hasOperatorEmailDelivery,
  queueOperatorEmail,
  retryOperatorEmailDeliveries,
} from '@/shared/models/operator-email-delivery';

const DAY_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const REPORT_START_HOUR = 8;
const ANALYTICS_TIMEOUT_MS = 15_000;

export interface DailyReportWindow {
  reportDate: string;
  start: Date;
  end: Date;
  localHour: number;
}

export interface DailyBusinessMetrics {
  registrations: number;
  payers: number;
}

export interface WebsiteHealth {
  online: boolean;
  statusCode: number | null;
  latencyMs: number;
  detail?: string;
}

export interface DailyOperationsMetrics extends DailyBusinessMetrics {
  activeUsers: number | null;
  visitorError?: string;
  businessError?: string;
  health: WebsiteHealth;
}

export interface DailyOperationsReportContent {
  subject: string;
  html: string;
  text: string;
}

type FetchLike = typeof fetch;

interface Ga4ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

type Ga4AccessTokenProvider = (options: {
  serviceAccountJson: string;
  fetchFn: FetchLike;
  now?: Date;
}) => Promise<string>;

function boundedMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 180);
  return String(error).slice(0, 180);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatShanghaiDateTime(date: Date): string {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  return `${shifted.toISOString().slice(0, 10)} ${shifted
    .toISOString()
    .slice(11, 19)}`;
}

export function getDailyReportWindow(now = new Date()): DailyReportWindow {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const currentLocalDayStart =
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate()
    ) - SHANGHAI_OFFSET_MS;
  const end = new Date(currentLocalDayStart);
  const start = new Date(currentLocalDayStart - DAY_MS);
  const reportDate = new Date(start.getTime() + SHANGHAI_OFFSET_MS)
    .toISOString()
    .slice(0, 10);

  return {
    reportDate,
    start,
    end,
    localHour: shifted.getUTCHours(),
  };
}

export function shouldCreateDailyOperationsReport(now = new Date()): boolean {
  return getDailyReportWindow(now).localHour >= REPORT_START_HOUR;
}

export async function collectD1DailyBusinessMetrics(
  d1Database: UnsafeAny,
  window: Pick<DailyReportWindow, 'start' | 'end'>
): Promise<DailyBusinessMetrics> {
  const normalizeTimestamp = (column: string) => `
    CASE
      WHEN typeof(${column}) IN ('integer', 'real')
        THEN CAST(${column} AS INTEGER)
      ELSE CAST((julianday(${column}) - 2440587.5) * 86400000 AS INTEGER)
    END`;
  const query = `
    SELECT
      (
        SELECT COUNT(*)
        FROM "user"
        WHERE ${normalizeTimestamp('created_at')} >= ?1
          AND ${normalizeTimestamp('created_at')} < ?2
      ) AS registrations,
      (
        SELECT COUNT(DISTINCT user_id)
        FROM "order"
        WHERE status = 'paid'
          AND COALESCE(payment_amount, 0) > 0
          AND paid_at IS NOT NULL
          AND ${normalizeTimestamp('paid_at')} >= ?1
          AND ${normalizeTimestamp('paid_at')} < ?2
      ) AS payers
  `;
  const result = await d1Database
    .prepare(query)
    .bind(window.start.getTime(), window.end.getTime())
    .first();

  return {
    registrations: Number(result?.registrations ?? 0),
    payers: Number(result?.payers ?? 0),
  };
}

function base64UrlEncode(value: string | Uint8Array): string {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function parseServiceAccountJson(value: string): Ga4ServiceAccountCredentials {
  if (!value.trim()) {
    throw new Error('GA4 service account is not configured');
  }
  let parsed: Partial<Ga4ServiceAccountCredentials>;
  try {
    parsed = JSON.parse(value) as Partial<Ga4ServiceAccountCredentials>;
  } catch {
    throw new Error('GA4 service account JSON is invalid');
  }
  if (!parsed.client_email?.trim() || !parsed.private_key?.trim()) {
    throw new Error('GA4 service account JSON is incomplete');
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key.replaceAll('\\n', '\n'),
    token_uri: parsed.token_uri,
  };
}

function pemPrivateKeyToBuffer(pem: string): ArrayBuffer {
  const normalized = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/gu, '');
  if (!normalized)
    throw new Error('GA4 service account private key is invalid');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export async function createGa4AccessToken({
  serviceAccountJson,
  fetchFn = fetch,
  now = new Date(),
}: {
  serviceAccountJson: string;
  fetchFn?: FetchLike;
  now?: Date;
}): Promise<string> {
  const credentials = parseServiceAccountJson(serviceAccountJson);
  const issuedAt = Math.floor(now.getTime() / 1000);
  const tokenUri =
    credentials.token_uri || 'https://oauth2.googleapis.com/token';
  const encodedHeader = base64UrlEncode(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  );
  const encodedClaims = base64UrlEncode(
    JSON.stringify({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: tokenUri,
      iat: issuedAt,
      exp: issuedAt + 3600,
    })
  );
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemPrivateKeyToBuffer(credentials.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  const assertion = `${signingInput}.${base64UrlEncode(
    new Uint8Array(signature)
  )}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYTICS_TIMEOUT_MS);
  try {
    const response = await fetchFn(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: controller.signal,
    });
    const payload = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !payload.access_token) {
      throw new Error(
        payload.error_description ||
          payload.error ||
          `Google OAuth returned HTTP ${response.status}`
      );
    }
    return payload.access_token;
  } finally {
    clearTimeout(timeout);
  }
}

export async function queryGa4ActiveUsers({
  propertyId,
  serviceAccountJson,
  reportDate,
  fetchFn = fetch,
  accessTokenProvider = createGa4AccessToken,
}: {
  propertyId: string;
  serviceAccountJson: string;
  reportDate: string;
  fetchFn?: FetchLike;
  accessTokenProvider?: Ga4AccessTokenProvider;
}): Promise<number> {
  if (!/^\d+$/u.test(propertyId)) {
    throw new Error('GA4 property ID is missing or invalid');
  }
  const accessToken = await accessTokenProvider({
    serviceAccountJson,
    fetchFn,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYTICS_TIMEOUT_MS);
  try {
    const response = await fetchFn(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: reportDate, endDate: reportDate }],
          metrics: [{ name: 'activeUsers' }],
        }),
        signal: controller.signal,
      }
    );
    const payload = (await response.json()) as {
      rows?: Array<{ metricValues?: Array<{ value?: string }> }>;
      metadata?: { timeZone?: string };
      error?: { message?: string };
    };
    if (!response.ok || payload.error) {
      throw new Error(
        payload.error?.message ||
          `GA4 Data API returned HTTP ${response.status}`
      );
    }
    if (
      payload.metadata?.timeZone &&
      payload.metadata.timeZone !== 'Asia/Shanghai'
    ) {
      throw new Error(`GA4 property timezone is ${payload.metadata.timeZone}`);
    }
    const activeUsers = Number(
      payload.rows?.[0]?.metricValues?.[0]?.value ?? 0
    );
    if (!Number.isFinite(activeUsers) || activeUsers < 0) {
      throw new Error('GA4 returned an invalid active-user count');
    }
    return activeUsers;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkWebsiteWithFetch(
  baseUrl: string,
  fetchFn: FetchLike = fetch
): Promise<WebsiteHealth> {
  const startedAt = Date.now();
  try {
    const response = await fetchFn(new URL('/robots.txt', baseUrl), {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': 'BabyBoogey-Daily-Operations-Report/1.0' },
    });
    await response.body?.cancel();
    return {
      online: response.ok,
      statusCode: response.status,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      online: false,
      statusCode: null,
      latencyMs: Date.now() - startedAt,
      detail: boundedMessage(error),
    };
  }
}

function metricCard(label: string, value: string, accent: string): string {
  return `<td style="width:50%;padding:6px"><div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;background:#ffffff"><div style="font-size:12px;color:#6b7280">${escapeHtml(label)}</div><div style="margin-top:6px;font-size:24px;font-weight:700;color:${accent}">${escapeHtml(value)}</div></div></td>`;
}

export function buildDailyOperationsReportEmail({
  reportDate,
  generatedAt,
  metrics,
}: {
  reportDate: string;
  generatedAt: Date;
  metrics: DailyOperationsMetrics;
}): DailyOperationsReportContent {
  const visitorValue =
    metrics.activeUsers === null ? '暂不可用' : String(metrics.activeUsers);
  const registrationValue = metrics.businessError
    ? '暂不可用'
    : String(metrics.registrations);
  const payerValue = metrics.businessError
    ? '暂不可用'
    : String(metrics.payers);
  const healthValue = metrics.health.online ? '在线' : '异常';
  const healthDetail = metrics.health.statusCode
    ? `HTTP ${metrics.health.statusCode} · ${metrics.health.latencyMs}ms`
    : metrics.health.detail || '未获得 HTTP 响应';
  const warnings = [
    metrics.visitorError ? `访问人数：${metrics.visitorError}` : '',
    metrics.businessError ? `业务数据：${metrics.businessError}` : '',
    !metrics.health.online ? `在线检查：${healthDetail}` : '',
  ].filter(Boolean);

  const subject = `[BabyBoogey 日报] ${reportDate} · ${healthValue}`;
  const warningHtml = warnings.length
    ? `<div style="margin-top:18px;padding:12px 14px;border-radius:10px;background:#fff7ed;color:#9a3412"><strong>数据提示</strong><br>${warnings.map(escapeHtml).join('<br>')}</div>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827"><div style="max-width:720px;margin:0 auto;padding:28px 16px"><div style="background:#111827;border-radius:16px 16px 0 0;padding:24px;color:#ffffff"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd">BabyBoogey Operations</div><h1 style="margin:8px 0 0;font-size:24px">每日运营简报</h1><p style="margin:8px 0 0;color:#d1d5db">统计日期：${escapeHtml(reportDate)}（北京时间）</p></div><div style="background:#ffffff;border-radius:0 0 16px 16px;padding:18px"><table role="presentation" style="width:100%;border-collapse:collapse"><tr>${metricCard('GA4 活跃用户', visitorValue, '#2563eb')}${metricCard('新注册', registrationValue, '#7c3aed')}</tr><tr>${metricCard('付款人数', payerValue, '#059669')}${metricCard('网站状态', healthValue, metrics.health.online ? '#059669' : '#dc2626')}</tr></table><div style="margin-top:18px;padding:14px;border-radius:10px;background:#f9fafb;color:#4b5563;font-size:13px;line-height:1.7"><strong>在线检查</strong>：${escapeHtml(healthDetail)}<br><strong>统计口径</strong>：访问人数为 GA4 activeUsers（早上 8 点快照，后续可能回补）；注册为 D1 新增用户；付款为正金额且已支付的去重用户。</div>${warningHtml}<p style="margin:18px 0 0;color:#9ca3af;font-size:12px">生成时间：${escapeHtml(formatShanghaiDateTime(generatedAt))}（北京时间）</p></div></div></body></html>`;
  const text = [
    `BabyBoogey 每日运营简报`,
    `统计日期：${reportDate}（北京时间）`,
    `GA4 活跃用户：${visitorValue}`,
    `新注册：${registrationValue}`,
    `付款人数：${payerValue}`,
    `网站状态：${healthValue}（${healthDetail}）`,
    `统计口径：访问人数为 GA4 activeUsers（早上 8 点快照，后续可能回补）；注册为 D1 新增用户；付款为正金额且已支付的去重用户。`,
    ...warnings.map((warning) => `提示：${warning}`),
    `生成时间：${formatShanghaiDateTime(generatedAt)}（北京时间）`,
  ].join('\n');

  return { subject, html, text };
}

export async function runDailyOperationsReport({
  database,
  d1Database,
  emailService,
  recipient = envConfigs.daily_report_email,
  ga4PropertyId = envConfigs.ga4_property_id,
  ga4ServiceAccountJson = envConfigs.ga4_service_account_json,
  baseUrl = envConfigs.app_url,
  now = new Date(),
  fetchFn = fetch,
  ga4AccessTokenProvider = createGa4AccessToken,
  healthCheck,
}: {
  database?: UnsafeAny;
  d1Database: UnsafeAny;
  emailService?: EmailManager;
  recipient?: string;
  ga4PropertyId?: string;
  ga4ServiceAccountJson?: string;
  baseUrl?: string;
  now?: Date;
  fetchFn?: FetchLike;
  ga4AccessTokenProvider?: Ga4AccessTokenProvider;
  healthCheck?: () => Promise<WebsiteHealth>;
}): Promise<{
  reportDate: string;
  queued: boolean;
  deliveries: { attempted: number; sent: number };
}> {
  const window = getDailyReportWindow(now);
  let queued = false;

  if (recipient.trim() && shouldCreateDailyOperationsReport(now)) {
    const dedupeKey = `daily-operations-report:${window.reportDate}`;
    const exists = await hasOperatorEmailDelivery(dedupeKey, database);
    if (!exists) {
      const [visitorResult, businessResult, healthResult] = await Promise.all([
        queryGa4ActiveUsers({
          propertyId: ga4PropertyId,
          serviceAccountJson: ga4ServiceAccountJson,
          reportDate: window.reportDate,
          fetchFn,
          accessTokenProvider: ga4AccessTokenProvider,
        })
          .then((value) => ({ value, error: '' }))
          .catch((error) => ({ value: null, error: boundedMessage(error) })),
        collectD1DailyBusinessMetrics(d1Database, window)
          .then((value) => ({ value, error: '' }))
          .catch((error) => ({
            value: { registrations: 0, payers: 0 },
            error: boundedMessage(error),
          })),
        (healthCheck ? healthCheck() : checkWebsiteWithFetch(baseUrl, fetchFn))
          .then((value) => value)
          .catch((error) => ({
            online: false,
            statusCode: null,
            latencyMs: 0,
            detail: boundedMessage(error),
          })),
      ]);
      const content = buildDailyOperationsReportEmail({
        reportDate: window.reportDate,
        generatedAt: now,
        metrics: {
          activeUsers: visitorResult.value,
          visitorError: visitorResult.error || undefined,
          registrations: businessResult.value.registrations,
          payers: businessResult.value.payers,
          businessError: businessResult.error || undefined,
          health: healthResult,
        },
      });
      await queueOperatorEmail(
        {
          kind: DAILY_OPERATIONS_REPORT_KIND,
          dedupeKey,
          reportDate: window.reportDate,
          recipient,
          ...content,
        },
        database
      );
      queued = true;
    }
  }

  const deliveries = await retryOperatorEmailDeliveries({
    database,
    emailService,
    limit: 10,
  });
  console.info('[daily-operations-report] maintenance complete', {
    reportDate: window.reportDate,
    queued,
    deliveries,
  });
  return { reportDate: window.reportDate, queued, deliveries };
}
