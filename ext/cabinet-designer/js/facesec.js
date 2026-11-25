// Face and Interior tabs laid out like Mozaik's product editor (0.63.0, Ayden 2026-11-24: "cant actually edit the face
// or the interior the way i wanted, like mozaik i want that system to be almost identical to mozaik even in the quick
// editor"). The face is one big drawing with every section lettered A, B, C and its size written on it; click a
// section and the panel on the right splits it (top/bottom or side by side, any number of equal sections), sets its type,
// hinge and size (with a Lock), and overrides its style. The Interior tab is the inside of the same drawing: click an
// opening and add shelves, fixed shelves, roll-outs and the rest; the bottom row has Automate interior, Finished interior,
// Inserts and Clear like Mozaik's.
// Sections: a plain row is section "i"; a row split side by side (row.cols, see colFronts in build.js) has sections
// "i.j", and a side-by-side section split top to bottom has "i.j.k".
'use strict';

const FS_TYPES = [['door1', 'Door'], ['door2', 'Pair of doors'], ['drawer', 'Drawer'], ['false', 'False front'], ['open', 'Open']];
const FS_NEW = [['door', 'Door'], ['drawer', 'Drawer'], ['false', 'False front'], ['open', 'Open']];
const fsNum = v => v !== '*' && v !== '' && v !== undefined && v !== null && isFinite(+v);
const fsParse = key => String(key).split('.').map(Number);
// Can this cabinet's rows be split side by side into their own sections? (Frameless boxes; a face frame or corner keeps
// side-by-side fronts as a count across one opening.)
const fsColsOk = c => !c.moz && !faceFrame(c) && !angledCorner(c) && !(typeof blindCorner === 'function' && blindCorner(c));
const fsApFront = c => c.made === 'apfront';

// Every section of the face, in letter order, with where its fronts are (x0..x1 across the front, z0..z1 up).
function fsSecs(c) {
  c = fsView(c);
  const fr = fsFronts(c), L = faceLetters(c), out = [], rows = c.rows || [];
  const sec = (key, leaf, fs, pos) => {
    const xs = fs.map(f => frontEX(f));
    const box = fs.length ? { x0: Math.min(...xs.map(x => x[0])), x1: Math.max(...xs.map(x => x[1])), z0: Math.min(...fs.map(f => f.z0)), z1: Math.max(...fs.map(f => f.z1)) } : null;
    out.push({ key, leaf, letter: L[key] || '?', fronts: fs, box, ...pos });
  };
  rows.forEach((r, ri) => {
    const cols = rowCols(c, r);
    if (!cols) return sec(String(ri), r, fr.filter(f => f.row === ri && f.cell === undefined), { row: ri });
    cols.forEach((col, j) => {
      const sub = Array.isArray(col.rows) && col.rows.length > 1 ? col.rows : null;
      if (!sub) return sec(`${ri}.${j}`, col, fr.filter(f => f.cell === `${ri}.${j}`), { row: ri, col: j });
      sub.forEach((lf, k) => sec(`${ri}.${j}.${k}`, lf, fr.filter(f => f.cell === `${ri}.${j}.${k}`), { row: ri, col: j, sub: k }));
    });
  });
  return out;
}
// The fronts the face drawing shows: a cabinet's, or an appliance panel front's panels (apRowFronts in madeprod.js).
function fsFronts(c) {
  if (fsApFront(c) && typeof apRowFronts === 'function' && (c.rows || []).length) return apRowFronts(c);
  return computeFronts(c);
}
// The object a section key edits (a row, a side-by-side section or one of its stack), or null.
function fsLeaf(c, key) {
  const [ri, j, k] = fsParse(key), r = (c.rows || [])[ri]; if (!r) return null;
  if (!Number.isFinite(j)) return r;
  const col = (r.cols || [])[j]; if (!col) return null;
  return Number.isFinite(k) ? (col.rows || [])[k] || null : col;
}
// The picked section: the one clicked last, or the picked opening's row.
function fsSel(c) {
  const secs = fsSecs(c), k = ui.fsSel && ui.fsSelCab === c.id && secs.find(s => s.key === ui.fsSel);
  if (k) return k;
  const r = Math.max(0, ui.qeRow | 0);
  return secs.find(s => s.row === r) || secs[0] || null;
}
function fsPick(c, key) { ui.fsSel = key; ui.fsSelCab = c.id; ui.qeRow = +String(key).split(/[./]/)[0]; }

// A section's type for the Type pick.
function fsType(leaf) {
  const n = Math.max(1, leaf.count | 0), t = leaf.type || 'door';
  if (t === 'door') return n === 1 ? 'door1' : n === 2 ? 'door2' : 'doorN';
  return t === 'drawer' && n > 1 ? 'drawerN' : t;
}
function fsSetType(leaf, v, inCol) {
  if (v === 'door1' || v === 'door2') { leaf.type = 'door'; leaf.count = v === 'door2' ? 2 : 1; if (v === 'door2') delete leaf.hinge; return; }
  if (v === 'drawerN' || v === 'doorN') return;
  leaf.type = v; if (inCol || v !== 'drawer') leaf.count = 1;
}

// An appliance panel front (madeprod.js) gets rows from its saved fronts the first time its face is edited, so its
// panels can be split and changed like a cabinet's face.
function fsEnsureRows(c) {
  if ((c.rows || []).length) return;
  c.rows = fsRowsFrom(c);
}
// What an appliance panel front's rows would be (nothing saved until it is edited).
function fsView(c) { return (c.rows || []).length || !fsApFront(c) ? c : { ...c, rows: fsRowsFrom(c) }; }
function fsRowsFrom(c) {
  if (fsApFront(c) && typeof apFronts === 'function') {
    const fr = apFronts(c).slice().sort((a, b) => b.z - a.z || a.x - b.x), groups = [];
    fr.forEach(q => { const g = groups.find(x => Math.abs(x.z - q.z) < 0.25 && Math.abs(x.h - q.h) < 0.25); if (g) g.list.push(q); else groups.push({ z: q.z, h: q.h, list: [q] }); });
    return groups.map((g, gi) => {
      const t = g.list[0].type === 'drawer' ? 'drawer' : 'door', h = gi === groups.length - 1 ? '*' : r3(g.h);
      if (g.list.length === 1) return { type: t, h, count: 1, ...(g.list[0].hinge ? { hinge: g.list[0].hinge } : {}) };
      const eq = g.list.every(q => Math.abs(q.w - g.list[0].w) < 0.06);
      if (eq && t === 'door' && g.list.length === 2) return { type: 'door', h, count: 2 };
      return { type: t, h, count: 1, cols: g.list.map((q, k) => ({ w: k === g.list.length - 1 ? '*' : r3(q.w), type: q.type === 'drawer' ? 'drawer' : 'door', ...(q.hinge ? { hinge: q.hinge } : {}) })) };
    });
  }
  return [{ type: 'door', h: '*', count: 1 }];
}
// Inserts follow their opening when rows come and go.
function fsShiftInserts(c, from, by) { (c.inserts || []).forEach(it => { if (it.row !== undefined && it.row !== '' && +it.row >= from) it.row = +it.row + by; }); }

