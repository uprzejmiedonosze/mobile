// Data i czas zgłoszenia ↔ systemowy picker (components/DateTimeField.tsx). Backend zapisuje czas lokalny bez strefy: „YYYY-MM-DDTHH:mm:ss”.
const p2 = (n: number) => String(n).padStart(2, '0');

export const toIso = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:00`;

// „2026-09-10T19:43:00” → Date (czas lokalny; new Date(string) bez strefy bywa różnie interpretowany); null dla niepoprawnego tekstu.
export function fromIso(iso: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const out = new Date(y, mo - 1, d, h, mi, 0, 0);
  // „2026-02-31” przeskakuje na marzec – to nie jest poprawna data
  return out.getFullYear() === y && out.getMonth() === mo - 1 && out.getDate() === d ? out : null;
}

// Wynik wyboru: `date` zmienia tylko dzień (godzina z poprzedniej wartości), `time` tylko godzinę. Zgłoszenia nie można datować w przyszłości.
export function applyPicked(prevIso: string | null | undefined, picked: Date, part: 'date' | 'time', now: Date = new Date()): string {
  const base = fromIso(prevIso) ?? now;
  const out = part === 'date'
    ? new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), base.getHours(), base.getMinutes(), 0, 0)
    : new Date(base.getFullYear(), base.getMonth(), base.getDate(), picked.getHours(), picked.getMinutes(), 0, 0);
  return toIso(out > now ? now : out);
}
