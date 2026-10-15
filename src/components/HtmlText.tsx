import { Linking, Text, type TextStyle } from 'react-native';
import { htmlSegments } from '../lib/html';
import { ud } from '../theme';

// Fragment HTML z backendu jako tekst z klikalnymi linkami. Linki względne (/przepisy.html…) obsługuje `onPageLink`
// (np. openUdPage → ekran WebPage), pozostałe (mailto:, https:) otwiera system.
export function HtmlText({ html, style, onPageLink }: { html?: string | null; style?: TextStyle; onPageLink?: (path: string) => void }) {
  const open = (href: string) => {
    if (href.startsWith('/') && onPageLink) onPageLink(href);
    else Linking.openURL(href).catch(() => {});
  };
  return (
    <Text style={style}>
      {htmlSegments(html).map((seg, i) => seg.href
        ? <Text key={i} onPress={() => open(seg.href!)} style={{ color: ud.primary, textDecorationLine: 'underline' }}>{seg.text}</Text>
        : seg.text)}
    </Text>
  );
}
