jest.mock('expo-secure-store', () => ({ getItem: () => null })); // config.ts czyta flagę konta demo
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { passkeysAllowed, isPasskeyCancelled, webAuthnRequest } from '../src/lib/passkey';

describe('passkeysAllowed', () => {
  it('włączone tylko na prod z natywnym modułem', () => {
    expect(passkeysAllowed('prod', true)).toBe(true);
    expect(passkeysAllowed('prod', false)).toBe(false);
    expect(passkeysAllowed('staging', true)).toBe(false);
  });

});

describe('isPasskeyCancelled', () => {
  it('rozpoznaje anulowanie przez usera', () => {
    expect(isPasskeyCancelled({ error: 'UserCancelled' })).toBe(true);
    expect(isPasskeyCancelled(new Error('Network'))).toBe(false);
  });
});

describe('webAuthnRequest', () => {
  it('zdejmuje opakowanie {publicKey} z opcji backendu (lbuchs/WebAuthn)', () => {
    const inner = { challenge: 'abc', rpId: 'uprzejmiedonosze.net', userVerification: 'required' };
    expect(webAuthnRequest({ publicKey: inner })).toBe(inner);
  });
  it('opcje bez opakowania zostawia bez zmian', () => {
    const inner = { challenge: 'abc', rpId: 'uprzejmiedonosze.net' };
    expect(webAuthnRequest(inner)).toBe(inner);
  });
});
