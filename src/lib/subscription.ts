// Subskrypcje App Store (iOS) – czyste dane, teksty i helpery (testowalne bez RN). Na iOS aplikacja nie może zachęcać
// do płatności poza App Store (wytyczne Apple 3.1.1/3.1.3), a to, co dają wpłaty spoza aplikacji, musi być dostępne też
// jako zakup w aplikacji (3.1.3(b)). Android zostaje przy Patronite (lib/quotaInfo.ts).
import type { PhotoQuota } from '../api/udApi';
import { currentMinAmount, FALLBACK_TIERS } from './quotaInfo';

// Identyfikatory produktów: te same w App Store Connect, RevenueCat i backendzie (config.php: IAP_PRODUCTS).
// `amount` = próg z `quota.tiers`; cenę pokazujemy zawsze tę ze sklepu.
export const PLANS = [
  { productId: 'net.uprzejmiedonosze.pro.sub10', amount: 10 },
  { productId: 'net.uprzejmiedonosze.pro.sub25', amount: 25 },
  { productId: 'net.uprzejmiedonosze.pro.sub50', amount: 50 },
] as const;

export const PRODUCT_IDS: string[] = PLANS.map((p) => p.productId);

export const planAmount = (productId: string | null | undefined): number => PLANS.find((p) => p.productId === productId)?.amount ?? 0;

export function planLimit(q: PhotoQuota | null, amount: number): number | null {
  const tiers = q?.tiers?.length ? q.tiers : FALLBACK_TIERS;
  const tier = tiers.find((t) => t.minAmount === amount) ?? FALLBACK_TIERS.find((t) => t.minAmount === amount);
  return tier ? tier.limit : null;
}

export function planTitle(limit: number | null, windowDays = 30): string {
  return limit === null ? 'Zdjęcia bez limitu' : `${limit} zdjęć na ${windowDays} dni`;
}

// Limit przyznany poza aplikacją jest co najmniej tak wysoki jak któryś plan – wtedy mówimy, że nie trzeba go kupować.
export function coveredOutsideApp(q: PhotoQuota | null, productId: string | null): boolean {
  const current = currentMinAmount(q?.tier) ?? 0;
  return current >= PLANS[0].amount && current > planAmount(productId);
}

// Odnośniki do płatności poza App Store – na iOS blokowane w stronach otwieranych w aplikacji (WebPageScreen).
export const isOutsidePaymentUrl = (url: string): boolean =>
  /^https?:\/\/([^/?#]+\.)?(patronite\.pl|suppi\.pl)([/?#:]|$)/i.test(url) || /\/patronite\.html([?#]|$)/i.test(url);

export const PLANS_HEADING = 'Limit rośnie z subskrypcją';
export const PLANS_INTRO = 'Wybierz miesięczną subskrypcję. Liczymy unikalne zdjęcia – to samo zdjęcie wysłane drugi raz nic nie kosztuje.';
export const LETTERS_NOTICE_STORE = 'Skanowanie odpowiedzi policji i straży miejskiej jest dostępne w każdej subskrypcji. Dlaczego?';
export const OUTSIDE_SUPPORT_NOTE = 'Wspierasz Uprzejmie Donoszę poza aplikacją? Wyższy limit włączy się automatycznie na Twoim koncie.';
export const COVERED_NOTE = 'Masz już włączony wyższy limit spoza aplikacji – nie musisz go dokupować.';
export const PATRON_BADGE_DESC = 'Odznaka przyznawana za wspieranie serwisu';

export const PLAN_BENEFITS_HEADING = 'Każda subskrypcja to';
export const PLAN_BENEFITS: string[] = [
  'wyższy limit zdjęć przetwarzanych w aplikacji,',
  'skaner odpowiedzi policji i straży miejskiej,',
  'odznaka i oznaczenie PRO,',
  'pobieranie wszystkich zgłoszeń w pliku xls i załączniki w asystencie na stronie www,',
  'utrzymanie serwisu i moje działania na rzecz zmian w przepisach o parkowaniu.',
];

// Informacje wymagane przy subskrypcjach (wytyczne 3.1.2, Schedule 2).
export const RENEWAL_TERMS =
  'Subskrypcja trwa miesiąc i odnawia się automatycznie za cenę podaną wyżej, dopóki jej nie anulujesz co najmniej 24 godziny przed końcem okresu. ' +
  'Opłata jest pobierana z Twojego konta Apple. Subskrypcją zarządzasz i anulujesz ją w ustawieniach konta App Store.';
export const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export const DELETE_ACCOUNT_NOTE = 'Skasowanie konta nie anuluje subskrypcji – anuluj ją w ustawieniach konta App Store.';
