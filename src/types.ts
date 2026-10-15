// Centralne typy – zgodne z backendem UD (alpr.php, Geolocation.php, API.md)
export type BBox = { x: number; y: number; w: number; h: number }; // 0-1000, origin lewy-górny

export type ExifMeta = {
  datetimeOriginal: string | null; // ISO
  lat: number | null;
  lng: number | null;
  make: string | null;
  model: string | null;
  width: number | null;
  height: number | null;
  hasGps: boolean;
};

export type PhotoItem = {
  id: string;
  uri: string;
  fileName: string | null;
  exif: ExifMeta;
};

export type AlprResult = {
  photoId: string;
  plateId: string | null; // np. "ZS 060NH", null gdy profil bez tablicy
  plateConfidence: number; // 0-1
  plateBox: BBox | null;
  vehicleBox: BBox | null;
  vehicleDesc: string | null;
  needsReview: boolean;
  notes?: string;
};

export type PhotoPair = {
  id: string;
  contextPhotoId: string;
  closeupPhotoId: string | null; // null = singleton
  plateKey: string | null; // znormalizowana tablica bez spacji
};

export type VehicleInfo = {
  brand: string | null;
  model: string | null;
  productionYear: number | null;
  fuelTypeName: string | null;
  vehicleTypeName: string | null;
  raw: unknown;
};

export type GeoAddress = {
  display: string; // "road house, city"
  road?: string;
  houseNumber?: string;
  city?: string;
  district?: string;
  voivodeship?: string;
  county?: string;
  municipality?: string;
  postcode?: string;
  // Odbiorca dla tego adresu (jak #unitToggle na webie): SM (sm) i Policja (sa); smUnknown = w miejscowości nie ma SM
  sm?: UnitInfo;
  sa?: UnitInfo;
  smUnknown?: boolean;
};

export type UnitInfo = { kind: string; name: string; hint: string };

export type Category = {
  id: number;
  title: string;
  formal?: string;
  fine?: number;
  // pola z categories.json używane przez formularz zgłoszenia (jak nowe-zgloszenie.html.twig)
  short?: string;
  mandate?: number;
  points?: number;
  groups?: number[]; // 0 = „Najczęstsze wykroczenia”
  order?: number;
  stopAgresjiOnly?: boolean; // wymusza Policję
  contextImageHint?: string;
  carImageHint?: string;
  // okienko „więcej…” przy kategorii (jak #category-popup-{id} na webie)
  desc?: string; // HTML: <p>, <br>, <a href>
  law?: string;
  price?: string; // np. „100 zł (1 pkt)”
};

// Odpowiedź GET /api/rest/recydywa/{plateId} (patrz src/api/recydywa.ts).
export type RecydywaEntry = {
  date: string | null;
  status: string;
  statusLabel: string;
  recipient: { name: string; shortName: string; isPolice: boolean };
  isOwn: boolean; // tylko własne zgłoszenia mają reportId/number/caseNumber
  categoryInfo?: { id: number; title: string; formal?: string; law?: string; fine?: number; demeritPoints?: number };
  reportId?: string;
  number?: string;
  caseNumber?: string;
};

export type RecydywaInfo = {
  plateId: string;
  appsCnt: number;
  usersCnt: number;
  // poniżej progu (appsCnt<2 lub usersCnt<2) `reports` zawiera tylko własne zgłoszenia
  sharedHistory: boolean;
  reports: RecydywaEntry[];
};

export type ReportProposal = {
  id: string;
  pairId: string; // reportId rekordu analizy (np. R014-2)
  contextPhotoId: string;
  closeupPhotoId: string | null;
  plateId: string | null; // do wyświetlenia (ze spacją)
  plateKey: string | null; // klucz bez spacji
  plateVerified: boolean | null; // true=zweryfikowana cropem, false=niepotwierdzona, null=brak
  datetime: string | null;
  lat: number | null; // GPS zdjęcia AUTA (nie centroid – patrz ANALYSIS.md)
  lng: number | null;
  addressText: string;
  addressObj: GeoAddress | null;
  vehicleInfo: VehicleInfo | null;
  recydywa: RecydywaInfo | null;
  categoryId: number | null; // reguła deterministyczna (prefill, edytowalna)
  markers: string[];
  reviewReasons: string[];
  sharedFrom?: string; // kontekst pożyczony z rodzeństwa (reguła B)
  witness: boolean;
  status: 'ready' | 'needs_fix';
};
