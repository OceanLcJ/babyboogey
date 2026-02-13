import { NextRequest, NextResponse } from 'next/server';

// Legacy compatibility endpoint.
// New clients should use /api/storage/upload-media with explicit purpose/source.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    if (!files || files.length === 0) {
      return NextResponse.json({ code: -1, message: 'No files provided' });
    }

    if (!formData.get('purpose')) {
      formData.set('purpose', 'reference_image');
    }
    if (!formData.get('source')) {
      formData.set('source', 'upload');
    }

    const targetUrl = new URL('/api/storage/upload-media', req.url);
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
      headers: {
        cookie: req.headers.get('cookie') || '',
      },
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok || payload?.code !== 0) {
      return NextResponse.json({
        code: -1,
        message: payload?.message || `Upload failed (${upstream.status})`,
      });
    }

    const results = Array.isArray(payload?.data?.results)
      ? payload.data.results
      : [];
    const urls = results
      .map((item: UnsafeAny) =>
        item?.assetId
          ? `/api/storage/assets/${encodeURIComponent(item.assetId)}`
          : item?.previewUrl || ''
      )
      .filter(Boolean);

    const response = NextResponse.json({
      code: 0,
      message: 'ok',
      data: {
        urls,
        assetRefs: results.map((item: UnsafeAny) => item?.assetRef).filter(Boolean),
        results,
      },
    });
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) {
      response.headers.set('set-cookie', setCookie);
    }
    response.headers.set('x-deprecated-endpoint', '/api/storage/upload-image');
    return response;
  } catch (e: UnsafeAny) {
    console.error('upload image (legacy) failed:', e);
    return NextResponse.json({
      code: -1,
      message: e?.message || 'upload image failed',
    });
  }
}
