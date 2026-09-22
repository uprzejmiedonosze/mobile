// Stałe współdzielone z backendem UD (analiza wizyjna przeniesiona na serwer — patrz
// ../../uprzejmiedonosze/src/inc/integrations/Vision.php + VisionSchema.php, ŹRÓDŁO PRAWDY dla
// promptu/walidacji/normalizacji tablicy). Ten plik trzyma tylko to, co appka wciąż liczy sama:
// deterministyczny ogon (grupowanie, split, kategorie — fazy 5, 7-11, patrz compose.ts) i typ
// VisionPhoto jako lustro kontraktu odpowiedzi POST /api/rest/vision/candidate.
// Każda zmiana promptu/markerów w Vision.php MUSI podbić SCHEMA tu i VISION_SCHEMA tam.

export const SCHEMA = 6; // = VISION_SCHEMA w backendzie; appka gejtuje na tym cache analizy

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
  // TYMCZASOWE (debug): porównanie odczytu tablicy ALPR (PlateRecognizer, to co ląduje w `plate`
  // powyżej gdy ALPR coś znajdzie) vs odczyt samego modelu, sprzed nadpisania. Backend:
  // applyAlprPlate() w Vision.php. Usunąć razem z resztą miejsc oznaczonych "TYMCZASOWE (debug)"
  // (UD.tsx, PairingScreen.tsx), gdy przestaniemy potrzebować tego porównania.
  plate_debug?: {
    model: { text: string | null; bbox: Box4 | null };
    alpr: { text: string | null; bbox: Box4 | null } | null;
  };
};
