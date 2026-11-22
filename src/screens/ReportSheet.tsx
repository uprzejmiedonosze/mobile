import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { changeStatus, setReportFields } from '../api/apps';
import { href } from '../lib/routes';
import { openUdPage } from '../lib/openPage';
import { useReportSheet } from '../store/useReportSheet';
import { toast } from '../store/useToast';
import { ud } from '../theme';
import { ReportCard } from './ReportsScreen';

// Szczegóły zgłoszenia z listy w natywnym arkuszu (presentation: formSheet, app/app/_layout.tsx) – ta sama karta co na liście,
// w trybie rozwiniętym: zmiana statusu, edycja, recydywa, treść, numer sprawy, uwagi, powiększanie zdjęć. Zmiany idą przez
// useReportSheet.update, więc lista poprawia się od razu. Przejście do innego ekranu najpierw zamyka arkusz (inaczej nowy
// ekran otworzyłby się pod nim).
export function ReportSheet() {
  const router = useRouter();
  const { app, statuses, categories, update } = useReportSheet();
  if (!app) return <View style={{ padding: 24 }}><Text style={{ color: ud.muted }}>Nie ma czego pokazać.</Text></View>;

  const leaveThen = (fn: () => void) => { router.back(); fn(); };

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
    <ScrollView
      style={{ backgroundColor: ud.surfaceLow }}
      contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      nestedScrollEnabled
    >
      <ReportCard
        sheet
        open
        app={app}
        statuses={statuses}
        categories={categories}
        onStatus={onStatus}
        onFields={onFields}
        onFieldFocus={() => {}}
        onToggle={() => {}}
        onEdit={(id) => leaveThen(() => router.push(href('EditReport', { editId: id })))}
        onPage={(path, title) => leaveThen(() => openUdPage(router, path, title))}
        onAccount={() => leaveThen(() => router.navigate(href('Account')))}
      />
    </ScrollView>
  );
}
