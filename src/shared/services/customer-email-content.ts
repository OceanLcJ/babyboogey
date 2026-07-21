const BRAND = 'BabyBoogey';
const BRAND_COLOR = '#ef4444';
const DAY_MS = 24 * 60 * 60 * 1000;

export type CustomerEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export type SubscriptionReminderMilestone = 1 | 7;
export type SubscriptionReminderMode = 'ending' | 'renewal' | 'trial';

export function escapeEmailHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderEmailShell({
  preheader,
  title,
  body,
  details = [],
  ctaLabel,
  ctaUrl,
  footer,
}: {
  preheader: string;
  title: string;
  body: string[];
  details?: Array<[string, string]>;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
}): { html: string; text: string } {
  const paragraphs = body
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6">${escapeEmailHtml(paragraph)}</p>`
    )
    .join('');
  const rows = details
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="padding:8px 16px 8px 0;color:#6b7280;font-size:14px;font-weight:500">${escapeEmailHtml(label)}</th><td style="padding:8px 0;color:#111827;font-size:14px">${escapeEmailHtml(value)}</td></tr>`
    )
    .join('');

  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"></head>',
    '<body style="margin:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif">',
    `<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeEmailHtml(preheader)}</span>`,
    '<div style="max-width:600px;margin:0 auto;padding:32px 16px">',
    '<div style="border-radius:16px;background:#ffffff;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08)">',
    `<p style="margin:0 0 24px;color:${BRAND_COLOR};font-size:20px;font-weight:800">${BRAND}</p>`,
    `<h1 style="margin:0 0 20px;color:#111827;font-size:28px;line-height:1.25">${escapeEmailHtml(title)}</h1>`,
    paragraphs,
    rows
      ? `<table role="presentation" style="width:100%;margin:8px 0 24px;border-collapse:collapse">${rows}</table>`
      : '',
    `<a href="${escapeEmailHtml(ctaUrl)}" style="display:inline-block;border-radius:10px;background:${BRAND_COLOR};padding:12px 20px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">${escapeEmailHtml(ctaLabel)}</a>`,
    '<hr style="margin:32px 0 20px;border:0;border-top:1px solid #e5e7eb">',
    `<p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5">${escapeEmailHtml(footer)}</p>`,
    '</div></div></body></html>',
  ].join('');

  const text = [
    BRAND,
    '',
    title,
    '',
    ...body.flatMap((paragraph) => [paragraph, '']),
    ...details.map(([label, value]) => `${label}: ${value}`),
    details.length > 0 ? '' : undefined,
    `${ctaLabel}: ${ctaUrl}`,
    '',
    footer,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');

  return { html, text };
}

