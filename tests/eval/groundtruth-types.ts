// Wspólny kształt ground truth (krok 2 planu) — używany przez groundtruth.ts (bootstrap),
// gt-editor.ts (ręczna korekta) i score.ts (metryki). Per-zdjęcie pola są supersetem tego, co
// zwracają WSZYSTKIE warianty promptu (v0-v3: markers+suggested_category; v4/v5: scene), żeby
// jeden GT dało się ocenić względem każdego wariantu.
import type { Box4, Marker, Role, SceneItem } from './schema.ts';

export type GtPhoto = {
  photoId: string;
  role: Role;
  car: { present: boolean; bbox: Box4 | null };
  plate: { readable: boolean; text: string | null; bbox: Box4 | null };
  markers: Marker[];
  scene: SceneItem[];
  categoryId: number; // kategoria WŁAŚCIWA dla tego zdjęcia z osobna (do metryk per-zdjęcie)
  // Pochodzenie poszczególnych pól — do gt-editor.ts (co jest jeszcze niezweryfikowane ręcznie)
  // i do groundtruth.ts (co nadpisać przy ponownym bootstrapie bez utraty ręcznych poprawek).
  source: { plate: 'platerecognizer' | 'llm-bootstrap' | 'manual'; rest: 'llm-bootstrap' | 'manual' };
  verified: boolean; // true dopiero po przejściu przez gt-editor.ts i pobraniu poprawionego JSON
};

export type GtCandidate = {
  reportId: string;
  photoIds: string[];
  expectedPlate: string | null; // tablica zgłoszenia (po splitByPlate)
  expectedCategoryId: number; // kategoria CAŁEGO zgłoszenia (po compose())
  expectedSplitCount: number; // ile pod-zgłoszeń powinno powstać ze splitByPlate (zwykle 1)
};

export type GroundTruth = {
  schemaVersion: number;
  generatedAt: string;
  photos: Record<string, GtPhoto>;
  candidates: Record<string, GtCandidate>;
};

export const GT_SCHEMA_VERSION = 1;
