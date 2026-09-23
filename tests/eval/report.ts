#!/usr/bin/env tsx
// Krok 7 planu: raport z tests/results/scores.json (produkt score.ts) -> report.md + report.html.
// Tabela Pareto (jakość vs koszt), front Pareto oznaczony, linia odniesienia (baseline) wyróżniona,
// siatka wizualna GT-vs-model dla zwycięzcy, lista jego porażek.
//
// Użycie: npx tsx report.ts

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { GroundTruth } from './groundtruth-types.ts';

const TESTS_DIR = path.resolve(import.meta.dirname, '..');
const SCORES_PATH = path.join(TESTS_DIR, 'results/scores.json');
const GT_PATH = path.join(TESTS_DIR, 'groundtruth.json');
const PREP_MANIFEST_PATH = path.join(TESTS_DIR, '.cache/prep/manifest.json');
const OUT_MD = path.join(TESTS_DIR, 'results/report.md');
const OUT_HTML = path.join(TESTS_DIR, 'results/report.html');

const BASELINE_KEY = 'openai/gpt-4o-mini|v0-prod|baseline|candidate'; // produkcja dzisiaj, dla porównania

type Aggregate = {
  cell: { model: string; providerTag: string | null; promptId: string; pipelineVariant: string; batching: string; repeat: number; reportId: string };
  photoScores: any[];
  candidateOutcomes: Array<{ reportId: string; plateCorrect: boolean | null; categoryCorrect: boolean | null; hasContextCarPair: boolean; submittable: boolean }>;
  usage: { calls: number; promptTokens: number; completionTokens: number; costUsd: number };
  repairRounds: number;
  providerMismatches: number;
  latenciesMs: number[];
  errors: string[];
  compositeScore: number | null;
  nCandidates: number;
  nRepeats: number;
};

type ScoresFile = { generatedAt: string; weights: Record<string, number>; aggregates: Aggregate[] };

function label(a: Aggregate): string {
  // providerTag MUSI być w etykiecie: dwa wpisy tego samego modelu (np. gpt-4o-mini przypięty do
  // EU vs bez pinu) mają identyczne model/prompt/pipeline/batching, więc bez tagu w etykiecie
  // wyglądają w tabeli jak niewyjaśniony duplikat tego samego wiersza.
  const tag = a.cell.providerTag ? `@${a.cell.providerTag}` : '(bez pinu)';
  return `${a.cell.model} ${tag} / ${a.cell.promptId} / ${a.cell.pipelineVariant} / ${a.cell.batching}`;
}

function costPerCandidate(a: Aggregate): number {
  const denom = Math.max(1, a.nCandidates * a.nRepeats);
  return a.usage.costUsd / denom;
}

/** Front Pareto: konfiguracja jest na froncie, jeśli żadna inna nie jest jednocześnie tańsza I lepsza. */
function paretoFront(points: Array<{ cost: number; quality: number }>): boolean[] {
  return points.map((p, i) => !points.some((q, j) => j !== i && q.cost <= p.cost && q.quality >= p.quality && (q.cost < p.cost || q.quality > p.quality)));
}

function fmtPct(x: number | null): string {
  return x == null ? '—' : `${(x * 100).toFixed(1)}%`;
}
function fmtUsd(x: number): string {
  return `$${x.toFixed(5)}`;
}

