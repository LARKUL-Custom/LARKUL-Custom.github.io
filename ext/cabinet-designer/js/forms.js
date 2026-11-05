// Forms: inputs bound to state by a reference string, plus shared editors (rows, params, swatches).
'use strict';
const fid = (o, f) => 'f_' + (o + '_' + f).replace(/[^a-zA-Z0-9_-]/g, '_');
function ctl(o, f, val, type, x = {}) {
  const base = `id="${fid(o, f)}" data-obj="${esc(o)}" data-field="${esc(f)}" data-type="${type}"`;
  if (type === 'select' || type === 'selnum') {
    const one = op => { const v = typeof op === 'object' ? op.v : op, l = typeof op === 'object' ? op.l : op; return `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(l)}</option>`; };
    // Options with a group (g) go under that header, ungrouped ones first (L3).
    const gs = [...new Set(x.options.map(op => op && op.g).filter(Boolean))];
    const inner = gs.length ? x.options.filter(op => !(op && op.g)).map(one).join('') + gs.map(g => `<optgroup label="${esc(g)}">${x.options.filter(op => op && op.g === g).map(one).join('')}</optgroup>`).join('') : x.options.map(one).join('');
    return `<select ${base} aria-label="${esc(x.label || f)}">${inner}</select>`;
  }
  if (type === 'bool') return `<input type="checkbox" ${base}${val ? ' checked' : ''} aria-label="${esc(x.label || f)}">`;
  if (type === 'color') return `<input type="color" ${base} value="${esc(val || '#cccccc')}" aria-label="${esc(x.label || f)}">`;
  let shown = val;
  if (type === 'len') shown = fmtLen(val);
  if (type === 'rowh') shown = val === '*' ? '*' : fmtLen(val);
  if (type === 'list') shown = (val || []).join(', ');
  const isNum = !['text', 'list'].includes(type);
  return `<input type="text" ${base} ${isNum ? 'inputmode="decimal" class="num"' : ''} value="${esc(shown ?? '')}" placeholder="${esc(x.ph || '')}" aria-label="${esc(x.label || f)}"${x.blank ? ' data-blank="1"' : ''}${x.list ? ` list="${esc(x.list)}"` : ''}>`;
}
const NUM_TYPES = ['len', 'int', 'num'];
// A field control without its label, for rows that print their own.
const fctl = (o, f, val, type, x = {}) => NUM_TYPES.includes(type) && !/^psh/.test(o) ? calcWrap(ctl(o, f, val, type, x), o, f) : ctl(o, f, val, type, x);
const fld = (label, o, f, val, type, x = {}) => `<label class="f${x.wide ? ' wide' : ''}"><span>${label}</span>${NUM_TYPES.includes(type) && !/^psh/.test(o) ? calcWrap(ctl(o, f, val, type, { label, ...x }), o, f) : ctl(o, f, val, type, { label, ...x })}</label>`;
const opts = (arr, filter) => arr.filter(filter || (() => true)).map(m => ({ v: m.id, l: m.name }));
// Options for a pick that can follow the level above: cabinet follows its room, a room follows the job.
function setOpts(k, list, level = 'room') {
  const inh = level === 'cab' ? roomSet(k) : S.job.defaults[k] || '';
  const nm = (list.find(o => o.v === inh) || {}).l || (k === 'pull' ? 'from door template' : k === 'panelDoor' ? 'same as the doors' : 'none');
  return [{ v: '', l: `${level === 'cab' ? 'Room' : 'Job'} · ${nm}` }, ...list];
}
// L1: name pickers list A to Z under their group headers.
const azOpts = (arr, filter) => arr.filter(filter || (() => true)).map(m => ({ v: m.id, l: m.name, g: m.group || '' })).sort((p, q) => String(p.l).localeCompare(String(q.l), undefined, { numeric: true }));
const matOpts = kind => azOpts(S.materials, kind ? m => (m.kind || 'sheet') === kind : null);

