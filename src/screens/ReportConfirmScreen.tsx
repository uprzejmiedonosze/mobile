import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { href, splitIds } from '../lib/routes';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { imageUrl, type UdApp } from '../api/apps';
import { fetchConfirmation, fetchReport, finishReport, type Confirmation, type FinishResult } from '../api/reports';
import { ImageViewer } from '../components/ImageViewer';
import { MapPreview } from '../components/MapPreview';
import { UdButton, UdCard } from '../components/UD';
import { LargeTitleScreen } from '../components/LargeTitleScreen';
import { SectionHeader } from '../components/FormBits';
import { SvgXml } from 'react-native-svg';
import { DATETIME_ICON, PIN_ICON } from '../assets/detailIcons';
import { plural } from '../lib/reports';
import { fmtPlDateTime } from '../lib/format';
import { log } from '../lib/log';
import { useNewReport } from '../store/useNewReport';
import { toast } from '../store/useToast';
import { ud } from '../theme';
import { recordRecentCategory } from '../lib/recentCategories';

// Odpowiednik potwierdz.html.twig („Sprawdź przed wysłaniem” / „Sprawdź zgłoszenie”): podsumowanie zapisanego
// zgłoszenia, a dopiero przycisk na dole je potwierdza (POST /app/{id}/finish) i – gdy odbiorca ma automatyczny
// kanał – wysyła. „← popraw” wraca do formularza (zgłoszenie ma status „ready”, więc nadal jest edytowalne).
const parseMs = (iso?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso ?? ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null; };

