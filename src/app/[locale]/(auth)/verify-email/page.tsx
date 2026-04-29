import { getTranslations } from 'next-intl/server';

import { redirect } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { defaultLocale } from '@/config/locale';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('common');

  return {
    title: `${t('sign.verify_email_page_title')} - ${t('metadata.title')}`,
    alternates: {
      canonical:
        locale !== defaultLocale
          ? `${envConfigs.app_url}/${locale}/verify-email`
          : `${envConfigs.app_url}/verify-email`,
    },
  };
}

export default async function VerifyEmailRoute({
  searchParams,
  params,
}: {
  searchParams: Promise<{
    email?: string;
    callbackUrl?: string;
  }>;
  params: Promise<{ locale: string }>;
}) {
  const { email, callbackUrl } = await searchParams;
  const { locale } = await params;
  const signInQuery = new URLSearchParams();
  if (email) signInQuery.set('email', email);
  signInQuery.set('callbackUrl', callbackUrl || '/');

  // Email verification is temporarily disabled, so don't leave users on the
  // verification waiting screen if an old redirect or URL brings them here.
  redirect({ href: `/sign-in?${signInQuery.toString()}`, locale });
}
