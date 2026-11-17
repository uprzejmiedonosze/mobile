import { create } from 'zustand';

// Schemat kontraktu backendu z nagłówka `X-UD-Server-Schema` (lib/apiSchema.ts) – ustawiany przy każdej odpowiedzi REST
// (api/udApi.ts). null = jeszcze nie wiemy albo backend starszy niż 11 (bez nagłówka): wtedy nowe funkcje są schowane.
type Server = { schema: number | null; setSchema: (n: number) => void };

export const useServer = create<Server>((set, get) => ({
  schema: null,
  setSchema: (n) => { if (get().schema !== n) set({ schema: n }); },
}));