function resolve(ref) {
  if (ref.startsWith('sub:')) {
    const i = ref.indexOf('|'), prop = ref.slice(4, i), o = resolve(ref.slice(i + 1));
    return o ? (o[prop] = o[prop] || []) : null;
  }
  const i = ref.indexOf(':'), k = i < 0 ? ref : ref.slice(0, i), id = i < 0 ? '' : ref.slice(i + 1);
  switch (k) {
    case 'layout': return (S.job.layout = S.job.layout || {});
    case 'job': return S.job; case 'jobp': return S.job.params; case 'jobd': return S.job.defaults;
    case 'room': return id ? roomById(id) : curRoom();
    case 'rset': { const r = roomById(id); return r && (r.settings = r.settings || {}); }
    case 'roomp': { const r = roomById(id); return r && (r.params = r.params || {}); }
    case 'cab': case 'cabpos': case 'cabgap': return cab(id); case 'cabk': { const c = cab(id); return c && c.corner; } case 'cabp': { const c = cab(id); return c && c.params; }
    case 'cabc': { const c = cab(id); return c && (c.construction = c.construction || defaultConstruction(c.cat)); }
    case 'wall': return wall(id);
    case 'wcapx': { const [wid, cid] = id.split(':'), w = wall(wid); return w && (w.caps || []).find(x => x.id === cid) || null; }
    case 'wcap': { const [wid, end] = id.split(':'), w = wall(wid); if (!w) return null; const k = 'cap' + end; return (w[k] = w[k] || { ...capDefaults(w), side: elevSide(w) }); }
    case 'lib': return libItem(id); case 'libp': { const l = libItem(id); return l && (l.params = l.params || {}); }
    case 'des': return S.designer; case 'desp': return S.designer && (S.designer.params = S.designer.params || {});
    case 'desc': return S.designer && S.designer.construction;
    case 'mat': return mat(id); case 'door': return S.doorStyles.find(d => d.id === id);
    case 'dtpl': return S.doorTemplates.find(d => d.id === id);
    case 'mtc': return S.matTemplates.cabinet.find(d => d.id === id);
    case 'mtd': return S.matTemplates.drawer.find(d => d.id === id);
    case 'mset': return matSets().find(d => d.id === id);
    case 'fin': return finishList().find(d => d.id === id);
    case 'panel': return S.panels.find(p => p.id === id);
    case 'ff': return (S.faceFrames || []).find(f => f.id === id);
    case 'ilib': return (S.interiorLib || []).find(x => x.id === id);
    case 'cabff': { const c = cab(id); return c && (c.ffSize = c.ffSize || {}); }
    // Insert library prices, and this job's own prices for library items: pov:<door|mat|ins>:<id>
    case 'insp': return ((S.insertPrices = S.insertPrices || {})[id] = S.insertPrices[id] || {});
    case 'pov': { const [g, iid] = id.split(':'), o = (S.job.priceOver = S.job.priceOver || {}); o[g] = o[g] || {}; return (o[g][iid] = o[g][iid] || {}); }
    case 'hw': return hw(id);
    // One length of a drawer runner: its part number, minimum inside depth and screw holes, kept in maps by length.
    case 'hwlen': {
      const [hid, len] = id.split(':'), h = hw(hid); if (!h) return null;
      const map = k => (h[k] = h[k] || {});
      return {
        set pn(v) { if (v) map('partNos')[len] = v; else delete map('partNos')[len]; },
        set minD(v) { if (v > 0) map('minDepthMM')[len] = v; else delete map('minDepthMM')[len]; },
        set runner(v) { if (v > 0) map('runnerMM')[len] = v; else delete map('runnerMM')[len]; },
        set holes(v) { if (Array.isArray(v) && v.length) map('holeSets')[len] = v; else delete map('holeSets')[len]; },
      };
    }
    case 'top': return S.countertops.find(t => t.id === id);
    case 'ctrun': return (S.ctRuns[id] = S.ctRuns[id] || {});
    case 'gtop': return (S.genTops || []).find(g => g.id === id);
    case 'gmold': return (S.genMolds || []).find(g => g.id === id);
    case 'light': return (S.lights || []).find(l => l.id === id);
    case 'mold': return molding(id);
    case 'ptpl': return S.partTemplates.find(t => t.id === id);
    // A group inside a hardware item, e.g. hwx:jt-dowel:female
    case 'hwx': { const [hid, sub] = id.split(':'), h = hw(hid); if (!h) return null; return (h[sub] = h[sub] && typeof h[sub] === 'object' ? h[sub] : sub === 'top' && h.ends ? { ...h.ends } : {}); }
    case 'rceil': { const r = curRoom(); return r && (r.ceiling = r.ceiling || {}); }
    case 'jtt': case 'jtp': return typeof jtResolve === 'function' ? jtResolve(k, id) : null;
    case 'ptr': { const [tid, kind] = id.split(':'), t = S.partTemplates.find(x => x.id === tid); if (!t) return null; t.rules = t.rules || {}; return (t.rules[kind] = t.rules[kind] || {}); }
    case 'eb': return edgeband(id);
    case 'shd': return S.shapeDesign;
    case 'shdpt': return S.shapeDesign && S.shapeDesign.pts[+id];
    case 'shp': return shapeById(id);
    case 'fixt': return typeof fixtById === 'function' ? fixtById(id) : null;
    case 'fixtpos': return typeof fixtById === 'function' ? fixtById(id) : null;
    case 'shppos': return shapeById(id);
    case 'slib': return shapeLibItem(id);
    case 'jvar': return (S.job.vars || []).find(v => v.id === id);
    case 'rvar': { const [rid, vid] = id.split(':'), r = roomById(rid); return r && (r.vars || []).find(v => v.id === vid); }
    case 'jfield': return (S.job.fields || []).find(f => f.id === id);
    case 'cvar': { const [cid, vid] = id.split(':'), c = cab(cid); return c && (c.vars || []).find(v => v.id === vid); }
  }
  return null;
}
function readVal(el) {
  const t = el.dataset.type, v = el.value;
  // Formulas and arithmetic: "=W/2", "30 - 1 1/2", "SINK + 3".
  if (NUM_TYPES.includes(t) && v.trim() && (v.trim()[0] === '=' || (t === 'len' ? !isFinite(parseLen(v)) : !isFinite(+v)))) {
    try { const n = evalExpr(v, fxVarsFor(el.dataset.obj, el.dataset.field)); return t === 'int' ? Math.max(0, Math.round(n)) : n; }
    catch (e) { flash('That formula did not work: ' + e.message); el.classList.add('fxbad'); el.title = 'This formula did not work: ' + e.message; return undefined; }
  }
  if (t === 'bool') return el.checked;
  if (t === 'text' || t === 'select' || t === 'color') return v;
  if (t === 'selnum') return +v;
  if (el.dataset.blank && v.trim() === '') return '';
  if (t === 'len') { const n = parseLen(v); return isFinite(n) ? n : undefined; }
  if (t === 'rowh') { if (v.trim() === '*' || v.trim() === '') return '*'; const n = parseLen(v); return isFinite(n) && n > 0 ? n : undefined; }
  if (t === 'int') { const n = parseInt(v, 10); return isFinite(n) && n >= 0 ? n : undefined; }
  if (t === 'num') { const n = parseFloat(v); return isFinite(n) ? n : undefined; }
  if (t === 'list') { const a = v.split(/[,\s]+/).map(parseFloat).filter(n => isFinite(n) && n > 0); return a.length ? a : undefined; }
  return v;
}
document.addEventListener('change', e => {
  const el = e.target.closest('[data-obj]'); if (!el) return;
  let v = readVal(el); const ref = el.dataset.obj, field = el.dataset.field;
  if (v === undefined) { if (!el.classList.contains('fxbad')) render(); return; }
  el.classList.remove('fxbad'); el.removeAttribute('title');
  // Price sheets belong to the shop, not the job, so they save on their own and stay out of undo.
  if (/^pshp?:/.test(ref)) {
    const o = priceRef(ref); if (!o) return;
    if (v === '' && ref.startsWith('pshp:')) delete o[field]; else o[field] = v;
    savePrices(); renderPricing(); if (ui.quick && typeof renderQuick === 'function') renderQuick(); return;
  }
  let note = '';
  // Formulas that name a value are kept and worked out again later; sizes worked out from a wall end are not.
  const raw = el.value.trim(), keepFx = NUM_TYPES.includes(el.dataset.type) && !/^cabpos:|^cabgap:|^wcap|^fixtpos:|^shppos:/.test(ref) && !(ref.startsWith('wall:') && ['len', 'angle'].includes(field));
  mutate(() => {
    const o = resolve(ref); if (!o) return;
    if (typeof cabLogField === 'function') cabLogField(ref, field, el);
    const prevFx = fxOf(ref, field);
    if (keepFx) setFormula(ref, field, isLiveFx(raw) ? raw.replace(/^=/, '').trim() : null);
    if (ref === 'shd' && (field === 'bw' || field === 'bh')) return scaleShape(o, field, v);
    if (ref.startsWith('shdpt:') && field === 'len') return setEdgeLen(S.shapeDesign.pts, +ref.split(':')[1], v);
    if (ref.startsWith('cvar:') && field === 'k') {
      const nn = varName(v), old = o.k, cid = ref.split(':')[1]; o.k = nn;
      if (old && nn && old !== nn) Object.keys(S.formulas || {}).filter(k => k.includes(':' + cid + '|') || k.includes(':' + cid + ':')).forEach(k => { S.formulas[k] = S.formulas[k].replace(new RegExp('\\b' + old + '\\b(?!\\.)', 'g'), nn); });
      return;
    }
    if (ref.startsWith('jvar:') && field === 'k') {
      const nn = varName(v), old = o.k; o.k = nn;
      if (old && nn && old !== nn) Object.keys(S.formulas || {}).forEach(k => { S.formulas[k] = S.formulas[k].replace(new RegExp('\\b' + old + '\\b(?!\\.)', 'g'), nn); });
      return;
    }
    // The job's construction swaps every cabinet in the job between frameless and face frame.
    if (ref === 'jobd' && field === 'faceFrame') { o[field] = v || 'none'; ffSwapAll(); note = `Every cabinet in the job is now ${ffJobName().replace(/^Face/, 'face')}`; return; }
    // A slab turned into a framed door gets stiles and rails; a two-piece door gets the 3/8 HDF panel.
    if (ref.startsWith('door:') && field === 'type') {
      o.type = v;
      if (v !== 'slab' && !(o.stile > 0)) { o.stile = 2.25; o.rail = 2.25; }
      if (v === 'twopiece' && mat('m-hdf38')) o.panelMat = 'm-hdf38';
      return;
    }
    if (ref.startsWith('mold:') && field === 'profile' && v === 'shape') { o.profile = v; if (!(o.pts || []).length) o.pts = moldStartPts(); moldFitShape(o); return; }
    // An appliance or shape set a distance off either wall end, like a cabinet's From left / From right.
    // An appliance, window or doorway on a wall grows its width the same way a cabinet does (see qGrow).
    if (ref.startsWith('fixt:') && field === 'w' && v > 0 && o.wall && wall(o.wall) && typeof qGrow === 'function') { const px = xProxy(o); qGrow(px, v); o.off = px.off; o.w = v; return; }
    if (ref.startsWith('fixtpos:') || ref.startsWith('shppos:')) { const px = xProxy(o); setFromEnd(px, field, v); o.off = px.off; return; }
    if (ref.startsWith('wall:') && field === 'len') return setWallLen(o, v);
    if (ref.startsWith('wall:') && field === 'angle') return setWallAngle(o, v);
    if (ref === 'layout') {
      const from = lay(); o[field] = v;
      if (['autoFillers', 'fillerW', 'fillerReach'].includes(field)) { const n = refitFillers(from, lay()); if (n) note = `Moved ${nCab(n)} to fit the fillers`; }
      return;
    }
    if (ref.startsWith('wcapx:') || ref.startsWith('wcap:')) {
      const w = wall(ref.split(':')[1]);
      if (field === 'from') { const k = capsOf(w).find(x => x.id === o.id), L = wg(w).L; o.a = r3(elevSide(w) === 1 ? v : L - v - k.t); }
      else o[field] = v;
      settleWall(w); return;
    }
    // Space to the next cabinet: with only the wall on that side it is the same as From left / From right.
    if (ref.startsWith('cabgap:') && !gapIsWall(o, field)) {
      const was = o.off; setOpenGap(o, field, v); const want = o.off;
      if (!settle(o)) { o.off = was; note = 'There is no room for that here. It would overlap a wall or another cabinet.'; }
      else if (Math.abs(o.off - want) > 0.01) note = 'Another cabinet or wall is in the way, so it moved to the nearest free spot.';
      return;
    }
    if (ref.startsWith('cabpos:') || ref.startsWith('cabgap:')) {
      const was = o.off, wasFill = o['fill' + field]; setFromEnd(o, field, v); const want = o.off;
      // A cabinet set a distance off a wall gets a filler that fills that gap; flush to the wall it needs none.
      if (o['fill' + field] !== 'off') o['fill' + field] = v > 0.01 ? 'on' : '';
      if (!settle(o)) { o.off = was; o['fill' + field] = wasFill; note = 'There is no room for that here. It would overlap a wall or another cabinet.'; }
      else if (Math.abs(o.off - want) > 0.01) note = 'Another cabinet or wall is in the way, so it moved to the nearest free spot.';
      else if (v > 0.01 && fillersOf(o).some(f => f.end === field)) note = `Filler set to ${fmtLen(fromEnd(o, field))}`;
      return;
    }
    // A cabinet can never overlap: a new size or spot slides it to the nearest free place, or is refused.
    if (ref.startsWith('cab:') && ['w', 'h', 'd', 'elev', 'off', 'outset'].includes(field)) {
      if (typeof qSizeRule === 'function' && ['w', 'h', 'd'].includes(field)) { const r = qSizeRule(o, field, v); if (r.refuse) { if (keepFx) setFormula(ref, field, prevFx); note = r.note; return; } v = r.v; note = r.note || ''; }
      const was = o[field], wasOff = o.off; if (field === 'w' && typeof qGrow === 'function') qGrow(o, v); o[field] = v;
      if (o.wall && !settle(o)) { o[field] = was; o.off = wasOff; if (keepFx) setFormula(ref, field, prevFx); note = 'There is no room for that here. It would overlap a wall or another cabinet.'; }
      return;
    }
    if (ref.startsWith('cvar:') && field === 'v' && typeof fxParamClamp === 'function') v = fxParamClamp(o, v);
    if ((ref.startsWith('cvar:') || ref.startsWith('rvar:') || ref.startsWith('jfield:')) && field === 'k') { o.k = ref.startsWith('jfield:') ? varName(v) : varName(v); return; }
    if (/^(cabp|libp|desp|roomp|rset|pov):|^desp$/.test(ref) && v === '') { delete o[field]; return; }
    if (field.includes('.')) { const [i, k] = field.split('.'); if (o[+i]) o[+i][k] = v; return; }
    o[field] = v;
  }, true);
  if (note) flash(note);
});

