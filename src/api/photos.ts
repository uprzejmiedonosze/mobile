// Etap „wip” po stronie backendu (src/inc/WipPhotos.php w ../uprzejmiedonosze): zdjęcia wysyłamy RAZ, jeszcze przed
// powstaniem szkicu zgłoszenia. Dalej operujemy tylko na `photoId` – analiza (vision/candidate) i przydział do slotu
// (POST /app/{id}/image z photoId) czytają plik z serwera, a ALPR liczy się raz na zdjęcie.
import { File } from 'expo-file-system';
import { log } from '../lib/log';
import type { Detection } from '../lib/roles';
import { apiJson, authFetch, UPLOAD_TIMEOUT_MS } from './udApi';

export type StagedPhoto = { photoId: string; width: number; height: number };

// POST /api/rest/photos/ – `meta` to data i GPS z EXIF (po przeskalowaniu zdjęcia EXIF znika, więc wysyłamy je osobno).
// `derived` = wycinek z oryginału zdjęcia już wysłanego i przeanalizowanego: serwer przelicza jego odczyt ALPR na współrzędne wycinka
// (bez nowego wywołania ALPR) i dziedziczy datę/GPS.
export async function stagePhoto(uri: string, meta: { dateTime?: string | null; lat?: number | null; lng?: number | null } = {}, derived?: { from: string; region: number[]; plate?: string | null }): Promise<StagedPhoto> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const form = new FormData();
      // UWAGA: globalny fetch to expo/fetch (SDK 57) – nie rozumie RN-owego {uri, name, type} w FormData; przyjmuje File
      form.append('image', new File(uri) as unknown as Blob);
      if (meta.dateTime) form.append('dateTime', meta.dateTime);
      if (meta.lat != null && meta.lng != null) { form.append('lat', String(meta.lat)); form.append('lng', String(meta.lng)); }
      if (derived) {
        form.append('derivedFrom', derived.from);
        form.append('region', JSON.stringify(derived.region));
        if (derived.plate) form.append('plate', derived.plate);
      }
      const res = await authFetch('/api/rest/photos/', { method: 'POST', body: form }, { timeoutMs: UPLOAD_TIMEOUT_MS });
      return await apiJson<StagedPhoto>(res, 'Nie udało się wysłać zdjęcia');
    } catch (e: any) {
      last = e;
      if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) throw e; // błąd klienta – powtórka nic nie zmieni
      log.warn('zdjecia', `stagePhoto próba ${attempt + 1}/3: ${String(e?.message ?? e).slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw last;
}

// POST /api/rest/photos/{photoId}/alpr – WSZYSTKIE odczyty ALPR zdjęcia (tablica, pewność, pole pojazdu, `winner` = kandydat na
// pojazd wg serwera). Liczone raz na zdjęcie; z nich `chooseRoles()` (lib/roles.ts) wybiera auto i kontekst. Bez LLM.
export async function analyzePhotoAlpr(photoId: string): Promise<Detection[]> {
  const res = await authFetch(`/api/rest/photos/${encodeURIComponent(photoId)}/alpr`, { method: 'POST' }, { timeoutMs: UPLOAD_TIMEOUT_MS });
  const j = await apiJson<{ detections?: Detection[] }>(res, 'Nie udało się odczytać tablicy ze zdjęcia');
  return j.detections ?? [];
}

// DELETE /api/rest/photos/{photoId} – best effort (nieprzydzielone zdjęcia i tak wygasają po 24 h).
export async function deleteStagedPhoto(photoId: string): Promise<void> {
  try { await authFetch(`/api/rest/photos/${encodeURIComponent(photoId)}`, { method: 'DELETE' }); } catch { /* wygaśnie samo */ }
}
