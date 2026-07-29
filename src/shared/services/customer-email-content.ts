const BRAND = 'BabyBoogey';
const BRAND_COLOR = '#ef4444';
const DAY_MS = 24 * 60 * 60 * 1000;

export type CustomerEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export type CustomerEmailLocale = 'en' | 'ja' | 'zh';
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
  locale = 'en',
  marketingPostalAddress,
  unsubscribe,
}: {
  preheader: string;
  title: string;
  body: string[];
  details?: Array<[string, string]>;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
  locale?: CustomerEmailLocale;
  marketingPostalAddress?: string;
  unsubscribe?: {
    label: string;
    url: string;
  };
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
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"></head>`,
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
    marketingPostalAddress
      ? `<p style="margin:8px 0 0;color:#9ca3af;font-size:12px;line-height:1.5">${escapeEmailHtml(marketingPostalAddress)}</p>`
      : '',
    unsubscribe
      ? `<p style="margin:8px 0 0;font-size:12px;line-height:1.5"><a href="${escapeEmailHtml(unsubscribe.url)}" style="color:#6b7280">${escapeEmailHtml(unsubscribe.label)}</a></p>`
      : '',
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
    marketingPostalAddress || undefined,
    unsubscribe ? `${unsubscribe.label}: ${unsubscribe.url}` : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');

  return { html, text };
}

export function normalizeCustomerEmailLocale(
  locale: string | null | undefined
): CustomerEmailLocale {
  const normalized = String(locale || '')
    .trim()
    .toLowerCase();
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('ja')) return 'ja';
  return 'en';
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

export function buildUnusedCreditsReactivationEmail({
  customerName,
  remainingCredits,
  createUrl,
  unsubscribeUrl,
  marketingPostalAddress,
  locale: rawLocale,
}: {
  customerName: string;
  remainingCredits: number;
  createUrl: string;
  unsubscribeUrl: string;
  marketingPostalAddress: string;
  locale?: string | null;
}): CustomerEmailContent {
  const locale = normalizeCustomerEmailLocale(rawLocale);
  const greeting =
    customerName.trim() ||
    (locale === 'zh' ? '你好' : locale === 'ja' ? 'お客様' : 'there');
  const credits = Math.max(0, Math.floor(remainingCredits)).toLocaleString(
    locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US'
  );
  const copy = {
    en: {
      subject: `You still have ${credits} BabyBoogey credits`,
      preheader: `Your ${credits} remaining credits are ready for your next creation.`,
      title: 'Your BabyBoogey credits are waiting',
      body: [
        `Hi ${greeting}, you still have ${credits} credits available in your account.`,
        'Come back when you are ready to turn a baby photo into a short dance video. Your saved credits will be applied automatically.',
      ],
      cta: 'Use my credits',
      footer:
        'You are receiving this occasional product reminder because you have a BabyBoogey account.',
      unsubscribe: 'Unsubscribe from product reminders',
    },
    ja: {
      subject: `BabyBoogey のクレジットが ${credits} 残っています`,
      preheader: `残り ${credits} クレジットを次の作品に利用できます。`,
      title: 'クレジットを使って、続きを作りませんか？',
      body: [
        `${greeting}さん、アカウントには現在 ${credits} クレジットが残っています。`,
        '赤ちゃんの写真を短いダンス動画にしたくなったら、いつでも戻ってきてください。保存済みのクレジットは自動で適用されます。',
      ],
      cta: 'クレジットを使う',
      footer:
        'BabyBoogey アカウントをお持ちの方へ、プロダクトのお知らせとしてお送りしています。',
      unsubscribe: 'プロダクトのお知らせを停止',
    },
    zh: {
      subject: `你的 BabyBoogey 账户还有 ${credits} 积分可用`,
      preheader: `剩余 ${credits} 积分，可以继续创作宝宝跳舞视频。`,
      title: '你的 BabyBoogey 积分还在等你',
      body: [
        `${greeting}，你的账户目前还有 ${credits} 积分可用。`,
        '想继续把宝宝照片变成跳舞短视频时，随时回来创作；系统会自动使用账户中的剩余积分。',
      ],
      cta: '使用我的积分',
      footer: '你收到这封产品提醒，是因为你注册了 BabyBoogey 账户。',
      unsubscribe: '退订产品提醒',
    },
  }[locale];

  return {
    subject: copy.subject,
    ...renderEmailShell({
      preheader: copy.preheader,
      title: copy.title,
      body: copy.body,
      ctaLabel: copy.cta,
      ctaUrl: createUrl,
      footer: copy.footer,
      locale,
      marketingPostalAddress,
      unsubscribe: {
        label: copy.unsubscribe,
        url: unsubscribeUrl,
      },
    }),
  };
}

