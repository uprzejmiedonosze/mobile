// Sesja testowa dla e2e (Maestro) i testów kontraktowych – bez logowania e-mail-link.
//   node e2e/session.mjs local|staging   → JSON {env, base, email, idToken, refreshToken, ...}
// local   = backend w dockerze (../uprzejmiedonosze, `make dev`) + Firebase Auth Emulator (:9099):
//           konto zakładane przez accounts:signUp; backend mapuje każde konto emulatora na jedną tożsamość fixture.
// staging = prawdziwy Firebase stagingu: custom token podpisany kluczem service account (plik JSON z repo backendu,
//           NIE commitowany) → signInWithCustomToken. Konto E2E_STAGING_EMAIL musi istnieć na stagingu.
// Zmienne (wszystkie opcjonalne):
//   E2E_LOCAL_BASE (http://localhost)  E2E_EMULATOR (http://127.0.0.1:9099)
//   E2E_STAGING_SA (../uprzejmiedonosze/staging.uprzejmiedonosze.net-firebase-adminsdk.json)
//   E2E_STAGING_EMAIL (e@nieradka.net)  E2E_STAGING_UID (pomija lookup po e-mailu)
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const IDTK = 'https://identitytoolkit.googleapis.com/v1';

// SYNC z src/config.ts (ENVS.staging) – web apiKey jest publiczny z natury.
const STAGING = { base: 'https://staging.uprzejmiedonosze.net', apiKey: 'AIzaSyDXgjibECwejzudsm3YBQh3O5ponz7ArtI' };

async function post(url, body, what) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const b64u = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
function signJwt(sa, payload) {
  const input = `${b64u({ alg: 'RS256', typ: 'JWT' })}.${b64u(payload)}`;
  return `${input}.${createSign('RSA-SHA256').update(input).sign(sa.private_key, 'base64url')}`;
}

async function local() {
  const base = (process.env.E2E_LOCAL_BASE || 'http://localhost').replace(/\/$/, '');
  const emu = (process.env.E2E_EMULATOR || 'http://127.0.0.1:9099').replace(/\/$/, '');
  const email = `e2e-${Date.now()}@example.com`;
  const j = await post(`${emu}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=e2e`, { email, password: 'e2e-password', returnSecureToken: true }, 'emulator signUp (czy działa `make dev`?)');
  return { env: 'local', base, emulator: emu, email, idToken: j.idToken, refreshToken: j.refreshToken };
}

async function staging() {
  const saPath = resolve(process.env.E2E_STAGING_SA || resolve(here, '../../uprzejmiedonosze/staging.uprzejmiedonosze.net-firebase-adminsdk.json'));
  const sa = JSON.parse(readFileSync(saPath, 'utf8'));
  const email = (process.env.E2E_STAGING_EMAIL || 'e@nieradka.net').toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  let uid = process.env.E2E_STAGING_UID;
  if (!uid) {
    const oauth = await post('https://oauth2.googleapis.com/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signJwt(sa, { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }),
    }, 'OAuth service account');
    const res = await fetch(`${IDTK}/projects/${sa.project_id}/accounts:lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oauth.access_token}` },
      body: JSON.stringify({ email: [email] }),
    });
    uid = (await res.json())?.users?.[0]?.localId;
    if (!uid) throw new Error(`Na stagingu nie ma konta ${email} – załóż je (zaloguj się raz w web stagingu) albo ustaw E2E_STAGING_EMAIL/E2E_STAGING_UID.`);
  }
  const customToken = signJwt(sa, {
    iss: sa.client_email, sub: sa.client_email, uid, iat: now, exp: now + 3600,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
  });
  const j = await post(`${IDTK}/accounts:signInWithCustomToken?key=${STAGING.apiKey}`, { token: customToken, returnSecureToken: true }, 'signInWithCustomToken');
  return { env: 'staging', base: STAGING.base, email, idToken: j.idToken, refreshToken: j.refreshToken };
}

export async function mintSession(env) {
  if (env === 'local') return local();
  if (env === 'staging') return staging();
  throw new Error(`Nieznane środowisko "${env}" (local|staging)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  mintSession(process.argv[2]).then((s) => console.log(JSON.stringify(s)), (e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