async function main() {
  const scores: ScoresFile = JSON.parse(await readFile(SCORES_PATH, 'utf8'));
  let gt: GroundTruth | null = null;
  try {
    gt = JSON.parse(await readFile(GT_PATH, 'utf8'));
  } catch {
    /* raport wciąż użyteczny bez GT (np. tylko koszty/błędy), ale bez metryk jakości per zdjęcie */
  }
  let manifest: any = null;
  try {
    manifest = JSON.parse(await readFile(PREP_MANIFEST_PATH, 'utf8'));
  } catch {
    /* siatka wizualna pominięta bez manifestu */
  }

  const rows = scores.aggregates.map((a) => ({
    a,
    key: [a.cell.model, a.cell.promptId, a.cell.pipelineVariant, a.cell.batching].join('|'),
    cost: costPerCandidate(a),
    quality: a.compositeScore ?? 0,
    submittableRate: a.candidateOutcomes.length ? a.candidateOutcomes.filter((c) => c.submittable).length / a.candidateOutcomes.length : null,
  }));
  const onFront = paretoFront(rows.map((r) => ({ cost: r.cost, quality: r.quality })));

  const md: string[] = [];
  md.push('# UD Pro vision eval — raport');
  md.push('');
  md.push(`Wygenerowano: ${new Date().toISOString()}. Wagi score złożonego: ${JSON.stringify(scores.weights)}.`);
  md.push('');
  md.push('## Tabela Pareto');
  md.push('');
  md.push('| # | Pareto | Konfiguracja | Score | tablica | kategoria | rola | IoU tablicy | IoU auta | zdatne do wysyłki | $/zgłoszenie | $/1000 | napraw | błędów |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  rows.forEach((r, i) => {
    const a = r.a;
    const roleAcc = rate(a.photoScores.map((p: any) => p.roleCorrect));
    const plateAcc = rate(a.photoScores.map((p: any) => p.plateExact));
    const catAcc = rate(a.photoScores.map((p: any) => p.categoryCorrectRule ?? p.categoryTop2Relations));
    const plateBbox = mean(a.photoScores.map((p: any) => p.plateBboxIou));
    const carBbox = mean(a.photoScores.map((p: any) => p.carBboxIou));
    const isBaseline = r.key === BASELINE_KEY;
    md.push(
      `| ${i + 1} | ${onFront[i] ? '✅' : ''} | ${isBaseline ? '**' : ''}${label(a)}${isBaseline ? ' (BASELINE)**' : ''} | ${fmtPct(r.quality)} | ${fmtPct(plateAcc)} | ${fmtPct(catAcc)} | ${fmtPct(roleAcc)} | ${plateBbox != null ? plateBbox.toFixed(2) : '—'} | ${carBbox != null ? carBbox.toFixed(2) : '—'} | ${fmtPct(r.submittableRate)} | ${fmtUsd(r.cost)} | ${fmtUsd(r.cost * 1000)} | ${a.repairRounds} | ${a.errors.length} |`,
    );
  });
  md.push('');
  md.push('Pareto ✅ = żadna inna konfiguracja nie jest jednocześnie tańsza i lepsza jakościowo.');
  md.push('');

  if (!gt) {
    md.push('> ⚠️ `tests/groundtruth.json` nie istnieje — metryki jakości powyżej liczone są (jeśli w ogóle) względem czegokolwiek, co score.ts akurat znalazł. Uruchom `groundtruth.ts` + `gt-editor.ts`, popraw ręcznie, zapisz jako `tests/groundtruth.json`, potem `score.ts` ponownie.');
    md.push('');
  }

  // Lista porażek zwycięzcy (najwyższy score).
  const winner = rows[0];
  if (winner && gt) {
    md.push(`## Porażki zwycięzcy: ${label(winner.a)}`);
    md.push('');
    const failures = winner.a.photoScores.filter((p: any) => p.roleCorrect === false || p.plateExact === false || (p.categoryCorrectRule ?? p.categoryTop2Relations) === false);
    if (!failures.length) md.push('_Brak porażek w dostępnych metrykach — ale to prawdopodobnie za mało danych (10 zdjęć), patrz zastrzeżenie w planie._');
    for (const f of failures) {
      const bits: string[] = [];
      if (f.roleCorrect === false) bits.push('zła rola');
      if (f.plateExact === false) bits.push(`zła tablica (CER ${f.plateCER?.toFixed(2) ?? '?'})`);
      if ((f.categoryCorrectRule ?? f.categoryTop2Relations) === false) bits.push('zła kategoria');
      if (f.plateBboxIou != null && f.plateBboxIou < 0.5) bits.push(`IoU tablicy ${f.plateBboxIou.toFixed(2)}`);
      md.push(`- **${f.photoId}**: ${bits.join(', ')}`);
    }
    md.push('');
  }

  await mkdir(path.dirname(OUT_MD), { recursive: true });
  await writeFile(OUT_MD, md.join('\n'));
  console.log(`report: zapisano ${OUT_MD}`);

  const html = renderHtml({ rows, onFront, scores, gt, manifest, winner });
  await writeFile(OUT_HTML, html);
  console.log(`report: zapisano ${OUT_HTML}`);
}

