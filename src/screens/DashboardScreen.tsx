import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { fetchDashboard, fmtInt, num, stripHtml, type DashBadge, type Dashboard } from '../api/dashboard';
import { udConfig } from '../config';
import { log } from '../lib/log';
import { openUdPage } from '../lib/openPage';
import { plural } from '../lib/reports';
import { UdButton, UdHeader, UdTabs } from '../components/UD';
import { ud } from '../theme';

const Eyebrow = ({ children }: { children: string }) => (
  <Text style={{ fontFamily: ud.fontBodyBold, color: ud.muted, fontSize: 12, letterSpacing: 1, marginBottom: 10 }}>{children.toUpperCase()}</Text>
);

const Section = ({ children }: React.PropsWithChildren) => <View style={{ marginTop: 22 }}>{children}</View>;

// Kafelek statystyki jak na www (.stat-card): biała karta z cienką ramką, duża liczba i opis; wyróżniony
// (kwota mandatów) = zielona karta na całą szerokość.
function Stat({ value, label, onPress, highlight }: { value: string; label: string; onPress?: () => void; highlight?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        width: highlight ? '100%' : '48.5%',
        backgroundColor: highlight ? ud.primary : ud.surface,
        borderRadius: 22,
        borderWidth: highlight ? 0 : 1,
        borderColor: '#e6e3dc',
        paddingHorizontal: 18,
        paddingVertical: 20,
        marginBottom: 12,
        minHeight: highlight ? undefined : 98, // kafelki w rzędzie mają równą wysokość
      }}
    >
      <Text style={{ fontFamily: ud.fontDisplay, color: highlight ? '#fff' : ud.heading, fontSize: 30 }}>{value}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: highlight ? ud.primaryOutline : ud.muted, fontSize: 13, marginTop: 4 }}>{label}</Text>
    </Pressable>
  );
}

function SupportCard({ title, text, url, external, onOpen }: { title: string; text: string; url: string; external?: boolean; onOpen: (url: string, title: string) => void }) {
  return (
    <Pressable onPress={() => onOpen(url, title)} style={{ paddingVertical: 8, marginBottom: 6 }}>
      <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 16 }}>{title} {external ? '↗' : '→'}</Text>
      <Text style={{ color: ud.muted, marginTop: 4 }}>{text}</Text>
    </Pressable>
  );
}

