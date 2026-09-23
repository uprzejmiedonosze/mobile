// Dwa wywołania zamiast jednego. Call 1 (wszystkie zdjęcia): role + scena (jak v4-relations) —
// NIE prosimy o tablicę/bbox tutaj, żeby model skupił się wyłącznie na kontekście. Call 2 (TYLKO
// zdjęcia, które call 1 oznaczył jako role==='car'): tablica + bboxy, jedno zadanie, więcej uwagi
// na grounding. Testuje, czy rozdzielenie zadań poprawia dokładność względem jednego wywołania,
// które robi wszystko naraz (v1/v4).
import { SCENE_OBJECTS, SCENE_RELATIONS } from '../schema.ts';
import type { PromptVariant } from './types.ts';

export const v5TwoStage: PromptVariant = {
  id: 'v5-twostage',
  label: 'dwa wywołania: scena, potem tablica+bbox',
  detail: 'high',
  twoStage: true,
  build() {
    // Call 1: identyczne zadanie percepcyjne co v4-relations, ale BEZ plate/bbox — to zostaje
    // dla call 2, żeby model nie robił dwóch różnych zadań na raz.
    return (
      'You analyze N photos of one parked car (same report, chronological order). ' +
      'Do NOT try to classify the parking violation — only describe what you literally see. ' +
      'Return a JSON object {"photos":[...]}, one entry per photo in input order, each:\n' +
      '{"photo_index":i, "role":"context|car|third|unusable", "quality":0..1,\n' +
      ' "scene":[{"object":str, "relation":str, "distance_m":number, "confidence":0..1}, ...]}\n' +
      'Roles: context = wide shot showing the violation setting (sign, crossing, stop, markings); ' +
      'car = vehicle dominates the frame, plate potentially readable; ' +
      'third = supplementary (second angle, sign close-up, extra evidence); ' +
      'unusable = blurred/dark/no car. ' +
      'scene[]: one entry PER visible sign/marking/terrain feature relevant to parking legality. ' +
      `"object" ONLY from: ${SCENE_OBJECTS.join(',')}. ` +
      `"relation" ONLY from: ${SCENE_RELATIONS.join(',')} ` +
      '(under_car=car parked directly on/over it; in_front_of_car/behind_car/left_of_car/right_of_car ' +
      'relative to the car; not_related=visible but not relevant to this car\'s spot). ' +
      '"distance_m": best estimate in meters (0 if under the car), using car length ~4.5m as a ruler. ' +
      'Only report entries you can actually see. JSON only, no prose.'
    );
  },
  buildCall2() {
    // Call 2: TYLKO tablica + bboxy, dla jednego zdjęcia na raz (role==='car' z call 1).
    return (
      'This photo shows a parked car. Find the car and its Polish licence plate. ' +
      'Return a JSON object {"car":{"present":bool, "bbox":[x1,y1,x2,y2]|null, "desc":str|null}, ' +
      '"plate":{"readable":bool, "text":str|null, "bbox":[x1,y1,x2,y2]|null}}. ' +
      'BBOX FORMAT: bbox is [x1,y1,x2,y2] — x1=LEFT, y1=TOP, x2=RIGHT, y2=BOTTOM, in 0..1000 ' +
      'coordinates relative to the whole image width (x) and height (y). Top-left corner first. ' +
      'The plate bbox must tightly enclose the plate characters themselves, not the bumper, ' +
      'grille or road around it. Polish plates like ZS1234A. JSON only, no prose.'
    );
  },
};
