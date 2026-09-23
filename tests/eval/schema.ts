// Port 1:1 of ../../../uprzejmiedonosze/src/inc/integrations/VisionSchema.php — the source of
// truth for the vision contract (prompt/validation/normalization). Kept in sync by hand, same as
// the mobile app's src/lib/vision.ts is kept in sync with the PHP file. Any change to
// VisionSchema.php's ROLES/MARKERS/validation MUST be mirrored here too.
//
// Also ports extractJson() (~src/api/spark.ts:extractJson in the app's earlier direct-LLM era) —
// the brace-counting JSON extractor that tells "model wrapped JSON in prose/fences" apart from
// "model truncated the JSON".

export const VISION_SCHEMA = 5; // = VISION_SCHEMA in VisionSchema.php / SCHEMA in src/lib/vision.ts

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

export type Box4 = [number, number, number, number]; // x1,y1,x2,y2 in 0..1000

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
  // v4-relations only (not part of the production contract):
  scene?: SceneItem[];
};

export const SCENE_OBJECTS = [
  // vertical signs (PL road-sign codes)
  'B-36', 'B-35', 'D-18', 'T-30', 'D-6', 'D-15', 'C-13',
  // horizontal markings
  'P-24_koperta', 'P-10_przejscie', 'P-14_przejazd_rowerowy', 'P-20_zygzak', 'P-23_rower',
  // terrain / other
  'chodnik', 'trawnik', 'zatoka_autobusowa', 'wiata_przystankowa',
  'skrzyzowanie', 'torowisko', 'wysepka', 'droga_dla_rowerow', 'slupki',
] as const;
export type SceneObject = (typeof SCENE_OBJECTS)[number];

// under_car covers both directions of the same fact (marking under the car / car on top of the
// marking) — one value, not two, to avoid the model splitting an identical observation two ways.
export const SCENE_RELATIONS = [
  'under_car', 'in_front_of_car', 'behind_car',
  'left_of_car', 'right_of_car', 'not_related',
] as const;
export type SceneRelation = (typeof SCENE_RELATIONS)[number];

export type SceneItem = {
  object: SceneObject;
  relation: SceneRelation;
  distance_m: number;
  confidence: number;
};

// Tablica w formie kluczowej (bez spacji): ^[A-Z0-9]{4,8}$ + wymaga litery i cyfry.
export function normPlateKey(t: string | null | undefined): string | null {
  const s = (t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{4,8}$/.test(s)) return null;
  if (!/[A-Z]/.test(s) || !/[0-9]/.test(s)) return null;
  return s;
}

export function validBox(b: unknown): b is Box4 {
  if (!Array.isArray(b) || b.length !== 4) return false;
  return b.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000);
}

export function plateInsideCar(carBox: Box4, plateBox: Box4): boolean {
  const mx = (carBox[2] - carBox[0]) * 0.05;
  const my = (carBox[3] - carBox[1]) * 0.05;
  return (
    plateBox[0] >= carBox[0] - mx &&
    plateBox[1] >= carBox[1] - my &&
    plateBox[2] <= carBox[2] + mx &&
    plateBox[3] <= carBox[3] + my
  );
}

// Faza 5: bramki walidacji (bez tokenów). Zwraca listę błędów; pusta = OK.
export function validateVisionPhoto(p: any, idx: number): string[] {
  const errs: string[] = [];
  p = p && typeof p === 'object' ? p : {};
  if (p.photo_index !== idx) errs.push('zly photo_index');
  const role = p.role ?? null;
  if (!ROLES.includes(role)) errs.push(`zly role=${role ?? ''}`);
  const q = p.quality;
  if (typeof q !== 'number' || !Number.isFinite(q) || q < 0 || q > 1) errs.push('zly quality');
  for (const key of ['car', 'plate'] as const) {
    const b = p[key]?.bbox ?? null;
    if (b !== null && !validBox(b)) errs.push(`zly bbox ${key}`);
  }
  const mk: unknown[] = Array.isArray(p.markers) ? p.markers : [];
  for (const m of mk) {
    if (!(MARKERS as readonly string[]).includes(m as string)) {
      errs.push('nieznany marker');
      break;
    }
  }
  const car = p.car ?? {};
  const plate = p.plate ?? {};
  if (plate.readable) {
    if (normPlateKey(plate.text) === null) errs.push(`nieczytelny format tablicy: ${plate.text ?? ''}`);
    const cb = car.bbox ?? null;
    const pb = plate.bbox ?? null;
    if (car.present && validBox(cb) && validBox(pb) && !plateInsideCar(cb as Box4, pb as Box4)) {
      errs.push('tablica poza autem');
    }
  }
  return errs;
}

// Normalizacja po walidacji: klucz tablicy bez spacji.
export function normalizeVisionPhoto(p: any): void {
  if (p.plate?.readable) {
    const t = normPlateKey(p.plate.text);
    p.plate.text = t;
    if (t === null) p.plate.readable = false;
  }
}

export type ExtractJsonResult = { parsed: any | null; truncated: boolean };

// Wyciąga pierwszy KOMPLETNY obiekt {...} (zliczanie nawiasów, z obsługą stringów).
// Port src/api/spark.ts:extractJson (app) / VisionSchema.php:extractJson (backend).
export function extractJson(text: string): ExtractJsonResult {
  let clean = text.trim();
  const fence = clean.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) clean = fence[1].trim();

  try {
    return { parsed: JSON.parse(clean), truncated: false };
  } catch {
    // fall through to brace-counting extraction
  }

  const start = clean.indexOf('{');
  if (start === -1) return { parsed: null, truncated: false };

  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  for (let i = start; i < clean.length; i++) {
    const c = clean[i];
    if (inStr !== null) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") inStr = c;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const slice = clean.slice(start, i + 1);
        try {
          return { parsed: JSON.parse(slice), truncated: false };
        } catch {
          return { parsed: null, truncated: false };
        }
      }
    }
  }
  return { parsed: null, truncated: true }; // klamra otwarta, nigdy nie domknięta = ucięta odpowiedź
}
