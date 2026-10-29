// Wariant „dev” (APP_VARIANT=development, ustawiany w eas.json → profil development) ma własny identyfikator
// aplikacji, nazwę i scheme, dzięki czemu development client instaluje się obok wersji staging/prod z APK.
const fs = require('fs');
const path = require('path');

// Wersja aplikacji (semver) pochodzi z pliku VERSION – źródło prawdy dla buildów (scripts/bump-version.sh, docs/RELEASE.md).
// Numer buildu (iOS buildNumber / Android versionCode) nadaje EAS (appVersionSource: remote + autoIncrement).
const VERSION = fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8').trim();

const IS_DEV = process.env.APP_VARIANT === 'development';

// Link logowania z maila otwiera appkę (App Link, src/lib/emailLinkLogin.ts). Hosty = authDomain obu projektów Firebase
// (własne domeny Hostingu, ENVS w src/config.ts; sendEmailLink podaje je jako linkDomain) – jeden manifest dla staging i prod.
// Tylko /__/auth/links: linki z www (/__/auth/action na tym samym hoście) mają dalej otwierać przeglądarkę.
// Weryfikację (autoVerify) daje Hosting, gdy appka jest zarejestrowana w projekcie z SHA-256 klucza podpisu.
const EMAIL_LINK_HOSTS = ['auth-staging.uprzejmiedonosze.net', 'auth.uprzejmiedonosze.net'];
const emailLinkFilter = {
  action: 'VIEW',
  autoVerify: true,
  data: EMAIL_LINK_HOSTS.map((host) => ({ scheme: 'https', host, pathPrefix: '/__/auth/links' })),
  category: ['BROWSABLE', 'DEFAULT'],
};

module.exports = ({ config }) => ({
  ...config,
  version: VERSION,
  name: IS_DEV ? 'UD PRO (dev)' : config.name,
  scheme: IS_DEV ? 'udpro-dev' : config.scheme,
  ios: {
    ...config.ios,
    bundleIdentifier: IS_DEV ? 'net.uprzejmiedonosze.pro.dev' : config.ios.bundleIdentifier,
    // Passkeye (RP ID = host backendu) działają tylko na prod i shadow; staging i dev client nie mają AASA.
    ...(IS_DEV ? {} : { associatedDomains: ['webcredentials:uprzejmiedonosze.net', 'webcredentials:shadow.uprzejmiedonosze.net'] }),
  },
  android: {
    ...config.android,
    package: IS_DEV ? 'net.uprzejmiedonosze.pro.dev' : config.android.package,
    // dev client (inny pakiet) nie jest zarejestrowany w Firebase – link i tak by się nie zweryfikował
    intentFilters: [...(config.android.intentFilters ?? []), ...(IS_DEV ? [] : [emailLinkFilter])],
  },
  // QR z `expo start --dev-client` otwiera exp+<slug>://, a slug jest wspólny dla wszystkich wariantów. Bez tego
  // plugin (stosowany automatycznie) dopisywał ten scheme też do buildów staging/prod, więc skan QR otwierał appkę
  // ze sklepu zamiast dev clienta.
  plugins: [...(config.plugins ?? []), ['expo-dev-client', { addGeneratedScheme: IS_DEV }]],
});
