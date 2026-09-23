// Port get_platerecognizer()/platerecognizerRequest() z
// ../../../uprzejmiedonosze/src/inc/integrations/plateRecognizer.php. Dwa zastosowania (krok 2 i
// krok 4 planu):
//   1. groundtruth.ts — bootstrap GT (tekst tablicy + box tablicy + box pojazdu).
//   2. pipeline.ts, wariant 'hybrid-pr' — tablica/bbox pojazdu z ALPR zamiast VLM.
//
// UWAGA: PLATERECOGNIZER_TOKEN w .env to sekret PRODUKCYJNY backendu (services/.env.prod na
// żywym koncie, dzieli quotę z ruchem produkcyjnym) — harness robi tu tylko rząd dziesiątek
// wywołań (bootstrap GT raz + ew. runda C dla hybrid-pr), więc to bezpieczne, ale nie zwiększać
// bez potrzeby.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve(import.meta.dirname, '../../.cache/platerecognizer');

export type PlateRecognizerBox = { xmin: number; ymin: number; xmax: number; ymax: number };

export type PlateRecognizerResult = {
  plate: string;
  score: number;
  box: PlateRecognizerBox;
  vehicle?: { box: PlateRecognizerBox; type?: string; score?: number };
};

export type PlateRecognizerResponse = {
  results: PlateRecognizerResult[];
};

function authHeaders(): Record<string, string> {
  const token = process.env.PLATERECOGNIZER_TOKEN;
  if (!token) throw new Error('PLATERECOGNIZER_TOKEN nie ustawiony (tests/eval/.env)');
  return { Authorization: `Token ${token}` };
}

/**
 * Rozpoznaje tablicę + box pojazdu na obrazie (bajty JPEG — MINIATURY, nie oryginału, tak jak
 * apka wysyła ≤1600px obraz do backendu; inaczej boxy przesunięte o skalę, patrz komentarz przy
 * API.php:163). regions=pl, mmc=true — jak w plateRecognizer.php. Cache po sha1 bajtów obrazu.
 */
export async function recognizePlate(imageBytes: Buffer): Promise<PlateRecognizerResponse> {
  const hash = createHash('sha1').update(imageBytes).digest('hex');
  await mkdir(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `${hash}.json`);
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  } catch {
    // cache miss, fetch below
  }

  const form = new FormData();
  // new Uint8Array(buffer) kopiuje bajty do świeżego ArrayBuffer — Buffer sam w sobie ma typ
  // .buffer:ArrayBufferLike (może być SharedArrayBuffer), którego Blob/BlobPart nie akceptuje.
  form.append('upload', new Blob([new Uint8Array(imageBytes)], { type: 'image/jpeg' }), 'image.jpg');
  form.append('regions', 'pl');
  form.append('mmc', 'true');

  const res = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
    method: 'POST',
    headers: authHeaders(),
    body: form,
    signal: AbortSignal.timeout(45_000), // patrz uwaga w providers/openrouter.ts:chat() — fetch bez timeoutu może wisieć w nieskończoność
  });
  if (!res.ok) {
    throw new Error(`PlateRecognizer HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as PlateRecognizerResponse;
  await writeFile(cachePath, JSON.stringify(json, null, 2));
  return json;
}

/** xmin/ymin/xmax/ymax w px miniatury -> [x1,y1,x2,y2] w 0..1000, jak kontrakt VisionPhoto. */
export function boxToVisionSpace(box: PlateRecognizerBox, imgW: number, imgH: number): [number, number, number, number] {
  return [
    Math.round((box.xmin / imgW) * 1000),
    Math.round((box.ymin / imgH) * 1000),
    Math.round((box.xmax / imgW) * 1000),
    Math.round((box.ymax / imgH) * 1000),
  ];
}

/** Najlepszy wynik (najwyższy score), jak get_car_info_platerecognizer() w plateRecognizer.php. */
export function bestResult(resp: PlateRecognizerResponse): PlateRecognizerResult | null {
  if (!resp.results?.length) return null;
  return [...resp.results].sort((a, b) => b.score - a.score)[0];
}
