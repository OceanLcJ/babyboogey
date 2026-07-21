import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { oneTap } from 'better-auth/plugins';
import { getLocale } from 'next-intl/server';

import { db } from '@/core/db';
import { envConfigs } from '@/config';
import * as schema from '@/config/db/schema';
import {
  getCookieFromCtx,
  getHeaderValue,
  guessLocaleFromAcceptLanguage,
} from '@/shared/lib/cookie';
import { isCloudflareWorker } from '@/shared/lib/env';
import { getClientIpFromCtx, getCountryFromCtx } from '@/shared/lib/geo';
import { getUuid } from '@/shared/lib/hash';
import { getClientIp } from '@/shared/lib/ip';
import { grantCreditsForFirstLogin } from '@/shared/models/credit';
import { findUserById } from '@/shared/models/user';
import {
  queueVerificationCustomerEmail,
  queueWelcomeCustomerEmail,
} from '@/shared/services/customer-lifecycle-email';
import { grantRoleForNewUser } from '@/shared/services/rbac';

// Best-effort dedupe to prevent sending verification emails too frequently.
// This is especially helpful in dev/hot reload, transient network conditions,
// and to add a server-side throttle beyond any client-side cooldown.
const recentVerificationEmailSentAt = new Map<string, number>();
const VERIFICATION_EMAIL_MIN_INTERVAL_MS = 60_000;
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24; // 1 day
const BABYBOOGEY_COOKIE_DOMAIN = '.babyboogey.com';

function shouldEnableCrossSubDomainCookies() {
  const baseUrl = envConfigs.auth_url || envConfigs.app_url;
  if (!baseUrl) {
    return false;
  }

  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname === 'babyboogey.com' || hostname === 'www.babyboogey.com';
  } catch {
    return false;
  }
}

function getTrustedOrigins() {
  const origins = new Set<string>();
  if (envConfigs.app_url) {
    origins.add(envConfigs.app_url);
    try {
      const url = new URL(envConfigs.app_url);
      if (url.hostname.startsWith('www.')) {
        const nonWww = url.hostname.replace(/^www\./, '');
        origins.add(`${url.protocol}//${nonWww}`);
      } else {
        origins.add(`${url.protocol}//www.${url.hostname}`);
      }
    } catch {
      // ignore invalid URL
    }
  }

  if (envConfigs.auth_trusted_origins) {
    for (const origin of envConfigs.auth_trusted_origins
      .split(',')
      .filter(Boolean)) {
      origins.add(origin);
    }
  }

  return Array.from(origins);
}

