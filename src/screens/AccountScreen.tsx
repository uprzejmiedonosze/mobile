import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { deleteAccount, fetchPasskeys, fetchProfile, removePasskey, updateUserProfile, type Passkey } from '../api/user';
import { registerPasskey } from '../api/passkey';
import { isPasskeyCancelled, passkeysEnabled } from '../lib/passkey';
import { googleSignInReady, useAuth } from '../store/useAuth';
import { demoMode, udConfig, udEnv } from '../config';
import { appBuild, appVersion } from '../lib/appVersion';
import { ud, inputColors, ripple, rippleOnDark } from '../theme';
import { SvgXml } from 'react-native-svg';
import { UdButton, UdCard, UdHeader, UdSplash, UdTabs } from '../components/UD';
import { FINGERPRINT_ICON, GOOGLE_ICON, MAIL_ICON } from '../components/loginIcons';
import { leaveDemo } from '../lib/demoLogin';
import { EMPTY_PROFILE, ProfileFields, profileValid, type ProfileDraft } from '../components/ProfileFields';

export function AccountScreen({ navigation }: any) {
  const a = useAuth();
  const go = (r: string) => navigation.navigate(r);

  const logged = a.status === 'logged' && !!a.idToken;
  // Weryfikacja tokenu trwa 1–2 s – sam napis na przycisku wyglądał, jakby logowanie stanęło. Ten sam ekran co
  // „sprawdzam konto…” w App, więc dalej zmienia się tylko podpis; po błędzie/anulowaniu wraca formularz z kodem.
  const signingIn = a.status === 'verifying' || a.status === 'google-signing' || a.status === 'passkey-signing';
  if (signingIn) return (<><StatusBar style="dark" /><UdSplash label="loguję…" /></>);

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        {logged ? <ProfileCards onLogout={a.logout} navigation={navigation} /> : <LoginPanel />}
      </ScrollView>
      {logged ? <UdTabs current="Account" navigate={go} /> : null}
    </View>
  );
}

const FEEDBACK_EMAIL = 'szymon+app@uprzejmiedonosze.net';

