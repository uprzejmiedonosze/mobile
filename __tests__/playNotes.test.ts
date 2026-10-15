// eslint-disable-next-line @typescript-eslint/no-var-requires
const { changelogSection, fitNotes, releaseName, updateTrack, parseArgs, PLAY_NOTES_LIMIT } = require('../scripts/play-notes');

const MD = `## RELEASE-CANDIDATE

- Pierwsza zmiana.
- Druga zmiana.

## v1.0.0 — 2026-10-12

- Pierwsze wydanie.
`;

describe('play-notes', () => {
  it('wycina sekcję CHANGELOG-a – RC i wydanie z datą w nagłówku', () => {
    expect(changelogSection(MD, 'RELEASE-CANDIDATE')).toBe('- Pierwsza zmiana.\n- Druga zmiana.');
    expect(changelogSection(MD, 'v1.0.0')).toBe('- Pierwsze wydanie.');
    expect(changelogSection(MD, 'v9.9.9')).toBe('');
  });

  it('notatki mieszczą się w limicie Play, a odcięte punkty sygnalizuje dopisek', () => {
    expect(fitNotes('- A.\n- B.')).toBe('• A.\n• B.');
    const long = Array.from({ length: 10 }, (_, i) => `- Zmiana ${i} ${'x'.repeat(80)}.`).join('\n');
    const notes = fitNotes(long);
    expect(notes.length).toBeLessThanOrEqual(PLAY_NOTES_LIMIT);
    expect(notes.endsWith('…i więcej zmian.')).toBe(true);
  });

  it('nazwa wydania: wersja, versionCode i dopisek staging', () => {
    expect(releaseName('1.0.0', 3, true)).toBe('1.0.0 (3) staging');
    expect(releaseName('1.1.0', 7, false)).toBe('1.1.0 (7)');
  });

  it('aktualizuje tylko wskazane wydanie; --complete zostawia samo wydane', () => {
    const track = { track: 'internal', releases: [{ versionCodes: ['2'], status: 'completed' }, { versionCodes: ['3'], status: 'draft' }] };
    const upd = { code: 3, name: '1.0.0 (3) staging', notes: '• A.', lang: 'pl-PL' };
    const draft = updateTrack(track, { ...upd, complete: false });
    expect(draft.releases).toHaveLength(2);
    expect(draft.releases[1]).toEqual({ versionCodes: ['3'], status: 'draft', name: '1.0.0 (3) staging', releaseNotes: [{ language: 'pl-PL', text: '• A.' }] });
    const done = updateTrack(track, { ...upd, complete: true });
    expect(done.releases).toEqual([{ ...draft.releases[1], status: 'completed' }]);
    expect(() => updateTrack(track, { ...upd, code: 9, complete: false })).toThrow(/versionCode 9/);
  });

  it('argumenty', () => {
    expect(parseArgs(['--track', 'beta', '--version-code', '4'])).toMatchObject({ track: 'beta', code: 4, staging: false, complete: false });
    expect(() => parseArgs(['--foo'])).toThrow(/Nieznany/);
  });
});
