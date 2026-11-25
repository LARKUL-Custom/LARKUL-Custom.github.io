/* Selecting several cabinets at once (Shift or Ctrl click, or Shift-drag a box in the plan) and changing
   them together: materials, door template, hardware, joints, size and build, for things like two-tone kitchens.
   Fields the cabinets don't agree on show as Mixed until you pick a value. */
const MIXED = '__mixed';
const multiIds = () => (ui.multi || []).filter(id => cab(id));
const inMulti = id => multiIds().length > 1 && ui.multi.includes(id);
function setMulti(ids, primary) {
  ui.multiW = [];
  ui.multi = [...new Set(ids)].filter(id => cab(id));
  const p = primary && ui.multi.includes(primary) ? primary : ui.multi[ui.multi.length - 1];
  select(p ? { type: 'cab', id: p } : null, true);
}
function toggleMulti(id) {
  let m = multiIds(); if (!m.length && ui.sel && ui.sel.type === 'cab') m = [ui.sel.id];
  setMulti(m.includes(id) ? m.filter(x => x !== id) : [...m, id], id);
}
// Cabinets whose middle is inside the box, in plan coordinates.
function cabsInBox(a, b) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return S.cabinets.filter(c => { const m = cabPt(c, c.w / 2, c.d / 2); return m.x >= x0 && m.x <= x1 && m.y >= y0 && m.y <= y1; }).map(c => c.id);
}
function boxSVG() {
  const d = ui.drag; if (!d || d.mode !== 'box' || !d.p1) return '';
  return `<rect class="selbox nss" x="${Math.min(d.p0.x, d.p1.x)}" y="${Math.min(d.p0.y, d.p1.y)}" width="${Math.abs(d.p1.x - d.p0.x)}" height="${Math.abs(d.p1.y - d.p0.y)}"/>`;
}
function finishBox(d) {
  if (!d.p1) return;
  const ids = cabsInBox(d.p0, d.p1), keep = d.add ? multiIds().length ? multiIds() : ui.sel && ui.sel.type === 'cab' ? [ui.sel.id] : [] : [];
  setMulti([...keep, ...ids]);
  if (ids.length) flash(`${multiIds().length} cabinets selected`);
}

