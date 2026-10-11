import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Text, View } from 'react-native';
import { UdButton, UdHeader } from '../components/UD';
import { udConfig } from '../config';
import { embedInjection } from '../lib/embedStyle';
import { isUdPage, withEmbed } from '../lib/openPage';
import { ud } from '../theme';

let WebView: any = null;
try { WebView = require('react-native-webview').WebView; } catch { /* brak react-native-webview w tym buildzie */ }

// Statyczna strona z backendu (jedno źródło treści z www) w trybie ?embed: sam artykuł, bez headera/stopki.
// Linki do innych stron .html zostają w WebView, reszta (zewnętrzne, mailto, target=_blank) idzie do przeglądarki.
export function WebPageScreen({ navigation, route }: any) {
  const { path, title: titleParam } = route.params as { path: string; title?: string };
  const ref = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [title, setTitle] = useState<string | undefined>(titleParam);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0);
  const uri = withEmbed(`${udConfig.base}${path}`);

  const back = useCallback(() => {
    if (canGoBack) ref.current?.goBack();
    else navigation.goBack();
  }, [canGoBack, navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => sub.remove();
  }, [back]);

  useEffect(() => {
    if (!WebView) { Linking.openURL(uri.replace(/[?&]embed=1$/, '')).catch(() => {}); navigation.goBack(); }
  }, [navigation, uri]);

  const onRequest = (req: { url: string; isTopFrame?: boolean }) => {
    if (req.url === uri || req.url.startsWith('about:') || req.isTopFrame === false) return true;
    const page = isUdPage(req.url);
    if (page && req.url.startsWith(udConfig.base)) {
      if (/[?&]embed(=|&|$)/.test(req.url)) return true;
      ref.current?.injectJavaScript(`location.href=${JSON.stringify(withEmbed(req.url))};true;`);
      return false;
    }
    Linking.openURL(req.url).catch(() => {});
    return false;
  };

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader title={title} onBack={back} />
      {WebView ? (
        <View style={{ flex: 1 }}>
          {failed ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
              <Text style={{ color: ud.muted, textAlign: 'center' }}>Nie udało się wczytać strony.</Text>
              <UdButton title="Spróbuj ponownie" onPress={() => { setFailed(false); setLoading(true); setKey((k) => k + 1); }} />
            </View>
          ) : (
            <WebView
              key={key}
              ref={ref}
              source={{ uri }}
              injectedJavaScriptBeforeContentLoaded={embedInjection()}
              setSupportMultipleWindows={false}
              onShouldStartLoadWithRequest={onRequest}
              onNavigationStateChange={(s: any) => {
                setCanGoBack(!!s.canGoBack);
                if (!titleParam && s.title) setTitle(String(s.title).replace(/\s*\|\s*Uprzejmie Donoszę$/, ''));
              }}
              onLoadEnd={() => setLoading(false)}
              onError={() => { setLoading(false); setFailed(true); }}
              onHttpError={() => { setLoading(false); setFailed(true); }}
              style={{ flex: 1, backgroundColor: ud.surfaceLow }}
            />
          )}
          {loading && !failed ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={ud.primary} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
