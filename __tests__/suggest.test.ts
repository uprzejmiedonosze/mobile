import { assignSlot, defaultSlots, suggestSlots } from '../src/lib/suggest';
import { dropMatchingExtension, exifToIso, isExtensionDisabled } from '../src/lib/reports';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readAsStringAsync: jest.fn(async () => '{}'),
  writeAsStringAsync: jest.fn(async () => {}),
}));

const det = (text: string, area: number) => ({ text, score: 0.99, plate_bbox: null, vehicle_bbox: null, vehicle_area: area });
const vp = (over: any = {}) => ({
  photo_index: 0,
  photoId: 'p0',
  role: 'car',
  quality: 0.9,
  car: { present: true, bbox: [100, 100, 900, 900] as [number, number, number, number], desc: 'auto' },
  plate: { readable: true, text: 'ZS150UP', bbox: null },
  markers: ['sidewalk_parking'],
  ...over,
});

describe('suggestSlots', () => {
  it('3 zdjęcia w przypadkowej kolejności: auto = największy pojazd, kontekst = ujęcie, na którym auta nie widać (najszersze), reszta = dodatkowe', () => {
    const analyzed = [
      vp({ photo_index: 0, photoId: 'a', role: 'car', alpr_all: [det('ZS150UP', 0.05)] }), // auto widać z daleka → dodatkowe
      vp({ photo_index: 1, photoId: 'b', role: 'car', alpr_all: [det('ZS150UP', 0.4)] }), // zbliżenie → auto
      vp({ photo_index: 2, photoId: 'c', role: 'third', plate: { readable: false, text: null, bbox: null }, alpr_all: [], markers: [] }), // auta nie widać → kontekst
    ];
    const s = suggestSlots(['a', 'b', 'c'], analyzed);
    expect(s.slots).toEqual({ context: 'c', car: 'b', third: 'a' });
    expect(s.plate).toBe('ZS150UP');
    expect(s.categoryId).toBe(26);
    expect(s.confident).toBe(true);
  });

  it('2 zdjęcia → tylko kontekst + auto, trzeci slot pusty', () => {
    const analyzed = [
      vp({ photo_index: 0, photoId: 'x', alpr_all: [det('ZS150UP', 0.34)] }),
      vp({ photo_index: 1, photoId: 'y', alpr_all: [det('ZS150UP', 0.25)] }),
    ];
    const s = suggestSlots(['x', 'y'], analyzed);
    expect(s.slots).toEqual({ context: 'y', car: 'x', third: null });
  });

  it('zdjęcie innego pojazdu nie zastępuje auta zgłoszenia – ląduje jako dodatkowe', () => {
    const analyzed = [
      vp({ photo_index: 0, photoId: 'a', alpr_all: [det('ZS150UP', 0.3)] }),
      vp({ photo_index: 1, photoId: 'b', alpr_all: [det('ZS150UP', 0.1)] }),
      vp({ photo_index: 2, photoId: 'z', plate: { readable: true, text: 'WE99999', bbox: null }, alpr_all: [det('WE99999', 0.5)] }),
    ];
    const s = suggestSlots(['a', 'b', 'z'], analyzed);
    expect(s.slots.car).toBe('a');
    expect(s.slots.context).toBe('b');
    expect(s.slots.third).toBe('z');
  });

  it('bez czytelnej tablicy uzupełnia sloty z kolejności wyboru i oznacza niepewność', () => {
    const none = { readable: false, text: null, bbox: null };
    const analyzed = [
      vp({ photo_index: 0, photoId: 'a', role: 'unusable', plate: none, markers: [] }),
      vp({ photo_index: 1, photoId: 'b', role: 'unusable', plate: none, markers: [] }),
    ];
    const s = suggestSlots(['a', 'b'], analyzed);
    expect(s.slots).toEqual({ context: 'a', car: 'b', third: null });
    expect(s.confident).toBe(false);
    expect(s.plate).toBeNull();
  });

  it('defaultSlots: kolejność wyboru', () => {
    expect(defaultSlots(['a', 'b'])).toEqual({ context: 'a', car: 'b', third: null });
    expect(defaultSlots(['a', 'b', 'c'])).toEqual({ context: 'a', car: 'b', third: 'c' });
  });
});

describe('assignSlot', () => {
  const slots = { context: 'a', car: 'b', third: 'c' };
  it('zamienia zdjęcia miejscami', () => {
    expect(assignSlot(slots, 'c', 'car')).toEqual({ context: 'a', car: 'c', third: 'b' });
  });
  it('przenosi do pustego slotu i zwalnia stary', () => {
    expect(assignSlot({ context: 'a', car: 'b', third: null }, 'a', 'third')).toEqual({ context: null, car: 'b', third: 'a' });
  });
  it('null wyjmuje zdjęcie ze zgłoszenia', () => {
    expect(assignSlot(slots, 'c', null)).toEqual({ context: 'a', car: 'b', third: null });
  });
  it('to samo zdjęcie w tym samym slocie nic nie zmienia', () => {
    expect(assignSlot(slots, 'b', 'car')).toEqual(slots);
  });
});

describe('exifToIso', () => {
  it('konwertuje datę EXIF', () => {
    expect(exifToIso('2026:09:10 19:43:00')).toBe('2026-09-10T19:43:00');
    expect(exifToIso(null)).toBeNull();
    expect(exifToIso('śmieci')).toBeNull();
  });
});

describe('rozszerzenia „Czy pojazd dodatkowo”', () => {
  it('rozszerzenie o id wybranej kategorii jest zablokowane i odznaczane', () => {
    expect(isExtensionDisabled(25, 25)).toBe(true);
    expect(isExtensionDisabled(11, 25)).toBe(false);
    expect(dropMatchingExtension([11, 25], 25)).toEqual([11]);
    expect(dropMatchingExtension([11, 25], 0)).toEqual([11, 25]);
  });
});
