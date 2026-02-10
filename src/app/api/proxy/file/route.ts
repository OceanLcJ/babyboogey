import { NextRequest, NextResponse } from 'next/server';

import { envConfigs } from '@/config';
import { getAssetIdFromRef } from '@/shared/lib/asset-ref';

export async function GET(req: NextRequest) {
  const url = String(req.nextUrl.searchParams.get('url') || '').trim();

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  // legacy compatibility: allow only internal asset route redirects
  const assetId = getAssetIdFromRef(url);
  if (assetId) {
    const target = new URL(req.url);
    target.pathname = `/api/storage/assets/${encodeURIComponent(assetId)}`;
    target.search = '';
    return NextResponse.redirect(target, { status: 307 });
  }

  if (url.startsWith('/api/storage/assets/')) {
    const target = new URL(url, req.nextUrl.origin);
    return NextResponse.redirect(target, { status: 307 });
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    const parsed = new URL(url);
    const appHost = new URL(envConfigs.app_url || req.nextUrl.origin).host;
    if (
      parsed.host === appHost &&
      parsed.pathname.startsWith('/api/storage/assets/')
    ) {
      return NextResponse.redirect(parsed, { status: 307 });
    }
  }

  return new NextResponse(
    'Deprecated proxy endpoint. Use /api/storage/assets/:assetId instead.',
    { status: 410 }
  );
}
