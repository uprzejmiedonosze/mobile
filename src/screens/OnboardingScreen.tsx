import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useAuth } from '../store/useAuth';
import { confirmTerms, ensureUserRow, fetchTerms, updateUserProfile, type TermsDoc } from '../api/user';
import { useRouter } from 'expo-router';
import { log } from '../lib/log';
import { openUdPage } from '../lib/openPage';
import { termSegments } from '../lib/reports';
import { ud } from '../theme';
import { UdButton, UdCard } from '../components/UD';
import { LargeTitleScreen } from '../components/LargeTitleScreen';
import { EMPTY_PROFILE, ProfileFields, profileMissing, type ProfileDraft } from '../components/ProfileFields';

// Rejestracja + regulamin po REST (bez web UI), patrz CLAUDE.md sekcja Auth.
// app/_layout.tsx (Stack.Protected) pokazuje ten ekran, gdy zalogowany, ale isRegistered/isTermsConfirmed = false
// (typowe dla świeżego konta Google – email-link zawsze przechodził przez web wcześniej).
export function OnboardingScreen() {
  const router = useRouter();
  const a = useAuth();
  const [profile, setProfile] = useState<ProfileDraft>({ ...EMPTY_PROFILE, name: a.name });
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState<TermsDoc | null>(null);

  const step: 'register' | 'terms' = a.isRegistered ? 'terms' : 'register';

  useEffect(() => {
    if (step === 'terms' && !terms) {
      fetchTerms()
        .then(setTerms)
        .catch((e: any) => log.warn('onboarding', String(e?.message ?? e)));
    }
  }, [step, terms]);

  const submitProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      await ensureUserRow();
      // jak formularz rejestracji na www: bez pytania o formę gramatyczną (serwer zgadnie z imienia, zmiana w „Konto”)
      await updateUserProfile(profile.name.trim(), profile.address.trim(), {
        msisdn: profile.msisdn.trim(),
        edelivery: profile.edelivery.trim().toUpperCase(),
        shareRecydywa: profile.shareRecydywa,
      });
      await a.checkRegistration();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const acceptTerms = async () => {
    setConfirming(true);
    setError(null);
    try {
      await confirmTerms();
      await a.checkRegistration();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setConfirming(false);
    }
  };

  // Wayfinding: konkretny tytuł kroku w nagłówku + „Krok N z 2”, żeby było wiadomo, gdzie jestem i ile zostało.
  const title = step === 'register' ? 'Dane konta' : 'Regulamin';
  const firstName = (a.name || '').trim().split(/\s+/)[0];
  const missing = step === 'register' ? profileMissing(profile) : null;
  const content = (
    <View style={{ padding: 16, paddingTop: 4 }}>
      <Text style={{ color: ud.muted, fontFamily: ud.fontBodyBold, fontSize: 13, letterSpacing: 0.3 }}>{`KROK ${step === 'register' ? 1 : 2} Z 2 · REJESTRACJA`}</Text>
      <Text style={{ color: ud.text, fontSize: 16, lineHeight: 22, marginTop: 6, marginBottom: 8 }}>
        {firstName ? `Witaj, ${firstName}! ` : 'Witaj! '}
        {step === 'register'
          ? 'Te dane trafią do zgłoszeń – bez nich straż miejska ich nie przyjmie.'
          : 'Ostatni krok: przeczytaj i zaakceptuj regulamin.'}
      </Text>

      {step === 'register' ? (
        <UdCard flat>
          <ProfileFields value={profile} onChange={(patch) => { setError(null); setProfile((o) => ({ ...o, ...patch })); }} email={a.email} disabled={saving} router={router} />
        </UdCard>
      ) : (
        <UdCard flat>
          {!terms ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={ud.primary} accessibilityLabel="Wczytuję regulamin" />
          ) : (
            terms.terms.map((item, i) => (
              <Text key={i} style={{ color: ud.text, lineHeight: 21, marginTop: i ? 10 : 0 }}>
                • {termSegments(item.li).map((seg, k) => seg.url ? (
                  <Text key={k} style={{ color: ud.primary, textDecorationLine: 'underline' }} onPress={() => openUdPage(router, seg.url!, seg.text)}>{seg.text}</Text>
                ) : seg.text)}
              </Text>
            ))
          )}
        </UdCard>
      )}

      {/* Główna akcja tuż pod formularzem; status i błędy przy niej (nie luzem na dole ekranu). */}
      <View style={{ marginTop: 8 }}>
        {step === 'register' ? (
          <UdButton title={saving ? 'Zapisuję…' : 'Zapisz i przejdź dalej'} variant="accent" onPress={submitProfile} disabled={saving || !!missing} />
        ) : (
          <UdButton title={confirming ? 'Zapisuję…' : 'Akceptuję regulamin'} variant="accent" onPress={acceptTerms} disabled={confirming || !terms} />
        )}
        {error ? (
          <Text accessibilityLiveRegion="polite" style={{ color: ud.plateVerified, marginTop: 4, textAlign: 'center' }}>{error}</Text>
        ) : missing ? (
          <Text style={{ color: ud.muted, fontSize: 13, marginTop: 4, textAlign: 'center' }}>{missing}</Text>
        ) : null}
      </View>

      {/* Akcja drugorzędna: dyskretny link zamiast drugiego pełnego przycisku, żeby nie konkurował z „Zapisz”. */}
      <Pressable onPress={a.logout} accessibilityRole="button" hitSlop={8} style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16, marginTop: 12, opacity: pressed ? 0.5 : 1 })}>
        <Text style={{ color: ud.muted, fontSize: 14 }}>
          {'To nie twoje konto? '}<Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold }}>Wyloguj się</Text>
        </Text>
      </Pressable>
    </View>
  );

  // Natywny duży tytuł (SwiftUI na iOS) – wspólny z pulpitem, patrz LargeTitleScreen.
  return <LargeTitleScreen title={title}>{content}</LargeTitleScreen>;
}
