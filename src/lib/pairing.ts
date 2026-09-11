import type { AlprResult, PhotoItem, PhotoPair } from '../types';
import { plateKey } from './plate';

function distM(aLat: number | null, aLng: number | null, bLat: number | null, bLng: number | null): number | null {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const R = 6371000;
  const dLa = ((bLat - aLat) * Math.PI) / 180;
  const dLo = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLa / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function dtDiffMin(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const t = new Date(a).getTime() - new Date(b).getTime();
  if (Number.isNaN(t)) return null;
  return Math.abs(t) / 60000;
}

// Grupowanie: najpierw po tablicy, potem po czasie+GPS. W grupie: szerszy kadr = kontekst.
// Heurystyka szerokości: mniejszy udział vehicleBox w kadrze => kontekst. Bez boxów: wcześniejsze = kontekst.
export function pairPhotos(photos: PhotoItem[], results: AlprResult[]): PhotoPair[] {
  const byId = new Map(photos.map((p) => [p.id, p]));
  const resById = new Map(results.map((r) => [r.photoId, r]));
  const used = new Set<string>();
  const pairs: PhotoPair[] = [];

  // 1) po tablicy
  const groups = new Map<string, string[]>();
  for (const r of results) {
    const k = plateKey(r.plateId);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r.photoId);
  }
  for (const [k, ids] of groups) {
    const fresh = ids.filter((id) => !used.has(id));
    for (let i = 0; i < fresh.length; i += 2) {
      const a = fresh[i];
      const b = fresh[i + 1] ?? null;
      if (b) {
        const ab = resById.get(a)?.vehicleBox;
        const bb = resById.get(b)?.vehicleBox;
        const area = (x?: { w: number; h: number } | null) => (x ? x.w * x.h : 500 * 500);
        const contextFirst = area(ab) <= area(bb) ? a : b;
        const close = contextFirst === a ? b : a;
        pairs.push({ id: `pair-${k}-${i / 2}`, contextPhotoId: contextFirst, closeupPhotoId: close, plateKey: k });
        used.add(a);
        used.add(b);
      } else {
        pairs.push({ id: `pair-${k}-0`, contextPhotoId: a, closeupPhotoId: null, plateKey: k });
        used.add(a);
      }
    }
  }

  // 2) reszta po czasie+GPS (<5min i <50m)
  const rest = photos.map((p) => p.id).filter((id) => !used.has(id));
  const restSorted = [...rest].sort((a, b) => {
    const da = byId.get(a)?.exif.datetimeOriginal ?? '';
    const db = byId.get(b)?.exif.datetimeOriginal ?? '';
    return da.localeCompare(db);
  });
  for (let i = 0; i < restSorted.length; i++) {
    const id = restSorted[i];
    if (used.has(id)) continue;
    let partner: string | null = null;
    for (let j = i + 1; j < restSorted.length; j++) {
      const cand = restSorted[j];
      if (used.has(cand)) continue;
      const A = byId.get(id)!;
      const B = byId.get(cand)!;
      const dt = dtDiffMin(A.exif.datetimeOriginal, B.exif.datetimeOriginal);
      const d = distM(A.exif.lat, A.exif.lng, B.exif.lat, B.exif.lng);
      if ((dt == null || dt <= 5) && (d == null || d <= 50)) {
        partner = cand;
        break;
      }
    }
    if (partner) {
      pairs.push({ id: `pair-t-${i}`, contextPhotoId: id, closeupPhotoId: partner, plateKey: null });
      used.add(id);
      used.add(partner);
    } else {
      pairs.push({ id: `pair-t-${i}`, contextPhotoId: id, closeupPhotoId: null, plateKey: null });
      used.add(id);
    }
  }
  return pairs;
}
