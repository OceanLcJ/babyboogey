import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import createIntlMiddleware from 'next-intl/middleware';

import { routing } from '@/core/i18n/config';

const intlMiddleware = createIntlMiddleware(routing);
const APEX_HOST = 'babyboogey.com';
const CANONICAL_HOST = 'www.babyboogey.com';
const CONSOLIDATED_GENERATOR_PATHS = new Set([
  '/ai-baby-dance',
  '/ai-baby-dance-video',
  '/ai-baby-dance-video-generator',
]);

export async function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase();
  if (hostname === APEX_HOST) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = CANONICAL_HOST;
    canonicalUrl.protocol = 'https';
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const { pathname } = request.nextUrl;

  // Extract locale from pathname
  const locale = pathname.split('/')[1];
  const isValidLocale = routing.locales.includes(locale as UnsafeAny);
  const pathWithoutLocale = isValidLocale
    ? pathname.slice(locale.length + 1)
    : pathname;

  // The homepage contains the real generator. Consolidate older keyword-only
  // landing pages into that single product page while preserving the locale.
  if (CONSOLIDATED_GENERATOR_PATHS.has(pathWithoutLocale)) {
    const canonicalUrl = request.nextUrl.clone();
    const shouldKeepLocalePrefix =
      isValidLocale &&
      (locale !== routing.defaultLocale ||
        process.env.NODE_ENV === 'development');
    canonicalUrl.pathname = shouldKeepLocalePrefix ? `/${locale}` : '/';
    return NextResponse.redirect(canonicalUrl, 308);
  }

  // Handle internationalization first. In local development, Next's dev
  // proxy can recurse on same-URL middleware rewrites for already-prefixed
  // locale paths, so let App Router handle those paths directly.
  const intlResponse =
    process.env.NODE_ENV === 'development' && isValidLocale
      ? NextResponse.next()
      : intlMiddleware(request);

  // Only check authentication for admin routes
  if (
    pathWithoutLocale.startsWith('/admin') ||
    pathWithoutLocale.startsWith('/settings') ||
    pathWithoutLocale.startsWith('/activity')
  ) {
    // Check if session cookie exists
    const sessionCookie = getSessionCookie(request);

    // If no session token found, redirect to sign-in
    if (!sessionCookie) {
      const signInUrl = new URL(
        isValidLocale ? `/${locale}/sign-in` : '/sign-in',
        request.url
      );
      // Add the current path (including search params) as callback - use relative path for multi-language support
      const callbackPath = pathWithoutLocale + request.nextUrl.search;
      signInUrl.searchParams.set('callbackUrl', callbackPath);
      return NextResponse.redirect(signInUrl);
    }

    // For admin routes, we need to check RBAC permissions
    // Note: Full permission check happens in the page/API route level
    // This is a lightweight session check to prevent unauthorized access
    // The detailed permission check (admin.access and specific permissions)
    // will be done in the layout or individual pages using requirePermission()
  }

  intlResponse.headers.set('x-pathname', request.nextUrl.pathname);
  intlResponse.headers.set('x-url', request.url);

  // Korean is launching with one fully translated landing page. Keep English
  // fallback routes usable without letting them enter the Korean search index.
  if (
    locale === 'ko' &&
    pathWithoutLocale !== '' &&
    pathWithoutLocale !== '/'
  ) {
    intlResponse.headers.set('X-Robots-Tag', 'noindex, follow');
  }

  // Remove Set-Cookie from public pages to allow caching
  // We exclude admin, settings, activity, and auth pages from this behavior
  if (
    !pathWithoutLocale.startsWith('/admin') &&
    !pathWithoutLocale.startsWith('/settings') &&
    !pathWithoutLocale.startsWith('/activity') &&
    !pathWithoutLocale.startsWith('/sign-') &&
    !pathWithoutLocale.startsWith('/auth')
  ) {
    intlResponse.headers.delete('Set-Cookie');

    // Cache-Control header for public pages
    const cacheControl = 'public, s-maxage=3600, stale-while-revalidate=14400';

    intlResponse.headers.set('Cache-Control', cacheControl);
    intlResponse.headers.set('CDN-Cache-Control', cacheControl);
    intlResponse.headers.set('Cloudflare-CDN-Cache-Control', cacheControl);
  }

  // For all other routes (including /, /sign-in, /sign-up, /sign-out), just return the intl response
  return intlResponse;
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
