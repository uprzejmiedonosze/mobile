// Kontrakt backend ↔ appka (../uprzejmiedonosze/API.md). Sprawdzamy KSZTAŁT odpowiedzi, z których appka korzysta
// (src/api/*, src/store/useAuth.ts) – nie konkretne wartości. Tylko odczyty: nic nie zakłada ani nie zmienia
// zgłoszeń, więc bezpieczne także na stagingu.
//   npm run test:contract:local     (docker: `make dev` w ../uprzejmiedonosze)
//   npm run test:contract:staging   (wymaga pliku service account, patrz e2e/session.mjs)
import { anon, appSchema, client, envName, mintSession, Session } from './harness';

let s: Session;
let api: ReturnType<typeof client>;

beforeAll(() => {
  s = mintSession();
  api = client(s);
});

describe(`kontrakt API [${envName}]`, () => {
  test('bez tokena → odrzucone (400/401/403)', async () => {
    const res = await anon(s).get('/api/rest/user/');
    expect([400, 401, 403]).toContain(res.status);
  });

  test('schemat appki jest akceptowany (brak 426)', async () => {
    const res = await api.get('/api/rest/user/');
    expect(res.status).not.toBe(426);
    expect(res.status).toBe(200);
  });

  test('schemat niższy niż backendu → 426 z danymi do ekranu „Zaktualizuj”', async () => {
    const res = await api.get('/api/rest/user/', { 'X-UD-Schema': '1' });
    expect(res.status).toBe(426);
    const j = await res.json();
    expect(typeof j.error).toBe('string');
    expect(typeof j.serverSchema).toBe('number');
    expect(j.serverSchema).toBeLessThanOrEqual(appSchema()); // kompatybilność tylko „w dół”: backend nie wyprzedza appki
  });

  test('POST /api/verify-token', async () => {
    const res = await api.post('/api/verify-token');
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(typeof j.user_email).toBe('string');
    expect(j).toHaveProperty('user_name');
  });

  test('GET /api/rest/user/ – pola używane przez checkRegistration', async () => {
    const j = await (await api.get('/api/rest/user/')).json();
    expect(typeof j.isRegistered).toBe('boolean');
    expect(typeof j.isTermsConfirmed).toBe('boolean');
    expect(j.data).toEqual(expect.objectContaining({ email: expect.any(String) }));
    if (j.stats?.badges !== undefined) expect(Array.isArray(j.stats.badges)).toBe(true); // isPatron
  });

  test('GET /api/rest/user/dashboard', async () => {
    const res = await api.get('/api/rest/user/dashboard');
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toEqual(expect.objectContaining({ name: expect.any(String), stats: expect.any(Object), introMsg: expect.any(String) }));
    expect(Array.isArray(j.levels)).toBe(true);
    expect(Array.isArray(j.badges)).toBe(true);
  });

  test('GET /api/rest/user/apps – lista zgłoszeń', async () => {
    // 'active' = domyślny filtr ekranu Zgłoszenia (bez archiwum i szkiców), patrz ReportsScreen
    const res = await api.get('/api/rest/user/apps?status=active&limit=5');
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(Array.isArray(j)).toBe(true);
    expect(j.length).toBeLessThanOrEqual(5);
    for (const a of j) {
      expect(a).toEqual(expect.objectContaining({ id: expect.anything(), status: expect.any(String) }));
      expect(a).toHaveProperty('recipient');
    }
  });

  test('GET /api/rest/config/categories', async () => {
    const res = await api.get('/api/rest/config/categories');
    expect(res.status).toBe(200);
    const j = await res.json();
    const list = Array.isArray(j) ? j : Object.values(j);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toEqual(expect.objectContaining({ title: expect.any(String), short: expect.any(String), formal: expect.any(String) }));
  });

  test('GET /api/rest/geo/{lat},{lng}/n – reverse geocode', async () => {
    const res = await api.get('/api/rest/geo/52.2297,21.0122/n');
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.address).toEqual(expect.objectContaining({ road: expect.any(String), city: expect.any(String) }));
  });

  test('GET /api/rest/geo/{lat},{lng}/m – reverse geocode MapBox (adres z numerem domu, jak web)', async () => {
    const res = await api.get('/api/rest/geo/52.2297,21.0122/m');
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.address).toEqual(expect.objectContaining({ address: expect.any(String), city: expect.any(String) }));
  });

  test('GET /api/rest/photos/quota – obiekt limitu zdjęć', async () => {
    const res = await api.get('/api/rest/photos/quota');
    expect(res.status).toBe(200);
    const j = await res.json();
    const q = j.quota ?? j;
    expect(q).toEqual(expect.objectContaining({ used: expect.any(Number), windowDays: expect.any(Number) }));
    expect(q).toHaveProperty('limit');
    expect(q).toHaveProperty('remaining');
    expect(q).toHaveProperty('tiers');
  });
});
