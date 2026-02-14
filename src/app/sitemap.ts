import { MetadataRoute } from 'next';

import { envConfigs } from '@/config';
import { locales, defaultLocale } from '@/config/locale';
import { docsSource, pagesSource, postsSource, logsSource } from '@/core/docs/source';
import {
  getTaxonomies,
  TaxonomyStatus,
  TaxonomyType,
} from '@/shared/models/taxonomy';

const appUrl = envConfigs.app_url;
const resolvedDefaultLocale = locales.includes(defaultLocale)
  ? defaultLocale
  : (locales[0] ?? 'en');

function buildAbsoluteUrl(path: string, locale?: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // For static paths, localize from locale argument.
  if (locale) {
    const localePrefix =
      locale === resolvedDefaultLocale ? '' : `/${locale}`;
    return `${appUrl}${localePrefix}${normalizedPath}`;
  }

  // For content source URLs (posts/docs/pages/logs), path is already localized.
  // Normalize default locale paths to "as-needed" style (no locale prefix).
  const defaultPrefix = `/${resolvedDefaultLocale}`;
  const normalizedLocalizedPath =
    normalizedPath === defaultPrefix
      ? '/'
      : normalizedPath.startsWith(`${defaultPrefix}/`)
        ? normalizedPath.slice(defaultPrefix.length)
        : normalizedPath;

  return `${appUrl}${normalizedLocalizedPath}`;
}

function buildLocaleUrls(
  path: string,
  lastModified?: Date
): MetadataRoute.Sitemap {
  return locales.map((locale) => ({
    url: buildAbsoluteUrl(path, locale),
    lastModified: lastModified || new Date(),
    changeFrequency: 'weekly' as const,
    priority: path === '/' ? 1.0 : 0.8,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // 1. Static pages
  const staticPaths = [
    '/',
    '/pricing',
    '/showcases',
    '/blog',
    '/updates',
  ];

  // 1b. Keyword landing pages (SEO inner pages)
  const keywordPages = [
    '/ai-baby-dance',
    '/ai-baby-dance-video-generator-free',
    '/ai-baby-dance-video',
    '/baby-dance-ai-prompt',
    '/ai-baby-dance-video-generator',
    '/seedance-baby-dance',
    '/babyboogey-vs-seedance',
  ];

  for (const path of staticPaths) {
    entries.push(...buildLocaleUrls(path));
  }

  for (const path of keywordPages) {
    entries.push(
      ...locales.map((locale) => ({
        url: buildAbsoluteUrl(path, locale),
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }))
    );
  }

  // 2. Local blog posts (from content/posts/*.mdx)
  for (const locale of locales) {
    const localPosts = postsSource.getPages(locale);
    for (const post of localPosts) {
      entries.push({
        url: buildAbsoluteUrl(post.url),
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.7,
      });
    }
  }

  // 3. Docs pages (from content/docs/*.mdx)
  for (const locale of locales) {
    const docPages = docsSource.getPages(locale);
    for (const doc of docPages) {
      entries.push({
        url: buildAbsoluteUrl(doc.url),
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    }
  }

  // 4. Static pages (from content/pages/*.mdx, e.g. privacy-policy, terms-of-service)
  for (const locale of locales) {
    const staticPages = pagesSource.getPages(locale);
    for (const page of staticPages) {
      entries.push({
        url: buildAbsoluteUrl(page.url),
        lastModified: new Date(),
        changeFrequency: 'yearly',
        priority: 0.3,
      });
    }
  }

  // 5. Update logs (from content/logs/*.mdx)
  for (const locale of locales) {
    const logPages = logsSource.getPages(locale);
    for (const log of logPages) {
      entries.push({
        url: buildAbsoluteUrl(log.url),
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.5,
      });
    }
  }

  // 6. Blog categories (from database)
  try {
    const categories = await getTaxonomies({
      type: TaxonomyType.CATEGORY,
      status: TaxonomyStatus.PUBLISHED,
    });
    for (const category of categories) {
      if (category.slug) {
        entries.push(...buildLocaleUrls(`/blog/category/${category.slug}`));
      }
    }
  } catch {
    // Database may not be available during build
  }

  return entries;
}
