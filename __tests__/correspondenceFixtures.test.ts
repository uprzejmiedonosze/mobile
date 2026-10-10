// Spójność fixture'ów pism (tests/correspondence): skan + transkrypcja + oczekiwany wynik ekstrakcji.
import fs from 'fs';
import path from 'path';

const DIR = path.join(__dirname, '..', 'tests', 'correspondence');
const OUTCOMES = ['fined', 'instructed', 'no_offence', 'perpetrator_unknown', 'dismissed_other', 'in_progress', 'closed_unspecified', 'unknown'];
const KINDS = ['single', 'bulk', 'statistical', 'generic'];

// `tests/` jest w .gitignore (skany z danymi osobowymi są tylko lokalnie) – na świeżym checkoucie test się pomija.
const present = fs.existsSync(path.join(DIR, 'expected.json'));
const expected: Record<string, { kind: string; cases: { plate?: string | null; date?: string | null; outcome: string; ids: Record<string, string> }[] }> =
  present ? JSON.parse(fs.readFileSync(path.join(DIR, 'expected.json'), 'utf8')) : {};
const scans = present ? fs.readdirSync(DIR).filter((f) => /\.(jpe?g|png)$/i.test(f)).map((f) => f.replace(/\.[^.]+$/, '')) : [];

(present ? describe : describe.skip)('tests/correspondence', () => {
  it('każdy skan ma transkrypcję i wpis w expected.json (i odwrotnie)', () => {
    expect(scans.length).toBeGreaterThanOrEqual(18);
    for (const s of scans) {
      expect(fs.existsSync(path.join(DIR, `${s}.txt`))).toBe(true);
      expect(Object.keys(expected)).toContain(s);
    }
    for (const k of Object.keys(expected)) expect(scans).toContain(k);
  });

  it('transkrypcje nie są puste i nie zawierają znaków ucieczki po złym kodowaniu', () => {
    for (const s of scans) {
      const t = fs.readFileSync(path.join(DIR, `${s}.txt`), 'utf8');
      expect(t.trim().length).toBeGreaterThan(100);
      expect(t).not.toContain('�');
    }
  });

  it('expected.json ma poprawne kind/outcome, daty i tablice w formie kluczowej', () => {
    for (const [name, e] of Object.entries(expected)) {
      expect(KINDS).toContain(e.kind);
      if (e.kind === 'statistical' || e.kind === 'generic') expect(e.cases).toEqual([]);
      for (const c of e.cases) {
        expect(OUTCOMES).toContain(c.outcome);
        if (c.date) expect(c.date).toMatch(/^(\d{4}-\d{2}-\d{2}|--\d{2}-\d{2})$/);
        if (c.plate) expect(c.plate).toMatch(/^[A-Z0-9]{4,8}$/);
      }
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('numery RSOW/UD z expected.json występują w transkrypcji', () => {
    for (const [name, e] of Object.entries(expected)) {
      const t = fs.readFileSync(path.join(DIR, `${name}.txt`), 'utf8').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      for (const c of e.cases) {
        for (const [k, v] of Object.entries(c.ids ?? {})) {
          // numer mandatu w piśmie ma „nr” między serią a numerem („DJ nr 1234567”) – sprawdzamy sam numer
          const needle = k === 'mandateNo' ? String(v).replace(/^[A-Z]+\s*/, '') : String(v);
          expect(t).toContain(needle.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
        }
      }
    }
  });
});
