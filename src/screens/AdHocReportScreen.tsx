import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import type { UdApp } from '../api/apps';
import { fetchCategories, reverseGeocode } from '../api/geo';
import { analyzePhotoAlpr, stagePhoto } from '../api/photos';
import { assignReportPhoto, createDraft, deleteReportVideo, fetchReport, saveReport, uploadReportVideo } from '../api/reports';
import { ApiError, isPhotoQuotaError, validIdToken } from '../api/udApi';
import { fetchProfile } from '../api/user';
import { HtmlText } from '../components/HtmlText';
import { MapPicker, type PickedPlace } from '../components/MapPicker';
import { MapPreview } from '../components/MapPreview';
import { UdButton, UdHeader } from '../components/UD';
import { udConfig } from '../config';
import { adHocCategories, adHocMissing, adHocReportForm, bestPlate, fmtMB, localIso } from '../lib/adHoc';
import { takePhoto } from '../lib/gallery';
import { log } from '../lib/log';
import { downscale } from '../lib/resize';
import { useAuth } from '../store/useAuth';
import { useWaitingRoom } from '../store/useWaitingRoom';
import { toast } from '../store/useToast';
import { ud, inputColors } from '../theme';
import type { Category, GeoAddress } from '../types';

type Place = { lat: number; lng: number; geo: GeoAddress };

const parseLocal = (s?: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):?(\d{2})?/.exec(s ?? '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) : null;
};

