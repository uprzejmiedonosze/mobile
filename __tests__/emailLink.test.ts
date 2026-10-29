import { extractOobCode, parseEmailSignInLink } from '../src/lib/emailLink';

const HOST = 'https://uprzejmiedonosze-1494607701827.firebaseapp.com';
// Postać jak w prawdziwym mailu (staging, 2026-10-25), kod zmyślony.
const ACTION = `${HOST}/__/auth/action?apiKey=AIzaKEY&mode=signIn&oobCode=CODE_123-x&continueUrl=https://staging.uprzejmiedonosze.net/login.html?next%3D%252Fapp%252Flist&lang=pl`;
const LINKS = `${HOST}/__/auth/links?link=${encodeURIComponent(ACTION)}`;

describe('extractOobCode', () => {
  it('sam kod zostaje bez zmian', () => {
    expect(extractOobCode('  CODE_123-x ')).toBe('CODE_123-x');
  });
  it('link webowy z maila', () => {
    expect(extractOobCode(ACTION)).toBe('CODE_123-x');
  });
  it('link Hostingu z zagnieżdżonym, zakodowanym linkiem', () => {
    expect(extractOobCode(LINKS)).toBe('CODE_123-x');
  });
  it('link bez kodu → pusto (a nie cały link jako kod)', () => {
    expect(extractOobCode(`${HOST}/__/auth/action?mode=signIn`)).toBe('');
  });
});

// Dokładnie jak w mailu stagingu po włączeniu linków do appki (29.10.2026): `link=` nie jest w całości zakodowany,
// tylko =/& zagnieżdżonego linku (%3D/%26). Kod zmyślony.
const REAL_LINKS = 'https://auth-staging.uprzejmiedonosze.net/__/auth/links?link=https://uprzejmiedonosze-1494607701827.firebaseapp.com/__/auth/action?apiKey%3DAIzaKEY%26mode%3DsignIn%26oobCode%3DFAKE_code-9%26continueUrl%3Dhttps://staging.uprzejmiedonosze.net/login.html?next%253D%25252Fapp%25252Flist%26lang%3Dpl';

describe('parseEmailSignInLink', () => {
  it('link z prawdziwego maila (auth-staging, częściowo zakodowany)', () => {
    expect(parseEmailSignInLink(REAL_LINKS)).toBe('FAKE_code-9');
    expect(extractOobCode(REAL_LINKS)).toBe('FAKE_code-9');
  });
  it('link Hostingu → kod', () => {
    expect(parseEmailSignInLink(LINKS)).toBe('CODE_123-x');
  });
  it('link webowy → kod', () => {
    expect(parseEmailSignInLink(ACTION)).toBe('CODE_123-x');
  });
  it('inny tryb (np. reset hasła) → null', () => {
    expect(parseEmailSignInLink(ACTION.replace('mode=signIn', 'mode=resetPassword'))).toBeNull();
  });
  it('obce linki → null', () => {
    expect(parseEmailSignInLink('udpro://e2e-login?refresh=x&email=y')).toBeNull();
    expect(parseEmailSignInLink('https://uprzejmiedonosze.net/app/list?oobCode=x&mode=signIn')).toBeNull();
    expect(parseEmailSignInLink(null)).toBeNull();
  });
});
