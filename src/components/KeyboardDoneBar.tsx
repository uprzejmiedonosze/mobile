import { InputAccessoryView, Keyboard, Platform, Pressable, Text, View } from 'react-native';
import { ud } from '../theme';

// Pasek nad klawiaturą z przyciskiem „Gotowe” (iOS, InputAccessoryView) – dla pól wielowierszowych, w których Return wstawia nową
// linię, więc bez niego nie da się schować klawiatury. Przycisk to kapsułka jak w pasku klawiatury Notatek; tło paska przezroczyste
// (klawiatura iOS 26 ma własne szkło). Pole podpina się przez `inputAccessoryViewID={id}`. Na Androidzie nic nie renderuje
// (klawiaturę chowa systemowy gest/przycisk wstecz).
export function KeyboardDoneBar({ id }: { id: string }) {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={id} backgroundColor="transparent">
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingVertical: 6 }}>
        <Pressable
          onPress={() => Keyboard.dismiss()}
          accessibilityRole="button"
          accessibilityLabel="Schowaj klawiaturę"
          hitSlop={8}
          style={({ pressed }) => ({
            minHeight: 36, paddingHorizontal: 18, borderRadius: ud.radiusPill, justifyContent: 'center', backgroundColor: ud.surface,
            shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, opacity: pressed ? 0.6 : 1,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
        >
          <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, fontSize: 16 }}>Gotowe</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}
