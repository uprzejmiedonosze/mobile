import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { href, param, splitIds, joinIds } from '../lib/routes';
import { type UdApp, imageUrl } from '../api/apps';
import { fetchConfig } from '../api/dashboard';
import { fetchCategories, reverseGeocode } from '../api/geo';
import { loadRecentCategories, pickTopCategories } from '../lib/recentCategories';
import { fetchRecydywa } from '../api/recydywa';
import {
  createDraft, fetchReport, fetchVehicleDescription, saveReport, searchAddress, type ReportForm,
} from '../api/reports';
import { ApiError, isPhotoQuotaError, validIdToken } from '../api/udApi';
import { fetchProfile } from '../api/user';
import { log } from '../lib/log';
import { commentWarning, dropMatchingExtension, clearFieldError, exifToIso, fmtLongDate, formLocks, hasRequiredPhotos, isExtensionDisabled, ownSameDayReport, plural } from '../lib/reports';
import { DateTimeField } from '../components/DateTimeField';
import { HtmlText } from '../components/HtmlText';
import { MapPicker, type PickedPlace } from '../components/MapPicker';
import { MapPreview } from '../components/MapPreview';
import { CROP_TILE_ID, PhotosSection, type Tile } from '../components/PhotosSection';
import { PhotoQuotaNotice } from '../components/PhotoQuotaNotice';
import { UdButton, UdCard } from '../components/UD';
import { LargeTitleScreen } from '../components/LargeTitleScreen';
import { Collapsible } from '../components/Collapsible';
import { FIELD_HINT, FIELD_LABEL, FormField } from '../components/FormField';
import { Callout, ChoiceRow, SectionHeader, SwitchRow } from '../components/FormBits';
import { usePhotoQuota } from '../lib/usePhotoQuota';
import { ensureAiConsent } from '../lib/aiConsent';
import { PATRONEM_DEFAULT } from '../lib/sex';
import { usePhotoBatch } from '../lib/usePhotoBatch';
import { toPhotoItem } from '../lib/waitingRoom';
import { useWaitingRoom } from '../store/useWaitingRoom';
import { SLOT_ORDER } from '../lib/roles';
import type { Slot, Suggestion } from '../lib/suggest';
import { udConfig } from '../config';
import { openUdPage } from '../lib/openPage';
import { useAuth } from '../store/useAuth';
import { useNewReport } from '../store/useNewReport';
import { toast } from '../store/useToast';
import { ud, ripple } from '../theme';
import type { Category, GeoAddress, PhotoItem, RecydywaEntry, RecydywaInfo } from '../types';

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

// Karta kategorii (jak #category na webie, bez kółka radia): wybrana ma zieloną ramkę i znaczek ✓; „WIĘCEJ…” otwiera szczegóły.
const selectCard = (on: boolean) => ({ backgroundColor: ud.surface, borderWidth: 2, borderColor: on ? ud.primary : ud.hairline, borderRadius: ud.radiusCard, marginTop: 8 }) as const;

