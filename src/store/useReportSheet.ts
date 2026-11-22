import { create } from 'zustand';
import type { StatusDef, UdApp } from '../api/apps';
import type { Category } from '../types';

// Zgłoszenie otwarte w natywnym arkuszu (/app/report, formSheet) z listy Zgłoszenia. Lista wkłada tu zgłoszenie razem ze
// słownikami (statusy, kategorie) przed otwarciem arkusza – bez ponownego pobierania; arkusz zapisuje zmiany (status, numer
// sprawy, uwagi) przez `update`, a lista nasłuchuje `patched` i od razu poprawia swoją kopię.
type ReportSheet = {
  app: UdApp | null;
  statuses: Record<string, StatusDef>;
  categories: Map<number, Category>;
  patched: { id: string; patch: Partial<UdApp>; at: number } | null;
  open: (app: UdApp, statuses: Record<string, StatusDef>, categories: Map<number, Category>) => void;
  update: (id: string, patch: Partial<UdApp>) => void;
};

export const useReportSheet = create<ReportSheet>((set, get) => ({
  app: null,
  statuses: {},
  categories: new Map(),
  patched: null,
  open: (app, statuses, categories) => set({ app, statuses, categories }),
  update: (id, patch) => {
    const app = get().app;
    set({ app: app && app.id === id ? { ...app, ...patch } : app, patched: { id, patch, at: Date.now() } });
  },
}));
