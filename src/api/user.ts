// Onboarding UD po REST – bez web UI, patrz CLAUDE.md sekcja Auth.
// isRegistered() (../uprzejmiedonosze/src/inc/dataclasses/User.php) = name && address niepuste.
// isTermsConfirmed = termsConfirmation > LATEST_TERMS_UPDATE.
import { patronem } from '../lib/sex';
import { udConfig } from '../config';
import { logFetch } from '../lib/log';
import { apiJson, authFetch } from './udApi';

// Punkt regulaminu: tekst albo części z linkiem (patrz termSegments w lib/reports.ts)
export type TermsItem = { li: string | Array<{ text?: string; link?: { url: string; text: string } }> };
export type TermsDoc = { terms: TermsItem[]; updated: string };

// PATCH /api/rest/user/ tworzy wiersz usera jeśli nie istnieje (UserMiddleware createIfNonExists:
// true), no-op gdy już istnieje – bezpieczne wołać zawsze przed rejestracją.
export async function ensureUserRow(): Promise<void> {
  const res = await authFetch('/api/rest/user/', { method: 'PATCH' });
  if (!res.ok) throw new Error(`Nie udało się założyć konta UD (HTTP ${res.status}).`);
}

export type UserProfile = {
  name: string;
  email: string;
  address: string;
  msisdn: string;
  edelivery: string;
  shareRecydywa: boolean;
  lastLocation: { lat: number; lng: number } | null; // ostatnie zgłoszenie albo geokodowany adres zamieszkania (backend), null = brak
  patronem: string; // „Patronem”/„Patronką”/„Patronką(em)” (po „Zostań”)
  bylam: string; // „byłem”/„byłam”/„byłam/em” – fraza odmieniona przez płeć (sexStrings z backendu, jak config.sex na webie)
};

const parseLatLng = (s: unknown): { lat: number; lng: number } | null => {
  const [lat, lng] = typeof s === 'string' ? s.split(',').map(Number) : [];
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

// GET /api/rest/user/ → { data: { name, email, address, msisdn, edelivery, shareRecydywa }, stats, ... }.
export async function fetchProfile(): Promise<UserProfile> {
  const res = await authFetch('/api/rest/user/');
  if (!res.ok) throw new Error(`Nie udało się pobrać danych konta (HTTP ${res.status}).`);
  const j = (await res.json()) as any;
  const d = j?.data ?? {};
  return {
    name: d.name ?? '',
    email: d.email ?? '',
    address: d.address ?? '',
    msisdn: d.msisdn ?? '',
    edelivery: d.edelivery ?? '',
    shareRecydywa: d.shareRecydywa ?? false,
    lastLocation: parseLatLng(j?.lastLocation),
    bylam: j?.sexStrings?.bylam ?? 'byłam/em',
    patronem: patronem(j?.sexStrings),
  };
}

// POST /api/rest/user/ – backend ma domyślne '' dla msisdn/edelivery i 'Y' dla shareRecydywa,
// więc przy zapisie edycji zawsze wysyłamy komplet pól (inaczej puste nadpisałyby zapisane).
export async function updateUserProfile(
  name: string,
  address: string,
  extra: { msisdn?: string; edelivery?: string; shareRecydywa?: boolean } = {},
): Promise<void> {
  const body: Record<string, string> = { name, address };
  if (extra.msisdn !== undefined) body.msisdn = extra.msisdn;
  if (extra.edelivery !== undefined) body.edelivery = extra.edelivery;
  if (extra.shareRecydywa !== undefined) body.shareRecydywa = extra.shareRecydywa ? 'Y' : 'N';
  const res = await authFetch('/api/rest/user/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

export type Passkey = { id: string; label: string; createdAt: string; lastUsedAt: string | null };

// Passkeye (web: /app/account). Lista i usuwanie przez REST; dodanie passkeya wymaga WebAuthn w natywnej
// aplikacji (powiązanie RP/origin) – na razie tylko na www.
export async function fetchPasskeys(): Promise<Passkey[]> {
  const j = await apiJson<{ passkeys: Passkey[] }>(await authFetch('/api/rest/user/passkeys'), 'Nie udało się pobrać passkeyów');
  return j.passkeys;
}

export async function removePasskey(id: string): Promise<void> {
  await apiJson(await authFetch(`/api/rest/user/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' }), 'Nie udało się usunąć passkeya');
}

// „Skasuj konto” – nieodwracalne; wymaga ponownego wpisania własnego e-maila (jak formularz na www).
export async function deleteAccount(email: string): Promise<void> {
  const res = await authFetch('/api/rest/user/', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  await apiJson(res, 'Nie udało się skasować konta');
}
