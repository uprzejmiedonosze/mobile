jest.mock('react-native', () => ({ Linking: { openURL: jest.fn() } }));
jest.mock('../src/config', () => ({ udConfig: { base: 'https://staging.example.net' } }));

import { externalUrl, isUdPage } from '../src/lib/openPage';

describe('openPage – adresy zewnętrzne', () => {
  it('względny adres dostaje domenę backendu, bezwzględny zostaje bez zmian', () => {
    expect(externalUrl('/napisz-pismo-do-polityka.html')).toBe('https://staging.example.net/napisz-pismo-do-polityka.html');
    expect(externalUrl('napisz-pismo-do-polityka.html')).toBe('https://staging.example.net/napisz-pismo-do-polityka.html');
    expect(externalUrl('https://suppi.pl/uprzejmiedonosze')).toBe('https://suppi.pl/uprzejmiedonosze');
    expect(externalUrl('http://example.com/a')).toBe('http://example.com/a');
  });

  it('bez „external” ta sama strona .html otwiera się w aplikacji (WebPage), z „external” – w przeglądarce', () => {
    expect(isUdPage('/napisz-pismo-do-polityka.html')).toBe('/napisz-pismo-do-polityka.html');
    expect(isUdPage(externalUrl('/napisz-pismo-do-polityka.html'))).toBe('/napisz-pismo-do-polityka.html'); // dlatego karta external omija openUdPage
    expect(isUdPage('https://suppi.pl/uprzejmiedonosze')).toBeNull();
  });
});
