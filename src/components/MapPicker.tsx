import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reverseGeocode } from '../api/geo';
import { validIdToken } from '../api/udApi';
import { udConfig } from '../config';
import { log } from '../lib/log';
import { ud } from '../theme';
import type { GeoAddress } from '../types';
import { UdButton } from './UD';

// Moduły natywne ładujemy w try/require (wzorzec jak google-signin w useAuth): w kliencie zbudowanym przed
// ich dodaniem import na górze pliku wywaliłby całą aplikację przy starcie.
let WebView: any = null;
let Location: typeof import('expo-location') | null = null;
try { WebView = require('react-native-webview').WebView; } catch { /* brak react-native-webview w tym buildzie */ }
try { Location = require('expo-location'); } catch { /* brak expo-location w tym buildzie */ }

export type PickedPlace = { lat: number; lng: number; geo: GeoAddress | null };

// Ta sama mapa co na www (src/js/lib/geolocation.js): Mapbox GL, styl outdoors-v12, zoom 6–17, pinezka
// pośrodku, adres liczony po zatrzymaniu mapy. Token jest publiczny (jest w paczce JS strony) i ograniczony
// do domeny serwisu, dlatego HTML ładujemy z baseUrl = adres serwisu (Referer/Origin jak na www).
const MAPBOX_VERSION = '3.18.1';
export const MAPBOX_TOKEN = 'pk.eyJ1IjoidXByemVqbWllZG9ub3N6ZXQiLCJhIjoiY2xxc2VkbWU3NGthZzJrcnExOWxocGx3bSJ9.r1y7A6C--2S2psvKDJcpZw';
const POLAND = { lat: 52.069321, lng: 19.480311 };

function html(center: { lat: number; lng: number }, zoom: number): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link href="https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.js"></script>
<style>html,body,#map{margin:0;height:100%;width:100%}
#pin{position:absolute;left:50%;top:50%;width:34px;height:44px;margin:-44px 0 0 -17px;pointer-events:none;z-index:5}</style></head>
<body><div id="map"></div>
<svg id="pin" viewBox="0 0 34 44"><path d="M17 0C7.6 0 0 7.6 0 17c0 12.5 17 27 17 27s17-14.5 17-27C34 7.6 26.4 0 17 0z" fill="#0d7a55" stroke="#fff" stroke-width="2"/><circle cx="17" cy="17" r="6" fill="#fff"/></svg>
<script>
  const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
  try {
    mapboxgl.accessToken = '${MAPBOX_TOKEN}';
    const map = new mapboxgl.Map({ container: 'map', center: [${center.lng}, ${center.lat}], zoom: ${zoom},
      minZoom: 6, maxZoom: 17, style: 'mapbox://styles/mapbox/outdoors-v12', dragRotate: false });
    map.touchZoomRotate.disableRotation();
    const report = () => { const c = map.getCenter(); post({ type: 'move', lat: c.lat, lng: c.lng }); };
    map.on('load', report);
    map.on('moveend', report);
    map.on('error', (e) => post({ type: 'error', message: String(e && e.error && e.error.message || e) }));
    window.setCenter = (lat, lng) => { map.jumpTo({ center: [lng, lat], zoom: 16 }); };
  } catch (e) { post({ type: 'error', message: String(e) }); }
