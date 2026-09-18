// Faza 4 + 6: batch wizyjny na kandydata + weryfikacja bbox cropem z oryginału.
// Port analizuj_wizja.py: 1 call/kandydat (miniatury w kolejności czasu, detail low),
// retry sieciowy (3 próby, backoff 2 s; tylko URLError i HTTP 429/5xx), fallback paczek po 3,
// jedna runda naprawy na nie-JSON i jedna na błędy walidacji. Głośny błąd zamiast zgadywania.
import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { llmConfig } from '../config';
import { log, logFetch } from '../lib/log';
import { extractJson } from './spark';
import { VISION_PROMPT, normalizeVisionPhoto, normPlateKey, validateVisionPhoto, type Box4, type VisionPhoto } from '../lib/vision';

export type VisionItem = {
  photo_index: number; // globalny indeks w kandydacie
  photoId: string;
  uri: string; // oryginał (do cropów)
  thumbB64: string; // miniatura 1600px
};

export class NetworkError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ChatMsg = { role: string; content: any };

async function chat(
  apiKey: string,
  model: string,
  messages: ChatMsg[],
  maxTokens: number,
  tries = 3,
  signal?: AbortSignal,
): Promise<string> {
  // Budżet musi pokryć też myślenie modeli reasoningowych – stąd 8000 na analizę.
  let lastErr: Error = new NetworkError('nieznany blad sieci');
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await logFetch('wizja', llmConfig.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
          'HTTP-Referer': llmConfig.appReferer,
          'X-Title': llmConfig.appTitle,
        },
        signal,
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          reasoning: { effort: 'low', exclude: true },
          messages,
        }),
      });
      if (res.status === 429 || res.status >= 500) {
        const detail = await res.text().catch(() => '');
        lastErr = new NetworkError(`HTTP ${res.status}: ${detail.slice(0, 200)}`);
      } else if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${detail.slice(0, 300)}`);
      } else {
        const j = (await res.json()) as any;
        const msg = j?.choices?.[0]?.message ?? {};
        let content = msg.content;
        if (typeof content !== 'string' || !content.trim()) {
          if (typeof msg.reasoning === 'string' && msg.reasoning.trim()) content = msg.reasoning; // awaryjnie
          else throw new Error(`puste content (finish=${j?.choices?.[0]?.finish_reason ?? '?'})`);
        }
        return Array.isArray(content) ? content.map((c: any) => c?.text ?? '').join('') : String(content);
      }
    } catch (e: any) {
      if (e instanceof NetworkError) lastErr = e;
      else if (e?.name === 'AbortError') throw e;
      else lastErr = new NetworkError(`blad sieci: ${String(e?.message ?? e).slice(0, 200)}`);
    }
    if (attempt < tries - 1) await sleep(2000 * (attempt + 1));
  }
  throw lastErr;
}

function imgPart(b64: string) {
  return { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'low' } };
}

function parsePhotos(raw: string): VisionPhoto[] {
  const { parsed, truncated } = extractJson(raw);
  if (!parsed) throw new Error(truncated ? 'model uciął JSON' : `model nie zwrócił JSON: ${raw.slice(0, 160)}`);
  const photos = parsed.photos;
  if (!Array.isArray(photos)) throw new Error('brak klucza photos w odpowiedzi');
  return photos as VisionPhoto[];
}

async function repairRound(apiKey: string, model: string, history: ChatMsg[], raw: string, label: string, signal?: AbortSignal): Promise<string> {
  history.push({ role: 'assistant', content: raw });
  history.push({ role: 'user', content: label });
  return chat(apiKey, model, history, llmConfig.visionMaxTokens, 3, signal);
}

export async function analyzeChunk(
  apiKey: string,
  model: string,
  items: VisionItem[],
  signal?: AbortSignal,
): Promise<VisionPhoto[]> {
  const idx = items.map((i) => i.photo_index);
  const n = items.length;
  const note =
    n > 1 || idx[0] !== 0
      ? ` These are photos ${idx[0]}..${idx[idx.length - 1]} of the same report; use exactly these photo_index values.`
      : '';
  const content: any[] = [{ type: 'text', text: VISION_PROMPT + note }];
  for (const it of items) content.push(imgPart(it.thumbB64));
  const history: ChatMsg[] = [{ role: 'user', content }];

  let raw = await chat(apiKey, model, history, llmConfig.visionMaxTokens, 3, signal);
  let photos: VisionPhoto[];
  try {
    photos = parsePhotos(raw);
  } catch {
    // jedna próba naprawy: model odpowiedział prozą
    raw = await repairRound(apiKey, model, history, raw, 'That was not valid JSON. Repeat the answer as raw JSON only: no prose, no markdown fences, no commentary.', signal);
    photos = parsePhotos(raw); // tu już głośno przy porażce
  }
  const want = [...idx].sort((a, b) => a - b);
  const got = photos.map((p) => p.photo_index).sort((a, b) => a - b);
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`zwrócono indeksy [${got}], oczekiwano [${want}]`);
  photos.sort((a, b) => a.photo_index - b.photo_index);

  let errs = photos.flatMap((p, k) => validateVisionPhoto(p, idx[k]).map((e) => `zdj.${idx[k]}: ${e}`));
  if (errs.length) {
    // jedna próba naprawy: odeślij błędy
    raw = await repairRound(apiKey, model, history, raw, `Your JSON has errors: ${errs.join('; ')}. Return the FULL corrected JSON object again. JSON only.`, signal);
    photos = parsePhotos(raw);
    photos.sort((a, b) => a.photo_index - b.photo_index);
  }
  errs = photos.flatMap((p, k) => validateVisionPhoto(p, idx[k]).map((e) => `zdj.${idx[k]}: ${e}`));
  if (errs.length) throw new Error(`walidacja: ${errs.join('; ')}`);
  for (const p of photos) normalizeVisionPhoto(p);
  return photos;
}

export async function analyzeCandidate(
  apiKey: string,
  model: string,
  items: VisionItem[],
  signal?: AbortSignal,
): Promise<VisionPhoto[]> {
  try {
    return await analyzeChunk(apiKey, model, items, signal);
  } catch (e: any) {
    if (!(e instanceof NetworkError) || items.length <= 3) throw e;
    log.warn('wizja', `duży kandydat (${items.length} zdjęć): dzielę na paczki po 3`);
    const out: VisionPhoto[] = [];
    for (let s = 0; s < items.length; s += 3) {
      const pack = items.slice(s, s + 3);
      out.push(...(await analyzeChunk(apiKey, model, pack, signal)));
    }
    out.sort((a, b) => a.photo_index - b.photo_index);
    return out;
  }
}

function getSize(uri: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (w, h) => resolve({ w, h }),
      (e) => reject(new Error(`wymiary: ${String(e).slice(0, 120)}`)),
    );
  });
}

async function cropB64(uri: string, boxPx: { x: number; y: number; w: number; h: number }, maxSide: number): Promise<string> {
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [
      { crop: { originX: Math.round(boxPx.x), originY: Math.round(boxPx.y), width: Math.round(boxPx.w), height: Math.round(boxPx.h) } },
      { resize: { width: maxSide } },
    ] as any,
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true } as any,
  );
  if (!out.base64) throw new Error('crop bez base64');
  return out.base64;
}

// Retry: auto bez czytelnej tablicy (quality >= 0.3) – crop car+10% z oryginału, tylko odczyt.
export async function retryPlateCrop(
  apiKey: string,
  model: string,
  item: VisionItem,
  photo: VisionPhoto,
  signal?: AbortSignal,
): Promise<string | null> {
  const car = photo.car;
  if (!car?.present || !car.bbox) return null;
  try {
    const { w: W, h: H } = await getSize(item.uri);
    const [x1, y1, x2, y2] = car.bbox.map((v) => v / 1000);
    const mx = (x2 - x1) * 0.1;
    const my = (y2 - y1) * 0.1;
    const bx = Math.max(0, (x1 - mx) * W);
    const by = Math.max(0, (y1 - my) * H);
    const bw = Math.min(W, (x2 + mx) * W) - bx;
    const bh = Math.min(H, (y2 + my) * H) - by;
    if (bw < 10 || bh < 10) return null;
    const b64 = await cropB64(item.uri, { x: bx, y: by, w: bw, h: bh }, 1600);
    const raw = await chat(
      apiKey, model,
      [{ role: 'user', content: [{ type: 'text', text: 'This is a crop of a car. Read its Polish licence plate. Return JSON {"readable":bool, "text":str|null} only.' }, imgPart(b64)] }],
      llmConfig.cropMaxTokens, 2, signal,
    );
    const { parsed } = extractJson(raw);
    if (!parsed?.readable) return null;
    return normPlateKey(parsed.text);
  } catch (e: any) {
    log.warn('wizja', `retry crop: ${String(e?.message ?? e).slice(0, 150)}`);
    return null;
  }
}

// Weryfikacja pozycji tablicy drugą opinią. Crop bazuje na CAR.bbox (pewny),
// nigdy na plate.bbox (podejrzany o przesunięcie). Zwraca ok|mismatch|skip.
export async function verifyPlateBox(
  apiKey: string,
  model: string,
  item: VisionItem,
  photo: VisionPhoto,
  signal?: AbortSignal,
): Promise<{ status: 'ok' | 'mismatch' | 'skip'; bbox: Box4 | null }> {
  const plate = photo.plate;
  if (!plate?.readable || photo.plate_verified) return { status: 'skip', bbox: null };
  const expected = plate.text;
  const car = photo.car ?? ({} as VisionPhoto['car']);
  try {
    const { w: W, h: H } = await getSize(item.uri);
    let x1: number, y1: number, x2: number, y2: number, m: number;
    if (car.present && car.bbox) {
      [x1, y1, x2, y2] = car.bbox.map((v) => v / 1000);
      m = 0.1;
    } else if (plate.bbox) {
      [x1, y1, x2, y2] = plate.bbox.map((v) => v / 1000);
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
    if (bw < 10 || bh < 10) return { status: 'skip', bbox: null };
    const b64 = await cropB64(item.uri, { x: bx, y: by, w: bw, h: bh }, 1000);
    const raw = await chat(
      apiKey, model,
      [{ role: 'user', content: [{ type: 'text', text: 'This crop shows a car (front). Find its Polish licence plate. Return JSON {"text": plate characters or null, "bbox": [x1,y1,x2,y2] tight around the plate characters in 0..1000 coords of THIS crop, or null if no plate visible}. JSON only.' }, imgPart(b64)] }],
      llmConfig.cropMaxTokens, 2, signal,
    );
    const { parsed } = extractJson(raw);
    if (!parsed) return { status: 'skip', bbox: null };
    const text = normPlateKey(parsed.text);
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
    log.warn('wizja', `verify crop: ${String(e?.message ?? e).slice(0, 150)}`);
    return { status: 'skip', bbox: null };
  }
}
