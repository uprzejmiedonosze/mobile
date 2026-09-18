// Onboarding UD po REST – bez web UI, patrz CLAUDE.md sekcja Auth.
// isRegistered() (../uprzejmiedonosze/src/inc/dataclasses/User.php) = name && address niepuste.
// isTermsConfirmed = termsConfirmation > LATEST_TERMS_UPDATE.
import { udConfig } from '../config';
import { logFetch } from '../lib/log';
import { authFetch } from './udApi';

export type TermsDoc = { terms: unknown[]; updated: string };

// PATCH /api/rest/user/ tworzy wiersz usera jeśli nie istnieje (UserMiddleware createIfNonExists:
// true), no-op gdy już istnieje – bezpieczne wołać zawsze przed rejestracją.
export async function ensureUserRow(): Promise<void> {
  const res = await authFetch('/api/rest/user/', { method: 'PATCH' });
  if (!res.ok) throw new Error(`Nie udało się założyć konta UD (HTTP ${res.status}).`);
}

export async function updateUserProfile(name: string, address: string): Promise<void> {
  const res = await authFetch('/api/rest/user/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, address }),
  });
  if (!res.ok) throw new Error(`Nie udało się zapisać danych (HTTP ${res.status}).`);
}

// Publiczne (bez auth) – config group w rest/index.php nie ma middleware.
export async function fetchTerms(): Promise<TermsDoc> {
  const res = await logFetch('user', `${udConfig.base}/api/rest/config/terms`);
  if (!res.ok) throw new Error(`Nie udało się pobrać regulaminu (HTTP ${res.status}).`);
  return res.json();
}

export async function confirmTerms(): Promise<void> {
  const res = await authFetch('/api/rest/user/confirm-terms', { method: 'PATCH' });
  if (!res.ok) throw new Error(`Nie udało się potwierdzić regulaminu (HTTP ${res.status}).`);
}
