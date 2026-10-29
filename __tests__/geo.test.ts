jest.mock('expo-secure-store', () => ({ getItem: () => null })); // config.ts czyta flagę konta demo
import { mergeGeo } from '../src/api/geo';

// Odpowiedzi w kształcie z ../uprzejmiedonosze/src/inc/integrations/Geolocation.php (MapBox / Nominatim).
const mapbox = { name: 'Marszałkowska 10', address: { address: 'Marszałkowska 10, Warszawa', city: 'Warszawa', voivodeship: 'mazowieckie', postcode: '00-001', street: 'Marszałkowska' } };
const nominatim = {
  address: { address: 'Marszałkowska, Warszawa', road: 'Marszałkowska', city: 'Warszawa', voivodeship: 'mazowieckie', district: 'Śródmieście', county: 'gmina Warszawa', municipality: 'powiat Warszawa' },
  sm: { email: 'sm@um.warszawa.pl', short: 'SM Warszawa', hint: '', address: ['Straż Miejska m.st. Warszawy'] },
  sa: { short: 'KRP I', hint: '' },
};

describe('mergeGeo (jak geolocation.js::latLngToAddress na webie)', () => {
  it('adres opisowy z MapBox (z numerem domu), reszta i odbiorca z Nominatim', () => {
    const g = mergeGeo(mapbox, nominatim)!;
    expect(g.display).toBe('Marszałkowska 10, Warszawa');
    expect(g.postcode).toBe('00-001');
    expect(g.district).toBe('Śródmieście');
    expect(g.county).toBe('gmina Warszawa');
    expect(g.municipality).toBe('powiat Warszawa');
    expect(g.sm).toEqual({ kind: 'Straż miejska', name: 'SM Warszawa', hint: '' });
    expect(g.sa?.name).toBe('KRP I');
  });
  it('bez MapBox zostaje Nominatim', () => {
    expect(mergeGeo(null, nominatim)!.display).toBe('Marszałkowska, Warszawa');
  });
  it('bez Nominatim zostaje adres z MapBox, bez odbiorcy', () => {
    const g = mergeGeo(mapbox, null)!;
    expect(g.display).toBe('Marszałkowska 10, Warszawa');
    expect(g.sm).toBeUndefined();
    expect(g.smUnknown).toBe(false);
  });
  it('oba zawiodły → null (adres ręcznie)', () => {
    expect(mergeGeo(null, null)).toBeNull();
  });
});
