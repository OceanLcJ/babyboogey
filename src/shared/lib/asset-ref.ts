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
