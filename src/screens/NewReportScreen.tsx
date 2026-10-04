import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { type UdApp, imageUrl } from '../api/apps';
import { fetchConfig } from '../api/dashboard';
import { fetchCategories, reverseGeocode } from '../api/geo';
import { fetchRecydywa } from '../api/recydywa';
import {
  createDraft, deleteReportImage, fetchReport, fetchVehicleDescription, finishReport, saveReport, searchAddress, uploadReportImage,
  type PictureType, type ReportForm,
} from '../api/reports';
import { ApiError, validIdToken } from '../api/udApi';
import { pickPhoto } from '../lib/gallery';
import { log } from '../lib/log';
import { appendAutoLine, fmtLongDate, plural } from '../lib/reports';
import { UdButton, UdHeader, UdTabs } from '../components/UD';
import { udConfig } from '../config';
import { useNewReport } from '../store/useNewReport';
import { ud } from '../theme';
import type { Category, GeoAddress, RecydywaInfo } from '../types';

type Extension = { title: string; price?: string; disabled?: boolean };
type Groups = Record<string, { name: string }>;

// Stan formularza = pola z webowego nowe-zgloszenie.html.twig. Walidacja domenowa jest po stronie serwera
// (updateApplication w API.php) – klient sprawdza tylko, czy są zdjęcia, i pokazuje błędy `field` z 422.
type Form = {
  plateId: string;
  address: string;
  geo: GeoAddress | null;
  lat: number | null;
  lng: number | null;
  datetime: string; // "YYYY-MM-DDTHH:mm:ss"
  dtFromPicture: boolean;
  category: number;
  extensions: number[];
  comment: string;
  witness: boolean;
  unit: 'SA' | 'SM';
};

const EMPTY: Form = {
  plateId: '', address: '', geo: null, lat: null, lng: null, datetime: '', dtFromPicture: true,
  category: 0, extensions: [], comment: '', witness: false, unit: 'SA',
};

