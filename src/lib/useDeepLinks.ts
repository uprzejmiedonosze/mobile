import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { deepLinkScreen } from './deepLink';
import { goTab } from './goTab';
import { waitingRoomEnabled } from '../store/useWaitingRoom';

// Link otwierający zamkniętą appkę przychodzi, zanim sprawdzimy sesję (splash, bez nawigatora), więc go zapamiętujemy:
// `signedIn` = null → czekamy; false → bez sesji link nic nie otwiera (przepada); true + gotowy nawigator → otwieramy.
export function useDeepLinks(navigation: NavigationContainerRefWithCurrent<any>, signedIn: boolean | null, navReady: boolean) {
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const take = (url: string | null) => {
      const screen = deepLinkScreen(url, waitingRoomEnabled);
      if (screen) setPending(screen);
    };
    Linking.getInitialURL().then(take).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => take(e.url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pending || signedIn === null) return;
    if (!signedIn) { setPending(null); return; }
    if (!navReady || !navigation.isReady()) return;
    goTab(navigation, pending);
    setPending(null);
  }, [pending, signedIn, navReady, navigation]);
}
