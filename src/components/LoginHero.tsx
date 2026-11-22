import { useEffect } from 'react';
import { Image, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ud } from '../theme';

// Grafika na górze ekranu logowania (jak na stronie www): prawdziwe zdjęcie źle zaparkowanego auta od krawędzi do krawędzi
// (także pod paskiem statusu), na nim zielona plakietka „58 s – czas zgłoszenia” i karta wysłanego zgłoszenia. Dół zdjęcia
// gradientem przechodzi w tło ekranu, więc nagłówek „Zaloguj się” płynnie z niego wyrasta. Nakładki wjeżdżają sprężyną bez
// odbicia, jedna po drugiej; przy „Ogranicz ruch” są od razu na miejscu. Dla VoiceOver – jeden opis całej ilustracji.
const HERO = require('../../assets/login-hero.jpg');
const HERO_ASPECT = 900 / 677;

function useEnter(delay: number) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { if (!reduce) p.value = withDelay(delay, withSpring(1, { duration: 500, dampingRatio: 1 })); }, [p, reduce, delay]);
  return useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 12 }, { scale: 0.96 + 0.04 * p.value }] }));
}

export function LoginHero() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const badge = useEnter(150);
  const card = useEnter(300);
  // Wyższe niż zdjęcie 4:3, żeby pod paskiem statusu zostało miejsce na nakładki i gradient; zdjęcie przycina się do środka.
  const height = Math.round(Math.max(width / HERO_ASPECT, width * 0.95) + insets.top);
  const fade = Math.round(height * 0.38);
  const top = insets.top + 20;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Przykład: zgłoszenie auta zaparkowanego na chodniku, wysłane na policję w 58 sekund."
      style={{ width, height }}
    >
      <Image source={HERO} style={{ position: 'absolute', top: 0, left: 0, width, height }} resizeMode="cover" />

      {/* przejście zdjęcia w tło ekranu (ud.surfaceLow) – bez twardej krawędzi nad „Zaloguj się” */}
      <Svg pointerEvents="none" width={width} height={fade} style={{ position: 'absolute', left: 0, bottom: 0 }}>
        <Defs>
          <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ud.surfaceLow} stopOpacity={0} />
            <Stop offset="0.55" stopColor={ud.surfaceLow} stopOpacity={0.75} />
            <Stop offset="1" stopColor={ud.surfaceLow} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={fade} fill="url(#heroFade)" />
      </Svg>

      {/* czas zgłoszenia – zielona plakietka po lewej */}
      <Animated.View style={[{ position: 'absolute', top: top + 26, left: 16, backgroundColor: ud.primary, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }, badge]}>
        <Text style={{ color: '#fff', fontFamily: ud.fontDisplay, fontSize: 30, lineHeight: 34, letterSpacing: -0.5 }}>58 s</Text>
        <Text style={{ color: '#fff', fontSize: 13, marginTop: 2 }}>czas zgłoszenia</Text>
      </Animated.View>

      {/* karta zgłoszenia – prawy dolny róg zdjęcia (na gradiencie, nad „Zaloguj się”); plakietka „58 s” w lewym górnym – po przekątnej, auto zostaje widoczne */}
      <Animated.View style={[{ position: 'absolute', bottom: 44, right: 16, width: '54%', backgroundColor: ud.surface, borderRadius: 16, padding: 11, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }, card]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: ud.muted, fontFamily: ud.fontBodyBold, fontSize: 9, letterSpacing: 0.6 }}>NOWE ZGŁOSZENIE</Text>
          <View style={{ backgroundColor: ud.primaryContainer, borderRadius: ud.radiusPill, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: ud.primaryDark, fontFamily: ud.fontBodyBold, fontSize: 10 }}>Wysłane</Text>
          </View>
        </View>
        {/* tablica rejestracyjna z pasem PL */}
        <View style={{ flexDirection: 'row', alignSelf: 'flex-start', borderWidth: 1.5, borderColor: ud.heading, borderRadius: 5, overflow: 'hidden', marginTop: 8 }}>
          <View style={{ backgroundColor: '#1f3d99', paddingHorizontal: 4, justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold, fontSize: 8 }}>PL</Text>
          </View>
          <Text style={{ color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 14, letterSpacing: 1, paddingHorizontal: 6, paddingVertical: 1 }}>WE1CF48</Text>
        </View>
        <Text numberOfLines={1} style={{ color: ud.heading, fontFamily: ud.fontBodyBold, fontSize: 11, marginTop: 8 }}>Henryka Pobożnego 11, Szczecin</Text>
        <Text numberOfLines={1} style={{ color: ud.muted, fontSize: 10, marginTop: 3 }}>Pojazd jechał wzdłuż chodnika</Text>
        <Text numberOfLines={1} style={{ color: ud.muted, fontSize: 10, marginTop: 2 }}>
          Wysłano do <Text style={{ color: ud.heading, fontFamily: ud.fontBodyBold }}>KP Szczecin Niebuszewo</Text>
        </Text>
      </Animated.View>
    </View>
  );
}
