import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { create } from 'zustand';
import { exifDate } from '../lib/dateTime';
import { log } from '../lib/log';
import { claimLegacy, ownerKey, visiblePhotos, type Fix, type WaitingPhoto } from '../lib/waitingRoom';
import { useAuth } from './useAuth';

// Od 1.3.0 poczekalnia jest w wydaniach produkcyjnych na Androidzie; na iOS włączona razem z aparatem w appce (uprawnienia w app.json).
export const waitingRoomEnabled = Platform.OS === 'android' || Platform.OS === 'ios';

// Zdjęcia z aparatu w appce żyją w jej prywatnym katalogu: <id>.jpg + <id>.json (metadane). Osobny plik na zdjęcie, żeby awaria w trakcie
// zapisu kosztowała najwyżej jedno zdjęcie. W JSON-ie nie ma uri: ścieżka katalogu appki może się zmienić po aktualizacji.
const dir = () => new Directory(Paths.document, 'waiting-room');
// Nagrania (kind: 'video'): <id>.mp4 + okładka <id>.poster.jpg. Wpis bez `kind` to zdjęcie (sprzed nagrań).
const media = (id: string, kind?: WaitingPhoto['kind']) => new File(dir(), `${id}.${kind === 'video' ? 'mp4' : 'jpg'}`);
const poster = (id: string) => new File(dir(), `${id}.poster.jpg`);
const meta = (id: string) => new File(dir(), `${id}.json`);
const save = ({ uri: _uri, posterUri: _poster, ...p }: WaitingPhoto) => meta(p.id).write(JSON.stringify(p));

type Shot = { uri: string; takenAtMs: number; fix: Fix | null; carSeq: number; kind?: 'photo' | 'video'; durationMs?: number; size?: number };

const currentOwner = () => ownerKey(useAuth.getState().email);

type WaitingRoom = {
  all: WaitingPhoto[]; // wszystkie zdjęcia z katalogu (także innych kont); ekrany używają `photos`
  photos: WaitingPhoto[]; // zdjęcia zalogowanego konta
  hydrated: boolean;
  hydrate: () => void;
  add: (shot: Shot) => WaitingPhoto;
  setPoster: (id: string, uri: string) => void; // okładka nagrania (generowana po zapisie, może się nie udać)
  remove: (ids: string[]) => void;
  markUsed: (ids: string[], draftId: string) => void; // zdjęcia są już w szkicu, ale zostają: szkic trzeba móc otworzyć (nie ma go na liście zgłoszeń)
  restore: (ids: string[]) => void; // z powrotem do poczekalni
  removeDrafts: (draftIds: string[]) => void; // zgłoszenie potwierdzone – lokalne kopie nie są już potrzebne
};

export const useWaitingRoom = create<WaitingRoom>((set, get) => {
  // Jedyne miejsce zapisu stanu: `photos` to zawsze widok `all` dla bieżącego konta. Zdjęcia sprzed oznaczania kont dostaje pierwsze konto.
  const commit = (all: WaitingPhoto[]) => {
    const owner = currentOwner();
    const { photos: claimedAll, claimed } = claimLegacy(all, owner);
    claimed.forEach((p) => { try { save(p); } catch (e: any) { log.warn('poczekalnia', `oznaczanie ${p.id}: ${String(e?.message ?? e).slice(0, 120)}`); } });
    set({ all: claimedAll, photos: visiblePhotos(claimedAll, owner) });
  };
  // Zmiana konta (logowanie, wylogowanie) przelicza widok; bez tego następna osoba zobaczyłaby cudze zdjęcia.
  useAuth.subscribe((s, prev) => { if (ownerKey(s.email) !== ownerKey(prev.email) && get().hydrated) commit(get().all); });
  return {
  all: [],
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
          const file = media(p.id, p.kind);
          if (!file.exists) continue;
          const cover = p.kind === 'video' ? poster(p.id) : null;
          photos.push({ ...p, uri: file.uri, ...(cover?.exists ? { posterUri: cover.uri } : {}) });
        } catch (e: any) {
          log.warn('poczekalnia', `uszkodzony wpis ${f.name}: ${String(e?.message ?? e).slice(0, 120)}`);
        }
      }
    } catch (e: any) {
      log.warn('poczekalnia', `odczyt katalogu: ${String(e?.message ?? e).slice(0, 160)}`);
    }
    set({ hydrated: true });
    commit(photos.sort((a, b) => a.takenAtMs - b.takenAtMs));
  },
  add: ({ uri, takenAtMs, fix, carSeq, kind, durationMs, size }) => {
    const id = `${takenAtMs}-${Math.random().toString(36).slice(2, 8)}`;
    dir().create({ intermediates: true, idempotent: true });
    // expo-camera zapisuje do cache, który system może wyczyścić – przenosimy od razu
    const target = media(id, kind);
    new File(uri).moveSync(target);
    const photo: WaitingPhoto = {
      id, uri: target.uri, takenAtMs, datetimeOriginal: exifDate(takenAtMs),
      lat: fix?.lat ?? null, lng: fix?.lng ?? null, accuracy: fix?.accuracy ?? null, carSeq, owner: currentOwner() || undefined,
      ...(kind === 'video' ? { kind, durationMs, size } : {}),
    };
    save(photo);
    commit([...get().all, photo]);
    return photo;
  },
  setPoster: (id, uri) => {
    try {
      const target = poster(id);
      if (target.exists) target.delete();
      new File(uri).moveSync(target);
      set({ photos: get().photos.map((p) => (p.id === id ? { ...p, posterUri: target.uri } : p)) });
    } catch (e: any) {
      log.warn('poczekalnia', `okładka ${id}: ${String(e?.message ?? e).slice(0, 120)}`);
    }
  },
  remove: (ids) => {
    for (const id of ids) {
      for (const f of [media(id, 'photo'), media(id, 'video'), poster(id), meta(id)]) {
        try { if (f.exists) f.delete(); } catch (e: any) { log.warn('poczekalnia', `usuwanie ${id}: ${String(e?.message ?? e).slice(0, 120)}`); }
      }
    }
    commit(get().all.filter((p) => !ids.includes(p.id)));
  },
  markUsed: (ids, draftId) => {
    const usedAt = Date.now();
    commit(get().all.map((p) => {
      if (!ids.includes(p.id)) return p;
      const next = { ...p, draftId, usedAt };
      save(next);
      return next;
    }));
  },
  restore: (ids) => {
    commit(get().all.map((p) => {
      if (!ids.includes(p.id)) return p;
      const { draftId: _d, usedAt: _u, ...next } = p;
      save(next);
      return next;
    }));
  },
  removeDrafts: (draftIds) => {
    const ids = get().photos.filter((p) => p.draftId && draftIds.includes(p.draftId)).map((p) => p.id);
    if (ids.length) get().remove(ids);
  },
  };
});
