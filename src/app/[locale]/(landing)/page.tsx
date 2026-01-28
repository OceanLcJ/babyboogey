import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { getThemePage } from '@/core/theme';
import type { DynamicPage } from '@/shared/types/blocks/landing';

export const revalidate = 3600;

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // We can still use valid translations if we want, or hardcode for the design demo
  const t = await getTranslations('landing');
  const tIndex = await getTranslations('pages.index');

  // get page data from original source
  const page: DynamicPage = tIndex.raw('page');

  // Remove the default hero from the dynamic sections to avoid duplication
  if (page.sections && page.sections.hero) {
    delete page.sections.hero;
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
                Make Your Photos <br />
                <span className="text-[var(--primary)]">Dance & Boogie!</span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-[var(--secondary)] mb-10 max-w-lg mx-auto lg:mx-0">
                Transform static memories into cheerful, bouncing animations with just one click. The cutest way to share moments!
              </p>
              <div className="flex items-center justify-center lg:justify-start gap-x-6">
                <Link
                  href="/login"
                  className="rounded-full bg-[var(--primary)] px-8 py-4 text-lg font-semibold text-[var(--primary-foreground)] shadow-[0_10px_20px_-10px_rgba(252,211,77,0.6)] hover:bg-[var(--primary)]/90 hover:-translate-y-1 transition-all duration-300 flex items-center gap-2"
                >
                  Get Boogieing <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>

            {/* Right Side: Visual Demo */}
            <div className="relative w-full h-[400px] lg:h-[500px] flex items-center justify-center">

              {/* Card 1: Static */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-48 h-64 bg-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-4 flex flex-col items-center justify-center rotate-[-6deg] z-10 border border-white">
                <div className="w-full h-full bg-gray-100 rounded-2xl flex items-center justify-center overflow-hidden">
                  <span className="text-4xl">😐</span>
                </div>
                <p className="mt-3 font-bold text-gray-400 text-sm">Static Photo</p>
              </div>

              {/* Connecting Arrow (SVG) */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-3/4 z-0 text-[var(--primary)] opacity-80">
                <svg width="150" height="80" viewBox="0 0 150 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 60 C 40 10, 110 10, 140 60" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 10" />
                  <path d="M130 50 L 140 60 L 145 45" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              {/* Card 2: Boogie */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-48 h-64 bg-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-4 flex flex-col items-center justify-center rotate-[6deg] z-20 border border-white animate-bounce-custom">
                <div className="w-full h-full bg-yellow-50 rounded-2xl flex items-center justify-center overflow-hidden relative">
                  <span className="text-6xl animate-bounce">💃</span>
                  {/* Sparkles */}
                  <span className="absolute top-2 right-2 text-xl">✨</span>
                  <span className="absolute bottom-2 left-2 text-xl">✨</span>
                </div>
                <p className="mt-3 font-bold text-[var(--primary)] text-sm">Boogie Mode!</p>
              </div>

            </div>

          </div>
        </div>
      </div>

      {/* Render the rest of the dynamic page content */}
      <Page locale={locale} page={page} />
    </>
  );
}
