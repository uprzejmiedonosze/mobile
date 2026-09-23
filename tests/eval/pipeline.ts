// Port orkiestracji analyzeCandidate()/analyzeChunk() z
// ../../../uprzejmiedonosze/src/inc/integrations/Vision.php, generalizowany na dowolny model
// OpenRouter + wariant promptu (krok 3-4 planu). Różnice względem produkcji, świadome:
//   - batching: 'single' to nowa oś testowa (jedno zdjęcie na wywołanie) — produkcja zna tylko
//     "cały kandydat" + fallback na paczki po 3 przy błędzie sieci; ten fallback tu pomijamy,
//     bo interesuje nas efekt batchingu jako wybór, nie jako recovery.
//   - pipelineVariant 'hybrid-pr' zastępuje odczyt tablicy/bbox pojazdu przez LLM wynikiem
//     PlateRecognizer (providers/platerecognizer.ts) zamiast retryPlateCrop/verifyPlateBox.
//   - v5-twostage: drugie wywołanie (tablica+bbox) tylko dla zdjęć role==='car' z pierwszego.
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { chat, providerMatchesTag, type ChatMessage, type ChatContentPart, type ChatOpts } from './providers/openrouter.ts';
import { recognizePlate, bestResult, boxToVisionSpace } from './providers/platerecognizer.ts';
import {
  extractJson, normPlateKey, normalizeVisionPhoto, validateVisionPhoto, validBox,
  type Box4, type VisionPhoto, type Marker, type Role,
} from './schema.ts';
import type { PromptVariant, PromptImageInfo } from './prompts/types.ts';

export type PipelinePhotoInput = { photoId: string; photo_index: number; bytes: Buffer; width: number; height: number };

export type PipelineVariant = 'baseline' | 'no-crop' | 'hybrid-pr';
export type Batching = 'candidate' | 'single';

export type PipelineOptions = {
  model: string;
  providerTag: string | null; // null = bez pinu (tylko dla wariantu bazowego "stan dzisiejszy")
  supportsJsonObject: boolean;
  promptVariant: PromptVariant;
  pipelineVariant: PipelineVariant;
  batching: Batching;
  maxTokens?: number;
};

export type PipelineUsage = { calls: number; promptTokens: number; completionTokens: number; costUsd: number };

export type PipelineResult = {
  photos: VisionPhoto[];
  usage: PipelineUsage;
  warnings: string[];
  repairRounds: number; // ile razy trzeba było wysłać prompt naprawczy (dowolny etap)
  providerMismatches: number; // ile wywołań wróciło z innego dostawcy niż przypięty tag
  latenciesMs: number[];
};

function newUsage(): PipelineUsage {
  return { calls: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 };
}

async function doChat(messages: ChatMessage[], opts: PipelineOptions, usage: PipelineUsage, latencies: number[], providerMismatches: { n: number }) {
  const chatOpts: ChatOpts = {
    model: opts.model,
    providerTag: opts.providerTag, // null = celowo bez pinu (wariant "bez EU, stan dzisiejszy") — patrz openrouter.ts
    supportsJsonObject: opts.supportsJsonObject,
    maxTokens: opts.maxTokens ?? 8000,
  };
  const res = await chat(messages, chatOpts);
  usage.calls++;
  usage.promptTokens += res.usage.prompt_tokens;
  usage.completionTokens += res.usage.completion_tokens;
  usage.costUsd += res.usage.cost ?? 0;
  latencies.push(res.latencyMs);
  if (!providerMatchesTag(res.provider, opts.providerTag)) providerMismatches.n++;
  return res;
}

