import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MD } from './materialIcons';
import { ud } from '../theme';

export type SpeedDialAction = { key: string; label: string; icon: string; onPress: () => void };

// Pływający przycisk „+” (Material FAB) z rozwijanym menu akcji („speed dial”) – na Androidzie zamiast zakładki „Nowe”.
// Akcje rosną w górę od przycisku; najbliżej kciuka (ostatnia na liście) jest najważniejsza. Dotknięcie tła, przycisk wstecz
// albo wybór akcji zwija menu (onRequestClose Modala). Jedna akcja – przycisk uruchamia ją od razu, bez menu.
// Rysowany jako ostatnie dziecko ekranu (position: absolute), nad przewijaną treścią; pasek zakładek jest poza ekranem, więc
// odstęp od dołu jest stały.
export function SpeedDial({ actions, label = 'Nowe zgłoszenie' }: { actions: SpeedDialAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  // Otwarte menu żyje w przezroczystym Modalu, żeby przyciemnienie objęło cały ekran (także pasek zakładek i paski systemowe),
  // a nie tylko obszar bieżącego ekranu. `anchor` – położenie „+” w oknie; w Modalu rysujemy kopię przycisku w tym samym miejscu.
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const fabRef = useRef<View>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: open ? 1 : 0, duration: open ? 200 : 150, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      .start(({ finished }) => { if (finished && !open) setAnchor(null); });
  }, [open, anim]);

  const single = actions.length === 1;
  const run = (a: SpeedDialAction) => { setOpen(false); a.onPress(); };
  const show = () => fabRef.current?.measureInWindow((x, y, w, h) => { setAnchor({ x, y, w, h }); setOpen(true); });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  const fab = (onPress: () => void, menu: boolean) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={single ? actions[0]?.label : menu ? 'Zamknij menu' : label}
      accessibilityState={single ? undefined : { expanded: menu }}
      android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}
      style={styles.fab}
    >
      <Animated.View style={menu ? { transform: [{ rotate }] } : undefined}>
        <Svg width={26} height={26} viewBox="0 0 24 24"><Path d={MD.add} fill="#fff" /></Svg>
      </Animated.View>
    </Pressable>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View ref={fabRef} collapsable={false} style={{ position: 'absolute', right: 16, bottom: 16 }}>
        {fab(() => (single ? run(actions[0]) : show()), false)}
      </View>

      {anchor ? (
        <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setOpen(false)}>
          {/* przyciemnione tło: widać, że menu jest modalne; dotknięcie zwija */}
          <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)', opacity: anim }]}>
            <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} accessibilityLabel="Zamknij menu" />
          </Animated.View>

          {/* kolumna kończy się dokładnie na „+” z ekranu: akcje rosną w górę od niego */}
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', top: 0, left: 0, width: anchor.x + anchor.w, height: anchor.y + anchor.h, justifyContent: 'flex-end', alignItems: 'flex-end' }}
          >
            {actions.map((a, i) => {
              const fromFab = actions.length - i; // dalsze akcje wjeżdżają z większej odległości
              return (
                <Animated.View
                  key={a.key}
                  pointerEvents={open ? 'box-none' : 'none'}
                  style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12 * fromFab, 0] }) }] }}
                >
                  <Pressable
                    onPress={() => run(a)}
                    accessibilityRole="button"
                    accessibilityLabel={a.label}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14, paddingRight: 8 }}
                  >
                    {({ pressed }) => (
                      <>
                        <View style={[styles.chip, pressed && { backgroundColor: ud.primaryContainer }]}>
                          <Text style={{ color: ud.heading, fontFamily: ud.fontBodyBold, fontSize: 15 }}>{a.label}</Text>
                        </View>
                        <View style={[styles.mini, pressed && { backgroundColor: ud.primaryOutline }]}>
                          <Svg width={22} height={22} viewBox="0 0 24 24"><Path d={a.icon} fill={ud.primaryDark} /></Svg>
                        </View>
                      </>
                    )}
                  </Pressable>
                </Animated.View>
              );
            })}
            {fab(() => setOpen((o) => !o), true)}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Material 3 FAB: 56 dp, zaokrąglony kwadrat 16 dp, uniesiony
  fab: { width: 56, height: 56, borderRadius: 16, overflow: 'hidden', backgroundColor: ud.primary, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  mini: { width: 40, height: 40, borderRadius: 12, backgroundColor: ud.primaryContainer, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  chip: { backgroundColor: ud.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, elevation: 3 },
});
