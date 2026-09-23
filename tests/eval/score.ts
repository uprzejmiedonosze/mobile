#!/usr/bin/env tsx
// Krok 6 planu: metryki per zdjęcie, per kandydat, i zagregowane per konfiguracja (model×prompt×
// pipeline×batching), względem tests/groundtruth.json. Czyta wszystkie tests/results/runs/*.json
// (cache z run.ts), NIE woła żadnego API — czysto lokalne liczenie, darmowe i powtarzalne.
//
// Użycie: npx tsx score.ts
// Wynik: tests/results/scores.json (wejście dla report.ts)

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normPlateKey, type Box4, type VisionPhoto } from './schema.ts';
import { rankCategories } from './relations.ts';
import { splitByPlate, compose } from '../../src/lib/compose.ts';
import { ruleCategory } from '../../src/lib/vision.ts';
import type { GroundTruth, GtPhoto } from './groundtruth-types.ts';

const TESTS_DIR = path.resolve(import.meta.dirname, '..');
const RUNS_DIR = path.join(TESTS_DIR, 'results/runs');
const GT_PATH = path.join(TESTS_DIR, 'groundtruth.json');
const OUT_PATH = path.join(TESTS_DIR, 'results/scores.json');

const WEIGHTS = { plate: 0.35, category: 0.25, role: 0.2, plateBbox: 0.15, carBbox: 0.05 };

type RunFile = {
  cell: { model: string; providerTag: string | null; promptId: string; pipelineVariant: string; batching: string; repeat: number; reportId: string };
  result?: {
    photos: VisionPhoto[];
    usage: { calls: number; promptTokens: number; completionTokens: number; costUsd: number };
    warnings: string[];
    repairRounds: number;
    providerMismatches: number;
    latenciesMs: number[];
  };
  error?: string;
};

