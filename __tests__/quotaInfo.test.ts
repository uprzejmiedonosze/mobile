import type { PhotoQuota } from '../src/api/udApi';
import { BENEFITS, ctaLabel, currentMinAmount, FALLBACK_TIERS, INTRO, LETTERS_NOTICE, limitText, PATRONITE_URL, tierLabel, tierRows, usageLine } from '../src/lib/quotaInfo';

const TIERS = [{ minAmount: 0, limit: 50 }, { minAmount: 10, limit: 100 }, { minAmount: 25, limit: 300 }, { minAmount: 50, limit: null }];
const q = (used: number, limit: number | null, tier = 'free', tiers: PhotoQuota['tiers'] = TIERS): PhotoQuota => ({
  used, limit, remaining: limit === null ? null : Math.max(0, limit - used), windowDays: 30, resetsAt: null, tier, tiers,
});

describe('quotaInfo – tabela progów', () => {
  it('etykiety i limity po polsku', () => {
    expect(tierLabel(0)).toBe('Bez wsparcia');
    expect(tierLabel(10)).toBe('od 10 zł miesięcznie');
    expect(limitText(100)).toBe('100 zdjęć');
    expect(limitText(null)).toBe('bez limitu');
  });

  it('wiersze pochodzą z backendu i zaznaczają obecny próg', () => {
    const rows = tierRows(q(10, 300, 'patron-25'));
    expect(rows.map((r) => [r.label, r.limitText])).toEqual([
      ['Bez wsparcia', '50 zdjęć'], ['od 10 zł miesięcznie', '100 zdjęć'], ['od 25 zł miesięcznie', '300 zdjęć'], ['od 50 zł miesięcznie', 'bez limitu'],
    ]);
    expect(rows.map((r) => r.current)).toEqual([false, false, true, false]);
  });

  it('zmiana progów po stronie serwera od razu zmienia tabelę (bez poprawek w aplikacji)', () => {
    const rows = tierRows(q(1, 200, 'patron-5', [{ minAmount: 0, limit: 20 }, { minAmount: 5, limit: 200 }]));
    expect(rows.map((r) => r.label)).toEqual(['Bez wsparcia', 'od 5 zł miesięcznie']);
    expect(rows[1].current).toBe(true);
  });

  it('bez wsparcia i wsparcie poniżej najniższego progu → wiersz „Bez wsparcia”', () => {
    expect(tierRows(q(1, 50, 'free'))[0].current).toBe(true);
    expect(tierRows(q(1, 50, 'patron-below-min'))[0].current).toBe(true);
    expect(tierRows(q(1, 50, 'free')).filter((r) => r.current)).toHaveLength(1);
  });

  it('patron z najwyższego progu: „bez limitu” jest zaznaczone', () => {
    const rows = tierRows(q(900, null, 'patron-50'));
    expect(rows[3]).toMatchObject({ limitText: 'bez limitu', current: true });
  });

  it('starszy backend bez `tiers` albo limit jeszcze niewczytany → awaryjna tabela, nic nie jest zaznaczone bez znanego progu', () => {
    expect(tierRows(q(1, 50, 'free', undefined)).map((r) => r.limitText)).toEqual(FALLBACK_TIERS.map((t) => limitText(t.limit)));
    const none = tierRows(null);
    expect(none).toHaveLength(FALLBACK_TIERS.length);
    expect(none.some((r) => r.current)).toBe(false);
  });

  it('currentMinAmount rozpoznaje format `tier` z backendu', () => {
    expect(currentMinAmount('free')).toBe(0);
    expect(currentMinAmount('patron-below-min')).toBe(0);
    expect(currentMinAmount('patron-25')).toBe(25);
    expect(currentMinAmount('coś-innego')).toBeNull();
    expect(currentMinAmount(undefined)).toBeNull();
  });
});

describe('quotaInfo – zużycie i CTA', () => {
  it('opis zużycia', () => {
    expect(usageLine(q(38, 50))).toBe('Zużyto 38 z 50 zdjęć w ostatnich 30 dniach.');
    expect(usageLine(q(900, null, 'patron-50'))).toContain('bez limitu');
    expect(usageLine(null)).toBeNull();
  });

  it('CTA: patron od 10 zł podnosi próg, reszta zostaje patronem', () => {
    expect(ctaLabel(q(1, 100, 'patron-10'), 'Patronem')).toBe('Podnieś swój próg wsparcia na Patronite');
    expect(ctaLabel(q(1, 50, 'free'), 'Patronką(em)')).toBe('Zostań Patronką(em) na Patronite');
    expect(ctaLabel(q(1, 50, 'patron-below-min'), 'Patronem')).toBe('Zostań Patronem na Patronite');
    expect(ctaLabel(null, 'Patronem')).toBe('Zostań Patronem na Patronite');
  });

  it('CTA prowadzi na profil na Patronite, a treść opisuje model aplikacji i korzyści', () => {
    expect(PATRONITE_URL).toBe('https://patronite.pl/uprzejmiedonosze');
    expect(INTRO.join(' ')).toMatch(/strona zawsze była i będzie darmowa/i);
    expect(INTRO.join(' ')).toMatch(/ALPR/);
    expect(INTRO.join(' ')).toMatch(/model językowy/);
    expect(INTRO.join(' ')).toMatch(/dwa zgłoszenia/);
    expect(INTRO.join(' ')).toMatch(/policji lub straży miejskiej/);
    expect(BENEFITS.length).toBeGreaterThanOrEqual(3);
    expect(LETTERS_NOTICE).toMatch(/policji i straży miejskiej.*wspierających/);
  });
});
