import { applyPicked, fromIso, toIso } from '../src/lib/dateTime';

const now = new Date(2026, 9, 11, 22, 30, 0); // 11.10.2026 22:30

describe('dateTime (picker daty i godziny zgłoszenia)', () => {
  it('toIso/fromIso: czas lokalny bez strefy, okrągła podróż', () => {
    const d = new Date(2026, 8, 10, 19, 43, 12);
    expect(toIso(d)).toBe('2026-09-10T19:43:00');
    expect(fromIso('2026-09-10T19:43:00')).toEqual(new Date(2026, 8, 10, 19, 43, 0));
    expect(fromIso(toIso(d))?.getTime()).toBe(new Date(2026, 8, 10, 19, 43, 0).getTime());
    expect(toIso(new Date(2026, 0, 5, 7, 5))).toBe('2026-01-05T07:05:00'); // dopełnienie zerami
  });

  it('fromIso odrzuca śmieci i nieistniejące daty', () => {
    expect(fromIso('')).toBeNull();
    expect(fromIso(null)).toBeNull();
    expect(fromIso('wczoraj')).toBeNull();
    expect(fromIso('2026-02-31T10:00:00')).toBeNull();
    expect(fromIso('2026-09-10 19:43')).toEqual(new Date(2026, 8, 10, 19, 43)); // spacja zamiast T też działa
  });

  it('wybór daty zachowuje godzinę, wybór godziny zachowuje datę', () => {
    expect(applyPicked('2026-09-10T19:43:00', new Date(2026, 8, 12, 0, 0), 'date', now)).toBe('2026-09-12T19:43:00');
    expect(applyPicked('2026-09-10T19:43:00', new Date(2026, 0, 1, 8, 5), 'time', now)).toBe('2026-09-10T08:05:00');
  });

  it('bez poprzedniej wartości startuje od „teraz”', () => {
    expect(applyPicked('', new Date(2026, 9, 1, 0, 0), 'date', now)).toBe('2026-10-01T22:30:00');
    expect(applyPicked(null, new Date(2026, 0, 1, 6, 15), 'time', now)).toBe('2026-10-11T06:15:00');
  });

  it('nie pozwala ustawić przyszłości (przycina do „teraz”)', () => {
    expect(applyPicked('2026-10-11T08:00:00', new Date(2026, 9, 11, 23, 59), 'time', now)).toBe('2026-10-11T22:30:00');
    expect(applyPicked('2026-10-10T23:00:00', new Date(2026, 9, 12, 0, 0), 'date', now)).toBe('2026-10-11T22:30:00');
  });
});
