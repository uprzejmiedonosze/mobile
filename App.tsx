import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { PublicSans_400Regular, PublicSans_700Bold } from '@expo-google-fonts/public-sans';
import { PickerScreen } from './src/screens/PickerScreen';
import { AnalyzeScreen } from './src/screens/AnalyzeScreen';
import { PairingScreen } from './src/screens/PairingScreen';
import { ProposalsScreen } from './src/screens/ProposalsScreen';
import { AccountScreen } from './src/screens/AccountScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';

import { ErrorBoundary } from './src/components/ErrorBoundary';
import { installGlobalLogHandlers, log } from './src/lib/log';
import { useAuth } from './src/store/useAuth';
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
  const [ready, setReady] = useState(false);
  const [fontsLoaded] = useFonts({ BricolageGrotesque_700Bold, PublicSans_400Regular, PublicSans_700Bold });

  useEffect(() => {
    installGlobalLogHandlers();
    log.info('app', `start (dev mode): logi z telefonu lecą też do terminala Metro; środowisko=${udEnv} (${udConfig.base})`);
    hydrate().finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logged = status === 'logged' && !!idToken;
  const registered = registrationChecked && isRegistered && isTermsConfirmed;

  useEffect(() => {
    if (logged && !registrationChecked) checkRegistration();
  }, [logged, registrationChecked, checkRegistration]);

  return (
    <SafeAreaProvider>
    <ErrorBoundary>
    <NavigationContainer>
      <StatusBar style="auto" />
      {!fontsLoaded || !ready || (logged && !registrationChecked) ? (
        <View style={{ flex: 1, backgroundColor: ud.surfaceLow, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: ud.primary, fontWeight: '900', fontSize: 30 }}>UD</Text>
          <Text style={{ color: ud.muted, marginTop: 8 }}>{ready ? 'sprawdzam konto…' : 'sprawdzam sesję…'}</Text>
        </View>
      ) : !logged ? (
        <Stack.Navigator initialRouteName="Account" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Account" component={AccountScreen} />
        </Stack.Navigator>
      ) : !registered ? (
        <Stack.Navigator initialRouteName="Onboarding" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator initialRouteName="Picker" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Picker" component={PickerScreen} />
          <Stack.Screen name="Analyze" component={AnalyzeScreen} />
          <Stack.Screen name="Pairs" component={PairingScreen} />
          <Stack.Screen name="Proposals" component={ProposalsScreen} />
          <Stack.Screen name="Account" component={AccountScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
    </ErrorBoundary>
    </SafeAreaProvider>
  );
}