function iou(a: Box4 | null, b: Box4 | null): number | null {
  if (!a || !b) return null;
  const [ax1, ay1, ax2, ay2] = a;
  const [bx1, by1, bx2, by2] = b;
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
  const areaB = Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

// Levenshtein — do CER (character error rate) tablic.
function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

type PhotoScore = {
  photoId: string;
  roleCorrect: boolean | null;
  plateExact: boolean | null; // null = GT ma nieczytelną tablicę i model też (nie dotyczy)
  plateCER: number | null;
  plateFalsePositive: boolean; // model twierdzi że czytelna, GT mówi że nie ma tablicy
  plateBboxIou: number | null;
  carBboxIou: number | null;
  markerF1: number | null; // tylko v0-v3
  sceneObjectRecall: number | null; // tylko v4/v5
  categoryCorrectRule: boolean | null; // ruleCategory(markers) vs GT.categoryId
  categoryCorrectSuggested: boolean | null; // suggested_category/categoryId model vs GT
  categoryTop2Relations: boolean | null; // tylko v4/v5: czy GT.categoryId w top-2 rankCategories(scene)
};

function scorePhoto(vp: VisionPhoto, gt: GtPhoto | undefined): PhotoScore {
  if (!gt) {
    return { photoId: vp.photoId, roleCorrect: null, plateExact: null, plateCER: null, plateFalsePositive: false, plateBboxIou: null, carBboxIou: null, markerF1: null, sceneObjectRecall: null, categoryCorrectRule: null, categoryCorrectSuggested: null, categoryTop2Relations: null };
  }
  const roleCorrect = vp.role === gt.role;

  let plateExact: boolean | null = null;
  let plateCER: number | null = null;
  let plateFalsePositive = false;
  if (gt.plate.readable) {
    const gtText = gt.plate.text ?? '';
    const modelText = vp.plate.readable ? normPlateKey(vp.plate.text) ?? '' : '';
    plateExact = modelText === gtText;
    plateCER = gtText.length ? levenshtein(modelText, gtText) / gtText.length : null;
  } else if (vp.plate.readable) {
    plateFalsePositive = true;
  }

  const plateBboxIou = gt.plate.bbox ? iou(vp.plate.bbox, gt.plate.bbox) : null;
  const carBboxIou = gt.car.bbox ? iou(vp.car.bbox, gt.car.bbox) : null;

  let markerF1: number | null = null;
  if (gt.markers.length || vp.markers.length) {
    const gtSet = new Set(gt.markers);
    const modelSet = new Set(vp.markers ?? []);
    const tp = [...modelSet].filter((m) => gtSet.has(m)).length;
    const precision = modelSet.size ? tp / modelSet.size : 0;
    const recall = gtSet.size ? tp / gtSet.size : 0;
    markerF1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  }

  let sceneObjectRecall: number | null = null;
  if (gt.scene.length && vp.scene) {
    const gtObjects = new Set(gt.scene.map((s) => s.object));
    const modelObjects = new Set(vp.scene.map((s) => s.object));
    const tp = [...gtObjects].filter((o) => modelObjects.has(o)).length;
    sceneObjectRecall = gtObjects.size ? tp / gtObjects.size : null;
  }

  const categoryCorrectRule = gt.categoryId > 0 ? ruleCategory(vp.markers ?? []) === gt.categoryId : null;
  const categoryCorrectSuggested = gt.categoryId > 0 && typeof vp.suggested_category === 'number' ? vp.suggested_category === gt.categoryId : null;

  let categoryTop2Relations: boolean | null = null;
  if (gt.categoryId > 0 && vp.scene) {
    const ranked = rankCategories(vp.scene);
    categoryTop2Relations = ranked.slice(0, 2).some((r) => r.cid === gt.categoryId);
  }

  return { photoId: vp.photoId, roleCorrect, plateExact, plateCER, plateFalsePositive, plateBboxIou, carBboxIou, markerF1, sceneObjectRecall, categoryCorrectRule, categoryCorrectSuggested, categoryTop2Relations };
}

function mean(xs: (number | null | undefined)[]): number | null {
  const vals = xs.filter((x): x is number => typeof x === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
function rate(xs: (boolean | null | undefined)[]): number | null {
  const vals = xs.filter((x): x is boolean => typeof x === 'boolean');
  return vals.length ? vals.filter(Boolean).length / vals.length : null;
}

type CellAggregate = {
  cell: RunFile['cell'];
  photoScores: PhotoScore[];
  candidateOutcomes: Array<{ reportId: string; plateCorrect: boolean | null; categoryCorrect: boolean | null; hasContextCarPair: boolean; submittable: boolean }>;
  usage: { calls: number; promptTokens: number; completionTokens: number; costUsd: number };
  repairRounds: number;
  providerMismatches: number;
  latenciesMs: number[];
  errors: string[];
  compositeScore: number | null;
  nCandidates: number; // distinct reportId w tej grupie (przed splitByPlate)
  nRepeats: number; // distinct cell.repeat w tej grupie
};

async function main() {
  let gt: GroundTruth;
  try {
    gt = JSON.parse(await readFile(GT_PATH, 'utf8'));
  } catch {
    console.error(`score: brak ${GT_PATH}. Uruchom groundtruth.ts, popraw w gt-editor.ts, zapisz jako tests/groundtruth.json.`);
    process.exit(1);
  }

  const files = (await readdir(RUNS_DIR)).filter((f) => f.endsWith('.json'));
  if (!files.length) {
    console.error(`score: brak plików w ${RUNS_DIR}. Uruchom run.ts najpierw.`);
    process.exit(1);
  }

  // Grupuj runy po konfiguracji (bez reportId/repeat) — każda grupa to jedna linia w raporcie,
  // uśredniona po kandydatach i powtórzeniach.
  const groups = new Map<string, RunFile[]>();
  for (const f of files) {
    const raw: RunFile = JSON.parse(await readFile(path.join(RUNS_DIR, f), 'utf8'));
    const key = [raw.cell.model, raw.cell.providerTag ?? 'none', raw.cell.promptId, raw.cell.pipelineVariant, raw.cell.batching].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(raw);
  }

  const aggregates: CellAggregate[] = [];
  for (const [, runs] of groups) {
    const cell = runs[0].cell;
    const photoScores: CellAggregate['photoScores'] = [];
    const candidateOutcomes: CellAggregate['candidateOutcomes'] = [];
    const usage = { calls: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 };
    let repairRounds = 0;
    let providerMismatches = 0;
    const latenciesMs: number[] = [];
    const errors: string[] = [];

    for (const run of runs) {
      if (run.error || !run.result) {
        errors.push(`${run.cell.reportId} r${run.cell.repeat}: ${run.error ?? 'brak wyniku'}`);
        continue;
      }
      const { photos, usage: u, repairRounds: rr, providerMismatches: pm, latenciesMs: lat } = run.result;
      usage.calls += u.calls;
      usage.promptTokens += u.promptTokens;
      usage.completionTokens += u.completionTokens;
      usage.costUsd += u.costUsd;
      repairRounds += rr;
      providerMismatches += pm;
      latenciesMs.push(...lat);

      for (const vp of photos) photoScores.push(scorePhoto(vp, gt.photos[vp.photoId]));

      // End-to-end: splitByPlate() -> compose() z produkcyjnego src/lib/compose.ts, bez modyfikacji.
      const gtCand = gt.candidates[run.cell.reportId];
      const photoIds = photos.map((p) => p.photoId);
      const subs = splitByPlate(run.cell.reportId, photoIds, photos);
      for (const sub of subs) {
        const rec = compose(sub.subId, sub.subPhotoIds, sub.subPhotos);
        const plateCorrect = gtCand ? rec.plate === gtCand.expectedPlate : null;
        const categoryCorrect = gtCand ? rec.categoryId === gtCand.expectedCategoryId : null;
        const hasContextCarPair = rec.selected.some((i) => rec.photos[i].role === 'context') && rec.selected.some((i) => rec.photos[i].role === 'car');
        const plateBboxOk = rec.selected.some((i) => {
          const p = rec.photos[i];
          const gtPhoto = gt.photos[p.photoId];
          if (!gtPhoto?.plate.bbox || !p.plate.bbox) return false;
          return (iou(p.plate.bbox, gtPhoto.plate.bbox) ?? 0) >= 0.5;
        });
        candidateOutcomes.push({
          reportId: sub.subId,
          plateCorrect,
          categoryCorrect,
          hasContextCarPair,
          submittable: !!(plateCorrect && categoryCorrect && hasContextCarPair && plateBboxOk),
        });
      }
    }

    const roleAcc = rate(photoScores.map((p) => p.roleCorrect));
    const plateAcc = rate(photoScores.map((p) => p.plateExact));
    const plateBboxMeanIou = mean(photoScores.map((p) => p.plateBboxIou));
    const carBboxMeanIou = mean(photoScores.map((p) => p.carBboxIou));
    const categoryAcc = rate(photoScores.map((p) => p.categoryCorrectRule ?? p.categoryTop2Relations));

    const parts = [
      { w: WEIGHTS.plate, v: plateAcc },
      { w: WEIGHTS.category, v: categoryAcc },
      { w: WEIGHTS.role, v: roleAcc },
      { w: WEIGHTS.plateBbox, v: plateBboxMeanIou },
      { w: WEIGHTS.carBbox, v: carBboxMeanIou },
    ].filter((p) => p.v != null) as Array<{ w: number; v: number }>;
    const totalW = parts.reduce((s, p) => s + p.w, 0);
    const compositeScore = totalW > 0 ? parts.reduce((s, p) => s + p.w * p.v, 0) / totalW : null;

    const nCandidates = new Set(runs.map((r) => r.cell.reportId)).size;
    const nRepeats = new Set(runs.map((r) => r.cell.repeat)).size;
    aggregates.push({ cell, photoScores, candidateOutcomes, usage, repairRounds, providerMismatches, latenciesMs, errors, compositeScore, nCandidates, nRepeats });
  }

  aggregates.sort((a, b) => (b.compositeScore ?? -1) - (a.compositeScore ?? -1));

  await writeFile(OUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), weights: WEIGHTS, aggregates }, null, 2));
  console.log(`score: zapisano ${OUT_PATH} (${aggregates.length} konfiguracji)`);
  for (const a of aggregates) {
    const label = `${a.cell.model} / ${a.cell.promptId} / ${a.cell.pipelineVariant} / ${a.cell.batching}`;
    const score = a.compositeScore != null ? (a.compositeScore * 100).toFixed(1) + '%' : 'n/a';
    console.log(`  ${score.padStart(6)}  ${label}  ($${a.usage.costUsd.toFixed(4)}, ${a.errors.length} błędów)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