// Jak login.html.twig na webie: „Zaloguj urządzeniem” (passkey), Google, e-mail – ta sama kolejność i kolory przycisków
// (firebaseui), pod spodem akceptacja regulaminu i polityki prywatności. E-mail rozwija formularz linku logowania.
function LoginPanel() {
  const a = useAuth();
  const [code, setCode] = useState('');
  const [emailOpen, setEmailOpen] = useState(demoMode); // konto demo wróciło po restarcie na staging – czeka na kod
  // Kod z klikniętego linku, gdy appka nie znała e-maila – wystarczy go wpisać i dotknąć „Zaloguj”.
  useEffect(() => { if (a.linkCode) { setCode(a.linkCode); setEmailOpen(true); } }, [a.linkCode]);
  const busy = a.status === 'link-sending' || a.status === 'verifying' || a.status === 'google-signing' || a.status === 'passkey-signing';
  const web = (path: string) => Linking.openURL(`${udConfig.base}${path}`).catch(() => {});

  return (
    <>
      <UdCard>
        <Text style={{ color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 17 }}>Wersja beta</Text>
        <Text style={{ color: ud.text, marginTop: 4 }}>
          Aplikacja jest jeszcze w wersji beta, ale zgłoszenia są prawdziwe – trafiają do straży miejskiej i na Policję tak samo jak ze strony uprzejmiedonosze.net.
        </Text>
        <Text style={{ color: ud.muted, marginTop: 6 }}>
          Uwagi i błędy pisz na{' '}
          <Text style={{ color: ud.primary, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`mailto:${FEEDBACK_EMAIL}`).catch(() => {})}>{FEEDBACK_EMAIL}</Text>
        </Text>
      </UdCard>

      <Text style={{ color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 34, marginTop: 16, textAlign: 'center' }}>Zaloguj się</Text>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        {passkeysEnabled() ? (
          <LoginButton icon={FINGERPRINT_ICON} label="Zaloguj urządzeniem" bg={ud.primary} fg="#fff" onPress={a.signInWithPasskey} disabled={busy} />
        ) : null}
        {/* Na iOS bez przycisku Google: wtedy logujemy tylko własnymi metodami (e-mail-link, passkey) i wytyczna Apple 4.8 (Sign in with Apple) nie obowiązuje. */}
        {/* Tryb demo działa na stagingu, gdzie para pakiet + SHA-1 klucza Play nie istnieje – Google skończyłby się DEVELOPER_ERROR. */}
        {googleSignInReady && Platform.OS !== 'ios' && !demoMode ? (
          <LoginButton icon={GOOGLE_ICON} label="Zaloguj przez Google" bg={ud.surface} fg={ud.text} onPress={a.signInWithGoogle} disabled={busy} />
        ) : null}
        <LoginButton icon={MAIL_ICON} label="Zaloguj przez e-mail" bg="#db4437" fg="#fff" onPress={() => setEmailOpen((o) => !o)} disabled={busy} />
      </View>

      {emailOpen ? (
        <UdCard>
          <Text style={{ color: ud.heading, fontWeight: '700' }}>1. Podaj e-mail</Text>
          <TextInput {...inputColors} value={a.email} onChangeText={a.setEmail} placeholder="ty@przyklad.pl" autoCapitalize="none" keyboardType="email-address" style={{ borderWidth: 1, borderColor: ud.hairline, borderRadius: 10, padding: 10, marginTop: 6, color: ud.text }} />
          <UdButton
            title={a.status === 'link-sending' ? 'Wysyłam…' : 'Wyślij link logowania'}
            variant="primary"
            onPress={a.requestLink}
            disabled={busy || !a.email.trim()}
          />
          {/* „Kliknij” tylko, gdy Firebase wydał link do appki – zwykły link otwiera www, które zużywa jednorazowy kod */}
          {demoMode ? (
            <Text style={{ color: ud.heading, fontWeight: '700', marginTop: 10 }}>2. Wpisz kod konta demo</Text>
          ) : a.appLinkSent ? (
            <>
              <Text style={{ color: ud.heading, fontWeight: '700', marginTop: 10 }}>2. Kliknij link w mailu na tym telefonie</Text>
              <Text style={{ color: ud.muted, marginTop: 2 }}>Link otworzy aplikację i zaloguje Cię. Jeśli zamiast niej otworzy się przeglądarka albo mail czytasz na innym urządzeniu, wyślij link jeszcze raz, skopiuj go (nie otwieraj) i wklej tutaj.</Text>
            </>
          ) : (
            <>
              <Text style={{ color: ud.heading, fontWeight: '700', marginTop: 10 }}>2. Wklej link z maila</Text>
              <Text style={{ color: ud.muted, marginTop: 2 }}>Linku NIE otwieraj (jest jednorazowy) – skopiuj go z maila i wklej tutaj całość.</Text>
            </>
          )}
          <TextInput {...inputColors} value={code} onChangeText={setCode} placeholder={demoMode ? 'kod' : 'link z maila'} autoCapitalize="none" style={{ borderWidth: 1, borderColor: ud.hairline, borderRadius: 10, padding: 10, marginTop: 6, color: ud.text }} />
          <UdButton title="Zaloguj" variant="accent" onPress={() => a.verifyCode(code)} disabled={busy || !code.trim()} />
          {a.status === 'link-sent' && !demoMode ? <Text style={{ color: ud.primary, fontWeight: '700' }}>{a.appLinkSent ? 'Link wysłany – otwórz mail na tym telefonie i kliknij link.' : 'Link wysłany – sprawdź skrzynkę.'}</Text> : null}
        </UdCard>
      ) : null}
      {a.status === 'error' && a.error ? <Text style={{ color: ud.plateVerified, marginTop: 10, textAlign: 'center' }}>{a.error}</Text> : null}
      {/* Bez kodu nie da się zalogować ani wylogować – to jedyne wyjście z trybu demo (np. po przypadkowym wpisaniu e-maila demo). */}
      {demoMode ? (
        <Text style={{ color: ud.primary, textDecorationLine: 'underline', marginTop: 14, textAlign: 'center' }} onPress={() => { leaveDemo().catch(() => {}); }}>
          Wróć do zwykłego logowania
        </Text>
      ) : null}

      <Text style={{ color: ud.muted, fontSize: 13, marginTop: 20, textAlign: 'center' }}>
        Logując się, akceptujesz{' '}
        <Text style={{ color: ud.primary }} onPress={() => web('/regulamin.html')}>regulamin</Text>
        {' '}i{' '}
        <Text style={{ color: ud.primary }} onPress={() => web('/polityka-prywatnosci.html')}>politykę prywatności</Text>.
      </Text>
    </>
  );
}