// Split a section into n equal sections: dir 'h' stacks them top to bottom, 'v' puts them side by side. type = the new
// sections' face type (Mozaik's Face Type in its Section Split box), or '' to keep the section's own.
function fsSplit(c, key, dir, n, type) {
  n = Math.max(2, Math.min(12, n | 0)); fsEnsureRows(c);
  const [ri, j, k] = fsParse(key), r = c.rows[ri]; if (!r) return '';
  const set = lf => { if (type) { lf.type = type; lf.count = 1; if (type !== 'door') delete lf.hinge; } };
  const LEAF = ['type', 'count', 'hinge', 'style', 'pull', 'shelves', 'fixShelf'];
  const own = o => { const x = {}; LEAF.forEach(f => { if (o[f] !== undefined) x[f] = o[f]; }); return x; };
  const cut = (v, m) => fsNum(v) ? r3((+v - (m - 1) * frontGapOf(c)) / m) : '*';
  if (dir === 'h') {
    if (!Number.isFinite(j)) {
      // A whole row: n rows in its place (its inserts stay with the top one).
      const h = cut(r.h, n), add = Array.from({ length: n - 1 }, () => ({ type: r.cols ? 'door' : r.type, h, count: r.cols ? 1 : (r.type === 'drawer' ? 1 : r.count || 1), ...(r.style ? { style: r.style } : {}) }));
      r.h = h; c.rows.splice(ri + 1, 0, ...add); fsShiftInserts(c, ri + 1, n - 1);
      if (type) { if (!r.cols) set(r); add.forEach(set); }
      fsPick(c, String(ri)); return '';
    }
    const col = r.cols[j];
    if (!Number.isFinite(k)) {
      // A side-by-side section becomes a stack of n.
      const base = own(col); LEAF.forEach(f => delete col[f]);
      col.rows = Array.from({ length: n }, (_, q) => ({ ...(q === 0 ? base : { type: base.type || 'door', ...(base.style ? { style: base.style } : {}) }), h: '*' }));
      col.rows.forEach(lf => { if ((lf.type || 'door') !== 'door') lf.count = 1; set(lf); });
      fsPick(c, `${ri}.${j}.0`); return '';
    }
    const lf = col.rows[k], h = cut(lf.h, n), add = Array.from({ length: n - 1 }, () => ({ type: lf.type || 'door', h, ...(lf.style ? { style: lf.style } : {}) }));
    lf.h = h; col.rows.splice(k + 1, 0, ...add); if (type) { set(lf); add.forEach(set); }
    fsPick(c, `${ri}.${j}.${k}`); return '';
  }
  // Side by side.
  if (!Number.isFinite(j)) {
    if (!fsColsOk(c)) {
      // A face frame or corner: the fronts share the opening (a count across it).
      r.count = n; delete r.hinge; if (type) r.type = type; return 'On this cabinet the fronts side by side share one opening.';
    }
    const base = own(r), t0 = type || (r.type === 'drawer' || r.type === 'false' || r.type === 'open' ? r.type : 'door');
    r.cols = Array.from({ length: n }, (_, q) => {
      const s = q === 0 && !type ? { ...base } : { type: t0, ...(r.style ? { style: r.style } : {}) };
      s.w = '*'; s.type = s.type || t0; s.count = 1; if (n > 1) delete s.hinge; delete s.fixShelf; return s;
    });
    // Its interior goes: a side-by-side row's sections each have their own shelves.
    c.inserts = (c.inserts || []).filter(it => !(it.row !== undefined && it.row !== '' && +it.row === ri));
    fsPick(c, `${ri}.0`); return '';
  }
  if (Number.isFinite(k)) {
    // Mozaik splits any section any way; here a section in a stack takes doors side by side.
    const lf = r.cols[j].rows[k];
    if ((type || lf.type || 'door') !== 'door') return 'A section in a stack splits side by side into doors only. Split the whole side-by-side section instead.';
    lf.type = 'door'; lf.count = n; delete lf.hinge; return '';
  }
  const col = r.cols[j], w = cut(col.w, n), add = Array.from({ length: n - 1 }, () => ({ w, type: type || (col.rows ? 'door' : col.type || 'door'), count: 1, ...(col.style ? { style: col.style } : {}) }));
  col.w = w; r.cols.splice(j + 1, 0, ...add); if (type && !col.rows) set(col);
  fsPick(c, `${ri}.${j}`); return '';
}
const frontGapOf = c => { try { return effParams(c).frontGap; } catch (_) { return 0.125; } };

