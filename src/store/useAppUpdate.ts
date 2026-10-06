import { create } from 'zustand';
import { udConfig } from '../config';
import { log } from '../lib/log';
import { appVersion, platform } from '../lib/appVersion';
import { compareVersions } from '../lib/compareVersions';

// Wymuszenie aktualizacji decyduje BACKEND: appka wysyła `X-UD-Schema` (wersja kontraktu API, lib/appVersion.ts), a serwer odpowiada
// 426, gdy jest ona niższa niż jego (kompatybilność tylko „w dół”). 'required' ustawia więc wyłącznie `require()` po 426 z
// dowolnego żądania (authFetch / verifySession – pierwsze żądanie po starcie). `check()` obsługuje tylko miękką zachętę ('soft'):
// publiczny /api/config/app.json → `latestVersion` (wersja appki) > bieżąca. Brak sieci / błąd pobierania NIE blokuje apki (fail-open).
type Status = 'ok' | 'soft' | 'required';

type PlatformCfg = { latestVersion?: string; storeUrl?: string };

type State = {
  status: Status;
  storeUrl: string;
  message: string;
  lastCheck: number;
  check: (force?: boolean) => Promise<void>;
  require: (info?: { storeUrl?: string; error?: string }) => void;
};

const RECHECK_MS = 60 * 60 * 1000;
const DEFAULT_MESSAGE = 'Ta wersja aplikacji jest już nieobsługiwana. Zaktualizuj ją, aby dalej korzystać z Uprzejmie Donoszę.';

export const useAppUpdate = create<State>((set, get) => ({
  status: 'ok',
  storeUrl: '',
  message: DEFAULT_MESSAGE,
  lastCheck: 0,

  require: (info) =>
    set((s) => ({ status: 'required', storeUrl: info?.storeUrl || s.storeUrl, message: info?.error || s.message || DEFAULT_MESSAGE })),

  check: async (force = false) => {
    const s = get();
    if (!force && Date.now() - s.lastCheck < RECHECK_MS) return;
    set({ lastCheck: Date.now() });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(`${udConfig.base}/api/config/app.json`, { signal: ctrl.signal });
      if (!res.ok) { log.warn('update', `app.json: HTTP ${res.status} – bramka wersji pominięta`); return; }
      const j = (await res.json()) as Record<string, any>;
      const cfg: PlatformCfg = j?.[platform] ?? {};
      const message = typeof j?.message === 'string' && j.message ? j.message : DEFAULT_MESSAGE;
      const storeUrl = cfg.storeUrl ?? '';
      log.info('update', `wersja appki ${appVersion} (${platform}), latest ${cfg.latestVersion ?? '—'}`);
      if (get().status === 'required') return; // blokada z 426 ma pierwszeństwo
      if (cfg.latestVersion && compareVersions(appVersion, cfg.latestVersion) < 0) {
        set({ status: 'soft', storeUrl, message });
      } else {
        set({ status: 'ok', storeUrl, message });
      }
    } catch (e: any) {
      log.debug('update', `sprawdzenie wersji pominięte: ${String(e?.message ?? e).slice(0, 100)}`);
    } finally {
      clearTimeout(t);
    }
  },
}));
