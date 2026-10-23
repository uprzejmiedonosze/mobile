jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { passkeysAllowed, isPasskeyCancelled } from '../src/lib/passkey';

describe('passkeysAllowed', () => {
  it('włączone tylko na prod z natywnym modułem', () => {
    expect(passkeysAllowed('prod', true)).toBe(true);
    expect(passkeysAllowed('prod', false)).toBe(false);
    expect(passkeysAllowed('staging', true)).toBe(false);
  });

  it('na stagingu tylko z flagą EXPO_PUBLIC_PASSKEYS_STAGING', () => {
    expect(passkeysAllowed('staging', true, true)).toBe(true);
    expect(passkeysAllowed('staging', false, true)).toBe(false);
  });
});

describe('isPasskeyCancelled', () => {
  it('rozpoznaje anulowanie przez usera', () => {
    expect(isPasskeyCancelled({ error: 'UserCancelled' })).toBe(true);
    expect(isPasskeyCancelled(new Error('Network'))).toBe(false);
  });
});
