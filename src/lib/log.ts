// Logger: tylko konsola Metro (`npm start`). Bez UI, bez bufora w apce.
// Każdy wpis idzie przez console.* z tagiem i timestampem, więc widać go w terminalu serwera.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function stamp(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

// Długie wpisy (np. pełna odpowiedź wizji) dzielimy na części zamiast ucinać — ucięcie na 2000
// znakach gubiło dane ostatnich zdjęć kandydata, a bez nich nie da się odtworzyć decyzji.
const MAX_LINE = 1800;

// W buildzie produkcyjnym nic nie idzie do konsoli poza warn/error (bez PII w logach urządzenia);
// błędy trafiają dodatkowo do zewnętrznego reportera (Sentry), zarejestrowanego w App.tsx.
const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : true;
type Reporter = (tag: string, msg: string) => void;
let reporter: Reporter | null = null;
export function setErrorReporter(r: Reporter | null) {
  reporter = r;
}

function emit(level: LogLevel, tag: string, msg: string) {
  if (!IS_DEV && (level === 'debug' || level === 'info')) return;
  if (level === 'error' && reporter) {
    try { reporter(tag, msg); } catch { /* reporter nie może wywrócić logowania */ }
  }
  const parts: string[] = [];
  for (let i = 0; i < msg.length || i === 0; i += MAX_LINE) parts.push(msg.slice(i, i + MAX_LINE));
  const ts = stamp();
  parts.forEach((part, k) => {
    const line = `[${ts}][${tag}]${parts.length > 1 ? ` (${k + 1}/${parts.length})` : ''} ${part}`;
    try {
      if (level === 'error') console.error(line);
      else if (level === 'warn') console.warn(line);
      else console.log(line);
    } catch {
      /* brak konsoli */
    }
  });
}

export const log = {
  debug: (tag: string, msg: string) => emit('debug', tag, msg),
  info: (tag: string, msg: string) => emit('info', tag, msg),
  warn: (tag: string, msg: string) => emit('warn', tag, msg),
  error: (tag: string, msg: string) => emit('error', tag, msg),
};

// Klucze, których wartości nigdy nie lądują w logu w całości (tokeny sesji) – Metro
// bywa nagrywane na ekranie/w CI, a auth endpointy (Firebase) zwracają je wprost w body.
const SECRET_KEYS = /^(idToken|refreshToken|refresh_token|id_token|access_token|oobCode)$/i;

function redact(text: string): string {
  try {
    const j = JSON.parse(text);
    const walk = (v: any): any => {
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        const out: any = {};
        for (const [k, val] of Object.entries(v)) out[k] = SECRET_KEYS.test(k) ? '<redacted>' : walk(val);
        return out;
      }
      return v;
    };
    return JSON.stringify(walk(j));
  } catch {
    return text; // nie-JSON – nic do maskowania (np. HTML błędu)
  }
}

// Owija fetch logowaniem: endpoint przed wywołaniem, status+treść odpowiedzi po (tokeny zamaskowane).
// Response zwracany jest nietknięty (log czyta klon) – wołający dalej robi res.json()/.text() jak wcześniej.
export async function logFetch(tag: string, input: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET';
  // W release logujemy tylko ścieżkę (bez query – tam bywają współrzędne/tablice) i status, nigdy treść odpowiedzi.
  const shown = IS_DEV ? input : input.split('?')[0];
  log.info(tag, `→ ${method} ${shown}`);
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (e: any) {
    log.warn(tag, `✗ ${method} ${shown}: ${String(e?.message ?? e).slice(0, 300)}`);
    throw e;
  }
  let body = '';
  if (IS_DEV) {
    try {
      body = redact(await res.clone().text());
    } catch {
      body = '<treść nieczytelna>';
    }
  }
  const line = `← ${res.status} ${method} ${shown}${IS_DEV ? `: ${body}` : ''}`;
  if (res.ok) log.info(tag, line);
  else log.warn(tag, line);
  return res;
}

let installed = false;
// Globalne haczyki żeby żaden crash nie przeszedł po cichu w terminalu.
export function installGlobalLogHandlers() {
  if (installed) return;
  installed = true;
  try {
    const EU = (global as any).ErrorUtils;
    if (EU?.setGlobalHandler) {
      const prev = EU.getGlobalHandler?.();
      EU.setGlobalHandler((error: any, isFatal?: boolean) => {
        log.error('fatal', `${isFatal ? 'FATAL ' : ''}${error?.message ?? String(error)} :: ${String(error?.stack ?? '').slice(0, 1200)}`);
        if (prev) prev(error, isFatal);
      });
    }
  } catch {
    /* brak ErrorUtils */
  }
  try {
    const g = global as any;
    if (!g.__udRejectionHook) {
      g.__udRejectionHook = true;
      const prev = g.onunhandledrejection;
      g.onunhandledrejection = (e: any) => {
        log.error('promise', `unhandled: ${e?.reason?.message ?? String(e?.reason ?? e)}`.slice(0, 1000));
        if (prev) prev(e);
      };
    }
  } catch {
    /* brak hooka */
  }
  log.info('app', 'logowanie do terminala Metro włączone');
}
