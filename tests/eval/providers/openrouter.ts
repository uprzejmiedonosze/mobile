// Klient OpenRouter (POST /api/v1/chat/completions) + narzędzia do budowy rostera modeli
// (GET /api/v1/models, GET /api/v1/models/{id}/endpoints, GET /api/v1/providers) — krok 4 planu.
//
// UWAGA o gwarancji EU: `provider.only: ["<tag>"], allow_fallbacks: false` przypina żądanie do
// KONKRETNEGO dostawcy/regionu (np. "azure/swedencentral", "google-vertex/eu") — bez fallbacku,
// więc żądanie się wywali, jeśli ten endpoint akurat nie odpowiada, zamiast po cichu przejść na
// dostawcę spoza UE. To NIE jest to samo co kontraktowa rezydencja danych w UE od samego
// OpenRoutera — ta jest wg dokumentacji (openrouter.ai/docs/features/provider-routing) dostępna
// tylko dla klientów enterprise. Dla tego harnessu (ocena jakości/ceny, nie produkcja z danymi
// osobowymi) przypięcie endpointu to wystarczające i weryfikowalne przybliżenie „hostingu w EU".

const API_BASE = 'https://openrouter.ai/api/v1';

function authHeaders(): Record<string, string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY nie ustawiony (tests/eval/.env)');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    // Nagłówki statystyk OpenRouter (opcjonalne, ale grzeczne — identyfikują wywołującego w ich dashboardzie).
    'HTTP-Referer': 'https://github.com/uprzejmiedonosze/uprzejmiedonosze-pro',
    'X-Title': 'UD Pro vision eval harness',
  };
}

export type OpenRouterModel = {
  id: string;
  name: string;
  created: number;
  architecture: { input_modalities: string[]; output_modalities: string[] };
  pricing: { prompt: string; completion: string; image?: string };
  supported_parameters: string[];
};

export async function listModels(): Promise<OpenRouterModel[]> {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error(`GET /models: HTTP ${res.status}`);
  const j = (await res.json()) as { data: OpenRouterModel[] };
  return j.data;
}

export type OpenRouterEndpoint = {
  tag: string;
  provider_name: string;
  pricing: { prompt: string; completion: string };
  status: number;
  uptime_last_30m: number | null;
};

export async function listEndpoints(modelId: string): Promise<OpenRouterEndpoint[]> {
  const res = await fetch(`${API_BASE}/models/${modelId}/endpoints`);
  if (!res.ok) throw new Error(`GET /models/${modelId}/endpoints: HTTP ${res.status}`);
  const j = (await res.json()) as { data: { endpoints: OpenRouterEndpoint[] } };
  return j.data.endpoints ?? [];
}

export type OpenRouterProvider = {
  slug: string;
  name: string;
  headquarters?: string | null;
  datacenters?: string[] | null;
};

export async function listProviders(): Promise<OpenRouterProvider[]> {
  const res = await fetch(`${API_BASE}/providers`);
  if (!res.ok) throw new Error(`GET /providers: HTTP ${res.status}`);
  const j = (await res.json()) as { data: OpenRouterProvider[] };
  return j.data;
}

// Sygnały regionu EU w tagu endpointu (np. 'azure/swedencentral', 'google-vertex/eu', 'mistral/eu').
const EU_TAG_HINTS = [
  'eu-', '/eu', 'europe', 'sweden', 'france', 'germany', 'netherlands', 'ireland', 'spain',
  'finland', 'switzerland', 'norway', 'belgium', 'italy', 'poland', 'frankfurt', 'paris',
  'amsterdam', 'stockholm', 'zurich', 'milan', 'madrid', 'helsinki', 'dublin',
  'westeurope', 'northeurope',
];
const EU_HQ_DC_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'NO', 'CH', 'IS',
]);

/** Znajduje endpoint tego modelu, który da się wiarygodnie przypiąć do UE — patrz uwaga u góry pliku. */
export function findEuEndpoint(endpoints: OpenRouterEndpoint[], providers: OpenRouterProvider[]): OpenRouterEndpoint | null {
  const bySlug = new Map(providers.map((p) => [p.slug, p]));
  for (const e of endpoints) {
    const tagLower = (e.tag ?? '').toLowerCase();
    if (EU_TAG_HINTS.some((h) => tagLower.includes(h))) return e;
    const slug = tagLower.split('/')[0];
    const p = bySlug.get(slug);
    if (!p) continue;
    const dc = p.datacenters ?? [];
    if (dc.some((d) => EU_HQ_DC_CODES.has(d))) return e;
    if (!dc.length && p.headquarters && EU_HQ_DC_CODES.has(p.headquarters)) return e;
  }
  return null;
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string | ChatContentPart[] };
export type ChatContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export type ChatUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number; // USD, obecne tylko przy usage:{include:true}
  prompt_tokens_details?: { cached_tokens?: number };
};

export type ChatResult = {
  content: string;
  usage: ChatUsage;
  // Faktycznie użyty dostawca, np. "Azure" — TYLKO nazwa dostawcy, odpowiedź OpenRoutera nie
  // zwraca pełnego tagu regionu (np. "azure/swedencentral"), więc pole 'provider' pozwala
  // zweryfikować "czy poszło przez Azure", ale nie "czy konkretnie przez region szwedzki" —
  // za to ostatnie odpowiada wyłącznie allow_fallbacks:false w żądaniu (patrz uwaga u góry pliku).
  provider: string | null;
  providerTag: string | null; // tag żądany w tym wywołaniu (opts.providerTag) — do porównania w score.ts
  latencyMs: number;
  finishReason: string | null;
};

