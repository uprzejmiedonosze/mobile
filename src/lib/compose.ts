// Fazy 7-11: split po tablicy, kompozycja 2-3 zdjęć, współdzielony kontekst,
// deterministyczna kategoria, draft_order + cache. Port analizuj_wizja.py (bez LLM).
import * as FileSystem from 'expo-file-system/legacy';
import { SCHEMA, ruleCategory, type VisionPhoto } from './vision';
import { log } from './log';

export type DraftItem = { photoId: string; role: string; sharedFrom?: string };

export type AnalysisRecord = {
  reportId: string;
  plate: string | null;
  photoIds: string[]; // wszystkie zdjęcia sub-grupy (kolejność czasu)
  photos: VisionPhoto[];
  selected: number[]; // indeksy w photos
  markers: string[];
  categoryId: number;
  suggestedCategory: number | null;
  categoryConfidence: number;
  needsReview: boolean;
  reviewReasons: string[];
  sharedContext?: { from: string; photoId: string; role: string };
  splitFrom?: string;
  draftOrder: DraftItem[];
  schema: number;
  cacheKey: string;
  // Wymiary MINIATURY wysłanej do backendu (nie oryginału!) per photoId – przestrzeń, w której
  // model liczy bboxy. Ustawiane przez AnalyzeScreen po compose(); opcjonalne, bo starsze wpisy
  // cache (przed tym polem) go nie mają – UdPhoto ma fallback na Image.getSize w takim wypadku.
  photoDims?: Record<string, { w: number; h: number }>;
};

const CACHE_FILE = 'analysis.json';

function scorePhoto(p: VisionPhoto): [number, number] {
  return [(p.markers?.length ?? 0) * 2 + (p.quality ?? 0), p.quality ?? 0];
}
function cmpScore(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

// Faza 7: podział po czytelnej tablicy; bez tablicy -> czasowo najbliższa grupa.
export function splitByPlate(
  reportId: string,
  photoIds: string[],
  photos: VisionPhoto[],
): Array<{ subId: string; subPhotoIds: string[]; subPhotos: VisionPhoto[]; split: boolean }> {
  const groups = new Map<string, number[]>();
  const nopic: number[] = [];
  photos.forEach((p, i) => {
    const t = p.plate?.readable ? p.plate.text : null;
    if (t) {
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t)!.push(i);
    } else nopic.push(i);
  });
  if (groups.size <= 1) return [{ subId: reportId, subPhotoIds: photoIds, subPhotos: photos, split: false }];
  for (const i of nopic) {
    let best: string | null = null;
    let bestD = Infinity;
    for (const [t, idxs] of groups) {
      const d = Math.min(...idxs.map((j) => Math.abs(photos[i].photo_index - photos[j].photo_index)));
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    groups.get(best!)!.push(i);
  }
  const ordered = [...groups.entries()].sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]));
  return ordered.map(([plate, idxs], k) => {
    idxs.sort((a, b) => a - b);
    const subPhotos = idxs.map((old, nw) => ({ ...photos[old], photo_index: nw }));
    return {
      subId: `${reportId}-${k + 1}`,
      subPhotoIds: idxs.map((o) => photoIds[o]),
      subPhotos,
      split: true,
    };
  });
}

// Faza 8: kompozycja (2-3 zdjęcia) + bramki. Zwraca rekord bez draftOrder/shared.
// catName: nazwa kategorii do komunikatu review (domyślnie "kat. N", gdy lista kategorii
// jeszcze nie jest znana – patrz AnalyzeScreen, gdzie pobierana jest raz przed pętlą kandydatów).
export function compose(
  subId: string,
  subPhotoIds: string[],
  subPhotos: VisionPhoto[],
  catName: (id: number) => string = (id) => `kat. ${id}`,
): AnalysisRecord {
  const reasons: string[] = [];
  const plates = subPhotos.filter((p) => p.plate?.readable).map((p) => p.plate.text as string);
  const plate = plates[0] ?? null;
  if (new Set(plates).size > 1) reasons.push(`rozne tablice [${[...new Set(plates)]}] — mozliwy split kandydata`);

  const ctx = subPhotos.map((p, i) => (p.role === 'context' ? i : -1)).filter((i) => i >= 0);
  const cars = subPhotos.map((p, i) => (['car', 'third'].includes(p.role) && p.plate?.readable ? i : -1)).filter((i) => i >= 0);
  if (!ctx.length) reasons.push('brak zdjecia kontekstu');
  if (!cars.length) reasons.push('brak zdjecia auta z czytelna tablica');

  const selected: number[] = [];
  if (ctx.length) selected.push(ctx.sort((a, b) => cmpScore(scorePhoto(subPhotos[a]), scorePhoto(subPhotos[b]))).pop()!);
  if (cars.length) {
    const best = cars
      .sort((a, b) => {
        const ra = subPhotos[a].role === 'car' ? 1 : 0;
        const rb = subPhotos[b].role === 'car' ? 1 : 0;
        return rb - ra || subPhotos[b].quality - subPhotos[a].quality || b - a;
      })
      .pop()!;
    if (!selected.includes(best)) selected.push(best);
  }
  const rest = subPhotos
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => !selected.includes(i) && ['third', 'context', 'car'].includes(p.role) && (p.quality ?? 0) >= 0.4)
    .sort((a, b) => {
      const ta = a.p.role === 'third' ? 1 : 0;
      const tb = b.p.role === 'third' ? 1 : 0;
      return tb - ta || cmpScore(scorePhoto(b.p), scorePhoto(a.p));
    })
    .map(({ i }) => i);
  if (rest.length && selected.length < 3) selected.push(rest[0]);
  selected.sort((a, b) => a - b);

  const markers = [...new Set(selected.flatMap((i) => subPhotos[i].markers ?? []))].sort();
  const ruleCid = ruleCategory(markers);
  const sugs = selected.map((i) => subPhotos[i].suggested_category).filter((s): s is number => typeof s === 'number');
  const sugCid = sugs.length ? [...new Set(sugs)].sort((a, b) => sugs.filter((s) => s === b).length - sugs.filter((s) => s === a).length)[0] : null;
  const conf = Math.max(0, ...selected.map((i) => subPhotos[i].category_confidence ?? 0));
  if (sugCid != null && sugCid !== ruleCid) reasons.push(`kategoria: ${catName(sugCid)} (model), ${catName(ruleCid)} (reguła)`);
  if (ruleCid === 0) reasons.push('brak markera kategorii');
  if (selected.some((i) => subPhotos[i].plate?.plate_check === 'unverified-box')) reasons.push('pozycja tablicy niepotwierdzona');

  return {
    reportId: subId,
    plate: plate,
    photoIds: subPhotoIds,
    photos: subPhotos,
    selected,
    markers,
    categoryId: ruleCid,
    suggestedCategory: sugCid,
    categoryConfidence: Math.round(conf * 100) / 100,
    needsReview: reasons.length > 0,
    reviewReasons: reasons,
    splitFrom: undefined,
    draftOrder: [],
    schema: SCHEMA,
    cacheKey: '',
  };
}

