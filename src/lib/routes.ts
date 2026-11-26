import { Platform } from 'react-native';

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

// Android: zamiast zakładki „Nowe” jest pływający przycisk „+” na Starcie (SpeedDial), a zakładka jest ukryta – ukrytej zakładki
// nie da się otworzyć, więc nowe zgłoszenie to ten sam formularz nad zakładkami (/app/edit bez parametrów = zapamiętany szkic).
export const newReportTab = Platform?.OS !== 'android'; // ?. – w testach jednostkowych (ts-jest) react-native nie ma Platform
const path = (name: RouteName) => (name === 'NewReport' && !newReportTab ? ROUTES.EditReport : ROUTES[name]);

export const href = (name: RouteName, params?: RouteParams) =>
  params ? { pathname: path(name), params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string | number> } : path(name);

// Listy (id zdjęć, id zgłoszeń) w parametrach adresu jako „a,b,c” – parametr może przyjść jako string albo string[].
export const joinIds = (ids: string[]) => ids.join(',');
export const splitIds = (v: string | string[] | undefined): string[] | undefined => {
  if (v == null) return undefined;
  const ids = (Array.isArray(v) ? v.join(',') : v).split(',').filter(Boolean);
  return ids.length ? ids : undefined;
};

// Jedna wartość parametru (expo-router może dać tablicę przy powtórzonym kluczu).
export const param = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v) || undefined;