// Take a section out; the ones beside it take its room (Mozaik's Delete on a section divider).
function fsDelete(c, key) {
  fsEnsureRows(c);
  const [ri, j, k] = fsParse(key), r = c.rows[ri]; if (!r) return '';
  if (!Number.isFinite(j)) {
    if (c.rows.length < 2) return 'This is the only section. Change its type instead.';
    const nx = c.rows[ri + 1] || c.rows[ri - 1];
    if (fsNum(nx.h) && fsNum(r.h)) nx.h = r3(+nx.h + +r.h + frontGapOf(c)); else nx.h = '*';
    c.rows.splice(ri, 1);
    (c.inserts || []).forEach(it => { if (it.row !== undefined && it.row !== '') { if (+it.row === ri) delete it.row; else if (+it.row > ri) it.row = +it.row - 1; } });
    fsPick(c, String(Math.max(0, Math.min(ri, c.rows.length - 1)))); return '';
  }
  const cols = r.cols;
  if (Number.isFinite(k)) {
    const col = cols[j], rows = col.rows, nb = rows[k + 1] || rows[k - 1];
    if (fsNum(nb.h) && fsNum(rows[k].h)) nb.h = r3(+nb.h + +rows[k].h + frontGapOf(c)); else nb.h = '*';
    rows.splice(k, 1);
    if (rows.length === 1) { const lf = rows[0]; delete col.rows; Object.keys(lf).forEach(f => { if (f !== 'h') col[f] = lf[f]; }); fsPick(c, `${ri}.${j}`); }
    else fsPick(c, `${ri}.${j}.${Math.max(0, Math.min(k, rows.length - 1))}`);
    return '';
  }
  const nb = cols[j + 1] || cols[j - 1];
  if (fsNum(nb.w) && fsNum(cols[j].w)) nb.w = r3(+nb.w + +cols[j].w + frontGapOf(c)); else nb.w = '*';
  cols.splice(j, 1);
  if (cols.length === 1) {
    const one = cols[0]; delete r.cols;
    if (Array.isArray(one.rows) && one.rows.length > 1) {
      // The one left is a stack: it becomes rows in this row's place.
      const add = one.rows.map(lf => ({ ...lf, count: lf.count || 1 }));
      if (fsNum(r.h) && add.every(lf => !fsNum(lf.h))) add.forEach(lf => { lf.h = r3((+r.h - (add.length - 1) * frontGapOf(c)) / add.length); });
      c.rows.splice(ri, 1, ...add); fsShiftInserts(c, ri + 1, add.length - 1);
    } else Object.keys(one).forEach(f => { if (f !== 'w') r[f] = one[f]; });
    fsPick(c, String(ri));
  } else fsPick(c, `${ri}.${Math.max(0, Math.min(j, cols.length - 1))}`);
  return '';
}
// Every section sized evenly (Mozaik's Equal Door Widths, and the heights too).
function fsEqual(c) {
  (c.rows || []).forEach(r => { r.h = '*'; (r.cols || []).forEach(col => { col.w = '*'; (col.rows || []).forEach(lf => { lf.h = '*'; }); }); });
}
// Back to one front the whole face (Mozaik's Clear).
function fsClear(c) {
  const t = ((c.rows || [])[0] || {}).type || 'door';
  c.rows = [{ type: t === 'open' ? 'open' : t, h: '*', count: 1 }];
  c.inserts = (c.inserts || []).filter(it => it.type === 'divider');
  fsPick(c, '0');
}
// Lock a section's width or height at what it is now, or let it share the room left (*).
function fsLock(c, key, dim, on) {
  fsEnsureRows(c);
  const s = fsSecs(c).find(x => x.key === key); if (!s) return;
  const [ri, j, k] = fsParse(key), r = c.rows[ri];
  if (dim === 'w') { const col = r && r.cols && r.cols[j]; if (!col) return; col.w = on ? r3(s.box ? s.box.x1 - s.box.x0 : 0) : '*'; return; }
  const o = Number.isFinite(k) ? r.cols[j].rows[k] : r, hh = s.box ? s.box.z1 - s.box.z0 : 0;
  o.h = on ? r3(hh) : '*';
}
// sec:<cabinet id>:<key> refs for the size and pick boxes on the section panel (forms.js resolve).
function fsRef(id) {
  const i = id.indexOf(':'), c = cab(id.slice(0, i)), key = id.slice(i + 1); if (!c) return null;
  fsEnsureRows(c);
  const [ri, j] = fsParse(key), leaf = fsLeaf(c, key); if (!leaf) return null;
  // A side-by-side section is as tall as its row; its width is its own.
  if (Number.isFinite(j) && !Number.isFinite(fsParse(key)[2])) return new Proxy(leaf, { set(o, f, v) { if (f === 'h') c.rows[ri].h = v; else o[f] = v; return true; } });
  return leaf;
}

