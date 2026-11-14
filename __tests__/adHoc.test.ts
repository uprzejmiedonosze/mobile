import {
  adHocCategories, adHocMissing, adHocReportForm, fmtMB, isAdHocCategory, localIso, MAX_VIDEO_BYTES,
  VIDEO_BITRATE, VIDEO_MAX_DURATION_S, VIDEO_RECORD_MAX_BYTES, videoTooLarge, withFeatureCategories,
} from '../src/lib/adHoc';
import type { Category } from '../src/types';

const cat = (c: Partial<Category> & { id: number }): Category => ({ title: `kat ${c.id}`, ...c });

const CATS: Category[] = [
  cat({ id: 5, groups: [0, 4] }),
  cat({ id: 27, beta: true, betaGroups: [6], stopAgresjiOnly: true }),
  cat({ id: 32, adHoc: true, beta: true, order: 2 }),
  cat({ id: 31, adHoc: true, beta: true, order: 1 }),
];

describe('withFeatureCategories', () => {
  it('ukrywa kategorie testowe, gdy serwer ich nie włączył', () => {
    expect(withFeatureCategories(CATS, false).map((c) => c.id)).toEqual([5]);
  });

  it('przenosi betaGroups do groups, ale „na gorąco” nie trafiają na zwykłą listę', () => {
    const out = withFeatureCategories(CATS, true);
    expect(out.find((c) => c.id === 27)?.groups).toEqual([6]);
    expect(out.find((c) => c.id === 5)?.groups).toEqual([0, 4]);
    for (const id of [31, 32]) expect(out.find((c) => c.id === id)?.groups).toBeUndefined();
  });
});

describe('adHocCategories / isAdHocCategory', () => {
  it('zwraca kategorie „na gorąco” w kolejności, tylko gdy włączone', () => {
    expect(adHocCategories(CATS, true).map((c) => c.id)).toEqual([31, 32]);
    expect(adHocCategories(CATS, false)).toEqual([]);
  });

  it('rozpoznaje kategorię zgłoszenia także zapisaną jako tekst', () => {
    expect(isAdHocCategory(CATS, '31')).toBe(true);
    expect(isAdHocCategory(CATS, 27)).toBe(false);
    expect(isAdHocCategory(CATS, undefined)).toBe(false);
  });
});

describe('limity nagrania', () => {
  it('nagrywanie mieści się w limicie serwera (15 MB) z zapasem', () => {
    expect(MAX_VIDEO_BYTES).toBe(15 * 1024 * 1024);
    expect(VIDEO_RECORD_MAX_BYTES).toBeLessThan(MAX_VIDEO_BYTES);
    // sam obraz przy maksymalnej długości + ~128 kb/s dźwięku
    const estimated = ((VIDEO_BITRATE + 128_000) / 8) * VIDEO_MAX_DURATION_S;
    expect(estimated).toBeLessThan(VIDEO_RECORD_MAX_BYTES);
  });

  it('videoTooLarge i fmtMB', () => {
    expect(videoTooLarge(MAX_VIDEO_BYTES)).toBe(false);
    expect(videoTooLarge(MAX_VIDEO_BYTES + 1)).toBe(true);
    expect(videoTooLarge(null)).toBe(false);
    expect(fmtMB(12.5 * 1024 * 1024)).toBe('12,5 MB');
  });
});

describe('adHocReportForm', () => {
  it('składa treść zgłoszenia: naoczny świadek, data z chwili zgłoszenia, Policja', () => {
    const f = adHocReportForm({
      category: 31, plateId: ' wx 12345 ', address: ' Marszałkowska 1, Warszawa ', comment: ' strzały ',
      geo: { display: 'Marszałkowska 1, Warszawa', city: 'Warszawa', voivodeship: 'mazowieckie', postcode: '00-001' },
      lat: 52.23, lng: 21.01, at: new Date(2026, 10, 14, 9, 5, 7),
    });
    expect(f).toMatchObject({
      category: 31, plateId: 'wx 12345', address: 'Marszałkowska 1, Warszawa', comment: 'strzały',
      city: 'Warszawa', voivodeship: 'mazowieckie', postcode: '00-001', lat: 52.23, lng: 21.01,
      datetime: '2026-11-14T09:05:07', dtFromPicture: false, witness: true, stopAgresji: 'SA', extensions: [],
    });
  });

  it('localIso to czas lokalny bez strefy', () => {
    expect(localIso(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02T03:04:05');
  });
});

describe('adHocMissing', () => {
  const ok = { category: 31, plateId: 'WX12345', address: 'Marszałkowska 1, Warszawa', hasPlace: true };
  it('materiał jest opcjonalny – wystarczą kategoria, numer i miejsce', () => {
    expect(adHocMissing(ok)).toBeNull();
  });
  it('wskazuje pierwszy brak', () => {
    expect(adHocMissing({ ...ok, category: null })).toMatch(/Wybierz/);
    expect(adHocMissing({ ...ok, plateId: ' W 1 ' })).toMatch(/numer/);
    expect(adHocMissing({ ...ok, hasPlace: false })).toMatch(/lokalizację/);
  });
});
