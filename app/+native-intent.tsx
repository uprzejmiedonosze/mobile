// Linki systemowe, które nie są trasami appki: logowanie z maila (https://<authDomain>/__/auth/links?link=…) i e2e
// (udpro-dev://e2e-login?…). Obsługują je nasłuchy Linking (emailLinkLogin.ts, e2eLogin.ts) – expo-router ma tylko
// nie pokazywać dla nich ekranu „nie znaleziono”, więc kierujemy go na start („/” sam przekieruje dalej).
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (/\/__\/auth\/links/.test(path) || /e2e-login/.test(path)) return '/';
  } catch {
    return '/';
  }
  return path;
}
