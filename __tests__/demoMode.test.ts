// Konto demo recenzentów: flaga w SecureStore przełącza build prod na staging (src/config.ts), nigdy odwrotnie.
let stored: string | null = null;
jest.mock('expo-secure-store', () => ({ getItem: () => stored }));

function loadConfig(env: string, override: string | null, base?: string) {
  stored = override;
  process.env.EXPO_PUBLIC_UD_ENV = env;
  if (base) process.env.EXPO_PUBLIC_UD_BASE = base; else delete process.env.EXPO_PUBLIC_UD_BASE;
  let cfg: typeof import('../src/config') | undefined;
  jest.isolateModules(() => { cfg = require('../src/config'); });
  return cfg!;
}

afterEach(() => { delete process.env.EXPO_PUBLIC_UD_ENV; delete process.env.EXPO_PUBLIC_UD_BASE; });

describe('tryb demo', () => {
  it('build prod z flagą działa na stagingu (backend, Firebase, Sentry)', () => {
    const c = loadConfig('prod', 'staging', 'https://uprzejmiedonosze.net');
    expect(c.demoMode).toBe(true);
    expect(c.udEnv).toBe('staging');
    expect(c.udConfig.base).toBe('https://staging.uprzejmiedonosze.net');
    expect(c.firebaseConfig.projectId).toBe('uprzejmiedonosze-1494607701827');
    expect(c.sentryConfig.environment).toBe('staging');
  });

  it('build prod bez flagi zostaje na prodzie', () => {
    const c = loadConfig('prod', null);
    expect(c.demoMode).toBe(false);
    expect(c.udConfig.base).toBe('https://uprzejmiedonosze.net');
  });

  it('flaga nie dotyczy buildu staging', () => {
    const c = loadConfig('staging', 'staging');
    expect(c.demoMode).toBe(false);
    expect(c.udEnv).toBe('staging');
  });
});
