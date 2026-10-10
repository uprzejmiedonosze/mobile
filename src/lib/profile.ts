// Dane konta (rejestracja i edycja) – model formularza i walidacja zgodna z backendem (User::updateUserData).
export type ProfileDraft = {
  name: string;
  address: string;
  msisdn: string;
  edelivery: string;
  shareRecydywa: boolean;
  sex: 'm' | 'f' | null; // null = jeszcze nie wybrana (rejestracja nie pyta; serwer zgaduje z imienia)
};

export const EMPTY_PROFILE: ProfileDraft = { name: '', address: '', msisdn: '', edelivery: '', shareRecydywa: true, sex: null };

// Te same reguły co User::updateUserData na backendzie (imię i nazwisko, adres z numerem), żeby błąd było widać przed wysłaniem.
const NAME_RE = /^(\S{2,5}\s)?\S{2,20}\s[\S -]{3,40}$/i;
const ADDRESS_RE = /^.{3,50}\d.{3,40}$/i;

export function profileErrors(p: ProfileDraft): { name?: string; address?: string; edelivery?: string } {
  const e: { name?: string; address?: string; edelivery?: string } = {};
  if (p.name.trim() && !NAME_RE.test(p.name.trim())) e.name = 'Podaj pełne imię i nazwisko, bez znaków specjalnych';
  if (p.address.trim() && !ADDRESS_RE.test(p.address.trim())) e.address = 'Podaj adres z ulicą, numerem mieszkania i miejscowością';
  if (p.edelivery && p.edelivery.length !== 26) e.edelivery = 'Adres e-Doręczeń ma 26 znaków';
  return e;
}

export const profileValid = (p: ProfileDraft) => !!p.name.trim() && !!p.address.trim() && Object.keys(profileErrors(p)).length === 0;
