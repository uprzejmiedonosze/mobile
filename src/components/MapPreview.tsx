import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { validIdToken } from '../api/udApi';
import { udConfig } from '../config';
import { log } from '../lib/log';
import { ud } from '../theme';
import { MAPBOX_TOKEN } from './MapPicker';

// Statyczny podgląd mapy z backendu (GET /api/rest/geo/map – Mapbox Static Images przez serwer, token zostaje
// po stronie backendu). Widoczny od razu: z pinezką w znanym miejscu albo cała Polska; dotknięcie otwiera
// wybór miejsca (MapPicker). Obraz wymaga Bearera, stąd nagłówek w źródle <Image>.
export function MapPreview({ lat, lng, onPress, hideLabel }: { lat: number | null; lng: number | null; onPress?: () => void; hideLabel?: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false); // /geo/map z backendu nie zadziałał → statyczny Mapbox wprost (ten sam publiczny token co w MapPicker)
  const [fallbackFailed, setFallbackFailed] = useState(false);
  useEffect(() => { validIdToken().then(setToken).catch((e) => { log.warn('mapa', `token: ${String(e?.message ?? e)}`); setFailed(true); }); }, []);
  useEffect(() => { setFailed(false); setFallbackFailed(false); }, [lat, lng]);

  const q = lat != null && lng != null ? `lat=${lat}&lng=${lng}&` : '';
  const uri = `${udConfig.base}/api/rest/geo/map?${q}w=600&h=300`;
  // jak backend (Geolocation.php staticMapUrl): pinezka w znanym miejscu albo cała Polska
  const [overlay, view] = lat != null && lng != null ? [`pin-l+0d7a55(${lng},${lat})/`, `${lng},${lat},15,0`] : ['', '19.48,52.07,4.8,0'];
  const fallbackUri = `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/${overlay}${view}/600x300@2x?logo=false&access_token=${MAPBOX_TOKEN}`;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ marginTop: 10, height: 150, borderRadius: ud.radiusSm, overflow: 'hidden', backgroundColor: ud.surfaceCream }}>
      {token && !failed ? (
        <Image source={{ uri, headers: { Authorization: `Bearer ${token}` } }} style={{ width: '100%', height: '100%' }} resizeMode="cover"
          onError={(e) => { log.warn('mapa', `/geo/map: ${e.nativeEvent?.error ?? 'błąd obrazu'}`); setFailed(true); }} />
      ) : failed && !fallbackFailed ? (
        <Image source={{ uri: fallbackUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover"
          onError={(e) => { log.warn('mapa', `Mapbox static: ${e.nativeEvent?.error ?? 'błąd obrazu'}`); setFallbackFailed(true); }} />
      ) : null}
      {hideLabel ? null : <View style={{ position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: ud.radiusPill, paddingHorizontal: 12, paddingVertical: 6 }}>
        <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, fontSize: 13 }}>📍 {lat != null ? 'Zmień miejsce na mapie' : 'Wskaż miejsce na mapie'}</Text>
      </View>}
    </Pressable>
  );
}
