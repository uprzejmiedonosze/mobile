// Scentralizowana konfiguracja LLM + zdjęć z pliku .env (EXPO_PUBLIC_*).
// Metro wczytuje .env przy starcie serwera – po zmianie `expo start -c`.
// Klucz z .env służy tylko jako prefill UI (tymczasowo); docelowo klucz na własnym proxy.
function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const llmConfig = {
  model: process.env.EXPO_PUBLIC_LLM_MODEL || 'meta/muse-spark-1.3',
  baseUrl: process.env.EXPO_PUBLIC_LLM_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions',
  apiKeyFromEnv: process.env.EXPO_PUBLIC_OPENROUTER_KEY || '',
  timeoutMs: num(process.env.EXPO_PUBLIC_LLM_TIMEOUT_MS, 90_000),
  maxTokens: num(process.env.EXPO_PUBLIC_LLM_MAX_TOKENS, 2000),
  visionMaxTokens: num(process.env.EXPO_PUBLIC_VISION_MAX_TOKENS, 8000),
  cropMaxTokens: num(process.env.EXPO_PUBLIC_CROP_MAX_TOKENS, 1000),
  photoMaxWidth: num(process.env.EXPO_PUBLIC_PHOTO_MAX_WIDTH, 1600),
  photoCompress: (() => {
    const n = Number(process.env.EXPO_PUBLIC_PHOTO_COMPRESS);
    return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.72;
  })(),
  appReferer: process.env.EXPO_PUBLIC_APP_REFERER || 'https://uprzejmiedonosze-pro.local',
  appTitle: process.env.EXPO_PUBLIC_APP_TITLE || 'UD Pro ALPR',
} as const;

// Backend UD – te same endpointy co web (src/index.php, src/api/rest/index.php).
export const udConfig = {
  base: (process.env.EXPO_PUBLIC_UD_BASE || 'https://uprzejmiedonosze.net').replace(/\/$/, ''),
} as const;

// Firebase – ten sam projekt co web (src/js/lib/firebaseConfig.js, prod).
// Web apiKey jest publiczny z natury. Email-link = ten sam provider co na webu
// (EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD).
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyC2vVIN-noxOw_7mPMvkb-AWwOk6qK1OJ8',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'auth.uprzejmiedonosze.net',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'uprzejmie-donosze',
} as const;
