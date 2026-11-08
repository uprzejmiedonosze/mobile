// Pamięć podręczna danych potrzebnych do pokazania ekranu głównego od razu po starcie (bez czekania na backend):
// stan sesji (rejestracja, odznaka PRO) i ostatni pulpit. Po pokazaniu appka odświeża je w tle.
// Jeden plik JSON w prywatnym katalogu appki, odczyt synchroniczny (kilka KB). Wpis dotyczy konkretnego środowiska i e-maila –
// po zmianie konta albo środowiska (staging/prod) jest ignorowany, a przy wylogowaniu kasowany.
import { File, Paths } from 'expo-file-system';
import type { Dashboard } from '../api/dashboard';
import { log } from './log';

export type CachedSession = { name: string; isRegistered: boolean; isTermsConfirmed: boolean; isPatron: boolean };
export type StartupCache = { v: 1; env: string; email: string; session?: CachedSession; dashboard?: Dashboard };

const VERSION = 1;
const file = () => new File(Paths.document, 'startup-cache.json');

// Czysta funkcja (testowalna): surowy JSON → wpis dla danego środowiska i konta albo null.
export function parseCache(raw: string | null | undefined, env: string, email: string): StartupCache | null {
  if (!raw || !email) return null;
  try {
    const c = JSON.parse(raw) as StartupCache;
    if (!c || c.v !== VERSION || c.env !== env || c.email !== email.trim().toLowerCase()) return null;
    return c;
  } catch {
    return null; // uszkodzony plik = jakby go nie było
  }
}

// Środowisko i e-mail ustawia hydrate() (przed pierwszym odczytem); bez nich cache jest wyłączony.
let key: { env: string; email: string } | null = null;
let memo: StartupCache | null = null;

export function useCacheFor(env: string, email: string): void {
  const e = email.trim().toLowerCase();
  if (key?.env === env && key.email === e) return;
  key = { env, email: e };
  memo = null;
  try {
    const f = file();
    memo = f.exists ? parseCache(f.textSync(), env, e) : null;
  } catch (err: any) {
    log.warn('cache', `odczyt: ${String(err?.message ?? err).slice(0, 120)}`);
  }
}

function patch(p: Partial<Pick<StartupCache, 'session' | 'dashboard'>>): void {
  if (!key) return;
  memo = { v: VERSION, env: key.env, email: key.email, ...memo, ...p };
  try {
    file().write(JSON.stringify(memo));
  } catch (err: any) {
    log.warn('cache', `zapis: ${String(err?.message ?? err).slice(0, 120)}`);
  }
}

export const cachedSession = (): CachedSession | null => memo?.session ?? null;
export const cachedDashboard = (): Dashboard | null => memo?.dashboard ?? null;
export const saveSession = (session: CachedSession): void => patch({ session });
export const saveDashboard = (dashboard: Dashboard): void => patch({ dashboard });

export function clearCache(): void {
  key = null;
  memo = null;
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    /* brak pliku = nic do kasowania */
  }
}
