import { log } from './log';

// Okładka nagrania w poczekalni: klatka z ~1. sekundy (krótszy film – z połowy), zmniejszona do miniatury. expo-video i manipulator
// ładujemy leniwie: build bez modułu ExpoVideo ma dalej działać (bez okładki zostaje kafelek 🎬). null = nie udało się.
export async function videoPoster(uri: string, durationMs?: number): Promise<string | null> {
  try {
    const { createVideoPlayer } = require('expo-video') as typeof import('expo-video');
    const IM = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const player = createVideoPlayer(uri);
    try {
      const at = Math.min(1, (durationMs ?? 2000) / 2000);
      const [thumb] = await player.generateThumbnailsAsync(at, { maxWidth: 480, maxHeight: 480 });
      if (!thumb) return null;
      const img = await IM.ImageManipulator.manipulate(thumb).renderAsync();
      return (await img.saveAsync({ format: IM.SaveFormat.JPEG, compress: 0.8 })).uri;
    } finally {
      player.release();
    }
  } catch (e: any) {
    log.warn('poczekalnia', `okładka nagrania: ${String(e?.message ?? e).slice(0, 160)}`);
    return null;
  }
}

// Poprawka obrotu nagrania (lib/mp4Rotation.ts) na pliku w miejscu – FileHandle, bez wczytywania całych megabajtów.
// Błąd = film zostaje jak był (obrócony, ale cały).
export function fixVideoRotation(uri: string, ui: 0 | 90 | -90): void {
  if (ui === 0) return;
  try {
    const { File, FileMode } = require('expo-file-system') as typeof import('expo-file-system');
    const { fixRotation } = require('./mp4Rotation') as typeof import('./mp4Rotation');
    const handle = new File(uri).open(FileMode.ReadWrite);
    try {
      const res = fixRotation({
        size: handle.size ?? 0,
        read: (offset, length) => { handle.offset = offset; return handle.readBytes(length); },
        write: (offset, bytes) => { handle.offset = offset; handle.writeBytes(bytes); },
      }, ui);
      log.info('aparat', res ? `obrót nagrania ${res.from}° → ${res.to}° (telefon ${ui})` : `obrót nagrania bez zmian (telefon ${ui})`);
    } finally {
      handle.close();
    }
  } catch (e: any) {
    log.warn('aparat', `obrót nagrania: ${String(e?.message ?? e).slice(0, 160)}`);
  }
}
