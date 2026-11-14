import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UdButton, UdHeader } from '../components/UD';
import { fmtMB, videoTooLarge, VIDEO_BITRATE, VIDEO_MAX_DURATION_S, VIDEO_QUALITY, VIDEO_RECORD_MAX_BYTES } from '../lib/adHoc';
import { log } from '../lib/log';
import { toast } from '../store/useToast';
import { ud } from '../theme';

// Nagrywanie filmu do zgłoszenia „na gorąco” wyłącznie w aplikacji (bez galerii) – plik zostaje w katalogu podręcznym aparatu,
// a po nagraniu wracamy do formularza (AdHocReport) z `videoUri`. Rozmiar trzymają w ryzach jakość 720p, bitrate i limit czasu
// (lib/adHoc.ts); nagranie ponad limit serwera jest odrzucane już tutaj. Dźwięk jest kluczowy przy zgłoszeniu hałasu.
export function AdHocCameraScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [cam, requestCam] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    // po kolei, nie naraz: dwa systemowe okna uprawnień jednocześnie to wyścig (patrz lib/gallery.ts)
    (async () => {
      if (cam && !cam.granted && cam.canAskAgain) await requestCam();
      else if (cam?.granted && mic && !mic.granted && mic.canAskAgain) await requestMic();
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam?.granted, mic?.granted]);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(t);
  }, [recording]);

  const start = async () => {
    if (!camera.current || recording) return;
    setSeconds(0);
    setRecording(true);
    try {
      const res = await camera.current.recordAsync({
        maxDuration: VIDEO_MAX_DURATION_S,
        maxFileSize: VIDEO_RECORD_MAX_BYTES,
        ...(Platform.OS === 'ios' ? { codec: 'avc1' as const } : {}), // iOS: videoBitrate działa tylko z jawnym kodekiem
      });
      if (!res?.uri) return;
      let size: number | null = null;
      try { size = new File(res.uri).size ?? null; } catch { /* rozmiar sprawdzi serwer */ }
      if (videoTooLarge(size)) {
        toast.error(`Nagranie ma ${fmtMB(size!)} – to za dużo. Nagraj krótszy film.`);
        return;
      }
      navigation.navigate({ name: 'AdHocReport', params: { videoUri: res.uri, videoSize: size }, merge: true });
    } catch (e: any) {
      log.fail('nagranie', e);
      toast.error('Nie udało się nagrać filmu.');
    } finally {
      setRecording(false);
    }
  };

  const stop = () => camera.current?.stopRecording();

  if (!cam || !mic) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!cam.granted || !mic.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
        <UdHeader title="Nagranie" onBack={() => navigation.goBack()} />
        <View style={{ padding: 16, gap: 12 }}>
          <Text style={{ color: ud.text, lineHeight: 21 }}>
            Do nagrania filmu potrzebna jest zgoda na aparat i mikrofon. Dźwięk jest ważnym dowodem przy zgłoszeniu hałasu.
          </Text>
          {!cam.granted ? <UdButton title="Zezwól na aparat" onPress={requestCam} /> : null}
          {cam.granted && !mic.granted ? <UdButton title="Zezwól na mikrofon" onPress={requestMic} /> : null}
        </View>
      </View>
    );
  }

  const left = VIDEO_MAX_DURATION_S - seconds;
  const SHUTTER = 76;
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        ref={camera}
        style={{ flex: 1 }}
        facing="back"
        mode="video"
        videoQuality={VIDEO_QUALITY}
        videoBitrate={VIDEO_BITRATE}
        active={focused}
        onCameraReady={() => setReady(true)}
      />
      <View style={{ position: 'absolute', top: insets.top + 10, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={() => (recording ? stop() : navigation.goBack())} accessibilityRole="button" style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: ud.radiusPill, paddingHorizontal: 14, paddingVertical: 9 }}>
          <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold }}>{recording ? 'Zakończ' : 'Anuluj'}</Text>
        </Pressable>
        <View style={{ backgroundColor: recording ? ud.plateVerified : 'rgba(0,0,0,0.55)', borderRadius: ud.radiusPill, paddingHorizontal: 14, paddingVertical: 9 }}>
          <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold }}>
            {recording ? `● ${seconds}s · zostało ${left}s` : `Do ${VIDEO_MAX_DURATION_S} s, z dźwiękiem`}
          </Text>
        </View>
      </View>
      <View style={{ position: 'absolute', bottom: insets.bottom + 28, left: 16, right: 16, alignItems: 'center', gap: 12 }}>
        {!recording ? (
          <Text style={{ color: '#fff', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: ud.radiusSm, padding: 8 }}>
            Uchwyć tablicę rejestracyjną i to, co się dzieje.
          </Text>
        ) : null}
        <Pressable
          onPress={recording ? stop : start}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Zatrzymaj nagrywanie' : 'Nagraj film'}
          style={{ width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: ready ? 1 : 0.5 }}
        >
          <View style={recording
            ? { width: 28, height: 28, borderRadius: 4, backgroundColor: ud.plateVerified }
            : { width: 56, height: 56, borderRadius: 28, backgroundColor: ud.plateVerified }} />
        </Pressable>
      </View>
    </View>
  );
}
