import { extractJson } from '../src/api/spark';
import { attachSharedContext, buildDraftOrder, compose, splitByPlate } from '../src/lib/compose';
import { normPlateKey, ruleCategory, validateVisionPhoto } from '../src/lib/vision';

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
  suggested_category: 26,
  category_confidence: 0.8,
  ...over,
});

describe('vision (ANALYSIS.md)', () => {
  it('normPlateKey jak norm_plate (spacje/pauzy out, litera+cyfra)', () => {
    expect(normPlateKey('ZS 228FC')).toBe('ZS228FC');
    expect(normPlateKey('zs-228-fc')).toBe('ZS228FC');
    expect(normPlateKey('ABC')).toBeNull();
    expect(normPlateKey('123456')).toBeNull(); // brak litery
  });

  it('ruleCategory wg priorytetu (13 > 14 > 5 > 3 > 2 > 26)', () => {
    expect(ruleCategory(['disabled_bay', 'b36_sign'])).toBe(13);
    expect(ruleCategory(['b36_sign', 'zebra_crossing'])).toBe(14);
    expect(ruleCategory(['zebra_crossing', 'sidewalk_parking'])).toBe(5);
    expect(ruleCategory(['sidewalk_parking'])).toBe(26);
    expect(ruleCategory([])).toBe(0);
  });

  it('walidacja łapie tablicę poza autem i zły format', () => {
    expect(validateVisionPhoto(vp(), 0)).toEqual([]);
    expect(validateVisionPhoto(vp({ plate: { readable: true, text: '???', bbox: [400, 500, 600, 560] } }), 0).join(' ')).toMatch(/format/);
    expect(validateVisionPhoto(vp({ plate: { readable: true, text: 'ZS228FC', bbox: [0, 0, 50, 50] } }), 0).join(' ')).toMatch(/poza autem/);
    expect(validateVisionPhoto(vp({ photo_index: 5 }), 0).join(' ')).toMatch(/photo_index/);
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

  it('compose wybiera kontekst+auto i liczy kategorię regułą', () => {
    const ctx = vp({ photo_index: 0, photoId: 'a', role: 'context', plate: { readable: false, text: null, bbox: null }, markers: ['zebra_crossing'], suggested_category: 5 });
    const rec = compose('R001', ['a', 'b'], [ctx, vp({ photo_index: 1, photoId: 'b', suggested_category: 5 })]);
    expect(rec.plate).toBe('ZS228FC');
    expect(rec.selected).toEqual([0, 1]);
    expect(rec.categoryId).toBe(5); // zebra > sidewalk
    expect(rec.needsReview).toBe(false);
  });

  it('niezgodność sugestii z regułą daje review (nie cichy draft)', () => {
    const ctx = vp({ photo_index: 0, photoId: 'a', role: 'context', plate: { readable: false, text: null, bbox: null }, markers: ['zebra_crossing'], suggested_category: 26 });
    const rec = compose('R001', ['a', 'b'], [ctx, vp({ photo_index: 1, photoId: 'b' })]); // oba sugerują 26
    expect(rec.categoryId).toBe(5); // reguła: zebra > sidewalk
    expect(rec.needsReview).toBe(true);
    expect(rec.reviewReasons.join(' ')).toMatch(/model sugeruje kat. 26/);
  });

  it('shared context pożycza rodzeństwu i czyści powód', () => {
    const withCtx = compose('R003-1', ['a', 'b'], [
      vp({ photo_index: 0, photoId: 'a', role: 'context', plate: { readable: false, text: null, bbox: null }, markers: ['bus_stop_sign'] }),
      vp({ photo_index: 1, photoId: 'b' }),
    ]);
    const noCtx = compose('R003-2', ['c'], [vp({ photo_index: 0, photoId: 'c' })]);
    attachSharedContext([withCtx, noCtx]);
    expect(noCtx.sharedContext?.from).toBe('R003-1');
    expect(noCtx.reviewReasons).not.toContain('brak zdjecia kontekstu');
    buildDraftOrder(noCtx);
    expect(noCtx.draftOrder[0]).toMatchObject({ role: 'context', sharedFrom: 'R003-1' });
  });

  it('extractJson ratuje JSON z prozą, wykrywa ucięcie', () => {
    const { parsed } = extractJson('oto wynik: {"plateId":"ZS 060NH"} proszę');
    expect(parsed).toEqual({ plateId: 'ZS 060NH' });
    expect(extractJson('{"plateId":"ZS 228FC","plateBox":{"x":445,"y":').truncated).toBe(true);
  });
});
