// Linki do ekranów: udpro:///app/list itd. (dev: udpro-dev) – adresy jak na webie. Obsługujemy tylko tę listę, więc
// e2e-login (e2eLogin.ts) i logowanie z maila (https, emailLinkLogin.ts) przechodzą obok. Bez React Native (testy w Node).
const SCREENS: Record<string, string> = {
  app: 'Dashboard',
  'app/new': 'NewReport',
  'app/list': 'Reports',
  'app/waiting': 'WaitingRoom',
  'app/account': 'Account',
  'app/camera': 'WaitingCamera',
};
const WAITING_ONLY = ['WaitingRoom', 'WaitingCamera'];

export function deepLinkScreen(url: string | null | undefined, waitingRoom: boolean): string | null {
  const m = url?.match(/^udpro(?:-dev)?:\/\/([^?#]*)/i);
  if (!m) return null;
  const path = m[1].replace(/^\/+|\/+$/g, '');
  if (!Object.prototype.hasOwnProperty.call(SCREENS, path)) return null;
  const screen = SCREENS[path];
  return !waitingRoom && WAITING_ONLY.includes(screen) ? null : screen;
}
