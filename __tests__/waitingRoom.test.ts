import { freshFix, FIX_MAX_AGE_MS, packPhotos, splitOversized, toPhotoItem, type WaitingPhoto } from '../src/lib/waitingRoom';

const T0 = Date.UTC(2026, 5, 19, 10, 0, 0); // 12:00 CEST
const pad = (n: number) => String(n).padStart(2, '0');
const warsaw = (ms: number) => { const d = new Date(ms + 2 * 3600_000); return `${d.getUTCFullYear()}:${pad(d.getUTCMonth() + 1)}:${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };
const mk = (id: string, atS: number, metres = 0, carSeq = 1): WaitingPhoto => {
  const takenAtMs = T0 + atS * 1000;
  return { id, uri: `file:///${id}.jpg`, takenAtMs, datetimeOriginal: warsaw(takenAtMs), lat: 52.2 + metres / 111320, lng: 21, accuracy: 5, carSeq };
};
const sizes = (photos: WaitingPhoto[]) => packPhotos(photos).map((p) => p.photos.length).sort();

// Spacer wzdłuż ulicy: `cars` aut po `shots` zdjęć co 8 s, kolejne auto po `gapS` sekundach i `metres` metrach.
const walk = (cars: number, shots: number, gapS: number, metres: number) => {
  const out: WaitingPhoto[] = [];
  let t = 0;
  for (let c = 0; c < cars; c++) {
    for (let s = 0; s < shots; s++) { out.push(mk(`c${c}s${s}`, t, c * metres)); if (s < shots - 1) t += 8; }
    t += gapS;
  }
  return out;
};

describe('poczekalnia: paczki bez ALPR', () => {
  it('rozdziela sąsiednie auta, które groupPhotos scala (przerwa większa niż między zdjęciami jednego auta)', () => {
    const packs = packPhotos(walk(5, 2, 20, 5));
    expect(packs.map((p) => p.photos.length)).toEqual([2, 2, 2, 2, 2]);
    for (const p of packs) expect(new Set(p.photos.map((x) => x.id.slice(0, 2))).size).toBe(1); // bez mieszania aut
  });

  it('działa też, gdy auta dzieli ponad 100 m i półtorej minuty (już samo groupPhotos)', () => {
    expect(sizes(walk(5, 2, 90, 100))).toEqual([2, 2, 2, 2, 2]);
  });

  it('żadna paczka nie przekracza 3 zdjęć, nawet przy równych odstępach', () => {
    const even = Array.from({ length: 10 }, (_, i) => mk(`p${i}`, i * 10));
    expect(Math.max(...packPhotos(even).map((p) => p.photos.length))).toBeLessThanOrEqual(3);
    expect(packPhotos(even).flatMap((p) => p.photos)).toHaveLength(10);
  });

  it('„Następne auto” dzieli nawet zdjęcia zrobione sekundy obok siebie', () => {
    const photos = [mk('a1', 0, 0, 1), mk('a2', 3, 0, 1), mk('b1', 6, 0, 2), mk('b2', 9, 0, 2)];
    expect(packPhotos(photos).map((p) => p.photos.map((x) => x.id))).toEqual([['b1', 'b2'], ['a1', 'a2']]);
  });

  it('te same 3 zdjęcia jednego auta to jedna paczka, a najnowsza paczka jest pierwsza', () => {
    const packs = packPhotos([mk('old', 0), mk('n1', 3600), mk('n2', 3605), mk('n3', 3612)]);
    expect(packs.map((p) => p.photos.map((x) => x.id))).toEqual([['n1', 'n2', 'n3'], ['old']]);
  });

  it('zdjęcia bez GPS też trafiają do paczek (łączy je czas)', () => {
    const photos = [{ ...mk('a', 0), lat: null, lng: null }, { ...mk('b', 10), lat: null, lng: null }];
    expect(sizes(photos)).toEqual([2]);
  });

  it('splitOversized przy remisie nie odcina po jednym zdjęciu', () => {
    const parts = splitOversized([0, 10, 20, 30].map((s, i) => mk(`p${i}`, s)));
    expect(parts.map((p) => p.length)).toEqual([2, 2]);
  });
});

describe('poczekalnia: metadane', () => {
  it('freshFix odrzuca starą pozycję', () => {
    const fix = { lat: 52, lng: 21, accuracy: 5, atMs: T0 };
    expect(freshFix(fix, T0 + FIX_MAX_AGE_MS)).toBe(fix);
    expect(freshFix(fix, T0 + FIX_MAX_AGE_MS + 1)).toBeNull();
    expect(freshFix(null, T0)).toBeNull();
  });

  it('toPhotoItem daje formularzowi datę i GPS jak z EXIF', () => {
    const item = toPhotoItem({ ...mk('a', 0), lat: 52.123456, lng: 21.654321 });
    expect(item.exif).toMatchObject({ datetimeOriginal: '2026:06:19 12:00:00', lat: 52.1235, lng: 21.6543, hasGps: true });
    expect(toPhotoItem({ ...mk('b', 0), lat: null, lng: null }).exif.hasGps).toBe(false);
  });
});
