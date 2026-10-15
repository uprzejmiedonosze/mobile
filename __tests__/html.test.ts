import { htmlSegments } from '../src/lib/html';

describe('htmlSegments', () => {
  it('generyczny hint jednostki: link mailto jako osobny kawałek', () => {
    expect(htmlSegments('Masz doświadczenia we współpracy z tą jednostką? <a href="mailto:szymon@uprzejmiedonosze.net" target="_blank">Podziel się</a>.')).toEqual([
      { text: 'Masz doświadczenia we współpracy z tą jednostką? ' },
      { text: 'Podziel się', href: 'mailto:szymon@uprzejmiedonosze.net' },
      { text: '.' },
    ]);
  });
  it('zwykły tekst bez zmian, inne tagi usunięte, encje zdekodowane', () => {
    expect(htmlSegments('Domyślnie nie wzywaj')).toEqual([{ text: 'Domyślnie nie wzywaj' }]);
    expect(htmlSegments('a <b>b</b>&nbsp;&amp; c')).toEqual([{ text: 'a b & c' }]);
    expect(htmlSegments(undefined)).toEqual([]);
  });
});
