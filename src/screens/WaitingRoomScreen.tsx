import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Image, PanResponder, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { reverseGeocode } from '../api/geo';
import { validIdToken } from '../api/udApi';
import { ImageViewer } from '../components/ImageViewer';
import { UdButton, UdHeader, UdTabs } from '../components/UD';
import { plural } from '../lib/reports';
import { bestFix, packPhotos, type Pack, type WaitingPhoto } from '../lib/waitingRoom';
import { useWaitingRoom } from '../store/useWaitingRoom';
import { ud } from '../theme';

const SWIPE_RATIO = 0.3; // tyle szerokości ekranu w lewo = usunięcie
const SWIPE_MIN_FLING_PX = 40;
const SWIPE_FLING_VX = -0.8;

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
const timeRange = (a: number, b: number) => (hhmm(a) === hhmm(b) ? hhmm(a) : `${hhmm(a)}–${hhmm(b)}`);

function gpsLabel(photos: WaitingPhoto[]) {
  const withGps = photos.filter((p) => p.lat != null);
  if (!withGps.length) return { text: 'bez GPS', color: ud.warning };
  const acc = withGps.map((p) => p.accuracy).filter((a): a is number => a != null);
  return { text: acc.length ? `GPS ±${Math.round(Math.min(...acc))} m` : 'GPS', color: ud.muted };
}

