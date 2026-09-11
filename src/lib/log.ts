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
