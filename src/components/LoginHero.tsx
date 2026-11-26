import { Image, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { UdLogo } from './UD';
import { ud } from '../theme';

// Zdjęcie na górze ekranu logowania, od krawędzi do krawędzi (także pod paskiem statusu) – to samo co na stronie www
// (uprzejmiedonosze: src/img/hero.jpg), wbudowane w appkę, więc działa też bez sieci. Dół gradientem przechodzi
// w tło ekranu, więc „Zaloguj się” z niego wyrasta. W lewym górnym rogu logo (sygnet i napis) na jasnej podkładce,
// żeby było czytelne na każdym fragmencie zdjęcia.
const HERO = require('../../assets/login-hero.jpg');
const HERO_ASPECT = 1200 / 903;

export function LoginHero() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Wyższe niż samo zdjęcie, żeby zostało miejsce na pasek statusu i gradient; zdjęcie przycina się do środka.
  const height = Math.round(Math.max(width / HERO_ASPECT, width * 0.95) + insets.top);
  const fade = Math.round(height * 0.38);

  return (
    <View style={{ width, height }}>
      <Image source={HERO} style={{ width, height }} resizeMode="cover" accessible accessibilityRole="image" accessibilityLabel="Furgonetka zaparkowana na chodniku" />
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
      <View accessible accessibilityRole="image" accessibilityLabel="Uprzejmie Donoszę"
        style={{ position: 'absolute', top: insets.top + 8, left: 16, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: ud.radiusButton, paddingHorizontal: 12, paddingVertical: 8 }}>
        <UdLogo height={28} />
      </View>
    </View>
  );
}
