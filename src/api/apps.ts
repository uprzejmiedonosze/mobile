// Lista zgłoszeń użytkownika: GET /api/rest/user/apps (src/api/rest/index.php → \user\apps()).
// Backend zwraca surowy JSON Application (bez pól wyliczanych z twiga: nazwa statusu, formal
// kategorii, recydywa) – te dopinamy po stronie klienta ze statycznych słowników.
import { udConfig } from '../config';
import { log, logFetch } from '../lib/log';
import { imageVersion, type PictureKey } from '../lib/reports';
import { authFetch } from './udApi';

export type AppImage = { thumb?: string; url?: string; width?: number; height?: number };

// Odbiorca zgłoszenia wyliczany przez backend (recipientData() w src/inc/API.php) – klient nie zna logiki SM/Policja.
export type Recipient = {
  key: string | null;
  name: string;
  shortName: string;
  isPolice: boolean;
  automated: boolean; // jest zautomatyzowany kanał wysyłki
  unknown: boolean;
  stopAgresjiForced: boolean;
};

export type UdApp = {
  id: string;
  number?: string;
  status: string;
  date: string; // "YYYY-MM-DDTHH:mm:ss", czas lokalny zdarzenia
  category: number | string;
  extensions?: (number | string)[];
  userComment?: string;
  privateComment?: string;
  externalId?: string;
  stopAgresji?: boolean | string; // truthy = zgłoszenie na Policję
  smCity?: string;
  dtFromPicture?: boolean;
  address?: {
    address?: string; addressGPS?: string; city?: string; voivodeship?: string; district?: string;
    county?: string; municipality?: string; postcode?: string; lat?: number | null; lng?: number | null;
  };
  carInfo?: { plateId?: string; brand?: string; model?: string; plateImage?: string; vehicleBox?: { x: number; y: number; width: number; height: number } }; // plateImage = wycinek tablicy, vehicleBox = ramka pojazdu z ALPR (piksele carImage)
  recipient?: Recipient | null;
  contextImage?: AppImage;
  carImage?: AppImage;
  thirdImage?: AppImage;
  statements?: { witness?: boolean };
  sent?: { date?: string; to?: string };
  statusHistory?: unknown[] | Record<string, unknown>; // PHP: tablica asocjacyjna (klucz = data) → w JSON obiekt
  wipPhotos?: Partial<Record<PictureKey, string>>; // id zdjęć z etapu „wip” przydzielonych do slotów (do zakończenia zgłoszenia)
};

export type StatusDef = { name: string; allowed?: string[]; sendable?: boolean; editable?: boolean };

export const PAGE_SIZE = 30;

export async function fetchApps(opts: { status?: string; search?: string; offset?: number; limit?: number } = {}): Promise<UdApp[]> {
  const q = new URLSearchParams({
    status: opts.status ?? 'all',
    limit: String(opts.limit ?? PAGE_SIZE),
    offset: String(opts.offset ?? 0),
  });
  // Uwaga: backend traktuje search !== 'all' jako LIKE, a domyślne '%' pasuje do wszystkiego – więc pomijamy puste.
  if (opts.search?.trim()) q.set('search', opts.search.trim());
  const res = await authFetch(`/api/rest/user/apps?${q}`);
  if (!res.ok) throw new Error(`Nie udało się pobrać zgłoszeń (HTTP ${res.status}).`);
  const j = await res.json();
  return Array.isArray(j) ? (j as UdApp[]) : [];
}

// Publiczny słownik statusów (ten sam plik co web) – nazwy i dozwolone przejścia.
export async function fetchStatuses(): Promise<Record<string, StatusDef>> {
  try {
    const res = await logFetch('apps', `${udConfig.base}/api/rest/config/statuses`);
    if (!res.ok) return {};
    return (await res.json()) as Record<string, StatusDef>;
  } catch (e: any) {
    log.warn('apps', `statusy: ${String(e?.message ?? e).slice(0, 150)}`);
    return {};
  }
}

// Liczniki zgłoszeń per status – `stats` z GET /api/rest/user/ (AddStatsMiddleware, \user\stats()),
// czyli licznik z całej bazy, a nie z aktualnie wczytanej strony listy.
export async function fetchStatusCounts(): Promise<Record<string, number>> {
  // fresh=1: liczniki zawsze z bazy – serwer cache'uje stats do 24 h (przeżyłyby np. usunięcie konta i ponowne logowanie)
  const res = await authFetch('/api/rest/user/?fresh=1');
  if (!res.ok) throw new Error(`Nie udało się pobrać liczników (HTTP ${res.status}).`);
  return ((await res.json()) as any)?.stats ?? {};
}

// PATCH /api/rest/app/{id}/status/{status} – zmiana statusu z listy (jak „ZMIEŃ” na webie).
export async function changeStatus(appId: string, status: string): Promise<void> {
  const res = await authFetch(`/api/rest/app/${encodeURIComponent(appId)}/status/${encodeURIComponent(status)}`, { method: 'PATCH' });
  if (!res.ok) throw new Error(`Nie udało się zmienić statusu (HTTP ${res.status}).`);
}

// PATCH /api/rest/app/{id}/fields – numer sprawy SM/Policji (`externalId`) i prywatne uwagi (`privateComment`); działa też po
// wysłaniu zgłoszenia. `suggestStatusChange` = wysłane + ma numer sprawy → zaproponuj status „potwierdzone” (jak na webie).
export async function setReportFields(appId: string, fields: { externalId?: string; privateComment?: string }): Promise<{ suggestStatusChange: boolean }> {
  const res = await authFetch(`/api/rest/app/${encodeURIComponent(appId)}/fields`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Nie udało się zapisać (HTTP ${res.status}).`);
  const j = (await res.json()) as { suggestStatusChange?: boolean };
  return { suggestStatusChange: !!j.suggestStatusChange };
}

// `full` = oryginał (url, ≤1600 px) zamiast miniatury – do powiększania zdjęcia. `type` = slot zdjęcia (wersja adresu, imageVersion).
export function imageUrl(img: AppImage | undefined, app: UdApp, full = false, type?: PictureKey): string | null {
  const p = (full && img?.url) || img?.thumb;
  if (!p) return null;
  const abs = /^https?:\/\//.test(p) ? p : `${udConfig.base}/${p.replace(/^\//, '')}`;
  return `${abs}?v=${imageVersion(app, type)}`;
}
