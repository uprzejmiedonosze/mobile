import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import * as Location from 'expo-location';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UdButton } from '../components/UD';
import { goTab } from '../lib/goTab';
import { fmtMB, videoTooLarge, VIDEO_BITRATE, VIDEO_MAX_DURATION_S, VIDEO_QUALITY, VIDEO_RECORD_MAX_BYTES } from '../lib/adHoc';
import { SESS_GAP_S } from '../lib/grouping';
import { log } from '../lib/log';
import { plural } from '../lib/reports';
import { freshFix, uiRotation, type Fix, type UiRotation } from '../lib/waitingRoom';
import { fixVideoRotation, videoPoster } from '../lib/videoPoster';
import { useAuth } from '../store/useAuth';
import { toast } from '../store/useToast';
import { useWaitingRoom } from '../store/useWaitingRoom';
import { saveCopyToGallery } from '../lib/galleryCopy';
import { ud } from '../theme';

const PHOTO_QUALITY = 0.92; // wycinki tablicy powstają z tego pliku (lib/crop.ts), więc bez mocnej kompresji
const PINCH_RANGE_PX = 500; // rozsunięcie palców o tyle = pełny zakres zoomu (zoom to ułamek maksimum urządzenia)
const dist = (a: any, b: any) => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
const ZOOM_MAX = 1;
const TILT_INTERVAL_MS = 250;

