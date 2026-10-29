// Kod logowania (oobCode) z linku w mailu Firebase. Postaci, które trzeba obsłużyć:
//  - sam kod (wklejony ręcznie),
//  - link webowy  https://<projekt>.firebaseapp.com/__/auth/action?apiKey=…&mode=signIn&oobCode=…&continueUrl=…
//  - link do appki https://<authDomain>/__/auth/links?link=<link webowy z zakodowanymi =/&>
//    (Firebase Hosting; App Link otwiera nim appkę – app.config.js, sendEmailLink z androidPackageName).
// Bez `new URL()` – Hermes ma niepełne URL/URLSearchParams; wystarcza regex na kolejno dekodowanym tekście.

const MAX_DECODES = 4; // link → link=… → continueUrl=… – głębiej Firebase nie zagnieżdża

function decodeOnce(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// Kolejne warstwy linku (oryginał, raz zdekodowany, …) – parametry zagnieżdżonego linku są widoczne dopiero po dekodowaniu.
function layers(input: string): string[] {
  const out = [input];
  for (let i = 0; i < MAX_DECODES; i++) {
    const next = decodeOnce(out[out.length - 1]);
    if (next === out[out.length - 1]) break;
    out.push(next);
  }
  return out;
}

function findOobCode(input: string): string | null {
  for (const s of layers(input)) {
    const m = s.match(/[?&]oobCode=([^&#\s]+)/);
    if (m) return m[1];
  }
  return null;
}

// Pole „wklej kod”: sam kod albo dowolny link z oobCode.
export function extractOobCode(input: string): string {
  const s = input.trim();
  if (!/^https?:\/\//i.test(s) && !/[?&]oobCode=/.test(s)) return s;
  return findOobCode(s) ?? '';
}

// Link, którym system otworzył appkę: tylko logowanie e-mailem (mode=signIn), nie np. reset hasła ani deep link e2e.
export function parseEmailSignInLink(url: string | null | undefined): string | null {
  if (!url || !/^https:\/\/[^/]+\/__\/auth\/(links|action)\?/i.test(url)) return null;
  if (!layers(url).some((s) => /[?&]mode=signIn(&|#|$)/.test(s))) return null;
  return findOobCode(url);
}
