// Współdzielony kontrakt dla wariantów promptu (krok 3 planu). Każdy wariant buduje treść
// promptu z kontekstu chunku (które photo_index, jakie wymiary miniatur) — pipeline.ts dokleja
// resztę (obrazy jako image_url, ewentualny note o zakresie indeksów, jak analyzeChunk() w
// Vision.php) i woła model.

export type PromptImageInfo = { photo_index: number; width: number; height: number };

export type PromptContext = {
  photoIndices: number[]; // 0-based w obrębie CAŁEGO kandydata (nie tylko tego chunku)
  images: PromptImageInfo[]; // wymiary miniatury per zdjęcie w tym chunku, w kolejności photo_index
};

export type PromptVariant = {
  id: string;
  label: string;
  /** OPENAI_VISION_DETAIL odpowiednik — patrz uwaga w planie: cały harness poza v0-prod jedzie na 'high'. */
  detail: 'low' | 'high';
  /** Czy wariant to dwuetapowe wywołanie (v5-twostage) — pipeline.ts wtedy woła buildCall2 tylko dla zdjęć role==='car'. */
  twoStage?: boolean;
  build(ctx: PromptContext): string;
  /** Tylko dla twoStage: prompt drugiego wywołania (crop/pełne zdjęcie car) - tablica + boxy. */
  buildCall2?(ctx: PromptContext & { carDesc?: string }): string;
};
