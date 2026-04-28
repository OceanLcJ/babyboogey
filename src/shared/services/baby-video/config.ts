// Per-second credit pricing for Kling 2.6 motion-control video generation.
// Derived from the kie per-second cost (11 / 18 credits per second for
// 720p / 1080p) with a target net margin of ~70% at the Premium pack tier.
export const VIDEO_RESOLUTIONS = ['720p', '1080p'] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];
export const VIDEO_DEFAULT_RESOLUTION: VideoResolution = '720p';
export const BABY_VIDEO_PROVIDER = 'kie';
export const BABY_VIDEO_MOTION_MODEL = 'kling-2.6/motion-control';

export const VIDEO_COST_CREDITS_PER_SECOND: Record<VideoResolution, number> = {
  '720p': 15,
  '1080p': 25,
};

export function isVideoResolution(value: unknown): value is VideoResolution {
  return (
    typeof value === 'string' &&
    (VIDEO_RESOLUTIONS as readonly string[]).includes(value)
  );
}

export function resolveVideoResolution(value: unknown): VideoResolution {
  return isVideoResolution(value) ? value : VIDEO_DEFAULT_RESOLUTION;
}

// Server-side whitelist of dance template ids and their authoritative duration
// in seconds. The client sends a templateId; the server looks up the canonical
// duration here before computing the credit cost — this prevents a malicious
// client from submitting a long template while claiming a short duration.
export const VIDEO_TEMPLATE_DURATION_SECONDS: Record<string, number> = {
  'temp-05': 4,
  'viral-dance': 5,
  'temp-01': 15,
  'temp-02': 9,
  'temp-03': 9,
  'temp-04': 21,
  'temp-06': 8,
  'temp-07': 15,
  'temp-08': 9,
  'temp-09': 19,
  'temp-10': 17,
  'temp-11': 16,
  'temp-12': 14,
  'template-0': 14,
};

// Hard cap used by getVideoCostCredits; bump this alongside
// VIDEO_TEMPLATE_DURATION_SECONDS whenever a longer template is added.
export const VIDEO_MAX_DURATION_SECONDS = 30;

export function resolveVideoTemplateDurationSeconds(
  templateId: unknown
): number {
  if (typeof templateId !== 'string' || templateId.length === 0) {
    throw new Error('templateId is required for video billing');
  }
  const seconds = VIDEO_TEMPLATE_DURATION_SECONDS[templateId];
  if (typeof seconds !== 'number' || seconds <= 0) {
    throw new Error(`unknown video templateId: ${templateId}`);
  }
  return seconds;
}

export function getVideoCostCredits(
  resolution: VideoResolution,
  durationSeconds: number
): number {
  const clamped = Math.min(
    VIDEO_MAX_DURATION_SECONDS,
    Math.max(1, Math.ceil(durationSeconds))
  );
  return VIDEO_COST_CREDITS_PER_SECOND[resolution] * clamped;
}
