export const isProduction = process.env.NODE_ENV === 'production';

const cloudflareContextSymbol = Symbol.for('__cloudflare-context__');

export const isCloudflareWorker =
  typeof globalThis !== 'undefined' &&
  // OpenNext (Cloudflare) exposes a per-request context on the global scope.
  // Prefer feature-detection so this remains stable at module init time.
  (cloudflareContextSymbol in (globalThis as any) ||
    typeof (globalThis as any).WebSocketPair !== 'undefined' ||
    // Fallback to the legacy `globalThis.Cloudflare` check when available.
    'Cloudflare' in globalThis);
