// Tymczasowy klient chmury: Muse Spark 1.3 (ten sam model co w tej sesji)
// przez OpenRouter OpenAI-compatible endpoint. Klucz podaje user w UI (Settings na ekranie analizy).
// Docelowo przenieść klucz na własne proxy (jak w planie), żeby nie siedzieć w APK.
import type { LlmAlprResponse } from './alpr';
import { llmConfig } from '../config';
import { log } from '../lib/log';

export const SPARK_DEFAULT_MODEL = llmConfig.model;
const OPENROUTER_URL = llmConfig.baseUrl;

const SYSTEM = `Jesteś ALPR. Zwróć TYLKO JSON (bez markdown).
Pola: {"plateId": string|null, "plateConfidence": 0-1, "plateBox": {"x":n,"y":n,"w":n,"h":n}|null, "vehicleBox": {...}|null, "vehicleDesc": string|null, "notes": string}
Polskie tablice: "ZS 060NH", "WZ 4617T", "ZPY 7K83", indywidualne "Z4 CICHE", zielone EV też.
Główny plan = największy/najbliższy pojazd. Profil bez tablicy -> plateId null, plateBox null, vehicleBox nadal podaj.
Boxy w skali 0-1000, origin lewy-górny.`;

function stripFences(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : t;
}

// Wyciąga pierwszy KOMPLETNY obiekt {...} (zliczanie nawiasów, z obsługą stringów).
// Model reasoning (Spark) potrafi dokleić tekst przed/po JSON albo go uciąć – to je rozróżnia.
export function extractJson(text: string): { parsed: any; truncated: boolean } {
  const clean = stripFences(text);
  try {
    return { parsed: JSON.parse(clean), truncated: false };
  } catch {
    /* próbujemy znaleźć obiekt wewnątrz */
  }
  const start = clean.indexOf('{');
  if (start < 0) return { parsed: null, truncated: false };
  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  for (let i = start; i < clean.length; i++) {
    const c = clean[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") inStr = c;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return { parsed: JSON.parse(clean.slice(start, i + 1)), truncated: false };
        } catch {
          return { parsed: null, truncated: false };
        }
      }
    }
  }
  return { parsed: null, truncated: true }; // klamra otwarta, nigdy nie domknięta = ucięta odpowiedź
}

function clampBox(b: any): LlmAlprResponse['plateBox'] {
  if (!b || typeof b !== 'object') return null;
  const n = (v: any) => Math.max(0, Math.min(1000, Math.round(Number(v) || 0)));
  if (![b.x, b.y, b.w, b.h].every((v) => Number.isFinite(Number(v)))) return null;
  if (Number(b.w) <= 0 || Number(b.h) <= 0) return null;
  return { x: n(b.x), y: n(b.y), w: n(b.w), h: n(b.h) };
}

export async function analyzeWithSpark(
  photoBase64: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<LlmAlprResponse> {
  const key = apiKey.trim();
  if (!key) throw new Error('Brak klucza OpenRouter (wklej sk-or-v1-… na ekranie analizy)');
  const modelName = model.trim() || llmConfig.model;
  log.info('llm', `POST ${modelName} (b64 ${Math.round(photoBase64.length / 1024)} kB)`);
  const t0 = Date.now();
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': llmConfig.appReferer,
      'X-Title': llmConfig.appTitle,
    },
    signal,
    body: JSON.stringify({
      model: model.trim() || llmConfig.model,
      temperature: 0,
      max_tokens: llmConfig.maxTokens,
      response_format: { type: 'json_object' },
      // Spark to model reasoning: bez tego odpowiedź potrafi zawierać
      // rozumowanie przed JSON albo uciąć JSON (finish_reason=length).
      reasoning: { effort: 'low', exclude: true },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Odczytaj tablicę głównego pojazdu + boxy. TYLKO JSON.' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${photoBase64}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log.error('llm', `HTTP ${res.status}: ${body.slice(0, 300)}`);
    if (res.status === 401) throw new Error('401: zły klucz OpenRouter');
    if (res.status === 402) throw new Error('402: brak kredytów / limit free');
    if (res.status === 429) throw new Error('429: rate-limit (free: 20/min, 50/dzień) – poczekaj');
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = (await res.json()) as any;
  const choice = j?.choices?.[0];
  const finish = choice?.finish_reason ?? '?';
  const content = choice?.message?.content;
  const text = Array.isArray(content) ? content.map((c: any) => c?.text ?? '').join('') : String(content ?? '');
  log.debug('llm', `finish=${finish} len=${text.length} reasoning=${choice?.message?.reasoning ? 'tak' : 'nie'}`);
  if (!text.trim()) {
    log.error('llm', `pusta treść po ${Date.now() - t0}ms (finish=${finish}) – model zjadł budżet na reasoning; zwiększ EXPO_PUBLIC_LLM_MAX_TOKENS`);
    throw new Error('LLM zwrócił pustą odpowiedź (finish=' + finish + ') – zwiększ MAX_TOKENS lub spróbuj ponownie');
  }
  const { parsed, truncated } = extractJson(text);
  if (!parsed) {
    if (truncated || finish === 'length') {
      log.error('llm', `ucięty JSON po ${Date.now() - t0}ms (finish=${finish}, len=${text.length}): ${text.slice(-160)}`);
      throw new Error('LLM uciął JSON (finish=length) – zwiększ EXPO_PUBLIC_LLM_MAX_TOKENS (np. 2000) i restart z -c');
    }
    log.error('llm', `nie-JSON po ${Date.now() - t0}ms (finish=${finish}, len=${text.length}): ${text.slice(0, 300)}`);
    throw new Error(`LLM nie zwrócił JSON: ${text.slice(0, 160)}`);
  }
  log.info('llm', `OK po ${Date.now() - t0}ms: tablica=${parsed.plateId ?? 'null'} conf=${parsed.plateConfidence ?? 0}`);
  return {
    plateId: parsed.plateId ?? null,
    plateConfidence: Number(parsed.plateConfidence ?? 0),
    plateBox: clampBox(parsed.plateBox),
    vehicleBox: clampBox(parsed.vehicleBox),
    vehicleDesc: parsed.vehicleDesc ?? null,
    notes: parsed.notes,
  };
}
