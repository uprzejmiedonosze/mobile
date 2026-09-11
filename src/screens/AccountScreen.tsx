import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '../store/useAuth';
import { ud } from '../theme';
import { UdButton, UdCard, UdHeader, UdTabs } from '../components/UD';

export function AccountScreen({ navigation }: any) {
  const a = useAuth();
  const [code, setCode] = useState('');
  const go = (r: string) => navigation.navigate(r);

  const logged = a.status === 'logged' && !!a.idToken;

  return (
    <View style={{ flex: 1, backgroundColor: ud.surfaceLow }}>
      <UdHeader onBack={logged ? () => go('Picker') : undefined} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <UdCard>
          <Text style={{ color: ud.heading, fontWeight: '800', fontSize: 17 }}>Konto UD</Text>
          <Text style={{ color: ud.muted, marginTop: 4 }}>
            Logowanie tym samym mechanizmem co web: Firebase email-link (ten sam projekt i provider), potem Bearer do /api/rest/*.
          </Text>
        </UdCard>

        {logged ? (
          <UdCard>
            <Text style={{ color: ud.primary, fontWeight: '800' }}>● zalogowany</Text>
            <Text style={{ color: ud.heading, fontWeight: '700', marginTop: 6 }}>{a.name || a.email}</Text>
            <Text style={{ color: ud.muted }}>{a.email}</Text>
            <UdButton title="Wyloguj" variant="outline" onPress={a.logout} />
          </UdCard>
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

        <UdCard>
          <Text style={{ color: ud.heading, fontWeight: '700' }}>Google / passkey</Text>
          <Text style={{ color: ud.muted, marginTop: 4 }}>Google wymaga dopisania redirectu mobilnego w GCP albo dev-build z natywnym sign-in; passkey (WebAuthn) na mobile w kolejnym etapie. Email-link to ten sam Firebase co web.</Text>
        </UdCard>
      </ScrollView>
      {logged ? <UdTabs current="Account" navigate={go} /> : null}
    </View>
  );
}
