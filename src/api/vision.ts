import { authFetch, UPLOAD_TIMEOUT_MS } from './udApi';
import { log } from '../lib/log';
import type { VisionPhoto } from '../lib/vision';

// Cienki klient POST /api/rest/vision/candidate (backend: src/inc/integrations/Vision.php).
// Cała analiza LLM (główny call + retry-crop nieczytelnej tablicy + weryfikacja bbox) dzieje się
// po stronie serwera w jednym żądaniu na kandydata – klucz OpenAI nigdy nie trafia do appki.
export type VisionItem = {
  photo_index: number; // globalny indeks w kandydacie
  photoId: string; // id zdjęcia z etapu „wip” (POST /api/rest/photos) – backend czyta plik ze swojego dysku
  b64?: string; // starszy wariant: zdjęcie w base64 w body (limity VISION_MAX_PHOTO_BYTES) – już nieużywany przez formularz
};

export class VisionQuotaError extends Error {}

export async function analyzeCandidate(reportId: string, items: VisionItem[], signal?: AbortSignal): Promise<VisionPhoto[]> {
  const res = await authFetch('/api/rest/vision/candidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      reportId,
      photos: items.map((i) => ({ photoId: i.photoId, photo_index: i.photo_index, ...(i.b64 ? { image: `data:image/jpeg;base64,${i.b64}` } : {}) })),
    }),
  }, { timeoutMs: UPLOAD_TIMEOUT_MS });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 429) throw new VisionQuotaError('Limit analiz wizyjnych wyczerpany – spróbuj za chwilę.');
    throw new Error(`analiza wizyjna: HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }

  const j = (await res.json()) as { photos: VisionPhoto[]; usage?: Record<string, number>; warnings?: string[] };
  if (j.usage) log.info('wizja', `${reportId}: ${JSON.stringify(j.usage)}`);
  for (const w of j.warnings ?? []) log.warn('wizja', `${reportId}: ${w}`);
  return j.photos;
}
