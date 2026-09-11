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
};

export type Category = { id: number; title: string; formal?: string; fine?: number };

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
  categoryId: number | null; // reguła deterministyczna (prefill, edytowalna)
  markers: string[];
  reviewReasons: string[];
  sharedFrom?: string; // kontekst pożyczony z rodzeństwa (reguła B)
  witness: boolean;
  status: 'ready' | 'needs_fix';
};
