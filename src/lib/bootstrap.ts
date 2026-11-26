// Start procesu JS, przed expo-router: Sentry, reporter błędów, LogBox. Importowane jako pierwsze w index.ts
// (importy ES wykonują się po kolei), a korzeń nawigacji (app/_layout.tsx) owija Sentry.wrap.
import { LogBox } from 'react-native';

import * as Sentry from '@sentry/react-native';

import { sentryConfig } from '../config';
import { setErrorReporter } from './log';

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

// Logi tylko w terminalu Metro (src/lib/log.ts → console.*). LogBox pokazywał je dodatkowo jako
// żółte/czerwone nakładki w samej aplikacji – wyłączamy je; nieprzechwycone wyjątki dalej wywalają ErrorBoundary.
LogBox.ignoreAllLogs(true);
