import { useCallback } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { applyPicked, fromIso, toIso } from '../lib/dateTime';
import { fmtLongDate } from '../lib/reports';
import { ud } from '../theme';

type Props = { value: string; onChange: (iso: string) => void; disabled?: boolean };

// Data i godzina zgłoszenia przez systemowy picker. Android: natywne okno daty, po zatwierdzeniu okno godziny (anulowanie godziny zostawia
// już wybraną datę); iOS: kompaktowy picker „data + godzina” w jednym wierszu. Przyszłość jest zablokowana (max = teraz).
// `value` = „YYYY-MM-DDTHH:mm:ss” (czas lokalny) albo '' (pole zostaje puste – bez podpowiedzi; przy wysyłce formularz ustawia „teraz”);
// `onChange` dostaje tę samą postać.
export function DateTimeField({ value, onChange, disabled }: Props) {
  const current = fromIso(value);

  const openAndroid = useCallback(() => {
    const start = current ?? new Date();
    DateTimePickerAndroid.open({
      value: start,
      mode: 'date',
      maximumDate: new Date(),
      onValueChange: (_e, picked) => {
        const withDate = applyPicked(value, picked, 'date');
        onChange(withDate);
        DateTimePickerAndroid.open({
          value: fromIso(withDate) ?? new Date(),
          mode: 'time',
          is24Hour: true,
          onValueChange: (_e2, time) => onChange(applyPicked(withDate, time, 'time')),
        });
      },
    });
  }, [current, onChange, value]);

  if (Platform.OS === 'ios') {
    return (
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        <DateTimePicker
          value={current ?? new Date()}
          mode="datetime"
          display="compact"
          locale="pl-PL"
          maximumDate={new Date()}
          accentColor={ud.primary}
          disabled={disabled}
          onValueChange={(_e, d) => onChange(toIso(d > new Date() ? new Date() : d))}
        />
      </View>
    );
  }

  return (
    <Pressable onPress={openAndroid} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} accessibilityLabel="Zmień datę i godzinę zgłoszenia"
      style={{ marginTop: 6, backgroundColor: disabled ? ud.lockedBg : ud.surface, borderWidth: 1, borderColor: disabled ? ud.lockedBorder : ud.hairline, borderRadius: ud.radiusButton, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: disabled ? ud.muted : ud.text, fontFamily: ud.fontBodyBold, flexShrink: 1 }}>{current ? fmtLongDate(value) : ''}</Text>
      <Text style={{ color: disabled ? ud.muted : ud.primary, fontFamily: ud.fontBodyBold }}>{current ? 'Zmień' : 'Ustaw'}</Text>
    </Pressable>
  );
}