export function DashboardScreen({ navigation }: any) {
  const go = (r: string, params?: object) => navigation.navigate(r, params);
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      setD(await fetchDashboard());
    } catch (e: any) {
      const m = e?.message ?? String(e);
      setErr(m);
      log.error('pulpit', m);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const [badge, setBadge] = useState<DashBadge | null>(null);

  useEffect(() => { load(); }, [load]);

  const s = d?.stats ?? {};
  const myBadges = s.badges ?? [];
  const active = num(s.active), fined = num(s['confirmed-fined']), instructed = num(s['confirmed-instructed']);
  const patron = myBadges.includes('patron');
  // Karta liczy się jak link tylko gdy jest co otworzyć (jak {% if fined > 0 %} w app.html.twig).
  const list = (filter: string) => (): void => go('Reports', { filter });

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ud.primary} />}>
        {!d && !err ? <ActivityIndicator style={{ marginTop: 40 }} color={ud.primary} /> : null}
        {err ? <Text style={{ color: 'red' }}>{err}</Text> : null}
        {d ? (
          <>
            <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 26 }}>Cześć{d.name ? ` ${d.name}` : ''},</Text>
            <Text style={{ color: ud.text, marginTop: 6, lineHeight: 21 }}>{stripHtml(d.introMsg)}</Text>
            <View style={{ marginTop: 14 }}>
              <UdButton title="Nowe zgłoszenie" onPress={() => go('NewReport')} />
            </View>

            {d.rank ? (
              <Section>
                <Eyebrow>Twoja ranga</Eyebrow>
                <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 30, marginTop: 2 }}>{d.rank.desc}</Text>
                {/* pasek z segmentem na każdą rangę – bez etykiet, więc nic się nie łamie na wąskim ekranie */}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
                  {Array.from({ length: d.rank.total }, (_, k) => (
                    <View key={k} style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: k < d.rank.index ? ud.primary : ud.primaryOutline, opacity: k === d.rank.index - 1 ? 1 : k < d.rank.index ? 0.55 : 1 }} />
                  ))}
                </View>
                <Text style={{ color: ud.text, marginTop: 12, lineHeight: 21 }}>
                  {d.rank.next
                    ? `Do rangi „${d.rank.next.desc}” brakuje ${plural(d.rank.next.missing, ['punktów karnych', 'punktu karnego', 'punktów karnych'])}.`
                    : 'To najwyższa ranga – gratulacje!'}
                </Text>
              </Section>
            ) : null}

            <Section>
              <Eyebrow>Twoje statystyki</Eyebrow>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <Stat value={fmtInt(active)} label="Aktywne zgłoszenia" onPress={() => go('Reports')} />
                <Stat value={fmtInt(fined)} label="Mandaty" onPress={fined > 0 ? list('confirmed-fined') : undefined} />
                <Stat value={fmtInt(instructed)} label="Pouczenia" onPress={instructed > 0 ? list('confirmed-instructed') : undefined} />
                <Stat value={fmtInt(num(s.points))} label="Punkty karne" />
                <Stat value={`${fmtInt(num(s.mandates))} zł`} label="Kwota mandatów" highlight />
              </View>
            </Section>

            {d.badges.length ? (
              <Section>
                <Eyebrow>Twoje odznaki</Eyebrow>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                  {d.badges.map((b) => {
                    const on = b.earned;
                    return (
                      <Pressable key={b.id} onPress={() => setBadge(b)} accessibilityRole="button" accessibilityLabel={`${b.name}: opis odznaki`} style={{ width: 90, alignItems: 'center' }}>
                        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: ud.surface, alignItems: 'center', justifyContent: 'center', opacity: on ? 1 : 0.3 }}>
                          {b.img ? <Image source={{ uri: `${udConfig.base}/${b.img}` }} style={{ width: 48, height: 48 }} resizeMode="contain" /> : null}
                        </View>
                        <Text style={{ fontSize: 11, textAlign: 'center', marginTop: 4, color: on ? ud.text : ud.muted }}>{b.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Section>
            ) : null}

            <Section>
              <Text accessibilityRole="header" style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 22, marginBottom: 6 }}>Nie chcesz „donosić”?</Text>
              <Text style={{ color: ud.muted, marginBottom: 10 }}>Dowiedz się, co jeszcze możesz zrobić.</Text>
              <SupportCard onOpen={(u, t) => openUdPage(navigation, u, t)} title="Napisz pismo do polityka" text="W trzy minuty przełóż swoją frustrację w realne działanie." url="/napisz-pismo-do-polityka.html" />
              <SupportCard onOpen={(u, t) => openUdPage(navigation, u, t)} external title="Miejska Agenda Parkingowa" text="Poznaj zmiany w przepisach, po których Uprzejmie Donoszę nie będzie potrzebne." url="https://agendaparkingowa.pl/" />
              {patron ? (
                <SupportCard onOpen={(u, t) => openUdPage(navigation, u, t)} external title="Wniosek do RPO" text="Poprzyj mój wniosek do Rzecznika Praw Obywatelskich o równe prawa dla pieszych i kierowców." url="https://www.change.org/Rowne-Prawa-Dla-Pieszych-i-Kierowcow/" />
              ) : (
                <>
                  <SupportCard onOpen={(u, t) => openUdPage(navigation, u, t)} title="Patronite" text="Utrzymanie serwerów kosztuje. Zostań Patronką lub Patronem i pomóż nam działać stabilnie." url="/patronite.html" />
                  <SupportCard onOpen={(u, t) => openUdPage(navigation, u, t)} external title="Suppi" text="Nie chcesz subskrypcji? Postaw nam kawę jednorazową, niewielką wpłatą." url="https://suppi.pl/uprzejmiedonosze" />
                </>
              )}
            </Section>
          </>
        ) : null}
      </ScrollView>
      <UdTabs current="Dashboard" navigate={(r) => go(r)} />
      <Modal visible={!!badge} transparent animationType="fade" onRequestClose={() => setBadge(null)}>
        <Pressable onPress={() => setBadge(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {badge ? (
            <Pressable style={{ backgroundColor: ud.surface, borderRadius: ud.radiusCard, padding: 22, alignItems: 'center', width: '100%', maxWidth: 360 }}>
              {badge.img ? <Image source={{ uri: `${udConfig.base}/${badge.img}` }} style={{ width: 96, height: 96, opacity: badge.earned ? 1 : 0.35 }} resizeMode="contain" /> : null}
              <Text style={{ fontFamily: ud.fontBodyBold, fontSize: 16, color: ud.text, marginTop: 10, textAlign: 'center' }}>{badge.name}</Text>
              <Text style={{ color: ud.muted, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>{stripHtml(badge.desc)}</Text>
              <Text style={{ fontFamily: ud.fontBodyBold, fontSize: 12, color: badge.earned ? ud.text : ud.muted, marginTop: 10 }}>{badge.earned ? 'ZDOBYTA' : 'JESZCZE NIEZDOBYTA'}</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}
