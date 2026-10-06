// udApi ciągnie natywne moduły (SecureStore, config) – do testu błędu potrzebne są tylko ApiError/apiJson.
jest.mock('../src/api/firebaseAuth', () => ({ refreshIdToken: jest.fn() }));
jest.mock('../src/store/useAuth', () => ({ useAuth: { getState: jest.fn() } }));
jest.mock('../src/store/useAppUpdate', () => ({ useAppUpdate: { getState: jest.fn() } }));
jest.mock('../src/lib/appVersion', () => ({ clientHeaders: () => ({}) }));
jest.mock('../src/lib/log', () => ({ log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }, logFetch: jest.fn() }));
jest.mock('../src/config', () => ({ udConfig: { base: 'http://x' } }));

import { ApiError, apiJson, isPhotoQuotaError } from '../src/api/udApi';

const quota = { used: 50, limit: 50, remaining: 0, windowDays: 30, resetsAt: 1790000000, tier: 'free' };

describe('limit przetworzonych zdjęć (402)', () => {
  it('apiJson przenosi komunikat serwera i `quota` do ApiError', async () => {
    const res = { ok: false, status: 402, json: async () => ({ error: 'Wykorzystano limit 50 zdjęć', status: 402, quota }) } as unknown as Response;
    const err: any = await apiJson(res, 'Nie udało się').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Wykorzystano limit 50 zdjęć');
    expect(err.quota).toEqual(quota);
    expect(isPhotoQuotaError(err)).toBe(true);
  });

  it('inne błędy to nie błąd limitu', () => {
    expect(isPhotoQuotaError(new ApiError('x', 429))).toBe(false);
    expect(isPhotoQuotaError(new Error('x'))).toBe(false);
  });
});
