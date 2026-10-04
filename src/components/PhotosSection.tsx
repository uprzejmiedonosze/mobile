import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import type { Phase } from '../lib/usePhotoBatch';
import type { Slot, Slots } from '../lib/suggest';
import { ud } from '../theme';

export type Tile = { id: string; uri: string };

const LABEL: Record<Slot, string> = { context: 'Kontekst', car: 'Auto', third: 'Dodatkowe' };
const SLOTS: Slot[] = ['context', 'car', 'third'];

// Jedno pole na 2–3 zdjęcia: kafelki z podglądem (od razu), pod każdym wybór roli. Role podpowiada analiza
// (usePhotoBatch); dotknięcie innej roli zamienia zdjęcia miejscami.
export function PhotosSection({ tiles, slots, phase, uploading, note, editable, onPick, onAssign, onRemove }: {
  tiles: Tile[];
  slots: Slots;
  phase: Phase;
  uploading: Slot[];
  note: string | null;
  editable: boolean; // false = zdjęcia z serwera (edycja istniejącego zgłoszenia) – role bez zmian
  onPick: () => void;
  onAssign: (id: string, to: Slot | null) => void;
  onRemove: (id: string) => void;
}) {
  const analyzing = phase === 'preparing' || phase === 'analyzing';
  const slotOf = (id: string) => SLOTS.find((s) => slots[s] === id) ?? null;
  return (
    <View style={{ marginTop: 14 }}>
      {tiles.length === 0 ? (
        <Pressable onPress={onPick} style={{ marginTop: 8, height: 150, borderRadius: ud.radiusSm, backgroundColor: ud.surfaceCream, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold }}>＋ Dodaj 2 lub 3 zdjęcia z galerii</Text>
        </Pressable>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {tiles.map((t) => {
              const slot = slotOf(t.id);
              return (
                <View key={t.id} style={{ flex: 1 }}>
                  <View style={{ aspectRatio: 3 / 4, borderRadius: ud.radiusSm, backgroundColor: ud.surfaceCream, overflow: 'hidden' }}>
                    <Image source={{ uri: t.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    {(analyzing || (slot && uploading.includes(slot))) ? (
                      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator color={ud.primary} />
                      </View>
                    ) : null}
                    {editable && !analyzing ? (
                      <Pressable onPress={() => onRemove(t.id)} hitSlop={8} style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 14, lineHeight: 16 }}>✕</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {editable ? (
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
                    <Text style={{ textAlign: 'center', marginTop: 6, fontSize: 12, fontFamily: ud.fontBodyBold, color: ud.primary }}>{slot ? LABEL[slot] : ''}</Text>
                  )}
                </View>
              );
            })}
          </View>
          <Text style={{ color: analyzing ? ud.primary : ud.muted, marginTop: 8 }}>
            {phase === 'preparing' ? 'Przygotowuję zdjęcia…' : phase === 'analyzing' ? 'Analizuję zdjęcia (tablica, rola każdego zdjęcia)…' : uploading.length ? 'Wysyłam zdjęcia…' : ''}
          </Text>
          {note ? <Text style={{ color: ud.warning, marginTop: 4 }}>{note}</Text> : null}
          <Pressable onPress={onPick} disabled={analyzing}><Text style={{ color: ud.muted, textDecorationLine: 'underline', marginTop: 8 }}>wybierz zdjęcia ponownie</Text></Pressable>
        </>
      )}
    </View>
  );
}
