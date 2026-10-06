// Tworzenie/edycja zgłoszenia – cienkie wrappery na JWT REST (/api/rest/app/*, patrz API.md w backendzie).
// Cała logika domenowa (walidacja, SM/Policja, numer, efekty uboczne „Potwierdź”) siedzi w backendzie.
import { File } from 'expo-file-system';
import type { GeoAddress } from '../types';
import { toGeoAddress } from './geo';
import type { Recipient, UdApp } from './apps';
import { apiJson, authFetch, UPLOAD_TIMEOUT_MS } from './udApi';

export type PictureType = 'contextImage' | 'carImage' | 'thirdImage';

export type ReportForm = {
  plateId: string;
  address: string; // adres widoczny dla użytkownika (web: `lokalizacja`)
  addressGPS?: string; // co zwrócił geokoder
  city?: string;
  voivodeship?: string;
  district?: string;
  county?: string;
  municipality?: string;
  postcode?: string;
  lat?: number | null;
  lng?: number | null;
  datetime: string; // "YYYY-MM-DDTHH:mm:ss"
  dtFromPicture: boolean;
  category: number;
  extensions: number[];
  comment: string;
  witness: boolean;
  stopAgresji: 'SA' | 'SM';
};

// Dane ekranu potwierdzenia (GET /api/rest/app/{id}/confirmation → confirmationData() w API.php): teksty odmienione
// przez płeć i sformatowane tak jak na www (potwierdz.html.twig), więc klient tylko je wyświetla.
export type Confirmation = {
  body: string; // tekst formalny kategorii + rozszerzenia + komentarz
  witness: string; // „Nie byłeś świadkiem parkowania.” / „Byłeś świadkiem parkowania.”
  shortAddress: string;
  plateId: string | null;
  vehicleBox: { x: number; y: number; width: number; height: number } | null; // piksele zdjęcia auta
  recipient: { name: string; shortName: string; automated: boolean; unknown: boolean };
  sender: { name: string; email: string; address: string; msisdn: string; edelivery: string };
};

export type FinishResult = {
  app: UdApp;
  edited: boolean;
  appsCount: number;
  isPatron: boolean;
  // sent | manual (odbiorca bez automatycznej wysyłki – dokończ na www) | failed | not_requested
  sendMode: 'sent' | 'manual' | 'failed' | 'not_requested';
  sendError: string | null;
};

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function createDraft(): Promise<UdApp> {
  return apiJson(await authFetch('/api/rest/app/new', { method: 'POST' }), 'Nie udało się utworzyć zgłoszenia');
}

export async function fetchReport(appId: string): Promise<UdApp> {
  return apiJson(await authFetch(`/api/rest/app/${encodeURIComponent(appId)}`), 'Nie udało się pobrać zgłoszenia');
}

// Przydział zdjęcia z etapu „wip” (api/photos.ts) do slotu szkicu – serwer bierze bajty ze swojego dysku, skaluje je i
// przycina wycinek tablicy; ALPR nie jest wołany ponownie (wynik leży przy zdjęciu).
// `crop: 'vehicle'` (tylko auto): zamiast całego zdjęcia zapisz wycinek pojazdu z ALPR + 20% marginesu – gdy jedno zdjęcie
// jest jednocześnie kontekstem i autem. `plate` (tylko auto): tablica pojazdu wskazanego przez użytkownika, gdy na zdjęciach są dwa auta.
export async function assignReportPhoto(appId: string, type: PictureType, photoId: string, opts: { crop?: 'vehicle'; plate?: string } = {}): Promise<UdApp> {
  const res = await authFetch(`/api/rest/app/${encodeURIComponent(appId)}/image`, json({ pictureType: type, photoId, ...(opts.crop ? { crop: opts.crop } : {}), ...(opts.plate ? { plate: opts.plate } : {}) }));
  return apiJson(res, 'Nie udało się przypisać zdjęcia');
}

// Wycinek tablicy z oryginału zdjęcia (pełna rozdzielczość) zamiast serwerowego z kopii 1600 px – podmienia `carInfo.plateImage`
// (formularz, strona zgłoszenia, PDF). Serwerowy wycinek zostaje rezerwą, gdy to wywołanie się nie uda.
export async function uploadPlateImage(appId: string, uri: string): Promise<UdApp> {
  const form = new FormData();
  form.append('image', new File(uri) as unknown as Blob); // expo/fetch (SDK 57) nie rozumie RN-owego {uri, name, type} w FormData – przyjmuje File
  const res = await authFetch(`/api/rest/app/${encodeURIComponent(appId)}/plate-image`, { method: 'POST', body: form }, { timeoutMs: UPLOAD_TIMEOUT_MS });
  return apiJson(res, 'Nie udało się wysłać wycinka tablicy');
}

export async function deleteReportImage(appId: string, type: PictureType): Promise<UdApp> {
  const res = await authFetch(`/api/rest/app/${encodeURIComponent(appId)}/image/${type}`, { method: 'DELETE' });
  return apiJson(res, 'Nie udało się usunąć zdjęcia');
}

// „Dalej” z webowego formularza (status → ready). 422 → ApiError z `field`.
export async function saveReport(appId: string, f: ReportForm): Promise<UdApp> {
  const res = await authFetch(`/api/rest/app/${encodeURIComponent(appId)}`, json({ ...f, dtFromPicture: f.dtFromPicture ? 1 : 0 }));
  return apiJson(res, 'Nie udało się zapisać zgłoszenia');
}

export async function fetchConfirmation(appId: string): Promise<Confirmation> {
  return apiJson(await authFetch(`/api/rest/app/${encodeURIComponent(appId)}/confirmation`), 'Nie udało się pobrać podsumowania');
}

// „Potwierdź” (+ opcjonalnie wyślij) jednym wywołaniem – efekty uboczne jak /app/done na webie.
export async function finishReport(appId: string, send: boolean): Promise<FinishResult> {
  const res = await authFetch(`/api/rest/app/${encodeURIComponent(appId)}/finish`, json({ send }));
  return apiJson(res, 'Nie udało się potwierdzić zgłoszenia');
}

// Adres wpisany ręcznie („Ulica 10, Miasto”) → współrzędne + dane strukturalne + podpowiedź SM/Policja.
// null = nie znaleziono (404) – formularz zostaje z samym tekstem.
export async function searchAddress(q: string): Promise<{ lat: number; lng: number; geo: GeoAddress } | null> {
  const res = await authFetch(`/api/rest/geo/search?q=${encodeURIComponent(q)}`);
  if (res.status === 404) return null;
  const j = await apiJson<any>(res, 'Nie udało się wyszukać adresu');
  return { lat: j.lat, lng: j.lng, geo: toGeoAddress(j) };
}

// Linia do komentarza i ostrzeżenie o masie liczone w backendzie (port vehicle-info.js: \vehicle\lookup).
export type VehicleDescription = { brand: string | null; model: string | null; comment: string | null; weightWarning: string | null };

export async function fetchVehicleDescription(plateId: string, ocr: { brand?: string; model?: string } = {}): Promise<VehicleDescription | null> {
  const q = new URLSearchParams();
  if (ocr.brand) q.set('brand', ocr.brand);
  if (ocr.model) q.set('model', ocr.model);
  try {
    const res = await authFetch(`/api/rest/vehicle/${encodeURIComponent(plateId.replace(/\s/g, ''))}?${q}`);
    return res.ok ? ((await res.json()) as VehicleDescription) : null;
  } catch {
    return null; // wzbogacenie jest opcjonalne – jak na webie
  }
}

export type { Recipient };
