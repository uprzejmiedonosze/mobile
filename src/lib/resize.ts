import * as ImageManipulator from 'expo-image-manipulator';
import { uploadConfig } from '../config';

// Zmniejszenie zdjęcia przed wysyłką (EXPO_PUBLIC_PHOTO_MAX_WIDTH / _COMPRESS). Backend i tak
// wymusza ≤1600 px i limit 3 MB (imageUploadFromRequest w API.php), ale mniejszy plik to szybszy upload.
export async function downscale(uri: string): Promise<{ uri: string; width: number; height: number }> {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: uploadConfig.photoMaxWidth } }], {
    compress: uploadConfig.photoCompress,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: out.uri, width: out.width, height: out.height };
}
