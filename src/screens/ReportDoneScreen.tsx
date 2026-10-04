import { Linking, ScrollView, Text, View } from 'react-native';
import { udConfig } from '../config';
import { plural } from '../lib/reports';
import { UdButton, UdHeader, UdTabs } from '../components/UD';
import { useNewReport } from '../store/useNewReport';
import { ud } from '../theme';

// Odpowiednik dziekujemy.html.twig – wynik „Potwierdź i wyślij” (POST /api/rest/app/{id}/finish).
export function ReportDoneScreen({ navigation }: any) {
  const go = (r: string, params?: object) => navigation.navigate(r, params);
  const done = useNewReport((s) => s.done);

  if (!done) {
    return (
      <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
        <UdHeader />
        <View style={{ padding: 16 }}><UdButton title="Nowe zgłoszenie" onPress={() => go('NewReport')} /></View>
        <UdTabs current="ReportDone" navigate={go} />
      </View>
    );
  }

  const { app, sendMode, sendError, appsCount, isPatron, edited } = done;
  const status =
    sendMode === 'sent' ? { text: 'Zgłoszenie zostało wysłane.', color: ud.primary }
    : sendMode === 'failed' ? { text: `Zgłoszenie zapisane, ale wysyłka się nie udała: ${sendError ?? 'nieznany błąd'}. Spróbuj ponownie z listy zgłoszeń.`, color: ud.plateVerified }
    : sendMode === 'manual' ? { text: `Zgłoszenie zapisane. ${app.recipient?.name ?? 'Ten adresat'} nie ma automatycznej wysyłki – dokończ wysyłkę na stronie.`, color: ud.warning }
    : { text: 'Zgłoszenie zostało zapisane.', color: ud.primary };

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 28 }}>{edited ? 'Zgłoszenie zaktualizowane' : 'Dziękujemy!'}</Text>
        {app.number ? <Text style={{ color: ud.text, marginTop: 8 }}>Zgłoszenie <Text style={{ fontFamily: ud.fontBodyBold }}>{app.number}</Text></Text> : null}
        <Text style={{ color: status.color, fontFamily: ud.fontBodyBold, marginTop: 12 }}>{status.text}</Text>
        {app.recipient && sendMode !== 'not_requested' ? (
          <Text style={{ color: ud.muted, marginTop: 4 }}>Adresat: {app.recipient.isPolice ? '👮 ' : ''}{app.recipient.name}</Text>
        ) : null}
        <Text style={{ color: ud.muted, marginTop: 12 }}>To już Twoje {plural(appsCount, ['zgłoszeń', 'zgłoszenie', 'zgłoszenia'])}.</Text>

        {!isPatron ? (
          <Text style={{ color: ud.text, marginTop: 16 }}>
            Utrzymanie serwisu kosztuje.{' '}
            <Text style={{ color: ud.primary, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`${udConfig.base}/patronite.html`).catch(() => {})}>Zostań Patronką lub Patronem</Text>.
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
