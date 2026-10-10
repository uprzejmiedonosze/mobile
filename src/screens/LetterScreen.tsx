import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { fetchStatuses, type StatusDef } from '../api/apps';
import { analyzeLetter, applyLetter, type LetterAnalysis, type LetterCandidate, type LetterCaseResult } from '../api/letters';
import { ApiError, isPhotoQuotaError } from '../api/udApi';
import { fetchProfile } from '../api/user';
import { PhotoQuotaNotice } from '../components/PhotoQuotaNotice';
import { UdButton, UdCard, UdHeader, UdTabs } from '../components/UD';
import { pickPhotos, takePhoto } from '../lib/gallery';
import {
  buildApplyBody, caseSummary, describeSignals, findCandidate, hasChanges, initialDraft, initialPick, kindNotice, matchHeadline,
  MAX_LETTER_PAGES, outcomeLabel, type ProposalDraft,
} from '../lib/letters';
import { log } from '../lib/log';
import { openUdPage } from '../lib/openPage';
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

export function LetterScreen({ navigation }: any) {
  const go = (r: string) => navigation.navigate(r);
  const [uris, setUris] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<LetterAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, StatusDef>>({});
  const [patron, setPatron] = useState(PATRONEM_DEFAULT);
  const { quota, setQuota, refresh } = usePhotoQuota();

  useEffect(() => {
    fetchStatuses().then(setStatuses);
    fetchProfile().then((p) => setPatron(p.patronem)).catch(() => {});
    refresh();
  }, [refresh]);

  // Domyślnym źródłem jest aparat (pismo zwykle fotografuje się „z ręki”); galeria – dla gotowych skanów.
  const add = useCallback(async (source: 'camera' | 'gallery') => {
    try {
      const added = source === 'camera'
        ? [await takePhoto()].filter((u): u is string => !!u)
        : (await pickPhotos(MAX_LETTER_PAGES - uris.length)).map((p) => p.uri);
      if (added.length) {
        setUris((u) => [...u, ...added].slice(0, MAX_LETTER_PAGES));
        setAnalysis(null);
        setError(null);
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Nie udało się dodać zdjęcia.');
    }
  }, [uris.length]);

  const run = async () => {
    setBusy(true); setError(null); setAnalysis(null);
    try {
      const scaled = await Promise.all(uris.map((u) => downscale(u)));
      setAnalysis(await analyzeLetter(scaled.map((s) => s.uri)));
      refresh(); // kredyty zostały zużyte
    } catch (e: any) {
      if (isPhotoQuotaError(e) && e.quota) setQuota(e.quota);
      log.error('pismo', e?.message ?? String(e));
      setError(e instanceof ApiError || e?.message ? String(e.message) : 'Nie udało się odczytać pisma.');
    } finally {
      setBusy(false);
    }
  };

  const notice = analysis ? kindNotice(analysis.letter.kind, analysis.cases.length) : null;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader title="Pismo" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: ud.text, lineHeight: 21 }}>
          Dodaj zdjęcie lub skan odpowiedzi Policji / Straży Miejskiej. Odczytamy numer sprawy i wynik, znajdziemy właściwe zgłoszenie i zaproponujemy zmianę statusu, numeru sprawy i uwag.
        </Text>
        <Text style={{ color: ud.muted, marginTop: 6, fontSize: 12 }}>Odczyt zużywa kredyty analizy zdjęć (1 na stronę). Skan nie jest nigdzie zapisywany.</Text>

        <View style={{ marginTop: 12 }}>
          <PhotoQuotaNotice quota={quota} patronem={patron} onPatronite={() => openUdPage(navigation, '/patronite.html', 'Patronite')} />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
          {uris.map((u, i) => (
            <View key={u}>
              <Image source={{ uri: u }} style={{ width: 84, height: 112, borderRadius: ud.radiusSm, backgroundColor: ud.surfaceCream }} />
              <Pressable onPress={() => { setUris((x) => x.filter((_, j) => j !== i)); setAnalysis(null); }} hitSlop={8} accessibilityLabel="Usuń stronę"
                style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: ud.heading, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {uris.length ? <UdButton title="Odczytaj pismo" onPress={run} disabled={busy} /> : null}
        {uris.length < MAX_LETTER_PAGES ? (
          <>
            <UdButton title={uris.length ? 'Zrób zdjęcie kolejnej strony' : 'Zrób zdjęcie pisma'} variant={uris.length ? 'outline' : 'primary'} onPress={() => add('camera')} disabled={busy} />
            <UdButton title="Wybierz z galerii" variant="outline" onPress={() => add('gallery')} disabled={busy} />
          </>
        ) : null}
        {busy ? (
          <View style={{ alignItems: 'center', marginTop: 12 }}>
            <ActivityIndicator color={ud.primary} />
            <Text style={{ color: ud.muted, marginTop: 6 }}>Czytam pismo… to może potrwać kilkanaście sekund.</Text>
          </View>
        ) : null}
        {error ? <Text style={{ color: ud.plateVerified, marginTop: 12, lineHeight: 20 }}>{error}</Text> : null}

        {analysis ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 18 }}>
              {analysis.letter.authority ?? 'Pismo'}{analysis.letter.date ? `, ${fmtShortDate(`${analysis.letter.date}T00:00:00`)}` : ''}
            </Text>
            {notice ? <Text style={{ color: ud.muted, marginTop: 6, lineHeight: 20 }}>{notice}</Text> : null}
            {analysis.cases.map((c) => <CaseCard key={c.index} result={c} letter={analysis.letter} statuses={statuses} />)}
            <UdButton title="Zobacz zgłoszenia" variant="outline" onPress={() => go('Reports')} />
          </View>
        ) : null}
      </ScrollView>
      <UdTabs current="Letter" navigate={go} />
    </KeyboardAvoidingView>
  );
}