export type ChatOpts = {
  model: string;
  // Przypinany endpoint EU, np. "azure/swedencentral". null = CELOWO bez pinu — tylko dla
  // wariantu bazowego "stan dzisiejszy" w models.json (isUnpinned:true), do porównania
  // "EU vs bez ograniczeń". Nigdy nie podstawiać domyślnego taga za null — to zniweczyłoby sens
  // tego wariantu jako linii odniesienia bez gwarancji regionu.
  providerTag: string | null;
  supportsJsonObject: boolean; // z supported_parameters modelu — czy response_format:{type:'json_object'} jest bezpieczne
  maxTokens?: number;
  tries?: number; // domyślnie 3, jak chat() w Vision.php
  timeoutMs?: number; // domyślnie 90s, jak OPENAI_VISION_TIMEOUT w produkcji — patrz uwaga przy chat()
};

export class OpenRouterNetworkError extends Error {}

/**
 * Jedno wywołanie chat/completions z retry na 429/5xx (3 próby, backoff 2s*attempt) — 1:1 z
 * chat() w Vision.php. Przypina provider.only do EU-endpointu, allow_fallbacks:false — żądanie
 * ma się wywalić, nie po cichu przejść na dostawcę spoza UE.
 *
 * Timeout jest KRYTYCZNY, nie kosmetyczny: niektórzy dostawcy z rostera (patrz models.json —
 * nextbit, mistral, nebius, to niszowe routingi OpenRouter, nie duzi wprost-partnerscy jak
 * OpenAI/Azure) potrafią przyjąć połączenie i nigdy nie odpowiedzieć — bez AbortSignal `fetch()`
 * wisi w nieskończoność, retry nigdy się nie uruchamia (nic nie rzuca), a run.ts (sekwencyjny,
 * bez własnego timeoutu na poziomie runnera) staje w miejscu na godziny. Odkryte empirycznie
 * podczas rundy A: proces zawisł na `google/gemma-4-26b-a4b-it` @ `nextbit/bf16` bez żadnego
 * postępu przez >4 min i musiał zostać zabity ręcznie.
 */
export async function chat(messages: ChatMessage[], opts: ChatOpts): Promise<ChatResult> {
  const tries = opts.tries ?? 3;
  // 45s, nie 90s jak OPENAI_VISION_TIMEOUT w produkcji: tam ten limit okalał całe wywołanie PHP
  // (może obejmować retry-crop w środku), tu to JEDNO wywołanie HTTP — 45s już jest hojne dla
  // pojedynczej odpowiedzi wizyjnej, a krótszy limit szybciej odsiewa zepsutego dostawcę zamiast
  // trzymać runner (3 próby × 45s = maks. ~2.5 min na jedno wywołanie, nie ~4.5 min).
  const timeoutMs = opts.timeoutMs ?? 45_000;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < tries; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: authHeaders(),
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model: opts.model,
          temperature: 0,
          max_tokens: opts.maxTokens ?? 8000,
          messages,
          ...(opts.supportsJsonObject ? { response_format: { type: 'json_object' } } : {}),
          usage: { include: true }, // koszt mierzony, nie szacowany — patrz krok 5 planu
          ...(opts.providerTag ? { provider: { only: [opts.providerTag], allow_fallbacks: false } } : {}),
        }),
      });
      const latencyMs = Date.now() - t0;

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        if (attempt < tries - 1) await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        throw new Error(`OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }

      const j = await res.json();
      const choice = j.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error(`puste content (finish=${choice?.finish_reason ?? '?'})`);
      }
      const providerUsed: string | null = j.provider ?? null;

      return {
        content,
        usage: {
          prompt_tokens: j.usage?.prompt_tokens ?? 0,
          completion_tokens: j.usage?.completion_tokens ?? 0,
          total_tokens: j.usage?.total_tokens ?? 0,
          cost: j.usage?.cost,
          prompt_tokens_details: j.usage?.prompt_tokens_details,
        },
        provider: providerUsed,
        providerTag: opts.providerTag,
        latencyMs,
        finishReason: choice?.finish_reason ?? null,
      };
    } catch (e: any) {
      if (e?.message?.startsWith('puste content')) throw e; // jak w Vision.php: nie retry'ować na pustą treść
      lastErr = e;
      if (attempt < tries - 1) await sleep(2000 * (attempt + 1));
    }
  }
  throw new OpenRouterNetworkError(`blad sieci OpenRouter: ${lastErr?.message ?? 'nieznany'}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Czy zwrócony `provider` (np. "Azure") odpowiada przypiętemu tagowi (np. "azure/swedencentral"). */
export function providerMatchesTag(returnedProvider: string | null, tag: string | null): boolean {
  if (!tag) return true; // brak pinu = nic do weryfikacji (wariant "bez EU", celowo)
  if (!returnedProvider) return false;
  const slug = tag.split('/')[0].toLowerCase();
  return returnedProvider.toLowerCase().replace(/[^a-z0-9]/g, '') === slug.replace(/[^a-z0-9]/g, '');
}
