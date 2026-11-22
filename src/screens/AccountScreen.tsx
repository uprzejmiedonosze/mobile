import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { deleteAccount, fetchPasskeys, fetchProfile, removePasskey, updateUserProfile, type Passkey } from '../api/user';
import { registerPasskey } from '../api/passkey';
import { isPasskeyCancelled, passkeysEnabled } from '../lib/passkey';
import { googleSignInReady, useAuth } from '../store/useAuth';
import { demoMode, udConfig, udEnv } from '../config';
import { appBuild, appVersion } from '../lib/appVersion';
import { waitingRoomEnabled } from '../store/useWaitingRoom';
import { hasAiConsent, revokeAiConsent } from '../lib/aiConsent';
import { galleryCopyAvailable, getGalleryCopy, setGalleryCopy } from '../lib/galleryCopy';
import { ud, ripple, rippleOnDark } from '../theme';
import { SvgXml } from 'react-native-svg';
import { UdButton, UdCard, UdSplash } from '../components/UD';
import { LargeTitleScreen } from '../components/LargeTitleScreen';
import { LoginHero } from '../components/LoginHero';
import { Collapsible } from '../components/Collapsible';
import { FIELD_HINT, FormField } from '../components/FormField';
import { ActionRow, Callout, InfoRow, SectionHeader, SwitchRow } from '../components/FormBits';
import { FINGERPRINT_ICON, GOOGLE_ICON, MAIL_ICON } from '../components/loginIcons';
import { leaveDemo } from '../lib/demoLogin';
import { EMPTY_PROFILE, ProfileFields, profileValid, type ProfileDraft } from '../components/ProfileFields';

export function AccountScreen() {
  const a = useAuth();
  const router = useRouter();

  const logged = a.status === 'logged' && !!a.idToken;
  // Weryfikacja tokenu trwa 1–2 s – sam napis na przycisku wyglądał, jakby logowanie stanęło. Ten sam ekran co
  // „sprawdzam konto…” w App, więc dalej zmienia się tylko podpis; po błędzie/anulowaniu wraca formularz z kodem.
  const signingIn = a.status === 'verifying' || a.status === 'google-signing' || a.status === 'passkey-signing';
  if (signingIn) return (<><StatusBar style="dark" /><UdSplash label="loguję…" /></>);

  // Bez sesji: bez paska nawigacji – zdjęcie od krawędzi do krawędzi (także pod paskiem statusu), które gradientem przechodzi
  // w „Zaloguj się”. Klawiatura (iOS) przesuwa treść sama (automaticallyAdjustKeyboardInsets).
  if (!logged) {
    return (
      <>
        <StatusBar style="dark" />
        <ScrollView
          style={{ flex: 1, backgroundColor: ud.surfaceLow }}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <LoginHero />
          <View style={{ paddingHorizontal: 16, marginTop: -28 }}>
            <LoginPanel />
          </View>
        </ScrollView>
      </>
    );
  }

  // Ten sam układ co Start: natywny duży tytuł (LargeTitleScreen), sekcje z nagłówkiem nad kartą.
  return (
    <LargeTitleScreen title="Konto">
      <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <ProfileCards onLogout={a.logout} router={router} />
      </View>
    </LargeTitleScreen>
  );
}


