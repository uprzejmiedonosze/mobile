// Wycinki z ORYGINAŁU zdjęcia (pełna rozdzielczość z galerii), nie z kopii 1600 px wysyłanej do analizy: tablica rejestracyjna
// i – gdy jest tylko jedno zdjęcie – samo auto. ALPR liczy się raz na kopii 1600 px, a jego boxy są względne (0..1000), więc po
// przeliczeniu na ułamki kadru pasują do oryginału w każdej rozdzielczości (serwer przelicza je na wycinek: stageDerived w WipPhotos.php).
import * as ImageManipulator from 'expo-image-manipulator';
import type { Box4 } from './vision';

export type Region = [number, number, number, number]; // ułamki kadru [x1, y1, x2, y2]
export type Original = { uri: string; width: number; height: number };
export type Cropped = Original;

// Box 0..1000 → region (ułamki kadru) powiększony o margines (ułamek rozmiaru boxu z każdej strony), docięty do kadru.
export function bboxToRegion(box: Box4, marginX: number, marginY: number = marginX): Region {
  const [x1, y1, x2, y2] = box.map((v) => v / 1000);
  const mx = (x2 - x1) * marginX, my = (y2 - y1) * marginY;
  return [Math.max(0, x1 - mx), Math.max(0, y1 - my), Math.min(1, x2 + mx), Math.min(1, y2 + my)];
}

// Oryginał z uwzględnioną orientacją EXIF (tak jak kopia do analizy, `downscale`) i jego wymiary – raz na zdjęcie.
export async function prepareOriginal(uri: string): Promise<Original> {
  const out = await ImageManipulator.manipulateAsync(uri, [], { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height };
}

// Wycinek `region` z oryginału; dłuższy bok ograniczony do `maxSide` (wynik i tak jest kilka razy ostrzejszy niż z kopii 1600 px).
export async function cropRegion(orig: Original, region: Region, maxSide: number): Promise<Cropped> {
  const originX = Math.round(region[0] * orig.width), originY = Math.round(region[1] * orig.height);
  const width = Math.max(1, Math.min(orig.width - originX, Math.round((region[2] - region[0]) * orig.width)));
  const height = Math.max(1, Math.min(orig.height - originY, Math.round((region[3] - region[1]) * orig.height)));
  const resize = width >= height ? (width > maxSide ? { width: maxSide } : null) : (height > maxSide ? { height: maxSide } : null);
  const out = await ImageManipulator.manipulateAsync(orig.uri, [{ crop: { originX, originY, width, height } }, ...(resize ? [{ resize }] : [])], {
    compress: 0.92, format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: out.uri, width: out.width, height: out.height };
}
