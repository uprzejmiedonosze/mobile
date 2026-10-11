import { AppState, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
// UWAGA: `expo-media-library` (bez /legacy) eksportuje dla getAssetInfoAsync/requestPermissionsAsync
// same przestarzałe shimy, które w runtime RZUCAJĄ (patrz build/legacyWarnings.d.ts) – trzeba
// importować z podścieżki /legacy, żeby dostać działającą implementację.
import * as MediaLibrary from 'expo-media-library/legacy';
import { log } from './log';
import { requestPhotos } from '../store/usePhotoPicker';
import type { ExifMeta, PhotoItem } from '../types';

export const MAX_PHOTOS = 20;

function dmsToDd(dms: number[], ref: string): number {
  const [d = 0, m = 0, s = 0] = dms;
  let v = d + m / 60 + s / 3600;
  if (ref === 'S' || ref === 'W') v = -v;
  return v;
}

function normalizeGeo4(v: number): number {
  return Number(v.toFixed(4)); // jak Geolocation.php::normalizeGeo()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Android (build release): ExponentImagePicker.launchImageLibraryAsync potrafi odrzucić wywołanie z
// „Attempting to launch an unregistered ActivityResultLauncher…” – kontrakty Activity są rejestrowane przez
// expo-modules-core dopiero w onHostResume (po odtworzeniu Activity, np. po oknie uprawnień). Czekamy,
// aż aplikacja będzie aktywna, i przy tym konkretnym błędzie ponawiamy z rosnącym opóźnieniem.
const launchLibrary = (opts: ImagePicker.ImagePickerOptions) => launchWithRetry(ImagePicker.launchImageLibraryAsync, opts);
const launchCamera = (opts: ImagePicker.ImagePickerOptions) => launchWithRetry(ImagePicker.launchCameraAsync, opts);

async function launchWithRetry(
  launch: (opts: ImagePicker.ImagePickerOptions) => Promise<ImagePicker.ImagePickerResult>,
  opts: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult> {
  for (let attempt = 0; ; attempt++) {
    for (let i = 0; i < 10 && AppState.currentState !== 'active'; i++) await sleep(150);
    try {
      return await launch(opts);
    } catch (e: any) {
      const unregistered = /unregistered ActivityResultLauncher/i.test(String(e?.message ?? e));
      if (!unregistered || attempt >= 3) throw e;
      log.warn('galeria', `kontrakt Activity jeszcze niezarejestrowany – ponawiam (${attempt + 1}/3)`);
      await sleep(400 * (attempt + 1));
    }
  }
}

// Jedno zdjęcie z aparatu (np. pismo z policji/SM) → uri albo null, gdy użytkownik anulował. Bez EXIF/GPS – to nie jest zdjęcie
// wykroczenia. Android ma wbudowany podgląd systemowej aplikacji aparatu, więc zgoda CAMERA jest potrzebna tylko do jej wywołania.
export async function takePhoto(): Promise<string | null> {
  let perm = await ImagePicker.getCameraPermissionsAsync();
  if (!perm.granted) perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    log.error('aparat', 'brak zgody na aparat');
    throw new Error('Brak zgody na aparat. Możesz wybrać zdjęcie z galerii.');
  }
  const res = await launchCamera({ mediaTypes: ['images'], quality: 1 });
  return res.canceled || !res.assets[0] ? null : res.assets[0].uri;
}

export async function pickPhotosFromGallery(existing: number): Promise<Omit<PhotoItem, 'exif'>[]> {
  return pickPhotos(MAX_PHOTOS - existing);
}

// Wybór do `limit` zdjęć z galerii (EXIF + GPS z MediaLibrary) – tryb batch daje MAX_PHOTOS,
// formularz zgłoszenia 3 (kontekst, auto, dodatkowe).
export async function pickPhotos(left: number, min = 1): Promise<PhotoItem[]> {
  if (left <= 0) return [];
  // Android: własne okno wyboru (PhotoPickerHost) – systemowy ImagePicker odrzucał wywołania w buildzie
  // release ("unregistered ActivityResultLauncher"); iOS zostaje przy systemowym pickerze.
  // Gdy MediaLibrary jest niedostępne (Expo Go nie dostaje pełnego dostępu do galerii, albo odmowa zgody) –
  // wracamy do systemowego pickera poniżej.
  if (Platform.OS === 'android') {
    const picked = await requestPhotos(left, min);
    if (picked !== 'unavailable') return picked;
    log.warn('galeria', 'MediaLibrary niedostępne – systemowy ImagePicker');
  }
  // Dialog uprawnień pokazujemy tylko gdy zgody jeszcze nie ma – każde przejście Activity przed otwarciem
  // pickera to okazja do wyścigu z rejestracją kontraktów expo-modules-core (patrz launchLibrary()).
  let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!perm.granted) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    log.error('galeria', 'brak zgody na galerię');
    throw new Error('Brak zgody na galerię');
  }

  const res = await launchLibrary({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: left,
    quality: 1,
    exif: true,
  });
  if (res.canceled) return [];

  // Android (Scoped Storage, API 29+): odczyt EXIF przez strumień pickera bez
  // MediaStore.setRequireOriginal() wraca ZREDAGOWANY GPS (GPSLatitude/Longitude = 0/0), mimo że
  // oryginalny plik ma prawdziwe współrzędne – expo-image-picker tego nie obsługuje. Realną
  // lokalizację trzeba dociągnąć osobno przez expo-media-library (stąd ACCESS_MEDIA_LOCATION w
  // app.json: isAccessMediaLocationEnabled), które poprawnie odpytuje MediaStore o
  // nieredagowane dane – patrz Asset.d.ts: "requires the ACCESS_MEDIA_LOCATION permission".
  let mlGranted = false;
  try {
    // Bez granularPermissions prosi o audio+photo+video – audio nie jest nam potrzebne i w
    // Expo Go (stały, wspólny manifest, bez naszych pluginów z app.json) w ogóle niezadeklarowane,
    // co samo w sobie wywala to wywołanie.
    mlGranted = (await MediaLibrary.requestPermissionsAsync(false, ['photo'])).granted;
  } catch (e: any) {
    log.warn('galeria', `MediaLibrary.requestPermissionsAsync: ${String(e?.message ?? e).slice(0, 150)}`);
  }
  const locations = await Promise.all(
    res.assets.map(async (a): Promise<{ latitude: number; longitude: number } | null> => {
      if (!mlGranted || !a.assetId) return null;
      try {
        const info = await MediaLibrary.getAssetInfoAsync(a.assetId);
        return info.location ?? null;
      } catch (e: any) {
        log.warn('galeria', `getAssetInfoAsync(${a.assetId}): ${String(e?.message ?? e).slice(0, 150)}`);
        return null;
      }
    }),
  );

  return res.assets.map((a, i) => {
    // expo-image-picker zwraca exif natywnie (bez node'owego exifreader -> brak 'https' w bundlu)
    const exif = parsePickerExif((a as any).exif ?? {});
    const loc = locations[i];
    if (loc && (exif.lat == null || exif.lng == null)) {
      exif.lat = normalizeGeo4(loc.latitude);
      exif.lng = normalizeGeo4(loc.longitude);
      exif.hasGps = true;
      log.info('galeria', `GPS dociągnięty z MediaLibrary (redakcja EXIF pickera): ${exif.lat},${exif.lng}`);
    }
    return {
      id: `${Date.now()}-${i}-${a.assetId ?? a.uri}`,
      uri: a.uri,
      fileName: a.fileName ?? null,
      exif,
    };
  }) as PhotoItem[] as any;
}

