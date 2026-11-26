import { useCallback } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { applyPicked, fromIso, toIso } from '../lib/dateTime';
import { fmtLongDate } from '../lib/reports';
import { FIELD_HINT, FIELD_LABEL } from './FormField';
import { ud } from '../theme';

type Props = { value: string; onChange: (iso: string) => void; disabled?: boolean; fromPhoto?: boolean };

// Data i godzina zgłoszenia – jedno pole (jak przed przebudową i jak na webie), bez dzielenia na dwa wiersze.
// Android: dotknięcie otwiera natywne okno daty, po zatwierdzeniu okno godziny (anulowanie godziny zostawia już wybraną datę);
// iOS: kompaktowy picker „data + godzina” w jednym wierszu. Przyszłość jest zablokowana (max = teraz).
// `value` = „YYYY-MM-DDTHH:mm:ss” (czas lokalny) albo '' (pole zostaje puste – przy wysyłce formularz ustawia „teraz”);
// `onChange` dostaje tę samą postać. `fromPhoto` = data wzięta ze zdjęcia auta (dopisek pod etykietą).
export function DateTimeField({ value, onChange, disabled, fromPhoto }: Props) {
  const current = fromIso(value);

  const openAndroid = useCallback(() => {
    DateTimePickerAndroid.open({
      value: current ?? new Date(),
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

  const label = (
    <>
      <Text style={FIELD_LABEL}>Data i godzina</Text>
      {fromPhoto && current ? <Text style={FIELD_HINT}>Ze zdjęcia auta.</Text> : null}
    </>
  );

  if (Platform.OS === 'ios') {
    return (
      <View>
        {label}
        <View style={{ flexDirection: 'row', marginTop: 6 }}>
          <DateTimePicker
            value={current ?? new Date()}
            mode="datetime"
            display="compact"
            locale="pl-PL"
            maximumDate={new Date()}
            accentColor={ud.primary}
            disabled={disabled}
            accessibilityLabel="Data i godzina zgłoszenia"
            onValueChange={(_e, d) => onChange(toIso(d > new Date() ? new Date() : d))}
          />
        </View>
      </View>
    );
  }

  return (
    <View>
      {label}
      <Pressable onPress={openAndroid} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} accessibilityLabel="Zmień datę i godzinę zgłoszenia"
        style={{ marginTop: 6, backgroundColor: disabled ? ud.lockedBg : ud.surface, borderWidth: 1, borderColor: disabled ? ud.lockedBorder : ud.hairline, borderRadius: ud.radiusButton, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: disabled ? ud.muted : ud.text, fontFamily: ud.fontBodyBold, flexShrink: 1 }}>{current ? fmtLongDate(value) : ''}</Text>
        <Text style={{ color: disabled ? ud.muted : ud.primary, fontFamily: ud.fontBodyBold }}>{current ? 'Zmień' : 'Ustaw'}</Text>
      </Pressable>
    </View>
  );
}
