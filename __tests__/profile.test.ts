import { EMPTY_PROFILE, profileErrors, profileValid, sameProfile } from '../src/lib/profile';

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

describe('sameProfile – „Zapisz zmiany” tylko po faktycznej zmianie', () => {
  it('kopia bez zmian to ten sam profil', () => {
    expect(sameProfile({ ...ok }, ok)).toBe(true);
  });
  it('wykrywa zmianę pola i cofnięcie zmiany', () => {
    expect(sameProfile({ ...ok, shareRecydywa: !ok.shareRecydywa }, ok)).toBe(false);
    expect(sameProfile({ ...ok, msisdn: '1' }, ok)).toBe(false);
    expect(sameProfile({ ...ok, msisdn: ok.msisdn }, ok)).toBe(true);
  });
});
