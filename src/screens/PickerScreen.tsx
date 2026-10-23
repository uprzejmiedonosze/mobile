import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MAX_PHOTOS, pickPhotosFromGallery } from '../lib/gallery';
import { groupPhotos } from '../lib/grouping';
import { log } from '../lib/log';
import { useSession } from '../store/useSession';
import { ud } from '../theme';
import { UdHeader, UdTabs } from '../components/UD';

export function PickerScreen({ navigation }: any) {
  const { photos, setPhotos, setCandidates } = useSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = (r: string) => navigation.navigate(r);

  // Grupowanie wstępne BEZ LLM po każdym załadowaniu (GROUPING.md: sesje 5 min, klastry 30 m / 30 s).
  useEffect(() => {
    const { candidates, dropped } = groupPhotos(
      photos.map((p) => ({ id: p.id, fileName: p.fileName, datetimeOriginal: p.exif.datetimeOriginal, lat: p.exif.lat, lng: p.exif.lng })),
    );
    setCandidates(candidates, dropped);
    if (photos.length) log.info('grupowanie', `zdjęcia=${photos.length} kandydaci=${candidates.length} review=${candidates.filter((c) => c.needsReview).length} drop=${dropped}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  const pick = async () => {
    setBusy(true);
    setErr(null);
    try {
      // Bez 'zacznij od nowa' w UI – każdy wybór z galerii zastępuje poprzednią listę, nie dokleja.
      const fresh = (await pickPhotosFromGallery(0)) as any[];
      if (!fresh.length) return; // anulowane przez usera
      setPhotos(fresh.slice(0, MAX_PHOTOS));
      log.info('galeria', `wybrano ${fresh.length}/${MAX_PHOTOS}`);
      go('Grouping'); // od razu krok 2, bez klikania Dalej
    } catch (e: any) {
      const m = e?.message ?? String(e);
      setErr(m);
      log.fail('galeria', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <Pressable onPress={pick} disabled={busy} style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: ud.primary, borderRadius: ud.radiusCard, backgroundColor: ud.surface, minHeight: 170, alignItems: 'center', justifyContent: 'center', padding: 20, marginVertical: 8 }}>
          <Text style={{ fontSize: 34, color: ud.primary }}>🚗</Text>
          <Text style={{ color: ud.primary, fontWeight: '700', fontSize: 15, textAlign: 'center', marginTop: 8 }}>
            {busy ? 'Wczytywanie…' : `Dodaj maksymalnie ${MAX_PHOTOS} zdjęć z wykroczeniami`}
          </Text>
        </Pressable>
        {err ? <Text style={{ color: 'red' }}>{err}</Text> : null}
      </ScrollView>
      <UdTabs current="Picker" navigate={go} />
    </View>
  );
}
