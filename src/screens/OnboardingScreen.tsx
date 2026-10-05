import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '../store/useAuth';
import { confirmTerms, ensureUserRow, fetchTerms, updateUserProfile, type TermsDoc } from '../api/user';
import { useNavigation } from '@react-navigation/native';
import { log } from '../lib/log';
import { openUdPage } from '../lib/openPage';
import { termSegments } from '../lib/reports';
import { ud } from '../theme';
import { UdButton, UdCard, UdHeader } from '../components/UD';

// Rejestracja + regulamin po REST (bez web UI), patrz CLAUDE.md sekcja Auth.
// App.tsx pokazuje ten ekran, gdy zalogowany, ale isRegistered/isTermsConfirmed = false
// (typowe dla świeżego konta Google – email-link zawsze przechodził przez web wcześniej).
export function OnboardingScreen() {
  const navigation = useNavigation<any>();
  const a = useAuth();
  const [name, setName] = useState(a.name);
  const [address, setAddress] = useState('');
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
      await updateUserProfile(name.trim(), address.trim());
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

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader title="Rejestracja" onBack={a.logout} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <UdCard>
          <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 17 }}>Witaj, {a.name || a.email}</Text>
          <Text style={{ color: ud.muted, marginTop: 4 }}>
            Zanim zaczniesz zgłaszać, dokończ rejestrację w UD – tak samo jak na stronie. „← wróć” wylogowuje, gdyby to było złe konto.
          </Text>
        </UdCard>

        {step === 'register' ? (
          <UdCard>
            <Text style={{ color: ud.heading, fontWeight: '700' }}>Dane do rejestracji</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Imię i nazwisko"
              style={{ borderWidth: 1, borderColor: ud.hairline, borderRadius: 10, padding: 10, marginTop: 8 }}
            />
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Adres (ulica, numer, miasto)"
              style={{ borderWidth: 1, borderColor: ud.hairline, borderRadius: 10, padding: 10, marginTop: 8 }}
            />
            <UdButton
              title={saving ? 'Zapisuję…' : 'Zapisz i dalej'}
              variant="accent"
              onPress={submitProfile}
              disabled={saving || !name.trim() || !address.trim()}
            />
          </UdCard>
        ) : (
          <UdCard>
            <Text style={{ color: ud.heading, fontWeight: '700' }}>Regulamin</Text>
            {!terms ? (
              <Text style={{ color: ud.muted, marginTop: 6 }}>Wczytuję…</Text>
            ) : (
              terms.terms.map((item, i) => (
                <Text key={i} style={{ color: ud.muted, marginTop: 6 }}>
                  • {termSegments(item.li).map((seg, k) => seg.url ? (
                    <Text key={k} style={{ color: ud.primary, textDecorationLine: 'underline' }} onPress={() => openUdPage(navigation, seg.url!, seg.text)}>{seg.text}</Text>
                  ) : seg.text)}
                </Text>
              ))
            )}
            <UdButton
              title={confirming ? 'Zapisuję…' : 'Akceptuję regulamin'}
              variant="accent"
              onPress={acceptTerms}
              disabled={confirming || !terms}
            />
          </UdCard>
        )}

        {error ? <Text style={{ color: 'red', marginTop: 6, paddingHorizontal: 16 }}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}
