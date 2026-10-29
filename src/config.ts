import * as SecureStore from 'expo-secure-store';

// Scentralizowana konfiguracja z pliku .env (EXPO_PUBLIC_*).
// Metro wczytuje .env przy starcie serwera – po zmianie `expo start -c`.
function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// SYNC z backendem (../uprzejmiedonosze): 1600 px / 0.85 muszą pasować do MAX_IMAGE_DIM / JPEG_QUALITY w src/inc/API.php
// i src/js/new-app/images.js (web) – patrz komentarz w lib/resize.ts.
// Rozmiar zdjęć wysyłanych do backendu UD (/api/rest/vision/candidate). To NIE jest konfiguracja
// LLM – klucz, model i limity tokenów żyją tylko po stronie serwera (src/inc/config.php,
// OPENAI_VISION_*), appka ich nie zna i nigdy nie widzi.
export const uploadConfig = {
  photoMaxWidth: num(process.env.EXPO_PUBLIC_PHOTO_MAX_WIDTH, 1600),
  photoCompress: (() => {
    const n = Number(process.env.EXPO_PUBLIC_PHOTO_COMPRESS);
    return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.85;
  })(),
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

const buildEnv: UdEnvName = process.env.EXPO_PUBLIC_UD_ENV === 'prod' ? 'prod' : 'staging';

// Konto demo recenzentów sklepów (src/lib/demoLogin.ts): prod rozpoznaje e-mail demo i build prod przełącza się na staging,
// gdzie zgłoszenia nie trafiają do SM/policji. Flaga leży w SecureStore i jest czytana synchronicznie przy starcie modułu –
// zmiana działa dopiero po restarcie JS (reloadAppAsync). Wylogowanie ją kasuje.
export const ENV_OVERRIDE_KEY = 'udpro.envOverride';
function readEnvOverride(): string | null {
  try { return SecureStore.getItem(ENV_OVERRIDE_KEY); } catch { return null; }
}
export const demoMode = buildEnv === 'prod' && readEnvOverride() === 'staging';

export const udEnv: UdEnvName = demoMode ? 'staging' : buildEnv;
const envBlock = ENVS[udEnv];
// W trybie demo pojedyncze nadpisania z env (np. EXPO_PUBLIC_UD_BASE) wskazywałyby prod – pomijamy je.
const envOr = (v: string | undefined, fallback: string) => (demoMode ? fallback : v || fallback);

// Backend UD – te same endpointy co web (src/index.php, src/api/rest/index.php).
// EXPO_PUBLIC_UD_BASE nadpisuje tylko base (np. na localhost), niezależnie od udEnv.
export const udConfig = {
  base: envOr(process.env.EXPO_PUBLIC_UD_BASE, envBlock.base).replace(/\/$/, ''),
} as const;

// Firebase – ten sam projekt co web dla danego środowiska (src/js/lib/firebaseConfig.js).
// Web apiKey jest publiczny z natury. Email-link = ten sam provider co na webu
// (EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD).
// Pojedyncze pola można nadpisać z .env, ale wtedy trzeba nadpisać wszystkie trzy razem –
// mieszanie np. prod apiKey ze staging authDomain kończy się 403 z Firebase.
export const firebaseConfig = {
  apiKey: envOr(process.env.EXPO_PUBLIC_FIREBASE_API_KEY, envBlock.apiKey),
  authDomain: envOr(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, envBlock.authDomain),
  projectId: envOr(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, envBlock.projectId),
} as const;

// Firebase Auth Emulator (backend w dockerze, `make dev` w ../uprzejmiedonosze: :9099). Ustawione → REST Firebase idzie
// do emulatora zamiast do googleapis (e2e lokalnie, patrz docs/TESTING.md). Z iOS-owego symulatora 127.0.0.1 = Mac,
// z emulatora Androida trzeba 10.0.2.2. Puste = prawdziwy Firebase (staging/prod).
export const firebaseEmulatorHost = (process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || '').replace(/\/$/, '');

// Tryb e2e (Maestro): włącza deep link `udpro://e2e-login` (src/lib/e2eLogin.ts), który wpisuje gotową sesję testową.
// Ustawiany TYLKO przez e2e/run.sh (Metro) – żaden profil eas.json go nie ustawia, więc nie trafia do release.
export const e2eEnabled = process.env.EXPO_PUBLIC_E2E === '1';

// Web OAuth client (ten sam co web src/js/lib/firebaseConfig.js getClientId()) – to jest
// audience tokenu ID Google na obu platformach (@react-native-google-signin/google-signin
// GoogleSignin.configure({ webClientId })). Android dodatkowo wymaga osobnego klienta OAuth
// typu Android (package + SHA-1 keystore EAS) zarejestrowanego w konsoli Google Cloud – ten
// klient nie ma tu odpowiednika w kodzie, biblioteka znajduje go sama po package name.
export const googleConfig = {
  webClientId: envOr(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, envBlock.googleWebClientId),
} as const;

// Sentry (crashe/błędy z buildów produkcyjnych). Pusty DSN = wyłączone (np. lokalny dev).
// Osobny projekt Sentry niż backend; środowisko = udEnv, żeby staging nie mieszał się z prodem.
export const sentryConfig = {
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  // EXPO_PUBLIC_SENTRY_ENV rozróżnia np. shadow (udEnv=prod, ale osobny host) od proda.
  environment: envOr(process.env.EXPO_PUBLIC_SENTRY_ENV, udEnv),
} as const;
