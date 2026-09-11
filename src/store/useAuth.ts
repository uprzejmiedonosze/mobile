import { create } from 'zustand';
import { log } from '../lib/log';
import { clearStoredAuth, refreshIdToken, sendEmailLink, signInWithCode, storedEmail, storedRefreshToken } from '../api/firebaseAuth';
import { verifySession } from '../api/udApi';

type Status = 'idle' | 'link-sending' | 'link-sent' | 'verifying' | 'logged' | 'error';

type Auth = {
  status: Status;
  email: string;
  name: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  error: string | null;
  setEmail: (e: string) => void;
  requestLink: () => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  applySession: (s: { idToken: string; refreshToken: string; expiresAt: number; email: string }) => void;
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
  applySession: (s) => set({ idToken: s.idToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt, email: s.email || get().email }),
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
    set({ status: 'idle', idToken: '', refreshToken: '', expiresAt: 0, name: '', error: null });
    log.info('auth', 'wylogowano');
  },
}));
