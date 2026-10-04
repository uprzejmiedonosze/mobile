import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { fetchDashboard, fmtInt, num, stripHtml, type Dashboard } from '../api/dashboard';
import { udConfig } from '../config';
import { log } from '../lib/log';
import { UdButton, UdHeader, UdTabs } from '../components/UD';
import { ud } from '../theme';

const Eyebrow = ({ children }: { children: string }) => (
  <Text style={{ fontFamily: ud.fontBodyBold, color: ud.muted, fontSize: 12, letterSpacing: 1, marginBottom: 10 }}>{children.toUpperCase()}</Text>
);

const Section = ({ children }: React.PropsWithChildren) => <View style={{ marginTop: 22 }}>{children}</View>;

function Stat({ value, label, onPress, highlight }: { value: string; label: string; onPress?: () => void; highlight?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ width: '48%', paddingVertical: 8, marginBottom: 6 }}>
      <Text style={{ fontFamily: ud.fontDisplay, color: highlight || onPress ? ud.primary : ud.heading, fontSize: 28 }}>{value}</Text>
      <Text style={{ color: ud.muted, fontSize: 13, marginTop: 2 }}>{label}</Text>
    </Pressable>
  );
}

const open = (url: string) => Linking.openURL(/^https?:/.test(url) ? url : `${udConfig.base}${url}`).catch(() => {});

function SupportCard({ title, text, url, external }: { title: string; text: string; url: string; external?: boolean }) {
  return (
    <Pressable onPress={() => open(url)} style={{ paddingVertical: 8, marginBottom: 6 }}>
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

  useEffect(() => { load(); }, [load]);

  const s = d?.stats ?? {};
  const levels = d?.levels ?? [];
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

            {levels.length ? (
              <Section>
                <Eyebrow>Twoja ranga</Eyebrow>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  {levels.map((l, i) => {
                    const on = l.active;
                    return (
                      <View key={l.id} style={{ flex: 1, alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
                          <View style={{ flex: 1, height: 2, backgroundColor: i ? ud.primaryOutline : 'transparent' }} />
                          <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? ud.primary : ud.surface, borderWidth: 2, borderColor: on ? ud.primary : ud.primaryOutline }}>
                            <Text style={{ fontFamily: ud.fontBodyBold, fontSize: 12, color: on ? '#fff' : ud.muted }}>{i + 1}</Text>
                          </View>
                          <View style={{ flex: 1, height: 2, backgroundColor: i < levels.length - 1 ? ud.primaryOutline : 'transparent' }} />
                        </View>
                        <Text style={{ fontSize: 11, marginTop: 4, textAlign: 'center', color: on ? ud.primary : ud.muted, fontFamily: on ? ud.fontBodyBold : ud.fontBody }}>{l.desc}</Text>
                      </View>
                    );
                  })}
                </View>
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
                      <View key={b.id} style={{ width: 90, alignItems: 'center' }}>
                        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: ud.surface, alignItems: 'center', justifyContent: 'center', opacity: on ? 1 : 0.3 }}>
                          {b.img ? <Image source={{ uri: `${udConfig.base}/${b.img}` }} style={{ width: 48, height: 48 }} resizeMode="contain" /> : null}
                        </View>
                        <Text style={{ fontSize: 11, textAlign: 'center', marginTop: 4, color: on ? ud.text : ud.muted }}>{b.name}</Text>
                      </View>
                    );
                  })}
                </View>
              </Section>
            ) : null}

            <Section>
              <Eyebrow>Nie chcesz „donosić”?</Eyebrow>
              <Text style={{ color: ud.muted, marginBottom: 10 }}>Dowiedz się, co jeszcze możesz zrobić.</Text>
              <SupportCard title="Napisz pismo do polityka" text="W trzy minuty przełóż swoją frustrację w realne działanie." url="/napisz-pismo-do-polityka.html" />
              <SupportCard external title="Miejska Agenda Parkingowa" text="Poznaj zmiany w przepisach, po których Uprzejmie Donoszę nie będzie potrzebne." url="https://agendaparkingowa.pl/" />
              {patron ? (
                <SupportCard external title="Wniosek do RPO" text="Poprzyj mój wniosek do Rzecznika Praw Obywatelskich o równe prawa dla pieszych i kierowców." url="https://www.change.org/Rowne-Prawa-Dla-Pieszych-i-Kierowcow/" />
              ) : (
                <>
                  <SupportCard title="Patronite" text="Utrzymanie serwerów kosztuje. Zostań Patronką lub Patronem i pomóż nam działać stabilnie." url="/patronite.html" />
                  <SupportCard external title="Suppi" text="Nie chcesz subskrypcji? Postaw nam kawę jednorazową, niewielką wpłatą." url="https://suppi.pl/uprzejmiedonosze" />
                </>
              )}
            </Section>
          </>
        ) : null}
      </ScrollView>
      <UdTabs current="Dashboard" navigate={(r) => go(r)} />
    </View>
  );
}
