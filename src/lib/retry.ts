// Ponawianie przejściowych błędów: 502/503/504 z bramki/proxy i zerwane połączenie. Tylko dla żądań, które można
// bezpiecznie powtórzyć (GET, wymiana tokenów) – POST tworzący zgłoszenie albo wysyłający mail mógł się już wykonać.
export const TRANSIENT_STATUSES = [502, 503, 504];
const RETRY_DELAYS_MS = [500, 1500];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function retryTransient(
  call: () => Promise<Response>,
  opts: { isTransientError?: (e: unknown) => boolean; delays?: number[]; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Response> {
  const { isTransientError = () => false, delays = RETRY_DELAYS_MS, sleep = wait } = opts;
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= delays.length;
    try {
      const res = await call();
      if (last || !TRANSIENT_STATUSES.includes(res.status)) return res;
    } catch (e) {
      if (last || !isTransientError(e)) throw e;
    }
    await sleep(delays[attempt]);
  }
}
