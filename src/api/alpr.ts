import type { AlprResult } from '../types';
import { normalizePlate } from '../lib/plate';

// Kontrakt ALPR (zgodny z backendem alpr.php: plateId + boxy).
// Analiza lokalna USUNIĘTA (decyzja: wolna, nic nie zwracała). Jedyna ścieżka: chmura (tymczasowo Spark 1.3).

export type LlmAlprResponse = {
  plateId: string | null;
  plateConfidence: number;
  plateBox: { x: number; y: number; w: number; h: number } | null;
  vehicleBox: { x: number; y: number; w: number; h: number } | null;
  vehicleDesc: string | null;
  notes?: string;
};

export function toAlprResult(photoId: string, llm: LlmAlprResponse): AlprResult {
  const plateId = normalizePlate(llm.plateId);
  const needsReview = plateId == null || llm.plateConfidence < 0.7;
  return {
    photoId,
    plateId,
    plateConfidence: llm.plateConfidence ?? 0,
    plateBox: llm.plateBox,
    vehicleBox: llm.vehicleBox,
    vehicleDesc: llm.vehicleDesc,
    needsReview,
    notes: llm.notes,
  };
}
