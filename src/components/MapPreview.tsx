import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { log } from '../lib/log';
import { ud } from '../theme';
import { MAPBOX_TOKEN } from './MapPicker';

// Statyczny podgląd mapy prosto z Mapbox Static Images (ten sam publiczny token co w MapPicker; bez przeskoku przez
// backend /geo/map, który wymagał Bearera w nagłówku <Image> – tam nagłówek nie docierał i było 400). Widoczny od razu:
// z pinezką w znanym miejscu albo cała Polska; dotknięcie otwiera wybór miejsca (MapPicker).
export function MapPreview({ lat, lng, onPress, hideLabel }: { lat: number | null; lng: number | null; onPress?: () => void; hideLabel?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [lat, lng]);

  // jak backend (Geolocation.php staticMapUrl): pinezka w znanym miejscu albo cała Polska
  const [overlay, view] = lat != null && lng != null ? [`pin-l+0d7a55(${lng},${lat})/`, `${lng},${lat},15,0`] : ['', '19.48,52.07,4.8,0'];
  const uri = `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/${overlay}${view}/600x300@2x?logo=false&access_token=${MAPBOX_TOKEN}`;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ marginTop: 10, height: 150, borderRadius: ud.radiusSm, overflow: 'hidden', backgroundColor: ud.surfaceCream }}>
      {!failed ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover"
          onError={(e) => { log.warn('mapa', `Mapbox static: ${e.nativeEvent?.error ?? 'błąd obrazu'}`); setFailed(true); }} />
      ) : null}
      {hideLabel ? null : <View style={{ position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: ud.radiusPill, paddingHorizontal: 12, paddingVertical: 6 }}>
        <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, fontSize: 13 }}>📍 {lat != null ? 'Zmień miejsce na mapie' : 'Wskaż miejsce na mapie'}</Text>
      </View>}
    </Pressable>
  );
}
