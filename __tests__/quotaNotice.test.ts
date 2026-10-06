import type { PhotoQuota } from '../src/api/udApi';
import { isPatronTier, quotaNotice } from '../src/lib/quotaNotice';

const q = (used: number, limit: number | null, tier = 'free'): PhotoQuota => ({
  used, limit, remaining: limit === null ? null : Math.max(0, limit - used), windowDays: 30, resetsAt: null, tier,
});

describe('quotaNotice', () => {
  it('brak danych / bez limitu → nic', () => {
    expect(quotaNotice(null)).toBeNull();
    expect(quotaNotice(q(900, null, 'patron-50'))).toBeNull();
  });

  it('do 80% zużycia → nic', () => {
    expect(quotaNotice(q(0, 50))).toBeNull();
    expect(quotaNotice(q(40, 50))).toBeNull(); // dokładnie 80% to jeszcze nie „powyżej”
  });

  it('powyżej 80% (zostało >= 3) → krótkie „więcej zdjęć”', () => {
    expect(quotaNotice(q(41, 50))).toBe('more');
    expect(quotaNotice(q(47, 50))).toBe('more'); // zostały 3
  });

  it('zostało < 3 zdjęcia → duży komunikat (także przy 0)', () => {
    expect(quotaNotice(q(48, 50))).toBe('out'); // zostały 2
    expect(quotaNotice(q(49, 50))).toBe('out');
    expect(quotaNotice(q(50, 50))).toBe('out');
    expect(quotaNotice(q(300, 300, 'patron-25'))).toBe('out');
  });

  it('patron od 10 zł → „podnieś próg”, reszta → „zostań patronem”', () => {
    expect(isPatronTier(q(1, 100, 'patron-10'))).toBe(true);
    expect(isPatronTier(q(1, 300, 'patron-25'))).toBe(true);
    expect(isPatronTier(q(1, 50, 'free'))).toBe(false);
    expect(isPatronTier(q(1, 50, 'patron-below-min'))).toBe(false);
  });
});
