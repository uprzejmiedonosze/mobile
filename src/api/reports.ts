// Tworzenie/edycja zgłoszenia – cienkie wrappery na JWT REST (/api/rest/app/*, patrz API.md w backendzie).
// Cała logika domenowa (walidacja, SM/Policja, numer, efekty uboczne „Potwierdź”) siedzi w backendzie.
import { File } from 'expo-file-system';
import { downscale } from '../lib/resize';
import type { GeoAddress } from '../types';
import { toGeoAddress } from './geo';
import type { Recipient, UdApp } from './apps';
import { apiJson, authFetch } from './udApi';

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

// multipart: pole `image` + `pictureType` (+ dateTime/dtFromPicture/lat/lng dla carImage). Serwer sam
// ustawia datę i GPS ze zdjęcia auta oraz rozpoznaje tablicę (ALPR) – odpowiedź to zaktualizowane zgłoszenie.
export async function uploadReportImage(
  appId: string,
  type: PictureType,
  uri: string,
  meta: { dateTime?: string | null; lat?: number | null; lng?: number | null } = {},
  prescaled = false, // true = `uri` jest już po downscale() (np. to samo zdjęcie poszło do analizy)
): Promise<UdApp> {
  const small = prescaled ? { uri } : await downscale(uri);
  const form = new FormData();
  // UWAGA: globalny fetch to expo/fetch (SDK 57) – nie rozumie RN-owego {uri, name, type} w FormData
  // ("Unsupported FormDataPart implementation"); przyjmuje string, Blob albo obiekt z bytes(), czyli File.
  form.append('image', new File(small.uri) as unknown as Blob);
  form.append('pictureType', type);
  if (type === 'carImage') {
    if (meta.dateTime) {
      form.append('dateTime', meta.dateTime);
      form.append('dtFromPicture', 'true');
    }
    if (meta.lat != null && meta.lng != null) {
      form.append('lat', String(meta.lat));
      form.append('lng', String(meta.lng));
    }
  }
  // bez Content-Type – fetch ustawia multipart boundary sam
  const res = await authFetch(`/api/rest/app/${encodeURIComponent(appId)}/image`, { method: 'POST', body: form });
  return apiJson(res, 'Nie udało się wysłać zdjęcia');
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
