// Logowanie kliknięciem w link z maila: system otwiera appkę linkiem Hostingu Firebase
// (https://<authDomain>/__/auth/links?link=…, intent filter w app.config.js). Wzór: e2eLogin.ts.
// Instalowane dopiero po hydrate(), żeby nie logować ponownie kogoś, kto już ma sesję. Adresu nie logujemy –
// kod siedzi zakodowany w parametrze `link`, poza zasięgiem redakcji SECRET_KEYS.
import { Linking } from 'react-native';
import { useAuth } from '../store/useAuth';

export function installEmailLinkLogin(): () => void {
  const handle = (url: string | null) => void useAuth.getState().completeEmailLink(url);
  Linking.getInitialURL().then(handle).catch(() => {});
  const sub = Linking.addEventListener('url', (e) => handle(e.url));
  return () => sub.remove();
}
