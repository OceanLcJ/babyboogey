import { MetadataRoute } from 'next';

import { envConfigs } from '@/config';
import { locales, defaultLocale } from '@/config/locale';
import { docsSource, pagesSource, postsSource, logsSource } from '@/core/docs/source';
import {
  getTaxonomies,
  TaxonomyStatus,
  TaxonomyType,
} from '@/shared/models/taxonomy';

function buildLocaleUrls(
  path: string,
  lastModified?: Date
): MetadataRoute.Sitemap {
  const appUrl = envConfigs.app_url;
  return locales.map((locale) => ({
    url: `${appUrl}${locale === defaultLocale ? '' : `/${locale}`}${path}`,
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
    '/ai-image-generator',
    '/ai-video-generator',
    '/ai-music-generator',
  ];

  for (const path of staticPaths) {
    entries.push(...buildLocaleUrls(path));
  }

  // 2. Local blog posts (from content/posts/*.mdx)
  for (const locale of locales) {
    const localPosts = postsSource.getPages(locale);
    for (const post of localPosts) {
      const appUrl = envConfigs.app_url;
      const localePrefix = locale === defaultLocale ? '' : `/${locale}`;
      entries.push({
        url: `${appUrl}${localePrefix}/blog/${post.slug}`,
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
      const appUrl = envConfigs.app_url;
      const localePrefix = locale === defaultLocale ? '' : `/${locale}`;
      entries.push({
        url: `${appUrl}${localePrefix}${doc.url}`,
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
      const appUrl = envConfigs.app_url;
      const localePrefix = locale === defaultLocale ? '' : `/${locale}`;
      entries.push({
        url: `${appUrl}${localePrefix}${page.url}`,
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
      const appUrl = envConfigs.app_url;
      const localePrefix = locale === defaultLocale ? '' : `/${locale}`;
      entries.push({
        url: `${appUrl}${localePrefix}${log.url}`,
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
