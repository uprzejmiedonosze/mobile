const mockLaunchCamera = jest.fn();
jest.mock('react-native', () => ({ Platform: { OS: 'android' }, AppState: { currentState: 'active' } }));
jest.mock('expo-media-library/legacy', () => ({}));
jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: async () => ({ granted: true }),
  launchCameraAsync: (...a: unknown[]) => mockLaunchCamera(...a),
}));

import { takePhoto } from '../src/lib/gallery';
import { setErrorReporter, UserError } from '../src/lib/log';

const unregistered = new Error('Attempting to launch an unregistered ActivityResultLauncher with contract x');

describe('launchWithRetry', () => {
  const reporter = jest.fn();

  beforeEach(() => {
    mockLaunchCamera.mockReset();
    reporter.mockReset();
    setErrorReporter(reporter);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    setErrorReporter(null);
    jest.restoreAllMocks();
  });

  it('chwilowy brak kontraktu: ponawia i zwraca zdjęcie bez zgłoszenia do Sentry', async () => {
    mockLaunchCamera.mockRejectedValueOnce(unregistered).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///a.jpg' }] });
    await expect(takePhoto()).resolves.toBe('file:///a.jpg');
    expect(mockLaunchCamera).toHaveBeenCalledTimes(2);
    expect(reporter).not.toHaveBeenCalled();
  });

  it('trwały brak kontraktu: wskazówka dla użytkownika i jedno zgłoszenie do Sentry', async () => {
    mockLaunchCamera.mockRejectedValue(unregistered);
    const err = await takePhoto().catch((e) => e);
    expect(err).toBeInstanceOf(UserError);
    expect(err.message).toContain('Nie udało się otworzyć aparatu');
    expect(mockLaunchCamera).toHaveBeenCalledTimes(4);
    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith('galeria', expect.stringContaining('aparatu'));
  });

  it('inny błąd przechodzi bez ponawiania', async () => {
    const other = new Error('Coś innego');
    mockLaunchCamera.mockRejectedValue(other);
    await expect(takePhoto()).rejects.toBe(other);
    expect(mockLaunchCamera).toHaveBeenCalledTimes(1);
  });
});
