// Stałe współdzielone z backendem UD (analiza wizyjna przeniesiona na serwer — patrz
// ../../uprzejmiedonosze/src/inc/integrations/Vision.php + VisionSchema.php, ŹRÓDŁO PRAWDY dla
// promptu/walidacji/normalizacji tablicy). Ten plik trzyma tylko to, co appka wciąż liczy sama:
// deterministyczny ogon (grupowanie, split, kategorie — fazy 5, 7-11, patrz compose.ts) i typ
// VisionPhoto jako lustro kontraktu odpowiedzi POST /api/rest/vision/candidate.
// Każda zmiana promptu/markerów w Vision.php MUSI podbić SCHEMA tu i VISION_SCHEMA tam.

export const SCHEMA = 10; // = VISION_SCHEMA w backendzie; wersja kontraktu API (X-UD-Schema, bramka 426 w dół) i klucz cache analizy
// SCHEMA 10: POST /api/rest/demo-login (konto demo recenzentów); kształt odpowiedzi bez zmian względem 9. Podbite przed
// premierą prod, żeby backend (426) odciął testowe buildy staging ≤ 1.1.7 (SCHEMA 9) – testerzy przechodzą na wydanie prod.

export const ROLES = ['context', 'car', 'third', 'unusable'] as const;
export type Role = (typeof ROLES)[number];

// Bez numerowanych znaków drogowych (b36/b35/d18/t30/bus_stop_sign/vertical_sign_mismatch) —
// model ich już nie szuka, tylko cechy fizyczne sceny (patrz VisionSchema.php::MARKERS, SCHEMA 7).
export const MARKERS = [
  'bus_bay', 'public_transport_access', 'zebra_crossing',
  'intersection', 'tram_crossing', 'island_15m', 'sidewalk_parking',
  'narrow_passage', 'deep_sidewalk', 'heavy_vehicle',
  'road_markings', 'bike_lane', 'greenery', 'disabled_bay',
  'residential_zone',
] as const;
export type Marker = (typeof MARKERS)[number];

// (markery -> category_id), kolejność = priorytet, pierwsze trafienie wygrywa.
export const CATEGORY_RULES: Array<{ need: Marker[]; cid: number }> = [
  { need: ['disabled_bay'], cid: 13 },
  { need: ['zebra_crossing'], cid: 5 },
  { need: ['tram_crossing', 'intersection'], cid: 3 },
  { need: ['intersection'], cid: 3 },
  { need: ['public_transport_access'], cid: 23 },
  { need: ['bus_bay'], cid: 2 },
  { need: ['heavy_vehicle', 'sidewalk_parking'], cid: 11 },
  { need: ['deep_sidewalk'], cid: 8 },
  { need: ['narrow_passage', 'sidewalk_parking'], cid: 26 },
  { need: ['sidewalk_parking'], cid: 26 },
  { need: ['road_markings'], cid: 17 },
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

export type Box4 = [number, number, number, number]; // x1,y1,x2,y2 w 0..1000

// Pojedynczy odczyt ALPR ze zdjęcia (SCHEMA 8, backend: alprDetections() w Vision.php).
// vehicle_area = pole pojazdu jako ułamek kadru (0..1) — z tego compose.ts przydziela role.
export type AlprDetection = {
  text: string;
  score: number | null;
  plate_bbox: Box4 | null;
  vehicle_bbox: Box4 | null;
  vehicle_area: number | null;
};

export type VisionPhoto = {
  photo_index: number;
  photoId: string;
  role: Role;
  role_model?: Role; // rola od modelu, gdy assignRoles() (compose.ts) ją nadpisało — do trace/UI
  quality: number;
  car: { present: boolean; bbox: Box4 | null; desc: string | null };
  plate: { readable: boolean; text: string | null; bbox: Box4 | null; from_crop?: boolean };
  markers: Marker[];
  plate_verified?: boolean;
  alpr_all?: AlprDetection[];
  // TYMCZASOWE (debug): porównanie odczytu tablicy ALPR (PlateRecognizer, to co ląduje w `plate`
  // powyżej gdy ALPR coś znajdzie) vs odczyt samego modelu, sprzed nadpisania. Backend:
  // applyAlprPlate() w Vision.php. Usunąć razem z resztą miejsc oznaczonych "TYMCZASOWE (debug)"
  // (UD.tsx, PairingScreen.tsx), gdy przestaniemy potrzebować tego porównania.
  plate_debug?: {
    model: { text: string | null; bbox: Box4 | null };
    alpr: { text: string | null; bbox: Box4 | null } | null;
  };
};
