import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { href, joinIds } from '../lib/routes';
import { Alert, Animated, Image, PanResponder, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { reverseGeocode } from '../api/geo';
import { validIdToken } from '../api/udApi';
import { ImageViewer } from '../components/ImageViewer';
import { UdButton, UdCard } from '../components/UD';
import { LargeTitleScreen } from '../components/LargeTitleScreen';
import { SectionHeader } from '../components/FormBits';
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
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Zdjęcie z ${hhmm(photo.takenAtMs)}`} style={({ pressed }) => ({ flex: 1, maxWidth: '33%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', borderWidth: on ? 3 : 1, borderColor: on ? ud.primary : ud.hairline, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <Image source={{ uri: photo.uri }} resizeMethod="resize" style={{ flex: 1, opacity: on ? 1 : 0.35 }} />
      {on ? <View style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: ud.primary, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontFamily: ud.fontBodyBold, fontSize: 12 }}>✓</Text></View> : null}
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
  return <Text numberOfLines={2} style={{ color: address ? ud.text : ud.muted, fontSize: 15, lineHeight: 20, marginTop: 2 }}>{address ?? 'Szukam adresu…'}</Text>;
}

// Przesunięcie w lewo usuwa paczkę. Własny gest tylko dla ruchu wyraźnie poziomego: pionowy zostaje przewijaniu, a dotknięcie zdjęciu.
// Opór przy przeciąganiu w prawo (tam nic nie ma): im dalej, tym słabiej karta idzie za palcem – zamiast twardej blokady.
const rubberband = (over: number, dim: number, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

function SwipeToRemove({ onRemove, children }: { onRemove: (back: () => void) => void; children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const reduce = useRef(reduceMotion); reduce.current = reduceMotion;
  const x = useRef(new Animated.Value(0)).current;
  const latest = useRef({ onRemove, width });
  latest.current = { onRemove, width };
  const responder = useMemo(() => {
    // powrót sprężyną krytycznie tłumioną, z prędkością palca (bez szwu między gestem a animacją)
    const back = (vx = 0) => (reduce.current ? x.setValue(0) : Animated.spring(x, { toValue: 0, velocity: vx, bounciness: 0, speed: 14, useNativeDriver: true }).start());
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > 2 * Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => x.setValue(g.dx < 0 ? g.dx : rubberband(g.dx, latest.current.width)),
      onPanResponderRelease: (_, g) => {
        const { onRemove: remove, width: w } = latest.current;
        if (g.dx < -w * SWIPE_RATIO || (g.vx < SWIPE_FLING_VX && g.dx < -SWIPE_MIN_FLING_PX)) {
          // dalej w lewo z prędkością palca; po decyzji (alert) karta wraca albo znika razem z paczką
          if (reduce.current) { x.setValue(-w); remove(() => back()); }
          else Animated.spring(x, { toValue: -w, velocity: g.vx, bounciness: 0, speed: 20, useNativeDriver: true }).start(() => remove(() => back()));
        } else back(g.vx);
      },
      onPanResponderTerminate: () => back(),
    });
  }, [x]);
  return (
    <View style={{ marginTop: 8 }}>
      <Animated.View style={{ position: 'absolute', top: 8, left: 0, right: 0, bottom: 8, borderRadius: ud.radiusCard, backgroundColor: ud.plateVerified, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 20, opacity: x.interpolate({ inputRange: [-60, 0], outputRange: [1, 0], extrapolate: 'clamp' }) }}>
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
export function WaitingRoomScreen() {
  const router = useRouter();
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

  // Paczki pogrupowane po dniu – nagłówek sekcji jak na Starcie, z liczbą paczek.
  const days: { day: string; packs: Pack[] }[] = [];
  for (const pack of packs) {
    const day = dayLabel(pack.startMs);
    if (days[days.length - 1]?.day !== day) days.push({ day, packs: [] });
    days[days.length - 1].packs.push(pack);
  }
  const camera = () => router.push(href('WaitingCamera'));

  return (
    <LargeTitleScreen title="Poczekalnia" trailing={{ label: 'Zrób zdjęcia', systemImage: 'camera', onPress: camera }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        {!photos.length ? (
          // Pusty stan: co to jest i jedna akcja
          <UdCard>
            <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 20, letterSpacing: -0.2 }}>Zdjęcia na później</Text>
            <Text style={{ color: ud.text, fontSize: 15, lineHeight: 21, marginTop: 6 }}>Rób zdjęcia w aplikacji, a zgłoszenia przygotuj, kiedy będziesz mieć chwilę. Zdjęcia czekają tutaj, poza rolką aparatu.</Text>
            <Text style={{ color: ud.muted, fontSize: 13, lineHeight: 18, marginTop: 6 }}>Zostają tylko na tym telefonie – odinstalowanie aplikacji je usunie.</Text>
            <View style={{ marginTop: 10 }}><UdButton title="Zrób zdjęcia" onPress={camera} /></View>
          </UdCard>
        ) : packs.length ? (
          <Text style={{ color: ud.muted, fontSize: 13, lineHeight: 18, marginTop: 4, paddingHorizontal: 4 }}>Dotknij zdjęcia, żeby je pominąć, przytrzymaj, żeby powiększyć. Przesuń paczkę w lewo, żeby ją usunąć.</Text>
        ) : null}

        {days.map(({ day, packs: list }) => (
          <View key={day}>
            <SectionHeader aside={plural(list.length, ['paczek', 'paczka', 'paczki'])}>{day}</SectionHeader>
            {list.map((pack) => {
              const sel = chosen(pack);
              const gps = gpsLabel(sel.length ? sel : pack.photos);
              return (
                <SwipeToRemove key={pack.id} onRemove={(back) => confirmRemove(pack, back)}>
                  <UdCard>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 18, letterSpacing: -0.2 }}>{timeRange(pack.startMs, pack.endMs)}</Text>
                          <View style={{ backgroundColor: gps.color === ud.warning ? '#fdf3e1' : ud.surfaceLow, borderRadius: ud.radiusPill, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ color: gps.color === ud.warning ? '#8a5300' : ud.muted, fontSize: 12, fontFamily: ud.fontBodyBold }}>{gps.text}</Text>
                          </View>
                        </View>
                        <PackAddress photos={sel.length ? sel : pack.photos} />
                      </View>
                      <Pressable onPress={() => confirmRemove(pack)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Usuń zdjęcia z paczki"
                        style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, backgroundColor: ud.surfaceLow, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                        <Text style={{ color: ud.muted, fontSize: 14, fontFamily: ud.fontBodyBold }}>✕</Text>
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      {pack.photos.map((p, i) => <Thumb key={p.id} photo={p} on={!excluded.has(p.id)} onPress={() => toggle(p.id)} onLongPress={() => zoom(pack.photos, i)} />)}
                    </View>
                    <View style={{ marginTop: 8 }}>
                      <UdButton title={sel.length ? `Utwórz zgłoszenie · ${plural(sel.length, ['zdjęć', 'zdjęcie', 'zdjęcia'])}` : 'Wybierz zdjęcia'} disabled={!sel.length} onPress={() => router.push(href('EditReport', { waitingIds: joinIds(sel.map((p) => p.id)) }))} />
                    </View>
                  </UdCard>
                </SwipeToRemove>
              );
            })}
          </View>
        ))}

        {drafts.length ? <SectionHeader aside="znikną po wysłaniu">W szkicach</SectionHeader> : null}
        {drafts.map(([draftId, list]) => (
          <UdCard key={draftId}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {list.map((p, i) => <Thumb key={p.id} photo={p} on={false} onLongPress={() => zoom(list, i)} />)}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <View style={{ flex: 2 }}><UdButton title="Otwórz szkic" onPress={() => router.push(href('EditReport', { editId: draftId }))} /></View>
              <View style={{ flex: 1 }}><UdButton title="Przywróć" variant="outline" pill onPress={() => restore(list.map((p) => p.id))} /></View>
            </View>
          </UdCard>
        ))}
      </View>
      <ImageViewer urls={viewerUrls} index={viewer} onClose={() => setViewer(null)} />
    </LargeTitleScreen>
  );
}