const bulkCons = (c, k) => k === 'toeKick' ? (toeOn(c) ? 'yes' : 'no') : ((c.construction || {}).top || 'full');
function multiProps() {
  const ids = multiIds(), cs = ids.map(cab);
  const agree = vals => vals.every(v => v === vals[0]) ? vals[0] : MIXED;
  const sel = (label, f, options, get = c => c[f] || '') => {
    const v = agree(cs.map(c => String(get(c))));
    return `<label class="f"><span>${label}</span><select class="bulk-set" data-field="${f}" aria-label="${esc(label)}">${v === MIXED ? `<option value="${MIXED}" selected>Mixed</option>` : ''}${options.map(o => `<option value="${esc(o.v)}"${String(o.v) === v ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`;
  };
  const num = (label, f) => { const v = agree(cs.map(c => String(c[f] ?? 0))); return `<label class="f"><span>${label}</span><input class="bulk-num" data-field="${f}" inputmode="decimal" aria-label="${esc(label)}" value="${v === MIXED ? '' : esc(fmtLen(+v))}" placeholder="Mixed"></label>`; };
  const so = (k, list) => setOpts(k, list, 'cab');
  const yn = [{ v: 'yes', l: 'Yes' }, { v: 'no', l: 'No' }];
  return `<div class="psec box multi"><div class="multi-head"><b>${ids.length} cabinets selected</b><span class="note">${ids.map(id => esc(LBL[id] || '')).join(', ')}</span></div>
    <div class="row-actions"><button class="btn sm" data-act="multi-none">Select none</button><button class="btn sm danger" data-act="multi-del">Delete ${ids.length}</button></div>
    <div class="note">Shift or Ctrl click adds or removes a cabinet; Shift-drag in the plan selects a box. A change here goes to every selected cabinet.</div></div>
  <div class="psec box">${secHead('palette', 'Materials and fronts', 'amber')}<div class="mgrid">
    ${sel('Construction', 'faceFrame', so('faceFrame', ffOpts()))}${sel('Cabinet materials', 'cabMatT', so('cabMatT', opts(S.matTemplates.cabinet)))}${sel('Drawer materials', 'drawerMatT', so('drawerMatT', opts(S.matTemplates.drawer)))}
    ${sel('Door template', 'doorT', so('doorT', opts(S.doorTemplates)))}${sel('Applied panel fit', 'panelStyle', so('panelStyle', opts(S.panels)))}
    ${sel('Part template', 'partT', so('partT', opts(S.partTemplates)))}${sel('Top molding', 'molding', [{ v: '', l: 'None' }, ...opts(S.moldings)])}${sel('Base molding', 'baseMold', [{ v: '', l: 'None' }, ...opts(S.moldings)])}
    ${sel('Finished interior', 'finInt', yn, c => c.finInt ? 'yes' : 'no')}</div></div>
  <div class="psec box">${secHead('sliders', 'Hardware and joints', 'blue')}<div class="mgrid">
    ${sel('Pulls', 'pull', so('pull', opts(hwOf('pull'))))}${sel('Drawer slide', 'slide', so('slide', opts(hwOf('slide'))))}${sel('Hinge', 'hinge', so('hinge', opts(hwOf('hinge'))))}
    ${sel('Joints, unfinished ends', 'jointU', so('jointU', opts(hwOf('joint'))))}${sel('Joints, finished ends', 'jointF', so('jointF', opts(hwOf('joint'))))}</div></div>
  <div class="psec box">${secHead('ruler', 'Size and build', 'teal')}<div class="mgrid">
    ${num('Width', 'w')}${num('Height', 'h')}${num('Depth', 'd')}${num('Elevation', 'elev')}
    ${sel('Feet / toe kick', 'cons:toeKick', yn, c => bulkCons(c, 'toeKick'))}${sel('Top', 'cons:top', [{ v: 'full', l: 'Full top' }, { v: 'stretchers', l: 'Stretchers' }], c => bulkCons(c, 'top'))}</div></div>`;
}
function bulkApply(f, v) {
  const ids = multiIds(); if (ids.length < 2 || v === MIXED) return;
  // Sizes go through the same rules as the item bar (locks, min/max, width grows toward open space, never refused).
  if (['w', 'h', 'd', 'elev'].includes(f)) { qbApply(f, { value: String(v) }); return; }
  mutate(() => ids.forEach(id => {
    const c = cab(id); if (!c) return;
    if (f.startsWith('cons:')) { const k = f.slice(5); c.construction = c.construction || defaultConstruction(c.cat); c.construction[k] = k === 'toeKick' ? v === 'yes' : v; }
    else if (f === 'finInt') c.finInt = v === 'yes';

    else if (v) c[f] = v; else delete c[f];
  }));
  flash(`Changed ${ids.length} cabinets`);
}
document.addEventListener('change', e => {
  const s = e.target.closest && e.target.closest('.bulk-set, .bulk-num'); if (!s) return;
  if (s.classList.contains('bulk-num')) { const n = parseLen(s.value); if (n === null || !isFinite(n) || n < 0 || (s.dataset.field !== 'elev' && n <= 0)) return; bulkApply(s.dataset.field, n); }
  else bulkApply(s.dataset.field, s.value);
});
function showMultiCtx(x, y) {
  const m = $('#ctxmenu'), n = multiIds().length, item = (act, label, extra = '') => `<button role="menuitem" data-act="${act}"${extra}>${label}</button>`;
  m.innerHTML = `<div class="ctxhead">${n} cabinets</div>` + item('multi-edit', `Change all ${n}…`) + item('multi-faces', 'Faces…') + item('multi-doors', 'Door style…') + item('q-equal', 'Equalize widths') + item('multi-cut', `Cut only these ${n}`) + item('q-copyset', 'Copy settings from the first') + (typeof setClip !== 'undefined' && setClip ? item('q-pasteset', `Paste settings on all ${n}`) : '') + item('multi-none', 'Select none') + (lightClip && lightClip.length ? item('light-paste-multi', `Paste lights on all ${n}`) : '') + item('multi-del', `Delete ${n}`, ' class="danger"');
  placeCtx(m, x, y);
}
function multiAct(act) {
  if (act === 'light-paste-multi') { pasteLights(multiIds()); return true; }
  if (act === 'multi-none') { ui.multi = []; ui.multiW = []; select(null); return true; }
  if (act === 'multi-faces') { showFaceMenu(faceTargets(), ctxAt.x, ctxAt.y); return true; }
  if (act === 'multi-doors') { showDoorMenu(faceTargets(), ctxAt.x, ctxAt.y); return true; }
  if (act === 'multi-wedit') { renderProps(); const el = $('#props'); if (el) el.scrollTop = 0; return true; }
  if (act === 'multi-wdel') { deleteWalls(multiWIds()); return true; }
  if (act === 'multi-cut') { cutPickOnly(multiIds()); return true; }
  if (act === 'multi-edit') { ui.propsShut = false; renderProps(); const el = $('#props'); if (el) el.scrollTop = 0; return true; }
  if (act === 'multi-del') { const ids = multiIds(); mutate(() => { S.cabinets = S.cabinets.filter(c => !ids.includes(c.id)); }); ui.multi = []; ui.sel = null; render(); flash(`Deleted ${ids.length} cabinets`); return true; }
  return false;
}

/* ----- 0.63.21 (Ayden 2026-11-24): "select a group of cabinets by shift clicking or ctrl clicking ... adjust like depth,
   height, width, maybe even swap faces with right click", and the same for walls. ----- */
// Bottom item bar with several cabinets picked: the size boxes change all of them (blank = they differ), and the
// action row holds what works on a group. Same look as the one-cabinet bar.
function multiBar() {
  const cs = multiIds().map(cab).filter(Boolean), n = cs.length;
  const box = (label, f) => {
    const vs = [...new Set(cs.map(c => r3(f === 'outset' ? c.outset || 0 : f === 'elev' ? c.elev || 0 : c[f])))];
    return `<label class="ib-f"><span>${label}</span><input class="qb-in" data-f="${f}" inputmode="decimal" aria-label="${label} of all ${n}" value="${vs.length === 1 ? esc(fmtLen(vs[0])) : ''}" placeholder="Mixed" title="${vs.length === 1 ? `All ${n} are ${fmtLen(vs[0])}` : 'They differ. A number here sets all of them.'}"></label>`;
  };
  const b = (act, ic, l, t, cls = '') => `<button class="${cls}" data-act="${act}" data-id="" title="${t}">${icon(ic)}${l}</button>`;
  const over = cs.filter(c => c.wall && conflicts(c)).length;
  return `<div class="itembar mbar">
    <div class="ib-size">${box('Width', 'w')}${box('Height', 'h')}${box('Depth', 'd')}${box('Elevation', 'elev')}${box('Outset', 'outset')}</div>
    <div class="ib-acts"><div class="ib-name"><b>${n} cabinets picked</b> <span class="muted">${esc(cs.map(c => LBL[c.id] || '').filter(Boolean).join(', '))}</span></div>
      <div class="ib-small">${b('multi-faces', 'door', 'Faces', 'Swap the face layout (doors and drawers) on all of them')}${b('multi-doors', 'palette', 'Door style', 'Pick the door style for all of them')}${b('q-equal', 'ends', 'Equalize', 'Make them all the same width, side by side on one wall')}${b('cab-shift-up', 'chevu', 'Shift up', `Move them up to the ceiling line, ${fmtLen(ceilGap())}" below the ceiling`)}${b('multi-edit', 'edit', 'More', 'Materials, hardware and joints for all of them, in the side panel')}${b('multi-none', 'close', 'Unpick', 'Select none (Esc)')}${b('multi-del', 'trash', 'Delete', `Delete all ${n}`, 'danger')}</div>
      ${over ? `<div class="ib-ovl" title="Shown red in the plan and listed on Print, the CNC card and the quote until fixed.">${icon('hint')}${over} overlap.<span class="ib-ovl2"> Fix before sending.</span></div>` : ''}</div>
  </div>`;
}

// Right-click › Faces: the face layouts (Mozaik's face options) as picture tiles, for one cabinet or every picked one.
let faceFor = [], ctxAt = { x: 0, y: 0 };
const faceTargets = id => inMulti(id) || (!id && multiIds().length > 1) ? multiIds() : [id || (ui.sel && ui.sel.type === 'cab' ? ui.sel.id : null)].filter(Boolean);
const hasFace = c => c && Array.isArray(c.rows) && c.rows.length && !c.appl && !/filler|panel|toe|molding|shelf/i.test(c.kind || '');
// Face layouts already used in this job, so a Mozaik or library layout that isn't a preset can be copied across.
function jobFaces(cat) {
  const seen = new Set(FACE_PRESETS.map(f => JSON.stringify(f.rows))), out = [];
  (S.rooms || []).forEach(r => (r.cabinets || []).forEach(c => {
    if (!hasFace(c) || (cat && c.cat !== cat)) return;
    const rows = c.rows.map(x => ({ ...x })), k = JSON.stringify(rows); if (seen.has(k)) return; seen.add(k);
    out.push({ id: 'job:' + c.id, name: c.name, rows });
  }));
  return out.slice(0, 12);
}
function placeCtx(m, x, y) {
  m.hidden = false; const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  const first = m.querySelector('[role=menuitem]'); if (first) first.focus({ preventScroll: true });
}
function showFaceMenu(ids, x, y) {
  faceFor = ids.filter(id => hasFace(cab(id))); const m = $('#ctxmenu'), n = faceFor.length;
  if (!n) { flash(ids.length > 1 ? 'None of these have doors or drawers to swap.' : 'This one has no doors or drawers to swap.'); return; }
  const cats = [...new Set(faceFor.map(id => cab(id).cat))], jf = jobFaces(cats.length === 1 ? cats[0] : null);
  const tile = f => `<button role="menuitem" class="ctxface" data-act="multi-face" data-id="${esc(f.id)}" title="${esc(f.name)}">${faceIcon(f.rows)}<span>${esc(f.name)}</span></button>`;
  m.innerHTML = `<div class="ctxhead">Faces for ${n === 1 ? esc(LBL[faceFor[0]] || cab(faceFor[0]).name) : `${n} cabinets`}</div><div class="ctxfaces">${FACE_PRESETS.map(tile).join('')}</div>`
    + (jf.length ? `<div class="ctxhead">From this job</div><div class="ctxfaces">${jf.map(tile).join('')}</div>` : '');
  placeCtx(m, x, y);
}
function applyFace(fid) {
  const f = FACE_PRESETS.find(x => x.id === fid) || jobFaces().find(x => x.id === fid) || (() => { const c = cab(String(fid).slice(4)); return c && { name: c.name, rows: c.rows }; })();
  if (!f || !faceFor.length) return;
  mutate(() => faceFor.forEach(id => { const c = cab(id); if (!c) return; c.rows = clone(f.rows); cabLog(c, `Faces: ${f.name}`); }));
  flash(`${f.name} on ${faceFor.length === 1 ? LBL[faceFor[0]] || '1 cabinet' : `${faceFor.length} cabinets`}`);
}
function showDoorMenu(ids, x, y) {
  faceFor = ids.filter(id => hasFace(cab(id))); const m = $('#ctxmenu'), n = faceFor.length; if (!n) { flash('No doors or drawers here.'); return; }
  const cur = [...new Set(faceFor.map(id => cab(id).doorT || ''))], on = v => cur.length === 1 && cur[0] === v ? ' aria-checked="true"' : '';
  m.innerHTML = `<div class="ctxhead">Door style for ${n === 1 ? esc(LBL[faceFor[0]] || '') : `${n} cabinets`}</div>`
    + `<button role="menuitemradio" data-act="multi-door" data-id=""${on('')}>Follow the room</button>`
    + S.doorTemplates.map(t => `<button role="menuitemradio" data-act="multi-door" data-id="${esc(t.id)}"${on(t.id)}>${esc(t.name)}</button>`).join('');
  placeCtx(m, x, y);
}
function applyDoor(tid) {
  if (!faceFor.length) return; const t = S.doorTemplates.find(x => x.id === tid);
  mutate(() => faceFor.forEach(id => { const c = cab(id); if (!c) return; if (tid) c.doorT = tid; else delete c.doorT; cabLog(c, `Door style: ${t ? t.name : 'follows the room'}`); }));
  flash(`${t ? t.name : 'Room door style'} on ${faceFor.length} cabinet${faceFor.length === 1 ? '' : 's'}`);
}

// Walls: Shift or Ctrl click in the plan adds a wall to the picked walls or takes it out.
const multiWIds = () => (ui.multiW || []).filter(id => wall(id));
const inMultiW = id => multiWIds().length > 1 && ui.multiW.includes(id);
function toggleMultiW(id) {
  let m = multiWIds(); if (!m.length && ui.sel && ui.sel.type === 'wall') m = [ui.sel.id];
  m = m.includes(id) ? m.filter(x => x !== id) : [...m, id];
  const last = m[m.length - 1]; ui.multi = [];
  select(last ? { type: 'wall', id: last } : null, true); ui.multiW = m;
  if (last) ui.elevWall = last; renderRoom();
  if (m.length > 1) flash(`${m.length} walls picked`);
}
function multiWallProps() {
  const ws = multiWIds().map(wall), n = ws.length;
  const num = (label, f, def) => { const vs = [...new Set(ws.map(w => r3(+w[f] || def)))]; return `<label class="f"><span>${label}</span><input class="bulkw-num" data-field="${f}" inputmode="decimal" aria-label="${label} of all ${n} walls" value="${vs.length === 1 ? esc(fmtLen(vs[0])) : ''}" placeholder="Mixed"></label>`; };
  const cs = S.cabinets.filter(c => ws.some(w => w.id === c.wall)).length;
  return `<div class="psec box multi"><div class="multi-head"><b>${n} walls selected</b><span class="note">${ws.map(w => esc(wallName(w))).join(', ')}</span></div>
    <div class="row-actions"><button class="btn sm" data-act="multi-none">Select none</button><button class="btn sm danger" data-act="multi-wdel">Delete ${n} walls</button></div>
    <div class="note">Shift or Ctrl click a wall in the plan to add it or take it out. A change here goes to every picked wall.${cs ? ` Deleting them removes the ${nCab(cs)} on them.` : ''}</div></div>
  <div class="psec box">${secHead('ruler', 'Size', 'teal')}<div class="mgrid">${num('Ceiling height', 'height', 96)}${num('Thickness', 'thick', 4.5)}</div>
    <div class="note">Thickness goes behind the room side, so the room and the cabinets stay put.</div></div>`;
}
document.addEventListener('change', e => {
  const s = e.target.closest && e.target.closest('.bulkw-num'); if (!s) return;
  const v = parseLen(s.value), f = s.dataset.field, ws = multiWIds(); if (v === null || !isFinite(v) || v <= 0 || ws.length < 2) return;
  mutate(() => ws.forEach(id => { const w = wall(id); if (w) { w[f] = v; if (f === 'thick') settleWall(w); } }));
  flash(`${f === 'height' ? 'Ceiling height' : 'Thickness'} ${fmtLen(v)} on ${ws.length} walls`);
});
function showMultiWallCtx(x, y) {
  const m = $('#ctxmenu'), n = multiWIds().length, item = (act, label, extra = '') => `<button role="menuitem" data-act="${act}" data-id=""${extra}>${label}</button>`;
  m.innerHTML = `<div class="ctxhead">${n} walls</div>` + item('multi-wedit', `Change all ${n}…`) + item('multi-none', 'Select none') + item('multi-wdel', `Delete ${n} walls`, ' class="danger"');
  placeCtx(m, x, y);
}
function deleteWalls(ids) {
  mutate(() => { S.walls = S.walls.filter(w => !ids.includes(w.id)); S.cabinets = S.cabinets.filter(c => !ids.includes(c.wall)); S.shapes = S.shapes.filter(x => !ids.includes(x.wall)); S.fixtures = (S.fixtures || []).filter(x => !ids.includes(x.wall)); });
  ui.multiW = []; ui.sel = null; render(); flash(`Deleted ${ids.length} walls`);
}
// Where the last right-click or click was, so the Faces and Door style lists open right there.
['contextmenu', 'pointerdown'].forEach(t => document.addEventListener(t, e => { if (!e.target.closest || !e.target.closest('#ctxmenu')) ctxAt = { x: e.clientX, y: e.clientY }; }, true));
document.addEventListener('click', e => {
  const el = e.target.closest && e.target.closest('#ctxmenu [data-act="multi-face"], #ctxmenu [data-act="multi-door"]'); if (!el) return;
  if (el.dataset.act === 'multi-face') applyFace(el.dataset.id); else applyDoor(el.dataset.id);
}, true);
