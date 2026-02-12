import { getHeaderValue } from '@/shared/lib/cookie';

function readHeader(ctx: unknown, name: string): string {
  const v = getHeaderValue(ctx, name);
  return typeof v === 'string' ? v : '';
}

/**
 * Best-effort client IP from a BetterAuth/Next request context.
 *
 * Priority (as requested):
 * - cf-connecting-ip
 * - x-real-ip
 * - x-forwarded-for (first value)
 */
export function getClientIpFromCtx(ctx?: unknown): string {
  const cf = readHeader(ctx, 'cf-connecting-ip').trim();
  if (cf) return cf;

  const real = readHeader(ctx, 'x-real-ip').trim();
  if (real) return real;

  const xff = readHeader(ctx, 'x-forwarded-for');
  if (xff) {
    // x-forwarded-for can be "client, proxy1, proxy2"
    return xff.split(',')[0]?.trim() || '';
  }

  return '';
}

/**
 * Best-effort country/region code from common CDN headers.
 *
 * Priority:
 * - cf-ipcountry
 * - x-vercel-ip-country
 * - cloudfront-viewer-country
 * - x-country-code
 */
export function getCountryFromCtx(ctx?: unknown): string {
  const raw =
    readHeader(ctx, 'cf-ipcountry') ||
    readHeader(ctx, 'x-vercel-ip-country') ||
    readHeader(ctx, 'cloudfront-viewer-country') ||
    readHeader(ctx, 'x-country-code') ||
    '';

  return raw.trim().toUpperCase();
}
