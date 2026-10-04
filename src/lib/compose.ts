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

// "80% numeru się zgadza -> ten sam pojazd" — ustalone z użytkownikiem po realnym przypadku
// (model odczytał "GD314RR", ALPR "GD311RR" dla tego samego auta). Liczone bez wspólnego
// wyróżnika powiatu ("314RR" vs "311RR": 1 błąd na 5 znaków = 80%), patrz fullSimilarity(). Świadomie zostaje deterministyczne (nie LLM) — ta sama
// zasada co reszta pliku i co stoi za hybrid-pr/ALPR: LLM zawodzi przy dokładnym odczycie tablic,
// więc scalanie bliskich odczytów robi kod, nie kolejne pytanie do modelu.
export const PLATE_SIMILARITY_THRESHOLD = 0.8;

// Pomyłki OCR między znakami podobnymi wizualnie kosztują pół błędu (realny przypadek: częściowy
// odczyt ALPR "KBR0" przy tablicy "Z0JKBRO" — zero vs litera O).
const CONFUSABLE = new Set(['0O', '0D', '0Q', 'OQ', '1I', '2Z', '5S', '6G', '8B'].flatMap((p) => [p, p[1] + p[0]]));
const subCost = (a: string, b: string) => (a === b ? 0 : CONFUSABLE.has(a + b) ? 0.5 : 1);

function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j - 1] + subCost(a[i - 1], b[j - 1]), dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }
  return dp[a.length][b.length];
}

// Wyróżnik powiatu (wiodące litery, max 3: ZS, ZSZ, ZPL…) powtarza się u wielu aut w tej samej
// okolicy, więc nie jest dowodem, że to ten sam pojazd — liczy się dalsza część tablicy.
function regionPrefixLen(t: string): number {
  return t.match(/^[A-Z]{1,3}/)?.[0].length ?? 0;
}

// Dwie pełne tablice (długość różna max o 1): podobieństwo po odcięciu WSPÓLNEGO wyróżnika powiatu.
function fullSimilarity(a: string, b: string): number {
  const maxK = Math.min(regionPrefixLen(a), regionPrefixLen(b));
  let k = 0;
  while (k < maxK && a[k] === b[k]) k++;
  const ra = a.slice(k);
  const rb = b.slice(k);
  if (!ra.length && !rb.length) return 1;
  return 1 - editDistance(ra, rb) / Math.max(ra.length, rb.length);
}

// Częściowy odczyt (np. auto z boku kadru): krótszy tekst s dopasowany do dowolnego fragmentu l
// (całe s, fragment l). Wymaga ≤1 błędu na 4 znaki ORAZ min. 3 trafionych znaków poza
// wyróżnikiem powiatu l — sam "ZS6…" pasowałby do połowy aut w Szczecinie.
export const PARTIAL_MAX_COST_PER_CHAR = 0.25;
function partialMatch(s: string, l: string): boolean {
  const m = s.length;
  const n = l.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) dp[i][0] = i;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j - 1] + subCost(s[i - 1], l[j - 1]), dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }
  let end = 0;
  for (let j = 1; j <= n; j++) if (dp[m][j] < dp[m][end]) end = j;
  if (dp[m][end] > PARTIAL_MAX_COST_PER_CHAR * m) return false;

  const p = regionPrefixLen(l);
  let hits = 0;
  for (let i = m, j = end; i > 0; ) {
    const c = j > 0 ? subCost(s[i - 1], l[j - 1]) : Infinity;
    if (j > 0 && dp[i][j] === dp[i - 1][j - 1] + c) {
      if (c < 1 && j - 1 >= p) hits++;
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j] + 1) i--;
    else j--;
  }
  return hits >= 3;
}

// Jedno dopasowanie tablic dla całego ogona: podział kandydata po tablicy, przydział ról i wybór
// pożyczonego kontekstu. Dwa różne auta o podobnych numerach obok siebie to rzadkość, więc fuzzy
// jest tu bezpieczniejszy niż rozbicie jednego auta na dwa zgłoszenia przez jeden zły znak.
export function plateMatches(a: string, b: string): boolean {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (l.length - s.length <= 1) return fullSimilarity(a, b) >= PLATE_SIMILARITY_THRESHOLD;
  return s.length >= 4 && partialMatch(s, l);
}

export function vehicleAreaFor(p: VisionPhoto, plate: string): number {
  const hits = (p.alpr_all ?? []).filter((d) => d.vehicle_area != null && plateMatches(d.text, plate));
  return Math.max(0, ...hits.map((d) => d.vehicle_area as number));
}

