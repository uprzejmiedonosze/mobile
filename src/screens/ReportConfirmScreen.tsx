import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { imageUrl, type UdApp } from '../api/apps';
import { fetchConfirmation, fetchReport, finishReport, type Confirmation } from '../api/reports';
import { ImageViewer } from '../components/ImageViewer';
import { MapPreview } from '../components/MapPreview';
import { UdButton, UdHeader, UdTabs } from '../components/UD';
import { fmtPlDateTime } from '../lib/format';
import { log } from '../lib/log';
import { useNewReport } from '../store/useNewReport';
import { toast } from '../store/useToast';
import { ud } from '../theme';

// Odpowiednik potwierdz.html.twig („Sprawdź przed wysłaniem” / „Sprawdź zgłoszenie”): podsumowanie zapisanego
// zgłoszenia, a dopiero przycisk na dole je potwierdza (POST /app/{id}/finish) i – gdy odbiorca ma automatyczny
// kanał – wysyła. „← popraw” wraca do formularza (zgłoszenie ma status „ready”, więc nadal jest edytowalne).
const parseMs = (iso?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso ?? ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null; };

// Zdjęcie w pełnej szerokości z proporcjami oryginału. Ramkę pojazdu liczymy w % (jak na www), więc nie trzeba znać rozmiaru kontenera.
function Shot({ uri, natural, box, plate, onPress }: { uri: string; natural?: { w?: number; h?: number }; box?: Confirmation['vehicleBox']; plate?: string | null; onPress: () => void }) {
  const w = natural?.w ?? 1200, h = natural?.h ?? 900;
  return (
    <Pressable onPress={onPress} style={{ marginTop: 12, aspectRatio: w / h, borderRadius: ud.radiusSm, overflow: 'hidden', backgroundColor: ud.surfaceCream }}>
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      {box ? <View pointerEvents="none" style={{ position: 'absolute', left: `${(100 * box.x) / w}%`, top: `${(100 * box.y) / h}%`, width: `${(100 * box.width) / w}%`, height: `${(100 * box.height) / h}%`, borderWidth: 3, borderColor: '#FFD60A', borderRadius: 4 }} /> : null}
      {plate ? (
        <View style={{ position: 'absolute', right: 8, bottom: 8, backgroundColor: ud.surface, borderWidth: 1, borderColor: ud.text, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ fontFamily: ud.fontBodyBold, color: ud.text, letterSpacing: 1 }}>{plate.replace(/\s+/g, '')}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function ReportConfirmScreen({ navigation, route }: any) {
  const appId: string = route.params.appId;
  const setDraftId = useNewReport((s) => s.setDraftId);
  const setDone = useNewReport((s) => s.setDone);
  const [app, setApp] = useState<UdApp | null>(null);
  const [c, setC] = useState<Confirmation | null>(null);
  const [sending, setSending] = useState(false);
  const [armed, setArmed] = useState(false); // jak na www: przycisk aktywny dopiero po chwili (ochrona przed przypadkowym dotknięciem)
  const [viewer, setViewer] = useState<number | null>(null);
  const go = (r: string) => navigation.navigate(r);

  useEffect(() => {
    Promise.all([fetchReport(appId), fetchConfirmation(appId)])
      .then(([a, conf]) => { setApp(a); setC(conf); })
      .catch((e) => { log.error('potwierdzenie', String(e?.message ?? e)); toast.error(e?.message ?? 'Nie udało się wczytać podsumowania'); });
    const t = setTimeout(() => setArmed(true), 1500);
    return () => clearTimeout(t);
  }, [appId]);

  const confirm = async () => {
    if (!c) return;
    setSending(true);
    try {
      // automatyczny kanał → potwierdź i wyślij; w przeciwnym razie tylko zapisz (jak „Zapisz” na www)
      const result = await finishReport(appId, c.recipient.automated);
      setDraftId(null);
      setDone(result);
      // reset stosu: formularz znika, więc „Dodaj kolejne” zaczyna z czystego formularza
      navigation.reset({ index: 1, routes: [{ name: 'Dashboard' }, { name: 'ReportDone' }] });
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
      setSending(false);
    }
  };

  if (!app || !c) {
    return (
      <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
        <UdHeader onBack={() => navigation.goBack()} backIcon="edit" />
        <ActivityIndicator style={{ marginTop: 40 }} color={ud.primary} />
      </View>
    );
  }

  const ms = parseMs(app.date);
  const shots = [
    { key: 'ctx', thumb: imageUrl(app.contextImage, app), full: imageUrl(app.contextImage, app, true), nat: app.contextImage },
    { key: 'car', thumb: imageUrl(app.carImage, app), full: imageUrl(app.carImage, app, true), nat: app.carImage },
    { key: 'third', thumb: imageUrl(app.thirdImage, app), full: imageUrl(app.thirdImage, app, true), nat: app.thirdImage },
  ].filter((x) => x.thumb);
  const fulls = shots.map((x) => x.full ?? x.thumb!);
  const s = c.sender;
  const rcpt = c.recipient;

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader onBack={() => navigation.goBack()} backIcon="edit" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 26 }}>{rcpt.automated ? 'Sprawdź przed wysłaniem' : 'Sprawdź zgłoszenie'}</Text>
        <Text style={{ color: ud.text, marginTop: 6, lineHeight: 21 }}>
          {rcpt.automated ? 'Twoje zgłoszenie zostanie za chwilę wysłane do ' : 'Sprawdź dane przed zapisaniem zgłoszenia.'}
          {rcpt.automated ? <Text style={{ fontFamily: ud.fontBodyBold }}>{rcpt.name}</Text> : null}
          {rcpt.automated ? '.' : !rcpt.unknown ? <Text>{' Na tym etapie nic nie zostanie wysłane do '}<Text style={{ fontFamily: ud.fontBodyBold }}>{rcpt.name}</Text>.</Text> : null}
        </Text>

        <View style={{ marginTop: 16, backgroundColor: ud.surface, borderRadius: ud.radiusSm, padding: 14 }}>
          <Text style={{ color: ud.text, lineHeight: 21 }}>{c.body}</Text>
          <Text style={{ color: ud.text, marginTop: 8 }}>{c.witness}</Text>
        </View>

        <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading, marginTop: 16 }}>📍 {c.shortAddress}</Text>
        {app.address?.lat != null && app.address?.lng != null ? <MapPreview lat={app.address.lat} lng={app.address.lng} hideLabel /> : null}

        {ms ? <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading, marginTop: 16 }}>🕒 {fmtPlDateTime(ms)}</Text> : null}
        {shots.map((x, i) => (
          <Shot key={x.key} uri={x.thumb!} natural={{ w: x.nat?.width, h: x.nat?.height }} box={x.key === 'car' ? c.vehicleBox : null} plate={x.key === 'car' ? c.plateId : null} onPress={() => setViewer(i)} />
        ))}

        <View style={{ marginTop: 18 }}>
          <Text style={{ color: ud.muted }}>Twoje dane:</Text>
          <Text style={{ color: ud.text, marginTop: 4, lineHeight: 21 }}>
            <Text style={{ fontFamily: ud.fontBodyBold }}>{s.name}</Text>{'\n'}{s.email}{'\n'}{s.address}
            {s.msisdn ? `\nTel: ${s.msisdn}` : ''}{s.edelivery ? `\ne-Doręczenia: ${s.edelivery}` : ''}
          </Text>
        </View>

        <View style={{ marginTop: 22 }}>
          <UdButton title={sending ? (rcpt.automated ? 'Wysyłam…' : 'Zapisuję…') : rcpt.automated ? `Wyślij do ${rcpt.shortName}!` : 'Zapisz'} onPress={confirm} disabled={!armed || sending} />
        </View>
      </ScrollView>
      <ImageViewer urls={fulls} index={viewer} onClose={() => setViewer(null)} />
      <UdTabs current="ReportConfirm" navigate={go} />
    </View>
  );
}
