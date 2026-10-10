import { Pressable, Text, TextInput, View } from 'react-native';
import { openUdPage } from '../lib/openPage';
import { ud } from '../theme';
import { EMPTY_PROFILE, profileErrors, profileValid, type ProfileDraft } from '../lib/profile';

export { EMPTY_PROFILE, profileValid, type ProfileDraft };

// Pola konta wspólne dla rejestracji (OnboardingScreen) i edycji (AccountScreen) – jak register.html.twig na www:
// imię i nazwisko, e-mail z logowania, adres, telefon, e-Doręczenia, (tylko w edycji) forma gramatyczna i zgoda na galerię.
const input = { borderWidth: 1, borderColor: ud.hairline, borderRadius: 10, padding: 10, marginTop: 4, backgroundColor: ud.surface, color: ud.text } as const;
const label = { color: ud.muted, fontSize: 13, marginTop: 12 } as const;

function Radio({ on, onPress, disabled, children }: { on: boolean; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: ud.primary, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: ud.primary }} /> : null}
      </View>
      <Text style={{ flex: 1, color: ud.text }}>{children}</Text>
    </Pressable>
  );
}

type Props = {
  value: ProfileDraft;
  onChange: (patch: Partial<ProfileDraft>) => void;
  email?: string;
  disabled?: boolean;
  navigation?: any; // do linku o bezpieczeństwie danych
  askSex?: boolean; // tylko edycja konta (jak na www)
};

export function ProfileFields({ value: p, onChange, email, disabled, navigation, askSex }: Props) {
  const err = profileErrors(p);
  const fieldErr = (t?: string) => (t ? <Text style={{ color: ud.plateVerified, marginTop: 4 }}>{t}</Text> : null);
  return (
    <>
      <Text style={{ color: ud.muted, marginTop: 4 }}>
        Aby dokonać zgłoszenia musisz podać swoje imię, nazwisko, adres e-mail oraz adres korespondencyjny. Jest to minimalny zestaw informacji, jakich wymaga SM do przyjęcia zgłoszenia.
      </Text>
      <Text style={{ color: ud.muted, marginTop: 6 }}>
        Dane osobowe są szyfrowane na serwerze. Dowiedz się więcej o{' '}
        <Text style={{ color: ud.primary, textDecorationLine: 'underline' }} onPress={() => navigation && openUdPage(navigation, '/bezpieczenstwo.html', 'Bezpieczeństwo danych')}>bezpieczeństwie twoich danych</Text>.
      </Text>

      <Text style={label}>Imię i nazwisko, które posłużą SM do identyfikacji autora zgłoszenia</Text>
      <TextInput style={input} value={p.name} onChangeText={(name) => onChange({ name })} maxLength={30} editable={!disabled} autoCapitalize="words" autoComplete="name" placeholder="(twoje imię i nazwisko)" />
      {fieldErr(err.name)}

      {email !== undefined ? (
        <>
          <Text style={label}>E-mail został pobrany automatycznie w trakcie logowania</Text>
          <TextInput style={[input, { opacity: 0.6 }]} value={email} editable={false} />
        </>
      ) : null}

      <Text style={label}>Adres zamieszkania wraz z numerem lokalu i miastem</Text>
      <TextInput style={input} value={p.address} onChangeText={(address) => onChange({ address })} maxLength={70} editable={!disabled} autoComplete="street-address" placeholder="(Ulica 10a/7, Miasto)" />
      {fieldErr(err.address)}

      <Text style={label}>Numer kontaktowy (opcjonalny, ale ułatwi SM kontakt z Tobą)</Text>
      <TextInput style={input} value={p.msisdn} onChangeText={(msisdn) => onChange({ msisdn })} maxLength={12} keyboardType="phone-pad" editable={!disabled} placeholder="666 666 666" />

      <Text style={label}>Adres e-Doręczeń (opcjonalny)</Text>
      <TextInput style={input} value={p.edelivery} onChangeText={(edelivery) => onChange({ edelivery: edelivery.toUpperCase() })} maxLength={26} autoCapitalize="characters" autoCorrect={false} editable={!disabled} placeholder="AE:PL-00000-00000-AAAAA-00" />
      {fieldErr(err.edelivery)}

      <Text style={{ color: ud.heading, fontFamily: ud.fontDisplay, fontSize: 22, marginTop: 24 }}>Ustawienia</Text>
      {askSex ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: ud.text, fontFamily: ud.fontBodyBold }}>W pismach do służb piszemy w twoim imieniu</Text>
          <Radio on={p.sex === 'm'} onPress={() => onChange({ sex: 'm' })} disabled={disabled}>„byłem świadkiem” (forma męska)</Radio>
          <Radio on={p.sex === 'f'} onPress={() => onChange({ sex: 'f' })} disabled={disabled}>„byłam świadkiem” (forma żeńska)</Radio>
        </View>
      ) : null}
      <View style={{ marginTop: 12 }}>
        <Text style={{ color: ud.text, fontFamily: ud.fontBodyBold }}>Chcę pozwalać na prezentowanie moich zdjęć w galerii recydywistów parkowania</Text>
        <Radio on={p.shareRecydywa} onPress={() => onChange({ shareRecydywa: true })} disabled={disabled}>tak (domyślnie), chcę udostępniać pierwsze zdjęcie każdego zgłoszenia</Radio>
        <Radio on={!p.shareRecydywa} onPress={() => onChange({ shareRecydywa: false })} disabled={disabled}>nie, moje zdjęcie ma być bardzo mocno „rozpikselowane”</Radio>
      </View>
    </>
  );
}
