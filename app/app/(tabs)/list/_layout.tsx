import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { ud } from '../../../../src/theme';

// Zakładka Zgłoszenia ma własny natywny stos, bo to długa lista (FlatList z doładowywaniem i polami do edycji): natywny duży tytuł
// zwijany przy przewijaniu i systemowy pasek wyszukiwania (headerSearchBarOptions w ReportsScreen) – jak Poczta czy Notatki.
// Na iOS nagłówek bez własnych kolorów: treść przewija się pod paskiem, a iOS 26 kładzie na nim swój efekt krawędzi (liquid glass).
export default function ListLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: ud.surfaceLow },
        headerTransparent: Platform.OS === 'ios',
        headerShadowVisible: false,
        headerLargeTitleEnabled: true,
        headerLargeTitleShadowVisible: false,
        headerLargeStyle: { backgroundColor: 'transparent' },
        headerStyle: Platform.OS === 'ios' ? undefined : { backgroundColor: ud.surfaceLow },
        headerTintColor: ud.primary,
        // Android: jak pasek pozostałych zakładek (LargeTitleScreen) – Bricolage 22, wyrównany do lewej. iOS: systemowy krój jak w SwiftUI.
        headerTitleStyle: Platform.OS === 'ios' ? { color: ud.heading } : { color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 22 },
        headerTitleAlign: 'left',
        headerLargeTitleStyle: { color: ud.heading },
        scrollEdgeEffects: { top: 'soft' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Zgłoszenia' }} />
    </Stack>
  );
}
