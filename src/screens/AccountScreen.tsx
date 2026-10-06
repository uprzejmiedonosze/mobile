import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { deleteAccount, fetchPasskeys, fetchProfile, removePasskey, updateUserProfile, type Passkey } from '../api/user';
import { registerPasskey } from '../api/passkey';
import { isPasskeyCancelled, passkeysEnabled } from '../lib/passkey';
import { googleSignInReady, useAuth } from '../store/useAuth';
import { udConfig, udEnv } from '../config';
import { ud } from '../theme';
import { UdButton, UdCard, UdHeader, UdTabs } from '../components/UD';

export function AccountScreen({ navigation }: any) {
  const a = useAuth();
  const [code, setCode] = useState('');
  const go = (r: string) => navigation.navigate(r);

  const logged = a.status === 'logged' && !!a.idToken;
  const busy = a.status === 'link-sending' || a.status === 'verifying' || a.status === 'google-signing' || a.status === 'passkey-signing';

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        {logged ? (
          <Text style={{ color: ud.muted, fontSize: 12 }}>Środowisko: {udEnv} ({udConfig.base})</Text>
        ) : (
        <UdCard>
          <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 17 }}>Konto UD</Text>
          {!logged ? (
            <Text style={{ color: ud.muted, marginTop: 4 }}>
              Logowanie tym samym mechanizmem co web: Firebase email-link (ten sam projekt i provider), potem Bearer do /api/rest/*.
            </Text>
          ) : null}
          <Text style={{ color: ud.muted, marginTop: 4, fontWeight: '700' }}>
            Środowisko: {udEnv} ({udConfig.base})
          </Text>
        </UdCard>
        )}

        {logged ? (
          <ProfileCards onLogout={a.logout} />
        ) : (
          <UdCard>
            <Text style={{ color: ud.heading, fontWeight: '700' }}>1. Podaj e-mail</Text>
            <TextInput value={a.email} onChangeText={a.setEmail} placeholder="ty@przyklad.pl" autoCapitalize="none" keyboardType="email-address" style={{ borderWidth: 1, borderColor: ud.hairline, borderRadius: 10, padding: 10, marginTop: 6 }} />
            <UdButton
              title={a.status === 'link-sending' ? 'Wysyłam…' : 'Wyślij link logowania'}
              variant="primary"
              onPress={a.requestLink}
              disabled={a.status === 'link-sending' || a.status === 'verifying'}
            />
            <Text style={{ color: ud.heading, fontWeight: '700', marginTop: 10 }}>2. Wklej kod z maila</Text>
            <Text style={{ color: ud.muted, marginTop: 2 }}>W mailu jest link – linku NIE klikaj (kod jest jednorazowy), tylko skopiuj z niego parametr oobCode i wklej tu całość lub sam kod.</Text>
            <TextInput value={code} onChangeText={setCode} placeholder="oobCode… lub cały link" autoCapitalize="none" style={{ borderWidth: 1, borderColor: ud.hairline, borderRadius: 10, padding: 10, marginTop: 6 }} />
            <UdButton
              title={a.status === 'verifying' ? 'Weryfikuję…' : 'Zaloguj'}
              variant="accent"
              onPress={() => a.verifyCode(code)}
              disabled={a.status === 'link-sending' || a.status === 'verifying' || !code.trim()}
            />
            {a.status === 'link-sent' ? <Text style={{ color: ud.primary, fontWeight: '700' }}>Link wysłany – sprawdź skrzynkę.</Text> : null}
            {a.status === 'error' && a.error ? <Text style={{ color: 'red', marginTop: 6 }}>{a.error}</Text> : null}
          </UdCard>
        )}

        {!logged && googleSignInReady ? (
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
function ProfileCards({ onLogout }: { onLogout: () => void }) {
  const [p, setP] = useState({ name: '', email: '', address: '', msisdn: '', edelivery: '', shareRecydywa: true, bylam: 'byłam/em' });
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
      .then((x) => { setP(x); setLoaded(true); })
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

  const set = (k: keyof typeof p) => (v: string | boolean) => { setMsg(null); setP((o) => ({ ...o, [k]: v })); };
  const valid = p.name.trim().length > 0 && p.address.trim().length > 0 && (p.edelivery === '' || p.edelivery.length === 26);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await updateUserProfile(p.name.trim(), p.address.trim(), {
        msisdn: p.msisdn.trim(),
        edelivery: p.edelivery.trim().toUpperCase(),
        shareRecydywa: p.shareRecydywa,
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
        <Text style={{ color: ud.muted, marginTop: 4 }}>
          Imię, nazwisko i adres są wymagane przez SM do przyjęcia zgłoszenia. Dane osobowe są szyfrowane na serwerze.
        </Text>
        <Text style={label}>Imię i nazwisko</Text>
        <TextInput style={input} value={p.name} onChangeText={set('name')} maxLength={30} editable={loaded} placeholder="(twoje imię i nazwisko)" />
        <Text style={label}>E-mail (z logowania)</Text>
        <TextInput style={[input, { opacity: 0.6 }]} value={p.email} editable={false} />
        <Text style={label}>Adres zamieszkania z numerem lokalu i miastem</Text>
        <TextInput style={input} value={p.address} onChangeText={set('address')} maxLength={70} editable={loaded} placeholder="Ulica 10a/7, Miasto" />
        <Text style={label}>Numer kontaktowy (opcjonalny)</Text>
        <TextInput style={input} value={p.msisdn} onChangeText={set('msisdn')} maxLength={12} keyboardType="phone-pad" editable={loaded} placeholder="666 666 666" />
        <Text style={label}>Adres e-Doręczeń (opcjonalny, 26 znaków)</Text>
        <TextInput style={input} value={p.edelivery} onChangeText={set('edelivery')} maxLength={26} autoCapitalize="characters" autoCorrect={false} editable={loaded} placeholder="AE:PL-00000-00000-AAAAA-00" />
      </View>

      <View style={{ marginTop: 20 }}>
        <Text style={{ color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 22 }}>Ustawienia</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 12 }}>
          <Text style={{ flex: 1, color: ud.text }}>
            Pozwalam na prezentowanie pierwszego zdjęcia każdego zgłoszenia w galerii recydywistów (wyłączone = mocno „rozpikselowane”).
          </Text>
          <Switch value={p.shareRecydywa} onValueChange={set('shareRecydywa')} disabled={!loaded} trackColor={{ true: ud.primary }} />
        </View>
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
            <Text style={label}>Aby potwierdzić, wpisz swój adres e-mail: {p.email}</Text>
            <TextInput style={input} value={deleteEmail} onChangeText={setDeleteEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
            <UdButton title={deleting ? 'Kasuję…' : 'Skasuj konto'} variant="outline" onPress={removeAccount} disabled={deleting || deleteEmail.trim().toLowerCase() !== p.email.toLowerCase()} />
          </>
        )}
      </View>

      <View style={{ marginTop: 20 }}>
        <UdButton title="Wyloguj" variant="outline" onPress={onLogout} />
      </View>
    </>
  );
}
