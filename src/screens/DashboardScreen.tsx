import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { href, type RouteName } from '../lib/routes';
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from 'react-native';
import { fetchDashboard, fmtInt, num, stripHtml, type Dashboard } from '../api/dashboard';
import { udConfig } from '../config';
import { log } from '../lib/log';
import { cachedDashboard, saveDashboard } from '../lib/startupCache';
import { externalUrl, openUdPage } from '../lib/openPage';
import { patronem } from '../lib/sex';
import { plural } from '../lib/reports';
import type { PhotoQuota } from '../api/udApi';
import { ErrorScreen } from '../components/ErrorScreen';
import { UdButton, UdCard, UdLogo } from '../components/UD';
import { LargeTitleScreen } from '../components/LargeTitleScreen';
import { SectionHeader } from '../components/FormBits';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../store/useAuth';
import { useWaitingRoom, waitingRoomEnabled } from '../store/useWaitingRoom';
import { ripple, rippleOnDark, ud } from '../theme';

// Pulpit według zasad Apple: duży natywny tytuł z powitaniem (LargeTitleScreen), najpierw główna akcja, potem sekcje w kartach
// od najważniejszych (statystyki → ranga → limit zdjęć → odznaki → wsparcie). Nagłówek sekcji jak w listach iOS: drobny, nad kartą.
// Co da się kliknąć, ma strzałkę i reaguje na dotyk – kafelek bez akcji wygląda inaczej niż kafelek-link.

const Chevron = ({ color = ud.muted, external }: { color?: string; external?: boolean }) => (
  <Text style={{ color, fontSize: external ? 15 : 22, lineHeight: 22, marginLeft: 8 }} accessibilityElementsHidden importantForAccessibility="no">{external ? '↗' : '›'}</Text>
);

// Zużycie limitu unikalnych przetworzonych zdjęć (okno kroczące); patroni mają wyższe progi, 50 zł = bez limitu.
function PhotoQuotaCard({ q, patronem, onMore }: { q: PhotoQuota; patronem: string; onMore: () => void }) {
  const left = q.remaining;
  // Zachęta do patronatu po przekroczeniu 50% limitu – tylko bez patronatu (patroni od 10 zł już mają wyższy próg).
  const upsell = q.limit !== null && q.used > q.limit / 2 && (q.tier === 'free' || q.tier === 'patron-below-min');
  const resets = q.resetsAt ? new Date(q.resetsAt * 1000).toLocaleDateString('pl-PL') : null;
  return (
    <UdCard>
      <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 28, letterSpacing: -0.3 }}>
        {q.limit === null ? `${fmtInt(q.used)} · bez limitu` : `${fmtInt(q.used)} / ${fmtInt(q.limit)}`}
      </Text>
      {q.limit !== null ? (
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: q.limit, now: q.used }} style={{ height: 8, borderRadius: 4, backgroundColor: ud.primaryOutline, marginTop: 12, overflow: 'hidden' }}>
          <View style={{ width: `${Math.min(100, (q.used / q.limit) * 100)}%`, height: 8, backgroundColor: left === 0 ? ud.warning : ud.primary }} />
        </View>
      ) : null}
      <Text style={{ color: ud.muted, marginTop: 10, lineHeight: 20, fontSize: 14 }}>
        {q.limit === null
          ? 'Dziękujemy za wsparcie – Twoje zdjęcia nie są limitowane.'
          : `Zdjęcia w ostatnich ${q.windowDays} dniach. Powtórne wysłanie tego samego zdjęcia nie zużywa limitu.${left === 0 && resets ? ` Limit odnowi się ${resets}.` : ''}`}
      </Text>
      {upsell ? (
        <Pressable onPress={onMore} accessibilityRole="link" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 44, marginTop: 6, opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ flex: 1, color: ud.primary, fontFamily: ud.fontBodyBold }}>{`Zostań ${patronem} już od 10 zł`}</Text>
          <Chevron color={ud.primary} />
        </Pressable>
      ) : null}
    </UdCard>
  );
}

