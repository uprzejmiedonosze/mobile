import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
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
import { AccountScreen } from './src/screens/AccountScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { WebPageScreen } from './src/screens/WebPageScreen';
import { UpdateRequiredScreen } from './src/screens/UpdateRequiredScreen';

import { PhotoPickerHost } from './src/components/PhotoPickerHost';
import { ToastHost } from './src/components/ToastHost';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { UdLogo } from './src/components/UD';
import { installGlobalLogHandlers, log } from './src/lib/log';
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
    // Bramka wersji: przy starcie i przy każdym powrocie do apki (throttling w store); błąd sieci nie blokuje.
    checkUpdate(true);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') checkUpdate();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (updateStatus === 'soft' && !softShown.current) {
      softShown.current = true;
      toast.info('Dostępna jest nowa wersja aplikacji.');
    }
  }, [updateStatus]);

  const logged = status === 'logged' && !!idToken;
  const registered = registrationChecked && isRegistered && isTermsConfirmed;

  useEffect(() => {
    if (logged && !registrationChecked) checkRegistration();
  }, [logged, registrationChecked, checkRegistration]);

  return (
    <SafeAreaProvider>
    <ErrorBoundary>
    <NavigationContainer>
      {/* zielony nagłówek (UdHeader) → jasne ikony; jasny ekran startowy → ciemne */}
      <StatusBar style={updateStatus === 'required' || !fontsLoaded || !ready || (logged && !registrationChecked) ? 'dark' : 'light'} />
      {updateStatus === 'required' && fontsLoaded ? (
        <UpdateRequiredScreen />
      ) : !fontsLoaded || !ready || (logged && !registrationChecked) ? (
        <View style={{ flex: 1, backgroundColor: ud.surfaceLow, alignItems: 'center', justifyContent: 'center' }}>
          <UdLogo height={32} />
          <Text style={{ color: ud.muted, marginTop: 8 }}>{ready ? 'sprawdzam konto…' : 'sprawdzam sesję…'}</Text>
        </View>
      ) : !logged ? (
        <Stack.Navigator initialRouteName="Account" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Account" component={AccountScreen} />
          <Stack.Screen name="WebPage" component={WebPageScreen} />
        </Stack.Navigator>
      ) : !registered ? (
        <Stack.Navigator initialRouteName="Onboarding" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="WebPage" component={WebPageScreen} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator initialRouteName="Dashboard" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen name="NewReport" component={NewReportScreen} />
          <Stack.Screen name="ReportConfirm" component={ReportConfirmScreen} />
          <Stack.Screen name="ReportDone" component={ReportDoneScreen} />
          <Stack.Screen name="Reports" component={ReportsScreen} />
          <Stack.Screen name="Account" component={AccountScreen} />
          <Stack.Screen name="WebPage" component={WebPageScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
    <PhotoPickerHost />
    <ToastHost />
    </ErrorBoundary>
    </SafeAreaProvider>
  );
}
