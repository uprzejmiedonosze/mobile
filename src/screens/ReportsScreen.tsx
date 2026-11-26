import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { href, param, type RouteName } from '../lib/routes';
import { ActivityIndicator, Alert, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { changeStatus, fetchApps, fetchStatusCounts, fetchStatuses, imageUrl, PAGE_SIZE, setReportFields, type StatusDef, type UdApp } from '../api/apps';
import { fetchCategories } from '../api/geo';
import { fetchRecydywa, fetchRecydywaGallery } from '../api/recydywa';
import { validIdToken } from '../api/udApi';
import { LETTER_LINK_LABEL, letterEntry } from '../lib/letters';
import { fetchPhotoQuota } from '../api/photos';
import { log } from '../lib/log';
import { fmtLongDate, fmtSent, filterChips, fmtShortDate, plateHistory, plural, reportBody, shortAddress, statusColor, witnessText } from '../lib/reports';
import { ImageViewer } from '../components/ImageViewer';
import { FAB_SPACE, fabShown, NewReportFab } from '../components/NewReportFab';
import { KeyboardDoneBar } from '../components/KeyboardDoneBar';
import { ErrorScreen } from '../components/ErrorScreen';
import { openUdPage } from '../lib/openPage';
import { UdButton, UdCard } from '../components/UD';
import { ActionRow, SectionHeader } from '../components/FormBits';
import type { Category, RecydywaEntry, RecydywaGallery, RecydywaInfo } from '../types';
import { useAuth } from '../store/useAuth';
import { useReportSheet } from '../store/useReportSheet';
import { toast } from '../store/useToast';
import { ud, inputColors, ripple } from '../theme';
import { SvgXml } from 'react-native-svg';
import { CHEVRON_ICON, DATETIME_ICON, DESCRIPTION_ICON, ENCRYPTED_ICON, INFO_ICON, PIN_ICON } from '../assets/detailIcons';

function StatusDot({ status, label, police }: { status: string; label: string; police?: boolean }) {
  const t = statusColor(status);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: t.stroke, backgroundColor: t.fill, marginRight: 6 }} />
      <Text numberOfLines={1} style={{ fontFamily: ud.fontBodyBold, color: ud.text, fontSize: 13, flexShrink: 1 }}>{label}{police ? <Text style={{ fontFamily: ud.fontBody, color: ud.muted }}> · Policja</Text> : null}</Text>
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
          <Image source={{ uri: u }} style={{ width: 220, height: 160, borderRadius: 12, backgroundColor: ud.surfaceCream }} resizeMode="cover" />
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
  const title = <Text style={{ fontFamily: ud.fontBodyBold, color: ud.heading, fontSize: 15 }}>{label}</Text>;
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
  const [focused, setFocused] = useState(false);
  const accessoryId = `done-${useId()}`; // „Gotowe” nad klawiaturą dla wielowierszowych uwag (iOS)
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
      <TextInput {...inputColors}
        value={text}
        onChangeText={(t) => { setText(t); textRef.current = t; if (state === 'error') setState('idle'); }}
        onBlur={() => { setFocused(false); void commit(); }}
        onFocus={() => { setFocused(true); onFocus?.(); }}
        editable={state !== 'saving'}
        multiline={multiline}
        inputAccessoryViewID={multiline ? accessoryId : undefined}
        placeholder={placeholder}
        placeholderTextColor={ud.muted}
        autoCorrect={false}
        style={{ marginTop: 4, backgroundColor: ud.surface, borderWidth: focused || state === 'error' ? 2 : 1, borderColor: state === 'error' ? ud.plateVerified : focused ? ud.primary : ud.lockedBorder, borderRadius: 12, paddingVertical: 12, paddingLeft: 14, paddingRight: icon ? 38 : 14, fontSize: 16, color: ud.text, minHeight: multiline ? 96 : 48, textAlignVertical: multiline ? 'top' : 'center', opacity: state === 'saving' ? 0.6 : 1 }}
      />
      {/* jak na webie: ikona zaszyfrowanego pliku w rogu pola z uwagami */}
      {icon ? <View pointerEvents="none" style={{ position: 'absolute', right: 12, bottom: 14 }}><SvgXml xml={icon.replace('COLOR', ud.muted)} width={20} height={20} /></View> : null}
      {multiline ? <KeyboardDoneBar id={accessoryId} /> : null}
      {state === 'error' ? <Text style={{ color: ud.plateVerified, fontSize: 13, marginTop: 6 }}>Nie udało się zapisać – spróbuj ponownie.</Text> : state === 'saving' ? <Text style={{ color: ud.muted, fontSize: 13, marginTop: 6 }}>Zapisuję…</Text> : null}
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
            <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, fontSize: 16 }}>Anuluj</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Historia pojazdu („Zobacz zgłoszenia” z webu) z REST, bo strona /tablica-rejestracyjna-… wymaga sesji www, której WebView nie ma.
