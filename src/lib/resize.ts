import * as ImageManipulator from 'expo-image-manipulator';
import { uploadConfig } from '../config';

// Zmniejszenie zdjęcia przed wysyłką (EXPO_PUBLIC_PHOTO_MAX_WIDTH / _COMPRESS). Backend i tak
// wymusza ≤1600 px i limit 3 MB (imageUploadFromRequest w API.php), ale mniejszy plik to szybszy upload.
//
// Zdjęcie jest wysyłane RAZ: POST /api/rest/photos (etap „wip” na backendzie). Analiza (vision/candidate) i przydział do
// slotu (POST /app/{id}/image z photoId) czytają już plik z serwera – nie ma osobnych, mniejszych kopii „do analizy”.
//
// Wycinki tablicy i (przy jednym zdjęciu) auta NIE powstają z tej kopii, tylko z oryginału z galerii (lib/crop.ts) – dzięki temu
// tablica ma pełną rozdzielczość w PDF i na stronie zgłoszenia; serwer przelicza na nie odczyt ALPR z kopii (ułamki kadru).
//
// SYNC z drugim repo (../uprzejmiedonosze, backend + web):
//  - API.php: MAX_IMAGE_DIM (1600) i JPEG_QUALITY (85) – serwer re-enkoduje i ucina do tych wartości przy przydziale do
//    slotu; web robi to samo w src/js/new-app/images.js. Zmiana tu (szerokość/jakość) = zmiana tam i odwrotnie.
//    Źródło wysyłane stąd jest re-enkodowane z jakością 85, więc jakość poniżej niej pogarsza zdjęcie dwukrotnie.
//  - API.php: MAX_IMAGE_UPLOAD_BYTES (3 MB) – plik 1600 px musi się w nim mieścić.
//  - inc/config.php: VISION_MAX_PHOTO_BYTES / VISION_MAX_TOTAL_BYTES dotyczą już tylko starszego wariantu analizy
//    z base64 w body (nieużywanego przez formularz).
export type Scaled = { uri: string; width: number; height: number; b64?: string };

// `base64: true` dodatkowo zwraca b64 (analiza wizyjna przyjmuje data-URI) – jedno przeskalowanie na wysyłkę i analizę.
export async function downscale(uri: string, opts: { base64?: boolean } = {}): Promise<Scaled> {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: uploadConfig.photoMaxWidth } }], {
    compress: uploadConfig.photoCompress,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: opts.base64,
  } as any);
  return { uri: out.uri, width: out.width, height: out.height, b64: out.base64 };
}
