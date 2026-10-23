import { isExpectedError, UserError } from '../src/lib/log';

describe('isExpectedError', () => {
  it('walidacja (422), limit (402) i błędy użytkownika nie idą do Sentry', () => {
    expect(isExpectedError(new UserError('Brak zgody na galerię'))).toBe(true);
    expect(isExpectedError(Object.assign(new Error('Wybierz rodzaj wykroczenia'), { status: 422 }))).toBe(true);
    expect(isExpectedError(Object.assign(new Error('Limit zdjęć'), { status: 402 }))).toBe(true);
  });

  it('pozostałe błędy są raportowane', () => {
    expect(isExpectedError(new Error('Network request failed'))).toBe(false);
    expect(isExpectedError(Object.assign(new Error('HTTP 500'), { status: 500 }))).toBe(false);
    expect(isExpectedError(null)).toBe(false);
    expect(isExpectedError('tekst')).toBe(false);
  });
});
