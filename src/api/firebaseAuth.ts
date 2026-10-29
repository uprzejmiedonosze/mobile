// Firebase Auth przez czyste REST (bez JS SDK – działa też bez dev-buildu, poza Google).
// Ten sam projekt co web (src/js/lib/firebaseConfig.js), dwa providery:
//  - email-link: EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD (src/js/firebase.js doLogin).
//    Przepływ: sendEmailLink(email) -> klik w link na telefonie otwiera appkę (App Link, src/lib/emailLinkLogin.ts;
//    tylko gdy Firebase wydał link do appki) albo user wkleja link/kod -> signInWithCode(email, code). Kod jest
//    jednorazowy: zwykły link otwarty w przeglądarce zużywa go na logowanie w www.
//  - Google: natywny @react-native-google-signin/google-signin (wymaga dev-build) daje token ID
//    Google -> signInWithGoogleIdToken wymienia go na sesję Firebase (accounts:signInWithIdp).
// Sesja: refreshToken w SecureStore, ID token (1h) odświeżany przez securetoken endpoint.
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { firebaseConfig, firebaseEmulatorHost, udConfig } from '../config';
import { extractOobCode } from '../lib/emailLink';
import { log, logFetch, UserError } from '../lib/log';
import { retryTransient } from '../lib/retry';

// Emulator Firebase Auth wystawia te same ścieżki pod własnym hostem (e2e lokalnie, config.firebaseEmulatorHost).
const IDTK = firebaseEmulatorHost ? `${firebaseEmulatorHost}/identitytoolkit.googleapis.com/v1` : 'https://identitytoolkit.googleapis.com/v1';
const SECURE = firebaseEmulatorHost ? `${firebaseEmulatorHost}/securetoken.googleapis.com/v1` : 'https://securetoken.googleapis.com/v1';

// Wymiana tokenu na sesję jest idempotentna – przy 502/503/504 i zerwanym połączeniu (fetch rzuca TypeError) ponawiamy.
// Nie dla sendOobCode (drugi mail) ani signInWithEmailLink (kod jednorazowy mógł już zostać zużyty).
const fbFetchRetry = (url: string, init: RequestInit) =>
  retryTransient(() => logFetch('auth', url, init), { isTransientError: (e) => e instanceof TypeError });

const K_REFRESH = 'udpro.fb.refresh';
const K_EMAIL = 'udpro.fb.email';

export type FbSession = { idToken: string; refreshToken: string; expiresAt: number; email: string };

async function fbErr(res: Response): Promise<never> {
  let msg = `HTTP ${res.status}`;
  try {
    const j = (await res.json()) as any;
    const e = j?.error;
    msg = `${e?.message ?? msg}${e?.errors?.[0]?.message ? ' :: ' + e.errors[0].message : ''}`;
  } catch {
    /* nie-JSON */
  }
  // Błędy, które użytkownik sam naprawi (zły e-mail, wygasły kod, za dużo prób), nie są usterką do Sentry.
  const userFacing = /INVALID_EMAIL|TOO_MANY_ATTEMPTS|QUOTA_EXCEEDED|INVALID_OOB_CODE|EXPIRED_OOB_CODE|EMAIL_NOT_FOUND/i.test(msg);
  throw userFacing ? new UserError(fbFriendly(msg)) : new Error(fbFriendly(msg));
}

function fbFriendly(msg: string): string {
  if (/INVALID_EMAIL/i.test(msg)) return 'Zły adres e-mail.';
  if (/TOO_MANY_ATTEMPTS|QUOTA_EXCEEDED/i.test(msg)) return 'Za dużo prób – poczekaj chwilę.';
  if (/INVALID_OOB_CODE|EXPIRED_OOB_CODE/i.test(msg)) return 'Link wygasł albo został już użyty (np. otwarty w przeglądarce) – wyślij nowy.';
  if (/EMAIL_NOT_FOUND/i.test(msg)) return 'Najpierw wyślij link na ten adres (przycisk powyżej).';
  if (/UNAUTHORIZED_CONTINUE_URI|unauthorized/i.test(msg)) return 'Firebase odrzucił continueUrl – zgłoś do dev (whitelist w konsoli Firebase).';
  if (/INVALID_IDP_RESPONSE/i.test(msg)) return 'Firebase odrzucił token Google – zgłoś do dev (zły webClientId albo SHA-1 klienta OAuth).';
  return msg.slice(0, 220);
}

