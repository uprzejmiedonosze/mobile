import { forcesPolice, policyNote, recipientPolicy } from '../src/lib/recipientPolicy';

test('polityka adresata: wideo → wojewódzka skrzynka, tylko Policja → komisariat, reszta → wybór użytkownika', () => {
  expect(recipientPolicy({ requiresVideo: true, stopAgresjiOnly: true })).toBe('voivodeship'); // hałas, drift mają obie flagi
  expect(recipientPolicy({ stopAgresjiOnly: true })).toBe('police');
  expect(recipientPolicy({})).toBe('sm');
  expect(recipientPolicy(undefined)).toBe('sm');
});

test('Straż Miejska jest wykluczona dla police i voivodeship, a komunikaty się różnią', () => {
  expect(forcesPolice('sm')).toBe(false);
  expect(forcesPolice('police')).toBe(true);
  expect(forcesPolice('voivodeship')).toBe(true);
  expect(policyNote('sm')).toBeNull();
  expect(policyNote('police')).toContain('na Policję');
  expect(policyNote('voivodeship')).toContain('wojewódzką skrzynkę');
});
