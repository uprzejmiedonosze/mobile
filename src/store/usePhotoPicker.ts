import { create } from 'zustand';
import type { PhotoItem } from '../types';

// Własny wybór zdjęć (Android): okno PhotoPickerHost jest zamontowane raz w App.tsx; `requestPhotos`
// otwiera je i zwraca obietnicę z wybranymi zdjęciami (pusta tablica = anulowano).
type PickerState = {
  request: { limit: number; min: number; resolve: (p: PhotoItem[]) => void } | null;
  open: (limit: number, min: number) => Promise<PhotoItem[]>;
  close: (photos: PhotoItem[]) => void;
};

export const usePhotoPicker = create<PickerState>((set, get) => ({
  request: null,
  open: (limit, min) =>
    new Promise((resolve) => {
      get().request?.resolve([]); // poprzednie, niedokończone żądanie = anulowane
      set({ request: { limit, min, resolve } });
    }),
  close: (photos) => {
    get().request?.resolve(photos);
    set({ request: null });
  },
}));

export const requestPhotos = (limit: number, min = 1) => usePhotoPicker.getState().open(limit, min);
