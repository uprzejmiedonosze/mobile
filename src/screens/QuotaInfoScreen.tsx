import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import { fetchProfile } from '../api/user';
import { UdButton, UdCard } from '../components/UD';
import { LargeTitleScreen } from '../components/LargeTitleScreen';
import { ActionRow, Callout, SectionHeader } from '../components/FormBits';
import { udConfig } from '../config';
import { openUdPage } from '../lib/openPage';
import { BENEFITS, ctaLabel, HEADING, INTRO, LETTERS_NOTICE, MORE_LINK, PATRONITE_URL, SUPPORT_HEADING, tierRows, TIERS_HEADING, TIERS_INTRO, usageLine } from '../lib/quotaInfo';
import { PATRONEM_DEFAULT } from '../lib/sex';
import { usePhotoQuota } from '../lib/usePhotoQuota';
import { ud } from '../theme';

// „Limity” – pojawia się przy granicy limitu zdjęć (PhotoQuotaNotice), z pulpitu i przy skanowaniu pism bez odznaki.
// Układ jak reszta appki: natywny duży tytuł, najpierw twój stan (zużycie), potem sekcje w kartach – dlaczego limity, progi
// (twój wyróżniony), co daje wsparcie; główna akcja (Patronite) przyklejona u dołu. Treści i progi: lib/quotaInfo + backend.
export function QuotaInfoScreen() {
  const router = useRouter();
  const fromLetters = useLocalSearchParams<{ reason?: string }>().reason === 'letters';
  const { quota, refresh } = usePhotoQuota();
  const [patron, setPatron] = useState(PATRONEM_DEFAULT);

  useEffect(() => {
    refresh();
    fetchProfile().then((p) => setPatron(p.patronem)).catch(() => {});
  }, [refresh]);

  const rows = tierRows(quota);
  const usage = usageLine(quota);
  const pct = quota && quota.limit ? Math.min(100, (quota.used / quota.limit) * 100) : null;

  return (
    <LargeTitleScreen
      title="Limity"
      leading={{ label: 'Wróć', systemImage: 'chevron.left', onPress: () => router.back() }}
      footer={<UdButton title={ctaLabel(quota, patron)} variant="accent" onPress={() => { Linking.openURL(PATRONITE_URL).catch(() => {}); }} />}
    >
      <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        {fromLetters ? <Callout tone="warning">{LETTERS_NOTICE.replace(/\s*Dlaczego\?$/, '')}</Callout> : null}

        {/* Twój stan – to, po co tu przyszedłeś – na samej górze */}
        {quota ? (
          <>
            <SectionHeader>Twój limit</SectionHeader>
            <UdCard>
              <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 28, letterSpacing: -0.3 }}>
                {quota.limit === null ? `${quota.used} · bez limitu` : `${quota.used} / ${quota.limit}`}
              </Text>
              {pct != null ? (
                <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: quota.limit ?? 0, now: quota.used }} style={{ height: 8, borderRadius: 4, backgroundColor: ud.primaryOutline, marginTop: 12, overflow: 'hidden' }}>
                  <View style={{ width: `${pct}%`, height: 8, backgroundColor: quota.remaining === 0 ? ud.warning : ud.primary }} />
                </View>
              ) : null}
              {usage ? <Text style={{ color: ud.muted, fontSize: 14, lineHeight: 20, marginTop: 10 }}>{usage}</Text> : null}
            </UdCard>
          </>
        ) : null}

        <SectionHeader>{HEADING.replace(/\?$/, '')}</SectionHeader>
        <UdCard>
          {INTRO.map((t, i) => <Text key={t} style={{ color: ud.text, fontSize: 16, lineHeight: 23, marginTop: i ? 10 : 0 }}>{t}</Text>)}
          <View style={{ marginTop: 6 }}>
            <ActionRow title="Zgłaszaj bez limitu na stronie www" tone="primary" trailing="↗" onPress={() => { Linking.openURL(`${udConfig.base}/app/new`).catch(() => {}); }} last />
          </View>
        </UdCard>

        <SectionHeader>{TIERS_HEADING}</SectionHeader>
        <UdCard>
          <Text style={{ color: ud.muted, fontSize: 14, lineHeight: 20, marginBottom: 6 }}>{TIERS_INTRO}</Text>
          {rows.map((r, i) => (
            <View key={r.key} accessibilityLabel={`${r.label}: ${r.limitText}${r.current ? ' (twój obecny próg)' : ''}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 10, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: ud.hairline }}>
              <Text style={{ flexShrink: 1, color: ud.text, fontSize: 16, fontFamily: r.current ? ud.fontBodyBold : ud.fontBody }}>{r.label}</Text>
              {r.current ? (
                <View style={{ backgroundColor: ud.primary, borderRadius: ud.radiusPill, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold, fontSize: 12 }}>Twój próg</Text>
                </View>
              ) : null}
              <Text style={{ marginLeft: 'auto', color: r.current ? ud.primary : ud.heading, fontFamily: ud.fontBodyBold, fontSize: 16 }}>{r.limitText}</Text>
            </View>
          ))}
          <Text style={{ color: ud.muted, fontSize: 13, lineHeight: 18, marginTop: 8 }}>
            Limit liczony w kroczącym oknie {quota?.windowDays ?? 30} dni, na podstawie miesięcznego wsparcia na Patronite.
          </Text>
        </UdCard>

        <SectionHeader>Co daje wsparcie</SectionHeader>
        <UdCard>
          <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading, fontSize: 16, marginBottom: 4 }}>{SUPPORT_HEADING}</Text>
          {BENEFITS.map((b) => (
            <View key={b} style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, fontSize: 16, lineHeight: 22 }}>✓</Text>
              <Text style={{ flex: 1, color: ud.text, fontSize: 15, lineHeight: 22 }}>{b}</Text>
            </View>
          ))}
          <View style={{ marginTop: 6 }}>
            <ActionRow title={MORE_LINK} tone="primary" trailing="›" onPress={() => openUdPage(router, '/patronite.html', 'Wspieraj Uprzejmie Donoszę')} last />
          </View>
        </UdCard>
      </View>
    </LargeTitleScreen>
  );
}
