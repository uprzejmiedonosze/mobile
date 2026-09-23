#!/usr/bin/env tsx
// Krok 2 planu, część 2: generuje samodzielną stronę HTML (bez serwera, bez build-stepu — otwórz
// bezpośrednio w przeglądarce jako plik) do ręcznej korekty ground truth. Wczytuje
// groundtruth.draft.json (albo istniejący tests/groundtruth.json, jeśli już zacząłeś poprawiać),
// pokazuje każde zdjęcie z nakładką boxów, pozwala rysować/poprawiać boxy przeciąganiem myszką,
// edytować rolę/markery/scenę/kategorię, i eksportuje wynik jako plik do zapisania ręcznie jako
// tests/groundtruth.json.
//
// Użycie: npx tsx gt-editor.ts

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { MARKERS, ROLES, SCENE_OBJECTS, SCENE_RELATIONS } from './schema.ts';
import { loadCategories } from './categories.ts';
import type { GroundTruth } from './groundtruth-types.ts';

const TESTS_DIR = path.resolve(import.meta.dirname, '..');
const DRAFT_PATH = path.join(TESTS_DIR, 'groundtruth.draft.json');
const FINAL_PATH = path.join(TESTS_DIR, 'groundtruth.json');
const MANIFEST_PATH = path.join(TESTS_DIR, '.cache/prep/manifest.json');
const OUT_PATH = path.join(TESTS_DIR, 'results/gt-editor.html');

