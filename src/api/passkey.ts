// Passkeye (WebAuthn) w natywnej appce – backend: PasskeyHandler (src/inc/handlers/PasskeyHandler.php), trasy REST
// bez cookie: wyzwanie wraca jako `state`, który klient odsyła do *-verify (API.md). Wszystkie dane binarne base64url.
import { udConfig } from '../config';
import { clientHeaders } from '../lib/appVersion';
import { logFetch } from '../lib/log';
import { getPasskeyLib } from '../lib/passkey';
import { ApiError, apiJson, authFetch } from './udApi';
import type { Passkey } from './user';

type Opts = { options: any; state: string };

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Logowanie jest anonimowe (bez Bearer), reszta przez authFetch.
async function anonPost<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const init = json(body);
  const res = await logFetch('auth', `${udConfig.base}${path}`, { ...init, headers: { ...(init.headers as any), ...clientHeaders() } });
  return apiJson<T>(res, fallback);
}

// Zwraca Firebase custom token (300 s) do wymiany na sesję (signInWithCustomToken).
export async function loginWithPasskey(): Promise<string> {
  const { options, state } = await anonPost<Opts>('/api/rest/passkey/login-options', {}, 'Nie udało się rozpocząć logowania passkeyem');
  const r = await getPasskeyLib().get(options);
  const out = await anonPost<{ customToken: string }>('/api/rest/passkey/login-verify', {
    state,
    id: r.id,
    clientDataJSON: r.response.clientDataJSON,
    authenticatorData: r.response.authenticatorData,
    signature: r.response.signature,
    userHandle: r.response.userHandle ?? '',
  }, 'Logowanie passkeyem nie powiodło się');
  if (!out.customToken) throw new ApiError('Logowanie passkeyem nie powiodło się', 400);
  return out.customToken;
}

export async function registerPasskey(): Promise<Passkey[]> {
  const o = await apiJson<Opts>(await authFetch('/api/rest/user/passkeys/register-options', json({})), 'Nie udało się dodać passkeya');
  const r = await getPasskeyLib().create(o.options);
  const out = await apiJson<{ passkeys: Passkey[] }>(await authFetch('/api/rest/user/passkeys/register-verify', json({
    state: o.state,
    id: r.id,
    clientDataJSON: r.response.clientDataJSON,
    attestationObject: r.response.attestationObject,
    transports: r.response.transports ?? [],
  })), 'Nie udało się dodać passkeya');
  return out.passkeys;
}
