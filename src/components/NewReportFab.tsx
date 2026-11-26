import { useRouter } from 'expo-router';
import { href, newReportTab } from '../lib/routes';
import { useWaitingRoom, waitingRoomEnabled } from '../store/useWaitingRoom';
import { MD } from './materialIcons';
import { SpeedDial, type SpeedDialAction } from './SpeedDial';

// Dolny odstęp treści ekranu z pływającym „+”, żeby przycisk nie zasłaniał ostatniej karty.
export const FAB_SPACE = 96;
// Czy ekrany zakładek pokazują pływający „+” (Android: zamiast zakładki „Nowe”, patrz newReportTab w lib/routes).
export const fabShown = !newReportTab;

// Pływający „+” z akcjami nowego zgłoszenia – ten sam na każdej zakładce (Start, Zgłoszenia, Poczekalnia, Konto).
// Najbliżej kciuka aparat (zgłoszenia zaczynają się na ulicy, w pośpiechu). `hide` – akcje prowadzące na bieżący ekran.
// Rysowany jako ostatnie dziecko ekranu (SpeedDial: position absolute).
export function NewReportFab({ hide = [] }: { hide?: string[] }) {
  const router = useRouter();
  const waitingCount = useWaitingRoom((st) => st.photos.filter((p) => !p.draftId).length);
  if (!fabShown) return null;

  const actions: SpeedDialAction[] = [
    { key: 'new', label: 'Nowe zgłoszenie', icon: MD.noteAdd, onPress: () => router.navigate(href('NewReport')) },
    ...(waitingRoomEnabled ? [
      { key: 'waiting', label: waitingCount ? `Poczekalnia (${waitingCount})` : 'Poczekalnia', icon: MD.photoLibrary, onPress: () => router.navigate(href('WaitingRoom')) },
      { key: 'camera', label: 'Zrób zdjęcia', icon: MD.camera, onPress: () => router.push(href('WaitingCamera')) },
    ] : []),
  ].filter((a) => !hide.includes(a.key));

  return <SpeedDial actions={actions} />;
}