// Zgłoszenie „na gorąco” (tuning: hałas/wydech, drift). Zwykle z nagrania z poczekalni (`waitingVideoId`, aparat z pulpitu w trybie WIDEO):
// data = chwila nagrania, miejsce = GPS zapisany przy nagraniu. Bez niego (edycja, film z AdHocCamera) data = otwarcie ekranu, miejsce = GPS
// telefonu teraz; wszystko można poprawić na mapie. Materiał: film, zdjęcie albo klatka z filmu, ewentualnie sama relacja świadka.
// Odbiorcę (wojewódzka skrzynka „Stop agresji drogowej”) i treść wybiera backend; dalej jak zwykle: ReportConfirm → wysyłka.
// Szkic powstaje dopiero przy „Dalej”, więc porzucony formularz nie zostawia nic na serwerze.
export function AdHocReportScreen({ navigation, route }: any) {
  const editId: string | undefined = route?.params?.editId;
  const videoParam: string | undefined = route?.params?.videoUri;
  const videoSizeParam: number | null = route?.params?.videoSize ?? null;
  const frameParam: string | undefined = route?.params?.frameUri; // klatka z nagrania (AdHocFrame) = zdjęcie auta
  const waitingVideoId: string | undefined = route?.params?.waitingVideoId;
  // nagranie z poczekalni (store jest już wczytany – wchodzimy z WaitingRoom)
  const [waitingVideo] = useState(() => (waitingVideoId ? useWaitingRoom.getState().photos.find((p) => p.id === waitingVideoId) : undefined));
  const videoFix = waitingVideo?.lat != null && waitingVideo?.lng != null ? { lat: waitingVideo.lat, lng: waitingVideo.lng } : null;
  const enabled = useAuth((s) => s.adHocReports);

  const at = useRef(new Date(waitingVideo?.takenAtMs ?? Date.now()));
  const draft = useRef<UdApp | null>(null); // szkic po pierwszej (może nieudanej) próbie – ponowienie go nie dubluje
  const sent = useRef({ video: '', photo: '' }); // co już jest w szkicu (uri), żeby ponowienie nie wysyłało drugi raz
  const [cats, setCats] = useState<Category[]>([]);
  const [info, setInfo] = useState<Category | null>(null);
  const [category, setCategory] = useState<number | null>(null);
  const [plateId, setPlateId] = useState('');
  const [comment, setComment] = useState('');
  const [address, setAddress] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [locating, setLocating] = useState<'wait' | 'off' | 'done'>('wait');
  const [mapOpen, setMapOpen] = useState(false);
  const [mapStart, setMapStart] = useState<{ lat: number; lng: number } | null>(null);
  const [video, setVideo] = useState<{ uri: string | null; size: number | null } | null>( // uri null = nagranie już w szkicu (edycja)
    waitingVideo ? { uri: waitingVideo.uri, size: waitingVideo.size ?? null } : null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoFromVideo, setPhotoFromVideo] = useState(false);
  // Zdjęcie (albo klatka) idzie na serwer od razu po wyborze i przechodzi ALPR – numer wpisujemy, gdy pole jest puste.
  // `staged` pamięta photoId, więc „Dalej” nie wysyła go drugi raz (a serwerowy wycinek tablicy korzysta z tego odczytu).
  const staged = useRef<{ uri: string; photoId: Promise<string> } | null>(null);
  const [alpr, setAlpr] = useState<{ uri: string; state: 'busy' | 'done' | 'none' | 'error'; plate?: string; text?: string } | null>(null);
  const [loading, setLoading] = useState(!!editId);
  const [submitting, setSubmitting] = useState('');
  const [err, setErr] = useState<{ field?: string; text: string } | null>(null);

  useEffect(() => { fetchCategories().then((c) => setCats(adHocCategories(c, true))); }, []);
  useFocusEffect(useCallback(() => { fetchProfile().then((p) => setMapStart(p.lastLocation)).catch(() => {}); }, []));

  // film wraca z AdHocCamera w parametrach trasy
  useEffect(() => { if (videoParam) setVideo({ uri: videoParam, size: videoSizeParam }); }, [videoParam, videoSizeParam]);

  const geocode = useCallback(async (lat: number, lng: number) => {
    const geo = await reverseGeocode(lat, lng, await validIdToken());
    if (!geo) throw new Error('Nie udało się ustalić adresu – wskaż miejsce na mapie.');
    setPlace({ lat, lng, geo });
    setAddress(geo.display);
  }, []);

  // Edycja zapisanego szkicu („← popraw” z potwierdzenia albo EDYTUJ) – bez ponownego GPS.
  useEffect(() => {
    if (!editId) return;
    fetchReport(editId).then((a) => {
      draft.current = a;
      setCategory(Number(a.category));
      setPlateId(a.carInfo?.plateId ?? '');
      setComment(a.userComment ?? '');
      setAddress(a.address?.address ?? '');
      if (a.address?.lat != null && a.address?.lng != null) {
        setPlace({ lat: a.address.lat, lng: a.address.lng, geo: { display: a.address.addressGPS ?? a.address.address ?? '', city: a.address.city, voivodeship: a.address.voivodeship, district: a.address.district, county: a.address.county, municipality: a.address.municipality, postcode: a.address.postcode } });
      }
      if (a.video?.url) setVideo({ uri: null, size: a.video.size ?? null });
      at.current = parseLocal(a.date) ?? at.current;
      setLocating('done');
    }).catch((e) => { log.fail('na-goraco', e); toast.error(e?.message ?? 'Nie udało się wczytać zgłoszenia'); navigation.goBack(); })
      .finally(() => setLoading(false));
  }, [editId, navigation]);

  // Nagranie z poczekalni z GPS: miejsce nagrania, nie obecna pozycja telefonu.
  useEffect(() => {
    if (editId || !videoFix) return;
    geocode(videoFix.lat, videoFix.lng).then(() => setLocating('done'))
      .catch((e: any) => { log.warn('na-goraco', `adres nagrania: ${String(e?.message ?? e).slice(0, 160)}`); setLocating('off'); });
  }, [editId, geocode, videoFix?.lat, videoFix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nowe zgłoszenie bez GPS z nagrania: pozycja telefonu teraz (zdarzenie dzieje się tu i teraz).
  useEffect(() => {
    if (editId || videoFix) return;
    let stop = false;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { if (!stop) setLocating('off'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (stop) return;
      await geocode(pos.coords.latitude, pos.coords.longitude);
      setLocating('done');
    })().catch((e: any) => { log.warn('na-goraco', `GPS: ${String(e?.message ?? e).slice(0, 160)}`); if (!stop) setLocating('off'); });
    return () => { stop = true; };
  }, [editId, geocode]);

  const onMapConfirm = async (p: PickedPlace) => {
    setMapOpen(false);
    try {
      if (p.geo) { setPlace({ lat: p.lat, lng: p.lng, geo: p.geo }); setAddress(p.geo.display); }
      else await geocode(p.lat, p.lng);
      setLocating('done');
      setErr(null);
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
  };

  const readPlate = useCallback(async (uri: string) => {
    setAlpr({ uri, state: 'busy' });
    try {
      const photoId = stagePhoto(uri, { dateTime: localIso(at.current), lat: place?.lat, lng: place?.lng }).then((s) => s.photoId);
      staged.current = { uri, photoId };
      const plate = bestPlate(await analyzePhotoAlpr(await photoId));
      log.info('na-goraco', `ALPR ${plate ?? '—'}`);
      if (plate) setPlateId((prev) => (prev.replace(/\s/g, '') ? prev : plate));
      setAlpr((a) => (a?.uri === uri ? { uri, state: plate ? 'done' : 'none', plate: plate ?? undefined } : a));
    } catch (e: any) {
      log.warn('na-goraco', `ALPR: ${String(e?.message ?? e).slice(0, 160)}`);
      const text = isPhotoQuotaError(e) ? 'Limit analizy zdjęć jest wyczerpany – wpisz numer ręcznie.' : 'Nie udało się odczytać tablicy – wpisz numer ręcznie.';
      setAlpr((a) => (a?.uri === uri ? { uri, state: 'error', text } : a));
    }
  }, [place?.lat, place?.lng]);

  const applyPhoto = (uri: string, fromVideo: boolean) => {
    setPhotoUri(uri);
    setPhotoFromVideo(fromVideo);
    void readPlate(uri);
  };

  // klatka wraca z AdHocFrame w parametrach trasy
  useEffect(() => { if (frameParam) applyPhoto(frameParam, true); }, [frameParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPhoto = async () => {
    try {
      const uri = await takePhoto();
      if (uri) applyPhoto((await downscale(uri)).uri, false); // serwer przyjmuje ≤ 3 MB – jak zdjęcia w zwykłym formularzu (lib/resize.ts)
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
  };

  const removePhoto = () => { setPhotoUri(null); setAlpr(null); staged.current = null; };

  const removeVideo = () => {
    if (video?.uri) { setVideo(null); return; }
    // nagranie zapisane już w szkicu – usuń je z serwera
    Alert.alert('Usunąć nagranie?', 'Film zostanie usunięty ze zgłoszenia.', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: () => {
        if (!draft.current) return;
        deleteReportVideo(draft.current.id).then(() => setVideo(null)).catch((e) => toast.error(e?.message ?? String(e)));
      } },
    ]);
  };

  const submit = async () => {
    setErr(null);
    const missing = adHocMissing({ category, plateId, address, hasPlace: !!place });
    if (missing) { setErr({ text: missing }); toast.error(missing); return; }
    try {
      setSubmitting('Tworzę zgłoszenie…');
      draft.current ??= await createDraft();
      const id = draft.current.id;
      // nagranie z poczekalni → „W szkicach”; po wysłaniu ReportDone je usuwa (removeDrafts), a szkic da się otworzyć z poczekalni
      if (waitingVideo) useWaitingRoom.getState().markUsed([waitingVideo.id], id);
      if (photoUri && sent.current.photo !== photoUri) {
        setSubmitting('Wysyłam zdjęcie…');
        // wysłane już przy wyborze (także w trakcie odczytu tablicy) – nie wysyłamy drugi raz; nieudana wysyłka = ponowienie tutaj
        const early = staged.current?.uri === photoUri ? await staged.current.photoId.catch(() => null) : null;
        const photoId = early ?? (await stagePhoto(photoUri, { dateTime: localIso(at.current), lat: place!.lat, lng: place!.lng })).photoId;
        await assignReportPhoto(id, 'carImage', photoId);
        sent.current.photo = photoUri;
      }
      if (video?.uri && sent.current.video !== video.uri) {
        setSubmitting(video.size ? `Wysyłam nagranie (${fmtMB(video.size)})…` : 'Wysyłam nagranie…');
        await uploadReportVideo(id, video.uri);
        sent.current.video = video.uri;
      }
      setSubmitting('Zapisuję…');
      await saveReport(id, adHocReportForm({ category: category!, plateId, address, geo: place!.geo, lat: place!.lat, lng: place!.lng, comment, at: at.current }));
      navigation.navigate('ReportConfirm', { appId: id });
    } catch (e: any) {
      log.fail('na-goraco', e);
      const m = e?.message ?? String(e);
      setErr({ field: e instanceof ApiError ? e.field : undefined, text: m });
      toast.error(m);
    } finally {
      setSubmitting('');
    }
  };

  if (!enabled) {
    return (
      <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
        <UdHeader title="Na gorąco" onBack={() => navigation.goBack()} />
        <Text style={{ color: ud.text, padding: 16, lineHeight: 21 }}>Zgłoszenia na gorąco są na razie dostępne tylko w wersji testowej.</Text>
      </View>
    );
  }
  if (loading) return <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}><UdHeader onBack={() => navigation.goBack()} /><ActivityIndicator style={{ marginTop: 40 }} color={ud.primary} /></View>;

  const label = { fontFamily: ud.fontBodyBold, color: ud.heading, marginTop: 18, marginBottom: 6 } as const;
  const input = { backgroundColor: ud.surface, borderWidth: 1, borderColor: ud.hairline, borderRadius: ud.radiusSm, padding: 10, marginTop: 4, color: ud.text, fontSize: 16 } as const;
  const errFor = (f: string) => (err?.field === f ? <Text style={{ color: ud.plateVerified, marginTop: 4 }}>{err.text}</Text> : null);
  const busy = !!submitting;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 28 }}>Zgłoszenie na gorąco</Text>
        <Text style={{ color: ud.muted, marginTop: 6, lineHeight: 20 }}>
          Tuning, hałas, drift – zdarzenie z ostatnich 24 godzin. Zgłoszenie trafi do wojewódzkiej skrzynki „Stop agresji drogowej” Policji
          z prośbą o ukaranie kierującego i kontrolę stanu technicznego pojazdu. Wersja testowa.
        </Text>

        <Text style={label}>Co się dzieje?</Text>
        <View style={{ gap: 10 }}>
          {cats.map((c) => {
            const on = category === c.id;
            return (
              <Pressable key={c.id} onPress={() => { setCategory(c.id); setErr(null); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: ud.radiusSm, backgroundColor: ud.surface, borderWidth: 2, borderColor: on ? ud.primary : 'transparent' }}>
                <Image source={{ uri: `${udConfig.base}/img/${c.id}.jpg` }} style={{ width: 56, height: 56, borderRadius: ud.radiusButton, backgroundColor: ud.surfaceCream }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading }}>{c.title}</Text>
                  {c.short ? <Text style={{ color: ud.text, marginTop: 2 }}>{c.short}</Text> : null}
                  {c.price ? <Text style={{ color: ud.muted, marginTop: 2, fontSize: 13 }}>{c.price}</Text> : null}
                </View>
                <Pressable onPress={() => setInfo(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Więcej o: ${c.title}`}>
                  <Text style={{ color: ud.primary, textDecorationLine: 'underline' }}>więcej</Text>
                </Pressable>
              </Pressable>
            );
          })}
          {cats.length === 0 ? <ActivityIndicator color={ud.primary} /> : null}
        </View>
        {info ? (
          <View style={{ marginTop: 10, padding: 12, borderRadius: ud.radiusSm, backgroundColor: ud.surfaceCream }}>
            <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading }}>{info.title}</Text>
            {info.desc ? <HtmlText html={info.desc} /> : null}
            {info.law ? <Text style={{ color: ud.muted, marginTop: 6, fontSize: 13 }}>{info.law}</Text> : null}
            <Pressable onPress={() => setInfo(null)} style={{ marginTop: 6 }}><Text style={{ color: ud.primary }}>Zamknij</Text></Pressable>
          </View>
        ) : null}
        {errFor('category')}

        <Text style={label}>Numer rejestracyjny</Text>
        <TextInput {...inputColors} value={plateId} onChangeText={(t) => setPlateId(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="np. WX 12345" style={[input, { fontFamily: ud.fontBodyBold, letterSpacing: 1 }]} />
        {errFor('plateId')}

        <Text style={label}>Dowody (opcjonalne)</Text>
        <Text style={{ color: ud.muted, marginBottom: 8, lineHeight: 20 }}>Nagraj krótki film z dźwiękiem albo zrób zdjęcie. Możesz też zgłosić bez materiałów – wtedy liczy się Twoja relacja.</Text>
        {video ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: ud.radiusSm, backgroundColor: ud.surface }}>
            <Text style={{ color: ud.text, fontFamily: ud.fontBodyBold }}>🎬 Nagranie{video.size ? ` · ${fmtMB(video.size)}` : ''}{video.uri ? '' : ' (dołączone)'}</Text>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              {waitingVideo ? null : <Pressable onPress={() => navigation.navigate('AdHocCamera')} disabled={busy}><Text style={{ color: ud.primary }}>Nagraj ponownie</Text></Pressable>}
              <Pressable onPress={removeVideo} disabled={busy}><Text style={{ color: ud.plateVerified }}>Usuń</Text></Pressable>
            </View>
          </View>
        ) : (
          <UdButton title="🎬 Nagraj film" variant="accent" onPress={() => navigation.navigate('AdHocCamera')} disabled={busy} />
        )}
        {errFor('video')}
        {/* klatki da się wyciągnąć tylko z nagrania na telefonie – przy edycji film jest już na serwerze */}
        {video?.uri && !photoUri ? (
          <View style={{ marginTop: 10 }}>
            <UdButton title="🖼️ Wybierz klatkę z tablicą" variant="outline" onPress={() => navigation.navigate('AdHocFrame', { videoUri: video.uri })} disabled={busy} />
          </View>
        ) : null}
        <View style={{ marginTop: 10 }}>
          {photoUri ? (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Image source={{ uri: photoUri }} style={{ width: 96, height: 72, borderRadius: ud.radiusSm, backgroundColor: '#000' }} resizeMode="contain" />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ color: ud.muted, fontSize: 13 }}>{photoFromVideo ? 'Klatka z nagrania' : 'Zdjęcie'}</Text>
                  <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
                    {photoFromVideo && video?.uri
                      ? <Pressable onPress={() => navigation.navigate('AdHocFrame', { videoUri: video.uri })} disabled={busy}><Text style={{ color: ud.primary }}>Inna klatka</Text></Pressable>
                      : <Pressable onPress={addPhoto} disabled={busy}><Text style={{ color: ud.primary }}>Zrób inne</Text></Pressable>}
                    <Pressable onPress={removePhoto} disabled={busy}><Text style={{ color: ud.plateVerified }}>Usuń</Text></Pressable>
                  </View>
                </View>
              </View>
              {alpr?.uri === photoUri ? (
                alpr.state === 'busy' ? (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }}><ActivityIndicator color={ud.primary} /><Text style={{ color: ud.muted }}>Odczytuję tablicę…</Text></View>
                ) : alpr.state === 'done' && alpr.plate ? (
                  alpr.plate === plateId.replace(/\s/g, '')
                    ? <Text style={{ color: ud.text, marginTop: 8 }}>Odczytano tablicę: <Text style={{ fontFamily: ud.fontBodyBold }}>{alpr.plate}</Text> – sprawdź numer powyżej.</Text>
                    : <Text style={{ color: ud.text, marginTop: 8 }}>Odczyt ze zdjęcia: <Text style={{ fontFamily: ud.fontBodyBold }}>{alpr.plate}</Text>{'  '}<Text onPress={() => setPlateId(alpr.plate!)} style={{ color: ud.primary, textDecorationLine: 'underline' }}>Użyj</Text></Text>
                ) : (
                  <Text style={{ color: ud.muted, marginTop: 8 }}>{alpr.text ?? 'Nie odczytano tablicy – wybierz ostrzejszą klatkę albo wpisz numer.'}</Text>
                )
              ) : null}
            </View>
          ) : (
            <UdButton title="📷 Zrób zdjęcie" variant="outline" onPress={addPhoto} disabled={busy} />
          )}
        </View>

        <Text style={label}>Miejsce</Text>
        {locating === 'wait' && !place ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator color={ud.primary} /><Text style={{ color: ud.muted }}>Ustalam Twoją lokalizację…</Text></View>
        ) : null}
        {locating === 'off' && !place ? <Text style={{ color: ud.plateVerified }}>Brak lokalizacji z telefonu – wskaż miejsce na mapie.</Text> : null}
        {place ? (
          <>
            <TextInput {...inputColors} value={address} onChangeText={setAddress} placeholder="Ulica 10, Miasto" style={input} />
            <MapPreview lat={place.lat} lng={place.lng} hideLabel />
          </>
        ) : null}
        <Pressable onPress={() => setMapOpen(true)} style={{ marginTop: 8 }} disabled={busy}>
          <Text style={{ color: ud.primary, textDecorationLine: 'underline' }}>{place ? 'Popraw na mapie' : 'Wskaż na mapie'}</Text>
        </Pressable>
        {errFor('address')}

        <Text style={label}>Opis (opcjonalny)</Text>
        <TextInput {...inputColors} value={comment} onChangeText={setComment} multiline placeholder="np. kilkukrotne „strzały” z wydechu przy przejściu dla pieszych" style={{ ...input, minHeight: 80, textAlignVertical: 'top' }} />
        {errFor('comment')}

        <Text style={{ color: ud.muted, marginTop: 14, fontSize: 13 }}>
          Czas zdarzenia: {localIso(at.current).replace('T', ', ').slice(0, 17)} – {waitingVideo ? 'chwila nagrania' : 'teraz, w chwili zgłoszenia'}. Zgłaszasz jako naoczny świadek.
        </Text>
        {errFor('datetime')}
        {err && !err.field ? <Text style={{ color: ud.plateVerified, marginTop: 10 }}>{err.text}</Text> : null}

        <View style={{ marginTop: 20 }}>
          {busy ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 12 }}><ActivityIndicator color={ud.primary} /><Text style={{ color: ud.text }}>{submitting}</Text></View>
          ) : (
            <UdButton title="Dalej" onPress={submit} />
          )}
        </View>
      </ScrollView>
      <MapPicker visible={mapOpen} initial={place ? { lat: place.lat, lng: place.lng } : null} fallback={mapStart} onConfirm={onMapConfirm} onClose={() => setMapOpen(false)} />
    </KeyboardAvoidingView>
  );
}
