import { Platform } from 'react-native';
import { create } from 'zustand';
import { parseEmailSignInLink } from '../lib/emailLink';
import { log } from '../lib/log';
import { useNewReport } from './useNewReport';
import {
  clearStoredAuth,
  refreshIdToken,
  sendEmailLink,
  signInWithCode,
  signInWithCustomToken,
  signInWithGoogleIdToken,
  storedEmail,
  storedRefreshToken,
} from '../api/firebaseAuth';
import { authFetch, verifySession } from '../api/udApi';
import { demoMode, googleConfig } from '../config';
import { demoCustomToken, enterDemo, isDemoEmail, leaveDemo } from '../lib/demoLogin';
import { loginWithPasskey } from '../api/passkey';
import { isPasskeyCancelled } from '../lib/passkey';

// UWAGA: @react-native-google-signin/google-signin czyta natywny moduł (TurboModuleRegistry)
// już na poziomie SWOJEGO pliku, w chwili gdy JS go require'uje – nie dopiero przy wywołaniu
// .configure(). Statyczny `import ... from '@react-native-google-signin/google-signin'` u góry
// pliku jest więc hoistowany i wykonuje się ZANIM zdąży zadziałać jakikolwiek nasz try/catch,
// co w Expo Go (bez custom dev clienta, ten moduł tam nie istnieje) wywalało CAŁĄ apkę na
// starcie (Invariant Violation "RNGoogleSignin could not be found"). Jedyny sposób, żeby to
// złapać: require() w try/catch (CommonJS, nie hoistowany) zamiast statycznego ES importu.
type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');
let GoogleSignin: GoogleSigninModule['GoogleSignin'] | null = null;
let statusCodes: GoogleSigninModule['statusCodes'] | null = null;
let isErrorWithCode: GoogleSigninModule['isErrorWithCode'] | null = null;
export let googleSignInReady = true;
try {
  const mod = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
  GoogleSignin = mod.GoogleSignin;
  statusCodes = mod.statusCodes;
  isErrorWithCode = mod.isErrorWithCode;
  // iOS: logowanie Google ukryte (AccountScreen, wytyczna 4.8), a bez iosClientId natywny configure() odrzuca i loguje błąd.
  if (Platform.OS !== 'ios') GoogleSignin.configure({ webClientId: googleConfig.webClientId });
} catch (e: any) {
  googleSignInReady = false;
  log.warn('auth', `Google Sign-In niedostępny (Expo Go / brak natywnego modułu) – logowanie e-mail-link działa normalnie: ${String(e?.message ?? e).slice(0, 150)}`);
}

type Status = 'idle' | 'link-sending' | 'link-sent' | 'verifying' | 'google-signing' | 'passkey-signing' | 'logged' | 'error';

type Auth = {
  status: Status;
  email: string;
  name: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  error: string | null;
  // Rejestracja UD (isRegistered/isTermsConfirmed z GET /api/rest/user/) – niezależna od
  // Firebase auth: user może być zalogowany, ale nie mieć jeszcze konta UD (świeże Google).
  registrationChecked: boolean;
  isRegistered: boolean;
  isTermsConfirmed: boolean;
  isPatron: boolean; // odznaka 'patron' ze stats z GET /api/rest/user/ (logo „PRO” w nagłówku)
  appLinkSent: boolean; // ostatni mail ma link otwierający appkę (inaczej link trzeba skopiować, nie klikać)
  linkCode: string; // kod z klikniętego linku, gdy nie wiadomo, na jaki e-mail przyszedł – trafia do pola „wklej kod”
  setEmail: (e: string) => void;
  requestLink: () => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  completeEmailLink: (url: string | null) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithPasskey: () => Promise<void>;
  applySession: (s: { idToken: string; refreshToken: string; expiresAt: number; email: string }) => void;
  checkRegistration: () => Promise<void>;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
};

let lastLinkCode = '';

