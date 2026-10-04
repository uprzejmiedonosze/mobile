import { appendAutoLine, filterChips, fmtLongDate, fmtSent, fmtShortDate, plural, shortAddress, statusColor } from '../src/lib/reports';

describe('reports helpers', () => {
  it('formats dates like the web list', () => {
    expect(fmtShortDate('2026-09-10T19:43:00')).toBe('10.09.2026');
    expect(fmtLongDate('2026-09-10T19:43:00')).toBe('10.09.2026, 19:43 (czw.)');
    expect(fmtSent('2026-09-30T10:00:00')).toBe('30 września 2026 o 10:00');
    expect(fmtShortDate(undefined)).toBe('');
  });
  it('pluralizes violations', () => {
    expect(plural(1, ['wykroczeń', 'wykroczenie', 'wykroczenia'])).toBe('1 wykroczenie');
    expect(plural(2, ['wykroczeń', 'wykroczenie', 'wykroczenia'])).toBe('2 wykroczenia');
    expect(plural(5, ['wykroczeń', 'wykroczenie', 'wykroczenia'])).toBe('5 wykroczeń');
    expect(plural(12, ['wykroczeń', 'wykroczenie', 'wykroczenia'])).toBe('12 wykroczeń');
  });
  it('shortens address and maps status tone', () => {
    expect(shortAddress('Juliana Fałata 2, Szczecin')).toBe('Juliana Fałata 2');
    expect(statusColor('confirmed-fined').fill).toBe('#256EC6');
    expect(statusColor('nieznany').stroke).toBe('#A2A2A2');
  });
  it('builds filter chips only for statuses that occur', () => {
    const st = { draft: { name: 'Draft' }, confirmed: { name: 'Nowe' }, 'confirmed-fined': { name: 'Mandat' }, archived: { name: 'Archiwum' } };
    expect(filterChips(st, { draft: 3, confirmed: 2, 'confirmed-fined': '4', archived: 0, active: 6 })).toEqual([
      { key: 'confirmed', label: 'Nowe', count: 2 },
      { key: 'confirmed-fined', label: 'Mandat', count: 4 },
    ]);
  });
});

describe('appendAutoLine', () => {
  it('adds once, keeps user text, replaces the previous auto line', () => {
    expect(appendAutoLine('', 'Pojazd marki BMW 320d.')).toBe('Pojazd marki BMW 320d.');
    expect(appendAutoLine('Stoi na zieleni.', 'Pojazd marki BMW 320d.')).toBe('Stoi na zieleni.\nPojazd marki BMW 320d.');
    expect(appendAutoLine('Pojazd marki BMW 320d.', 'Pojazd marki BMW 320d.')).toBe('Pojazd marki BMW 320d.');
    expect(appendAutoLine('Stoi.\nPojazd marki BMW 320d.', 'Pojazd marki Audi A4.', 'Pojazd marki BMW 320d.')).toBe('Stoi.\nPojazd marki Audi A4.');
    expect(appendAutoLine('Stoi.\nPojazd marki BMW 320d.', null, 'Pojazd marki BMW 320d.')).toBe('Stoi.');
  });
});
