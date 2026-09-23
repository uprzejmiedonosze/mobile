#!/usr/bin/env tsx
// Krok "compose" — deterministyczny ogon appki NAD wynikami LLM z vision-local.php (faza 3).
// Świadomie osobny krok od prep.ts/vision-local.php (patrz plan
// nie-jestem-zadowolony-z-curious-comet.md) — to czysto lokalna logika TS bez API, więc darmowy
// i natychmiastowy. Wzorzec 1:1 z src/screens/AnalyzeScreen.tsx (splitByPlate -> compose ->
// attachSharedContext PER KANDYDAT -> buildDraftOrder), bez modyfikacji tamtego kodu.
//
// Wejście: tests/.cache/prep/manifest.json (prep.ts) + tests/results/local/<reportId>.json
// (vision-local.php). Kandydat bez pliku, albo z wynikiem policzonym dla innego zestawu zdjęć
// (numeracja R00x przesunęła się po zmianie zbioru w prep.ts) — pomijany, nie przerywa reszty.
//
// Użycie: npx tsx compose-local.ts

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { splitByPlate, compose, attachSharedContext, buildDraftOrder, type AnalysisRecord } from '../../src/lib/compose.ts';
import type { VisionPhoto } from '../../src/lib/vision.ts';

const TESTS_DIR = path.resolve(import.meta.dirname, '..');
const MANIFEST_PATH = path.join(TESTS_DIR, '.cache/prep/manifest.json');
const LOCAL_DIR = path.join(TESTS_DIR, 'results/local');
const OUT_PATH = path.join(TESTS_DIR, 'results/composed.json');

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const photoDimsAll: Record<string, { w: number; h: number }> = {};
  for (const p of manifest.photos) photoDimsAll[p.photoId] = { w: p.thumbW, h: p.thumbH };

  const allRecords: AnalysisRecord[] = [];
  const skipped: string[] = [];

  for (const cand of manifest.candidates) {
    let raw: { photos: VisionPhoto[] } | null = null;
    try {
      raw = JSON.parse(await readFile(path.join(LOCAL_DIR, `${cand.reportId}.json`), 'utf8'));
    } catch {
      skipped.push(`${cand.reportId} (brak wyniku — odpal: make step2 CANDIDATE=${cand.reportId})`);
      continue;
    }
    if (!raw?.photos) {
      skipped.push(`${cand.reportId} (pusty/niepoprawny wynik)`);
      continue;
    }

    // Ten sam sanity-check co step2.html: numeracja R00x jest sekwencyjna po czasie, dorzucenie/
    // usunięcie zdjęcia w step1 przesuwa, które fizyczne zdjęcia dziś noszą dany reportId.
    const resultIds = new Set(raw.photos.map((p) => p.photoId));
    const manifestIds = new Set<string>(cand.photoIds);
    const stale = resultIds.size !== manifestIds.size || [...manifestIds].some((id) => !resultIds.has(id));
    if (stale) {
      skipped.push(`${cand.reportId} (wynik nieaktualny — inny zestaw zdjęć niż dziś w manifeście)`);
      continue;
    }

    const built: AnalysisRecord[] = [];
    for (const sub of splitByPlate(cand.reportId, cand.photoIds, raw.photos)) {
      const rec = compose(sub.subId, sub.subPhotoIds, sub.subPhotos);
      rec.cacheKey = cand.reportId;
      rec.photoDims = photoDimsAll;
      if (sub.split) rec.splitFrom = cand.reportId;
      built.push(rec);
    }
    // Per kandydat, nie globalnie — reguła B pożycza kontekst tylko od rodzeństwa z TEGO SAMEGO
    // oryginalnego kandydata (dokładnie jak w AnalyzeScreen.tsx:101), nie z całej sesji.
    attachSharedContext(built);
    for (const rec of built) buildDraftOrder(rec);
    allRecords.push(...built);
  }

  await writeFile(OUT_PATH, JSON.stringify(allRecords, null, 2));
  console.log(`compose-local: ${allRecords.length} zgłoszeń z ${manifest.candidates.length - skipped.length}/${manifest.candidates.length} kandydatów -> ${OUT_PATH}`);
  for (const rec of allRecords) {
    const tag = rec.splitFrom ? ` (split z ${rec.splitFrom})` : '';
    const review = rec.needsReview ? ` [REVIEW: ${rec.reviewReasons.join('; ')}]` : '';
    console.log(`  ${rec.reportId}${tag}: tablica=${rec.plate ?? '—'} kat=${rec.categoryId}${review}`);
  }
  if (skipped.length) {
    console.log('\npominięto:');
    for (const s of skipped) console.log(`  ${s}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
