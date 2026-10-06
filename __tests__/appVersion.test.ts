import { compareVersions } from '../src/lib/compareVersions';

describe('compareVersions', () => {
  it('równe wersje', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
  });
  it('porównuje numerycznie, nie leksykograficznie', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.9', '1.0.10')).toBeLessThan(0);
  });
  it('starsza major', () => {
    expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0);
  });
  it('śmieci traktuje jak 0', () => {
    expect(compareVersions('abc', '0.0.0')).toBe(0);
  });
});
