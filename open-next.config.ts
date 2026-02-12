import { defineCloudflareConfig } from '@opennextjs/cloudflare';
// Temporarily disabled due to Wrangler compatibility issues
// import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';

export default defineCloudflareConfig({
  // Enable R2 cache once Wrangler r2 bulk commands compatibility is resolved
  // incrementalCache: r2IncrementalCache,
});
