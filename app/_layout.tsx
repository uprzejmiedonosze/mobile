import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { useFonts, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { PublicSans_400Regular, PublicSans_700Bold } from '@expo-google-fonts/public-sans';
import { UpdateRequiredScreen } from '../src/screens/UpdateRequiredScreen';
import { PhotoPickerHost } from '../src/components/PhotoPickerHost';
import { ToastHost } from '../src/components/ToastHost';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { UdSplash } from '../src/components/UD';
import { installGlobalLogHandlers, log } from '../src/lib/log';
import { installE2eLogin } from '../src/lib/e2eLogin';
import { installEmailLinkLogin } from '../src/lib/emailLinkLogin';
import { useAuth } from '../src/store/useAuth';
import { useAppUpdate } from '../src/store/useAppUpdate';
import { toast } from '../src/store/useToast';
import { udConfig, udEnv } from '../src/config';
import { ud } from '../src/theme';

// Tło ekranów pod animacjami przejść – bez tego między ekranami mignęłoby białe tło motywu.
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: ud.surfaceLow, primary: ud.primary } } as ComponentProps<typeof ThemeProvider>['value'];

// Bramka: bez sesji apka pokazuje TYLKO logowanie (jak web wymaga loginu do zgłoszeń). Stack.Protected przełącza trasy
// sam, gdy zmienia się status w store – ale dopiero po sprawdzeniu rejestracji UD (GET /api/rest/user/, patrz
// useAuth.checkRegistration): świeże konto Google nie ma jeszcze wiersza w bazie UD i idzie do Onboarding zamiast /app.
function RootLayout() {
  const status = useAuth((s) => s.status);
  const idToken = useAuth((s) => s.idToken);
  const refreshToken = useAuth((s) => s.refreshToken);
  const hydrate = useAuth((s) => s.hydrate);
  const registrationChecked = useAuth((s) => s.registrationChecked);
  const isRegistered = useAuth((s) => s.isRegistered);
  const isTermsConfirmed = useAuth((s) => s.isTermsConfirmed);
  const checkRegistration = useAuth((s) => s.checkRegistration);
  const updateStatus = useAppUpdate((s) => s.status);
  const checkUpdate = useAppUpdate((s) => s.check);
  const softShown = useRef(false);
  const [ready, setReady] = useState(false);
  const [fontsLoaded] = useFonts({ BricolageGrotesque_700Bold, PublicSans_400Regular, PublicSans_700Bold });

  useEffect(() => {
    installGlobalLogHandlers();
    log.info('app', `start (dev mode): logi z telefonu lecą też do terminala Metro; środowisko=${udEnv} (${udConfig.base})`);
    hydrate().finally(() => setReady(true));
    const removeE2e = installE2eLogin(); // no-op poza trybem e2e (EXPO_PUBLIC_E2E=1)
    // Bramka wersji: przy starcie i przy każdym powrocie do apki (throttling w store); błąd sieci nie blokuje.
    checkUpdate(true);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') checkUpdate();
    });
    return () => {
      sub.remove();
      removeE2e();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Link logowania z maila – dopiero po hydrate(), żeby nie logować ponownie kogoś, kto już ma sesję.
  useEffect(() => (ready ? installEmailLinkLogin() : undefined), [ready]);

  useEffect(() => {
    if (updateStatus === 'soft' && !softShown.current) {
      softShown.current = true;
      toast.info('Dostępna jest nowa wersja aplikacji.');
    }
  }, [updateStatus]);

  // refreshToken wystarcza: przy starcie z pamięci podręcznej ID token dociąga się w tle (validIdToken).
  const logged = status === 'logged' && (!!idToken || !!refreshToken);
  const registered = registrationChecked && isRegistered && isTermsConfirmed;

  useEffect(() => {
    if (logged && !registrationChecked) checkRegistration();
  }, [logged, registrationChecked, checkRegistration]);

  const splash = !fontsLoaded || !ready || (logged && !registrationChecked);

  return (
    <SafeAreaProvider>
    <ErrorBoundary>
    <ThemeProvider value={theme}>
      {/* zielony nagłówek (UdHeader) → jasne ikony; jasny ekran startowy → ciemne */}
      <StatusBar style={updateStatus === 'required' || splash ? 'dark' : 'light'} />
      {updateStatus === 'required' && fontsLoaded ? (
        <UpdateRequiredScreen />
      ) : splash ? (
        <UdSplash label={ready ? 'sprawdzam konto…' : 'sprawdzam sesję…'} />
      ) : (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ud.surfaceLow } }}>
          <Stack.Screen name="index" />
          <Stack.Protected guard={!logged}>
            <Stack.Screen name="login" />
          </Stack.Protected>
          <Stack.Protected guard={logged && !registered}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
          <Stack.Protected guard={logged && registered}>
            <Stack.Screen name="app" />
          </Stack.Protected>
          {/* strona z backendu w trybie ?embed – dostępna też przed zalogowaniem (regulamin, polityka prywatności) */}
          <Stack.Screen name="page" />
        </Stack>
      )}
    </ThemeProvider>
    <PhotoPickerHost />
    <ToastHost />
    </ErrorBoundary>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
