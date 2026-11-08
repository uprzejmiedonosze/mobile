import { parseCache } from '../src/lib/startupCache';

jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
jest.mock('../src/lib/log', () => ({ log: { warn: jest.fn() } }));

const raw = (o: object) => JSON.stringify({ v: 1, env: 'prod', email: 'a@b.pl', session: { name: 'A', isRegistered: true, isTermsConfirmed: true, isPatron: false }, ...o });

describe('parseCache', () => {
  test('zwraca wpis dla tego samego środowiska i konta (e-mail bez rozróżniania wielkości liter)', () => {
    expect(parseCache(raw({}), 'prod', ' A@B.pl ')?.session?.name).toBe('A');
  });
  test('ignoruje inne konto, środowisko i wersję', () => {
    expect(parseCache(raw({}), 'prod', 'x@y.pl')).toBeNull();
    expect(parseCache(raw({}), 'staging', 'a@b.pl')).toBeNull();
    expect(parseCache(raw({ v: 2 }), 'prod', 'a@b.pl')).toBeNull();
  });
  test('uszkodzony lub pusty plik = brak cache', () => {
    expect(parseCache('{nie json', 'prod', 'a@b.pl')).toBeNull();
    expect(parseCache(null, 'prod', 'a@b.pl')).toBeNull();
    expect(parseCache(raw({}), 'prod', '')).toBeNull();
  });
});
