import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { href, type RouteName } from '../lib/routes';
import { fetchProfile } from '../api/user';
import { openUdPage } from '../lib/openPage';
import { plural } from '../lib/reports';
import { PATRONEM_DEFAULT } from '../lib/sex';
import { UdButton, UdCard } from '../components/UD';
import { LargeTitleScreen } from '../components/LargeTitleScreen';
import { ActionRow, InfoRow } from '../components/FormBits';
import { useNewReport } from '../store/useNewReport';
import { useWaitingRoom } from '../store/useWaitingRoom';
import { ud } from '../theme';

// Duży symbol wyniku (✓ / !) w kółku – pojawia się sprężyną krytycznie tłumioną (bez odbicia: to potwierdzenie, nie gest
// z pędem), przy „Ogranicz ruch” tylko się rozjaśnia.
function ResultMark({ tone }: { tone: 'ok' | 'warn' | 'error' }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => { p.value = withSpring(1, { duration: 450, dampingRatio: 1 }); }, [p]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: reduce ? 1 : 0.6 + 0.4 * p.value }] }));
  const bg = tone === 'ok' ? ud.primary : tone === 'warn' ? '#c27c0e' : ud.plateVerified;
  return (
    <Animated.View style={[{ width: 88, height: 88, borderRadius: 44, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, style]}>
      <Text style={{ color: '#fff', fontFamily: ud.fontDisplay, fontSize: 44, lineHeight: 52 }}>{tone === 'ok' ? '✓' : '!'}</Text>
    </Animated.View>
  );
}

// Odpowiednik dziekujemy.html.twig – wynik „Potwierdź i wyślij” (POST /api/rest/app/{id}/finish), w układzie reszty appki:
// natywny pasek (numer zgłoszenia jako mały tytuł, „Zamknij” wraca na pulpit), na środku wynik, pod nim karta ze szczegółami
// i akcje – najpierw kolejne zgłoszenie (najczęstszy następny krok).
export function ReportDoneScreen() {
  const router = useRouter();
  const go = (r: string, params?: Record<string, string>) => router.navigate(href(r as RouteName, params));
  const results = useNewReport((s) => s.done);
  const [patron, setPatron] = useState(PATRONEM_DEFAULT); // „Patronem”/„Patronką” wg płci z profilu (sexStrings z backendu)
  useEffect(() => { fetchProfile().then((p) => setPatron(p.patronem)).catch(() => {}); }, []);
  // Zgłoszenie z poczekalni jest potwierdzone: lokalne kopie zdjęć nie są już potrzebne.
  useEffect(() => { if (results) useWaitingRoom.getState().removeDrafts(results.map((r) => r.app.id)); }, [results]);
  const waitingCount = useWaitingRoom((st) => st.photos.filter((p) => !p.draftId).length);
  const done = results ? (['failed', 'manual', 'not_requested', 'sent'] as const).map((m) => results.find((r) => r.sendMode === m)).find(Boolean) ?? results[0] : null; // status wg najgorszego wyniku
  const close = { label: 'Zamknij', systemImage: 'xmark' as const, onPress: () => router.back() };

  if (!done) {
    return (
      <LargeTitleScreen title="Zgłoszenie" leading={close}>
        <View style={{ padding: 16 }}><UdButton title="Nowe zgłoszenie" onPress={() => go('NewReport')} /></View>
      </LargeTitleScreen>
    );
  }

  const { app, sendMode, sendError, isPatron, edited } = done;
  const appsCount = Math.max(...results!.map((r) => r.appsCount));
  const manual = sendMode === 'manual' || (sendMode === 'not_requested' && app.recipient && !app.recipient.automated && !app.recipient.unknown);
  const result =
    sendMode === 'sent' ? { tone: 'ok' as const, title: edited ? 'Zgłoszenie zaktualizowane' : 'Wysłane!', text: 'Zgłoszenie trafiło do adresata. Jego los śledzisz na liście zgłoszeń.' }
    : sendMode === 'failed' ? { tone: 'error' as const, title: 'Zapisane, ale niewysłane', text: `Wysyłka się nie udała: ${sendError ?? 'nieznany błąd'}. Spróbuj ponownie z listy zgłoszeń.` }
    : manual ? { tone: 'warn' as const, title: 'Zapisane', text: `${app.recipient?.name ?? 'Ten adresat'} nie ma automatycznej wysyłki – dokończ ją na stronie.` }
    : { tone: 'ok' as const, title: edited ? 'Zgłoszenie zaktualizowane' : 'Zapisane!', text: 'Zgłoszenie zostało zapisane.' };
  const numbers = results!.map((r) => r.app.number ?? r.app.carInfo?.plateId).filter(Boolean).join(', ');

  return (
    <LargeTitleScreen title={app.number ?? 'Zgłoszenie'} inlineTitle leading={close}>
      <View style={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 32 }}>
        <ResultMark tone={result.tone} />
        <Text accessibilityRole="header" style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 30, lineHeight: 36, letterSpacing: -0.4, textAlign: 'center', marginTop: 18 }}>{result.title}</Text>
        <Text style={{ color: ud.text, fontSize: 16, lineHeight: 22, textAlign: 'center', marginTop: 8, paddingHorizontal: 8 }}>{result.text}</Text>
        <Text style={{ color: ud.muted, fontSize: 14, textAlign: 'center', marginTop: 10 }}>{`To już twoje ${plural(appsCount, ['zgłoszeń', 'zgłoszenie', 'zgłoszenia'])}. Dziękujemy!`}</Text>

        <View style={{ marginTop: 24 }}>
          <UdCard>
            <InfoRow title={results!.length > 1 ? 'Zgłoszenia' : 'Numer'} value={numbers || '—'} last={!(app.recipient && sendMode !== 'not_requested')} />
            {app.recipient && sendMode !== 'not_requested' ? (
              <View style={{ paddingVertical: 10 }}>
                <Text style={{ color: ud.text, fontSize: 15 }}>Adresat</Text>
                <Text selectable style={{ color: ud.muted, fontSize: 15, lineHeight: 21, marginTop: 2 }}>{app.recipient.name}</Text>
              </View>
            ) : null}
          </UdCard>
          {!isPatron ? (
            <UdCard>
              <ActionRow title={`Zostań ${patron}`} subtitle="Utrzymanie serwisu kosztuje – pomóż nam działać." tone="primary" trailing="›" onPress={() => openUdPage(router, '/patronite.html', 'Wspieraj Uprzejmie Donoszę')} last />
            </UdCard>
          ) : null}
        </View>

        {/* Najczęstszy następny krok pierwszy: kolejne zgłoszenie; potem lista i (gdy coś czeka) poczekalnia. */}
        <View style={{ marginTop: 16 }}>
          {waitingCount > 0 ? <UdButton title={`Wróć do poczekalni (${waitingCount})`} onPress={() => go('WaitingRoom')} /> : null}
          <UdButton title="Nowe zgłoszenie" variant={waitingCount > 0 ? 'outline' : 'primary'} pill onPress={() => go('NewReport')} />
          <UdButton title="Moje zgłoszenia" variant="outline" pill onPress={() => go('Reports')} />
        </View>
      </View>
    </LargeTitleScreen>
  );
}
