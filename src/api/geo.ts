import type { Category, GeoAddress } from '../types';
import { udConfig } from '../config';
import { log, logFetch } from '../lib/log';

// Backend UD (z API.md + Geolocation.php):
//  GET /api/rest/geo/{lat},{lng}/n  -> {address: {...}, sm, sa}
//  GET /api/rest/geo/{lat},{lng}/m  -> {name, address: {address, city, voivodeship, postcode, …}} (MapBox)
//  GET /api/config/categories.json  -> słownik kategorii (statyczny plik, publiczny,
//    dokładnie src/api/config/categories.json z backendu – bez tras REST/API.md, bez auth).
// Auth: Bearer = Firebase ID token (AuthMiddleware) tylko dla /api/rest/*, jak na webie po
// verify-token.

export const UD_BASE = udConfig.base;

// Odpowiedź /geo/.../n i /geo/search → GeoAddress (jedno miejsce parsowania).
// Rodzaj jednostki po nazwie (geolocation.js::unitKind na webie)
function unitKind(u: any): string {
  const joined = (u?.address ?? []).join(' ');
  if (/Straż\w* Miejsk\w*/i.test(joined)) return 'Straż miejska';
  if (/Straż\w* Gminn\w*/i.test(joined)) return 'Straż gminna';
  return 'Policja';
}

export function toGeoAddress(j: any): GeoAddress {
  const a = j?.address ?? j;
  const road = a?.road ?? '';
  const num = a?.house_number ?? '';
  const city = a?.city ?? '';
  return {
    display: (a?.address as string) ?? `${road} ${num}, ${city}`.trim(),
    road,
    houseNumber: num,
    city,
    district: a?.district ?? '',
    voivodeship: a?.voivodeship ?? '',
    county: a?.county ?? '',
    municipality: a?.municipality ?? '',
    postcode: a?.postcode ?? '',
    // odbiorca jak w geolocation.js::renderSM: nazwa skrócona + podpowiedź (hint) z sm.json / stop-agresji.json
    smUnknown: !!j && !j?.sm?.email,
    sm: j?.sm ? { kind: j.sm.email ? unitKind(j.sm) : 'Straż miejska', name: j.sm.email ? j.sm.short ?? '' : '', hint: j.sm.email ? j.sm.hint ?? '' : `W miejscowości ${city} nie powołano SM` } : undefined,
    sa: j?.sa ? { kind: 'Policja', name: j.sa.short ?? '', hint: j.sa.hint ?? '' } : undefined,
  };
}

// Jak geolocation.js::latLngToAddress na webie: adres opisowy (z numerem domu) bierzemy z MapBox, bo Nominatim dla
// wielu punktów zna tylko ulicę; Nominatim dopełnia brakujące pola i jako jedyny daje gminę/powiat/dzielnicę i
// odbiorcę (sm/sa). Którykolwiek z nich może zawieść – wtedy zostaje drugi.
export function mergeGeo(mapbox: any, nominatim: any): GeoAddress | null {
  const m = mapbox?.address;
  if (!m && !nominatim) return null;
  const n = toGeoAddress(nominatim);
  if (!m) return n;
  return {
    ...n,
    display: m.address || n.display,
    city: m.city || n.city,
    voivodeship: m.voivodeship || n.voivodeship,
    postcode: m.postcode || n.postcode,
  };
}

async function getGeo(kind: 'n' | 'm', lat: number, lng: number, token?: string): Promise<any> {
  const url = `${UD_BASE}/api/rest/geo/${lat.toFixed(4)},${lng.toFixed(4)}/${kind}`;
  try {
    const res = await logFetch('geo', url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      log.warn('geo', `/${kind}: HTTP ${res.status} dla ${lat.toFixed(4)},${lng.toFixed(4)} (pewnie brak auth – adres ręcznie)`);
      return null;
    }
    return await res.json();
  } catch (e: any) {
    log.warn('geo', `/${kind}: ${String(e?.message ?? e).slice(0, 200)}`);
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number, token?: string): Promise<GeoAddress | null> {
  const [m, n] = await Promise.all([getGeo('m', lat, lng, token), getGeo('n', lat, lng, token)]);
  return mergeGeo(m, n);
}

// Statyczny plik jest słownikiem {id: {...}} – "title" bywa null (część kategorii ma tylko
// "informal", np. id 7 "Postój niezgodny z oznaczeniem"), stąd fallback title -> informal -> id.
function normalizeCategory(id: string | number, v: any): Category {
  return {
    id: Number(id),
    title: v?.title ?? v?.informal ?? `kat. ${id}`,
    formal: v?.formal,
    fine: v?.price ?? v?.fine ?? v?.mandate,
    short: v?.short,
    mandate: v?.mandate,
    points: v?.points,
    groups: Array.isArray(v?.groups) ? v.groups : undefined,
    order: v?.order,
    stopAgresjiOnly: !!v?.stopAgresjiOnly,
    contextImageHint: v?.contextImageHint,
    carImageHint: v?.carImageHint,
    desc: v?.desc ?? undefined,
    law: v?.law ?? undefined,
    price: typeof v?.price === 'string' ? v.price : undefined,
  };
}

// `token` zostaje w sygnaturze dla zgodności z dotychczasowymi wołaniami (validIdToken().then...),
// ale jest nieużywany – plik jest statyczny i publiczny, bez middleware auth.
export async function fetchCategories(_token?: string): Promise<Category[]> {
  try {
    const res = await logFetch('geo', `${UD_BASE}/api/config/categories.json`);
    if (!res.ok) {
      log.warn('geo', `kategorie: HTTP ${res.status} – lista pusta`);
      return [];
    }
    const j = (await res.json()) as any;
    if (Array.isArray(j)) return j.map((v: any) => normalizeCategory(v?.id, v));
    return Object.entries(j ?? {}).map(([id, v]: [string, any]) => normalizeCategory(id, v));
  } catch (e: any) {
    log.warn('geo', `kategorie: ${String(e?.message ?? e).slice(0, 200)}`);
    return [];
  }
}
