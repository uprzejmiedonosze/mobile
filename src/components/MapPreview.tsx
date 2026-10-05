import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { validIdToken } from '../api/udApi';
import { udConfig } from '../config';
import { ud } from '../theme';

// Statyczny podgląd mapy z backendu (GET /api/rest/geo/map – Mapbox Static Images przez serwer, token zostaje
// po stronie backendu). Widoczny od razu: z pinezką w znanym miejscu albo cała Polska; dotknięcie otwiera
// wybór miejsca (MapPicker). Obraz wymaga Bearera, stąd nagłówek w źródle <Image>.
export function MapPreview({ lat, lng, onPress, hideLabel }: { lat: number | null; lng: number | null; onPress?: () => void; hideLabel?: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { validIdToken().then(setToken).catch(() => setFailed(true)); }, []);
  useEffect(() => { setFailed(false); }, [lat, lng]);

  const q = lat != null && lng != null ? `lat=${lat}&lng=${lng}&` : '';
  const uri = `${udConfig.base}/api/rest/geo/map?${q}w=600&h=300`;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ marginTop: 10, height: 150, borderRadius: ud.radiusSm, overflow: 'hidden', backgroundColor: ud.surfaceCream }}>
      {token && !failed ? (
        <Image source={{ uri, headers: { Authorization: `Bearer ${token}` } }} style={{ width: '100%', height: '100%' }} resizeMode="cover" onError={() => setFailed(true)} />
      ) : null}
      {hideLabel ? null : <View style={{ position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: ud.radiusPill, paddingHorizontal: 12, paddingVertical: 6 }}>
        <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, fontSize: 13 }}>📍 {lat != null ? 'Zmień miejsce na mapie' : 'Wskaż miejsce na mapie'}</Text>
      </View>}
    </Pressable>
  );
}
