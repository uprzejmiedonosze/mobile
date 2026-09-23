import { clusterSession, filenameDtMs, groupPhotos, inventory, parseExifDtMs, splitSessions } from '../src/lib/grouping';

const T0 = Date.UTC(2026, 5, 19, 10, 0, 0); // 12:00 CEST
const mk = (id: string, dtMs: number, lat: number | null = 53.4285, lng: number | null = 14.5528, fileName: string | null = null) => ({
  id,
  fileName,
  datetimeOriginal: null,
  lat,
  lng,
  dtMs,
  dtSrc: 'exif' as const,
  gps: lat != null && lng != null ? { lat, lng } : null,
});

describe('grouping (GROUPING.md)', () => {
  it('dzieli sesje przy przerwie > 5 min (tylko czas, skok GPS nie dzieli)', () => {
    const items = [
      mk('a', T0, 53.4, 14.5),
      mk('b', T0 + 60_000, 53.9, 15.5), // 100 km w minutę = błąd fixa, ta sama sesja
      mk('c', T0 + 400_000, 53.9, 15.5), // +6m40s -> nowa sesja
    ];
    const s = splitSessions(items);
    expect(s).toHaveLength(2);
    expect(s[0].map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('łączy klastrem po 30 m mimo dużej różnicy czasu', () => {
    const s = [mk('a', T0, 53.4285, 14.5528), mk('b', T0 + 200_000, 53.4286, 14.5529)];
    expect(clusterSession(s)).toHaveLength(1);
  });

  it('most 30 s scala parę ze skokiem GPS 372 m (jak w danych)', () => {
    const s = [mk('a', T0, 53.4285, 14.5528), mk('b', T0 + 3_000, 53.4318, 14.5528)]; // ~370 m w 3 s
    expect(clusterSession(s)).toHaveLength(1);
  });

  it('rozdziela gdy > 50 m i > 60 s (granica ~67 m / 90 s)', () => {
    const s = [mk('a', T0, 53.4285, 14.5528), mk('b', T0 + 90_000, 53.4291, 14.5528)]; // ~67 m, 90 s
    expect(clusterSession(s)).toHaveLength(2);
  });

  it('łączy przy 45 m mimo > 60 s (mieści się w nowym CLUSTER_DIST_M=50)', () => {
    const s = [mk('a', T0, 53.4285, 14.5528), mk('b', T0 + 90_000, 53.4289, 14.5528)]; // ~45 m, 90 s
    expect(clusterSession(s)).toHaveLength(1);
  });

  it('bez GPS łączy tylko mostem czasowym', () => {
    expect(clusterSession([mk('a', T0, null, null), mk('b', T0 + 10_000, null, null)])).toHaveLength(1);
    expect(clusterSession([mk('a', T0, null, null), mk('b', T0 + 120_000, null, null)])).toHaveLength(2);
  });

  it('fallback czasu z nazwy PXL (UTC -> epoch) i drop bez czasu', () => {
    expect(filenameDtMs('PXL_20260619_105027556.MP.jpg')).toBe(Date.UTC(2026, 5, 19, 10, 50, 27));
    expect(filenameDtMs('IMG_123.jpg')).toBeNull();
    const { candidates, dropped } = groupPhotos([
      { id: 'a', fileName: 'PXL_20260619_105027556.MP.jpg', datetimeOriginal: null, lat: 53.4, lng: 14.5 },
      { id: 'b', fileName: 'IMG_123.jpg', datetimeOriginal: null, lat: 53.4, lng: 14.5 },
    ]);
    expect(dropped).toBe(1);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].needsReview).toBe(true); // singleton
  });

  it('EXIF "2026:06:19 12:50:27" to czas lokalny (Warszawa, CEST=+2)', () => {
    expect(parseExifDtMs('2026:06:19 12:50:27')).toBe(Date.UTC(2026, 5, 19, 10, 50, 27));
  });

  it('needs_review: <2 zdjęć lub brak GPS', () => {
    const items = inventory([
      { id: 'a', fileName: 'PXL_20260619_105027556.MP.jpg', datetimeOriginal: null, lat: 53.4, lng: 14.5 },
      { id: 'b', fileName: 'PXL_20260619_105045173.MP.jpg', datetimeOriginal: null, lat: null, lng: null },
    ]);
    expect(items).toHaveLength(2);
    const { candidates } = groupPhotos([
      { id: 'a', fileName: 'PXL_20260619_105027556.MP.jpg', datetimeOriginal: null, lat: 53.4, lng: 14.5 },
      { id: 'b', fileName: 'PXL_20260619_105045173.MP.jpg', datetimeOriginal: null, lat: null, lng: null },
    ]);
    expect(candidates).toHaveLength(1); // 18 s różnicy -> most czasowy
    expect(candidates[0].needsReview).toBe(true); // brak GPS w jednym
    expect(candidates[0].reportId).toBe('R001');
  });
});
