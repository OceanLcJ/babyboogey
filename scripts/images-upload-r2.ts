#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_PUBLIC_DOMAIN,
  DEFAULT_R2_KEY_PREFIX,
  buildPublicUrl,
  buildR2Key,
  readManifest,
  writeManifest,
} from './image-migration-utils';

type Args = {
  manifestPath: string;
  concurrency: number;
  dryRun: boolean;
  force: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    manifestPath: DEFAULT_MANIFEST_PATH,
    concurrency: 50,
    dryRun: false,
    force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--force') {
      args.force = true;
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
    if (arg === '--concurrency') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --concurrency');
      args.concurrency = Number(next);
      i++;
      continue;
    }
    if (arg.startsWith('--concurrency=')) {
      args.concurrency = Number(arg.split('=')[1]);
      continue;
    }
  }

  if (!Number.isFinite(args.concurrency) || args.concurrency <= 0) {
    throw new Error(`Invalid --concurrency value: ${args.concurrency}`);
  }

  return args;
}

function writeBulkListFile(
  bucket: string,
  records: { key: string; file: string }[]
): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-bulk-'));
  const bulkPath = path.join(tmpDir, `${bucket}-bulk-put.json`);
  fs.writeFileSync(bulkPath, JSON.stringify(records), 'utf8');
  return bulkPath;
}

function ensureFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File missing: ${filePath}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readManifest(args.manifestPath);

  const bucket = process.env.R2_PUBLIC_BUCKET;
  if (!bucket) {
    throw new Error('Missing required env var: R2_PUBLIC_BUCKET');
  }
  const publicDomain =
    process.env.R2_PUBLIC_DOMAIN ||
    manifest.defaults.publicDomain ||
    DEFAULT_PUBLIC_DOMAIN;
  const keyPrefix =
    process.env.R2_KEY_PREFIX || manifest.defaults.r2KeyPrefix || DEFAULT_R2_KEY_PREFIX;

  const candidates = manifest.entries.filter((entry) => args.force || !entry.uploaded);
  if (manifest.entries.length === 0) {
    console.log('Manifest has no entries. Run images:optimize first.');
    return;
  }

  const uploadRecords = candidates.map((entry) => {
    const sourceUrl = entry.sourceUrl;
    const r2Key = buildR2Key(sourceUrl, keyPrefix);
    const publicUrl = buildPublicUrl(sourceUrl, publicDomain, keyPrefix);
    entry.r2Key = r2Key;
    entry.publicUrl = publicUrl;
    ensureFile(entry.webpPath);
    return {
      key: r2Key,
      file: path.resolve(entry.webpPath),
    };
  });

  if (uploadRecords.length === 0) {
    console.log('No entries to upload (all uploaded already).');
    writeManifest(manifest, args.manifestPath);
    return;
  }

  const bulkFile = writeBulkListFile(bucket, uploadRecords);
  try {
    const command = [
      'exec',
      'wrangler',
      'r2',
      'bulk',
      'put',
      bucket,
      '--filename',
      bulkFile,
      '--concurrency',
      String(args.concurrency),
      '--remote',
    ];

    if (args.dryRun) {
      console.log(
        `[dry-run] pnpm ${command
          .map((arg) => (arg.includes(' ') ? JSON.stringify(arg) : arg))
          .join(' ')}`
      );
      console.log(`[dry-run] would upload ${uploadRecords.length} object(s).`);
      return;
    }

    const result = spawnSync('pnpm', command, { stdio: 'inherit' });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }

    const now = new Date().toISOString();
    for (const entry of candidates) {
      entry.uploaded = true;
      entry.lastUploadAt = now;
    }
    manifest.generatedAt = now;
    manifest.defaults.publicDomain = publicDomain;
    manifest.defaults.r2KeyPrefix = keyPrefix;
    writeManifest(manifest, args.manifestPath);
    console.log(`Uploaded ${uploadRecords.length} object(s) to R2 bucket "${bucket}".`);
    console.log(`Manifest updated: ${args.manifestPath}`);
  } finally {
    fs.rmSync(path.dirname(bulkFile), { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
