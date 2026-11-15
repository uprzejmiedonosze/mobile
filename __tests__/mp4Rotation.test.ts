import { readFileSync } from 'fs';
import { join } from 'path';
import { correctedRotation, fixRotation, matrixBytes, readRotation, videoMatrixOffset, type ByteIO } from '../src/lib/mp4Rotation';

// rotated90.mp4: 1 s, 64×36, H.264 + AAC, moov na końcu (jak z MediaMuxer), obrót 90° (ffmpeg -display_rotation -90).
const fixture = () => new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'rotated90.mp4')));
const io = (buf: Uint8Array): ByteIO => ({
  size: buf.length,
  read: (o, n) => buf.slice(o, o + n),
  write: (o, bytes) => buf.set(bytes, o),
});

describe('obrót nagrania w MP4', () => {
  test('czyta obrót ścieżki wideo (nie audio)', () => {
    const buf = fixture();
    const at = videoMatrixOffset(io(buf))!;
    expect(at).not.toBeNull();
    expect(readRotation(buf.slice(at, at + 36))).toBe(90);
  });

  test('telefon w poziomie, góra po lewej → 0°; po prawej → 180°', () => {
    for (const [ui, want] of [[90, 0], [-90, 180]] as const) {
      const buf = fixture();
      const before = buf.length;
      expect(fixRotation(io(buf), ui)).toEqual({ from: 90, to: want });
      const at = videoMatrixOffset(io(buf))!;
      expect(readRotation(buf.slice(at, at + 36))).toBe(want);
      expect(buf.length).toBe(before);
    }
  });

  test('w pionie albo gdy obrót już poziomy – bez zmian', () => {
    const buf = fixture();
    expect(fixRotation(io(buf), 0)).toBeNull();
    expect(correctedRotation(0, 90)).toBeNull();
    expect(correctedRotation(180, -90)).toBeNull();
    expect(correctedRotation(270, 90)).toBe(180); // matryca 270° (rzadkie telefony)
  });

  test('macierze odwracalne, śmieci → null', () => {
    for (const r of [0, 90, 180, 270] as const) expect(readRotation(matrixBytes(r))).toBe(r);
    expect(readRotation(new Uint8Array(36).fill(7))).toBeNull();
    expect(videoMatrixOffset(io(new Uint8Array(64)))).toBeNull();
  });
});
