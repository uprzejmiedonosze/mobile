#!/usr/bin/env tsx
// Krok 4 planu: runner macierzy (model × wariant promptu × pipeline × batching). Woła pipeline.ts
// per kandydat, cache'uje wynik po sha256(model+prompt+pipeline+batching+providerTag+bajty
// zdjęć), zapisuje tests/results/runs/<runId>.json.
//
// Użycie:
//   npx tsx run.ts --dry-run                              # tylko wypisz macierz + koszt
//   npx tsx run.ts --round A                               # runda A: przesiew (7 modeli+baza)
//   npx tsx run.ts --round B --models <id1>,<id2>,<id3>    # runda B: strojenie promptu (finaliści)
//   npx tsx run.ts --round C --models <id1>,<id2>,<id3>    # runda C: end-to-end
//   npx tsx run.ts --only-model openai/gpt-4o-mini --only-prompt v1-fixed --repeats 1
//   npx tsx run.ts --refresh-models                        # re-weryfikuj ceny + endpointy EU
//   npx tsx run.ts --budget-usd 5                           # twardy limit wydatków

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { runPipeline, type PipelineOptions, type PipelinePhotoInput, type PipelineVariant, type Batching } from './pipeline.ts';
import { getPromptVariant, PROMPT_VARIANTS } from './prompts/index.ts';
import { listModels, listEndpoints, listProviders, findEuEndpoint } from './providers/openrouter.ts';

const TESTS_DIR = path.resolve(import.meta.dirname, '..');
const PREP_MANIFEST = path.join(TESTS_DIR, '.cache/prep/manifest.json');
const PREP_DIR = path.join(TESTS_DIR, '.cache/prep');
const MODELS_PATH = path.resolve(import.meta.dirname, 'models.json');
const RUNS_DIR = path.join(TESTS_DIR, 'results/runs');

type ModelEntry = { id: string; providerTag: string | null; label: string; isBaseline?: boolean; isUnpinned?: boolean };
type ModelsFile = { baselineModel: string; models: ModelEntry[] };

type MatrixCell = {
  model: string;
  providerTag: string | null;
  promptId: string;
  pipelineVariant: PipelineVariant;
  batching: Batching;
  repeat: number;
};

const ROUND_DEFAULTS: Record<string, { prompts: string[]; pipelines: PipelineVariant[]; batchings: Batching[]; repeats: number }> = {
  A: { prompts: ['v1-fixed'], pipelines: ['no-crop'], batchings: ['candidate'], repeats: 2 },
  B: { prompts: PROMPT_VARIANTS.map((p) => p.id), pipelines: ['no-crop'], batchings: ['candidate', 'single'], repeats: 3 },
  C: { prompts: ['v1-fixed'], pipelines: ['baseline', 'no-crop', 'hybrid-pr'], batchings: ['candidate'], repeats: 5 },
};

type ParsedArgs = Record<string, string> & { dryRun: boolean; refreshModels: boolean };

// --only-model -> onlyModel (kebab-case na wejściu, camelCase w dostępie w kodzie niżej).
function toCamelCase(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function parseArgs(argv: string[]): ParsedArgs {
  const a: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = toCamelCase(arg.slice(2));
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        a[key] = next;
        i++;
      } else {
        flags.add(key);
      }
    }
  }
  return { ...a, dryRun: flags.has('dryRun'), refreshModels: flags.has('refreshModels') } as ParsedArgs;
}