function mean(xs: (number | null | undefined)[]): number | null {
  const vals = xs.filter((x): x is number => typeof x === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
function rate(xs: (boolean | null | undefined)[]): number | null {
  const vals = xs.filter((x): x is boolean => typeof x === 'boolean');
  return vals.length ? vals.filter(Boolean).length / vals.length : null;
}

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function renderHtml(args: {
  rows: Array<{ a: Aggregate; key: string; cost: number; quality: number; submittableRate: number | null }>;
  onFront: boolean[];
  scores: ScoresFile;
  gt: GroundTruth | null;
  manifest: any;
  winner?: { a: Aggregate; key: string; cost: number; quality: number };
}): string {
  const { rows, onFront, scores, gt, manifest, winner } = args;
  const thumbBase = '../.cache/prep/';

  const tableRows = rows
    .map((r, i) => {
      const a = r.a;
      const roleAcc = rate(a.photoScores.map((p: any) => p.roleCorrect));
      const plateAcc = rate(a.photoScores.map((p: any) => p.plateExact));
      const catAcc = rate(a.photoScores.map((p: any) => p.categoryCorrectRule ?? p.categoryTop2Relations));
      const plateBbox = mean(a.photoScores.map((p: any) => p.plateBboxIou));
      return `<tr class="${onFront[i] ? 'pareto' : ''}">
        <td>${i + 1}</td><td>${onFront[i] ? '✅' : ''}</td>
        <td>${esc(label(a))}</td>
        <td>${fmtPct(r.quality)}</td><td>${fmtPct(plateAcc)}</td><td>${fmtPct(catAcc)}</td><td>${fmtPct(roleAcc)}</td>
        <td>${plateBbox != null ? plateBbox.toFixed(2) : '—'}</td>
        <td>${fmtPct(r.submittableRate)}</td>
        <td>${fmtUsd(r.cost)}</td><td>${fmtUsd(r.cost * 1000)}</td>
        <td>${a.repairRounds}</td><td>${a.errors.length}</td>
      </tr>`;
    })
    .join('\n');

  // photoScores (scores.json) niesie tylko metryki, nie bboxy — pełna nakładka model-vs-GT dla
  // zwycięzcy wymagałaby ponownego wczytania jego runs/*.json tutaj. Pominięte w tej wersji
  // (report.ts zostaje czystym konsumentem scores.json, bez czytania runs/ na nowo) — wskazówka
  // gdzie szukać ręcznie zamiast duplikować parsowanie.
  const visualGrid =
    winner && gt && manifest
      ? `<p class="hint">Pełne nakładki model-vs-GT dla zwycięzcy: otwórz jego pliki w tests/results/runs/ (prefiks "${esc(winner.a.cell.model.replace(/[/.]/g, '_'))}__${esc(winner.a.cell.promptId)}__"), bboxy w tej samej przestrzeni 0..1000 co tests/results/gt-editor.html.</p>`
      : '';

  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>UD Pro vision eval — raport</title>
<style>
  body { font:14px/1.5 -apple-system,system-ui,sans-serif; background:#0f1115; color:#e6e8eb; margin:0; padding:24px 32px; }
  h1,h2 { font-weight:600; }
  table { border-collapse:collapse; width:100%; margin:14px 0; font-size:12px; }
  th,td { border:1px solid #2a2f3a; padding:5px 8px; text-align:right; }
  th:nth-child(3), td:nth-child(3) { text-align:left; }
  th { background:#181b22; position:sticky; top:0; }
  tr.pareto { background:#132a1e; }
  .hint { color:#8b93a1; font-size:12px; }
</style></head>
<body>
<h1>UD Pro vision eval — raport</h1>
<p class="hint">Wygenerowano: ${new Date().toISOString()}. Wagi: ${esc(JSON.stringify(scores.weights))}.</p>
${!gt ? '<p style="color:#ffb454">⚠️ Brak tests/groundtruth.json — metryki jakości mogą być puste lub liczone na niezweryfikowanym draftcie.</p>' : ''}
<h2>Tabela Pareto</h2>
<table>
<thead><tr><th>#</th><th>Pareto</th><th>Konfiguracja</th><th>Score</th><th>tablica</th><th>kategoria</th><th>rola</th><th>IoU tablicy</th><th>zdatne</th><th>$/zgłoszenie</th><th>$/1000</th><th>napraw</th><th>błędów</th></tr></thead>
<tbody>${tableRows}</tbody>
</table>
${visualGrid}
</body></html>`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
