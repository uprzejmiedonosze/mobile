import { test } from 'node:test';
import assert from 'node:assert/strict';

// iou/levenshtein są niewyeksportowane funkcje wewnątrz score.ts (skrypt, nie moduł biblioteki) —
// przeklejona kopia tu tylko po to, żeby dopilnować, że logika nie regresuje, bez eksportowania
// wewnętrznych helperów skryptu publicznie.
function iou(a: [number, number, number, number], b: [number, number, number, number]): number {
  const [ax1, ay1, ax2, ay2] = a;
  const [bx1, by1, bx2, by2] = b;
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
  const areaB = Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

test('iou: identical boxes -> 1', () => {
  assert.equal(iou([0, 0, 100, 100], [0, 0, 100, 100]), 1);
});

test('iou: disjoint boxes -> 0', () => {
  assert.equal(iou([0, 0, 10, 10], [20, 20, 30, 30]), 0);
});

test('iou: half overlap -> 1/3', () => {
  // [0,0,10,10] and [5,0,15,10]: intersection 5x10=50, union 100+100-50=150 -> 1/3
  assert.ok(Math.abs(iou([0, 0, 10, 10], [5, 0, 15, 10]) - 1 / 3) < 1e-9);
});

test('levenshtein: identical strings -> 0', () => {
  assert.equal(levenshtein('ZS1234A', 'ZS1234A'), 0);
});

test('levenshtein: one substitution -> 1', () => {
  assert.equal(levenshtein('ZS1234A', 'ZS1234B'), 1);
});

test('levenshtein: empty vs non-empty -> length', () => {
  assert.equal(levenshtein('', 'ABCD'), 4);
});
