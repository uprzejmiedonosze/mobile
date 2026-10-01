import { attachSharedContext, buildDraftOrder, compose, splitByPlate } from '../src/lib/compose';
import { ruleCategory } from '../src/lib/vision';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readAsStringAsync: jest.fn(async () => '{}'),
  writeAsStringAsync: jest.fn(async () => {}),
}));

const vp = (over: any = {}) => ({
  photo_index: 0,
  photoId: 'p0',
  role: 'car',
  quality: 0.9,
  car: { present: true, bbox: [100, 100, 900, 900] as [number, number, number, number], desc: 'auto' },
  plate: { readable: true, text: 'ZS228FC', bbox: [400, 500, 600, 560] as [number, number, number, number] },
  markers: ['sidewalk_parking'],
  ...over,
});

describe('vision (ANALYSIS.md)', () => {
  // normPlateKey/validateVisionPhoto/extractJson przeniesione do backendu
  // (uprzejmiedonosze/src/inc/integrations/VisionSchema.php) — pokryte tam
  // przez tests/API/VisionTest.php. Tu zostaje tylko deterministyczny ogon
  // (grupowanie/split/kompozycja/kategorie), który wciąż liczy appka.

  it('ruleCategory wg priorytetu (13 > 5 > 3 > 2 > 26)', () => {
    expect(ruleCategory(['disabled_bay', 'zebra_crossing'])).toBe(13);
    expect(ruleCategory(['zebra_crossing', 'intersection'])).toBe(5);
    expect(ruleCategory(['intersection', 'bus_bay'])).toBe(3);
    expect(ruleCategory(['bus_bay', 'sidewalk_parking'])).toBe(2);
    expect(ruleCategory(['sidewalk_parking'])).toBe(26);
    expect(ruleCategory([])).toBe(0);
  });

  it('splitByPlate dzieli R014 na 3 i dokleja bez-tablicowe do najbliższych', () => {
    const photos = [
      vp({ photo_index: 0, photoId: 'a', plate: { readable: true, text: 'AAA1111', bbox: [400, 500, 600, 560] } }),
      vp({ photo_index: 1, photoId: 'b', role: 'context', plate: { readable: false, text: null, bbox: null } }),
      vp({ photo_index: 2, photoId: 'c', plate: { readable: true, text: 'BBB2222', bbox: [400, 500, 600, 560] } }),
      vp({ photo_index: 3, photoId: 'd', plate: { readable: true, text: 'CCC3333', bbox: [400, 500, 600, 560] } }),
    ];
    const out = splitByPlate('R014', ['a', 'b', 'c', 'd'], photos);
    expect(out.map((s) => s.subId)).toEqual(['R014-1', 'R014-2', 'R014-3']);
    expect(out[0].subPhotos.map((p) => p.photoId)).toEqual(['a', 'b']); // b najbliżej a
  });

  it('splitByPlate scala tablice różniące się jedną cyfrą na 7 znaków (realny przypadek: model="GD314RR", ALPR="GD311RR", 6/7≈85.7%)', () => {
    const photos = [
      vp({ photo_index: 0, photoId: 'a', role: 'context', plate: { readable: true, text: 'GD314RR', bbox: [400, 500, 600, 560] } }),
      vp({ photo_index: 1, photoId: 'b', plate: { readable: true, text: 'GD311RR', bbox: [400, 500, 600, 560] } }),
    ];
    const out = splitByPlate('R001', ['a', 'b'], photos);
    expect(out).toHaveLength(1);
    expect(out[0].split).toBe(false);
    expect(out[0].subPhotoIds).toEqual(['a', 'b']);
  });

  it('splitByPlate NIE scala tablic poniżej progu 80% (2 różnice na 7 znaków, 5/7≈71.4%)', () => {
    const photos = [
      vp({ photo_index: 0, photoId: 'a', plate: { readable: true, text: 'GD314RR', bbox: [400, 500, 600, 560] } }),
      vp({ photo_index: 1, photoId: 'b', plate: { readable: true, text: 'GD319RA', bbox: [400, 500, 600, 560] } }),
    ];
    const out = splitByPlate('R002', ['a', 'b'], photos);
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.split)).toBe(true);
  });

  it('splitByPlate scala tranzytywnie przez most (A~B, B~C, ale A i C bezpośrednio niepodobne)', () => {
    const photos = [
      vp({ photo_index: 0, photoId: 'a', plate: { readable: true, text: 'AB123', bbox: [400, 500, 600, 560] } }), // A~B: 1/5 różnicy, 80%
      vp({ photo_index: 1, photoId: 'b', plate: { readable: true, text: 'AB124', bbox: [400, 500, 600, 560] } }), // B~C: 1/5 różnicy, 80%
      vp({ photo_index: 2, photoId: 'c', plate: { readable: true, text: 'AB144', bbox: [400, 500, 600, 560] } }), // A~C: 2/5 różnicy, 60% — most przez B musi je scalić
    ];
    const out = splitByPlate('R003', ['a', 'b', 'c'], photos);
    expect(out).toHaveLength(1);
    expect(out[0].subPhotoIds).toEqual(['a', 'b', 'c']);
  });

  it('compose wybiera kontekst+auto i liczy kategorię regułą', () => {
    const ctx = vp({ photo_index: 0, photoId: 'a', role: 'context', plate: { readable: false, text: null, bbox: null }, markers: ['zebra_crossing'] });
    const rec = compose('R001', ['a', 'b'], [ctx, vp({ photo_index: 1, photoId: 'b' })]);
    expect(rec.plate).toBe('ZS228FC');
    expect(rec.selected).toEqual([0, 1]);
    expect(rec.categoryId).toBe(5); // zebra > sidewalk
    expect(rec.needsReview).toBe(false);
  });

  it('shared context pożycza rodzeństwu i czyści powód', () => {
    const withCtx = compose('R003-1', ['a', 'b'], [
      vp({ photo_index: 0, photoId: 'a', role: 'context', plate: { readable: false, text: null, bbox: null }, markers: ['bus_bay'] }),
      vp({ photo_index: 1, photoId: 'b' }),
    ]);
    const noCtx = compose('R003-2', ['c'], [vp({ photo_index: 0, photoId: 'c' })]);
    attachSharedContext([withCtx, noCtx]);
    expect(noCtx.sharedContext?.from).toBe('R003-1');
    expect(noCtx.reviewReasons).not.toContain('brak zdjecia kontekstu');
    buildDraftOrder(noCtx);
    expect(noCtx.draftOrder[0]).toMatchObject({ role: 'context', sharedFrom: 'R003-1' });
  });
});