export function formatCustomerPaymentAmount(
  amount: number | null | undefined,
  currency: string | null | undefined
): string {
  if (amount === null || amount === undefined || !currency) {
    return 'Amount unavailable';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function formatCustomerEmailDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

export function getSubscriptionReminderMilestones(
  periodEnd: Date,
  now: Date
): SubscriptionReminderMilestone[] {
  const remainingMs = periodEnd.getTime() - now.getTime();
  if (remainingMs <= 0 || remainingMs > 7 * DAY_MS) return [];
  if (remainingMs <= DAY_MS) return [1];
  if (remainingMs > 6 * DAY_MS) return [7];
  return [];
}

export function getSubscriptionReminderMode(
  status: string
): SubscriptionReminderMode | null {
  if (status === 'trialing') return 'trial';
  if (status === 'pending_cancel') return 'ending';
  if (status === 'active') return 'renewal';
  return null;
}

export function buildWelcomeEmail({
  customerName,
  createUrl,
}: {
  customerName: string;
  createUrl: string;
}): CustomerEmailContent {
  const greeting = customerName.trim() || 'there';
  const subject = 'Welcome to BabyBoogey — create your first baby dance';
  return {
    subject,
    ...renderEmailShell({
      preheader: 'Your BabyBoogey account and welcome credits are ready.',
      title: `Welcome to BabyBoogey, ${greeting}`,
      body: [
        'Your account is ready and your welcome credits have been added.',
        'Upload one baby photo, choose a dance, and create your first short video. Free previews include a BabyBoogey watermark.',
      ],
      ctaLabel: 'Create your first dance',
      ctaUrl: createUrl,
      footer:
        'You are receiving this transactional email because you created a BabyBoogey account.',
    }),
  };
}

export function buildVerificationEmail({
  verificationUrl,
}: {
  verificationUrl: string;
}): CustomerEmailContent {
  const subject = 'Verify your BabyBoogey email';
  return {
    subject,
    ...renderEmailShell({
      preheader: 'Verify your email address to finish setting up BabyBoogey.',
      title: 'Verify your email address',
      body: [
        'Use the button below to verify your email address. This link expires after 24 hours.',
        'If you did not create a BabyBoogey account, you can safely ignore this email.',
      ],
      ctaLabel: 'Verify email',
      ctaUrl: verificationUrl,
      footer: 'This is a security email for your BabyBoogey account.',
    }),
  };
}

export function buildCustomerPaymentReceiptEmail({
  customerName,
  amount,
  currency,
  purchaseName,
  provider,
  referenceId,
  periodEnd,
  billingUrl,
}: {
  customerName: string;
  amount: number | null | undefined;
  currency: string | null | undefined;
  purchaseName: string;
  provider: string;
  referenceId: string;
  periodEnd?: Date | null;
  billingUrl: string;
}): CustomerEmailContent {
  const formattedAmount = formatCustomerPaymentAmount(amount, currency);
  const details: Array<[string, string]> = [
    ['Amount', formattedAmount],
    ['Purchase', purchaseName || 'BabyBoogey purchase'],
    ['Payment provider', provider],
    ['Reference', referenceId],
  ];
  if (periodEnd) {
    details.push([
      'Current access through',
      formatCustomerEmailDate(periodEnd),
    ]);
  }

  const subject = `Payment confirmed — ${formattedAmount}`;
  return {
    subject,
    ...renderEmailShell({
      preheader: `Your BabyBoogey payment of ${formattedAmount} is confirmed.`,
      title: 'Your payment is confirmed',
      body: [
        `Hi ${customerName.trim() || 'there'}, your payment was successful.`,
        'Your credits, subscription access, or clean video download have already been added to your account.',
      ],
      details,
      ctaLabel: 'View payments',
      ctaUrl: billingUrl,
      footer:
        'This is a transactional receipt for a payment on your BabyBoogey account.',
    }),
  };
}

export function buildOperatorPaymentAlertEmail({
  amount,
  currency,
  customerEmail,
  customerName,
  purchaseName,
  provider,
  referenceId,
}: {
  amount: number | null | undefined;
  currency: string | null | undefined;
  customerEmail: string;
  customerName: string;
  purchaseName: string;
  provider: string;
  referenceId: string;
}): CustomerEmailContent {
  const formattedAmount = formatCustomerPaymentAmount(amount, currency);
  const subject = `[BabyBoogey] 收到一笔 ${formattedAmount} 付款`;
  return {
    subject,
    ...renderEmailShell({
      preheader: subject,
      title: 'BabyBoogey 收到新付款',
      body: ['付款已成功，相关积分、订阅权益或视频解锁已完成发放。'],
      details: [
        ['付款金额', formattedAmount],
        ['客户姓名', customerName || '未填写'],
        ['客户邮箱', customerEmail],
        ['购买内容', purchaseName || 'BabyBoogey purchase'],
        ['支付渠道', provider],
        ['付款引用', referenceId],
      ],
      ctaLabel: '打开管理后台',
      ctaUrl: 'https://www.babyboogey.com/admin/payments',
      footer: '这是 BabyBoogey 的内部付款通知。',
    }),
  };
}

export function buildSubscriptionReminderEmail({
  customerName,
  planName,
  periodEnd,
  daysBefore,
  mode,
  billingUrl,
}: {
  customerName: string;
  planName: string;
  periodEnd: Date;
  daysBefore: SubscriptionReminderMilestone;
  mode: SubscriptionReminderMode;
  billingUrl: string;
}): CustomerEmailContent {
  const timing = daysBefore === 1 ? 'tomorrow' : 'in 7 days';
  const action =
    mode === 'trial'
      ? 'trial ends'
      : mode === 'ending'
        ? 'subscription ends'
        : 'subscription renews';
  const subject = `Your BabyBoogey ${action} ${timing}`;
  const body =
    mode === 'trial'
      ? [
          `Hi ${customerName.trim() || 'there'}, your ${planName} trial ends ${timing}.`,
          'Review your billing details to keep access after the trial.',
        ]
      : mode === 'ending'
        ? [
            `Hi ${customerName.trim() || 'there'}, your ${planName} subscription ends ${timing}.`,
            'Paid access will stop on that date. You can reactivate from Billing before the period ends.',
          ]
        : [
            `Hi ${customerName.trim() || 'there'}, your ${planName} subscription renews ${timing}.`,
            'Your saved payment method will be charged automatically unless you change or cancel the subscription.',
          ];

  return {
    subject,
    ...renderEmailShell({
      preheader: subject,
      title: subject,
      body,
      details: [
        ['Plan', planName],
        [
          mode === 'trial' ? 'Trial end date' : 'Period end',
          formatCustomerEmailDate(periodEnd),
        ],
      ],
      ctaLabel: 'Manage subscription',
      ctaUrl: billingUrl,
      footer:
        'This is a transactional reminder about your BabyBoogey subscription.',
    }),
  };
}
