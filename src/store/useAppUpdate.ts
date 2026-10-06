import { create } from 'zustand';
import { udConfig } from '../config';
import { log } from '../lib/log';
import { appVersion, platform } from '../lib/appVersion';
import { compareVersions } from '../lib/compareVersions';

// Bramka wersji: 'required' = serwer wymaga nowszej aplikacji (ekran blokujący), 'soft' = jest nowsza, ale
// stara jeszcze działa. Źródła: (1) publiczny /api/config/app.json przy starcie i powrocie do apki,
// (2) odpowiedź 426 z dowolnego /api/rest/* (API zmieniło się w trakcie sesji).
// Brak sieci / błąd pobierania NIE blokuje apki (fail-open).
type Status = 'ok' | 'soft' | 'required';

type PlatformCfg = { minVersion?: string; latestVersion?: string; storeUrl?: string };

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
    set((s) => ({ status: 'required', storeUrl: info?.storeUrl || s.storeUrl, message: s.message || DEFAULT_MESSAGE })),

  check: async (force = false) => {
    const s = get();
    if (!force && Date.now() - s.lastCheck < RECHECK_MS) return;
    set({ lastCheck: Date.now() });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(`${udConfig.base}/api/config/app.json`, { signal: ctrl.signal });
      if (!res.ok) return;
      const j = (await res.json()) as Record<string, any>;
      const cfg: PlatformCfg = j?.[platform] ?? {};
      const message = typeof j?.message === 'string' && j.message ? j.message : DEFAULT_MESSAGE;
      const storeUrl = cfg.storeUrl ?? '';
      if (cfg.minVersion && compareVersions(appVersion, cfg.minVersion) < 0) {
        log.warn('update', `wymagana aktualizacja: ${appVersion} < ${cfg.minVersion}`);
        set({ status: 'required', storeUrl, message });
      } else if (cfg.latestVersion && compareVersions(appVersion, cfg.latestVersion) < 0) {
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
