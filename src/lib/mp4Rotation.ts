// Obrót nagrania w pliku MP4 (macierz w `tkhd` ścieżki wideo) – bez przekodowania, zmiana 36 bajtów w miejscu.
// Po co: appka jest zablokowana w pionie, a CameraX w expo-camera zapisuje film nagrany w poziomie ze znacznikiem obrotu z pionu
// (mimo łatki patches/expo-camera+*.patch). Prawdziwe położenie telefonu znamy z akcelerometru (lib/waitingRoom.ts → uiRotation),
// więc po nagraniu poprawiamy znacznik. Odtwarzacze, MediaMetadataRetriever (klatki do ALPR) i przeglądarki czytają tę macierz.

export type Rotation = 0 | 90 | 180 | 270;

// Dostęp do pliku: czytanie i nadpisywanie fragmentu (FileHandle z expo-file-system albo bufor w testach).
export type ByteIO = { size: number; read: (offset: number, length: number) => Uint8Array; write: (offset: number, bytes: Uint8Array) => void };

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const type4 = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

type Box = { type: string; start: number; header: number; end: number };

// Pudełka (box) między `from` a `to`. Rozmiar 1 = 64-bitowy, 0 = do końca rodzica.
function boxes(io: ByteIO, from: number, to: number): Box[] {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    const h = io.read(at, 16);
    let size = u32(h, 0);
    let header = 8;
    if (size === 1) { size = u32(h, 8) * 2 ** 32 + u32(h, 12); header = 16; } else if (size === 0) size = to - at;
    if (size < header || at + size > to) break; // uszkodzony plik – nie zgadujemy
    out.push({ type: type4(h, 4), start: at, header, end: at + size });
    at += size;
  }
  return out;
}

const child = (io: ByteIO, parent: Box, type: string) => boxes(io, parent.start + parent.header, parent.end).find((b) => b.type === type);

// Offset macierzy 3×3 w tkhd ścieżki wideo albo null. tkhd v0: 4 (wersja/flagi) + 20 (czasy, id, zarezerwowane, czas trwania)
// + 8 + 8 (warstwa, grupa, głośność, zarezerwowane); v1 ma 12 bajtów więcej (64-bitowe czasy i czas trwania).
export function videoMatrixOffset(io: ByteIO): number | null {
  const moov = boxes(io, 0, io.size).find((b) => b.type === 'moov');
  if (!moov) return null;
  for (const trak of boxes(io, moov.start + moov.header, moov.end).filter((b) => b.type === 'trak')) {
    const mdia = child(io, trak, 'mdia');
    const hdlr = mdia && child(io, mdia, 'hdlr');
    if (!hdlr || type4(io.read(hdlr.start + hdlr.header + 8, 4), 0) !== 'vide') continue;
    const tkhd = child(io, trak, 'tkhd');
    if (!tkhd) return null;
    const version = io.read(tkhd.start + tkhd.header, 1)[0];
    return tkhd.start + tkhd.header + 4 + (version === 1 ? 32 : 20) + 16;
  }
  return null;
}

const ONE = 0x00010000, MINUS_ONE = 0xffff0000, W_ONE = 0x40000000;
// Macierze jak w MPEG4Writer (MediaMuxer.setOrientationHint): a b u / c d v / x y w.
const MATRICES: Record<Rotation, number[]> = {
  0: [ONE, 0, 0, 0, ONE, 0, 0, 0, W_ONE],
  90: [0, ONE, 0, MINUS_ONE, 0, 0, 0, 0, W_ONE],
  180: [MINUS_ONE, 0, 0, 0, MINUS_ONE, 0, 0, 0, W_ONE],
  270: [0, MINUS_ONE, 0, ONE, 0, 0, 0, 0, W_ONE],
};

export function matrixBytes(r: Rotation): Uint8Array {
  const out = new Uint8Array(36);
  MATRICES[r].forEach((v, i) => { out[i * 4] = (v >>> 24) & 0xff; out[i * 4 + 1] = (v >>> 16) & 0xff; out[i * 4 + 2] = (v >>> 8) & 0xff; out[i * 4 + 3] = v & 0xff; });
  return out;
}

export function readRotation(m: Uint8Array): Rotation | null {
  const a = u32(m, 0), b = u32(m, 4);
  if (a === ONE && b === 0) return 0;
  if (a === 0 && b === ONE) return 90;
  if (a === MINUS_ONE && b === 0) return 180;
  if (a === 0 && b === MINUS_ONE) return 270;
  return null;
}

// Jaki obrót powinien mieć plik, gdy telefon był w poziomie (`ui` z uiRotation: 90 = góra telefonu po lewej = Surface.ROTATION_90).
// Plik nagrany „jak w pionie” ma obrót = orientacja matrycy (zwykle 90); poprawny to (matryca − obrót urządzenia) mod 360.
// null = nic nie zmieniamy: telefon w pionie albo plik już ma obrót poziomy (CameraX zrobił to sam).
export function correctedRotation(fileRotation: Rotation, ui: 0 | 90 | -90): Rotation | null {
  if (ui === 0 || fileRotation === 0 || fileRotation === 180) return null;
  const device = ui === 90 ? 90 : 270;
  return (((fileRotation - device) % 360 + 360) % 360) as Rotation;
}

// Poprawia obrót w pliku; zwraca nowy obrót albo null, gdy nic nie zmieniono.
export function fixRotation(io: ByteIO, ui: 0 | 90 | -90): { from: Rotation; to: Rotation } | null {
  const at = videoMatrixOffset(io);
  if (at == null) return null;
  const from = readRotation(io.read(at, 36));
  if (from == null) return null;
  const to = correctedRotation(from, ui);
  if (to == null || to === from) return null;
  io.write(at, matrixBytes(to));
  return { from, to };
}
