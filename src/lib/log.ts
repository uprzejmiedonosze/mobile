// Logger: tylko konsola Metro (`npm start`). Bez UI, bez bufora w apce.
// Każdy wpis idzie przez console.* z tagiem i timestampem, więc widać go w terminalu serwera.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function stamp(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function emit(level: LogLevel, tag: string, msg: string) {
  const line = `[${stamp()}][${tag}] ${msg.slice(0, 2000)}`;
  try {
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  } catch {
    /* brak konsoli */
  }
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
  log.info(tag, `→ ${method} ${input}`);
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (e: any) {
    log.error(tag, `✗ ${method} ${input}: ${String(e?.message ?? e).slice(0, 300)}`);
    throw e;
  }
  let body = '';
  try {
    body = redact(await res.clone().text());
  } catch {
    body = '<treść nieczytelna>';
  }
  const line = `← ${res.status} ${method} ${input}: ${body}`;
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
