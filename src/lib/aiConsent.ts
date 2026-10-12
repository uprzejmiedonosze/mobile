// Zgoda na przekazanie zdjęć i skanów pism dostawcom AI (Apple 5.1.2(i), RODO): zdjęcia z pickera i skany pism trafiają przez backend UD
// do OpenAI (analiza wizyjna, OCR pism) i Plate Recognizer (odczyt tablicy), a na zdjęciach mogą być dane osób trzecich.
// Pytamy jednorazowo przed PIERWSZYM wyborem zdjęć / pisma; zgodę można cofnąć w Koncie. Wersja zgody: po zmianie zakresu
// przetwarzania podbij AI_CONSENT_VERSION, a appka zapyta ponownie. Zob. docs/STORE-PRIVACY.md.
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const AI_CONSENT_VERSION = '1';
const KEY = 'udpro.aiConsent';

export const AI_CONSENT_TITLE = 'Analiza zdjęć przez AI';
export const AI_CONSENT_TEXT =
  'Żeby rozpoznać pojazd, tablicę rejestracyjną i treść pisma, aplikacja wysyła wybrane zdjęcia i skany do serwera Uprzejmie Donoszę, ' +
  'który przekazuje je dostawcom usług AI i rozpoznawania tablic (m.in. OpenAI, Plate Recognizer). Na zdjęciach mogą być dane osób trzecich. ' +
  'Szczegóły znajdziesz w polityce prywatności na uprzejmiedonosze.net. Zgodę możesz cofnąć w zakładce Konto.';

export async function hasAiConsent(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY)) === AI_CONSENT_VERSION;
  } catch {
    return false;
  }
}

export async function revokeAiConsent(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
}

// true = można wysyłać zdjęcia do analizy. Bez zgody pokazuje okno i czeka na wybór; „Anuluj” = false (nic nie jest wysyłane).
export async function ensureAiConsent(): Promise<boolean> {
  if (await hasAiConsent()) return true;
  const granted = await new Promise<boolean>((resolve) => {
    Alert.alert(
      AI_CONSENT_TITLE,
      AI_CONSENT_TEXT,
      [
        { text: 'Anuluj', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Zgadzam się', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
  if (granted) await SecureStore.setItemAsync(KEY, AI_CONSENT_VERSION).catch(() => {});
  return granted;
}
