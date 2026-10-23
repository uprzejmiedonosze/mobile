import { Platform } from 'react-native';
import { passkeysOnStaging, udEnv } from '../config';
import { log } from './log';

// react-native-passkey czyta natywny moduł przy require (wzorzec jak google-signin w useAuth): w Expo Go / buildzie
// sprzed dodania biblioteki statyczny import wywaliłby apkę na starcie.
type PasskeyModule = typeof import('react-native-passkey');
let PasskeyLib: PasskeyModule['Passkey'] | null = null;
try {
  PasskeyLib = (require('react-native-passkey') as PasskeyModule).Passkey;
} catch (e: any) {
  log.warn('auth', `Passkey niedostępny (brak natywnego modułu): ${String(e?.message ?? e).slice(0, 120)}`);
}

// Passkey jest związany z domeną (RP ID = host backendu) i wymaga assetlinks.json / AASA tylko na hostach prod
// i shadow – staging ma je tylko dla buildów z Play (EXPO_PUBLIC_PASSKEYS_STAGING), dev client i APK z EAS nie.
export const passkeysAllowed = (env: string, nativeAvailable: boolean, onStaging = false): boolean =>
  (env === 'prod' || (env === 'staging' && onStaging)) && nativeAvailable;

export function passkeysEnabled(): boolean {
  try {
    // Staging ma tylko assetlinks.json (Android); iOS bez webcredentials:staging… w associatedDomains (app.config.js).
    return passkeysAllowed(udEnv, !!PasskeyLib && PasskeyLib.isSupported(), passkeysOnStaging && Platform.OS === 'android');
  } catch {
    return false;
  }
}

export function getPasskeyLib(): NonNullable<typeof PasskeyLib> {
  if (!PasskeyLib) throw new Error('Passkey niedostępny w tej wersji aplikacji.');
  return PasskeyLib;
}

// Użytkownik zamknął systemowe okno (iOS: UserCancelled, Android: UserCancelled / NotAllowed po anulowaniu).
export const isPasskeyCancelled = (e: any): boolean => /UserCancelled|Cancelled|Canceled/i.test(String(e?.error ?? e?.message ?? ''));
