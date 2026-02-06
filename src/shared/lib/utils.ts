import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL || '';

/**
 * Prefix a local static path (e.g. `/imgs/...`) with the CDN URL when available.
 * External URLs (http/https) are returned unchanged.
 */
export function getStaticUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith('http')) return path;
  if (CDN_URL && path.startsWith('/imgs/')) {
    return `${CDN_URL}${path}`;
  }
  return path;
}