export function NewReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string; waitingIds?: string }>();
  // Nad zakładkami (/app/edit: edycja, paczka z poczekalni) potrzebna jest strzałka wstecz; jako zakładka (/app/new) – nie.
  const onBack = usePathname() === '/app/new' ? undefined : () => router.back();
  const editId: string | undefined = param(params.editId);
  // Paczka z poczekalni: osobny szkic, którego id pamiętają zdjęcia – zapamiętany `draftId` zwykłego formularza zostaje nietknięty
  // (szkiców nie ma na liście zgłoszeń, więc nadpisanie go oznaczałoby utratę dostępu do niego).
  const waitingIds: string[] | undefined = splitIds(params.waitingIds);
  const { draftId, hydrated, hydrate, setDraftId } = useNewReport();

  const [app, setApp] = useState<UdApp | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [cats, setCats] = useState<Category[]>([]);
  const [recentCats, setRecentCats] = useState<number[]>([]);
  const [groups, setGroups] = useState<Groups>({});
  const [exts, setExts] = useState<Record<string, Extension>>({});
  const [showAllCats, setShowAllCats] = useState(false);
  const [catInfo, setCatInfo] = useState<Category | null>(null); // okienko „więcej…” przy kategorii
  const [mapOpen, setMapOpen] = useState(false);
  const [mapStart, setMapStart] = useState<{ lat: number; lng: number } | null>(null);
  const [plateTouched, setPlateTouched] = useState(false); // web chowa wycinek tablicy po ręcznej zmianie numeru
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

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setErr((e) => clearFieldError(e, k)); };
  // Błąd pola (422 z `field`) – przy polu; wszystko inne (upload, sieć…) jako toast, bo formularz jest długi
  // i komunikat na jego dole nie jest widoczny.
  const { quota, setQuota, refresh: refreshQuota } = usePhotoQuota();
  const fail = useCallback((e: any) => {
    const m = e?.message ?? String(e);
    log.fail('nowe', e);
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
    loadRecentCategories().then(setRecentCats);
    fetchConfig<Groups>('category-groups').then(setGroups);
    fetchConfig<Record<string, Extension>>('extensions').then(setExts);
  }, []);

  // Wejście: tryb edycji (?editId) albo wznowienie szkicu z poprzedniej sesji – jak `$_SESSION['newAppId']`.
  useEffect(() => {
    if (!hydrated) return;
    const id = editId ?? (waitingIds ? null : draftId);
    if (!id) { setLoading(false); return; }
    fetchReport(id)
      .then((a) => {
        if (!['draft', 'ready', 'confirmed'].includes(a.status)) throw new Error('nieedytowalne'); // jak isEditable() na webie
        // GET oddaje też cudze zgłoszenia, a zapis już nie (403) – szkic zapisany na tym telefonie przez inne konto porzucamy.
        const me = useAuth.getState().email;
        if (a.email && me && a.email.toLowerCase() !== me.toLowerCase()) throw new Error('cudzy szkic');
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

  // Ręcznie wpisany adres → współrzędne + miasto/województwo (bez nich backend nie ustali SM/Policji) – tylko gdy pinezki
  // jeszcze nie ma (zdjęcie bez GPS). Jak na webie: poprawka tekstu przy znanych współrzędnych nie przesuwa pinezki.
  const lookupAddress = async () => {
    const q = form.address.trim();
    if (form.lat != null && form.lng != null) return;
    if (!edited.current.address || !q || q === resolvedText.current) return;
    setGeoBusy((n) => n + 1);
    try {
      const r = await searchAddress(q);
      if (!r) { setAddrNote('Nie znaleziono adresu – wskaż miejsce na mapie.'); return; }
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
      if (form.lat == null && edited.current.address && q.length > 3 && q !== resolvedText.current) {
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
      if (!editId && !waitingIds) setDraftId(a.id);
      return a;
    });
    return draftRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Te same współrzędne drugi raz (zgadnięte zdjęcie auta, potem to samo po analizie) zostawiają geo: efekt reverse
    // geocode już ich nie pobierze (geoFor), więc wyzerowanie gubiło SM/Policję z hintami.
    setForm((f) => ({
      ...f,
      ...(gps && (f.lat !== lat || f.lng !== lng) ? { lat, lng, geo: null } : {}),
      ...(iso ? { datetime: iso, dtFromPicture: true } : {}),
    }));
  }, []);
  const batch = usePhotoBatch({ app, ensureDraft, applyApp, onSuggestion, onError: fail, onCarExif: applyCarExif });
  const photosOk = hasRequiredPhotos(app);
  const waitingLoaded = useRef(false);
  useEffect(() => {
    if (!waitingIds || loading || waitingLoaded.current) return;
    waitingLoaded.current = true;
    void (async () => {
      // Zdjęcia z poczekalni idą do AI (OpenAI, Plate Recognizer) jak z galerii – na iOS najpierw zgoda; bez niej wracamy, nic nie jest wysyłane.
      if (!(await ensureAiConsent())) { router.back(); return; }
      await batch.load(useWaitingRoom.getState().photos.filter((p) => waitingIds.includes(p.id)).map(toPhotoItem));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  // Zdjęcia wiążemy ze szkicem, gdy tylko powstanie (po wysyłce i ALPR): inaczej przerwany przydział zostawiałby szkic, do którego nic nie prowadzi.
  // Limit kredytów czy błąd wysyłki zdarzają się wcześniej, więc paczka zostaje wtedy w poczekalni; z kolei „Przywróć” cofa powiązanie.
  const waitingMarked = useRef(false);
  useEffect(() => {
    if (!waitingIds || waitingMarked.current || !app) return;
    waitingMarked.current = true;
    // zdjęcie usunięte w formularzu nie trafiło do szkicu – zostaje w poczekalni
    useWaitingRoom.getState().markUsed(waitingIds.filter((id) => batch.photos.some((p) => p.id === id)), app.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id]);
  useEffect(() => { if (photosOk) setErr((e) => clearFieldError(e, 'images')); }, [photosOk]); // zdjęcia dodane → znika „Dodaj zdjęcie auta…”
  const uploading = batch.busy;
  // „Zacznij od nowa”: zapominamy bieżący szkic i otwieramy formularz od zera (nowy szkic powstanie przy pierwszym zdjęciu). Zablokowane w trakcie
  // wysyłania zdjęć – spóźnione żądanie zapisałoby id starego szkicu.
  const startOver = () => Alert.alert('Zacznij od nowa?', 'Usunę zdjęcia i dane wpisane w tym zgłoszeniu.', [
    { text: 'Anuluj', style: 'cancel' },
    { text: 'Zacznij od nowa', style: 'destructive', onPress: () => { setDraftId(null); useNewReport.getState().restart(); } },
  ]);
  const lock = formLocks({ hasCarPhoto: !!app?.carImage?.thumb, uploading, hasLocation: form.lat != null && form.lng != null, geoBusy: geoBusy > 0 });
  // Odpowiedź „Oba” (albo wybór jednego pojazdu / nowe zdjęcia) ustawia drugą tablicę; ręczna poprawka zostaje do następnego wyboru.
  const localPhotos = batch.photos.length > 0;
  useEffect(() => { if (localPhotos) setForm((f) => (f.plateId2 === (batch.plate2 ?? '') ? f : { ...f, plateId2: batch.plate2 ?? '' })); }, [batch.plate2, localPhotos]);
  useEffect(() => { if (batch.phase === 'ready') refreshQuota(); }, [batch.phase, refreshQuota]); // zdjęcia właśnie przetworzone → nowe zużycie

  // Bez lokalnych zdjęć (edycja / wznowiony szkic) pokazujemy te z serwera, role bez zmian.
  const SERVER: Record<Slot, 'contextImage' | 'carImage' | 'thirdImage'> = { context: 'contextImage', car: 'carImage', third: 'thirdImage' };
  const serverTiles: Tile[] = (SLOT_ORDER).flatMap((slot) => {
    const uri = app ? imageUrl(app[SERVER[slot]], app, false, SERVER[slot]) : null;
    const full = app ? imageUrl(app[SERVER[slot]], app, true, SERVER[slot]) : null;
    return uri ? [{ id: slot, uri: `${uri}&r=${rev}`, full: `${full ?? uri}&r=${rev}` }] : [];
  });
  const local = batch.photos.length > 0;
  // Jedno zdjęcie też daje DWA kafelki (oryginał + wycinek auta), żeby układ nie skakał: drugi kafelek jest od początku, a wycinek
  // wypełnia się lokalnie zaraz po odczycie tablicy (batch.cropPreview). Do powiększenia: wycinek z serwera, a gdy go brak – oryginał.
  const single = local && batch.photos.length === 1;
  const cropUri = single && app?.carImage?.thumb ? `${imageUrl(app.carImage, app, false, 'carImage')}&r=${rev}` : null;
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
  // Domyślne TOP z categories.json (grupa 0), wypychane przez ostatnio używane na tym urządzeniu (recentCategories).
  const topCats = useMemo(() => pickTopCategories(cats.filter((c) => c.title && c.groups?.includes(0)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)), cats, recentCats), [cats, recentCats]);
  // Kategoria 0 („Pozostałe przypadki”) ma stały kafelek pod listą, więc w rozwiniętych grupach jej nie ma
  // (jej grupa 5 w categories.json zawiera tylko ją – pusta grupa znika razem z nagłówkiem).
  const catGroups = useMemo(() => Object.entries(groups).filter(([id]) => id !== '0').map(([id, g]) => ({
    id: Number(id), name: g.name, items: cats.filter((c) => c.id && c.title && c.groups?.includes(Number(id))).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
  })).filter((g) => g.items.length), [cats, groups]);
  // Stały kafelek „Pozostałe przypadki” z danymi z categories.json (opis, mandat, „Więcej…”); zanim się wczytają – zaślepka.
  const otherCat = useMemo(() => cats.find((c) => c.id === 0 && c.title), [cats]);
  const hiddenCatsCnt = useMemo(() => {
    const top = new Set(topCats.map((c) => c.id));
    return new Set(catGroups.flatMap((g) => g.items.map((c) => c.id)).filter((id) => !top.has(id))).size;
  }, [topCats, catGroups]);

  const submit = async () => {
    setErr(null);
    if (!hasRequiredPhotos(app)) { setErr({ field: 'images', text: 'Dodaj zdjęcie auta z widocznym numerem rejestracyjnym i zdjęcie kontekstu.' }); toast.error('Dodaj zdjęcie auta z widocznym numerem rejestracyjnym i zdjęcie kontekstu.'); return; }
    if (form.address.trim().length <= 10) { fail(new ApiError('Podaj adres lub wskaż go na mapie', 422, 'address')); return; }
    setSubmitting(true);
    try {
      const place = await resolvePlace();
      if (!place) { fail(new ApiError('Nie udało się ustalić miejsca zgłoszenia – wskaż je na mapie', 422, 'address')); return; }
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
      router.push(href('ReportConfirm', { appIds: joinIds(appIds) })); // ekran „Sprawdź przed wysłaniem” (jak potwierdz.html na www)
    } catch (e) { fail(e); } finally { setSubmitting(false); }
  };


  const fieldErr = (f: string) => (err?.field === f ? err.text : undefined);
  // Tytuł mówi, co robisz: nowe zgłoszenie, edycja konkretnego numeru albo paczka z poczekalni.
  const title = editId ? `Edycja${app?.number ? ` ${app.number}` : ''}` : waitingIds ? 'Z poczekalni' : 'Nowe zgłoszenie';
  const leading = onBack ? { label: 'Wróć', systemImage: 'chevron.left' as const, onPress: onBack } : undefined;
  // „Zacznij od nowa” to akcja drugorzędna – w pasku, a nie między zdjęciami; zablokowana w trakcie wysyłania zdjęć.
  const trailing = !editId && !waitingIds && tiles.length > 0 ? { label: 'Od nowa', systemImage: 'arrow.counterclockwise' as const, onPress: startOver, disabled: uploading } : undefined;

  if (loading) {
    return (
      <LargeTitleScreen title={title} leading={leading}>
        <ActivityIndicator style={{ marginTop: 40 }} color={ud.primary} accessibilityLabel="Wczytuję zgłoszenie" />
      </LargeTitleScreen>
    );
  }

  // Co jeszcze blokuje „Dalej” – pokazane pod przyciskiem (walidacja w miejscu zamiast komunikatu dopiero po naciśnięciu).
  const nextHint = !photosOk ? 'Dodaj zdjęcie auta z widocznym numerem i zdjęcie kontekstu.'
    : uploading ? 'Czekam, aż zdjęcia się wyślą…'
    : geoBusy > 0 ? 'Ustalam adres…'
    : form.address.trim().length <= 10 ? 'Podaj adres albo wskaż miejsce na mapie.'
    : form.category === 0 && !form.comment.trim() ? 'Przy „Pozostałych przypadkach” opisz sytuację w komentarzu.'
    : 'Na następnym ekranie sprawdzisz zgłoszenie przed wysłaniem.';
  const plateStyle = { fontFamily: ud.fontBodyBold, fontSize: 20, letterSpacing: 2 } as const;
  const dup1 = ownSameDayReport(recydywa, form.datetime, app?.id);
  const dup2 = ownSameDayReport(recydywa2, form.datetime, app?.id);
  const dupText = (r: RecydywaEntry) => `To może być duplikat – masz już zgłoszenie tego pojazdu z tego dnia (${[r.number, fmtLongDate(r.date ?? undefined)].filter(Boolean).join(', ')}).`;

  return (
    <LargeTitleScreen title={title} leading={leading} trailing={trailing}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        {/* ZDJĘCIA – od nich zależy reszta (tablica, data, miejsce), więc pierwsze */}
        <SectionHeader>Zdjęcia</SectionHeader>
        <PhotoQuotaNotice quota={quota} patronem={patron} onMore={() => router.push(href('QuotaInfo'))} />
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
          showRepick={!!editId}
        />
        {batch.failed.length ? <Callout tone="error" onPress={batch.retry}>Nie wszystkie zdjęcia zostały wysłane. Dotknij, żeby spróbować ponownie.</Callout> : null}
        {fieldErr('images') ? <Callout tone="error">{fieldErr('images')}</Callout> : null}

        {/* POJAZD */}
        <SectionHeader>Pojazd</SectionHeader>
        <UdCard flat>
          <FormField
            first
            label="Numer rejestracyjny"
            hint={lock.photoFields ? 'Odczytamy go ze zdjęcia auta – potem możesz poprawić.' : undefined}
            error={fieldErr('plateId')}
            inputStyle={plateStyle}
            editable={!lock.photoFields}
            value={form.plateId}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="np. WA 12345"
            onChangeText={(t) => { edited.current.plate = true; setPlateTouched(true); set('plateId', t); }}
          />
          {dup1 ? <Callout tone="warning">{dupText(dup1)}</Callout> : null}
          {recydywa && recydywa.appsCnt > 0 ? <Callout>Ten pojazd był już zgłaszany: {plural(recydywa.appsCnt, ['wykroczeń', 'wykroczenie', 'wykroczenia'])}.</Callout> : null}

          {form.plateId2 ? (
            <>
              <FormField
                label="Drugi pojazd"
                hint="To samo wykroczenie – powstanie osobne zgłoszenie."
                error={fieldErr('plateId2')}
                inputStyle={plateStyle}
                editable={!lock.photoFields}
                value={form.plateId2}
                autoCapitalize="characters"
                autoCorrect={false}
                onChangeText={(t) => set('plateId2', t)}
              />
              {dup2 ? <Callout tone="warning">{dupText(dup2)}</Callout> : null}
              {recydywa2 && recydywa2.appsCnt > 0 ? <Callout>Drugi pojazd był już zgłaszany: {plural(recydywa2.appsCnt, ['wykroczeń', 'wykroczenie', 'wykroczenia'])}.</Callout> : null}
            </>
          ) : null}
        </UdCard>

        {/* KIEDY I GDZIE */}
        <SectionHeader>Kiedy i gdzie</SectionHeader>
        <UdCard flat>
          <DateTimeField disabled={lock.photoFields} fromPhoto={form.dtFromPicture} value={form.datetime} onChange={(iso) => { setForm((f) => ({ ...f, datetime: iso, dtFromPicture: false })); setErr((e) => clearFieldError(e, 'datetime')); }} />
          {fieldErr('datetime') ? <Text style={[FIELD_HINT, { color: ud.plateVerified }]}>{fieldErr('datetime')}</Text> : null}

          <Text style={[FIELD_LABEL, { marginTop: 18 }]}>Miejsce</Text>
          <MapPreview lat={form.lat} lng={form.lng} onPress={() => setMapOpen(true)} />
          {form.lat == null ? <Text style={FIELD_HINT}>Zdjęcie nie ma lokalizacji – wskaż miejsce na mapie albo wpisz adres.</Text> : null}

          <FormField
            label="Adres"
            hint={addrNote ? undefined : form.lat != null ? 'Z lokalizacji zdjęcia – możesz poprawić.' : undefined}
            error={fieldErr('address') ?? addrNote}
            editable={!lock.address}
            value={form.address}
            maxLength={70}
            placeholder="np. Prosta 10, Warszawa"
            autoComplete="street-address"
            textContentType="fullStreetAddress"
            onChangeText={(t) => { edited.current.address = true; setAddrNote(null); set('address', t); }}
            onEndEditing={lookupAddress}
          />

          <Text style={[FIELD_LABEL, { marginTop: 18, marginBottom: 2 }]}>Zgłoszenie trafi do</Text>
          <ChoiceRow on={unit === 'SA'} onPress={() => set('unit', 'SA')} hint={unitHint(form.geo?.sa)} title="Policja (sugerowane)" />
          <ChoiceRow on={unit === 'SM'} disabled={smDisabled} onPress={() => set('unit', 'SM')} hint={unitHint(form.geo?.sm)} title={form.geo?.sm?.kind ?? 'Straż miejska'} last />
          {forcePolice ? <Text style={FIELD_HINT}>Ta kategoria jest zawsze zgłaszana na Policję.</Text> : null}
        </UdCard>

        {/* RODZAJ WYKROCZENIA */}
        <SectionHeader>Rodzaj wykroczenia</SectionHeader>
        {topCats.map((c) => <CategoryRow key={c.id} c={c} on={form.category === c.id} onPress={() => chooseCategory(c.id)} onMore={setCatInfo} />)}
        <Collapsible open={showAllCats}>
          {catGroups.map((g) => (
            <View key={g.name}>
              <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading, fontSize: 15, marginTop: 18, paddingHorizontal: 4 }}>{g.name}</Text>
              {g.items.map((c) => <CategoryRow key={c.id} c={c} on={form.category === c.id} onPress={() => chooseCategory(c.id)} onMore={setCatInfo} />)}
            </View>
          ))}
          {/* jak .category-hint w nowe-zgloszenie.html.twig */}
          <Text style={[FIELD_HINT, { marginTop: 14, paddingHorizontal: 4 }]}>
            Masz wątpliwości, którą kategorię wybrać? Przeczytaj{' '}
            <Text onPress={() => openUdPage(router, '/przepisy.html', 'Przepisy')} style={{ color: ud.primary, textDecorationLine: 'underline' }}>nasz poradnik</Text>.
          </Text>
        </Collapsible>
        {/* Przełącznik pod listą: rozwija ją sprężyną i zwija tą samą drogą („Pokaż mniej”). */}
        <Pressable
          onPress={() => setShowAllCats((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAllCats }}
          android_ripple={ripple}
          style={({ pressed }) => ({ overflow: 'hidden', marginTop: 12, marginBottom: 4, minHeight: 48, justifyContent: 'center', borderRadius: ud.radiusPill, backgroundColor: ud.primaryContainer, alignItems: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}
        >
          <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, fontSize: 15 }}>
            {showAllCats ? 'Pokaż mniej kategorii' : `Pokaż wszystkie kategorie${hiddenCatsCnt ? ` (+${hiddenCatsCnt})` : ''}`}
          </Text>
        </Pressable>
        <CategoryRow c={otherCat ?? { id: 0, title: 'Pozostałe przypadki', short: 'Opisz sytuację w komentarzu.' }} on={form.category === 0} onPress={() => chooseCategory(0)} onMore={otherCat ? setCatInfo : undefined} />

        {/* SZCZEGÓŁY */}
        <SectionHeader>Szczegóły</SectionHeader>
        <UdCard flat>
          <FormField
            first
            label="Komentarz"
            optional={form.category !== 0}
            hint={form.category === 0 ? 'Wymagany przy „Pozostałych przypadkach” – opisz, co się stało.' : 'Dodatkowy opis, jeśli zdjęcia nie mówią wszystkiego.'}
            error={fieldErr('comment')}
            multiline
            value={form.comment}
            placeholder="np. Auto blokuje przejście dla pieszych"
            onChangeText={(t) => set('comment', t)}
            onEndEditing={() => { const w = !form.witness && commentWarning(form.comment); if (w) toast.info(`${w} Sprawdź opcję „świadek momentu parkowania”.`); }}
          />
          {/* jak na webie: ostrzeżenie o masie pojazdu jest częścią pola komentarza; przy dwóch pojazdach z numerem tablicy */}
          {weightWarning ? <Callout tone="warning">{form.plateId2 ? `${form.plateId}: ` : ''}{weightWarning}</Callout> : null}
          {form.plateId2 && weightWarning2 ? <Callout tone="warning">{form.plateId2}: {weightWarning2}</Callout> : null}

          {Object.keys(exts).length ? (
            <>
              <Text style={[FIELD_LABEL, { marginTop: 18, marginBottom: 2 }]}>Czy pojazd dodatkowo:</Text>
              {Object.entries(exts).filter(([, e]) => !e.disabled).map(([id, e], i, all) => {
                const n = Number(id);
                return (
                  <ChoiceRow
                    key={id}
                    multi
                    last={i === all.length - 1}
                    disabled={isExtensionDisabled(n, form.category)}
                    on={form.extensions.includes(n)}
                    onPress={() => set('extensions', form.extensions.includes(n) ? form.extensions.filter((x) => x !== n) : [...form.extensions, n])}
                    title={e.title}
                    hint={e.price ? `Mandat: ${e.price}` : undefined}
                  />
                );
              })}
            </>
          ) : null}

          <View style={{ marginTop: 10 }}>
            {/* jak na www: `bylam` z backendu (sexStrings) – „Byłem/Byłam/Byłam/em świadkiem …” */}
            <SwitchRow title={`${bylam.charAt(0).toUpperCase() + bylam.slice(1)} świadkiem momentu parkowania`} value={form.witness} onChange={(v) => set('witness', v)} last />
          </View>
        </UdCard>

        <View style={{ marginTop: 20 }}>
          <UdButton title={submitting ? 'Zapisuję…' : 'Dalej'} onPress={submit} disabled={submitting || uploading || geoBusy > 0} />
          <Text style={{ color: ud.muted, fontSize: 13, lineHeight: 18, marginTop: 4, textAlign: 'center' }}>{nextHint}</Text>
        </View>
      </View>
      <CategoryInfo c={catInfo} onClose={() => setCatInfo(null)} onPageLink={(path) => openUdPage(router, path)} />
      <MapPicker visible={mapOpen} initial={form.lat != null && form.lng != null ? { lat: form.lat, lng: form.lng } : null} fallback={mapStart} onConfirm={onMapConfirm} onClose={() => setMapOpen(false)} />
    </LargeTitleScreen>
  );
}

// Jak #category na webie: karta ze zdjęciem kategorii (punkty karne w czerwonej kropce), wybrana ma zieloną ramkę i ✓.
// Szczegóły pod zakładką „WIĘCEJ…” w rogu karty – jak na webie.
function CategoryRow({ c, on, onPress, onMore }: { c: Category; on: boolean; onPress: () => void; onMore?: (c: Category) => void }) {
  const more = onMore && (c.desc || c.law);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={c.title}
      android_ripple={ripple}
      style={({ pressed }) => ({ ...selectCard(on), overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <View>
        <Image source={{ uri: `${udConfig.base}/img/${c.id}.jpg` }} style={{ width: 72, height: 72, borderRadius: ud.radiusButton, backgroundColor: ud.surfaceCream }} />
        {c.points && c.points > 1 ? (
          <View style={{ position: 'absolute', top: 3, left: 3, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: ud.plateVerified, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold, fontSize: 13 }}>{c.points}</Text>
          </View>
        ) : null}
      </View>
      {/* dół kolumny zostawia miejsce na zakładkę „WIĘCEJ…”, żeby nie zasłaniała mandatu */}
      <View style={{ flex: 1, paddingRight: on ? 0 : 4, paddingBottom: more ? 18 : 0 }}>
        <Text style={{ fontFamily: ud.fontBodyBold, fontSize: 15, color: on ? ud.primary : ud.text }}>{c.title}</Text>
        {c.short ? <Text style={{ color: ud.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }} numberOfLines={3}>{c.short}</Text> : null}
        {c.mandate ? <Text style={{ color: ud.muted, fontSize: 13, marginTop: 2 }}>Mandat {c.mandate > 100 ? '~' : ''}{c.mandate} zł</Text> : null}
      </View>
      {on ? (
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: ud.primary, alignItems: 'center', justifyContent: 'center', marginRight: 4, marginBottom: more ? 18 : 0 }}>
          <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold, fontSize: 14, lineHeight: 16 }}>✓</Text>
        </View>
      ) : null}
      {more ? (
        // jak a.category-popup na webie: zakładka „WIĘCEJ…” w prawym dolnym rogu karty (spójnie z webem)
        <Pressable onPress={() => onMore!(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Więcej o kategorii ${c.title}`}
          style={{ position: 'absolute', right: 0, bottom: 0, backgroundColor: '#ede9df', paddingHorizontal: 10, paddingVertical: 5, borderTopLeftRadius: ud.radiusCard - 2, borderBottomRightRadius: ud.radiusCard - 2 }}>
          <Text style={{ fontSize: 11, color: '#333', fontFamily: ud.fontBodyBold }}>WIĘCEJ…</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

// Szczegóły kategorii (jak dialog #category-popup-{id} na webie): opis, mandat, podstawa prawna.
function CategoryInfo({ c, onClose, onPageLink }: { c: Category | null; onClose: () => void; onPageLink: (path: string) => void }) {
  return (
    <Modal visible={!!c} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {c ? (
          <Pressable style={{ backgroundColor: ud.surface, borderRadius: ud.radiusCard, width: '100%', maxWidth: 420, maxHeight: '85%' }}>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {/* ikona tylko w rozmiarze z karty – źródło ma 100 px, większa byłaby rozmyta */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Image source={{ uri: `${udConfig.base}/img/${c.id}.jpg` }} style={{ width: 64, height: 64, borderRadius: ud.radiusButton, backgroundColor: ud.surfaceCream }} />
                <Text selectable style={{ flex: 1, fontFamily: ud.fontDisplay, fontSize: 20, color: ud.heading }}>{c.title}</Text>
              </View>
              {c.desc ? <HtmlText selectable html={c.desc} onPageLink={(path) => { onClose(); onPageLink(path); }} style={{ color: ud.text, marginTop: 8, lineHeight: 21 }} /> : null}
              {c.price ? <Text selectable style={{ color: ud.text, marginTop: 10, fontFamily: ud.fontBodyBold }}>Mandat: {c.price}</Text> : null}
              {c.law ? <Text selectable style={{ color: ud.muted, fontSize: 12, marginTop: 10, lineHeight: 18, fontStyle: 'italic' }}>{c.law}</Text> : null}
            </ScrollView>
            <Pressable onPress={onClose} accessibilityRole="button" style={{ borderTopWidth: 1, borderTopColor: ud.hairline, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold }}>ZAMKNIJ</Text>
            </Pressable>
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
  );
}
