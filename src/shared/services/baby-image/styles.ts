export const BABY_STYLE_IDS = [
  'pixar-3d',
  'ghibli',
  'anime',
  'claymation',
  'chibi',
  'watercolor',
  'plush',
  'pixel-art',
] as const;

export type BabyStyleId = (typeof BABY_STYLE_IDS)[number];

export function isBabyStyleId(value: unknown): value is BabyStyleId {
  return (
    typeof value === 'string' &&
    (BABY_STYLE_IDS as readonly string[]).includes(value)
  );
}

// Each entry is a noun-phrase style descriptor (no leading verb). The prompt
// builder wraps it with "A ..." for text-only or "Transform ... into a ..."
// for image-referenced mode.
// Keep prompts trademark-safe: avoid naming specific studios or IPs even when
// the style is clearly inspired by one (plan decision).
export const BABY_STYLES: Record<BabyStyleId, string> = {
  'pixar-3d':
    'Pixar-style 3D animated baby character, huge sparkling eyes, soft rounded face, subsurface scattering skin, cinematic studio lighting, ultra high quality 3D render, feature-film polish',
  ghibli:
    'hand-drawn fantasy watercolor baby character, dreamy pastel palette, delicate line work, whimsical storybook atmosphere, soft natural light',
  anime:
    'classic Japanese anime style baby character, clean bold line art, vibrant cel-shading, big expressive eyes, lively cheerful expression',
  claymation:
    'stop-motion claymation baby character, visible clay texture and sculpted seams, handmade warmth, soft studio lighting, tilt-shift look',
  chibi:
    'chibi style cute baby character, super-deformed proportions with oversized head and tiny body, kawaii blush cheeks, sticker-ready composition',
  watercolor:
    'watercolor storybook illustration of a baby, soft wet-on-wet washes, warm pastel bleeds, delicate brush strokes, textured paper feel',
  plush:
    'plush toy stuffed animal baby character, soft felt and fluffy fabric texture, visible stitched seams, cute button-like eyes, studio product lighting',
  'pixel-art':
    'retro 16-bit pixel art baby character, crisp pixels with limited color palette, SNES-era nostalgia, playful side-view composition',
};
