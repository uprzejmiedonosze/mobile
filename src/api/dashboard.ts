// Dane pulpitu (web: GET /app → app.html.twig). Cały pulpit – wraz z odmianą przez płeć (rangi, odznaki,
// tekst powitalny) – składa backend: GET /api/rest/user/dashboard (dashboardData() w src/inc/API.php).
import { udConfig } from '../config';
import { log, logFetch } from '../lib/log';
import { apiJson, authFetch, type PhotoQuota } from './udApi';

export type UserStats = {
  level?: number | string;
  points?: number;
  mandates?: number;
  active?: number;
  badges?: string[];
  [status: string]: unknown; // liczniki per status, np. 'confirmed-fined'
};
export type DashLevel = { id: string; desc: string; active: boolean };
// Ranga „N z M” + ile brakuje do następnej (liczone w backendzie: dashboardData() → rank)
export type DashRank = { index: number; total: number; desc: string; points: number; next: { desc: string; points: number; missing: number } | null };
export type DashBadge = { id: string; name: string; desc: string; img: string | null; earned: boolean; former: boolean };

export type Dashboard = {
  name: string;
  stats: UserStats;
  introMsg: string; // HTML (<strong>)
  levels: DashLevel[];
  rank: DashRank;
  badges: DashBadge[];
  photoQuota?: PhotoQuota; // brak u starszego backendu
};

// Publiczny słownik z /api/rest/config/{name} (extensions, category-groups, …); {} przy błędzie.
export async function fetchConfig<T>(name: string): Promise<T> {
  try {
    const res = await logFetch('dashboard', `${udConfig.base}/api/rest/config/${name}`);
    if (res.ok) return (await res.json()) as T;
  } catch (e: any) {
    log.warn('dashboard', `config ${name}: ${String(e?.message ?? e).slice(0, 150)}`);
  }
  return {} as T;
}

export async function fetchDashboard(): Promise<Dashboard> {
  return apiJson(await authFetch('/api/rest/user/dashboard'), 'Nie udało się pobrać pulpitu');
}

export const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
export const fmtInt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
// introMsg w webie to HTML (<strong>) – w RN wystarczy tekst.
export const stripHtml = (s?: string) => (s ?? '').replace(/<[^>]+>/g, '');
