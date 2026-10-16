#!/usr/bin/env node
// Nazwa wydania i „Co nowego” w Google Play z CHANGELOG.md – EAS Submit tego nie ustawia (docs/RELEASE.md).
//   node scripts/play-notes.js --track internal --staging [--version-code N] [--complete]
//   node scripts/play-notes.js --track beta [--version-code N]
// Nazwa: „X.Y.Z (versionCode)” albo „X.Y.Z (versionCode) staging”. Notatki: sekcja `## vX.Y.Z` (wydanie) albo
// `## RELEASE-CANDIDATE` (staging), przycięte do limitu Play (500 znaków na język). Bez --version-code: najwyższy
// versionCode na torze. --complete: szkic → wydany testerom (status completed).
// Klucz konta usługi: plik z $PLAY_SERVICE_ACCOUNT_JSON (w EAS: zmienna typu file) albo pierwszy service account
// w secrets/ (katalog w .gitignore). Tylko wbudowane moduły Node – działa lokalnie i w jobie EAS Workflow.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PACKAGE = 'net.uprzejmiedonosze.pro';
const PLAY_NOTES_LIMIT = 500;
const MORE = '…i więcej zmian.';

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
  const a = { track: 'internal', staging: false, complete: false, lang: 'pl-PL', code: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--track') a.track = argv[++i];
    else if (k === '--staging') a.staging = true;
    else if (k === '--complete') a.complete = true;
    else if (k === '--lang') a.lang = argv[++i];
    else if (k === '--version-code') a.code = Number(argv[++i]);
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
  const notes = fitNotes(changelogSection(md, args.staging ? 'RELEASE-CANDIDATE' : `v${version}`));
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

module.exports = { changelogSection, fitNotes, releaseName, updateTrack, parseArgs, PLAY_NOTES_LIMIT };

if (require.main === module) {
  main().catch((e) => {
    console.error(`play-notes: ${e.message}`);
    process.exit(1);
  });
}
