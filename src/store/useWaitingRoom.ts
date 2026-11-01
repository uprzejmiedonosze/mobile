import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { create } from 'zustand';
import { udEnv } from '../config';
import { exifDate } from '../lib/dateTime';
import { log } from '../lib/log';
import type { Fix, WaitingPhoto } from '../lib/waitingRoom';

// MVP do oceny przydatności: Android, poza buildami produkcyjnymi (dev client na prod, np. `make dev-prod`, też ma funkcję).
export const waitingRoomEnabled = Platform.OS === 'android' && (__DEV__ || udEnv !== 'prod');

// Zdjęcia z aparatu w appce żyją w jej prywatnym katalogu: <id>.jpg + <id>.json (metadane). Osobny plik na zdjęcie, żeby awaria w trakcie
// zapisu kosztowała najwyżej jedno zdjęcie. W JSON-ie nie ma uri: ścieżka katalogu appki może się zmienić po aktualizacji.
const dir = () => new Directory(Paths.document, 'waiting-room');
const image = (id: string) => new File(dir(), `${id}.jpg`);
const meta = (id: string) => new File(dir(), `${id}.json`);
const save = ({ uri: _uri, ...p }: WaitingPhoto) => meta(p.id).write(JSON.stringify(p));

type Shot = { uri: string; takenAtMs: number; fix: Fix | null; carSeq: number };

type WaitingRoom = {
  photos: WaitingPhoto[];
  hydrated: boolean;
  hydrate: () => void;
  add: (shot: Shot) => WaitingPhoto;
  remove: (ids: string[]) => void;
  markUsed: (ids: string[], draftId: string) => void; // zdjęcia są już w szkicu, ale zostają: szkic trzeba móc otworzyć (nie ma go na liście zgłoszeń)
  restore: (ids: string[]) => void; // z powrotem do poczekalni
  removeDrafts: (draftIds: string[]) => void; // zgłoszenie potwierdzone – lokalne kopie nie są już potrzebne
};

export const useWaitingRoom = create<WaitingRoom>((set, get) => ({
  photos: [],
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    const photos: WaitingPhoto[] = [];
    try {
      dir().create({ intermediates: true, idempotent: true });
      for (const f of dir().list()) {
        if (!(f instanceof File) || !f.name.endsWith('.json')) continue;
        try {
          const p = JSON.parse(f.textSync()) as WaitingPhoto;
          const img = image(p.id);
          if (img.exists) photos.push({ ...p, uri: img.uri });
        } catch (e: any) {
          log.warn('poczekalnia', `uszkodzony wpis ${f.name}: ${String(e?.message ?? e).slice(0, 120)}`);
        }
      }
    } catch (e: any) {
      log.warn('poczekalnia', `odczyt katalogu: ${String(e?.message ?? e).slice(0, 160)}`);
    }
    set({ photos: photos.sort((a, b) => a.takenAtMs - b.takenAtMs), hydrated: true });
  },
  add: ({ uri, takenAtMs, fix, carSeq }) => {
    const id = `${takenAtMs}-${Math.random().toString(36).slice(2, 8)}`;
    dir().create({ intermediates: true, idempotent: true });
    // expo-camera zapisuje do cache, który system może wyczyścić – przenosimy od razu
    const target = image(id);
    new File(uri).moveSync(target);
    const photo: WaitingPhoto = {
      id, uri: target.uri, takenAtMs, datetimeOriginal: exifDate(takenAtMs),
      lat: fix?.lat ?? null, lng: fix?.lng ?? null, accuracy: fix?.accuracy ?? null, carSeq,
    };
    save(photo);
    set({ photos: [...get().photos, photo] });
    return photo;
  },
  remove: (ids) => {
    for (const id of ids) {
      for (const f of [image(id), meta(id)]) {
        try { if (f.exists) f.delete(); } catch (e: any) { log.warn('poczekalnia', `usuwanie ${id}: ${String(e?.message ?? e).slice(0, 120)}`); }
      }
    }
    set({ photos: get().photos.filter((p) => !ids.includes(p.id)) });
  },
  markUsed: (ids, draftId) => {
    const usedAt = Date.now();
    set({ photos: get().photos.map((p) => {
      if (!ids.includes(p.id)) return p;
      const next = { ...p, draftId, usedAt };
      save(next);
      return next;
    }) });
  },
  restore: (ids) => {
    set({ photos: get().photos.map((p) => {
      if (!ids.includes(p.id)) return p;
      const { draftId: _d, usedAt: _u, ...next } = p;
      save(next);
      return next;
    }) });
  },
  removeDrafts: (draftIds) => {
    const ids = get().photos.filter((p) => p.draftId && draftIds.includes(p.draftId)).map((p) => p.id);
    if (ids.length) get().remove(ids);
  },
}));
