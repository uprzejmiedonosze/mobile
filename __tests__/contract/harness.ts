// Wspólne dla testów kontraktowych: sesja testowa (e2e/session.mjs) + klient HTTP z nagłówkami appki.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Session = { env: 'local' | 'staging'; base: string; email: string; idToken: string; refreshToken: string };

export const envName = (process.env.UD_E2E_ENV === 'staging' ? 'staging' : 'local') as Session['env'];

// SCHEMA appki z src/lib/vision.ts (regex zamiast importu – plik ciągnie zależności RN).
export function appSchema(): number {
  const src = readFileSync(resolve(__dirname, '../../src/lib/vision.ts'), 'utf8');
  const m = src.match(/export const SCHEMA\s*=\s*(\d+)/);
  if (!m) throw new Error('Nie znalazłem SCHEMA w src/lib/vision.ts');
  return Number(m[1]);
}

export function mintSession(): Session {
  const out = execFileSync('node', [resolve(__dirname, '../../e2e/session.mjs'), envName], { encoding: 'utf8' });
  return JSON.parse(out);
}

export function client(s: Session) {
  const headers = (extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${s.idToken}`,
    'X-UD-Schema': String(appSchema()),
    'X-UD-Client': 'pro/contract-test (0; ios)',
    ...extra,
  });
  return {
    get: (path: string, extra?: Record<string, string>) => fetch(`${s.base}${path}`, { headers: headers(extra) }),
    post: (path: string, body?: unknown, extra?: Record<string, string>) =>
      fetch(`${s.base}${path}`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', ...extra }),
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
  };
}

export const anon = (s: Session) => ({ get: (path: string) => fetch(`${s.base}${path}`) });
