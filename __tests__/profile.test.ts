import { EMPTY_PROFILE, profileErrors, profileMissing, profileValid } from '../src/lib/profile';

const ok = { ...EMPTY_PROFILE, name: 'Jan Kowalski', address: 'Ulica 10a/7, Szczecin' };

describe('walidacja danych konta (jak backend)', () => {
  it('poprawne dane', () => expect(profileValid(ok)).toBe(true));
  it('samo imię to za mało', () => expect(profileErrors({ ...ok, name: 'Jan' }).name).toBeTruthy());
  it('adres bez numeru', () => expect(profileErrors({ ...ok, address: 'Ulica, Szczecin' }).address).toBeTruthy());
  it('e-Doręczenia: 26 znaków albo pusto', () => {
    expect(profileValid({ ...ok, edelivery: 'AE:PL' })).toBe(false);
    expect(profileValid({ ...ok, edelivery: 'AE:PL-00000-00000-AAAAA-00' })).toBe(true);
  });
  it('puste pola blokują zapis bez komunikatów błędów', () => {
    expect(profileValid(EMPTY_PROFILE)).toBe(false);
    expect(profileErrors(EMPTY_PROFILE)).toEqual({});
  });
});

describe('profileMissing – podpowiedź pod przyciskiem rejestracji', () => {

  it('mówi, których pól wymaganych brakuje', () => {
    expect(profileMissing(EMPTY_PROFILE)).toBe('Uzupełnij imię i nazwisko i adres, żeby przejść dalej.');
    expect(profileMissing({ ...ok, address: ' ' })).toBe('Uzupełnij adres, żeby przejść dalej.');
  });
  it('przy błędzie formatu odsyła do pól, przy poprawnych danych milczy', () => {
    expect(profileMissing({ ...ok, edelivery: 'AE:PL' })).toBe('Popraw zaznaczone pola, żeby przejść dalej.');
    expect(profileMissing(ok)).toBeNull();
  });
});
