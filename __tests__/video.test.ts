jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import {
  availableCategories, clampFrameTime, exifTime, fmtMB, framePhoto, MAX_PHOTOS, MAX_PHOTOS_WITH_VIDEO, MAX_VIDEO_BYTES, maxPhotos,
  requiresVideo, VIDEO_BITRATE, VIDEO_MAX_DURATION_S, VIDEO_RECORD_MAX_BYTES, videoTooLarge,
} from '../src/lib/video';
import { exifToIso } from '../src/lib/reports';
import type { Category } from '../src/types';

const cat = (c: Partial<Category> & { id: number }): Category => ({ title: `kat. ${c.id}`, ...c });
const CATS: Category[] = [
  cat({ id: 5, groups: [0, 1] }),
  cat({ id: 28, groups: [6], stopAgresjiOnly: true }),
  cat({ id: 31, groups: [6], requiresVideo: true }),
  cat({ id: 32, groups: [6], requiresVideo: true }),
];

describe('kategorie z filmem', () => {
  it('requiresVideo po id (liczba albo tekst)', () => {
    expect(requiresVideo(CATS, '31')).toBe(true);
    expect(requiresVideo(CATS, 32)).toBe(true);
    expect(requiresVideo(CATS, 28)).toBe(false);
    expect(requiresVideo(CATS, undefined)).toBe(false);
  });

  it('bez filmu (iOS) hałas i drift znikają z listy, reszta zostaje', () => {
    expect(availableCategories(CATS, true).map((c) => c.id)).toEqual([5, 28, 31, 32]);
    expect(availableCategories(CATS, false).map((c) => c.id)).toEqual([5, 28]);
  });
});

describe('limit zdjęć', () => {
  it('z filmem najwyżej dwa zdjęcia (serwer odrzuca film + trzecie)', () => {
    expect(maxPhotos(false)).toBe(MAX_PHOTOS);
    expect(maxPhotos(true)).toBe(MAX_PHOTOS_WITH_VIDEO);
    expect(MAX_PHOTOS).toBe(3);
    expect(MAX_PHOTOS_WITH_VIDEO).toBe(2);
  });
});

describe('limity nagrania', () => {
  it('nagrywanie mieści się w limicie serwera (15 MB) z zapasem', () => {
    expect(MAX_VIDEO_BYTES).toBe(15 * 1024 * 1024);
    expect(VIDEO_RECORD_MAX_BYTES).toBeLessThan(MAX_VIDEO_BYTES);
    // sam obraz przy maksymalnej długości + ~128 kb/s dźwięku
    const estimated = ((VIDEO_BITRATE + 128_000) / 8) * VIDEO_MAX_DURATION_S;
    expect(estimated).toBeLessThan(VIDEO_RECORD_MAX_BYTES);
  });

  it('videoTooLarge i fmtMB', () => {
    expect(videoTooLarge(MAX_VIDEO_BYTES)).toBe(false);
    expect(videoTooLarge(MAX_VIDEO_BYTES + 1)).toBe(true);
    expect(videoTooLarge(null)).toBe(false);
    expect(fmtMB(12.5 * 1024 * 1024)).toBe('12,5 MB');
  });
});

describe('klatka z filmu', () => {
  test('clampFrameTime: w granicach filmu', () => {
    expect(clampFrameTime(-0.1, 10)).toBe(0);
    expect(clampFrameTime(10.3, 10)).toBe(10);
    expect(clampFrameTime(4.2, 10)).toBe(4.2);
    expect(clampFrameTime(3, 0)).toBe(3); // czas trwania jeszcze nieznany
  });

  test('framePhoto: data = start nagrania + położenie klatki, GPS z nagrania', () => {
    const start = new Date(2026, 10, 17, 21, 59, 58).getTime();
    const p = framePhoto('file:///klatka.jpg', 3.4, { takenAtMs: start, lat: 52.1, lng: 21.2 }, { width: 1280, height: 720 });
    expect(p.uri).toBe('file:///klatka.jpg');
    expect(p.id.startsWith('frame-')).toBe(true);
    expect(p.exif).toMatchObject({ datetimeOriginal: '2026:11:17 22:00:01', lat: 52.1, lng: 21.2, hasGps: true, width: 1280, height: 720 });
    // ten sam format co EXIF zdjęć z galerii – formularz bierze z niego datę
    expect(exifToIso(p.exif.datetimeOriginal)).toBe('2026-11-17T22:00:01');
  });

  test('framePhoto bez metadanych nagrania: bez daty i GPS (formularz poprosi o nie)', () => {
    const p = framePhoto('file:///k.jpg', 1, {});
    expect(p.exif).toMatchObject({ datetimeOriginal: null, lat: null, lng: null, hasGps: false });
  });

  test('exifTime: czas lokalny z zerami', () => {
    expect(exifTime(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026:01:02 03:04:05');
  });
});

test('film: Android/iOS i backend ze schematem ≥ 11 (starszy nie ma nagłówka X-UD-Server-Schema)', () => {
  const { videoPlatform, videoSupported, VIDEO_SERVER_SCHEMA } = require('../src/lib/video');
  expect(videoPlatform).toBe(true); // jest-expo: domyślnie iOS
  expect(VIDEO_SERVER_SCHEMA).toBe(11);
  expect(videoSupported(11)).toBe(true);
  expect(videoSupported(12)).toBe(true);
  expect(videoSupported(10)).toBe(false);
  expect(videoSupported(null)).toBe(false);
  expect(videoSupported(11, false)).toBe(false); // platforma bez filmu (web)
});

test('parseServerSchema: tylko liczba z nagłówka', () => {
  const { parseServerSchema, API_SCHEMA } = require('../src/lib/apiSchema');
  expect(parseServerSchema('11')).toBe(11);
  expect(parseServerSchema(' 12 ')).toBe(12);
  expect(parseServerSchema(null)).toBeNull();
  expect(parseServerSchema('')).toBeNull();
  expect(parseServerSchema('11a')).toBeNull();
  expect(API_SCHEMA).toBeGreaterThanOrEqual(11);
});
