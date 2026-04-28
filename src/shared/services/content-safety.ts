export const BABY_SAFETY_CONFIRMATION_OPTION = 'safety_confirmation';
export const BABY_SAFETY_CONTENT_POLICY_MESSAGE = 'content_policy_violation';
export const BABY_SAFETY_CONFIRMATION_REQUIRED_MESSAGE =
  'safety_confirmation_required';

const UNSAFE_BABY_PROMPT_PATTERNS = [
  /\b(?:nude|nudity|naked|topless|bottomless|undressed|shirtless|diaper|underwear|swimsuit|bikini|bath|bathtub|shower|sex|sexual|sexually|sexy|erotic|porn|pornographic|pornography|fetish|lingerie|seductive|sensual|provocative|onlyfans|lolita|loli|csam|child\s*porn)\b/i,
  /\b(?:blood|bloody|gore|gory|gun|knife|weapon|weapons|murder|suicide|corpse|dead\s*body|torture|abuse|assault|beaten|bruised)\b/i,
];

const UNSAFE_BABY_PROMPT_TERMS = [
  '\u88f8\u4f53',
  '\u5168\u88f8',
  '\u8d64\u88f8',
  '\u88f8\u9732',
  '\u88f8\u7167',
  '\u8272\u60c5',
  '\u6027\u5316',
  '\u6027\u611f',
  '\u6210\u4eba\u5185\u5bb9',
  '\u5185\u8863',
  '\u6bd4\u57fa\u5c3c',
  '\u8bf1\u60d1',
  '\u6311\u9017',
  '\u66b4\u9732',
  '\u5c3f\u5e03',
  '\u7eb8\u5c3f\u88e4',
  '\u6d17\u6fa1',
  '\u6d74\u7f38',
  '\u6dcb\u6d74',
  '\u8840\u8165',
  '\u6d41\u8840',
  '\u66b4\u529b',
  '\u67aa',
  '\u5200',
  '\u6b66\u5668',
  '\u8c0b\u6740',
  '\u81ea\u6740',
  '\u5c38\u4f53',
  '\u8650\u5f85',
  '\u6bb4\u6253',
  '\u88f8\u306e',
  '\u88f8\u3067',
  '\u88f8\u753b\u50cf',
  '\u6027\u7684',
  '\u30bb\u30af\u30b7\u30fc',
  '\u30dd\u30eb\u30ce',
  '\u4e0b\u7740',
  '\u30d3\u30ad\u30cb',
  '\u6311\u767a\u7684',
  '\u304a\u98a8\u5442',
  '\u5165\u6d74',
  '\u6d74\u69fd',
  '\u30b7\u30e3\u30ef\u30fc',
  '\u9283',
  '\u30ca\u30a4\u30d5',
  '\u6bba\u5bb3',
  '\u81ea\u6bba',
  '\u6b7b\u4f53',
];

const UPSTREAM_MODERATION_ERROR_PATTERNS = [
  /content[_\s-]*(?:policy|moderation|safety)/i,
  /policy\s*violation/i,
  /violat(?:e|ed|ion).*policy/i,
  /(?:prompt|content).*(?:flagged|blocked|moderated)/i,
  /(?:moderator|moderation|inappropriate|nsfw|not\s*safe)/i,
  /sensitive\s*(?:word|content)/i,
  /sexually\s*explicit|sexual\s*content|porn/i,
];

function normalizeSafetyText(value: unknown): string {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase();
}

export function hasBabySafetyConfirmation(options: unknown): boolean {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return false;
  }

  return (
    (options as Record<string, unknown>)[BABY_SAFETY_CONFIRMATION_OPTION] ===
    true
  );
}

export function assertBabySafetyConfirmation(options: unknown) {
  if (!hasBabySafetyConfirmation(options)) {
    throw new Error(BABY_SAFETY_CONFIRMATION_REQUIRED_MESSAGE);
  }
}

export function isBabyGenerationPromptSafe(prompt: unknown): boolean {
  const normalized = normalizeSafetyText(prompt);
  if (!normalized) {
    return true;
  }

  return (
    !UNSAFE_BABY_PROMPT_PATTERNS.some((pattern) =>
      pattern.test(normalized)
    ) &&
    !UNSAFE_BABY_PROMPT_TERMS.some((term) => normalized.includes(term))
  );
}

export function assertBabyGenerationPromptSafe(prompt: unknown) {
  if (!isBabyGenerationPromptSafe(prompt)) {
    throw new Error(BABY_SAFETY_CONTENT_POLICY_MESSAGE);
  }
}

export function normalizeBabySafetyErrorMessage(rawMessage: unknown): string {
  const original = String(rawMessage || '');
  const normalized = normalizeSafetyText(original);

  if (!normalized) {
    return '';
  }

  if (normalized.includes(BABY_SAFETY_CONFIRMATION_REQUIRED_MESSAGE)) {
    return BABY_SAFETY_CONFIRMATION_REQUIRED_MESSAGE;
  }

  if (
    normalized.includes(BABY_SAFETY_CONTENT_POLICY_MESSAGE) ||
    UPSTREAM_MODERATION_ERROR_PATTERNS.some((pattern) =>
      pattern.test(normalized)
    )
  ) {
    return BABY_SAFETY_CONTENT_POLICY_MESSAGE;
  }

  return original;
}

export function isBabySafetyConfirmationRequiredMessage(
  rawMessage: unknown
): boolean {
  return (
    normalizeBabySafetyErrorMessage(rawMessage) ===
    BABY_SAFETY_CONFIRMATION_REQUIRED_MESSAGE
  );
}

export function isBabySafetyContentPolicyMessage(rawMessage: unknown): boolean {
  return (
    normalizeBabySafetyErrorMessage(rawMessage) ===
    BABY_SAFETY_CONTENT_POLICY_MESSAGE
  );
}
