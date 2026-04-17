import { BABY_STYLES, isBabyStyleId } from './styles';

export interface BuildBabyImagePromptInput {
  styleId: unknown;
  userPrompt: unknown;
  hasImageInput: boolean;
}

// Builds the final prompt passed to kie by wrapping a style descriptor with
// either a "transform this photo" directive (image-referenced) or a
// "create a portrait" directive (text-only). Keep the wording natural so it
// composes cleanly with any extra user detail.
export function buildBabyImagePrompt({
  styleId,
  userPrompt,
  hasImageInput,
}: BuildBabyImagePromptInput): string {
  if (!isBabyStyleId(styleId)) {
    throw new Error('invalid styleId');
  }
  const descriptor = BABY_STYLES[styleId];
  const extra = typeof userPrompt === 'string' ? userPrompt.trim() : '';

  if (hasImageInput) {
    const base = `Transform the baby in this photo into a ${descriptor}. Preserve the baby's facial features, skin tone and identity so the result is clearly the same child.`;
    return extra ? `${base} Additional detail: ${extra}` : base;
  }

  const base = `A cute baby portrait rendered as ${descriptor}.`;
  return extra ? `${base} ${extra}` : base;
}
