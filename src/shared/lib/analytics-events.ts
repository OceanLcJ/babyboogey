const WATERMARK_ATTRIBUTION_KEY = 'bb_watermark_cta_at';
const WATERMARK_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

declare global {
  interface Window {
    plausible?: (
      eventName: string,
      options?: { props?: Record<string, unknown> }
    ) => void;
    gtag?: (
      command: 'event',
      eventName: string,
      params?: Record<string, unknown>
    ) => void;
    op?: (...args: unknown[]) => void;
  }
}

function isBrowser() {
  return typeof window !== 'undefined';
}

export function trackAnalyticsEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
) {
  if (!isBrowser() || !eventName) {
    return;
  }

  try {
    if (typeof window.plausible === 'function') {
      window.plausible(eventName, { props: properties });
    }
  } catch (error) {
    console.warn('plausible track failed:', error);
  }

  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, properties);
    }
  } catch (error) {
    console.warn('gtag track failed:', error);
  }

  try {
    if (typeof window.op === 'function') {
      window.op('track', eventName, properties);
    }
  } catch (error) {
    console.warn('openpanel track failed:', error);
  }
}

export function markWatermarkCtaClick() {
  if (!isBrowser()) {
    return;
  }

  try {
    localStorage.setItem(WATERMARK_ATTRIBUTION_KEY, String(Date.now()));
  } catch (error) {
    console.warn('set watermark attribution failed:', error);
  }
}

export function getWatermarkAttributionAgeMs() {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = localStorage.getItem(WATERMARK_ATTRIBUTION_KEY);
    if (!raw) {
      return null;
    }

    const timestamp = Number(raw);
    if (!Number.isFinite(timestamp)) {
      return null;
    }

    return Math.max(0, Date.now() - timestamp);
  } catch (error) {
    console.warn('read watermark attribution failed:', error);
    return null;
  }
}

export function hasRecentWatermarkAttribution() {
  const ageMs = getWatermarkAttributionAgeMs();
  if (ageMs === null) {
    return false;
  }

  return ageMs <= WATERMARK_ATTRIBUTION_WINDOW_MS;
}

export function clearWatermarkAttribution() {
  if (!isBrowser()) {
    return;
  }

  try {
    localStorage.removeItem(WATERMARK_ATTRIBUTION_KEY);
  } catch (error) {
    console.warn('clear watermark attribution failed:', error);
  }
}

