#!/usr/bin/env tsx
// Krok 1 (plan: nie-jestem-zadowolony-z-curious-comet.md). Odtwarza 1:1 to, co apka robi ZANIM
// wyśle zdjęcie do backendu: czyta EXIF tak jak parsePickerExif() (src/lib/gallery.ts), robi
// miniaturę tak jak thumb() (src/screens/AnalyzeScreen.tsx, uploadConfig z src/config.ts), i
// grupuje kandydatów przez groupPhotos() (src/lib/grouping.ts) — BEZ MODYFIKACJI tego kodu.
//
// Cache'owane i idempotentne: hash wejść+parametrów w manifest.json; bez zmian - krok pomijany.
//
// Użycie:
//   npx tsx prep.ts [--max-width 1600] [--quality 0.72] [--force]

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import { groupPhotos, inventory, type GroupingInput } from '../../src/lib/grouping.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const PHOTOS_DIR = path.resolve(import.meta.dirname, '..'); // tests/
const CACHE_DIR = path.join(PHOTOS_DIR, '.cache/prep');
const MANIFEST_PATH = path.join(CACHE_DIR, 'manifest.json');

// uploadConfig defaults z src/config.ts (EXPO_PUBLIC_PHOTO_MAX_WIDTH / EXPO_PUBLIC_PHOTO_COMPRESS).
const DEFAULT_MAX_WIDTH = 1600;
const DEFAULT_QUALITY = 0.72;

type Args = { maxWidth: number; quality: number; force: boolean };

function parseArgs(argv: string[]): Args {
  const a: Args = { maxWidth: DEFAULT_MAX_WIDTH, quality: DEFAULT_QUALITY, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max-width') a.maxWidth = Number(argv[++i]);
    else if (argv[i] === '--quality') a.quality = Number(argv[++i]);
    else if (argv[i] === '--force') a.force = true;
  }
  return a;
}

// --- EXIF: port parsePickerExif (src/lib/gallery.ts), na wejściu z exifr w trybie "surowym" ---

function dmsToDd(dms: number[], ref: string): number {
  const [d = 0, m = 0, s = 0] = dms;
  let v = d + m / 60 + s / 3600;
  if (ref === 'S' || ref === 'W') v = -v;
  return v;
}

function normalizeGeo4(v: number): number {
  return Number(v.toFixed(4)); // jak Geolocation.php::normalizeGeo() / gallery.ts::normalizeGeo4
}

type ExifMeta = {
  datetimeOriginal: string | null;
  lat: number | null;
  lng: number | null;
  make: string | null;
  model: string | null;
  width: number | null;
  height: number | null;
  hasGps: boolean;
};

function parseRawExif(raw: Record<string, any>): ExifMeta {
  try {
    const latRaw = raw.GPSLatitude;
    const lngRaw = raw.GPSLongitude;
    const latRef = String(raw.GPSLatitudeRef ?? 'N');
    const lngRef = String(raw.GPSLongitudeRef ?? 'E');
    let lat: number | null = null;
    let lng: number | null = null;
    if (Array.isArray(latRaw) && Array.isArray(lngRaw)) {
      lat = normalizeGeo4(dmsToDd(latRaw, latRef));
      lng = normalizeGeo4(dmsToDd(lngRaw, lngRef));
    }
    const dtRaw = raw.DateTimeOriginal ?? raw.DateTime ?? null;
    const dt = typeof dtRaw === 'string' ? dtRaw : null;
    return {
      datetimeOriginal: dt,
      lat,
      lng,
      make: raw.Make ?? null,
      model: raw.Model ?? null,
      width: raw.ExifImageWidth ?? raw.PixelXDimension ?? null,
      height: raw.ExifImageHeight ?? raw.PixelYDimension ?? null,
      hasGps: lat != null && lng != null,
    };
  } catch {
    return { datetimeOriginal: null, lat: null, lng: null, make: null, model: null, width: null, height: null, hasGps: false };
  }
}

// --- manifest types ---

type PrepPhoto = {
  photoId: string;
  sourceFile: string;
  thumbFile: string;
  thumbW: number;
  thumbH: number;
  thumbBytes: number;
  exif: ExifMeta;
  dtMs: number | null;
  dtSrc: 'exif' | 'filename' | null;
};

type PrepCandidate = {
  reportId: string;
  photoIds: string[];
  photo_index: number[]; // 0..n-1, parallel to photoIds — kontrakt z Vision.php
  startMs: number;
  endMs: number;
  centroid: { lat: number; lng: number } | null;
  hasGps: boolean;
  needsReview: boolean;
};

type Manifest = {
  prepVersion: number;
  params: { maxWidth: number; quality: number };
  inputHash: string;
  generatedAt: string;
  photos: PrepPhoto[];
  candidates: PrepCandidate[];
  dropped: number;
};

const PREP_VERSION = 1;

async function listSourcePhotos(): Promise<string[]> {
  const entries = await readdir(PHOTOS_DIR);
  return entries.filter((f) => /\.jpe?g$/i.test(f)).sort();
}

async function computeInputHash(files: string[], params: Args): Promise<string> {
  const h = createHash('sha256');
  h.update(JSON.stringify({ maxWidth: params.maxWidth, quality: params.quality, prepVersion: PREP_VERSION }));
  for (const f of files) {
    const st = await stat(path.join(PHOTOS_DIR, f));
    h.update(`${f}:${st.size}:${st.mtimeMs}`);
  }
  return h.digest('hex');
}

