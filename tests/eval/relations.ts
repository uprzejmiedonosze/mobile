// Deterministyczny mapper scene[] (prompt v4-relations / v5-twostage) -> ranking kategorii
// wykroczenia. Koduje realne przesłanki prawne (progi 10m/15m z categories.json), analogicznie
// do ruleCategory() w src/lib/vision.ts, ale na wejściu ma obiekt+relację+dystans zamiast płaskich
// markerów — pozwala odróżnić błąd percepcji modelu (zły obiekt/relacja/dystans) od błędu tej
// reguły. Testowane w izolacji: podany scene[] z ground truth powinien dać 100% trafień.
import type { SceneItem, SceneObject } from './schema.ts';

export type CategoryGuess = { cid: number; score: number; why: string };

function has(scene: SceneItem[], obj: SceneObject, opts?: { relation?: string; maxDistance?: number }): SceneItem | null {
  for (const s of scene) {
    if (s.object !== obj) continue;
    if (opts?.relation && s.relation !== opts.relation) continue;
    if (opts?.maxDistance != null && s.distance_m > opts.maxDistance) continue;
    return s;
  }
  return null;
}

/**
 * Ranking kategorii wykroczenia na podstawie sceny — pierwsze trafienie ma najwyższy score, ale
 * zwracamy CAŁĄ listę (dla metryki top-1/top-2), nie tylko zwycięzcę.
 */
export function rankCategories(scene: SceneItem[]): CategoryGuess[] {
  const out: CategoryGuess[] = [];
  const push = (cid: number, score: number, why: string) => out.push({ cid, score, why });

  const koperta = has(scene, 'P-24_koperta', { relation: 'under_car' });
  if (koperta) push(13, koperta.confidence, 'P-24 (koperta dla niepełnosprawnych) pod autem');

  const b36 = has(scene, 'B-36', { relation: 'in_front_of_car' });
  if (b36) push(14, b36.confidence, 'B-36 (zakaz zatrzymywania się) przed autem');

  const d18 = has(scene, 'D-18');
  const t30 = has(scene, 'T-30');
  if (d18 && t30) push(16, Math.min(d18.confidence, t30.confidence), 'D-18 + T-30 (tabliczka) razem');

  const zebra = has(scene, 'P-10_przejscie', { maxDistance: 10 }) ?? has(scene, 'D-6', { maxDistance: 10 });
  if (zebra) push(5, zebra.confidence, `przejście dla pieszych ${zebra.distance_m}m od auta (<10m)`);

  const skrzyzowanie = has(scene, 'skrzyzowanie', { maxDistance: 10 });
  if (skrzyzowanie) push(3, skrzyzowanie.confidence, `skrzyżowanie ${skrzyzowanie.distance_m}m od auta (<10m)`);

  const przystanek =
    has(scene, 'D-15', { maxDistance: 15 }) ??
    has(scene, 'zatoka_autobusowa', { maxDistance: 15 }) ??
    has(scene, 'wiata_przystankowa', { maxDistance: 15 });
  if (przystanek) push(2, przystanek.confidence, `przystanek (${przystanek.object}) ${przystanek.distance_m}m od auta (<15m)`);

  const trawnik = has(scene, 'trawnik', { relation: 'under_car' });
  if (trawnik) push(25, trawnik.confidence, 'trawnik pod autem');

  const ddr =
    has(scene, 'droga_dla_rowerow', { relation: 'under_car' }) ??
    has(scene, 'C-13', { relation: 'under_car' }) ??
    has(scene, 'P-23_rower', { relation: 'under_car' });
  if (ddr) push(21, ddr.confidence, `droga dla rowerów (${ddr.object}) pod autem`);

  const wysepka = has(scene, 'wysepka', { maxDistance: 15 });
  if (wysepka) push(22, wysepka.confidence, `wysepka ${wysepka.distance_m}m od auta (<15m)`);

  const chodnik = has(scene, 'chodnik', { relation: 'under_car' });
  if (chodnik) {
    // proxy dla "w głębi chodnika (np. za słupkami)" z opisu kategorii 8 w categories.json —
    // słupki w pobliżu auta jako sygnał głębi, inaczej domyślnie zwykłe zastawienie chodnika (26).
    const slupki = has(scene, 'slupki', { maxDistance: 2 });
    if (slupki) push(8, Math.min(chodnik.confidence, slupki.confidence), 'chodnik pod autem + słupki w pobliżu (w głębi chodnika)');
    push(26, chodnik.confidence, 'chodnik pod autem');
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Zwycięzca rankingu, albo 0 ("pozostałe przypadki" / brak sygnału) jak ruleCategory(). */
export function bestCategory(scene: SceneItem[]): number {
  const ranked = rankCategories(scene);
  return ranked.length ? ranked[0].cid : 0;
}
