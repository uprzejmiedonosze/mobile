// Zgłoszenie „na gorąco” (tuning: hałas/wydech, drift) – składane w chwili zdarzenia, z nagraniem z aplikacji, zdjęciem albo samą
// relacją świadka. Backend (../uprzejmiedonosze: Category::isAdHoc(), updateApplication(), attachVideo()) wysyła je zawsze na
// wojewódzką skrzynkę „Stop agresji drogowej”, nie wymaga zdjęć i przyjmuje datę najwyżej sprzed 24 h. Nagranie ląduje na B2,
// a mail zawiera link do niego (nie załącznik).
// Kategorie testowe (`beta`) są widoczne tylko gdy serwer zwraca `features.adHocReports` (GET /api/rest/user, poza produkcją).
import type { ReportForm } from '../api/reports';
import type { Category, GeoAddress } from '../types';

// Limit serwera: MAX_VIDEO_UPLOAD_BYTES w src/inc/API.php (15 MB). Nagrywamy z zapasem: 720p, ~3,5 Mb/s obrazu + dźwięk
// ≈ 0,45 MB/s, więc 25 s to ok. 11–12 MB. `maxFileSize` (Android) zatrzymuje nagrywanie przed limitem także przy innym bitrate.
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
export const VIDEO_MAX_DURATION_S = 25;
export const VIDEO_BITRATE = 3_500_000;
export const VIDEO_RECORD_MAX_BYTES = 14 * 1024 * 1024;
export const VIDEO_QUALITY = '720p' as const;

export const videoTooLarge = (bytes: number | null | undefined): boolean => (bytes ?? 0) > MAX_VIDEO_BYTES;

export const fmtMB = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

// Kategorie z categories.json, które pokazuje ten klient:
// - „na gorąco” (`adHoc`) nigdy nie trafiają na zwykłą listę (nie mają `groups`),
// - testowe (`beta`) mają grupy w `betaGroups` – przenosimy je do `groups` tylko gdy serwer na to pozwala; inaczej znikają.
export function withFeatureCategories(cats: Category[], adHocEnabled: boolean): Category[] {
  return cats
    .filter((c) => !c.beta || adHocEnabled)
    .map((c) => (c.beta && !c.adHoc && c.betaGroups?.length ? { ...c, groups: [...(c.groups ?? []), ...c.betaGroups] } : c));
}

export const adHocCategories = (cats: Category[], adHocEnabled: boolean): Category[] =>
  adHocEnabled ? cats.filter((c) => c.adHoc && c.title).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)) : [];

export const isAdHocCategory = (cats: Category[], id: number | string | undefined): boolean =>
  id != null && cats.some((c) => c.id === Number(id) && c.adHoc);

const pad = (n: number) => String(n).padStart(2, '0');
// Data zdarzenia = chwila zgłoszenia (czas lokalny, format serwera "YYYY-MM-DDTHH:mm:ss").
export const localIso = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export type AdHocInput = {
  category: number;
  plateId: string;
  address: string;
  geo: GeoAddress;
  lat: number;
  lng: number;
  comment: string;
  at: Date; // chwila zdarzenia (otwarcie ekranu zgłoszenia)
};

// Treść POST /api/rest/app/{id}: świadek jest zawsze naoczny, data nie pochodzi ze zdjęcia, odbiorcę wybiera serwer.
export function adHocReportForm(i: AdHocInput): ReportForm {
  return {
    plateId: i.plateId.trim(),
    address: i.address.trim(),
    addressGPS: i.geo.display,
    city: i.geo.city,
    voivodeship: i.geo.voivodeship,
    district: i.geo.district,
    county: i.geo.county,
    municipality: i.geo.municipality,
    postcode: i.geo.postcode,
    lat: i.lat,
    lng: i.lng,
    datetime: localIso(i.at),
    dtFromPicture: false,
    category: i.category,
    extensions: [],
    comment: i.comment.trim(),
    witness: true,
    stopAgresji: 'SA',
  };
}

// Co blokuje „Dalej” (null = można wysłać). Zgłoszenie na gorąco wymaga nagrania (decyzja produktowa: hałas i drift tylko z filmem;
// serwer na razie przyjmuje też bez) – zdjęcie albo klatka są dodatkiem do odczytu tablicy.
export function adHocMissing(s: { category: number | null; plateId: string; address: string; hasPlace: boolean; hasVideo: boolean }): string | null {
  if (!s.hasVideo) return 'Dołącz nagranie – zgłoszenie na gorąco wymaga filmu.';
  if (!s.category) return 'Wybierz, co się dzieje.';
  if (s.plateId.replace(/\s/g, '').length < 3) return 'Podaj numer rejestracyjny.';
  if (!s.hasPlace || s.address.trim().length <= 10) return 'Poczekaj na lokalizację albo wskaż miejsce na mapie.';
  return null;
}

// Klatka z nagrania jako zdjęcie auta: użytkownik zatrzymuje film tam, gdzie tablica jest ostra (AdHocFrameScreen), a klatka
// idzie zwykłą ścieżką zdjęcia (POST /photos → ALPR → slot carImage). Krok „±” przy szukaniu ostrej klatki: ~3 klatki przy 30 fps.
export const FRAME_STEP_S = 0.1;

export const clampFrameTime = (t: number, duration: number): number =>
  Math.max(0, Math.min(Number.isFinite(duration) && duration > 0 ? duration : t, Number.isFinite(t) ? t : 0));

// Tablica z odczytów ALPR jednego zdjęcia: kandydat serwera (`winner`), a bez niego odczyt o największej pewności.
// Odczyty krótsze niż 4 znaki to zwykle szum (fragment napisu, naklejka).
export function bestPlate(detections: { text: string; score: number | null; winner?: boolean }[]): string | null {
  const ok = detections
    .map((d) => ({ ...d, text: (d.text ?? '').replace(/\s+/g, '').toUpperCase() }))
    .filter((d) => d.text.length >= 4);
  const pick = ok.find((d) => d.winner) ?? [...ok].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  return pick?.text ?? null;
}
