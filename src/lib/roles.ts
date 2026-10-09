// Wybór zdjęcia auta i kontekstu z SAMYCH odczytów ALPR (bez LLM) – nowy model analizy dla formularza zgłoszenia.
// Wejście: dla każdego zdjęcia wszystkie detekcje (GET/POST /api/rest/photos/{id}/alpr) w kolejności wyboru zdjęć.
// `winner` = odczyt wskazany przez serwerowe bestAlprResult() (score w paśmie remisu → większy pojazd) – to „kandydat na
// pojazd” zdjęcia; porównujemy zwycięzców między zdjęciami, ale czy INNE zdjęcie pokazuje to samo auto sprawdzamy po
// WSZYSTKICH jego detekcjach (auto z tablicą nie zawsze jest tam zwycięzcą). Stary pipeline (compose.ts) zostaje nietknięty.
import { plateMatches } from './compose';
import type { AlprDetection } from './vision';
import type { Slot, Slots } from './suggest';

export type Detection = AlprDetection & { winner?: boolean };
export type PhotoDetections = { id: string; detections: Detection[] };

// Kolejność wszędzie (kafelki, przydział na serwer, etykiety): auto → kontekst → dodatkowe. Kontekst i „dodatkowe” są równoważne.
export const SLOT_ORDER: Slot[] = ['car', 'context', 'third'];

// Pojazd (unikalna tablica) wykryty na zdjęciach – do wyboru, którego auta dotyczy zgłoszenie.
export type Vehicle = { plate: string; score: number; area: number };

// Wybór pojazdu pokazujemy tylko, gdy są co najmniej dwa pojazdy o sporej pewności odczytu i nie są to ledwo widoczne
// auta w tle (pole pojazdu w kadrze).
export const CONFIDENT_SCORE = 0.8;

// Odpowiedź „Oba” na pytanie, którego pojazdu dotyczy zgłoszenie: oba łamią te same przepisy. Tylko przy co najmniej dwóch
// zdjęciach (jedno zdjęcie nie udokumentuje dwóch pojazdów). listVehicles() zwraca najwyżej dwa pojazdy, więc „Oba” jest
// zawsze jednoznaczne.
export const BOTH_VEHICLES = 'both';
export const MAX_VEHICLES = 2;
export const canChooseBoth = (vehicles: Vehicle[], photoCount: number): boolean => photoCount >= 2 && vehicles.length === MAX_VEHICLES;
// Drugi pojazd zgłoszenia = pierwszy z wykrytych, który nie jest pojazdem głównym (największym na zdjęciu auta).
export const secondVehicle = (vehicles: Vehicle[], primaryPlate: string | null): Vehicle | null =>
  (primaryPlate ? vehicles.find((v) => !plateMatches(v.plate, primaryPlate)) : null) ?? null;
export const MIN_VEHICLE_AREA = 0.03;

export type RoleChoice = {
  slots: Slots;
  crop: boolean; // jedno zdjęcie: kontekst = całe zdjęcie, auto = wycinek pojazdu (+20%) z tego samego zdjęcia
  plate: string | null; // tablica zwycięzcy ze zdjęcia auta
  vehicleFound: boolean; // ALPR znalazł pojazd z czytelną tablicą (zdjęcie auta wskazane z detekcji)
  note: string | null; // komunikat dla użytkownika (brak zdjęcia z numerem rejestracyjnym itp.)
};

const winnerOf = (p: PhotoDetections): Detection | null => p.detections.find((d) => d.winner) ?? null;
// Kandydat na pojazd zdjęcia: zwycięzca serwera albo – gdy użytkownik wskazał auto – jego największy odczyt na tym zdjęciu.
const candidateOf = (p: PhotoDetections, plate?: string): Detection | null => {
  if (!plate) return winnerOf(p);
  const hits = p.detections.filter((d) => plateMatches(d.text, plate));
  return hits.sort((a, b) => (b.vehicle_area ?? 0) - (a.vehicle_area ?? 0))[0] ?? null;
};
const area = (d: Detection | null): number => d?.vehicle_area ?? 0;
const score = (d: Detection | null): number => d?.score ?? 0;

