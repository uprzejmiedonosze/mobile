import { filterChips, fmtLongDate, fmtSent, fmtShortDate, plural, shortAddress, statusColor, hasRequiredPhotos, clearFieldError, formLocks, ownSameDayReport, imageVersion } from '../src/lib/reports';

describe('reports helpers', () => {
  it('formats dates like the web list', () => {
    expect(fmtShortDate('2026-09-10T19:43:00')).toBe('10.09.2026');
    expect(fmtLongDate('2026-09-10T19:43:00')).toBe('10.09.2026, 19:43 (czw.)');
    expect(fmtSent('2026-09-30T10:00:00')).toBe('30 września 2026 o 10:00');
    expect(fmtShortDate(undefined)).toBe('');
  });
  it('pluralizes violations', () => {
    expect(plural(1, ['wykroczeń', 'wykroczenie', 'wykroczenia'])).toBe('1 wykroczenie');
    expect(plural(2, ['wykroczeń', 'wykroczenie', 'wykroczenia'])).toBe('2 wykroczenia');
    expect(plural(5, ['wykroczeń', 'wykroczenie', 'wykroczenia'])).toBe('5 wykroczeń');
    expect(plural(12, ['wykroczeń', 'wykroczenie', 'wykroczenia'])).toBe('12 wykroczeń');
  });
  it('shortens address and maps status tone', () => {
    expect(shortAddress('Juliana Fałata 2, Szczecin')).toBe('Juliana Fałata 2');
    expect(statusColor('confirmed-fined').fill).toBe('#256EC6');
    expect(statusColor('nieznany').stroke).toBe('#A2A2A2');
  });
  it('builds filter chips only for statuses that occur', () => {
    const st = { draft: { name: 'Draft' }, confirmed: { name: 'Nowe' }, 'confirmed-fined': { name: 'Mandat' }, archived: { name: 'Archiwum' } };
    expect(filterChips(st, { draft: 3, confirmed: 2, 'confirmed-fined': '4', archived: 0, active: 6 })).toEqual([
      { key: 'confirmed', label: 'Nowe', count: 2 },
      { key: 'confirmed-fined', label: 'Mandat', count: 4 },
    ]);
  });
});


describe('błędy pól formularza zgłoszenia', () => {
  it('hasRequiredPhotos: potrzebne oba zdjęcia (kontekst i auto)', () => {
    expect(hasRequiredPhotos(null)).toBe(false);
    expect(hasRequiredPhotos(undefined)).toBe(false);
    expect(hasRequiredPhotos({})).toBe(false);
    expect(hasRequiredPhotos({ carImage: { thumb: 'a.jpg' } })).toBe(false);
    expect(hasRequiredPhotos({ contextImage: { thumb: 'b.jpg' } })).toBe(false);
    expect(hasRequiredPhotos({ contextImage: { thumb: '' }, carImage: { thumb: 'a.jpg' } })).toBe(false);
    expect(hasRequiredPhotos({ contextImage: { thumb: 'b.jpg' }, carImage: { thumb: 'a.jpg' } })).toBe(true);
  });

  it('clearFieldError zdejmuje tylko błąd tego pola („Dodaj zdjęcie auta…” po dodaniu zdjęć), inne zostają', () => {
    const images = { field: 'images', text: 'Dodaj zdjęcie auta…' };
    expect(clearFieldError(images, 'images')).toBeNull();
    expect(clearFieldError(images, 'address')).toBe(images);
    expect(clearFieldError(null, 'images')).toBeNull();
    const general: { field?: string; text: string } = { text: 'Brak połączenia' }; // błąd bez pola (toast) nie jest związany z żadnym polem
    expect(clearFieldError(general, 'images')).toBe(general);
  });
});