// Jak login.html.twig na webie: „Zaloguj urządzeniem” (passkey), Google, e-mail – ta sama kolejność i kolory przycisków
// (firebaseui), pod spodem akceptacja regulaminu i polityki prywatności. E-mail rozwija formularz linku logowania.
function LoginPanel() {
  const a = useAuth();
  const [code, setCode] = useState('');
  // Metody poza e-mailem: passkey (gdy dostępny) i Google (tylko Android, poza demo – na iOS celowo bez Google, wytyczna 4.8).
  const passkey = passkeysEnabled();
  const google = googleSignInReady && Platform.OS !== 'ios' && !demoMode;
  const onlyEmail = !passkey && !google;
  // Gdy e-mail jest jedyną metodą, formularz jest od razu widoczny (bez dodatkowego dotknięcia); demo czeka na kod.
  const [emailOpen, setEmailOpen] = useState(demoMode || onlyEmail);
  // Kod z klikniętego linku, gdy appka nie znała e-maila – wystarczy dotknąć „Zaloguj”.
  useEffect(() => { if (a.linkCode) { setCode(a.linkCode); setEmailOpen(true); } }, [a.linkCode]);
  const busy = a.status === 'link-sending' || a.status === 'verifying' || a.status === 'google-signing' || a.status === 'passkey-signing';
  const sent = a.status === 'link-sent' || a.appLinkSent || !!a.linkCode;
  // Krok 2 (wklejenie linku) dopiero gdy ma sens: po wysłaniu linku, z kodem z linku albo w demo.
  const step2 = demoMode || sent || !!code;
  const web = (path: string) => Linking.openURL(`${udConfig.base}${path}`).catch(() => {});

  return (
    <>
      <Text accessibilityRole="header" style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 30, lineHeight: 36, letterSpacing: -0.4 }}>Zaloguj się</Text>
      <Text style={{ color: ud.text, fontSize: 16, lineHeight: 22, marginTop: 4 }}>Zgłaszaj źle zaparkowane auta i śledź, co dzieje się z twoimi zgłoszeniami.</Text>

      {!onlyEmail ? (
        <View style={{ marginTop: 16, gap: 10 }}>
          {passkey ? <LoginButton icon={FINGERPRINT_ICON} label="Zaloguj urządzeniem" primary onPress={a.signInWithPasskey} disabled={busy} /> : null}
          {/* Na iOS bez przycisku Google: wtedy logujemy tylko własnymi metodami (e-mail-link, passkey) i wytyczna Apple 4.8 (Sign in with Apple) nie obowiązuje. */}
          {/* Tryb demo działa na stagingu, gdzie para pakiet + SHA-1 klucza Play nie istnieje – Google skończyłby się DEVELOPER_ERROR. */}
          {google ? <LoginButton icon={GOOGLE_ICON} label="Zaloguj przez Google" primary={!passkey} onPress={a.signInWithGoogle} disabled={busy} /> : null}
          <LoginButton icon={MAIL_ICON} label="Zaloguj przez e-mail" expanded={emailOpen} onPress={() => setEmailOpen((o) => !o)} disabled={busy} />
        </View>
      ) : null}

      <Collapsible open={emailOpen}>
        {onlyEmail ? <View style={{ height: 8 }} /> : <SectionHeader>Logowanie przez e-mail</SectionHeader>}
        <UdCard>
          <FormField
            first
            label="E-mail"
            hint={sent ? undefined : 'Wyślemy ci link – bez hasła.'}
            value={a.email}
            onChangeText={a.setEmail}
            placeholder="np. jan@przyklad.pl"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={() => { if (!busy && a.email.trim()) a.requestLink(); }}
          />
          <View style={{ marginTop: 10 }}>
            <UdButton
              title={a.status === 'link-sending' ? 'Wysyłam…' : sent ? 'Wyślij ponownie' : 'Wyślij link logowania'}
              variant={sent ? 'outline' : 'primary'}
              pill
              onPress={a.requestLink}
              disabled={busy || !a.email.trim()}
            />
          </View>
          {a.status === 'link-sent' && !demoMode ? <Callout>{a.appLinkSent ? 'Link wysłany – otwórz mail na tym telefonie i dotknij linku.' : 'Link wysłany – sprawdź skrzynkę.'}</Callout> : null}

          {/* „Dotknij” tylko, gdy Firebase wydał link do appki – zwykły link otwiera www, które zużywa jednorazowy kod */}
          <Collapsible open={step2}>
            <FormField
              label={demoMode ? 'Kod konta demo' : 'Link z maila'}
              hint={demoMode ? undefined : a.appLinkSent
                ? 'Gdy link otworzy przeglądarkę albo czytasz mail na innym urządzeniu: skopiuj link (nie otwieraj go) i wklej tutaj.'
                : 'Linku nie otwieraj – jest jednorazowy. Skopiuj go z maila i wklej tutaj w całości.'}
              value={code}
              onChangeText={setCode}
              placeholder={demoMode ? 'kod' : 'https://…'}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={{ marginTop: 10 }}>
              <UdButton title="Zaloguj" variant="primary" onPress={() => a.verifyCode(code)} disabled={busy || !code.trim()} />
            </View>
          </Collapsible>
        </UdCard>
      </Collapsible>
      {a.status === 'error' && a.error ? <Callout tone="error">{a.error}</Callout> : null}
      {/* Bez kodu nie da się zalogować ani wylogować – to jedyne wyjście z trybu demo (np. po przypadkowym wpisaniu e-maila demo). */}
      {demoMode ? (
        <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold, marginTop: 14, textAlign: 'center' }} onPress={() => { leaveDemo().catch(() => {}); }}>
          Wróć do zwykłego logowania
        </Text>
      ) : null}

      <Text style={{ color: ud.muted, fontSize: 13, lineHeight: 18, marginTop: 20, textAlign: 'center', paddingHorizontal: 12 }}>
        Logując się, akceptujesz{' '}
        <Text style={{ color: ud.primary }} onPress={() => web('/regulamin.html')}>regulamin</Text>
        {' '}i{' '}
        <Text style={{ color: ud.primary }} onPress={() => web('/polityka-prywatnosci.html')}>politykę prywatności</Text>.
      </Text>
    </>
  );
}

