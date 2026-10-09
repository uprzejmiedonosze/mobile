import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { type UdApp, imageUrl } from '../api/apps';
import { fetchConfig } from '../api/dashboard';
import { fetchCategories, reverseGeocode } from '../api/geo';
import { fetchRecydywa } from '../api/recydywa';
import {
  createDraft, fetchReport, fetchVehicleDescription, saveReport, searchAddress, type ReportForm,
} from '../api/reports';
import { ApiError, isPhotoQuotaError, validIdToken } from '../api/udApi';
import { fetchProfile } from '../api/user';
import { log } from '../lib/log';
import { commentWarning, dropMatchingExtension, exifToIso, fmtLongDate, isExtensionDisabled, plural } from '../lib/reports';
import { MapPicker, type PickedPlace } from '../components/MapPicker';
import { MapPreview } from '../components/MapPreview';
import { CROP_TILE_ID, PhotosSection, type Tile } from '../components/PhotosSection';
import { PhotoQuotaNotice } from '../components/PhotoQuotaNotice';
import { UdButton, UdHeader, UdTabs } from '../components/UD';
import { openUdPage } from '../lib/openPage';
import { usePhotoQuota } from '../lib/usePhotoQuota';
import { PATRONEM_DEFAULT } from '../lib/sex';
import { usePhotoBatch } from '../lib/usePhotoBatch';
import { SLOT_ORDER } from '../lib/roles';
import type { Slot, Suggestion } from '../lib/suggest';
import { udConfig } from '../config';
import { useNewReport } from '../store/useNewReport';
import { toast } from '../store/useToast';
import { ud } from '../theme';
import type { Category, GeoAddress, PhotoItem, RecydywaInfo } from '../types';

type Extension = { title: string; price?: string; disabled?: boolean };
type Groups = Record<string, { name: string }>;

