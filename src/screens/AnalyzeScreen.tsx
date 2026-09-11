import { useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { llmConfig } from '../config';
import { log } from '../lib/log';
import { attachSharedContext, buildDraftOrder, cacheKeyFor, compose, loadAnalysisCache, saveAnalysisCache, splitByPlate, type AnalysisRecord } from '../lib/compose';
import { SCHEMA, type VisionPhoto } from '../lib/vision';
import { analyzeCandidate, retryPlateCrop, verifyPlateBox, type VisionItem } from '../api/vision';
import { useSession } from '../store/useSession';
import { ud } from '../theme';
import { UdButton, UdCard, UdHeader, UdTabs } from '../components/UD';

type Row = { id: string; status: string };

async function thumbB64(uri: string): Promise<string> {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: llmConfig.photoMaxWidth } }], {
    compress: llmConfig.photoCompress,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  } as any);
  if (!out.base64) throw new Error('miniatura bez base64');
  return out.base64;
}

export function AnalyzeScreen({ navigation }: any) {
  const { photos, candidates, setAnalysis, sparkKey, sparkModel, setSparkKey, setSparkModel } = useSession();
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const go = (r: string) => navigation.navigate(r);
  const byId = new Map(photos.map((p) => [p.id, p]));

  const run = async () => {
    if (!sparkKey.trim()) {
      const m = 'Wklej klucz OpenRouter (sk-or-v1-…). Bez niego wizja nie ruszy.';
      setErr(m);
      log.error('wizja', m);
      return;
    }
    const model = sparkModel || llmConfig.model;
    log.info('wizja', `start: ${candidates.length} kandydatów, model=${model}`);
    setBusy(true);
    setErr(null);
    setDone(0);
    setRows(candidates.map((c) => ({ id: c.reportId, status: '…' })));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const cache = await loadAnalysisCache();
    const all: AnalysisRecord[] = [];
    let cacheDirty = false;

    for (const cand of candidates) {
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
        for (let k = 0; k < cand.photoIds.length; k++) {
          const pid = cand.photoIds[k];
          const uri = byId.get(pid)?.uri;
          if (!uri) throw new Error(`brak zdjęcia ${pid.slice(-8)}`);
          items.push({ photo_index: k, photoId: pid, uri, thumbB64: await thumbB64(uri) });
        }
        setRow(`wizja (${items.length} zdj.)…`);
        const analyzed = await analyzeCandidate(sparkKey, model, items, ctrl.signal);
        for (const p of analyzed) {
          const it = items.find((i) => i.photo_index === p.photo_index)!;
          p.photoId = it.photoId;
        }
        // retry: auto bez czytelnej tablicy (q >= 0.3) – crop z oryginału
        for (const p of analyzed) {
          if (p.role === 'car' && !p.plate?.readable && (p.quality ?? 0) >= 0.3) {
            const it = items.find((i) => i.photo_index === p.photo_index)!;
            const text = await retryPlateCrop(sparkKey, model, it, p, ctrl.signal);
            if (text) {
              p.plate = { readable: true, text, bbox: null, from_crop: true };
              log.info('wizja', `${cand.reportId} zdj.${p.photo_index}: tablica z cropa: ${text}`);
            }
          }
        }
        // weryfikacja bbox cropem (zawsze po świeżej analizie)
        for (const p of analyzed) {
          const it = items.find((i) => i.photo_index === p.photo_index)!;
          const { status, bbox } = await verifyPlateBox(sparkKey, model, it, p, ctrl.signal);
          if (status === 'ok' && bbox) {
            p.plate.bbox = bbox as any;
            p.plate_verified = true;
            log.info('wizja', `${cand.reportId} zdj.${p.photo_index}: bbox zweryfikowany`);
          } else if (status === 'mismatch') {
            p.plate.plate_check = 'unverified-box';
            log.warn('wizja', `${cand.reportId} zdj.${p.photo_index}: pozycja tablicy niepotwierdzona`);
          }
        }
        // split + compose + shared context + draft order
        const photoIds = analyzed.map((p) => p.photoId);
        const built: AnalysisRecord[] = [];
        for (const sub of splitByPlate(cand.reportId, photoIds, analyzed)) {
          const rec = compose(sub.subId, sub.subPhotoIds, sub.subPhotos);
          rec.cacheKey = cacheKeyFor(cand.reportId, cand.photoIds);
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

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader onBack={() => go('Picker')} onNext={undefined} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <UdCard>
          <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 17 }}>Wizja: {candidates.length} kandydatów ({done}/{candidates.length}).</Text>
          <Text style={{ color: ud.muted, marginTop: 4 }}>1 call na kandydata (role, tablice, markery) + crop-weryfikacja + split po tablicy. Kategorie liczy kod, nie model.</Text>
        </UdCard>
        <UdCard>
          <Text style={{ color: ud.heading, fontWeight: '700' }}>Model (z .env)</Text>
          <TextInput value={sparkModel} onChangeText={setSparkModel} placeholder={llmConfig.model} autoCapitalize="none" style={{ borderWidth: 1, borderColor: ud.hairline, borderRadius: 10, padding: 10, marginTop: 6 }} />
          <Text style={{ color: ud.heading, fontWeight: '700', marginTop: 10 }}>Klucz OpenRouter</Text>
          <TextInput value={sparkKey} onChangeText={setSparkKey} placeholder="sk-or-v1-…" autoCapitalize="none" secureTextEntry style={{ borderWidth: 1, borderColor: ud.hairline, borderRadius: 10, padding: 10, marginTop: 6 }} />
        </UdCard>
        {err ? (
          <UdCard>
            <Text style={{ color: 'red' }}>{err}</Text>
          </UdCard>
        ) : null}
        {rows.map((r) => (
          <UdCard key={r.id}>
            <Text style={{ color: ud.text }} numberOfLines={3}>
              {r.id}: {r.status}
            </Text>
          </UdCard>
        ))}
        <UdButton title={busy ? 'Analizuję…' : 'Dalej'} variant="accent" onPress={run} disabled={busy || !candidates.length} />
        {busy ? <UdButton title="Przerwij" variant="outline" onPress={() => abortRef.current?.abort()} /> : null}
      </ScrollView>
      <UdTabs current="Analyze" navigate={go} />
    </View>
  );
}