export const NO_PLATE_NOTE = 'Brak zdjęcia z widocznym numerem rejestracyjnym – dodaj zdjęcie auta, na którym widać tablicę.';
const FALLBACK_NOTE = 'Nie rozpoznałem tablicy rejestracyjnej na żadnym zdjęciu – sprawdź przydział i wpisz numer ręcznie.';

// Różne pojazdy na zdjęciach (klastry tablic wg plateMatches) o pewności ≥ CONFIDENT_SCORE i widocznej wielkości, od największego.
// Tylko dwa największe (MAX_VEHICLES) – auta dalej w tle i tak nie są przedmiotem zgłoszenia.
export function listVehicles(photos: PhotoDetections[]): Vehicle[] {
  const out: Vehicle[] = [];
  for (const d of photos.flatMap((p) => p.detections)) {
    if ((d.score ?? 0) < CONFIDENT_SCORE || (d.vehicle_area ?? 0) < MIN_VEHICLE_AREA) continue;
    const v = out.find((x) => plateMatches(x.plate, d.text));
    if (!v) { out.push({ plate: d.text, score: d.score ?? 0, area: d.vehicle_area ?? 0 }); continue; }
    if ((d.score ?? 0) > v.score) { v.plate = d.text; v.score = d.score ?? 0; }
    v.area = Math.max(v.area, d.vehicle_area ?? 0);
  }
  return out.sort((a, b) => b.area - a.area).slice(0, MAX_VEHICLES);
}

// Wybór pojazdu (także „Oba”) oferujemy tylko wtedy, gdy splitVehicles() daje wynik: każdy z dwóch pojazdów ma własne zdjęcie
// z widoczną tablicą. Dwa auta tylko na jednym zdjęciu = bez wyboru, zostaje domyślny (największy) pojazd.
// „Oba”: każdy z dwóch pojazdów ma WŁASNE zdjęcie (tablica + ramka pod osobnym kafelkiem) – dwa pojazdy na jednym zdjęciu nie
// wystarczą. Pierwszy (większy) pojazd bierze zdjęcie, na którym jest największy; drugi – najlepsze INNE zdjęcie, na którym
// jest widoczny z czytelną tablicą (pole pojazdu ≥ MIN_VEHICLE_AREA, pewność ≥ CONFIDENT_SCORE). Brak takiego zdjęcia → null (nie oferujemy „Oba”).
export type BothSplit = { first: { photo: string; plate: string }; second: { photo: string; plate: string } };
export function splitVehicles(photos: PhotoDetections[]): BothSplit | null {
  const vehicles = listVehicles(photos);
  if (vehicles.length < MAX_VEHICLES) return null;
  const best = (plate: string, skip?: string) => photos
    .map((p, i) => ({ p, i, d: p.id === skip ? null : candidateOf(p, plate) }))
    .filter((x): x is { p: PhotoDetections; i: number; d: Detection } => x.d !== null && area(x.d) >= MIN_VEHICLE_AREA && score(x.d) >= CONFIDENT_SCORE)
    .sort((a, b) => area(b.d) - area(a.d) || a.i - b.i)[0];
  const first = best(vehicles[0].plate);
  const second = first ? best(vehicles[1].plate, first.p.id) : undefined;
  if (!first || !second) return null;
  return { first: { photo: first.p.id, plate: first.d.text }, second: { photo: second.p.id, plate: second.d.text } };
}

// Role przy „Oba”: auto = zdjęcie pierwszego pojazdu; kontekst = pozostałe zdjęcie (gdy są trzy), inaczej zdjęcie drugiego
// pojazdu; przy trzech zdjęciach zdjęcie drugiego pojazdu to „dodatkowe”.
export function chooseBothRoles(photos: PhotoDetections[], split: BothSplit): RoleChoice {
  const rest = photos.find((p) => p.id !== split.first.photo && p.id !== split.second.photo);
  const slots: Slots = rest
    ? { car: split.first.photo, context: rest.id, third: split.second.photo }
    : { car: split.first.photo, context: split.second.photo, third: null };
  return { slots, crop: false, plate: split.first.plate, vehicleFound: true, note: null };
}

