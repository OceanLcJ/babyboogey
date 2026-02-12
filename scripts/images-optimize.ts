#!/usr/bin/env node
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_PUBLIC_DOMAIN,
  DEFAULT_R2_KEY_PREFIX,
  type ImageMigrationManifest,
  buildPublicUrl,
  buildR2Key,
  scanReferenceUsage,
  sourceUrlFromPath,
  toPosix,
  webpPathFromSource,
  writeManifest,
} from './image-migration-utils';

type SharpFactory = (input: string) => {
  webp: (options: { quality: number }) => {
    toFile: (outputPath: string) => Promise<unknown>;
  };
};

function loadSharpFactory(): SharpFactory {
  const require = createRequire(import.meta.url);
  return require('sharp') as SharpFactory;
}

type Args = {
  quality: number;
  manifestPath: string;
  publicDomain: string;
  r2KeyPrefix: string;
  dryRun: boolean;
};

const SOURCE_DIRS = [
  'public/imgs/features',
  'public/imgs/cases',
  'public/imgs/bg',
  'public/imgs/blog',
];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    quality: 78,
    manifestPath: DEFAULT_MANIFEST_PATH,
    publicDomain: DEFAULT_PUBLIC_DOMAIN,
    r2KeyPrefix: DEFAULT_R2_KEY_PREFIX,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--quality') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --quality');
      args.quality = Number(next);
      i++;
      continue;
    }
    if (arg.startsWith('--quality=')) {
      args.quality = Number(arg.split('=')[1]);
      continue;
    }
    if (arg === '--manifest') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --manifest');
      args.manifestPath = next;
      i++;
      continue;
    }
    if (arg.startsWith('--manifest=')) {
      args.manifestPath = arg.split('=')[1] || args.manifestPath;
      continue;
    }
    if (arg === '--public-domain') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --public-domain');
      args.publicDomain = next;
      i++;
      continue;
    }
    if (arg.startsWith('--public-domain=')) {
      args.publicDomain = arg.split('=')[1] || args.publicDomain;
      continue;
    }
    if (arg === '--r2-key-prefix') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --r2-key-prefix');
      args.r2KeyPrefix = next;
      i++;
      continue;
    }
    if (arg.startsWith('--r2-key-prefix=')) {
      args.r2KeyPrefix = arg.split('=')[1] || args.r2KeyPrefix;
      continue;
    }
  }

  if (!Number.isFinite(args.quality) || args.quality < 1 || args.quality > 100) {
    throw new Error(`Invalid quality: ${args.quality}. Expected 1-100.`);
  }

  return args;
}

function collectSourceImages(): string[] {
  const cwd = process.cwd();
  const files: string[] = [];
  for (const dir of SOURCE_DIRS) {
    const absDir = path.join(cwd, dir);
    if (!fs.existsSync(absDir)) continue;
    const stack = [absDir];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      const stat = fs.statSync(current);
      if (stat.isDirectory()) {
        for (const child of fs.readdirSync(current)) {
          stack.push(path.join(current, child));
        }
        continue;
      }
      if (!/\.(png|jpe?g)$/i.test(current)) continue;
      files.push(toPosix(path.relative(cwd, current)));
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function readExistingManifest(
  manifestPath: string
): Map<string, ImageMigrationManifest['entries'][number]> {
  if (!fs.existsSync(manifestPath)) return new Map();
  const json = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    entries?: ImageMigrationManifest['entries'];
  };
  const map = new Map<string, ImageMigrationManifest['entries'][number]>();
  for (const entry of json.entries || []) {
    map.set(entry.sourcePath, entry);
  }
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sharpFactory = args.dryRun ? null : loadSharpFactory();
  const files = collectSourceImages();
  if (files.length === 0) {
    console.log('No source images found for optimization.');
    return;
  }

  const existing = readExistingManifest(args.manifestPath);
  const sourceUrls = files.map((sourcePath) => sourceUrlFromPath(sourcePath));
  const usage = scanReferenceUsage(sourceUrls);
  const entries: ImageMigrationManifest['entries'] = [];

  let totalSourceBytes = 0;
  let totalWebpBytes = 0;

  for (const sourcePath of files) {
    const sourceAbs = path.join(process.cwd(), sourcePath);
    const webpPath = webpPathFromSource(sourcePath);
    const webpAbs = path.join(process.cwd(), webpPath);

    if (!args.dryRun) {
      await sharpFactory!(sourceAbs).webp({ quality: args.quality }).toFile(webpAbs);
    }

    const sourceBytes = fs.statSync(sourceAbs).size;
    const webpBytes = fs.existsSync(webpAbs) ? fs.statSync(webpAbs).size : 0;
    totalSourceBytes += sourceBytes;
    totalWebpBytes += webpBytes;

    const sourceUrl = sourceUrlFromPath(sourcePath);
    const webpUrl = sourceUrl.replace(/\.(png|jpe?g)$/i, '.webp');
    const compressionRatio = sourceBytes === 0 ? 0 : webpBytes / sourceBytes;
    const reductionPercent = sourceBytes === 0 ? 0 : (1 - compressionRatio) * 100;
    const previous = existing.get(sourcePath);

    entries.push({
      sourcePath,
      sourceUrl,
      webpPath,
      webpUrl,
      sourceBytes,
      webpBytes,
      compressionRatio: Number(compressionRatio.toFixed(4)),
      reductionPercent: Number(reductionPercent.toFixed(2)),
      r2Key: buildR2Key(sourceUrl, args.r2KeyPrefix),
      publicUrl: buildPublicUrl(sourceUrl, args.publicDomain, args.r2KeyPrefix),
      uploaded: previous?.uploaded ?? false,
      rewritten: previous?.rewritten ?? false,
      sourceDeleted: previous?.sourceDeleted ?? false,
      reversible: true,
      isLarge: sourceBytes >= 500 * 1024,
      referencedInRepo: usage.get(sourceUrl) ?? false,
      lastUploadAt: previous?.lastUploadAt,
      lastRewriteAt: previous?.lastRewriteAt,
      lastPruneAt: previous?.lastPruneAt,
    });
  }

  const manifest: ImageMigrationManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    defaults: {
      quality: args.quality,
      publicDomain: args.publicDomain,
      r2KeyPrefix: args.r2KeyPrefix,
    },
    entries,
  };

  const reduction =
    totalSourceBytes === 0 ? 0 : ((1 - totalWebpBytes / totalSourceBytes) * 100);
  const prefix = args.dryRun ? '[dry-run] ' : '';
  console.log(
    `${prefix}optimized ${entries.length} image(s). Total ${(
      totalSourceBytes /
      1024 /
      1024
    ).toFixed(2)}MB -> ${(totalWebpBytes / 1024 / 1024).toFixed(2)}MB (${reduction.toFixed(
      2
    )}% smaller).`
  );

  if (args.dryRun) {
    console.log(`[dry-run] manifest not written: ${args.manifestPath}`);
    return;
  }

  writeManifest(manifest, args.manifestPath);
  console.log(`Manifest written to ${args.manifestPath}`);
}

main().catch((error) => {
  console.error('❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
