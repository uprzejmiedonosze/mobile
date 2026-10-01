import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { uploadConfig } from '../config';
import { log } from '../lib/log';
import { attachSharedContext, buildDraftOrder, cacheKeyFor, compose, loadAnalysisCache, saveAnalysisCache, splitByPlate, type AnalysisRecord } from '../lib/compose';
import { SCHEMA } from '../lib/vision';
import { analyzeCandidate, type VisionItem } from '../api/vision';
import { useSession } from '../store/useSession';
import { ud } from '../theme';
import { UdButton, UdCard, UdHeader, UdTabs } from '../components/UD';

type Row = { id: string; status: string };

// Zwraca też width/height MINIATURY (nie oryginału) – to jest przestrzeń, w której backend
// liczy bboxy (0..1000 względem WYSŁANEGO obrazu). Image.getSize(oryginał) w UdPhoto bywał
// niezgodny z tą przestrzenią na zdjęciach z EXIF-orientacją (bufor sensora vs. wyświetlana
// orientacja) – stąd boxy "kompletnie off" mimo poprawnej transformacji "cover". Przekazując
// realne wymiary wysłanej miniatury dalej (PairingScreen -> UdPhoto), obie strony (model i
// nakładka) patrzą na tę samą, jednoznaczną przestrzeń współrzędnych.
async function thumb(uri: string): Promise<{ b64: string; width: number; height: number }> {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: uploadConfig.photoMaxWidth } }], {
    compress: uploadConfig.photoCompress,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  } as any);
  if (!out.base64) throw new Error('miniatura bez base64');
  return { b64: out.base64, width: out.width, height: out.height };
}

