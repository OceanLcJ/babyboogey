'use client';

import { LazyLoadImage } from 'react-lazy-load-image-component';

import { getStaticUrl } from '@/shared/lib/utils';

import 'react-lazy-load-image-component/src/effects/blur.css';

export function LazyImage({
  src,
  alt,
  className,
  width,
  height,
  placeholderSrc,
  title,
  fill,
  priority,
  sizes,
}: {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  placeholderSrc?: string;
  title?: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <LazyLoadImage
      src={getStaticUrl(src)}
      alt={alt}
      width={width}
      height={height}
      effect="blur" // 支持 blur、opacity 等
      placeholderSrc={placeholderSrc} // 可选
      className={className}
    />
  );
}
