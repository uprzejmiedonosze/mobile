// Mirrors the same cases as ../../../uprzejmiedonosze/tests/API/VisionTest.php, so the TS port
// (schema.ts) doesn't drift from the PHP source of truth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normPlateKey, validateVisionPhoto, normalizeVisionPhoto, extractJson, validBox, plateInsideCar } from './schema.ts';

test('normPlateKey: strips spaces/dashes, uppercases, requires letter+digit', () => {
  assert.equal(normPlateKey('ZS 1234A'), 'ZS1234A');
  assert.equal(normPlateKey('zs-1234a'), 'ZS1234A');
  assert.equal(normPlateKey('1234567'), null); // no letter
  assert.equal(normPlateKey('ABCDEFGH'), null); // no digit
  assert.equal(normPlateKey('AB'), null); // too short
  assert.equal(normPlateKey('ABCDEFGHI1'), null); // too long
  assert.equal(normPlateKey(null), null);
  assert.equal(normPlateKey(''), null);
});

test('validBox: shape and range', () => {
  assert.equal(validBox([0, 0, 1000, 1000]), true);
  assert.equal(validBox([0, 0, 1001, 1000]), false);
  assert.equal(validBox([0, 0, -1, 1000]), false);
  assert.equal(validBox([0, 0, 1000]), false);
  assert.equal(validBox(null), false);
});

test('plateInsideCar: 5% slack', () => {
  const car: [number, number, number, number] = [100, 100, 300, 300];
  assert.equal(plateInsideCar(car, [150, 150, 250, 200]), true);
  assert.equal(plateInsideCar(car, [90, 150, 250, 200]), true); // within 5% margin (10px)
  assert.equal(plateInsideCar(car, [50, 150, 250, 200]), false); // well outside
});

test('validateVisionPhoto: happy path', () => {
  const p = {
    photo_index: 0,
    role: 'car',
    quality: 0.8,
    car: { present: true, bbox: [100, 100, 400, 400], desc: null },
    plate: { readable: true, text: 'ZS1234A', bbox: [200, 350, 300, 390] },
    markers: ['b36_sign'],
  };
  assert.deepEqual(validateVisionPhoto(p, 0), []);
});

test('validateVisionPhoto: bad plate format', () => {
  const p = {
    photo_index: 0, role: 'car', quality: 0.8,
    car: { present: true, bbox: [100, 100, 400, 400], desc: null },
    plate: { readable: true, text: '???', bbox: [200, 350, 300, 390] },
    markers: [],
  };
  const errs = validateVisionPhoto(p, 0);
  assert.ok(errs.some((e) => e.includes('nieczytelny format tablicy')));
});

test('validateVisionPhoto: plate outside car', () => {
  const p = {
    photo_index: 0, role: 'car', quality: 0.8,
    car: { present: true, bbox: [100, 100, 400, 400], desc: null },
    plate: { readable: true, text: 'ZS1234A', bbox: [900, 900, 950, 950] },
    markers: [],
  };
  const errs = validateVisionPhoto(p, 0);
  assert.ok(errs.includes('tablica poza autem'));
});

test('validateVisionPhoto: wrong index / unknown marker', () => {
  const p = {
    photo_index: 5, role: 'weird', quality: 2,
    car: { present: false, bbox: null, desc: null },
    plate: { readable: false, text: null, bbox: null },
    markers: ['not_a_real_marker'],
  };
  const errs = validateVisionPhoto(p, 0);
  assert.ok(errs.includes('zly photo_index'));
  assert.ok(errs.some((e) => e.startsWith('zly role=')));
  assert.ok(errs.includes('zly quality'));
  assert.ok(errs.includes('nieznany marker'));
});

test('normalizeVisionPhoto: flips readable=false on bad text', () => {
  const p: any = { plate: { readable: true, text: '???', bbox: null } };
  normalizeVisionPhoto(p);
  assert.equal(p.plate.readable, false);
  assert.equal(p.plate.text, null);
});

test('extractJson: plain JSON', () => {
  const r = extractJson('{"photos":[]}');
  assert.deepEqual(r.parsed, { photos: [] });
  assert.equal(r.truncated, false);
});

test('extractJson: wrapped in prose', () => {
  const r = extractJson('Sure, here you go:\n{"photos":[{"photo_index":0}]}\nHope that helps!');
  assert.deepEqual(r.parsed, { photos: [{ photo_index: 0 }] });
});

test('extractJson: markdown fences', () => {
  const r = extractJson('```json\n{"photos":[]}\n```');
  assert.deepEqual(r.parsed, { photos: [] });
});

test('extractJson: truncated', () => {
  const r = extractJson('{"photos":[{"photo_index":0,"role":"car"');
  assert.equal(r.parsed, null);
  assert.equal(r.truncated, true);
});

test('extractJson: no object at all', () => {
  const r = extractJson('I cannot help with that.');
  assert.equal(r.parsed, null);
  assert.equal(r.truncated, false);
});

test('extractJson: string containing braces does not confuse brace counting', () => {
  const r = extractJson('{"photos":[{"car":{"desc":"a car with a { in the description }"}}]}');
  assert.ok(r.parsed);
  assert.equal(r.parsed.photos[0].car.desc, 'a car with a { in the description }');
});
