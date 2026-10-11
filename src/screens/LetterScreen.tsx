import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { fetchStatuses, type StatusDef } from '../api/apps';
import { analyzeLetter, applyLetter, type LetterAnalysis, type LetterCandidate, type LetterCaseResult } from '../api/letters';
import { isPhotoQuotaError } from '../api/udApi';
import { fetchProfile } from '../api/user';
import { PhotoQuotaNotice } from '../components/PhotoQuotaNotice';
import { UdButton, UdCard, UdHeader, UdTabs } from '../components/UD';
import { pickPhotos, takePhoto } from '../lib/gallery';
import {
  buildApplyBody, caseSummary, describeSignals, findCandidate, hasChanges, initialDraft, initialPick, kindNotice, matchHeadline,
  outcomeLabel, type ProposalDraft,
} from '../lib/letters';
import { log } from '../lib/log';
import { fmtShortDate, fmtLongDate } from '../lib/reports';
import { downscale } from '../lib/resize';
import { PATRONEM_DEFAULT } from '../lib/sex';
import { usePhotoQuota } from '../lib/usePhotoQuota';
import { toast } from '../store/useToast';
import { ud } from '../theme';

const input = { backgroundColor: ud.surface, borderWidth: 1, borderColor: ud.hairline, borderRadius: ud.radiusButton, paddingHorizontal: 12, paddingVertical: 9, color: ud.text } as const;

const Row = ({ on, onChange, title, children }: { on: boolean; onChange: (v: boolean) => void; title: string; children?: React.ReactNode }) => (
  <View style={{ marginTop: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: ud.heading, fontFamily: ud.fontBodyBold, flex: 1 }}>{title}</Text>
      <Switch value={on} onValueChange={onChange} trackColor={{ true: ud.primary }} />
    </View>
    {children}
  </View>
);

