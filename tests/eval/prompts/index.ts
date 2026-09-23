import { v0Prod } from './v0-prod.ts';
import { v1Fixed } from './v1-fixed.ts';
import { v2Pixels } from './v2-pixels.ts';
import { v3Categories } from './v3-categories.ts';
import { v4Relations } from './v4-relations.ts';
import { v5TwoStage } from './v5-twostage.ts';
import type { PromptVariant } from './types.ts';

export const PROMPT_VARIANTS: PromptVariant[] = [v0Prod, v1Fixed, v2Pixels, v3Categories, v4Relations, v5TwoStage];

export function getPromptVariant(id: string): PromptVariant {
  const v = PROMPT_VARIANTS.find((p) => p.id === id);
  if (!v) throw new Error(`nieznany wariant promptu: ${id} (dostępne: ${PROMPT_VARIANTS.map((p) => p.id).join(', ')})`);
  return v;
}

export type { PromptVariant, PromptContext, PromptImageInfo } from './types.ts';
