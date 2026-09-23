// NOWY wariant (uwaga użytkownika przy przeglądzie planu): model NIE dobiera kategorii. Zadanie
// jest czysto percepcyjne — wykryj znaki/oznaczenia i ich relację przestrzenną do auta (np.
// "koperta dla niepełnosprawnych pod autem", "przejście dla pieszych za autem", "znak zakazu
// zatrzymania przed autem"). Kategorię dobiera POTEM deterministyczny mapper (relations.ts), który
// zna progi z przepisów (10m/15m). Pozwala odróżnić błąd percepcji (zły obiekt/relacja/dystans)
// od błędu reguły prawnej (mapper) — dziś w markers[]+suggested_category te dwa są nierozróżnialne.
import { SCENE_OBJECTS, SCENE_RELATIONS } from '../schema.ts';
import type { PromptVariant } from './types.ts';

export const v4Relations: PromptVariant = {
  id: 'v4-relations',
  label: 'relacje znak/oznaczenie -> auto (bez kategorii)',
  detail: 'high',
  build() {
    return (
      'You analyze N photos of one parked car (same report, chronological order). ' +
      'Do NOT try to classify the parking violation — only describe what you literally see. ' +
      'Return a JSON object {"photos":[...]}, one entry per photo in input order, each:\n' +
      '{"photo_index":i, "role":"context|car|third|unusable", "quality":0..1,\n' +
      ' "car":{"present":bool, "bbox":[x1,y1,x2,y2]|null, "desc":str|null},\n' +
      ' "plate":{"readable":bool, "text":str|null, "bbox":[x1,y1,x2,y2]|null},\n' +
      ' "scene":[{"object":str, "relation":str, "distance_m":number, "confidence":0..1}, ...]}\n' +
      'Roles: context = wide shot showing the violation setting (sign, crossing, stop, markings); ' +
      'car = vehicle dominates the frame, plate potentially readable; ' +
      'third = supplementary (second angle, sign close-up, extra evidence); ' +
      'unusable = blurred/dark/no car. ' +
      'BBOX FORMAT: bbox is [x1,y1,x2,y2] — x1=LEFT, y1=TOP, x2=RIGHT, y2=BOTTOM, in 0..1000 ' +
      'coordinates relative to the whole image width (x) and height (y). Top-left corner first. ' +
      'The plate bbox must tightly enclose the plate characters themselves. ' +
      'scene[]: one entry PER visible sign/marking/terrain feature relevant to parking legality. ' +
      `"object" ONLY from: ${SCENE_OBJECTS.join(',')} ` +
      '(B-36=no-stopping sign, B-35=no-parking sign, D-18=parking sign, T-30=plate under D-18 ' +
      'specifying rules, D-6=pedestrian crossing sign, D-15=bus stop sign, C-13=bike path sign, ' +
      'P-24_koperta=disabled-bay road marking, P-10_przejscie=crosswalk marking, ' +
      'P-14_przejazd_rowerowy=bike crossing marking, P-20_zygzak=no-stopping zigzag marking, ' +
      'P-23_rower=bike-lane marking, chodnik=sidewalk, trawnik=grass/lawn, ' +
      'zatoka_autobusowa=bus bay, wiata_przystankowa=bus shelter, skrzyzowanie=intersection, ' +
      'torowisko=tram tracks, wysepka=traffic island, droga_dla_rowerow=bike path, slupki=bollards). ' +
      `"relation" ONLY from: ${SCENE_RELATIONS.join(',')} ` +
      '(under_car=the car is parked directly on/over this marking; ' +
      'in_front_of_car=ahead of the car in its direction of travel; ' +
      'behind_car=behind the car; left_of_car / right_of_car=to the side; ' +
      'not_related=visible but not relevant to this car\'s parking spot). ' +
      '"distance_m": your best estimate of real-world distance in meters from the car to this ' +
      'object (0 if the car is on top of it). Estimate using typical car length (~4.5m) and lane ' +
      'width (~3m) as a ruler. Do not guess wildly — if truly unsure, use your best estimate and ' +
      'lower "confidence" instead of omitting the entry. ' +
      'Only report scene[] entries you can actually see — do not hallucinate signs that might be ' +
      'implied but are out of frame. Polish plates like ZS1234A. JSON only, no prose.'
    );
  },
};
