import { Pressable, Switch, Text, View } from 'react-native';
import { HtmlText } from './HtmlText';
import { ud, ripple, switchColors } from '../theme';

// Drobne klocki formularzy w stylu list iOS (zasady Apple: grupowanie w kartach z nagłówkiem nad kartą, wiersze ≥ 44 pt,
// zaznaczenie znaczkiem ✓ jak w Ustawieniach, ostrzeżenia jako wyraźny komunikat zamiast emoji w zwykłym tekście).

// Nagłówek sekcji nad kartą – drobny, wersalikami (jak w listach iOS), opcjonalnie z dopiskiem po prawej.
export const SectionHeader = ({ children, aside }: { children: string; aside?: string }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 24, marginBottom: 2, paddingHorizontal: 4 }}>
    <Text accessibilityRole="header" style={{ fontFamily: ud.fontBodyBold, color: ud.muted, fontSize: 13, letterSpacing: 0.4 }}>{children.toUpperCase()}</Text>
    {aside ? <Text style={{ color: ud.muted, fontSize: 13 }}>{aside}</Text> : null}
  </View>
);

// Wiersz wyboru w karcie: tytuł, opcjonalny opis (HTML z sm.json), ✓ gdy zaznaczony. `multi` = pole wielokrotnego wyboru.
export function ChoiceRow({ title, hint, on, onPress, disabled, multi, last }: {
  title: string; hint?: string; on: boolean; onPress: () => void; disabled?: boolean; multi?: boolean; last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: on, disabled }}
      android_ripple={ripple}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: ud.hairline, opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: on ? ud.primary : ud.text, fontFamily: on ? ud.fontBodyBold : ud.fontBody, fontSize: 15 }}>{title}</Text>
        {hint ? <HtmlText html={hint} style={{ color: ud.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }} /> : null}
      </View>
      {multi ? (
        <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: on ? ud.primary : ud.lockedBorder, backgroundColor: on ? ud.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {on ? <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold, fontSize: 14, lineHeight: 16 }}>✓</Text> : null}
        </View>
      ) : (
        <Text style={{ width: 24, textAlign: 'center', color: ud.primary, fontFamily: ud.fontBodyBold, fontSize: 18 }}>{on ? '✓' : ''}</Text>
      )}
    </Pressable>
  );
}

// Wiersz z przełącznikiem (jak w Ustawieniach iOS).
export function SwitchRow({ title, hint, value, onChange, last }: { title: string; hint?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: ud.hairline }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: ud.text, fontSize: 15 }}>{title}</Text>
        {hint ? <Text style={{ color: ud.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Switch {...switchColors} value={value} onValueChange={onChange} accessibilityLabel={title} />
    </View>
  );
}

// Komunikat w formularzu: ostrzeżenie (duplikat, masa pojazdu) albo informacja (recydywa, brak lokalizacji).
export function Callout({ tone = 'info', children, onPress }: { tone?: 'info' | 'warning' | 'error'; children: React.ReactNode; onPress?: () => void }) {
  const c = tone === 'warning' ? { bg: '#fdf3e1', fg: '#8a5300', mark: '!' } : tone === 'error' ? { bg: '#fdecec', fg: ud.plateVerified, mark: '!' } : { bg: ud.primaryContainer, fg: ud.primaryDark, mark: 'i' };
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'alert'}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: c.bg, borderRadius: 12, padding: 12, marginTop: 10, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.fg, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold, fontSize: 12, lineHeight: 14 }}>{c.mark}</Text>
      </View>
      <Text style={{ flex: 1, color: c.fg, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </Pressable>
  );
}

// Wiersz-przycisk w karcie (jak w Ustawieniach iOS): zwykły, główny (zielony) albo niszczący (czerwony, np. „Wyloguj”, „Usuń”).
export function ActionRow({ title, subtitle, onPress, tone = 'default', center, disabled, last, trailing }: {
  title: string; subtitle?: string; onPress: () => void; tone?: 'default' | 'primary' | 'destructive'; center?: boolean; disabled?: boolean; last?: boolean; trailing?: string;
}) {
  const color = tone === 'destructive' ? ud.plateVerified : tone === 'primary' ? ud.primary : ud.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      android_ripple={ripple}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: center ? 'center' : 'space-between', gap: 12, minHeight: 48, paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: ud.hairline, opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flexShrink: 1, alignItems: center ? 'center' : 'flex-start' }}>
        <Text style={{ color, fontFamily: tone === 'default' ? ud.fontBody : ud.fontBodyBold, fontSize: 16 }}>{title}</Text>
        {subtitle ? <Text style={{ color: ud.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {trailing ? <Text style={{ color: tone === 'destructive' ? ud.plateVerified : ud.primary, fontFamily: ud.fontBodyBold, fontSize: 15 }}>{trailing}</Text> : null}
    </Pressable>
  );
}

// Wiersz informacyjny: etykieta po lewej, wartość po prawej (wersja, środowisko).
export function InfoRow({ title, value, last }: { title: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: ud.hairline }}>
      <Text style={{ color: ud.text, fontSize: 15 }}>{title}</Text>
      <Text selectable numberOfLines={1} ellipsizeMode="middle" style={{ flexShrink: 1, color: ud.muted, fontSize: 15 }}>{value}</Text>
    </View>
  );
}