// Krok 1 jak na webie: Firebase wysyła mail z linkiem (ten sam szablon co web).
// continueUrl to /login.html na hoście APLIKACJI (index.php:236), NIE authDomain –
// authDomain to custom domain Firebase Auth, obsługuje tylko /__/auth/*. Musi być
// na whiteliscie Authorized Domains projektu Firebase (konsola, poza repo).
//
// Link „do appki”: z androidPackageName + linkDomain Firebase robi link Hostingu
// https://<authDomain>/__/auth/links?link=…, który przejmuje appka (intent filter w app.config.js, weryfikowany przez
// assetlinks.json serwowany przez Hosting dla appki zarejestrowanej w projekcie z SHA-256). linkDomain musi być własną
// domeną Hostingu – firebaseapp.com Firebase odrzuca (INVALID_HOSTING_LINK_DOMAIN). Bez appki na telefonie Hosting
// przekierowuje do www jak dotąd. Projekt bez appki Android albo z mobileLinksConfig ≠ HOSTING_DOMAIN odrzuca taki
// link (DYNAMIC_LINK_NOT_ACTIVATED) – wtedy wysyłamy zwykły. Konfiguracja: docs/FIREBASE-EMAIL-LINK.md.
const RELEASE_PACKAGE = 'net.uprzejmiedonosze.pro'; // dev client (…pro.dev) nie ma intent filtra ani rejestracji w Firebase
const APP_LINK_UNAVAILABLE = /DYNAMIC_LINK|LINK_DOMAIN|HOSTING|ANDROID/i;

function appLinkSettings(): Record<string, unknown> | null {
  if (Platform.OS !== 'android' || Application.applicationId !== RELEASE_PACKAGE || firebaseEmulatorHost) return null;
  return { androidPackageName: RELEASE_PACKAGE, androidInstallApp: false, linkDomain: firebaseConfig.authDomain };
}

// Zwraca true, gdy poszedł link do appki – tylko wtedy można kazać go kliknąć (zwykły link zużyje kod w www).
export async function sendEmailLink(email: string): Promise<boolean> {
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new UserError('Zły adres e-mail.');
  log.info('auth', `wysyłam link na ${clean}`);
  const base = { requestType: 'EMAIL_SIGNIN', email: clean, continueUrl: `${udConfig.base}/login.html?next=%2Fapp%2Flist`, canHandleCodeInApp: true };
  const send = (body: object) => logFetch('auth', `${IDTK}/accounts:sendOobCode?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const app = appLinkSettings();
  let res = await send(app ? { ...base, ...app } : base);
  let appLink = !!app;
  if (!res.ok && app && res.status === 400 && APP_LINK_UNAVAILABLE.test(await res.clone().text().catch(() => ''))) {
    log.warn('auth', 'sendOobCode: link do appki niedostępny w tym projekcie Firebase – wysyłam zwykły');
    appLink = false;
    res = await send(base);
  }
  if (!res.ok) {
    log.warn('auth', `sendOobCode: HTTP ${res.status}`);
    await fbErr(res);
  }
  // E-mail do dokończenia logowania z linku – appka mogła zostać zamknięta, zanim user kliknie w mail.
  await SecureStore.setItemAsync(K_EMAIL, clean);
  log.info('auth', appLink ? 'link do appki wysłany – kliknij go w mailu na tym telefonie' : 'link wysłany – skopiuj go z maila (nie otwieraj)');
  return appLink;
}

// Krok 2: weryfikacja kodu (oobCode wyłuskany z linku – także zagnieżdżonego w linku Hostingu, lib/emailLink.ts).
export async function signInWithCode(email: string, codeOrLink: string): Promise<FbSession> {
  const clean = email.trim().toLowerCase();
  const oobCode = extractOobCode(codeOrLink);
  if (!oobCode) throw new UserError('W tym linku nie ma kodu logowania – wklej cały link z maila.');
  log.info('auth', 'weryfikuję kod…');
  const res = await logFetch('auth', `${IDTK}/accounts:signInWithEmailLink?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: clean, oobCode }),
  });
  if (!res.ok) {
    log.warn('auth', `signInWithEmailLink: HTTP ${res.status}`);
    await fbErr(res);
  }
  const j = (await res.json()) as any;
  const sess: FbSession = {
    idToken: j.idToken,
    refreshToken: j.refreshToken,
    expiresAt: Date.now() + Number(j.expiresIn ?? 3600) * 1000,
    email: clean,
  };
  await SecureStore.setItemAsync(K_REFRESH, sess.refreshToken);
  await SecureStore.setItemAsync(K_EMAIL, clean);
  log.info('auth', `zalogowano ${clean}`);
  return sess;
}

