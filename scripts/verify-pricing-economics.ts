import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BABY_IMAGE_COST_CREDITS } from '../src/shared/services/baby-image/config';
import {
  getVideoCostCredits,
  VIDEO_COST_CREDITS_PER_SECOND,
} from '../src/shared/services/baby-video/config';

type PricingItem = {
  product_id: string;
  amount: number;
  credits: number;
  interval: 'one-time' | 'month' | 'year';
  currency: string;
  price?: string;
  original_price?: string;
  group: string;
  valid_days?: number;
};

type PricingMessages = {
  page: {
    sections: {
      pricing: {
        groups: Array<{ name: string; is_featured?: boolean }>;
        items: PricingItem[];
      };
    };
  };
};

const locales = ['en', 'zh', 'ja', 'ko'] as const;
const expectedProducts: Record<
  string,
  Pick<PricingItem, 'amount' | 'credits' | 'interval' | 'group'>
> = {
  'starter-yearly': {
    amount: 8388,
    credits: 5160,
    interval: 'year',
    group: 'yearly',
  },
  'standard-yearly': {
    amount: 15948,
    credits: 14040,
    interval: 'year',
    group: 'yearly',
  },
  'premium-yearly': {
    amount: 30228,
    credits: 34560,
    interval: 'year',
    group: 'yearly',
  },
  'starter-monthly': {
    amount: 999,
    credits: 430,
    interval: 'month',
    group: 'monthly',
  },
  'standard-monthly': {
    amount: 1899,
    credits: 1170,
    interval: 'month',
    group: 'monthly',
  },
  'premium-monthly': {
    amount: 3599,
    credits: 2880,
    interval: 'month',
    group: 'monthly',
  },
  'single-video': {
    amount: 599,
    credits: 150,
    interval: 'one-time',
    group: 'credits',
  },
  starter: {
    amount: 1499,
    credits: 410,
    interval: 'one-time',
    group: 'credits',
  },
  standard: {
    amount: 2999,
    credits: 1170,
    interval: 'one-time',
    group: 'credits',
  },
  premium: {
    amount: 5999,
    credits: 3040,
    interval: 'one-time',
    group: 'credits',
  },
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as T;
}

function dollars(value: string | undefined): number {
  const parsed = Number(value?.match(/[0-9]+(?:\.[0-9]+)?/)?.[0]);
  invariant(Number.isFinite(parsed), `Could not parse price: ${value}`);
  return parsed;
}

function getProduct(items: PricingItem[], id: string): PricingItem {
  const item = items.find((candidate) => candidate.product_id === id);
  invariant(item, `Missing product ${id}`);
  return item;
}

const localePricing = new Map<(typeof locales)[number], PricingMessages>();

for (const locale of locales) {
  const path = `src/config/locale/messages/${locale}/pages/pricing.json`;
  const messages = readJson<PricingMessages>(path);
  localePricing.set(locale, messages);
  const pricing = messages.page.sections.pricing;
  const ids = pricing.items.map((item) => item.product_id);

  invariant(
    ids.length === Object.keys(expectedProducts).length,
    `${locale}: expected ${Object.keys(expectedProducts).length} products, found ${ids.length}`
  );
  invariant(
    new Set(ids).size === ids.length,
    `${locale}: duplicate product IDs`
  );
  invariant(
    pricing.groups.find((group) => group.name === 'yearly')?.is_featured,
    `${locale}: yearly must be the featured initial group`
  );

  for (const [id, expected] of Object.entries(expectedProducts)) {
    const item = getProduct(pricing.items, id);
    invariant(item.currency === 'USD', `${locale}/${id}: currency must be USD`);
    for (const field of ['amount', 'credits', 'interval', 'group'] as const) {
      invariant(
        item[field] === expected[field],
        `${locale}/${id}: ${field} must be ${expected[field]}, found ${item[field]}`
      );
    }
    if (item.interval === 'one-time' || item.interval === 'month') {
      invariant(
        !item.original_price,
        `${locale}/${id}: ${item.interval} products must not show a struck price`
      );
    }
  }
}

const enPricing = localePricing.get('en')!.page.sections.pricing;

for (const tier of ['starter', 'standard', 'premium'] as const) {
  const monthly = getProduct(enPricing.items, `${tier}-monthly`);
  const yearly = getProduct(enPricing.items, `${tier}-yearly`);
  const pack = getProduct(enPricing.items, tier);
  const expectedAnnual = Math.floor(monthly.amount * 0.7) * 12;

  invariant(
    yearly.amount === expectedAnnual,
    `${tier}: annual total must be twelve monthly equivalents at 30% off`
  );
  invariant(
    Math.abs(dollars(yearly.original_price) * 100 - monthly.amount) < 0.01,
    `${tier}: annual struck price must be the real monthly price`
  );

  const annualPerCredit = yearly.amount / yearly.credits;
  const monthlyPerCredit = monthly.amount / monthly.credits;
  const packPerCredit = pack.amount / pack.credits;
  invariant(
    annualPerCredit < monthlyPerCredit && monthlyPerCredit < packPerCredit,
    `${tier}: expected annual < monthly < top-up on a per-credit basis`
  );
}

