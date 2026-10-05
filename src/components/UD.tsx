import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { TAB_ICONS } from '../assets/tabIcons';
import { UD_LOGO_ASPECT, UD_LOGO_COLOR, UD_LOGO_SVG } from '../assets/udLogoSvg';
import { ud } from '../theme';
import type { BBox } from '../types';

// Pełne oficjalne logo UD (ikona + napis), zamiast tekstu "UD".
export function UdLogo({ height = 24, color }: { height?: number; color?: string }) {
  // `color` podmienia zielony z oficjalnego SVG (np. biały logotyp na zielonym nagłówku)
  const xml = color ? UD_LOGO_SVG.replaceAll(UD_LOGO_COLOR, color) : UD_LOGO_SVG;
  return <SvgXml xml={xml} height={height} width={height * UD_LOGO_ASPECT} />;
}

// Nagłówek (odwrócony względem webu): zielone tło, białe logo UD, ← wróć | żółty Dalej.
// paddingTop zawiera inset statusbara (zegar/bateria/kamera) – ten obszar jest
// zarezerwowany przez system i nie wolno tam kłaść nawigacji.
export function UdHeader({ title, onBack, onNext, nextLabel = 'Dalej', backLabel = 'wróć' }: { title?: string; onBack?: () => void; onNext?: () => void; nextLabel?: string; backLabel?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12, backgroundColor: ud.primary }}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={{ minWidth: 70 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>← {backLabel}</Text>
        </Pressable>
      ) : (
        <View style={{ minWidth: 70 }} />
      )}
      {title ? (
        <Text style={{ color: '#fff', fontFamily: ud.fontDisplay, fontSize: 26, letterSpacing: 1 }}>{title}</Text>
      ) : (
        <View style={{ transform: [{ translateY: -3 }] }}><UdLogo height={24} color="#ffffff" /></View> /* optycznie wyżej o 3 px */
      )}
      {onNext ? (
        <Pressable onPress={onNext} style={{ backgroundColor: ud.accent, borderRadius: ud.radiusPill, paddingHorizontal: 20, paddingVertical: 10 }}>
          <Text style={{ color: ud.onAccent, fontFamily: ud.fontDisplay, fontSize: 15 }}>{nextLabel}</Text>
        </Pressable>
      ) : (
        <View style={{ minWidth: 70 }} />
      )}
    </View>
  );
}

