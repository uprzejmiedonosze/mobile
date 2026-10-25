import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { ImageViewer } from './ImageViewer';
import type { CropPreview, Phase, SecondVehicle } from '../lib/usePhotoBatch';
import { BOTH_VEHICLES, SLOT_ORDER, type Vehicle } from '../lib/roles';
import type { Slot, Slots } from '../lib/suggest';
import { ud } from '../theme';

export type Tile = { id: string; uri: string; full?: string }; // full = oryginał do powiększenia (domyślnie uri)
export type VehicleBox = { x: number; y: number; width: number; height: number }; // piksele zdjęcia auta (ALPR)

// Kafelek zdjęcia (cover) z opcjonalną żółtą ramką pojazdu. Ramka jest w pikselach oryginału, więc przeliczamy ją tą
// samą transformacją „cover” co obrazek (skala + przycięcie nadmiaru), tak jak UdPhoto.
function TileImage({ uri, box, natural }: { uri: string; box?: VehicleBox | null; natural?: { w: number; h: number } | null }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  let overlay = null;
  if (box && natural && size.w > 0) {
    const scale = Math.max(size.w / natural.w, size.h / natural.h);
    const offX = (natural.w * scale - size.w) / 2;
    const offY = (natural.h * scale - size.h) / 2;
    overlay = <View pointerEvents="none" style={{ position: 'absolute', left: box.x * scale - offX, top: box.y * scale - offY, width: box.width * scale, height: box.height * scale, borderWidth: 3, borderColor: '#FFD60A', borderRadius: 4 }} />;
  }
  return (
    <View style={{ flex: 1 }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      {overlay}
    </View>
  );
}

// Jedno zdjęcie: drugi kafelek to wycinek auta (+20% marginesu) liczony lokalnie z oryginału i boxu pojazdu z ALPR – gotowy zaraz po
// odczycie, bez czekania na wycinek z serwera.
function CropTile({ preview }: { preview: CropPreview }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  let img = null;
  if (size.w > 0) {
    const [x1, y1, x2, y2] = preview.box.map((v) => v / 1000);
    const mx = (x2 - x1) * 0.2, my = (y2 - y1) * 0.2;
    const fx1 = Math.max(0, x1 - mx), fx2 = Math.min(1, x2 + mx), fy1 = Math.max(0, y1 - my), fy2 = Math.min(1, y2 + my);
    const scale = Math.max(size.w / ((fx2 - fx1) * preview.w), size.h / ((fy2 - fy1) * preview.h)); // „cover” obszaru wycinka
    const cx = ((fx1 + fx2) / 2) * preview.w, cy = ((fy1 + fy2) / 2) * preview.h;
    img = <Image source={{ uri: preview.uri }} style={{ position: 'absolute', width: preview.w * scale, height: preview.h * scale, left: size.w / 2 - cx * scale, top: size.h / 2 - cy * scale }} />;
  }
  return <View style={{ flex: 1, overflow: 'hidden' }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>{img}</View>;
}
const SLOTS: Slot[] = SLOT_ORDER; // auto → kontekst → dodatkowe
// Przy jednym zdjęciu drugi kafelek to wycinek auta z serwera (to samo zdjęcie pełni rolę kontekstu i auta).
export const CROP_TILE_ID = '__car_crop';

// Pole na 2–3 kafelki (jedno zdjęcie też daje dwa: oryginał + wycinek auta – układ się nie przestawia). Bez podpisów ról; zdjęcie auta
// wyróżnia miniatura tablicy rejestracyjnej pod nim. Role wynikają z analizy ALPR (lib/roles.ts) i nie są do ręcznej zmiany; jedyny wybór
// użytkownika to „którego pojazdu dotyczy zgłoszenie”, gdy wykryto kilka pewnych pojazdów.
export function PhotosSection({ tiles, slots, phase, uploading, note, editable, crop, cropPreview, pending, plateUri, vehicles, vehicleIdx, canBoth, both, second, carBox, carNatural, onPick, onVehicle, onRemove, showRepick = true }: {
  tiles: Tile[];
  slots: Slots;
  phase: Phase;
  uploading: Slot[];
  note: string | null;
  carBox?: VehicleBox | null;
  carNatural?: { w: number; h: number } | null;
  crop?: boolean; // jedno zdjęcie = oryginał + wycinek auta (drugi kafelek, CROP_TILE_ID)
  cropPreview?: CropPreview | null;
  pending?: boolean; // role są przeliczane po usunięciu zdjęcia (opóźnione) – spinner tylko na kafelku wycinka
  plateUri?: string | null; // miniatura tablicy z ALPR (wycinek z serwera) – pod zdjęciem auta
  editable: boolean; // false = zdjęcia z serwera (edycja istniejącego zgłoszenia) – role bez zmian
  onPick: () => void;
  vehicles?: Vehicle[]; // ≥2 = wykryto kilka pojazdów o sporej pewności: pytamy, którego dotyczy zgłoszenie
  vehicleIdx?: number;
  canBoth?: boolean; // czy pokazać „Oba” (≥3 zdjęcia: dwa pojazdy + wspólny kontekst, dokładnie dwa pojazdy – roles.canChooseBoth)
  second?: SecondVehicle | null; // „Oba”: ramka i tablica drugiego pojazdu pod JEGO zdjęciem
  both?: boolean; // odpowiedź „Oba” (oba pojazdy łamią te same przepisy)
  onVehicle?: (plate: string) => void; // tablica albo BOTH_VEHICLES
  onRemove: (id: string) => void;
  showRepick?: boolean; // link „wybierz zdjęcia ponownie” (w nowym zgłoszeniu zastąpiony przez „Zacznij od nowa”)
}) {
  const analyzing = phase === 'preparing' || phase === 'analyzing';
  const [viewer, setViewer] = useState<number | null>(null); // dotknięcie zdjęcia otwiera galerię (zoom, swipe)
  const slotOf = (id: string): Slot | null => (id === CROP_TILE_ID ? 'car' : crop ? null : SLOTS.find((s) => slots[s] === id) ?? null);
  return (
    <View style={{ marginTop: 14 }}>
      {tiles.length === 0 ? (
        <Pressable onPress={onPick} style={{ marginTop: 8, height: 150, borderRadius: ud.radiusSm, backgroundColor: ud.surfaceCream, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold }}>＋ Dodaj od 1 do 3 zdjęć z galerii</Text>
        </Pressable>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {tiles.map((t, idx) => {
              const slot = slotOf(t.id);
              const isCropTile = t.id === CROP_TILE_ID;
              const isCar = slot === 'car';
              const isSecond = !!both && !!second && t.id === second.photoId;
              const waiting = isCropTile && !cropPreview && (analyzing || pending);
              return (
                <View key={t.id} style={{ flex: 1 }}>
                  <View style={{ aspectRatio: 3 / 4, borderRadius: ud.radiusSm, backgroundColor: ud.surfaceCream, overflow: 'hidden' }}>
                    <Pressable style={{ flex: 1 }} onPress={() => setViewer(idx)}>
                      {isCropTile ? (
                        cropPreview ? <CropTile preview={cropPreview} /> : (
                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                            {waiting ? null : <Text style={{ color: ud.muted, textAlign: 'center', fontSize: 12 }}>Brak zdjęcia z widocznym numerem rejestracyjnym</Text>}
                          </View>
                        )
                      ) : (
                        isSecond ? <TileImage uri={t.uri} box={analyzing ? null : second!.box} natural={second!.natural} /> : (
                          <TileImage uri={t.uri} box={isCar && !analyzing && !uploading.includes('car') ? carBox : null} /* ramka dotyczy zdjęcia już wysłanego, nie takiego w trakcie podmiany */ natural={carNatural} />
                        )
                      )}
                    </Pressable>
                    {(waiting || (!isCropTile && analyzing) || (slot && uploading.includes(slot))) ? (
                      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator color={ud.primary} />
                      </View>
                    ) : null}
                    {editable && !analyzing && !isCropTile ? (
                      <Pressable onPress={() => onRemove(t.id)} hitSlop={8} style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 14, lineHeight: 16 }}>✕</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {/* Miniatura tablicy pod zdjęciem auta – bez podpisu; to ona wyróżnia zdjęcie auta spośród pozostałych. */}
                  {isCar && plateUri ? (
                    <Image source={{ uri: plateUri }} style={{ marginTop: 8, height: 64, width: '100%', borderRadius: 4, backgroundColor: ud.surfaceCream }} resizeMode="contain" />
                  ) : null}
                  {isSecond && second!.plateUri ? (
                    <Image source={{ uri: second!.plateUri }} style={{ marginTop: 8, height: 64, width: '100%', borderRadius: 4, backgroundColor: ud.surfaceCream }} resizeMode="contain" />
                  ) : null}
                </View>
              );
            })}
          </View>
          {editable && !analyzing && vehicles && vehicles.length >= 2 ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: ud.text, fontFamily: ud.fontBodyBold }}>Wykryto kilka pojazdów – którego dotyczy zgłoszenie?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {vehicles.map((v, i) => {
                  const on = !both && i === vehicleIdx;
                  return (
                    <Pressable key={v.plate} onPress={() => onVehicle?.(v.plate)} style={{ borderRadius: ud.radiusPill, borderWidth: 1, borderColor: ud.primary, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: on ? ud.primary : 'transparent' }}>
                      <Text style={{ fontFamily: ud.fontBodyBold, letterSpacing: 1, color: on ? '#fff' : ud.primary }}>{v.plate}</Text>
                    </Pressable>
                  );
                })}
                {canBoth ? (
                  <Pressable onPress={() => onVehicle?.(BOTH_VEHICLES)} style={{ borderRadius: ud.radiusPill, borderWidth: 1, borderColor: ud.primary, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: both ? ud.primary : 'transparent' }}>
                    <Text style={{ fontFamily: ud.fontBodyBold, color: both ? '#fff' : ud.primary }}>Oba</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
          <Text style={{ color: analyzing ? ud.primary : ud.muted, marginTop: 8 }}>
            {phase === 'preparing' ? 'Wysyłam zdjęcia i odczytuję tablice rejestracyjne…' : phase === 'analyzing' ? 'Wybieram zdjęcie auta i kontekst…' : uploading.length ? 'Zapisuję zdjęcia…' : ''}
          </Text>
          {note ? <Text style={{ color: ud.warning, marginTop: 4 }}>{note}</Text> : null}
          {showRepick ? <Pressable onPress={onPick} disabled={analyzing}><Text style={{ color: ud.muted, textDecorationLine: 'underline', marginTop: 8 }}>wybierz zdjęcia ponownie</Text></Pressable> : null}
        </>
      )}
      <ImageViewer urls={tiles.map((t) => t.full ?? t.uri)} index={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}
