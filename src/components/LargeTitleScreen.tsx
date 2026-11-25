import { useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { MD } from './materialIcons';
import { Button as SwiftButton, Host, NavigationStack, RNHostView, ScrollView as SwiftScrollView, Toolbar, ToolbarItem } from '@expo/ui/swift-ui';
import type { SFSymbol } from 'sf-symbols-typescript';
import { background, labelStyle, navigationBarTitleDisplayMode, navigationTitle, refreshable, scrollEdgeEffectStyle } from '@expo/ui/swift-ui/modifiers';
import { ud } from '../theme';

type Props = {
  title: string;
  onRefresh?: () => Promise<void>; // pull-to-refresh (iOS: SwiftUI .refreshable, Android: RefreshControl)
  // Własny widok na środku paska zamiast dużego tytułu (np. logo na pulpicie) – SwiftUI ToolbarItem „principal”, tytuł w trybie inline.
  // `title` zostaje jako tytuł paska dla VoiceOver i przełącznika aplikacji.
  principal?: React.ReactNode;
  inlineTitle?: boolean; // mały tytuł na środku paska zamiast dużego (np. ekran wyniku z własnym nagłówkiem w treści)
  // Przyciski w pasku (SwiftUI ToolbarItem): `leading` po lewej (np. wstecz, gdy ekran jest nad zakładkami), `trailing` po prawej
  // (akcja drugorzędna ekranu, np. „Zacznij od nowa”). Na Androidzie – ikony w natywnym pasku aplikacji.
  leading?: BarAction;
  trailing?: BarAction;
  // Stały pasek na dole ekranu (np. główny przycisk „Wyślij”), poza przewijaną treścią – nad wcięciem ekranu.
  footer?: React.ReactNode;
  children: React.ReactNode;
};

export type BarAction = { label: string; systemImage?: SFSymbol; onPress: () => void; disabled?: boolean };

// Ekran z natywnym nagłówkiem (wspólny dla rejestracji i pulpitu): duży tytuł albo własny widok na środku paska (`principal`).
// iOS: prawdziwy nagłówek SwiftUI (@expo/ui, docs.expo.dev/versions/latest/sdk/ui/swift-ui): NavigationStack + navigationTitle
// w trybie „large” – duży tytuł zwija się przy przewijaniu do małego, pasek ma systemowy wygląd (iOS 26: liquid glass, miękkie
// wygaszenie treści – scrollEdgeEffectStyle). Treść zostaje w React Native, osadzona w SwiftUI ScrollView przez RNHostView;
// RNHostView nie narzuca szerokości, więc podajemy szerokość okna (inaczej dłuższe teksty wychodziły poza ekran).
// Android: natywny pasek aplikacji z nagłówka stosu (tytuł, `principal` na środku, akcje jako ikony) i zwykły ScrollView z treścią.
export function LargeTitleScreen({ title, onRefresh, principal, inlineTitle, leading, trailing, footer, children }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Stopka: tło ekranu z cienką linią u góry, odstęp od wcięcia/paska gestów.
  const footerBar = footer ? (
    <View style={{ backgroundColor: ud.surfaceLow, borderTopWidth: 1, borderTopColor: ud.hairline, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12) }}>{footer}</View>
  ) : null;
  const [refreshing, setRefreshing] = useState(false);

  if (Platform.OS === 'ios') {
    return (
      <>
        <StatusBar style="dark" />
        <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
        <Host style={{ flex: 1, backgroundColor: ud.surfaceLow }} useViewportSizeMeasurement>
          <NavigationStack>
            <Toolbar>
              <SwiftScrollView
                modifiers={[
                  navigationTitle(title),
                  navigationBarTitleDisplayMode(principal || inlineTitle ? 'inline' : 'large'),
                  scrollEdgeEffectStyle('soft', 'top'),
                  background(ud.surfaceLow),
                  ...(onRefresh ? [refreshable(onRefresh)] : []),
                ]}
              >
                <RNHostView matchContents={{ vertical: true }}>
                  <View style={{ width }}>{children}</View>
                </RNHostView>
              </SwiftScrollView>
              {principal || leading || trailing ? (
                <Toolbar.Content>
                  {leading ? (
                    <ToolbarItem placement="topBarLeading">
                      <SwiftButton label={leading.label} systemImage={leading.systemImage} onPress={leading.disabled ? undefined : leading.onPress} modifiers={leading.systemImage ? [labelStyle('iconOnly')] : []} />
                    </ToolbarItem>
                  ) : null}
                  {principal ? (
                    <ToolbarItem placement="principal">
                      <RNHostView matchContents>
                        <View>{principal}</View>
                      </RNHostView>
                    </ToolbarItem>
                  ) : null}
                  {trailing ? (
                    <ToolbarItem placement="topBarTrailing">
                      {/* z ikoną – sam symbol (labelStyle iconOnly → okrągły przycisk paska); tytuł zostaje dla VoiceOver */}
                      <SwiftButton label={trailing.label} systemImage={trailing.systemImage} onPress={trailing.disabled ? undefined : trailing.onPress} modifiers={trailing.systemImage ? [labelStyle('iconOnly')] : []} />
                    </ToolbarItem>
                  ) : null}
                </Toolbar.Content>
              ) : null}
            </Toolbar>
          </NavigationStack>
        </Host>
        {footerBar}
        </View>
      </>
    );
  }

  // Android: prawdziwy pasek aplikacji (Material top app bar) – nagłówek natywnego stosu, w którym siedzi ekran
  // (zakładki: TabStack, ekrany procesów: app/app/_layout.tsx, rejestracja: app/_layout.tsx). Wstecz tylko jawne (`leading`),
  // bo strzałka systemowa nie zna własnej logiki ekranu (np. pytania o porzucenie szkicu).
  return (
    <>
      <StatusBar style="dark" />
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerTitle: principal ? () => principal : undefined,
          headerTitleAlign: principal ? 'center' : 'left',
          headerStyle: { backgroundColor: ud.surfaceLow },
          headerShadowVisible: false,
          headerTintColor: ud.primary,
          headerTitleStyle: { color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 22 },
          headerBackVisible: false,
          headerLeft: leading ? () => <AppBarAction action={leading} /> : undefined,
          headerRight: trailing ? () => <AppBarAction action={trailing} /> : undefined,
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: ud.surfaceLow }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? (
          <RefreshControl refreshing={refreshing} colors={[ud.primary]} onRefresh={() => { setRefreshing(true); onRefresh().finally(() => setRefreshing(false)); }} />
        ) : undefined}
      >
        {children}
      </ScrollView>
      {footerBar}
    </>
  );
}

