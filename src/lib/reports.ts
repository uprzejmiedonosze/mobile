// Czyste helpery prezentacji listy zgłoszeń (testowalne bez RN).
const WD = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const p2 = (n: number) => String(n).padStart(2, '0');

// Backend zapisuje czas bez strefy ("2026-09-10T19:43:00") – parsujemy ręcznie jako lokalny.
function parts(s?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s ?? '');
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  return { y, mo, d, h, mi, wd: new Date(y, mo - 1, d).getDay() };
}

export const fmtShortDate = (s?: string) => { const t = parts(s); return t ? `${p2(t.d)}.${p2(t.mo)}.${t.y}` : ''; };
// "10.09.2026, 19:43 (czw.)" – jak getDate("d.MM.y, H:mm (eee)")
export const fmtLongDate = (s?: string) => { const t = parts(s); return t ? `${p2(t.d)}.${p2(t.mo)}.${t.y}, ${t.h}:${p2(t.mi)} (${WD[t.wd]})` : ''; };
// "30 września 2026 o 10:00" – jak getSentDate("d MMMM y 'o' H:mm")
export const fmtSent = (s?: string) => { const t = parts(s); return t ? `${t.d} ${MONTHS_GEN[t.mo - 1]} ${t.y} o ${t.h}:${p2(t.mi)}` : ''; };

// Odpowiednik getShortAddress(): bez miasta na końcu, jeśli to miasto użytkownika (tu: zawsze obcinamy,
// bo lista jest przeglądana lokalnie; pełny adres jest w rozwinięciu).
export function shortAddress(addr?: string): string {
  return (addr ?? '').replace(/,\s*[^,]+$/, '') || (addr ?? '');
}

export function plural(n: number, forms: [string, string, string]): string {
  if (n === 1) return `${n} ${forms[1]}`;
  const d = n % 10, t = n % 100;
  return `${n} ${d >= 2 && d <= 4 && !(t >= 12 && t <= 14) ? forms[2] : forms[0]}`;
}

// Kolory statusów 1:1 z src/scss/lib/variables.scss (fill = tło kropki/licznika, stroke = obwódka).
export type StatusColor = { fill: string; stroke: string; text: string };
const C = (fill: string, stroke: string, text = '#16241d'): StatusColor => ({ fill, stroke, text });
export const STATUS_COLORS: Record<string, StatusColor> = {
  draft: C('#FFFFFF', '#FFFFFF'),
  ready: C('#FFFFFF', '#C5C5C5'),
  confirmed: C('#FFFFFF', '#333333'),
  sending: C('#C5C5C5', '#333333'),
  'sending-problem': C('#FF640A', '#FF640A'),
  'sending-failed': C('#FF640A', '#FF640A', '#FFFFFF'),
  'confirmed-waiting': C('#FFFFFF', '#08BB0F'),
  'confirmed-waitingE': C('#FFFFFF', '#08BB0F'),
  'confirmed-sm': C('#08BB0F', '#08BB0F'),
  'confirmed-fined': C('#256EC6', '#256EC6', '#FFFFFF'),
  'confirmed-instructed': C('#FFFFFF', '#256EC6'),
  'confirmed-ignored': C('#FF640A', '#FF640A', '#FFFFFF'),
  'confirmed-complaint': C('#FFFFFF', '#FF640A'),
  archived: C('#FFFFFF', '#A2A2A2'),
};
export const statusColor = (status: string): StatusColor => STATUS_COLORS[status] ?? STATUS_COLORS.archived;

// Chipy filtra: tylko statusy, które faktycznie występują (count > 0), w kolejności słownika statusów
// – jak updateCounters() w src/js/lib/status.js. Szkice/edycja nie są na liście (backend ich nie zwraca).
export function filterChips(
  statuses: Record<string, { name: string }>,
  counts: Record<string, unknown>,
): { key: string; label: string; count: number }[] {
  return Object.entries(statuses)
    .filter(([k]) => k !== 'draft' && k !== 'ready')
    .map(([k, v]) => ({ key: k, label: v.name, count: Number(counts[k]) || 0 }))
    .filter((c) => c.count > 0);
}

export function witnessText(witness?: boolean): string {
  // Neutralnie rodzajowo (web odmienia przez guessUserSex, którego nie ma w JSON-ie listy).
  return witness ? 'Świadek parkowania: tak.' : 'Świadek parkowania: nie.';
}

// Treść zgłoszenia: formalny opis kategorii + rozszerzenia + komentarz (jak w _application-short-details).
export function reportBody(formal: string | undefined, comment: string | undefined): string {
  return [formal, comment].filter((x) => x && x.trim()).join(' ');
}

// EXIF "2026:09:10 19:43:00" → ISO "2026-09-10T19:43:00" (to samo robi web w images.js)
export function exifToIso(s: string | null): string | null {
  const m = s ? /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

// „Czy pojazd dodatkowo:” – web (new-app/on-load.js::validateExtensions): rozszerzenie o tym samym id co
// wybrana kategoria jest zablokowane i odznaczone (nie dokładamy kategorii głównej do samej siebie).
export const isExtensionDisabled = (extId: number, category: number): boolean => extId === category;
export const dropMatchingExtension = (extensions: number[], category: number): number[] =>
  extensions.filter((e) => !isExtensionDisabled(e, category));

// Punkt regulaminu z GET /api/rest/config/terms: `{ li: "tekst" }` albo `{ li: [{text}, {link: {url, text}}, {text}] }`
// (to samo, co renderuje regulamin.html na webie). Zwraca segmenty do wyrenderowania w jednym <Text>;
// segmenty z `url` są linkami (url względny wobec serwisu). Spacje między częściami, ale nie przed interpunkcją.
export type TermSegment = { text: string; url?: string };
export function termSegments(li: unknown): TermSegment[] {
  if (typeof li === 'string') return [{ text: li }];
  if (!Array.isArray(li)) return [];
  const out: TermSegment[] = [];
  for (const part of li as any[]) {
    const seg: TermSegment | null = part?.link ? { text: String(part.link.text ?? ''), url: part.link.url } : part?.text != null ? { text: String(part.text) } : null;
    if (!seg || !seg.text) continue;
    if (out.length && !/^[.,;:!?)]/.test(seg.text)) out.push({ text: ' ' });
    out.push(seg);
  }
  return out;
}

// Miękka walidacja komentarza z webu (bindSoftCommentValidation): ostrzeżenie, gdy opis sugeruje, że trzeba zaznaczyć
// „świadek momentu parkowania” (pisanie o kierowcy / „świadku” / „panu”). Brak ostrzeżenia = null.
export function commentWarning(comment: string): string | null {
  let msg: string | null = null;
  if (/(?:^|[^A-Za-z0-9_])kier\w*/i.test(comment)) msg = 'Wspominasz kierowcę w komentarzu.';
  if (/(?:^|[^A-Za-z0-9_])[sś]wiadk\w*/i.test(comment)) msg = 'Używasz słowa „świadek” w komentarzu.';
  if (/(?:^|[^A-Za-z0-9_])pani?/i.test(comment)) msg = 'Używasz słowa „pan/i” w komentarzu.';
  return msg;
}
