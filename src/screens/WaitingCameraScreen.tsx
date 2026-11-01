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
import { freshFix, type Fix } from '../lib/waitingRoom';
import { toast } from '../store/useToast';
import { useWaitingRoom } from '../store/useWaitingRoom';
import { ud } from '../theme';

const PHOTO_QUALITY = 0.92; // wycinki tablicy powstają z tego pliku (lib/crop.ts), więc bez mocnej kompresji
const PINCH_RANGE_PX = 500; // rozsunięcie palców o tyle = pełny zakres zoomu (zoom to ułamek maksimum urządzenia)
const dist = (a: any, b: any) => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
const ZOOM_MAX = 1;

// Aparat w appce: zdjęcia trafiają do poczekalni (store/useWaitingRoom), nie do rolki. GPS z expo-location, a nie z EXIF, bo aparat sam go
// nie zapisuje. Pozycję śledzimy przez cały czas otwarcia ekranu: pierwszy odczyt po starcie bywa daleko od prawdy (lib/grouping.ts).
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

  const nextCar = () => { setCarSeq((n) => n + 1); setCarShots(0); toast.info('Następne zdjęcia to kolejne auto.'); };
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

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={camera} style={{ flex: 1 }} facing="back" mode="picture" active={focused} zoom={zoom} enableTorch={torch} />
      {/* nakładka obok podglądu, nie w nim – gest dwóch palców = zoom */}
      <View {...pinchResponder.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', paddingTop: insets.top + 10, paddingBottom: insets.bottom + 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12 }}>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Zamknij aparat" style={chip}><Text style={{ color: '#fff', fontFamily: ud.fontBodyBold }}>✕ Poczekalnia</Text></Pressable>
          <View style={chip}><Text style={{ color: gpsColor, fontFamily: ud.fontBodyBold, fontSize: 13 }}>{gpsText}</Text></View>
          <Pressable onPress={() => setTorch((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: torch }} accessibilityLabel="Latarka" style={chip}><Text style={{ color: torch ? ud.accent : '#fff', fontFamily: ud.fontBodyBold }}>Latarka</Text></Pressable>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ alignItems: 'center', marginBottom: 14 }}>
            <View style={chip}>
              <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold }}>{carShots ? `To auto: ${plural(carShots, ['zdjęć', 'zdjęcie', 'zdjęcia'])}` : 'Nowe auto'}{zoom > 0 ? ` · zoom ${Math.round(zoom * 100)}%` : ''}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Otwórz poczekalnię" style={{ width: 96 }}>
              {lastUri ? <Image source={{ uri: lastUri }} resizeMethod="resize" style={{ width: 58, height: 58, borderRadius: ud.radiusSm, borderWidth: 2, borderColor: '#fff' }} /> : null}
            </Pressable>
            <Pressable onPress={shoot} disabled={busy} accessibilityRole="button" accessibilityLabel="Zrób zdjęcie" style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', backgroundColor: busy ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)' }}>
              {busy ? <ActivityIndicator color={ud.primary} /> : null}
            </Pressable>
            <Pressable onPress={nextCar} disabled={carShots === 0} accessibilityRole="button" accessibilityLabel="Następne auto" accessibilityState={{ disabled: carShots === 0 }} style={{ ...chip, width: 96, alignItems: 'center', backgroundColor: carShots === 0 ? 'rgba(0,0,0,0.35)' : ud.primary, opacity: carShots === 0 ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold, fontSize: 13, textAlign: 'center' }}>Następne auto →</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
