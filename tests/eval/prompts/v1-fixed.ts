// v0-prod + jawna kolejność osi bbox (+ przykład liczbowy) i detail:'high'. Testuje hipotezę 2
// z planu: Gemini i inne modele natywnie emitują [ymin,xmin,ymax,xmax] w 0..1000 (styl Google
// Object Detection); proszone o naszą kolejność bez doprecyzowania, produkują box odbity względem
// przekątnej — dokładnie objaw "pozycja samochodu nieprawidłowa". To baza dla wariantów v2-v5.
import { MARKERS } from '../schema.ts';
import type { PromptVariant } from './types.ts';

export const v1Fixed: PromptVariant = {
  id: 'v1-fixed',
  label: 'jawna kolejność osi bbox',
  detail: 'high',
  build() {
    return (
      'You analyze N photos of one parked car (same report, chronological order). ' +
      'Return a JSON object {"photos":[...]}, one entry per photo in input order, each:\n' +
      '{"photo_index":i, "role":"context|car|third|unusable", "quality":0..1,\n' +
      ' "car":{"present":bool, "bbox":[x1,y1,x2,y2]|null, "desc":str|null},\n' +
      ' "plate":{"readable":bool, "text":str|null, "bbox":[x1,y1,x2,y2]|null},\n' +
      ' "markers":[...], "suggested_category":int, "category_confidence":0..1}\n' +
      'Roles: context = wide shot showing the violation setting (sign, crossing, stop, markings); ' +
      'car = vehicle dominates the frame, plate potentially readable; ' +
      'third = supplementary (second angle, sign close-up, extra evidence); ' +
      'unusable = blurred/dark/no car. ' +
      'BBOX FORMAT (read carefully): bbox is [x1,y1,x2,y2] — x1=LEFT edge, y1=TOP edge, ' +
      'x2=RIGHT edge, y2=BOTTOM edge, all in 0..1000 coordinates relative to the WIDTH (x) and ' +
      'HEIGHT (y) of the whole image (NOT [ymin,xmin,ymax,xmax], NOT normalized 0..1). ' +
      'Example: a car occupying the left half of a 1000-wide, 1000-tall image, from 20% down to ' +
      '80% down, would have bbox [0,200,500,800]. Always x-coordinates first, then y-coordinates; ' +
      'always the smaller (top-left) corner first, then the larger (bottom-right) corner. ' +
      'The plate bbox must tightly enclose the plate characters themselves, ' +
      'not the bumper, grille or road around it. ' +
      `markers only from: ${MARKERS.join(',')}. ` +
      'suggested_category: best matching Polish parking-violation category id 0..26 ' +
      '(2 bus stop, 3 intersection, 5 crosswalk, 13 disabled bay, 14 B-36 sign, 26 sidewalk). ' +
      'Polish plates like ZS1234A. JSON only, no prose.'
    );
  },
};
