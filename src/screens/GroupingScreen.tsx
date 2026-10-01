import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { reverseGeocode } from '../api/geo';
import { validIdToken } from '../api/udApi';
import { fmtPlDateTimeShort } from '../lib/format';
import { log } from '../lib/log';
import { useSession } from '../store/useSession';
import { ud } from '../theme';
import { UdCard, UdHeader, UdTabs } from '../components/UD';

// Adres liczony z GPS OSTATNIEGO zdjęcia w grupie (nie z centroidu) – to zdjęcie zwykle
// najbliższe zbliżeniu tablicy, więc adres jest trafniejszy niż średnia po całej sesji.
export function GroupingScreen({ navigation }: any) {
  const { photos, candidates, droppedCount } = useSession();
  const [addresses, setAddresses] = useState<Record<string, string | null>>({});
  const byId = new Map(photos.map((p) => [p.id, p]));
  const go = (r: string) => navigation.navigate(r);
  const hasValidCandidate = candidates.some((c) => c.photoIds.length >= 2);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let token: string | undefined;
      try {
        token = await validIdToken();
      } catch {
        log.warn('geo', 'brak sesji – adresy grup trzeba będzie sprawdzić ręcznie');
      }
      for (const c of candidates) {
        const lastId = c.photoIds[c.photoIds.length - 1];
        const lat = byId.get(lastId)?.exif.lat ?? null;
        const lng = byId.get(lastId)?.exif.lng ?? null;
        if (lat == null || lng == null) continue;
        const geo = await reverseGeocode(lat, lng, token);
        if (cancelled) return;
        setAddresses((prev) => ({ ...prev, [c.reportId]: geo?.display ?? null }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader onBack={() => go('Picker')} onNext={hasValidCandidate ? () => go('Analyze') : undefined} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <UdCard>
          <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 17 }}>Wstępny podział wg daty i lokalizacji</Text>
          <Text style={{ color: ud.muted, marginTop: 4 }}>
            Zdjęcia wykonane zaraz po sobie w jednym miejscu to wstępni kandydaci na zgłoszenia.{droppedCount ? ` Odrzucono bez czasu: ${droppedCount}.` : ''}
          </Text>
        </UdCard>

        {candidates.map((c) => {
          const address = addresses[c.reportId];
          const rejected = c.photoIds.length < 2; // brak pary (kontekst + tablica) – nie da się z tego zrobić zgłoszenia
          return (
            <UdCard key={c.reportId}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 16 }}>
                  {fmtPlDateTimeShort(c.endMs)} · {c.photoIds.length} zdj.
                </Text>
                {rejected ? (
                  <Text style={{ backgroundColor: ud.warning, color: '#fff', fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: ud.radiusPill, overflow: 'hidden' }}>ODRZUCONA</Text>
                ) : null}
              </View>
              {rejected ? (
                <Text style={{ color: ud.warning, marginTop: 2 }}>Brak drugiego zdjęcia – potrzebna para (kontekst + tablica).</Text>
              ) : (
                <Text style={{ color: ud.muted, marginTop: 2 }}>
                  {c.hasGps ? (address === undefined ? 'szukam adresu…' : address ?? 'nie udało się ustalić adresu') : 'brak GPS'}
                </Text>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {c.photoIds.map((pid) => {
                  const ph = byId.get(pid);
                  return ph ? <Image key={pid} source={{ uri: ph.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} /> : null;
                })}
              </View>
            </UdCard>
          );
        })}
      </ScrollView>
      <UdTabs current="Picker" navigate={go} />
    </View>
  );
}