// Stan formularza = pola z webowego nowe-zgloszenie.html.twig. Walidacja domenowa jest po stronie serwera
// (updateApplication w API.php) – klient sprawdza tylko, czy są zdjęcia, i pokazuje błędy `field` z 422.
type Form = {
  plateId: string;
  plateId2: string; // „Oba”: drugi pojazd łamiący te same przepisy (pusty = zgłoszenie o jednym pojeździe)
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
  plateId: '', plateId2: '', address: '', geo: null, lat: null, lng: null, datetime: '', dtFromPicture: true,
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
    extensions: dropMatchingExtension((a.extensions ?? []).map(Number), Number(a.category ?? 0)),
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

function Radio({ on, onPress, children, disabled, hint }: { on: boolean; onPress: () => void; children: React.ReactNode; disabled?: boolean; hint?: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: ud.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ud.primary }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: ud.text }}>{children}</Text>
        {hint ? <Text style={{ color: ud.muted, fontSize: 12, marginTop: 2 }}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

export function NewReportScreen({ navigation, route }: any) {
  const go = (r: string) => navigation.navigate(r);
  const editId: string | undefined = route?.params?.editId;
  const { draftId, hydrated, hydrate, setDraftId } = useNewReport();

  const [app, setApp] = useState<UdApp | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [cats, setCats] = useState<Category[]>([]);
  const [groups, setGroups] = useState<Groups>({});
  const [exts, setExts] = useState<Record<string, Extension>>({});
  const [showAllCats, setShowAllCats] = useState(false);
  const [editDate, setEditDate] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapStart, setMapStart] = useState<{ lat: number; lng: number } | null>(null);
  const [plateTouched, setPlateTouched] = useState(false); // web chowa wycinek tablicy po ręcznej zmianie numeru
  const [dateText, setDateText] = useState('');
  const [recydywa, setRecydywa] = useState<RecydywaInfo | null>(null);
  const [recydywa2, setRecydywa2] = useState<RecydywaInfo | null>(null);
  const [weightWarning2, setWeightWarning2] = useState<string | null>(null);
  const [bylam, setBylam] = useState('byłam/em'); // odmiana przez płeć użytkownika
  const [patron, setPatron] = useState(PATRONEM_DEFAULT); // „Patronem/Patronką” – j.w.
  const [weightWarning, setWeightWarning] = useState<string | null>(null);
  const [addrNote, setAddrNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [geoBusy, setGeoBusy] = useState(0); // trwające geokodowanie (jak na webie: wysyłka zablokowana do czasu adresu)
  const resolvedText = useRef(''); // tekst adresu, dla którego współrzędne/miasto są aktualne
  const [err, setErr] = useState<{ field?: string; text: string } | null>(null);
  const edited = useRef({ plate: false, address: false }); // ręczne poprawki nie są nadpisywane danymi ze zdjęcia

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  // Błąd pola (422 z `field`) – przy polu; wszystko inne (upload, sieć…) jako toast, bo formularz jest długi
  // i komunikat na jego dole nie jest widoczny.
  const { quota, setQuota, refresh: refreshQuota } = usePhotoQuota();
  const fail = useCallback((e: any) => {
    const m = e?.message ?? String(e);
    log.error('nowe', m);
    const field = e instanceof ApiError ? e.field : undefined;
    if (isPhotoQuotaError(e) && e.quota) setQuota(e.quota); // serwer odmówił – licznik z błędu, bez dodatkowego żądania
    if (field) setErr({ field, text: m });
    toast.error(m); // formularz jest długi – błąd pola mógłby zostać poza ekranem
  }, [setQuota]);

  useEffect(() => { hydrate(); }, [hydrate]);
  // Punkt startowy mapy jak na www: ostatnie zgłoszenie → adres zamieszkania → (brak) środek Polski. Odświeżane przy
  // każdym wejściu na ekran, bo wysłanie zgłoszenia przesuwa „ostatnią lokalizację” po stronie backendu.
  useFocusEffect(useCallback(() => {
    fetchProfile().then((p) => { setBylam(p.bylam); setPatron(p.patronem); setMapStart(p.lastLocation); }).catch(() => {});
  }, []));
  useFocusEffect(useCallback(() => { refreshQuota(); }, [refreshQuota])); // licznik limitu zdjęć przy każdym wejściu na ekran
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
        resolvedText.current = a.address?.address ?? '';
        setApp(a);
        setForm(formFromApp(a));
        if (!editId) setDraftId(a.id);
      })
      .catch(() => { if (!editId) setDraftId(null); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, editId]);

  // Backend nadpisuje pliki o stałej nazwie (`{id},ca,p.jpg` – wycinek tablicy, miniatury ról), a nginx daje im `expires max`, więc po
  // każdej odpowiedzi po uploadzie zmieniamy parametr w URL. Musi być UNIKALNY między sesjami (znacznik czasu, nie licznik od 0):
  // przy wznowionym szkicu licznik dawał ten sam URL co w poprzednim uruchomieniu i dysk (cache obrazów) pokazywał starą tablicę.
  const [rev, setRev] = useState(() => Date.now());
  // `carMeta` = upload zdjęcia auta: co z niego faktycznie wyczytaliśmy (GPS, data). Jak na webie, nowe zdjęcie auta
  // zastępuje numer z ALPR (także po ręcznej poprawce – to może być inne auto), a brak GPS/daty NIE zostawia
  // lokalizacji i daty poprzedniego zdjęcia (serwer aktualizuje je tylko, gdy przyszły) – patrz noGeoDataInImage()/setDateTime().
  const applyApp = useCallback((a: UdApp, carMeta?: { gps: boolean; date: boolean }) => {
    setApp(a);
    setRev(Date.now());
    if (carMeta) {
      edited.current.plate = false;
      if (!carMeta.gps) { edited.current.address = false; resolvedText.current = ''; geoFor.current = null; }
      setEditDate(false);
    }
    setForm((f) => {
      const n = formFromApp(a, f);
      let out: Form = { ...n, plateId: edited.current.plate ? f.plateId : n.plateId, address: edited.current.address ? f.address : n.address,
        category: f.category, extensions: f.extensions, comment: f.comment, witness: f.witness, unit: f.unit, plateId2: f.plateId2 };
      if (carMeta && !carMeta.gps) out = { ...out, lat: null, lng: null, geo: null, address: '' };
      if (carMeta) out = carMeta.date ? { ...out, dtFromPicture: true } : { ...out, dtFromPicture: false, datetime: nowIso() };
      return out;
    });
  }, []);

  // Współrzędne (GPS zdjęcia auta, mapa, wznowiony szkic) → dane adresowe i odbiorca (SM/Policja z hintami).
  // Tekst adresu podmieniamy tylko, gdy użytkownik go sam nie poprawiał.
  const lat = form.lat, lng = form.lng;
  const geoFor = useRef<string | null>(null); // współrzędne, dla których geo już pobraliśmy
  useEffect(() => {
    if (lat == null || lng == null) return;
    const key = `${lat},${lng}`;
    if (geoFor.current === key) return;
    geoFor.current = key;
    setGeoBusy((n) => n + 1);
    validIdToken().then((t) => reverseGeocode(lat, lng, t)).then((g) => {
      if (g) setForm((f) => {
        const address = edited.current.address ? f.address : g.display;
        if (!edited.current.address) resolvedText.current = address;
        return { ...f, geo: g, address };
      });
    }).catch(() => {}).finally(() => setGeoBusy((n) => n - 1));
  }, [lat, lng]);

  // Recydywa i ostrzeżenie o masie po wpisaniu tablicy (debounce). Marka/model pojazdu trafia do treści zgłoszenia po stronie
  // serwera (carInfo.vehicle, parkowanie.info) – komentarz należy do użytkownika i nie jest tu ruszany.
  useEffect(() => {
    const plate = form.plateId.replace(/\s/g, '');
    const plate2 = form.plateId2.replace(/\s/g, '');
    if (plate2.length < 4) { setRecydywa2(null); setWeightWarning2(null); }
    if (plate.length < 4) { setRecydywa(null); setWeightWarning(null); }
    const t = setTimeout(() => {
      if (plate.length >= 4) {
        validIdToken().then((tok) => fetchRecydywa(plate, tok)).then(setRecydywa).catch(() => {});
        fetchVehicleDescription(plate).then((v) => setWeightWarning(v?.warning ?? null));
      }
      if (plate2.length >= 4) {
        validIdToken().then((tok) => fetchRecydywa(plate2, tok)).then(setRecydywa2).catch(() => {});
        fetchVehicleDescription(plate2).then((v) => setWeightWarning2(v?.warning ?? null));
      }
    }, 700);
    return () => clearTimeout(t);
  }, [form.plateId, form.plateId2]);

  // Ręcznie wpisany adres → współrzędne + miasto/województwo (bez nich backend nie ustali SM/Policji).
  const lookupAddress = async () => {
    const q = form.address.trim();
    if (!edited.current.address || !q || q === resolvedText.current) return;
    setGeoBusy((n) => n + 1);
    try {
      const r = await searchAddress(q);
      if (!r) { setAddrNote('Nie znaleziono adresu – użyj formatu „Ulica 10, Miasto”.'); return; }
      setAddrNote(null);
      resolvedText.current = q;
      geoFor.current = `${r.lat},${r.lng}`; // współrzędne z wyszukiwania mają już dane adresowe – bez ponownego reverse geocode
      setForm((f) => ({ ...f, lat: r.lat, lng: r.lng, geo: r.geo }));
    } catch (e) { setAddrNote(null); log.warn('nowe', String((e as any)?.message ?? e)); }
    finally { setGeoBusy((n) => n - 1); }
  };

  // Przed zapisem: współrzędne + miejscowość muszą być znane (web: checkAddress; serwer też to egzekwuje). Dokańczamy
  // geokodowanie, które mogło jeszcze trwać albo się nie udać (np. tekst wpisany tuż przed „Dalej”).
  const resolvePlace = async (): Promise<{ lat: number; lng: number; geo: GeoAddress } | null> => {
    const q = form.address.trim();
    try {
      if (edited.current.address && q.length > 3 && q !== resolvedText.current) {
        const r = await searchAddress(q);
        if (r?.geo.city) { resolvedText.current = q; geoFor.current = `${r.lat},${r.lng}`; setForm((f) => ({ ...f, lat: r.lat, lng: r.lng, geo: r.geo })); return r; }
      }
      if (form.lat != null && form.lng != null) {
        if (form.geo?.city) return { lat: form.lat, lng: form.lng, geo: form.geo };
        const g = await reverseGeocode(form.lat, form.lng, await validIdToken());
        if (g?.city) { setForm((f) => ({ ...f, geo: g })); return { lat: form.lat, lng: form.lng, geo: g }; }
        return null;
      }
      if (q.length > 3) {
        const r = await searchAddress(q);
        if (r?.geo.city) { setForm((f) => ({ ...f, lat: r.lat, lng: r.lng, geo: r.geo })); return r; }
      }
    } catch (e) { log.warn('nowe', `resolvePlace: ${String((e as any)?.message ?? e)}`); }
    return null;
  };

  // Szkic powstaje przy pierwszym zdjęciu (jak na webie); promise chroni przed podwójnym utworzeniem,
  // gdy wybór zdjęć i wysyłka wołają to równocześnie.
  const appRef = useRef(app); appRef.current = app;
  const draftRef = useRef<Promise<UdApp> | null>(null);
  const ensureDraft = useCallback(async (): Promise<UdApp> => {
    if (appRef.current) return appRef.current;
    draftRef.current ??= createDraft().then((a) => {
      appRef.current = a;
      setApp(a);
      if (!editId) setDraftId(a.id);
      return a;
    });
    return draftRef.current;
  }, [editId, setDraftId]);

  // „Oba” = dwa osobne zgłoszenia: drugi szkic powstaje dopiero przy „Dalej” i jest używany ponownie przy powrocie z potwierdzenia.
  const draft2Ref = useRef<Promise<UdApp> | null>(null);
  const ensureDraft2 = () => (draft2Ref.current ??= createDraft().catch((e) => { draft2Ref.current = null; throw e; }));

  // Analiza zdjęć podpowiada kategorię (z markerów) i tablicę – tylko tam, gdzie użytkownik jeszcze nic nie wybrał.
  const onSuggestion = useCallback((s: Suggestion) => {
    setForm((f) => {
      const category = f.category === 0 && s.categoryId > 0 ? s.categoryId : f.category;
      return {
      ...f,
      category,
      extensions: dropMatchingExtension(f.extensions, category),
      plateId: f.plateId || edited.current.plate ? f.plateId : s.plate ?? '',
    }; });
  }, []);

  // Metadane zdjęcia auta z lokalnego EXIF – natychmiast, w trakcie analizy i uploadu (serwer potwierdzi te same wartości,
  // a gdy zdjęcie ich nie ma, wyczyści je w applyApp). Nowe zdjęcie auta wygrywa z wcześniejszą ręczną zmianą adresu.
  const applyCarExif = useCallback((p: PhotoItem) => {
    const { lat, lng, datetimeOriginal } = p.exif;
    const iso = exifToIso(datetimeOriginal);
    const gps = lat != null && lng != null;
    if (gps) { edited.current.address = false; resolvedText.current = ''; }
    setForm((f) => ({
      ...f,
      ...(gps ? { lat, lng, geo: null } : {}),
      ...(iso ? { datetime: iso, dtFromPicture: true } : {}),
    }));
    if (iso) setEditDate(false);
  }, []);
  const batch = usePhotoBatch({ app, ensureDraft, applyApp, onSuggestion, onError: fail, onCarExif: applyCarExif });
  const uploading = batch.busy;
  // Odpowiedź „Oba” (albo wybór jednego pojazdu / nowe zdjęcia) ustawia drugą tablicę; ręczna poprawka zostaje do następnego wyboru.
  const localPhotos = batch.photos.length > 0;
  useEffect(() => { if (localPhotos) setForm((f) => (f.plateId2 === (batch.plate2 ?? '') ? f : { ...f, plateId2: batch.plate2 ?? '' })); }, [batch.plate2, localPhotos]);
  useEffect(() => { if (batch.phase === 'ready') refreshQuota(); }, [batch.phase, refreshQuota]); // zdjęcia właśnie przetworzone → nowe zużycie

  // Bez lokalnych zdjęć (edycja / wznowiony szkic) pokazujemy te z serwera, role bez zmian.
  const SERVER: Record<Slot, 'contextImage' | 'carImage' | 'thirdImage'> = { context: 'contextImage', car: 'carImage', third: 'thirdImage' };
  const serverTiles: Tile[] = (SLOT_ORDER).flatMap((slot) => {
    const uri = app ? imageUrl(app[SERVER[slot]], app) : null;
    const full = app ? imageUrl(app[SERVER[slot]], app, true) : null;
    return uri ? [{ id: slot, uri: `${uri}&r=${rev}`, full: `${full ?? uri}&r=${rev}` }] : [];
  });
  const local = batch.photos.length > 0;
  // Jedno zdjęcie też daje DWA kafelki (oryginał + wycinek auta), żeby układ nie skakał: drugi kafelek jest od początku, a wycinek
  // wypełnia się lokalnie zaraz po odczycie tablicy (batch.cropPreview). Do powiększenia: wycinek z serwera, a gdy go brak – oryginał.
  const single = local && batch.photos.length === 1;
  const cropUri = single && app?.carImage?.thumb ? `${imageUrl(app.carImage, app)}&r=${rev}` : null;
  // kolejność kafelków: auto → kontekst → reszta (jedno zdjęcie: wycinek auta, potem oryginał)
  const roleRank = (id: string) => { const i = SLOT_ORDER.findIndex((s) => batch.slots[s] === id); return i < 0 ? SLOT_ORDER.length : i; };
  const tiles: Tile[] = local
    ? single
      ? [{ id: CROP_TILE_ID, uri: cropUri ?? batch.photos[0].uri }, { id: batch.photos[0].id, uri: batch.photos[0].uri }]
      : [...batch.photos].sort((a, b) => roleRank(a.id) - roleRank(b.id)).map((p) => ({ id: p.id, uri: p.uri }))
    : serverTiles;
  // miniatura tablicy (wycinek z ALPR z serwera) – pod zdjęciem auta
  const plateThumb = app?.carInfo?.plateImage && app?.carImage?.thumb ? `${imageUrl({ thumb: app.carInfo.plateImage }, app)}&r=${rev}` : null;
  const tileSlots = local ? batch.slots : { context: serverTiles.some((t) => t.id === 'context') ? 'context' : null, car: serverTiles.some((t) => t.id === 'car') ? 'car' : null, third: serverTiles.some((t) => t.id === 'third') ? 'third' : null };

  // Jak na webie: wybór kategorii odznacza i blokuje rozszerzenie o tym samym id.
  const chooseCategory = (id: number) => setForm((f) => ({ ...f, category: id, extensions: dropMatchingExtension(f.extensions, id) }));

  const onMapConfirm = (r: PickedPlace) => {
    edited.current.address = true; // wybór z mapy ma pierwszeństwo przed GPS zdjęcia
    resolvedText.current = r.geo?.display || form.address.trim();
    setAddrNote(null);
    setForm((f) => ({ ...f, lat: r.lat, lng: r.lng, geo: r.geo, address: r.geo?.display || f.address }));
    setMapOpen(false);
  };

  useEffect(() => { setPlateTouched(false); }, [app?.carInfo?.plateImage]);

  const selectedCat = cats.find((c) => c.id === form.category);
  const forcePolice = !!selectedCat?.stopAgresjiOnly;
  // jak syncUnitToggleWithCategory() na webie: SM wyłączona, gdy kategoria jest tylko dla Policji albo w miejscowości nie ma SM
  const smDisabled = forcePolice || !!form.geo?.smUnknown;
  const unit = smDisabled ? 'SA' : form.unit;
  const unitHint = (u?: { name: string; hint: string }) => (u ? [u.name, u.hint].filter(Boolean).join(': ') : undefined);
  const topCats = useMemo(() => cats.filter((c) => c.title && c.groups?.includes(0)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)), [cats]);
  const catGroups = useMemo(() => Object.entries(groups).filter(([id]) => id !== '0').map(([id, g]) => ({
    name: g.name, items: cats.filter((c) => c.title && c.groups?.includes(Number(id))).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
  })), [cats, groups]);

  const submit = async () => {
    setErr(null);
    if (!app?.contextImage?.thumb || !app?.carImage?.thumb) { setErr({ field: 'images', text: 'Dodaj zdjęcie auta z widocznym numerem rejestracyjnym i zdjęcie kontekstu.' }); toast.error('Dodaj zdjęcie auta z widocznym numerem rejestracyjnym i zdjęcie kontekstu.'); return; }
    if (form.address.trim().length <= 10) { fail(new ApiError('Podaj adres lub wskaż go na mapie', 422, 'address')); return; }
    setSubmitting(true);
    try {
      const place = await resolvePlace();
      if (!place) { fail(new ApiError('Nie udało się ustalić miejsca zgłoszenia – wskaż je na mapie albo wpisz adres w formacie „Ulica 10, Miasto”', 422, 'address')); return; }
      const { geo, lat, lng } = place;
      const body: ReportForm = {
        plateId: form.plateId.trim(), address: form.address.trim(), addressGPS: geo.display,
        city: geo.city, voivodeship: geo.voivodeship, district: geo.district, county: geo.county,
        municipality: geo.municipality, postcode: geo.postcode, lat, lng,
        datetime: form.datetime || nowIso(), dtFromPicture: form.dtFromPicture, category: form.category,
        extensions: form.extensions, comment: form.comment.trim(), witness: form.witness, stopAgresji: unit,
      };
      await saveReport(app.id, body);
      const appIds = [app.id];
      const plate2 = form.plateId2.trim();
      if (plate2 && batch.both) {
        const draft2 = await batch.assignSecondDraft(await ensureDraft2());
        if (!draft2.contextImage?.thumb || !draft2.carImage?.thumb) { setErr({ field: 'images', text: 'Nie udało się dodać zdjęć drugiego pojazdu.' }); return; }
        await saveReport(draft2.id, { ...body, plateId: plate2 });
        appIds.push(draft2.id);
      }
      navigation.navigate('ReportConfirm', { appIds }); // ekran „Sprawdź przed wysłaniem” (jak potwierdz.html na www)
    } catch (e) { fail(e); } finally { setSubmitting(false); }
  };

  const fieldErr = (f: string) => (err?.field === f ? <Text style={{ color: ud.plateVerified, marginTop: 4 }}>{err.text}</Text> : null);
  if (loading) return <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}><UdHeader /><ActivityIndicator style={{ marginTop: 40 }} color={ud.primary} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {editId ? <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 28 }}>{`Edycja${app?.number ? ` ${app.number}` : ''}`}</Text> : null}

        <PhotoQuotaNotice quota={quota} patronem={patron} onPatronite={() => openUdPage(navigation, '/patronite.html', 'Patronite')} />
        <PhotosSection
          tiles={tiles}
          slots={tileSlots}
          phase={local ? batch.phase : 'idle'}
          uploading={batch.uploading}
          note={batch.note}
          editable={local}
          crop={single}
          cropPreview={batch.cropPreview}
          pending={batch.reanalyzing}
          plateUri={plateTouched ? null : (batch.plateCropUri ?? plateThumb)} /* jak na webie: wycinek znika po ręcznej zmianie numeru */
          carBox={app?.carInfo?.vehicleBox ?? null}
          carNatural={app?.carImage?.width && app?.carImage?.height ? { w: app.carImage.width, h: app.carImage.height } : null}
          onPick={batch.pick}
          vehicles={batch.vehicles}
          vehicleIdx={batch.vehicleIdx}
          canBoth={batch.canBoth}
          both={batch.both}
          second={batch.second}
          onVehicle={batch.chooseVehicle}
          onRemove={batch.remove}
        />
        {batch.failed.length ? (
          <Pressable onPress={batch.retry}><Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, marginTop: 8 }}>Nie wszystkie zdjęcia zostały wysłane – spróbuj ponownie</Text></Pressable>
        ) : null}
        {fieldErr('images')}

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
        <TextInput style={[input, { fontFamily: ud.fontBodyBold, letterSpacing: 1 }]} value={form.plateId} autoCapitalize="characters" autoCorrect={false} placeholder="np. ZS 060NH" onChangeText={(t) => { edited.current.plate = true; setPlateTouched(true); set('plateId', t); }} />
        {fieldErr('plateId')}
        {weightWarning ? <Text style={{ color: ud.warning, marginTop: 6 }}>{weightWarning}</Text> : null}
        {recydywa && recydywa.appsCnt > 0 ? (
          <Text style={{ color: ud.text, marginTop: 6 }}>❗ Ten pojazd był już zgłaszany: {plural(recydywa.appsCnt, ['wykroczeń', 'wykroczenie', 'wykroczenia'])}.</Text>
        ) : null}

        {form.plateId2 ? (
          <>
            <L>Drugi pojazd (to samo wykroczenie) – numer rejestracyjny</L>
            <TextInput style={[input, { fontFamily: ud.fontBodyBold, letterSpacing: 1 }]} value={form.plateId2} autoCapitalize="characters" autoCorrect={false} onChangeText={(t) => set('plateId2', t)} />
            <Text style={{ color: ud.muted, fontSize: 12, marginTop: 4 }}>Wyczyść pole, aby zgłosić tylko pierwszy pojazd.</Text>
            {fieldErr('plateId2')}
            {weightWarning2 ? <Text style={{ color: ud.warning, marginTop: 6 }}>{weightWarning2}</Text> : null}
            {recydywa2 && recydywa2.appsCnt > 0 ? (
              <Text style={{ color: ud.text, marginTop: 6 }}>❗ Drugi pojazd był już zgłaszany: {plural(recydywa2.appsCnt, ['wykroczeń', 'wykroczenie', 'wykroczenia'])}.</Text>
            ) : null}
          </>
        ) : null}

        <L>Adres (z GPS zdjęcia, możesz poprawić)</L>
        <TextInput style={input} value={form.address} maxLength={70} placeholder="Ulica 10a, Miasto" onChangeText={(t) => { edited.current.address = true; setAddrNote(null); set('address', t); }} onEndEditing={lookupAddress} />
        {addrNote ? <Text style={{ color: ud.warning, marginTop: 4 }}>{addrNote}</Text> : null}
        {fieldErr('address')}
        <MapPreview lat={form.lat} lng={form.lng} onPress={() => setMapOpen(true)} />
        {form.lat == null ? <Text style={{ color: ud.muted, fontSize: 12, marginTop: 4 }}>Brak lokalizacji ze zdjęcia – wskaż miejsce na mapie albo wpisz adres („Ulica 10, Miasto”).</Text> : null}

        <L>Zgłoszenie trafi do</L>
        <Radio on={unit === 'SA'} onPress={() => set('unit', 'SA')} hint={unitHint(form.geo?.sa)}>Policja (sugerowane)</Radio>
        <Radio on={unit === 'SM'} disabled={smDisabled} onPress={() => set('unit', 'SM')} hint={unitHint(form.geo?.sm)}>{form.geo?.sm?.kind ?? 'Straż miejska'}</Radio>
        {forcePolice ? <Text style={{ color: ud.muted, fontSize: 12 }}>Ta kategoria jest zawsze zgłaszana na Policję.</Text> : null}

        <H>Wybierz rodzaj wykroczenia</H>
        {topCats.map((c) => <CategoryRow key={c.id} c={c} on={form.category === c.id} onPress={() => chooseCategory(c.id)} />)}
        {!showAllCats ? (
          <Pressable onPress={() => setShowAllCats(true)}><Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, marginTop: 8 }}>Pokaż wszystkie</Text></Pressable>
        ) : (
          catGroups.map((g) => (
            <View key={g.name}>
              <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading, marginTop: 16 }}>{g.name}</Text>
              {g.items.map((c) => <CategoryRow key={c.id} c={c} on={form.category === c.id} onPress={() => chooseCategory(c.id)} />)}
            </View>
          ))
        )}
        <CategoryRow c={{ id: 0, title: 'Pozostałe przypadki', short: 'Opisz sytuację w komentarzu.' }} on={form.category === 0} onPress={() => chooseCategory(0)} />

        <L>Komentarz{form.category === 0 ? ' (wymagany)' : ''}</L>
        <TextInput style={[input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={form.comment} onChangeText={(t) => set('comment', t)} onEndEditing={() => { const w = !form.witness && commentWarning(form.comment); if (w) toast.info(`${w} Sprawdź opcję „świadek momentu parkowania”.`); }} placeholder="Dodatkowy opis wykroczenia" />
        {fieldErr('comment')}

        {Object.keys(exts).length ? (
          <>
            <H>Czy pojazd dodatkowo:</H>
            {Object.entries(exts).filter(([, e]) => !e.disabled).map(([id, e]) => {
              const n = Number(id);
              return <Check key={id} disabled={isExtensionDisabled(n, form.category)} on={form.extensions.includes(n)} onPress={() => set('extensions', form.extensions.includes(n) ? form.extensions.filter((x) => x !== n) : [...form.extensions, n])}>{`${e.title}${e.price ? ` (mandat: ${e.price})` : ''}`}</Check>;
            })}
          </>
        ) : null}

        <H>Oświadczenia</H>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* jak na www: `bylam` z backendu (sexStrings) – „Byłem/Byłam/Byłam/em świadkiem …” */}
          <Text style={{ flex: 1, color: ud.text }}>{bylam.charAt(0).toUpperCase() + bylam.slice(1)} świadkiem momentu parkowania</Text>
          <Switch value={form.witness} onValueChange={(v) => set('witness', v)} trackColor={{ true: ud.primary }} />
        </View>

        <View style={{ marginTop: 20 }}>
          <UdButton title={submitting ? 'Zapisuję…' : 'Dalej'} onPress={submit} disabled={submitting || uploading || geoBusy > 0} />
        </View>
        <Text style={{ color: ud.muted, fontSize: 12, marginTop: 6 }}>Na następnym ekranie sprawdzisz zgłoszenie przed wysłaniem.</Text>
      </ScrollView>
      <MapPicker visible={mapOpen} initial={form.lat != null && form.lng != null ? { lat: form.lat, lng: form.lng } : null} fallback={mapStart} onConfirm={onMapConfirm} onClose={() => setMapOpen(false)} />
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
