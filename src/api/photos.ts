// Etap „wip” po stronie backendu (src/inc/WipPhotos.php w ../uprzejmiedonosze): zdjęcia wysyłamy RAZ, jeszcze przed
// powstaniem szkicu zgłoszenia. Dalej operujemy tylko na `photoId` – analiza (vision/candidate) i przydział do slotu
// (POST /app/{id}/image z photoId) czytają plik z serwera, a ALPR liczy się raz na zdjęcie.
import { File } from 'expo-file-system';
import { log } from '../lib/log';
import { apiJson, authFetch } from './udApi';

export type StagedPhoto = { photoId: string; width: number; height: number };

// POST /api/rest/photos/ – `meta` to data i GPS z EXIF (po przeskalowaniu zdjęcia EXIF znika, więc wysyłamy je osobno).
export async function stagePhoto(uri: string, meta: { dateTime?: string | null; lat?: number | null; lng?: number | null } = {}): Promise<StagedPhoto> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const form = new FormData();
      // UWAGA: globalny fetch to expo/fetch – przyjmuje File (patrz uploadReportImage w reports.ts)
      form.append('image', new File(uri) as unknown as Blob);
      if (meta.dateTime) form.append('dateTime', meta.dateTime);
      if (meta.lat != null && meta.lng != null) { form.append('lat', String(meta.lat)); form.append('lng', String(meta.lng)); }
      const res = await authFetch('/api/rest/photos/', { method: 'POST', body: form });
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

// DELETE /api/rest/photos/{photoId} – best effort (nieprzydzielone zdjęcia i tak wygasają po 24 h).
export async function deleteStagedPhoto(photoId: string): Promise<void> {
  try { await authFetch(`/api/rest/photos/${encodeURIComponent(photoId)}`, { method: 'DELETE' }); } catch { /* wygaśnie samo */ }
}
