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

describe('htmlSegments – opis kategorii', () => {
  it('akapity i <br> jako nowe linie, link względny zachowany', () => {
    expect(htmlSegments('<p>Pierwszy.</p><p>Drugi <a href="/przepisy.html#niepelnosprawni">wzór</a>.</p>')).toEqual([
      { text: 'Pierwszy.\n\nDrugi ' },
      { text: 'wzór', href: '/przepisy.html#niepelnosprawni' },
      { text: '.' },
    ]);
    expect(htmlSegments('<p>Znak B-36. <br/> Wyjątkiem…</p>')).toEqual([{ text: 'Znak B-36.\nWyjątkiem…' }]);
  });
});