function Thumb({ photo, on, onPress, onLongPress }: { photo: WaitingPhoto; on: boolean; onPress?: () => void; onLongPress: () => void }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Zdjęcie z ${hhmm(photo.takenAtMs)}`} style={{ flex: 1, maxWidth: '33%', aspectRatio: 1, borderRadius: ud.radiusSm, overflow: 'hidden', borderWidth: 3, borderColor: on ? ud.primary : ud.hairline }}>
      <Image source={{ uri: photo.uri }} resizeMethod="resize" style={{ flex: 1, opacity: on ? 1 : 0.35 }} />
      {on ? <View style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: ud.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 13 }}>✓</Text></View> : null}
    </Pressable>
  );
}

// Ten sam adres co w formularzu zgłoszenia (reverseGeocode). Pamięć na współrzędne jak w żądaniu, a kolejka, bo każda paczka to dwa żądania,
// a przy otwarciu poczekalni pytają wszystkie naraz. Nieudane pytanie nie zostaje w pamięci: następne otwarcie spróbuje ponownie.
const addresses = new Map<string, Promise<string | null>>();
let addressQueue: Promise<unknown> = Promise.resolve();
function packAddress(lat: number, lng: number) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const known = addresses.get(key);
  if (known) return known;
  const pending = addressQueue
    .then(() => validIdToken())
    .then((token) => reverseGeocode(lat, lng, token))
    .then((geo) => geo?.display || null)
    .catch(() => null)
    .then((text) => { if (!text) addresses.delete(key); return text; });
  addresses.set(key, pending);
  addressQueue = pending;
  return pending;
}

function PackAddress({ photos }: { photos: WaitingPhoto[] }) {
  const fix = bestFix(photos);
  const lat = fix?.lat, lng = fix?.lng;
  const [address, setAddress] = useState<string | null | undefined>();
  useEffect(() => {
    setAddress(undefined);
    if (lat == null || lng == null) return;
    let stale = false;
    packAddress(lat, lng).then((text) => { if (!stale) setAddress(text); });
    return () => { stale = true; };
  }, [lat, lng]);
  if (lat == null || address === null) return null;
  return <Text style={{ color: address ? ud.text : ud.muted, marginTop: 2 }}>{address ?? 'szukam adresu…'}</Text>;
}

// Przesunięcie w lewo usuwa paczkę. Własny gest tylko dla ruchu wyraźnie poziomego: pionowy zostaje przewijaniu, a dotknięcie zdjęciu.
function SwipeToRemove({ onRemove, children }: { onRemove: (back: () => void) => void; children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const x = useRef(new Animated.Value(0)).current;
  const latest = useRef({ onRemove, width });
  latest.current = { onRemove, width };
  const responder = useMemo(() => {
    const back = () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx < -12 && Math.abs(g.dx) > 2 * Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => x.setValue(Math.min(0, g.dx)),
      onPanResponderRelease: (_, g) => {
        const { onRemove: remove, width: w } = latest.current;
        if (g.dx < -w * SWIPE_RATIO || (g.vx < SWIPE_FLING_VX && g.dx < -SWIPE_MIN_FLING_PX)) {
          Animated.timing(x, { toValue: -w, duration: 150, useNativeDriver: true }).start(() => remove(back));
        } else back();
      },
      onPanResponderTerminate: back,
    });
  }, [x]);
  return (
    <View style={{ marginTop: 10 }}>
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: ud.radiusCard, backgroundColor: ud.plateVerified, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 20, opacity: x.interpolate({ inputRange: [-60, 0], outputRange: [1, 0], extrapolate: 'clamp' }) }}>
        <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold }}>Usuń</Text>
      </Animated.View>
      <Animated.View {...responder.panHandlers} style={{ transform: [{ translateX: x }] }}>{children}</Animated.View>
    </View>
  );
}

// Poczekalnia: zdjęcia z aparatu w appce (WaitingCameraScreen) podzielone na paczki po czasie i GPS (lib/waitingRoom.ts), bez kredytów; sieć
// tylko na adres paczki. „Zgłoszenie” tworzy szkic – dopiero wtedy zdjęcia lecą na serwer i liczy się ALPR. Dotknięcie zdjęcia wyłącza je
// z paczki (zostaje w poczekalni i wchodzi do kolejnej), przytrzymanie powiększa. Usuwanie (✕ albo przesunięcie w lewo) obejmuje zaznaczone,
// a gdy żadne nie jest zaznaczone: całą paczkę.
export function WaitingRoomScreen({ navigation }: any) {
  const go = (r: string) => navigation.navigate(r);
  const photos = useWaitingRoom((s) => s.photos);
  const remove = useWaitingRoom((s) => s.remove);
  const restore = useWaitingRoom((s) => s.restore);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<number | null>(null);
  const [viewerUrls, setViewerUrls] = useState<string[]>([]);

  const waiting = useMemo(() => photos.filter((p) => !p.draftId), [photos]);
  const packs = useMemo(() => packPhotos(waiting), [waiting]);
  // szkice nie są na liście zgłoszeń, więc te utworzone stąd da się otworzyć tylko stąd
  const drafts = useMemo(() => {
    const m = new Map<string, WaitingPhoto[]>();
    for (const p of photos) if (p.draftId) m.set(p.draftId, [...(m.get(p.draftId) ?? []), p]);
    return [...m.entries()].sort((a, b) => (b[1][0].usedAt ?? 0) - (a[1][0].usedAt ?? 0));
  }, [photos]);

  const toggle = (id: string) => setExcluded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const zoom = (list: WaitingPhoto[], i: number) => { setViewerUrls(list.map((p) => p.uri)); setViewer(i); };
  const chosen = (pack: Pack) => pack.photos.filter((p) => !excluded.has(p.id));

  const confirmRemove = (pack: Pack, back?: () => void) => {
    const ids = (chosen(pack).length ? chosen(pack) : pack.photos).map((p) => p.id);
    Alert.alert(`Usunąć ${plural(ids.length, ['zdjęć', 'zdjęcie', 'zdjęcia'])}?`, 'Tych zdjęć nie ma nigdzie indziej – nie da się ich odzyskać.', [
      { text: 'Anuluj', style: 'cancel', onPress: back },
      { text: 'Usuń', style: 'destructive', onPress: () => { remove(ids); back?.(); } },
    ]);
  };

  let lastDay = '';
  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader title="Poczekalnia" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <UdButton title="Zrób zdjęcia" onPress={() => navigation.replace('WaitingCamera')} />
        {!photos.length ? (
          <Text style={{ color: ud.muted, marginTop: 16, lineHeight: 21 }}>Zdjęcia zrobione w aplikacji poczekają tutaj, poza rolką aparatu. Zostają tylko na tym telefonie: odinstalowanie aplikacji je usunie.</Text>
        ) : null}

        {packs.map((pack) => {
          const day = dayLabel(pack.startMs);
          const showDay = day !== lastDay;
          lastDay = day;
          const sel = chosen(pack);
          const gps = gpsLabel(sel.length ? sel : pack.photos);
          return (
            <View key={pack.id}>
              {showDay ? <Text style={{ fontFamily: ud.fontBodyBold, color: ud.muted, fontSize: 12, letterSpacing: 1, marginTop: 20, marginBottom: 2 }}>{day.toUpperCase()}</Text> : null}
              <SwipeToRemove onRemove={(back) => confirmRemove(pack, back)}>
              <View style={{ backgroundColor: ud.surface, borderRadius: ud.radiusCard, padding: 12, borderWidth: 1, borderColor: '#e6e3dc' }}>
                <View style={{ paddingRight: 24 }}>
                  <Text style={{ color: ud.heading, fontFamily: ud.fontBodyBold }}>
                    {timeRange(pack.startMs, pack.endMs)} · <Text style={{ color: gps.color, fontFamily: ud.fontBody }}>{gps.text}</Text>
                  </Text>
                  <PackAddress photos={sel.length ? sel : pack.photos} />
                </View>
                <Pressable onPress={() => confirmRemove(pack)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Usuń zdjęcia z paczki" style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: ud.muted, fontSize: 16 }}>✕</Text>
                </Pressable>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  {pack.photos.map((p, i) => <Thumb key={p.id} photo={p} on={!excluded.has(p.id)} onPress={() => toggle(p.id)} onLongPress={() => zoom(pack.photos, i)} />)}
                </View>
                <View style={{ marginTop: 6 }}>
                  <UdButton title={`Zgłoszenie (${sel.length})`} disabled={!sel.length} onPress={() => navigation.push('NewReport', { waitingIds: sel.map((p) => p.id) })} />
                </View>
              </View>
              </SwipeToRemove>
            </View>
          );
        })}

        {drafts.length ? <Text style={{ fontFamily: ud.fontBodyBold, color: ud.muted, fontSize: 12, letterSpacing: 1, marginTop: 24 }}>W SZKICACH (ZNIKNĄ PO WYSŁANIU)</Text> : null}
        {drafts.map(([draftId, list]) => (
          <View key={draftId} style={{ backgroundColor: ud.surface, borderRadius: ud.radiusCard, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#e6e3dc' }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {list.map((p, i) => <Thumb key={p.id} photo={p} on={false} onLongPress={() => zoom(list, i)} />)}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <View style={{ flex: 2 }}><UdButton title="Otwórz szkic" onPress={() => navigation.push('NewReport', { editId: draftId })} /></View>
              <View style={{ flex: 1 }}><UdButton title="Przywróć" variant="outline" pill onPress={() => restore(list.map((p) => p.id))} /></View>
            </View>
          </View>
        ))}
      </ScrollView>
      <UdTabs current="WaitingRoom" navigate={go} />
      <ImageViewer urls={viewerUrls} index={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}