async function loadExistingManifest(): Promise<Manifest | null> {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(CACHE_DIR, { recursive: true });

  const files = await listSourcePhotos();
  if (files.length === 0) {
    console.error(`Brak zdjęć .jpg w ${PHOTOS_DIR}`);
    process.exit(1);
  }

  const inputHash = await computeInputHash(files, args);
  if (!args.force) {
    const existing = await loadExistingManifest();
    if (existing && existing.inputHash === inputHash) {
      console.log(`prep: cache aktualny (${existing.photos.length} zdjęć, ${existing.candidates.length} kandydatów) — pomijam. --force żeby przeliczyć.`);
      printSummary(existing);
      return;
    }
  }

  console.log(`prep: ${files.length} zdjęć źródłowych, max-width=${args.maxWidth} quality=${args.quality}`);

  // Faza 0 (inventory) z grouping.ts liczona raz na wszystkie zdjęcia naraz — dokładnie tak jak
  // w apce (droppedliczba i sort po czasie zależą od pełnego zbioru, nie pojedynczego zdjęcia).
  const exifByPhotoId = new Map<string, ExifMeta>();
  const photoIdByFile = new Map<string, string>();
  for (const file of files) {
    const bytes = await readFile(path.join(PHOTOS_DIR, file));
    const raw = await exifr.parse(bytes, { translateValues: false, reviveValues: false });
    const photoId = path.basename(file, path.extname(file));
    exifByPhotoId.set(photoId, parseRawExif(raw ?? {}));
    photoIdByFile.set(file, photoId);
  }
  const groupingInputForInventory: GroupingInput[] = files.map((file) => {
    const photoId = photoIdByFile.get(file)!;
    const exif = exifByPhotoId.get(photoId)!;
    return { id: photoId, fileName: file, datetimeOriginal: exif.datetimeOriginal, lat: exif.lat, lng: exif.lng };
  });
  const inventoried = inventory(groupingInputForInventory);
  const invByPhotoId = new Map(inventoried.map((p) => [p.id, p]));

  const photos: PrepPhoto[] = [];
  for (const file of files) {
    const photoId = photoIdByFile.get(file)!;
    const exif = exifByPhotoId.get(photoId)!;
    const bytes = await readFile(path.join(PHOTOS_DIR, file));

    // sharp: .rotate() wypieka orientację EXIF (jak expo-image-manipulator), potem resize do
    // szerokości uploadConfig.photoMaxWidth, JPEG q=uploadConfig.photoCompress*100 (sharp bierze
    // 1..100, apka 0..1 — przeliczenie).
    const thumbFile = `${photoId}.jpg`;
    const thumbPath = path.join(CACHE_DIR, thumbFile);
    const img = sharp(bytes).rotate().resize({ width: args.maxWidth, withoutEnlargement: true });
    const out = await img.jpeg({ quality: Math.round(args.quality * 100) }).toBuffer();
    await writeFile(thumbPath, out);
    const meta = await sharp(out).metadata();

    const inv = invByPhotoId.get(photoId);
    const dtMs = inv?.dtMs ?? null;
    const dtSrc = inv?.dtSrc ?? null;

    photos.push({
      photoId,
      sourceFile: file,
      thumbFile,
      thumbW: meta.width ?? 0,
      thumbH: meta.height ?? 0,
      thumbBytes: out.byteLength,
      exif,
      dtMs,
      dtSrc,
    });
    console.log(`  ${file} -> ${thumbFile} (${meta.width}x${meta.height}, ${(out.byteLength / 1024).toFixed(0)}kB, dt=${dtSrc ?? 'MISSING'})`);
  }

  // Grupowanie: dokładnie groupPhotos() z src/lib/grouping.ts, bez modyfikacji.
  const groupingInput: GroupingInput[] = photos.map((p) => ({
    id: p.photoId,
    fileName: p.sourceFile,
    datetimeOriginal: p.exif.datetimeOriginal,
    lat: p.exif.lat,
    lng: p.exif.lng,
  }));
  const { candidates, dropped } = groupPhotos(groupingInput);

  const prepCandidates: PrepCandidate[] = candidates.map((c) => ({
    reportId: c.reportId,
    photoIds: c.photoIds,
    photo_index: c.photoIds.map((_, i) => i),
    startMs: c.startMs,
    endMs: c.endMs,
    centroid: c.centroid,
    hasGps: c.hasGps,
    needsReview: c.needsReview,
  }));

  const manifest: Manifest = {
    prepVersion: PREP_VERSION,
    params: { maxWidth: args.maxWidth, quality: args.quality },
    inputHash,
    generatedAt: new Date().toISOString(),
    photos,
    candidates: prepCandidates,
    dropped,
  };
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nprep: zapisano ${MANIFEST_PATH}`);
  printSummary(manifest);
}

function printSummary(m: Manifest) {
  console.log(`\n${m.photos.length} zdjęć, ${m.dropped} odrzuconych (brak czasu), ${m.candidates.length} kandydatów:`);
  for (const c of m.candidates) {
    console.log(`  ${c.reportId}: ${c.photoIds.length} zdjęć [${c.photoIds.join(', ')}]${c.needsReview ? ' [NEEDS_REVIEW]' : ''}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
