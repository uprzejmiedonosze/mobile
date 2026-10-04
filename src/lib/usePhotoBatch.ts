// 2–3 zdjęcia w jednym polu → podgląd od razu, potem analiza (ALPR + LLM po stronie backendu) podpowiada,
// które to kontekst / auto / dodatkowe, i dopiero wtedy zdjęcia idą do szkicu we właściwych slotach.
// Użytkownik może zmienić przydział – wysyłka (`syncUploads`) sama wyrównuje serwer do slotów.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UdApp } from '../api/apps';
import { createDraft, deleteReportImage, uploadReportImage, type PictureType } from '../api/reports';
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

export type LocalPhoto = PhotoItem & { small?: Scaled };
export type Phase = 'idle' | 'preparing' | 'analyzing' | 'ready';

type Deps = {
  app: UdApp | null;
  ensureDraft: () => Promise<UdApp>; // tworzy szkic przy pierwszym zdjęciu (jak web)
  applyApp: (a: UdApp) => void; // odpowiedź serwera po uploadzie (tablica, data, GPS z ALPR)
  onSuggestion: (s: Suggestion) => void; // kategoria / tablica z analizy
  onError: (e: unknown) => void;
};

export function usePhotoBatch({ app, ensureDraft, applyApp, onSuggestion, onError }: Deps) {
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [slots, setSlots] = useState<Slots>(EMPTY_SLOTS);
  const [phase, setPhase] = useState<Phase>('idle');
  const [uploading, setUploading] = useState<Slot[]>([]);
  const [note, setNote] = useState<string | null>(null);

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
            if (!p?.small) { again.current = true; continue; } // miniatura jeszcze się robi
            // data/GPS ze zdjęcia auta – serwer ustawi je i rozpozna tablicę (ALPR)
            const meta = slot === 'car' ? { dateTime: exifToIso(p.exif.datetimeOriginal), lat: p.exif.lat, lng: p.exif.lng } : {};
            applyApp(await uploadReportImage(draft.id, TYPE[slot], p.small.uri, meta, true));
            uploaded.current[slot] = want;
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
    try {
      const picked = (await pickPhotos(MAX_BATCH)) as LocalPhoto[];
      if (!picked.length) return;
      if (picked.length < MIN_PHOTOS) { toast.error('Wybierz od razu 2 lub 3 zdjęcia (kontekst, auto z tablicą, opcjonalnie dodatkowe).'); return; }

      const my = ++batch.current;
      const ids = picked.map((p) => p.id);
      setNote(null);
      // 1) podgląd natychmiast, na razie w kolejności wyboru
      setPhotos(picked);
      setSlots(defaultSlots(ids));
      setPhase('preparing');

      // 2) miniatury (base64 do analizy + plik do wysyłki), równolegle ze szkicem
      const [small] = await Promise.all([
        Promise.all(picked.map((p) => downscale(p.uri, { base64: true }))),
        ensureDraft(),
      ]);
      if (my !== batch.current) return;
      const withSmall = picked.map((p, i) => ({ ...p, small: small[i] }));
      setPhotos(withSmall);

      // 3) analiza: ALPR + LLM → podpowiedź ról
      setPhase('analyzing');
      let next = defaultSlots(ids);
      try {
        const analyzed = await analyzeCandidate('form', withSmall.map((p, i) => ({ photo_index: i, photoId: p.id, b64: p.small!.b64! })));
        analyzed.forEach((p, i) => { if (!p.photoId) p.photoId = ids[p.photo_index ?? i]; });
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
      setPhase('ready'); // → efekt wyżej wysyła zdjęcia do szkicu
    } catch (e) {
      setPhase('idle');
      onError(e);
    }
  }, [ensureDraft, onSuggestion, onError]);

  const assign = useCallback((id: string, to: Slot | null) => setSlots((s) => assignSlot(s, id, to)), []);

  const remove = useCallback((id: string) => {
    setSlots((s) => assignSlot(s, id, null));
    setPhotos((l) => l.filter((p) => p.id !== id));
  }, []);

  return { photos, slots, phase, uploading, note, pick, assign, remove, busy: phase === 'preparing' || phase === 'analyzing' || uploading.length > 0 };
}