</script></body></html>`;
}

export function MapPicker({ visible, initial, fallback, onConfirm, onClose }: {
  visible: boolean;
  initial: { lat: number; lng: number } | null;
  fallback?: { lat: number; lng: number } | null; // tylko punkt startowy mapy (ostatnie zgłoszenie / adres zamieszkania), bez wybranego miejsca
  onConfirm: (p: PickedPlace) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const web = useRef<any>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(initial);
  const [geo, setGeo] = useState<GeoAddress | null>(null);
  const [loadingAddr, setLoadingAddr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = useRef(initial ?? fallback ?? POLAND);
  const startZoom = useRef(initial || fallback ? 16 : 6);
  const [session, setSession] = useState(0); // nowa sesja = świeży WebView z aktualnym punktem startowym

  // Okno jest zamontowane cały czas (visible=false), więc punkt startowy trzeba ustawić przy KAŻDYM otwarciu –
  // inaczej mapa zawsze startowała tam, gdzie była ostatnio (u pierwszego otwarcia: środek Polski).
  useEffect(() => {
    if (!visible) return;
    start.current = initial ?? fallback ?? POLAND;
    startZoom.current = initial || fallback ? 16 : 6;
    setCenter(initial);
    setGeo(null);
    setError(null);
    setSession((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Adres dla środka mapy (po zatrzymaniu, z opóźnieniem – jak na www).
  useEffect(() => {
    if (!visible || !center) return;
    setLoadingAddr(true);
    const t = setTimeout(() => {
      validIdToken().then((tok) => reverseGeocode(center.lat, center.lng, tok)).then(setGeo).catch(() => setGeo(null)).finally(() => setLoadingAddr(false));
    }, 600);
    return () => clearTimeout(t);
  }, [center, visible]);

  const myLocation = async () => {
    if (!Location) { setError('Lokalizacja urządzenia wymaga nowszej wersji aplikacji.'); return; }
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { setError('Brak zgody na lokalizację.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      web.current?.injectJavaScript(`window.setCenter(${pos.coords.latitude}, ${pos.coords.longitude}); true;`);
      setError(null);
    } catch (e: any) {
      log.warn('mapa', `lokalizacja: ${String(e?.message ?? e).slice(0, 150)}`);
      setError('Nie udało się ustalić lokalizacji.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
        <View style={{ paddingTop: insets.top + 8, paddingBottom: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: ud.surface }}>
          <Text style={{ fontFamily: ud.fontDisplay, fontSize: 20, color: ud.heading }}>Wskaż miejsce na mapie</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold }}>Zamknij</Text></Pressable>
        </View>

        <View style={{ flex: 1 }}>
          {WebView ? (
            <WebView
              key={session}
              ref={web}
              originWhitelist={['*']}
              source={{ html: html(start.current, startZoom.current), baseUrl: udConfig.base }}
              javaScriptEnabled
              domStorageEnabled
              onMessage={(e: any) => {
                try {
                  const m = JSON.parse(e.nativeEvent.data);
                  if (m.type === 'move') { setCenter({ lat: m.lat, lng: m.lng }); setError(null); }
                  else if (m.type === 'error') { log.warn('mapa', m.message); setError('Nie udało się załadować mapy. Wpisz adres ręcznie.'); }
                } catch { /* obca wiadomość */ }
              }}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <Text style={{ color: ud.muted, textAlign: 'center' }}>Mapa wymaga nowszej wersji aplikacji (moduł react-native-webview). Wpisz adres ręcznie.</Text>
            </View>
          )}
        </View>

        <View style={{ padding: 16, paddingBottom: insets.bottom + 12, backgroundColor: ud.surface, gap: 8 }}>
          {error ? <Text style={{ color: ud.plateVerified }}>{error}</Text> : null}
          <View style={{ minHeight: 40, justifyContent: 'center' }}>
            {loadingAddr ? <ActivityIndicator color={ud.primary} /> : <Text style={{ color: ud.text, fontFamily: ud.fontBodyBold }}>{geo?.display || (center ? 'Nie znaleziono adresu dla tego punktu' : 'Przesuń mapę, aby wskazać miejsce')}</Text>}
          </View>
          <Pressable onPress={myLocation}><Text style={{ color: ud.primary, textDecorationLine: 'underline' }}>Użyj mojej lokalizacji</Text></Pressable>
          <UdButton title="Użyj tego miejsca" onPress={() => center && onConfirm({ lat: center.lat, lng: center.lng, geo })} disabled={!center || loadingAddr} />
        </View>
      </View>
    </Modal>
  );
}
