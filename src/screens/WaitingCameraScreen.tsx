import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, PanResponder, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UdButton, UdHeader } from '../components/UD';
import { SESS_GAP_S } from '../lib/grouping';
import { log } from '../lib/log';
import { plural } from '../lib/reports';
import { freshFix, uiRotation, type Fix, type UiRotation } from '../lib/waitingRoom';
import { toast } from '../store/useToast';
import { useWaitingRoom } from '../store/useWaitingRoom';
import { ud } from '../theme';

const PHOTO_QUALITY = 0.92; // wycinki tablicy powstają z tego pliku (lib/crop.ts), więc bez mocnej kompresji
const PINCH_RANGE_PX = 500; // rozsunięcie palców o tyle = pełny zakres zoomu (zoom to ułamek maksimum urządzenia)
const dist = (a: any, b: any) => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
const ZOOM_MAX = 1;
const TILT_INTERVAL_MS = 250;

// Aparat w appce: zdjęcia trafiają do poczekalni (store/useWaitingRoom), nie do rolki. GPS z expo-location, a nie z EXIF, bo aparat sam go
// nie zapisuje. Pozycję śledzimy przez cały czas otwarcia ekranu: pierwszy odczyt po starcie bywa daleko od prawdy (lib/grouping.ts).
// Praca w poziomie jak w aparatach systemowych: appka zostaje zablokowana w pionie (podgląd się nie przeładowuje, działa też z blokadą obrotu
// w telefonie), a obracamy samą nakładkę. Plik i tak wychodzi poziomy: CameraX ustawia obrót zdjęcia z czujnika niezależnie od blokady.
export function WaitingCameraScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const add = useWaitingRoom((s) => s.add);
  const camera = useRef<CameraView>(null);
  const fix = useRef<Fix | null>(null);
  const [gps, setGps] = useState<'wait' | 'off' | number>('wait');
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const [rotation, setRotation] = useState<UiRotation>(0);
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
      const sub = Accelerometer.addListener(({ x, y }) => setRotation((prev) => uiRotation(x, y, prev)));
      return () => sub.remove();
    } catch (e: any) {
      log.warn('aparat', `Bez obrotu interfejsu: ${String(e?.message ?? e).slice(0, 160)}`);
    }
  }, []);

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
      setLastUri(photo.uri);
      setCarShots((n) => n + 1);
    } catch (e: any) {
      log.fail('aparat', e);
      toast.error('Nie udało się zrobić zdjęcia.');
    } finally {
      setBusy(false);
    }
  };

  const nextCar = () => { setCarSeq((n) => n + 1); setCarShots(0); };
  const close = () => navigation.replace('WaitingRoom');

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
        <UdHeader title="Aparat" onBack={() => navigation.goBack()} />
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
  const previewH = box.w ? Math.min(box.w * 4 / 3, Math.max(0, box.h - topBar - 150)) : 0;
  const previewTop = box.w ? Math.min(topBar, (box.h - previewH) * 0.3) : 0;
  const previewBottom = previewTop + previewH;
  const land = rotation !== 0;
  // Migawka stoi w czarnym pasie pod podglądem (w pionie i w poziomie w tym samym miejscu); w poziomie nad nią i pod nią są obrócone napisy.
  const SHUTTER = 76; const CHIP_H = 38; const BTN_H = 48; const GAP = 8;
  const W = { gps: 150, torch: 84, end: 74, next: 88, car: 220 };
  const zoneCenter = (previewBottom + box.h - insets.bottom) / 2 - 20;
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
  const carLabel = [carShots ? `To auto: ${plural(carShots, ['zdjęć', 'zdjęcie', 'zdjęcia'])}` : '', zoom > 0 ? `zoom ${Math.round(zoom * 100)}%` : ''].filter(Boolean).join(' · ');
  const carChip = carLabel ? rot(W.car, CHIP_H, (
    <View style={{ ...chipBox, flex: 1, paddingHorizontal: 6 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: '#fff', fontFamily: ud.fontBodyBold }}>{carLabel}</Text>
    </View>
  )) : null;
  const thumb = lastUri ? rot(58, 58, (
    <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Otwórz poczekalnię" style={{ width: 58, height: 58 }}>
      <Image source={{ uri: lastUri }} resizeMethod="resize" style={{ width: 58, height: 58, borderRadius: ud.radiusSm, borderWidth: 2, borderColor: '#fff' }} />
    </Pressable>
  )) : null;
  const center = { position: 'absolute', left: 0, right: 0, alignItems: 'center' } as const;
  const cornerTop = insets.top + 10; const cornerBottom = insets.bottom + 18;
  // Układ w poziomie liczymy tak, jak widzi go użytkownik (lewy-górny róg itd.) i zamieniamy na pozycje na ekranie fizycznym:
  // przy +90° lewy-górny to prawy-górny róg, „na lewo od migawki” to nad nią; przy -90° lewy-górny to lewy-dolny, a „na lewo” to pod nią.
  const cw = rotation === 90;

  return (
    <View onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Podgląd 3:4 = cała matryca 4:3 (jak w aparacie systemowym); reszta ekranu to czerń pod przyciski. Na bardzo niskim ekranie podgląd się zmniejsza. */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: previewTop, height: previewH, overflow: 'hidden' }}>
        <CameraView ref={camera} style={{ flex: 1 }} facing="back" mode="picture" ratio="4:3" active={focused} zoom={zoom} enableTorch={torch} />
      </View>
      {/* nakładka obok podglądu, nie w nim – gest dwóch palców = zoom */}
      {box.w ? (
        <View {...pinchResponder.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          {land ? (
            <>
              <View style={cw ? { position: 'absolute', right: 12, top: cornerTop } : { position: 'absolute', left: 12, bottom: cornerBottom }}>{torchBtn}</View>
              <View style={cw ? { position: 'absolute', left: 12, top: cornerTop } : { position: 'absolute', right: 12, bottom: cornerBottom }}>{gpsChip}</View>
              {carChip ? <View style={{ ...center, top: previewBottom - 50 - W.car }}>{carChip}</View> : null}
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
          <View style={{ position: 'absolute', left: 0, right: 0, top: zoneCenter - SHUTTER / 2, height: SHUTTER, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' }}>
            {endBtn}
            <View style={{ width: SHUTTER }} />
            {nextBtn}
          </View>
          {thumb ? <View style={{ position: 'absolute', left: 16, top: previewBottom - 12 - 58 }}>{thumb}</View> : null}
          <Pressable onPress={shoot} disabled={busy} accessibilityRole="button" accessibilityLabel="Zrób zdjęcie" style={{ position: 'absolute', left: (box.w - SHUTTER) / 2, top: zoneCenter - SHUTTER / 2, width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', backgroundColor: busy ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)' }}>
            {busy ? <ActivityIndicator color={ud.primary} /> : null}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
