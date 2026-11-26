import { useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useReducedMotion, withSpring } from 'react-native-reanimated';

// Płynne rozwijanie/zwijanie (zasady Apple): wysokość rośnie sprężyną krytycznie tłumioną (bez odbicia, ~0,35 s), treść poniżej
// zjeżdża razem z nią, a zawartość się pojawia. Sprężyna startuje od bieżącej wartości, więc ponowne dotknięcie w trakcie
// animacji płynnie ją odwraca. Przy włączonym „Ogranicz ruch” zmiana jest natychmiastowa.
// Zawartość renderujemy dopiero przy pierwszym otwarciu (bez wczytywania obrazków na zapas), potem zostaje zamontowana.
const SPRING = { duration: 350, dampingRatio: 1 } as const;

export function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [height, setHeight] = useState(0);
  if (open && !mounted) setMounted(true);

  const progress = useDerivedValue(() => (reduceMotion ? (open ? 1 : 0) : withSpring(open ? 1 : 0, SPRING)), [open, reduceMotion]);
  const style = useAnimatedStyle(() => ({ height: progress.value * height, opacity: progress.value }), [height]);

  if (!mounted) return null;
  return (
    <Animated.View style={[{ overflow: 'hidden' }, style]} pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
      {/* pełna wysokość zawartości mierzona bez ograniczenia rodzica – na nią rośnie kontener */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
        {children}
      </View>
    </Animated.View>
  );
}
