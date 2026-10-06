// Komunikaty o limicie przetworzonych zdjęć na ekranie nowego zgłoszenia (components/PhotoQuotaNotice.tsx).
import type { PhotoQuota } from '../api/udApi';

export const NEEDED_PHOTOS = 3; // zgłoszenie potrzebuje do 3 zdjęć – poniżej tylu zostało za mało na całe zgłoszenie
export const MORE_THRESHOLD = 0.8;

export type QuotaNotice = 'out' | 'more' | null;

// 'out'  = zostało < 3 zdjęć (0 = limit wyczerpany) → duży komunikat z opcjami
// 'more' = zużyto > 80% limitu → krótkie „Potrzebujesz więcej zdjęć?”
// null   = bez limitu (patron 50 zł) albo jeszcze spokojnie
export function quotaNotice(q: PhotoQuota | null): QuotaNotice {
  if (!q || q.limit === null || q.remaining === null) return null;
  if (q.remaining < NEEDED_PHOTOS) return 'out';
  return q.used / q.limit > MORE_THRESHOLD ? 'more' : null;
}

// Aktywny patron (od 10 zł) → „Podnieś swój próg wsparcia”; bez patronatu → „Zostań Patronem/nką”.
export const isPatronTier = (q: PhotoQuota) => q.tier.startsWith('patron-') && q.tier !== 'patron-below-min';