// Kafelek statystyki: duża liczba i opis. Z akcją – strzałka i wciśnięcie przy dotyku; bez akcji – płaski, bez strzałki.
function Stat({ value, label, onPress, highlight }: { value: string; label: string; onPress?: () => void; highlight?: boolean }) {
  const fg = highlight ? '#fff' : ud.heading;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${label}: ${value}`}
      android_ripple={onPress ? (highlight ? rippleOnDark : ripple) : undefined}
      style={({ pressed }) => ({
        overflow: 'hidden',
        width: highlight ? '100%' : '48.5%',
        backgroundColor: highlight ? ud.primary : ud.surface,
        borderRadius: ud.radiusCard,
        paddingHorizontal: 16,
        paddingVertical: 16,
        marginBottom: 10,
        minHeight: highlight ? undefined : 92, // kafelki w rzędzie mają równą wysokość
        transform: [{ scale: pressed ? 0.97 : 1 }],
        shadowColor: '#000', shadowOpacity: highlight ? 0 : 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: highlight ? 0 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: ud.fontDisplay, color: fg, fontSize: 28, letterSpacing: -0.3 }}>{value}</Text>
        {onPress ? <Chevron color={highlight ? ud.primaryOutline : ud.muted} /> : null}
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: highlight ? ud.primaryOutline : ud.muted, fontSize: 13, marginTop: 4 }}>{label}</Text>
    </Pressable>
  );
}

// Wiersz listy wsparcia (jak komórka listy iOS): tytuł, opis, strzałka; zewnętrzne linki z ↗.
function SupportRow({ title, text, url, external, onOpen, last }: { title: string; text: string; url: string; external?: boolean; onOpen: (url: string, title: string) => void; last?: boolean }) {
  return (
    <Pressable
      onPress={() => (external ? Linking.openURL(externalUrl(url)).catch(() => {}) : onOpen(url, title))}
      accessibilityRole="link"
      accessibilityHint={external ? 'Otwiera się w przeglądarce' : undefined}
      android_ripple={ripple}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: ud.hairline, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading, fontSize: 15 }}>{title}</Text>
        <Text style={{ color: ud.muted, marginTop: 2, fontSize: 14, lineHeight: 19 }}>{text}</Text>
      </View>
      <Chevron external={external} />
    </Pressable>
  );
}

export function DashboardScreen() {
  const router = useRouter();
  const go = (r: string, params?: Record<string, string>) => router.navigate(href(r as RouteName, params));
  const isPatron = useAuth((st) => st.isPatron);
  const insets = useSafeAreaInsets();
  const [d, setD] = useState<Dashboard | null>(cachedDashboard); // ostatni pulpit z pamięci: pokazujemy od razu, load() odświeża
  const [err, setErr] = useState<unknown>(null); // błąd ładowania pulpitu (ApiError/Error) → ErrorScreen

  const load = useCallback(async () => {
    setErr(null);
    try {
      const fresh = await fetchDashboard();
      setD(fresh);
      saveDashboard(fresh);
    } catch (e: any) {
      setErr(e);
      log.fail('pulpit', e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (waitingRoomEnabled) useWaitingRoom.getState().hydrate(); }, []);
  const waitingCount = useWaitingRoom((st) => st.photos.filter((p) => !p.draftId).length);

  const s = d?.stats ?? {};
  const myBadges = s.badges ?? [];
  const active = num(s.active), fined = num(s['confirmed-fined']), instructed = num(s['confirmed-instructed']);
  const patron = myBadges.includes('patron');
  // Kafelek jest linkiem tylko gdy jest co otworzyć (jak {% if fined > 0 %} w app.html.twig).
  const list = (filter: string) => (): void => go('Reports', { filter });
  const open = (u: string, t: string) => openUdPage(router, u, t);

  // Na środku paska logo UD (z „PRO” dla patronów, jak dawny UdHeader); powitanie jako nagłówek na początku treści.
  const firstName = (d?.name ?? '').trim().split(/\s+/)[0];
  const brand = (
    <View accessible accessibilityRole="header" accessibilityLabel={isPatron ? 'Uprzejmie Donoszę PRO' : 'Uprzejmie Donoszę'} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <UdLogo height={22} />
      {isPatron ? (
        <View style={{ backgroundColor: ud.accent, borderRadius: ud.radiusPill, paddingHorizontal: 7, paddingVertical: 1 }}>
          <Text style={{ color: ud.onAccent, fontFamily: ud.fontDisplay, fontSize: 11, letterSpacing: 0.5 }}>PRO</Text>
        </View>
      ) : null}
    </View>
  );

  // Pulpit to najważniejszy endpoint – gdy się nie wczyta (np. 500), pokazujemy pełny ekran błędu z linkiem do kontaktu.
  if (err && !d) {
    return (
      // ErrorScreen ma własny ScrollView (flex: 1) – bez dużego tytułu, bo w przewijanej treści o wysokości dopasowanej do zawartości miałby zerową wysokość.
      <View style={{ flex: 1, backgroundColor: ud.surfaceLow, paddingTop: insets.top }}>
        <ErrorScreen error={err} onRetry={load} onContact={() => open('/kontakt.html', 'Kontakt')} />
      </View>
    );
  }

  const earned = d?.badges.filter((b) => b.earned).length ?? 0;

  return (
    <LargeTitleScreen title="Start" principal={brand} onRefresh={load}>
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 }}>
        {!d ? <ActivityIndicator style={{ marginTop: 40 }} color={ud.primary} accessibilityLabel="Wczytuję pulpit" /> : (
          <>
            <Text accessibilityRole="header" style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 30, lineHeight: 36, letterSpacing: -0.4, marginTop: 8 }}>{firstName ? `Cześć, ${firstName}` : 'Cześć'}</Text>
            {d.introMsg ? <Text style={{ color: ud.text, fontSize: 16, lineHeight: 22, marginTop: 4 }}>{stripHtml(d.introMsg)}</Text> : null}

            {/* Główna akcja ekranu – pierwsza i najmocniejsza; zdjęcia „na potem” jako akcje drugorzędne obok siebie. */}
            <View style={{ marginTop: 14 }}>
              <UdButton title="Nowe zgłoszenie" onPress={() => go('NewReport')} />
              {waitingRoomEnabled ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><UdButton title="Zrób zdjęcia" variant="outline" pill onPress={() => router.push(href('WaitingCamera'))} /></View>
                  <View style={{ flex: 1 }}><UdButton title={waitingCount ? `Poczekalnia (${waitingCount})` : 'Poczekalnia'} variant="outline" pill onPress={() => go('WaitingRoom')} /></View>
                </View>
              ) : null}
            </View>

            <SectionHeader>Twoje statystyki</SectionHeader>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 8 }}>
              <Stat value={`${fmtInt(num(s.mandates))} zł`} label="Kwota mandatów" highlight />
              <Stat value={fmtInt(active)} label="Aktywne zgłoszenia" onPress={() => go('Reports')} />
              <Stat value={fmtInt(fined)} label="Mandaty" onPress={fined > 0 ? list('confirmed-fined') : undefined} />
              <Stat value={fmtInt(instructed)} label="Pouczenia" onPress={instructed > 0 ? list('confirmed-instructed') : undefined} />
              <Stat value={fmtInt(num(s.points))} label="Punkty karne" />
            </View>

            {d.rank ? (
              <>
                <SectionHeader>Twoja ranga</SectionHeader>
                <UdCard>
                  <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 28, letterSpacing: -0.3 }}>{d.rank.desc}</Text>
                  {/* pasek z segmentem na każdą rangę – bez etykiet, więc nic się nie łamie na wąskim ekranie */}
                  <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: d.rank.total, now: d.rank.index }} style={{ flexDirection: 'row', gap: 4, marginTop: 12 }}>
                    {Array.from({ length: d.rank.total }, (_, k) => (
                      <View key={k} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: k < d.rank.index ? ud.primary : ud.primaryOutline, opacity: k === d.rank.index - 1 ? 1 : k < d.rank.index ? 0.55 : 1 }} />
                    ))}
                  </View>
                  <Text style={{ color: ud.muted, marginTop: 10, lineHeight: 20, fontSize: 14 }}>
                    {d.rank.next
                      ? `Do rangi „${d.rank.next.desc}” brakuje ${plural(d.rank.next.missing, ['punktów karnych', 'punktu karnego', 'punktów karnych'])}.`
                      : 'To najwyższa ranga – gratulacje!'}
                  </Text>
                </UdCard>
              </>
            ) : null}

            {d.photoQuota ? (
              <>
                <SectionHeader>Przetworzone zdjęcia</SectionHeader>
                <PhotoQuotaCard q={d.photoQuota} patronem={patronem(d.sexStrings)} onMore={() => router.push(href('QuotaInfo'))} />
              </>
            ) : null}

            {d.badges.length ? (
              <>
                <SectionHeader aside={`${earned} z ${d.badges.length}`}>Odznaki</SectionHeader>
                <UdCard>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 }}>
                    {d.badges.map((b) => (
                      <Pressable key={b.id} onPress={() => router.push(href('Badge', { name: b.name, desc: stripHtml(b.desc), img: b.img || undefined, earned: b.earned ? '1' : '0' }))} accessibilityRole="button" accessibilityLabel={`${b.name}${b.earned ? '' : ', jeszcze niezdobyta'}`} accessibilityHint="Pokazuje opis odznaki"
                        style={({ pressed }) => ({ width: '31%', alignItems: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
                        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: ud.surfaceLow, alignItems: 'center', justifyContent: 'center', opacity: b.earned ? 1 : 0.35 }}>
                          {b.img ? <Image source={{ uri: `${udConfig.base}/${b.img}` }} style={{ width: 44, height: 44 }} resizeMode="contain" /> : null}
                        </View>
                        <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 15, textAlign: 'center', marginTop: 6, color: b.earned ? ud.text : ud.muted }}>{b.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </UdCard>
              </>
            ) : null}

            <SectionHeader>Nie chcesz „donosić”?</SectionHeader>
            <UdCard>
              <Text style={{ color: ud.muted, fontSize: 14, marginBottom: 2 }}>Dowiedz się, co jeszcze możesz zrobić.</Text>
              <SupportRow onOpen={open} external title="Napisz pismo do polityka" text="W trzy minuty przełóż swoją frustrację w realne działanie." url="/napisz-pismo-do-polityka.html" />
              <SupportRow onOpen={open} external title="Miejska Agenda Parkingowa" text="Poznaj zmiany w przepisach, po których Uprzejmie Donoszę nie będzie potrzebne." url="https://agendaparkingowa.pl/" />
              {patron ? (
                <SupportRow onOpen={open} external last title="Wniosek do RPO" text="Poprzyj mój wniosek do Rzecznika Praw Obywatelskich o równe prawa dla pieszych i kierowców." url="https://www.change.org/Rowne-Prawa-Dla-Pieszych-i-Kierowcow/" />
              ) : (
                <>
                  <SupportRow onOpen={open} title="Patronite" text={`Utrzymanie serwerów kosztuje. Zostań ${patronem(d.sexStrings)} i pomóż nam działać stabilnie.`} url="/patronite.html" />
                  <SupportRow onOpen={open} external last title="Suppi" text="Nie chcesz subskrypcji? Postaw nam kawę jednorazową, niewielką wpłatą." url="https://suppi.pl/uprzejmiedonosze" />
                </>
              )}
            </UdCard>
          </>
        )}
      </View>

    </LargeTitleScreen>
  );
}
