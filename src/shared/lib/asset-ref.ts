export const ASSET_REF_PREFIX = 'asset://';

export function toAssetRef(assetId: string): string {
  return `${ASSET_REF_PREFIX}${assetId}`;
}

export function isAssetRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ASSET_REF_PREFIX);
}

export function getAssetIdFromRef(value: unknown): string | null {
  if (!isAssetRef(value)) {
    return null;
  }

  const assetId = value.slice(ASSET_REF_PREFIX.length).trim();
  return assetId ? assetId : null;
}

export function assetRefToApiPath(assetRefOrId: string): string {
  const assetId = getAssetIdFromRef(assetRefOrId) || assetRefOrId;
  return `/api/storage/assets/${encodeURIComponent(assetId)}`;
}

export function resolveMediaValueToApiPath(value?: string | null): string {
  if (!value) {
    return '';
  }

  const assetId = getAssetIdFromRef(value);
  if (!assetId) {
    return value;
  }

  return assetRefToApiPath(assetId);
}

// Best-effort reverse of `assetRefToApiPath` — pulls the asset id out of a URL
// shaped like `/api/storage/assets/<id>`. Returns null when the URL does not
// point at the storage proxy (e.g. a signed external URL). Safe on both SSR
// and browser contexts.
export function extractAssetIdFromMediaUrl(url: string): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(
      url,
      typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost'
    );
    const matched = parsed.pathname.match(
      /\/api\/storage\/assets\/([^/?#]+)/
    );
    if (!matched?.[1]) {
      return null;
    }
    return decodeURIComponent(matched[1]);
  } catch {
    const matched = url.match(/\/api\/storage\/assets\/([^/?#]+)/);
    if (!matched?.[1]) {
      return null;
    }
    return decodeURIComponent(matched[1]);
  }
}