/* ---------- Shared editors ---------- */
const ROW_TYPES = [{ v: 'door', l: 'Door' }, { v: 'drawer', l: 'Drawer' }, { v: 'false', l: 'False front' }, { v: 'open', l: 'Open' }];
function rowsEditor(ref, rows) {
  const r = 'sub:rows|' + ref;
  return `<div class="tscroll"><table class="t rowsed"><thead><tr><th>Row (top down)</th><th>Height</th><th>Count</th><th></th></tr></thead><tbody>${rows.map((row, i) => `<tr>
    <td>${ctl(r, i + '.type', row.type, 'select', { options: ROW_TYPES, label: 'Row type' })}</td>
    <td style="width:78px">${ctl(r, i + '.h', row.h, 'rowh', { label: 'Row height', ph: '*' })}</td>
    <td style="width:58px">${ctl(r, i + '.count', row.count, 'selnum', { options: [1, 2, 3, 4], label: 'Count' })}</td>
    <td style="width:28px"><button class="btn sm" data-act="row-del" data-ref="${esc(ref)}" data-i="${i}" aria-label="Remove row">×</button></td></tr>`).join('')}</tbody></table></div>
    <div class="row-actions"><button class="btn sm" data-act="row-add" data-ref="${esc(ref)}">Add row</button><span class="note">Height * shares the leftover space.</span></div>`;
}
function facePicker(ref) {
  return `<div class="faces">${FACE_PRESETS.map(fp => `<button class="face" data-act="face" data-ref="${esc(ref)}" data-id="${fp.id}" title="${esc(fp.name)}" draggable="false">${faceIcon(fp.rows)}<span>${esc(fp.name)}</span></button>`).join('')}</div>`;
}
function faceIcon(rows) {
  const fake = { cat: 'Base', w: 18, h: 30, rows, construction: { toeKick: false }, libParams: {}, params: { frontSideReveal: 0.3, frontTopReveal: 0.3, frontBottomReveal: 0.3, frontGap: 0.6 } };
  const fr = computeFronts(fake);
  return `<svg viewBox="-1 -1 20 32" aria-hidden="true"><rect class="fi-box" x="0" y="0" width="18" height="30"/>${fr.map(f => `<rect class="fi-front ${f.type}" x="${f.x0}" y="${30 - f.z1}" width="${f.x1 - f.x0}" height="${f.z1 - f.z0}"/>`).join('')}</svg>`;
}
// Construction parameter groups fold shut from their title row; which ones are shut is remembered.
const paramShut = g => !!(ui.paramFold || {})[g];
const pgroupRow = (g, gl, cols, n) => `<tr class="pgroup"><th colspan="${cols}"><button class="pfold" data-act="param-fold" data-id="${g}" aria-expanded="${!paramShut(g)}">${icon('chevr', paramShut(g) ? '' : 'rot90')}${gl}<span class="ct">${n}</span></button></th></tr>`;
// Groups of parameters: [[group key, label, defs]], only the groups that have any.
const paramGroups = defs => PARAM_GROUPS.map(([g, gl]) => [g, gl, defs.filter(d => d.g === g)]).filter(x => x[2].length);
function paramRows(ref, p, ownObj, libObj, cat, ownLabel, roomObj) {
  const defs = PARAM_DEFS.filter(d => !d.cats || cat === '*' || d.cats.includes(cat));
  return `<table class="t ptab"><tbody>${paramGroups(defs).map(([g, gl, ds]) => pgroupRow(g, gl, 3, ds.length) + (paramShut(g) ? '' : ds.map(d => {
    const own = has(ownObj, d.k), lib = has(libObj, d.k), rm = has(roomObj, d.k);
    return `<tr><td>${d.label}<div class="src${own ? ' cab' : ''}">${own ? ownLabel : lib ? 'Library' : rm ? 'Room' : 'Job standard'}</div></td>
      <td style="width:96px">${d.type === 'select' ? ctl(ref, d.k, p[d.k], 'select', { options: d.options, label: d.label }) : ctl(ref, d.k, p[d.k], d.type, { label: d.label })}</td>
      <td style="width:28px">${own ? `<button class="btn sm" data-act="param-reset" data-ref="${esc(ref)}" data-k="${d.k}" title="Use the ${lib ? 'library' : rm ? 'room' : 'job'} value" aria-label="Reset">↺</button>` : ''}</td></tr>`;
  }).join(''))).join('')}</tbody></table>`;
}
function swatch(m, size = 18) {
  if (!m) return '';
  const tx = texURL(m);
  return `<span class="sw" style="width:${size}px;height:${size}px;background:${esc(m.color || '#ccc')}${tx ? `;background-image:url('${tx}');background-size:cover` : ''}"></span>`;
}

