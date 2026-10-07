// 1–3 zdjęcia w jednym polu → podgląd od razu; zdjęcia lecą na serwer RAZ (etap „wip”, api/photos.ts), dla każdego od razu liczony
// jest sam ALPR (bez LLM, raz na zdjęcie), a `chooseRoles` (lib/roles.ts) wybiera auto i kontekst z odczytów. Dopiero potem zdjęcia
// trafiają do szkicu we właściwych slotach (`assignReportPhoto` – serwer sam bierze plik ze swojego dysku). Jedno zdjęcie =
// kontekst + wycinek auta z tego samego zdjęcia (`crop`). Zamiana ról nie wysyła zdjęć ponownie.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UdApp } from '../api/apps';
import { assignReportPhoto, deleteReportImage, uploadPlateImage, type PictureType } from '../api/reports';
import { bboxToRegion, cropRegion, prepareOriginal, type Original } from './crop';
import { analyzePhotoAlpr, deleteStagedPhoto, stagePhoto } from '../api/photos';
import { isPhotoQuotaError } from '../api/udApi';
import { pickPhotos } from './gallery';
import { log } from './log';
import { downscale, type Scaled } from './resize';
import { exifToIso } from './reports';
import { BOTH_VEHICLES, canChooseBoth, chooseRoles, listVehicles, secondVehicle, SLOT_ORDER, type Detection, type PhotoDetections, type Vehicle } from './roles';
import { plateMatches } from './compose';
import { defaultSlots, EMPTY_SLOTS, type Slot, type Slots, type Suggestion } from './suggest';
import type { PhotoItem } from '../types';

export const MIN_PHOTOS = 1;
export const MAX_BATCH = 3;
const TYPE: Record<Slot, PictureType> = { context: 'contextImage', car: 'carImage', third: 'thirdImage' };
const SLOTS: Slot[] = SLOT_ORDER; // auto → kontekst → dodatkowe

// Podgląd wycinka auta liczony LOKALNIE z oryginału i boxu pojazdu z ALPR – drugi kafelek jednego zdjęcia jest od razu gotowy,
// bez czekania na wycinek z serwera (nie ma „placeholdera”, który sam się wypełnia).
export type CropPreview = { uri: string; w: number; h: number; box: [number, number, number, number] }; // box 0..1000
export const REANALYZE_DELAY_MS = 900;

export type LocalPhoto = PhotoItem & { small?: Scaled; serverId?: string }; // serverId = photoId z etapu „wip” na backendzie
export type Phase = 'idle' | 'preparing' | 'analyzing' | 'ready';

type Deps = {
  app: UdApp | null;
  ensureDraft: () => Promise<UdApp>; // tworzy szkic przy pierwszym przydziale zdjęcia do slotu (nie przy wyborze zdjęć)
  applyApp: (a: UdApp, carMeta?: { gps: boolean; date: boolean }) => void; // odpowiedź serwera po uploadzie (tablica, data, GPS z ALPR); carMeta = co wyczytano ze zdjęcia auta
  onSuggestion: (s: Suggestion) => void; // kategoria / tablica z analizy
  onError: (e: unknown) => void;
  onCarExif?: (photo: PhotoItem) => void; // metadane (GPS, data) zdjęcia auta wyczytane lokalnie – od razu, bez czekania na analizę i upload
};

