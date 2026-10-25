// scripts/bump-version.sh + scripts/apply-version.sh na tymczasowym repo git (bez sieci, bez dotykania prawdziwego repo).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
let dir: string;

const sh = (cmd: string, ...args: string[]) => execFileSync(cmd, args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const git = (...args: string[]) => sh('git', ...args);
const bump = (type: string) => sh('bash', 'scripts/bump-version.sh', type);
const read = (f: string) => readFileSync(join(dir, f), 'utf8');

function release(type: string): string {
  const v = bump(type);
  sh('bash', 'scripts/apply-version.sh', v);
  git('tag', '-a', `v${v}`, '-m', `release v${v}`);
  return v;
}

function writeRc(text: string) {
  const rest = read('CHANGELOG.md').split('\n').slice(1).join('\n');
  writeFileSync(join(dir, 'CHANGELOG.md'), `## RELEASE-CANDIDATE\n\n${text}\n${rest}`);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ud-bump-'));
  cpSync(join(ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'VERSION'), '1.0.0\n');
  writeFileSync(join(dir, 'CHANGELOG.md'), '## RELEASE-CANDIDATE\n\n- Pierwsze wydanie.\n');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '0.0.1' }, null, 2) + '\n');
  writeFileSync(join(dir, 'app.json'), JSON.stringify({ expo: { name: 'x', version: '0.0.1' } }, null, 2) + '\n');
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('bump-version.sh', () => {
  test('brak tagów: pierwsze wydanie = VERSION, niezależnie od typu', () => {
    expect(bump('patch')).toBe('1.0.0');
    expect(bump('major')).toBe('1.0.0');
  });

  test('patch / minor / major liczone od ostatniego tagu (numerycznie: 1.10.0 > 1.9.0)', () => {
    release('patch'); // 1.0.0
    writeRc('- Poprawka.');
    expect(bump('patch')).toBe('1.0.1');
    expect(bump('minor')).toBe('1.1.0');
    expect(bump('major')).toBe('2.0.0');
    git('tag', 'v1.9.0');
    git('tag', 'v1.10.0');
    writeFileSync(join(dir, 'VERSION'), '1.10.0\n');
    expect(bump('patch')).toBe('1.10.1');
  });

  test('VERSION zmieniony ręcznie po ostatnim tagu jest brany dosłownie', () => {
    release('patch');
    writeRc('- Duża zmiana.');
    writeFileSync(join(dir, 'VERSION'), '3.0.0\n');
    expect(bump('patch')).toBe('3.0.0');
  });

  test('wymaga jawnego typu', () => {
    expect(() => bump('')).toThrow();
    expect(() => bump('huge')).toThrow();
  });

  test('pusta sekcja RELEASE-CANDIDATE blokuje wydanie', () => {
    release('patch');
    expect(() => bump('patch')).toThrow(/pusta sekcja/);
  });
});

describe('apply-version.sh', () => {
  test('zapisuje wersję wszędzie, rotuje CHANGELOG i commituje', () => {
    const v = release('patch');
    expect(v).toBe('1.0.0');
    expect(read('VERSION').trim()).toBe('1.0.0');
    expect(JSON.parse(read('package.json')).version).toBe('1.0.0');
    expect(JSON.parse(read('app.json')).expo.version).toBe('1.0.0');
    expect(read('CHANGELOG.md')).toMatch(/^## RELEASE-CANDIDATE\n\n## v1\.0\.0 — \d{4}-\d{2}-\d{2}\n\n- Pierwsze wydanie\./);
    expect(git('log', '-1', '--format=%s')).toBe('chore: release v1.0.0');
    // Krótka sekcja mieści się w limicie Play – punkty bez LLM, plik w commicie wydania.
    expect(read('play-notes/v1.0.0.txt')).toBe('• Pierwsze wydanie.\n');
    expect(git('show', '--name-only', '--format=', 'HEAD')).toContain('play-notes/v1.0.0.txt');
  });

  test('kolejne wydanie dopisuje sekcję nad poprzednią', () => {
    release('patch');
    writeRc('- Nowa funkcja.');
    expect(release('minor')).toBe('1.1.0');
    const log = read('CHANGELOG.md');
    expect(log.indexOf('## v1.1.0')).toBeLessThan(log.indexOf('## v1.0.0'));
  });

  test('wznowienie przerwanego wydania nic nie zmienia i nie robi drugiego commita', () => {
    const v = bump('patch');
    sh('bash', 'scripts/apply-version.sh', v);
    const head = git('rev-parse', 'HEAD');
    expect(bump('patch')).toBe(v); // VERSION != ostatni tag (brak tagu) → ta sama wersja
    sh('bash', 'scripts/apply-version.sh', v);
    expect(git('rev-parse', 'HEAD')).toBe(head);
  });

  test('odrzuca złą wersję', () => {
    expect(() => sh('bash', 'scripts/apply-version.sh', '1.0')).toThrow();
  });
});

describe('spójność wersji w repo', () => {
  test('VERSION = package.json = app.json', () => {
    const v = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    expect(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version).toBe(v);
    expect(JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo.version).toBe(v);
  });
});
