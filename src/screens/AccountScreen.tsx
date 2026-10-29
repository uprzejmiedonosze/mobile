import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { deleteAccount, fetchPasskeys, fetchProfile, removePasskey, updateUserProfile, type Passkey } from '../api/user';
import { registerPasskey } from '../api/passkey';
import { isPasskeyCancelled, passkeysEnabled } from '../lib/passkey';
import { googleSignInReady, useAuth } from '../store/useAuth';
import { udConfig, udEnv } from '../config';
import { appBuild, appVersion } from '../lib/appVersion';
import { ud, inputColors } from '../theme';
import { UdButton, UdCard, UdHeader, UdSplash, UdTabs } from '../components/UD';
import { EMPTY_PROFILE, ProfileFields, profileValid, type ProfileDraft } from '../components/ProfileFields';

export function AccountScreen({ navigation }: any) {
  const a = useAuth();
  const [code, setCode] = useState('');
  // Kod z klikniętego linku, gdy appka nie znała e-maila – wystarczy go wpisać i dotknąć „Zaloguj”.
  useEffect(() => { if (a.linkCode) setCode(a.linkCode); }, [a.linkCode]);
  const go = (r: string) => navigation.navigate(r);

  const logged = a.status === 'logged' && !!a.idToken;
  const busy = a.status === 'link-sending' || a.status === 'verifying' || a.status === 'google-signing' || a.status === 'passkey-signing';
  // Weryfikacja tokenu trwa 1–2 s – sam napis na przycisku wyglądał, jakby logowanie stanęło. Ten sam ekran co
  // „sprawdzam konto…” w App, więc dalej zmienia się tylko podpis; po błędzie/anulowaniu wraca formularz z kodem.
  const signingIn = a.status === 'verifying' || a.status === 'google-signing' || a.status === 'passkey-signing';
  if (signingIn) return (<><StatusBar style="dark" /><UdSplash label="loguję…" /></>);

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        {logged ? (
          <Text style={{ color: ud.muted, fontSize: 12 }}>Wersja {appVersion} ({appBuild}) · Środowisko: {udEnv} ({udConfig.base})</Text>
        ) : (
        <UdCard>
          <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 17 }}>Konto UD</Text>
          {!logged ? (
            <Text style={{ color: ud.muted, marginTop: 4 }}>
              Logowanie tym samym mechanizmem co web: Firebase email-link (ten sam projekt i provider), potem Bearer do /api/rest/*.
            </Text>
          ) : null}
          <Text style={{ color: ud.muted, marginTop: 4, fontWeight: '700' }}>
            Wersja {appVersion} ({appBuild}) · Środowisko: {udEnv} ({udConfig.base})
          </Text>
        </UdCard>
        )}

        {logged ? (
          <ProfileCards onLogout={a.logout} navigation={navigation} />
        ) : (
          <UdCard>
            <Text style={{ color: ud.heading, fontWeight: '700' }}>1. Podaj e-mail</Text>
            <TextInput {...inputColors} value={a.email} onChangeText={a.setEmail} placeholder="ty@przyklad.pl" autoCapitalize="none" keyboardType="email-address" style={{ borderWidth: 1, borderColor: ud.hairline, borderRadius: 10, padding: 10, marginTop: 6, color: ud.text }} />
            <UdButton
              title={a.status === 'link-sending' ? 'Wysyłam…' : 'Wyślij link logowania'}
              variant="primary"
              onPress={a.requestLink}
              disabled={a.status === 'link-sending' || a.status === 'verifying'}
            />
            {/* „Kliknij” tylko, gdy Firebase wydał link do appki – zwykły link otwiera www, które zużywa jednorazowy kod */}
            {a.appLinkSent ? (
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
            <TextInput {...inputColors} value={code} onChangeText={setCode} placeholder="link z maila" autoCapitalize="none" style={{ borderWidth: 1, borderColor: ud.hairline, borderRadius: 10, padding: 10, marginTop: 6, color: ud.text }} />
            <UdButton
              title={a.status === 'verifying' ? 'Weryfikuję…' : 'Zaloguj'}
              variant="accent"
              onPress={() => a.verifyCode(code)}
              disabled={a.status === 'link-sending' || a.status === 'verifying' || !code.trim()}
            />
            {a.status === 'link-sent' ? <Text style={{ color: ud.primary, fontWeight: '700' }}>{a.appLinkSent ? 'Link wysłany – otwórz mail na tym telefonie i kliknij link.' : 'Link wysłany – sprawdź skrzynkę.'}</Text> : null}
            {a.status === 'error' && a.error ? <Text style={{ color: 'red', marginTop: 6 }}>{a.error}</Text> : null}
          </UdCard>
        )}

        {/* Na iOS bez przycisku Google: wtedy logujemy tylko własnymi metodami (e-mail-link, passkey) i wytyczna Apple 4.8 (Sign in with Apple) nie obowiązuje. */}
        {!logged && googleSignInReady && Platform.OS !== 'ios' ? (
          <UdCard>
            <Text style={{ color: ud.heading, fontWeight: '700' }}>Google</Text>
            <Text style={{ color: ud.muted, marginTop: 4 }}>
              Szybsze logowanie – bez kopiowania kodu z maila.
            </Text>
            <UdButton
              title={a.status === 'google-signing' ? 'Loguję…' : 'Zaloguj przez Google'}
              variant="accent"
              onPress={a.signInWithGoogle}
              disabled={busy}
            />
          </UdCard>
        ) : null}

        {!logged && passkeysEnabled() ? (
          <UdCard>
            <Text style={{ color: ud.heading, fontWeight: '700' }}>Passkey</Text>
            <Text style={{ color: ud.muted, marginTop: 4 }}>Odcisk palca, twarz lub PIN – bez kodu z maila.</Text>
            <UdButton
              title={a.status === 'passkey-signing' ? 'Loguję…' : 'Zaloguj passkeyem'}
              variant="accent"
              onPress={a.signInWithPasskey}
              disabled={busy}
            />
          </UdCard>
        ) : null}
        {!logged && !googleSignInReady ? (
          <UdCard>
            <Text style={{ color: ud.muted }}>Logowanie Google niedostępne w Expo Go (wymaga dev clienta) – użyj linku e-mail powyżej.</Text>
          </UdCard>
        ) : null}
      </ScrollView>
      {logged ? <UdTabs current="Account" navigate={go} /> : null}
    </View>
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
