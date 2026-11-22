// Nagranie w zgłoszeniu (formularz NewReport): jeden film na zgłoszenie, nagrany aparatem appki (WaitingCamera, tryb WIDEO) albo
// wzięty z poczekalni. Film może mieć każde zgłoszenie; hałas i drift (`requiresVideo` w categories.json) bez filmu serwer odrzuca
// i wysyła zawsze na wojewódzką skrzynkę „Stop agresji drogowej” (../uprzejmiedonosze: Category::requiresVideo(), updateApplication()).
// Film ląduje na B2, a mail zawiera link do niego (nie załącznik). Zdjęcia są nadal wymagane: przy samym filmie użytkownik wskazuje
// klatkę z tablicą (VideoFrameScreen), która staje się zdjęciem jak z galerii (kontekst + wycinek auta, ALPR).
import { Platform } from 'react-native';
import type { Category, PhotoItem } from '../types';

// Nagrywamy tylko własnym aparatem (WaitingCamera), na Androidzie i iOS. Android: poprawka obrotu z akcelerometru (lib/mp4Rotation.ts);
// iOS zapisuje .mov (QuickTime, serwer przyjmuje) i obrotu nie ruszamy – do potwierdzenia na telefonie.
export const videoPlatform = Platform.OS === 'android' || Platform.OS === 'ios';
// Backend przyjmuje film od schematu 11 (POST /app/{id}/video). Starszy (bez X-UD-Server-Schema) – film schowany, bo wysyłka by padła.
export const VIDEO_SERVER_SCHEMA = 11;
export const videoSupported = (serverSchema: number | null, platformOk: boolean = videoPlatform): boolean =>
  platformOk && serverSchema != null && serverSchema >= VIDEO_SERVER_SCHEMA;

// Limit serwera: MAX_VIDEO_UPLOAD_BYTES w src/inc/API.php (15 MB). Nagrywamy z zapasem: 720p, ~3,5 Mb/s obrazu + dźwięk
// ≈ 0,45 MB/s, więc 25 s to ok. 11–12 MB. `maxFileSize` zatrzymuje nagrywanie przed limitem także przy innym bitrate.
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
export const VIDEO_MAX_DURATION_S = 25;
export const VIDEO_BITRATE = 3_500_000;
export const VIDEO_RECORD_MAX_BYTES = 14 * 1024 * 1024;
export const VIDEO_QUALITY = '720p' as const;

export const videoTooLarge = (bytes: number | null | undefined): boolean => (bytes ?? 0) > MAX_VIDEO_BYTES;

export const fmtMB = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

// Zdjęć: do 3, a z filmem do 2 (film zastępuje zdjęcie dodatkowe; serwer odrzuca film + trzecie zdjęcie).
export const MAX_PHOTOS = 3;
export const MAX_PHOTOS_WITH_VIDEO = 2;
export const maxPhotos = (hasVideo: boolean): number => (hasVideo ? MAX_PHOTOS_WITH_VIDEO : MAX_PHOTOS);

export const requiresVideo = (cats: Category[], id: number | string | undefined): boolean =>
  id != null && cats.some((c) => c.id === Number(id) && c.requiresVideo);

// Kategorie, które ten klient może zgłosić: bez filmu (starszy backend) znikają te, które go wymagają.
export const availableCategories = (cats: Category[], withVideo: boolean): Category[] =>
  withVideo ? cats : cats.filter((c) => !c.requiresVideo);

// Szukanie ostrej klatki: krok „±” ~3 klatki przy 30 fps.
export const FRAME_STEP_S = 0.1;

export const clampFrameTime = (t: number, duration: number): number =>
  Math.max(0, Math.min(Number.isFinite(duration) && duration > 0 ? duration : t, Number.isFinite(t) ? t : 0));

const pad = (n: number) => String(n).padStart(2, '0');
// Czas lokalny w formacie EXIF ("YYYY:MM:DD HH:mm:ss") – tak jak zdjęcia z galerii (lib/reports.ts: exifToIso).
export const exifTime = (d: Date): string =>
  `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export type VideoMeta = { takenAtMs?: number; lat?: number | null; lng?: number | null };

// Klatka z filmu jako zdjęcie: data = chwila nagrania + położenie klatki w filmie, GPS = GPS nagrania. Dzięki temu formularz
// wypełnia datę i adres tak samo jak przy zdjęciu z galerii.
export function framePhoto(uri: string, atS: number, meta: VideoMeta, size?: { width: number; height: number }): PhotoItem {
  const gps = meta.lat != null && meta.lng != null;
  return {
    id: `frame-${Date.now()}`,
    uri,
    fileName: null,
    exif: {
      datetimeOriginal: meta.takenAtMs ? exifTime(new Date(meta.takenAtMs + Math.round(Math.max(0, atS) * 1000))) : null,
      lat: gps ? meta.lat! : null,
      lng: gps ? meta.lng! : null,
      make: null, model: null,
      width: size?.width ?? null, height: size?.height ?? null,
      hasGps: gps,
    },
  };
}
