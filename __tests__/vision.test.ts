import { attachSharedContext, buildDraftOrder, compose, plateMatches, splitByPlate } from '../src/lib/compose';
import { ruleCategory } from '../src/lib/vision';
import { describeRecord, shortPhotoId } from '../src/lib/trace';

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

  it('splitByPlate NIE scala tablic poniżej progu 80% ("314RR" vs "319RA": 2 różnice na 5 znaków)', () => {
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
      vp({ photo_index: 0, photoId: 'a', plate: { readable: true, text: 'ZS12345', bbox: [400, 500, 600, 560] } }), // A~B: "12345"/"12346" 80%
      vp({ photo_index: 1, photoId: 'b', plate: { readable: true, text: 'ZS12346', bbox: [400, 500, 600, 560] } }), // B~C: "12346"/"12446" 80%
      vp({ photo_index: 2, photoId: 'c', plate: { readable: true, text: 'ZS12446', bbox: [400, 500, 600, 560] } }), // A~C: 60% — most przez B
    ];
    const out = splitByPlate('R003', ['a', 'b', 'c'], photos);
    expect(out).toHaveLength(1);
    expect(out[0].subPhotoIds).toEqual(['a', 'b', 'c']);
  });

  it('splitByPlate łączy częściowy odczyt tablicy z pełnym (to samo auto)', () => {
    const photos = [
      vp({ photo_index: 0, photoId: 'a', plate: { readable: true, text: 'ZS465TW', bbox: [400, 500, 600, 560] } }),
      vp({ photo_index: 1, photoId: 'b', plate: { readable: true, text: '45TW', bbox: [400, 500, 600, 560] } }),
    ];
    expect(splitByPlate('R004', ['a', 'b'], photos)).toHaveLength(1);
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

  // --- SCHEMA 8: role z ALPR (alpr_all), nie od modelu. Pola pojazdów 1:1 z odpowiedzi ALPR na
  // stagingu (2026-10-01, kadr 1600x1204), role "od modelu" też 1:1 z tamtego przebiegu.
  const det = (text: string, area: number) => ({ text, score: 0.99, plate_bbox: null, vehicle_bbox: null, vehicle_area: area });

  it('plateMatches: częściowe odczyty i mylone znaki pasują, sam wyróżnik powiatu nie', () => {
    expect(plateMatches('45TW', 'ZS465TW')).toBe(true); // 1 brakujący znak na 4
    expect(plateMatches('KBR0', 'Z0JKBRO')).toBe(true); // realny przypadek: 0 vs O
    expect(plateMatches('ZS679SW', 'ZS6795W')).toBe(true); // S vs 5
    expect(plateMatches('GD314RR', 'GD311RR')).toBe(true); // "314RR" vs "311RR" = 80%
    expect(plateMatches('45TW', 'ZS689UJ')).toBe(false);
    expect(plateMatches('ZS1', 'ZS150UP')).toBe(false); // < 4 znaki
    expect(plateMatches('ZS67', 'ZS679SW')).toBe(false); // tylko 2 znaki poza "ZS"
    expect(plateMatches('ZSZ1', 'ZSZ1234')).toBe(false); // tylko 1 znak poza "ZSZ"
    expect(plateMatches('ZS12345', 'ZS99945')).toBe(false); // wspólny "ZS" nie wystarcza
  });

  it('R005: dwa zbliżenia tego samego auta oznaczone przez model jako car -> mniejsze ujęcie staje się kontekstem', () => {
    const photos = [
      vp({ photo_index: 0, photoId: 'x', role: 'car', plate: { readable: true, text: 'ZS150UP', bbox: null },
        alpr_all: [det('ZPL96783', 0.0160), det('ZS150UP', 0.3399)] }),
      vp({ photo_index: 1, photoId: 'y', role: 'car', plate: { readable: true, text: 'ZS150UP', bbox: null },
        alpr_all: [det('ZS150UP', 0.2500)] }),
    ];
    const rec = compose('R005', ['x', 'y'], photos);
    expect(rec.photos.map((p) => p.role)).toEqual(['car', 'context']);
    expect(rec.reviewReasons).not.toContain('brak zdjecia kontekstu');
    expect(rec.needsReview).toBe(false);
  });

  it('R001: szerokie ujęcie z dwoma autami jest kontekstem dla obu zgłoszeń (duplikat), third innego auta staje się car', () => {
    const photos = [
      vp({ photo_index: 0, photoId: 'a', role: 'car', plate: { readable: true, text: 'ZS689UJ', bbox: null },
        alpr_all: [det('Z0RECAR', 0.0163), det('45TW', 0.0503), det('ZS689UJ', 0.2556)] }),
      vp({ photo_index: 1, photoId: 'b', role: 'car', plate: { readable: true, text: 'ZS689UJ', bbox: null },
        alpr_all: [det('ZS689UJ', 0.3492)] }),
      vp({ photo_index: 2, photoId: 'c', role: 'third', plate: { readable: true, text: 'ZS465TW', bbox: null },
        alpr_all: [det('ZS465TW', 0.3500)] }),
    ];
    const recs = splitByPlate('R001', ['a', 'b', 'c'], photos).map((s) => compose(s.subId, s.subPhotoIds, s.subPhotos));
    attachSharedContext(recs);
    recs.forEach(buildDraftOrder);

    expect(recs.map((r) => r.plate)).toEqual(['ZS689UJ', 'ZS465TW']);
    expect(recs[0].draftOrder).toEqual([{ photoId: 'a', role: 'context' }, { photoId: 'b', role: 'car' }]);
    expect(recs[1].draftOrder).toEqual([{ photoId: 'a', role: 'context', sharedFrom: 'R001-1' }, { photoId: 'c', role: 'car' }]);
    expect(recs.every((r) => !r.needsReview)).toBe(true);
  });

  it('bez danych ALPR o tablicy grupy zostają role od modelu', () => {
    const photos = [
      vp({ photo_index: 0, photoId: 'a', role: 'context', plate: { readable: false, text: null, bbox: null }, markers: ['zebra_crossing'] }),
      vp({ photo_index: 1, photoId: 'b' }),
    ];
    expect(compose('R007', ['a', 'b'], photos).photos.map((p) => p.role)).toEqual(['context', 'car']);
  });

  it('plate_check (poziom zdjęcia, jak w backendzie) daje review tylko na zdjęciu auta, nie na kontekście', () => {
    const ctx = vp({ photo_index: 0, photoId: 'a', role: 'context', plate: { readable: false, text: null, bbox: null }, markers: ['zebra_crossing'], plate_check: 'unverified-box' });
    expect(compose('R009', ['a', 'b'], [ctx, vp({ photo_index: 1, photoId: 'b' })]).needsReview).toBe(false);
    const car = vp({ photo_index: 1, photoId: 'b', plate_check: 'unverified-box' });
    const rec = compose('R010', ['a', 'b'], [{ ...ctx, plate_check: undefined }, car]);
    expect(rec.reviewReasons).toContain('pozycja tablicy niepotwierdzona');
  });

  it('trace: skrócone photoId i opis rekordu z rolą od modelu i polem pojazdu', () => {
    const id = '1790934191008-2-file:///data/ImagePicker/ed5d92ed-92ca-4026.jpeg';
    expect(shortPhotoId(id)).toBe('#2/ed5d92ed');
    const rec = compose('R005', ['x', 'y'], [
      vp({ photo_index: 0, photoId: 'x', alpr_all: [det('ZS228FC', 0.34)] }),
      vp({ photo_index: 1, photoId: 'y', alpr_all: [det('ZS228FC', 0.25)] }),
    ]);
    buildDraftOrder(rec);
    expect(describeRecord(rec)).toContain('context (model: car) a=0.250');
  });
});
