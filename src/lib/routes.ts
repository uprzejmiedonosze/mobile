// Nazwy ekranów → adresy tras expo-router (pliki w app/). Adresy jak na webie (/app, /app/new, /app/list…).
// Ekrany i lib (letterEntry, openUdPage) posługują się nazwami, a nawigacja dostaje gotowy href.
export const ROUTES = {
  Login: '/login',
  Onboarding: '/onboarding',
  WebPage: '/page',
  Dashboard: '/app',
  NewReport: '/app/new', // zakładka „Nowe” (zapamiętany szkic); na iOS 26+ osobne kółko po prawej stronie paska
  EditReport: '/app/edit', // ten sam formularz nad zakładkami: ?editId= (edycja) albo ?waitingIds= (paczka z poczekalni)
  WaitingRoom: '/app/waiting',
  Reports: '/app/list',
  Account: '/app/account',
  ReportConfirm: '/app/confirm',
  ReportDone: '/app/done',
  Letter: '/app/letter',
  QuotaInfo: '/app/quota',
  WaitingCamera: '/app/camera',
  Badge: '/app/badge', // opis odznaki w natywnym arkuszu (formSheet)
  Report: '/app/report', // szczegóły zgłoszenia z listy w natywnym arkuszu (formSheet, dane w useReportSheet)
} as const;

export type RouteName = keyof typeof ROUTES;
export type RouteParams = Record<string, string | number | undefined>;

export const href = (name: RouteName, params?: RouteParams) =>
  params ? { pathname: ROUTES[name], params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string | number> } : ROUTES[name];

// Listy (id zdjęć, id zgłoszeń) w parametrach adresu jako „a,b,c” – parametr może przyjść jako string albo string[].
export const joinIds = (ids: string[]) => ids.join(',');
export const splitIds = (v: string | string[] | undefined): string[] | undefined => {
  if (v == null) return undefined;
  const ids = (Array.isArray(v) ? v.join(',') : v).split(',').filter(Boolean);
  return ids.length ? ids : undefined;
};

// Jedna wartość parametru (expo-router może dać tablicę przy powtórzonym kluczu).
export const param = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v) || undefined;
