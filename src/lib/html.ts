// Krótkie fragmenty HTML z backendu (np. hint jednostki w sm.json – tools/sm-parser.js dopisuje generyczne
// „…? <a href="mailto:…">Podziel się</a>.”) → kawałki tekstu i linków do wyrenderowania w <Text>.
// Inne tagi są usuwane, encje podstawowe dekodowane.
export type HtmlSegment = { text: string; href?: string };

const decode = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = (s: string) => decode(s.replace(/<[^>]*>/g, ''));

export function htmlSegments(html?: string | null): HtmlSegment[] {
  const out: HtmlSegment[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const src = html ?? '';
  let last = 0;
  for (let m; (m = re.exec(src)); ) {
    if (m.index > last) out.push({ text: strip(src.slice(last, m.index)) });
    out.push({ text: strip(m[2]), href: decode(m[1]) });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ text: strip(src.slice(last)) });
  return out.filter((s) => s.text);
}
