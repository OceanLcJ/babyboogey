import Image from 'next/image';

import { Link } from '@/core/i18n/navigation';
import { Brand as BrandType } from '@/shared/types/blocks/common';

/**
 * Split a camelCase wordmark like "BabyBoogey" into ["Baby", "Boogey"] so the
 * trailing half can be rendered in italic Fraunces for a typographic flourish.
 * Returns null when the split is ambiguous.
 */
function splitWordmark(title: string): [string, string] | null {
  const match = title.match(/^([A-Z][a-z]+)([A-Z][a-z]+.*)$/);
  if (!match) return null;
  return [match[1], match[2]];
}

export function BrandLogo({ brand }: { brand: BrandType }) {
  const parts = brand.title ? splitWordmark(brand.title) : null;

  return (
    <Link
      href={brand.url || ''}
      target={brand.target || '_self'}
      className={`flex items-center space-x-3 ${brand.className}`}
    >
      {brand.logo && (
        <Image
          src={brand.logo.src}
          alt={brand.logo.alt || brand.title || ''}
          width={brand.logo.width || 80}
          height={brand.logo.height || 80}
          className="h-8 w-auto rounded-lg"
          unoptimized={brand.logo.src.startsWith('http')}
        />
      )}
      {brand.title && (
        <span className="bb-wordmark">
          {parts ? (
            <>
              {parts[0]}
              <em>{parts[1]}</em>
            </>
          ) : (
            brand.title
          )}
        </span>
      )}
    </Link>
  );
}
