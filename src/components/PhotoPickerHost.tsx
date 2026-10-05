import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// /legacy – patrz komentarz w lib/gallery.ts (główny eksport expo-media-library rzuca w runtime)
import * as MediaLibrary from 'expo-media-library/legacy';
import { parsePickerExif } from '../lib/gallery';
import { log } from '../lib/log';
import { usePhotoPicker } from '../store/usePhotoPicker';
import { ud } from '../theme';
import type { PhotoItem } from '../types';

const PAGE = 60;
const COLS = 3;
const pad = (n: number) => String(n).padStart(2, '0');
// creationTime (ms) → "YYYY:MM:DD HH:mm:ss" (jak EXIF DateTimeOriginal), gdy plik nie ma własnej daty
const exifDate = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

// Wybór zdjęć z galerii własnym oknem na MediaLibrary. Powód: na Androidzie (build release) systemowy
// ImagePicker potrafił zawsze odrzucać wywołanie ("unregistered ActivityResultLauncher" w expo-modules-core).
// MediaLibrary nie używa tego mechanizmu, a przy okazji daje prawdziwy GPS i datę zdjęcia bez redakcji EXIF.
export function PhotoPickerHost() {
  const request = usePhotoPicker((s) => s.request);
  const close = usePhotoPicker((s) => s.close);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const size = width / COLS;

  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const cursor = useRef<{ after?: string; more: boolean }>({ more: true });

  const loadMore = useCallback(async () => {
    if (loading || !cursor.current.more) return;
    setLoading(true);
    try {
      const page = await MediaLibrary.getAssetsAsync({ first: PAGE, after: cursor.current.after, mediaType: 'photo', sortBy: [[MediaLibrary.SortBy.creationTime, false]] });
      cursor.current = { after: page.endCursor, more: page.hasNextPage };
      setAssets((a) => [...a, ...page.assets]);
    } catch (e: any) {
      log.warn('galeria', `getAssetsAsync: ${String(e?.message ?? e).slice(0, 150)}`);
      cursor.current.more = false;
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // przy każdym otwarciu: zgoda → pierwsza strona
  const open = !!request;
  useEffect(() => {
    if (!open) return;
    setAssets([]); setSelected([]); cursor.current = { more: true };
    (async () => {
      let perm = await MediaLibrary.getPermissionsAsync(false, ['photo']);
      if (!perm.granted) perm = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (!perm.granted) { close('unavailable'); return; }
      loadMore();
    })().catch((e) => { log.warn('galeria', String(e?.message ?? e)); close('unavailable'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= (request?.limit ?? 1) ? s : [...s, id]));

  const done = async () => {
    setBusy(true);
    try {
      const items = await Promise.all(selected.map(async (id, i): Promise<PhotoItem> => {
        const a = assets.find((x) => x.id === id)!;
        const info = await MediaLibrary.getAssetInfoAsync(a); // GPS (ACCESS_MEDIA_LOCATION) + EXIF
        const exif = parsePickerExif((info as any).exif ?? {});
        if (!exif.datetimeOriginal) exif.datetimeOriginal = exifDate(a.creationTime);
        if ((exif.lat == null || exif.lng == null) && info.location) {
          exif.lat = Number(info.location.latitude.toFixed(4));
          exif.lng = Number(info.location.longitude.toFixed(4));
          exif.hasGps = true;
        }
        return { id: `${Date.now()}-${i}-${a.id}`, uri: info.localUri ?? a.uri, fileName: a.filename ?? null, exif };
      }));
      close(items);
    } finally {
      setBusy(false);
    }
  };

  if (!request) return null;
  const ok = selected.length >= request.min;
  return (
    <Modal visible animationType="slide" onRequestClose={() => close([])}>
      <View style={{ flex: 1, backgroundColor: ud.surface }}>
        <View style={{ paddingTop: insets.top + 8, paddingBottom: 10, paddingHorizontal: 16, backgroundColor: ud.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => close([])} hitSlop={10}><Text style={{ color: '#fff', fontFamily: ud.fontBodyBold }}>Anuluj</Text></Pressable>
          <Text style={{ color: '#fff', fontFamily: ud.fontDisplay, fontSize: 17 }}>{selected.length} / {request.limit}{request.min > 1 ? ` (min. ${request.min})` : ''}</Text>
          <Pressable onPress={done} disabled={!ok || busy} hitSlop={10} style={{ opacity: ok && !busy ? 1 : 0.4 }}>
            <Text style={{ color: ud.accent, fontFamily: ud.fontBodyBold }}>{busy ? '…' : 'Gotowe'}</Text>
          </Pressable>
        </View>
          <FlatList
            data={assets}
            keyExtractor={(a) => a.id}
            numColumns={COLS}
            onEndReachedThreshold={0.6}
            onEndReached={loadMore}
            ListFooterComponent={loading ? <ActivityIndicator style={{ margin: 16 }} color={ud.primary} /> : null}
            contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}
            renderItem={({ item }) => {
              const n = selected.indexOf(item.id) + 1;
              return (
                <Pressable onPress={() => toggle(item.id)} style={{ width: size, height: size, padding: 1 }}>
                  <Image source={{ uri: item.uri }} style={{ flex: 1, backgroundColor: ud.surfaceCream }} resizeMode="cover" />
                  {n > 0 ? (
                    <View style={{ position: 'absolute', inset: 1, borderWidth: 3, borderColor: ud.primary }}>
                      <View style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: ud.primary, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold, fontSize: 13 }}>{n}</Text>
                      </View>
                    </View>
                  ) : null}
                </Pressable>
              );
            }}
          />
      </View>
    </Modal>
  );
}
