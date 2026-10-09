import { ScrollView, Text, View } from 'react-native';
import { openUdPage } from '../lib/openPage';
import { plural } from '../lib/reports';
import { UdButton, UdHeader, UdTabs } from '../components/UD';
import { useNewReport } from '../store/useNewReport';
import { ud } from '../theme';

// Odpowiednik dziekujemy.html.twig – wynik „Potwierdź i wyślij” (POST /api/rest/app/{id}/finish).
export function ReportDoneScreen({ navigation }: any) {
  const go = (r: string, params?: object) => navigation.navigate(r, params);
  const results = useNewReport((s) => s.done);
  const done = results ? (['failed', 'manual', 'not_requested', 'sent'] as const).map((m) => results.find((r) => r.sendMode === m)).find(Boolean) ?? results[0] : null; // status wg najgorszego wyniku

  if (!done) {
    return (
      <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
        <UdHeader />
        <View style={{ padding: 16 }}><UdButton title="Nowe zgłoszenie" onPress={() => go('NewReport')} /></View>
        <UdTabs current="ReportDone" navigate={go} />
      </View>
    );
  }

  const { app, sendMode, sendError, isPatron, edited } = done;
  const appsCount = Math.max(...results!.map((r) => r.appsCount));
  const status =
    sendMode === 'sent' ? { text: 'Zgłoszenie zostało wysłane.', color: ud.primary }
    : sendMode === 'failed' ? { text: `Zgłoszenie zapisane, ale wysyłka się nie udała: ${sendError ?? 'nieznany błąd'}. Spróbuj ponownie z listy zgłoszeń.`, color: ud.plateVerified }
    : sendMode === 'manual' || (sendMode === 'not_requested' && app.recipient && !app.recipient.automated && !app.recipient.unknown) ? { text: `Zgłoszenie zapisane. ${app.recipient?.name ?? 'Ten adresat'} nie ma automatycznej wysyłki – dokończ wysyłkę na stronie.`, color: ud.warning }
    : { text: 'Zgłoszenie zostało zapisane.', color: ud.primary };

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 28 }}>{edited ? 'Zgłoszenie zaktualizowane' : 'Dziękujemy!'}</Text>
        {results!.length > 1
          ? <Text style={{ color: ud.text, marginTop: 8 }}>Zgłoszenia: {results!.map((r, i) => <Text key={r.app.id} style={{ fontFamily: ud.fontBodyBold }}>{i ? ', ' : ''}{r.app.number ?? r.app.carInfo?.plateId}</Text>)}</Text>
          : app.number ? <Text style={{ color: ud.text, marginTop: 8 }}>Zgłoszenie <Text style={{ fontFamily: ud.fontBodyBold }}>{app.number}</Text></Text> : null}
        <Text style={{ color: status.color, fontFamily: ud.fontBodyBold, marginTop: 12 }}>{status.text}</Text>
        {app.recipient && sendMode !== 'not_requested' ? (
          <Text style={{ color: ud.muted, marginTop: 4 }}>Adresat: {app.recipient.isPolice ? '👮 ' : ''}{app.recipient.name}</Text>
        ) : null}
        <Text style={{ color: ud.muted, marginTop: 12 }}>To już Twoje {plural(appsCount, ['zgłoszeń', 'zgłoszenie', 'zgłoszenia'])}.</Text>

        {!isPatron ? (
          <Text style={{ color: ud.text, marginTop: 16 }}>
            Utrzymanie serwisu kosztuje.{' '}
            <Text style={{ color: ud.primary, textDecorationLine: 'underline' }} onPress={() => openUdPage(navigation, '/patronite.html', 'Wspieraj Uprzejmie Donoszę')}>Zostań Patronką lub Patronem</Text>.
          </Text>
        ) : null}

        <View style={{ marginTop: 24, gap: 8 }}>
          <UdButton title="Zobacz listę zgłoszeń" onPress={() => go('Reports')} />
          <UdButton title="Dodaj kolejne" variant="outline" onPress={() => go('NewReport')} />
        </View>
      </ScrollView>
      <UdTabs current="ReportDone" navigate={go} />
    </View>
  );
}
