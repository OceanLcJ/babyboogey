import { getTranslations, setRequestLocale } from 'next-intl/server';

import { getThemePage } from '@/core/theme';
import { BabyImageGenerator } from '@/shared/blocks/generator';
import { getMetadata } from '@/shared/lib/seo';
import { DynamicPage } from '@/shared/types/blocks/landing';

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

  // Pull the full landing-page tree from i18n, then inject the React-only
  // generator section. `t.raw()` returns plain JSON so we can mutate a shallow
  // copy before handing it to the dynamic-page theme.
  const page = pageT.raw('page') as DynamicPage;
  const sections = { ...(page.sections || {}) };
  sections.generator = {
    ...(sections.generator || {}),
    component: (
      <BabyImageGenerator srOnlyTitle={generatorT.raw('generator.title')} />
    ),
  };

  const composed: DynamicPage = {
    ...page,
    sections,
  };

  const Page = await getThemePage('dynamic-page');

  return <Page locale={locale} page={composed} />;
}
