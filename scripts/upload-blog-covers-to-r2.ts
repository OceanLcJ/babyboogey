#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

import { R2Provider } from '../src/extensions/storage/r2';

type Args = {
  dir: string;
  rewrite: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dir: 'public/imgs/blog',
    rewrite: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--rewrite') {
      args.rewrite = true;
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

function contentTypeForFile(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function getSlugFromPostFilename(fileName: string): string {
  // e.g. 7-tips-for-better-baby-dance-videos.zh.mdx -> 7-tips-for-better-baby-dance-videos
  const base = path.basename(fileName, '.mdx');
  return base.endsWith('.zh') ? base.slice(0, -3) : base;
}

function updateFrontmatterImage(mdx: string, newImage: string): string {
  if (!mdx.startsWith('---')) return mdx;
  const end = mdx.indexOf('\n---', 3);
  if (end === -1) return mdx;

  const fmBlock = mdx.slice(0, end + '\n---'.length);
  const rest = mdx.slice(end + '\n---'.length);
  const fmLines = fmBlock.split('\n');
  const outLines: string[] = [];

  let replaced = false;
  for (const line of fmLines) {
    if (line.startsWith('image:')) {
      outLines.push(`image: ${newImage}`);
      replaced = true;
    } else {
      outLines.push(line);
    }
  }

  if (!replaced) {
    // insert before closing '---' (last line)
    const last = outLines.pop();
    if (last !== '---') {
      // unexpected, bail out
      return mdx;
    }
    outLines.push(`image: ${newImage}`);
    outLines.push('---');
  }

  return outLines.join('\n') + rest;
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
  const uploadPath = process.env.R2_UPLOAD_PATH || 'imgs/blog';
  const endpoint = process.env.R2_ENDPOINT || '';
  const publicDomain = process.env.R2_PUBLIC_DOMAIN || process.env.R2_DOMAIN || '';

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error('❌ Missing R2 configs. Required env vars:');
    console.error('- R2_ACCOUNT_ID');
    console.error('- R2_ACCESS_KEY_ID (or R2_ACCESS_KEY)');
    console.error('- R2_SECRET_ACCESS_KEY (or R2_SECRET_KEY)');
    console.error('- R2_BUCKET (or R2_BUCKET_NAME)');
    console.error('\nOptional env vars: R2_UPLOAD_PATH, R2_PUBLIC_DOMAIN, R2_ENDPOINT');
    process.exit(1);
  }

  const dirPath = path.resolve(process.cwd(), args.dir);
  if (!fs.existsSync(dirPath)) {
    console.error(`❌ Directory not found: ${dirPath}`);
    process.exit(1);
  }

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

  const files = fs
    .readdirSync(dirPath)
    .filter((f) => !f.startsWith('.'))
    .filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.log(`No images found in ${dirPath}`);
    return;
  }

  console.log(
    `Uploading ${files.length} file(s) to R2 bucket "${bucket}" (${uploadPath}/...)`
  );
  const urlMap: Record<string, string> = {};

  for (const file of files) {
    const abs = path.join(dirPath, file);
    const body = fs.readFileSync(abs);
    const result = await provider.uploadFile({
      key: file,
      body,
      contentType: contentTypeForFile(file),
      disposition: 'inline',
    });

    if (!result.success || !result.url) {
      console.error(`❌ Upload failed: ${file} -> ${result.error || 'Unknown error'}`);
      process.exit(1);
    }

    urlMap[file] = result.url;
    console.log(`✅ ${file} -> ${result.url}`);
  }

  if (!args.rewrite) return;

  const postsDir = path.resolve(process.cwd(), 'content/posts');
  const postFiles = fs
    .readdirSync(postsDir)
    .filter((f) => f.endsWith('.mdx'))
    .sort((a, b) => a.localeCompare(b));

  let rewritten = 0;
  for (const file of postFiles) {
    const slug = getSlugFromPostFilename(file);
    const candidate = `${slug}.jpg`;
    const url = urlMap[candidate];
    if (!url) continue;

    const postPath = path.join(postsDir, file);
    const mdx = fs.readFileSync(postPath, 'utf8');
    const next = updateFrontmatterImage(mdx, url);
    if (next !== mdx) {
      fs.writeFileSync(postPath, next, 'utf8');
      rewritten++;
    }
  }

  console.log(`\nRewrote image frontmatter in ${rewritten} post file(s).`);
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