// Faza 9: reguła B – sub-grupa z tablicą bez kontekstu pożycza najlepszy kontekst rodzeństwa.
export function attachSharedContext(recs: AnalysisRecord[]): void {
  const pool: Array<{ score: [number, number]; from: string; photoId: string; photo: VisionPhoto }> = [];
  for (const rec of recs) {
    rec.photos.forEach((p, k) => {
      if (p.role === 'context') pool.push({ score: scorePhoto(p), from: rec.reportId, photoId: rec.photoIds[k], photo: p });
    });
  }
  if (!pool.length) return;
  for (const rec of recs) {
    if (!rec.reviewReasons.includes('brak zdjecia kontekstu')) continue;
    if (!rec.plate) continue;
    const sib = pool.filter((c) => c.from !== rec.reportId);
    if (!sib.length) continue;
    sib.sort((a, b) => cmpScore(b.score, a.score));
    const best = sib[0];
    rec.sharedContext = { from: best.from, photoId: best.photoId, role: 'context' };
    rec.reviewReasons = rec.reviewReasons.filter((r) => r !== 'brak zdjecia kontekstu');
    if (!rec.reviewReasons.length) rec.needsReview = false;
  }
}

// Faza 11: kolejność do szkicu – pożyczony kontekst, własne konteksty, auta, reszta.
export function buildDraftOrder(rec: AnalysisRecord): void {
  const items: DraftItem[] = [];
  if (rec.sharedContext) items.push({ photoId: rec.sharedContext.photoId, role: 'context', sharedFrom: rec.sharedContext.from });
  const q = (k: number) => rec.photos[k]?.quality ?? 0;
  const sel = rec.selected;
  const ctx = sel.filter((k) => rec.photos[k]?.role === 'context').sort((a, b) => q(b) - q(a));
  const cars = sel.filter((k) => rec.photos[k]?.role === 'car').sort((a, b) => q(b) - q(a));
  const rest = sel.filter((k) => !ctx.includes(k) && !cars.includes(k)).sort((a, b) => q(b) - q(a));
  for (const k of [...ctx, ...cars, ...rest]) {
    items.push({ photoId: rec.photoIds[k], role: rec.photos[k]?.role ?? 'car' });
  }
  rec.draftOrder = items;
}

// Klucz cache: reportId + zdjęcia (kolejność czasu). Zmiana SCHEMA unieważnia.
export function cacheKeyFor(reportId: string, photoIds: string[]): string {
  return `${reportId}:${photoIds.join(',')}:s${SCHEMA}`;
}

async function cachePath(): Promise<string> {
  const FS = FileSystem as any;
  const dir = FS.documentDirectory ?? FS.cacheDirectory;
  return `${dir}analysis.json`;
}

export async function loadAnalysisCache(): Promise<Record<string, AnalysisRecord>> {
  try {
    const FS = FileSystem as any;
    const path = await cachePath();
    const info = await FS.getInfoAsync(path);
    if (!info.exists) return {};
    const raw = await FS.readAsStringAsync(path);
    const j = JSON.parse(raw);
    return j && typeof j === 'object' ? j : {};
  } catch (e: any) {
    log.warn('wizja', `cache odczyt: ${String(e?.message ?? e).slice(0, 120)}`);
    return {};
  }
}

export async function saveAnalysisCache(all: Record<string, AnalysisRecord>): Promise<void> {
  try {
    const FS = FileSystem as any;
    await FS.writeAsStringAsync(await cachePath(), JSON.stringify(all));
  } catch (e: any) {
    log.warn('wizja', `cache zapis: ${String(e?.message ?? e).slice(0, 120)}`);
  }
}
