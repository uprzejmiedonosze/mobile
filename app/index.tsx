import { Redirect } from 'expo-router';
import { useAuth } from '../src/store/useAuth';

// „/” nie ma własnego ekranu: zalogowany → pulpit, w trakcie rejestracji → onboarding, bez sesji → logowanie.
// Splash w app/_layout.tsx czeka na hydrate() i sprawdzenie rejestracji, więc tu stan jest już znany.
export default function Index() {
  const a = useAuth();
  const logged = a.status === 'logged' && (!!a.idToken || !!a.refreshToken);
  const registered = a.registrationChecked && a.isRegistered && a.isTermsConfirmed;
  return <Redirect href={!logged ? '/login' : registered ? '/app' : '/onboarding'} />;
}
