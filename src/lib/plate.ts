// Normalizacja jak backend: upper, jeden myślnik/spacja -> spacja, bez myślników do klucza parowania
const PL_RE = /^[A-Z0-9]{1,3}\s?[A-Z0-9]{4,7}$/;

export function normalizePlate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const pretty = raw.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  // Indywidualne (np. "Z4 CICHE") i standardowe ze spacją – zaakceptuj jak jest
  if (/^[A-Z][0-9]? [A-Z0-9]{2,6}$/.test(pretty) || /^[A-Z]{2,3} [A-Z0-9]{3,6}$/.test(pretty)) return pretty;
  const s = pretty.replace(/ /g, '');
  if (s.length < 5 || s.length > 10) return null;
  // Bez spacji: 3-literowy powiat (ZPY/WZ? nie – WZ to 2) vs 2-znakowy vs indywidualny "Z4…"
  let split = 2;
  if (/^[A-Z]{3}/.test(s) && s.length >= 7) split = 3;
  if (/^[A-Z][0-9]/.test(s)) split = 2; // Z4CICHE -> Z4 CICHE
  const out = `${s.slice(0, split)} ${s.slice(split)}`;
  return PL_RE.test(out) || /^[A-Z][0-9] [A-Z0-9]{2,6}$/.test(out) ? out : null;
}

export function plateKey(plateId: string | null): string | null {
  if (!plateId) return null;
  return plateId.replace(/\s/g, '');
}

export function isPlausiblePlate(s: string | null): boolean {
  if (!s) return false;
  return PL_RE.test(s);
}
