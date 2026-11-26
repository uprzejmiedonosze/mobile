import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { FIELD_HINT, FIELD_LABEL, FormField } from './FormField';
import { openUdPage } from '../lib/openPage';
import { ud } from '../theme';
import { profileErrors, type ProfileDraft } from '../lib/profile';

export { EMPTY_PROFILE, profileMissing, profileValid, type ProfileDraft } from '../lib/profile';

// Pola konta wspólne dla rejestracji (OnboardingScreen) i edycji (AccountScreen) – te same dane co register.html.twig na www:
// imię i nazwisko, e-mail z logowania, adres, telefon, e-Doręczenia, zgoda na galerię, (tylko w edycji) forma gramatyczna.
// UX (zasady Apple): krótka etykieta nad polem, objaśnienie drobniej pod nim; podpowiedź w polu to wyraźny przykład („np. …”),
// a nie coś, co wygląda na wpisaną wartość; błąd formatu dopiero po wyjściu z pola (nie w trakcie pisania), w miejscu objaśnienia;
// aktywne pole ma zieloną ramkę; „Dalej” na klawiaturze przechodzi do następnego pola.

const LABEL = FIELD_LABEL;
const HINT = FIELD_HINT;
const Field = FormField;

function Radio({ on, onPress, disabled, children }: { on: boolean; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: on, disabled }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, opacity: disabled ? 0.5 : pressed ? 0.6 : 1 })}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: ud.primary, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: ud.primary }} /> : null}
      </View>
      <Text style={{ flex: 1, color: ud.text, fontSize: 15 }}>{children}</Text>
    </Pressable>
  );
}

type Props = {
  value: ProfileDraft;
  onChange: (patch: Partial<ProfileDraft>) => void;
  email?: string;
  disabled?: boolean;
  router?: { push: (href: any) => void }; // do linku o bezpieczeństwie danych
  askSex?: boolean; // tylko edycja konta (jak na www)
};

export function ProfileFields({ value: p, onChange, email, disabled, router, askSex }: Props) {
  const err = profileErrors(p);
  // błąd formatu pokazujemy dopiero po wyjściu z pola – w trakcie pisania „Jan” to jeszcze nie błąd
  const [touched, setTouched] = useState<Partial<Record<'name' | 'address' | 'edelivery', boolean>>>({});
  const touch = (k: 'name' | 'address' | 'edelivery') => () => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  const shown = (k: 'name' | 'address' | 'edelivery') => (touched[k] ? err[k] : undefined);

  const addressRef = useRef<TextInput>(null);
  const msisdnRef = useRef<TextInput>(null);
  const edeliveryRef = useRef<TextInput>(null);

  return (
    <>
      {email !== undefined ? (
        // E-mail nie jest do edycji – pokazany jako informacja, a nie wyszarzone pole formularza.
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ color: ud.muted, fontSize: 15 }}>E-mail</Text>
          <Text style={{ flexShrink: 1, color: ud.text, fontSize: 15 }} numberOfLines={1} ellipsizeMode="middle" selectable>{email}</Text>
        </View>
      ) : null}

      <Field
        label="Imię i nazwisko"
        hint="Tak podpiszemy zgłoszenia – straż zobaczy je jako dane autora."
        error={shown('name')}
        value={p.name}
        onChangeText={(name) => onChange({ name })}
        onBlur={touch('name')}
        maxLength={30}
        editable={!disabled}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => addressRef.current?.focus()}
        placeholder="np. Jan Kowalski"
      />
      <Field
        inputRef={addressRef}
        label="Adres zamieszkania"
        hint="Z numerem lokalu i miejscowością – tego wymaga straż miejska."
        error={shown('address')}
        value={p.address}
        onChangeText={(address) => onChange({ address })}
        onBlur={touch('address')}
        maxLength={70}
        editable={!disabled}
        autoComplete="street-address"
        textContentType="fullStreetAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => msisdnRef.current?.focus()}
        placeholder="np. Prosta 10/7, Warszawa"
      />
      <Field
        inputRef={msisdnRef}
        label="Telefon"
        optional
        hint="Ułatwi straży kontakt, gdyby czegoś brakowało w zgłoszeniu."
        value={p.msisdn}
        onChangeText={(msisdn) => onChange({ msisdn })}
        maxLength={12}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType="next"
        onSubmitEditing={() => edeliveryRef.current?.focus()}
        editable={!disabled}
        placeholder="np. 600 100 200"
      />
      <Field
        inputRef={edeliveryRef}
        label="Adres e-Doręczeń"
        optional
        hint="Jeśli chcesz dostawać odpowiedzi przez e-Doręczenia."
        error={shown('edelivery')}
        value={p.edelivery}
        onChangeText={(edelivery) => onChange({ edelivery: edelivery.toUpperCase() })}
        onBlur={touch('edelivery')}
        maxLength={26}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="done"
        editable={!disabled}
        placeholder="np. AE:PL-12345-67890-ABCDE-12"
      />

      {askSex ? (
        <View style={{ marginTop: 24 }}>
          <Text style={LABEL}>Forma w pismach do służb</Text>
          <Text style={[HINT, { marginBottom: 4 }]}>Piszemy w twoim imieniu.</Text>
          <Radio on={p.sex === 'm'} onPress={() => onChange({ sex: 'm' })} disabled={disabled}>„byłem świadkiem”</Radio>
          <Radio on={p.sex === 'f'} onPress={() => onChange({ sex: 'f' })} disabled={disabled}>„byłam świadkiem”</Radio>
        </View>
      ) : null}

      {/* Zgoda na galerię recydywistów – treść i dwie opcje 1:1 z register.html.twig (web), bez przeredagowania skutków. */}
      <View style={{ marginTop: 24 }}>
        <Text style={LABEL}>Chcę pozwalać na prezentowanie moich zdjęć w galerii recydywistów parkowania</Text>
        <Radio on={p.shareRecydywa} onPress={() => onChange({ shareRecydywa: true })} disabled={disabled}>tak (domyślnie), chcę udostępniać pierwsze zdjęcie każdego zgłoszenia</Radio>
        <Radio on={!p.shareRecydywa} onPress={() => onChange({ shareRecydywa: false })} disabled={disabled}>nie, moje zdjęcie ma być bardzo mocno „rozpikselowane”</Radio>
      </View>

      <Text style={[HINT, { marginTop: 24 }]}>
        Dane osobowe są szyfrowane na serwerze.{' '}
        <Text style={{ color: ud.primary, textDecorationLine: 'underline' }} onPress={() => router && openUdPage(router, '/bezpieczenstwo.html', 'Bezpieczeństwo danych')}>Jak chronimy twoje dane</Text>
      </Text>
    </>
  );
}
