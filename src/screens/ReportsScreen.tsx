import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { changeStatus, fetchApps, fetchStatusCounts, fetchStatuses, imageUrl, PAGE_SIZE, setReportFields, type StatusDef, type UdApp } from '../api/apps';
import { fetchCategories } from '../api/geo';
import { fetchRecydywa } from '../api/recydywa';
import { validIdToken } from '../api/udApi';
import { LETTER_LINK_LABEL, letterEntry } from '../lib/letters';
import { log } from '../lib/log';
import { fmtLongDate, fmtSent, filterChips, fmtShortDate, plural, reportBody, shortAddress, statusColor, witnessText } from '../lib/reports';
import { ImageViewer } from '../components/ImageViewer';
import { ErrorScreen } from '../components/ErrorScreen';
import { openUdPage } from '../lib/openPage';
import { UdButton, UdHeader, UdTabs } from '../components/UD';
import type { Category, RecydywaInfo } from '../types';
import { useAuth } from '../store/useAuth';
import { ud } from '../theme';
import { SvgXml } from 'react-native-svg';
import { CHEVRON_ICON, DATETIME_ICON, DESCRIPTION_ICON, ENCRYPTED_ICON, INFO_ICON, PIN_ICON } from '../assets/detailIcons';

function StatusDot({ status, label, police }: { status: string; label: string; police?: boolean }) {
  const t = statusColor(status);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: t.stroke, backgroundColor: t.fill, marginRight: 6 }} />
      <Text numberOfLines={1} style={{ fontFamily: ud.fontBodyBold, color: ud.text, fontSize: 13, flexShrink: 1 }}>{label.toUpperCase()}{police ? ' 👮' : ''}</Text>
    </View>
  );
}

function PlateBadge({ plate }: { plate?: string }) {
  if (!plate) return null;
  return (
    <View style={{ borderWidth: 1, borderColor: ud.text, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: ud.surface }}>
      <Text style={{ fontFamily: ud.fontBodyBold, color: ud.text, fontSize: 13, letterSpacing: 0.5 }}>{plate.replace(/\s+/g, '')}</Text>
    </View>
  );
}

function Photos({ thumbs, onPress }: { thumbs: string[]; onPress: (index: number) => void }) {
  if (!thumbs.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
      {thumbs.map((u, i) => (
        <Pressable key={u} onPress={() => onPress(i)}>
          <Image source={{ uri: u }} style={{ width: 220, height: 160, borderRadius: ud.radiusSm, backgroundColor: ud.surfaceCream }} resizeMode="cover" />
        </Pressable>
      ))}
    </ScrollView>
  );
}

// Szczegóły rozwiniętego zgłoszenia jak .application-details-list na webie (my-apps.scss): ikona przed każdą pozycją,
// ~1em odstępu między pozycjami, nagłówki sekcji pogrubione.
const DETAIL_ICON = 16;
const Icon = ({ xml }: { xml: string }) => <SvgXml xml={xml.replace('COLOR', ud.text)} width={DETAIL_ICON} height={DETAIL_ICON} />;

function IconLine({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ marginTop: 3 }}><Icon xml={icon} /></View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function Row({ label, icon, children }: { label: React.ReactNode; icon?: string; children: React.ReactNode }) {
  const title = <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading, fontSize: 14, letterSpacing: 0.4 }}>{label}</Text>;
  return (
    <View style={{ gap: 4 }}>
      {icon ? <IconLine icon={icon}>{title}</IconLine> : title}
      <View style={icon ? { paddingLeft: DETAIL_ICON + 8 } : undefined}>{children}</View>
    </View>
  );
}