async function refreshModelsFile(models: ModelsFile): Promise<void> {
  console.log('run: odświeżam ceny i weryfikuję endpointy EU dla rostera...');
  const [allModels, providers] = await Promise.all([listModels(), listProviders()]);
  const baseline = allModels.find((m) => m.id === models.baselineModel);
  if (!baseline) throw new Error(`baseline model ${models.baselineModel} zniknął z katalogu OpenRouter?`);
  const baselinePromptPrice = Number(baseline.pricing.prompt) * 1e6;
  const baselineCompletionPrice = Number(baseline.pricing.completion) * 1e6;

  for (const m of models.models) {
    if (m.isBaseline) continue;
    const meta = allModels.find((am) => am.id === m.id);
    if (!meta) {
      console.warn(`  ! ${m.id}: zniknął z katalogu OpenRouter — usuń z models.json`);
      continue;
    }
    const promptPrice = Number(meta.pricing.prompt) * 1e6;
    const completionPrice = Number(meta.pricing.completion) * 1e6;
    if (promptPrice >= baselinePromptPrice || completionPrice >= baselineCompletionPrice) {
      console.warn(`  ! ${m.id}: cena już nie jest poniżej bazy (${promptPrice}/${completionPrice} vs ${baselinePromptPrice}/${baselineCompletionPrice}) — sprawdź models.json`);
    }
    if (m.providerTag) {
      const endpoints = await listEndpoints(m.id);
      const stillThere = endpoints.some((e) => e.tag === m.providerTag);
      if (!stillThere) {
        const alt = findEuEndpoint(endpoints, providers);
        console.warn(`  ! ${m.id}: endpoint ${m.providerTag} zniknął. ${alt ? `Alternatywa: ${alt.tag}` : 'Brak żadnego endpointu EU — model wypada z rostera.'}`);
      }
    }
  }
  console.log('run: weryfikacja zakończona (ostrzeżenia powyżej, jeśli są — models.json nie jest modyfikowany automatycznie).');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const modelsFile: ModelsFile = JSON.parse(await readFile(MODELS_PATH, 'utf8'));

  if (args.refreshModels) {
    await refreshModelsFile(modelsFile);
    return;
  }

  const manifest = JSON.parse(await readFile(PREP_MANIFEST, 'utf8')) as {
    photos: Array<{ photoId: string; thumbFile: string; thumbW: number; thumbH: number }>;
    candidates: Array<{ reportId: string; photoIds: string[] }>;
  };

  const round = args.round as 'A' | 'B' | 'C' | undefined;
  const roundCfg = round ? ROUND_DEFAULTS[round] : undefined;

  // Wybór modeli: --only-model > --models > (round A: wszystkie z rostera) > baseline (bezpieczny
  // domyślny, np. do --dry-run bez żadnych flag). Rundy B/C wymagają jawnego --models (finaliści
  // wyłonieni z poprzedniej rundy — patrz krok 4 planu, nie ma sensownego automatycznego wyboru).
  let finalModels: ModelEntry[];
  if (args.onlyModel) {
    const m = modelsFile.models.find((x) => x.id === args.onlyModel);
    finalModels = m ? [m] : [{ id: args.onlyModel, providerTag: args.onlyProviderTag ?? null, label: args.onlyModel }];
  } else if (args.models) {
    const ids = new Set(args.models.split(','));
    finalModels = modelsFile.models.filter((m) => ids.has(m.id));
    if (!finalModels.length) throw new Error(`--models ${args.models}: żaden nie znaleziony w models.json`);
  } else if (round === 'A') {
    finalModels = modelsFile.models; // runda A testuje cały roster + oba warianty bazy
  } else if (round === 'B' || round === 'C') {
    throw new Error(`--round ${round} wymaga --models <id1,id2,...> (finaliści z poprzedniej rundy)`);
  } else {
    finalModels = modelsFile.models.filter((m) => m.isBaseline);
  }

  const promptIds = args.onlyPrompt ? [args.onlyPrompt] : roundCfg?.prompts ?? ['v1-fixed'];
  const pipelines = args.onlyPipeline ? [args.onlyPipeline as PipelineVariant] : roundCfg?.pipelines ?? ['no-crop'];
  const batchings = args.onlyBatching ? [args.onlyBatching as Batching] : roundCfg?.batchings ?? ['candidate'];
  const repeats = args.repeats ? Number(args.repeats) : roundCfg?.repeats ?? 1;
  const budgetUsd = args.budgetUsd ? Number(args.budgetUsd) : Infinity;

  const cells: MatrixCell[] = [];
  for (const m of finalModels) {
    for (const promptId of promptIds) {
      for (const pipelineVariant of pipelines) {
        for (const batching of batchings) {
          for (let r = 0; r < repeats; r++) {
            cells.push({ model: m.id, providerTag: m.providerTag, promptId, pipelineVariant, batching, repeat: r });
          }
        }
      }
    }
  }
  // Runda A: modele oznaczone isBaseline w models.json DODATKOWO dostają wierną kopię dzisiejszej
  // produkcji (v0-prod + detail:'low' wbudowane w prompt + pipeline 'baseline' z retry-crop) —
  // bez tego roundCfg.A (v1-fixed/no-crop) nigdy by nie zmierzył "stanu dzisiejszego", tylko
  // model bazowy z już poprawionym promptem. To jest JEDYNE miejsce, gdzie prompt v0-prod
  // i pipeline 'baseline' pojawiają się w rundzie A — reszta rostera go nie dostaje (porównanie
  // "czy warto zmienić model" ma sens tylko na tym samym, poprawionym prompcie v1-fixed).
  if (round === 'A') {
    for (const m of finalModels.filter((m) => m.isBaseline)) {
      for (let r = 0; r < repeats; r++) {
        cells.push({ model: m.id, providerTag: m.providerTag, promptId: 'v0-prod', pipelineVariant: 'baseline', batching: 'candidate', repeat: r });
      }
    }
  }

  const perCandidateEstimateUsd = 0.002; // rząd wielkości z kroku 5 planu — tylko do --dry-run
  const estimatedCost = cells.length * manifest.candidates.length * perCandidateEstimateUsd;

  console.log(`run: ${finalModels.length} modeli × ${promptIds.length} promptów × ${pipelines.length} pipeline'ów × ${batchings.length} batchingów × ${repeats} powtórzeń = ${cells.length} konfiguracji`);
  console.log(`run: × ${manifest.candidates.length} kandydatów = ${cells.length * manifest.candidates.length} wywołań pipeline'u`);
  console.log(`run: szacowany koszt ~$${estimatedCost.toFixed(3)} (bardzo zgrubnie, patrz krok 5 planu; realny koszt liczony per-wywołanie z usage.cost)`);
  for (const m of finalModels) console.log(`  - ${m.label} (${m.id}${m.providerTag ? ` @ ${m.providerTag}` : ' — bez pinu'})`);

  if (args.dryRun) {
    console.log('\n--dry-run: nic nie wysłano.');
    return;
  }

  await mkdir(RUNS_DIR, { recursive: true });
  let spentUsd = 0;
  let done = 0;
  let budgetHit = false;
  const total = cells.length * manifest.candidates.length;
  const concurrency = args.concurrency ? Number(args.concurrency) : 4; // patrz krok 4 planu — "limit równoległości (domyślnie 4)"

  type Task = { cell: MatrixCell; cand: (typeof manifest.candidates)[number] };
  const tasks: Task[] = [];
  for (const cell of cells) for (const cand of manifest.candidates) tasks.push({ cell, cand });

  async function runOne({ cell, cand }: Task): Promise<void> {
    if (budgetHit) return;
    const photoFiles = cand.photoIds.map((id, i) => {
      const p = manifest.photos.find((mp) => mp.photoId === id)!;
      return { photoId: p.photoId, thumbFile: p.thumbFile, w: p.thumbW, h: p.thumbH, photo_index: i };
    });

    const runId = cellRunId(cell, cand.reportId);
    const runPath = path.join(RUNS_DIR, `${runId}.json`);
    try {
      const cached = JSON.parse(await readFile(runPath, 'utf8'));
      // Cache hit TYLKO dla sukcesu. Plik z `error` (np. przejściowy 429 od dostawcy — patrz
      // google/gemini-2.5-flash-lite w rundzie A) nie liczy się jako wynik: bez tego rozróżnienia
      // każde kolejne uruchomienie run.ts cicho pomijałoby nieudane wywołania na zawsze zamiast
      // je ponowić, bo sam fakt istnienia pliku wystarczał do "continue".
      if (cached.result) return;
    } catch {
      /* cache miss */
    }

    const photos: PipelinePhotoInput[] = await Promise.all(
      photoFiles.map(async (p) => ({
        photoId: p.photoId,
        photo_index: p.photo_index,
        bytes: await readFile(path.join(PREP_DIR, p.thumbFile)),
        width: p.w,
        height: p.h,
      })),
    );

    const promptVariant = getPromptVariant(cell.promptId);
    const opts: PipelineOptions = {
      model: cell.model,
      providerTag: cell.providerTag,
      supportsJsonObject: true,
      promptVariant,
      pipelineVariant: cell.pipelineVariant,
      batching: cell.batching,
    };

    done++;
    const tag = `[${done}/${total}] ${runId}`;
    try {
      const result = await runPipeline(photos, opts);
      spentUsd += result.usage.costUsd;
      await writeFile(runPath, JSON.stringify({ cell: { ...cell, reportId: cand.reportId }, result }, null, 2));
      console.log(`${tag}... ok ($${result.usage.costUsd.toFixed(5)}, ${result.usage.calls} wywołań, ${result.repairRounds} napraw${result.providerMismatches ? `, ${result.providerMismatches} MISMATCH PROVIDERA!` : ''})`);
      if (spentUsd >= budgetUsd) {
        budgetHit = true;
        console.log(`run: osiągnięto --budget-usd ${budgetUsd} (wydano $${spentUsd.toFixed(4)}), pozostałe zadania w locie dokończą się, nowe nie wystartują.`);
      }
    } catch (e: any) {
      console.log(`${tag}... BŁĄD: ${String(e?.message ?? e).slice(0, 200)}`);
      await writeFile(runPath, JSON.stringify({ cell: { ...cell, reportId: cand.reportId }, error: String(e?.message ?? e) }, null, 2));
    }
  }

  // Pula robocza o stałej współbieżności: `concurrency` zadań na raz, każde zwolnione miejsce
  // natychmiast bierze kolejne z kolejki. Sekwencyjne wołanie API (poprzednia wersja) przy 540
  // wywołaniach i ~1-30s/wywołanie potrafiło zająć kilka godzin — patrz runda B, task bniz71gij.
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < tasks.length && !budgetHit) {
      const task = tasks[cursor++];
      await runOne(task);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`\nrun: zakończono. Wydano ~$${spentUsd.toFixed(4)}. Dalej: npx tsx score.ts && npx tsx report.ts`);
}

function cellRunId(cell: MatrixCell, reportId: string): string {
  const h = createHash('sha256')
    .update(JSON.stringify(cell))
    .update(reportId)
    .digest('hex')
    .slice(0, 16);
  const safeModel = cell.model.replace(/[/.]/g, '_');
  return `${safeModel}__${cell.promptId}__${cell.pipelineVariant}__${cell.batching}__r${cell.repeat}__${reportId}__${h}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
