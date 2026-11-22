import type { Category } from '../types';

// Adresat narzucony przez kategorię – lustro Category::recipientPolicy() z backendu (../uprzejmiedonosze/src/inc/dataclasses/Category.php).
// Po wysłaniu backend zwraca wynik w `recipient.policy` (api/apps.ts); to jest wersja dla formularza, zanim zgłoszenie istnieje.
//  - voivodeship: `requiresVideo` (hałas, drift) – zawsze wojewódzka skrzynka „Stop agresji drogowej”, z pominięciem komisariatu;
//  - police: `stopAgresjiOnly` – Policja (najbliższy komisariat, a gdy go nie ma, skrzynka wojewódzka);
//  - sm: bez narzucenia, wybiera użytkownik. `requiresVideo` ma pierwszeństwo przed `stopAgresjiOnly`.
export type RecipientPolicy = 'sm' | 'police' | 'voivodeship';

export const recipientPolicy = (cat: Pick<Category, 'stopAgresjiOnly' | 'requiresVideo'> | null | undefined): RecipientPolicy =>
  cat?.requiresVideo ? 'voivodeship' : cat?.stopAgresjiOnly ? 'police' : 'sm';

// Kategoria wyklucza Straż Miejską (Category::forcesPolice()).
export const forcesPolice = (policy: RecipientPolicy): boolean => policy !== 'sm';

export const policyNote = (policy: RecipientPolicy): string | null =>
  policy === 'voivodeship' ? 'Ta kategoria jest zawsze zgłaszana na wojewódzką skrzynkę „Stop agresji drogowej”, a nie do komisariatu.'
    : policy === 'police' ? 'Ta kategoria jest zawsze zgłaszana na Policję.'
      : null;