function imgPart(bytes: Buffer, detail: 'low' | 'high'): ChatContentPart {
  return { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${bytes.toString('base64')}`, detail } };
}

// v2-pixels zwraca bbox w realnych pikselach zdjęcia -> normalizacja z powrotem do 0..1000, żeby
// score.ts mógł liczyć IoU jedną wspólną metodą niezależnie od wariantu promptu.
function normalizeBoxToVisionSpace(box: unknown, variantId: string, w: number, h: number): Box4 | null {
  if (!Array.isArray(box) || box.length !== 4) return null;
  if (variantId === 'v2-pixels') {
    const [x1, y1, x2, y2] = box as number[];
    return [Math.round((x1 / w) * 1000), Math.round((y1 / h) * 1000), Math.round((x2 / w) * 1000), Math.round((y2 / h) * 1000)];
  }
  return validBox(box) ? (box as Box4) : null;
}

/** Generyczna pętla: wywołanie + 1 runda naprawy nie-JSON + 1 runda naprawy błędów walidacji. Port chat()+analyzeChunk() z Vision.php. */
async function callWithRepair(
  initialMessages: ChatMessage[],
  opts: PipelineOptions,
  usage: PipelineUsage,
  warnings: string[],
  latencies: number[],
  providerMismatches: { n: number },
  extractPhotos: (parsed: any) => any[] | null,
  validate: (photos: any[]) => string[],
): Promise<{ photos: any[]; repairRounds: number }> {
  let repairRounds = 0;
  const history = [...initialMessages];
  let raw = (await doChat(history, opts, usage, latencies, providerMismatches)).content;
  let { parsed, truncated } = extractJson(raw);
  let photos = parsed ? extractPhotos(parsed) : null;

  if (!photos) {
    repairRounds++;
    history.push({ role: 'assistant', content: raw });
    history.push({ role: 'user', content: 'That was not valid JSON. Repeat the answer as raw JSON only: no prose, no markdown fences, no commentary.' });
    raw = (await doChat(history, opts, usage, latencies, providerMismatches)).content;
    const r2 = extractJson(raw);
    photos = r2.parsed ? extractPhotos(r2.parsed) : null;
    if (!photos) throw new Error(`model nie zwrócił poprawnego JSON po naprawie (truncated=${truncated}): ${raw.slice(0, 200)}`);
  }

  let errs = validate(photos);
  if (errs.length) {
    repairRounds++;
    history.push({ role: 'assistant', content: raw });
    history.push({ role: 'user', content: `Your JSON has errors: ${errs.join('; ')}. Return the FULL corrected JSON object again. JSON only.` });
    raw = (await doChat(history, opts, usage, latencies, providerMismatches)).content;
    const r3 = extractJson(raw);
    const repaired = r3.parsed ? extractPhotos(r3.parsed) : null;
    if (!repaired) throw new Error(`model nie zwrócił JSON po naprawie walidacji: ${raw.slice(0, 200)}`);
    photos = repaired;
    errs = validate(photos);
    if (errs.length) {
      warnings.push(`walidacja nie przeszła nawet po naprawie: ${errs.join('; ')}`);
    }
  }
  return { photos, repairRounds };
}

// --- Stage A: rola/quality/car/plate/markers-lub-scene/kategoria (v0-v4), albo scena+rola (v5 call1) ---

async function stageA(
  chunk: PipelinePhotoInput[],
  opts: PipelineOptions,
  usage: PipelineUsage,
  warnings: string[],
  latencies: number[],
  providerMismatches: { n: number },
): Promise<any[]> {
  const idx = chunk.map((c) => c.photo_index);
  const images: PromptImageInfo[] = chunk.map((c) => ({ photo_index: c.photo_index, width: c.width, height: c.height }));
  const note =
    idx.length > 1 || idx[0] !== 0
      ? ` These are photos ${idx[0]}..${idx[idx.length - 1]} of the same report; use exactly these photo_index values.`
      : '';
  const promptText = opts.promptVariant.build({ photoIndices: idx, images }) + note;

  const content: ChatContentPart[] = [{ type: 'text', text: promptText }];
  for (const c of chunk) content.push(imgPart(c.bytes, opts.promptVariant.detail));

  const want = [...idx].sort((a, b) => a - b);
  const { photos } = await callWithRepair(
    [{ role: 'user', content }],
    opts,
    usage,
    warnings,
    latencies,
    providerMismatches,
    (parsed) => (Array.isArray(parsed?.photos) ? parsed.photos : null),
    (photos) => {
      const got = photos.map((p: any) => p?.photo_index).slice().sort((a: number, b: number) => a - b);
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        return [`zwrócono indeksy [${got.join(',')}], oczekiwano [${want.join(',')}]`];
      }
      const errs: string[] = [];
      for (const p of photos) errs.push(...validateVisionPhoto(p, p?.photo_index).map((e) => `zdj.${p?.photo_index}: ${e}`));
      return errs;
    },
  );
  photos.sort((a: any, b: any) => (a.photo_index ?? 0) - (b.photo_index ?? 0));
  for (const p of photos) normalizeVisionPhoto(p);
  return photos;
}

// --- Stage A2 (v5-twostage): tablica+bbox, jedno zdjęcie na wywołanie, tylko role==='car' ---

async function stageA2(
  photo: PipelinePhotoInput,
  opts: PipelineOptions,
  usage: PipelineUsage,
  warnings: string[],
  latencies: number[],
  providerMismatches: { n: number },
): Promise<{ car: any; plate: any }> {
  const text = opts.promptVariant.buildCall2!({ photoIndices: [photo.photo_index], images: [{ photo_index: photo.photo_index, width: photo.width, height: photo.height }] });
  const content: ChatContentPart[] = [{ type: 'text', text }, imgPart(photo.bytes, opts.promptVariant.detail)];
  const { photos } = await callWithRepair(
    [{ role: 'user', content }],
    opts,
    usage,
    warnings,
    latencies,
    providerMismatches,
    (parsed) => (parsed && typeof parsed === 'object' ? [parsed] : null), // pojedynczy obiekt {car,plate}, nie tablica
    (arr) => {
      const p = arr[0] ?? {};
      const errs: string[] = [];
      if (p.car?.bbox != null && !validBox(p.car.bbox)) errs.push('zly bbox car');
      if (p.plate?.bbox != null && !validBox(p.plate.bbox)) errs.push('zly bbox plate');
      if (p.plate?.readable && normPlateKey(p.plate.text) === null) errs.push(`nieczytelny format tablicy: ${p.plate.text ?? ''}`);
      return errs;
    },
  );
  const p = photos[0] ?? {};
  if (p.plate?.readable) {
    const t = normPlateKey(p.plate.text);
    p.plate.text = t;
    if (t === null) p.plate.readable = false;
  }
  return { car: p.car ?? { present: false, bbox: null, desc: null }, plate: p.plate ?? { readable: false, text: null, bbox: null } };
}

// --- Stage B (pipelineVariant 'baseline' only): retry-crop tablicy + weryfikacja bbox, port Vision.php ---

async function cropJpeg(bytes: Buffer, x: number, y: number, w: number, h: number, maxSide: number): Promise<Buffer | null> {
  if (w < 10 || h < 10) return null;
  try {
    const meta = await sharp(bytes).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    const ix = Math.max(0, Math.min(W - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(H - 1, Math.round(y)));
    const iw = Math.max(1, Math.min(W - ix, Math.round(w)));
    const ih = Math.max(1, Math.min(H - iy, Math.round(h)));
    return await sharp(bytes)
      .extract({ left: ix, top: iy, width: iw, height: ih })
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

async function retryPlateCrop(
  bytes: Buffer, photo: any, opts: PipelineOptions, usage: PipelineUsage, warnings: string[], latencies: number[], providerMismatches: { n: number },
): Promise<string | null> {
  const car = photo.car ?? null;
  if (!car?.present || !validBox(car.bbox)) return null;
  try {
    const meta = await sharp(bytes).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    const [x1, y1, x2, y2] = (car.bbox as Box4).map((v: number) => v / 1000);
    const mx = (x2 - x1) * 0.1;
    const my = (y2 - y1) * 0.1;
    const bx = Math.max(0, (x1 - mx) * W);
    const by = Math.max(0, (y1 - my) * H);
    const bw = Math.min(W, (x2 + mx) * W) - bx;
    const bh = Math.min(H, (y2 + my) * H) - by;
    const crop = await cropJpeg(bytes, bx, by, bw, bh, 1600);
    if (!crop) return null;
    const res = await doChat(
      [{ role: 'user', content: [{ type: 'text', text: 'This is a crop of a car. Read its Polish licence plate. Return JSON {"readable":bool, "text":str|null} only.' }, imgPart(crop, 'high')] }],
      opts, usage, latencies, providerMismatches,
    );
    const { parsed } = extractJson(res.content);
    if (!parsed?.readable) return null;
    return normPlateKey(parsed.text ?? null);
  } catch (e: any) {
    warnings.push(`retry crop: ${String(e?.message ?? e).slice(0, 150)}`);
    return null;
  }
}

async function verifyPlateBox(
  bytes: Buffer, photo: any, opts: PipelineOptions, usage: PipelineUsage, warnings: string[], latencies: number[], providerMismatches: { n: number },
): Promise<{ status: 'ok' | 'mismatch' | 'skip'; bbox: Box4 | null }> {
  const plate = photo.plate ?? {};
  if (!plate.readable || photo.plate_verified) return { status: 'skip', bbox: null };
  const expected = plate.text ?? null;
  const car = photo.car ?? {};
  try {
    const meta = await sharp(bytes).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    let x1: number, y1: number, x2: number, y2: number, m: number;
    if (car.present && validBox(car.bbox)) {
      [x1, y1, x2, y2] = (car.bbox as Box4).map((v: number) => v / 1000);
      m = 0.1;
    } else if (validBox(plate.bbox)) {
      [x1, y1, x2, y2] = (plate.bbox as Box4).map((v: number) => v / 1000);
      m = 1.5;
    } else {
      return { status: 'skip', bbox: null };
    }
    const mx = (x2 - x1) * m;
    const my = (y2 - y1) * m;
    const bx = Math.max(0, (x1 - mx) * W);
    const by = Math.max(0, (y1 - my) * H);
    const bw = Math.min(W, (x2 + mx) * W) - bx;
    const bh = Math.min(H, (y2 + my) * H) - by;
    const crop = await cropJpeg(bytes, bx, by, bw, bh, 1000);
    if (!crop) return { status: 'skip', bbox: null };
    const res = await doChat(
      [{ role: 'user', content: [
        { type: 'text', text: 'This crop shows a car (front). Find its Polish licence plate. Return JSON {"text": plate characters or null, "bbox": [x1,y1,x2,y2] tight around the plate characters in 0..1000 coords of THIS crop, or null if no plate visible}. JSON only.' },
        imgPart(crop, 'high'),
      ] }],
      opts, usage, latencies, providerMismatches,
    );
    const { parsed } = extractJson(res.content);
    if (!parsed) return { status: 'skip', bbox: null };
    const text = normPlateKey(parsed.text ?? null);
    const fb = parsed.bbox;
    if (text !== expected || !Array.isArray(fb) || fb.length !== 4) return { status: 'mismatch', bbox: null };
    const [fx1, fy1, fx2, fy2] = fb.map((v: number) => v / 1000);
    return {
      status: 'ok',
      bbox: [
        Math.round(((bx + fx1 * bw) / W) * 1000),
        Math.round(((by + fy1 * bh) / H) * 1000),
        Math.round(((bx + fx2 * bw) / W) * 1000),
        Math.round(((by + fy2 * bh) / H) * 1000),
      ],
    };
  } catch (e: any) {
    warnings.push(`verify crop: ${String(e?.message ?? e).slice(0, 150)}`);
    return { status: 'skip', bbox: null };
  }
}

// --- Wejście: punkt główny ---

export async function runPipeline(photos: PipelinePhotoInput[], opts: PipelineOptions): Promise<PipelineResult> {
  const usage = newUsage();
  const warnings: string[] = [];
  const latencies: number[] = [];
  const providerMismatches = { n: 0 };
  let repairRounds = 0;

  const byIndex = new Map(photos.map((p) => [p.photo_index, p]));
  const chunks: PipelinePhotoInput[][] = opts.batching === 'single' ? photos.map((p) => [p]) : [photos];

  // Stage A (call 1 dla v5-twostage, jedyne wywołanie dla v0-v4): rola/scena/markery/kategoria,
  // per chunk (cały kandydat albo jedno zdjęcie, wg batching).
  const result: any[] = [];
  for (const chunk of chunks) {
    result.push(...(await stageA(chunk, opts, usage, warnings, latencies, providerMismatches)));
  }
  result.sort((a, b) => (a.photo_index ?? 0) - (b.photo_index ?? 0));

  // v5-twostage: call 2 dla role==='car' — zrobione tu, po stageA, żeby mieć role[] gotowe.
  if (opts.promptVariant.twoStage) {
    for (const p of result) {
      if (p.role !== 'car') continue;
      const src = byIndex.get(p.photo_index)!;
      const { car, plate } = await stageA2(src, opts, usage, warnings, latencies, providerMismatches);
      p.car = car;
      p.plate = plate;
    }
    // reszta (context/third/unusable) nie ma car/plate z call1 — uzupełnij pustymi wartościami.
    for (const p of result) {
      if (!p.car) p.car = { present: false, bbox: null, desc: null };
      if (!p.plate) p.plate = { readable: false, text: null, bbox: null };
    }
  }

  // Normalizacja bbox (v2-pixels: px -> 0..1000) i zbudowanie VisionPhoto.
  const visionPhotos: VisionPhoto[] = result.map((p: any) => {
    const src = byIndex.get(p.photo_index)!;
    const carBbox = normalizeBoxToVisionSpace(p.car?.bbox, opts.promptVariant.id, src.width, src.height);
    const plateBbox = normalizeBoxToVisionSpace(p.plate?.bbox, opts.promptVariant.id, src.width, src.height);
    return {
      photo_index: p.photo_index,
      photoId: src.photoId,
      role: p.role as Role,
      quality: typeof p.quality === 'number' ? p.quality : 0,
      car: { present: !!p.car?.present, bbox: carBbox, desc: p.car?.desc ?? null },
      plate: { readable: !!p.plate?.readable, text: p.plate?.text ?? null, bbox: plateBbox },
      markers: (Array.isArray(p.markers) ? p.markers : []) as Marker[],
      suggested_category: typeof p.suggested_category === 'number' ? p.suggested_category : (typeof p.categoryId === 'number' ? p.categoryId : undefined),
      category_confidence: typeof p.category_confidence === 'number' ? p.category_confidence : undefined,
      scene: Array.isArray(p.scene) ? p.scene : undefined,
    };
  });

  // Stage B / hybrid-pr.
  if (opts.pipelineVariant === 'baseline') {
    for (const vp of visionPhotos) {
      const src = byIndex.get(vp.photo_index)!;
      if (vp.role === 'car' && !vp.plate.readable && vp.quality >= 0.3) {
        const text = await retryPlateCrop(src.bytes, vp, opts, usage, warnings, latencies, providerMismatches);
        if (text !== null) vp.plate = { readable: true, text, bbox: null, from_crop: true };
      }
      const v = await verifyPlateBox(src.bytes, vp, opts, usage, warnings, latencies, providerMismatches);
      if (v.status === 'ok') {
        vp.plate.bbox = v.bbox;
        vp.plate_verified = true;
      } else if (v.status === 'mismatch') {
        vp.plate.plate_check = 'unverified-box';
      }
    }
  } else if (opts.pipelineVariant === 'hybrid-pr') {
    for (const vp of visionPhotos) {
      if (vp.role !== 'car' && vp.role !== 'third') continue;
      const src = byIndex.get(vp.photo_index)!;
      const resp = await recognizePlate(src.bytes);
      const best = bestResult(resp);
      if (best) {
        vp.plate = { readable: true, text: normPlateKey(best.plate), bbox: boxToVisionSpace(best.box, src.width, src.height) };
        vp.plate_verified = true;
        if (best.vehicle) vp.car = { present: true, bbox: boxToVisionSpace(best.vehicle.box, src.width, src.height), desc: vp.car.desc };
      }
    }
  }
  // 'no-crop': nic dodatkowego — czysty wynik stage A/A2.

  // repairRounds jest liczone wewnątrz callWithRepair, ale nie akumulowane globalnie w powyższej
  // pętli po chunkach (uproszczenie: liczymy z warnings o nieudanej naprawie jako dolna granica +
  // liczbę wywołań ponad teoretyczne minimum). Patrz TODO w score.ts jeśli potrzebna dokładna liczba.
  const minCallsExpected = chunks.length + (opts.promptVariant.twoStage ? visionPhotos.filter((p) => p.role === 'car').length : 0);
  repairRounds = Math.max(0, usage.calls - minCallsExpected - (opts.pipelineVariant === 'baseline' ? extraBaselineCalls(visionPhotos) : 0));

  return { photos: visionPhotos, usage, warnings, repairRounds, providerMismatches: providerMismatches.n, latenciesMs: latencies };
}

function extraBaselineCalls(photos: VisionPhoto[]): number {
  // przybliżenie: każdy plate_verified/plate_check zużył 1 wywołanie verifyPlateBox; from_crop
  // dokłada retryPlateCrop. Nie idealne (nie liczy skipów), ale wystarczające jako dolna granica
  // do odróżnienia "0 napraw" od "były naprawy" w raporcie.
  let n = 0;
  for (const p of photos) {
    if (p.plate_verified || p.plate.plate_check === 'unverified-box') n++;
    if (p.plate.from_crop) n++;
  }
  return n;
}
