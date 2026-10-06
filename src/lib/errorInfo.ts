// Zamienia błąd (ApiError / Error z sieci / cokolwiek) na treść ekranu błędu (components/ErrorScreen.tsx).
// Surowy komunikat serwera (np. SQL) nigdy nie trafia do użytkownika – `detail` pokazujemy tylko w trybie deweloperskim,
// a użytkownikowi dajemy sam kod (`code`), który może podać w wiadomości do nas (/kontakt.html).
export type ErrorKind = 'offline' | 'server' | 'other';
export type ErrorInfo = { kind: ErrorKind; title: string; message: string; code: string | null; detail: string };

export function describeError(e: unknown): ErrorInfo {
  const status = typeof (e as any)?.status === 'number' ? ((e as any).status as number) : null;
  const detail = String((e as any)?.message ?? e ?? '').slice(0, 400);
  if (status === 0) {
    return { kind: 'offline', title: 'Brak połączenia', message: 'Nie możemy połączyć się z serwerem. Sprawdź internet i spróbuj ponownie.', code: null, detail };
  }
  if (status !== null && status >= 500) {
    return {
      kind: 'server',
      title: 'Coś po naszej stronie nie działa',
      message: 'Serwer Uprzejmie Donoszę zwrócił błąd. To nie Twoja wina, a Twoje zgłoszenia są bezpieczne. Spróbuj za chwilę – a jeśli problem wraca, daj nam znać.',
      code: `HTTP ${status}`,
      detail,
    };
  }
  return {
    kind: 'other',
    title: 'Coś poszło nie tak',
    message: 'Nie udało się wczytać danych. Spróbuj ponownie – a jeśli problem wraca, daj nam znać.',
    code: status !== null ? `HTTP ${status}` : null,
    detail,
  };
}
