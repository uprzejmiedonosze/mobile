// Port grupuj_sesje.py (Faza 0-2 + manifest, BEZ LLM, BEZ miniaturek).
// Wejście: zdjęcia z EXIF (DateTimeOriginal = czas lokalny aparatu, GPS) + nazwa pliku
// (fallback czasu: PXL_YYYYMMDD_HHMMSS = UTC -> Europe/Warsaw).
// Wyjście: kandydaci na zgłoszenia (sesja -> klaster), każdy z manifestem jak manifest_sesji.json.
//
// Parametry 1:1 z GROUPING.md:
//   SESS_GAP_S=300 (sesje: TYLKO czas; skok GPS w krótkim oknie to błąd fixa, nie nowa sesja)
//   CLUSTER: single-linkage, link gdy dystans <= 30 m LUB odstęp <= 30 s (most czasowy na skoki GPS)
//   needs_review: count < 2 lub brak GPS w którymś zdjęciu.
// Celowo nad-scalamy: późniejszy krok wizji dzieli klastry po tablicy. Podział traci zgłoszenia.

export type GroupingInput = {
  id: string;
  fileName: string | null;
  /** DateTimeOriginal z EXIF ("2026:06:19 12:50:27", czas lokalny aparatu) lub ISO. */
  datetimeOriginal: string | null;
  lat: number | null;
  lng: number | null;
};

export type GroupedPhoto = GroupingInput & {
  dtMs: number;
  dtSrc: 'exif' | 'filename';
  gps: { lat: number; lng: number } | null;
};

export type Candidate = {
  reportId: string; // R001…
  photoIds: string[];
  startMs: number;
  endMs: number;
  centroid: { lat: number; lng: number } | null;
  hasGps: boolean;
  needsReview: boolean;
};

export const SESS_GAP_S = 300;
export const CLUSTER_DIST_M = 30;
export const CLUSTER_TIME_S = 30;

export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLa = r(bLat - aLat);
  const dLo = r(bLng - aLng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// --- Europe/Warsaw offset (reguła DST: ost. niedz. marca → ost. niedz. października) ---
function lastSunday(year: number, month1: number): number {
  const last = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  for (let d = last; d > last - 7; d--) {
    if (new Date(Date.UTC(year, month1 - 1, d)).getUTCDay() === 0) return d;
  }
  return last;
}

function warsawOffsetMs(utcMs: number): number {
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const dstStart = Date.UTC(y, 2, lastSunday(y, 3), 1, 0, 0); // ost. niedz. III, 01:00 UTC
  const dstEnd = Date.UTC(y, 9, lastSunday(y, 10), 1, 0, 0); // ost. niedz. X, 01:00 UTC
  return utcMs >= dstStart && utcMs < dstEnd ? 2 * 3600_000 : 1 * 3600_000;
}

// "2026:06:19 12:50:27" – czas lokalny aparatu (Warszawa) -> epoch.
export function parseExifDtMs(s: string): number | null {
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [, Y, Mo, D, H, Mi, S] = m.map(Number);
    // epoch = wall - offset; offset zależy od momentu – iterujemy 2x (granica DST).
    let guess = Date.UTC(Y, Mo - 1, D, H, Mi, S) - 2 * 3600_000;
    for (let i = 0; i < 2; i++) guess = Date.UTC(Y, Mo - 1, D, H, Mi, S) - warsawOffsetMs(guess);
    return guess;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

// PXL_YYYYMMDD_HHMMSS – znacznik UTC -> epoch (wyświetlanie w Europe/Warsaw robi UI).
export function filenameDtMs(fileName: string): number | null {
  const m = fileName.match(/PXL_(\d{8})_(\d{6})/);
  if (!m) return null;
  const d = m[1];
  const t = m[2];
  const utc = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6));
  return Number.isNaN(utc) ? null : utc;
}

