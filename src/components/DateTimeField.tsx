import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { SvgXml } from 'react-native-svg';
import { applyPicked, fromIso } from '../lib/dateTime';
import { ud } from '../theme';

type Props = { value: string; onChange: (iso: string) => void; disabled?: boolean; fromPhoto?: boolean };

// Ikony (Material Symbols, Apache 2.0) – kalendarz i zegar; COLOR podmieniany na kolor wiersza.
const CALENDAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR"><path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13zM6 10h5v5H6z"/></svg>';
const CLOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>';

const fmtDate = (d: Date) => d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

// Data i godzina zgłoszenia jak w Ustawieniach/Kalendarzu iOS: dwa wiersze z ikoną, etykietą i wartością po prawej.
// iOS: systemowe kompaktowe pickery (osobno data i godzina); Android: dotknięcie wiersza otwiera systemowe okno daty albo godziny.
// Przyszłość jest zablokowana (max = teraz, applyPicked przycina). `value` = „YYYY-MM-DDTHH:mm:ss” (czas lokalny) albo ''
// (puste – przy wysyłce formularz ustawia „teraz”); `onChange` dostaje tę samą postać. `fromPhoto` = data wzięta ze zdjęcia auta.
export function DateTimeField({ value, onChange, disabled, fromPhoto }: Props) {
  const current = fromIso(value);
  const shown = current ?? new Date();

  const openAndroid = (part: 'date' | 'time') => DateTimePickerAndroid.open({
    value: shown,
    mode: part,
    is24Hour: true,
    ...(part === 'date' ? { maximumDate: new Date() } : {}),
    onValueChange: (_e, picked) => onChange(applyPicked(value, picked, part)),
  });

  const row = (part: 'date' | 'time', last?: boolean) => {
    const label = part === 'date' ? 'Data' : 'Godzina';
    const sub = part === 'date' && fromPhoto && current ? 'ze zdjęcia auta' : undefined;
    const iconColor = disabled ? ud.muted : ud.primary;
    const content = (
      <>
        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: disabled ? ud.lockedBg : ud.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
          <SvgXml xml={(part === 'date' ? CALENDAR : CLOCK).replace('COLOR', iconColor)} width={18} height={18} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: disabled ? ud.muted : ud.text, fontSize: 16 }}>{label}</Text>
          {sub ? <Text style={{ color: ud.muted, fontSize: 12, marginTop: 1 }}>{sub}</Text> : null}
        </View>
        {Platform.OS === 'ios' ? (
          <DateTimePicker
            value={shown}
            mode={part}
            display="compact"
            locale="pl-PL"
            maximumDate={part === 'date' ? new Date() : undefined}
            accentColor={ud.primary}
            disabled={disabled}
            accessibilityLabel={label}
            onValueChange={(_e, d) => onChange(applyPicked(value, d, part))}
          />
        ) : (
          <View style={{ backgroundColor: disabled ? ud.lockedBg : ud.surfaceLow, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Text style={{ color: disabled ? ud.muted : current ? ud.text : ud.muted, fontSize: 15 }}>
              {current ? (part === 'date' ? fmtDate(current) : fmtTime(current)) : 'Ustaw'}
            </Text>
          </View>
        )}
      </>
    );
    const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 52, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: ud.hairline };
    return Platform.OS === 'ios' ? (
      <View key={part} style={style}>{content}</View>
    ) : (
      <Pressable key={part} onPress={() => openAndroid(part)} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}: ${current ? (part === 'date' ? fmtDate(current) : fmtTime(current)) : 'nie ustawiono'}`}
        android_ripple={{ color: 'rgba(13, 122, 85, 0.15)' }} style={style}>
        {content}
      </Pressable>
    );
  };

  return <View>{row('date')}{row('time', true)}</View>;
}

