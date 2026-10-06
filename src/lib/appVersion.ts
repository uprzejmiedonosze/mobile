// Wersja klienta wysyłana do backendu (nagłówek X-UD-Client) – serwer na tej podstawie
// może odrzucić zbyt starą aplikację kodem 426 (patrz useAppUpdate, API.md).
import { Platform } from 'react-native';
import * as Application from 'expo-application';
export { compareVersions } from './compareVersions';

// EXPO_PUBLIC_FAKE_APP_VERSION=0.9.0 (+ `expo start -c`) udaje starą aplikację: bramka wersji (useAppUpdate) i nagłówek
// X-UD-Client dostają tę wersję – do ręcznego sprawdzenia ekranu „Zaktualizuj”. Tylko w trybie deweloperskim.
const fakeVersion = __DEV__ ? process.env.EXPO_PUBLIC_FAKE_APP_VERSION : undefined;
export const appVersion = fakeVersion || (Application.nativeApplicationVersion ?? '0.0.0');
export const appBuild = Application.nativeBuildVersion ?? '0';
export const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

export function clientHeaders(): Record<string, string> {
  return { 'X-UD-Client': `pro/${appVersion} (${appBuild}; ${platform})` };
}
