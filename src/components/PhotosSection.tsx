import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { ImageViewer } from './ImageViewer';
import type { Phase } from '../lib/usePhotoBatch';
import { SLOT_ORDER } from '../lib/roles';
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

const LABEL: Record<Slot, string> = { context: 'Kontekst', car: 'Auto', third: 'Dodatkowe' };
const SLOTS: Slot[] = SLOT_ORDER; // auto → kontekst → dodatkowe
// Przy jednym zdjęciu drugi kafelek to wycinek auta z serwera (to samo zdjęcie pełni rolę kontekstu i auta).
export const CROP_TILE_ID = '__car_crop';

// Jedno pole na 1–3 zdjęcia: kafelki z podglądem (od razu), pod każdym wybór roli. Role podpowiada analiza ALPR (lib/roles.ts)
// (usePhotoBatch); dotknięcie innej roli zamienia zdjęcia miejscami.
export function PhotosSection({ tiles, slots, phase, uploading, note, editable, crop, carBox, carNatural, onPick, onAssign, onRemove }: {
  tiles: Tile[];
  slots: Slots;
  phase: Phase;
  uploading: Slot[];
  note: string | null;
  carBox?: VehicleBox | null;
  carNatural?: { w: number; h: number } | null;
  crop?: boolean; // jedno zdjęcie = kontekst + wycinek auta: bez wyboru ról
  editable: boolean; // false = zdjęcia z serwera (edycja istniejącego zgłoszenia) – role bez zmian
  onPick: () => void;
  onAssign: (id: string, to: Slot | null) => void;
  onRemove: (id: string) => void;
}) {
  const analyzing = phase === 'preparing' || phase === 'analyzing';
  const [viewer, setViewer] = useState<number | null>(null); // dotknięcie zdjęcia otwiera galerię (zoom, swipe)
  const slotOf = (id: string): Slot | null => (id === CROP_TILE_ID ? 'car' : crop ? 'context' : SLOTS.find((s) => slots[s] === id) ?? null);
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
              return (
                <View key={t.id} style={{ flex: 1 }}>
                  <View style={{ aspectRatio: 3 / 4, borderRadius: ud.radiusSm, backgroundColor: ud.surfaceCream, overflow: 'hidden' }}>
                    <Pressable style={{ flex: 1 }} onPress={() => setViewer(idx)}>
                      <TileImage uri={t.uri} box={slot === 'car' && !analyzing && !uploading.includes('car') ? carBox : null} /* ramka dotyczy zdjęcia już wysłanego, nie takiego w trakcie podmiany */ natural={carNatural} />
                    </Pressable>
                    {(analyzing || (slot && uploading.includes(slot))) ? (
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
                  {editable && !crop ? (
                    <View style={{ marginTop: 6, gap: 4 }}>
                      {SLOTS.map((s) => {
                        const on = slot === s;
                        return (
                          <Pressable key={s} disabled={analyzing} onPress={() => onAssign(t.id, on && s === 'third' ? null : s)} style={{ borderRadius: ud.radiusPill, paddingVertical: 4, alignItems: 'center', backgroundColor: on ? ud.primary : 'transparent', borderWidth: 1, borderColor: on ? ud.primary : ud.primaryOutline, opacity: analyzing ? 0.5 : 1 }}>
                            <Text style={{ fontSize: 12, fontFamily: ud.fontBodyBold, color: on ? '#fff' : ud.primary }}>{LABEL[s]}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={{ textAlign: 'center', marginTop: 6, fontSize: 12, fontFamily: ud.fontBodyBold, color: ud.primary }}>{isCropTile ? 'Auto (wycinek)' : crop ? 'Kontekst' : slot ? LABEL[slot] : ''}</Text>
                  )}
                </View>
              );
            })}
          </View>
          <Text style={{ color: analyzing ? ud.primary : ud.muted, marginTop: 8 }}>
            {phase === 'preparing' ? 'Wysyłam zdjęcia i odczytuję tablice rejestracyjne…' : phase === 'analyzing' ? 'Wybieram zdjęcie auta i kontekst…' : uploading.length ? 'Zapisuję zdjęcia…' : ''}
          </Text>
          {note ? <Text style={{ color: ud.warning, marginTop: 4 }}>{note}</Text> : null}
          <Pressable onPress={onPick} disabled={analyzing}><Text style={{ color: ud.muted, textDecorationLine: 'underline', marginTop: 8 }}>wybierz zdjęcia ponownie</Text></Pressable>
        </>
      )}
      <ImageViewer urls={tiles.map((t) => t.full ?? t.uri)} index={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}
