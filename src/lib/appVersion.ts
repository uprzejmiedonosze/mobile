// Wersja klienta wysyłana do backendu (nagłówek X-UD-Client) – serwer na tej podstawie
// może odrzucić zbyt starą aplikację kodem 426 (patrz useAppUpdate, API.md).
import { Platform } from 'react-native';
import * as Application from 'expo-application';
export { compareVersions } from './compareVersions';

export const appVersion = Application.nativeApplicationVersion ?? '0.0.0';
export const appBuild = Application.nativeBuildVersion ?? '0';
export const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

export function clientHeaders(): Record<string, string> {
  return { 'X-UD-Client': `pro/${appVersion} (${appBuild}; ${platform})` };
}