// Zdjęcie w pełnej szerokości z proporcjami oryginału. Ramkę pojazdu liczymy w % (jak na www), więc nie trzeba znać rozmiaru kontenera.
function Shot({ uri, natural, box, plate, onPress }: { uri: string; natural?: { w?: number; h?: number }; box?: Confirmation['vehicleBox']; plate?: string | null; onPress: () => void }) {
  const w = natural?.w ?? 1200, h = natural?.h ?? 900;
  return (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel="Powiększ zdjęcie" style={({ pressed }) => ({ marginTop: 10, aspectRatio: w / h, borderRadius: 14, overflow: 'hidden', backgroundColor: ud.surfaceCream, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
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

export function ReportConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ appIds?: string }>();
  // „Oba” = dwa osobne zgłoszenia: ekran dostaje listę szkiców i potwierdza je razem (każde ma własny numer i status).
  const appIds: string[] = splitIds(params.appIds) ?? [];
  const setDraftId = useNewReport((s) => s.setDraftId);
  const setDone = useNewReport((s) => s.setDone);
  const [items, setItems] = useState<Item[] | null>(null);
  const [sending, setSending] = useState(false);
  const [armed, setArmed] = useState(false); // jak na www: przycisk aktywny dopiero po chwili (ochrona przed przypadkowym dotknięciem)
  const [viewer, setViewer] = useState<{ item: number; index: number } | null>(null);
  const finished = useRef(new Map<string, FinishResult>()); // już potwierdzone zgłoszenia (ponowienie po częściowej awarii nie wysyła ich drugi raz)
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
      // tylko gdy potwierdzamy zapamiętany szkic: zgłoszenie z poczekalni nie może zgubić rozpoczętego równolegle formularza
      // …i wtedy też formularz w zakładce „Nowe” (zostaje zamontowany) montujemy od zera: „Nowe” zaczyna z czystego formularza
      if (appIds.includes(useNewReport.getState().draftId ?? '')) { setDraftId(null); useNewReport.getState().restart(); }
      setDone(appIds.map((id) => finished.current.get(id)!));
      // „Oba” = dwa szkice z tą samą kategorią – jeden wpis
      for (const cat of new Set(items.map(({ app }) => Number(app.category)))) await recordRecentCategory(cat);
      // stos jak dawniej [Pulpit, Podsumowanie]: ekrany procesu znikają, wstecz z podsumowania wraca na pulpit
      router.dismissTo(href('Dashboard'));
      router.push(href('ReportDone'));
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
      setSending(false);
    }
  };

  // „‹ Popraw” – powrót do formularza (zgłoszenie ma status „ready”, nadal edytowalne).
  const back = { label: 'Popraw', systemImage: 'chevron.left' as const, onPress: () => router.back() };
  if (!items) {
    return (
      <LargeTitleScreen title="Sprawdź zgłoszenie" leading={back}>
        <ActivityIndicator style={{ marginTop: 40 }} color={ud.primary} accessibilityLabel="Wczytuję podsumowanie" />
      </LargeTitleScreen>
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

  const icon = (xml: string) => <SvgXml xml={xml.replace('COLOR', ud.primary)} width={18} height={18} />;
  // Skutek przycisku jednym zdaniem pod nim – wysyłki do służb nie da się cofnąć, więc mówimy to wprost.
  const sendNote = rcpt.automated
    ? `Zgłoszenie trafi od razu do ${rcpt.shortName} – potem nie da się go już poprawić.`
    : 'Zgłoszenie zostanie zapisane – na tym etapie nic nie jest wysyłane.';

  return (
    <LargeTitleScreen
      // krótko – duży tytuł iOS nie łamie się na dwie linie, dłuższy („Sprawdź przed wysłaniem”) był ucinany
      title={rcpt.automated ? 'Sprawdź i wyślij' : 'Sprawdź zgłoszenie'}
      leading={back}
      footer={
        <>
          <UdButton title={sendTitle} onPress={confirm} disabled={!armed || sending} />
          <Text style={{ color: ud.muted, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 2 }}>{sendNote}</Text>
        </>
      }
    >
      <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        {/* Odbiorca – najważniejsza informacja tego ekranu, na samej górze */}
        <UdCard>
          <Text style={{ color: ud.muted, fontSize: 13, fontFamily: ud.fontBodyBold, letterSpacing: 0.3 }}>{rcpt.automated ? 'WYŚLEMY DO' : 'ODBIORCA'}</Text>
          <Text style={{ color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 20, lineHeight: 26, letterSpacing: -0.2, marginTop: 4 }}>{rcpt.unknown ? 'Nie udało się ustalić odbiorcy' : rcpt.name}</Text>
          {!rcpt.automated && !rcpt.unknown ? <Text style={{ color: ud.muted, fontSize: 14, lineHeight: 20, marginTop: 4 }}>Na tym etapie nic nie zostanie wysłane.</Text> : null}
          {many ? <Text style={{ color: ud.muted, fontSize: 14, lineHeight: 20, marginTop: 6 }}>Dwa pojazdy to dwa osobne zgłoszenia – każde ma własny numer sprawy i status.</Text> : null}
        </UdCard>

        <SectionHeader>Miejsce i czas</SectionHeader>
        <UdCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {icon(PIN_ICON)}
            <Text style={{ flex: 1, fontFamily: ud.fontBodyBold, color: ud.heading, fontSize: 16 }}>{firstC.shortAddress}</Text>
          </View>
          {first.address?.lat != null && first.address?.lng != null ? <MapPreview lat={first.address.lat} lng={first.address.lng} hideLabel /> : null}
          {ms ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
              {icon(DATETIME_ICON)}
              <Text style={{ flex: 1, color: ud.text, fontSize: 16 }}>{fmtPlDateTime(ms)}</Text>
            </View>
          ) : null}
        </UdCard>

        {items.map(({ app, c }, n) => {
          const shots = shotsOf(app);
          const done = finished.current.has(app.id);
          return (
            <View key={app.id}>
              <SectionHeader aside={many ? `${n + 1} z ${items.length}${done ? ' · wysłane' : ''}` : undefined}>{many ? `Zgłoszenie · ${c.plateId}` : 'Treść zgłoszenia'}</SectionHeader>
              <UdCard>
                <Text style={{ color: ud.text, fontSize: 16, lineHeight: 23 }}>{c.body}</Text>
                <Text style={{ color: ud.muted, fontSize: 15, lineHeight: 21, marginTop: 8 }}>{c.witness}</Text>
              </UdCard>
              {shots.length ? <SectionHeader aside={plural(shots.length, ['zdjęć', 'zdjęcie', 'zdjęcia'])}>Zdjęcia</SectionHeader> : null}
              {shots.map((x, i) => (
                <Shot key={x.key} uri={x.thumb!} natural={{ w: x.nat?.width, h: x.nat?.height }} box={x.key === 'car' ? c.vehicleBox : null} plate={x.key === 'car' ? c.plateId : null} onPress={() => setViewer({ item: n, index: i })} />
              ))}
            </View>
          );
        })}

        {/* Dane nadawcy – jak w Kontaktach: etykieta nad wartością */}
        <SectionHeader>Twoje dane w zgłoszeniu</SectionHeader>
        <UdCard>
          {[
            ['Imię i nazwisko', s.name],
            ['E-mail', s.email],
            ['Adres', s.address],
            ...(s.msisdn ? [['Telefon', s.msisdn]] : []),
            ...(s.edelivery ? [['e-Doręczenia', s.edelivery]] : []),
          ].map(([label, value], i, all) => (
            <View key={label} style={{ paddingVertical: 8, borderBottomWidth: i === all.length - 1 ? 0 : 1, borderBottomColor: ud.hairline }}>
              <Text style={{ color: ud.muted, fontSize: 13 }}>{label}</Text>
              <Text selectable style={{ color: ud.text, fontSize: 16, marginTop: 2 }}>{value}</Text>
            </View>
          ))}
        </UdCard>
      </View>
      <ImageViewer urls={viewer ? shotsOf(items[viewer.item].app).map((x) => x.full ?? x.thumb!) : []} index={viewer ? viewer.index : null} onClose={() => setViewer(null)} />
    </LargeTitleScreen>
  );
}