// Natywny Google Sign-In (@react-native-google-signin/google-signin) daje token ID Google;
// wymieniamy go na sesję Firebase przez signInWithIdp – ten sam projekt Firebase co email-link,
// tylko inny provider (AuthMiddleware w backendzie jest provider-agnostyczny, patrz CLAUDE.md).
export async function signInWithGoogleIdToken(googleIdToken: string): Promise<FbSession> {
  log.info('auth', 'wymieniam token Google na sesję Firebase…');
  const res = await fbFetchRetry(`${IDTK}/accounts:signInWithIdp?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: `id_token=${googleIdToken}&providerId=google.com`,
      requestUri: udConfig.base,
      returnSecureToken: true,
      returnIdpCredential: true,
    }),
  });
  if (!res.ok) {
    log.warn('auth', `signInWithIdp: HTTP ${res.status}`);
    await fbErr(res);
  }
  const j = (await res.json()) as any;
  const email = (j.email ?? '').trim().toLowerCase();
  const sess: FbSession = {
    idToken: j.idToken,
    refreshToken: j.refreshToken,
    expiresAt: Date.now() + Number(j.expiresIn ?? 3600) * 1000,
    email,
  };
  await SecureStore.setItemAsync(K_REFRESH, sess.refreshToken);
  await SecureStore.setItemAsync(K_EMAIL, email);
  log.info('auth', `zalogowano przez Google: ${email}`);
  return sess;
}

// Passkey: backend po zweryfikowaniu asercji WebAuthn zwraca Firebase custom token (ten sam projekt co reszta
// logowań); wymieniamy go na sesję, a e-mail (którego odpowiedź nie zawiera) pobieramy z accounts:lookup.
export async function signInWithCustomToken(customToken: string): Promise<FbSession> {
  log.info('auth', 'wymieniam custom token (passkey) na sesję Firebase…');
  const res = await fbFetchRetry(`${IDTK}/accounts:signInWithCustomToken?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!res.ok) {
    log.warn('auth', `signInWithCustomToken: HTTP ${res.status}`);
    await fbErr(res);
  }
  const j = (await res.json()) as any;
  let email = '';
  try {
    const lr = await logFetch('auth', `${IDTK}/accounts:lookup?key=${firebaseConfig.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: j.idToken }),
    });
    if (lr.ok) email = (((await lr.json()) as any)?.users?.[0]?.email ?? '').trim().toLowerCase();
  } catch {
    /* e-mail uzupełni verifySession / kolejne logowanie */
  }
  const sess: FbSession = {
    idToken: j.idToken,
    refreshToken: j.refreshToken,
    expiresAt: Date.now() + Number(j.expiresIn ?? 3600) * 1000,
    email,
  };
  await SecureStore.setItemAsync(K_REFRESH, sess.refreshToken);
  if (email) await SecureStore.setItemAsync(K_EMAIL, email);
  log.info('auth', `zalogowano passkeyem: ${email || '?'}`);
  return sess;
}

export async function refreshIdToken(refreshToken: string): Promise<FbSession> {
  const res = await fbFetchRetry(`${SECURE}/token?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });
  if (!res.ok) {
    log.warn('auth', `refresh: HTTP ${res.status} – wymagane ponowne logowanie`);
    await fbErr(res);
  }
  const j = (await res.json()) as any;
  const email = (await SecureStore.getItemAsync(K_EMAIL)) ?? '';
  const sess: FbSession = {
    idToken: j.id_token,
    refreshToken: j.refresh_token ?? refreshToken,
    expiresAt: Date.now() + Number(j.expires_in ?? 3600) * 1000,
    email,
  };
  await SecureStore.setItemAsync(K_REFRESH, sess.refreshToken);
  return sess;
}

// Tylko e2e (src/lib/e2eLogin.ts): zapisuje gotowy refresh token, resztę robi zwykłe useAuth.hydrate().
export async function storeSession(refreshToken: string, email: string): Promise<void> {
  await SecureStore.setItemAsync(K_REFRESH, refreshToken);
  await SecureStore.setItemAsync(K_EMAIL, email.trim().toLowerCase());
}

export async function storedRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(K_REFRESH);
}

export async function storedEmail(): Promise<string | null> {
  return SecureStore.getItemAsync(K_EMAIL);
}

export async function clearStoredAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(K_REFRESH).catch(() => {});
}
