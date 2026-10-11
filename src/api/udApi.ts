// Klient API UD z tokenem Firebase (Bearer) – ten sam mechanizm co web:
// AuthMiddleware weryfikuje Firebase ID token (RS256), endpointy /api/rest/*.
// Po zalogowaniu wołamy też POST /api/verify-token jak webowy postIdToken()
// (src/js/firebase.js) – zakłada sesję/telemetrię po stronie serwera.
import { udConfig } from '../config';
import { log, logFetch } from '../lib/log';
import { refreshIdToken } from './firebaseAuth';
import { useAuth } from '../store/useAuth';
import { useAppUpdate } from '../store/useAppUpdate';
import { clientHeaders } from '../lib/appVersion';

export async function verifySession(idToken: string): Promise<{ email?: string; name?: string } | null> {
  try {
    const res = await logFetch('auth', `${udConfig.base}/api/verify-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, ...clientHeaders() },
    });
    if (res.status === 426) await handleUpgradeRequired(res);
    if (!res.ok) {
      log.warn('auth', `verify-token: HTTP ${res.status} (non-fatal)`);
      return null;
    }
    const j = (await res.json()) as any;
    log.info('auth', `verify-token OK (${j?.user_email ?? '?'})`);
    return { email: j?.user_email, name: j?.user_name };
  } catch (e: any) {
    log.warn('auth', `verify-token: ${String(e?.message ?? e).slice(0, 150)} (non-fatal)`);
    return null;
  }
}

// Zwraca ważny ID token (odświeża gdy <60s do końca). Rzuca gdy brak sesji.
export async function validIdToken(): Promise<string> {
  const s = useAuth.getState();
  if (s.idToken && Date.now() < s.expiresAt - 60_000) return s.idToken;
  if (!s.refreshToken) throw new Error('Brak sesji – zaloguj się (Konto).');
  log.info('auth', 'odświeżam ID token…');
  const sess = await refreshIdToken(s.refreshToken);
  useAuth.getState().applySession(sess);
  return sess.idToken;
}

const DEFAULT_TIMEOUT_MS = 20_000;
// Upload zdjęć i analiza wizyjna (ALPR + LLM po stronie serwera) trwają dłużej niż zwykłe wywołanie.
export const UPLOAD_TIMEOUT_MS = 90_000;

// 426 = serwer wymaga nowszej wersji aplikacji → ekran blokujący (useAppUpdate), niezależnie od wołającego.
async function handleUpgradeRequired(res: Response): Promise<never> {
  let body: any = null;
  try { body = await res.clone().json(); } catch { /* nie-JSON */ }
  useAppUpdate.getState().require({ storeUrl: body?.storeUrl, error: body?.error });
  throw new ApiError(body?.error ? String(body.error) : 'Wymagana aktualizacja aplikacji.', 426);
}

// Jedno wywołanie z timeoutem (łączy się z init.signal wołającego) i czytelnymi błędami sieci.
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const outer = init.signal;
  const onOuterAbort = () => ctrl.abort();
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener('abort', onOuterAbort);
  }
  let timedOut = false;
  const t = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  try {
    return await logFetch('api', url, { ...init, signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      if (timedOut) throw new ApiError('Serwer nie odpowiada – spróbuj ponownie.', 0);
      throw e; // anulowane przez wołającego
    }
    throw new ApiError('Brak połączenia z internetem.', 0);
  } finally {
    clearTimeout(t);
    outer?.removeEventListener('abort', onOuterAbort);
  }
}

// fetch z Bearer + nagłówek wersji klienta + timeout + jeden retry po refreshu przy 401.
export async function authFetch(path: string, init?: RequestInit, opts?: { timeoutMs?: number }): Promise<Response> {
  const token = await validIdToken();
  const url = path.startsWith('http') ? path : `${udConfig.base}${path}`;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const call = (bearer: string) =>
    fetchWithTimeout(url, { ...init, headers: { ...(init?.headers as any), ...clientHeaders(), Authorization: `Bearer ${bearer}` } }, timeoutMs);
  let res = await call(token);
  if (res.status === 401) {
    const s = useAuth.getState();
    if (!s.refreshToken) return res;
    log.info('auth', '401 – odświeżam i ponawiam raz');
    const sess = await refreshIdToken(s.refreshToken);
    useAuth.getState().applySession(sess);
    res = await call(sess.idToken);
  }
  if (res.status === 426) await handleUpgradeRequired(res);
  return res;
}

// Błąd odpowiedzi API UD: backend zwraca {error, status, field?} (JsonErrorRenderer; `field` przy 422 –
// nazwa pola formularza, którego dotyczy walidacja serwerowa).
export class ApiError extends Error {
  constructor(message: string, public status: number, public field?: string, public quota?: PhotoQuota) {
    super(message);
  }
}

// Limit unikalnych przetworzonych zdjęć (backend: store/PhotoQuota.php) – w odpowiedzi pulpitu i w błędzie 402 (`quota`).
// `limit`/`remaining` = null → bez limitu (patron 50 zł); okno kroczące `windowDays` dni, `resetsAt` = unix ts zwolnienia najstarszego miejsca.
// `tiers` = progi limitu rosnąco wg miesięcznej kwoty wsparcia w zł (pierwszy `minAmount: 0` = bez wsparcia; limit null = bez limitu) – brak u starszego backendu.
export type QuotaTier = { minAmount: number; limit: number | null };
export type PhotoQuota = { used: number; limit: number | null; remaining: number | null; windowDays: number; resetsAt: number | null; tier: string; tiers?: QuotaTier[] };

// 402 = limit zdjęć wyczerpany (komunikat serwera zawiera datę i link do Patronite).
export const isPhotoQuotaError = (e: unknown): e is ApiError => e instanceof ApiError && e.status === 402;

// res.json() albo ApiError z komunikatem serwera (zamiast ogólnego „HTTP 422”).
export async function apiJson<T>(res: Response, fallback: string): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* nie-JSON (np. HTML z proxy) */
  }
  throw new ApiError(body?.error ? String(body.error) : `${fallback} (HTTP ${res.status}).`, res.status, body?.field, body?.quota);
}
