import { Stack } from 'expo-router';
import { ud } from '../../src/theme';

// Zalogowana część apki: zakładki (app/app/(tabs)) na spodzie stosu, a ekrany procesów wjeżdżają nad nie (bez paska zakładek,
// z UdHeader i strzałką wstecz). initialRouteName: deep link prosto do /app/confirm itd. ma pod spodem zakładki.
export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ud.surfaceLow } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="edit" />
      <Stack.Screen name="confirm" />
      <Stack.Screen name="done" />
      <Stack.Screen name="letter" />
      <Stack.Screen name="quota" />
      <Stack.Screen name="camera" options={{ animation: 'fade' }} />
      {/* szczegóły zgłoszenia z listy: natywny arkusz – najpierw do ~¾ ekranu, przeciągnięty w górę na cały ekran */}
      <Stack.Screen
        name="report"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.75, 1],
          sheetGrabberVisible: true,
          sheetCornerRadius: 28,
          contentStyle: { backgroundColor: ud.surfaceLow },
        }}
      />
      {/* opis odznaki z pulpitu: natywny arkusz od dołu, wysokość wg treści, zamykany gestem */}
      <Stack.Screen
        name="badge"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          sheetCornerRadius: 28,
          contentStyle: { backgroundColor: ud.surface },
        }}
      />
    </Stack>
  );
}
