import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { PublicSans_400Regular, PublicSans_700Bold } from '@expo-google-fonts/public-sans';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { NewReportScreen } from './src/screens/NewReportScreen';
import { ReportConfirmScreen } from './src/screens/ReportConfirmScreen';
import { ReportDoneScreen } from './src/screens/ReportDoneScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { ReportSheet } from './src/screens/ReportSheet';
import { LetterScreen } from './src/screens/LetterScreen';
import { QuotaInfoScreen } from './src/screens/QuotaInfoScreen';
import { AccountScreen } from './src/screens/AccountScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { WebPageScreen } from './src/screens/WebPageScreen';
import { WaitingRoomScreen } from './src/screens/WaitingRoomScreen';
import { UpdateRequiredScreen } from './src/screens/UpdateRequiredScreen';

import { PhotoPickerHost } from './src/components/PhotoPickerHost';
import { ToastHost } from './src/components/ToastHost';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { UdSplash } from './src/components/UD';
import { HeaderBrand, headerOptions, pageTitle, newReportOptions, tabOptions } from './src/components/header';
import { installGlobalLogHandlers, log } from './src/lib/log';
import { installE2eLogin } from './src/lib/e2eLogin';
import { installEmailLinkLogin } from './src/lib/emailLinkLogin';
import { useDeepLinks } from './src/lib/useDeepLinks';
import { useAuth } from './src/store/useAuth';
import { useAppUpdate } from './src/store/useAppUpdate';
import { toast } from './src/store/useToast';
import { udConfig, udEnv } from './src/config';
import { ud } from './src/theme';

const Stack = createNativeStackNavigator();

// Bramka: bez sesji apka pokazuje TYLKO logowanie (jak web wymaga loginu do zgłoszeń).
// Po zalogowaniu App przełącza się na stos główny automatycznie (status w store) – ale
// dopiero po sprawdzeniu rejestracji UD (GET /api/rest/user/, patrz useAuth.checkRegistration):
// świeże konto Google nie ma jeszcze wiersza w bazie UD i idzie do Onboarding zamiast Picker.
export default function App() {
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

  // Linki do ekranów (udpro:///app/…) – dopiero gdy wiadomo, czy jest sesja, i stoi stos zalogowanej części.
  const navigation = useNavigationContainerRef<any>();
  const [navReady, setNavReady] = useState(false);
  const settled = ready && !(logged && !registrationChecked) && !['verifying', 'google-signing', 'passkey-signing'].includes(status);
  const splash = !fontsLoaded || !ready || (logged && !registrationChecked);
  useDeepLinks(navigation, settled && fontsLoaded ? logged && registered : null, navReady && !splash && updateStatus !== 'required');

  return (
    <SafeAreaProvider>
    <ErrorBoundary>
    <NavigationContainer ref={navigation} onReady={() => setNavReady(true)}>
      <StatusBar style="dark" />
      {updateStatus === 'required' && fontsLoaded ? (
        <UpdateRequiredScreen />
      ) : splash ? (
        <UdSplash label={ready ? 'sprawdzam konto…' : 'sprawdzam sesję…'} />
      ) : !logged ? (
        <Stack.Navigator initialRouteName="Account" screenOptions={headerOptions}>
          {/* logowanie bez nagłówka */}
          <Stack.Screen name="Account" component={AccountScreen} options={{ headerShown: false, title: 'Logowanie' }} />
          <Stack.Screen name="WebPage" component={WebPageScreen} options={{ title: '' }} />
        </Stack.Navigator>
      ) : !registered ? (
        <Stack.Navigator initialRouteName="Onboarding" screenOptions={headerOptions}>
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ title: 'Rejestracja' }} />
          <Stack.Screen name="WebPage" component={WebPageScreen} options={{ title: '' }} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator initialRouteName="Dashboard" screenOptions={headerOptions}>
          {/* zakładki dolnego menu (tabOptions) – patrz lib/tabRoutes.ts */}
          <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ ...tabOptions, title: 'Start', headerTitle: () => <HeaderBrand /> }} />
          <Stack.Screen name="NewReport" component={NewReportScreen} options={newReportOptions} />
          <Stack.Screen name="Reports" component={ReportsScreen} options={{ ...tabOptions, ...pageTitle, title: 'Zgłoszenia' }} />
          <Stack.Screen name="WaitingRoom" component={WaitingRoomScreen} options={{ ...tabOptions, ...pageTitle, title: 'Poczekalnia' }} />
          <Stack.Screen name="Account" component={AccountScreen} options={{ ...tabOptions, ...pageTitle, title: 'Konto' }} />
          {/* szczegóły zgłoszenia z listy: arkusz od dołu – do ¾ ekranu, przeciągnięty w górę na cały */}
          <Stack.Screen name="Report" component={ReportSheet} options={{ headerShown: false, presentation: 'formSheet', sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: ud.surfaceLow } }} />
          <Stack.Screen name="ReportConfirm" component={ReportConfirmScreen} options={{ title: 'Sprawdź zgłoszenie', headerTitle: () => <HeaderBrand /> }} />
          <Stack.Screen name="ReportDone" component={ReportDoneScreen} options={{ title: 'Zgłoszenie', headerTitle: () => <HeaderBrand />, headerBackVisible: false, gestureEnabled: false }} />
          <Stack.Screen name="Letter" component={LetterScreen} options={{ title: 'Pismo' }} />
          <Stack.Screen name="QuotaInfo" component={QuotaInfoScreen} options={{ title: 'Limity' }} />
          {/* leniwie: expo-camera przy imporcie wymaga modułu natywnego, a build bez niego ma działać (poza tym ekranem) */}
          <Stack.Screen name="WaitingCamera" getComponent={() => require('./src/screens/WaitingCameraScreen').WaitingCameraScreen} options={{ headerShown: false, title: 'Aparat' }} />
          <Stack.Screen name="WebPage" component={WebPageScreen} options={{ title: '' }} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
    <PhotoPickerHost />
    <ToastHost />
    </ErrorBoundary>
    </SafeAreaProvider>
  );
}