// Pole zapisywane po wyjściu z niego, tylko gdy się zmieniło (jak .app-field-editable na webie, my-apps.js).
function EditableField({ label, value, multiline, placeholder, onSave, onFocus, icon }: { label: React.ReactNode; value: string; multiline?: boolean; placeholder?: string; onSave: (v: string) => Promise<void>; onFocus?: () => void; icon?: string }) {
  const [text, setText] = useState(value);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  // Refy, bo zapis odpala też sprzątanie przy odmontowaniu (zwinięcie karty), gdzie stan z domknięcia jest nieaktualny.
  const textRef = useRef(value);
  const savedRef = useRef(value); // ostatnia zapisana wartość (web: data-initial-value)
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const mounted = useRef(true);
  useEffect(() => { setText(value); textRef.current = value; savedRef.current = value; }, [value]);

  const commit = async () => {
    const v = textRef.current;
    const prev = savedRef.current;
    if (v === prev) return;
    savedRef.current = v; // od razu, żeby blur + odmontowanie nie zapisały dwa razy
    if (mounted.current) setState('saving');
    try {
      await onSaveRef.current(v);
      if (mounted.current) setState('idle');
    } catch {
      savedRef.current = prev;
      if (mounted.current) setState('error');
    }
  };
  // Zwinięcie karty z niezapisaną zmianą odmontowuje pole bez blur – zapisujemy przy odmontowaniu.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; void commit(); }; }, []);

  return (
    <Row label={label}>
      <TextInput
        value={text}
        onChangeText={(t) => { setText(t); textRef.current = t; if (state === 'error') setState('idle'); }}
        onBlur={commit}
        onFocus={onFocus}
        editable={state !== 'saving'}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={ud.muted}
        autoCorrect={false}
        style={{ marginTop: 2, backgroundColor: ud.surface, borderWidth: 1, borderColor: state === 'error' ? ud.plateVerified : '#999', borderRadius: ud.radiusSm, paddingVertical: 10, paddingLeft: 10, paddingRight: icon ? 34 : 10, fontSize: 15, color: ud.text, minHeight: multiline ? 80 : undefined, textAlignVertical: multiline ? 'top' : 'center', opacity: state === 'saving' ? 0.6 : 1 }}
      />
      {/* jak na webie: ikona zaszyfrowanego pliku w rogu pola z uwagami */}
      {icon ? <View pointerEvents="none" style={{ position: 'absolute', right: 10, bottom: 10 }}><SvgXml xml={icon.replace('COLOR', ud.muted)} width={20} height={20} /></View> : null}
      {state === 'error' ? <Text style={{ color: ud.plateVerified, fontSize: 12, marginTop: 2 }}>Nie udało się zapisać – spróbuj ponownie.</Text> : null}
    </Row>
  );
}

// Zmiana statusu w okienku (jak odznaki na Start): każda opcja z kropką w kolorze statusu, do którego prowadzi.
function StatusPicker({ visible, current, currentLabel, options, onPick, onClose }: { visible: boolean; current: string; currentLabel: string; options: { key: string; label: string }[]; onPick: (k: string) => void; onClose: () => void }) {
  const cur = statusColor(current);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable style={{ backgroundColor: ud.surface, borderRadius: ud.radiusCard, paddingVertical: 18, width: '100%', maxWidth: 380 }}>
          <Text style={{ fontFamily: ud.fontDisplay, fontSize: 18, color: ud.heading, paddingHorizontal: 20 }}>Zmień status</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 6, marginBottom: 10 }}>
            <Text style={{ color: ud.muted, fontSize: 13 }}>Teraz: </Text>
            <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: cur.stroke, backgroundColor: cur.fill, marginRight: 5 }} />
            <Text style={{ color: ud.muted, fontSize: 13, flexShrink: 1 }}>{currentLabel}</Text>
          </View>
          {options.map((o) => {
            const c = statusColor(o.key);
            return (
              <Pressable key={o.key} onPress={() => onPick(o.key)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: ud.hairline, backgroundColor: pressed ? ud.surfaceLow : 'transparent' })}>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: c.stroke, backgroundColor: c.fill }} />
                <Text style={{ flex: 1, color: ud.text, fontSize: 16, fontFamily: ud.fontBodyBold }}>{o.label}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={onClose} accessibilityRole="button" style={{ borderTopWidth: 1, borderTopColor: ud.hairline, paddingTop: 14, paddingHorizontal: 20, alignItems: 'center' }}>
            <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold }}>ANULUJ</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type CardProps = {
  app: UdApp;
  statuses: Record<string, StatusDef>;
  categories: Map<number, Category>;
  onStatus: (id: string, status: string) => Promise<void>;
  onEdit: (id: string) => void;
  onFields: (id: string, fields: { externalId?: string; privateComment?: string }) => Promise<void>;
  onFieldFocus: (id: string) => void;
  onPage: (path: string, title?: string) => void;
  open: boolean;
  onToggle: (id: string) => void;
};

