import { isExpectedError, UserError } from '../src/lib/log';

describe('isExpectedError', () => {
  it('walidacja (422), limit (402), brak sieci (0) i błędy użytkownika nie idą do Sentry', () => {
    expect(isExpectedError(new UserError('Brak zgody na galerię'))).toBe(true);
    expect(isExpectedError(Object.assign(new Error('Wybierz rodzaj wykroczenia'), { status: 422 }))).toBe(true);
    expect(isExpectedError(Object.assign(new Error('Limit zdjęć'), { status: 402 }))).toBe(true);
    expect(isExpectedError(Object.assign(new Error('Brak połączenia z internetem.'), { status: 0 }))).toBe(true);
    expect(isExpectedError(Object.assign(new Error('Nie udało się pobrać pulpitu (HTTP 403).'), { status: 403 }))).toBe(true);
    expect(isExpectedError(new Error('Google: fetch failed: java.net.ConnectException: Failed to connect to identitytoolkit.googleapis.com/172.217.119.4:443'))).toBe(true);
    expect(isExpectedError(new Error('fetch failed: UnexpectedException: The Internet connection appears to be offline. (at ExpoModulesCore/Promise.swift:56)'))).toBe(true);
    expect(isExpectedError(Object.assign(new Error('Ta wersja aplikacji jest już nieobsługiwana.'), { status: 426 }))).toBe(true);
  });

  it('pozostałe błędy są raportowane', () => {
    expect(isExpectedError(new Error('Network request failed'))).toBe(false);
    expect(isExpectedError(Object.assign(new Error('HTTP 500'), { status: 500 }))).toBe(false);
    expect(isExpectedError(null)).toBe(false);
    expect(isExpectedError('tekst')).toBe(false);
  });
});