describe('formLocks (które pola formularza są zablokowane)', () => {
  const ready = { hasCarPhoto: true, uploading: false, hasLocation: true, geoBusy: false };

  it('na starcie, bez zdjęcia i punktu, wszystko jest zablokowane', () => {
    expect(formLocks({ hasCarPhoto: false, uploading: false, hasLocation: false, geoBusy: false })).toEqual({ photoFields: true, address: true });
  });

  it('data, godzina i numery rejestracyjne odblokowują się po załadowaniu zdjęcia auta', () => {
    expect(formLocks({ ...ready, hasLocation: false }).photoFields).toBe(false);
    expect(formLocks({ ...ready, hasCarPhoto: false }).photoFields).toBe(true);
  });

  it('w trakcie przetwarzania zdjęć pola ze zdjęcia są zablokowane (wynik analizy nadpisałby ręczną edycję)', () => {
    expect(formLocks({ ...ready, uploading: true }).photoFields).toBe(true);
  });

  it('adres odblokowuje się dopiero po wskazaniu punktu i ustaleniu adresu (reverse geocoding)', () => {
    expect(formLocks({ ...ready, hasLocation: false }).address).toBe(true); // jest zdjęcie, ale brak lokalizacji → mapa
    expect(formLocks({ ...ready, geoBusy: true }).address).toBe(true); // punkt jest, adres się jeszcze ustala
    expect(formLocks(ready).address).toBe(false);
  });

  it('blokady są niezależne: zdjęcie bez lokalizacji odblokowuje datę i numer, ale nie adres', () => {
    expect(formLocks({ hasCarPhoto: true, uploading: false, hasLocation: false, geoBusy: false })).toEqual({ photoFields: false, address: true });
  });
});

describe('ownSameDayReport', () => {
  const entry = (o: object) => ({ date: '2026-10-23T10:00:00', status: 'confirmed-waiting', statusLabel: '', recipient: { name: '', shortName: '', isPolice: false }, isOwn: true, reportId: 'a1', ...o });
  const info = (reports: object[]) => ({ plateId: 'WE12345', appsCnt: reports.length, usersCnt: 1, sharedHistory: false, reports: reports as any });

  it('własne zgłoszenie z tego samego dnia = duplikat', () => {
    expect(ownSameDayReport(info([entry({})]), '2026-10-23T18:30:00')?.reportId).toBe('a1');
  });
  it('inny dzień, cudze zgłoszenie albo edytowane zgłoszenie – nie', () => {
    expect(ownSameDayReport(info([entry({})]), '2026-10-22T18:30:00')).toBeNull();
    expect(ownSameDayReport(info([entry({ isOwn: false })]), '2026-10-23T18:30:00')).toBeNull();
    expect(ownSameDayReport(info([entry({})]), '2026-10-23T18:30:00', 'a1')).toBeNull();
    expect(ownSameDayReport(null, '2026-10-23T18:30:00')).toBeNull();
    expect(ownSameDayReport(info([entry({})]), '')).toBeNull();
  });
});

describe('imageVersion', () => {
  const history = { '2026-10-25T16:00:00': { old: 'draft', new: 'ready' } }; // PHP zwraca historię statusów jako obiekt
  it('zmienia wersję adresu przy podmianie zdjęcia w slocie (stała nazwa pliku na serwerze)', () => {
    const a = imageVersion({ statusHistory: history, wipPhotos: { carImage: 'aaaaaaaaaaaaaaaa' } }, 'carImage');
    const b = imageVersion({ statusHistory: history, wipPhotos: { carImage: 'bbbbbbbbbbbbbbbb' } }, 'carImage');
    expect(a).not.toBe(b);
    expect(imageVersion({ statusHistory: history, wipPhotos: { carImage: 'bbbbbbbbbbbbbbbb' } }, 'contextImage')).toBe('1');
  });
  it('bez wip (zakończone zgłoszenie) liczy wpisy historii – także obiektu z PHP', () => {
    expect(imageVersion({ statusHistory: history })).toBe('1');
    expect(imageVersion({ statusHistory: [1, 2] }, 'carImage')).toBe('2');
    expect(imageVersion({})).toBe('0');
  });
});
