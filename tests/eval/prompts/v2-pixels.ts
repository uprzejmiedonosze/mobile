// v1-fixed, ale bbox w realnych pikselach zamiast 0..1000. Testuje, czy przestrzeń 0..1000 sama
// w sobie jest źródłem błędu (np. model gubi się przy przeliczaniu proporcji) — patrz krok 3 planu.
// Wymiary KAŻDEGO zdjęcia w chunku muszą być podane jawnie w promptcie (per photo_index), bo różne
// zdjęcia mogą mieć różne wymiary miniatury.
import { MARKERS } from '../schema.ts';
import type { PromptVariant } from './types.ts';

export const v2Pixels: PromptVariant = {
  id: 'v2-pixels',
  label: 'bbox w pikselach',
  detail: 'high',
  build(ctx) {
    const dims = ctx.images
      .slice()
      .sort((a, b) => a.photo_index - b.photo_index)
      .map((i) => `photo_index ${i.photo_index}: ${i.width}x${i.height}px`)
      .join('; ');
    return (
      'You analyze N photos of one parked car (same report, chronological order). ' +
      `Image pixel dimensions (width x height): ${dims}. ` +
      'Return a JSON object {"photos":[...]}, one entry per photo in input order, each:\n' +
      '{"photo_index":i, "role":"context|car|third|unusable", "quality":0..1,\n' +
      ' "car":{"present":bool, "bbox":[x1,y1,x2,y2]|null, "desc":str|null},\n' +
      ' "plate":{"readable":bool, "text":str|null, "bbox":[x1,y1,x2,y2]|null},\n' +
      ' "markers":[...], "suggested_category":int, "category_confidence":0..1}\n' +
      'Roles: context = wide shot showing the violation setting (sign, crossing, stop, markings); ' +
      'car = vehicle dominates the frame, plate potentially readable; ' +
      'third = supplementary (second angle, sign close-up, extra evidence); ' +
      'unusable = blurred/dark/no car. ' +
      'BBOX FORMAT: bbox is [x1,y1,x2,y2] in ACTUAL PIXELS of that specific photo (use the pixel ' +
      'dimensions given above for that photo_index) — x1=LEFT, y1=TOP, x2=RIGHT, y2=BOTTOM, ' +
      'top-left corner first, bottom-right corner second. Do NOT normalize to 0..1000 or 0..1 — ' +
      'use the real pixel coordinates of the image as given. ' +
      'The plate bbox must tightly enclose the plate characters themselves, ' +
      'not the bumper, grille or road around it. ' +
      `markers only from: ${MARKERS.join(',')}. ` +
      'suggested_category: best matching Polish parking-violation category id 0..26 ' +
      '(2 bus stop, 3 intersection, 5 crosswalk, 13 disabled bay, 14 B-36 sign, 26 sidewalk). ' +
      'Polish plates like ZS1234A. JSON only, no prose.'
    );
  },
};
