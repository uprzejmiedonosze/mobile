import { Linking, Pressable, Text, View } from 'react-native';
import { udConfig } from '../config';
import type { PhotoQuota } from '../api/udApi';
import { isPatronTier, quotaNotice } from '../lib/quotaNotice';
import { ud } from '../theme';

const Link = ({ children, onPress, underline = true }: { children: string; onPress: () => void; underline?: boolean }) => (
  <Text onPress={onPress} accessibilityRole="link" style={{ color: ud.primary, textDecorationLine: underline ? 'underline' : 'none', fontFamily: ud.fontBodyBold }}>{children}</Text>
);

// Nad dodawaniem zdjęć: przy < 3 zdjęciach limitu – komunikat z opcjami, przy > 80% zużycia – krótkie „Potrzebujesz więcej zdjęć?”.
export function PhotoQuotaNotice({ quota, patronem, onMore }: { quota: PhotoQuota | null; patronem: string; onMore: () => void }) {
  const kind = quotaNotice(quota);
  if (!quota || !kind) return null;

  if (kind === 'more') {
    return (
      <Text style={{ color: ud.text, marginBottom: 12, lineHeight: 21 }}>
        <Link onPress={onMore} underline={false}>Potrzebujesz więcej zdjęć?</Link>
      </Text>
    );
  }

  const left = quota.remaining ?? 0;
  const web = () => { Linking.openURL(`${udConfig.base}/app/new`).catch(() => {}); };
  return (
    <View style={{ backgroundColor: ud.surface, borderWidth: 1, borderColor: ud.accent, borderRadius: ud.radiusCard, padding: 14, marginBottom: 14 }}>
      <Text style={{ color: ud.text, lineHeight: 21 }}>
        {left === 0 ? 'Skończył Ci się limit zdjęć, jakie możesz przetworzyć w tym miesiącu.' : `Kończy Ci się limit zdjęć, jakie możesz przetworzyć w tym miesiącu (zostało: ${left}).`}
        {' Chcesz donosić za darmo – skorzystaj z wersji '}<Link onPress={web}>www</Link>{'. Chcesz podnieść limit? '}<Link onPress={onMore}>Dlaczego są limity?</Link>
      </Text>
      <Pressable onPress={onMore} accessibilityRole="button" style={{ marginTop: 10 }}>
        <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold }}>
          {isPatronTier(quota) ? 'Podnieś swój próg wsparcia na Patronite' : `Zostań ${patronem} już od 10 zł miesięcznie`}
        </Text>
      </Pressable>
    </View>
  );
}
