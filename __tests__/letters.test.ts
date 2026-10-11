// udApi ciągnie natywne moduły (SecureStore, config) – prawdziwe zostają tylko ApiError/apiJson, authFetch podmieniamy.
jest.mock('../src/api/firebaseAuth', () => ({ refreshIdToken: jest.fn() }));
jest.mock('../src/store/useAuth', () => ({ useAuth: { getState: jest.fn() } }));
jest.mock('../src/store/useAppUpdate', () => ({ useAppUpdate: { getState: jest.fn() } }));
jest.mock('../src/lib/appVersion', () => ({ clientHeaders: () => ({}) }));
jest.mock('../src/lib/log', () => ({ log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }, logFetch: jest.fn() }));
jest.mock('../src/config', () => ({ udConfig: { base: 'http://x' } }));
jest.mock('../src/api/udApi', () => ({ ...jest.requireActual('../src/api/udApi'), authFetch: jest.fn() }));
// Węzłowy FormData zamienia nie-Blob na tekst – toString() pozwala sprawdzić, jakie pliki poszły.
jest.mock('expo-file-system', () => ({ File: class { constructor(public uri: string) {} toString() { return `file:${this.uri}`; } } }));

import { analyzeLetter, applyLetter, type LetterAnalysis, type LetterCase, type LetterCaseResult, type LetterProposal } from '../src/api/letters';
import { authFetch, isPhotoQuotaError, UPLOAD_TIMEOUT_MS } from '../src/api/udApi';
import {
  buildApplyBody, caseSummary, LETTER_LINK_LABEL, letterEntry, describeSignals, findCandidate, hasChanges, initialDraft, initialPick, kindNotice, matchHeadline, outcomeLabel,
} from '../src/lib/letters';

const mockedAuthFetch = authFetch as jest.Mock;

const proposal = (over: Partial<LetterProposal> = {}): LetterProposal => ({
  set: { status: 'confirmed-fined', externalId: 'RSOW 201/26' },
  append: { privateComment: '[Pismo z 15.09.2026] mandat' },
  statusBlocked: null,
  conflicts: [],
  noop: false,
  ...over,
});

const theCase = (over: Partial<LetterCase> = {}): LetterCase => ({
  ids: { udNumber: null, rsow: '201/26', ersow: null, ldz: null, caseMark: null, mandateNo: null },
  plate: 'XO8T372', vehicleMake: null, date: '2026-03-06', time: '08:10',
  address: { street: 'Przełajowa', number: '14', city: 'Poznań' },
  outcome: 'fined', reason: null, articles: [], confidence: 0.9,
  ...over,
});

const result = (level: 'match' | 'candidates' | 'none', over: Partial<LetterCaseResult> = {}): LetterCaseResult => ({
  index: 0,
  case: theCase(),
  match: { level, appId: level === 'match' ? 'a1' : null },
  candidates: [{ appId: 'a1', number: 'UD/5/1', plate: 'XO8T372', date: '2026-03-06T08:10:00', address: 'Przełajowa 14, Poznań', status: 'confirmed-waiting', externalId: '', score: 100, signals: { plate: 'exact' }, proposal: proposal() }],
  ...over,
});

describe('api/letters (klient REST)', () => {
  beforeEach(() => mockedAuthFetch.mockReset());

  it('POSTuje jedno zdjęcie jako multipart `image` z długim timeoutem i zwraca analizę', async () => {
    const analysis: LetterAnalysis = { letter: { kind: 'single', authority: 'KP I', date: '2026-09-15' }, cases: [], warnings: [], usage: null };
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => analysis });

    const out = await analyzeLetter('a.jpg');

    expect(out).toEqual(analysis);
    const [path, init, opts] = mockedAuthFetch.mock.calls[0];
    expect(path).toBe('/api/rest/letters/analyze');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).getAll('image')).toEqual(['file:a.jpg']);
    expect((init.body as FormData).has('images[]')).toBe(false);
    expect(init.headers).toBeUndefined(); // Content-Type z boundary ustawia fetch
    expect(opts).toEqual({ timeoutMs: UPLOAD_TIMEOUT_MS });
  });

  it('przenosi komunikat i `quota` przy 402 (limit zdjęć)', async () => {
    const quota = { used: 50, limit: 50, remaining: 0, windowDays: 30, resetsAt: 1790000000, tier: 'free' };
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 402, json: async () => ({ error: 'Wykorzystano limit', status: 402, quota }) });
    const err: any = await analyzeLetter('a.jpg').catch((e) => e);
    expect(isPhotoQuotaError(err)).toBe(true);
    expect(err.quota).toEqual(quota);
  });

  it('502 modelu to zwykły błąd z komunikatem serwera', async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: 'Nie udało się odczytać pisma: x', status: 502 }) });
    const err: any = await analyzeLetter('a.jpg').catch((e) => e);
    expect(err.status).toBe(502);
    expect(err.message).toContain('Nie udało się odczytać pisma');
    expect(isPhotoQuotaError(err)).toBe(false);
  });

  it('applyLetter wysyła JSON na /letter/apply i zwraca zgłoszenie', async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ app: { id: 'a/1', status: 'confirmed-fined' } }) });
    const app = await applyLetter('a/1', { status: 'confirmed-fined', appendNote: 'x' });
    expect(app).toEqual({ id: 'a/1', status: 'confirmed-fined' });
    const [path, init] = mockedAuthFetch.mock.calls[0];
    expect(path).toBe('/api/rest/app/a%2F1/letter/apply');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ status: 'confirmed-fined', appendNote: 'x' });
  });

  it('applyLetter: 409 (niedozwolona zmiana statusu) niesie komunikat serwera', async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "Niedozwolona zmiana statusu z 'confirmed' na 'confirmed-fined'", status: 409 }) });
    const err: any = await applyLetter('a1', { status: 'confirmed-fined' }).catch((e) => e);
    expect(err.status).toBe(409);
    expect(err.message).toContain('Niedozwolona zmiana statusu');
  });
});