export function AnalyzeScreen({ navigation }: any) {
  const { photos, candidates, setAnalysis } = useSession();
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const go = (r: string) => navigation.navigate(r);
  const byId = new Map(photos.map((p) => [p.id, p]));
  // Grupy odrzucone w kroku 2 (1 zdjęcie, brak pary kontekst+tablica) nie idą do wizji – nie da
  // się z nich złożyć zgłoszenia, a to tylko marnowałoby żądanie do backendu.
  const validCandidates = candidates.filter((c) => c.photoIds.length >= 2);

  const run = async () => {
    log.info('wizja', `start: ${validCandidates.length} kandydatów (backend UD)`);
    setBusy(true);
    setErr(null);
    setDone(0);
    setRows(validCandidates.map((c) => ({ id: c.reportId, status: '…' })));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const cache = await loadAnalysisCache();
    const all: AnalysisRecord[] = [];
    let cacheDirty = false;

    for (const cand of validCandidates) {
      const setRow = (status: string) =>
        setRows((prev) => prev.map((r) => (r.id === cand.reportId ? { ...r, status } : r)));
      try {
        const key = cacheKeyFor(cand.reportId, cand.photoIds);
        const related = [key, ...Object.keys(cache).filter((k) => k.startsWith(key + ':'))]
          .map((k) => cache[k])
          .filter((r) => r && r.schema === SCHEMA);
        if (related.length && related.every((r) => r.cacheKey === key)) {
          log.info('wizja', `${cand.reportId}: cache (${related.map((r) => r.reportId).join(',')}), pomijam`);
          const first = related[0];
          setRow(`cache: ${related.map((r) => r.plate ?? '—').join(',')} kat.${related.map((r) => r.categoryId).join(',')}${related.some((r) => r.needsReview) ? ' [REVIEW]' : ''}`);
          all.push(...related);
          void first;
          continue;
        }
        setRow('miniatury…');
        const items: VisionItem[] = [];
        const photoDims: Record<string, { w: number; h: number }> = {};
        for (let k = 0; k < cand.photoIds.length; k++) {
          const pid = cand.photoIds[k];
          const uri = byId.get(pid)?.uri;
          if (!uri) throw new Error(`brak zdjęcia ${pid.slice(-8)}`);
          const t = await thumb(uri);
          items.push({ photo_index: k, photoId: pid, b64: t.b64 });
          photoDims[pid] = { w: t.width, h: t.height };
        }
        setRow(`analiza (${items.length} zdj.)…`);
        const analyzed = await analyzeCandidate(cand.reportId, items, ctrl.signal);
        for (const p of analyzed) {
          // belt-and-braces: backend już echouje photoId, ale gdyby nie – dociągamy po indeksie.
          if (!p.photoId) p.photoId = items.find((i) => i.photo_index === p.photo_index)?.photoId ?? '';
        }
        // split + compose + shared context + draft order
        const photoIds = analyzed.map((p) => p.photoId);
        const built: AnalysisRecord[] = [];
        for (const sub of splitByPlate(cand.reportId, photoIds, analyzed)) {
          const rec = compose(sub.subId, sub.subPhotoIds, sub.subPhotos);
          rec.cacheKey = cacheKeyFor(cand.reportId, cand.photoIds);
          rec.photoDims = photoDims;
          if (sub.split) rec.splitFrom = cand.reportId;
          built.push(rec);
        }
        attachSharedContext(built);
        for (const rec of built) {
          buildDraftOrder(rec);
          cache[cacheKeyFor(cand.reportId, cand.photoIds) + (rec.splitFrom ? `:${rec.reportId}` : '')] = rec;
          all.push(rec);
        }
        cacheDirty = true;
        const plates = [...new Set(built.map((r) => r.plate).filter(Boolean))].join(',');
        setRow(`${built.length > 1 ? `split→${built.map((r) => r.reportId).join(',')}` : `tablica=${plates || '—'}`} kat.${built.map((r) => r.categoryId).join(',')}${built.some((r) => r.needsReview) ? ' [REVIEW]' : ''}`);
      } catch (e: any) {
        const msg = e?.name === 'AbortError' ? 'abort/timeout' : String(e?.message ?? e).slice(0, 180);
        log.error('wizja', `${cand.reportId}: ${msg}`);
        setRow(`BŁĄD: ${msg}`);
      }
      setDone((d) => d + 1);
    }
    if (cacheDirty) await saveAnalysisCache(cache);
    setAnalysis(all);
    setBusy(false);
    abortRef.current = null;
    const ready = all.filter((r) => !r.needsReview).length;
    log.info('wizja', `koniec: ${all.length} szkiców, gotowe ${ready}`);
    if (!all.length) {
      setErr('Brak wyników – sprawdź błędy powyżej / logi w terminalu.');
      return;
    }
    go('Pairs');
  };

  // Wchodzimy tu już w trybie analizy LLM – pomijamy pośredni ekran z samym przyciskiem
  // Dalej, start od razu po wejściu na ekran (zamiast czekać na kliknięcie).
  useEffect(() => {
    if (startedRef.current || !validCandidates.length) return;
    startedRef.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validCandidates]);

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader onBack={() => go('Grouping')} onNext={undefined} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <UdCard>
          <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 17 }}>Wizja: {validCandidates.length} kandydatów ({done}/{validCandidates.length}).</Text>
          <Text style={{ color: ud.muted, marginTop: 4 }}>Analiza po stronie serwera UD (1 żądanie na kandydata: role, tablice, markery, weryfikacja bbox). Kategorie liczy kod, nie model.</Text>
        </UdCard>
        {err ? (
          <UdCard>
            <Text style={{ color: 'red' }}>{err}</Text>
            <UdButton title="Spróbuj ponownie" variant="accent" onPress={run} disabled={busy} />
          </UdCard>
        ) : null}
        {rows.map((r) => (
          <UdCard key={r.id}>
            <Text style={{ color: ud.text }} numberOfLines={3}>
              {r.id}: {r.status}
            </Text>
          </UdCard>
        ))}
        {busy ? <UdButton title="Przerwij" variant="outline" onPress={() => abortRef.current?.abort()} /> : null}
      </ScrollView>
      <UdTabs current="Analyze" navigate={go} />
    </View>
  );
}
