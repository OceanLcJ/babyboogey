import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { ArrowRight, BookOpenText } from 'lucide-react';

import { envConfigs } from '@/config';
import { Link } from '@/core/i18n/navigation';
import { getMetadata } from '@/shared/lib/seo';
import { VideoGenerator } from '@/shared/blocks/generator';
import {
  HomeBenefits,
  HomeCta,
  HomeFaq,
  HomeFeatures,
  HomeIntroduce,
  HomePricing,
  HomeTestimonials,
  HomeUsage,
} from '@/shared/blocks/generator/home-landing';
import '@/shared/blocks/generator/home-landing.css';
import type { DynamicPage } from '@/shared/types/blocks/landing';

export const generateMetadata = getMetadata({
  metadataKey: 'common.metadata',
  canonicalUrl: '/',
});

export const revalidate = 3600;

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const tIndex = await getTranslations('pages.index');
  const tMeta = await getTranslations('common.metadata');
  const customHero = tIndex.raw('custom_hero') as {
    title_line1: string;
    title_line2: string;
    description: string;
    cta_button: string;
    card_static: string;
    card_boogie: string;
  };

  // get page data from original source
  const page: DynamicPage = tIndex.raw('page');

  // Grab the dynamic hero's secondary button + tip before removing it, so the
  // custom hero can reuse those i18n-translated strings.
  const dynamicHero = (page.sections?.hero ?? {}) as {
    buttons?: { title: string; url?: string; target?: string }[];
    tip?: string;
  };
  const secondaryBtn = dynamicHero.buttons?.[1];
  const heroTip = dynamicHero.tip;

  // Remove the default hero from the dynamic sections to avoid duplication
  if (page.sections && page.sections.hero) {
    delete page.sections.hero;
  }

  const sections = page.sections || {};

  // Build FAQ items for JSON-LD
  const faqSection = sections.faq as UnsafeAny;
  const faqItems = faqSection?.items || [];

  // Build HowTo steps for JSON-LD
  const usageSection = sections.usage as UnsafeAny;
  const howToSteps = usageSection?.items || [];

  const appUrl = envConfigs.app_url || '';
  const appName = envConfigs.app_name || 'BabyBoogey';

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${appUrl}/#website`,
        url: appUrl,
        name: appName,
        description: tMeta('description'),
        inLanguage: locale === 'zh' ? 'zh-CN' : 'en-US',
      },
      {
        '@type': 'Organization',
        '@id': `${appUrl}/#organization`,
        name: appName,
        url: appUrl,
        logo: {
          '@type': 'ImageObject',
          url: `${appUrl}${envConfigs.app_logo || '/logo.png'}`,
        },
      },
      {
        '@type': 'SoftwareApplication',
        name: appName,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web',
        url: appUrl,
        description: tMeta('description'),
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
      ...(faqItems.length > 0
        ? [
          {
            '@type': 'FAQPage',
            '@id': `${appUrl}/#faq`,
            mainEntity: faqItems.map(
              (item: { question: string; answer: string }) => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: item.answer,
                },
              })
            ),
          },
        ]
        : []),
      ...(howToSteps.length > 0
        ? [
          {
            '@type': 'HowTo',
            '@id': `${appUrl}/#howto`,
            name: usageSection?.title || 'How to Animate Baby Photos',
            description:
              usageSection?.description ||
              'Make baby dance videos in three simple steps',
            step: howToSteps.map(
              (
                item: { title: string; description: string },
                index: number
              ) => ({
                '@type': 'HowToStep',
                position: index + 1,
                name: item.title,
                text: item.description,
              })
            ),
          },
        ]
        : []),
    ],
  };

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero — Nursery Nightfall reskin */}
      <section className="bb-home-hero">
        <div className="bb-home-hero-grid container">
          {/* Left: copy + CTA */}
          <div className="bb-home-hero-copy">
            <span className="bb-home-hero-eyebrow">AI Baby Dance Studio</span>
            <h1 className="bb-home-hero-title">
              {customHero.title_line1}
              <br />
              <em>{customHero.title_line2}</em>
            </h1>
            <p className="bb-home-hero-lede">{customHero.description}</p>
            <div className="bb-home-hero-cta">
              <Link href="#generator" className="bb-home-hero-primary">
                <span>{customHero.cta_button}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              {secondaryBtn?.title && (
                <Link
                  href={secondaryBtn.url || '/showcases'}
                  className="bb-home-hero-ghost"
                >
                  <BookOpenText className="w-4 h-4" />
                  <span>{secondaryBtn.title}</span>
                </Link>
              )}
            </div>
            {heroTip && <p className="bb-home-hero-tip">{heroTip}</p>}
          </div>

          {/* Right: before → after polaroid pair with dashed arc */}
          <div className="bb-home-hero-visual">
            {/* Static photo */}
            <div className="bb-home-hero-poly bb-home-hero-poly-static">
              <div className="bb-home-hero-poly-photo">
                <Image
                  src="https://img.aibabydance.org/assets/imgs/example/image-1.png"
                  alt="Baby photo before AI dance animation - BabyBoogey"
                  fill
                  sizes="(max-width: 1024px) 210px, 240px"
                  priority
                />
              </div>
              <div className="bb-home-hero-poly-tag">
                <h4>{customHero.card_static}</h4>
                <span>i.</span>
              </div>
            </div>

            {/* Dashed arc */}
            <svg
              className="bb-home-hero-arrow"
              width="220"
              height="120"
              viewBox="0 0 220 120"
              fill="none"
              aria-hidden="true"
            >
              <path
                className="bb-home-hero-arrow-dash"
                d="M20 80 C 60 20, 160 20, 200 80"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M185 65 L 200 80 L 192 95"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {/* Boogie video */}
            <div className="bb-home-hero-poly bb-home-hero-poly-boogie">
              <span className="bb-home-hero-poly-badge">
                {customHero.card_boogie}
              </span>
              <div className="bb-home-hero-poly-photo">
                <video
                  src="https://r2.babyboogey.com/assets/imgs/blog/temp-05.mp4"
                  poster="https://img.aibabydance.org/assets/imgs/example/image-1.png"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              </div>
              <div className="bb-home-hero-poly-tag">
                <h4>{customHero.card_boogie}</h4>
                <span>ii.</span>
              </div>
              <div className="bb-home-hero-confetti" aria-hidden="true">
                <span className="c1">✨</span>
                <span className="c2">✦</span>
                <span className="c3">✧</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Video Generator — existing component, Nursery Nightfall shell */}
      <div id="generator" className="bb-home-studio">
        <VideoGenerator />
      </div>

      {/* Reskinned dynamic sections — explicit render order matches
          pages.index.page.show_sections (minus hero, which is above). */}
      <HomeIntroduce section={sections.introduce} />
      <HomeBenefits section={sections.benefits} />
      <HomeUsage section={sections.usage} />
      <HomeFeatures section={sections.features} />
      <HomeTestimonials section={sections.testimonials} />
      <HomePricing section={sections.pricing} />
      <HomeFaq section={sections.faq} />
      <HomeCta section={sections.cta} />
    </>
  );
}
