// Wymuszenie aktualizacji decyduje backend (426); check() obsługuje tylko miękką zachętę z /api/config/app.json.
jest.mock('../src/lib/appVersion', () => ({ appVersion: '1.0.0', platform: 'android' }));
jest.mock('../src/config', () => ({ udConfig: { base: 'http://x' } }));
jest.mock('../src/lib/log', () => ({ log: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() } }));

import { useAppUpdate } from '../src/store/useAppUpdate';

const serve = (body: unknown, ok = true) => { (global as any).fetch = jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 404, json: async () => body }); };
const cfg = (latestVersion: string) => ({ message: 'Zaktualizuj', android: { latestVersion, storeUrl: 'https://store' } });

describe('useAppUpdate', () => {
  beforeEach(() => useAppUpdate.setState({ status: 'ok', storeUrl: '', message: 'domyślny', lastCheck: 0 }));

  it('426 z backendu → required, ze storeUrl i komunikatem serwera', () => {
    useAppUpdate.getState().require({ storeUrl: 'https://store', error: 'Zaktualizuj aplikację' });
    const s = useAppUpdate.getState();
    expect(s.status).toBe('required');
    expect(s.storeUrl).toBe('https://store');
    expect(s.message).toBe('Zaktualizuj aplikację');
  });

  it('nowsza wersja appki w sklepie → soft (stara jeszcze działa)', async () => {
    serve(cfg('1.1.0'));
    await useAppUpdate.getState().check(true);
    expect(useAppUpdate.getState().status).toBe('soft');
  });

  it('aktualna wersja → ok; blokada z 426 nie jest nadpisywana przez check()', async () => {
    serve(cfg('1.0.0'));
    await useAppUpdate.getState().check(true);
    expect(useAppUpdate.getState().status).toBe('ok');

    useAppUpdate.getState().require({});
    await useAppUpdate.getState().check(true);
    expect(useAppUpdate.getState().status).toBe('required');
  });

  it('brak app.json (404) → fail-open', async () => {
    serve({}, false);
    await useAppUpdate.getState().check(true);
    expect(useAppUpdate.getState().status).toBe('ok');
  });
});
