// Czyste helpery prezentacji wyniku analizy pisma (testowalne bez RN). Logika (dopasowanie, status) jest na backendzie –
// tu tylko etykiety, wybór domyślnych pól do zatwierdzenia i złożenie body dla POST /app/{id}/letter/apply.
import type { LetterApplyBody, LetterCandidate, LetterCase, LetterCaseResult, LetterKind, LetterMatchLevel, LetterOutcome, LetterProposal } from '../api/letters';
import { fmtShortDate } from './reports';

export const LETTER_LINK_LABEL = 'Zeskanuj odpowiedź policji/SM';

// Skaner pism jest dla osób wspierających (odznaka PRO – `isPatron` z backendu, jak logo „PRO” w nagłówku); pozostałe trafiają na
// stronę „Dlaczego aplikacja ma limity?” z krótkim wyjaśnieniem (param `reason: 'letters'`).
export function letterEntry(isPatron: boolean): { route: 'Letter' | 'QuotaInfo'; params?: { reason: 'letters' } } {
  return isPatron ? { route: 'Letter' } : { route: 'QuotaInfo', params: { reason: 'letters' } };
}

export const OUTCOME_LABELS: Record<LetterOutcome, string> = {
  fined: 'Mandat / grzywna',
  instructed: 'Pouczenie',
  no_offence: 'Czyn nie zawiera znamion wykroczenia',
  perpetrator_unknown: 'Niewykrycie sprawcy',
  dismissed_other: 'Odmowa wniosku o ukaranie',
  in_progress: 'Czynności w toku',
  closed_unspecified: 'Zakończone (bez podania wyniku)',
  unknown: 'Odpowiedź organu',
};

export const outcomeLabel = (o: LetterOutcome): string => OUTCOME_LABELS[o] ?? OUTCOME_LABELS.unknown;

// Pismo bez konkretnej sprawy (statystyka, ogólnik) – nie ma czego dopasowywać.
export function kindNotice(kind: LetterKind, cases: number): string | null {
  if (kind === 'statistical') return 'To pismo zawiera zestawienie statystyczne – nie dotyczy konkretnego zgłoszenia.';
  if (kind === 'generic') return 'To pismo jest ogólnikową odpowiedzią bez wskazania konkretnej sprawy – nie da się go przypisać do zgłoszenia.';
  if (cases === 0) return 'Nie znaleziono w piśmie żadnej sprawy do przypisania.';
  return null;
}

export function matchHeadline(level: LetterMatchLevel): string {
  if (level === 'match') return 'Znaleziono zgłoszenie';
  if (level === 'candidates') return 'Wybierz właściwe zgłoszenie';
  return 'Nie znaleziono pasującego zgłoszenia';
}

// Krótkie wyjaśnienie, dlaczego serwer uznał zgłoszenie za pasujące (z `signals`).
export function describeSignals(signals: Record<string, string | boolean>): string[] {
  const out: string[] = [];
  if (signals.ud) out.push('numer zgłoszenia UD');
  if (signals.externalId) out.push('numer sprawy');
  const plate: Record<string, string> = { exact: 'nr rej.', confusable: 'nr rej. (mylone znaki)', masked: 'nr rej. (część zamazana)', fuzzy1: 'nr rej. z literówką', fuzzy2: 'nr rej. (podobny)' };
  if (typeof signals.plate === 'string' && plate[signals.plate]) out.push(plate[signals.plate]);
  const date: Record<string, string> = { exact: 'data', '±1d': 'data (±1 dzień)', '±3d': 'data (±3 dni)', swapped: 'data (dzień↔miesiąc)', sameMonth: 'ten sam miesiąc' };
  if (typeof signals.date === 'string' && date[signals.date]) out.push(date[signals.date]);
  if (signals.time) out.push('godzina');
  const addr: Record<string, string> = { street: 'ulica', streetAndNumber: 'ulica i numer', city: 'miejscowość' };
  if (typeof signals.address === 'string' && addr[signals.address]) out.push(addr[signals.address]);
  if (signals.make) out.push('marka');
  if (signals.uniquePlate) out.push('jedyne zgłoszenie z tym nr rej.');
  return out;
}

// Zgłoszenie zaznaczone na starcie: tylko przy pewnym dopasowaniu (level=match); przy kandydatach decyduje użytkownik.
export const initialPick = (r: LetterCaseResult): string | null => (r.match.level === 'match' ? r.match.appId : null);

// Opis sprawy odczytanej z pisma: „XO8T372 · 06.03.2026 08:10 · Przełajowa 14”.
export function caseSummary(c: LetterCase): string {
  const parts: string[] = [];
  if (c.plate) parts.push(c.plate);
  if (c.date) {
    const full = /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? fmtShortDate(`${c.date}T00:00:00`) : c.date.replace(/^--(\d{2})-(\d{2})$/, '$2.$1');
    parts.push(c.time ? `${full} ${c.time}` : full);
  }
  const addr = [[c.address.street, c.address.number].filter(Boolean).join(' '), c.address.city].filter(Boolean).join(', ');
  if (addr) parts.push(addr);
  return parts.join(' · ') || 'Brak danych identyfikujących w piśmie';
}

// Stan edytowalny propozycji na ekranie: co zatwierdzamy (przełączniki) i wartości, które użytkownik mógł poprawić.
export type ProposalDraft = { useStatus: boolean; useExternalId: boolean; useNote: boolean; externalId: string; note: string };

export function initialDraft(p: LetterProposal): ProposalDraft {
  return {
    useStatus: p.set.status !== null,
    useExternalId: p.set.externalId !== null,
    useNote: p.append.privateComment !== null,
    externalId: p.set.externalId ?? '',
    note: p.append.privateComment ?? '',
  };
}

// Body dla applyLetter; puste, jeśli użytkownik nic nie zaznaczył (przycisk „Zastosuj” wtedy nieaktywny).
export function buildApplyBody(p: LetterProposal, d: ProposalDraft, summary?: string): LetterApplyBody {
  const body: LetterApplyBody = {};
  if (d.useStatus && p.set.status) body.status = p.set.status;
  if (d.useExternalId && d.externalId.trim()) body.externalId = d.externalId.trim();
  if (d.useNote && d.note.trim()) body.appendNote = d.note.trim();
  if (Object.keys(body).length && summary) body.letterSummary = summary;
  return body;
}

export const hasChanges = (body: LetterApplyBody): boolean => !!(body.status || body.externalId || body.appendNote);

// Kandydat z listy po id (null, gdy zniknął).
export const findCandidate = (r: LetterCaseResult, appId: string | null): LetterCandidate | null => r.candidates.find((c) => c.appId === appId) ?? null;