// Zdjęcia, ich opisy i progi widoczności liczy backend jak na webie (\recydywa\plateGallery); bez nich (błąd, starszy backend) zostaje sama lista.
function RecydywaHistory({ info, categories, onClose, onAccount }: { info: RecydywaInfo; categories: Map<number, Category>; onClose: () => void; onAccount: () => void }) {
  const [gallery, setGallery] = useState<RecydywaGallery | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    validIdToken().then((t) => fetchRecydywaGallery(info.plateId, t)).then(setGallery).catch(() => {}).finally(() => setLoading(false));
  }, [info.plateId]);
  const reports: (RecydywaEntry & Partial<RecydywaGallery['reports'][number]>)[] = plateHistory<RecydywaEntry>(gallery ?? info);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        {/* Tło zamykające okno jest rodzeństwem karty, nie rodzicem – zagnieżdżony Pressable zabierał gest przewijania ScrollView. */}
        <Pressable onPress={onClose} accessibilityLabel="Zamknij" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ backgroundColor: ud.surface, borderRadius: ud.radiusCard, paddingVertical: 18, width: '100%', maxWidth: 480, maxHeight: '90%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
            <Text style={{ fontFamily: ud.fontDisplay, fontSize: 18, color: ud.heading }}>Recydywa</Text>
            <PlateBadge plate={info.plateId} />
          </View>
          <Text style={{ color: ud.muted, fontSize: 13, paddingHorizontal: 16, marginTop: 6, marginBottom: 10 }}>
            {plural(info.appsCnt, ['wykroczeń', 'wykroczenie', 'wykroczenia'])}, {plural(info.usersCnt, ['osób zgłosiło', 'osoba zgłosiła', 'osoby zgłosiły'])}
          </Text>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 12 }}>
            {gallery && !gallery.allImagesVisible && !gallery.userAllowedSharing ? (
              <View style={{ backgroundColor: ud.surfaceLow, borderRadius: ud.radiusSm, padding: 12, gap: 4 }}>
                <Text style={{ fontFamily: ud.fontBodyBold, color: ud.text, fontSize: 14 }}>Chcesz widzieć więcej zdjęć? Udostępnij swoje!</Text>
                <Text style={{ color: ud.text, fontSize: 13 }}>Publikujemy wyłącznie zdjęcia od użytkowników, którzy się na to zgodzili.</Text>
                <Text onPress={onAccount} style={{ color: ud.primary, fontSize: 13, textDecorationLine: 'underline' }}>Przejdź do ustawień</Text>
              </View>
            ) : null}
            {loading ? <ActivityIndicator color={ud.primary} /> : null}
            {reports.map((r, i) => {
              const cat = r.categoryInfo ? categories.get(r.categoryInfo.id) : undefined;
              return (
                <View key={r.reportId ?? i} style={{ borderWidth: 1, borderColor: ud.hairline, borderRadius: ud.radiusSm, overflow: 'hidden' }}>
                  {r.isOwn ? <Text style={{ backgroundColor: ud.primary, color: ud.surface, fontFamily: ud.fontBodyBold, fontSize: 12, textAlign: 'center', paddingVertical: 3 }}>Twoje zgłoszenie{r.number ? ` ${r.number}` : ''}</Text> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 10 }}>
                    <StatusDot status={r.status} label={r.statusLabel} police={r.recipient.isPolice} />
                    <Text style={{ color: ud.muted, fontSize: 13 }}>{fmtShortDate(r.date ?? undefined)}</Text>
                  </View>
                  {r.imageUrl ? (
                    <View>
                      <Image source={{ uri: r.imageUrl }} style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: ud.surfaceLow }} />
                      {r.imageHint ? <Text style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', color: '#FFFFFF', fontSize: 12, textAlign: 'center', paddingVertical: 3 }}>{r.imageHint}</Text> : null}
                    </View>
                  ) : null}
                  <View style={{ padding: 10, gap: 6 }}>
                    {r.categoryInfo ? <Text style={{ color: ud.text, fontSize: 14 }}>{cat?.short || r.categoryInfo.title}</Text> : null}
                    {r.recipient.shortName ? <Text style={{ color: ud.muted, fontSize: 13 }}>{r.recipient.shortName}{r.recipient.isPolice ? ' (Policja)' : ''}{r.caseNumber ? `, sprawa ${r.caseNumber}` : ''}</Text> : null}
                  </View>
                </View>
              );
            })}
            {!info.sharedHistory && info.reports.length < info.appsCnt ? (
              <Text style={{ color: ud.muted, fontSize: 13 }}>Cudze zgłoszenia widać dopiero, gdy pojazd zgłoszą co najmniej dwie osoby.</Text>
            ) : null}
          </ScrollView>
          <Pressable onPress={onClose} accessibilityRole="button" style={{ borderTopWidth: 1, borderTopColor: ud.hairline, paddingTop: 14, paddingHorizontal: 20, alignItems: 'center' }}>
            <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, fontSize: 16 }}>Zamknij</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Kapsułka akcji w rozwiniętej karcie (zamiast obrysowanych WERSALIKÓW): tonalne tło, zielony tekst, wciśnięcie przy dotyku.