/* ---------- Mid stiles and rails (0.63.35) ---------- */
// Ayden 2026-11-24: "this is on the island end panel so i cant add vertical stiles or extra rails or whatever i need".
// Two rows with − and +: how many mid stiles and mid rails this front or panel has. Its own count wins over the door style's
// split rules; Auto goes back to them. ref = where the count is kept (secm: a face section, pspl: a panel). info = { ds (with
// everything worked in), fw, fh, kind } of a framed front, or null (a slab: nothing to split).
function fsMidRows(ref, own, info) {
  if (!info) return '';
  const m = doorMids(info.ds, info.fw, info.fh), base = doorStyle(info.ds.id) || info.ds, rc = splitRuleCounts(base, info.fw, info.fh, info.kind);
  const row = (dim, label, n) => { const mine = own && splitNum(own[dim]);
    return `<div class="fs-row"><span>${label}</span><div class="fs-step"><button class="btn sm icon-only" data-act="fs-mid" data-id="${esc(ref)}|${dim}|-1" aria-label="One ${label.toLowerCase().replace(/s$/, '')} less"${n ? '' : ' disabled'}>−</button><b>${n}</b><button class="btn sm icon-only" data-act="fs-mid" data-id="${esc(ref)}|${dim}|1" aria-label="One ${label.toLowerCase().replace(/s$/, '')} more">+</button>
      ${mine ? `<button class="btn sm" data-act="fs-mid" data-id="${esc(ref)}|${dim}|auto" title="Back to the door style and its split rules">Auto</button>` : `<span class="muted">Auto</span>`}</div></div>`; };
  const why = rc.rules.length ? `${esc(base.name)} split rule${rc.rules.length > 1 ? 's' : ''} ${rc.rules.map(i => i + 1).join(', ')} ${rc.rules.length > 1 ? 'fit' : 'fits'} this size.` : `No split rule of ${esc(base.name)} fits this size. Add rules under Libraries › Door styles › Split rules.`;
  return `<fieldset class="fs-size fs-mids"><legend>Stiles and rails</legend>${row('S', 'Mid stiles', m.nS)}${row('R', 'Mid rails', m.nR)}<div class="note show">${why}</div></fieldset>`;
}
// A panel's settings: where its split is kept, whose door style it follows and its size. An automatic end panel piece
// follows its cabinet's end; a Base or Wall End Panel or Support Panel keeps its own.
function fsPanelInfo(c) {
  if (c.autoOf) { const o = allCabs().find(k => k.id === c.autoOf); if (o) return { src: o, end: c.autoEnd, ref: `pspl:${o.id}:${c.autoEnd}`, own: (o.pSplit || {})[c.autoEnd], w: c.d, h: c.h }; }
  return { src: c, end: null, ref: `pspl:${c.id}`, own: c.pSplit, w: c.d, h: c.h };
}
// The Face tab of a panel: its face drawn in its door style, mid stiles and rails, and its door style.
function fsPanelTab(c) {
  const P = fsPanelInfo(c), lk = typeof panelLook === 'function' ? panelLook(P.src, P.w, P.h, null, P.end) : null, k = panelSplitOf(P.src, P.end);
  const ds = lk ? lk.ds : null, R = 'cab:' + P.src.id;
  // 0.63.39: click a stile, rail or opening on the drawing to size it (fsPanelPick).
  const pk = ui.pnPick && ui.pnPick.ref === P.ref ? ui.pnPick : null;
  const svg = ds && typeof doorRenderSVG === 'function' ? doorRenderSVG(ds, P.w, P.h, { dims: true, ...(lk && lk.framed ? { pick: pk || { k: '', i: -1 }, pickAct: 'fs-pnpick', pickRef: P.ref } : {}) }) : '';
  const style = `<label class="fs-row"><span>Door style</span>${fctl(R, 'panelDoor', P.src.panelDoor || '', 'select', { options: setOpts('panelDoor', [{ v: 'same', l: 'Same as the doors' }, ...opts(S.doorStyles)], 'cab'), label: 'Panel door style' })}</label>`;
  const isl = P.end ? `<div class="note show">${k.kind === 'island' ? 'An island end panel (its cabinet is on an island wall).' : 'An end panel.'}</div>`
    : `<label class="fs-row"><span>Island end panel</span><select data-obj="cab:${c.id}" data-field="islandP" data-type="select" aria-label="Island end panel"><option value=""${c.islandP == null || c.islandP === '' ? ' selected' : ''}>Auto · ${k.kind === 'island' ? 'Yes' : 'No'}</option><option value="1"${c.islandP === '1' || c.islandP === true ? ' selected' : ''}>Yes</option><option value="0"${c.islandP === '0' || c.islandP === false ? ' selected' : ''}>No</option></select></label>`;
  const mids = lk && lk.framed ? fsMidRows(P.ref, P.own, { ds, fw: P.w, fh: P.h, kind: k.kind })
    : `<div class="note show">${ds && ds.type !== 'slab' ? 'This panel is too small for its frame.' : 'This panel is a flat slab. Pick a framed door style above (like Shaker) to give it stiles and rails you can split.'}</div>`;
  const buy = ds && typeof panelBuys === 'function' && panelBuys(ds, (mat(finishMat(P.src)) || {}).id);
  return `<div class="fs-tab">
    <div class="fs-work"><div class="fs-draw fs-pdraw">${svg || `<div class="note show">Flat slab panel, ${fmtLen(P.w, 1)} × ${fmtLen(P.h, 1)}.</div>`}</div>
    <aside class="fs-panel" aria-label="Panel">
      <div class="fs-head"><b>${c.autoOf ? 'End panel' : esc(c.name || 'Panel')}</b><span class="muted">${fmtLen(P.w, 1)} wide × ${fmtLen(P.h, 1)}</span></div>
      ${style}${isl}${mids}${lk && lk.framed ? fsPanelPick(P, ds, pk) : ''}
      ${ds && ds.type !== 'slab' ? `<div class="note show">${buy ? 'Bought from the door maker in this style: the order lists its panels wide and high.' : 'Made in the shop: one recess per panel on the CNC.'}${c.autoOf ? ' Cut and priced with its cabinet.' : ''}</div>` : ''}
    </aside></div>
    <div class="fs-status">${isPhone() ? 'Tap' : 'Click'} a stile, rail or opening on the drawing to set its width. Mid stiles split the panel side to side, mid rails top to bottom. The door style's split rules set them until you change them here.</div></div>`;
}
// 0.63.39 (Ayden 2026-11-24: "let me click on the face and set the opening distance and rail or stile width", "and adjust the
// bottom, top rails, and the side stiles"): the size of the picked piece of the panel's face. Blank = the door style's
// width, or an equal share of what is left for an opening. Kept with the panel's mid stiles and rails (pspl: ref).
function fsPanelPick(P, ds, pk) {
  const lay = doorLayout(ds, P.w, P.h, true), m = doorMids(ds, P.w, P.h), cols = m.nS + 1, own = P.own || {}, R = P.ref;
  const len = (label, ref, f, cur, ph) => `<label class="fs-row"><span>${label}</span>${fctl(ref, f, cur ?? '', 'len', { blank: true, ph: fmtLen(ph, 1), label })}</label>`;
  const arr = (k, i) => ((own[k] || [])[i]);
  let title = '', body = '';
  if (!pk) body = `<div class="note show">${isPhone() ? 'Tap' : 'Click'} a stile, rail or opening on the drawing to set its width.</div>`;
  else if (pk.k === 'field') {
    const fl = lay.fields.find(f => f.i === pk.i) || lay.fields[0], ci = pk.i % cols, ri = Math.floor(pk.i / cols);
    title = `Opening ${pk.i + 1}`;
    body = len('Opening width', `sub:W|${R}`, String(ci), arr('W', ci), fl.x1 - fl.x0) + len('Opening height', `sub:H|${R}`, String(ri), arr('H', ri), fl.z1 - fl.z0)
      + `<div class="note show">Blank shares what is left with the other openings${cols > 1 || m.nR ? '' : '. Add a mid stile or rail to have more than one opening'}.</div>`;
  } else if (pk.k === 'stile' || pk.k === 'rail') {
    const side = pk.k === 'stile' ? (pk.i ? 'R' : 'L') : (pk.i ? 'T' : 'B'), f = lay.frame.find(x => x.kind === pk.k && x.side === side), key = pk.k === 'stile' ? 's' + side : 'r' + side;
    title = { L: 'Left stile', R: 'Right stile', B: 'Bottom rail', T: 'Top rail' }[side];
    body = len('Width', R, key, own[key], f ? (pk.k === 'stile' ? f.x1 - f.x0 : f.z1 - f.z0) : 0);
  } else {
    const f = lay.frame.find(x => x.kind === pk.k && x.i === pk.i), st = pk.k === 'midstile';
    title = `Mid ${st ? 'stile' : 'rail'} ${pk.i + 1}`;
    body = len('Width', `sub:${st ? 'ms' : 'mr'}|${R}`, String(pk.i), arr(st ? 'ms' : 'mr', pk.i), f ? (st ? f.x1 - f.x0 : f.z1 - f.z0) : 0);
  }
  const any = ['sL', 'sR', 'rT', 'rB', 'W', 'H', 'ms', 'mr'].some(k => own[k] != null && (!Array.isArray(own[k]) || own[k].some(v => v !== '' && v != null)));
  return `<fieldset class="fs-size fs-mids"><legend>${title || 'Sizes'}</legend>${body}${any ? `<button class="btn sm" data-act="fs-pnreset" data-id="${esc(R)}" title="Every stile, rail and opening back to the door style's sizes">Reset sizes</button>` : ''}</fieldset>`;
}
// A cabinet's own end panels in a framed style: their mid stiles and rails, under the face.
function fsEndPanelsBox(c) {
  if (c.made || typeof panelLook !== 'function' || typeof panelPieces !== 'function') return '';
  const ends = ['L', 'R'].map(sd => { let pcs = null; try { pcs = drawnPanels(() => panelPieces(c, sd)); } catch (_) {} return pcs && pcs.length ? [sd, pcs[0]] : null; }).filter(Boolean);
  if (!ends.length) return '';
  const ps = panelFor(c); if (!ps.door || ps.door.type === 'slab') return '';
  const D = sd => endDepth(c, sd) + ps.frontOverhang;
  const box = ends.map(([sd, pc]) => { const w = D(sd), h = pc.z1 - pc.z0, lk = panelLook(c, w, h, ps.door, sd), k = panelSplitOf(c, sd);
    return lk.framed ? `<div class="fs-endp"><b>${sd === 'L' ? 'Left' : 'Right'} end panel</b> <span class="muted">${fmtLen(w, 1)} × ${fmtLen(h, 1)}${k.kind === 'island' ? ', island' : ''}</span>${fsMidRows(`pspl:${c.id}:${sd}`, (c.pSplit || {})[sd], { ds: lk.ds, fw: w, fh: h, kind: k.kind })}</div>` : ''; }).join('');
  return box ? `<div class="fs-endps">${box}</div>` : '';
}