// Odpowiedniki symboli SF (iOS) w ikonach Material dla akcji paska aplikacji.
const MATERIAL: Partial<Record<string, string>> = { 'chevron.left': MD.arrowBack, xmark: MD.close, camera: MD.camera, 'arrow.counterclockwise': MD.refresh };

// Akcja paska aplikacji (Android): okrągły przycisk 48 dp z ikoną, a bez odpowiednika ikony – przycisk tekstowy.
function AppBarAction({ action: a }: { action: BarAction }) {
  const path = a.systemImage ? MATERIAL[a.systemImage] : undefined;
  const color = a.disabled ? ud.muted : ud.primary;
  return (
    <Pressable
      onPress={a.onPress}
      disabled={a.disabled}
      accessibilityRole="button"
      accessibilityLabel={a.label}
      accessibilityState={{ disabled: !!a.disabled }}
      android_ripple={{ color: 'rgba(13, 122, 85, 0.15)', borderless: true, radius: 24 }}
      style={{ minWidth: 48, height: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: path ? 0 : 8, opacity: a.disabled ? 0.5 : 1 }}
    >
      {path ? (
        <Svg width={24} height={24} viewBox="0 0 24 24"><Path d={path} fill={color} /></Svg>
      ) : (
        <Text style={{ color, fontFamily: ud.fontBodyBold, fontSize: 15 }}>{a.label}</Text>
      )}
    </Pressable>
  );
}
