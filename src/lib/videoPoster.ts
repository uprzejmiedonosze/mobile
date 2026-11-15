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
