const WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const WEEKDAYS_SHORT = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
const MONTHS_GEN = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];

const pad2 = (n: number) => String(n).padStart(2, '0');

// "4:23 środa, 9 września 2026" – jak w copy zgłoszeń na webie.
export function fmtPlDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${pad2(d.getMinutes())} ${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
}

// "12:16 pon. 28.09.2026" – krótszy wariant do list kandydatów (GroupingScreen).
export function fmtPlDateTimeShort(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${WEEKDAYS_SHORT[d.getDay()]} ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
