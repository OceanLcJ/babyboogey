// Scenes split by input shape so admin analytics can distinguish text-only vs
// image-referenced generations. Both cost the same and resolve to the same
// provider/model in generate route.
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

export const BABY_IMAGE_COST_CREDITS = 40;

export const BABY_IMAGE_PROVIDER = 'kie';
export const BABY_IMAGE_DEFAULT_MODEL = 'nano-banana-pro';
