import { parseE2eLoginUrl } from '../src/lib/e2eLogin';

jest.mock('react-native', () => ({ Linking: {} }));
jest.mock('../src/api/firebaseAuth', () => ({ storeSession: jest.fn() }));
jest.mock('../src/store/useAuth', () => ({ useAuth: { getState: () => ({ hydrate: jest.fn() }) } }));
jest.mock('../src/config', () => ({ e2eEnabled: true }));
jest.mock('../src/lib/log', () => ({ log: { info: jest.fn() } }));

describe('parseE2eLoginUrl', () => {
  test('wyciąga refresh i email (także dla schematu dev)', () => {
    expect(parseE2eLoginUrl('udpro://e2e-login?refresh=abc.def&email=e%402e.pl')).toEqual({ refresh: 'abc.def', email: 'e@2e.pl' });
    expect(parseE2eLoginUrl('udpro-dev://e2e-login?refresh=x')).toEqual({ refresh: 'x', email: '' });
  });
  test('ignoruje inne linki i brak refresh', () => {
    expect(parseE2eLoginUrl('udpro://reports')).toBeNull();
    expect(parseE2eLoginUrl('udpro://e2e-login?email=a')).toBeNull();
    expect(parseE2eLoginUrl(null)).toBeNull();
  });
});
