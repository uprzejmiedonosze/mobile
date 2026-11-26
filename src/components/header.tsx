import { Platform, Pressable, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { PageHeader } from './PageHeader';
import { UdLogo } from './UD';
import { useAuth } from '../store/useAuth';
import { isProcessParams } from '../lib/tabRoutes';
import { rippleBorderless, ud } from '../theme';

// Natywny nagłówek (pasek aplikacji na Androidzie, UINavigationBar na iOS) jak w PR #9: jasny, w kolorze tła ekranu,
// ciemny tytuł i zielone przyciski. iOS używa systemowego kroju, Android – kroju marki.
const ios = Platform.OS === 'ios';

export const headerOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: ud.surfaceLow },
  headerTintColor: ud.primary,
  headerTitleStyle: ios ? { color: ud.heading } : { color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 22 },
  headerTitleAlign: ios ? 'center' : 'left',
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
};

// Zakładki z tytułem: na iOS własny nagłówek z H1 pod paskiem statusu (PageHeader), na Androidzie pasek aplikacji.
export const pageTitle: NativeStackNavigationOptions = ios
  ? { header: ({ options }) => <PageHeader title={options.title} /> }
  : {};

// Zakładka dolnego menu: bez „wstecz” i gestu cofania, bez animacji przejścia (jak przełączenie karty).
export const tabOptions: NativeStackNavigationOptions = { headerBackVisible: false, gestureEnabled: false, animation: 'none' };

// „Nowe”: zakładka, a z editId / waitingIds – ekran procesu ze zwykłym „wstecz”.
export const newReportOptions = ({ route }: { route: { params?: object } }): NativeStackNavigationOptions =>
  isProcessParams(route.params) ? { title: '' } : { ...tabOptions, ...pageTitle, title: 'Nowe zgłoszenie' };

// Logo w miejscu tytułu (Start, potwierdzenie, podsumowanie); patron dostaje żółtą plakietkę „PRO”.
export function HeaderBrand() {
  const isPatron = useAuth((a) => a.isPatron);
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={isPatron ? 'Uprzejmie Donoszę PRO' : 'Uprzejmie Donoszę'} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <UdLogo height={22} />
      {isPatron ? (
        <View style={{ backgroundColor: ud.accent, borderRadius: ud.radiusPill, paddingHorizontal: 7, paddingVertical: 1 }}>
          <Text style={{ color: ud.onAccent, fontFamily: ud.fontDisplay, fontSize: 11, letterSpacing: 0.5 }}>PRO</Text>
        </View>
      ) : null}
    </View>
  );
}

// Ikony przycisków nagłówka (stroke Feather, zielone): strzałka „wstecz” i ołówek „popraw”.
const ICONS = {
  back: { label: 'Wróć', xml: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ud.primary}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>` },
  edit: { label: 'Popraw zgłoszenie', xml: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ud.primary}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>` },
};

export function HeaderButton({ icon = 'back', onPress }: { icon?: keyof typeof ICONS; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={ICONS[icon].label}
      android_ripple={rippleBorderless}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: Platform.OS === 'android' ? 8 : 0 }}>
      <SvgXml xml={ICONS[icon].xml} width={24} height={24} />
    </Pressable>
  );
}
