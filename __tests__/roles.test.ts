import { canChooseBoth, chooseRoles, listVehicles, NO_PLATE_NOTE, secondVehicle, type Detection, type PhotoDetections } from '../src/lib/roles';

// compose.ts (skąd bierzemy plateMatches) importuje expo-file-system – jak w suggest.test.ts
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readAsStringAsync: jest.fn(async () => '{}'),
  writeAsStringAsync: jest.fn(async () => {}),
}));

const det = (text: string, area: number, o: Partial<Detection> = {}): Detection => ({
  text, score: 0.9, plate_bbox: null, vehicle_bbox: null, vehicle_area: area, winner: false, ...o,
});
const photo = (id: string, ...detections: Detection[]): PhotoDetections => ({ id, detections });

describe('chooseRoles – jedno zdjęcie', () => {
  it('kontekst = zdjęcie, auto = wycinek tego samego zdjęcia', () => {
    const r = chooseRoles([photo('a', det('ZS12345', 0.3, { winner: true }))]);
    expect(r.slots).toEqual({ car: 'a', context: 'a', third: null });
    expect(r.crop).toBe(true);
    expect(r.plate).toBe('ZS12345');
    expect(r.note).toBeNull();
  });

  it('bez rozpoznanego auta: tylko kontekst i komunikat o braku zdjęcia z numerem', () => {
    const r = chooseRoles([photo('a')]);
    expect(r.slots).toEqual({ car: null, context: 'a', third: null });
    expect(r.crop).toBe(false);
    expect(r.vehicleFound).toBe(false);
    expect(r.note).toBe(NO_PLATE_NOTE);
  });
});

describe('chooseRoles – dwa zdjęcia', () => {
  it('auto = zdjęcie z większym pojazdem, drugie = kontekst (niezależnie od kolejności)', () => {
    const wide = photo('wide', det('ZS12345', 0.05, { winner: true }));
    const close = photo('close', det('ZS12345', 0.4, { winner: true }));
    expect(chooseRoles([wide, close]).slots).toEqual({ car: 'close', context: 'wide', third: null });
    expect(chooseRoles([close, wide]).slots).toEqual({ car: 'close', context: 'wide', third: null });
  });

  it('różne auta na obu zdjęciach: wygrywa większy pojazd', () => {
    const a = photo('a', det('ZS11111', 0.1, { winner: true }));
    const b = photo('b', det('GD22222', 0.3, { winner: true }));
    const r = chooseRoles([a, b]);
    expect(r.slots.car).toBe('b');
    expect(r.plate).toBe('GD22222');
  });

  it('remis pola: pewniejszy odczyt, potem wcześniejsze zdjęcie', () => {
    const a = photo('a', det('ZS11111', 0.2, { winner: true, score: 0.8 }));
    const b = photo('b', det('ZS11111', 0.2, { winner: true, score: 0.95 }));
    expect(chooseRoles([a, b]).slots.car).toBe('b');
    const c = photo('c', det('ZS11111', 0.2, { winner: true, score: 0.9 }));
    const d = photo('d', det('ZS11111', 0.2, { winner: true, score: 0.9 }));
    expect(chooseRoles([c, d]).slots.car).toBe('c');
  });

  it('jedno zdjęcie bez auta: auto = to z pojazdem, drugie kontekstem', () => {
    const r = chooseRoles([photo('empty'), photo('car', det('ZS12345', 0.2, { winner: true }))]);
    expect(r.slots).toEqual({ car: 'car', context: 'empty', third: null });
  });

  it('żadne zdjęcie bez auta: kolejność wyboru + ostrzeżenie', () => {
    const r = chooseRoles([photo('a'), photo('b')]);
    expect(r.slots).toEqual({ car: 'a', context: 'b', third: null });
    expect(r.vehicleFound).toBe(false);
    expect(r.note).toMatch(/nie rozpozna/i);
    expect(r.crop).toBe(false);
  });
});