// Aparat w appce: zdjęcia trafiają do poczekalni (store/useWaitingRoom), nie do rolki. GPS z expo-location, a nie z EXIF, bo aparat sam go
// nie zapisuje. Pozycję śledzimy przez cały czas otwarcia ekranu: pierwszy odczyt po starcie bywa daleko od prawdy (lib/grouping.ts).
// Praca w poziomie jak w aparatach systemowych: appka zostaje zablokowana w pionie (podgląd się nie przeładowuje, działa też z blokadą obrotu
// w telefonie), a obracamy samą nakładkę. Plik i tak wychodzi poziomy: CameraX ustawia obrót zdjęcia z czujnika niezależnie od blokady
// (dla nagrań dopiero z łatką patches/expo-camera+*.patch – bez niej film w poziomie wychodził obrócony).
// Tryb WIDEO (tylko gdy serwer włączył zgłoszenia „na gorąco”): ten sam aparat nagrywa film z dźwiękiem (limity z lib/adHoc.ts), który
// czeka w poczekalni jak zdjęcia; zgodę na mikrofon pytamy dopiero przy przełączeniu na WIDEO.
// To jedyny aparat do filmów: formularz „na gorąco” otwiera go z `{ mode: 'video', returnTo: 'AdHocReport' }` – wtedy bez przełącznika,
// a po nagraniu wraca do formularza z `waitingVideoId` (film i tak leży w poczekalni).
export function WaitingCameraScreen({ navigation, route }: any) {
  const returnTo: string | undefined = route?.params?.returnTo;
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  const videoEnabled = useAuth((s) => s.adHocReports);
  const [mode, setMode] = useState<'photo' | 'video'>(route?.params?.mode === 'video' && videoEnabled ? 'video' : 'photo');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [ready, setReady] = useState(false);
  const [lastIsVideo, setLastIsVideo] = useState(false);
  const add = useWaitingRoom((s) => s.add);
  const setPoster = useWaitingRoom((s) => s.setPoster);
  const camera = useRef<CameraView>(null);
  const fix = useRef<Fix | null>(null);
  const [gps, setGps] = useState<'wait' | 'off' | number>('wait');
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const [rotation, setRotation] = useState<UiRotation>(0);
  const rotationRef = useRef<UiRotation>(0); rotationRef.current = rotation;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(0);
  const zoomRef = useRef(0); zoomRef.current = zoom;
  const pinch = useRef({ startDist: 0, startZoom: 0 });
  // Bez „Następne auto” numer się nie zmienia, także po ponownym otwarciu aparatu – o podziale decyduje wtedy czas i GPS.
  const [carSeq, setCarSeq] = useState(() => Math.max(1, ...useWaitingRoom.getState().photos.map((p) => p.carSeq)));
  // Po ponownym otwarciu liczymy świeże zdjęcia tego auta: napis jest prawdziwy, a „Następne auto” działa od razu.
  const [carShots, setCarShots] = useState(() => useWaitingRoom.getState().photos.filter((p) => p.carSeq === carSeq && Date.now() - p.takenAtMs <= SESS_GAP_S * 1000).length);
  const [lastUri, setLastUri] = useState<string | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted, permission?.canAskAgain]);

  // Dopiero po zgodzie na aparat: dwa okna uprawnień naraz to wyścig przejść Activity (patrz lib/gallery.ts).
  useEffect(() => {
    if (!permission?.granted) return;
    let sub: Location.LocationSubscription | null = null;
    let stopped = false;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { setGps('off'); return; }
      const watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 }, (pos) => {
        fix.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null, atMs: pos.timestamp };
        setGps(Math.round(pos.coords.accuracy ?? 0));
      });
      if (stopped) watch.remove(); else sub = watch;
    })().catch((e: any) => { log.warn('aparat', `GPS: ${String(e?.message ?? e).slice(0, 160)}`); setGps('off'); });
    return () => { stopped = true; sub?.remove(); };
  }, [permission?.granted]);

  // Leniwie i w try: expo-sensors przy imporcie wymaga modułu natywnego, a na buildzie bez niego aparat ma działać, tyle że tylko w pionie.
  useEffect(() => {
    try {
      const { Accelerometer } = require('expo-sensors') as typeof import('expo-sensors');
      Accelerometer.setUpdateInterval(TILT_INTERVAL_MS);
      const sub = Accelerometer.addListener(({ x, y }) => {
        // iOS zwraca osie z odwrotnym znakiem niż Android (grawitacja w górę ekranu: y < 0), a uiRotation zakłada konwencję Androida.
        const k = Platform.OS === 'ios' ? -1 : 1;
        setRotation((prev) => uiRotation(k * x, k * y, prev));
      });
      return () => sub.remove();
    } catch (e: any) {
      log.warn('aparat', `Bez obrotu interfejsu: ${String(e?.message ?? e).slice(0, 160)}`);
    }
  }, []);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(t);
  }, [recording]);

  // wyjście z ekranu w trakcie nagrania: zatrzymujemy, a nagranie i tak trafia do poczekalni (recordAsync się rozwiązuje)
  const recordingRef = useRef(false); recordingRef.current = recording;
  useEffect(() => navigation.addListener('blur', () => { if (recordingRef.current) camera.current?.stopRecording(); }), [navigation]);

  // Zgoda na mikrofon – dopiero gdy potrzebna (tryb WIDEO); po odmowie „nie pytaj” zostają ustawienia systemu.
  const ensureMic = async (): Promise<boolean> => {
    if (mic?.granted) return true;
    const r = mic?.canAskAgain === false ? mic : await requestMic();
    log.info('aparat', `mikrofon: ${r?.status}, canAskAgain=${r?.canAskAgain}`);
    if (r?.granted) return true;
    Alert.alert('Mikrofon', 'Film nagrywamy z dźwiękiem – to ważny dowód przy hałasie. Włącz zgodę na mikrofon w ustawieniach aplikacji.', [
      { text: 'Anuluj', style: 'cancel' },
      ...(r?.canAskAgain === false ? [{ text: 'Otwórz ustawienia', onPress: () => { Linking.openSettings().catch(() => {}); } }] : []),
    ]);
    return false;
  };

  // Start od razu w trybie WIDEO (z formularza): o mikrofon pytamy po zgodzie na aparat – dwa okna naraz to wyścig.
  useEffect(() => {
    if (mode === 'video' && permission?.granted && mic && !mic.granted && mic.canAskAgain) void ensureMic();
  }, [permission?.granted, mic?.granted]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = async (next: 'photo' | 'video') => {
    if (recording || next === mode) return;
    if (next === 'video' && !(await ensureMic())) return;
    setMode(next); // gotowości nie zerujemy: nie wiadomo, czy onCameraReady przyjdzie po zmianie trybu (nieudany start = komunikat z record)
  };

  const record = async () => {
    if (!camera.current || recording || !ready) return;
    if (!(await ensureMic())) return;
    const startedMs = Date.now();
    const startFix = freshFix(fix.current, startedMs);
    const startRotation = rotationRef.current; // położenie telefonu na starcie: z niego poprawiamy obrót pliku (lib/mp4Rotation.ts)
    setSeconds(0);
    setRecording(true);
    try {
      const res = await camera.current.recordAsync({
        maxDuration: VIDEO_MAX_DURATION_S,
        maxFileSize: VIDEO_RECORD_MAX_BYTES,
        ...(Platform.OS === 'ios' ? { codec: 'avc1' as const } : {}), // iOS: videoBitrate działa tylko z jawnym kodekiem
      });
      if (!res?.uri) return;
      let size: number | undefined;
      try { size = new File(res.uri).size ?? undefined; } catch { /* rozmiar sprawdzi serwer */ }
      if (videoTooLarge(size)) {
        toast.error(`Nagranie ma ${fmtMB(size!)} – to za dużo. Nagraj krótszy film.`);
        try { new File(res.uri).delete(); } catch { /* cache */ }
        return;
      }
      fixVideoRotation(res.uri, startRotation);
      const durationMs = Date.now() - startedMs;
      const video = add({ uri: res.uri, takenAtMs: startedMs, fix: startFix ?? freshFix(fix.current, Date.now()), carSeq, kind: 'video', durationMs, size });
      setLastUri(null);
      setLastIsVideo(true);
      videoPoster(video.uri, durationMs).then((uri) => { if (uri) { setPoster(video.id, uri); setLastUri(uri); } });
      if (returnTo) navigation.navigate({ name: returnTo, params: { waitingVideoId: video.id }, merge: true });
    } catch (e: any) {
      log.fail('aparat', e);
      toast.error('Nie udało się nagrać filmu.');
    } finally {
      setRecording(false);
    }
  };

  const pinchResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
    onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
    onPanResponderGrant: (e) => {
      const t = e.nativeEvent.touches;
      if (t.length === 2) pinch.current = { startDist: dist(t[0], t[1]), startZoom: zoomRef.current };
    },
    onPanResponderMove: (e) => {
      const t = e.nativeEvent.touches;
      if (t.length !== 2) return;
      if (!pinch.current.startDist) { pinch.current = { startDist: dist(t[0], t[1]), startZoom: zoomRef.current }; return; }
      const next = pinch.current.startZoom + (dist(t[0], t[1]) - pinch.current.startDist) / PINCH_RANGE_PX;
      setZoom(Math.min(ZOOM_MAX, Math.max(0, next)));
    },
    onPanResponderRelease: () => { pinch.current.startDist = 0; },
  }), []);

  const shoot = async () => {
    if (busy || !camera.current) return;
    setBusy(true);
    try {
      const takenAtMs = Date.now();
      const pic = await camera.current.takePictureAsync({ quality: PHOTO_QUALITY });
      const photo = add({ uri: pic.uri, takenAtMs, fix: freshFix(fix.current, takenAtMs), carSeq });
      void saveCopyToGallery(photo.uri); // tylko gdy włączone w Koncie (Android)
      setLastUri(photo.uri);
      setLastIsVideo(false);
      setCarShots((n) => n + 1);
    } catch (e: any) {
      log.fail('aparat', e);
      toast.error('Nie udało się zrobić zdjęcia.');
    } finally {
      setBusy(false);
    }
  };

  const nextCar = () => { setCarSeq((n) => n + 1); setCarShots(0); };
  const close = () => {
    if (recording) camera.current?.stopRecording();
    if (returnTo) navigation.goBack(); else goTab(navigation, 'WaitingRoom');
  };

  // Pełnoekranowy aparat bez nagłówka; pytanie o zgodę ma zwykły nagłówek ze strzałką.
  const needsPermission = !!permission && !permission.granted;
  useLayoutEffect(() => { navigation.setOptions({ headerShown: needsPermission }); }, [navigation, needsPermission]);

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: ud.text, lineHeight: 21, marginBottom: 12 }}>Do robienia zdjęć w aplikacji potrzebna jest zgoda na aparat.</Text>
          <UdButton title="Zezwól na aparat" onPress={requestPermission} />
        </View>
      </View>
    );
  }

  const gpsText = gps === 'wait' ? 'GPS: szukam…' : gps === 'off' ? 'Bez GPS (brak zgody)' : `GPS ±${gps} m`;
  const gpsColor = gps === 'off' ? ud.plateVerified : gps === 'wait' || gps > 25 ? ud.accent : '#fff';
  const chip = { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: ud.radiusPill, paddingHorizontal: 14, paddingVertical: 9 } as const;
  const topBar = insets.top + 56;
  const video = mode === 'video';
  const aspect = video ? 16 / 9 : 4 / 3; // 720p nagrania to 16:9, zdjęcie – cała matryca 4:3
  const SWITCH_H = videoEnabled && !returnTo ? 44 : 0; // pas na przełącznik ZDJĘCIE/WIDEO między podglądem a migawką
  const previewH = box.w ? Math.min(box.w * aspect, Math.max(0, box.h - topBar - 150 - SWITCH_H)) : 0;
  const previewTop = box.w ? Math.min(topBar, (box.h - previewH) * 0.3) : 0;
  const previewBottom = previewTop + previewH;
  const land = rotation !== 0;
  // Migawka stoi w czarnym pasie pod podglądem (w pionie i w poziomie w tym samym miejscu); w poziomie nad nią i pod nią są obrócone napisy.
  const SHUTTER = 76; const CHIP_H = 38; const BTN_H = 48; const GAP = 8;
  const W = { gps: 150, torch: 84, end: 74, next: 88, car: 220 };
  const zoneCenter = (previewBottom + SWITCH_H + box.h - insets.bottom) / 2 - 20;
  // Element o stałym rozmiarze w×h; w poziomie zajmuje h×w i jest obrócony o `rotation` wokół własnego środka, więc zostaje na miejscu.
  const rot = (w: number, h: number, child: React.ReactNode) => (
    <View style={land ? { width: h, height: w } : { width: w, height: h }}>
      <View style={land ? { position: 'absolute', width: w, height: h, left: (h - w) / 2, top: (w - h) / 2, transform: [{ rotate: `${rotation}deg` }] } : { width: w, height: h }}>{child}</View>
    </View>
  );
  const chipBox = { ...chip, height: CHIP_H, alignItems: 'center', justifyContent: 'center' } as const;
  const btnText = { color: '#fff', fontFamily: ud.fontBodyBold, fontSize: 16, textAlign: 'center' } as const;
  const endBtn = rot(W.end, BTN_H, (
    <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Zakończ robienie zdjęć" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={btnText}>Zakończ</Text></Pressable>
  ));
  const nextBtn = rot(W.next, BTN_H, (
    <Pressable onPress={nextCar} disabled={carShots === 0} accessibilityRole="button" accessibilityLabel="Następne auto" accessibilityState={{ disabled: carShots === 0 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: carShots === 0 ? 0.45 : 1 }}>
      <Text style={{ ...btnText, color: carShots === 0 ? '#fff' : ud.accent }}>{'Następne\nauto'}</Text>
    </Pressable>
  ));
  const gpsChip = rot(W.gps, CHIP_H, <View style={{ ...chipBox, flex: 1, paddingHorizontal: 6 }}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: gpsColor, fontFamily: ud.fontBodyBold, fontSize: 13 }}>{gpsText}</Text></View>);
  const torchBtn = rot(W.torch, CHIP_H, (
    <Pressable onPress={() => setTorch((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: torch }} accessibilityLabel="Latarka" style={{ ...chipBox, flex: 1, paddingHorizontal: 0 }}><Text style={{ color: torch ? ud.accent : '#fff', fontFamily: ud.fontBodyBold }}>Latarka</Text></Pressable>
  ));
  const carLabel = [
    video ? (recording ? `● ${seconds} s · zostało ${VIDEO_MAX_DURATION_S - seconds} s` : `Film do ${VIDEO_MAX_DURATION_S} s, z dźwiękiem`)
      : carShots ? `To auto: ${plural(carShots, ['zdjęć', 'zdjęcie', 'zdjęcia'])}` : '',
    zoom > 0 ? `zoom ${Math.round(zoom * 100)}%` : '',
  ].filter(Boolean).join(' · ');
  const carChip = carLabel ? rot(W.car, CHIP_H, (
    <View style={{ ...chipBox, flex: 1, paddingHorizontal: 6 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: '#fff', fontFamily: ud.fontBodyBold }}>{carLabel}</Text>
    </View>
  )) : null;
  const thumb = (lastUri || lastIsVideo) && !recording ? rot(58, 58, (
    <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Otwórz poczekalnię" style={{ width: 58, height: 58, borderRadius: ud.radiusSm, borderWidth: 2, borderColor: '#fff', overflow: 'hidden', backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }}>
      {lastUri ? <Image source={{ uri: lastUri }} resizeMethod="resize" style={{ width: 54, height: 54 }} /> : null}
      {lastIsVideo ? <Text style={{ position: 'absolute', fontSize: 20 }}>🎬</Text> : null}
    </Pressable>
  )) : null;
  // Przełącznik trybu jak w aparacie systemowym: nad migawką, zablokowany w trakcie nagrania.
  const modeSwitch = videoEnabled && !returnTo ? (
    <View style={{ flexDirection: 'row', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: ud.radiusPill, padding: 3, opacity: recording ? 0.4 : 1 }}>
      {(['photo', 'video'] as const).map((m) => (
        <Pressable key={m} onPress={() => switchMode(m)} disabled={recording} accessibilityRole="radio" accessibilityState={{ checked: mode === m, disabled: recording }}
          style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: ud.radiusPill, backgroundColor: mode === m ? '#fff' : 'transparent' }}>
          <Text style={{ color: mode === m ? '#000' : '#fff', fontFamily: ud.fontBodyBold, fontSize: 13, letterSpacing: 1 }}>{m === 'photo' ? 'ZDJĘCIE' : 'WIDEO'}</Text>
        </Pressable>
      ))}
    </View>
  ) : null;
  const center = { position: 'absolute', left: 0, right: 0, alignItems: 'center' } as const;
  const cornerTop = insets.top + 10; const cornerBottom = insets.bottom + 18;
  // Układ w poziomie liczymy tak, jak widzi go użytkownik (lewy-górny róg itd.) i zamieniamy na pozycje na ekranie fizycznym:
  // przy +90° lewy-górny to prawy-górny róg, „na lewo od migawki” to nad nią; przy -90° lewy-górny to lewy-dolny, a „na lewo” to pod nią.
  const cw = rotation === 90;

  return (
    <View onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={{ flex: 1, backgroundColor: '#000' }}>
      {focused ? <StatusBar style="light" /> : null}
      {/* Podgląd 3:4 = cała matryca 4:3 (jak w aparacie systemowym); reszta ekranu to czerń pod przyciski. Na bardzo niskim ekranie podgląd się zmniejsza. */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: previewTop, height: previewH, overflow: 'hidden' }}>
        <CameraView ref={camera} style={{ flex: 1 }} facing="back" mode={video ? 'video' : 'picture'} ratio={video ? '16:9' : '4:3'} active={focused} zoom={zoom} enableTorch={torch}
          videoQuality={VIDEO_QUALITY} videoBitrate={VIDEO_BITRATE} onCameraReady={() => setReady(true)} />
      </View>
      {/* nakładka obok podglądu, nie w nim – gest dwóch palców = zoom */}
      {box.w ? (
        <View {...pinchResponder.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          {land ? (
            <>
              <View style={cw ? { position: 'absolute', right: 12, top: cornerTop } : { position: 'absolute', left: 12, bottom: cornerBottom }}>{torchBtn}</View>
              <View style={cw ? { position: 'absolute', left: 12, top: cornerTop } : { position: 'absolute', right: 12, bottom: cornerBottom }}>{gpsChip}</View>
              {/* w tej samej linii co GPS (dla patrzącego: tuż na prawo od niego, przy dolnej krawędzi) – nie na środku podglądu */}
              {carChip ? <View style={cw ? { position: 'absolute', left: 12, top: cornerTop + W.gps + GAP } : { position: 'absolute', right: 12, bottom: cornerBottom + W.gps + GAP }}>{carChip}</View> : null}
            </>
          ) : (
            <>
              <View style={{ position: 'absolute', left: 12, right: 12, top: cornerTop, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ width: W.torch }} />
                {gpsChip}
                {torchBtn}
              </View>
              {carChip ? <View style={{ ...center, top: previewBottom - 14 - CHIP_H }}>{carChip}</View> : null}
            </>
          )}
          {modeSwitch ? <View style={{ ...center, top: previewBottom + 6 }}>{modeSwitch}</View> : null}
          <View style={{ position: 'absolute', left: 0, right: 0, top: zoneCenter - SHUTTER / 2, height: SHUTTER, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' }}>
            {endBtn}
            <View style={{ width: SHUTTER }} />
            {video ? <View style={land ? { width: BTN_H, height: W.next } : { width: W.next, height: BTN_H }} /> : nextBtn}
          </View>
          {thumb ? <View style={{ position: 'absolute', left: 16, top: previewBottom - 12 - 58 }}>{thumb}</View> : null}
          {video ? (
            <Pressable onPress={recording ? () => camera.current?.stopRecording() : record} disabled={!ready && !recording} accessibilityRole="button" accessibilityLabel={recording ? 'Zatrzymaj nagrywanie' : 'Nagraj film'} style={{ position: 'absolute', left: (box.w - SHUTTER) / 2, top: zoneCenter - SHUTTER / 2, width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: ready || recording ? 1 : 0.5 }}>
              <View style={recording ? { width: 28, height: 28, borderRadius: 4, backgroundColor: ud.plateVerified } : { width: 56, height: 56, borderRadius: 28, backgroundColor: ud.plateVerified }} />
            </Pressable>
          ) : (
            <Pressable onPress={shoot} disabled={busy} accessibilityRole="button" accessibilityLabel="Zrób zdjęcie" style={{ position: 'absolute', left: (box.w - SHUTTER) / 2, top: zoneCenter - SHUTTER / 2, width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', backgroundColor: busy ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)' }}>
              {busy ? <ActivityIndicator color={ud.primary} /> : null}
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}
