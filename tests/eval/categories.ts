// Ładuje kanoniczną listę kategorii wykroczeń z backendu (źródło prawdy, publicznie serwowane
// przez GET /api/rest/config/categories) — używane przez prompt v3-categories i przez score.ts
// do nazw kategorii w raporcie.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CATEGORIES_PATH = path.resolve(
  import.meta.dirname,
  '../../../uprzejmiedonosze/src/api/config/categories.json',
);

export type Category = {
  id: number;
  title: string;
  short: string;
};

let cache: Category[] | null = null;

export function loadCategories(): Category[] {
  if (cache) return cache;
  const raw = JSON.parse(readFileSync(CATEGORIES_PATH, 'utf8')) as Record<string, any>;
  cache = Object.entries(raw)
    .map(([id, v]) => ({
      id: Number(id),
      title: v.title ?? v.informal ?? `kat. ${id}`,
      short: v.short ?? '',
    }))
    .sort((a, b) => a.id - b.id);
  return cache;
}

export function categoryName(id: number): string {
  const c = loadCategories().find((c) => c.id === id);
  return c ? c.title : `kat. ${id}`;
}
