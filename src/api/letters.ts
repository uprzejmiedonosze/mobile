// Pisma z Policji/SM (backend: src/inc/LetterProposal.php w ../uprzejmiedonosze, API.md → „Letters endpoints”).
// Klient jest cienki: serwer robi OCR, dopasowanie do zgłoszeń i propozycję edycji – tu tylko wysyłamy skan i zatwierdzamy.
// Analiza zużywa kredyty analizy zdjęć (1 na unikalną stronę), więc 402 obsługujemy jak przy zdjęciach (`isPhotoQuotaError`).
import { File } from 'expo-file-system';
import type { UdApp } from './apps';
import { apiJson, authFetch, UPLOAD_TIMEOUT_MS } from './udApi';

export type LetterOutcome =
  | 'fined' | 'instructed' | 'no_offence' | 'perpetrator_unknown' | 'dismissed_other' | 'in_progress' | 'closed_unspecified' | 'unknown';

export type LetterKind = 'single' | 'bulk' | 'statistical' | 'generic';

export type LetterIds = { udNumber: string | null; rsow: string | null; ersow: string | null; ldz: string | null; caseMark: string | null; mandateNo: string | null };

// Co serwer odczytał w piśmie. `date` = „YYYY-MM-DD” albo „--MM-DD” (rok nieznany).
export type LetterCase = {
  ids: LetterIds;
  plate: string | null;
  vehicleMake: string | null;
  date: string | null;
  time: string | null;
  address: { street: string | null; number: string | null; city: string | null };
  outcome: LetterOutcome;
  reason: string | null;
  articles: string[];
  confidence: number | null;
};

// Propozycja edycji jednego zgłoszenia; `null` w `set`/`append` = bez zmiany.
export type LetterProposal = {
  set: { status: string | null; externalId: string | null };
  append: { privateComment: string | null };
  statusBlocked: { from: string; to: string; reason: string } | null;
  conflicts: { field: 'externalId'; current: string; proposed: string }[];
  noop: boolean;
};

export type LetterCandidate = {
  appId: string;
  number: string | null;
  plate: string | null;
  date: string | null; // czas zgłoszenia „YYYY-MM-DDTHH:mm:ss”
  address: string | null;
  status: string | null;
  externalId: string | null;
  score: number; // 0–100
  signals: Record<string, string | boolean>;
  proposal: LetterProposal;
};

export type LetterMatchLevel = 'match' | 'candidates' | 'none';

export type LetterCaseResult = {
  index: number;
  case: LetterCase;
  match: { level: LetterMatchLevel; appId: string | null };
  candidates: LetterCandidate[];
};

export type LetterAnalysis = {
  letter: { kind: LetterKind; authority: string | null; date: string | null };
  cases: LetterCaseResult[];
  warnings: string[];
  usage: { prompt_tokens: number; completion_tokens: number; calls: number; cost_usd: number } | null; // null = trafienie w cache serwera (za darmo)
};

// POST /api/rest/letters/analyze – multipart `images[]` (1–4 strony). Uwaga: globalny fetch to expo/fetch (SDK 57) – plik przez `File`.
// Bez retry: błąd 4xx nic nie zmieni, a ponowna próba po 5xx/timeoucie i tak jest za darmo (serwer cache'uje wynik po sha1 stron).
export async function analyzeLetter(uris: string[]): Promise<LetterAnalysis> {
  const form = new FormData();
  for (const uri of uris) form.append('images[]', new File(uri) as unknown as Blob);
  const res = await authFetch('/api/rest/letters/analyze', { method: 'POST', body: form }, { timeoutMs: UPLOAD_TIMEOUT_MS });
  return apiJson<LetterAnalysis>(res, 'Nie udało się odczytać pisma');
}

export type LetterApplyBody = { status?: string; externalId?: string; appendNote?: string; letterSummary?: string };

// POST /api/rest/app/{id}/letter/apply – status, numer sprawy i dopisanie notatki w jednej blokadzie po stronie serwera.
// 409 = niedozwolona zmiana statusu (nic nie zapisano), 403 = cudze zgłoszenie.
export async function applyLetter(appId: string, body: LetterApplyBody): Promise<UdApp> {
  const res = await authFetch(`/api/rest/app/${encodeURIComponent(appId)}/letter/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await apiJson<{ app: UdApp }>(res, 'Nie udało się zapisać zmian');
  return j.app;
}
