import { ScrollView, Text, View } from 'react-native';
import { fetchVehicleInfo } from '../api/vehicle';
import { reverseGeocode } from '../api/geo';
import { fetchRecydywa } from '../api/recydywa';
import { validIdToken } from '../api/udApi';
import { fmtPlDateTimeShort } from '../lib/format';
import { parseExifDtMs } from '../lib/grouping';
import { normalizePlate } from '../lib/plate';
import { log } from '../lib/log';
import { useSession } from '../store/useSession';
import { ud } from '../theme';
import { UdButton, UdCard, UdHeader, UdPhoto, UdTabs } from '../components/UD';
import type { BBox, ReportProposal } from '../types';
import type { Box4 } from '../lib/vision';

function toBBox(b: Box4 | null | undefined): BBox | null {
  if (!b) return null;
  return { x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] };
}

export function PairingScreen({ navigation }: any) {
  const { photos, analysis, setProposals } = useSession();
  const byId = new Map(photos.map((p) => [p.id, p]));
  const go = (r: string) => navigation.navigate(r);

  const build = async () => {
    log.info('szkice', `buduję propozycje z ${analysis.length} rekordów`);
    let token: string | undefined;
    try {
      token = await validIdToken();
    } catch {
      log.warn('szkice', 'brak sesji – adresy trzeba będzie wpisać ręcznie (Konto)');
    }
    const proposals: ReportProposal[] = await Promise.all(
      analysis.map(async (rec) => {
        const ctxItem = rec.draftOrder.find((d) => d.role === 'context');
        const carItem = rec.draftOrder.find((d) => d.role === 'car' && d.photoId) ?? rec.draftOrder.find((d) => d.role === 'third');
        const carPhoto = byId.get(carItem?.photoId ?? '');
        const ctxPhoto = byId.get(ctxItem?.photoId ?? '');
        const lat = carPhoto?.exif.lat ?? ctxPhoto?.exif.lat ?? null; // GPS zdjęcia AUTA, nie centroid
        const lng = carPhoto?.exif.lng ?? ctxPhoto?.exif.lng ?? null;
        const plateId = normalizePlate(rec.plate);
        const [vehicleInfo, geo, recydywa] = await Promise.all([
          fetchVehicleInfo(rec.plate),
          lat != null && lng != null ? reverseGeocode(lat, lng, token) : Promise.resolve(null),
          plateId ? fetchRecydywa(plateId, token) : Promise.resolve(null),
        ]);
        const verified = rec.photos.find((p) => p.plate?.readable)?.plate_verified ?? null;
        return {
          id: `prop-${rec.reportId}`,
          pairId: rec.reportId,
          contextPhotoId: ctxItem?.photoId ?? rec.photoIds[0],
          closeupPhotoId: carItem && carItem.photoId !== ctxItem?.photoId ? carItem.photoId : null,
          plateId,
          plateKey: rec.plate,
          plateVerified: verified ? true : rec.plate ? false : null, // false = tylko odczyt modelu, ALPR nie potwierdził
          datetime: carPhoto?.exif.datetimeOriginal ?? ctxPhoto?.exif.datetimeOriginal ?? null,
          lat,
          lng,
          addressText: geo?.display ?? '',
          addressObj: geo,
          vehicleInfo,
          recydywa,
          categoryId: rec.categoryId,
          markers: rec.markers,
          reviewReasons: rec.reviewReasons,
          sharedFrom: rec.sharedContext?.from,
          witness: false,
          status: rec.needsReview || !geo ? 'needs_fix' : ('ready' as const),
        };
      }),
    );
    setProposals(proposals);
    const ready = proposals.filter((p) => p.status === 'ready').length;
    log.info('szkice', `gotowe: ${ready}/${proposals.length} ready`);
    go('Proposals');
  };

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader onBack={() => go('Analyze')} onNext={() => build()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <UdCard>
          <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 17 }}>Szkice ({analysis.length}).</Text>
          <Text style={{ color: ud.muted, marginTop: 4 }}>Zielony = auto, czerwony = tablica zweryfikowana, pomarańczowy przerywany = niepotwierdzona. Kolejność = draft_order.</Text>
          {/* TYMCZASOWE (debug): usunąć razem z debugPlateBox w UD.tsx, gdy porównanie ALPR/model przestanie być potrzebne. */}
          <Text style={{ color: ud.plateDebugModel, marginTop: 2 }}>Niebieski przerywany = odczyt tablicy samego modelu (do porównania z ALPR, tymczasowe).</Text>
        </UdCard>
        {!analysis.length ? (
          <UdCard>
            <Text style={{ color: ud.muted }}>Brak rekordów – wróć i uruchom wizję.</Text>
          </UdCard>
        ) : null}
        {analysis.map((rec) => {
          const lastPhotoId = rec.photoIds[rec.photoIds.length - 1];
          const lastDt = byId.get(lastPhotoId)?.exif.datetimeOriginal;
          const dtMs = lastDt ? parseExifDtMs(lastDt) : null;
          const plate = normalizePlate(rec.plate) ?? 'brak tablicy';
          const groupName = dtMs != null ? `${plate} · ${fmtPlDateTimeShort(dtMs)}` : plate;
          return (
          <UdCard key={rec.reportId}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 16 }}>{groupName}</Text>
              {rec.splitFrom ? <Text style={{ color: ud.muted }}>z {rec.splitFrom}</Text> : null}
              {rec.needsReview ? (
                <Text style={{ backgroundColor: ud.accent, color: ud.onAccent, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: ud.radiusPill, overflow: 'hidden' }}>REVIEW</Text>
              ) : (
                <Text style={{ backgroundColor: ud.primaryContainer, color: ud.primary, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: ud.radiusPill, overflow: 'hidden' }}>OK</Text>
              )}
            </View>
            <Text style={{ color: ud.primary, fontWeight: '800', marginTop: 4 }}>kat. {rec.categoryId}</Text>
            {rec.sharedContext ? <Text style={{ color: ud.muted }}>+ kontekst z {rec.sharedContext.from}</Text> : null}
            {rec.reviewReasons.map((r) => (
              <Text key={r} style={{ color: ud.warning }}>• {r}</Text>
            ))}
            {rec.draftOrder.map((d, k) => {
              const ph = rec.photos.find((p) => p.photoId === d.photoId);
              return (
                <View key={`${d.photoId}-${k}`} style={{ marginTop: 8 }}>
                  <UdPhoto
                    uri={byId.get(d.photoId)?.uri}
                    plateBox={toBBox(ph?.plate?.bbox)}
                    vehicleBox={toBBox(ph?.car?.bbox)}
                    plateVerified={ph?.plate_verified === true ? true : ph?.plate?.readable ? false : null}
                    debugPlateBox={toBBox(ph?.plate_debug?.model?.bbox)}
                    naturalWidth={rec.photoDims?.[d.photoId]?.w}
                    naturalHeight={rec.photoDims?.[d.photoId]?.h}
                    height={d.role === 'context' ? 170 : 130}
                  />
                  <Text style={{ color: ud.muted }}>
                    {d.role}
                    {d.sharedFrom ? ` (pożyczony z ${d.sharedFrom})` : ''} · q={ph?.quality?.toFixed(2) ?? '?'}
                    {ph?.plate_verified ? ' · box ✓' : ''}
                  </Text>
                  {/* TYMCZASOWE (debug): usunąć razem z plate_debug (src/lib/vision.ts), gdy porównanie ALPR/model przestanie być potrzebne. */}
                  {ph?.plate_debug ? (
                    <Text style={{ color: ph.plate_debug.alpr?.text !== ph.plate_debug.model.text ? ud.warning : ud.muted, fontWeight: ph.plate_debug.alpr?.text !== ph.plate_debug.model.text ? '700' : '400' }}>
                      ALPR: {ph.plate_debug.alpr?.text ?? '—'} · model: {ph.plate_debug.model.text ?? '—'}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </UdCard>
          );
        })}
        <UdButton title="Dalej" variant="accent" onPress={build} disabled={!analysis.length} />
      </ScrollView>
      <UdTabs current="Analyze" navigate={go} />
    </View>
  );
}
