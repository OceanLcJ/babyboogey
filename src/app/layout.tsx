import "@/config/style/global.css";

import { getLocale, setRequestLocale } from "next-intl/server";
import { locales } from "@/config/locale";
import { envConfigs } from "@/config";
import { getAllConfigs } from "@/services/config";
import { getAdsComponents } from "@/services/ads";
import { getAnalyticsComponents } from "@/services/analytics";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  setRequestLocale(locale);

  const isProduction = process.env.NODE_ENV === "production" || true;

  // app url
  const appUrl = envConfigs.app_url || "";

  // get configs from db
  const configs = await getAllConfigs();

  // get analytics components in production
  const { analyticsMetaTags, analyticsHeadScripts, analyticsBodyScripts } =
    getAnalyticsComponents(isProduction ? configs : {});

  // get ads components in production
  const { adsMetaTags, adsHeadScripts, adsBodyScripts } = getAdsComponents(
    isProduction ? configs : {}
  );

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        {/* Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&family=Inter:wght@100..900&family=Roboto:wght@100..900&family=Open+Sans:wght@300..800&family=Lato:wght@100..900&family=Poppins:wght@100..900&family=Nunito:wght@200..900&family=Source+Sans+Pro:wght@200..900&family=Playfair+Display:wght@400..900&family=Montserrat:wght@100..900&family=Oswald:wght@200..700&family=Raleway:wght@100..900&family=Ubuntu:wght@300;400;500;700&family=Mulish:wght@200..900&family=Work+Sans:wght@100..900&family=Quicksand:wght@300..700&family=Merriweather:wght@300;400;700;900&family=PT+Sans:wght@400;700&family=Source+Code+Pro:wght@200..900&family=Fira+Code:wght@300..700&family=JetBrains+Mono:wght@100..800&family=Roboto+Mono:wght@100..700&family=Space+Mono:wght@400;700&family=Inconsolata:wght@200..900&family=Architects+Daughter&family=Dancing+Script:wght@400..700&family=Caveat:wght@400..700&family=Pacifico&display=swap"
          rel="stylesheet"
        />

        {/* inject locales */}
        {locales ? (
          <>
            {locales.map((loc) => (
              <link
                key={loc}
                rel="alternate"
                hrefLang={loc}
                href={`${appUrl}${loc === "en" ? "" : `/${loc}`}/`}
              />
            ))}
            <link rel="alternate" hrefLang="x-default" href={appUrl} />
          </>
        ) : null}

        {/* inject ads meta tags */}
        {adsMetaTags}
        {/* inject ads head scripts */}
        {adsHeadScripts}

        {/* inject analytics meta tags */}
        {analyticsMetaTags}
        {/* inject analytics head scripts */}
        {analyticsHeadScripts}
      </head>
      <body>
        {children}

        {/* inject ads body scripts */}
        {adsBodyScripts}

        {/* inject analytics body scripts */}
        {analyticsBodyScripts}
      </body>
    </html>
  );
}
