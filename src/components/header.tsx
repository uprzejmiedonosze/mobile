import { Platform, Pressable, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { UdLogo } from './UD';
import { useAuth } from '../store/useAuth';
import { isProcessParams } from '../lib/tabRoutes';
import { rippleOnDark, ud } from '../theme';

// Natywny nagłówek (pasek aplikacji na Androidzie, UINavigationBar na iOS) w barwach marki: zielone tło, białe napisy.
export const headerOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: ud.primary },
  headerTintColor: '#ffffff',
  headerTitleStyle: { color: '#ffffff', fontFamily: ud.fontDisplay },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
};

// iOS: duży tytuł zwijany przy przewijaniu. Ekran musi zaczynać się od przewijanej treści z contentInsetAdjustmentBehavior="automatic".
export const largeTitle: NativeStackNavigationOptions = Platform.OS === 'ios'
  ? { headerLargeTitleEnabled: true, headerLargeStyle: { backgroundColor: ud.primary }, headerLargeTitleStyle: { color: '#ffffff', fontFamily: ud.fontDisplay }, headerLargeTitleShadowVisible: false }
  : {};

// Zakładka dolnego menu: bez „wstecz” i gestu cofania, bez animacji przejścia (jak przełączenie karty).
export const tabOptions: NativeStackNavigationOptions = { headerBackVisible: false, gestureEnabled: false, animation: 'none' };

// „Nowe”: zakładka, a z editId / waitingIds – ekran procesu ze zwykłym „wstecz”.
export const newReportOptions = ({ route }: { route: { params?: object } }): NativeStackNavigationOptions =>
  isProcessParams(route.params) ? { title: '' } : { ...tabOptions, ...largeTitle, title: 'Nowe zgłoszenie' };

// Logo w miejscu tytułu (Start, potwierdzenie, podsumowanie); patron dostaje żółte „PRO”.
export function HeaderBrand() {
  const isPatron = useAuth((a) => a.isPatron);
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={isPatron ? 'Uprzejmie Donoszę PRO' : 'Uprzejmie Donoszę'} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <UdLogo height={22} color="#ffffff" />
      {isPatron ? <Text style={{ color: ud.accent, fontFamily: ud.fontDisplay, fontSize: 16, letterSpacing: 0.5 }}>PRO</Text> : null}
    </View>
  );
}

// Ikony przycisków nagłówka (stroke Feather, białe): strzałka „wstecz” i ołówek „popraw”.
const ICONS = {
  back: { label: 'Wróć', xml: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>' },
  edit: { label: 'Popraw zgłoszenie', xml: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' },
};

export function HeaderButton({ icon = 'back', onPress }: { icon?: keyof typeof ICONS; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={ICONS[icon].label}
      android_ripple={{ ...rippleOnDark, borderless: true }}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: Platform.OS === 'android' ? 8 : 0 }}>
      <SvgXml xml={ICONS[icon].xml} width={24} height={24} />
    </Pressable>
  );
}
