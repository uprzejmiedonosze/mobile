import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UdButton } from '../components/UD';
import { clampFrameTime, FRAME_STEP_S } from '../lib/video';
import { log } from '../lib/log';
import { toast } from '../store/useToast';
import { ud } from '../theme';

const fmtS = (s: number) => `${s.toFixed(1).replace('.', ',')} s`;

// Wybór klatki filmu, na której tablica jest czytelna – wraca do formularza (NewReport: `frameUri`, `frameAtS`) i staje się zdjęciem
// jak z galerii: ALPR, kontekst + wycinek auta, data i GPS z nagrania (lib/video.ts: framePhoto). Natywny odtwarzacz expo-video daje suwak; przyciski „±” przesuwają o ułamek sekundy.
// Klatkę wyciąga expo-video (Android: MediaMetadataRetriever.OPTION_CLOSEST, iOS: tolerancja 0 – dokładnie ta chwila,
// nie najbliższa klatka kluczowa), a expo-image-manipulator zapisuje ją jako JPEG. Ekran ładowany leniwie (App.tsx):
// starszy dev client bez modułu ExpoVideo nie wywraca się przy starcie.
export function VideoFrameScreen({ navigation, route }: any) {
  const uri: string = route.params.videoUri;
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(uri, (p) => { p.muted = true; p.loop = false; p.timeUpdateEventInterval = 0.1; });
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = player.addListener('timeUpdate', (e) => setTime(e.currentTime));
    const s = player.addListener('sourceLoad', (e) => setDuration(e.duration));
    return () => { t.remove(); s.remove(); };
  }, [player]);

  const step = (d: number) => {
    player.pause();
    const next = clampFrameTime(player.currentTime + d, duration || player.duration);
    player.currentTime = next;
    setTime(next);
  };

  const pick = async () => {
    setBusy(true);
    try {
      player.pause();
      const at = player.currentTime;
      const [thumb] = await player.generateThumbnailsAsync(at);
      if (!thumb) throw new Error('Nie udało się pobrać klatki.');
      const img = await ImageManipulator.ImageManipulator.manipulate(thumb).renderAsync();
      const out = await img.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.92 });
      log.info('klatka', `${fmtS(at)} → ${out.width}×${out.height}`);
      // popTo: wracamy do formularza, który otworzył wybór klatki (navigate w React Navigation 7 dołożyłby nowy)
      navigation.popTo('NewReport', { frameUri: out.uri, frameAtS: at }, { merge: true });
    } catch (e: any) {
      log.fail('klatka', e);
      toast.error(e?.message ?? 'Nie udało się pobrać klatki.');
      setBusy(false);
    }
  };

  const stepBtn = (d: number, label: string) => (
    <Pressable onPress={() => step(d)} disabled={busy} accessibilityRole="button" accessibilityLabel={label}
      style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: ud.radiusPill, borderWidth: 1, borderColor: ud.hairline, backgroundColor: ud.surface }}>
      <Text style={{ color: ud.heading, fontFamily: ud.fontBodyBold }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <VideoView player={player} nativeControls contentFit="contain" style={{ flex: 1, backgroundColor: '#000' }} />
      <View style={{ padding: 16, paddingBottom: insets.bottom + 16, gap: 12 }}>
        <Text style={{ color: ud.text, lineHeight: 20 }}>
          Zatrzymaj film tam, gdzie tablica rejestracyjna jest ostra i dobrze widoczna. Ta klatka trafi do zgłoszenia jako zdjęcie pojazdu,
          a numer odczytamy z niej automatycznie.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          {stepBtn(-FRAME_STEP_S, '◀ −0,1 s')}
          <Text style={{ color: ud.muted, minWidth: 64, textAlign: 'center' }}>{fmtS(time)}</Text>
          {stepBtn(FRAME_STEP_S, '+0,1 s ▶')}
        </View>
        {busy ? <ActivityIndicator color={ud.primary} /> : <UdButton title="Użyj tej klatki" onPress={pick} />}
      </View>
    </View>
  );
}
