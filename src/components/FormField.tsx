import { useId, useState } from 'react';
import { KeyboardDoneBar } from './KeyboardDoneBar';
import { Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';
import { ud, inputColors } from '../theme';

// Pole formularza wspólne dla appki (rejestracja, konto, nowe zgłoszenie) – zasady Apple: krótka etykieta nad polem,
// objaśnienie drobniej pod nim, błąd w miejscu objaśnienia (czerwona ramka), aktywne pole z zieloną ramką, co najmniej 48 pt
// wysokości i tekst 16 pt. Pole zablokowane (np. przed zdjęciem auta) ma wyszarzone tło.
export const FIELD_LABEL = { color: ud.text, fontFamily: ud.fontBodyBold, fontSize: 15 } as const;
export const FIELD_HINT = { color: ud.muted, fontSize: 13, lineHeight: 18, marginTop: 6 } as const;

type Props = {
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string | null;
  inputRef?: React.Ref<TextInput>;
  inputStyle?: StyleProp<TextStyle>;
  first?: boolean; // pierwsze pole w karcie – bez górnego odstępu
} & TextInputProps;

export function FormField({ label, optional, hint, error, inputRef, inputStyle, first, onBlur, onFocus, ...input }: Props) {
  const [focused, setFocused] = useState(false);
  // Pole wielowierszowe: Return to nowa linia, więc nad klawiaturą dokładamy „Gotowe” (iOS).
  const accessoryId = `done-${useId()}`;
  const locked = input.editable === false;
  const borderColor = error ? ud.plateVerified : focused ? ud.primary : ud.lockedBorder;
  return (
    <View style={{ marginTop: first ? 0 : 18 }}>
      <Text style={FIELD_LABEL}>
        {label}
        {optional ? <Text style={{ color: ud.muted, fontFamily: ud.fontBody }}> (opcjonalnie)</Text> : null}
      </Text>
      <TextInput
        ref={inputRef}
        {...inputColors}
        {...input}
        accessibilityLabel={label}
        inputAccessoryViewID={input.multiline ? accessoryId : input.inputAccessoryViewID}
        accessibilityHint={error ?? hint}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[
          {
            minHeight: 48, marginTop: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
            borderRadius: 12, borderWidth: focused || error ? 2 : 1, borderColor,
            backgroundColor: locked ? ud.lockedBg : ud.surface, color: locked ? ud.muted : ud.text,
          },
          input.multiline ? { minHeight: 96, textAlignVertical: 'top' } : null,
          inputStyle,
        ]}
      />
      {input.multiline ? <KeyboardDoneBar id={accessoryId} /> : null}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[FIELD_HINT, { color: ud.plateVerified }]}>{error}</Text>
      ) : hint ? (
        <Text style={FIELD_HINT}>{hint}</Text>
      ) : null}
    </View>
  );
}
