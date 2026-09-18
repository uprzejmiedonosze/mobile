import { log } from '../src/lib/log';

jest.mock('../src/api/udApi', () => ({ authFetch: jest.fn() }));

import { authFetch } from '../src/api/udApi';
import { analyzeCandidate, VisionQuotaError } from '../src/api/vision';

const mockedAuthFetch = authFetch as jest.Mock;

describe('api/vision (klient REST backendu)', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    jest.spyOn(log, 'warn').mockImplementation(() => {});
    jest.spyOn(log, 'info').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('POSTuje /api/rest/vision/candidate z ciągłym photo_index i data URI', async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ photos: [{ photo_index: 0, photoId: 'a', role: 'context' }], usage: { calls: 1 }, warnings: [] }),
    });

    const items = [
      { photo_index: 0, photoId: 'a', b64: 'AAAA' },
      { photo_index: 1, photoId: 'b', b64: 'BBBB' },
    ];
    const photos = await analyzeCandidate('R001', items);

    expect(photos).toEqual([{ photo_index: 0, photoId: 'a', role: 'context' }]);
    expect(mockedAuthFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockedAuthFetch.mock.calls[0];
    expect(path).toBe('/api/rest/vision/candidate');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.reportId).toBe('R001');
    expect(body.photos.map((p: any) => p.photo_index)).toEqual([0, 1]);
    expect(body.photos[0].image).toBe('data:image/jpeg;base64,AAAA');
  });

  it('rzuca VisionQuotaError na HTTP 429', async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 429, text: async () => 'limit' });
    await expect(analyzeCandidate('R002', [{ photo_index: 0, photoId: 'a', b64: 'AAAA' }])).rejects.toBeInstanceOf(VisionQuotaError);
  });

  it('rzuca zwykły błąd na 502', async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 502, text: async () => 'model padł' });
    await expect(analyzeCandidate('R003', [{ photo_index: 0, photoId: 'a', b64: 'AAAA' }])).rejects.toThrow(/502/);
  });

  it('loguje warnings z odpowiedzi', async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ photos: [], usage: {}, warnings: ['zdj.0: verify crop: timeout'] }),
    });
    await analyzeCandidate('R004', [{ photo_index: 0, photoId: 'a', b64: 'AAAA' }]);
    expect(log.warn).toHaveBeenCalledWith('wizja', expect.stringContaining('verify crop'));
  });
});
