// Dokładny port visionPrompt() z ../../../uprzejmiedonosze/src/inc/integrations/VisionSchema.php.
// Linia odniesienia — stan dzisiejszy w produkcji. JEDYNY wariant, który jedzie na detail:'low'
// (bo to jest produkcyjne OPENAI_VISION_DETAIL) — patrz krok 3 planu.
import { MARKERS } from '../schema.ts';
import type { PromptVariant } from './types.ts';

export const v0Prod: PromptVariant = {
  id: 'v0-prod',
  label: 'produkcja (bez zmian)',
  detail: 'low',
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
      'unusable = blurred/dark/no car. bboxes in 0..1000 relative coords of the whole image. ' +
      'The plate bbox must tightly enclose the plate characters themselves, ' +
      'not the bumper, grille or road around it. ' +
      `markers only from: ${MARKERS.join(',')}. ` +
      'suggested_category: best matching Polish parking-violation category id 0..26 ' +
      '(2 bus stop, 3 intersection, 5 crosswalk, 13 disabled bay, 14 B-36 sign, 26 sidewalk). ' +
      'Polish plates like ZS1234A. JSON only, no prose.'
    );
  },
};
