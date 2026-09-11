// Faza ANALIZA-wizja: stałe, prompt, walidacja. Port ANALYSIS.md + analizuj_wizja.py.
// LLM tylko rozpoznaje (role, auta, tablice, markery); grupowanie, walidacja,
// split, kategorie i kolejność są deterministyczne (fazy 5, 7-11).

export const SCHEMA = 5; // podbij przy zmianie compose/split/sharing; wymusza świeżą analizę

export const ROLES = ['context', 'car', 'third', 'unusable'] as const;
export type Role = (typeof ROLES)[number];

export const MARKERS = [
  'bus_stop_sign', 'bus_bay', 'public_transport_access', 'zebra_crossing',
  'intersection', 'tram_crossing', 'island_15m', 'sidewalk_parking',
  'narrow_passage', 'deep_sidewalk', 'heavy_vehicle', 'b36_sign',
  'b35_sign', 'd18_sign', 't30_plate', 'road_markings',
  'vertical_sign_mismatch', 'bike_lane', 'greenery', 'disabled_bay',
  'residential_zone',
] as const;
export type Marker = (typeof MARKERS)[number];

// (markery -> category_id), kolejność = priorytet, pierwsze trafienie wygrywa.
export const CATEGORY_RULES: Array<{ need: Marker[]; cid: number }> = [
  { need: ['disabled_bay'], cid: 13 },
  { need: ['b36_sign'], cid: 14 },
  { need: ['d18_sign', 't30_plate'], cid: 16 },
  { need: ['zebra_crossing'], cid: 5 },
  { need: ['tram_crossing', 'intersection'], cid: 3 },
  { need: ['intersection'], cid: 3 },
  { need: ['public_transport_access'], cid: 23 },
  { need: ['bus_stop_sign'], cid: 2 },
  { need: ['bus_bay'], cid: 2 },
  { need: ['heavy_vehicle', 'sidewalk_parking'], cid: 11 },
  { need: ['deep_sidewalk'], cid: 8 },
  { need: ['narrow_passage', 'sidewalk_parking'], cid: 26 },
  { need: ['sidewalk_parking'], cid: 26 },
  { need: ['vertical_sign_mismatch', 'road_markings'], cid: 1 },
  { need: ['vertical_sign_mismatch'], cid: 7 },
  { need: ['road_markings'], cid: 17 },
  { need: ['b35_sign'], cid: 15 },
  { need: ['bike_lane'], cid: 21 },
  { need: ['greenery'], cid: 25 },
  { need: ['island_15m'], cid: 22 },
  { need: ['residential_zone'], cid: 12 },
];

export function ruleCategory(markers: string[]): number {
  const ms = new Set(markers);
  for (const r of CATEGORY_RULES) {
    if (r.need.every((m) => ms.has(m))) return r.cid;
  }
  return 0;
}

// Tablica w formie kluczowej (bez spacji, jak norm_plate): ^[A-Z0-9]{4,8}$ + litera i cyfra.
export function normPlateKey(t: string | null | undefined): string | null {
  const s = (t ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(s)) return null;
  if (!/[A-Z]/.test(s) || !/[0-9]/.test(s)) return null;
  return s;
}

export type Box4 = [number, number, number, number]; // x1,y1,x2,y2 w 0..1000

export type VisionPhoto = {
  photo_index: number;
  photoId: string;
  role: Role;
  quality: number;
  car: { present: boolean; bbox: Box4 | null; desc: string | null };
  plate: { readable: boolean; text: string | null; bbox: Box4 | null; from_crop?: boolean; plate_check?: string };
  markers: Marker[];
  suggested_category?: number;
  category_confidence?: number;
  plate_verified?: boolean;
};

export const VISION_PROMPT =
  'You analyze N photos of one parked car (same report, chronological order). ' +
  'Return a JSON object {"photos":[...]}, one entry per photo in input order, each:\n' +
  '{"photo_index":i, "role":"context|car|third|unusable", "quality":0..1,\n' +
  ' "car":{"present":bool, "bbox":[x1,y1,x2,y2]|null, "desc":str|null},\n' +
  ' "plate":{"readable":bool, "text":str|null, "bbox":[x1,y1,x2,y2]|null},\n' +
  ' "markers":[...], "suggested_category":int, "category_confidence":0..1}\n' +
  'Roles: context = wide shot showing the violation setting (sign, crossing, stop, markings); ' +
  'car = vehicle dominates the frame, plate potentially readable; ' +
  'third = supplementary (second angle, sign close-up, extra evidence); ' +
  'unusable = blurred/dark/no car. bboxes in 0..1000 relative coords of the whole image. ' +
  'The plate bbox must tightly enclose the plate characters themselves, ' +
  'not the bumper, grille or road around it. ' +
  'markers only from: ' + MARKERS.join(',') + '. ' +
  'suggested_category: best matching Polish parking-violation category id 0..26 ' +
  '(2 bus stop, 3 intersection, 5 crosswalk, 13 disabled bay, 14 B-36 sign, 26 sidewalk). ' +
  'Polish plates like ZS1234A. JSON only, no prose.';

function validBox(b: any): b is Box4 {
  return (
    Array.isArray(b) && b.length === 4 &&
    b.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000)
  );
}

function plateInsideCar(carBox: Box4, plateBox: Box4): boolean {
  const mx = (carBox[2] - carBox[0]) * 0.05;
  const my = (carBox[3] - carBox[1]) * 0.05;
  return (
    plateBox[0] >= carBox[0] - mx && plateBox[1] >= carBox[1] - my &&
    plateBox[2] <= carBox[2] + mx && plateBox[3] <= carBox[3] + my
  );
}

// Faza 5: bramki walidacji (bez tokenów). Zwraca listę błędów; pusta = OK.
export function validateVisionPhoto(p: any, idx: number): string[] {
  const errs: string[] = [];
  if (p?.photo_index !== idx) errs.push('zly photo_index');
  if (!ROLES.includes(p?.role)) errs.push(`zly role=${p?.role}`);
  const q = p?.quality;
  if (typeof q !== 'number' || q < 0 || q > 1) errs.push('zly quality');
  for (const key of ['car', 'plate'] as const) {
    const b = p?.[key]?.bbox;
    if (b != null && !validBox(b)) errs.push(`zly bbox ${key}`);
  }
  const mk: any[] = p?.markers ?? [];
  if (mk.some((m) => !(MARKERS as readonly string[]).includes(m))) errs.push('nieznany marker');
  const car = p?.car ?? {};
  const plate = p?.plate ?? {};
  if (plate.readable) {
    if (!normPlateKey(plate.text)) errs.push(`nieczytelny format tablicy: ${plate.text}`);
    const cb = car.bbox;
    const pb = plate.bbox;
    if (car.present && validBox(cb) && validBox(pb) && !plateInsideCar(cb, pb)) errs.push('tablica poza autem');
  }
  return errs;
}

// Normalizacja po walidacji: klucz tablicy bez spacji.
export function normalizeVisionPhoto(p: VisionPhoto): void {
  if (p.plate?.readable) {
    const t = normPlateKey(p.plate.text);
    p.plate.text = t;
    if (!t) p.plate.readable = false;
  }
}
