import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { TAB_ICONS } from '../assets/tabIcons';
import { UD_LOGO_ASPECT, UD_LOGO_COLOR, UD_LOGO_SVG } from '../assets/udLogoSvg';
import { useAuth } from '../store/useAuth';
import { ripple, rippleBorderless, rippleOnDark, ud } from '../theme';
import type { BBox } from '../types';

// Pełne oficjalne logo UD (ikona + napis), zamiast tekstu "UD".
export function UdLogo({ height = 24, color }: { height?: number; color?: string }) {
  // `color` podmienia zielony z oficjalnego SVG (np. biały logotyp na zielonym nagłówku)
  const xml = color ? UD_LOGO_SVG.replaceAll(UD_LOGO_COLOR, color) : UD_LOGO_SVG;
  return <SvgXml xml={xml} height={height} width={height * UD_LOGO_ASPECT} />;
}

// Ikony nagłówka (stroke Feather, białe): strzałka „wstecz” i ołówek „popraw”.
const BACK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
const EDIT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

// Nagłówek (odwrócony względem webu): zielone tło, białe logo UD, ← wróć | żółty Dalej.
// paddingTop zawiera inset statusbara (zegar/bateria/kamera) – ten obszar jest
// zarezerwowany przez system i nie wolno tam kłaść nawigacji.
export function UdHeader({ title, onBack, onNext, nextLabel = 'Dalej', backIcon = 'arrow' }: { title?: string; onBack?: () => void; onNext?: () => void; nextLabel?: string; backIcon?: 'arrow' | 'edit' }) {
  const insets = useSafeAreaInsets();
  const isPatron = useAuth((a) => a.isPatron);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12, backgroundColor: ud.primary }}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} android_ripple={{ ...rippleOnDark, borderless: true }} style={{ minWidth: 70 }}>
          <SvgXml xml={backIcon === 'edit' ? EDIT_ICON : BACK_ICON} width={24} height={24} />
        </Pressable>
      ) : (
        <View style={{ minWidth: onNext ? 70 : 0 }} />
      )}
      {title ? (
        <Text numberOfLines={1} ellipsizeMode="tail" style={{ flex: 1, textAlign: 'center', color: '#fff', fontFamily: ud.fontDisplay, fontSize: 26, letterSpacing: 1 }}>{title}</Text>
      ) : (
        // Patron: logo + żółte „PRO” (logo bez zmian; puste boki bez minWidth, żeby całość się zmieściła); translateY -3 = optycznie wyżej
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, transform: [{ translateY: -3 }] }}>
          <UdLogo height={24} color="#ffffff" />
          {isPatron ? <Text style={{ color: ud.accent, fontFamily: ud.fontDisplay, fontSize: 17, lineHeight: 22, letterSpacing: 0.5, transform: [{ translateY: 2 }] }}>PRO</Text> : null}
        </View>
      )}
      {onNext ? (
        <Pressable onPress={onNext} android_ripple={ripple} style={{ backgroundColor: ud.accent, borderRadius: ud.radiusPill, paddingHorizontal: 20, paddingVertical: 10, overflow: 'hidden' }}>
          <Text style={{ color: ud.onAccent, fontFamily: ud.fontDisplay, fontSize: 15 }}>{nextLabel}</Text>
        </Pressable>
      ) : (
        <View style={{ minWidth: onBack ? 70 : 0 }} />
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
// pill: zaokrąglenie „kapsułki” także dla outline (domyślnie outline ma radiusButton).
export function UdButton({ title, onPress, variant = 'primary', disabled, pill }: { title: string; onPress: () => void; variant?: BtnVariant; disabled?: boolean; pill?: boolean }) {
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
      android_ripple={variant === 'primary' ? rippleOnDark : ripple}
      style={{ overflow: 'hidden', backgroundColor: disabled ? ud.primaryOutline : s.bg, borderRadius: pill || variant === 'primary' || variant === 'accent' ? ud.radiusPill : ud.radiusButton, paddingHorizontal: 20, paddingVertical: 13, alignItems: 'center', borderWidth: s.border ? 2 : 0, borderColor: s.border, opacity: disabled ? 0.6 : 1, marginVertical: 6 }}
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
  { key: 'Zgłoszenia', route: 'Reports', icon: TAB_ICONS.zgloszenia, screens: ['Reports', 'Letter'] },
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
          <Pressable key={t.key} onPress={() => navigate(t.route)} android_ripple={rippleBorderless} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <SvgXml xml={t.icon.replace('COLOR', color)} width={22} height={22} />
            <Text style={{ fontSize: 10.5, color, fontFamily: ud.fontBodyBold }}>{t.key}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
