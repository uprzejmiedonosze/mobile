import { AI_CONSENT_VERSION, ensureAiConsent, hasAiConsent, revokeAiConsent } from '../src/lib/aiConsent';

const store = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { store.set(k, v); }),
  deleteItemAsync: jest.fn(async (k: string) => { store.delete(k); }),
}));

type Btn = { text: string; onPress?: () => void };
const alertMock = jest.fn();
jest.mock('react-native', () => ({ Alert: { alert: (...a: unknown[]) => alertMock(...a) } }));

const press = (text: string) => alertMock.mockImplementationOnce((_t: string, _m: string, buttons: Btn[]) => buttons.find((b) => b.text === text)?.onPress?.());

beforeEach(() => { store.clear(); alertMock.mockReset(); });

describe('zgoda na AI', () => {
  test('bez zgody pyta, „Zgadzam się” zapisuje zgodę i kolejne wywołania nie pytają', async () => {
    press('Zgadzam się');
    expect(await ensureAiConsent()).toBe(true);
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(await hasAiConsent()).toBe(true);
    expect(await ensureAiConsent()).toBe(true);
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  test('„Anuluj” nie zapisuje zgody i blokuje wysyłkę', async () => {
    press('Anuluj');
    expect(await ensureAiConsent()).toBe(false);
    expect(await hasAiConsent()).toBe(false);
  });

  test('cofnięcie zgody wymusza ponowne pytanie', async () => {
    store.set('udpro.aiConsent', AI_CONSENT_VERSION);
    expect(await ensureAiConsent()).toBe(true);
    await revokeAiConsent();
    press('Anuluj');
    expect(await ensureAiConsent()).toBe(false);
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  test('zgoda w starej wersji nie liczy się', async () => {
    store.set('udpro.aiConsent', '0');
    press('Zgadzam się');
    expect(await ensureAiConsent()).toBe(true);
    expect(alertMock).toHaveBeenCalledTimes(1);
  });
});
