// Poczekalnia zdjęć z aparatu w appce: paczki 1–3 zdjęć liczone WYŁĄCZNIE z czasu i GPS (bez ALPR, bez sieci).
// Bazą jest groupPhotos (lib/grouping.ts), który celowo nad-scala, bo w batchu dzieliła potem wizja po tablicy. Tu tablic nie ma,
// a szkic przyjmuje najwyżej 3 zdjęcia, więc dochodzą dwa kroki:
//   1. „Następne auto” w aparacie (carSeq) – twarda granica, której grupowanie nie przekracza;
//   2. klaster > 3 zdjęć dzielony przy największych przerwach w czasie (zdjęcia jednego auta padają zwykle szybciej niż przejście do kolejnego).
import { groupPhotos } from './grouping';
import type { PhotoItem } from '../types';

export const MAX_PACK = 3;
export const FIX_MAX_AGE_MS = 30_000; // starsza pozycja to już inne miejsce: lepiej zdjęcie bez GPS niż z cudzym adresem

export type WaitingPhoto = {
  id: string;
  uri: string;
  takenAtMs: number;
  datetimeOriginal: string; // "YYYY:MM:DD HH:mm:ss" – czas lokalny, jak EXIF DateTimeOriginal
  lat: number | null;
  lng: number | null;
  accuracy: number | null; // promień błędu GPS w metrach
  carSeq: number; // numer auta w aparacie (rośnie przy „Następne auto”)
  draftId?: string; // szkic, do którego trafiło zdjęcie
  usedAt?: number;
};

export type Pack = { id: string; photos: WaitingPhoto[]; startMs: number; endMs: number };
export type Fix = { lat: number; lng: number; accuracy: number | null; atMs: number };

const toPack = (photos: WaitingPhoto[]): Pack => ({
  id: photos[0].id,
  photos,
  startMs: photos[0].takenAtMs,
  endMs: photos[photos.length - 1].takenAtMs,
});

// Dzieli przy największej przerwie; przy remisie bliżej środka, żeby nie odcinać po jednym zdjęciu.
export function splitOversized(photos: WaitingPhoto[], max: number = MAX_PACK): WaitingPhoto[][] {
  if (photos.length <= max) return [photos];
  let at = 1, best = -1, bestMid = Infinity;
  const mid = photos.length / 2;
  for (let i = 1; i < photos.length; i++) {
    const gap = photos[i].takenAtMs - photos[i - 1].takenAtMs;
    const fromMid = Math.abs(i - mid);
    if (gap > best || (gap === best && fromMid < bestMid)) { at = i; best = gap; bestMid = fromMid; }
  }
  return [...splitOversized(photos.slice(0, at), max), ...splitOversized(photos.slice(at), max)];
}

// Paczki od najnowszej, zdjęcia w paczce od najstarszego.
export function packPhotos(photos: WaitingPhoto[]): Pack[] {
  const byCar = new Map<number, WaitingPhoto[]>();
  for (const p of photos) byCar.set(p.carSeq, [...(byCar.get(p.carSeq) ?? []), p]);
  const packs: Pack[] = [];
  for (const list of byCar.values()) {
    const byId = new Map(list.map((p) => [p.id, p]));
    const { candidates } = groupPhotos(list.map((p) => ({ id: p.id, fileName: null, datetimeOriginal: p.datetimeOriginal, lat: p.lat, lng: p.lng })));
    for (const c of candidates) {
      const cluster = c.photoIds.map((id) => byId.get(id)!).sort((a, b) => a.takenAtMs - b.takenAtMs);
      for (const part of splitOversized(cluster)) packs.push(toPack(part));
    }
  }
  return packs.sort((a, b) => b.startMs - a.startMs);
}

// Pozycja do zapisania przy zdjęciu: tylko świeża (patrz FIX_MAX_AGE_MS).
export function freshFix(fix: Fix | null, nowMs: number): Fix | null {
  return fix && nowMs - fix.atMs <= FIX_MAX_AGE_MS ? fix : null;
}

// Kształt, który przyjmuje formularz (usePhotoBatch). GPS zaokrąglony jak Geolocation.php::normalizeGeo() i lib/gallery.ts.
export function toPhotoItem(p: WaitingPhoto): PhotoItem {
  const round = (v: number | null) => (v == null ? null : Number(v.toFixed(4)));
  const lat = round(p.lat), lng = round(p.lng);
  return {
    id: p.id,
    uri: p.uri,
    fileName: null,
    exif: { datetimeOriginal: p.datetimeOriginal, lat, lng, make: null, model: null, width: null, height: null, hasGps: lat != null && lng != null },
  };
}