// Jedna sprawa z pisma: wybór zgłoszenia (kandydaci z serwera) + edytowalna propozycja (status, numer sprawy, notatka) + „Zastosuj”.
function CaseCard({ result, letter, statuses }: { result: LetterCaseResult; letter: LetterAnalysis['letter']; statuses: Record<string, StatusDef> }) {
  const [pick, setPick] = useState<string | null>(initialPick(result));
  const first = findCandidate(result, pick);
  const [draft, setDraft] = useState<ProposalDraft | null>(first ? initialDraft(first.proposal) : null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cand = findCandidate(result, pick);
  const name = (s: string | null) => (s ? statuses[s]?.name ?? s : '—');
  const select = (c: LetterCandidate) => { setPick(c.appId); setDraft(initialDraft(c.proposal)); setErr(null); setDone(false); };
  const summary = `${outcomeLabel(result.case.outcome)}${letter.authority ? ` (${letter.authority})` : ''}`;
  const body = cand && draft ? buildApplyBody(cand.proposal, draft, summary) : {};

  const save = async () => {
    if (!cand || !hasChanges(body)) return;
    setSaving(true); setErr(null);
    try {
      await applyLetter(cand.appId, body);
      setDone(true);
    } catch (e: any) {
      log.error('pismo', e?.message ?? String(e));
      setErr(e?.message ?? 'Nie udało się zapisać zmian.');
    } finally {
      setSaving(false);
    }
  };

  const p = cand?.proposal;
  const conflict = p?.conflicts[0];

  return (
    <UdCard>
      <Text style={{ color: ud.muted, fontSize: 12, letterSpacing: 0.5 }}>PISMO DOTYCZY</Text>
      <Text style={{ color: ud.heading, fontFamily: ud.fontBodyBold, marginTop: 2 }}>{caseSummary(result.case)}</Text>
      <Text style={{ color: ud.text, marginTop: 4 }}>{outcomeLabel(result.case.outcome)}{result.case.reason ? ` – ${result.case.reason}` : ''}</Text>
      {result.case.ids.rsow || result.case.ids.ersow || result.case.ids.ldz || result.case.ids.caseMark ? (
        <Text style={{ color: ud.muted, marginTop: 2 }}>
          {[result.case.ids.rsow && `RSOW ${result.case.ids.rsow}`, result.case.ids.ersow && `eRSOW ${result.case.ids.ersow}`, result.case.ids.ldz && `L.dz. ${result.case.ids.ldz}`, result.case.ids.caseMark].filter(Boolean).join(' · ')}
        </Text>
      ) : null}

      <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, marginTop: 14 }}>{matchHeadline(result.match.level)}</Text>
      {result.candidates.length === 0 ? (
        <Text style={{ color: ud.muted, marginTop: 4, lineHeight: 20 }}>
          Żadne z Twoich zgłoszeń nie pasuje do tej sprawy. Sprawdź numer rejestracyjny i datę w piśmie albo wyszukaj zgłoszenie na liście.
        </Text>
      ) : null}
      {result.candidates.map((c) => {
        const on = c.appId === pick;
        return (
          <Pressable key={c.appId} onPress={() => select(c)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={{ marginTop: 8, padding: 10, borderRadius: ud.radiusButton, borderWidth: 2, borderColor: on ? ud.primary : ud.hairline, backgroundColor: on ? ud.primaryContainer : ud.surface }}>
            <Text style={{ color: ud.heading, fontFamily: ud.fontBodyBold }}>{[c.number, c.plate].filter(Boolean).join(' · ')}</Text>
            <Text style={{ color: ud.text }}>{[c.date ? fmtLongDate(c.date) : null, c.address].filter(Boolean).join(' · ')}</Text>
            <Text style={{ color: ud.muted, fontSize: 12, marginTop: 2 }}>
              {`Status: ${name(c.status)}${c.externalId ? ` · sprawa ${c.externalId}` : ''}`}
            </Text>
            <Text style={{ color: ud.muted, fontSize: 12 }}>{`Zgodność ${c.score}%: ${describeSignals(c.signals).join(', ') || '—'}`}</Text>
          </Pressable>
        );
      })}

      {cand && draft && p ? (
        <View style={{ marginTop: 6 }}>
          {p.noop ? <Text style={{ color: ud.muted, marginTop: 8 }}>To pismo jest już uwzględnione w tym zgłoszeniu.</Text> : null}

          {p.set.status ? (
            <Row on={draft.useStatus} onChange={(v) => setDraft({ ...draft, useStatus: v })} title={`Status: ${name(cand.status)} → ${name(p.set.status)}`} />
          ) : null}
          {p.statusBlocked ? (
            <Text style={{ color: ud.warning, marginTop: 10, lineHeight: 20 }}>{`${p.statusBlocked.reason} Numer sprawy i notatkę można mimo to zapisać.`}</Text>
          ) : null}

          {p.set.externalId !== null ? (
            <Row on={draft.useExternalId} onChange={(v) => setDraft({ ...draft, useExternalId: v })} title="Numer sprawy">
              <TextInput value={draft.externalId} onChangeText={(t) => setDraft({ ...draft, externalId: t })} autoCapitalize="characters" style={{ ...input, marginTop: 6 }} />
            </Row>
          ) : null}
          {conflict ? (
            <Row on={draft.useExternalId} onChange={(v) => setDraft({ ...draft, useExternalId: v, externalId: conflict.proposed })} title="Zastąp numer sprawy">
              <Text style={{ color: ud.muted, marginTop: 4, lineHeight: 20 }}>{`W zgłoszeniu jest już „${conflict.current}”, a pismo podaje „${conflict.proposed}”.`}</Text>
            </Row>
          ) : null}

          {p.append.privateComment !== null ? (
            <Row on={draft.useNote} onChange={(v) => setDraft({ ...draft, useNote: v })} title="Dopisz do uwag (widocznych tylko dla Ciebie)">
              <TextInput value={draft.note} onChangeText={(t) => setDraft({ ...draft, note: t })} multiline style={{ ...input, marginTop: 6, minHeight: 64, textAlignVertical: 'top' }} />
            </Row>
          ) : null}

          {err ? <Text style={{ color: ud.plateVerified, marginTop: 10 }}>{err}</Text> : null}
          {done ? (
            <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, marginTop: 12 }}>Zapisano zmiany w zgłoszeniu ✓</Text>
          ) : p.noop ? null : (
            <View style={{ marginTop: 8 }}>
              {saving ? <ActivityIndicator color={ud.primary} /> : <UdButton title="Zastosuj" onPress={save} disabled={!hasChanges(body)} />}
            </View>
          )}
        </View>
      ) : null}
    </UdCard>
  );
}

