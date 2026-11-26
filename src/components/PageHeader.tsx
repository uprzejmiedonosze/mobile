import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ud } from '../theme';

// Nagłówek zakładek: tytuł tuż pod paskiem statusu, systemowym krojem (iOS i Android). Systemowy duży tytuł iOS zostawiał
// nad sobą pusty pasek, którego wysokości nie da się zmniejszyć. Pod tytułem opcjonalna zawartość (wyszukiwarka w Zgłoszeniach).
export function PageHeader({ title, children }: { title?: string; children?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: ud.surfaceLow, paddingTop: insets.top + 4, paddingHorizontal: 16, paddingBottom: 8 }}>
      <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit style={{ color: ud.heading, fontSize: 34, lineHeight: 41, fontWeight: '700' }}>{title}</Text>
      {children}
    </View>
  );
}
