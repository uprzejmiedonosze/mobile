// 2–3 zdjęcia w jednym polu → podgląd od razu; zdjęcia lecą na serwer RAZ (etap „wip”, api/photos.ts), tam są analizowane
// po photoId (ALPR + LLM) i podpowiadają, które to kontekst / auto / dodatkowe; dopiero potem trafiają do szkicu we właściwych
// slotach (`assignReportPhoto` – serwer sam bierze plik ze swojego dysku, ALPR nie jest wołany drugi raz).
// Użytkownik może zmienić przydział – `syncUploads` wyrównuje serwer do slotów, a zamiana ról nie wysyła zdjęć ponownie.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UdApp } from '../api/apps';
import { assignReportPhoto, deleteReportImage, type PictureType } from '../api/reports';
import { deleteStagedPhoto, stagePhoto } from '../api/photos';
import { analyzeCandidate, VisionQuotaError } from '../api/vision';
import { pickPhotos } from './gallery';
import { log } from './log';
import { downscale, type Scaled } from './resize';
import { exifToIso } from './reports';
import { assignSlot, defaultSlots, EMPTY_SLOTS, suggestSlots, type Slot, type Slots, type Suggestion } from './suggest';
import { describePhoto } from './trace';
import { toast } from '../store/useToast';
import type { PhotoItem } from '../types';

export const MIN_PHOTOS = 2;
export const MAX_BATCH = 3;
const TYPE: Record<Slot, PictureType> = { context: 'contextImage', car: 'carImage', third: 'thirdImage' };
const SLOTS: Slot[] = ['context', 'car', 'third'];

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
            applyApp(await assignReportPhoto(draft.id, TYPE[slot], p.serverId), carMeta);
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
      if (picked.length < MIN_PHOTOS) { toast.error('Wybierz od razu 2 lub 3 zdjęcia (kontekst, auto z tablicą, opcjonalnie dodatkowe).'); return; }

      my = ++batch.current;
      const ids = picked.map((p) => p.id);
      setNote(null);
      // 1) podgląd natychmiast, na razie w kolejności wyboru
      setPhotos(picked);
      setSlots(defaultSlots(ids));
      setPhase('preparing');
      // Jak na webie (images.js): data i GPS ze zdjęcia auta od razu w formularzu. Rola auta nie jest jeszcze znana,
      // więc zgadujemy: zdjęcie z GPS (domyślnie drugie), a po analizie poprawiamy wg przydziału.
      const guess = picked.find((p) => p.id === defaultSlots(ids).car && p.exif.lat != null) ?? picked.find((p) => p.exif.lat != null) ?? picked[1] ?? picked[0];
      if (guess) onCarExif?.(guess);

      // 2) każde zdjęcie: jedno przeskalowanie → jedna wysyłka na serwer (etap „wip”), równolegle; szkic powstanie dopiero
      // przy przydziale do slotu. Data/GPS z EXIF lecą razem z plikiem (po przeskalowaniu EXIF znika).
      const staged: LocalPhoto[] = await Promise.all(picked.map(async (p): Promise<LocalPhoto> => {
        const small = await downscale(p.uri);
        const s = await stagePhoto(small.uri, { dateTime: exifToIso(p.exif.datetimeOriginal), lat: p.exif.lat, lng: p.exif.lng });
        return { ...p, small, serverId: s.photoId };
      })); // błąd wysyłki = wyjątek niżej; zdjęcia, które już dotarły, wygasną po 24 h
      if (my !== batch.current) { staged.forEach((p) => p.serverId && void deleteStagedPhoto(p.serverId)); return; }
      setPhotos(staged);

      // 3) analiza: ALPR + LLM → podpowiedź ról
      setPhase('analyzing');
      let next = defaultSlots(ids);
      try {
        // backend czyta zdjęcia po photoId z dysku (bez base64); w odpowiedzi wracamy do lokalnych id, na których stoi `suggestSlots`
        const analyzed = await analyzeCandidate('form', staged.map((p, i) => ({ photo_index: i, photoId: p.serverId! })));
        analyzed.forEach((p, i) => { p.photoId = ids[p.photo_index ?? i]; });
        for (const p of analyzed) log.info('trace', `form ${describePhoto(p)}`);
        const s = suggestSlots(ids, analyzed);
        if (my !== batch.current) return;
        next = s.slots;
        onSuggestion(s);
        if (!s.confident) setNote('Nie jestem pewien, które zdjęcie jest które – sprawdź przydział poniżej.');
      } catch (e: any) {
        log.warn('wizja', `formularz: ${String(e?.message ?? e).slice(0, 200)}`);
        setNote(e instanceof VisionQuotaError ? e.message : 'Nie udało się rozpoznać zdjęć – ustaw, które jest które.');
      }
      if (my !== batch.current) return;
      setSlots(next);
      const car = picked.find((p) => p.id === next.car);
      if (car) onCarExif?.(car); // rola auta ustalona – jeśli to inne zdjęcie niż zgadywane, popraw datę/GPS
      setPhase('ready'); // → efekt wyżej wysyła zdjęcia do szkicu
    } catch (e) {
      if (my === batch.current) { setPhotos([]); setSlots(EMPTY_SLOTS); }
      setPhase('idle');
      onError(e);
    }
  }, [onSuggestion, onError, onCarExif]);

  const assign = useCallback((id: string, to: Slot | null) => setSlots((s) => assignSlot(s, id, to)), []);

  const remove = useCallback((id: string) => {
    const serverId = photosRef.current.find((p) => p.id === id)?.serverId;
    if (serverId) void deleteStagedPhoto(serverId); // nieprzydzielone i tak wygasłoby po 24 h – sprzątamy od razu
    setSlots((s) => assignSlot(s, id, null));
    setPhotos((l) => l.filter((p) => p.id !== id));
  }, []);

  const retry = useCallback(() => { setFailed([]); void syncUploads(); }, [syncUploads]);

  return { photos, slots, phase, uploading, note, failed, retry, pick, assign, remove, busy: phase === 'preparing' || phase === 'analyzing' || uploading.length > 0 };
}
