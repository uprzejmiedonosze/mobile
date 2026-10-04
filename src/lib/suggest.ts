// Podpowiedź ról zdjęć dla formularza zgłoszenia: 2–3 zdjęcia w jednym polu → które jest zdjęciem auta,
// które kontekstem, a które dodatkowym. Używa tego samego, deterministycznego ogona co tryb batch
// (compose.ts: split po tablicy, assignRoles z ALPR, kategoria z markerów) na odpowiedzi
// POST /api/rest/vision/candidate – tu tylko składamy wynik w trzy sloty formularza.
import { buildDraftOrder, compose, splitByPlate } from './compose';
import type { VisionPhoto } from './vision';

export type Slot = 'context' | 'car' | 'third';

export type Suggestion = {
  slots: Slots; // photoId w slocie (null = pusty)
  plate: string | null; // odczyt z analizy (serwer i tak odczyta tablicę przy uploadzie zdjęcia auta)
  categoryId: number; // 0 = brak sugestii
  markers: string[];
  reasons: string[]; // czemu podpowiedź jest niepewna (puste = pewna)
  confident: boolean; // analiza sama wskazała kontekst I auto
};

export type Slots = Record<Slot, string | null>;
export const EMPTY_SLOTS: Slots = { context: null, car: null, third: null };

// Gdy analiza zawiodła (brak sieci, limit): kolejność wyboru = kontekst, auto, dodatkowe.
export function defaultSlots(photoIds: string[]): Slots {
  return { context: photoIds[0] ?? null, car: photoIds[1] ?? null, third: photoIds[2] ?? null };
}

// `analyzed` = odpowiedź wizji dla `photoIds` (photoId musi być ustawione w każdym wpisie).
export function suggestSlots(photoIds: string[], analyzed: VisionPhoto[]): Suggestion {
  // Zdjęcia innego pojazdu (osobna tablica) nie należą do tego zgłoszenia – bierzemy podgrupę
  // z największą liczbą zdjęć (remis: pierwsza), reszta trafi do wolnych slotów jako „dodatkowe”.
  const subs = splitByPlate('F', photoIds, analyzed);
  const main = [...subs].sort((a, b) => b.subPhotoIds.length - a.subPhotoIds.length)[0];
  const rec = compose('F', main.subPhotoIds, main.subPhotos);
  buildDraftOrder(rec);

  const slots = { ...EMPTY_SLOTS };
  const used = new Set<string>();
  const take = (slot: Slot, id: string | undefined) => {
    if (id && !used.has(id)) {
      slots[slot] = id;
      used.add(id);
    }
  };
  take('context', rec.draftOrder.find((d) => d.role === 'context')?.photoId);
  take('car', rec.draftOrder.find((d) => d.role === 'car')?.photoId);
  const confident = !!(slots.context && slots.car);
  take('third', rec.draftOrder.find((d) => !used.has(d.photoId))?.photoId);

  // Braki uzupełniamy nieprzydzielonymi zdjęciami w kolejności wyboru: najpierw kontekst, potem auto, potem trzecie.
  const leftovers = photoIds.filter((id) => !used.has(id));
  for (const slot of ['context', 'car', 'third'] as Slot[]) {
    if (!slots[slot] && leftovers.length) take(slot, leftovers.shift());
  }
  // Dwa zdjęcia = dokładnie kontekst + auto: trzeci slot zostaje pusty.
  if (photoIds.length === 2 && slots.third) {
    const t = slots.third;
    slots.third = null;
    if (!slots.context) slots.context = t;
    else if (!slots.car) slots.car = t;
  }

  return { slots, plate: rec.plate, categoryId: rec.categoryId, markers: rec.markers, reasons: rec.reviewReasons, confident };
}

// Zamiana ról: zdjęcie `id` dostaje slot `to` (null = poza zgłoszeniem); dotychczasowy lokator slotu
// przejmuje poprzedni slot tego zdjęcia (zamiana miejscami).
export function assignSlot(slots: Slots, id: string, to: Slot | null): Slots {
  const from = (['context', 'car', 'third'] as Slot[]).find((s) => slots[s] === id) ?? null;
  const next = { ...slots };
  if (from) next[from] = null;
  if (to) {
    const occupant = next[to];
    next[to] = id;
    if (occupant && from) next[from] = occupant;
  }
  return next;
}