export function buildCheckoutAbandonedReactivationEmail({
  customerName,
  purchaseName,
  amount,
  currency,
  pricingUrl,
  unsubscribeUrl,
  marketingPostalAddress,
  locale: rawLocale,
}: {
  customerName: string;
  purchaseName: string;
  amount: number | null | undefined;
  currency: string | null | undefined;
  pricingUrl: string;
  unsubscribeUrl: string;
  marketingPostalAddress: string;
  locale?: string | null;
}): CustomerEmailContent {
  const locale = normalizeCustomerEmailLocale(rawLocale);
  const greeting =
    customerName.trim() ||
    (locale === 'zh' ? '你好' : locale === 'ja' ? 'お客様' : 'there');
  const formattedAmount = formatCustomerPaymentAmount(amount, currency);
  const copy = {
    en: {
      subject: 'You left a BabyBoogey checkout unfinished',
      preheader: 'Your BabyBoogey order is still unpaid.',
      title: 'Still thinking it over?',
      body: [
        `Hi ${greeting}, your recent BabyBoogey checkout was not completed and this order is still unpaid.`,
        'If you still want more credits or a clean download, review the current options and start a fresh secure checkout.',
      ],
      item: 'Item',
      amount: 'Checkout amount',
      cta: 'Review current options',
      footer:
        'You are receiving this occasional product reminder because you started a BabyBoogey checkout.',
      unsubscribe: 'Unsubscribe from product reminders',
    },
    ja: {
      subject: 'BabyBoogey の決済が完了していません',
      preheader: '最近の BabyBoogey 注文は未払いのままです。',
      title: 'もう少し検討しますか？',
      body: [
        `${greeting}さん、最近開始した BabyBoogey の決済は完了しておらず、この注文は未払いのままです。`,
        '追加クレジットや透かしなしのダウンロードをご希望の場合は、現在のプランを確認して新しい安全な決済を開始できます。',
      ],
      item: '内容',
      amount: '決済金額',
      cta: '現在のプランを見る',
      footer:
        'BabyBoogey の決済を開始した方へ、プロダクトのお知らせとしてお送りしています。',
      unsubscribe: 'プロダクトのお知らせを停止',
    },
    zh: {
      subject: '你的 BabyBoogey 结账还没有完成',
      preheader: '最近打开的 BabyBoogey 订单仍未支付。',
      title: '还在考虑吗？',
      body: [
        `${greeting}，你最近打开的 BabyBoogey 结账没有完成，这笔订单目前仍未支付。`,
        '如果你仍需要更多积分或无水印下载，可以查看当前方案并重新开启一次安全结账。',
      ],
      item: '购买内容',
      amount: '结账金额',
      cta: '查看当前方案',
      footer: '你收到这封产品提醒，是因为你曾打开 BabyBoogey 结账页面。',
      unsubscribe: '退订产品提醒',
    },
  }[locale];

  return {
    subject: copy.subject,
    ...renderEmailShell({
      preheader: copy.preheader,
      title: copy.title,
      body: copy.body,
      details: [
        [copy.item, purchaseName || 'BabyBoogey credits'],
        [copy.amount, formattedAmount],
      ],
      ctaLabel: copy.cta,
      ctaUrl: pricingUrl,
      footer: copy.footer,
      locale,
      marketingPostalAddress,
      unsubscribe: {
        label: copy.unsubscribe,
        url: unsubscribeUrl,
      },
    }),
  };
}