function ReportCard({ app, statuses, categories, onStatus, onEdit, onFields, onFieldFocus, onPage, open, onToggle }: CardProps) {
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recydywa, setRecydywa] = useState<RecydywaInfo | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const police = app.recipient?.isPolice ?? !!app.stopAgresji; // recipient liczy backend (recipientData w API.php)
  const statusName = statuses[app.status]?.name ?? app.status;
  const cat = categories.get(Number(app.category));
  const plate = app.carInfo?.plateId;
  const recCnt = recydywa?.appsCnt ?? 0;

  // Recydywa (1 wywołanie na kartę) dopiero po rozwinięciu – lista może mieć setki pozycji.
  useEffect(() => {
    if (!open || !plate || app.status === 'archived' || recydywa) return;
    validIdToken().then((t) => fetchRecydywa(plate, t)).then(setRecydywa).catch(() => {});
  }, [open, plate, app.status, recydywa]);

  const slots = [app.contextImage, app.carImage, app.thirdImage];
  const thumbs = slots.map((i) => imageUrl(i, app)).filter(Boolean) as string[];
  const fulls = slots.map((i) => imageUrl(i, app, true)).filter(Boolean) as string[];
  // Zwinięte zgłoszenie: dotknięcie czegokolwiek (także zdjęcia) rozwija; rozwinięte: zdjęcie się powiększa.
  const toggle = () => onToggle(app.id);
  const accent = statusColor(app.status).stroke;

  // jak Application::wasSent() w backendzie: wysłane i już poza szkicem/potwierdzeniem – dopiero wtedy ma sens numer sprawy
  const wasSent = !!app.sent && !['draft', 'ready', 'confirmed'].includes(app.status);

  const allowed = (statuses[app.status]?.allowed ?? []).filter((k) => statuses[k] && (statuses[k] as any).action);

  const pick = async (k: string) => {
    setMenu(false);
    setBusy(true);
    try { await onStatus(app.id, k); } finally { setBusy(false); }
  };

  return (
    // Biała karta bez ramki; odróżnia ją pasek w kolorze statusu z lewej – osobny widok przycięty zaokrągleniem karty
    // (borderLeft przy borderRadius zwęża się w rogach).
    <Pressable onPress={toggle} style={{ backgroundColor: ud.surface, paddingLeft: 16, paddingRight: 12, paddingVertical: 10, marginBottom: 12, borderRadius: ud.radiusSm, overflow: 'hidden' }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: accent === '#FFFFFF' ? '#C5C5C5' : accent }} />
      <View style={{ paddingVertical: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <StatusDot status={app.status} label={statusName} police={police} />
          <Text style={{ color: ud.muted, fontSize: 13 }}>{fmtShortDate(app.date)}</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <PlateBadge plate={plate} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 17 }}>
            {shortAddress(app.address?.address) || 'Brak adresu'}
          </Text>
          {/* chevron z webu (.expander): w dół zwinięta, obrócony o 180° po rozwinięciu */}
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }], padding: 2 }}><SvgXml xml={CHEVRON_ICON.replace('COLOR', ud.muted)} width={16} height={16} /></View>
        </View>
        {cat ? <Text numberOfLines={open ? 0 : 1} style={{ color: ud.muted, fontSize: 13, marginTop: 2 }}>{cat.title}</Text> : null}
      </View>

      <Photos thumbs={thumbs} onPress={(i) => (open ? setViewer(i) : toggle())} />
      <ImageViewer urls={fulls} index={viewer} onClose={() => setViewer(null)} />

      {open ? (
        <View style={{ paddingTop: 4, paddingBottom: 14, gap: 16 }}>
          <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <StatusDot status={app.status} label={statusName} police={police} />
            {allowed.length ? (
              <Pressable onPress={() => setMenu((m) => !m)} disabled={busy} style={{ borderWidth: 1, borderColor: ud.text, borderRadius: ud.radiusPill, paddingHorizontal: 12, paddingVertical: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontFamily: ud.fontBodyBold, fontSize: 12, color: ud.text }}>{busy ? '…' : 'ZMIEŃ'}</Text>
                  <SvgXml xml={CHEVRON_ICON.replace('COLOR', ud.text)} width={12} height={12} />
                </View>
              </Pressable>
            ) : null}
          </View>
          <StatusPicker
            visible={menu}
            current={app.status}
            currentLabel={statusName}
            options={allowed.map((k) => ({ key: k, label: (statuses[k] as any).action as string }))}
            onPick={pick}
            onClose={() => setMenu(false)}
          />

          {statuses[app.status]?.editable ? (
            <Pressable onPress={() => onEdit(app.id)} style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: ud.text, borderRadius: ud.radiusPill, paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text style={{ fontFamily: ud.fontBodyBold, fontSize: 12, color: ud.text }}>EDYTUJ</Text>
            </Pressable>
          ) : null}
          {app.number ? <Text style={{ color: ud.text, fontSize: 15 }}>Zgłoszenie <Text style={{ fontFamily: ud.fontBodyBold }}>{app.number}</Text></Text> : null}
          </View>
          <IconLine icon={DATETIME_ICON}><Text style={{ fontFamily: ud.fontBodyBold, color: ud.text, fontSize: 15 }}>{fmtLongDate(app.date)}</Text></IconLine>
          <IconLine icon={PIN_ICON}><Text style={{ color: ud.text, fontSize: 15 }}>{app.address?.address || 'Brak adresu'}</Text></IconLine>

          {recCnt > 1 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ backgroundColor: ud.accent, borderRadius: ud.radiusPill, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ fontFamily: ud.fontBodyBold, color: ud.onAccent, fontSize: 12 }}>
                  ❗ {plural(recCnt, ['wykroczeń', 'wykroczenie', 'wykroczenia'])}
                </Text>
              </View>
              <Text style={{ color: ud.muted, fontSize: 12 }}>
                {plural(recydywa!.usersCnt, ['osób zgłosiło', 'osoba zgłosiła', 'osoby zgłosiły'])}
              </Text>
            </View>
          ) : null}

          <Row label="TREŚĆ ZGŁOSZENIA" icon={DESCRIPTION_ICON}>
            <Text style={{ color: ud.text, fontSize: 15, lineHeight: 22 }}>{reportBody(cat?.formal, app.userComment) || '—'}</Text>
          </Row>
          <Row label="INFORMACJE DODATKOWE" icon={INFO_ICON}>
            <Text style={{ color: ud.text, fontSize: 15, lineHeight: 22 }}>{witnessText(app.statements?.witness)}</Text>
            {app.sent?.date ? (
              <Text style={{ color: ud.text, fontSize: 15, lineHeight: 22, marginTop: 4 }}>Wysłano do {police ? '👮 ' : ''}{app.recipient?.shortName ? `${app.recipient.shortName} ` : ''}{fmtSent(app.sent.date)}.</Text>
            ) : null}
          </Row>
          {wasSent ? (
            <EditableField label="NUMER SPRAWY SM/POLICJI" value={app.externalId ?? ''} placeholder="RSOW 0000/24 / WP 000/24" onSave={(v) => onFields(app.id, { externalId: v })} onFocus={() => onFieldFocus(app.id)} />
          ) : null}
          <EditableField
            label={<>UWAGI (<Text onPress={() => onPage('/bezpieczenstwo.html', 'Bezpieczeństwo')} style={{ color: ud.primary, textDecorationLine: 'underline' }}>widoczne tylko dla Ciebie</Text>)</>}
            icon={ENCRYPTED_ICON}
            value={app.privateComment ?? ''} multiline onSave={(v) => onFields(app.id, { privateComment: v })} onFocus={() => onFieldFocus(app.id)} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function ReportsScreen({ navigation, route }: any) {
  const isPatron = useAuth((s) => s.isPatron); // odznaka PRO z backendu
  const go = (r: string) => navigation.navigate(r);
  const [apps, setApps] = useState<UdApp[]>([]);
  const [openId, setOpenId] = useState<string | null>(null); // rozwinięte jest zawsze najwyżej jedno zgłoszenie
  const [statuses, setStatuses] = useState<Record<string, StatusDef>>({});
  const [cats, setCats] = useState<Category[]>([]);
  const [filter, setFilter] = useState<string>(route?.params?.filter ?? 'all'); // 'all' = brak aktywnego chipa
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Wejście z pulpitu (karta Mandaty/Pouczenia) ustawia filtr, nawet gdy ekran już istnieje na stosie.
  useEffect(() => { if (route?.params?.filter) setFilter(route.params.filter); }, [route?.params?.filter]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(true);
  const [err, setErr] = useState<unknown>(null); // błąd ładowania listy (ApiError/Error)
  const reqId = useRef(0); // ignoruje spóźnione odpowiedzi po zmianie filtra/frazy

  const chips = useMemo(() => filterChips(statuses, counts), [statuses, counts]);
  // Użytkownik bez ani jednego zgłoszenia (aktywnych ani w archiwum) nie ma czego szukać ani filtrować – bez paska
  // wyszukiwania i chipów, sam komunikat „Nie masz jeszcze…”. Dopóki liczniki się nie wczytały, pasek zostaje.
  const noReports = Object.keys(counts).length > 0 && Number(counts.active ?? 0) + Number(counts.archived ?? 0) === 0;
  const categories = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);

  // Liczniki chipów zawsze z serwera (pełna baza, nie wczytana strona) – wołane przy wejściu na ekran,
  // odświeżeniu listy i po zmianie statusu, żeby np. „WYSYŁAM (1)” nie wisiało po zakończonej wysyłce.
  const refreshCounts = useCallback(
    () => fetchStatusCounts().then(setCounts).catch((e) => log.warn('zgloszenia', String(e?.message ?? e))),
    [],
  );

  // Słownik statusów: przy słabym necie fetchStatuses() zwraca {} – wtedy karty pokazywały surowe klucze (po angielsku)
  // i nie dało się zmienić statusu. Pusty słownik pobieramy ponownie przy każdym przeładowaniu listy.
  const statusesLoaded = useRef(false);
  const loadStatuses = useCallback(() => {
    if (statusesLoaded.current) return;
    fetchStatuses().then((s) => {
      if (!Object.keys(s).length) return;
      statusesLoaded.current = true;
      setStatuses(s);
    });
  }, []);

  useEffect(() => {
    loadStatuses();
    refreshCounts();
    fetchCategories().then(setCats);
  }, [refreshCounts, loadStatuses]);

  // Debounce wyszukiwarki – backend robi LIKE po całym JSON-ie zgłoszenia.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (reset: boolean) => {
    const id = ++reqId.current;
    if (reset) { refreshCounts(); loadStatuses(); }
    try {
      const offset = reset ? 0 : apps.length;
      // bez aktywnego chipa = „active” (jak domyślna lista na www: bez archiwum; archiwum po wybraniu chipa)
      const page = await fetchApps({ status: filter === 'all' ? 'active' : filter, search: query, offset });
      if (id !== reqId.current) return;
      setErr(null); // błąd znika dopiero po udanym wczytaniu (odpytywanie co 5 s nie miga ekranem błędu)
      setApps((prev) => (reset ? page : [...prev, ...page]));
      setMore(page.length === PAGE_SIZE);
    } catch (e: any) {
      if (id !== reqId.current) return;
      setErr(e);
      log.error('zgloszenia', e?.message ?? String(e));
    } finally {
      if (id === reqId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [filter, query, apps.length, refreshCounts, loadStatuses]);

  useEffect(() => {
    setLoading(true);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, query]);

  // Powrót na ekran (np. z podsumowania po „Potwierdź i wyślij”) → świeża lista i liczniki.
  const firstFocus = useRef(true);
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const onFocus = navigation.addListener('focus', () => {
      setFocused(true);
      if (firstFocus.current) { firstFocus.current = false; return; } // pierwsze wejście ładują efekty wyżej
      load(true);
    });
    const onBlur = navigation.addListener('blur', () => setFocused(false));
    return () => { onFocus(); onBlur(); };
  }, [navigation, load]);

  // Wysyłka trwa chwilę (status „Wysyłam”) – dopóki jakieś zgłoszenie jest w tym stanie, odświeżamy co 5 s.
  const sending = apps.some((a) => a.status === 'sending');
  useEffect(() => {
    if (!sending || !focused) return; // ekran w tle nie odpytuje serwera
    const t = setInterval(() => load(true), 5000);
    return () => clearInterval(t);
  }, [sending, focused, load]);

  // Aktywny filtr, którego już nie ma wśród chipów (liczba spadła do 0), wraca do „wszystkie”.
  useEffect(() => {
    if (filter !== 'all' && Object.keys(counts).length && !chips.some((c) => c.key === filter)) setFilter('all');
  }, [filter, counts, chips]);

  const onStatus = async (id: string, status: string) => {
    try {
      await changeStatus(id, status);
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
      refreshCounts();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  // Klawiatura: lista kurczy się nad nią (KeyboardAvoidingView), a edytowane pole przewijamy w widok – karta ze zdjęciami
  // jest wysoka, a pola są na jej dole; bez tego klawiatura zasłaniała wpisywany tekst.
  const listRef = useRef<FlatList<UdApp>>(null);
  const [kbd, setKbd] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKbd(true));
    // Android: schowanie klawiatury (wstecz/gest) nie zdejmuje fokusu z pola, więc nie byłoby blur i zapisu – zdejmujemy go sami.
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKbd(false);
      TextInput.State.currentlyFocusedInput()?.blur();
    });
    return () => { show.remove(); hide.remove(); };
  }, []);
  const onFieldFocus = (id: string) => {
    const index = apps.findIndex((a) => a.id === id);
    if (index < 0) return;
    // po zmianie rozmiaru listy przez klawiaturę: dół karty (z polami) na dół widocznego obszaru
    setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 1, animated: true }), 300);
  };

  const onFields = async (id: string, fields: { externalId?: string; privateComment?: string }) => {
    const r = await setReportFields(id, fields); // błąd wraca do pola (EditableField pokazuje komunikat)
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, ...fields } : a)));
    // wysłane + numer sprawy → jak na webie: zaproponuj status „potwierdzone”
    if (r.suggestStatusChange && fields.externalId !== undefined) {
      Alert.alert('Numer sprawy', 'Zgłoszenie ma numer sprawy. Zmienić jego status na „potwierdzone”?', [
        { text: 'Nie', style: 'cancel' },
        { text: 'Tak', onPress: () => void onStatus(id, 'confirmed-sm') },
      ]);
    }
  };

  // Lista się nie wczytała (np. 500) i nie ma czego pokazać → pełny ekran błędu z linkiem do kontaktu.
  if (err && !apps.length && !loading) {
    return (
      <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
        <UdHeader />
        <ErrorScreen error={err} onRetry={() => load(true)} onContact={() => openUdPage(navigation, '/kontakt.html', 'Kontakt')} />
        <UdTabs current="Reports" navigate={go} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader />
      {noReports ? null : (
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <Pressable onPress={() => { const e = letterEntry(isPatron); navigation.navigate(e.route, e.params); }} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginBottom: 8 }}>
          <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, textDecorationLine: 'underline' }}>{LETTER_LINK_LABEL}</Text>
        </Pressable>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Adres, numer rej. lub zgłoszenia, komentarz"
          placeholderTextColor={ud.muted}
          autoCorrect={false}
          style={{ backgroundColor: ud.surface, borderWidth: 1, borderColor: ud.hairline, borderRadius: ud.radiusButton, paddingHorizontal: 14, paddingVertical: 10, color: ud.text }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 10, paddingVertical: 12 }}>
          {chips.map((c) => {
            const on = c.key === filter;
            const col = statusColor(c.key);
            return (
              // Jak na webie: ponowne dotknięcie aktywnego filtra zdejmuje go (wszystkie zgłoszenia).
              <Pressable key={c.key} onPress={() => setFilter(on ? 'all' : c.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontFamily: ud.fontBodyBold, fontSize: 13, color: on ? ud.primary : '#666', textDecorationLine: on ? 'underline' : 'none' }}>{c.label.toUpperCase()}</Text>
                <View style={{ backgroundColor: col.fill, borderColor: col.stroke, borderWidth: 2, borderRadius: 20, paddingHorizontal: 7, minWidth: 22, alignItems: 'center' }}>
                  <Text style={{ fontFamily: ud.fontBodyBold, fontSize: 12, color: col.text }}>{c.count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      )}
      {loading && !apps.length ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={ud.primary} />
      ) : (
        <FlatList
          ref={listRef}
          onScrollToIndexFailed={() => {}}
          data={apps}
          keyExtractor={(a) => a.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <ReportCard app={item} statuses={statuses} categories={categories} onStatus={onStatus} onFields={onFields} onFieldFocus={onFieldFocus} onPage={(path, title) => openUdPage(navigation, path, title)} onEdit={(id) => navigation.navigate('NewReport', { editId: id })} open={openId === item.id} onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={ud.primary} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (more && !loading && !refreshing) load(false); }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40, gap: 12 }}>
              <Text style={{ color: ud.muted }}>{query || filter !== 'all' ? 'Brak zgłoszeń dla tych kryteriów.' : 'Nie masz jeszcze ani jednego zgłoszenia.'}</Text>
              {!query && filter === 'all' ? <UdButton title="Dodaj zgłoszenia" onPress={() => go('NewReport')} /> : null}
            </View>
          }
          removeClippedSubviews
          initialNumToRender={6}
        />
      )}
      {kbd ? null : <UdTabs current="Reports" navigate={go} />}
    </KeyboardAvoidingView>
  );
}