invariant(
  VIDEO_COST_CREDITS_PER_SECOND['720p'] === 30 &&
    VIDEO_COST_CREDITS_PER_SECOND['1080p'] === 50,
  'Video rates must remain 30 credits/s at 720p and 50 credits/s at 1080p'
);
invariant(
  BABY_IMAGE_COST_CREDITS['2k'] === 50 && BABY_IMAGE_COST_CREDITS['4k'] === 70,
  'Image rates must remain 50 credits at 2K and 70 credits at 4K'
);
invariant(
  getVideoCostCredits('720p', 5) === 150,
  'A five-second 720p video must debit 150 credits'
);

// Internal direct-cost model. Provider inputs come from:
// https://kie.ai/kling-2.6-motion-control
// https://kie.ai/nano-banana-pro
// Payment inputs come from https://stripe.com/pricing and
// https://stripe.com/billing/pricing. The final reserve covers infrastructure
// variability.
const providerCostPerOutput = {
  video720PerSecond: 0.055,
  video1080PerSecond: 0.09,
  image2k: 0.09,
  image4k: 0.12,
};
const providerCostPerCredit = [
  providerCostPerOutput.video720PerSecond /
    VIDEO_COST_CREDITS_PER_SECOND['720p'],
  providerCostPerOutput.video1080PerSecond /
    VIDEO_COST_CREDITS_PER_SECOND['1080p'],
  providerCostPerOutput.image2k / BABY_IMAGE_COST_CREDITS['2k'],
  providerCostPerOutput.image4k / BABY_IMAGE_COST_CREDITS['4k'],
];
const premiumAnnual = getProduct(enPricing.items, 'premium-yearly');
const revenuePerCredit = premiumAnnual.amount / 100 / premiumAnnual.credits;
const paymentVariableRate = 0.029 + 0.015 + 0.01 + 0.007;
const paymentFixedRate = 0.3 / (premiumAnnual.amount / 100);
const infrastructureReserveRate = 0.02;

for (const costPerCredit of providerCostPerCredit) {
  const directCostRate =
    costPerCredit / revenuePerCredit +
    paymentVariableRate +
    paymentFixedRate +
    infrastructureReserveRate;
  const directCostMargin = 1 - directCostRate;
  invariant(
    directCostMargin > 0.7,
    `Worst-path direct-cost margin fell below the internal threshold: ${(directCostMargin * 100).toFixed(2)}%`
  );
}

const forbiddenCopy = [
  /70%/i,
  /gross margin|profit margin|AI cost|payment fee|storage buffer/i,
  /毛利|利润底线|AI 成本|支付手续费|存储缓冲/,
  /promotion codes?.*(disabled|off)|welcome credits?.*(disabled|off)/i,
  /优惠码.*关闭|欢迎积分.*关闭/,
];

for (const locale of locales) {
  const pricingPath = `src/config/locale/messages/${locale}/pages/pricing.json`;
  const videoPath = `src/config/locale/messages/${locale}/ai/video.json`;
  const pricingText = readFileSync(resolve(process.cwd(), pricingPath), 'utf8');
  const videoMessages = readJson<Record<string, unknown>>(videoPath);
  const modalText = JSON.stringify(
    (videoMessages as UnsafeAny).generator.insufficient_credits_modal
  );
  for (const pattern of forbiddenCopy) {
    invariant(
      !pattern.test(pricingText),
      `${locale}: forbidden pricing copy ${pattern}`
    );
    invariant(
      !pattern.test(modalText),
      `${locale}: forbidden modal copy ${pattern}`
    );
  }
}

const insufficientCreditsModalSource = readFileSync(
  resolve(
    process.cwd(),
    'src/shared/components/insufficient-credits-modal.tsx'
  ),
  'utf8'
);
invariant(
  !insufficientCreditsModalSource.includes('window.setTimeout'),
  'Insufficient-credits modal must not auto-switch pricing intervals'
);
invariant(
  insufficientCreditsModalSource.includes("preferredInterval: 'month'"),
  'Insufficient-credits modal must keep monthly pricing as its recommendation'
);

const pricingBlockSource = readFileSync(
  resolve(process.cwd(), 'src/themes/default/blocks/pricing.tsx'),
  'utf8'
);
invariant(
  !pricingBlockSource.includes('Math.round(rawCredits / 12)'),
  'Annual pricing cards must display the full yearly credit grant'
);
invariant(
  pricingBlockSource.includes("yearly: t('credits_yearly')"),
  'Annual pricing cards must use a yearly credit unit'
);

console.log(
  `Pricing economics verified for ${locales.length} locales, ${Object.keys(expectedProducts).length} products, and all four generation paths.`
);
