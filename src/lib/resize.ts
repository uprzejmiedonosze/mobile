import * as ImageManipulator from 'expo-image-manipulator';
import { uploadConfig } from '../config';

// Zmniejszenie zdjęcia przed wysyłką (EXPO_PUBLIC_PHOTO_MAX_WIDTH / _COMPRESS). Backend i tak
// wymusza ≤1600 px i limit 3 MB (imageUploadFromRequest w API.php), ale mniejszy plik to szybszy upload.
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
