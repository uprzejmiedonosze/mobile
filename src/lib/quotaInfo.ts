// Treść i czyste helpery ekranu „Dlaczego aplikacja ma limity?” (screens/QuotaInfoScreen.tsx) – testowalne bez RN.
import type { PhotoQuota, QuotaTier } from '../api/udApi';
import { isPatronTier } from './quotaNotice';

export const PATRONITE_URL = 'https://patronite.pl/uprzejmiedonosze';

// Tabela progów przychodzi z backendu (`quota.tiers`, config.php: PHOTO_QUOTA_*). To tylko awaryjna kopia dla starszego backendu
// i dla ekranu otwartego, zanim wczyta się limit – przy zmianie progów po stronie serwera wystarczy, że backend ją zwraca.
export const FALLBACK_TIERS: QuotaTier[] = [
  { minAmount: 0, limit: 50 },
  { minAmount: 10, limit: 100 },
  { minAmount: 25, limit: 300 },
  { minAmount: 50, limit: null },
];
export const FALLBACK_WINDOW_DAYS = 30;

export type TierRow = { key: string; label: string; limitText: string; current: boolean };

export const limitText = (limit: number | null): string => (limit === null ? 'bez limitu' : `${limit} zdjęć`);

export const tierLabel = (minAmount: number): string => (minAmount <= 0 ? 'Bez wsparcia' : `od ${minAmount} zł miesięcznie`);

// Wiersz użytkownika: `tier` z backendu to „free”, „patron-below-min” (wspiera poniżej najniższego progu → limit jak bez wsparcia)
// albo „patron-<minAmount>”.
export function currentMinAmount(tier: string | undefined): number | null {
  if (!tier) return null;
  if (tier === 'free' || tier === 'patron-below-min') return 0;
  const m = /^patron-(\d+)$/.exec(tier);
  return m ? Number(m[1]) : null;
}

export function tierRows(quota: PhotoQuota | null): TierRow[] {
  const tiers = quota?.tiers?.length ? quota.tiers : FALLBACK_TIERS;
  const cur = currentMinAmount(quota?.tier);
  return tiers.map((t) => ({ key: String(t.minAmount), label: tierLabel(t.minAmount), limitText: limitText(t.limit), current: cur === t.minAmount }));
}

// „Zużyto 38 z 50 zdjęć w ostatnich 30 dniach” / „… bez limitu”; null, gdy limit jeszcze się nie wczytał.
export function usageLine(q: PhotoQuota | null): string | null {
  if (!q) return null;
  const days = q.windowDays || FALLBACK_WINDOW_DAYS;
  return q.limit === null
    ? `Przetworzone zdjęcia w ostatnich ${days} dniach: ${q.used} (bez limitu – dziękuję za wsparcie!).`
    : `Zużyto ${q.used} z ${q.limit} zdjęć w ostatnich ${days} dniach.`;
}

export function ctaLabel(q: PhotoQuota | null, patronem: string): string {
  return q && isPatronTier(q) ? 'Podnieś swój próg wsparcia na Patronite' : `Zostań ${patronem} na Patronite`;
}

export const HEADING = 'Dlaczego aplikacja ma limity?';

export const INTRO: string[] = [
  'Aplikacja działa inaczej niż strona www. Strona zawsze była i będzie darmowa.',
  'W aplikacji każde zdjęcie przetwarza algorytm ALPR (rozpoznawania tablic rejestracyjnych) oraz duży model językowy. Dzięki temu możesz np. utworzyć dwa zgłoszenia za jednym razem albo przeanalizować pismo od Policji lub Straży Miejskiej.',
  'W tym wariancie każde zgłoszenie kosztuje mnie realne pieniądze, dlatego – niestety – nie mogę pozwolić na nieograniczony dostęp do aplikacji.',
];

export const TIERS_HEADING = 'Limit rośnie z wsparciem';
export const TIERS_INTRO = 'Limit wyraźnie rośnie już od najniższego progu wsparcia na Patronite. Liczymy unikalne zdjęcia – to samo zdjęcie wysłane drugi raz nic nie kosztuje.';

export const SUPPORT_HEADING = 'Wsparcie to coś więcej niż większy limit';
// Skrót tego, co jest na /patronite.html (źródło treści: ../uprzejmiedonosze/src/templates/patronite.html.twig).
export const BENEFITS: string[] = [
  'Finansujesz zmiany w przepisach: Miejską Agendę Parkingową, lobbing w Sejmie, petycje i spotkania z urzędnikami, po których Uprzejmie Donoszę nie będzie potrzebne.',
  'Utrzymujesz serwis Uprzejmie Donoszę – darmowy dla wszystkich.',
  'Rozwijasz narzędzia: Ranking Straży Miejskich, generator pism do polityków i Uprzejme WIKI.',
  'Dostajesz gratisy: naklejki ROBISZ TO ŹLE i „mazaki sprawiedliwości” (wyższe progi) oraz możliwość pobrania wszystkich zgłoszeń w pliku xls.',
];
export const MORE_LINK = 'Zobacz, co robię i ile to kosztuje';