export function UdCard({ children }: React.PropsWithChildren) {
  return (
    <View style={{ backgroundColor: ud.surface, borderRadius: ud.radiusCard, padding: 16, marginVertical: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}>
      {children}
    </View>
  );
}

type BtnVariant = 'primary' | 'accent' | 'outline';
export function UdButton({ title, onPress, variant = 'primary', disabled }: { title: string; onPress: () => void; variant?: BtnVariant; disabled?: boolean }) {
  const styles: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: ud.primary, fg: '#fff' },
    accent: { bg: ud.accent, fg: ud.onAccent },
    outline: { bg: ud.surface, fg: ud.primary, border: ud.primary },
  };
  const s = styles[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ backgroundColor: disabled ? ud.primaryOutline : s.bg, borderRadius: variant === 'primary' || variant === 'accent' ? ud.radiusPill : ud.radiusButton, paddingHorizontal: 20, paddingVertical: 13, alignItems: 'center', borderWidth: s.border ? 2 : 0, borderColor: s.border, opacity: disabled ? 0.6 : 1, marginVertical: 6 }}
    >
      <Text style={{ color: disabled ? ud.muted : s.fg, fontFamily: ud.fontDisplay, fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

// Zdjęcie w ramce jak na webie + nakładka bbox.
// Kolory jak gen_propozycje.py: zielony = auto, czerwony lity = tablica zweryfikowana,
// pomarańczowy przerywany = niezweryfikowana.
//
// Boxy (plateBox/vehicleBox) są w 0..1000 względem MINIATURY wysłanej do backendu (nie
// oryginału z aparatu!) – to jest przestrzeń, w której model liczył bboxy. Image ma
// resizeMode="cover" (zachowuje proporcje, przycina nadmiar) – naiwne mapowanie procentowe na
// kontener jest błędne zawsze, gdy proporcje różnią się od proporcji kontenera. Wołający
// (PairingScreen) powinien podać naturalWidth/naturalHeight = wymiary WYSŁANEJ miniatury
// (AnalyzeScreen zapisuje je w AnalysisRecord.photoDims) – to jednoznacznie zgadza się z
// przestrzenią bboxów, w odróżnieniu od Image.getSize(oryginał), które na zdjęciach z
// EXIF-orientacją bywa niezgodne z tym, co faktycznie poszło do modelu (bufor sensora vs.
// wyświetlana orientacja) i dawało systematycznie "off" ramki. Image.getSize zostaje jako
// fallback dla wywołań bez tych propsów (np. starszy wpis cache).
export function UdPhoto({
  uri,
  plateBox,
  vehicleBox,
  plateVerified,
  debugPlateBox,
  naturalWidth,
  naturalHeight,
  height = 200,
}: {
  uri?: string;
  plateBox?: BBox | null;
  vehicleBox?: BBox | null;
  plateVerified?: boolean | null;
  // TYMCZASOWE (debug): box tablicy wg samego modelu (przed nadpisaniem przez ALPR), rysowany
  // obok plateBox (ALPR) w innym kolorze, do porównania w PairingScreen. Usunąć razem z
  // VisionPhoto.plate_debug, gdy porównanie przestanie być potrzebne.
  debugPlateBox?: BBox | null;
  naturalWidth?: number;
  naturalHeight?: number;
  height?: number;
}) {
  const [containerW, setContainerW] = useState(0);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const natural = naturalWidth && naturalHeight ? { w: naturalWidth, h: naturalHeight } : measured;

  useEffect(() => {
    setMeasured(null);
    if (!uri || (naturalWidth && naturalHeight)) return; // dims podane – nie zgaduj z oryginału
    Image.getSize(
      uri,
      (w, h) => setMeasured({ w, h }),
      () => setMeasured(null),
    );
  }, [uri, naturalWidth, naturalHeight]);

  // Transformacja "cover": obraz skalowany tak, by wypełnić kontener, nadmiar wycentrowany
  // i przycięty. scale/offsetX/offsetY mapują piksele ORYGINAŁU na piksele KONTENERA.
  let scale = 0;
  let offsetX = 0;
  let offsetY = 0;
  if (natural && containerW > 0 && height > 0) {
    scale = Math.max(containerW / natural.w, height / natural.h);
    offsetX = (natural.w * scale - containerW) / 2;
    offsetY = (natural.h * scale - height) / 2;
  }

  const box = (b: BBox, color: string, dashed?: boolean): ViewStyle | null => {
    if (!scale) return null; // wymiary jeszcze nieznane – nie rysuj krzywej ramki
    const px = (b.x / 1000) * natural!.w;
    const py = (b.y / 1000) * natural!.h;
    const pw = (b.w / 1000) * natural!.w;
    const ph = (b.h / 1000) * natural!.h;
    const left = px * scale - offsetX;
    const top = py * scale - offsetY;
    return {
      position: 'absolute',
      left,
      top,
      width: pw * scale,
      height: ph * scale,
      borderWidth: 2,
      borderColor: color,
      borderStyle: dashed ? 'dashed' : 'solid',
    };
  };

  if (!uri) {
    return (
      <View style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: ud.primary, borderRadius: ud.radiusCard, height, alignItems: 'center', justifyContent: 'center', backgroundColor: ud.surface }}>
        <Text style={{ color: ud.primary, fontWeight: '700', textAlign: 'center', paddingHorizontal: 24 }}>Dodaj zdjęcie z widocznym wykroczeniem.</Text>
      </View>
    );
  }
  const vBoxStyle = vehicleBox ? box(vehicleBox, ud.primary) : null;
  const pBoxStyle = plateBox ? box(plateBox, plateVerified === false ? ud.plateUnverified : ud.plateVerified, plateVerified === false) : null;
  // TYMCZASOWE (debug): box tablicy wg modelu, niebieski przerywany, niezależny od plateVerified.
  const dBoxStyle = debugPlateBox ? box(debugPlateBox, ud.plateDebugModel, true) : null;
  return (
    <View
      style={{ borderWidth: 2, borderColor: ud.primary, borderRadius: ud.radiusCard, overflow: 'hidden', height, backgroundColor: ud.surfaceLow }}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
    >
      <View style={{ flex: 1 }}>
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        {vBoxStyle ? <View style={vBoxStyle} /> : null}
        {pBoxStyle ? <View style={pBoxStyle} /> : null}
        {dBoxStyle ? <View style={dBoxStyle} /> : null}
      </View>
    </View>
  );
}

// Cztery zakładki jak na webie (_app-tabbar.html.twig): Start, Nowe, Zgłoszenia, Konto.
// `screens` = ekrany, na których zakładka świeci się jako aktywna (cały proces dodawania = „Nowe”).
const TABS = [
  { key: 'Start', route: 'Dashboard', icon: TAB_ICONS.start, screens: ['Dashboard'] },
  { key: 'Nowe', route: 'NewReport', icon: TAB_ICONS.nowe, screens: ['NewReport', 'ReportConfirm', 'ReportDone'] },
  { key: 'Zgłoszenia', route: 'Reports', icon: TAB_ICONS.zgloszenia, screens: ['Reports'] },
  { key: 'Konto', route: 'Account', icon: TAB_ICONS.konto, screens: ['Account'] },
];

// Dolny pasek jak na webie; aktywna zakładka na zielono.
// paddingBottom zawiera inset paska gestów – systemowy obszar, nie nawigacja apki.
export function UdTabs({ current, navigate }: { current: string; navigate: (r: string) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.95)', borderTopWidth: 1, borderTopColor: ud.hairline, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 0) + 10, paddingHorizontal: 6 }}>
      {TABS.map((t) => {
        const active = t.screens.includes(current);
        const color = active ? ud.primary : ud.tabInactive;
        return (
          <Pressable key={t.key} onPress={() => navigate(t.route)} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <SvgXml xml={t.icon.replace('COLOR', color)} width={22} height={22} />
            <Text style={{ fontSize: 10.5, color, fontFamily: ud.fontBodyBold }}>{t.key}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
