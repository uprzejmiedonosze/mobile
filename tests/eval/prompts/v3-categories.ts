// v1-fixed + pełna lista kategorii z categories.json (id + tytuł + skrót), model zwraca
// categoryId WPROST zamiast tylko suggested_category 0..26 z jednym zdaniem wskazówek. markers[]
// nadal zwracane, żeby dało się porównać z ruleCategory(). Testuje: czy model bez pośrednictwa
// markerów trafia lepiej, mając realny opis przepisu zamiast jednej liczby-kodu.
import { MARKERS } from '../schema.ts';
import { loadCategories } from '../categories.ts';
import type { PromptVariant } from './types.ts';

export const v3Categories: PromptVariant = {
  id: 'v3-categories',
  label: 'pełna lista kategorii, categoryId wprost',
  detail: 'high',
  build() {
    const catList = loadCategories()
      .filter((c) => c.id !== 0) // 0 = "pozostałe" (fallback), nie ma sensu jako opis
      .map((c) => `${c.id}=${c.title}${c.short ? ` (${c.short})` : ''}`)
      .join('; ');
    return (
      'You analyze N photos of one parked car (same report, chronological order). ' +
      'Return a JSON object {"photos":[...]}, one entry per photo in input order, each:\n' +
      '{"photo_index":i, "role":"context|car|third|unusable", "quality":0..1,\n' +
      ' "car":{"present":bool, "bbox":[x1,y1,x2,y2]|null, "desc":str|null},\n' +
      ' "plate":{"readable":bool, "text":str|null, "bbox":[x1,y1,x2,y2]|null},\n' +
      ' "markers":[...], "categoryId":int, "category_confidence":0..1}\n' +
      'Roles: context = wide shot showing the violation setting (sign, crossing, stop, markings); ' +
      'car = vehicle dominates the frame, plate potentially readable; ' +
      'third = supplementary (second angle, sign close-up, extra evidence); ' +
      'unusable = blurred/dark/no car. ' +
      'BBOX FORMAT: bbox is [x1,y1,x2,y2] — x1=LEFT, y1=TOP, x2=RIGHT, y2=BOTTOM, in 0..1000 ' +
      'coordinates relative to the whole image width (x) and height (y). Top-left corner first. ' +
      'The plate bbox must tightly enclose the plate characters themselves, ' +
      'not the bumper, grille or road around it. ' +
      `markers only from: ${MARKERS.join(',')} (still report these, for cross-checking). ` +
      'categoryId: pick the SINGLE best-matching Polish parking-violation category from this ' +
      `exact list (id=title (short description)): ${catList}. ` +
      'Base it on what you actually see in THIS photo (sign, marking, distance to it), not a guess. ' +
      'Polish plates like ZS1234A. JSON only, no prose.'
    );
  },
};