/* ---------- Drawing ---------- */
// The face drawn big, every section clickable with its letter and size, the picked one outlined.
function fsFaceSVG(c, sel, inside) {
  const svg = inside ? frontPreviewSVG(c, 2000, 0, false, true) : fsApFront(c) ? fsApSVG(c) : frontPreviewSVG(c, 2000, 0, ui.open[c.id], false);
  const u = Math.max(8, Math.min(c.w, c.h)) / 26, fs = Math.max(0.9, Math.min(1.8, u));
  let g = '';
  if (inside) {
    const p = effParams(c), fr = computeFronts(c, p), lay = interiorLayout(c, p, fr), L = faceLetters(c);
    const zs = [...lay.zones.filter(z => z.row != null && !(lay.inner && lay.inner.rows.includes(z.row))).map(z => ({ key: String(z.row), x0: lay.x0, x1: lay.x0 + lay.inW, z0: z[0], z1: z[1] })),
      ...(lay.colZones || []).map(z => ({ key: z.cell, x0: z.x0, x1: z.x1, z0: z[0], z1: z[1] })),
      ...(lay.inner ? lay.inner.zones.map(z => ({ key: z.key, x0: z.x0, x1: z.x1, z0: z[0], z1: z[1], lab: inLabel(c, z.key, L) })) : [])];
    zs.forEach(z => {
      if (z.x1 - z.x0 < 0.6 || z.z1 - z.z0 < 0.6) return;
      const on = sel && sel.key === z.key && !(ui.inSel || []).length;
      g += `<g class="fs-sec in${on ? ' on' : ''}"><rect class="fs-hit" data-act="fs-pick" data-id="${z.key}" x="${r3(z.x0 + 0.2)}" y="${r3(-z.z1 + 0.2)}" width="${r3(z.x1 - z.x0 - 0.4)}" height="${r3(z.z1 - z.z0 - 0.4)}"><title>Opening ${esc(z.lab || L[z.key] || '')}</title></rect>
        <text class="fs-let" x="${r3(z.x1 - fs * 0.6)}" y="${r3(-z.z1 + fs * 1.3)}" font-size="${fs}" text-anchor="end">${esc(z.lab || L[z.key] || '')}</text></g>`;
    });
    // 0.63.74: every shelf, partition, stretcher and insert can be clicked to pick it (intsplit.js).
    if (typeof inPickSVG === 'function') g += inPickSVG(c);
  } else {
    fsSecs(c).forEach(s => {
      if (!s.box) return;
      const b = s.box, w = b.x1 - b.x0, h = b.z1 - b.z0, on = sel && sel.key === s.key, sz = Math.max(0.6, Math.min(fs, w / 6, h / 3));
      g += `<g class="fs-sec${on ? ' on' : ''}"><rect class="fs-hit" data-act="fs-pick" data-id="${s.key}" x="${r3(b.x0)}" y="${r3(-b.z1)}" width="${r3(w)}" height="${r3(h)}"><title>Section ${s.letter}</title></rect>
        <text class="fs-let" x="${r3(b.x1 - sz * 0.6)}" y="${r3(-b.z1 + sz * 1.3)}" font-size="${sz}" text-anchor="end">${s.letter}</text>
        ${w > sz * 5 ? `<text class="fs-dim" x="${r3(b.x0 + w / 2)}" y="${r3(-b.z0 - sz * 0.6)}" font-size="${sz}" text-anchor="middle">${fmtLen(s.fronts.length > 1 ? s.fronts[0].x1 - s.fronts[0].x0 : w, 1)}</text>` : ''}
        ${h > sz * 4 ? `<text class="fs-dim" x="${r3(b.x0 + sz * 0.9)}" y="${r3(-b.z0 - h / 2)}" font-size="${sz}" text-anchor="middle" transform="rotate(-90 ${r3(b.x0 + sz * 0.9)} ${r3(-b.z0 - h / 2)})">${fmtLen(h, 1)}</text>` : ''}</g>`;
    });
  }
  return edDimmed(c, svg.replace(/<\/svg>$/, g + '</svg>'));
}
// An appliance panel front drawn like a cabinet face: its panels in the room's door style.
function fsApSVG(c) {
  const s = Math.max(c.w, c.h) + 6, f = typeof madeFrontSVG === 'function' ? madeFrontSVG(c, 0, 0, { withDefs: true }) : null;
  const body = f ? (typeof f === 'string' ? f : f.svg) : '', mats = f && f.mats ? f.mats.filter(Boolean) : [];
  return `<svg viewBox="${-(s - c.w) / 2} ${-c.h - 3} ${s} ${c.h + 6}"><defs>${typeof texDefs === 'function' ? texDefs(mats) : ''}</defs>${body}</svg>`;
}