// Przycisk metody logowania – pełna szerokość jak przyciski w appce: główna metoda zielona, pozostałe białe z obwódką.
// Ikona po lewej, wciśnięcie przy dotyku. Ikony mają własne kolory (Google), pozostałe dostają kolor tekstu przycisku.
function LoginButton({ icon, label, onPress, disabled, expanded, primary }: { icon: string; label: string; onPress: () => void; disabled?: boolean; expanded?: boolean; primary?: boolean }) {
  const fg = primary ? '#fff' : ud.heading;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      android_ripple={primary ? rippleOnDark : ripple}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 52, borderRadius: ud.radiusPill, paddingHorizontal: 20, overflow: 'hidden',
        backgroundColor: primary ? ud.primary : ud.surface, borderWidth: primary ? 0 : 1, borderColor: ud.lockedBorder,
        opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <SvgXml xml={icon.replace(/fill="#fff(fff)?"/gi, `fill="${fg}"`)} width={22} height={22} />
      <Text style={{ color: fg, fontFamily: ud.fontBodyBold, fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

// Odpowiednik /app/account (register.html.twig, tryb edycji): dane konta, ustawienia, wylogowanie.
// Passkeye (lista/usuń) i „Skasuj konto” przez REST; dodanie passkeya wymaga WebAuthn w natywnej apce – na razie na www.
function ProfileCards({ onLogout, router }: { onLogout: () => void; router: { push: (href: any) => void } }) {
  const [p, setP] = useState<ProfileDraft>(EMPTY_PROFILE);
  const [saved, setSaved] = useState<ProfileDraft>(EMPTY_PROFILE); // ostatnio wczytane/zapisane – „Zapisz zmiany” tylko po zmianie
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [galleryCopy, setGalleryCopyState] = useState(false);

  useEffect(() => {
    fetchProfile()
      .then((x) => { const d = { name: x.name, address: x.address, msisdn: x.msisdn, edelivery: x.edelivery, shareRecydywa: x.shareRecydywa, sex: x.sex }; setP(d); setSaved(d); setEmail(x.email); setLoaded(true); })
      .catch((e: any) => setMsg({ ok: false, text: e?.message ?? String(e) }));
  }, []);

  useEffect(() => { hasAiConsent().then(setAiConsent); }, []);
  useEffect(() => { getGalleryCopy().then(setGalleryCopyState); }, []);
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
      setSaved(p);
      setMsg({ ok: true, text: 'Zapisano zmiany.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? String(e) });
    } finally {
      setSaving(false);
    }
  };

  const web = (path: string) => Linking.openURL(`${udConfig.base}${path}`).catch(() => {});
  const isPatron = useAuth((st) => st.isPatron);
  const initials = p.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
  const dirty = loaded && JSON.stringify(p) !== JSON.stringify(saved);

  // Usunięcie passkeya odcina tę metodę logowania – pytamy raz, systemowym alertem.
  const confirmDropPasskey = (k: Passkey) => Alert.alert('Usunąć passkey?', `„${k.label}” przestanie działać jako sposób logowania.`, [
    { text: 'Anuluj', style: 'cancel' },
    { text: 'Usuń', style: 'destructive', onPress: () => dropPasskey(k.id) },
  ]);

  return (
    <>
      {/* Podsumowanie konta jak karta Apple ID w Ustawieniach: inicjały, imię, e-mail, odznaka PRO. */}
      <UdCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: ud.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontFamily: ud.fontDisplay, fontSize: 22 }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 20, letterSpacing: -0.2 }}>{p.name || 'Twoje konto'}</Text>
              {isPatron ? (
                <View style={{ backgroundColor: ud.accent, borderRadius: ud.radiusPill, paddingHorizontal: 7, paddingVertical: 1 }}>
                  <Text style={{ color: ud.onAccent, fontFamily: ud.fontDisplay, fontSize: 11, letterSpacing: 0.5 }}>PRO</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} ellipsizeMode="middle" style={{ color: ud.muted, fontSize: 14, marginTop: 2 }}>{email || ' '}</Text>
          </View>
        </View>
      </UdCard>

      <SectionHeader>Dane konta</SectionHeader>
      <UdCard>
        <ProfileFields value={p} onChange={(patch) => { setMsg(null); setP((o) => ({ ...o, ...patch })); }} disabled={!loaded} router={router} askSex />
        {/* Zapis aktywny dopiero po zmianie; wynik przy przycisku. */}
        <View style={{ marginTop: 16 }}>
          <UdButton title={saving ? 'Zapisuję…' : 'Zapisz zmiany'} variant="primary" onPress={save} disabled={!loaded || saving || !valid || !dirty} />
        </View>
        {msg ? <Callout tone={msg.ok ? 'info' : 'error'}>{msg.text}</Callout> : null}
      </UdCard>

      <SectionHeader>Logowanie</SectionHeader>
      <UdCard>
        <Text style={{ color: ud.muted, fontSize: 14, lineHeight: 20 }}>Passkey to logowanie odciskiem palca, twarzą lub PIN-em – bez hasła i poczty.</Text>
        {passkeys === null ? (
          <ActivityIndicator style={{ marginVertical: 12 }} color={ud.primary} />
        ) : passkeys.length === 0 ? (
          <Text style={{ color: ud.text, fontSize: 15, marginTop: 12 }}>Nie masz jeszcze żadnego passkeya.</Text>
        ) : (
          <View style={{ marginTop: 6 }}>
            {passkeys.map((k) => (
              <ActionRow
                key={k.id}
                title={k.label}
                subtitle={`${k.createdAt ? `dodano ${k.createdAt.slice(0, 10)}` : 'dodano'}${k.lastUsedAt ? ` · ostatnio ${k.lastUsedAt.slice(0, 10)}` : ''}`}
                trailing="Usuń"
                tone="destructive"
                onPress={() => confirmDropPasskey(k)}
              />
            ))}
          </View>
        )}
        {passkeysEnabled() ? (
          <ActionRow title={addingPasskey ? 'Dodaję…' : 'Dodaj passkey'} tone="primary" onPress={addPasskey} disabled={addingPasskey} last />
        ) : (
          <ActionRow title="Dodaj passkey na stronie" tone="primary" onPress={() => web('/app/account?update')} last />
        )}
      </UdCard>

      {(galleryCopyAvailable && waitingRoomEnabled) || aiConsent ? (
        <>
          <SectionHeader>Prywatność</SectionHeader>
          <UdCard>
            {galleryCopyAvailable && waitingRoomEnabled ? (
              <SwitchRow
                title="Kopie zdjęć w galerii"
                hint="Zdjęcia z aparatu w aplikacji zostają domyślnie tylko w niej i znikają po wysłaniu zgłoszenia. Włącz, by zapisywać kopie w albumie „Uprzejmie Donoszę” – wtedy mogą je kopiować inne aplikacje. Kopii aplikacja nie usuwa."
                value={galleryCopy}
                onChange={(v) => { setGalleryCopyState(v); setGalleryCopy(v).catch(() => setGalleryCopyState(!v)); }}
                last={!aiConsent}
              />
            ) : null}
            {aiConsent ? (
              <ActionRow
                title="Analiza zdjęć przez AI"
                subtitle="Zgoda na wysyłanie zdjęć i skanów pism do dostawców AI. Po cofnięciu zapytamy przy następnym wyborze zdjęć."
                trailing="Cofnij"
                tone="destructive"
                onPress={() => { revokeAiConsent().then(() => setAiConsent(false)); }}
                last
              />
            ) : null}
          </UdCard>
        </>
      ) : null}

      <SectionHeader>Informacje</SectionHeader>
      <UdCard>
        <InfoRow title="Wersja" value={`${appVersion} (${appBuild})`} />
        <InfoRow title="Środowisko" value={`${udEnv}${demoMode ? ' · konto demo' : ''}`} />
        <InfoRow title="Serwer" value={udConfig.base.replace(/^https?:\/\//, '')} last />
        {demoMode ? <Text style={FIELD_HINT}>Konto demo – zgłoszenia nie trafiają do straży miejskiej ani na Policję.</Text> : null}
      </UdCard>

      <View style={{ marginTop: 24 }}>
        <UdCard>
          <ActionRow title="Wyloguj się" tone="destructive" center onPress={onLogout} last />
        </UdCard>
      </View>

      {/* Skasowanie konta jest nieodwracalne – potwierdzenie wpisaniem e-maila, rozwijane płynnie pod przyciskiem. */}
      <SectionHeader>Usuń konto</SectionHeader>
      <UdCard>
        <Text style={{ color: ud.muted, fontSize: 14, lineHeight: 20 }}>Skasowanie konta jest nieodwracalne: usuniemy twoje dane, zgłoszenia i zdjęcia (kopie zapasowe i logi znikną w ciągu 14 dni).</Text>
        <ActionRow title={confirmDelete ? 'Nie kasuj' : 'Skasuj konto…'} tone={confirmDelete ? 'default' : 'destructive'} onPress={() => { setConfirmDelete((v) => !v); setDeleteEmail(''); }} last={!confirmDelete} />
        <Collapsible open={confirmDelete}>
          <FormField
            label="Wpisz swój e-mail, aby potwierdzić"
            hint={email}
            value={deleteEmail}
            onChangeText={setDeleteEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <View style={{ marginTop: 12 }}>
            <UdButton title={deleting ? 'Kasuję…' : 'Skasuj konto na zawsze'} variant="outline" onPress={removeAccount} disabled={deleting || deleteEmail.trim().toLowerCase() !== email.toLowerCase()} />
          </View>
        </Collapsible>
      </UdCard>
    </>
  );
}