// Jedno zdjęcie na raz: po zrobieniu zdjęcia (domyślnie aparat) albo wyborze z galerii analiza startuje od razu.
export function LetterScreen({ navigation }: any) {
  const go = (r: string) => navigation.navigate(r);
  const [uri, setUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<LetterAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; quota: boolean } | null>(null);
  const [statuses, setStatuses] = useState<Record<string, StatusDef>>({});
  const [patron, setPatron] = useState(PATRONEM_DEFAULT);
  const { quota, setQuota, refresh } = usePhotoQuota();
  const running = useRef(false); // podwójne dotknięcie nie może wysłać tego samego pisma dwa razy (każde wysłanie to kredyt)

  useEffect(() => {
    fetchStatuses().then(setStatuses);
    fetchProfile().then((p) => setPatron(p.patronem)).catch(() => {});
    refresh();
  }, [refresh]);

  const analyze = useCallback(async (photo: string) => {
    if (running.current) return;
    running.current = true;
    setUri(photo); setBusy(true); setError(null); setAnalysis(null);
    try {
      const scaled = await downscale(photo);
      setAnalysis(await analyzeLetter(scaled.uri));
      refresh(); // kredyt został zużyty
    } catch (e: any) {
      const isQuota = isPhotoQuotaError(e);
      if (isQuota && e.quota) setQuota(e.quota);
      log.error('pismo', e?.message ?? String(e));
      setError({ text: e?.message ? String(e.message) : 'Nie udało się odczytać pisma.', quota: isQuota });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [refresh, setQuota]);

  // Domyślnym źródłem jest aparat (pismo zwykle fotografuje się „z ręki”); galeria – dla gotowych skanów.
  const add = useCallback(async (source: 'camera' | 'gallery') => {
    if (running.current) return;
    try {
      const photo = source === 'camera' ? await takePhoto() : (await pickPhotos(1))[0]?.uri ?? null;
      if (photo) void analyze(photo);
    } catch (e: any) {
      toast.error(e?.message ?? 'Nie udało się dodać zdjęcia.');
    }
  }, [analyze]);

  const reset = () => { setUri(null); setAnalysis(null); setError(null); };
  const notice = analysis ? kindNotice(analysis.letter.kind, analysis.cases.length) : null;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader title="Pismo" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {!uri ? (
          <>
            <Text style={{ color: ud.text, lineHeight: 21 }}>
              Zrób zdjęcie odpowiedzi Policji lub Straży Miejskiej. Odczytamy numer sprawy i wynik, znajdziemy zgłoszenie i zaproponujemy zmiany.
            </Text>
            <Text style={{ color: ud.muted, marginTop: 6, fontSize: 12 }}>Odczyt zużywa 1 kredyt analizy zdjęć. Zdjęcie nie jest nigdzie zapisywane.</Text>
            <View style={{ marginTop: 12 }}>
              <PhotoQuotaNotice quota={quota} patronem={patron} onMore={() => navigation.navigate('QuotaInfo')} />
            </View>
            <UdButton title="Zrób zdjęcie pisma" onPress={() => add('camera')} />
            <UdButton title="Wybierz z galerii" variant="outline" onPress={() => add('gallery')} />
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image source={{ uri }} style={{ width: 84, height: 112, borderRadius: ud.radiusSm, backgroundColor: ud.surfaceCream }} />
            {busy ? (
              <View style={{ flex: 1 }}>
                <ActivityIndicator color={ud.primary} style={{ alignSelf: 'flex-start' }} />
                <Text style={{ color: ud.muted, marginTop: 8, lineHeight: 20 }}>Czytam pismo… to może potrwać kilkanaście sekund.</Text>
              </View>
            ) : null}
          </View>
        )}

        {error ? (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: ud.plateVerified, lineHeight: 20 }}>{error.text}</Text>
            {error.quota ? <View style={{ marginTop: 10 }}><PhotoQuotaNotice quota={quota} patronem={patron} onMore={() => navigation.navigate('QuotaInfo')} /></View> : null}
            {!error.quota && uri ? <UdButton title="Spróbuj ponownie" onPress={() => void analyze(uri)} /> : null}
            <UdButton title="Wybierz inne zdjęcie" variant="outline" onPress={reset} />
          </View>
        ) : null}

        {analysis ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 18 }}>
              {analysis.letter.authority ?? 'Pismo'}{analysis.letter.date ? `, ${fmtShortDate(`${analysis.letter.date}T00:00:00`)}` : ''}
            </Text>
            {notice ? <Text style={{ color: ud.muted, marginTop: 6, lineHeight: 20 }}>{notice}</Text> : null}
            {analysis.cases.map((c) => <CaseCard key={c.index} result={c} letter={analysis.letter} statuses={statuses} />)}
            <UdButton title="Dodaj kolejne pismo" onPress={reset} />
            <UdButton title="Zobacz zgłoszenia" variant="outline" onPress={() => go('Reports')} />
          </View>
        ) : null}
      </ScrollView>
      <UdTabs current="Letter" navigate={go} />
    </KeyboardAvoidingView>
  );
}