async function main() {
  let gt: GroundTruth;
  try {
    gt = JSON.parse(await readFile(FINAL_PATH, 'utf8'));
    console.log(`gt-editor: wczytano istniejący ${FINAL_PATH} (kontynuacja edycji)`);
  } catch {
    gt = JSON.parse(await readFile(DRAFT_PATH, 'utf8'));
    console.log(`gt-editor: wczytano ${DRAFT_PATH} (pierwsza edycja — zapisz jako tests/groundtruth.json)`);
  }
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const categories = loadCategories();

  const photoMeta: Record<string, { thumbFile: string; w: number; h: number }> = {};
  for (const p of manifest.photos) photoMeta[p.photoId] = { thumbFile: p.thumbFile, w: p.thumbW, h: p.thumbH };

  const html = renderHtml({ gt, photoMeta, categories, candidates: manifest.candidates });
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, html);
  console.log(`gt-editor: zapisano ${OUT_PATH}`);
  console.log('Otwórz ten plik bezpośrednio w przeglądarce (file://), popraw, pobierz JSON, zapisz jako tests/groundtruth.json');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function renderHtml(args: {
  gt: GroundTruth;
  photoMeta: Record<string, { thumbFile: string; w: number; h: number }>;
  categories: { id: number; title: string; short: string }[];
  candidates: { reportId: string; photoIds: string[] }[];
}): string {
  const { gt, photoMeta, categories, candidates } = args;

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>GT editor — UD Pro vision eval</title>
<style>
  :root { --bg:#0f1115; --panel:#181b22; --border:#2a2f3a; --text:#e6e8eb; --muted:#8b93a1; --accent:#4da3ff; --green:#3ddc84; --red:#ff5a5a; --orange:#ffb454; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:13px/1.4 -apple-system,system-ui,sans-serif; }
  #app { display:flex; height:100vh; }
  #sidebar { width:260px; overflow-y:auto; border-right:1px solid var(--border); background:var(--panel); flex-shrink:0; }
  #sidebar h2 { font-size:12px; text-transform:uppercase; color:var(--muted); padding:10px 12px 4px; margin:0; }
  .cand { border-bottom:1px solid var(--border); }
  .cand-head { padding:8px 12px; font-weight:600; cursor:pointer; display:flex; justify-content:space-between; }
  .cand-head:hover { background:#20242c; }
  .photo-row { padding:6px 12px 6px 22px; cursor:pointer; color:var(--muted); font-size:12px; display:flex; align-items:center; gap:6px; }
  .photo-row:hover, .photo-row.active { background:#20242c; color:var(--text); }
  .dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
  .dot.unverified { background:var(--orange); }
  .dot.verified { background:var(--green); }
  #main { flex:1; overflow-y:auto; padding:16px 24px; }
  #canvasWrap { position:relative; display:inline-block; background:#000; }
  #photoImg { display:block; max-width:900px; width:100%; height:auto; }
  #overlay { position:absolute; top:0; left:0; width:100%; height:100%; cursor:crosshair; }
  .panel { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:12px 14px; margin-top:14px; }
  .panel h3 { margin:0 0 8px; font-size:12px; text-transform:uppercase; color:var(--muted); }
  .row { display:flex; gap:10px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
  label { color:var(--muted); font-size:12px; }
  input[type=text], input[type=number], select { background:#0f1115; border:1px solid var(--border); color:var(--text); border-radius:4px; padding:4px 6px; font-size:12px; }
  input[type=number] { width:64px; }
  .markers { display:flex; flex-wrap:wrap; gap:6px 12px; }
  .markers label { display:flex; align-items:center; gap:4px; color:var(--text); cursor:pointer; }
  .scene-row { display:flex; gap:6px; align-items:center; margin-bottom:6px; }
  .scene-row select, .scene-row input { flex-shrink:0; }
  button { background:#20242c; border:1px solid var(--border); color:var(--text); border-radius:4px; padding:5px 10px; cursor:pointer; font-size:12px; }
  button:hover { background:#2a2f3a; }
  button.primary { background:var(--accent); border-color:var(--accent); color:#001; font-weight:600; }
  .hint { color:var(--muted); font-size:11px; }
  .legend { display:flex; gap:14px; align-items:center; margin-bottom:8px; font-size:11px; color:var(--muted); }
  .swatch { display:inline-block; width:10px; height:10px; margin-right:4px; vertical-align:-1px; }
  #topbar { position:sticky; top:0; background:var(--bg); padding:10px 0; z-index:5; display:flex; gap:10px; align-items:center; border-bottom:1px solid var(--border); margin-bottom:10px; }
</style>
</head>
<body>
<div id="app">
  <div id="sidebar">
    <h2>Kandydaci</h2>
    <div id="candList"></div>
  </div>
  <div id="main">
    <div id="topbar">
      <button class="primary" id="downloadBtn">⬇ Pobierz groundtruth.json</button>
      <span class="hint">zapisz pobrany plik jako <code>tests/groundtruth.json</code> (nadpisując)</span>
      <span id="photoTitle" style="margin-left:auto;font-weight:600"></span>
    </div>
    <div id="editor"></div>
  </div>
</div>
<script>
const GT = ${JSON.stringify(gt)};
const PHOTO_META = ${JSON.stringify(photoMeta)};
const CANDIDATES = ${JSON.stringify(candidates)};
const CATEGORIES = ${JSON.stringify(categories)};
const MARKERS = ${JSON.stringify(MARKERS)};
const ROLES = ${JSON.stringify(ROLES)};
const SCENE_OBJECTS = ${JSON.stringify(SCENE_OBJECTS)};
const SCENE_RELATIONS = ${JSON.stringify(SCENE_RELATIONS)};
const THUMB_BASE = '../.cache/prep/';

let currentPhotoId = null;
let drag = null; // {kind:'car'|'plate', x1,y1,x2,y2, active}

function catOptions(selected) {
  return CATEGORIES.map(c => \`<option value="\${c.id}" \${c.id===selected?'selected':''}>\${c.id} — \${escapeHtml(c.title)}</option>\`).join('');
}
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function renderSidebar() {
  const el = document.getElementById('candList');
  el.innerHTML = CANDIDATES.map(c => {
    const cand = GT.candidates[c.reportId] || {};
    const rows = c.photoIds.map(pid => {
      const p = GT.photos[pid] || {};
      const dot = p.verified ? 'verified' : 'unverified';
      return \`<div class="photo-row" data-photo="\${pid}"><span class="dot \${dot}"></span>\${pid}</div>\`;
    }).join('');
    return \`<div class="cand">
      <div class="cand-head" data-cand="\${c.reportId}">\${c.reportId} <span class="hint">(\${c.photoIds.length})</span></div>
      \${rows}
    </div>\`;
  }).join('');
  el.querySelectorAll('.photo-row').forEach(row => row.addEventListener('click', () => selectPhoto(row.dataset.photo)));
}

function candidateOf(photoId) {
  return CANDIDATES.find(c => c.photoIds.includes(photoId));
}

function selectPhoto(photoId) {
  currentPhotoId = photoId;
  document.querySelectorAll('.photo-row').forEach(r => r.classList.toggle('active', r.dataset.photo === photoId));
  const cand = candidateOf(photoId);
  document.getElementById('photoTitle').textContent = photoId + (cand ? ' — kandydat ' + cand.reportId : '');
  renderEditor();
}

function boxToPx(box, w, h, dispW, dispH) {
  if (!box) return null;
  const sx = dispW / w, sy = dispH / h;
  return { x1: box[0]/1000*w*sx, y1: box[1]/1000*h*sy, x2: box[2]/1000*w*sx, y2: box[3]/1000*h*sy };
}

function renderEditor() {
  const p = GT.photos[currentPhotoId];
  const meta = PHOTO_META[currentPhotoId];
  if (!p || !meta) { document.getElementById('editor').innerHTML = '<p class="hint">Wybierz zdjęcie z listy po lewej.</p>'; return; }

  const sceneRows = (p.scene || []).map((s, i) => sceneRowHtml(s, i)).join('');

  document.getElementById('editor').innerHTML = \`
    <div class="legend">
      <span><span class="swatch" style="background:#3ddc84"></span>auto (car)</span>
      <span><span class="swatch" style="background:#ff5a5a"></span>tablica</span>
      <span class="hint">Rysuj box: przytrzymaj i przeciągnij myszką po zdjęciu, potem wybierz car/tablica w dialogu.</span>
    </div>
    <div id="canvasWrap">
      <img id="photoImg" src="\${THUMB_BASE}\${meta.thumbFile}">
      <svg id="overlay" viewBox="0 0 \${meta.w} \${meta.h}" preserveAspectRatio="none"></svg>
    </div>

    <div class="panel">
      <h3>Podstawowe</h3>
      <div class="row">
        <label>rola</label>
        <select id="f-role">\${ROLES.map(r => \`<option value="\${r}" \${r===p.role?'selected':''}>\${r}</option>\`).join('')}</select>
        <label>zweryfikowane</label>
        <input type="checkbox" id="f-verified" \${p.verified ? 'checked' : ''}>
      </div>
    </div>

    <div class="panel">
      <h3>Auto i tablica</h3>
      <div class="row">
        <label>auto obecne</label><input type="checkbox" id="f-car-present" \${p.car?.present ? 'checked' : ''}>
        <label>box auta [x1,y1,x2,y2]</label>
        <input type="number" id="f-car-x1" value="\${bv(p.car?.bbox,0)}"><input type="number" id="f-car-y1" value="\${bv(p.car?.bbox,1)}">
        <input type="number" id="f-car-x2" value="\${bv(p.car?.bbox,2)}"><input type="number" id="f-car-y2" value="\${bv(p.car?.bbox,3)}">
      </div>
      <div class="row">
        <label>tablica czytelna</label><input type="checkbox" id="f-plate-readable" \${p.plate?.readable ? 'checked' : ''}>
        <label>tekst</label><input type="text" id="f-plate-text" value="\${escapeHtml(p.plate?.text ?? '')}" style="width:110px">
        <label>box tablicy</label>
        <input type="number" id="f-plate-x1" value="\${bv(p.plate?.bbox,0)}"><input type="number" id="f-plate-y1" value="\${bv(p.plate?.bbox,1)}">
        <input type="number" id="f-plate-x2" value="\${bv(p.plate?.bbox,2)}"><input type="number" id="f-plate-y2" value="\${bv(p.plate?.bbox,3)}">
      </div>
    </div>

    <div class="panel">
      <h3>Markery (dla v0-v3)</h3>
      <div class="markers">\${MARKERS.map(m => \`<label><input type="checkbox" class="f-marker" value="\${m}" \${(p.markers||[]).includes(m)?'checked':''}>\${m}</label>\`).join('')}</div>
    </div>

    <div class="panel">
      <h3>Scena (dla v4/v5) <button id="addSceneBtn" style="float:right">+ dodaj</button></h3>
      <div id="sceneRows">\${sceneRows}</div>
    </div>

    <div class="panel">
      <h3>Kategoria tego zdjęcia</h3>
      <select id="f-category">\${catOptions(p.categoryId)}</select>
    </div>

    \${renderCandidatePanel()}
  \`;

  attachEditorListeners();
  renderOverlay();
}

function bv(box, i) { return box ? box[i] : ''; }

function renderCandidatePanel() {
  const cand = candidateOf(currentPhotoId);
  if (!cand) return '';
  const c = GT.candidates[cand.reportId] || {};
  return \`<div class="panel" style="border-color:var(--accent)">
    <h3>Zgłoszenie \${cand.reportId} (całość, nie pojedyncze zdjęcie)</h3>
    <div class="row">
      <label>oczekiwana tablica</label><input type="text" id="c-plate" value="\${escapeHtml(c.expectedPlate ?? '')}" style="width:110px">
      <label>oczekiwana kategoria</label><select id="c-category">\${catOptions(c.expectedCategoryId)}</select>
      <label>oczekiwany split (ile pod-zgłoszeń)</label><input type="number" id="c-split" value="\${c.expectedSplitCount ?? 1}" min="1" style="width:56px">
    </div>
  </div>\`;
}

function readCandidatePanel() {
  const cand = candidateOf(currentPhotoId);
  if (!cand) return;
  GT.candidates[cand.reportId] = {
    ...GT.candidates[cand.reportId],
    reportId: cand.reportId,
    photoIds: cand.photoIds,
    expectedPlate: document.getElementById('c-plate').value || null,
    expectedCategoryId: Number(document.getElementById('c-category').value),
    expectedSplitCount: Number(document.getElementById('c-split').value) || 1,
  };
}

function sceneRowHtml(s, i) {
  return \`<div class="scene-row" data-idx="\${i}">
    <select class="sc-object">\${SCENE_OBJECTS.map(o => \`<option value="\${o}" \${o===s.object?'selected':''}>\${o}</option>\`).join('')}</select>
    <select class="sc-relation">\${SCENE_RELATIONS.map(r => \`<option value="\${r}" \${r===s.relation?'selected':''}>\${r}</option>\`).join('')}</select>
    <label>dystans(m)</label><input type="number" class="sc-distance" value="\${s.distance_m}" step="0.5" style="width:56px">
    <label>pewność</label><input type="number" class="sc-confidence" value="\${s.confidence}" min="0" max="1" step="0.05" style="width:56px">
    <button class="sc-remove">✕</button>
  </div>\`;
}

function readCurrentPhoto() {
  const p = GT.photos[currentPhotoId];
  p.role = document.getElementById('f-role').value;
  p.verified = document.getElementById('f-verified').checked;
  p.car = {
    present: document.getElementById('f-car-present').checked,
    bbox: readBoxInputs('f-car'),
  };
  p.plate = {
    readable: document.getElementById('f-plate-readable').checked,
    text: document.getElementById('f-plate-text').value || null,
    bbox: readBoxInputs('f-plate'),
  };
  p.markers = [...document.querySelectorAll('.f-marker:checked')].map(el => el.value);
  p.scene = [...document.querySelectorAll('.scene-row')].map(row => ({
    object: row.querySelector('.sc-object').value,
    relation: row.querySelector('.sc-relation').value,
    distance_m: Number(row.querySelector('.sc-distance').value) || 0,
    confidence: Number(row.querySelector('.sc-confidence').value) || 0,
  }));
  p.categoryId = Number(document.getElementById('f-category').value);
  readCandidatePanel();
}

function readBoxInputs(prefix) {
  const x1 = document.getElementById(prefix + '-x1').value;
  const y1 = document.getElementById(prefix + '-y1').value;
  const x2 = document.getElementById(prefix + '-x2').value;
  const y2 = document.getElementById(prefix + '-y2').value;
  if (x1 === '' || y1 === '' || x2 === '' || y2 === '') return null;
  return [Number(x1), Number(y1), Number(x2), Number(y2)];
}

function attachEditorListeners() {
  document.getElementById('editor').querySelectorAll('input, select').forEach(el => {
    el.addEventListener('change', () => { readCurrentPhoto(); renderOverlay(); refreshSidebarDot(); });
  });
  document.getElementById('addSceneBtn').addEventListener('click', () => {
    const p = GT.photos[currentPhotoId];
    p.scene = p.scene || [];
    p.scene.push({ object: SCENE_OBJECTS[0], relation: SCENE_RELATIONS[0], distance_m: 0, confidence: 0.7 });
    renderEditor();
  });
  document.getElementById('editor').addEventListener('click', (e) => {
    if (e.target.classList.contains('sc-remove')) {
      readCurrentPhoto();
      const idx = Number(e.target.closest('.scene-row').dataset.idx);
      GT.photos[currentPhotoId].scene.splice(idx, 1);
      renderEditor();
    }
  });

  const overlay = document.getElementById('overlay');
  let start = null;
  overlay.addEventListener('mousedown', (ev) => {
    const rect = overlay.getBoundingClientRect();
    const meta = PHOTO_META[currentPhotoId];
    start = { x: (ev.clientX - rect.left) / rect.width * meta.w, y: (ev.clientY - rect.top) / rect.height * meta.h };
  });
  overlay.addEventListener('mouseup', (ev) => {
    if (!start) return;
    const rect = overlay.getBoundingClientRect();
    const meta = PHOTO_META[currentPhotoId];
    const end = { x: (ev.clientX - rect.left) / rect.width * meta.w, y: (ev.clientY - rect.top) / rect.height * meta.h };
    const box = [Math.round(Math.min(start.x,end.x)/meta.w*1000), Math.round(Math.min(start.y,end.y)/meta.h*1000), Math.round(Math.max(start.x,end.x)/meta.w*1000), Math.round(Math.max(start.y,end.y)/meta.h*1000)];
    start = null;
    if (box[2]-box[0] < 5 || box[3]-box[1] < 5) return; // za mały, ignoruj (klik)
    const kind = confirm('OK = box AUTA, Anuluj = box TABLICY') ? 'car' : 'plate';
    setBoxInputs(kind === 'car' ? 'f-car' : 'f-plate', box);
    if (kind === 'car') document.getElementById('f-car-present').checked = true;
    else document.getElementById('f-plate-readable').checked = true;
    readCurrentPhoto();
    renderOverlay();
  });
}

function setBoxInputs(prefix, box) {
  document.getElementById(prefix + '-x1').value = box[0];
  document.getElementById(prefix + '-y1').value = box[1];
  document.getElementById(prefix + '-x2').value = box[2];
  document.getElementById(prefix + '-y2').value = box[3];
}

function renderOverlay() {
  const p = GT.photos[currentPhotoId];
  const meta = PHOTO_META[currentPhotoId];
  const svg = document.getElementById('overlay');
  let boxes = '';
  if (p.car?.bbox) boxes += rectSvg(p.car.bbox, meta, '#3ddc84');
  if (p.plate?.bbox) boxes += rectSvg(p.plate.bbox, meta, '#ff5a5a');
  svg.innerHTML = boxes;
}
function rectSvg(box, meta, color) {
  const x = box[0]/1000*meta.w, y = box[1]/1000*meta.h, w = (box[2]-box[0])/1000*meta.w, h = (box[3]-box[1])/1000*meta.h;
  return \`<rect x="\${x}" y="\${y}" width="\${w}" height="\${h}" fill="none" stroke="\${color}" stroke-width="\${meta.w/250}"/>\`;
}

function refreshSidebarDot() {
  const row = document.querySelector(\`.photo-row[data-photo="\${currentPhotoId}"] .dot\`);
  if (row) row.className = 'dot ' + (GT.photos[currentPhotoId].verified ? 'verified' : 'unverified');
}

document.getElementById('downloadBtn').addEventListener('click', () => {
  if (currentPhotoId) readCurrentPhoto();
  const blob = new Blob([JSON.stringify(GT, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'groundtruth.json';
  a.click();
});

renderSidebar();
</script>
</body>
</html>
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
