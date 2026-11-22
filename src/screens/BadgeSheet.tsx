import { Image, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { udConfig } from '../config';
import { param } from '../lib/routes';
import { UdButton } from '../components/UD';
import { ud } from '../theme';

// Opis odznaki z pulpitu w natywnym arkuszu (presentation: formSheet, wysokość dopasowana do treści, uchwyt do przeciągania):
// wysuwa się od dołu i zamyka gestem w dół – zamiast własnego okienka na środku ekranu. Dane przychodzą w parametrach trasy.
export function BadgeSheet() {
  const router = useRouter();
  const p = useLocalSearchParams<{ name?: string; desc?: string; img?: string; earned?: string }>();
  const name = param(p.name) ?? '';
  const desc = param(p.desc) ?? '';
  const img = param(p.img);
  const earned = param(p.earned) === '1';
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, alignItems: 'center' }}>
      {img ? <Image source={{ uri: `${udConfig.base}/${img}` }} style={{ width: 96, height: 96, opacity: earned ? 1 : 0.4 }} resizeMode="contain" accessibilityIgnoresInvertColors /> : null}
      <Text accessibilityRole="header" style={{ fontFamily: ud.fontDisplay, fontSize: 22, letterSpacing: -0.2, color: ud.heading, marginTop: 12, textAlign: 'center' }}>{name}</Text>
      <Text style={{ fontFamily: ud.fontBodyBold, fontSize: 12, letterSpacing: 0.4, color: earned ? ud.primary : ud.muted, marginTop: 6 }}>{earned ? 'ZDOBYTA' : 'JESZCZE NIEZDOBYTA'}</Text>
      {desc ? <Text style={{ color: ud.text, fontSize: 16, lineHeight: 22, marginTop: 12, textAlign: 'center' }}>{desc}</Text> : null}
      <View style={{ alignSelf: 'stretch', marginTop: 16 }}>
        <UdButton title="Gotowe" variant="outline" onPress={() => router.back()} />
      </View>
    </View>
  );
}
