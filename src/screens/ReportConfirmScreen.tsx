import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { imageUrl, type UdApp } from '../api/apps';
import { fetchConfirmation, fetchReport, finishReport, type Confirmation, type FinishResult } from '../api/reports';
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

type Item = { app: UdApp; c: Confirmation };

export function ReportConfirmScreen({ navigation, route }: any) {
  // „Oba” = dwa osobne zgłoszenia: ekran dostaje listę szkiców i potwierdza je razem (każde ma własny numer i status).
  const appIds: string[] = route.params.appIds ?? [route.params.appId];
  const setDraftId = useNewReport((s) => s.setDraftId);
  const setDone = useNewReport((s) => s.setDone);
  const [items, setItems] = useState<Item[] | null>(null);
  const [sending, setSending] = useState(false);
  const [armed, setArmed] = useState(false); // jak na www: przycisk aktywny dopiero po chwili (ochrona przed przypadkowym dotknięciem)
  const [viewer, setViewer] = useState<{ item: number; index: number } | null>(null);
  const finished = useRef(new Map<string, FinishResult>()); // już potwierdzone zgłoszenia (ponowienie po częściowej awarii nie wysyła ich drugi raz)
  const go = (r: string) => navigation.navigate(r);
  const key = appIds.join(',');

  useEffect(() => {
    Promise.all(appIds.map((id) => Promise.all([fetchReport(id), fetchConfirmation(id)]).then(([app, c]) => ({ app, c }))))
      .then(setItems)
      .catch((e) => { log.fail('potwierdzenie', e); toast.error(e?.message ?? 'Nie udało się wczytać podsumowania'); });
    const t = setTimeout(() => setArmed(true), 1500);
    return () => clearTimeout(t);
  }, [key]);

  const confirm = async () => {
    if (!items) return;
    setSending(true);
    try {
      // automatyczny kanał → potwierdź i wyślij; w przeciwnym razie tylko zapisz (jak „Zapisz” na www)
      for (const { app, c } of items) {
        if (finished.current.has(app.id)) continue;
        finished.current.set(app.id, await finishReport(app.id, c.recipient.automated));
      }
      setDraftId(null);
      setDone(appIds.map((id) => finished.current.get(id)!));
      // reset stosu: formularz znika, więc „Dodaj kolejne” zaczyna z czystego formularza
      navigation.reset({ index: 1, routes: [{ name: 'Dashboard' }, { name: 'ReportDone' }] });
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
      setSending(false);
    }
  };

  if (!items) {
    return (
      <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
        <UdHeader onBack={() => navigation.goBack()} backIcon="edit" />
        <ActivityIndicator style={{ marginTop: 40 }} color={ud.primary} />
      </View>
    );
  }

  const { app: first, c: firstC } = items[0];
  const many = items.length > 1;
  const ms = parseMs(first.date);
  const shotsOf = (app: UdApp) => [
    { key: 'ctx', thumb: imageUrl(app.contextImage, app, false, 'contextImage'), full: imageUrl(app.contextImage, app, true, 'contextImage'), nat: app.contextImage },
    { key: 'car', thumb: imageUrl(app.carImage, app, false, 'carImage'), full: imageUrl(app.carImage, app, true, 'carImage'), nat: app.carImage },
    { key: 'third', thumb: imageUrl(app.thirdImage, app, false, 'thirdImage'), full: imageUrl(app.thirdImage, app, true, 'thirdImage'), nat: app.thirdImage },
  ].filter((x) => x.thumb);
  const s = firstC.sender;
  const rcpt = firstC.recipient;
  const pending = items.filter((i) => !finished.current.has(i.app.id)).length;
  const sendTitle = sending ? (rcpt.automated ? 'Wysyłam…' : 'Zapisuję…')
    : rcpt.automated ? (many && pending > 1 ? `Wyślij ${pending} zgłoszenia do ${rcpt.shortName}!` : `Wyślij do ${rcpt.shortName}!`)
    : many && pending > 1 ? 'Zapisz oba zgłoszenia' : 'Zapisz';

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader onBack={() => navigation.goBack()} backIcon="edit" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 26 }}>{rcpt.automated ? 'Sprawdź przed wysłaniem' : 'Sprawdź zgłoszenie'}</Text>
        <Text style={{ color: ud.text, marginTop: 6, lineHeight: 21 }}>
          {rcpt.automated ? (many ? 'Twoje zgłoszenia zostaną za chwilę wysłane do ' : 'Twoje zgłoszenie zostanie za chwilę wysłane do ') : 'Sprawdź dane przed zapisaniem zgłoszenia.'}
          {rcpt.automated ? <Text style={{ fontFamily: ud.fontBodyBold }}>{rcpt.name}</Text> : null}
          {rcpt.automated ? '.' : !rcpt.unknown ? <Text>{' Na tym etapie nic nie zostanie wysłane do '}<Text style={{ fontFamily: ud.fontBodyBold }}>{rcpt.name}</Text>.</Text> : null}
        </Text>
        {many ? <Text style={{ color: ud.muted, marginTop: 6 }}>Dwa pojazdy to dwa osobne zgłoszenia – każde ma własny numer sprawy i status.</Text> : null}

        <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading, marginTop: 16 }}>📍 {firstC.shortAddress}</Text>
        {first.address?.lat != null && first.address?.lng != null ? <MapPreview lat={first.address.lat} lng={first.address.lng} hideLabel /> : null}
        {ms ? <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading, marginTop: 16 }}>🕒 {fmtPlDateTime(ms)}</Text> : null}

        {items.map(({ app, c }, n) => {
          const shots = shotsOf(app);
          return (
            <View key={app.id}>
              {many ? <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading, fontSize: 18, marginTop: 24 }}>Zgłoszenie {n + 1}/{items.length} · {c.plateId}{finished.current.has(app.id) ? ' ✓' : ''}</Text> : null}
              <View style={{ marginTop: 12, backgroundColor: ud.surface, borderRadius: ud.radiusSm, padding: 14 }}>
                <Text style={{ color: ud.text, lineHeight: 21 }}>{c.body}</Text>
                <Text style={{ color: ud.text, marginTop: 8 }}>{c.witness}</Text>
              </View>
              {shots.map((x, i) => (
                <Shot key={x.key} uri={x.thumb!} natural={{ w: x.nat?.width, h: x.nat?.height }} box={x.key === 'car' ? c.vehicleBox : null} plate={x.key === 'car' ? c.plateId : null} onPress={() => setViewer({ item: n, index: i })} />
              ))}
            </View>
          );
        })}

        <View style={{ marginTop: 18 }}>
          <Text style={{ color: ud.muted }}>Twoje dane:</Text>
          <Text style={{ color: ud.text, marginTop: 4, lineHeight: 21 }}>
            <Text style={{ fontFamily: ud.fontBodyBold }}>{s.name}</Text>{'\n'}{s.email}{'\n'}{s.address}
            {s.msisdn ? `\nTel: ${s.msisdn}` : ''}{s.edelivery ? `\ne-Doręczenia: ${s.edelivery}` : ''}
          </Text>
        </View>

        <View style={{ marginTop: 22 }}>
          <UdButton title={sendTitle} onPress={confirm} disabled={!armed || sending} />
        </View>
      </ScrollView>
      <ImageViewer urls={viewer ? shotsOf(items[viewer.item].app).map((x) => x.full ?? x.thumb!) : []} index={viewer ? viewer.index : null} onClose={() => setViewer(null)} />
      <UdTabs current="ReportConfirm" navigate={go} />
    </View>
  );
}
