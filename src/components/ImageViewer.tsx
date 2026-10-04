import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Modal, PanResponder, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ud } from '../theme';

// Powiększanie zdjęcia bez modułów natywnych (gesture-handler/reanimated nie ma w projekcie, a
// ScrollView.maximumZoomScale działa tylko na iOS): dwa palce = zoom, jeden palec = przesuwanie
// powiększonego zdjęcia, podwójne dotknięcie = przełącz 1× / 2,5×. Zdjęcie przechwytuje gest TYLKO przy
// zoomie (2 palce lub już powiększone) – w pozostałych przypadkach przesunięcie palcem przewija galerię (swipe).
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const dist = (a: any, b: any) => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

function ZoomableImage({ uri, fade, onDismiss }: { uri: string; fade: Animated.Value; onDismiss: () => void }) {
  const size = useRef({ w: 1, h: 1 });
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const st = useRef({ scale: 1, tx: 0, ty: 0, startScale: 1, startTx: 0, startTy: 0, startDist: 0, lastTap: 0, dismissing: false });

  const apply = (sc: number, x: number, y: number) => {
    const s = st.current;
    sc = Math.min(MAX_SCALE, Math.max(1, sc));
    // przesunięcie nie może wyjechać poza krawędź powiększonego zdjęcia
    const maxX = ((sc - 1) * size.current.w) / 2;
    const maxY = ((sc - 1) * size.current.h) / 2;
    s.scale = sc;
    s.tx = Math.min(maxX, Math.max(-maxX, x));
    s.ty = Math.min(maxY, Math.max(-maxY, y));
    scale.setValue(s.scale);
    tx.setValue(s.tx);
    ty.setValue(s.ty);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // przechwytujemy: zoom (2 palce), przesuwanie powiększonego zdjęcia oraz wyraźnie PIONOWY ruch
      // niepowiększonego zdjęcia (przeciągnięcie w dół/górę zamyka galerię); poziomy ruch zostaje dla przewijania galerii
      onMoveShouldSetPanResponder: (e, g) =>
        e.nativeEvent.touches.length >= 2 || st.current.scale > 1 || (Math.abs(g.dy) > 10 && Math.abs(g.dy) > 1.5 * Math.abs(g.dx)),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const s = st.current;
        s.startScale = s.scale; s.startTx = s.tx; s.startTy = s.ty; s.startDist = 0;
      },
      onPanResponderMove: (e, g) => {
        const s = st.current;
        const t = e.nativeEvent.touches;
        if (t.length >= 2) {
          const d = dist(t[0], t[1]);
          if (!s.startDist) { s.startDist = d; s.startScale = s.scale; s.startTx = s.tx; s.startTy = s.ty; }
          apply((s.startScale * d) / s.startDist, s.tx, s.ty);
        } else if (s.scale === 1) {
          // przeciąganie do zamknięcia: zdjęcie podąża za palcem, tło jaśnieje
          s.dismissing = true;
          ty.setValue(g.dy);
          fade.setValue(Math.min(1, Math.abs(g.dy) / 300));
        } else if (s.scale > 1) {
          if (s.startDist) { s.startDist = 0; s.startTx = s.tx; s.startTy = s.ty; return; } // po puszczeniu drugiego palca
          apply(s.scale, s.startTx + g.dx, s.startTy + g.dy);
        }
      },
      onPanResponderRelease: (_e, g) => {
        const s = st.current;
        if (s.dismissing) {
          s.dismissing = false;
          if (Math.abs(g.dy) > 120 || Math.abs(g.vy) > 1) { onDismiss(); return; }
          Animated.spring(ty, { toValue: 0, useNativeDriver: true }).start();
          Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: false }).start();
          return;
        }
        if (s.scale < 1.05) apply(1, 0, 0);
      },
    }),
  ).current;

  // Podwójne dotknięcie osobno (Pressable), żeby zwykłe tapnięcie i swipe nie kolidowały z gestem zoomu.
  const onTap = () => {
    const s = st.current;
    const now = Date.now();
    if (now - s.lastTap < 300) {
      if (s.scale > 1) apply(1, 0, 0); else apply(DOUBLE_TAP_SCALE, 0, 0);
      s.lastTap = 0;
    } else s.lastTap = now;
  };

  return (
    <View style={{ flex: 1 }} onLayout={(e) => { size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; }} {...pan.panHandlers}>
      <Pressable style={{ flex: 1 }} onPress={onTap}>
        <Animated.Image source={{ uri }} resizeMode="contain" style={{ flex: 1, transform: [{ translateX: tx }, { translateY: ty }, { scale }] }} />
      </Pressable>
    </View>
  );
}

export function ImageViewer({ urls, index, onClose }: { urls: string[]; index: number | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current; // 0 = czarne tło, 1 = prawie przezroczyste (przeciąganie do zamknięcia)
  const [i, setI] = useState(index ?? 0);
  useEffect(() => { if (index != null) { setI(index); fade.setValue(0); } }, [index, fade]); // licznik i tło przy ponownym otwarciu
  if (index == null) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: fade.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,1)', 'rgba(0,0,0,0.25)'] }) }}>
        {/* swipe w bok = następne/poprzednie zdjęcie (strony na całą szerokość) */}
        <FlatList
          data={urls}
          keyExtractor={(u) => u}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(index, urls.length - 1)}
          getItemLayout={(_d, k) => ({ length: width, offset: width * k, index: k })}
          onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => <View style={{ width, flex: 1 }}><ZoomableImage uri={item} fade={fade} onDismiss={onClose} /></View>}
        />
        <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold }}>{urls.length > 1 ? `${i + 1} / ${urls.length}` : ''}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 20 }}>✕</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}
