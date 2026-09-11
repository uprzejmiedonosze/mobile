import { normalizePlate, plateKey } from '../src/lib/plate';
import { pairPhotos } from '../src/lib/pairing';

describe('plate', () => {
  it('normalizuje PL', () => {
    expect(normalizePlate('zs060nh')).toBe('ZS 060NH');
    expect(normalizePlate('Z4 CICHE')).toBe('Z4 CICHE');
    expect(normalizePlate('WZ-4617T')).toBe('WZ 4617T');
    expect(normalizePlate('')).toBeNull();
  });
  it('klucz do parowania', () => {
    expect(plateKey('ZS 060NH')).toBe('ZS060NH');
  });
});

describe('pairing', () => {
  it('grupuje po tablicy w pary kontekst+zblizenie', () => {
    const photos: any[] = [
      { id: 'a', exif: { datetimeOriginal: '2026-06-19T10:00:00', lat: 53.4, lng: 14.5 } },
      { id: 'b', exif: { datetimeOriginal: '2026-06-19T10:01:00', lat: 53.4, lng: 14.5 } },
      { id: 'c', exif: { datetimeOriginal: '2026-06-19T11:00:00', lat: 53.5, lng: 14.6 } },
    ];
    const results: any[] = [
      { photoId: 'a', plateId: 'ZS 060NH', vehicleBox: { w: 200, h: 200 } },
      { photoId: 'b', plateId: 'ZS 060NH', vehicleBox: { w: 600, h: 600 } },
      { photoId: 'c', plateId: null, vehicleBox: null },
    ];
    const pairs = pairPhotos(photos, results);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].closeupPhotoId).toBeTruthy();
    expect(pairs[0].plateKey).toBe('ZS060NH');
  });
});
