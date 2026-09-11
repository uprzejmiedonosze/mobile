import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { MAX_PHOTOS, pickPhotosFromGallery } from '../lib/gallery';
import { groupPhotos } from '../lib/grouping';
import { log } from '../lib/log';
import { useSession } from '../store/useSession';
import { ud } from '../theme';
import { UdButton, UdCard, UdHeader, UdTabs } from '../components/UD';

function fmtRange(startMs: number, endMs: number): string {
  const f = (ms: number) => {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  return `${f(startMs)} → ${f(endMs)}`;
}

export function PickerScreen({ navigation }: any) {
  const { photos, candidates, droppedCount, setPhotos, setCandidates } = useSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      const fresh = (await pickPhotosFromGallery(photos.length)) as any[];
      setPhotos([...photos, ...fresh].slice(0, MAX_PHOTOS));
      log.info('galeria', `wybrano ${fresh.length}, razem ${Math.min(photos.length + fresh.length, MAX_PHOTOS)}/${MAX_PHOTOS}`);
    } catch (e: any) {
      const m = e?.message ?? String(e);
      setErr(m);
      log.error('galeria', m);
    } finally {
      setBusy(false);
    }
  };

  const go = (r: string) => navigation.navigate(r);
  const byId = new Map(photos.map((p) => [p.id, p]));

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader onBack={() => {}} onNext={photos.length ? () => go('Analyze') : undefined} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <UdCard>
          <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 17 }}>Nowe zgłoszenie ({photos.length}/{MAX_PHOTOS} zdjęć).</Text>
          <Text style={{ color: ud.muted, marginTop: 4 }}>Wybierz pary: zdjęcie z widocznym wykroczeniem + zbliżenie tablicy.</Text>
          <UdButton title="zacznij od nowa" variant="primary" onPress={() => setPhotos([])} disabled={photos.length === 0} />
        </UdCard>

        <Pressable onPress={pick} disabled={busy} style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: ud.primary, borderRadius: ud.radiusCard, backgroundColor: ud.surface, minHeight: 170, alignItems: 'center', justifyContent: 'center', padding: 20, marginVertical: 8 }}>
          <Text style={{ fontSize: 34, color: ud.primary }}>🚗</Text>
          <Text style={{ color: ud.primary, fontWeight: '700', fontSize: 15, textAlign: 'center', marginTop: 8 }}>
            {busy ? 'Wczytywanie…' : 'Dodaj zdjęcie z widocznym wykroczeniem.'}
          </Text>
        </Pressable>
        {err ? <Text style={{ color: 'red' }}>{err}</Text> : null}

        {photos.length > 0 ? (
          <UdCard>
            <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 17 }}>
              Kandydaci na pary ({candidates.length}) – bez LLM
            </Text>
            <Text style={{ color: ud.muted, marginTop: 4 }}>
              Sesje: przerwa 5 min. Klastry: 30 m lub 30 s (most na skoki GPS).{droppedCount ? ` Odrzucono bez czasu: ${droppedCount}.` : ''}
            </Text>
          </UdCard>
        ) : null}

        {candidates.map((c) => (
          <UdCard key={c.reportId}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 16 }}>{c.reportId}</Text>
              <Text style={{ color: ud.muted }}>· {c.photoIds.length} zdj.</Text>
              {c.needsReview ? (
                <Text style={{ backgroundColor: ud.accent, color: ud.onAccent, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: ud.radiusPill, overflow: 'hidden' }}>REVIEW</Text>
              ) : null}
            </View>
            <Text style={{ color: ud.muted, marginTop: 2 }}>{fmtRange(c.startMs, c.endMs)}</Text>
            <Text style={{ color: ud.muted }}>{c.centroid ? `${c.centroid.lat.toFixed(6)}, ${c.centroid.lng.toFixed(6)}` : 'brak GPS'} · {c.hasGps ? 'GPS ok' : 'bez GPS'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {c.photoIds.map((pid) => {
                const ph = byId.get(pid);
                return ph ? <Image key={pid} source={{ uri: ph.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} /> : null;
              })}
            </View>
          </UdCard>
        ))}

        {photos.length > 0 ? <UdButton title="+ Dodaj kolejne (opcjonalnie)" variant="outline" onPress={pick} disabled={busy || photos.length >= MAX_PHOTOS} /> : null}
      </ScrollView>
      <UdTabs current="Picker" navigate={go} />
    </View>
  );
}
