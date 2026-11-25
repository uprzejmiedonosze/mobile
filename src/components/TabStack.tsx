import { Platform } from 'react-native';
import { Slot, Stack } from 'expo-router';
import { ud } from '../theme';

// Układ jednej zakładki (Start, Nowe, Poczekalnia, Konto). Android: własny natywny stos, żeby ekran miał prawdziwy pasek aplikacji
// (Material top app bar z react-native-screens) – opcje paska ustawia LargeTitleScreen przez <Stack.Screen options>.
// iOS: bez stosu – nagłówek SwiftUI (NavigationStack) rysuje LargeTitleScreen w treści, więc dodatkowy natywny stos byłby zbędny.
export default function TabStack() {
  if (Platform.OS !== 'android') return <Slot />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ud.surfaceLow } }} />; // pasek włącza LargeTitleScreen
}
