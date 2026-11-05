import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

import * as Sentry from '@sentry/react-native';

import App from './App';
import { sentryConfig } from './src/config';
import { setErrorReporter } from './src/lib/log';

// Raportowanie crashy tylko z buildów release i tylko gdy podano DSN. Bez PII: nie wysyłamy IP/e-maila,
// a z breadcrumbów HTTP wycinamy query (współrzędne, tablice).
Sentry.init({
  dsn: sentryConfig.dsn,
  environment: sentryConfig.environment,
  enabled: !__DEV__ && !!sentryConfig.dsn,
  sendDefaultPii: false,
  beforeBreadcrumb(crumb) {
    if ((crumb.category === 'fetch' || crumb.category === 'xhr') && typeof crumb.data?.url === 'string') {
      crumb.data = { ...crumb.data, url: crumb.data.url.split('?')[0] };
    }
    return crumb;
  },
});

// log.error → Sentry, z pominięciem tagów, które Sentry łapie sam (fatal/promise) albo ErrorBoundary (react) – bez duplikatów.
setErrorReporter((tag, msg) => {
  if (tag === 'fatal' || tag === 'promise' || tag === 'react') return;
  // Wyjątek zamiast captureMessage: tytuł zgłoszenia to „tag: komunikat”, a nie nazwa funkcji reportera (setErrorReporter$argument_0).
  // Fingerprint z tagiem i komunikatem bez cyfr (IP, kody, id) – różne błędy nie zlewają się w jedno zgłoszenie, a te same się łączą.
  const text = msg.slice(0, 300);
  const err = new Error(text);
  err.name = tag;
  Sentry.withScope((scope) => {
    scope.setLevel('error');
    scope.setTag('log_tag', tag);
    scope.setFingerprint([tag, text.replace(/\d+/g, '#')]);
    Sentry.captureException(err);
  });
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
// Logi tylko w terminalu Metro (src/lib/log.ts → console.*). LogBox pokazywał je dodatkowo jako
// żółte/czerwone nakładki w samej aplikacji – wyłączamy je; nieprzechwycone wyjątki dalej wywalają ErrorBoundary.
LogBox.ignoreAllLogs(true);

registerRootComponent(Sentry.wrap(App));
