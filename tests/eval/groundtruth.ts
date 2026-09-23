#!/usr/bin/env tsx
// Krok 2 planu, część 1: bootstrap ground truth. NIE jest ostatecznym GT — to jest wsad dla
// gt-editor.ts, gdzie poprawiasz ręcznie każde pole. Dwa źródła:
//   1. PlateRecognizer (regions=pl, mmc=true) na każdej miniaturze -> tekst tablicy + bbox
//      tablicy + bbox pojazdu. Zwykle wiarygodniejsze niż jeden model LLM dla samej tablicy.
//   2. Jeden mocny model przez OpenRouter (nie musi być tani/EU — to jednorazowy bootstrap 10
//      zdjęć, nie część macierzy price/quality) -> role, markers, scene[], categoryId per zdjęcie.
//
// Wynik: tests/groundtruth.draft.json. Uruchom `npm run gt-editor`, popraw w przeglądarce,
// zapisz jako tests/groundtruth.json.
//
// Użycie: npx tsx groundtruth.ts [--force]

import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chat, type ChatMessage } from './providers/openrouter.ts';
import { recognizePlate, bestResult, boxToVisionSpace } from './providers/platerecognizer.ts';
import { extractJson, normPlateKey, MARKERS, SCENE_OBJECTS, SCENE_RELATIONS, ROLES, type Box4, type Marker, type Role, type SceneItem } from './schema.ts';
import { loadCategories } from './categories.ts';
import { GT_SCHEMA_VERSION, type GroundTruth, type GtPhoto, type GtCandidate } from './groundtruth-types.ts';

const PREP_MANIFEST = path.resolve(import.meta.dirname, '../.cache/prep/manifest.json');
const PREP_DIR = path.resolve(import.meta.dirname, '../.cache/prep');
const OUT_PATH = path.resolve(import.meta.dirname, '../groundtruth.draft.json');

// Jednorazowy bootstrap — jakość ważniejsza niż cena/EU (to nie jest część rundy A/B/C).
const BOOTSTRAP_MODEL = 'google/gemini-2.5-pro';
// Bootstrap nie wymaga EU (nie jest częścią rundy A/B/C), ale ten tag akurat istnieje i działa.
const BOOTSTRAP_PROVIDER_TAG = 'google-vertex/eu';

type PrepManifest = {
  photos: Array<{ photoId: string; thumbFile: string; thumbW: number; thumbH: number }>;
  candidates: Array<{ reportId: string; photoIds: string[] }>;
};

function bootstrapPrompt(): string {
  const catList = loadCategories()
    .filter((c) => c.id !== 0)
    .map((c) => `${c.id}=${c.title}`)
    .join('; ');
  return (
    'You analyze N photos of one parked car (same report, chronological order), for building an ' +
    'evaluation ground truth dataset. Be careful and precise — this will be used as the reference ' +
    'answer key. Return a JSON object {"photos":[...]}, one entry per photo in input order, each:\n' +
    '{"photo_index":i, "role":"context|car|third|unusable", ' +
    '"car":{"present":bool,"bbox":[x1,y1,x2,y2]|null}, ' +
    '"markers":[...], ' +
    '"scene":[{"object":str,"relation":str,"distance_m":number,"confidence":0..1}, ...], ' +
    '"categoryId":int}\n' +
    `Roles: ${ROLES.join('|')}. bbox is [x1,y1,x2,y2]=[LEFT,TOP,RIGHT,BOTTOM] in 0..1000 ` +
    'coordinates of the whole image, top-left corner first. ' +
    `markers only from: ${MARKERS.join(',')}. ` +
    `scene[].object only from: ${SCENE_OBJECTS.join(',')}. ` +
    `scene[].relation only from: ${SCENE_RELATIONS.join(',')} (car's position relative to the object). ` +
    'scene[].distance_m: real-world meters (0 if the car is on top of it). ' +
    `categoryId: best matching category from this exact list (id=title): ${catList}. ` +
    'Take your time, look carefully at signs, road markings, and the car\'s exact position. JSON only, no prose.'
  );
}

