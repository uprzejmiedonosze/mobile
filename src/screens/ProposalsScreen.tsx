import { useEffect, useState } from 'react';
import { FlatList, Pressable, Switch, Text, TextInput, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { fetchCategories } from '../api/geo';
import { validIdToken } from '../api/udApi';
import { vehicleLine } from '../api/vehicle';
import { log } from '../lib/log';
import { useSession } from '../store/useSession';
import { ud, inputColors } from '../theme';
import { UdButton, UdCard, UdHeader, UdPhoto, UdTabs } from '../components/UD';
import type { Category } from '../types';

export function ProposalsScreen({ navigation }: any) {
  const { proposals, photos, updateProposal } = useSession();
  const [cats, setCats] = useState<Category[]>([]);
  const byId = new Map(photos.map((p) => [p.id, p]));
  const go = (r: string) => navigation.navigate(r);

  useEffect(() => {
    validIdToken()
      .then((t) => fetchCategories(t))
      .catch(() => fetchCategories())
      .then(setCats);
  }, []);

  const exportJson = async () => {
    try {
      const FS = FileSystem as any;
      const dir = FS.documentDirectory ?? FS.cacheDirectory;
      const path = `${dir}proposals.json`;
      await FS.writeAsStringAsync(path, JSON.stringify(proposals, null, 2));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path);
      log.info('propozycje', `eksport ${proposals.length} do ${path}`);
    } catch (e: any) {
      log.error('propozycje', `eksport: ${e?.message ?? e}`);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader onBack={() => go('Pairs')} onNext={exportJson} nextLabel="Dalej" />
      <FlatList
        data={proposals}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ListHeaderComponent={
          <UdCard>
            <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 17 }}>Propozycje zgłoszeń ({proposals.length}).</Text>
            <Text style={{ color: ud.muted, marginTop: 4 }}>Sprawdź tablicę, adres i kategorię. Bez wysyłki do UD w tym etapie.</Text>
          </UdCard>
        }
        renderItem={({ item }) => {
          return (
            <UdCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 16 }}>{item.pairId}</Text>
                {item.plateVerified === true ? (
                  <Text style={{ backgroundColor: ud.primaryContainer, color: ud.primary, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: ud.radiusPill, overflow: 'hidden' }}>box ✓</Text>
                ) : item.plateVerified === false ? (
                  <Text style={{ backgroundColor: ud.accent, color: ud.onAccent, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: ud.radiusPill, overflow: 'hidden' }}>box ?</Text>
                ) : null}
              </View>
              <UdPhoto uri={byId.get(item.contextPhotoId)?.uri} height={190} />
              <View style={{ height: 8 }} />
              {item.closeupPhotoId ? <UdPhoto uri={byId.get(item.closeupPhotoId)?.uri} height={110} /> : null}
              {item.sharedFrom ? <Text style={{ color: ud.muted }}>Kontekst pożyczony z {item.sharedFrom} (reguła B).</Text> : null}
              {item.markers?.length ? <Text style={{ color: ud.muted }}>Markery: {item.markers.join(', ')}</Text> : null}
              {item.reviewReasons?.map((r) => (
                <Text key={r} style={{ color: ud.warning }}>• {r}</Text>
              ))}
              <Text style={{ color: ud.heading, fontWeight: '700', marginTop: 10 }}>Numer rejestracyjny</Text>
              <TextInput {...inputColors} value={item.plateId ?? ''} onChangeText={(t) => updateProposal(item.id, { plateId: t || null })} placeholder="np. ZS 060NH" autoCapitalize="characters" style={{ borderWidth: 2, borderColor: ud.primary, borderRadius: ud.radiusSm, padding: 10, marginTop: 6, fontFamily: 'monospace', fontWeight: '700' }} />
              <Text style={{ color: ud.muted, marginTop: 4 }}>{vehicleLine(item.vehicleInfo)}</Text>
              {item.recydywa && item.recydywa.appsCnt > 0 ? (
                <View style={{ backgroundColor: ud.primaryContainer, borderRadius: ud.radiusSm, padding: 10, marginTop: 6 }}>
                  <Text style={{ color: ud.primary, fontWeight: '800' }}>
                    ● recydywa: {item.recydywa.appsCnt} {item.recydywa.appsCnt === 1 ? 'zgłoszenie' : 'zgłoszeń'}
                    {item.recydywa.usersCnt > 1 ? ` od ${item.recydywa.usersCnt} osób` : ''}
                  </Text>
                  {item.recydywa.reports.map((r, k) => (
                    <Text key={k} style={{ color: ud.text, marginTop: 4 }}>
                      {r.date ? new Date(r.date).toLocaleDateString('pl-PL') : '—'} · {r.statusLabel} · {r.recipient.shortName}
                      {r.isOwn ? ' (Twoje)' : ''}
                    </Text>
                  ))}
                </View>
              ) : null}
              <Text style={{ color: ud.heading, fontWeight: '700', marginTop: 10 }}>Adres (z GPS, popraw)</Text>
              <TextInput {...inputColors} value={item.addressText} onChangeText={(t) => updateProposal(item.id, { addressText: t })} placeholder="ulica nr, miasto" style={{ borderWidth: 1, borderColor: ud.hairline, borderRadius: ud.radiusSm, padding: 10, marginTop: 6 }} />
              <Text style={{ color: ud.heading, fontWeight: '700', marginTop: 10 }}>Kategoria: {item.categoryId ?? '—'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {cats.slice(0, 27).map((c) => {
                  const active = c.id === item.categoryId;
                  return (
                    <Pressable key={c.id} onPress={() => updateProposal(item.id, { categoryId: c.id, status: item.plateId && item.addressText ? 'ready' : 'needs_fix' })} style={{ backgroundColor: active ? ud.primary : ud.primaryContainer, borderRadius: ud.radiusPill, paddingHorizontal: 12, paddingVertical: 7 }}>
                      <Text style={{ color: active ? '#fff' : ud.primary, fontWeight: '700' }}>{c.id}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <Text style={{ color: ud.text }}>Byłem świadkiem parkowania</Text>
                <Switch value={item.witness} onValueChange={(v) => updateProposal(item.id, { witness: v })} trackColor={{ true: ud.primary }} />
              </View>
              <Text style={{ color: item.status === 'ready' ? ud.primary : ud.warning, fontWeight: '700', marginTop: 6 }}>
                {item.status === 'ready' ? '● gotowe' : '● do poprawy'}
              </Text>
            </UdCard>
          );
        }}
        ListFooterComponent={<UdButton title="+ Dodaj trzecie zdjęcie (opcjonalnie)" variant="outline" onPress={() => go('Picker')} />}
      />
      <UdTabs current="Proposals" navigate={go} />
    </View>
  );
}
