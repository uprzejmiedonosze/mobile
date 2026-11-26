// Widget iOS „Szybkie zgłoszenie” (@bacons/apple-targets): ekran główny + ekran blokady. Tylko deep linki do tras
// expo-router (/app/new, /app/camera, /app/waiting) – bez App Group i bez danych z appki. Kod: targets/widget/*.swift.
// Bundle id = <bundle appki>.widget (od nazwy katalogu), więc wariant dev (net.uprzejmiedonosze.pro.dev) dostaje własny widget.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: 'widget',
  name: 'UDWidget',
  displayName: 'Uprzejmie Donoszę',
  icon: '../../assets/icon.png',
  // jak główna appka (IPHONEOS_DEPLOYMENT_TARGET 16.4); containerBackground z iOS 17 jest za `if #available`
  deploymentTarget: '16.4',
  colors: {
    $accent: '#0d7a55',
    $widgetBackground: { light: '#0d7a55', dark: '#0a5c40' },
    udPrimary: '#0d7a55',
    udPrimaryDark: '#0a5c40',
  },
});