/* ---------- Textures ---------- */
const procCache = {};
// Simple generated textures so the sample looks like wood and stone before anyone uploads a photo.
function texURL(m) {
  if (!m) return null;
  if (m.texture) return isLibTex(m.texture) ? texLibURL(m.texture.slice(9)) : m.texture;
  if (!m.procedural) return null;
  const key = m.procedural + m.color;
  if (procCache[key]) return procCache[key];
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'); g.fillStyle = m.color; g.fillRect(0, 0, 256, 256);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    if (m.procedural === 'stone') {
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '120,120,125' : '255,255,255'},${rnd() * 0.12})`; g.fillRect(rnd() * 256, rnd() * 256, rnd() * 3 + 1, rnd() * 3 + 1); }
      g.strokeStyle = 'rgba(140,140,150,.25)'; g.lineWidth = 1.2; g.beginPath(); let x = 0, y = rnd() * 256; g.moveTo(x, y); while (x < 256) { x += 12; y += (rnd() - 0.5) * 18; g.lineTo(x, y); } g.stroke();
    } else {
      const lines = m.procedural === 'oak' ? 70 : m.procedural === 'birch' ? 30 : 45;
      for (let i = 0; i < lines; i++) {
        const y = rnd() * 256, a = m.procedural === 'oak' ? 0.16 : 0.09;
        g.strokeStyle = `rgba(80,50,20,${rnd() * a})`; g.lineWidth = rnd() * 2 + 0.4;
        g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x / 40 + i) * 2 + (rnd() - 0.5)); g.stroke();
      }
    }
    procCache[key] = cv.toDataURL('image/jpeg', 0.85);
  } catch (e) { procCache[key] = null; }
  return procCache[key];
}
function readTexture(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Could not read that file.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image this browser can open.'));
      img.onload = () => {
        const k = Math.min(1, 512 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', 0.82));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
// Interior editor shared by the inspector and the designer: shelf count plus inserts.
// ref points at the cabinet or design, pref at its own parameter overrides.
function interiorSection(ref, obj, pref, c) {
  const p = effParams(c), n = Math.max(0, p.shelfCount | 0), lay = interiorLayout(c, p), shown = shelfHeights(lay, n).length;
  const r = 'sub:inserts|' + ref, ins = obj.inserts || [];
  const field = (it, i, f) => f === 'n' ? fld(it.type === 'traydiv' ? 'Dividers' : 'How many', r, i + '.n', it.n, 'int')
    : f === 'h' ? fld('Box height', r, i + '.h', it.h, 'len')
    : f === 'x' ? fld('From left inside', r, i + '.x', it.x, 'rowh', { ph: '* = centered' })
    : fld('Name on hardware list', r, i + '.name', it.name, 'text', { wide: true });
  return `<div class="psec"><div class="eyebrow">Interior</div>
    <div class="stepper"><span>Adjustable shelves</span><button class="btn sm" data-act="shelf-step" data-ref="${esc(pref)}" data-v="${n}" data-id="-1" aria-label="One less shelf"${n ? '' : ' disabled'}>&minus;</button><b class="mono">${n}</b><button class="btn sm" data-act="shelf-step" data-ref="${esc(pref)}" data-v="${n}" data-id="1" aria-label="One more shelf">+</button></div>
    ${n && shown < n ? `<div class="note">${shown ? `Only ${shown} fit` : 'None fit'}: ${lay.shelfZones.length ? 'the door opening is too short' : 'drawers or inserts fill the door opening'}.</div>` : ''}
    ${ins.map((it, i) => { const T = insertType(it.type); return `<div class="insrow"><div class="pshead"><b>${esc(T.name)}</b><button class="btn sm" data-act="ins-del" data-ref="${esc(ref)}" data-i="${i}" aria-label="Remove ${esc(T.name)}">×</button></div>
      <div class="grid2">${T.fields.map(f => field(it, i, f)).join('')}</div>${T.hint ? `<div class="note">${esc(T.hint)}</div>` : ''}</div>`; }).join('')}
    <div class="insadd"><select class="instype" aria-label="Insert to add">${INSERT_TYPES.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select><button class="btn sm" data-act="ins-add" data-ref="${esc(ref)}">Add insert</button></div>
  </div>`;
}
