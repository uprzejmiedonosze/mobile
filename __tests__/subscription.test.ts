import { coveredOutsideApp, isOutsidePaymentUrl, LETTERS_NOTICE_STORE, OUTSIDE_SUPPORT_NOTE, PLAN_BENEFITS, planAmount, planLimit, planTitle, PLANS, PLANS_INTRO } from '../src/lib/subscription';
import type { PhotoQuota } from '../src/api/udApi';

const q = (tier: string): PhotoQuota => ({ used: 1, limit: 50, remaining: 49, windowDays: 30, resetsAt: null, tier });

describe('subskrypcje App Store', () => {
  it('plany mają te same progi co backend', () => {
    expect(PLANS.map((p) => [planAmount(p.productId), planLimit(null, p.amount)])).toEqual([[10, 100], [25, 300], [50, null]]);
    expect(planAmount('inny')).toBe(0);
    expect(planTitle(100)).toBe('100 zdjęć na 30 dni');
    expect(planTitle(null)).toBe('Zdjęcia bez limitu');
  });

  it('limit spoza aplikacji: tylko gdy wyższy niż wykupiony plan', () => {
    expect(coveredOutsideApp(q('free'), null)).toBe(false);
    expect(coveredOutsideApp(q('patron-below-min'), null)).toBe(false);
    expect(coveredOutsideApp(q('patron-25'), null)).toBe(true);
    expect(coveredOutsideApp(q('patron-25'), 'net.uprzejmiedonosze.pro.sub25')).toBe(false);
    expect(coveredOutsideApp(q('patron-50'), 'net.uprzejmiedonosze.pro.sub10')).toBe(true);
  });

  it('rozpoznaje odnośniki do płatności poza sklepem', () => {
    for (const u of ['https://patronite.pl/uprzejmiedonosze', 'https://www.patronite.pl/post/1', 'https://suppi.pl/uprzejmiedonosze', 'https://uprzejmiedonosze.net/patronite.html?embed=1'])
      expect(isOutsidePaymentUrl(u)).toBe(true);
    for (const u of ['https://uprzejmiedonosze.net/przepisy.html', 'https://agendaparkingowa.pl/', 'https://example.com/?u=patronite.pl'])
      expect(isOutsidePaymentUrl(u)).toBe(false);
  });

  it('teksty dla iOS nie wymieniają zewnętrznych płatności', () => {
    const all = [LETTERS_NOTICE_STORE, OUTSIDE_SUPPORT_NOTE, PLANS_INTRO, ...PLAN_BENEFITS].join(' ');
    expect(all).not.toMatch(/patron|suppi|naklej|mazak/i);
  });
});
