// Opcjonalna kopia zdjęć z aparatu poczekalni w galerii telefonu (Android), w osobnym albumie. Domyślnie wyłączona: poczekalnia
// trzyma zdjęcia (z GPS i cudzymi tablicami) tylko w prywatnym katalogu appki, a w galerii czyta je każda appka z dostępem do zdjęć
// i może je kopiować Google Photos. Kopia jest niezależna od poczekalni – appka jej nie kasuje po wysłaniu ani usunięciu zgłoszenia.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
// /legacy – patrz komentarz w lib/gallery.ts (główny eksport expo-media-library rzuca w runtime)
import * as MediaLibrary from 'expo-media-library/legacy';
import { log } from './log';

const KEY = 'udpro.galleryCopy';
export const GALLERY_ALBUM = 'Uprzejmie Donoszę';
export const galleryCopyAvailable = Platform.OS === 'android';

export async function getGalleryCopy(): Promise<boolean> {
  if (!galleryCopyAvailable) return false;
  try { return (await SecureStore.getItemAsync(KEY)) === '1'; } catch { return false; }
}

export async function setGalleryCopy(on: boolean): Promise<void> {
  if (on) await SecureStore.setItemAsync(KEY, '1'); else await SecureStore.deleteItemAsync(KEY);
}

// Najlepsze starania: błąd (brak zgody, pełny dysk) nie może przeszkodzić w zdjęciu do poczekalni.
export async function saveCopyToGallery(uri: string): Promise<void> {
  if (!galleryCopyAvailable) return;
  try {
    if (!(await getGalleryCopy())) return;
    let perm = await MediaLibrary.getPermissionsAsync(false, ['photo']);
    if (!perm.granted) perm = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (!perm.granted) { log.warn('galeria', 'kopia zdjęcia: brak zgody na galerię'); return; }
    const asset = await MediaLibrary.createAssetAsync(uri);
    const album = await MediaLibrary.getAlbumAsync(GALLERY_ALBUM);
    if (album) await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    else await MediaLibrary.createAlbumAsync(GALLERY_ALBUM, asset, false);
  } catch (e: any) {
    log.warn('galeria', `kopia zdjęcia: ${String(e?.message ?? e).slice(0, 160)}`);
  }
}
