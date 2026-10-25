import { udEnv } from '../config';
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

// Passkey jest związany z domeną (RP ID = host backendu) i działa tylko tam, gdzie backend ma assetlinks.json / AASA
// z kluczem podpisu buildu – na prod (i shadow, ten sam env). Poza prod przycisk jest ukryty: na stagingu logowanie
// passkeyem kończyło się błędem „An unknown error occurred” (UD-MOBILE-A/E).
export const passkeysAllowed = (env: string, nativeAvailable: boolean): boolean => env === 'prod' && nativeAvailable;

export function passkeysEnabled(): boolean {
  try {
    return passkeysAllowed(udEnv, !!PasskeyLib && PasskeyLib.isSupported());
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
