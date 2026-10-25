// eslint-disable-next-line @typescript-eslint/no-var-requires
const { changelogSection, fitNotes, checkSummary, summarize, releaseName, updateTrack, parseArgs, PLAY_NOTES_LIMIT } = require('../scripts/play-notes');

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

  it('streszczenie LLM tylko dla sekcji, która się nie mieści; za długie ponawia, potem obcina', () => {
    const ask = jest.fn();
    expect(summarize('- A.\n- B.', { ask })).toBe('• A.\n• B.');
    expect(ask).not.toHaveBeenCalled();

    const long = Array.from({ length: 10 }, (_, i) => `- Zmiana ${i} ${'x'.repeat(80)}.`).join('\n');
    const warn = jest.fn();
    ask.mockReturnValueOnce('y'.repeat(600)).mockReturnValueOnce('```\n• Krótko.\n```\n');
    expect(summarize(long, { ask, warn })).toBe('• Krótko.');
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][0]).toContain('600 znaków');

    ask.mockReset().mockReturnValue('');
    expect(summarize(long, { ask, warn, attempts: 2 })).toBe(fitNotes(long));
    ask.mockReset().mockImplementation(() => { throw new Error('brak claude'); });
    expect(summarize(long, { ask, warn })).toBe(fitNotes(long));
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('checkSummary: limit Play i puste', () => {
    expect(checkSummary('  • A.\n')).toBe('• A.');
    expect(checkSummary('')).toBeNull();
    expect(checkSummary('x'.repeat(PLAY_NOTES_LIMIT + 1))).toBeNull();
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
    const bare = updateTrack(track, { ...upd, notes: '', complete: false });
    expect(bare.releases[1]).toEqual({ versionCodes: ['3'], status: 'draft', name: '1.0.0 (3) staging' });
  });

  it('argumenty', () => {
    expect(parseArgs(['--track', 'beta', '--version-code', '4'])).toMatchObject({ track: 'beta', code: 4, staging: false, complete: false });
    expect(parseArgs(['--summarize', '--staging', '--write'])).toMatchObject({ summarize: true, staging: true, write: true });
    expect(parseArgs(['--notes-file', 'n.txt']).notesFile).toBe('n.txt');
    expect(() => parseArgs(['--foo'])).toThrow(/Nieznany/);
  });
});
