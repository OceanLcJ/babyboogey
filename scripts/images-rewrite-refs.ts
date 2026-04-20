#!/usr/bin/env node
import fs from 'node:fs';

import {
  DEFAULT_MANIFEST_PATH,
  REWRITE_SCAN_DIRS,
  collectTextFiles,
  countOccurrences,
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
  const targetEntries = manifest.entries.filter((entry) => entry.uploaded);

  if (targetEntries.length === 0) {
    console.log('No uploaded entries found. Run images:upload:r2 first.');
    return;
  }

  const files = collectTextFiles(REWRITE_SCAN_DIRS);
  const replacedCountBySource = new Map<string, number>();
  for (const entry of targetEntries) {
    replacedCountBySource.set(entry.sourceUrl, 0);
  }

  const PROTECT_OPEN = '\0__R2_PROTECTED_';
  const PROTECT_CLOSE = '__\0';

  // publicUrl contains sourceUrl as a substring (e.g. /imgs/x.webp lives
  // inside https://cdn/assets/imgs/x.webp). Without protection a second
  // pass for any overlapping sourceUrl would splice publicUrl a second
  // time, producing https://cdn/assetshttps://cdn/assets/... — shield every
  // known publicUrl behind a placeholder around each replacement, restore
  // at the end. Longest-first sort guards against entries whose
  // sourceUrl / publicUrl is a prefix of another.
  const uniquePublicUrls = Array.from(
    new Set(
      targetEntries
        .map((e) => e.publicUrl)
        .filter((p): p is string => Boolean(p))
    )
  ).sort((a, b) => b.length - a.length);
  const entriesBySourceLen = [...targetEntries].sort(
    (a, b) => b.sourceUrl.length - a.sourceUrl.length
  );

  let changedFiles = 0;
  for (const filePath of files) {
    const before = fs.readFileSync(filePath, 'utf8');
    let next = before;
    const protectedPubs: string[] = [];

    const protect = (pub: string) => {
      if (!pub || !next.includes(pub)) return;
      const token = `${PROTECT_OPEN}${protectedPubs.length}${PROTECT_CLOSE}`;
      protectedPubs.push(pub);
      next = next.split(pub).join(token);
    };

    for (const pub of uniquePublicUrls) protect(pub);

    let fileChanged = false;
    for (const entry of entriesBySourceLen) {
      const source = entry.sourceUrl;
      if (!source || !next.includes(source)) continue;
      const count = countOccurrences(next, source);
      if (count === 0) continue;
      next = next.split(source).join(entry.publicUrl);
      replacedCountBySource.set(
        source,
        (replacedCountBySource.get(source) ?? 0) + count
      );
      fileChanged = true;
      protect(entry.publicUrl);
    }

    for (let i = 0; i < protectedPubs.length; i++) {
      const token = `${PROTECT_OPEN}${i}${PROTECT_CLOSE}`;
      next = next.split(token).join(protectedPubs[i]);
    }

    if (fileChanged) {
      changedFiles++;
      if (!args.dryRun) {
        fs.writeFileSync(filePath, next, 'utf8');
      }
    }
  }

  const now = new Date().toISOString();
  const usage = scanReferenceUsage(
    manifest.entries.map((entry) => entry.sourceUrl),
    REWRITE_SCAN_DIRS,
    manifest.entries.map((entry) => entry.publicUrl)
  );

  let rewrittenEntries = 0;
  for (const entry of manifest.entries) {
    const replaced = replacedCountBySource.get(entry.sourceUrl) ?? 0;
    if (replaced > 0) {
      entry.rewritten = true;
      entry.lastRewriteAt = now;
      rewrittenEntries++;
    }
    entry.referencedInRepo = usage.get(entry.sourceUrl) ?? false;
  }

  manifest.generatedAt = now;
  if (!args.dryRun) {
    writeManifest(manifest, args.manifestPath);
  }

  console.log(
    `${args.dryRun ? '[dry-run] ' : ''}rewrote ${changedFiles} file(s), updated ${rewrittenEntries} manifest entr${
      rewrittenEntries === 1 ? 'y' : 'ies'
    }.`
  );
  console.log(`${args.dryRun ? '[dry-run] ' : ''}manifest: ${args.manifestPath}`);
}

main().catch((error) => {
  console.error('❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
