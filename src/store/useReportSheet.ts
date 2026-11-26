import { create } from 'zustand';
import type { StatusDef, UdApp } from '../api/apps';
import type { Category } from '../types';

// Zgłoszenie otwarte w arkuszu (ekran Report) z listy Zgłoszenia. Lista wkłada tu zgłoszenie razem ze słownikami przed
// otwarciem – bez ponownego pobierania; arkusz zgłasza zmiany (status, numer sprawy, uwagi) przez `update`, a lista
// subskrybuje `patched` i od razu poprawia swoją kopię.
// `keepList`: po zwykłym zamknięciu arkusza lista nie przeładowuje się (zostaje doładowanie i miejsce przewinięcia);
// po wyjściu z arkusza na inny ekran (`leave`) powrót odświeża ją jak dotąd.
type ReportSheet = {
  app: UdApp | null;
  statuses: Record<string, StatusDef>;
  categories: Map<number, Category>;
  patched: { id: string; patch: Partial<UdApp> } | null;
  keepList: boolean;
  open: (app: UdApp, statuses: Record<string, StatusDef>, categories: Map<number, Category>) => void;
  update: (id: string, patch: Partial<UdApp>) => void;
  leave: () => void;
};

export const useReportSheet = create<ReportSheet>((set, get) => ({
  app: null,
  statuses: {},
  categories: new Map(),
  patched: null,
  keepList: false,
  open: (app, statuses, categories) => set({ app, statuses, categories, keepList: true }),
  update: (id, patch) => {
    const app = get().app;
    set({ app: app && app.id === id ? { ...app, ...patch } : app, patched: { id, patch } });
  },
  leave: () => set({ keepList: false }),
}));
