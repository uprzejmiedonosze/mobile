// Wariant „dev” (APP_VARIANT=development, ustawiany w eas.json → profil development) ma własny identyfikator
// aplikacji, nazwę i scheme, dzięki czemu development client instaluje się obok wersji staging/prod z APK.
const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => ({
  ...config,
  name: IS_DEV ? 'UD PRO (dev)' : config.name,
  scheme: IS_DEV ? 'udpro-dev' : config.scheme,
  ios: {
    ...config.ios,
    bundleIdentifier: IS_DEV ? 'net.uprzejmiedonosze.pro.dev' : config.ios.bundleIdentifier,
    // Passkeye (RP ID = host backendu) działają tylko na prod i shadow; staging i dev client nie mają AASA.
    ...(IS_DEV ? {} : { associatedDomains: ['webcredentials:uprzejmiedonosze.net', 'webcredentials:shadow.uprzejmiedonosze.net'] }),
  },
  android: { ...config.android, package: IS_DEV ? 'net.uprzejmiedonosze.pro.dev' : config.android.package },
});
