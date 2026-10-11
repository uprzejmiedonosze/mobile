import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { fetchProfile } from '../api/user';
import { UdButton, UdCard, UdHeader, UdTabs } from '../components/UD';
import { udConfig } from '../config';
import { openUdPage } from '../lib/openPage';
import { BENEFITS, ctaLabel, HEADING, INTRO, LETTERS_NOTICE, MORE_LINK, PATRONITE_URL, SUPPORT_HEADING, tierRows, TIERS_HEADING, TIERS_INTRO, usageLine } from '../lib/quotaInfo';
import { PATRONEM_DEFAULT } from '../lib/sex';
import { usePhotoQuota } from '../lib/usePhotoQuota';
import { ud } from '../theme';

const H = ({ children }: { children: string }) => (
  <Text accessibilityRole="header" style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 21, marginTop: 22, marginBottom: 6 }}>{children}</Text>
);
const P = ({ children }: { children: React.ReactNode }) => <Text style={{ color: ud.text, lineHeight: 22, marginTop: 8 }}>{children}</Text>;

// „Dlaczego aplikacja ma limity?” – pojawia się jako podpowiedź przy granicy limitu zdjęć (PhotoQuotaNotice) i z pulpitu.
// Tabela progów i zużycie przychodzą z backendu (`quota.tiers`); CTA prowadzi na Patronite.
export function QuotaInfoScreen({ navigation, route }: any) {
  const fromLetters = route?.params?.reason === 'letters';
  const go = (r: string) => navigation.navigate(r);
  const { quota, refresh } = usePhotoQuota();
  const [patron, setPatron] = useState(PATRONEM_DEFAULT);

  useEffect(() => {
    refresh();
    fetchProfile().then((p) => setPatron(p.patronem)).catch(() => {});
  }, [refresh]);

  const rows = tierRows(quota);
  const usage = usageLine(quota);

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader title="Limity" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {fromLetters ? (
          <View style={{ backgroundColor: ud.surface, borderWidth: 1, borderColor: ud.accent, borderRadius: ud.radiusCard, padding: 14, marginBottom: 16 }}>
            <Text style={{ color: ud.text, lineHeight: 21 }}>{LETTERS_NOTICE}</Text>
          </View>
        ) : null}
        <Text accessibilityRole="header" style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 26, lineHeight: 31 }}>{HEADING}</Text>
        {INTRO.map((t) => <P key={t}>{t}</P>)}
        <Text onPress={() => { Linking.openURL(`${udConfig.base}/app/new`).catch(() => {}); }} accessibilityRole="link"
          style={{ color: ud.primary, fontFamily: ud.fontBodyBold, textDecorationLine: 'underline', marginTop: 8 }}>
          Zgłaszaj bez limitu na stronie www
        </Text>

        <H>{TIERS_HEADING}</H>
        <P>{TIERS_INTRO}</P>
        <UdCard>
          {rows.map((r, i) => (
            <View key={r.key} accessibilityLabel={`${r.label}: ${r.limitText}${r.current ? ' (Twój obecny próg)' : ''}`}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 10, borderRadius: ud.radiusSm, backgroundColor: r.current ? ud.primaryContainer : 'transparent', borderTopWidth: i === 0 || r.current ? 0 : 1, borderTopColor: ud.hairline }}>
              <Text style={{ flex: 1, color: ud.text, fontFamily: r.current ? ud.fontBodyBold : ud.fontBody }}>
                {r.label}{r.current ? '  ← Ty' : ''}
              </Text>
              <Text style={{ color: ud.heading, fontFamily: ud.fontBodyBold }}>{r.limitText}</Text>
            </View>
          ))}
          <Text style={{ color: ud.muted, fontSize: 12, marginTop: 8 }}>
            Limit liczony w kroczącym oknie {quota?.windowDays ?? 30} dni, na podstawie miesięcznego wsparcia na Patronite.
          </Text>
        </UdCard>
        {usage ? <P>{usage}</P> : null}

        <H>{SUPPORT_HEADING}</H>
        <UdCard>
          {BENEFITS.map((b) => (
            <View key={b} style={{ flexDirection: 'row', gap: 8, marginVertical: 5 }}>
              <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold }}>•</Text>
              <Text style={{ flex: 1, color: ud.text, lineHeight: 21 }}>{b}</Text>
            </View>
          ))}
          {/* ostatni punkt boxa: strona Patronite w aplikacji (jedyne CTA ekranu to przycisk niżej – zewnętrzny Patronite) */}
          <View style={{ flexDirection: 'row', gap: 8, marginVertical: 5 }}>
            <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold }}>•</Text>
            <Text onPress={() => openUdPage(navigation, '/patronite.html', 'Wspieraj Uprzejmie Donoszę')} accessibilityRole="link"
              style={{ flex: 1, color: ud.primary, fontFamily: ud.fontBodyBold, textDecorationLine: 'underline', lineHeight: 21 }}>
              {MORE_LINK}
            </Text>
          </View>
        </UdCard>

        <View style={{ marginTop: 18 }}>
          <UdButton title={ctaLabel(quota, patron)} variant="accent" onPress={() => { Linking.openURL(PATRONITE_URL).catch(() => {}); }} />
        </View>
      </ScrollView>
      <UdTabs current="QuotaInfo" navigate={go} />
    </View>
  );
}
