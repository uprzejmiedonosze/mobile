import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { udConfig } from '../config';
import { describeError } from '../lib/errorInfo';
import { ud } from '../theme';
import { UdButton } from './UD';

const ICONS = {
  server: (c: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  offline: (c: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16.1a5 5 0 0 1 7 0"/><path d="M12 20h.01"/><path d="M3 3l18 18"/></svg>`,
};

export const CONTACT_URL = () => `${udConfig.base}/kontakt.html`;

type Props = {
  error: unknown;
  onRetry?: () => void;
  onContact?: () => void; // domyślnie /kontakt.html w przeglądarce; ekrany z nawigacją mogą otworzyć wbudowaną stronę
};

// Pełnoekranowy (bez logo i ramki) komunikat o błędzie krytycznym (np. 500 z kluczowego endpointu): ikona, spokojny opis, kod do podania
// w zgłoszeniu, „Spróbuj ponownie” i link do formularza kontaktu. Używany też przez ErrorBoundary.
export function ErrorScreen({ error, onRetry, onContact }: Props) {
  const info = describeError(error);
  const icon = (info.kind === 'offline' ? ICONS.offline : ICONS.server)(ud.primary);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: ud.surfaceLow }}
      contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <View style={{ width: '100%', maxWidth: 420, alignItems: 'center' }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: ud.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
          <SvgXml xml={icon} width={42} height={42} />
        </View>
        <Text style={{ fontFamily: ud.fontDisplay, fontSize: 24, lineHeight: 30, color: ud.heading, marginTop: 22, textAlign: 'center' }}>{info.title}</Text>
        <Text style={{ fontFamily: ud.fontBody, fontSize: 15, lineHeight: 22, color: ud.text, marginTop: 10, textAlign: 'center' }}>{info.message}</Text>

        <View style={{ alignSelf: 'stretch', marginTop: 24, gap: 10 }}>
          {onRetry ? <UdButton title="Spróbuj ponownie" onPress={onRetry} /> : null}
          <UdButton title="Napisz do nas" variant="outline" onPress={onContact ?? (() => { Linking.openURL(CONTACT_URL()).catch(() => {}); })} />
        </View>

        {info.code ? (
          <Text style={{ fontFamily: ud.fontBody, fontSize: 12, color: ud.muted, marginTop: 18, textAlign: 'center' }}>
            Pisząc do nas, podaj kod: {info.code}
          </Text>
        ) : null}
        {__DEV__ && info.detail ? (
          <View style={{ alignSelf: 'stretch', marginTop: 16, padding: 10, borderRadius: ud.radiusSm, backgroundColor: ud.surfaceLow }}>
            <Text style={{ fontFamily: ud.fontBody, fontSize: 11, color: ud.plateVerified }}>DEV: {info.detail}</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
