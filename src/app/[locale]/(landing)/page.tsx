import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { getThemePage } from '@/core/theme';
import { VideoGenerator } from '@/shared/blocks/generator';
import type { DynamicPage } from '@/shared/types/blocks/landing';

export const revalidate = 3600;

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('landing');
  const tIndex = await getTranslations('pages.index');
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

  // Remove the default hero from the dynamic sections to avoid duplication
  if (page.sections && page.sections.hero) {
    delete page.sections.hero;
  }

  // Hide testimonials/comments on the homepage for now
  if (page.sections?.testimonials) {
    page.sections.testimonials.disabled = true;
  }

  // load dynamic page component
  const Page = await getThemePage('dynamic-page');

  return (
    <>
      <div className="relative isolate px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-7xl py-12 sm:py-24 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            {/* Left Side: Copy + CTA */}
            <div className="text-center lg:text-left">
              <h1 className="text-5xl font-bold tracking-tight text-[var(--foreground)] sm:text-6xl mb-6">
                {customHero.title_line1} <br />
                <span className="text-[var(--primary)]">{customHero.title_line2}</span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-[var(--secondary)] mb-10 max-w-lg mx-auto lg:mx-0">
                {customHero.description}
              </p>
              <div className="flex items-center justify-center lg:justify-start gap-x-6">
                <Link
                  href="#generator"
                  className="rounded-full bg-[var(--primary)] px-8 py-4 text-lg font-semibold text-[var(--primary-foreground)] shadow-[0_10px_20px_-10px_rgba(252,211,77,0.6)] hover:bg-[var(--primary)]/90 hover:-translate-y-1 transition-all duration-300 flex items-center gap-2"
                >
                  {customHero.cta_button} <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>

            {/* Right Side: Visual Demo */}
            <div className="relative w-full h-[450px] lg:h-[550px] flex items-center justify-center">

              {/* Card 1: Static Photo */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-56 h-80 lg:w-64 lg:h-96 bg-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] p-3 flex flex-col items-center justify-center rotate-[-6deg] z-10 border border-gray-100">
                <div className="w-full h-full rounded-2xl overflow-hidden">
                  <img
                    src="https://img.aibabydance.org/assets/imgs/example/image-1.png"
                    alt="Static baby photo"
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="mt-3 font-bold text-gray-400 text-sm">{customHero.card_static}</p>
              </div>

              {/* Connecting Arrow (Animated) - Behind cards */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 text-[var(--primary)]">
                <svg width="220" height="120" viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M20 80 C 60 20, 160 20, 200 80"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray="15 10"
                    className="animate-dash"
                  />
                  <path
                    d="M185 65 L 200 80 L 192 95"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-pulse"
                  />
                </svg>
              </div>

              {/* Card 2: Dancing Video */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-56 h-80 lg:w-64 lg:h-96 bg-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] p-3 flex flex-col items-center justify-center rotate-[6deg] z-20 border border-gray-100">
                <div className="w-full h-full rounded-2xl overflow-hidden relative">
                  <video
                    src="https://img.aibabydance.org/uploads/assets/imgs/templates/hd/temp-05.mp4"
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                  <span className="absolute top-2 right-2 text-xl">✨</span>
                  <span className="absolute bottom-2 left-2 text-xl">✨</span>
                </div>
                <p className="mt-3 font-bold text-[var(--primary)] text-sm">{customHero.card_boogie}</p>
              </div>

            </div>

          </div>
        </div>
      </div>

      {/* Video Generator Section */}
      <div id="generator">
        <VideoGenerator />
      </div>

      {/* Render the rest of the dynamic page content */}
      <Page locale={locale} page={page} />
    </>
  );
}
