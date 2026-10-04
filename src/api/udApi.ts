// Klient API UD z tokenem Firebase (Bearer) – ten sam mechanizm co web:
// AuthMiddleware weryfikuje Firebase ID token (RS256), endpointy /api/rest/*.
// Po zalogowaniu wołamy też POST /api/verify-token jak webowy postIdToken()
// (src/js/firebase.js) – zakłada sesję/telemetrię po stronie serwera.
import { udConfig } from '../config';
import { log, logFetch } from '../lib/log';
import { refreshIdToken } from './firebaseAuth';
import { useAuth } from '../store/useAuth';

export async function verifySession(idToken: string): Promise<{ email?: string; name?: string } | null> {
  try {
    const res = await logFetch('auth', `${udConfig.base}/api/verify-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
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

// fetch z Bearer + jeden retry po refreshu przy 401.
export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await validIdToken();
  const url = path.startsWith('http') ? path : `${udConfig.base}${path}`;
  let res = await logFetch('api', url, { ...init, headers: { ...(init?.headers as any), Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    const s = useAuth.getState();
    if (!s.refreshToken) return res;
    log.info('auth', '401 – odświeżam i ponawiam raz');
    const sess = await refreshIdToken(s.refreshToken);
    useAuth.getState().applySession(sess);
    res = await logFetch('api', url, { ...init, headers: { ...(init?.headers as any), Authorization: `Bearer ${sess.idToken}` } });
  }
  return res;
}

// Błąd odpowiedzi API UD: backend zwraca {error, status, field?} (JsonErrorRenderer; `field` przy 422 –
// nazwa pola formularza, którego dotyczy walidacja serwerowa).
export class ApiError extends Error {
  constructor(message: string, public status: number, public field?: string) {
    super(message);
  }
}

// res.json() albo ApiError z komunikatem serwera (zamiast ogólnego „HTTP 422”).
export async function apiJson<T>(res: Response, fallback: string): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* nie-JSON (np. HTML z proxy) */
  }
  throw new ApiError(body?.error ? String(body.error) : `${fallback} (HTTP ${res.status}).`, res.status, body?.field);
}
