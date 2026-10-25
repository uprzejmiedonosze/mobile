jest.mock('expo-secure-store', () => ({}));

import { pickTopCategories, pushRecent } from '../src/lib/recentCategories';
import type { Category } from '../src/types';

const cat = (id: number): Category => ({ id, title: `K${id}` });
const all = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(cat);
const defaults = [1, 2, 3, 4].map(cat);
const ids = (cs: Category[]) => cs.map((c) => c.id);

describe('pushRecent', () => {
  it('nowa kategoria na początek, powtórzona tylko się przesuwa, najwyżej 4', () => {
    expect(pushRecent([], 7)).toEqual([7]);
    expect(pushRecent([7], 8)).toEqual([8, 7]);
    expect(pushRecent([8, 7], 7)).toEqual([7, 8]);
    expect(pushRecent([5, 6, 7, 8], 2)).toEqual([2, 5, 6, 7]);
  });

  it('kategoria 0 („Pozostałe przypadki”) nie trafia na listę', () => {
    expect(pushRecent([7], 0)).toEqual([7]);
  });
});

describe('pickTopCategories', () => {
  it('pierwsze zgłoszenie: domyślne TOP z categories.json', () => {
    expect(ids(pickTopCategories(defaults, all, []))).toEqual([1, 2, 3, 4]);
  });

  it('każda nowa kategoria wypycha ostatnią domyślną', () => {
    expect(ids(pickTopCategories(defaults, all, [7]))).toEqual([7, 1, 2, 3]);
    expect(ids(pickTopCategories(defaults, all, [8, 7]))).toEqual([8, 7, 1, 2]);
    expect(ids(pickTopCategories(defaults, all, [5, 6, 7, 8]))).toEqual([5, 6, 7, 8]);
  });

  it('użyta kategoria domyślna nie dubluje się na liście', () => {
    expect(ids(pickTopCategories(defaults, all, [3]))).toEqual([3, 1, 2, 4]);
  });

  it('pomija nieistniejące kategorie i kategorię 0', () => {
    expect(ids(pickTopCategories(defaults, all, [99, 0, 7]))).toEqual([7, 1, 2, 3]);
  });
});
