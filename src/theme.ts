// Tokeny marki UD (rd25) – wierne przepisanie z src/scss/lib/tokens.scss webu.
export const ud = {
  primary: '#0d7a55',
  primaryDark: '#0a5c40',
  primaryBright: '#12935f',
  primaryContainer: '#e7f2ec',
  primaryOutline: '#cfe6da',
  accent: '#E2C439',
  onAccent: '#16241d',
  surface: '#ffffff',
  surfaceLow: '#f4f3ef', // tło sekcji /app na webie (body.app-shell w my-apps.scss)
  tabInactive: '#8a9690',
  surfaceCream: '#eceae4',
  text: '#16241d',
  heading: '#0f2118',
  muted: '#6b7871',
  hairline: '#eeece6',
  plateYellow: '#E2C439',
  warning: '#a60',
  plateVerified: '#d32f2f',
  plateUnverified: '#e07b00',
  // TYMCZASOWE (debug): odczyt tablicy modelu (vs plateVerified/plateUnverified = odczyt ALPR).
  // Usunąć razem z UD.tsx::debugPlateBox i PairingScreen.tsx, gdy porównanie przestanie być potrzebne.
  plateDebugModel: '#1e6fd9',
  // pole zablokowane (formularz zgłoszenia): wyraźniejsze od tła ekranu (surfaceLow), ale wyszarzone
  lockedBg: '#e6e3da',
  lockedBorder: '#d3cfc3',
  radiusPill: 999,
  radiusButton: 14,
  radiusCard: 18,
  radiusSm: 8,
  fontDisplay: 'BricolageGrotesque_700Bold',
  fontBody: 'PublicSans_400Regular',
  fontBodyBold: 'PublicSans_700Bold',
} as const;

// Kolory pól tekstowych: bez nich Android bierze kolor podpowiedzi i kursora z motywu systemu – przy ciemnym motywie
// jasny tekst na naszym jasnym tle (np. niewidoczny placeholder). Rozwijane w każdym <TextInput {...inputColors}>.
export const inputColors = {
  placeholderTextColor: ud.muted,
  cursorColor: ud.primary,
  selectionColor: 'rgba(13, 122, 85, 0.3)',
  selectionHandleColor: ud.primary,
} as const;

// Przełączniki: wyłączony miał domyślny jasnoszary tor i kciuk – zlewał się z tłem. Rozwijane w <Switch {...switchColors}>.
export const switchColors = {
  trackColor: { false: ud.muted, true: ud.primary },
  thumbColor: '#ffffff',
  ios_backgroundColor: ud.muted,
} as const;

// Efekt dotknięcia (Android, Material ripple) – Pressable go nie ma domyślnie. Na zaokrąglonych elementach razem z
// overflow: 'hidden', inaczej fala wychodzi poza rogi; `rippleBorderless` dla ikon i zakładek bez tła.
export const ripple = { color: 'rgba(13, 122, 85, 0.15)' } as const;
export const rippleOnDark = { color: 'rgba(255, 255, 255, 0.3)' } as const;
export const rippleBorderless = { color: 'rgba(13, 122, 85, 0.2)', borderless: true } as const;
