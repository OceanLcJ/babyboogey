#!/usr/bin/env node
import fs from 'node:fs';

import {
  DEFAULT_MANIFEST_PATH,
  REWRITE_SCAN_DIRS,
  readManifest,
  scanReferenceUsage,
  writeManifest,
} from './image-migration-utils';

type Args = {
  manifestPath: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    manifestPath: DEFAULT_MANIFEST_PATH,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
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
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readManifest(args.manifestPath);

  const usage = scanReferenceUsage(
    manifest.entries.map((entry) => entry.sourceUrl),
    REWRITE_SCAN_DIRS
  );

  const candidates: Array<{
    sourcePath: string;
    sourceUrl: string;
    reason: 'uploaded+rewritten' | 'uploaded+unreferenced+large+reversible';
  }> = [];

  for (const entry of manifest.entries) {
    const referencedNow = usage.get(entry.sourceUrl) ?? false;
    entry.referencedInRepo = referencedNow;
    if (entry.sourceDeleted) continue;

    const deletableByRewrite = entry.uploaded && entry.rewritten && !referencedNow;
    const deletableByUnreferencedLarge =
      entry.uploaded && !referencedNow && entry.isLarge && entry.reversible;

    if (deletableByRewrite) {
      candidates.push({
        sourcePath: entry.sourcePath,
        sourceUrl: entry.sourceUrl,
        reason: 'uploaded+rewritten',
      });
      continue;
    }
    if (deletableByUnreferencedLarge) {
      candidates.push({
        sourcePath: entry.sourcePath,
        sourceUrl: entry.sourceUrl,
        reason: 'uploaded+unreferenced+large+reversible',
      });
    }
  }

  if (candidates.length === 0) {
    console.log('No local source images eligible for pruning.');
    return;
  }

  let deleted = 0;
  const now = new Date().toISOString();
  const deletedUrls = new Set<string>();

  for (const candidate of candidates) {
    const entry = manifest.entries.find((item) => item.sourcePath === candidate.sourcePath);
    if (!entry) continue;

    if (!fs.existsSync(candidate.sourcePath)) {
      entry.sourceDeleted = true;
      entry.lastPruneAt = now;
      deletedUrls.add(candidate.sourceUrl);
      continue;
    }

    if (!args.dryRun) {
      fs.unlinkSync(candidate.sourcePath);
    }
    entry.sourceDeleted = !args.dryRun;
    entry.lastPruneAt = now;
    deleted++;
    deletedUrls.add(candidate.sourceUrl);
  }

  if (!args.dryRun) {
    const postDeleteUsage = scanReferenceUsage([...deletedUrls], REWRITE_SCAN_DIRS);
    const danglingRefs = [...postDeleteUsage.entries()]
      .filter(([, referenced]) => referenced)
      .map(([sourceUrl]) => sourceUrl);
    if (danglingRefs.length > 0) {
      throw new Error(
        `Found references to deleted local assets: ${danglingRefs.join(', ')}`
      );
    }
  }

  manifest.generatedAt = now;
  if (!args.dryRun) {
    writeManifest(manifest, args.manifestPath);
  }

  console.log(
    `${args.dryRun ? '[dry-run] ' : ''}prune candidates: ${candidates.length}, deleted: ${deleted}.`
  );
  for (const candidate of candidates) {
    console.log(
      `${args.dryRun ? '[dry-run] ' : ''}${candidate.sourcePath} (${candidate.reason})`
    );
  }
  if (!args.dryRun) {
    console.log(`Manifest updated: ${args.manifestPath}`);
  }
}

main().catch((error) => {
  console.error('❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
