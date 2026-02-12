import { MetadataRoute } from 'next';

import { envConfigs } from '@/config';

export default function robots(): MetadataRoute.Robots {
  const appUrl = envConfigs.app_url;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/*?*q=',
        '/settings/*',
        '/activity/*',
        '/admin/*',
        '/api/*',
        '/sign-in',
        '/sign-up',
        '/verify-email',
        '/no-permission',
        '/chat',
        '/chat/*',
      ],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}

