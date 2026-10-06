import { Linking, Pressable, Text, View } from 'react-native';
import { UdLogo } from '../components/UD';
import { useAppUpdate } from '../store/useAppUpdate';
import { appVersion } from '../lib/appVersion';
import { ud } from '../theme';

// Ekran blokujący: renderowany przez App.tsx zamiast całej nawigacji, gdy serwer wymaga nowszej wersji.
export function UpdateRequiredScreen() {
  const storeUrl = useAppUpdate((s) => s.storeUrl);
  const message = useAppUpdate((s) => s.message);
  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <UdLogo height={32} />
      <Text style={{ fontFamily: ud.fontDisplay, fontSize: 24, color: ud.heading, marginTop: 24, textAlign: 'center' }}>
        Wymagana aktualizacja
      </Text>
      <Text style={{ fontFamily: ud.fontBody, fontSize: 15, color: ud.text, marginTop: 12, textAlign: 'center' }}>{message}</Text>
      {storeUrl ? (
        <Pressable
          onPress={() => Linking.openURL(storeUrl)}
          accessibilityRole="button"
          accessibilityLabel="Zaktualizuj aplikację w sklepie"
          style={{ backgroundColor: ud.primary, borderRadius: ud.radiusButton, paddingVertical: 14, paddingHorizontal: 28, marginTop: 28 }}
        >
          <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold, fontSize: 16 }}>Zaktualizuj</Text>
        </Pressable>
      ) : null}
      <Text style={{ fontFamily: ud.fontBody, fontSize: 12, color: ud.muted, marginTop: 24 }}>Wersja {appVersion}</Text>
    </View>
  );
}