function toNum(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'object' && v !== null && 'value' in (v as any)) return Number((v as any).value);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Parser TYLKO dla kształtu zwracanego przez expo-image-picker (działa na Hermes, brak atob/base64 całej fotki).
export function parsePickerExif(tags: Record<string, any>): ExifMeta {
  try {
    const t: any = tags ?? {};
    // expo-image-picker: płaskie klucze GPSLatitude/GPSLongitude albo zagnieżdżone GPS.*
    const gps = t.GPS ?? t.gps ?? t;
    let lat: number | null = null;
    let lng: number | null = null;
    const latRaw = gps?.GPSLatitude ?? gps?.Latitude ?? t.GPSLatitude ?? t.Latitude;
    const lngRaw = gps?.GPSLongitude ?? gps?.Longitude ?? t.GPSLongitude ?? t.Longitude;
    const latRef = String(gps?.GPSLatitudeRef ?? gps?.LatitudeRef ?? t.GPSLatitudeRef ?? 'N');
    const lngRef = String(gps?.GPSLongitudeRef ?? gps?.LongitudeRef ?? t.GPSLongitudeRef ?? 'E');
    if (Array.isArray(latRaw) && Array.isArray(lngRaw)) {
      const arr = (a: any[]): number[] => a.map((v) => toNum(v) ?? 0);
      lat = normalizeGeo4(dmsToDd(arr(latRaw), latRef));
      lng = normalizeGeo4(dmsToDd(arr(lngRaw), lngRef));
    } else if (typeof latRaw === 'number' && typeof lngRaw === 'number') {
      lat = normalizeGeo4(latRaw * (latRef === 'S' ? -1 : 1));
      lng = normalizeGeo4(lngRaw * (lngRef === 'W' ? -1 : 1));
    }

    // "Null island": niektóre aparaty (obserwowane na PXL_*, Pixel) piszą GPSLatitude/Longitude
    // = 0/0 zamiast pomijać tag GPS, gdy nie było fixa lokalizacji przy zdjęciu. 0,0 to Zatoka
    // Gwinejska, nigdy prawdziwa lokalizacja zgłoszenia w Polsce – traktujemy jak brak GPS,
    // inaczej leci do reverse geocode i backend odpowiada 404 (grupowanie.ts liczyłoby to też
    // jako realny fix i łączyło klastry po tym punkcie).
    if (lat === 0 && lng === 0) {
      lat = null;
      lng = null;
    }

    const dtRaw = t.DateTimeOriginal ?? t.DateTime ?? t?.exif?.DateTimeOriginal ?? null;
    const dt = typeof dtRaw === 'string' ? dtRaw : (dtRaw?.description ?? null);
    return {
      datetimeOriginal: dt,
      lat,
      lng,
      make: t.Make ?? t?.exif?.Make ?? null,
      model: t.Model ?? t?.exif?.Model ?? null,
      width: toNum(t.PixelXDimension ?? t?.exif?.PixelXDimension) ?? toNum(t.ImageWidth),
      height: toNum(t.PixelYDimension ?? t?.exif?.PixelYDimension) ?? toNum(t.ImageHeight),
      hasGps: lat != null && lng != null,
    };
  } catch {
    return { datetimeOriginal: null, lat: null, lng: null, make: null, model: null, width: null, height: null, hasGps: false };
  }
}

// Zachowane dla kompatybilności ze PickerScreen (teraz no-op – exif już w pickPhotosFromGallery).
export async function readExif(_uri: string, pickerExif?: Record<string, any>): Promise<ExifMeta> {
  return parsePickerExif(pickerExif ?? {});
}
