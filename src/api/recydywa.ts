import type { RecydywaGallery, RecydywaInfo } from '../types';
import { udConfig } from '../config';
import { log, logFetch } from '../lib/log';

// Backend UD: GET /api/rest/recydywa/{plateId} (src/api/rest/index.php, \recydywa\checkPlate
// w RecydywaStore.php) – ile razy tablica była już zgłaszana, a przy sharedHistory (2+ zgłoszeń
// od 2+ osób) też historia zgłoszeń. Ten sam mechanizm co MCP check_plate. Auth: Bearer,
// wymaga rejestracji i zaakceptowanego regulaminu (jak /api/rest/geo) – bez tokenu nie wołamy.
export async function fetchRecydywa(plateId: string, token?: string): Promise<RecydywaInfo | null> {
  if (!token) return null;
  try {
    const res = await logFetch('recydywa', `${udConfig.base}/api/rest/recydywa/${encodeURIComponent(plateId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      log.warn('recydywa', `${plateId}: HTTP ${res.status} – pomijam (non-fatal)`);
      return null;
    }
    return (await res.json()) as RecydywaInfo;
  } catch (e: any) {
    log.warn('recydywa', `${plateId}: ${String(e?.message ?? e).slice(0, 200)}`);
    return null;
  }
}

// Historia ze zdjęciami (bezpieczne miniatury: rozpikselowane bez zgody autora, z blurem twarzy) – dopiero po otwarciu historii,
// bo pierwszy odczyt generuje na serwerze obrazy galerii. Adresy zdjęć zamieniamy na pełne.
export async function fetchRecydywaGallery(plateId: string, token?: string): Promise<RecydywaGallery | null> {
  if (!token) return null;
  try {
    const res = await logFetch('recydywa', `${udConfig.base}/api/rest/recydywa/${encodeURIComponent(plateId)}/gallery`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      log.warn('recydywa', `${plateId}/gallery: HTTP ${res.status} – pomijam (non-fatal)`);
      return null;
    }
    const g = (await res.json()) as RecydywaGallery;
    return { ...g, reports: g.reports.map((r) => ({ ...r, imageUrl: `${udConfig.base}/${r.imageUrl.replace(/^\//, '')}` })) };
  } catch (e: any) {
    log.warn('recydywa', `${plateId}/gallery: ${String(e?.message ?? e).slice(0, 200)}`);
    return null;
  }
}