async function bootstrapCandidate(photoFiles: Array<{ photoId: string; thumbFile: string }>): Promise<{ photos: any[]; costUsd: number }> {
  const content: ChatMessage['content'] = [{ type: 'text', text: bootstrapPrompt() }];
  for (const p of photoFiles) {
    const bytes = await readFile(path.join(PREP_DIR, p.thumbFile));
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${bytes.toString('base64')}`, detail: 'high' } });
  }
  const res = await chat([{ role: 'user', content }], {
    model: BOOTSTRAP_MODEL,
    providerTag: BOOTSTRAP_PROVIDER_TAG,
    supportsJsonObject: true,
    maxTokens: 8000,
  });
  const { parsed } = extractJson(res.content);
  if (!parsed?.photos) throw new Error(`bootstrap: brak photos w odpowiedzi modelu: ${res.content.slice(0, 200)}`);
  return { photos: parsed.photos, costUsd: res.usage.cost ?? 0 };
}

async function main() {
  const manifest: PrepManifest = JSON.parse(await readFile(PREP_MANIFEST, 'utf8'));
  const force = process.argv.includes('--force');

  let existing: GroundTruth | null = null;
  try {
    existing = JSON.parse(await readFile(OUT_PATH, 'utf8'));
  } catch {
    /* brak draftu, ok */
  }

  const photos: Record<string, GtPhoto> = {};
  const candidates: Record<string, GtCandidate> = {};
  let totalCostUsd = 0;

  for (const cand of manifest.candidates) {
    console.log(`bootstrap: ${cand.reportId} (${cand.photoIds.length} zdjęć)`);
    const photoFiles = cand.photoIds.map((id) => {
      const p = manifest.photos.find((mp) => mp.photoId === id)!;
      return { photoId: p.photoId, thumbFile: p.thumbFile, thumbW: p.thumbW, thumbH: p.thumbH };
    });

    // 1. PlateRecognizer per zdjęcie (cache'owane w providers/platerecognizer.ts po sha1 obrazu).
    const prByPhoto = new Map<string, { text: string | null; plateBbox: Box4 | null; carBbox: Box4 | null }>();
    for (const p of photoFiles) {
      const meta = manifest.photos.find((mp) => mp.photoId === p.photoId)!;
      if (!force && existing?.photos[p.photoId]?.verified) {
        continue; // nie nadpisuj już ręcznie zweryfikowanych zdjęć
      }
      const bytes = await readFile(path.join(PREP_DIR, meta.thumbFile));
      const resp = await recognizePlate(bytes);
      const best = bestResult(resp);
      prByPhoto.set(p.photoId, {
        text: best ? normPlateKey(best.plate) : null,
        plateBbox: best ? boxToVisionSpace(best.box, meta.thumbW, meta.thumbH) : null,
        carBbox: best?.vehicle ? boxToVisionSpace(best.vehicle.box, meta.thumbW, meta.thumbH) : null,
      });
    }

    // 2. Jeden mocny model, cały kandydat naraz (jak analyzeChunk() w produkcji).
    const needsLlm = photoFiles.some((p) => force || !existing?.photos[p.photoId]?.verified);
    let llmByIndex: any[] = [];
    if (needsLlm) {
      const { photos: bootstrapPhotos, costUsd } = await bootstrapCandidate(photoFiles);
      llmByIndex = bootstrapPhotos;
      totalCostUsd += costUsd;
      console.log(`  koszt: $${costUsd.toFixed(5)}`);
    }

    for (let i = 0; i < photoFiles.length; i++) {
      const p = photoFiles[i];
      const already = existing?.photos[p.photoId];
      if (already?.verified && !force) {
        photos[p.photoId] = already; // zachowaj ręczną korektę
        continue;
      }
      const llm = llmByIndex[i] ?? {};
      const pr = prByPhoto.get(p.photoId);
      const role: Role = ROLES.includes(llm.role) ? llm.role : 'unusable';
      const markers: Marker[] = Array.isArray(llm.markers) ? llm.markers.filter((m: any) => (MARKERS as readonly string[]).includes(m)) : [];
      const scene: SceneItem[] = Array.isArray(llm.scene) ? llm.scene : [];
      photos[p.photoId] = {
        photoId: p.photoId,
        role,
        car: {
          present: pr?.carBbox != null || !!llm.car?.present,
          bbox: pr?.carBbox ?? llm.car?.bbox ?? null,
        },
        plate: {
          readable: pr?.text != null,
          text: pr?.text ?? null,
          bbox: pr?.plateBbox ?? null,
        },
        markers,
        scene,
        categoryId: typeof llm.categoryId === 'number' ? llm.categoryId : 0,
        source: { plate: pr?.text != null ? 'platerecognizer' : 'llm-bootstrap', rest: 'llm-bootstrap' },
        verified: false,
      };
    }

    const plates = Object.values(photos)
      .filter((p) => cand.photoIds.includes(p.photoId) && p.plate.readable)
      .map((p) => p.plate.text as string);
    const modalPlate = plates.length ? mostCommon(plates) : null;
    const cids = cand.photoIds.map((id) => photos[id]?.categoryId).filter((c): c is number => typeof c === 'number' && c > 0);

    candidates[cand.reportId] = {
      reportId: cand.reportId,
      photoIds: cand.photoIds,
      expectedPlate: existing?.candidates[cand.reportId]?.expectedPlate ?? modalPlate,
      expectedCategoryId: existing?.candidates[cand.reportId]?.expectedCategoryId ?? (cids.length ? mostCommon(cids) : 0),
      expectedSplitCount: existing?.candidates[cand.reportId]?.expectedSplitCount ?? (new Set(plates).size || 1),
    };
  }

  const gt: GroundTruth = { schemaVersion: GT_SCHEMA_VERSION, generatedAt: new Date().toISOString(), photos, candidates };
  await writeFile(OUT_PATH, JSON.stringify(gt, null, 2));
  console.log(`\nbootstrap: zapisano ${OUT_PATH}`);
  console.log(`bootstrap: koszt LLM łącznie $${totalCostUsd.toFixed(5)} (PlateRecognizer poza tym, na osobnej quocie)`);
  console.log('Następny krok: npm run gt-editor, popraw ręcznie, zapisz jako tests/groundtruth.json');
}

function mostCommon<T>(arr: T[]): T {
  const counts = new Map<T, number>();
  for (const x of arr) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
