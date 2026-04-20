// Scenes split by input shape so admin analytics can distinguish text-only vs
// image-referenced generations. Both cost the same (within a given resolution)
// and resolve to the same provider/model in the generate route.
export const BABY_IMAGE_SCENE_TEXT = 'baby-image-text';
export const BABY_IMAGE_SCENE_IMAGE = 'baby-image-image';

export const BABY_IMAGE_SCENES = [
  BABY_IMAGE_SCENE_TEXT,
  BABY_IMAGE_SCENE_IMAGE,
] as const;

export type BabyImageScene = (typeof BABY_IMAGE_SCENES)[number];

export function isBabyImageScene(scene: unknown): scene is BabyImageScene {
  return (
    typeof scene === 'string' &&
    (BABY_IMAGE_SCENES as readonly string[]).includes(scene)
  );
}

export const BABY_IMAGE_RESOLUTIONS = ['2k', '4k'] as const;
export type BabyImageResolution = (typeof BABY_IMAGE_RESOLUTIONS)[number];
export const BABY_IMAGE_DEFAULT_RESOLUTION: BabyImageResolution = '2k';

export function isBabyImageResolution(
  value: unknown
): value is BabyImageResolution {
  return (
    typeof value === 'string' &&
    (BABY_IMAGE_RESOLUTIONS as readonly string[]).includes(value)
  );
}

// Credit cost per generation, keyed by output resolution. Derived from the
// underlying kie nano-banana-pro unit cost (8 / 14 credits per image) with a
// target net margin of ~70% at the Premium pack tier.
export const BABY_IMAGE_COST_CREDITS: Record<BabyImageResolution, number> = {
  '2k': 12,
  '4k': 25,
};

export function resolveBabyImageResolution(
  value: unknown
): BabyImageResolution {
  return isBabyImageResolution(value) ? value : BABY_IMAGE_DEFAULT_RESOLUTION;
}

export function getBabyImageCostCredits(
  resolution: BabyImageResolution
): number {
  return BABY_IMAGE_COST_CREDITS[resolution];
}

export const BABY_IMAGE_PROVIDER = 'kie';
export const BABY_IMAGE_DEFAULT_MODEL = 'nano-banana-pro';
