import { useReportSheet } from '../src/store/useReportSheet';

const app = { id: 'a', status: 'confirmed' } as any;

describe('useReportSheet – zgłoszenie w arkuszu', () => {
  beforeEach(() => useReportSheet.getState().open(app, {}, new Map()));
  it('zmiana trafia do arkusza i do listy', () => {
    useReportSheet.getState().update('a', { status: 'archived' });
    expect(useReportSheet.getState().app?.status).toBe('archived');
    expect(useReportSheet.getState().patched).toEqual({ id: 'a', patch: { status: 'archived' } });
  });
  it('spóźniony zapis innego zgłoszenia nie podmienia otwartego', () => {
    useReportSheet.getState().update('b', { status: 'archived' });
    expect(useReportSheet.getState().app).toBe(app);
    expect(useReportSheet.getState().patched?.id).toBe('b');
  });
  it('zamknięcie zostawia listę, wyjście na inny ekran każe ją odświeżyć', () => {
    expect(useReportSheet.getState().keepList).toBe(true);
    useReportSheet.getState().leave();
    expect(useReportSheet.getState().keepList).toBe(false);
  });
});
