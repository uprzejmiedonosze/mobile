import { retryTransient } from '../src/lib/retry';

const res = (status: number) => ({ status }) as Response;
const noSleep = () => Promise.resolve();

describe('retryTransient', () => {
  it('ponawia 502/503/504 i oddaje pierwszą nieprzejściową odpowiedź', async () => {
    const call = jest.fn().mockResolvedValueOnce(res(504)).mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    expect((await retryTransient(call, { sleep: noSleep })).status).toBe(200);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('po wyczerpaniu prób zwraca ostatnią odpowiedź (wołający pokaże błąd)', async () => {
    const call = jest.fn().mockResolvedValue(res(504));
    expect((await retryTransient(call, { sleep: noSleep, delays: [1, 1] })).status).toBe(504);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('nie ponawia odpowiedzi nieprzejściowych (4xx, 500)', async () => {
    for (const s of [200, 401, 403, 422, 500]) {
      const call = jest.fn().mockResolvedValue(res(s));
      expect((await retryTransient(call, { sleep: noSleep })).status).toBe(s);
      expect(call).toHaveBeenCalledTimes(1);
    }
  });

  it('ponawia tylko wskazane wyjątki', async () => {
    const offline = new TypeError('Network request failed');
    const call = jest.fn().mockRejectedValueOnce(offline).mockResolvedValueOnce(res(200));
    expect((await retryTransient(call, { sleep: noSleep, isTransientError: (e) => e instanceof TypeError })).status).toBe(200);

    const boom = jest.fn().mockRejectedValue(new Error('inny'));
    await expect(retryTransient(boom, { sleep: noSleep, isTransientError: (e) => e instanceof TypeError })).rejects.toThrow('inny');
    expect(boom).toHaveBeenCalledTimes(1);

    const always = jest.fn().mockRejectedValue(offline);
    await expect(retryTransient(always, { sleep: noSleep, isTransientError: () => true })).rejects.toBe(offline);
    expect(always).toHaveBeenCalledTimes(3);
  });
});