const pill = (pressed: boolean) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 36, borderRadius: ud.radiusPill, backgroundColor: ud.primaryContainer, paddingHorizontal: 14, opacity: pressed ? 0.6 : 1 });
const pillText = { fontFamily: ud.fontBodyBold, fontSize: 14, color: ud.primary } as const;

type CardProps = {
  app: UdApp;
  statuses: Record<string, StatusDef>;
  categories: Map<number, Category>;
  onStatus: (id: string, status: string) => Promise<void>;
  onEdit: (id: string) => void;
  onFields: (id: string, fields: { externalId?: string; privateComment?: string }) => Promise<void>;
  onFieldFocus: (id: string) => void;
  onPage: (path: string, title?: string) => void;
  onAccount: () => void;
  open: boolean;
  onToggle: (id: string) => void;
  sheet?: boolean; // karta w arkuszu (/app/report): zawsze rozwinięta, bez strzałki, cienia i wciśnięcia
};

export function ReportCard({ app, statuses, categories, onStatus, onEdit, onFields, onFieldFocus, onPage, onAccount, open, onToggle, sheet }: CardProps) {
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recydywa, setRecydywa] = useState<RecydywaInfo | null>(null);
  const [history, setHistory] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const police = app.recipient?.isPolice ?? !!app.stopAgresji; // recipient liczy backend (recipientData w API.php)
  const statusName = statuses[app.status]?.name ?? app.status;
  const cat = categories.get(Number(app.category));
  const plate = app.carInfo?.plateId;
  const recCnt = recydywa?.appsCnt ?? 0;
  const comment = app.userComment?.trim();

  // Ten sam opis przy kolejnym pojeździe: kopiujemy sam komentarz, bez tekstu kategorii z „Treści zgłoszenia”.
  const copyComment = () => {
    Clipboard.setStringAsync(comment ?? '')
      .then(() => toast.info('Skopiowano komentarz.'))
      .catch(() => toast.error('Nie udało się skopiować komentarza.'));
  };

  // Recydywa (1 wywołanie na kartę) dopiero po rozwinięciu – lista może mieć setki pozycji.
  useEffect(() => {
    if (!open || !plate || app.status === 'archived' || recydywa) return;
    validIdToken().then((t) => fetchRecydywa(plate, t)).then(setRecydywa).catch(() => {});
  }, [open, plate, app.status, recydywa]);

  const slots = (['contextImage', 'carImage', 'thirdImage'] as const);
  const thumbs = slots.map((k) => imageUrl(app[k], app, false, k)).filter(Boolean) as string[];
  const fulls = slots.map((k) => imageUrl(app[k], app, true, k)).filter(Boolean) as string[];
  // Zwinięte zgłoszenie: dotknięcie czegokolwiek (także zdjęcia) rozwija; rozwinięte: zdjęcie się powiększa.
  const toggle = () => onToggle(app.id);

  // jak Application::wasSent() w backendzie: wysłane i już poza szkicem/potwierdzeniem – dopiero wtedy ma sens numer sprawy
  const wasSent = !!app.sent && !['draft', 'ready', 'confirmed'].includes(app.status);

  const allowed = (statuses[app.status]?.allowed ?? []).filter((k) => statuses[k] && (statuses[k] as any).action);

  const pick = async (k: string) => {
    setMenu(false);
    setBusy(true);
    try { await onStatus(app.id, k); } finally { setBusy(false); }
  };

  return (
    // Biała karta jak na Starcie; status pokazuje kropka w kolorze statusu przy jego nazwie (bez paska z boku karty).
    <Pressable onPress={toggle} disabled={sheet} android_ripple={sheet ? undefined : ripple} accessibilityRole={sheet ? undefined : 'button'} accessibilityHint={sheet ? undefined : 'Otwiera szczegóły zgłoszenia'}
      style={({ pressed }) => ({ backgroundColor: ud.surface, paddingHorizontal: 16, paddingVertical: 12, marginBottom: sheet ? 0 : 12, borderRadius: ud.radiusCard, overflow: 'hidden', transform: [{ scale: pressed && !sheet ? 0.98 : 1 }], shadowColor: '#000', shadowOpacity: sheet ? 0 : 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 3 }, elevation: sheet ? 0 : 2 })}>
      <View style={{ paddingVertical: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <StatusDot status={app.status} label={statusName} police={police} />
          <Text style={{ color: ud.muted, fontSize: 13 }}>{fmtShortDate(app.date)}</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <PlateBadge plate={plate} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 18, letterSpacing: -0.2 }}>
            {shortAddress(app.address?.address) || 'Brak adresu'}
          </Text>
          {/* na liście strzałka „›” (otwiera arkusz ze szczegółami); w arkuszu bez strzałki */}
          {sheet ? null : <View style={{ transform: [{ rotate: '-90deg' }], padding: 2 }}><SvgXml xml={CHEVRON_ICON.replace('COLOR', ud.muted)} width={16} height={16} /></View>}
        </View>
        {cat ? <Text numberOfLines={open ? 0 : 1} style={{ color: ud.muted, fontSize: 14, marginTop: 2 }}>{cat.title}</Text> : null}
      </View>

      <Photos thumbs={thumbs} onPress={(i) => (open ? setViewer(i) : toggle())} />
      <ImageViewer urls={fulls} index={viewer} onClose={() => setViewer(null)} />

      {open ? (
        <View style={{ paddingTop: 4, paddingBottom: 14, gap: 16 }}>
          <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <StatusDot status={app.status} label={statusName} police={police} />
            {allowed.length ? (
              <Pressable onPress={() => setMenu((m) => !m)} disabled={busy} accessibilityRole="button" style={({ pressed }) => pill(pressed)}>
                <Text style={pillText}>{busy ? 'Zmieniam…' : 'Zmień status'}</Text>
                <SvgXml xml={CHEVRON_ICON.replace('COLOR', ud.primary)} width={12} height={12} />
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
            <Pressable onPress={() => onEdit(app.id)} accessibilityRole="button" style={({ pressed }) => ({ ...pill(pressed), alignSelf: 'flex-start' })}>
              <Text style={pillText}>Edytuj zgłoszenie</Text>
            </Pressable>
          ) : null}
          {app.number ? <Text style={{ color: ud.text, fontSize: 15 }}>Zgłoszenie <Text style={{ fontFamily: ud.fontBodyBold }}>{app.number}</Text></Text> : null}
          </View>
          <IconLine icon={DATETIME_ICON}><Text style={{ fontFamily: ud.fontBodyBold, color: ud.text, fontSize: 15 }}>{fmtLongDate(app.date)}</Text></IconLine>
          <IconLine icon={PIN_ICON}><Text style={{ color: ud.text, fontSize: 15 }}>{app.address?.address || 'Brak adresu'}</Text></IconLine>

          {recCnt > 1 ? (
            <>
              {/* Własny Pressable: bez niego dotknięcie trafia do karty i zwija szczegóły. */}
              <Pressable onPress={() => setHistory(true)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingVertical: 4 }}>
                <View style={{ backgroundColor: ud.accent, borderRadius: ud.radiusPill, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: ud.fontBodyBold, color: ud.onAccent, fontSize: 13 }}>
                    Recydywa: {plural(recCnt, ['wykroczeń', 'wykroczenie', 'wykroczenia'])}
                  </Text>
                </View>
                <Text style={{ color: ud.muted, fontSize: 13 }}>
                  {plural(recydywa!.usersCnt, ['osób zgłosiło', 'osoba zgłosiła', 'osoby zgłosiły'])}
                </Text>
                <Text style={{ color: ud.primary, fontSize: 13, fontFamily: ud.fontBodyBold }}>Zobacz zgłoszenia ›</Text>
              </Pressable>
              {history ? <RecydywaHistory info={recydywa!} categories={categories} onClose={() => setHistory(false)} onAccount={() => { setHistory(false); onAccount(); }} /> : null}
            </>
          ) : null}

          <Row label="Treść zgłoszenia" icon={DESCRIPTION_ICON}>
            <Text style={{ color: ud.text, fontSize: 15, lineHeight: 22 }}>{reportBody(cat?.formal, app.userComment) || '—'}</Text>
            {/* Własny Pressable: bez niego dotknięcie trafia do karty i zwija szczegóły. */}
            {comment ? (
              <Pressable onPress={copyComment} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
                <Text style={{ color: ud.primary, fontSize: 14, fontFamily: ud.fontBodyBold }}>Kopiuj komentarz</Text>
              </Pressable>
            ) : null}
          </Row>
          <Row label="Informacje dodatkowe" icon={INFO_ICON}>
            <Text style={{ color: ud.text, fontSize: 15, lineHeight: 22 }}>{witnessText(app.statements?.witness)}</Text>
            {app.sent?.date ? (
              <Text style={{ color: ud.text, fontSize: 15, lineHeight: 22, marginTop: 4 }}>Wysłano do {app.recipient?.shortName ? `${app.recipient.shortName} ` : police ? 'Policji ' : ''}{fmtSent(app.sent.date)}.</Text>
            ) : null}
          </Row>
          {wasSent ? (
            <EditableField label="Numer sprawy SM/Policji" value={app.externalId ?? ''} placeholder="RSOW 0000/24 / WP 000/24" onSave={(v) => onFields(app.id, { externalId: v })} onFocus={() => onFieldFocus(app.id)} />
          ) : null}
          <EditableField
            label={<>Uwagi (<Text onPress={() => onPage('/bezpieczenstwo.html', 'Bezpieczeństwo')} style={{ color: ud.primary, textDecorationLine: 'underline' }}>widoczne tylko dla Ciebie</Text>)</>}
            icon={ENCRYPTED_ICON}
            value={app.privateComment ?? ''} multiline onSave={(v) => onFields(app.id, { privateComment: v })} onFocus={() => onFieldFocus(app.id)} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function ReportsScreen() {
  const isPatron = useAuth((s) => s.isPatron); // odznaka PRO z backendu
  const router = useRouter();
  const navigation = useNavigation(); // focus/blur zakładki
  const filterParam = param(useLocalSearchParams<{ filter?: string }>().filter);
  const go = (r: RouteName) => router.navigate(href(r));
  const openLetters = async () => {
    // Odznaka z cache'owanych statystyk bywa nieaktualna (do 24 h) – bez niej pytamy o aktualny próg wsparcia.
    const quota = isPatron ? null : await fetchPhotoQuota().catch(() => null);
    const e = letterEntry(isPatron, quota);
    router.push(href(e.route, e.params));
  };
  const [apps, setApps] = useState<UdApp[]>([]);
  const [statuses, setStatuses] = useState<Record<string, StatusDef>>({});
  const [cats, setCats] = useState<Category[]>([]);
  const [filter, setFilter] = useState<string>(filterParam ?? 'all'); // 'all' = brak aktywnego chipa
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Wejście z pulpitu (karta Mandaty/Pouczenia) ustawia filtr, nawet gdy ekran już istnieje na stosie.
  useEffect(() => { if (filterParam) setFilter(filterParam); }, [filterParam]);
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
      log.fail('zgloszenia', e);
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

  // Szczegóły zgłoszenia w natywnym arkuszu (formSheet, /app/report) zamiast rozwijania karty na liście.
  const openSheet = (app: UdApp) => {
    useReportSheet.getState().open(app, statuses, categories);
    router.push(href('Report'));
  };
  // Zmiana zrobiona w arkuszu (status, numer sprawy, uwagi) od razu na liście; po zmianie statusu – świeże liczniki filtrów.
  const patched = useReportSheet((st) => st.patched);
  useEffect(() => {
    if (!patched) return;
    setApps((prev) => prev.map((a) => (a.id === patched.id ? { ...a, ...patched.patch } : a)));
    if (patched.patch.status) refreshCounts();
  }, [patched, refreshCounts]);

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
  useEffect(() => {
    // Android: schowanie klawiatury (wstecz/gest) nie zdejmuje fokusu z pola, więc nie byłoby blur i zapisu – zdejmujemy go sami.
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      TextInput.State.currentlyFocusedInput()?.blur();
    });
    return () => hide.remove();
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

  // Natywny pasek wyszukiwania w nagłówku (jak Poczta/Notatki) – zamiast własnego pola nad listą. Bez zgłoszeń nie ma czego szukać.
  const searchBar = noReports ? undefined : {
    placeholder: 'Adres, numer rej., zgłoszenia, komentarz',
    cancelButtonText: 'Anuluj',
    hideWhenScrolling: false,
    obscureBackground: false,
    autoCapitalize: 'none' as const,
    onChangeText: (e: { nativeEvent: { text: string } }) => setSearch(e.nativeEvent.text),
    onCancelButtonPress: () => setSearch(''),
  };
  const screenOptions = <Stack.Screen options={{ title: 'Zgłoszenia', headerSearchBarOptions: searchBar }} />;

  // Lista się nie wczytała (np. 500) i nie ma czego pokazać → pełny ekran błędu z linkiem do kontaktu.
  if (err && !apps.length && !loading) {
    return (
      <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
        {screenOptions}
        <ErrorScreen error={err} onRetry={() => load(true)} onContact={() => openUdPage(router, '/kontakt.html', 'Kontakt')} />
      </View>
    );
  }

  const total = chips.find((c) => c.key === filter)?.count;
  const listHeader = noReports ? null : (
    <View style={{ paddingBottom: 4 }}>
      {/* Skan pisma z policji/SM – wiersz-karta jak na Starcie, a nie podkreślony link */}
      <UdCard>
        <ActionRow title={LETTER_LINK_LABEL} subtitle="Zrób zdjęcie odpowiedzi – dopasujemy ją do zgłoszenia i ustawimy status." tone="primary" trailing="›" onPress={openLetters} last />
      </UdCard>
      {/* Filtry jako przewijane kapsułki (jak w Zdjęciach/Poczcie); aktywny – zielony, ponowne dotknięcie zdejmuje filtr */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12, paddingHorizontal: 2 }} style={{ marginHorizontal: -2 }}>
        {chips.map((c) => {
          const on = c.key === filter;
          const col = statusColor(c.key);
          return (
            <Pressable key={c.key} onPress={() => setFilter(on ? 'all' : c.key)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${c.label}: ${c.count}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingLeft: 12, paddingRight: 6, borderRadius: ud.radiusPill, backgroundColor: on ? ud.primary : ud.surface, borderWidth: 1, borderColor: on ? ud.primary : ud.hairline, opacity: pressed ? 0.7 : 1 })}>
              {!on ? <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: col.stroke, backgroundColor: col.fill }} /> : null}
              <Text style={{ fontFamily: ud.fontBodyBold, fontSize: 14, color: on ? '#fff' : ud.text }}>{c.label}</Text>
              <View style={{ backgroundColor: on ? 'rgba(255,255,255,0.25)' : ud.surfaceLow, borderRadius: ud.radiusPill, paddingHorizontal: 8, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: ud.fontBodyBold, fontSize: 12, color: on ? '#fff' : ud.muted }}>{c.count}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <SectionHeader aside={total != null && filter !== 'all' ? plural(total, ['zgłoszeń', 'zgłoszenie', 'zgłoszenia']) : undefined}>
        {query ? 'Wyniki wyszukiwania' : filter === 'all' ? 'Aktywne zgłoszenia' : chips.find((c) => c.key === filter)?.label ?? 'Zgłoszenia'}
      </SectionHeader>
      <View style={{ height: 8 }} />
    </View>
  );

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: ud.surfaceLow }} collapsable={false}>
      {screenOptions}
      {loading && !apps.length ? (
        <ActivityIndicator style={{ marginTop: 160 }} color={ud.primary} accessibilityLabel="Wczytuję zgłoszenia" />
      ) : (
        <FlatList
          ref={listRef}
          onScrollToIndexFailed={() => {}}
          data={apps}
          keyExtractor={(a) => a.id}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={listHeader}
          renderItem={({ item }) => <ReportCard app={item} statuses={statuses} categories={categories} onStatus={onStatus} onFields={onFields} onFieldFocus={onFieldFocus} onPage={(path, title) => openUdPage(router, path, title)} onAccount={() => go('Account')} onEdit={(id) => router.push(href('EditReport', { editId: id }))} open={false} onToggle={() => openSheet(item)} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: fabShown ? FAB_SPACE : 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={ud.primary} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (more && !loading && !refreshing) load(false); }}
          ListFooterComponent={more && apps.length ? <ActivityIndicator style={{ marginVertical: 16 }} color={ud.primary} /> : null}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40, gap: 8, paddingHorizontal: 24 }}>
              <Text style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 20, textAlign: 'center' }}>{query || filter !== 'all' ? 'Nic nie znaleziono' : 'Nie masz jeszcze zgłoszeń'}</Text>
              <Text style={{ color: ud.muted, fontSize: 15, lineHeight: 21, textAlign: 'center' }}>{query || filter !== 'all' ? 'Zmień wyszukiwanie albo zdejmij filtr.' : 'Zrób zdjęcia źle zaparkowanego auta – resztę podpowiemy.'}</Text>
              {!query && filter === 'all' ? <View style={{ alignSelf: 'stretch', marginTop: 8 }}><UdButton title="Nowe zgłoszenie" onPress={() => go('NewReport')} /></View> : null}
            </View>
          }
          removeClippedSubviews
          initialNumToRender={6}
        />
      )}
      <NewReportFab />
    </KeyboardAvoidingView>
  );
}
