import { useId } from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { ud, inputColors } from '../theme';

// Pole wielowierszowe z przyciskiem „Gotowe” nad klawiaturą (iOS): Return wstawia nową linię, więc bez niego nie da się
// schować klawiatury. Na Androidzie zwykłe pole (klawiaturę chowa systemowy przycisk / gest wstecz).
export function MultilineInput(props: TextInputProps) {
  const id = `done-${useId()}`;
  const ios = Platform.OS === 'ios';
  return (
    <>
      <TextInput {...inputColors} {...props} multiline inputAccessoryViewID={ios ? id : undefined} />
      {ios ? (
        <InputAccessoryView nativeID={id}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: ud.surface, borderTopWidth: 1, borderTopColor: ud.hairline, paddingHorizontal: 16 }}>
            <Pressable onPress={() => Keyboard.dismiss()} accessibilityRole="button" accessibilityLabel="Schowaj klawiaturę" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, fontSize: 16 }}>Gotowe</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </>
  );
}
