// Logowanie dla testów e2e (Maestro): deep link `udpro://e2e-login?refresh=<refreshToken>&email=<e-mail>`
// wpisuje sesję wygenerowaną przez e2e/session.mjs i przywraca ją zwykłym hydrate() – bez e-mail-linku i Google.
// Aktywne wyłącznie przy EXPO_PUBLIC_E2E=1 (ustawia je tylko e2e/run.sh); w buildach EAS link jest ignorowany.
import { Linking } from 'react-native';
import { e2eEnabled } from '../config';
import { storeSession } from '../api/firebaseAuth';
import { useAuth } from '../store/useAuth';
import { log } from './log';

export function parseE2eLoginUrl(url: string | null | undefined): { refresh: string; email: string } | null {
  const m = url?.match(/^[a-z][a-z0-9+.-]*:\/\/e2e-login\?(.*)$/i);
  if (!m) return null;
  const q = new URLSearchParams(m[1]);
  const refresh = q.get('refresh');
  return refresh ? { refresh, email: q.get('email') ?? '' } : null;
}

async function handle(url: string | null): Promise<void> {
  const s = parseE2eLoginUrl(url);
  if (!s) return;
  log.info('e2e', `e2e-login: ${s.email || '?'}`);
  await storeSession(s.refresh, s.email);
  await useAuth.getState().hydrate();
}

export function installE2eLogin(): () => void {
  if (!e2eEnabled) return () => {};
  Linking.getInitialURL().then(handle).catch(() => {});
  const sub = Linking.addEventListener('url', (e) => void handle(e.url));
  return () => sub.remove();
}
