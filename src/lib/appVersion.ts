// Wersja klienta wysyłana do backendu (nagłówek X-UD-Client) – serwer na tej podstawie
// może odrzucić zbyt starą aplikację kodem 426 (patrz useAppUpdate, API.md).
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import appConfig from '../../app.json';
import { SCHEMA } from './vision';
export { compareVersions } from './compareVersions';

// Wersja KONTRAKTU API, z którym appka została zbudowana (SCHEMA z lib/vision.ts = VISION_SCHEMA backendu). To ona decyduje
// o wymuszeniu aktualizacji: backend odrzuca (426) klienta o schemacie niższym niż jego `VISION_SCHEMA` (tylko „w dół”).
// EXPO_PUBLIC_FAKE_SCHEMA=7 (+ `expo start -c`) udaje starą appkę (starszy kontrakt) – do ręcznego sprawdzenia ekranu
// „Zaktualizuj”. Tylko w trybie deweloperskim.
const fakeSchema = __DEV__ ? parseInt(process.env.EXPO_PUBLIC_FAKE_SCHEMA ?? '', 10) : NaN;
export const apiSchema = Number.isFinite(fakeSchema) ? fakeSchema : SCHEMA;

// W Expo Go natywna wersja to wersja samego Expo Go (np. 57.0.9), nie naszej appki – wtedy bierzemy ją z app.json,
// inaczej bramka wersji (serwer: 426 poniżej minVersion) nigdy nie zadziała w dev.
const inExpoGo = Application.applicationId === 'host.exp.exponent';
export const appVersion = (inExpoGo ? (appConfig.expo.version ?? '0.0.0') : (Application.nativeApplicationVersion ?? '0.0.0'));
export const appBuild = Application.nativeBuildVersion ?? '0';
export const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

export function clientHeaders(): Record<string, string> {
  return { 'X-UD-Schema': String(apiSchema), 'X-UD-Client': `pro/${appVersion} (${appBuild}; ${platform})` };
}
