import { Redirect } from 'expo-router';

// Nieznany adres (np. stary deep link) → start zamiast ekranu błędu.
export default function NotFound() {
  return <Redirect href="/" />;
}
