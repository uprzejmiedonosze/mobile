#!/usr/bin/env node
// Nazwa wydania i „Co nowego” w Google Play z CHANGELOG.md – EAS Submit tego nie ustawia (docs/RELEASE.md).
//   node scripts/play-notes.js --track internal --staging [--version-code N] [--complete]
//   node scripts/play-notes.js --track beta [--version-code N] [--notes-file F]
//   node scripts/play-notes.js --summarize [--staging] [--write]
// Nazwa: „X.Y.Z (versionCode)” albo „X.Y.Z (versionCode) staging”. Notatki: sekcja `## vX.Y.Z` (wydanie) albo
// `## RELEASE-CANDIDATE` (staging), w limicie Play (500 znaków na język). Gdy sekcja się nie mieści, streszcza ją LLM
// (`claude -p`, tylko lokalnie – na runnerze nie ma CLI): --summarize wypisuje streszczenie, --write zapisuje je
// w play-notes/vX.Y.Z.txt (apply-version.sh przy wydaniu, plik idzie do commita z tagiem). Wysyłka do Play bierze
// --notes-file, potem play-notes/vX.Y.Z.txt, a bez nich obcina punkty (fitNotes). Bez --version-code: najwyższy
// versionCode na torze. --complete: szkic → wydany testerom (status completed).
// Klucz konta usługi: plik z $PLAY_SERVICE_ACCOUNT_JSON (w EAS: zmienna typu file) albo pierwszy service account
// w secrets/ (katalog w .gitignore). Tylko wbudowane moduły Node – działa lokalnie i w GitHub Actions.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PACKAGE = 'net.uprzejmiedonosze.pro';
const PLAY_NOTES_LIMIT = 500;
const MORE = '…i więcej zmian.';
const NOTES_DIR = path.join(ROOT, 'play-notes');
// Cel dla LLM poniżej limitu – model liczy znaki niedokładnie, twardy limit sprawdza checkSummary.
const SUMMARY_TARGET = 400;
const SUMMARY_PROMPT = `Piszesz tekst „Co nowego” dla aplikacji Uprzejmie Donoszę PRO w Google Play.
Na wejściu dostajesz listę zmian z CHANGELOG-a (po polsku, dla użytkownika). Streść ją po polsku, dla użytkownika:
- najwyżej ${SUMMARY_TARGET} znaków łącznie (liczą się spacje i nowe linie), to twardy limit;
- 3–6 punktów, każdy w osobnej linii zaczynającej się od „• ”, krótko i konkretnie;
- najważniejsze zmiany pierwsze; drobne poprawki możesz połączyć w jeden punkt, ale nie pomijaj istotnych;
- nie wymyślaj niczego, czego nie ma na wejściu; bez markdownu, bez wstępu i zakończenia – tylko punkty.`;

// Treść sekcji `## <heading>` (do następnego `## `), bez pustych linii na brzegach.
function changelogSection(md, heading) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l === `## ${heading}` || l.startsWith(`## ${heading} `));
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
}

// Punkty listy po kolei, dopóki mieszczą się w limicie; gdy coś odpadło – dopisek MORE (też w limicie).
function fitNotes(section, limit = PLAY_NOTES_LIMIT) {
  const items = section.split('\n').filter((l) => l.startsWith('- ')).map((l) => `• ${l.slice(2).trim()}`);
  const out = [];
  for (const item of items) {
    const next = [...out, item].join('\n');
    const room = out.length + 1 < items.length ? limit - MORE.length - 1 : limit;
    if (next.length > room) break;
    out.push(item);
  }
  if (out.length < items.length) out.push(MORE);
  return out.join('\n');
}

// Odpowiedź LLM → notatki albo null, gdy nie nadaje się do Play (pusta, za długa).
function checkSummary(text, limit = PLAY_NOTES_LIMIT) {
  const t = String(text || '').trim().replace(/^```[^\n]*\n?|\n?```$/g, '').trim();
  return t && t.length <= limit ? t : null;
}

// Notatki do Play z sekcji: mieszczą się w całości → punkty bez zmian; inaczej streszczenie LLM (`ask` = wywołanie
// modelu, w testach podmieniane; kolejna próba dostaje poprzednią, za długą wersję do skrócenia), a gdy się nie uda –
// obcięte punkty z ostrzeżeniem.
function summarize(section, { ask = askClaude, attempts = 3, warn = (m) => console.error(m) } = {}) {
  const fitted = fitNotes(section);
  if (!fitted.endsWith(MORE)) return fitted;
  let out = null;
  for (let i = 1; i <= attempts; i++) {
    const prev = String(out || '').trim();
    const input = prev
      ? `${section}\n\nPoprzednia wersja ma ${prev.length} znaków – za dużo. Skróć ją do najwyżej ${SUMMARY_TARGET} znaków:\n${prev}`
      : section;
    try {
      out = ask(input);
    } catch (e) {
      warn(`play-notes: claude: ${e.message}`);
      break;
    }
    const ok = checkSummary(out);
    if (ok) return ok;
    warn(`play-notes: streszczenie ${i}/${attempts} odrzucone (${String(out || '').trim().length} zn., limit ${PLAY_NOTES_LIMIT}).`);
  }
  warn('play-notes: !! brak streszczenia LLM – obcięte punkty (fitNotes).');
  return fitted;
}

function askClaude(section) {
  const res = spawnSync('claude', ['-p', '--model', 'sonnet', '--tools', '', '--setting-sources', '', '--no-session-persistence',
    '--system-prompt', SUMMARY_PROMPT, 'Lista zmian jest na wejściu (stdin).'],
    { input: section, encoding: 'utf8', cwd: os.tmpdir(), timeout: 180_000 });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`kod ${res.status}: ${(res.stderr || res.stdout || '').trim().slice(0, 200)}`);
  return res.stdout;
}

