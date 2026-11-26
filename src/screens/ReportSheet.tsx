import { useEffect } from 'react';
import { Alert, Keyboard, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { changeStatus, setReportFields } from '../api/apps';
import { ToastHost } from '../components/ToastHost';
import { goTab } from '../lib/goTab';
import { openUdPage } from '../lib/openPage';
import { useReportSheet } from '../store/useReportSheet';
import { toast } from '../store/useToast';
import { ud } from '../theme';
import { ReportCard } from './ReportsScreen';

// Szczegóły zgłoszenia z listy w arkuszu wysuwanym od dołu (presentation: formSheet, App.tsx) – ta sama karta co na liście,
// rozwinięta: zmiana statusu, edycja, recydywa, treść, numer sprawy, uwagi, powiększanie zdjęć.
export function ReportSheet({ navigation }: any) {
  const app = useReportSheet((s) => s.app);
  const statuses = useReportSheet((s) => s.statuses);
  const categories = useReportSheet((s) => s.categories);
  const { update, leave } = useReportSheet.getState();

  // Android: schowanie klawiatury (wstecz/gest) nie zdejmuje fokusu z pola, więc nie byłoby blur i zapisu – zdejmujemy go sami.
  useEffect(() => {
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      TextInput.State.currentlyFocusedInput()?.blur();
    });
    return () => hide.remove();
  }, []);

  if (!app) return <View style={{ padding: 24 }}><Text style={{ color: ud.muted }}>Nie ma czego pokazać.</Text></View>;

  const onStatus = async (id: string, status: string) => {
    try { await changeStatus(id, status); update(id, { status }); }
    catch (e: any) { toast.error(e?.message ?? String(e)); }
  };

  const onFields = async (id: string, fields: { externalId?: string; privateComment?: string }) => {
    const r = await setReportFields(id, fields); // błąd wraca do pola (EditableField pokazuje komunikat)
    update(id, fields);
    // wysłane + numer sprawy → jak na webie: zaproponuj status „potwierdzone”
    if (r.suggestStatusChange && fields.externalId !== undefined) {
      Alert.alert('Numer sprawy', 'Zgłoszenie ma numer sprawy. Zmienić jego status na „potwierdzone”?', [
        { text: 'Nie', style: 'cancel' },
        { text: 'Tak', onPress: () => void onStatus(id, 'confirmed-sm') },
      ]);
    }
  };

  return (
    // ScrollView jako pierwsze dziecko ekranu – arkusz iOS łączy z nim gest rozwijania; tło daje contentStyle w App.tsx.
    <>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        nestedScrollEnabled
      >
        <ReportCard
          app={app}
          statuses={statuses}
          categories={categories}
          details={{
            onStatus,
            onFields,
            // Inne ekrany zastępują arkusz (otwarte nad nim chowałyby się pod spodem).
            onEdit: (id) => { leave(); navigation.replace('NewReport', { editId: id }); },
            onPage: (path, title) => { leave(); openUdPage({ navigate: navigation.replace }, path, title); },
            onAccount: () => { leave(); goTab(navigation, 'Account'); },
          }}
        />
      </ScrollView>
      {/* iOS rysuje arkusz nad całym oknem, więc główny ToastHost jest pod nim; na Androidzie widać tamten */}
      {Platform.OS === 'ios' ? <ToastHost top={16} /> : null}
    </>
  );
}
