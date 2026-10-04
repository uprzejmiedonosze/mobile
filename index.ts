import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
// Logi tylko w terminalu Metro (src/lib/log.ts → console.*). LogBox pokazywał je dodatkowo jako
// żółte/czerwone nakładki w samej aplikacji – wyłączamy je; nieprzechwycone wyjątki dalej wywalają ErrorBoundary.
LogBox.ignoreAllLogs(true);

registerRootComponent(App);
