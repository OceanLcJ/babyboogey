import { betterAuth, BetterAuthOptions } from 'better-auth';

import { isCloudflareWorker } from '@/shared/lib/env';
import { getAllConfigs } from '@/shared/models/config';

import { getAuthOptions } from './config';

// get auth instance in server side
export async function getAuth() {
  // get configs from db and env
  const configs = await getAllConfigs();

  // Fail closed at runtime: an empty secret makes better-auth fall back to an
  // insecure default, silently weakening session/cookie signing. Guarded by
  // isCloudflareWorker so it never trips during the Node build (which has no
  // secret injected) — only on the real Workers runtime.
  if (isCloudflareWorker && !configs.auth_secret) {
    throw new Error('AUTH_SECRET is not configured');
  }

  const authOptions = await getAuthOptions(configs);

  return betterAuth(authOptions as BetterAuthOptions);
}