// Static auth options - NO database connection
// This ensures zero database calls during build time
const authOptions = {
  appName: envConfigs.app_name,
  baseURL: envConfigs.auth_url,
  secret: envConfigs.auth_secret,
  trustedOrigins: getTrustedOrigins(),
  session: {
    // Keep users signed in across browser restarts.
    expiresIn: SESSION_EXPIRES_IN_SECONDS,
    // Refresh session at most once per day.
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  // Rate limiting. better-auth enables this in production by default.
  // Storage: set AUTH_RATE_LIMIT_STORAGE=database to use the shared D1
  // `rate_limit` table (globally consistent across Workers isolates). It
  // defaults to the in-memory store so the app never depends on a table that
  // has not been migrated yet — flip the flag only after applying the
  // 0004_rate_limit migration. Memory is per-isolate but Cloudflare isolates
  // are long-lived, so it still throttles single-source brute force.
  // customRules tighten the endpoints that matter for credential stuffing and
  // account-creation abuse regardless of the storage backend.
  rateLimit: {
    // Enable explicitly: better-auth's default only turns rate limiting on when
    // it detects NODE_ENV==='production', but that env var is not populated at
    // module-eval time on the Workers runtime (OpenNext injects it per-request),
    // so the auto-detection reads undefined and leaves the limiter off.
    enabled: true,
    storage:
      process.env.AUTH_RATE_LIMIT_STORAGE === 'database'
        ? 'database'
        : 'memory',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 3600, max: 10 },
      '/forget-password': { window: 3600, max: 5 },
      '/reset-password': { window: 3600, max: 5 },
    },
  },
  user: {
    // Allow persisting custom columns on user table.
    // Without this, better-auth may ignore extra properties during create/update.
    additionalFields: {
      utmSource: {
        type: 'string',
        // Not user-editable input; we set it internally.
        input: false,
        required: false,
        defaultValue: '',
      },
      ip: {
        type: 'string',
        input: false,
        required: false,
        defaultValue: '',
      },
      locale: {
        type: 'string',
        input: false,
        required: false,
        defaultValue: '',
      },
    },
  },
  advanced: {
    crossSubDomainCookies: shouldEnableCrossSubDomainCookies()
      ? {
          enabled: true,
          domain: BABYBOOGEY_COOKIE_DOMAIN,
        }
      : {
          enabled: false,
        },
    // Rate limiting keys by client IP. better-auth only reads x-forwarded-for
    // by default, which is absent on Cloudflare Workers — the real client IP is
    // in cf-connecting-ip. Without this the limiter can't build a key and skips
    // every request. Order mirrors src/shared/lib/ip.ts.
    ipAddress: {
      ipAddressHeaders: ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for'],
    },
    database: {
      generateId: () => getUuid(),
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  logger: {
    verboseLogging: false,
    // Disable all logs during build and production
    disabled: true,
  },
};

// get auth options with configs
export async function getAuthOptions(configs: Record<string, string>) {
  const emailVerificationEnabled =
    configs.email_verification_enabled === 'true';

  return {
    ...authOptions,
    // Add database connection only when actually needed (runtime)
    database:
      envConfigs.database_url ||
      (envConfigs.database_provider === 'd1' && isCloudflareWorker)
        ? drizzleAdapter(db(), {
            provider: getDatabaseProvider(envConfigs.database_provider),
            schema: schema,
          })
        : null,
    databaseHooks: {
      user: {
        create: {
          before: async (user: UnsafeAny, ctx: UnsafeAny) => {
            try {
              const ip = await getClientIp();
              if (ip) {
                user.ip = ip;
              }

              // Prefer NEXT_LOCALE cookie (next-intl). Fallback to accept-language.
              const localeFromCookie = getCookieFromCtx(ctx, 'NEXT_LOCALE');

              const localeFromHeader = guessLocaleFromAcceptLanguage(
                getHeaderValue(ctx, 'accept-language')
              );

              const locale =
                (localeFromCookie || localeFromHeader || (await getLocale())) ??
                '';

              if (locale && typeof locale === 'string') {
                user.locale = locale.slice(0, 20);
              }

              // Only set on first creation; never overwrite later.
              if (user?.utmSource) return user;

              const raw = getCookieFromCtx(ctx, 'utm_source');
              if (!raw || typeof raw !== 'string') return user;

              // Keep it small & safe.
              const decoded = decodeURIComponent(raw).trim();
              const sanitized = decoded
                .replace(/[^\w\-.:]/g, '') // allow a-zA-Z0-9_ - . :
                .slice(0, 100);

              if (sanitized) {
                user.utmSource = sanitized;
              }
            } catch {
              // best-effort only
            }
            return user;
          },
          after: async (user: UnsafeAny) => {
            try {
              if (!user.id) {
                throw new Error('user id is required');
              }

              // grant role for new user
              await grantRoleForNewUser(user);
            } catch (e) {
              console.log('grant role for new user failed', e);
            }
          },
        },
      },
      session: {
        create: {
          after: async (session: UnsafeAny, ctx: unknown) => {
            try {
              const userId =
                (session?.userId as string | undefined) ||
                (session?.user_id as string | undefined);
              if (!userId) {
                throw new Error('session userId is required');
              }

              const user = await findUserById(userId);
              if (!user) {
                throw new Error(`user not found: ${userId}`);
              }

              // grant credits for first login (idempotent by transactionNo)
              const signupIp = typeof user?.ip === 'string' ? user.ip : '';
              const claimIp =
                (session?.ipAddress as string | undefined) ||
                (session?.ip_address as string | undefined) ||
                getClientIpFromCtx(ctx);
              const country = getCountryFromCtx(ctx);

              const initialCredit = await grantCreditsForFirstLogin(user, {
                signupIp,
                claimIp,
                country,
              });
              if (initialCredit) {
                await queueWelcomeCustomerEmail({
                  id: user.id,
                  name: user.name || '',
                  email: user.email,
                });
              }
            } catch (e) {
              console.log('grant credits for first login failed', e);
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: configs.email_auth_enabled !== 'false',
      requireEmailVerification: emailVerificationEnabled,
      // Avoid creating a session immediately after sign up when verification is required.
      autoSignIn: !emailVerificationEnabled,
    },
    ...(emailVerificationEnabled
      ? {
          emailVerification: {
            // We explicitly send verification emails from the UI with a callbackURL
            // (redirecting to /verify-email). Disabling automatic sends avoids duplicates.
            sendOnSignUp: false,
            sendOnSignIn: false,
            // After user clicks the verification link, create session automatically.
            autoSignInAfterVerification: true,
            // 24 hours
            expiresIn: 60 * 60 * 24,
            sendVerificationEmail: async (
              { user, url }: { user: UnsafeAny; url: string; token: string },
              _request: Request
            ) => {
              try {
                const key = String(user?.email || '').toLowerCase();
                const now = Date.now();
                const last = recentVerificationEmailSentAt.get(key) || 0;
                if (key && now - last < VERIFICATION_EMAIL_MIN_INTERVAL_MS) {
                  return;
                }
                if (key) {
                  recentVerificationEmailSentAt.set(key, now);
                }

                await queueVerificationCustomerEmail({
                  userId: user.id,
                  recipient: user.email,
                  verificationUrl: url,
                });
              } catch (e) {
                console.log('send verification email failed:', e);
              }
            },
          },
        }
      : {}),
    socialProviders: await getSocialProviders(configs),
    plugins:
      configs.google_client_id && configs.google_one_tap_enabled === 'true'
        ? [oneTap()]
        : [],
  };
}

// get social providers with configs
export async function getSocialProviders(configs: Record<string, string>) {
  const providers: UnsafeAny = {};

  // google auth
  if (configs.google_client_id && configs.google_client_secret) {
    providers.google = {
      clientId: configs.google_client_id,
      clientSecret: configs.google_client_secret,
    };
  }

  // github auth
  if (configs.github_client_id && configs.github_client_secret) {
    providers.github = {
      clientId: configs.github_client_id,
      clientSecret: configs.github_client_secret,
    };
  }

  return providers;
}

// convert database provider to better-auth database provider
export function getDatabaseProvider(
  provider: string
): 'sqlite' | 'pg' | 'mysql' {
  switch (provider) {
    case 'sqlite':
    case 'turso':
    case 'd1':
      return 'sqlite';
    case 'postgresql':
      return 'pg';
    case 'mysql':
      return 'mysql';
    default:
      throw new Error(
        `Unsupported database provider for auth: ${envConfigs.database_provider}`
      );
  }
}