export function warsawIso(ms: number): string {
  const off = warsawOffsetMs(ms);
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  const hh = String(Math.floor(a / 3600_000)).padStart(2, '0');
  const mm = String(Math.floor((a % 3600_000) / 60000)).padStart(2, '0');
  const w = new Date(ms + off);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${w.getUTCFullYear()}-${p(w.getUTCMonth() + 1)}-${p(w.getUTCDate())}T${p(w.getUTCHours())}:${p(w.getUTCMinutes())}:${p(w.getUTCSeconds())}${sign}${hh}:${mm}`;
}

// Faza 0: inwentaryzacja – normalizacja czasu (EXIF, fallback nazwa), sort. Bez czasu -> drop.
export function inventory(inputs: GroupingInput[]): GroupedPhoto[] {
  const out: GroupedPhoto[] = [];
  for (const p of inputs) {
    let dtMs: number | null = p.datetimeOriginal ? parseExifDtMs(p.datetimeOriginal) : null;
    let src: 'exif' | 'filename' = 'exif';
    if (dtMs == null && p.fileName) {
      dtMs = filenameDtMs(p.fileName);
      src = 'filename';
    }
    if (dtMs == null) continue; // drop: brak użytecznego czasu
    out.push({
      ...p,
      dtMs,
      dtSrc: src,
      gps: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null,
    });
  }
  out.sort((a, b) => a.dtMs - b.dtMs);
  return out;
}

// Faza 1: sesje – TYLKO czas, przerwa > 5 min.
export function splitSessions(items: GroupedPhoto[]): GroupedPhoto[][] {
  if (items.length === 0) return [];
  const sessions: GroupedPhoto[][] = [[items[0]]];
  for (let i = 1; i < items.length; i++) {
    const gapS = (items[i].dtMs - items[i - 1].dtMs) / 1000;
    if (gapS > SESS_GAP_S) sessions.push([items[i]]);
    else sessions[sessions.length - 1].push(items[i]);
  }
  return sessions;
}

function linked(a: GroupedPhoto, b: GroupedPhoto): boolean {
  if (a.gps && b.gps && haversineM(a.gps.lat, a.gps.lng, b.gps.lat, b.gps.lng) <= CLUSTER_DIST_M) return true;
  return Math.abs(a.dtMs - b.dtMs) / 1000 <= CLUSTER_TIME_S;
}

// Faza 2: klastry burst – single-linkage (30 m LUB 30 s). Bez GPS łączy tylko most czasowy.
export function clusterSession(session: GroupedPhoto[]): GroupedPhoto[][] {
  const clusters: GroupedPhoto[][] = [];
  const used = new Set<number>();
  for (let i = 0; i < session.length; i++) {
    if (used.has(i)) continue;
    const cl: GroupedPhoto[] = [session[i]];
    const stack: GroupedPhoto[] = [session[i]];
    used.add(i);
    while (stack.length) {
      const cur = stack.pop()!;
      for (let j = 0; j < session.length; j++) {
        if (used.has(j)) continue;
        if (linked(cur, session[j])) {
          used.add(j);
          cl.push(session[j]);
          stack.push(session[j]);
        }
      }
    }
    cl.sort((a, b) => a.dtMs - b.dtMs);
    clusters.push(cl);
  }
  return clusters;
}

export function centroid(cluster: GroupedPhoto[]): { lat: number; lng: number } | null {
  const pts = cluster.filter((p) => p.gps).map((p) => p.gps!);
  if (!pts.length) return null;
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
}

// Faza 3 (bez miniaturek – te robi krok wizji): manifest kandydatów.
export function groupPhotos(inputs: GroupingInput[]): { candidates: Candidate[]; dropped: number } {
  const items = inventory(inputs);
  const sessions = splitSessions(items);
  const candidates: Candidate[] = [];
  let rid = 0;
  for (const s of sessions) {
    for (const cl of clusterSession(s)) {
      rid++;
      const hasGps = cl.every((p) => p.gps);
      candidates.push({
        reportId: `R${String(rid).padStart(3, '0')}`,
        photoIds: cl.map((p) => p.id),
        startMs: Math.min(...cl.map((p) => p.dtMs)),
        endMs: Math.max(...cl.map((p) => p.dtMs)),
        centroid: centroid(cl),
        hasGps,
        needsReview: cl.length < 2 || !hasGps,
      });
    }
  }
  return { candidates, dropped: inputs.length - items.length };
}
