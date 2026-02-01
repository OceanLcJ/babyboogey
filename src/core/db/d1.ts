import { drizzle as drizzleD1 } from 'drizzle-orm/d1';

import { isCloudflareWorker } from '@/shared/lib/env';

let d1DbInstance: ReturnType<typeof drizzleD1> | null = null;

function getCloudflareEnvSync(): any {
  // OpenNext Cloudflare sets a per-request context on the global scope using this symbol.
  // In production, the value is backed by AsyncLocalStorage, so it is safe for concurrent requests.
  const ctx = (globalThis as any)[Symbol.for('__cloudflare-context__')];
  const env = ctx?.env;
  if (!env) {
    throw new Error(
      'Cloudflare context is not available. Make sure this code runs inside a Cloudflare Worker request.'
    );
  }
  return env;
}

export async function getD1Db() {
  if (!isCloudflareWorker) {
    throw new Error('D1 database is only available in Cloudflare Workers');
  }

  if (d1DbInstance) {
    return d1DbInstance;
  }

  const env = getCloudflareEnvSync();
  const d1 = env.DB;
  if (!d1) {
    throw new Error(
      'D1 database binding "DB" is not configured in wrangler.toml'
    );
  }

  d1DbInstance = drizzleD1(d1);
  return d1DbInstance;
}

export function getD1DbSync() {
  if (!isCloudflareWorker) {
    throw new Error('D1 database is only available in Cloudflare Workers');
  }

  if (d1DbInstance) {
    return d1DbInstance;
  }

  const env = getCloudflareEnvSync();
  const d1 = env.DB;
  if (!d1) {
    throw new Error(
      'D1 database binding "DB" is not configured in wrangler.toml'
    );
  }

  d1DbInstance = drizzleD1(d1);
  return d1DbInstance;
}

export function clearD1DbInstance() {
  d1DbInstance = null;
}
