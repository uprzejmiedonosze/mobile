// 1–3 zdjęcia w jednym polu → podgląd od razu; zdjęcia lecą na serwer RAZ (etap „wip”, api/photos.ts), dla każdego od razu liczony
// jest sam ALPR (bez LLM, raz na zdjęcie), a `chooseRoles` (lib/roles.ts) wybiera auto i kontekst z odczytów. Dopiero potem zdjęcia
// trafiają do szkicu we właściwych slotach (`assignReportPhoto` – serwer sam bierze plik ze swojego dysku). Jedno zdjęcie =
// kontekst + wycinek auta z tego samego zdjęcia (`crop`). Zamiana ról nie wysyła zdjęć ponownie.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UdApp } from '../api/apps';
import { assignReportPhoto, deleteReportImage, type PictureType } from '../api/reports';
import { analyzePhotoAlpr, deleteStagedPhoto, stagePhoto } from '../api/photos';
import { pickPhotos } from './gallery';
import { log } from './log';
import { downscale, type Scaled } from './resize';
import { exifToIso } from './reports';
import { chooseRoles, SLOT_ORDER, type Detection } from './roles';
import { assignSlot, defaultSlots, EMPTY_SLOTS, type Slot, type Slots, type Suggestion } from './suggest';
import type { PhotoItem } from '../types';

export const MIN_PHOTOS = 1;
export const MAX_BATCH = 3;
const TYPE: Record<Slot, PictureType> = { context: 'contextImage', car: 'carImage', third: 'thirdImage' };
const SLOTS: Slot[] = SLOT_ORDER; // auto → kontekst → dodatkowe

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
          const want = slotsRef.current[slot];
          if (uploaded.current[slot] === want) continue;
          const server = appRef.current?.[TYPE[slot]]?.thumb;
          setUploading((u) => [...u, slot]);
          try {
            if (!want) {
              if (uploaded.current[slot] || server) applyApp(await deleteReportImage(draft.id, TYPE[slot]));
              uploaded.current[slot] = null;
              continue;
            }
            const p = photosRef.current.find((x) => x.id === want);
            if (!p?.serverId) { again.current = true; continue; } // zdjęcie jeszcze się wysyła (etap „wip”)
            // data/GPS ze zdjęcia auta serwer ma przy zdjęciu (wysłaliśmy je razem z plikiem) – ustawi je i użyje wyniku ALPR z analizy
            const carMeta = slot === 'car' ? { gps: p.exif.lat != null && p.exif.lng != null, date: !!exifToIso(p.exif.datetimeOriginal) } : undefined;
            applyApp(await assignReportPhoto(draft.id, TYPE[slot], p.serverId, slot === 'car' && cropRef.current ? { crop: 'vehicle' } : {}), carMeta);
            uploaded.current[slot] = want;
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

  const pick = useCallback(async () => {
    let my = -1;
    try {
      const picked = (await pickPhotos(MAX_BATCH, MIN_PHOTOS)) as LocalPhoto[];
      if (!picked.length) return;

      my = ++batch.current;
      const ids = picked.map((p) => p.id);
      setNote(null);
      setCrop(false);
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
      const choice = chooseRoles(processed.map((x) => ({ id: x.photo.id, detections: x.detections })));
      for (const x of processed) log.info('alpr', `${x.photo.id} ${x.detections.map((d) => `${d.text}${d.winner ? '*' : ''}@${d.vehicle_area}`).join(',') || '—'}`);
      const note = alprFailed ? 'Nie udało się odczytać tablicy z części zdjęć – sprawdź przydział i numer rejestracyjny.' : choice.note;
      onSuggestion({ slots: choice.slots, plate: choice.plate, categoryId: 0, markers: [], reasons: note ? [note] : [], confident: choice.vehicleFound });
      setNote(note);
      setCrop(choice.crop);
      setSlots(choice.slots);
      const car = picked.find((p) => p.id === choice.slots.car);
      if (car) onCarExif?.(car); // rola auta ustalona – jeśli to inne zdjęcie niż zgadywane, popraw datę/GPS
      setPhase('ready'); // → efekt wyżej wysyła zdjęcia do szkicu
    } catch (e) {
      if (my === batch.current) { setPhotos([]); setSlots(EMPTY_SLOTS); setCrop(false); }
      setPhase('idle');
      onError(e);
    }
  }, [onSuggestion, onError, onCarExif]);

  const assign = useCallback((id: string, to: Slot | null) => {
    if (photosRef.current.length < 2) return; // jedno zdjęcie pełni obie role (kontekst + wycinek auta) – nie ma czego zamieniać
    setSlots((s) => assignSlot(s, id, to));
  }, []);

  const remove = useCallback((id: string) => {
    const serverId = photosRef.current.find((p) => p.id === id)?.serverId;
    if (serverId) void deleteStagedPhoto(serverId); // nieprzydzielone i tak wygasłoby po 24 h – sprzątamy od razu
    // jedno zdjęcie może zajmować dwa sloty (kontekst + wycinek auta) – czyścimy wszystkie
    setSlots((s) => ({ car: s.car === id ? null : s.car, context: s.context === id ? null : s.context, third: s.third === id ? null : s.third }));
    setCrop(false);
    setPhotos((l) => l.filter((p) => p.id !== id));
  }, []);

  const retry = useCallback(() => { setFailed([]); void syncUploads(); }, [syncUploads]);

  return { photos, slots, phase, uploading, note, crop, failed, retry, pick, assign, remove, busy: phase === 'preparing' || phase === 'analyzing' || uploading.length > 0 };
}
