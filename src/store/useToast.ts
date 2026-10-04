import { create } from 'zustand';

// Krótki komunikat nad całą aplikacją (błędy, które nie dotyczą konkretnego pola formularza).
type Toast = { id: number; text: string; kind: 'error' | 'info' };

type ToastState = {
  toast: Toast | null;
  show: (text: string, kind?: Toast['kind']) => void;
  hide: () => void;
};

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToast = create<ToastState>((set) => ({
  toast: null,
  show: (text, kind = 'error') => {
    if (timer) clearTimeout(timer);
    set({ toast: { id: Date.now(), text, kind } });
    timer = setTimeout(() => set({ toast: null }), kind === 'error' ? 6000 : 3000);
  },
  hide: () => {
    if (timer) clearTimeout(timer);
    set({ toast: null });
  },
}));

// Do wołania spoza komponentów: toast.error('…')
export const toast = {
  error: (text: string) => useToast.getState().show(text, 'error'),
  info: (text: string) => useToast.getState().show(text, 'info'),
};