export const useAuth = create<Auth>((set, get) => ({
  status: 'idle',
  email: '',
  name: '',
  idToken: '',
  refreshToken: '',
  expiresAt: 0,
  error: null,
  registrationChecked: false,
  isRegistered: false,
  isTermsConfirmed: false,
  isPatron: false,
  appLinkSent: false,
  linkCode: '',
  setEmail: (email) => set({ email }),
  requestLink: async () => {
    const { email } = get();
    set({ status: 'link-sending', error: null });
    try {
      // Konto demo: na stagingu nie wysyłamy maila (recenzent wpisuje kod), na prodzie przełączamy appkę na staging.
      if (demoMode) { set({ status: 'link-sent', appLinkSent: false }); return; }
      if (await isDemoEmail(email)) { await enterDemo(email); return; }
      const appLinkSent = await sendEmailLink(email);
      set({ status: 'link-sent', appLinkSent });
    } catch (e: any) {
      const m = e?.message ?? String(e);
      set({ status: 'error', error: m });
      log.fail('auth', e);
    }
  },
  verifyCode: async (code: string) => {
    const { email } = get();
    set({ status: 'verifying', error: null });
    try {
      const sess = demoMode ? await signInWithCustomToken(await demoCustomToken(email, code)) : await signInWithCode(email, code);
      get().applySession(sess);
      const who = await verifySession(sess.idToken);
      if (who?.name) set({ name: who.name });
      set({ status: 'logged' });
    } catch (e: any) {
      const m = e?.message ?? String(e);
      set({ status: 'error', error: m });
      log.fail('auth', e);
    }
  },
  // Link z maila otworzył appkę (App Link, lib/emailLinkLogin.ts). E-mail: wpisany w formularzu albo zapisany przy wysyłce.
  completeEmailLink: async (url) => {
    const code = parseEmailSignInLink(url);
    if (!code) return;
    const { status } = get();
    if (status === 'logged' || status === 'verifying' || status === 'google-signing' || status === 'passkey-signing') return;
    // getInitialURL potrafi oddać ten sam link po przeładowaniu JS – drugi raz kod byłby już zużyty („link wygasł”).
    if (code === lastLinkCode) return;
    lastLinkCode = code;
    const email = get().email || ((await storedEmail()) ?? '');
    if (!email) {
      set({ status: 'error', linkCode: code, error: 'Wpisz e-mail, na który przyszedł link, i dotknij „Zaloguj”.' });
      return;
    }
    log.info('auth', 'logowanie linkiem z maila');
    set({ email, linkCode: '' });
    await get().verifyCode(code);
    if (get().status === 'error') lastLinkCode = ''; // np. brak sieci – ponowny klik w ten sam link ma zadziałać
  },
  signInWithGoogle: async () => {
    if (!googleSignInReady) {
      set({ status: 'error', error: 'Google Sign-In niedostępny w Expo Go – zaloguj się linkiem e-mail albo użyj dev clienta.' });
      return;
    }
    set({ status: 'google-signing', error: null });
    try {
      await GoogleSignin!.hasPlayServices();
      const res = await GoogleSignin!.signIn();
      if (res.type !== 'success') {
        set({ status: 'idle' }); // anulowane przez usera – nie traktujemy jak błąd
        return;
      }
      const googleIdToken = res.data.idToken;
      if (!googleIdToken) throw new Error('Google nie zwróciło idToken (sprawdź webClientId).');
      const sess = await signInWithGoogleIdToken(googleIdToken);
      get().applySession(sess);
      const who = await verifySession(sess.idToken);
      // who?.name = user_name z UD (puste dla świeżego konta); res.data.user.name = z Google.
      if (who?.name) set({ name: who.name });
      else if (res.data.user.name) set({ name: res.data.user.name });
      set({ status: 'logged' });
    } catch (e: any) {
      if (isErrorWithCode!(e) && e.code === statusCodes!.SIGN_IN_CANCELLED) {
        set({ status: 'idle' });
        return;
      }
      const m = e?.message ?? String(e);
      set({ status: 'error', error: m });
      log.error('auth', `Google: ${m}`);
    }
  },
  signInWithPasskey: async () => {
    set({ status: 'passkey-signing', error: null });
    try {
      const sess = await signInWithCustomToken(await loginWithPasskey());
      get().applySession(sess);
      const who = await verifySession(sess.idToken);
      if (who?.name) set({ name: who.name });
      if (who?.email && !get().email) set({ email: who.email });
      set({ status: 'logged' });
    } catch (e: any) {
      if (isPasskeyCancelled(e)) {
        set({ status: 'idle' }); // anulowane przez usera – nie traktujemy jak błąd
        return;
      }
      const m = e?.message ?? String(e);
      set({ status: 'error', error: m });
      log.error('auth', `Passkey: ${m}`);
    }
  },
  applySession: (s) => set({ idToken: s.idToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt, email: s.email || get().email }),
  checkRegistration: async () => {
    try {
      const res = await authFetch('/api/rest/user/');
      if (res.status === 404) {
        set({ registrationChecked: true, isRegistered: false, isTermsConfirmed: false });
        return;
      }
      if (!res.ok) {
        log.warn('auth', `checkRegistration: HTTP ${res.status}`);
        set({ registrationChecked: true, isRegistered: false, isTermsConfirmed: false });
        return;
      }
      const j = (await res.json()) as any;
      set({ registrationChecked: true, isRegistered: !!j.isRegistered, isTermsConfirmed: !!j.isTermsConfirmed, isPatron: !!j.stats?.badges?.includes('patron') });
    } catch (e: any) {
      log.warn('auth', `checkRegistration: ${String(e?.message ?? e).slice(0, 150)}`);
      set({ registrationChecked: true, isRegistered: false, isTermsConfirmed: false });
    }
  },
  hydrate: async () => {
    try {
      const [rt, em] = await Promise.all([storedRefreshToken(), storedEmail()]);
      if (!rt) {
        if (em && !get().email) set({ email: em }); // ostatni e-mail (logowania albo wysłanego linku) – podpowiedź w formularzu
        return;
      }
      const sess = await refreshIdToken(rt);
      get().applySession(sess);
      set({ status: 'logged' });
      log.info('auth', `sesja przywrócona (${sess.email})`);
    } catch (e: any) {
      log.warn('auth', `hydrate: ${String(e?.message ?? e).slice(0, 150)} – zaloguj ponownie`);
      await clearStoredAuth();
      set({ status: 'idle' });
    }
  },
  logout: async () => {
    await clearStoredAuth();
    // Szkic „Nowe” należy do wylogowanego konta – po zalogowaniu na inne serwer odrzuci każdą jego zmianę (403).
    useNewReport.getState().setDraftId(null);
    useNewReport.getState().setDone(null);
    // signOut() z Google, inaczej kolejne "Zaloguj przez Google" loguje po cichu na tym samym
    // koncie bez pokazania wyboru konta (natywny cache biblioteki, niezależny od SecureStore).
    // GoogleSignin.signOut() rzuca SYNCHRONICZNIE (nie odrzuconym promise'm), gdy natywny moduł
    // nie istnieje (Expo Go) – samo .catch() by tego nie złapało, stąd try/catch.
    if (googleSignInReady) {
      try {
        await GoogleSignin!.signOut();
      } catch {
        // non-fatal
      }
    }
    set({ status: 'idle', idToken: '', refreshToken: '', expiresAt: 0, name: '', error: null, registrationChecked: false, isRegistered: false, isTermsConfirmed: false, isPatron: false });
    log.info('auth', 'wylogowano');
    await leaveDemo(); // konto demo → z powrotem na prod (restart appki)
  },
}));