/* ---------- Face tab ---------- */
function fsFaceTab(c) {
  fsSel(c);
  const sel = fsSel(c), id = c.id, R = 'cab:' + id;
  if (c.moz && typeof isMoz === 'function' && isMoz(c)) return `<div class="psec box"><div class="note show">This product came from Mozaik with its own fronts. Its face is set on the Mozaik product (Size tab).</div></div>`;
  if (c.made === 'panel') return fsPanelTab(c);
  if (c.made && !fsApFront(c)) return `<div class="psec box"><div class="note show">This product has no face to split. Its settings are on the Size tab.</div></div>`;
  const draw = `<div class="fs-draw">${fsFaceSVG(c, sel, false)}</div>`;
  const bottom = `<div class="fs-bottom">
      ${fsApFront(c) ? '' : `<label class="fs-b"><span>Face style</span>${fctl(R, 'faceFrame', c.faceFrame || '', 'select', { options: setOpts('faceFrame', ffOpts(), 'cab'), label: 'Face style' })}</label>`}
      <label class="fs-b"><span>Door template</span>${fctl(R, 'doorT', c.doorT || '', 'select', { options: setOpts('doorT', opts(S.doorTemplates), 'cab'), label: 'Door template' })}</label>
      <label class="fs-b"><span>Pulls</span>${fctl(R, 'pull', c.pull || '', 'select', { options: setOpts('pull', opts(hwOf('pull')), 'cab'), label: 'Pulls' })}</label>
      ${fsApFront(c) ? '' : `<label class="fs-b"><span>Grain match</span>${fctl(R, 'grainMatch', c.grainMatch || '', 'select', { options: [{ v: '', l: 'Off' }, { v: 'v', l: 'Vertical' }, { v: 'h', l: 'Horizontal' }], label: 'Grain match' })}</label>`}
      ${typeof pocketBtn === 'function' && pocketBtn(c) ? `<label class="fs-b"><span>Pocket doors</span>${fctl(R, 'pocket', c.pocket || '', 'select', { options: [{ v: '', l: 'Off' }, { v: 'on', l: 'On' }], label: 'Pocket doors' })}</label>` : ''}
      <span class="fs-gap"></span>
      <button class="btn sm" data-act="fs-equal" data-id="${id}" title="Make every section the same size: Lock off on every width and height">Equal sizes</button>
      <button class="btn sm" data-act="fs-clear" data-id="${id}" title="Back to one front the whole face. Undo brings it back.">Clear</button></div>
    ${ffSizeBox(c)}${fsEndPanelsBox(c)}`;
  return `<div class="fs-tab">
    <div class="fs-work">${draw}${fsPanel(c, sel)}</div>
    ${bottom}
    <div class="fs-status">${isPhone() ? 'Tap' : 'Click'} a section to pick it. Split it with the buttons on the right; Lock keeps a width or height when the others change.</div></div>`;
}
// The face frame's stile and rail sizes, only on a face frame cabinet (ffBox in faceframe.js).
function ffSizeBox(c) { return faceFrame(c) && typeof ffBox === 'function' ? ffBox(c) : ''; }
// The panel right of the drawing for the picked section: Split, Type, Hinge, Size with Lock, Style, Delete and Reset.
function fsPanel(c, s) {
  if (!s) return `<aside class="fs-panel"><div class="note show">No sections.</div></aside>`;
  const id = c.id, lf = s.leaf, key = s.key, inCol = Number.isFinite(s.col), t = fsType(lf), n = Math.max(1, lf.count | 0);
  const pick = (label, k, list, cur) => `<label class="fs-row"><span>${label}</span><select data-fspick="${id}|${key}|${k}" aria-label="${label}">${list.map(([v, l]) => `<option value="${esc(String(v))}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const types = [...FS_TYPES.filter(([v]) => !(fsApFront(c) && v === 'open')), ...(t === 'doorN' ? [['doorN', `${n} doors`]] : []), ...(t === 'drawerN' ? [['drawerN', `${n} drawers`]] : [])];
  const kind = lf.type === 'drawer' ? 'drawer' : lf.type === 'false' ? 'falseFront' : 'door', dt = doorTpl(cabSet(c, 'doorT'));
  const styleOpts = [['', `Door template · ${(doorStyle(dt[kind]) || {}).name || ''}`], ...S.doorStyles.map(d => [d.id, d.name])];
  const f0 = s.fronts[0], fw = f0 ? f0.x1 - f0.x0 : 0, fh = s.box ? s.box.z1 - s.box.z0 : 0;
  const V = fsView(c), colObj = inCol ? V.rows[s.row].cols[s.col] : null, hObj = Number.isFinite(s.sub) ? lf : V.rows[s.row];
  const wLocked = colObj ? fsNum(colObj.w) : false, hLocked = fsNum(hObj.h);
  const REF = `sec:${id}:${key}`;
  const mw = !inCol && typeof mwSpot === 'function' && mwSpot(c, s.row);
  const size = `<fieldset class="fs-size"><legend>${lf.type === 'drawer' ? 'Drawer size' : lf.type === 'open' ? 'Opening size' : 'Door size'}</legend>
      <div class="fs-wh"><label><span>Width</span>${inCol ? fctl(REF, 'w', r3(fw), 'rowh', { label: 'Width' }) : `<input type="text" class="num" value="${esc(fmtLen(fw, 1))}" disabled aria-label="Width">`}</label><i>×</i>
      <label><span>Height</span>${mw ? fctl('cab:' + id, 'mwH', mwClear(c), 'len', { label: 'Microwave opening height' }) : fctl(REF, 'h', r3(fh), 'rowh', { label: 'Height' })}</label></div>
      <div class="fs-locks">${inCol ? `<label><input type="checkbox" data-act-change="fs-lock" data-id="${key}:w"${wLocked ? ' checked' : ''}> Lock width</label>` : ''}
      ${mw ? '' : `<label><input type="checkbox" data-act-change="fs-lock" data-id="${key}:h"${hLocked ? ' checked' : ''}> Lock height</label>`}</div></fieldset>`;
  const split = `<div class="fs-split"><span>Split</span>
      <button class="btn sm icon-only" data-act="fs-split" data-id="${key}:h" title="Split section ${s.letter} top and bottom">${icon('hsplit')}</button>
      <button class="btn sm icon-only" data-act="fs-split" data-id="${key}:v" title="Split section ${s.letter} side by side">${icon('vsplit')}</button>
      <button class="btn sm icon-only" data-act="fs-split" data-id="${key}:g" title="Split section ${s.letter} into equal sections: pick how many and the face type">${icon('gridsplit')}</button></div>`;
  const dlg = ui.fsSplit && ui.fsSplit.cab === c.id ? fsSplitBox(c, s) : '';
  return `<aside class="fs-panel" aria-label="Section ${s.letter}">
    <div class="fs-head"><b>Section ${s.letter}</b><span class="muted">${fmtLen(fw, 1)} × ${fmtLen(fh, 1)}${n > 1 ? `, ${n} side by side` : ''}</span></div>
    ${split}${dlg}
    ${pick('Type', 'type', types, t)}
    ${lf.type === 'door' && n === 1 ? pick('Hinge', 'hinge', [['', `Auto · ${(f0 && f0.hinge) === 'R' ? 'Right' : 'Left'}`], ['L', 'Left'], ['R', 'Right']], lf.hinge || '') : ''}
    ${lf.type === 'false' ? pick('Pull', 'pull', [['', 'None'], ['1', 'Drawer pull']], lf.pull ? '1' : '') : ''}
    ${size}
    ${lf.type === 'open' ? '' : pick('Style', 'style', styleOpts, lf.style || '')}
    ${lf.type === 'open' || !f0 ? '' : fsMidRows(`secm:${id}:${key}`, lf.mids, (() => { try { const st = frontStyle(c, f0); return st.framed ? { ds: st.ds, fw, fh: f0.z1 - f0.z0, kind: frontKind(c, f0, st.ds) } : null; } catch (_) { return null; } })())}
    <div class="fs-acts">
      <button class="btn sm" data-act="fs-reset" data-id="${key}" title="Take off this section's own style and hinge">Reset</button>
      <button class="btn sm danger" data-act="fs-del" data-id="${key}" title="Take section ${s.letter} out; the section beside it takes its room"${fsSecs(c).length > 1 ? '' : ' disabled'}>${icon('trash')}Delete</button></div>
    ${!inCol && !Number.isFinite(s.col) && c.rows.length > 1 ? `<div class="fs-move"><button class="btn sm icon-only" data-act="qe-rowmove" data-id="${s.row}:-1" title="Move this row up"${s.row ? '' : ' disabled'}>${icon('up')}</button><button class="btn sm icon-only" data-act="qe-rowmove" data-id="${s.row}:1" title="Move this row down"${s.row < c.rows.length - 1 ? '' : ' disabled'}>${icon('down')}</button></div>` : ''}
  </aside>`;
}
// Mozaik's Section Split box: direction, how many equal sections, and the face type they get.
// Ayden 2026-11-24: no OK step, every pick shows on the drawing at once (one undo step for the whole box).
function fsSplitBox(c, s) {
  const o = ui.fsSplit, dir = o.dir || 'h', n = o.n || 2, type = o.type ?? '';
  return `<div class="fs-dlg" role="dialog" aria-label="Section split">
    <div class="fs-dlgh">Section split<button class="btn sm icon-only fs-dlgx" data-act="fs-split-close" title="Close the split box (Undo takes the split back)">${icon('close')}</button></div>
    <div class="seg" role="group"><button data-act="fs-splitset" data-id="dir:h" aria-pressed="${dir === 'h'}" title="Top and bottom">${icon('hsplit')}Stacked</button><button data-act="fs-splitset" data-id="dir:v" aria-pressed="${dir === 'v'}" title="Side by side">${icon('vsplit')}Side by side</button></div>
    <label class="fs-row"><span># Equal sections</span><input type="number" min="2" max="12" step="1" value="${n}" data-fssplit="n" data-fslive="1" aria-label="Number of equal sections"></label>
    <label class="fs-row"><span>Face type</span><select data-fssplit="type" aria-label="Face type"><option value=""${type === '' ? ' selected' : ''}>Same as now</option>${FS_NEW.map(([v, l]) => `<option value="${v}"${type === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>`;
}

// Apply the open split box to its section. Picking again first takes back the box's last split (the undo step it made),
// so the whole box stays one undo step. Any other edit in between starts a fresh split.
function fsSplitLive() {
  const o = ui.fsSplit; if (!o) return;
  if (o.depth !== undefined && undoStack.length === o.depth && o.after === JSON.stringify(S)) S = attachRoom(JSON.parse(undoStack.pop()));
  const c = cab(o.cab); if (!c) { ui.fsSplit = null; renderQuick(); return; }
  let msg = '';
  mutate(() => { msg = fsSplit(c, o.key, o.dir, +o.n || 2, o.type || ''); });
  o.depth = undoStack.length; o.after = JSON.stringify(S);
  if (msg && msg !== o.msg) flash(msg); o.msg = msg;
}
function fsSplitInput(el) {
  const o = ui.fsSplit; if (!o) return;
  const k = el.dataset.fssplit, v = k === 'n' ? Math.max(2, Math.min(12, +el.value | 0)) : el.value;
  if (k === 'n' && (!el.value || +o.n === v)) return;
  if (o[k] === v) return; o[k] = v; fsSplitLive();
}
document.addEventListener('input', e => { const el = e.target; if (el && el.matches && el.matches('[data-fslive]')) fsSplitInput(el); }, true);

/* ---------- Interior tab ---------- */
function fsInteriorTab(c) {
  const id = c.id;
  if (c.made || (c.moz && typeof isMoz === 'function' && isMoz(c))) return `<div class="psec box"><div class="note show">${fsApFront(c) ? 'An appliance panel front has no inside.' : 'This product has no interior to set here.'}</div></div>`;
  const p = effParams(c), fr = computeFronts(c, p), lay = interiorLayout(c, p, fr), L = faceLetters(c);
  // The picked opening: a plain row's door or open opening, or a side-by-side section's.
  const zones = [...lay.zones.filter(z => z.row != null && !(lay.inner && lay.inner.rows.includes(z.row))).map(z => ({ key: String(z.row), z })), ...(lay.colZones || []).map(z => ({ key: z.cell, z })),
    ...(lay.inner ? lay.inner.zones.map(z => ({ key: z.key, z })) : [])];
  let key = ui.fsSel && ui.fsSelCab === id ? ui.fsSel : String(ui.qeRow | 0);
  if (!zones.some(z => z.key === key)) { const r0 = String(key).split(/[./]/)[0], r = zones.find(z => String(z.key).split(/[./]/)[0] === r0); key = r ? r.key : zones.length ? zones[0].key : key; }
  const sel = { key };
  const zn = zones.find(z => z.key === key);
  const auto = p.drawerRails !== 'off';
  const bottom = `<div class="fs-bottom">
      <label class="fs-chk"><input type="checkbox" data-act-change="fs-autoint" data-id="${id}"${auto ? ' checked' : ''}> Automate interior</label>
      <label class="fs-chk"><input type="checkbox" data-act-change="fs-finint" data-id="${id}"${c.finInt ? ' checked' : ''}> Finished interior</label>
      <span class="fs-gap"></span>
      <button class="btn sm${ui.fsIns ? ' on' : ''}" data-act="fs-ins" aria-pressed="${!!ui.fsIns}" title="Show the inserts library: roll-outs, waste bins, lazy susans, organizers">Inserts</button>
      ${(c.inserts || []).some(it => it.type === 'divider') ? `<button class="btn sm" data-act="int-del" data-id="-1:ins:${(c.inserts || []).findIndex(it => it.type === 'divider')}" title="Take out the vertical divider">Remove divider</button>` : `<button class="btn sm" data-act="fs-divider" data-id="${id}" title="A full height vertical divider down the middle of the cabinet">Vertical divider</button>`}
      <button class="btn sm" data-act="qe-clear-all" data-id="${id}" title="Take out every shelf and insert. Doors and drawers stay. Undo brings it back.">Clear</button></div>`;
  const draw = `<div class="fs-draw">${fsFaceSVG(c, sel, true)}</div>`;
  const panel = (typeof inSelPanel === 'function' && inSelPanel(c)) || (zn && String(key).includes('/') ? inLeafPanel(c, key, zn.z, L) : fsIntPanel(c, key, zn ? zn.z : null, L));
  const lib = ui.fsIns && !String(key).includes('.') && !String(key).includes('/') && zn ? `<div class="fs-lib">${intLibrary(c, +key)}</div>` : ui.fsIns ? '<div class="fs-lib"><div class="note show">Pick a full-width door or open opening to add inserts.</div></div>' : '';
  return `<div class="fs-tab">
    <div class="fs-work">${draw}${panel}</div>${lib}
    ${bottom}
    <div class="fs-status">${isPhone() ? 'Tap' : 'Click'} an opening to pick it, then add shelves and inserts or split it on the right. Click any shelf, partition, stretcher or insert to pick it (Shift or Ctrl for more), then change it or remove it. Automate interior adds the drawer stretchers and fixed shelves between rows, and a stop wherever the face splits at a door (a stretcher in a base, a fixed shelf in an upper or tall).</div></div>`;
}
// The panel right of the inside drawing for the picked opening.
function fsIntPanel(c, key, z, L) {
  const id = c.id;
  if (!z) return `<aside class="fs-panel"><div class="fs-head"><b>Interior</b></div><div class="note show">${(c.rows || []).length ? 'Drawers and false fronts have nothing inside to set. Pick a door or an open section.' : 'No openings.'}</div>${intWhole(c)}</aside>`;
  const h = z[1] - z[0], w = z.x1 !== undefined ? z.x1 - z.x0 : interiorLayout(c).inW;
  const head = `<div class="fs-head"><b>Opening ${esc(L[key] || '')}</b><span class="muted">${fmtLen(w, 1)} × ${fmtLen(h, 1)} inside</span></div>`;
  if (String(key).includes('.')) {
    const lf = fsLeaf(c, key), k = z.k | 0;
    return `<aside class="fs-panel">${head}
      <div class="fs-row"><span>Adjustable shelves</span><div class="fs-step"><button class="btn sm icon-only" data-act="fs-shelf" data-id="${key}:-1" aria-label="One shelf less"${k ? '' : ' disabled'}>−</button><b>${k}</b><button class="btn sm icon-only" data-act="fs-shelf" data-id="${key}:1" aria-label="One shelf more">+</button></div></div>
      ${lf && lf.shelves !== undefined && lf.shelves !== '' ? `<button class="btn sm" data-act="fs-shelf" data-id="${key}:auto" title="Let the shelf count follow the opening's height">Auto count</button>` : '<div class="note show">Shelf count follows the opening height. + or − sets it.</div>'}
      <div class="note show">This opening is beside another one, with a partition between them. Roll-outs and other inserts go in full-width openings.</div></aside>`;
  }
  const i = +key, add = (k, label) => `<button class="btn sm fs-add" data-act="int-add" data-id="${k}" title="Add ${label.toLowerCase()} to opening ${esc(L[key] || '')}">${intPic(k)}${label}</button>`;
  return `<aside class="fs-panel">${head}
    <div class="fs-adds"><span class="eyebrow">Add</span>${add('shelf', 'Adjustable shelf')}${i < c.rows.length - 1 ? add('fixed', 'Fixed shelf') : ''}${add('rollout', 'Roll-out')}${add('traydiv', 'Tray dividers')}${add('rod', 'Closet rod')}${add('separator', 'Separator')}</div>
    ${intContents(c, i)}${typeof inSplitBox === 'function' ? inSplitBox(c, key) : ''}${intWhole(c)}</aside>`;
}

/* ---------- Actions ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act^="fs-"]'); if (!b || b.disabled) return;
  const a = b.dataset.act, id = b.dataset.id || '', c = qeCab(); if (!c) return;
  e.stopPropagation();
  if (a === 'fs-pick') { fsPick(c, id); ui.fsSplit = null; ui.inSel = []; renderQuick(); return; }
  if (a === 'fs-mid') {
    const [ref, dim, d] = id.split('|'), cur = +(b.closest('.fs-step') || {}).querySelector?.('b')?.textContent || 0;
    // A new count starts its openings and mid widths over (they are numbered across the old count).
    mutate(() => { const o = resolve(ref); if (!o) return; if (d === 'auto') delete o[dim]; else o[dim] = Math.max(0, Math.min(MAX_MIDS, cur + +d)); if (dim === 'S') { delete o.W; delete o.ms; } else { delete o.H; delete o.mr; } });
    if (ui.pnPick && ui.pnPick.k !== 'stile' && ui.pnPick.k !== 'rail') ui.pnPick = null;
    return;
  }
  if (a === 'fs-pnpick') { const j = id.lastIndexOf('|'), [k, i] = id.slice(j + 1).split(':'), ref = id.slice(0, j); ui.pnPick = ui.pnPick && ui.pnPick.ref === ref && ui.pnPick.k === k && ui.pnPick.i === +i ? null : { ref, k, i: +i }; renderQuick(); return; }
  if (a === 'fs-pnreset') { mutate(() => { const o = resolve(id); if (o) ['sL', 'sR', 'rT', 'rB', 'W', 'H', 'ms', 'mr'].forEach(k => delete o[k]); }); return; }
  if (a === 'fs-split') {
    const [key, d] = [id.slice(0, id.lastIndexOf(':')), id.slice(id.lastIndexOf(':') + 1)];
    fsPick(c, key);
    // Like Mozaik: the split buttons open the Section Split box with the direction picked.
    // The split shows on the drawing right away; the box's picks redo it live.
    ui.fsSplit = { key, cab: c.id, dir: d === 'v' ? 'v' : 'h', n: 2, type: '' };
    fsSplitLive(); return;
  }
  if (a === 'fs-splitset') { const [k, v] = id.split(':'); if (ui.fsSplit) { ui.fsSplit[k] = v; fsSplitLive(); } return; }
  if (a === 'fs-split-close') { ui.fsSplit = null; renderQuick(); return; }
  if (a === 'fs-del') { let msg = ''; mutate(() => { msg = fsDelete(c, id); }); if (msg) flash(msg); return; }
  if (a === 'fs-reset') { mutate(() => { fsEnsureRows(c); const lf = fsLeaf(c, id); if (lf) { delete lf.style; delete lf.hinge; } }); return; }
  if (a === 'fs-equal') { mutate(() => { fsEnsureRows(c); fsEqual(c); }); return; }
  if (a === 'fs-clear') { mutate(() => fsClear(c)); flash('Face cleared to one front. Undo brings the sections back.'); return; }
  if (a === 'fs-ins') { ui.fsIns = !ui.fsIns; renderQuick(); return; }
  if (a === 'fs-divider') { let msg = ''; mutate(() => { msg = intApply(c, ui.qeRow | 0, 'divider'); }); if (msg) flash(msg); return; }
  if (a === 'fs-shelf') {
    const key = id.slice(0, id.lastIndexOf(':')), v = id.slice(id.lastIndexOf(':') + 1);
    mutate(() => {
      const lf = fsLeaf(c, key); if (!lf) return;
      if (v === 'auto') { delete lf.shelves; return; }
      const p = effParams(c), zn = (interiorLayout(c, p, computeFronts(c, p)).colZones || []).find(z => z.cell === key), now = zn ? zn.k : 0;
      lf.shelves = Math.max(0, Math.min(12, now + (+v)));
    }); return;
  }
}, true);
// The section panel's picks save as soon as they change.
document.addEventListener('change', e => {
  const el = e.target; if (!el.matches) return;
  if (el.matches('select[data-fspick]')) {
    const [cid, key, k] = el.dataset.fspick.split('|'), c = cab(cid), v = el.value; if (!c) return;
    mutate(() => {
      fsEnsureRows(c); const lf = fsLeaf(c, key); if (!lf) return;
      if (k === 'type') fsSetType(lf, v, key.includes('.'));
      else if (k === 'hinge') { if (v) lf.hinge = v; else delete lf.hinge; }
      else if (k === 'pull') { if (v) lf.pull = true; else delete lf.pull; }
      else if (k === 'style') { if (v) lf.style = v; else delete lf.style; }
    });
    return;
  }
  if (el.matches('[data-fssplit]')) { fsSplitInput(el); return; }
  const act = el.dataset && el.dataset.actChange, c = qeCab();
  if (!c || !act || !act.startsWith('fs-')) return;
  if (act === 'fs-lock') { const [key, dim] = [el.dataset.id.slice(0, el.dataset.id.lastIndexOf(':')), el.dataset.id.slice(el.dataset.id.lastIndexOf(':') + 1)]; mutate(() => fsLock(c, key, dim, el.checked)); }
  else if (act === 'fs-autoint') mutate(() => { c.params = c.params || {}; c.params.drawerRails = el.checked ? 'on' : 'off'; });
  else if (act === 'fs-finint') mutate(() => { c.finInt = el.checked; });
}, true);
