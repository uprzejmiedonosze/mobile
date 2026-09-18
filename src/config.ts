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

// Środowisko backendu UD + Firebase – TO SĄ RÓŻNE PROJEKTY FIREBASE, więc przełączamy je
// razem jednym blokiem (jak web src/js/lib/firebaseConfig.js, tam wybór po hostname –
// w Expo nie ma hostname, więc EXPO_PUBLIC_UD_ENV). Domyślnie staging – bezpieczne dla dev,
// osobna baza/pula użytkowników niż prod. Token ze stagingu nie zadziała na prod i odwrotnie.
export type UdEnvName = 'staging' | 'prod';

const ENVS: Record<UdEnvName, { base: string; apiKey: string; authDomain: string; projectId: string; googleWebClientId: string }> = {
  staging: {
    base: 'https://staging.uprzejmiedonosze.net',
    apiKey: 'AIzaSyDXgjibECwejzudsm3YBQh3O5ponz7ArtI',
    authDomain: 'auth-staging.uprzejmiedonosze.net',
    projectId: 'uprzejmiedonosze-1494607701827',
    googleWebClientId: '509860799944-7e8qe7knqkcjm5jbi932gg3tmgo657vf.apps.googleusercontent.com',
  },
  prod: {
    base: 'https://uprzejmiedonosze.net',
    apiKey: 'AIzaSyC2vVIN-noxOw_7mPMvkb-AWwOk6qK1OJ8',
    authDomain: 'auth.uprzejmiedonosze.net',
    projectId: 'uprzejmie-donosze',
    googleWebClientId: '823788795198-inlf6ld2q1o7up7vbkerb4gdu30bm5tu.apps.googleusercontent.com',
  },
};

export const udEnv: UdEnvName = process.env.EXPO_PUBLIC_UD_ENV === 'prod' ? 'prod' : 'staging';
const envBlock = ENVS[udEnv];

// Backend UD – te same endpointy co web (src/index.php, src/api/rest/index.php).
// EXPO_PUBLIC_UD_BASE nadpisuje tylko base (np. na localhost), niezależnie od udEnv.
export const udConfig = {
  base: (process.env.EXPO_PUBLIC_UD_BASE || envBlock.base).replace(/\/$/, ''),
} as const;

// Firebase – ten sam projekt co web dla danego środowiska (src/js/lib/firebaseConfig.js).
// Web apiKey jest publiczny z natury. Email-link = ten sam provider co na webu
// (EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD).
// Pojedyncze pola można nadpisać z .env, ale wtedy trzeba nadpisać wszystkie trzy razem –
// mieszanie np. prod apiKey ze staging authDomain kończy się 403 z Firebase.
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || envBlock.apiKey,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || envBlock.authDomain,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || envBlock.projectId,
} as const;

// Web OAuth client (ten sam co web src/js/lib/firebaseConfig.js getClientId()) – to jest
// audience tokenu ID Google na obu platformach (@react-native-google-signin/google-signin
// GoogleSignin.configure({ webClientId })). Android dodatkowo wymaga osobnego klienta OAuth
// typu Android (package + SHA-1 keystore EAS) zarejestrowanego w konsoli Google Cloud – ten
// klient nie ma tu odpowiednika w kodzie, biblioteka znajduje go sama po package name.
export const googleConfig = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || envBlock.googleWebClientId,
} as const;
