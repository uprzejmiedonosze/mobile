import { nextStepHint } from '../src/lib/reports';

const ready = { photosOk: true, uploading: false, geoBusy: false, address: 'Prosta 10, Warszawa', category: 4, comment: '' };

describe('nextStepHint – czego brakuje pod „Dalej”', () => {
  it('komplet danych', () => expect(nextStepHint(ready)).toMatch(/sprawdzisz zgłoszenie/));
  it('kolejność braków: wysyłanie, zdjęcia, adres, komentarz', () => {
    expect(nextStepHint({ ...ready, uploading: true, photosOk: false })).toMatch(/wyślą/);
    expect(nextStepHint({ ...ready, photosOk: false, address: '' })).toMatch(/zdjęcie auta/);
    expect(nextStepHint({ ...ready, geoBusy: true, address: '' })).toMatch(/Ustalam adres/);
    expect(nextStepHint({ ...ready, address: 'Prosta' })).toMatch(/Podaj adres/);
    expect(nextStepHint({ ...ready, category: 0, comment: ' ' })).toMatch(/komentarzu/);
    expect(nextStepHint({ ...ready, category: 0, comment: 'opis' })).toMatch(/sprawdzisz/);
  });
});