const pad = (n: number) => String(n).padStart(2, '0');
const nowIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`; };
// "2026-09-10 19:43" (pole tekstowe) → ISO; null gdy nie pasuje
const parseTyped = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(s.trim()); return m ? `${m[1]}-${m[2]}-${m[3]}T${pad(+m[4])}:${m[5]}:00` : null; };
const typed = (iso: string) => iso.replace('T', ' ').slice(0, 16);

// Zgłoszenie z backendu → stan formularza (tryb edycji / wznowienie szkicu / odpowiedź po uploadzie).
function formFromApp(a: UdApp, prev: Form = EMPTY): Form {
  return {
    ...prev,
    plateId: a.carInfo?.plateId ?? prev.plateId,
    address: a.address?.address ?? prev.address,
    lat: a.address?.lat ?? prev.lat,
    lng: a.address?.lng ?? prev.lng,
    datetime: a.date ?? prev.datetime,
    dtFromPicture: a.dtFromPicture ?? prev.dtFromPicture,
    category: Number(a.category ?? 0),
    extensions: (a.extensions ?? []).map(Number),
    comment: a.userComment ?? prev.comment,
    witness: !!a.statements?.witness,
    unit: a.stopAgresji ? 'SA' : 'SM',
  };
}

const H = ({ children }: { children: string }) => (
  <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 22, marginTop: 24, marginBottom: 6 }}>{children}</Text>
);
const L = ({ children }: { children: React.ReactNode }) => <Text style={{ color: ud.muted, fontSize: 13, marginTop: 12 }}>{children}</Text>;
const input = { backgroundColor: ud.surface, borderWidth: 1, borderColor: ud.hairline, borderRadius: ud.radiusSm, padding: 10, marginTop: 4, color: ud.text } as const;

function Check({ on, onPress, children, disabled }: { on: boolean; onPress: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: disabled ? 0.4 : 1 }}>
      <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: ud.primary, backgroundColor: on ? ud.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Text style={{ color: '#fff', fontSize: 14, lineHeight: 16 }}>✓</Text> : null}
      </View>
      <Text style={{ flex: 1, color: ud.text }}>{children}</Text>
    </Pressable>
  );
}

function Radio({ on, onPress, children, disabled }: { on: boolean; onPress: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: disabled ? 0.4 : 1 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: ud.primary, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ud.primary }} /> : null}
      </View>
      <Text style={{ flex: 1, color: ud.text }}>{children}</Text>
    </Pressable>
  );
}

function PhotoSlot({ title, hint, app, type, busy, onPick, onRemove }: {
  title: string; hint?: string; app: UdApp | null; type: PictureType; busy: boolean; onPick: () => void; onRemove?: () => void;
}) {
  const uri = app ? imageUrl(app[type], app) : null;
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontFamily: ud.fontBodyBold, color: ud.text }}>{title}</Text>
      {hint ? <Text style={{ color: ud.muted, fontSize: 13 }}>{hint}</Text> : null}
      <Pressable onPress={onPick} disabled={busy} style={{ marginTop: 6, height: 190, borderRadius: ud.radiusSm, backgroundColor: ud.surfaceCream, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold }}>＋ Dodaj zdjęcie z galerii</Text>}
        {busy ? <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={ud.primary} /></View> : null}
      </Pressable>
      {uri && onRemove ? <Pressable onPress={onRemove} disabled={busy}><Text style={{ color: ud.muted, textDecorationLine: 'underline', marginTop: 6 }}>usuń zdjęcie</Text></Pressable> : null}
      {uri && !onRemove ? <Pressable onPress={onPick} disabled={busy}><Text style={{ color: ud.muted, textDecorationLine: 'underline', marginTop: 6 }}>zmień zdjęcie</Text></Pressable> : null}
    </View>
  );
}

export function NewReportScreen({ navigation, route }: any) {
  const go = (r: string) => navigation.navigate(r);
  const editId: string | undefined = route?.params?.editId;
  const { draftId, hydrated, hydrate, setDraftId, setDone } = useNewReport();

  const [app, setApp] = useState<UdApp | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [cats, setCats] = useState<Category[]>([]);
  const [groups, setGroups] = useState<Groups>({});
  const [exts, setExts] = useState<Record<string, Extension>>({});
  const [showAllCats, setShowAllCats] = useState(false);
  const [editDate, setEditDate] = useState(false);
  const [dateText, setDateText] = useState('');
  const [uploading, setUploading] = useState<PictureType | null>(null);
  const [recydywa, setRecydywa] = useState<RecydywaInfo | null>(null);
  const [weightWarning, setWeightWarning] = useState<string | null>(null);
  const [addrNote, setAddrNote] = useState<string | null>(null);
  const autoLine = useRef<string | null>(null); // ostatnia automatyczna linia „Pojazd marki …” w komentarzu
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<{ field?: string; text: string } | null>(null);
  const edited = useRef({ plate: false, address: false }); // ręczne poprawki nie są nadpisywane danymi ze zdjęcia

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fail = (e: any) => { const m = e?.message ?? String(e); log.error('nowe', m); setErr({ field: e instanceof ApiError ? e.field : undefined, text: m }); };

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => {
    fetchCategories().then(setCats);
    fetchConfig<Groups>('category-groups').then(setGroups);
    fetchConfig<Record<string, Extension>>('extensions').then(setExts);
  }, []);

  // Wejście: tryb edycji (?editId) albo wznowienie szkicu z poprzedniej sesji – jak `$_SESSION['newAppId']`.
  useEffect(() => {
    if (!hydrated) return;
    const id = editId ?? draftId;
    if (!id) { setLoading(false); return; }
    fetchReport(id)
      .then((a) => {
        if (!['draft', 'ready', 'confirmed'].includes(a.status)) throw new Error('nieedytowalne'); // jak isEditable() na webie
        edited.current = { plate: true, address: true };
        setApp(a);
        setForm(formFromApp(a));
        if (!editId) setDraftId(a.id);
      })
      .catch(() => { if (!editId) setDraftId(null); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, editId]);

  const applyApp = useCallback((a: UdApp) => {
    setApp(a);
    setForm((f) => {
      const n = formFromApp(a, f);
      return { ...n, plateId: edited.current.plate ? f.plateId : n.plateId, address: edited.current.address ? f.address : n.address,
        category: f.category, extensions: f.extensions, comment: f.comment, witness: f.witness, unit: f.unit };
    });
  }, []);

  // GPS zdjęcia auta → adres (reverse geocode, edytowalny) + podpowiedź SM/Policja.
  const lat = form.lat, lng = form.lng;
  useEffect(() => {
    if (lat == null || lng == null || edited.current.address) return;
    validIdToken().then((t) => reverseGeocode(lat, lng, t)).then((g) => {
      if (g && !edited.current.address) setForm((f) => ({ ...f, address: g.display, geo: g }));
    }).catch(() => {});
  }, [lat, lng]);

  // Recydywa + opis pojazdu po wpisaniu tablicy (debounce). Linię „Pojazd marki …” i ostrzeżenie o masie
  // liczy backend (GET /api/rest/vehicle/{plate}); tu tylko dopisujemy ją do komentarza jak web.
  const ocrBrand = app?.carInfo?.brand, ocrModel = app?.carInfo?.model;
  useEffect(() => {
    const plate = form.plateId.replace(/\s/g, '');
    if (plate.length < 4) { setRecydywa(null); setWeightWarning(null); return; }
    const t = setTimeout(() => {
      validIdToken().then((tok) => fetchRecydywa(plate, tok)).then(setRecydywa).catch(() => {});
      fetchVehicleDescription(plate, { brand: ocrBrand, model: ocrModel }).then((v) => {
        setWeightWarning(v?.weightWarning ?? null);
        const line = v?.comment ?? null;
        setForm((f) => ({ ...f, comment: appendAutoLine(f.comment, line, autoLine.current) }));
        autoLine.current = line;
      });
    }, 700);
    return () => clearTimeout(t);
  }, [form.plateId, ocrBrand, ocrModel]);

  // Ręcznie wpisany adres → współrzędne + miasto/województwo (bez nich backend nie ustali SM/Policji).
  const lookupAddress = async () => {
    const q = form.address.trim();
    if (!edited.current.address || !q) return;
    try {
      const r = await searchAddress(q);
      if (!r) { setAddrNote('Nie znaleziono adresu – użyj formatu „Ulica 10, Miasto”.'); return; }
      setAddrNote(null);
      setForm((f) => ({ ...f, lat: r.lat, lng: r.lng, geo: r.geo }));
    } catch (e) { setAddrNote(null); log.warn('nowe', String((e as any)?.message ?? e)); }
  };

  const ensureDraft = async (): Promise<UdApp> => {
    if (app) return app;
    const a = await createDraft();
    setApp(a);
    if (!editId) setDraftId(a.id);
    return a;
  };

  const pick = async (type: PictureType) => {
    setErr(null);
    try {
      const photo = await pickPhoto();
      if (!photo) return;
      setUploading(type);
      const draft = await ensureDraft();
      const a = await uploadReportImage(draft.id, type, photo.uri, { dateTime: photo.exif.datetimeOriginal ? exifToIso(photo.exif.datetimeOriginal) : null, lat: photo.exif.lat, lng: photo.exif.lng });
      applyApp(a);
      if (type === 'carImage' && !a.date) setForm((f) => ({ ...f, datetime: f.datetime || nowIso(), dtFromPicture: false }));
    } catch (e) { fail(e); } finally { setUploading(null); }
  };

  const remove = async (type: PictureType) => {
    if (!app) return;
    setUploading(type);
    try { setApp(await deleteReportImage(app.id, type)); } catch (e) { fail(e); } finally { setUploading(null); }
  };

  const selectedCat = cats.find((c) => c.id === form.category);
  const forcePolice = !!selectedCat?.stopAgresjiOnly;
  const unit = forcePolice ? 'SA' : form.unit;
  const topCats = useMemo(() => cats.filter((c) => c.title && c.groups?.includes(0)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)), [cats]);
  const catGroups = useMemo(() => Object.entries(groups).filter(([id]) => id !== '0').map(([id, g]) => ({
    name: g.name, items: cats.filter((c) => c.title && c.groups?.includes(Number(id))).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
  })), [cats, groups]);

  const submit = async () => {
    setErr(null);
    if (!app?.contextImage?.thumb || !app?.carImage?.thumb) { setErr({ field: 'images', text: 'Dodaj zdjęcie kontekstu i zdjęcie auta.' }); return; }
    setSubmitting(true);
    try {
      const body: ReportForm = {
        plateId: form.plateId.trim(), address: form.address.trim(), addressGPS: form.geo?.display,
        city: form.geo?.city, voivodeship: form.geo?.voivodeship, district: form.geo?.district, county: form.geo?.county,
        municipality: form.geo?.municipality, postcode: form.geo?.postcode, lat: form.lat, lng: form.lng,
        datetime: form.datetime || nowIso(), dtFromPicture: form.dtFromPicture, category: form.category,
        extensions: form.extensions, comment: form.comment.trim(), witness: form.witness, stopAgresji: unit,
      };
      await saveReport(app.id, body);
      const result = await finishReport(app.id, true); // „Potwierdź” + wyślij jednym przyciskiem
      setDraftId(null);
      setDone(result);
      navigation.replace('ReportDone'); // replace: „Dodaj kolejne” musi zacząć z czystego formularza
    } catch (e) { fail(e); } finally { setSubmitting(false); }
  };

  const fieldErr = (f: string) => (err?.field === f ? <Text style={{ color: ud.plateVerified, marginTop: 4 }}>{err.text}</Text> : null);
  if (loading) return <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}><UdHeader /><ActivityIndicator style={{ marginTop: 40 }} color={ud.primary} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 28 }}>{editId ? `Edycja${app?.number ? ` ${app.number}` : ''}` : 'Nowe zgłoszenie'}</Text>

        <PhotoSlot title="1. Zdjęcie kontekstu" hint={selectedCat?.contextImageHint || 'Pokaż miejsce i otoczenie pojazdu.'} app={app} type="contextImage" busy={uploading === 'contextImage'} onPick={() => pick('contextImage')} />
        {fieldErr('images')}
        <PhotoSlot title="2. Zdjęcie auta" hint={selectedCat?.carImageHint || 'Cały pojazd z widoczną tablicą rejestracyjną.'} app={app} type="carImage" busy={uploading === 'carImage'} onPick={() => pick('carImage')} />
        <PhotoSlot title="3. Dodatkowe zdjęcie (opcjonalnie)" app={app} type="thirdImage" busy={uploading === 'thirdImage'} onPick={() => pick('thirdImage')} onRemove={() => remove('thirdImage')} />

        <H>Data i miejsce</H>
        <L>Data i czas zgłoszenia</L>
        {editDate ? (
          <TextInput style={input} value={dateText} onChangeText={(t) => { setDateText(t); const iso = parseTyped(t); if (iso) setForm((f) => ({ ...f, datetime: iso, dtFromPicture: false })); }} placeholder="RRRR-MM-DD GG:MM" keyboardType="numbers-and-punctuation" />
        ) : (
          <Text style={{ color: ud.text, fontFamily: ud.fontBodyBold, marginTop: 4 }}>
            {form.datetime ? fmtLongDate(form.datetime) : 'zostanie ustawiona na teraz'}{'  '}
            <Text style={{ color: ud.primary }} onPress={() => { setDateText(typed(form.datetime || nowIso())); setEditDate(true); }}>(zmień)</Text>
          </Text>
        )}
        {fieldErr('datetime')}

        <L>Numer rejestracyjny</L>
        <TextInput style={[input, { fontFamily: ud.fontBodyBold, letterSpacing: 1 }]} value={form.plateId} autoCapitalize="characters" autoCorrect={false} placeholder="np. ZS 060NH" onChangeText={(t) => { edited.current.plate = true; set('plateId', t); }} />
        {fieldErr('plateId')}
        {weightWarning ? <Text style={{ color: ud.warning, marginTop: 6 }}>{weightWarning}</Text> : null}
        {recydywa && recydywa.appsCnt > 0 ? (
          <Text style={{ color: ud.text, marginTop: 6 }}>❗ Ten pojazd był już zgłaszany: {plural(recydywa.appsCnt, ['wykroczeń', 'wykroczenie', 'wykroczenia'])}.</Text>
        ) : null}

        <L>Adres (z GPS zdjęcia, możesz poprawić)</L>
        <TextInput style={input} value={form.address} maxLength={70} placeholder="Ulica 10a, Miasto" onChangeText={(t) => { edited.current.address = true; setAddrNote(null); set('address', t); }} onEndEditing={lookupAddress} />
        {addrNote ? <Text style={{ color: ud.warning, marginTop: 4 }}>{addrNote}</Text> : null}
        {fieldErr('address')}

        <L>Zgłoszenie trafi do</L>
        <Radio on={unit === 'SM'} disabled={forcePolice} onPress={() => set('unit', 'SM')}>Straż miejska{form.geo?.smName ? ` – ${form.geo.smName}` : ''}</Radio>
        <Radio on={unit === 'SA'} onPress={() => set('unit', 'SA')}>Policja{form.geo?.saName ? ` – ${form.geo.saName}` : ''}</Radio>
        {forcePolice ? <Text style={{ color: ud.muted, fontSize: 12 }}>Ta kategoria jest zawsze zgłaszana na Policję.</Text> : null}

        <H>Kategoria</H>
        {topCats.map((c) => <CategoryRow key={c.id} c={c} on={form.category === c.id} onPress={() => set('category', c.id)} />)}
        {!showAllCats ? (
          <Pressable onPress={() => setShowAllCats(true)}><Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, marginTop: 8 }}>Pokaż wszystkie</Text></Pressable>
        ) : (
          catGroups.map((g) => (
            <View key={g.name}>
              <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading, marginTop: 16 }}>{g.name}</Text>
              {g.items.map((c) => <CategoryRow key={c.id} c={c} on={form.category === c.id} onPress={() => set('category', c.id)} />)}
            </View>
          ))
        )}
        <CategoryRow c={{ id: 0, title: 'Pozostałe przypadki', short: 'Opisz sytuację w komentarzu.' }} on={form.category === 0} onPress={() => set('category', 0)} />

        <L>Komentarz{form.category === 0 ? ' (wymagany)' : ''}</L>
        <TextInput style={[input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={form.comment} onChangeText={(t) => set('comment', t)} placeholder="Dodatkowy opis wykroczenia" />
        {fieldErr('comment')}

        {Object.keys(exts).length ? (
          <>
            <H>Czy pojazd dodatkowo:</H>
            {Object.entries(exts).filter(([, e]) => !e.disabled).map(([id, e]) => {
              const n = Number(id);
              return <Check key={id} on={form.extensions.includes(n)} onPress={() => set('extensions', form.extensions.includes(n) ? form.extensions.filter((x) => x !== n) : [...form.extensions, n])}>{`${e.title}${e.price ? ` (mandat: ${e.price})` : ''}`}</Check>;
            })}
          </>
        ) : null}

        <H>Oświadczenia</H>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ flex: 1, color: ud.text }}>Świadek momentu parkowania</Text>
          <Switch value={form.witness} onValueChange={(v) => set('witness', v)} trackColor={{ true: ud.primary }} />
        </View>

        {err && !err.field ? <Text style={{ color: ud.plateVerified, marginTop: 14 }}>{err.text}</Text> : null}
        <View style={{ marginTop: 20 }}>
          <UdButton title={submitting ? 'Wysyłam…' : 'Potwierdź i wyślij'} onPress={submit} disabled={submitting || !!uploading} />
        </View>
        <Text style={{ color: ud.muted, fontSize: 12, marginTop: 6 }}>Zgłoszenie zostanie potwierdzone i wysłane do wskazanego adresata (jeśli ma automatyczny kanał wysyłki).</Text>
      </ScrollView>
      <UdTabs current="NewReport" navigate={go} />
    </View>
  );
}

function CategoryRow({ c, on, onPress }: { c: Category; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: ud.primary, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ud.primary }} /> : null}
      </View>
      <Image source={{ uri: `${udConfig.base}/img/${c.id}.jpg` }} style={{ width: 44, height: 44, borderRadius: ud.radiusSm, backgroundColor: ud.surfaceCream }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: ud.fontBodyBold, color: ud.text }}>{c.title}{c.points && c.points > 1 ? `  (${c.points} pkt)` : ''}</Text>
        {c.short ? <Text style={{ color: ud.muted, fontSize: 12 }} numberOfLines={2}>{c.short}</Text> : null}
        {c.mandate ? <Text style={{ color: ud.muted, fontSize: 12 }}>Mandat {c.mandate > 100 ? '~' : ''}{c.mandate} zł</Text> : null}
      </View>
    </Pressable>
  );
}

// EXIF "2026:09:10 19:43:00" → ISO "2026-09-10T19:43:00" (to samo robi web w images.js)
function exifToIso(s: string): string | null {
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}
