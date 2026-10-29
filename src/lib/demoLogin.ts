import * as SecureStore from 'expo-secure-store';
import { reloadAppAsync } from 'expo';
import { anonPost } from '../api/passkey';
import { rememberEmail } from '../api/firebaseAuth';
import { ApiError } from '../api/udApi';
import { ENV_OVERRIDE_KEY, demoMode, udConfig, udEnv } from '../config';
import { clientHeaders } from './appVersion';
import { log, logFetch } from './log';

// Konto demo recenzentów sklepów – logika w backendzie (../uprzejmiedonosze: src/inc/demoLogin.php, POST /api/rest/demo-login).
// Recenzent nie odbierze maila z linkiem, a zgłoszenia z produ idą naprawdę do SM/policji, więc konto żyje tylko na stagingu:
//  1. prod rozpoznaje e-mail demo → appka zapisuje flagę (config.ts, ENV_OVERRIDE_KEY) i restartuje się na stagingu,
//  2. recenzent wpisuje kod w pole „link z maila” → staging oddaje custom token (jak passkey),
//  3. wylogowanie kasuje flagę i wraca na prod.

// Tylko build prod poza trybem demo – pytamy przed każdym wysłaniem linku, więc krótko: każdy błąd, brak sieci albo
// przekroczony czas = zwykłe logowanie linkiem (prod odpowiada {} dla e-maili spoza konta demo).
const DEMO_CHECK_TIMEOUT_MS = 4000;
export async function isDemoEmail(email: string): Promise<boolean> {
  if (udEnv !== 'prod' || !email.trim()) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DEMO_CHECK_TIMEOUT_MS);
  try {
    const res = await logFetch('auth', `${udConfig.base}/api/rest/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...clientHeaders() },
      body: JSON.stringify({ email: email.trim() }),
      signal: ctrl.signal,
    });
    if (!res.ok) return false;
    return ((await res.json()) as { env?: string }).env === 'staging';
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function enterDemo(email: string): Promise<void> {
  log.info('auth', 'konto demo – przełączam appkę na staging');
  SecureStore.setItem(ENV_OVERRIDE_KEY, 'staging');
  await rememberEmail(email);
  await reloadAppAsync('konto demo');
}

export async function demoCustomToken(email: string, code: string): Promise<string> {
  const out = await anonPost<{ customToken?: string }>('/api/rest/demo-login', { email: email.trim(), code: code.trim() }, 'Nieprawidłowy kod');
  if (!out.customToken) throw new ApiError('Nieprawidłowy kod', 403);
  return out.customToken;
}

export async function leaveDemo(): Promise<void> {
  if (!demoMode) return;
  await SecureStore.deleteItemAsync(ENV_OVERRIDE_KEY).catch(() => {});
  await reloadAppAsync('wylogowanie z konta demo');
}
