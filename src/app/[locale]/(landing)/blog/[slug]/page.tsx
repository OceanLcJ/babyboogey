import { getTranslations, setRequestLocale } from 'next-intl/server';

import { getThemePage } from '@/core/theme';
import { envConfigs } from '@/config';
import { Empty } from '@/shared/blocks/common';
import { getPost } from '@/shared/models/post';
import type { Post } from '@/shared/types/blocks/blog';
import { DynamicPage } from '@/shared/types/blocks/landing';

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations('pages.blog.metadata');

  const canonicalUrl = getBlogCanonicalUrl({ locale, slug });

  const post = await getPost({ slug, locale });
  if (!post) {
    return {
      title: `${slug} | ${t('title')}`,
      description: t('description'),
      alternates: {
        canonical: canonicalUrl,
      },
    };
  }

  const title = `${post.title} | ${t('title')}`;
  const description = post.description;
  const imageUrl = resolveAbsoluteUrl(
    post.image || envConfigs.app_preview_image
  );

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'article',
      locale,
      url: canonicalUrl,
      title,
      description,
      siteName: envConfigs.app_name || 'BabyBoogey',
      images: [imageUrl],
      publishedTime: post.date || undefined,
      authors: post.author_name ? [post.author_name] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
      site: envConfigs.app_url,
    },
  };
}

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const post = await getPost({ slug, locale });

  if (!post) {
    return <Empty message={`Post not found`} />;
  }

  const canonicalUrl = getBlogCanonicalUrl({ locale, slug });
  const jsonLd = getBlogJsonLd({
    post,
    canonicalUrl,
    locale,
  });

  // build page sections
  const page: DynamicPage = {
    sections: {
      blogDetail: {
        block: 'blog-detail',
        data: {
          post,
        },
      },
    },
  };

  const Page = await getThemePage('dynamic-page');

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: stringifyJsonLd(jsonLd),
        }}
      />
      <Page locale={locale} page={page} />
    </>
  );
}

function getBlogCanonicalUrl({
  locale,
  slug,
}: {
  locale: string;
  slug: string;
}) {
  return locale !== envConfigs.locale
    ? `${envConfigs.app_url}/${locale}/blog/${slug}`
    : `${envConfigs.app_url}/blog/${slug}`;
}

function resolveAbsoluteUrl(value?: string) {
  if (!value) {
    return envConfigs.app_url;
  }

  if (value.startsWith('http')) {
    return value;
  }

  return `${envConfigs.app_url}${value.startsWith('/') ? '' : '/'}${value}`;
}

function stringifyJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function getBlogJsonLd({
  post,
  canonicalUrl,
  locale,
}: {
  post: Post;
  canonicalUrl: string;
  locale: string;
}) {
  const appName = envConfigs.app_name || 'BabyBoogey';
  const imageUrl = resolveAbsoluteUrl(
    post.image || envConfigs.app_preview_image
  );
  const logoUrl = resolveAbsoluteUrl(envConfigs.app_logo || '/logo.png');

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${canonicalUrl}#article`,
        headline: post.title,
        description: post.description,
        image: imageUrl,
        datePublished: post.date || undefined,
        dateModified: post.date || undefined,
        inLanguage:
          locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US',
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': canonicalUrl,
        },
        author: {
          '@type': 'Organization',
          name: post.author_name || appName,
          url: envConfigs.app_url,
        },
        publisher: {
          '@type': 'Organization',
          name: appName,
          url: envConfigs.app_url,
          logo: {
            '@type': 'ImageObject',
            url: logoUrl,
          },
        },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Blog',
            item:
              locale !== envConfigs.locale
                ? `${envConfigs.app_url}/${locale}/blog`
                : `${envConfigs.app_url}/blog`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: post.title,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}
