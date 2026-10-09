import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { FinishResult } from '../api/reports';

// Odpowiednik `$_SESSION['newAppId']` z webu: id rozpoczętego szkicu przeżywa zamknięcie aplikacji,
// żeby nie tworzyć nowego szkicu przy każdym wejściu w „Nowe”. Czyszczone po „Potwierdź”.
const KEY = 'ud_new_report_id';

type NewReport = {
  draftId: string | null;
  hydrated: boolean;
  done: FinishResult[] | null; // wyniki ostatniego „Potwierdź” (jedno zgłoszenie albo dwa przy „Oba”) dla ekranu podsumowania
  hydrate: () => Promise<void>;
  setDraftId: (id: string | null) => void;
  setDone: (r: FinishResult[] | null) => void;
};

export const useNewReport = create<NewReport>((set, get) => ({
  draftId: null,
  hydrated: false,
  done: null,
  hydrate: async () => {
    if (get().hydrated) return;
    let id: string | null = null;
    try {
      id = await SecureStore.getItemAsync(KEY);
    } catch {
      /* brak dostępu do magazynu = zaczynamy od nowego szkicu */
    }
    set({ draftId: id, hydrated: true });
  },
  setDraftId: (id) => {
    set({ draftId: id });
    (id ? SecureStore.setItemAsync(KEY, id) : SecureStore.deleteItemAsync(KEY)).catch(() => {});
  },
  setDone: (done) => set({ done }),
}));
