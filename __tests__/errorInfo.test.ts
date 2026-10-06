import { describeError } from '../src/lib/errorInfo';

describe('describeError', () => {
  it('500 z serwera → komunikat „po naszej stronie” z kodem i bez surowego SQL-a', () => {
    const info = describeError(Object.assign(new Error('SQLSTATE[HY000]: no such table: photo_usage'), { status: 500 }));
    expect(info.kind).toBe('server');
    expect(info.code).toBe('HTTP 500');
    expect(info.title + info.message).not.toMatch(/SQLSTATE|photo_usage/);
    expect(info.detail).toMatch(/photo_usage/); // tylko do podglądu deweloperskiego
  });

  it('status 0 (timeout / brak sieci) → offline, bez kodu', () => {
    const info = describeError(Object.assign(new Error('Brak połączenia z internetem.'), { status: 0 }));
    expect(info.kind).toBe('offline');
    expect(info.code).toBeNull();
  });

  it('inne błędy → ogólny komunikat', () => {
    expect(describeError(new Error('boom')).kind).toBe('other');
    expect(describeError(Object.assign(new Error('x'), { status: 404 })).code).toBe('HTTP 404');
    expect(describeError('tekst').detail).toBe('tekst');
  });
});