// Przycisk w stylu firebaseui (.firebaseui-idp-button): kapsułka stałej szerokości, ikona po lewej, cień.
function LoginButton({ icon, label, bg, fg, onPress, disabled }: { icon: string; label: string; bg: string; fg: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      android_ripple={bg === ud.surface ? ripple : rippleOnDark}
      style={{ width: 280, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 20, backgroundColor: bg, borderRadius: ud.radiusPill, paddingVertical: 14, paddingHorizontal: 24, marginVertical: 8, overflow: 'hidden', opacity: disabled ? 0.6 : 1, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}
    >
      <SvgXml xml={icon} width={24} height={24} />
      <Text style={{ color: fg, fontFamily: ud.fontBodyBold, fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

const input = { borderWidth: 1, borderColor: ud.hairline, borderRadius: 10, padding: 10, marginTop: 4, backgroundColor: ud.surface, color: ud.text } as const;
const label = { color: ud.muted, fontSize: 13, marginTop: 12 } as const;

// Odpowiednik /app/account (register.html.twig, tryb edycji): dane konta, ustawienia, wylogowanie.
// Passkeye (lista/usuń) i „Skasuj konto” przez REST; dodanie passkeya wymaga WebAuthn w natywnej apce – na razie na www.
function ProfileCards({ onLogout, navigation }: { onLogout: () => void; navigation: any }) {
  const [p, setP] = useState<ProfileDraft>(EMPTY_PROFILE);
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchProfile()
      .then((x) => { setP({ name: x.name, address: x.address, msisdn: x.msisdn, edelivery: x.edelivery, shareRecydywa: x.shareRecydywa, sex: x.sex }); setEmail(x.email); setLoaded(true); })
      .catch((e: any) => setMsg({ ok: false, text: e?.message ?? String(e) }));
  }, []);

  useEffect(() => { fetchPasskeys().then(setPasskeys).catch(() => setPasskeys([])); }, []);

  const addPasskey = async () => {
    setAddingPasskey(true);
    setMsg(null);
    try { setPasskeys(await registerPasskey()); setMsg({ ok: true, text: 'Passkey dodany.' }); }
    catch (e: any) { if (!isPasskeyCancelled(e)) setMsg({ ok: false, text: e?.message ?? String(e) }); }
    finally { setAddingPasskey(false); }
  };

  const dropPasskey = async (id: string) => {
    try { await removePasskey(id); setPasskeys((l) => (l ?? []).filter((k) => k.id !== id)); }
    catch (e: any) { setMsg({ ok: false, text: e?.message ?? String(e) }); }
  };

  const removeAccount = async () => {
    setDeleting(true);
    try { await deleteAccount(deleteEmail.trim()); onLogout(); } // konto nie istnieje – kończymy sesję lokalnie
    catch (e: any) { setMsg({ ok: false, text: e?.message ?? String(e) }); setDeleting(false); }
  };

  const valid = profileValid(p);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await updateUserProfile(p.name.trim(), p.address.trim(), {
        msisdn: p.msisdn.trim(),
        edelivery: p.edelivery.trim().toUpperCase(),
        shareRecydywa: p.shareRecydywa,
        sex: p.sex,
      });
      setMsg({ ok: true, text: 'Zapisano.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? String(e) });
    } finally {
      setSaving(false);
    }
  };

  const web = (path: string) => Linking.openURL(`${udConfig.base}${path}`).catch(() => {});

  return (
    <>
      <View style={{ marginTop: 20 }}>
        <Text style={{ color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 34 }}>Dane konta</Text>
        <ProfileFields value={p} onChange={(patch) => { setMsg(null); setP((o) => ({ ...o, ...patch })); }} email={email} disabled={!loaded} navigation={navigation} askSex />
        <UdButton title={saving ? 'Zapisuję…' : 'Zapisz'} variant="primary" onPress={save} disabled={!loaded || saving || !valid} />
        {msg ? <Text style={{ color: msg.ok ? ud.primary : 'red', marginTop: 6, fontWeight: '700' }}>{msg.text}</Text> : null}
        <Text style={{ color: ud.muted, fontSize: 12, marginTop: 10 }}>Wersja {appVersion} ({appBuild}) · Środowisko: {udEnv}{demoMode ? ' (konto demo – zgłoszenia nie trafiają do SM ani na Policję)' : ''} ({udConfig.base})</Text>
      </View>

      <View style={{ marginTop: 20 }}>
        <Text style={{ color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 22 }}>Passkeye</Text>
        <Text style={{ color: ud.muted, marginTop: 4 }}>Logowanie odciskiem palca, twarzą lub PIN-em – bez hasła i poczty.</Text>
        {passkeys === null ? null : passkeys.length === 0 ? (
          <Text style={{ color: ud.muted, marginTop: 8 }}>Nie masz jeszcze żadnego passkeya.</Text>
        ) : (
          passkeys.map((k) => (
            <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: ud.text, fontFamily: ud.fontBodyBold }}>{k.label}</Text>
                <Text style={{ color: ud.muted, fontSize: 12 }}>dodano {k.createdAt.slice(0, 10)}{k.lastUsedAt ? `, ostatnio użyto ${k.lastUsedAt.slice(0, 10)}` : ''}</Text>
              </View>
              <Pressable onPress={() => dropPasskey(k.id)}><Text style={{ color: ud.plateVerified, fontFamily: ud.fontBodyBold }}>Usuń</Text></Pressable>
            </View>
          ))
        )}
        {passkeysEnabled() ? (
          <UdButton title={addingPasskey ? 'Dodaję…' : 'Dodaj passkey'} variant="primary" onPress={addPasskey} disabled={addingPasskey} />
        ) : (
          <Text style={{ color: ud.primary, textDecorationLine: 'underline', marginTop: 10 }} onPress={() => web('/app/account?update')}>Dodaj passkey (na stronie)</Text>
        )}
      </View>

      <View style={{ marginTop: 20 }}>
        <Text style={{ color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 22 }}>Strefa niebezpieczna</Text>
        <Text style={{ color: ud.muted, marginTop: 4 }}>Skasowanie konta jest nieodwracalne: usuniemy Twoje dane, zgłoszenia i zdjęcia (kopie zapasowe i logi znikną w ciągu 14 dni).</Text>
        {!confirmDelete ? (
          <Text style={{ color: ud.plateVerified, textDecorationLine: 'underline', marginTop: 10 }} onPress={() => setConfirmDelete(true)}>Skasuj konto</Text>
        ) : (
          <>
            <Text style={label}>Aby potwierdzić, wpisz swój adres e-mail: {email}</Text>
            <TextInput {...inputColors} style={input} value={deleteEmail} onChangeText={setDeleteEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
            <UdButton title={deleting ? 'Kasuję…' : 'Skasuj konto'} variant="outline" onPress={removeAccount} disabled={deleting || deleteEmail.trim().toLowerCase() !== email.toLowerCase()} />
          </>
        )}
      </View>

      <View style={{ marginTop: 20 }}>
        <UdButton title="Wyloguj" variant="outline" onPress={onLogout} />
      </View>
    </>
  );
}
