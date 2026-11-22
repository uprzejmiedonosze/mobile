import { useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  // (akcja drugorzędna ekranu, np. „Zacznij od nowa”). Na Androidzie – tekstowe przyciski nad tytułem.
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
// Android: zwykły ScrollView z dużym tytułem (albo `principal` na środku) na początku treści.
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

  return (
    <>
      <StatusBar style="dark" />
      <ScrollView
        style={{ flex: 1, backgroundColor: ud.surfaceLow }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? (
          <RefreshControl refreshing={refreshing} colors={[ud.primary]} onRefresh={() => { setRefreshing(true); onRefresh().finally(() => setRefreshing(false)); }} />
        ) : undefined}
      >
        {leading || trailing ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: 8 }}>
            {[leading, trailing].map((a, i) => (a ? (
              <Pressable key={i} onPress={a.onPress} disabled={a.disabled} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, opacity: a.disabled ? 0.4 : pressed ? 0.6 : 1 })}>
                <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, fontSize: 15 }}>{i === 0 && a.systemImage === 'chevron.left' ? `‹ ${a.label}` : a.label}</Text>
              </Pressable>
            ) : <View key={i} />))}
          </View>
        ) : null}
        {principal ? (
          <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 8 }}>{principal}</View>
        ) : inlineTitle ? null : (
          <Text accessibilityRole="header" style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 32, lineHeight: 38, letterSpacing: -0.5, paddingHorizontal: 16, paddingTop: 24 }}>{title}</Text>
        )}
        {children}
      </ScrollView>
      {footerBar}
    </>
  );
}
