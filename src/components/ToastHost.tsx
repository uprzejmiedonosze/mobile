import { Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../store/useToast';
import { ud } from '../theme';

// Renderowany w App.tsx, nad nawigacją – widoczny na każdym ekranie, także gdy formularz jest przewinięty
// (drugi egzemplarz w arkuszu zgłoszenia na iOS, który zasłania ten główny).
export function ToastHost({ top }: { top?: number }) {
  const toast = useToast((s) => s.toast);
  const hide = useToast((s) => s.hide);
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <Pressable
      onPress={hide}
      style={{
        position: 'absolute', left: 12, right: 12, top: top ?? insets.top + 8, zIndex: 1000, elevation: 10,
        backgroundColor: toast.kind === 'error' ? ud.plateVerified : ud.primary,
        borderRadius: ud.radiusButton, paddingVertical: 12, paddingHorizontal: 14,
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
      }}
    >
      <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold }}>{toast.text}</Text>
    </Pressable>
  );
}
