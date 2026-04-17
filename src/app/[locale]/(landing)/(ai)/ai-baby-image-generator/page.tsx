import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BabyImageGenerator } from '@/shared/blocks/generator/baby-image';
import {
  BabyImageLandingCta,
  BabyImageLandingFaq,
  BabyImageLandingHero,
  BabyImageLandingShowcase,
  BabyImageLandingUsage,
} from '@/shared/blocks/generator/baby-image-landing';
import { getMetadata } from '@/shared/lib/seo';
import { DynamicPage, Hero, Section } from '@/shared/types/blocks/landing';

export const revalidate = 3600;

export const generateMetadata = getMetadata({
  metadataKey: 'pages.ai-baby-image-generator.metadata',
  canonicalUrl: '/ai-baby-image-generator',
});

export default async function AiBabyImageGeneratorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const pageT = await getTranslations('pages.ai-baby-image-generator');
  const generatorT = await getTranslations('ai.baby-image');

  const page = pageT.raw('page') as DynamicPage;
  const sections = page.sections || {};

  return (
    <>
      <BabyImageLandingHero section={sections.hero as Hero | undefined} />
      <BabyImageGenerator srOnlyTitle={generatorT.raw('generator.title')} />
      <BabyImageLandingShowcase
        section={sections.showcase as Section | undefined}
      />
      <BabyImageLandingUsage section={sections.usage as Section | undefined} />
      <BabyImageLandingFaq section={sections.faq as Section | undefined} />
      <BabyImageLandingCta section={sections.cta as Section | undefined} />
    </>
  );
}
