import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_MANIFEST_PATH = 'docs/image-migration-manifest.json';
export const DEFAULT_PUBLIC_DOMAIN = 'https://img.aibabydance.org';
export const DEFAULT_R2_KEY_PREFIX = 'assets/imgs';
export const REWRITE_SCAN_DIRS = ['src', 'content'];

export type ImageMigrationManifest = {
  schemaVersion: 1;
  generatedAt: string;
  defaults: {
    quality: number;
    publicDomain: string;
    r2KeyPrefix: string;
  };
  entries: ImageMigrationEntry[];
};

export type ImageMigrationEntry = {
  sourcePath: string;
  sourceUrl: string;
  webpPath: string;
  webpUrl: string;
  sourceBytes: number;
  webpBytes: number;
  compressionRatio: number;
  reductionPercent: number;
  r2Key: string;
  publicUrl: string;
  uploaded: boolean;
  rewritten: boolean;
  sourceDeleted: boolean;
  reversible: boolean;
  isLarge: boolean;
  referencedInRepo: boolean;
  lastUploadAt?: string;
  lastRewriteAt?: string;
  lastPruneAt?: string;
};

const TEXT_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.mdx',
  '.mjs',
  '.cjs',
  '.yml',
  '.yaml',
]);

export function toPosix(input: string): string {
  return input.split(path.sep).join('/');
}

export function ensureLeadingSlash(input: string): string {
  return input.startsWith('/') ? input : `/${input}`;
}

export function trimTrailingSlash(input: string): string {
  return input.endsWith('/') ? input.slice(0, -1) : input;
}

export function normalizePublicDomain(input?: string): string {
  return trimTrailingSlash(input || DEFAULT_PUBLIC_DOMAIN);
}

export function normalizeKeyPrefix(input?: string): string {
  const raw = input || DEFAULT_R2_KEY_PREFIX;
  return raw.replace(/^\/+/, '').replace(/\/+$/, '');
}

export function isTextFile(filePath: string): boolean {
  return TEXT_EXTS.has(path.extname(filePath).toLowerCase());
}

export function walkFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const out: string[] = [];
  const stack = [dirPath];
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
    out.push(current);
  }
  return out;
}

export function collectTextFiles(dirs: string[]): string[] {
  const out: string[] = [];
  for (const dir of dirs) {
    for (const filePath of walkFiles(dir)) {
      if (isTextFile(filePath)) out.push(filePath);
    }
  }
  return out;
}

export function countOccurrences(source: string, token: string): number {
  if (!token || !source.includes(token)) return 0;
  let count = 0;
  let cursor = 0;
  while (true) {
    const idx = source.indexOf(token, cursor);
    if (idx === -1) break;
    count++;
    cursor = idx + token.length;
  }
  return count;
}

export function scanReferenceUsage(
  sourceUrls: string[],
  dirs: string[] = REWRITE_SCAN_DIRS
): Map<string, boolean> {
  const textFiles = collectTextFiles(dirs);
  const usage = new Map<string, boolean>();
  for (const sourceUrl of sourceUrls) usage.set(sourceUrl, false);

  for (const filePath of textFiles) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const sourceUrl of sourceUrls) {
      if (usage.get(sourceUrl)) continue;
      if (text.includes(sourceUrl)) usage.set(sourceUrl, true);
    }
  }
  return usage;
}

export function readManifest(
  manifestPath = DEFAULT_MANIFEST_PATH
): ImageMigrationManifest {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  const raw = fs.readFileSync(manifestPath, 'utf8');
  return JSON.parse(raw) as ImageMigrationManifest;
}

export function writeManifest(
  manifest: ImageMigrationManifest,
  manifestPath = DEFAULT_MANIFEST_PATH
) {
  const dir = path.dirname(manifestPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function sourceUrlFromPath(filePath: string): string {
  const normalized = toPosix(filePath);
  if (!normalized.startsWith('public/')) {
    throw new Error(`Path is not under public/: ${filePath}`);
  }
  return ensureLeadingSlash(normalized.replace(/^public\//, ''));
}

export function webpPathFromSource(filePath: string): string {
  const ext = path.extname(filePath);
  return filePath.slice(0, -ext.length) + '.webp';
}

export function buildR2Key(
  sourceUrl: string,
  keyPrefix = DEFAULT_R2_KEY_PREFIX
): string {
  const normalizedPrefix = normalizeKeyPrefix(keyPrefix);
  const withoutImgs = sourceUrl.replace(/^\/imgs\//, '');
  const withoutExt = withoutImgs.replace(/\.(png|jpe?g)$/i, '.webp');
  return `${normalizedPrefix}/${withoutExt}`.replace(/\/{2,}/g, '/');
}

export function buildPublicUrl(
  sourceUrl: string,
  domain = DEFAULT_PUBLIC_DOMAIN,
  keyPrefix = DEFAULT_R2_KEY_PREFIX
): string {
  const normalizedDomain = normalizePublicDomain(domain);
  return `${normalizedDomain}/${buildR2Key(sourceUrl, keyPrefix)}`;
}
