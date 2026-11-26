import { deepLinkScreen } from '../src/lib/deepLink';

describe('deepLinkScreen', () => {
  it('adresy ekranów, oba warianty schematu', () => {
    expect(deepLinkScreen('udpro:///app', true)).toBe('Dashboard');
    expect(deepLinkScreen('udpro:///app/new', true)).toBe('NewReport');
    expect(deepLinkScreen('udpro-dev:///app/list/', true)).toBe('Reports');
    expect(deepLinkScreen('udpro://app/account?x=1', true)).toBe('Account');
    expect(deepLinkScreen('udpro:///app/camera', true)).toBe('WaitingCamera');
  });
  it('poczekalnia i aparat tylko tam, gdzie są', () => {
    expect(deepLinkScreen('udpro:///app/waiting', false)).toBeNull();
    expect(deepLinkScreen('udpro:///app/camera', false)).toBeNull();
  });
  it('pomija inne linki', () => {
    for (const url of [null, 'udpro-dev://e2e-login?refresh=x', 'udpro:///page?path=@zly.example', 'udpro:///app/confirm', 'udpro:///constructor',
      'https://auth.uprzejmiedonosze.net/__/auth/links?link=x', 'exp+uprzejmie-donosze://expo-development-client']) {
      expect(deepLinkScreen(url, true)).toBeNull();
    }
  });
});
