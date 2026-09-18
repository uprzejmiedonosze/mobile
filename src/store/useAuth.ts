import { create } from 'zustand';
import { GoogleSignin, statusCodes, isErrorWithCode } from '@react-native-google-signin/google-signin';
import { log } from '../lib/log';
import {
  clearStoredAuth,
  refreshIdToken,
  sendEmailLink,
  signInWithCode,
  signInWithGoogleIdToken,
  storedEmail,
  storedRefreshToken,
} from '../api/firebaseAuth';
import { authFetch, verifySession } from '../api/udApi';
import { googleConfig } from '../config';

GoogleSignin.configure({ webClientId: googleConfig.webClientId });

type Status = 'idle' | 'link-sending' | 'link-sent' | 'verifying' | 'google-signing' | 'logged' | 'error';

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
  setEmail: (e: string) => void;
  requestLink: () => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  applySession: (s: { idToken: string; refreshToken: string; expiresAt: number; email: string }) => void;
  checkRegistration: () => Promise<void>;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
};

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
  setEmail: (email) => set({ email }),
  requestLink: async () => {
    const { email } = get();
    set({ status: 'link-sending', error: null });
    try {
      await sendEmailLink(email);
      set({ status: 'link-sent' });
    } catch (e: any) {
      const m = e?.message ?? String(e);
      set({ status: 'error', error: m });
      log.error('auth', m);
    }
  },
  verifyCode: async (code: string) => {
    const { email } = get();
    set({ status: 'verifying', error: null });
    try {
      const sess = await signInWithCode(email, code);
      get().applySession(sess);
      const who = await verifySession(sess.idToken);
      if (who?.name) set({ name: who.name });
      set({ status: 'logged' });
    } catch (e: any) {
      const m = e?.message ?? String(e);
      set({ status: 'error', error: m });
      log.error('auth', m);
    }
  },
  signInWithGoogle: async () => {
    set({ status: 'google-signing', error: null });
    try {
      await GoogleSignin.hasPlayServices();
      const res = await GoogleSignin.signIn();
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
      if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) {
        set({ status: 'idle' });
        return;
      }
      const m = e?.message ?? String(e);
      set({ status: 'error', error: m });
      log.error('auth', `Google: ${m}`);
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
      set({ registrationChecked: true, isRegistered: !!j.isRegistered, isTermsConfirmed: !!j.isTermsConfirmed });
    } catch (e: any) {
      log.warn('auth', `checkRegistration: ${String(e?.message ?? e).slice(0, 150)}`);
      set({ registrationChecked: true, isRegistered: false, isTermsConfirmed: false });
    }
  },
  hydrate: async () => {
    try {
      const [rt, em] = await Promise.all([storedRefreshToken(), storedEmail()]);
      if (!rt) return;
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
    // signOut() z Google, inaczej kolejne "Zaloguj przez Google" loguje po cichu na tym samym
    // koncie bez pokazania wyboru konta (natywny cache biblioteki, niezależny od SecureStore).
    await GoogleSignin.signOut().catch(() => {});
    set({ status: 'idle', idToken: '', refreshToken: '', expiresAt: 0, name: '', error: null, registrationChecked: false, isRegistered: false, isTermsConfirmed: false });
    log.info('auth', 'wylogowano');
  },
}));