// Role z ALPR (SCHEMA 8), nie od modelu: gpt-5-nano mimo instrukcji w prompcie daje dwa 'car' dla
// tego samego auta (brak kontekstu -> review) albo 'third' dla innego pojazdu. Tu: car = zdjęcie,
// na którym pojazd z tablicą grupy jest największy (najbliżej autora); kontekst = z pozostałych
// to, na którym jest najmniejszy albo go nie widać (najszersze ujęcie); reszta = third.
// 'unusable' zostaje. Gdy ALPR nie widzi tej tablicy na żadnym zdjęciu — zostają role modelu.
export function assignRoles(photos: VisionPhoto[], plate: string | null): VisionPhoto[] {
  if (!plate) return photos;
  const q = (i: number) => photos[i].quality ?? 0;
  const usable = photos
    .map((p, i) => ({ i, area: vehicleAreaFor(p, plate) }))
    .filter(({ i }) => photos[i].role !== 'unusable');
  if (!usable.some((u) => u.area > 0)) return photos;
  const [car, ...rest] = [...usable].sort((a, b) => b.area - a.area || q(b.i) - q(a.i));
  const ctx = rest.sort((a, b) => a.area - b.area || q(b.i) - q(a.i))[0];
  return photos.map((p, i) => {
    if (p.role === 'unusable') return p;
    const role = i === car.i ? 'car' : i === ctx?.i ? 'context' : 'third';
    return role === p.role ? p : { ...p, role, role_model: p.role };
  });
}

// Single-linkage nad DYSTYNKTYWNYMI tekstami tablic (nie nad zdjęciami) — ten sam wzorzec
// (DFS/stos, nie zachłanne łączenie w jednym przebiegu) co clusterSession() w grouping.ts, tylko
// inna metryka (Levenshtein zamiast haversine+czas).
function clusterPlateTexts(texts: string[]): string[][] {
  const clusters: string[][] = [];
  const used = new Set<number>();
  for (let i = 0; i < texts.length; i++) {
    if (used.has(i)) continue;
    const cluster: string[] = [texts[i]];
    const stack = [i];
    used.add(i);
    while (stack.length) {
      const cur = stack.pop()!;
      for (let j = 0; j < texts.length; j++) {
        if (used.has(j)) continue;
        if (plateMatches(texts[cur], texts[j])) {
          used.add(j);
          cluster.push(texts[j]);
          stack.push(j);
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

// Reprezentant klastra do kluczowania/wyświetlania — najczęstszy tekst w klastrze; przy remisie
// pierwszy odkryty (kolejność Map = kolejność wstawiania = najniższy photo_index).
function representativePlateText(texts: string[]): string {
  const counts = new Map<string, number>();
  for (const t of texts) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function scorePhoto(p: VisionPhoto): [number, number] {
  return [(p.markers?.length ?? 0) * 2 + (p.quality ?? 0), p.quality ?? 0];
}
function cmpScore(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

// Faza 7: podział po czytelnej tablicy (dopasowanie rozmyte, PLATE_SIMILARITY_THRESHOLD —
// patrz komentarz przy stałej); bez tablicy -> czasowo najbliższa grupa.
export function splitByPlate(
  reportId: string,
  photoIds: string[],
  photos: VisionPhoto[],
): Array<{ subId: string; subPhotoIds: string[]; subPhotos: VisionPhoto[]; split: boolean }> {
  const exact = new Map<string, number[]>();
  const nopic: number[] = [];
  photos.forEach((p, i) => {
    const t = p.plate?.readable ? p.plate.text : null;
    if (t) {
      if (!exact.has(t)) exact.set(t, []);
      exact.get(t)!.push(i);
    } else nopic.push(i);
  });

  const groups = new Map<string, number[]>();
  for (const cluster of clusterPlateTexts([...exact.keys()])) {
    const idxs = cluster.flatMap((t) => exact.get(t)!);
    groups.set(representativePlateText(cluster), idxs);
  }
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
export function compose(
  subId: string,
  subPhotoIds: string[],
  subPhotos: VisionPhoto[],
): AnalysisRecord {
  const reasons: string[] = [];
  const plates = subPhotos.filter((p) => p.plate?.readable).map((p) => p.plate.text as string);
  const plate = plates[0] ?? null;
  if (new Set(plates).size > 1) reasons.push(`rozne tablice [${[...new Set(plates)]}] — mozliwy split kandydata`);
  subPhotos = assignRoles(subPhotos, plate);

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
  if (ruleCid === 0) reasons.push('brak markera kategorii');

  return {
    reportId: subId,
    plate: plate,
    photoIds: subPhotoIds,
    photos: subPhotos,
    selected,
    markers,
    categoryId: ruleCid,
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
    // Najpierw kontekst rodzeństwa, na którym ALPR widzi też to auto (szerokie ujęcie z kilkoma
    // pojazdami, wspólne dla kilku zgłoszeń), dopiero potem ogólnie najlepszy.
    const showsPlate = (c: (typeof sib)[number]) => (c.photo.alpr_all ?? []).some((d) => plateMatches(d.text, rec.plate!));
    sib.sort((a, b) => Number(showsPlate(b)) - Number(showsPlate(a)) || cmpScore(b.score, a.score));
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
