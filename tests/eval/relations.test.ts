import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankCategories, bestCategory } from './relations.ts';
import type { SceneItem } from './schema.ts';

function scene(items: Array<Partial<SceneItem> & Pick<SceneItem, 'object' | 'relation'>>): SceneItem[] {
  return items.map((i) => ({ distance_m: 0, confidence: 0.9, ...i }));
}

test('koperta pod autem -> 13', () => {
  const s = scene([{ object: 'P-24_koperta', relation: 'under_car' }]);
  assert.equal(bestCategory(s), 13);
});

test('B-36 przed autem -> 14', () => {
  const s = scene([{ object: 'B-36', relation: 'in_front_of_car' }]);
  assert.equal(bestCategory(s), 14);
});

test('B-36 za autem (nie przed) -> nie 14', () => {
  const s = scene([{ object: 'B-36', relation: 'behind_car' }]);
  assert.notEqual(bestCategory(s), 14);
});

test('D-18 + T-30 razem -> 16', () => {
  const s = scene([
    { object: 'D-18', relation: 'not_related' },
    { object: 'T-30', relation: 'not_related' },
  ]);
  assert.equal(bestCategory(s), 16);
});

test('przejście dla pieszych 3m za autem -> 5', () => {
  const s = scene([{ object: 'P-10_przejscie', relation: 'behind_car', distance_m: 3 }]);
  assert.equal(bestCategory(s), 5);
});

test('przejście dla pieszych 15m od auta -> nie 5 (poza progiem 10m)', () => {
  const s = scene([{ object: 'P-10_przejscie', relation: 'behind_car', distance_m: 15 }]);
  assert.notEqual(bestCategory(s), 5);
});

test('skrzyżowanie 5m -> 3', () => {
  const s = scene([{ object: 'skrzyzowanie', relation: 'not_related', distance_m: 5 }]);
  assert.equal(bestCategory(s), 3);
});

test('przystanek (zatoka) 10m -> 2', () => {
  const s = scene([{ object: 'zatoka_autobusowa', relation: 'not_related', distance_m: 10 }]);
  assert.equal(bestCategory(s), 2);
});

test('trawnik pod autem -> 25', () => {
  const s = scene([{ object: 'trawnik', relation: 'under_car' }]);
  assert.equal(bestCategory(s), 25);
});

test('droga dla rowerów pod autem -> 21', () => {
  const s = scene([{ object: 'droga_dla_rowerow', relation: 'under_car' }]);
  assert.equal(bestCategory(s), 21);
});

test('wysepka 12m -> 22', () => {
  const s = scene([{ object: 'wysepka', relation: 'not_related', distance_m: 12 }]);
  assert.equal(bestCategory(s), 22);
});

test('chodnik pod autem, bez słupków -> 26', () => {
  const s = scene([{ object: 'chodnik', relation: 'under_car' }]);
  assert.equal(bestCategory(s), 26);
});

test('chodnik pod autem + słupki blisko -> 8 (w głębi chodnika) wygrywa nad 26', () => {
  const s = scene([
    { object: 'chodnik', relation: 'under_car' },
    { object: 'slupki', relation: 'not_related', distance_m: 1 },
  ]);
  const ranked = rankCategories(s);
  assert.equal(ranked[0].cid, 8);
  // 26 nadal w rankingu (top-2), bo obie przesłanki prawdziwe
  assert.ok(ranked.some((r) => r.cid === 26));
});

test('brak sygnałów -> 0', () => {
  assert.equal(bestCategory([]), 0);
});

test('kilka przesłanek naraz -> wszystkie w rankingu, posortowane malejąco po score', () => {
  const s = scene([
    { object: 'P-24_koperta', relation: 'under_car', confidence: 0.95 },
    { object: 'chodnik', relation: 'under_car', confidence: 0.5 },
  ]);
  const ranked = rankCategories(s);
  assert.ok(ranked.length >= 2);
  assert.equal(ranked[0].cid, 13); // wyższy confidence wygrywa
  assert.ok(ranked[0].score >= ranked[1].score);
});