export function usePhotoBatch({ app, ensureDraft, applyApp, onSuggestion, onError, onCarExif }: Deps) {
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [slots, setSlots] = useState<Slots>(EMPTY_SLOTS);
  const [phase, setPhase] = useState<Phase>('idle');
  const [uploading, setUploading] = useState<Slot[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [crop, setCrop] = useState(false); // jedno zdjęcie: auto = wycinek pojazdu z tego samego zdjęcia co kontekst
  const cropRef = useRef(crop); cropRef.current = crop;
  const [cropPreview, setCropPreview] = useState<CropPreview | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false); // po usunięciu zdjęcia: role przeliczamy z opóźnieniem
  const reanalyzeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (reanalyzeTimer.current) clearTimeout(reanalyzeTimer.current); }, []);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]); // pewnie wykryte pojazdy (≥2 = pytamy, którego dotyczy zgłoszenie)
  const [plate, setPlate] = useState<string | null>(null); // tablica pojazdu zgłoszenia (wybrana lub domyślna)
  const plateRef = useRef<string | null>(null);
  const [plate2, setPlate2] = useState<string | null>(null); // „Oba”: tablica drugiego pojazdu (pierwszym jest `plate`)
  const bothRef = useRef(false); // użytkownik odpowiedział „Oba” (obowiązuje, dopóki na zdjęciach są dokładnie dwa pojazdy)
  const detectionsRef = useRef<PhotoDetections[]>([]); // odczyty ALPR zdjęć (lokalne id) – do ponownego wyboru ról
  // Wycinki z ORYGINAŁU (lib/crop.ts) liczone po wyborze auta: tablica (zawsze) i – przy jednym zdjęciu – samo auto.
  const [plateCropUri, setPlateCropUri] = useState<string | null>(null);
  const plateCrop = useRef<string | null>(null);
  const carCropId = useRef<string | null>(null); // photoId wycinka auta z oryginału (etap „wip”) – zamiast serwerowego `crop`
  const carPrep = useRef<Promise<void>>(Promise.resolve()); // przygotowanie wycinków; przydział auta na nie czeka
  const prepSeq = useRef(0);
  const originals = useRef(new Map<string, Promise<Original>>()); // oryginał (z orientacją) na zdjęcie – raz
  const carKey = useRef<string | null>(null); // co dokładnie leży w slocie auta: zdjęcie|wycinek|tablica
  const [failed, setFailed] = useState<Slot[]>([]); // sloty, których wysyłka się nie powiodła (retry = syncUploads)

  // refy = świeże wartości dla pętli wysyłki (działa poza cyklem renderowania)
  const photosRef = useRef(photos); photosRef.current = photos;
  const slotsRef = useRef(slots); slotsRef.current = slots;
  const appRef = useRef(app); appRef.current = app;
  const uploaded = useRef<Slots>({ ...EMPTY_SLOTS }); // który lokalny plik leży dziś na serwerze w slocie
  const batch = useRef(0); // numer partii – spóźnione wyniki starej partii są ignorowane
  const syncing = useRef(false);
  const again = useRef(false);

  const syncRef = useRef<() => Promise<void>>(async () => {});
  const syncUploads = useCallback(async () => {
    if (syncing.current) { again.current = true; return; }
    syncing.current = true;
    const myBatch = batch.current;
    try {
      do {
        again.current = false;
        const draft = await ensureDraft();
        for (const slot of SLOTS) {
          if (myBatch !== batch.current) return;
          if (slot === 'car') await carPrep.current; // wycinki z oryginału (tablica, auto przy jednym zdjęciu) muszą być gotowe
          const want = slotsRef.current[slot];
          // auto: o wersji decyduje też wycinek i wskazany pojazd (to samo zdjęcie może trafić do slotu na inny sposób)
          const key = slot === 'car' && want ? `${want}|${cropRef.current ? 1 : 0}|${carCropId.current ?? ''}|${plateRef.current ?? ''}` : want;
          const have = slot === 'car' ? carKey.current : uploaded.current[slot];
          if (have === key) continue;
          const server = appRef.current?.[TYPE[slot]]?.thumb;
          setUploading((u) => [...u, slot]);
          try {
            if (!want) {
              if (uploaded.current[slot] || server) applyApp(await deleteReportImage(draft.id, TYPE[slot]));
              uploaded.current[slot] = null;
              if (slot === 'car') carKey.current = null;
              continue;
            }
            const p = photosRef.current.find((x) => x.id === want);
            if (!p?.serverId) { again.current = true; continue; } // zdjęcie jeszcze się wysyła (etap „wip”)
            // data/GPS ze zdjęcia auta serwer ma przy zdjęciu (wysłaliśmy je razem z plikiem) – ustawi je i użyje wyniku ALPR z analizy
            const carMeta = slot === 'car' ? { gps: p.exif.lat != null && p.exif.lng != null, date: !!exifToIso(p.exif.datetimeOriginal) } : undefined;
            // jedno zdjęcie: auto = wycinek z oryginału (carCropId); gdy się nie udał – serwerowy `crop` z kopii 1600 px
            const fromOriginal = slot === 'car' && cropRef.current ? carCropId.current : null;
            const photoId = fromOriginal ?? p.serverId;
            applyApp(await assignReportPhoto(draft.id, TYPE[slot], photoId, slot === 'car' ? { ...(cropRef.current && !fromOriginal ? { crop: 'vehicle' as const } : {}), ...(plateRef.current ? { plate: plateRef.current } : {}) } : {}), carMeta);
            uploaded.current[slot] = want;
            if (slot === 'car') {
              carKey.current = key;
              // wycinek tablicy z oryginału podmienia serwerowy (78 px z kopii 1600 px); błąd nie jest krytyczny – zostaje serwerowy
              if (plateCrop.current) {
                try { applyApp(await uploadPlateImage(draft.id, plateCrop.current)); } catch (e: any) { log.warn('tablica', `wycinek z oryginału: ${String(e?.message ?? e).slice(0, 140)}`); }
              }
            }
            setFailed((f) => f.filter((s) => s !== slot));
          } catch (e) {
            // błąd jednego slotu nie przerywa pozostałych (jak na webie: błąd przy konkretnym zdjęciu); ponowienie – retry()
            setFailed((f) => (f.includes(slot) ? f : [...f, slot]));
            onError(e);
          } finally {
            setUploading((u) => u.filter((s) => s !== slot));
          }
        }
        if (again.current) await new Promise((r) => setTimeout(r, 150));
      } while (again.current);
    } catch (e) {
      onError(e);
    } finally {
      syncing.current = false;
      // Partia zmieniła się w trakcie pętli: wyrównanie poprosiło o kolejny przebieg, którego nikt by nie uruchomił.
      if (again.current && myBatch !== batch.current) setTimeout(() => void syncRef.current(), 0);
    }
  }, [ensureDraft, applyApp, onError]);
  syncRef.current = syncUploads;

  // zmiana slotów po analizie (podpowiedź albo ręczna korekta) → wyrównaj serwer
  useEffect(() => {
    if (phase === 'ready') void syncUploads();
  }, [slots, phase, syncUploads]);

  // Wycinki z oryginału dla wybranego auta: tablica (miniatura od razu lokalnie + wysyłka po przydziale auta) oraz – przy jednym
  // zdjęciu – auto (+20%) jako zdjęcie `wip` pochodne od przeanalizowanego (serwer przelicza jego odczyt ALPR, bez drugiego wywołania).
  const prepareCar = useCallback((carId: string | null, cropCar: boolean, chosenPlate: string | null, dets: PhotoDetections[], list: LocalPhoto[]) => {
    const seq = ++prepSeq.current;
    plateCrop.current = null; carCropId.current = null; setPlateCropUri(null);
    carPrep.current = (async () => {
      const p = list.find((x) => x.id === carId);
      const d = (dets.find((x) => x.id === carId)?.detections ?? [])
        .filter((x) => !chosenPlate || plateMatches(x.text, chosenPlate))
        .sort((a, b) => (b.vehicle_area ?? 0) - (a.vehicle_area ?? 0))[0];
      if (!p?.serverId || !d) return;
      let orig = originals.current.get(p.id);
      if (!orig) { orig = prepareOriginal(p.uri); originals.current.set(p.id, orig); }
      const base = await orig;
      if (seq !== prepSeq.current) return;
      if (d.plate_bbox) {
        const c = await cropRegion(base, bboxToRegion(d.plate_bbox, 0.12, 0.3), 800);
        if (seq !== prepSeq.current) return;
        plateCrop.current = c.uri;
        setPlateCropUri(c.uri);
      }
      if (cropCar && d.vehicle_bbox) {
        const region = bboxToRegion(d.vehicle_bbox, 0.2);
        const c = await cropRegion(base, region, 2400);
        const s = await stagePhoto(c.uri, {}, { from: p.serverId, region, plate: d.text });
        if (seq === prepSeq.current) carCropId.current = s.photoId;
      }
    })().catch((e) => log.warn('wycinki', `z oryginału: ${String(e?.message ?? e).slice(0, 160)}`)); // błąd = zostają wycinki serwerowe
  }, []);

  // Role z odczytów ALPR (`detectionsRef`), opcjonalnie dla pojazdu wskazanego przez użytkownika. Zastępuje ręczną zmianę ról:
  // jedyna decyzja użytkownika to „którego auta dotyczy zgłoszenie” (gdy wykryto kilka), reszta wynika ze zdjęć.
  const applyChoice = useCallback((chosenPlate?: string, list: LocalPhoto[] = photosRef.current, wantBoth = bothRef.current) => {
    const dets = detectionsRef.current;
    const choice = chooseRoles(dets, { plate: chosenPlate });
    // jedno zdjęcie: lokalny podgląd wycinka z boxu wskazanego pojazdu
    const carPhoto = choice.crop ? list.find((p) => p.id === choice.slots.car) : undefined;
    const d = choice.crop && choice.plate
      ? (dets.find((x) => x.id === choice.slots.car)?.detections ?? []).filter((x) => plateMatches(x.text, choice.plate!)).sort((a, b) => (b.vehicle_area ?? 0) - (a.vehicle_area ?? 0))[0]
      : undefined;
    setCropPreview(carPhoto?.small && d?.vehicle_bbox ? { uri: carPhoto.small.uri, w: carPhoto.small.width, h: carPhoto.small.height, box: d.vehicle_bbox } : null);
    plateRef.current = choice.plate;
    setPlate(choice.plate);
    const found = listVehicles(dets);
    setVehicles(found);
    // „Oba”: pojazd główny jak zwykle (zdjęcie auta, tablica), drugi tylko trafia do formularza
    const second = wantBoth && canChooseBoth(found) ? secondVehicle(found, choice.plate) : null;
    bothRef.current = !!second;
    setPlate2(second?.plate ?? null);
    setCrop(choice.crop);
    setSlots(choice.slots);
    setNote(choice.note);
    prepareCar(choice.slots.car, choice.crop, choice.plate, dets, list);
    return choice;
  }, [prepareCar]);

  const chooseVehicle = useCallback((chosen: string) => {
    const both = chosen === BOTH_VEHICLES;
    const choice = applyChoice(both ? undefined : chosen, photosRef.current, both);
    const car = photosRef.current.find((p) => p.id === choice.slots.car);
    if (car) onCarExif?.(car); // inne auto = inne zdjęcie auta = inna data/GPS
  }, [applyChoice, onCarExif]);

  const pick = useCallback(async () => {
    let my = -1;
    try {
      const picked = (await pickPhotos(MAX_BATCH, MIN_PHOTOS)) as LocalPhoto[];
      if (!picked.length) return;

      my = ++batch.current;
      const ids = picked.map((p) => p.id);
      setNote(null);
      setCrop(false);
      setVehicles([]); setPlate(null); setPlate2(null); bothRef.current = false; plateRef.current = null; detectionsRef.current = []; setCropPreview(null);
      originals.current.clear(); prepSeq.current++; plateCrop.current = null; carCropId.current = null; setPlateCropUri(null);
      if (reanalyzeTimer.current) { clearTimeout(reanalyzeTimer.current); reanalyzeTimer.current = null; setReanalyzing(false); }
      // 1) podgląd natychmiast, na razie w kolejności wyboru
      setPhotos(picked);
      setSlots(defaultSlots(ids));
      setPhase('preparing');
      // Jak na webie (images.js): data i GPS ze zdjęcia auta od razu w formularzu. Rola auta nie jest jeszcze znana,
      // więc zgadujemy zdjęcie z GPS, a po analizie poprawiamy wg przydziału.
      const guess = picked.find((p) => p.exif.lat != null) ?? picked[0];
      if (guess) onCarExif?.(guess);

      // 2) każde zdjęcie osobno i równolegle: jedno przeskalowanie → wysyłka na serwer (etap „wip”) → ALPR od razu po wysyłce
      // (opóźnienie = najwolniejsze zdjęcie, nie suma). Szkic powstanie dopiero przy przydziale do slotu; data/GPS z EXIF lecą
      // razem z plikiem (po przeskalowaniu EXIF znika). Błąd ALPR jednego zdjęcia = zdjęcie bez detekcji, nie przerwanie całości.
      let alprFailed = false;
      const processed = await Promise.all(picked.map(async (p) => {
        const small = await downscale(p.uri);
        const s = await stagePhoto(small.uri, { dateTime: exifToIso(p.exif.datetimeOriginal), lat: p.exif.lat, lng: p.exif.lng });
        let detections: Detection[] = [];
        try {
          detections = await analyzePhotoAlpr(s.photoId);
        } catch (e: any) {
          if (isPhotoQuotaError(e)) throw e; // limit zdjęć – nie udajemy „nie udało się odczytać tablicy”, tylko pokazujemy komunikat
          alprFailed = true;
          log.warn('alpr', `zdjęcie ${p.id}: ${String(e?.message ?? e).slice(0, 160)}`);
        }
        return { photo: { ...p, small, serverId: s.photoId } as LocalPhoto, detections };
      })); // błąd wysyłki = wyjątek niżej; zdjęcia, które już dotarły, wygasną po 24 h
      const staged = processed.map((x) => x.photo);
      if (my !== batch.current) { staged.forEach((p) => p.serverId && void deleteStagedPhoto(p.serverId)); return; }
      setPhotos(staged);

      // 3) wybór ról z samych odczytów ALPR (auto = największy pojazd, kontekst = to samo auto na innym zdjęciu)
      setPhase('analyzing');
      detectionsRef.current = processed.map((x) => ({ id: x.photo.id, detections: x.detections }));
      for (const x of processed) log.info('alpr', `${x.photo.id} ${x.detections.map((d) => `${d.text}${d.winner ? '*' : ''}@${d.vehicle_area}`).join(',') || '—'}`);
      const choice = applyChoice(undefined, staged);
      const note = alprFailed ? 'Nie udało się odczytać tablicy z części zdjęć – sprawdź numer rejestracyjny.' : choice.note;
      onSuggestion({ slots: choice.slots, plate: choice.plate, categoryId: 0, markers: [], reasons: note ? [note] : [], confident: choice.vehicleFound });
      setNote(note);
      const car = picked.find((p) => p.id === choice.slots.car);
      if (car) onCarExif?.(car); // rola auta ustalona – jeśli to inne zdjęcie niż zgadywane, popraw datę/GPS
      setPhase('ready'); // → efekt wyżej wysyła zdjęcia do szkicu
    } catch (e) {
      if (my === batch.current) { setPhotos([]); setSlots(EMPTY_SLOTS); setCrop(false); setVehicles([]); setPlate(null); setPlate2(null); bothRef.current = false; plateRef.current = null; detectionsRef.current = []; }
      setPhase('idle');
      onError(e);
    }
  }, [onSuggestion, onError, onCarExif, applyChoice]);

  // Usunięcie zdjęcia (np. innego auta) przelicza role dla pozostałych; wskazany pojazd zostaje, jeśli jeszcze jest na zdjęciach.
  const remove = useCallback((id: string) => {
    const serverId = photosRef.current.find((p) => p.id === id)?.serverId;
    if (serverId) void deleteStagedPhoto(serverId); // nieprzydzielone i tak wygasłoby po 24 h – sprzątamy od razu
    detectionsRef.current = detectionsRef.current.filter((d) => d.id !== id);
    setPhotos((l) => l.filter((p) => p.id !== id));
    // Zdjęcie znika od razu, a role (i wysyłkę na serwer) przeliczamy dopiero po chwili ciszy – seria kliknięć ✕ nie
    // przestawia w tym czasie kafelków ani nie wywołuje kolejnych przydziałów.
    if (reanalyzeTimer.current) clearTimeout(reanalyzeTimer.current);
    setReanalyzing(true);
    reanalyzeTimer.current = setTimeout(() => {
      reanalyzeTimer.current = null;
      applyChoice(plateRef.current ?? undefined);
      setReanalyzing(false);
    }, REANALYZE_DELAY_MS);
  }, [applyChoice]);

  const retry = useCallback(() => { setFailed([]); void syncUploads(); }, [syncUploads]);

  const vehicleIdx = plate && plate2 === null ? vehicles.findIndex((v) => plateMatches(v.plate, plate)) : -1;

  return { photos, slots, phase, uploading, note, crop, cropPreview, plateCropUri, reanalyzing, vehicles, vehicleIdx, both: plate2 !== null, plate2, chooseVehicle, failed, retry, pick, remove, busy: phase === 'preparing' || phase === 'analyzing' || reanalyzing || uploading.length > 0 };
}