describe('wejście do skanera pism', () => {
  it('etykieta linku', () => {
    expect(LETTER_LINK_LABEL).toBe('Zeskanuj odpowiedź policji/SM');
  });

  it('osoba z odznaką PRO dostaje skaner, reszta stronę informacyjną z powodem', () => {
    expect(letterEntry(true)).toEqual({ route: 'Letter' });
    expect(letterEntry(false)).toEqual({ route: 'QuotaInfo', params: { reason: 'letters' } });
  });
});

describe('lib/letters (prezentacja wyniku)', () => {
  it('zaznacza zgłoszenie tylko przy pewnym dopasowaniu', () => {
    expect(initialPick(result('match'))).toBe('a1');
    expect(initialPick(result('candidates'))).toBeNull();
    expect(initialPick(result('none'))).toBeNull();
  });

  it('findCandidate szuka po appId', () => {
    expect(findCandidate(result('match'), 'a1')?.number).toBe('UD/5/1');
    expect(findCandidate(result('match'), 'nope')).toBeNull();
    expect(findCandidate(result('match'), null)).toBeNull();
  });

  it('domyślny szkic zaznacza to, co serwer proponuje', () => {
    expect(initialDraft(proposal())).toEqual({ useStatus: true, useExternalId: true, useNote: true, externalId: 'RSOW 201/26', note: '[Pismo z 15.09.2026] mandat' });
    const none = initialDraft(proposal({ set: { status: null, externalId: null }, append: { privateComment: null } }));
    expect(none).toEqual({ useStatus: false, useExternalId: false, useNote: false, externalId: '', note: '' });
  });

  it('buildApplyBody składa tylko zaznaczone pola, z poprawionym tekstem', () => {
    const p = proposal();
    const d = { ...initialDraft(p), externalId: '  RSOW 203/26 ', note: 'moja wersja' };
    expect(buildApplyBody(p, d, 'Mandat')).toEqual({ status: 'confirmed-fined', externalId: 'RSOW 203/26', appendNote: 'moja wersja', letterSummary: 'Mandat' });
    expect(buildApplyBody(p, { ...d, useStatus: false, useNote: false })).toEqual({ externalId: 'RSOW 203/26' });
    const empty = buildApplyBody(p, { ...d, useStatus: false, useExternalId: false, useNote: false }, 'Mandat');
    expect(empty).toEqual({});
    expect(hasChanges(empty)).toBe(false);
    expect(hasChanges({ appendNote: 'x' })).toBe(true);
  });

  it('nie wysyła pustego numeru sprawy ani pustej notatki', () => {
    const p = proposal();
    expect(buildApplyBody(p, { useStatus: false, useExternalId: true, useNote: true, externalId: '   ', note: '' })).toEqual({});
  });

  it('opisuje sygnały dopasowania po polsku', () => {
    expect(describeSignals({ plate: 'fuzzy1', date: '±1d', address: 'streetAndNumber' })).toEqual(['nr rej. z literówką', 'data (±1 dzień)', 'ulica i numer']);
    expect(describeSignals({ ud: 'exact' })).toEqual(['numer zgłoszenia UD']);
    expect(describeSignals({ plate: 'exact', uniquePlate: true })).toEqual(['nr rej.', 'jedyne zgłoszenie z tym nr rej.']);
    expect(describeSignals({})).toEqual([]);
  });

  it('streszcza sprawę z pisma, także bez roku i bez danych', () => {
    expect(caseSummary(theCase())).toBe('XO8T372 · 06.03.2026 08:10 · Przełajowa 14, Poznań');
    expect(caseSummary(theCase({ plate: null, date: '--09-16', time: null, address: { street: null, number: null, city: 'Kraków' } }))).toBe('16.09 · Kraków');
    expect(caseSummary(theCase({ plate: null, date: null, time: null, address: { street: null, number: null, city: null } }))).toBe('Brak danych identyfikujących w piśmie');
  });

  it('komunikaty o piśmie bez sprawy', () => {
    expect(kindNotice('statistical', 0)).toMatch(/statystyczne/);
    expect(kindNotice('generic', 0)).toMatch(/ogólnikow/);
    expect(kindNotice('single', 0)).toMatch(/Nie znaleziono/);
    expect(kindNotice('single', 1)).toBeNull();
    expect(kindNotice('bulk', 11)).toBeNull();
  });

  it('etykiety wyniku i dopasowania', () => {
    expect(outcomeLabel('fined')).toBe('Mandat / grzywna');
    expect(outcomeLabel('perpetrator_unknown')).toBe('Niewykrycie sprawcy');
    expect(matchHeadline('match')).toBe('Znaleziono zgłoszenie');
    expect(matchHeadline('candidates')).toBe('Wybierz właściwe zgłoszenie');
    expect(matchHeadline('none')).toBe('Nie znaleziono pasującego zgłoszenia');
  });
});