const notesFile = (heading) => path.join(NOTES_DIR, `${heading}.txt`);

const releaseName = (version, code, staging) => `${version} (${code})${staging ? ' staging' : ''}`;

// Track z API → track do zapisu: wybrane wydanie z nową nazwą/notatkami. Przy --complete zostaje tylko ono
// (na torze może być jedno wydanie „completed”; poprzednie Play i tak zastępuje), inaczej reszta bez zmian.
// Puste notatki (staging bez wpisów w RELEASE-CANDIDATE) – tylko nazwa, „Co nowego” zostaje, jakie było.
function updateTrack(track, { code, name, notes, lang, complete }) {
  const hit = (r) => (r.versionCodes || []).map(String).includes(String(code));
  const release = (track.releases || []).find(hit);
  if (!release) throw new Error(`Na torze ${track.track} nie ma wydania z versionCode ${code}.`);
  const updated = { ...release, name, ...(notes ? { releaseNotes: [{ language: lang, text: notes }] } : {}), ...(complete ? { status: 'completed' } : {}) };
  return { track: track.track, releases: complete ? [updated] : track.releases.map((r) => (hit(r) ? updated : r)) };
}

function parseArgs(argv) {
  const a = { track: 'internal', staging: false, complete: false, lang: 'pl-PL', code: null, summarize: false, write: false, notesFile: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--track') a.track = argv[++i];
    else if (k === '--staging') a.staging = true;
    else if (k === '--complete') a.complete = true;
    else if (k === '--lang') a.lang = argv[++i];
    else if (k === '--version-code') a.code = Number(argv[++i]);
    else if (k === '--notes-file') a.notesFile = argv[++i];
    else if (k === '--summarize') a.summarize = true;
    else if (k === '--write') a.write = true;
    else throw new Error(`Nieznany argument: ${k}`);
  }
  return a;
}

function loadKey() {
  const env = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  if (env) return JSON.parse(fs.readFileSync(env, 'utf8'));
  const dir = path.join(ROOT, 'secrets');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (j.type === 'service_account') return j;
    } catch { /* nie JSON – pomijamy */ }
  }
  throw new Error('Brak klucza konta usługi: ustaw PLAY_SERVICE_ACCOUNT_JSON albo wrzuć JSON do secrets/.');
}

async function accessToken(key) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: key.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: key.token_uri, iat: now, exp: now + 600 };
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url');
  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Token Google: HTTP ${res.status} ${j.error_description || j.error || ''}`);
  return j.access_token;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const md = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const heading = args.staging ? 'RELEASE-CANDIDATE' : `v${version}`;
  const section = changelogSection(md, heading);

  if (args.summarize) {
    // Staging zaraz po wydaniu (pusty RELEASE-CANDIDATE) – nic do streszczenia, Play zostawia poprzednie „Co nowego”.
    if (!section && args.staging) return;
    if (!section) throw new Error(`Pusta sekcja CHANGELOG-a (${heading}).`);
    const text = summarize(section);
    if (args.write) {
      fs.mkdirSync(NOTES_DIR, { recursive: true });
      fs.writeFileSync(notesFile(heading), `${text}\n`);
      console.error(`==> ${path.relative(ROOT, notesFile(heading))} (${text.length} zn.):\n${text}`);
    } else {
      console.log(text);
    }
    return;
  }

  const file = args.notesFile || (fs.existsSync(notesFile(heading)) ? notesFile(heading) : null);
  const fromFile = file ? checkSummary(fs.readFileSync(file, 'utf8')) : null;
  if (file && !fromFile) throw new Error(`${file}: puste albo dłuższe niż ${PLAY_NOTES_LIMIT} znaków.`);
  const notes = fromFile || fitNotes(section);
  // Wydanie bez notatek to błąd (i tak blokuje je make release-*); staging zaraz po wydaniu ma pusty RELEASE-CANDIDATE.
  if (!notes && !args.staging) throw new Error(`Pusta sekcja CHANGELOG-a (v${version}).`);

  const token = await accessToken(loadKey());
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/edits`;
  const call = async (method, url, body) => {
    const res = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${url.replace(base, 'edits')}: HTTP ${res.status} ${j.error?.message || ''}`);
    return j;
  };

  const edit = await call('POST', base);
  const track = await call('GET', `${base}/${edit.id}/tracks/${args.track}`);
  const code = args.code ?? Math.max(...(track.releases || []).flatMap((r) => (r.versionCodes || []).map(Number)));
  if (!Number.isFinite(code)) throw new Error(`Tor ${args.track} nie ma żadnego wydania.`);
  const name = releaseName(version, code, args.staging);
  await call('PUT', `${base}/${edit.id}/tracks/${args.track}`, updateTrack(track, { code, name, notes, lang: args.lang, complete: args.complete }));
  await call('POST', `${base}/${edit.id}:commit`);
  console.log(`==> Play ${args.track}: „${name}”${args.complete ? ', wydane testerom' : ''}; ` +
    (notes ? `Co nowego (${notes.length} zn.):\n${notes}` : 'bez „Co nowego” (pusty RELEASE-CANDIDATE).'));
}

module.exports = { changelogSection, fitNotes, checkSummary, summarize, releaseName, updateTrack, parseArgs, PLAY_NOTES_LIMIT };

if (require.main === module) {
  main().catch((e) => {
    console.error(`play-notes: ${e.message}`);
    process.exit(1);
  });
}
