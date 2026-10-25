import * as SecureStore from 'expo-secure-store';
import type { Category } from '../types';

// Ostatnio używane kategorie (tylko na tym urządzeniu) wypychają domyślne TOP z categories.json z listy nad
// „Pokaż wszystkie”. Prosta lista „ostatnio użyte” (nie ranking): użyta kategoria wskakuje na początek, powtórzona
// tylko się przesuwa. Kategoria 0 („Pozostałe przypadki”) ma własny kafelek pod listą i nie bierze w tym udziału.
const KEY = 'ud_recent_categories';
export const TOP_CATEGORIES = 4;

export function pushRecent(recent: number[], id: number, max = TOP_CATEGORIES): number[] {
  if (!id) return recent;
  return [id, ...recent.filter((x) => x !== id)].slice(0, max);
}

// Ostatnio użyte (istniejące, z tytułem) na początku, dopełnione domyślnymi bez powtórzeń.
export function pickTopCategories(defaults: Category[], all: Category[], recent: number[], n = TOP_CATEGORIES): Category[] {
  const byId = new Map(all.filter((c) => c.title && c.id).map((c) => [c.id, c]));
  const fromRecent = recent.map((id) => byId.get(id)).filter((c): c is Category => !!c);
  const seen = new Set(fromRecent.map((c) => c.id));
  return [...fromRecent, ...defaults.filter((c) => c.id && !seen.has(c.id))].slice(0, n);
}

export async function loadRecentCategories(): Promise<number[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
  } catch {
    return []; // brak magazynu albo uszkodzony wpis = domyślne TOP
  }
}

export async function recordRecentCategory(id: number): Promise<void> {
  if (!id) return;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(pushRecent(await loadRecentCategories(), id)));
  } catch {
    /* kolejność kategorii to tylko wygoda – błąd zapisu nie przerywa wysyłki */
  }
}