describe('chooseRoles – trzy zdjęcia', () => {
  it('auto = największy pojazd, kontekst = zdjęcie z tym samym autem (najszersze), reszta dodatkowe', () => {
    const close = photo('close', det('ZS12345', 0.45, { winner: true }));
    const mid = photo('mid', det('ZS12345', 0.2, { winner: true }));
    const wide = photo('wide', det('ZS12345', 0.04, { winner: true }));
    expect(chooseRoles([mid, close, wide]).slots).toEqual({ car: 'close', context: 'wide', third: 'mid' });
  });

  it('to samo auto rozpoznajemy także po niezwycięskiej detekcji (inne auto wygrało na tym zdjęciu)', () => {
    const close = photo('close', det('ZS12345', 0.45, { winner: true }));
    // na tym zdjęciu zwycięzcą jest duże sąsiednie auto, ale nasze też jest odczytane (fuzzy: 1 znak różnicy)
    const street = photo('street', det('GD99999', 0.5, { winner: true }), det('ZS12346', 0.05));
    const other = photo('other', det('PO55555', 0.1, { winner: true }));
    const r = chooseRoles([other, close, street]);
    // „street” ma największego zwycięzcę (0.5) → to ono jest autem; kontekstem zdjęcie z TYM autem (GD99999) – brak, więc wg kolejności
    expect(r.slots.car).toBe('street');
    expect(r.plate).toBe('GD99999');
    expect(r.slots.context).toBe('other');
    expect(r.slots.third).toBe('close');
  });

  it('kontekst wybierany po niezwycięskiej detekcji tego samego auta', () => {
    const close = photo('close', det('ZS12345', 0.45, { winner: true }));
    const street = photo('street', det('GD99999', 0.3, { winner: true }), det('ZS12346', 0.04));
    const other = photo('other');
    const r = chooseRoles([other, street, close]);
    expect(r.slots).toEqual({ car: 'close', context: 'street', third: 'other' });
  });

  it('tylko jedno zdjęcie z pojazdem: to auto, pozostałe wg kolejności (kontekst, dodatkowe)', () => {
    const r = chooseRoles([photo('a'), photo('b', det('ZS12345', 0.2, { winner: true })), photo('c')]);
    expect(r.slots).toEqual({ car: 'b', context: 'a', third: 'c' });
  });

  it('brak aut: kolejność wyboru + ostrzeżenie', () => {
    const r = chooseRoles([photo('a'), photo('b'), photo('c')]);
    expect(r.slots).toEqual({ car: 'a', context: 'b', third: 'c' });
    expect(r.note).not.toBeNull();
  });
});

it('brak zdjęć', () => {
  expect(chooseRoles([]).slots).toEqual({ car: null, context: null, third: null });
});

describe('wybór pojazdu przez użytkownika', () => {
  it('listVehicles: dwa pewne, widoczne pojazdy (jeden pojazd = jedna pozycja mimo kilku zdjęć i błędu odczytu)', () => {
    const v = listVehicles([
      photo('a', det('ZS12345', 0.4, { winner: true, score: 0.95 }), det('GD99999', 0.1, { score: 0.9 })),
      photo('b', det('ZS12346', 0.1, { winner: true, score: 0.85 })), // to samo auto, błąd jednego znaku
    ]);
    expect(v.map((x) => x.plate)).toEqual(['ZS12345', 'GD99999']);
  });

  it('listVehicles: pomija niepewne i ledwo widoczne auta (nie pokazujemy zbędnego wyboru)', () => {
    const v = listVehicles([photo('a', det('ZS12345', 0.4, { winner: true }), det('GD99999', 0.1, { score: 0.5 }), det('PO55555', 0.01, { score: 0.99 }))]);
    expect(v.map((x) => x.plate)).toEqual(['ZS12345']);
  });

  it('jedno zdjęcie: wskazane auto jest wycinkiem (crop) i dostarcza tablicę', () => {
    const p = photo('a', det('ZS12345', 0.4, { winner: true }), det('GD99999', 0.15));
    const r = chooseRoles([p], { plate: 'GD99999' });
    expect(r.slots).toEqual({ car: 'a', context: 'a', third: null });
    expect(r.crop).toBe(true);
    expect(r.plate).toBe('GD99999');
  });

  it('dwa zdjęcia: auto = zdjęcie, na którym WSKAZANY pojazd jest największy (nawet niezwycięski)', () => {
    const a = photo('a', det('ZS12345', 0.4, { winner: true }), det('GD99999', 0.1));
    const b = photo('b', det('GD99999', 0.25, { winner: true }));
    expect(chooseRoles([a, b]).slots.car).toBe('a'); // domyślnie największe auto
    const r = chooseRoles([a, b], { plate: 'GD99999' });
    expect(r.slots).toEqual({ car: 'b', context: 'a', third: null });
    expect(r.plate).toBe('GD99999');
  });
});

describe('odpowiedź „Oba”', () => {
  const two = () => listVehicles([
    photo('a', det('ZS12345', 0.4, { winner: true }), det('GD99999', 0.1)),
    photo('b', det('GD99999', 0.25, { winner: true })),
  ]);

  it('„Oba” tylko przy dokładnie dwóch pojazdach', () => {
    expect(canChooseBoth(two())).toBe(true);
    expect(canChooseBoth(two().slice(0, 1))).toBe(false);
    expect(canChooseBoth([...two(), { plate: 'PO55555', score: 0.9, area: 0.2 }])).toBe(false);
  });

  it('drugi pojazd = ten, który nie jest głównym (z tolerancją błędu odczytu jednego znaku)', () => {
    const v = two();
    expect(secondVehicle(v, 'ZS12345')?.plate).toBe('GD99999');
    expect(secondVehicle(v, 'GD99999')?.plate).toBe('ZS12345');
    expect(secondVehicle(v, 'ZS12346')?.plate).toBe('GD99999');
    expect(secondVehicle(v, null)).toBeNull();
  });

  it('pojazd główny przy „Oba” = domyślny (największy), jak bez wyboru', () => {
    const photos = [photo('a', det('ZS12345', 0.4, { winner: true }), det('GD99999', 0.1)), photo('b', det('GD99999', 0.25, { winner: true }))];
    expect(chooseRoles(photos).plate).toBe('ZS12345');
    expect(secondVehicle(listVehicles(photos), chooseRoles(photos).plate)?.plate).toBe('GD99999');
  });
});
