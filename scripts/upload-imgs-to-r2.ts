#!/usr/bin/env node
/**
 * Upload all images under public/imgs/ to Cloudflare R2.
 *
 * Usage:
 *   npx tsx scripts/upload-imgs-to-r2.ts [--dir public/imgs] [--dry-run]
 *
 * Required env vars:
 *   R2_ACCOUNT_ID  (or CLOUDFLARE_ACCOUNT_ID)
 *   R2_ACCESS_KEY_ID  (or R2_ACCESS_KEY)
 *   R2_SECRET_ACCESS_KEY  (or R2_SECRET_KEY)
 *   R2_BUCKET  (or R2_BUCKET_NAME)
 *
 * Optional env vars:
 *   R2_ENDPOINT       – custom S3-compatible endpoint
 *   R2_PUBLIC_DOMAIN  – public CDN domain (e.g. https://img.aibabydance.org)
 */
import fs from 'fs';
import path from 'path';

import { R2Provider } from '../src/extensions/storage/r2';

interface Args {
  dir: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dir: 'public/imgs', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (a === '--dir') {
      const v = argv[i + 1];
      if (!v) throw new Error('Missing value for --dir');
      args.dir = v;
      i++;
      continue;
    }
    if (a.startsWith('--dir=')) {
      args.dir = a.split('=')[1] || args.dir;
      continue;
    }
  }
  return args;
}

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

function contentTypeForFile(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return EXT_TO_CONTENT_TYPE[ext] || 'application/octet-stream';
}

/**
 * Recursively collect all image files under `dir`, returning paths relative to `dir`.
 */
function collectImages(dir: string, prefix = ''): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectImages(path.join(dir, entry.name), rel));
    } else if (/\.(png|jpe?g|webp|svg|gif|avif)$/i.test(entry.name)) {
      files.push(rel);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const accountId =
    process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const accessKeyId =
    process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY || '';
  const secretAccessKey =
    process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY || '';
  const bucket = process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || '';
  const endpoint = process.env.R2_ENDPOINT || '';
  const publicDomain =
    process.env.R2_PUBLIC_DOMAIN || process.env.R2_DOMAIN || '';

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error('Missing R2 configs. Required env vars:');
    console.error('  R2_ACCOUNT_ID  (or CLOUDFLARE_ACCOUNT_ID)');
    console.error('  R2_ACCESS_KEY_ID  (or R2_ACCESS_KEY)');
    console.error('  R2_SECRET_ACCESS_KEY  (or R2_SECRET_KEY)');
    console.error('  R2_BUCKET  (or R2_BUCKET_NAME)');
    console.error(
      '\nOptional: R2_ENDPOINT, R2_PUBLIC_DOMAIN'
    );
    process.exit(1);
  }

  const dirPath = path.resolve(process.cwd(), args.dir);
  if (!fs.existsSync(dirPath)) {
    console.error(`Directory not found: ${dirPath}`);
    process.exit(1);
  }

  const files = collectImages(dirPath);
  if (files.length === 0) {
    console.log(`No images found in ${dirPath}`);
    return;
  }

  // Upload path keeps the /imgs/ prefix so CDN URLs match the original paths:
  //   /imgs/features/baby-hero.png  →  R2 key: imgs/features/baby-hero.png
  //   CDN URL: https://img.aibabydance.org/imgs/features/baby-hero.png
  const uploadPathBase = 'imgs';

  console.log(
    `\nFound ${files.length} image(s) in ${dirPath}`
  );
  console.log(`Bucket: ${bucket}`);
  console.log(`Upload path: ${uploadPathBase}/...`);
  if (publicDomain) console.log(`CDN domain: ${publicDomain}`);
  if (args.dryRun) {
    console.log('\n[DRY RUN] Files that would be uploaded:');
    for (const file of files) {
      const size = fs.statSync(path.join(dirPath, file)).size;
      console.log(`  ${uploadPathBase}/${file}  (${(size / 1024).toFixed(1)} KB)`);
    }
    return;
  }

  let uploaded = 0;
  let failed = 0;
  let totalBytes = 0;

  for (const file of files) {
    // Each subdirectory gets its own R2Provider with the right uploadPath
    const subDir = path.dirname(file);
    const uploadPath =
      subDir === '.' ? uploadPathBase : `${uploadPathBase}/${subDir}`;
    const fileName = path.basename(file);

    const provider = new R2Provider({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      uploadPath,
      region: 'auto',
      endpoint: endpoint || undefined,
      publicDomain: publicDomain || undefined,
    });

    const abs = path.join(dirPath, file);
    const body = fs.readFileSync(abs);
    totalBytes += body.length;

    const result = await provider.uploadFile({
      key: fileName,
      body,
      contentType: contentTypeForFile(fileName),
      disposition: 'inline',
    });

    if (!result.success || !result.url) {
      console.error(
        `  FAIL  ${uploadPathBase}/${file}  →  ${result.error || 'Unknown error'}`
      );
      failed++;
    } else {
      console.log(`  OK    ${uploadPathBase}/${file}  →  ${result.url}`);
      uploaded++;
    }
  }

  console.log(
    `\nDone: ${uploaded} uploaded, ${failed} failed, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total`
  );

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