// „Oba” = dwa osobne zgłoszenia. Sloty szkicu drugiego pojazdu: auto = zdjęcie drugiego pojazdu, a zdjęcie, które leżało w jego
// slocie (kontekst albo dodatkowe), zajmuje zdjęcie auta pierwszego pojazdu. Reszta bez zmian (to samo zdjęcie może leżeć w wielu szkicach).
export function secondDraftSlots(slots: Slots, secondPhoto: string): Slots {
  const out: Slots = { ...slots };
  const from = SLOT_ORDER.find((s) => s !== 'car' && slots[s] === secondPhoto);
  if (from) out[from] = slots.car;
  out.car = secondPhoto;
  return out;
}

// `opts.plate` = pojazd wskazany przez użytkownika (gdy wykryto kilka): auto = zdjęcie, na którym JEGO pojazd jest największy.
export function chooseRoles(photos: PhotoDetections[], opts: { plate?: string } = {}): RoleChoice {
  const empty: Slots = { car: null, context: null, third: null };
  if (photos.length === 0) return { slots: empty, crop: false, plate: null, vehicleFound: false, note: null };

  // wskazany pojazd, którego już nie ma na żadnym zdjęciu (np. po usunięciu zdjęcia) → wybór domyślny
  const plate = opts.plate && photos.some((p) => candidateOf(p, opts.plate)) ? opts.plate : undefined;

  // 1) kandydat na pojazd na zdjęciu (zwycięzca) → największe auto wygrywa (remis: pewniejszy odczyt, potem wcześniejsze zdjęcie)
  const withCar = photos
    .map((p, i) => ({ p, i, w: candidateOf(p, plate) }))
    .filter((x): x is { p: PhotoDetections; i: number; w: Detection } => x.w !== null)
    .sort((a, b) => area(b.w) - area(a.w) || score(b.w) - score(a.w) || a.i - b.i);

  if (photos.length === 1) {
    const only = photos[0];
    if (!withCar.length) return { slots: { ...empty, context: only.id }, crop: false, plate: null, vehicleFound: false, note: NO_PLATE_NOTE };
    return { slots: { car: only.id, context: only.id, third: null }, crop: true, plate: withCar[0].w.text, vehicleFound: true, note: null };
  }

  // brak auta na wszystkich zdjęciach: kolejność wyboru (auto, kontekst, dodatkowe) + ostrzeżenie
  if (!withCar.length) {
    return {
      slots: { car: photos[0].id, context: photos[1]?.id ?? null, third: photos[2]?.id ?? null },
      crop: false, plate: null, vehicleFound: false, note: FALLBACK_NOTE,
    };
  }

  const car = withCar[0];
  const rest = photos.filter((p) => p !== car.p);

  // 2) kontekst: z pozostałych zdjęcie z TYM SAMYM autem (po wszystkich detekcjach), na którym jest najmniejsze = najszersze ujęcie;
  //    gdy żadne go nie zawiera – wg kolejności wyboru. Reszta = dodatkowe.
  const sameCar = rest
    .map((p, i) => {
      const hits = p.detections.filter((d) => plateMatches(d.text, car.w.text));
      return { p, i, hit: hits.length > 0, smallest: Math.min(...hits.map((d) => d.vehicle_area ?? Infinity)) };
    })
    .filter((x) => x.hit)
    .sort((a, b) => a.smallest - b.smallest || a.i - b.i);
  const context = sameCar[0]?.p ?? rest[0];
  const third = rest.find((p) => p !== context) ?? null;

  return {
    slots: { car: car.p.id, context: context?.id ?? null, third: third?.id ?? null },
    crop: false,
    plate: car.w.text,
    vehicleFound: true,
    note: null,
  };
}
