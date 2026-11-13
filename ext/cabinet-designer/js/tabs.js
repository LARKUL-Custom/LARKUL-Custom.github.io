// Library, materials, doors, hardware, countertops, moldings, panels, cut list and export tabs.
'use strict';
// Counts cabinets in every room, with room settings applied.
const usedBy = pred => S.rooms.reduce((n, r) => n + withRoom(r, () => r.cabinets.filter(pred).length), 0);
const nCab = n => `${n} cabinet${n === 1 ? '' : 's'}`;
const cardHead = (title, right) => `<div class="cardhead"><h3>${title}</h3><div class="row-actions">${right || ''}</div></div>`;
const delBtn = (act, id, disabled, label = 'Delete') => `<button class="btn sm danger" data-act="${act}" data-id="${id}"${disabled ? ' disabled' : ''}>${label}</button>`;
const dupBtn = (act, id) => `<button class="btn sm" data-act="${act}" data-id="${id}">Duplicate</button>`;

/* ---------- Generic list editor (drill patterns) ---------- */
function listEditor(ref, prop, cols, rows) {
  const r = `sub:${prop}|${ref}`;
  return `<div class="tscroll"><table class="t rowsed"><thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}<th></th></tr></thead><tbody>${(rows || []).map((row, i) => `<tr>${cols.map(c => `<td style="${c.w ? 'width:' + c.w + 'px' : ''}">${c.type === 'select' ? ctl(r, i + '.' + c.k, row[c.k], 'select', { options: c.options, label: c.label }) : ctl(r, i + '.' + c.k, row[c.k], c.type || 'num', { label: c.label })}</td>`).join('')}<td style="width:28px"><button class="btn sm" data-act="list-del" data-ref="${esc(ref)}" data-prop="${prop}" data-i="${i}" aria-label="Remove">×</button></td></tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="muted">None</td></tr>`}</tbody></table></div>
  <div class="row-actions"><button class="btn sm" data-act="list-add" data-ref="${esc(ref)}" data-prop="${prop}">Add hole</button></div>`;
}

/* ---------- Part drawing ----------
   Black and white like Mozaik: a white part with a black outline, and the only colour is the operations:
   grey on the face up, green on the flip side, red for the one picked (opt.sel). Banded edges get a thin inner line.
   Each operation is a group with
   data-pe-op ('u3' = the part editor's own operation 3, 'g5' = the fifth one from the cabinet); opt.hit adds wide
   see-through copies so even a 5 mm hole is easy to click. */
// The face most holes, grooves and routes are on is machined face up; the one opposite it is the flip side. Same rule as the CNC file.
function partFaces(p) {
  const cnt = {}; (p.ops || []).forEach(o => { if (o.face && (o.type === 'bore' || o.type === 'groove' || o.type === 'path')) cnt[o.face] = (cnt[o.face] || 0) + 1; });
  const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || null, OPP = typeof CNC_OPPOSITE !== 'undefined' ? CNC_OPPOSITE : {};
  return { top, back: top ? OPP[top] || null : null };
}
// The key of every operation, in q.ops order: the part editor's own ones by number, the cabinet's counted in order.
function partOpKeys(p) { let g = 0; return p.ops.map(o => o.user !== undefined ? 'u' + o.user : o.type === 'notch' ? '' : 'g' + (g++)); }
function partSVG(p, maxH, opt) {
  opt = opt || {};
  const pad = Math.max(p.L, p.W) * 0.06 + 1.5, fs = Math.max(p.L, p.W) / 34 + 0.6;
  let s = `<svg class="partsvg" viewBox="${-pad} ${-pad} ${p.L + 2 * pad} ${p.W + 2 * pad + fs * 2}" style="max-height:${maxH || 320}px">`;
  s += p.outline ? `<polygon class="pp-part nss" points="${p.outline.map(q => `${q.x},${r3(p.W - q.y)}`).join(' ')}"/>` : `<rect class="pp-part nss" x="0" y="0" width="${p.L}" height="${p.W}"/>`;
  // Edge banding: a thin black line just inside each banded edge, the way a shop drawing marks it.
  const bi = fs * 0.24, bl = { L1: [0, bi, p.L, bi], L2: [0, p.W - bi, p.L, p.W - bi], W1: [bi, 0, bi, p.W], W2: [p.L - bi, 0, p.L - bi, p.W] };
  EDGE_KEYS.forEach(k => { if (p.band && edgeband(p.band[k])) { const [x1, y1, x2, y2] = bl[k]; s += `<line class="pp-band nss" x1="${r3(x1)}" y1="${r3(y1)}" x2="${r3(x2)}" y2="${r3(y2)}"/>`; } });
  const { back } = partFaces(p), keys = partOpKeys(p);
  // The shape of one operation, without its class; null when it has nothing to draw (an edge profile).
  const geo = o => {
    if (o.type === 'pocket' || o.type === 'cutout') return [o.type === 'cutout' ? 'pp-cutout' : 'pp-pocket', `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}"`];
    if (o.type === 'rabbet') return ['pp-pocket open', `<rect x="${o.x - o.width}" y="${o.y - o.width}" width="${o.w + 2 * o.width}" height="${o.h + 2 * o.width}"`];
    if (o.type === 'profile') return ['pp-pocket', `<rect x="${o.x + o.inset}" y="${o.y + o.inset}" width="${Math.max(0, o.w - 2 * o.inset)}" height="${Math.max(0, o.h - 2 * o.inset)}"`];
    if (o.type === 'groove') return ['pp-groove', `<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke-width="${o.width}"`];
    if (o.type === 'path') { const pp = o.pts.map(q => `${q.x},${q.y}`).join(' '); return o.pocket ? ['pp-pocket', `<polygon points="${pp}"`] : ['pp-path', `<${o.closed ? 'polygon' : 'polyline'} points="${pp}" stroke-width="${o.dia || 0.375}"`]; }
    if (o.type === 'bore') return ['pp-bore', `<circle cx="${o.x}" cy="${o.y}" r="${Math.max(o.dia / 2, 0.09)}"`];
    if (o.type === 'hbore') { const k = Math.max(0.35, fs * 0.4); return ['pp-hbore', `<path d="M${o.x} ${o.y} l${o.x ? 1.4 * k : -1.4 * k} ${-k} v${2 * k} z"`]; }
    if (o.type === 'edgeslot') return ['pp-hbore', `<rect x="${o.x ? o.x - 0.3 : 0}" y="${o.y - o.len / 2}" width="0.3" height="${o.len}"`];
    if (o.type === 'pockethole') return ['pp-pocket', `<rect x="${o.x - 0.5}" y="${o.y - 0.19}" width="1" height="0.38" rx="0.19"`];
    return null;
  };
  const one = (o, i) => {
    if (o.type === 'notch') return `<rect class="pp-notch nss" x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}"/>`;
    const g = geo(o); if (!g) return '';
    const k = keys[i], cls = `po${back && o.face === back ? ' flip' : ''}${opt.sel && k === opt.sel ? ' sel' : ''}`;
    const nss = /pp-groove|pp-path/.test(g[0]) ? '' : ' nss';
    return `<g class="${cls}" data-pe-op="${k}">${g[1]} class="${g[0]}${nss}"/>${opt.hit ? `${g[1]} class="pe-hit"/>` : ''}</g>`;
  };
  // Holes go on top of the routes and pockets, and the picked operation on top of everything.
  const order = p.ops.map((o, i) => i).sort((a, b) => {
    const r = i => (opt.sel && keys[i] === opt.sel ? 2 : 0) + (['bore', 'hbore', 'edgeslot', 'pockethole'].includes(p.ops[i].type) ? 1 : 0);
    return r(a) - r(b) || a - b;
  });
  order.forEach(i => { s += one(p.ops[i], i); });
  s += `<text class="lbl-m" x="${p.L / 2}" y="${p.W + fs * 1.5}" font-size="${fs}" text-anchor="middle">${fmtLen(p.L, 1)} (x)</text>`;
  s += `<text class="lbl-m" x="${-fs * 0.6}" y="${p.W / 2}" font-size="${fs}" text-anchor="middle" transform="rotate(-90 ${-fs * 0.6} ${p.W / 2})">${fmtLen(p.W, 1)} (y)</text>`;
  s += `<circle class="pp-origin" cx="0" cy="0" r="${fs * 0.18}"/></svg>`;
  return s;
}
// Small edge diagram for a part kind: the outline with banded edges drawn thick, laid out like the part drawing (L1 on top).
function bandDiagram(band, kind, w = 120, h = 54) {
  const pad = 13, W = w - 2 * pad, H = h - 2 * pad;
  const pos = { L1: [pad, pad, pad + W, pad, w / 2, 9], L2: [pad, pad + H, pad + W, pad + H, w / 2, h - 2], W1: [pad, pad, pad, pad + H, 6, h / 2 + 3], W2: [pad + W, pad, pad + W, pad + H, w - 6, h / 2 + 3] };
  let s = `<svg class="bandsvg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><rect class="bd-part" x="${pad}" y="${pad}" width="${W}" height="${H}"/>`;
  EDGE_KEYS.forEach(k => {
    const [x1, y1, x2, y2, tx, ty] = pos[k], b = edgeband(band[k]);
    if (b) s += `<line class="bd-band-o" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="bd-band" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:${esc(b.color || '#c90')}"/>`;
    s += `<text class="bd-txt${b ? ' on' : ''}" x="${tx}" y="${ty}" text-anchor="middle">${k}</text>`;
  });
  return s + '</svg>';
}
const swatchBand = b => b ? `<span class="ebsw" style="background:${esc(b.color || '#ccc')}"></span>` : '';
function frontPreviewSVG(c, maxH, dims, open, inside) {
  const tmpL = LBL[c.id]; LBL[c.id] = LBL[c.id] || 'P';
  const f = frontsSVG(c, 0, 0, { withDefs: true, dims: inside ? 0 : dims || 0, open: !!open, noFronts: !!inside }); LBL[c.id] = tmpL;
  const s = Math.max(c.w, c.h) + 6;
  return `<svg viewBox="${-(s - c.w) / 2} ${-c.h - 3} ${s} ${c.h + 6}" style="max-height:${maxH || 260}px"><defs>${texDefs(f.mats.filter(Boolean))}</defs>${f.svg}<line class="ev-floor nss" x1="${-(s - c.w) / 2}" x2="${(s + c.w) / 2}" y1="0" y2="0"/></svg>`;
}
function sampleCab(over = {}) {
  const lib = libItem('b-1d1dr') || S.library[0];
  const c = newCab(S, lib, null, 1, 0); c.id = '_sample'; LBL[c.id] = 'Sample';
  return Object.assign(c, over);
}

/* ---------- Library ---------- */
function renderLibrary() {
  const sl = String(ui.libSel || '').startsWith('shape:') ? shapeLibItem(ui.libSel.slice(6)) : null;
  const l = sl ? null : libItem(ui.libSel), cats = ['Base', 'Wall', 'Tall'], jp = S.job.params;
  const fake = l ? { ...newCab(S, l, null, 1, 0), id: '_lib' } : null;
  $('#tab-library').innerHTML = `<div class="pagehead"><div><h2>Products${(S.libSet || 'main') !== 'main' ? ` <span class="muted">· ${esc((PRODUCT_LIBS.find(x => x.id === S.libSet) || {}).name || '')}</span>` : ''}</h2></div>
    <div class="row-actions"><button class="btn primary" data-act="designer-new">${icon('plus')}Design a new cabinet</button></div></div>
  <div class="plx">
    <div class="card plx-list">${cardHead('Product list', `<span class="ln-n">${S.library.filter(x => x.cat !== 'Shape').length + (S.shapeLib || []).length}</span>`)}<div class="cardbody libtree">${productPageTree()}
      <button class="btn sm" data-act="shape-new">${icon('plus')}Draw a new shape</button></div></div>
    ${sl ? shapeLibCard(sl) : l ? `<div class="plx-main">
      <div class="card plx-pic">${cardHead(esc(l.name), `<button class="btn sm primary" data-act="designer-load" data-id="${l.id}">${icon('edit')}Edit in Designer</button><button class="btn sm" data-act="lib-place" data-id="${l.id}">Place in room</button>${dupBtn('lib-dup', l.id)}${delBtn('lib-del', l.id)}`)}
        <div class="plx-pv">${typeof edDimmed === 'function' ? edDimmed(fake, frontPreviewSVG(fake, 520)) : frontPreviewSVG(fake, 520)}</div>
        ${libStats(l, fake)}</div>
      <div class="card plx-props">${cardHead('Product', '')}<div class="cardbody">
          ${fld('Name', 'lib:' + l.id, 'name', l.name, 'text', { wide: true })}
          ${fld('Category', 'lib:' + l.id, 'cat', l.cat, 'select', { options: cats })}${fld('Products group', 'lib:' + l.id, 'group', libGroup(l), 'select', { options: LIB_GROUPS.map(([v, t]) => ({ v, l: t })) })}
          ${fld('Folder', 'lib:' + l.id, 'folder', l.folder || '', 'text', { wide: true, ph: libFolder({ ...l, folder: '' }) })}</div>
        ${cardHead('Size', '')}<div class="cardbody">${fld('Width', 'lib:' + l.id, 'w', l.w, 'len')}${fld('Height', 'lib:' + l.id, 'h', l.h, 'len')}${fld('Depth', 'lib:' + l.id, 'd', l.d, 'len')}${fld('Elevation', 'lib:' + l.id, 'elev', l.elev, 'len')}</div>
      </div></div>` : '<div class="card cardbody">No templates yet.</div>'}
  </div>`;
}
// Coloured tiles under the product picture: how it is built, how many are in this job, what one costs.
function libStats(l, fake) {
  let fr = [], parts = 0, price = '';
  try { fr = computeFronts(fake); parts = buildParts(fake).parts.filter(p => p.cabId === fake.id).reduce((a, p) => a + p.qty, 0); } catch (_) {}
  try { const ps = typeof priceSheet === 'function' && priceSheet(); if (ps) price = money(priceCab(fake, ps).total); } catch (_) { price = ''; }
  const used = (() => { try { return allCabs().filter(c => c.libId === l.id).length; } catch (_) { return 0; } })();
  const n = t => fr.filter(f => f.type === t).length, t = (tone, ic, v, lb) => `<div class="edx-stat ${tone}">${icon(ic)}<b>${v}</b><span>${lb}</span></div>`;
  return `<div class="edx-stats plx-stats">${t('violet', 'door', n('door'), 'Doors')}${t('teal', 'shelf', n('drawer'), 'Drawers')}${t('amber', 'list', parts, 'Parts')}${t('blue', 'home', used, 'In this job')}${price ? t('green', 'tag', price, 'Price each') : ''}</div>`;
}
// Short name for the Small library: "Base 3 Drawer" → "Base 3-D", "Base 1 Door 1 Drawer" → "Base 1-DR 1-D".
// The Products page list: the same folding groups and folders as the room's product tree, with a Find box.
function productPageTree() {
  pickState(); const q = (ui.pickQ.prod || '').trim().toLowerCase();
  const all = S.library.filter(x => x.cat !== 'Shape').map(x => ({ id: x.id, g: libGroup(x), f: libFolder(x), name: x.name, html: libButton(x, 'lib-sel', x.id === ui.libSel) }))
    .concat((S.shapeLib || []).map(x => ({ id: 'shape:' + x.id, g: shapeGroup(x), f: shapeFolder(x), name: x.name, html: shapeLibButton(x, 'shape:' + x.id === ui.libSel) })));
  const gname = g => (LIB_GROUPS.find(([k]) => k === g) || [])[1] || '';
  const list = all.filter(x => !q || x.name.toLowerCase().includes(q) || gname(x.g).toLowerCase().includes(q) || x.f.toLowerCase().includes(q));
  const body = LIB_GROUPS.map(([g, gl]) => {
    const items = list.filter(x => x.g === g); if (!items.length) return '';
    const fk = 'prod/' + g, shut = !q && foldShut(fk), folders = [...new Set(items.map(x => x.f))];
    const inner = folders.length === 1 ? `<div class="grp">${items.map(x => x.html).join('')}</div>`
      : folders.map(f => { const k = fk + '/' + f, fs = !q && foldShut(k), fi = items.filter(x => x.f === f); return `<div class="lfold">${foldHead(k, esc(f), fi.length, fs, 'lfold-h')}${fs ? '' : `<div class="grp">${fi.map(x => x.html).join('')}</div>`}</div>`; }).join('');
    return `<div class="lgrp lg-${g}">${foldHead(fk, gl, items.length, shut, 'lgrp-h')}${shut ? '' : inner}</div>`;
  }).join('');
  return `<label class="f pick-findf"><span>Find</span><input type="search" class="pick-find" data-key="prod" value="${esc(ui.pickQ.prod || '')}" placeholder="Type part of a name" aria-label="Find products"></label>${body || '<div class="note show">No products match.</div>'}`;
}
function libShort(name) {
  return String(name).replace(/(\d+)\s*doors?\b/gi, '$1-DR').replace(/(\d+)\s*drawers?\b/gi, '$1-D')
    .replace(/\bdoors?\b/gi, 'DR').replace(/\bdrawers?\b/gi, 'D').replace(/\s+/g, ' ').trim();
}
// Floating shelves, panels and other custom shapes on the Products page: the room's button, picking it here instead.
function shapeLibButton(l, on) {
  return shapeButton(l).replace(`data-act="shape-pick" data-id="${l.id}"`, `data-act="lib-sel" data-id="shape:${l.id}"`).replace(/class="srcitem libbtn( on)?"/, `class="libitem shapeitem${on ? ' on' : ''}"`);
}
function shapeLibCard(l) {
  const R = 'slib:' + l.id, b = shapeBox(l.pts), o = shapeLocal(l).out, k = Math.max(b.w, b.h), m = mat(l.mat);
  return `<div class="card">${cardHead(esc(l.name), `<button class="btn sm" data-act="shape-pick" data-id="${l.id}" data-tab="room">Place in room</button><button class="btn sm" data-act="shape-lib-edit" data-id="${l.id}">Open in shape editor</button>${delBtn('shape-lib-del', l.id)}`)}
    <div class="cardbody"><div class="split2"><div class="stack">
      ${fld('Name', R, 'name', l.name, 'text', { wide: true })}
      ${fld('Products group', R, 'group', shapeGroup(l), 'select', { options: LIB_GROUPS.map(([v, t]) => ({ v, l: t })), wide: true })}${fld('Folder', R, 'folder', l.folder || '', 'text', { ph: shapeFolder({ ...l, folder: '' }), wide: true })}
      ${fld('Material', R, 'mat', l.mat, 'select', { options: matOpts(), wide: true })}
      <div class="note">${fmtLen(b.w)} × ${fmtLen(b.h)}, ${l.plane === 'flat' ? 'lying flat' : 'standing upright'}. Change the outline in the shape editor.</div></div>
      <div class="preview pad"><svg viewBox="${-k * 0.08} ${-k * 0.08} ${k * 1.16} ${k * 1.16}" style="max-height:300px" aria-hidden="true"><polygon class="nss" style="fill:${esc((m && m.color) || '#d6b07c')};stroke:var(--ink);stroke-width:1.5px" points="${o.map(p => `${r3(p.x)},${r3(l.plane === 'flat' ? p.y : b.h - p.y)}`).join(' ')}"/></svg></div>
    </div></div></div>`;
}
function libButton(l, act, on) {
  return `<button class="libitem${on ? ' on' : ''}" data-act="${act}" data-id="${l.id}" data-drag="lib:${l.id}" title="${esc(l.name)}">${miniFront(l)}<span><span class="nm">${esc(l.name)}</span><span class="ab">${esc(libShort(l.name))}</span><span class="dm">${fmtLen(l.w)} × ${fmtLen(l.h)} × ${fmtLen(l.d)}</span></span></button>`;
}
function miniFront(l) {
  const fake = { ...l, construction: l.construction || defaultConstruction(l.cat), libParams: l.params, params: {} };
  const fr = computeFronts(fake), s = Math.max(l.w, l.h);
  return `<svg viewBox="${-(s - l.w) / 2 - 1} -1 ${s + 2} ${s + 2}" aria-hidden="true"><g transform="translate(0 ${s - l.h})"><rect class="ev-box nss${l.cat === 'Wall' ? ' wallc' : ''}" x="0" y="0" width="${l.w}" height="${l.h}"/>${fr.filter(f => f.type !== 'open').map(f => { const [a, b] = frontEX(f); return b - a < 0.25 ? '' : `<rect class="ev-front nss" x="${a}" y="${l.h - f.z1}" width="${b - a}" height="${f.z1 - f.z0}"/>`; }).join('')}</g></svg>`;
}

/* ---------- Materials ---------- */
// Whole job: every room adds to the totals.
function materialUsage() {
  const use = {}, bom = {};
  S.materials.forEach(m => use[m.id] = { area: 0, count: 0, edge: 0 });
  S.rooms.forEach(rm => withRoom(rm, () => {
    allParts().forEach(p => {
      const u = use[p.mat]; if (!u) return;
      u.area += p.L * p.W * p.qty; u.count += p.qty;
      u.edge += bandLen(p) * p.qty;
    });
    countertopRuns().filter(r => r.on).forEach(r => { const u = use[r.tpl.mat]; if (u) { u.area += r.len * r.depth; u.count++; } });
    moldingRuns().forEach(r => { const u = use[r.m.mat]; if (u) { u.area += r.len * r.h * 1.1; u.count++; } });
    S.cabinets.forEach(c => { const b = buildParts(c); Object.entries(b.bom).forEach(([k, q]) => bom[k] = (bom[k] || 0) + q); });
  }));
  return { use, bom };
}
// Materials page, Mozaik style: a grouped list with swatches on the left, one material's picture and boxes on the right.
// Group names in the order shown: the saved order first, then any new ones A to Z, then No group.
function matGroups() {
  const all = [...new Set(S.materials.map(m => m.group || ''))], ord = (S.matGroupOrder || []).filter(g => all.includes(g));
  return [...ord, ...all.filter(g => !ord.includes(g)).sort((a, b) => (a === '') - (b === '') || a.localeCompare(b))];
}
// Drag a material onto another material (goes just above it, into its group) or onto a group heading (goes to the end of that group).
// Drag a group heading onto another group heading to move the whole group above it.
function matDrop(kind, from, to, toGrp, before) {
  mutate(() => {
    if (kind === 'grp') {
      const gs = matGroups().filter(g => g !== from), i = gs.indexOf(toGrp);
      gs.splice(i < 0 ? gs.length : i + (before ? 0 : 1), 0, from); S.matGroupOrder = gs;
      return;
    }
    const m = S.materials.find(x => x.id === from); if (!m) return;
    if (!S.matGroupOrder) S.matGroupOrder = matGroups();
    S.materials.splice(S.materials.indexOf(m), 1); m.group = toGrp || '';
    let i;
    if (to) { i = S.materials.findIndex(x => x.id === to); if (i < 0) i = S.materials.length; else if (!before) i++; }
    else { const last = S.materials.map(x => x.group || '').lastIndexOf(m.group); i = last < 0 ? S.materials.length : last + 1; }
    S.materials.splice(i, 0, m);
  });
  foldOpen('mat/' + (toGrp || ''));
}
(() => {
  let drag = null;
  const clear = () => document.querySelectorAll('.mdrop-a,.mdrop-b,.mdrop-in').forEach(x => x.classList.remove('mdrop-a', 'mdrop-b', 'mdrop-in'));
  const target = e => { const t = e.target.closest && e.target.closest('#tab-materials [data-mdrag]'); if (!t || !drag) return null; if (drag.kind === 'grp' && t.dataset.mdrag !== 'grp') return null; const r = t.getBoundingClientRect(); return { t, before: e.clientY < r.top + r.height / 2 }; };
  document.addEventListener('dragstart', e => { const t = e.target.closest && e.target.closest('#tab-materials [data-mdrag]'); if (!t) return; drag = { kind: t.dataset.mdrag, id: t.dataset.mdrag === 'grp' ? t.dataset.mgrp : t.dataset.id }; e.dataTransfer.setData('text/x-cdmat', '1'); e.dataTransfer.effectAllowed = 'move'; t.classList.add('mdragging'); });
  document.addEventListener('dragend', e => { drag = null; clear(); document.querySelectorAll('.mdragging').forEach(x => x.classList.remove('mdragging')); });
  document.addEventListener('dragover', e => { const h = target(e); if (!h) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; clear(); h.t.classList.add(drag.kind === 'mat' && h.t.dataset.mdrag === 'grp' ? 'mdrop-in' : h.before ? 'mdrop-b' : 'mdrop-a'); });
  document.addEventListener('drop', e => { const h = target(e); if (!h) return; e.preventDefault(); const d = drag; clear(); drag = null;
    if (d.kind === 'grp') { if (h.t.dataset.mgrp !== d.id) matDrop('grp', d.id, null, h.t.dataset.mgrp, h.before); return; }
    if (h.t.dataset.mdrag === 'grp') matDrop('mat', d.id, null, h.t.dataset.mgrp);
    else if (h.t.dataset.id !== d.id) matDrop('mat', d.id, h.t.dataset.id, h.t.dataset.mgrp, h.before);
  });
})();
function matListHTML(use, sheetsOf) {
  // Your own order: groups in S.matGroupOrder (new ones after, A to Z), materials in library order. Drag to change either.
  pickState(); const fq = (ui.pickQ.mat || '').toLowerCase();
  const shown = S.materials.filter(x => pickMatch(x, fq) || String(x.group || '').toLowerCase().includes(fq));
  const rows = [];
  matGroups().forEach(g => { const items = shown.filter(x => (x.group || '') === g); if (!items.length && fq) return; const fk = 'mat/' + g, shut = !fq && foldShut(fk); rows.push({ hdr: g || 'No group', g, fk, n: items.length, shut }); if (!shut) items.forEach(x => rows.push(x)); });
  const anyOpen = rows.some(x => x.hdr && !x.shut);
  const body = rows.map(x => x.hdr ? `<div class="lgrp mg" draggable="true" data-mdrag="grp" data-mgrp="${esc(x.g)}">${foldHead(x.fk, esc(x.hdr), x.n, x.shut, 'lgrp-h')}</div>`
    : `<button class="mli${x.id === ui.matSel ? ' on' : ''}" draggable="true" data-mdrag="mat" data-mgrp="${esc(x.group || '')}" data-act="mat-sel" data-id="${x.id}">${swatch(x, 30)}<span><b>${esc(x.name)}</b><small>${esc(fmtLen(x.thick))}${(use[x.id] || {}).count ? ` · ${sheetsOf(x)} ${x.kind === 'top' ? 'tops' : 'sheets'}` : ''}</small></span></button>`).join('');
  const q = (ui.pickQ || {}).mat || '';
  return `<div class="cardbody libtree"><label class="f pick-findf"><span>Find</span><input type="search" class="pick-find" data-key="mat" value="${esc(q)}" placeholder="Find a material" aria-label="Find materials"></label>
    <div class="mlx-tools"><button class="btn sm" data-act="mat-sort" title="Put the materials in each group thickest first, then by name. Drag to change it after.">${icon('sort')}Sort</button><button class="btn sm" data-act="lp-expall" data-id="mat" title="Save every material to a file">${icon('download')}Export</button><label class="btn sm" title="Add materials from a file">${icon('upload')}Import<input type="file" class="lp-imp" data-key="mat" accept=".json,application/json" hidden></label>${aiAskBtn('mat')}</div>
    <button class="mlx-foldall" data-act="mat-fold-all" data-id="${anyOpen ? 'shut' : 'open'}">${anyOpen ? 'Close all groups' : 'Open all groups'}</button>
    ${body || '<div class="note show">No materials match.</div>'}</div>`;
}
function matDetailHTML(m, u, sheets, kinds) {
  const R = 'mat:' + m.id, tx = texURL(m), sheet = (m.kind || 'sheet') === 'sheet';
  const t = (tone, ic, v, lb) => `<div class="edx-stat ${tone}">${icon(ic)}<b>${v}</b><span>${lb}</span></div>`;
  return `<div class="plx-main mlx-main">
    <div class="card plx-pic">${cardHead(esc(m.name), `${libRowBtns('mat', m.id)}<button class="btn sm danger" data-act="mat-del" data-id="${m.id}">${icon('trash')}Delete</button>`)}
      <div class="mlx-pv"><label class="mlx-sw" title="Click to upload a texture photo" style="background-color:${esc(m.color || '#ccc')}${tx ? `;background-image:url('${tx}')` : ''}"><input type="file" accept="image/*" data-tex="${m.id}" hidden><span class="mlx-up">${icon('upload')}Upload a photo</span></label>
        <div class="mlx-cap"><b>${esc(m.name)}</b><span>${esc((kinds.find(k => k.v === (m.kind || 'sheet')) || {}).l || '')} · ${fmtLen(m.thick)} thick${sheet ? ` · ${fmtLen(m.sheetW)} × ${fmtLen(m.sheetL)} sheet` : ''}</span></div></div>
      <div class="edx-stats plx-stats mlx-stats">${t('amber', 'list', u.count, 'Parts in this job')}${t('blue', 'cube', (u.area / 144).toFixed(1), 'Square feet')}${t('violet', 'stack', sheets, m.kind === 'top' ? 'Tops' : 'Sheets with waste')}${t('green', 'tag', '$' + Math.round(sheets * (m.cost || 0)).toLocaleString(), 'Cost in this job')}</div></div>
    <div class="card plx-props mlx-props">
      ${cardHead('Material', '')}<div class="cardbody">${fld('Name', R, 'name', m.name, 'text', { wide: true })}${fld('Group', R, 'group', m.group || '', 'text', { ph: 'No group', list: 'matgroups' })}${fld('Kind', R, 'kind', m.kind || 'sheet', 'select', { options: kinds })}</div>
      ${cardHead('Size', '')}<div class="cardbody">${fld('Thickness', R, 'thick', m.thick, 'len')}${sheet || m.kind === 'top' ? fld('Sheet width', R, 'sheetW', m.sheetW, 'len') + fld('Sheet length', R, 'sheetL', m.sheetL, 'len') : ''}<div class="mlx-checks">${fld('Has grain', R, 'grain', m.grain, 'bool')}${fld('Takes the room finish', R, 'dynamic', !!m.dynamic, 'bool')}</div></div>
      ${cardHead('Look', '')}<div class="cardbody">${fld('Color', R, 'color', m.color, 'color')}${fld('Texture size', R, 'texScale', m.texScale || 24, 'len')}<div class="mlx-tex"><button class="btn sm" data-act="tex-lib" data-id="${m.id}">${icon('palette')}Texture library</button>${m.texture ? `<button class="btn sm" data-act="tex-clear" data-id="${m.id}">Clear texture</button>` : ''}</div></div>
      ${cardHead('Price and CNC', '')}<div class="cardbody">${fld(m.kind === 'top' ? 'Cost per top' : 'Cost per sheet', R, 'cost', m.cost, 'num')}${sheet ? fld('CNC feed %', R, 'feedRate', m.feedRate || 100, 'num') : ''}</div>
    </div><datalist id="matgroups">${[...new Set(S.materials.map(x => x.group).filter(Boolean))].sort().map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>`;
}
function renderMaterials() {
  ensureLibPrices();
  const { use, bom } = materialUsage();
  let totalCost = 0, totalSheets = 0;
  const kinds = [{ v: 'sheet', l: 'Sheet' }, { v: 'top', l: 'Countertop' }, { v: 'solid', l: 'Solid wood' }];
  S.materials.forEach(m => { const u = use[m.id], sheets = u.area ? Math.ceil(u.area * 1.15 / (m.sheetW * m.sheetL)) : 0; totalSheets += m.kind === 'top' ? 0 : sheets; totalCost += sheets * (m.cost || 0); });
  const sheetsOf = m => { const u = use[m.id]; return u && u.area ? Math.ceil(u.area * 1.15 / (m.sheetW * m.sheetL)) : 0; };
  if (!mat(ui.matSel)) ui.matSel = (S.materials[0] || {}).id;
  const view = ['mats', 'finishes', 'templates', 'hw'].includes(ui.matView) ? ui.matView : 'mats';
  const mc = S.matTemplates.cabinet, md = S.matTemplates.drawer;
  const m = mat(ui.matSel), tabs = [['mats', 'Materials', S.materials.length, 'palette'], ['finishes', 'Finishes', finishList().length, 'face'], ['templates', 'Material templates', matSets().length + mc.length + md.length, 'stack'], ['hw', 'Hardware list', Object.keys(bom).length, 'sliders']];
  const tabRow = `<div class="mlx-tabs" role="tablist">${tabs.map(([k, l, n, ic]) => `<button role="tab" data-act="mat-view" data-id="${k}" aria-selected="${view === k}">${icon(ic)}<span>${l}</span><span class="ct">${n}</span></button>`).join('')}</div>`;
  const totals = `<span class="mlx-sum"><b>${totalSheets}</b> sheets<i></i><b>$${totalCost.toLocaleString()}</b> material<i></i><b>${allCabs().length}</b> cabinets</span>`;
  $('#tab-materials').innerHTML = `<div class="pagehead"><div><h2>Materials</h2><p>Pick a material on the left to see and change it. Click the big swatch to upload your own texture photo. Finishes say what finished parts are cut from; templates bundle materials so a cabinet picks one template instead of five materials.</p></div><div class="row-actions">${totals}${view === 'mats' ? `<button class="btn" data-act="tex-lib" data-id="">From texture library</button><button class="btn primary" data-act="mat-add">${icon('plus')}Add material</button>` : ''}</div></div>
  ${saveNote ? `<div class="warnbox">${esc(saveNote)}</div>` : ''}${tabRow}
  ${view === 'mats' ? `<div class="plx mlx"><div class="card plx-list">${matListHTML(use, sheetsOf)}</div>${m ? matDetailHTML(m, use[m.id] || { area: 0, count: 0, edge: 0 }, sheetsOf(m), kinds) : '<div class="card cardbody note">No materials yet.</div>'}</div>` : ''}
  ${view === 'finishes' ? `  <div class="card">${cardHead('Finishes', '<span class="note">Pick a finish by name (Alder, Paint grade…) for the job or a room. It says what every finished part is cut from; unfinished parts use the cabinet material.</span><button class="btn sm" data-act="fin-add">Add</button>')}<div class="cardbody">${finishList().map(f => { const n = allCabs().filter(c => (finishOf(c) || {}).id === f.id).length; return `<div class="tplrow msrow">
      <div class="tplhead">${swatch(mat(f.front), 22)}${ctl('fin:' + f.id, 'name', f.name, 'text', { label: 'Finish name' })}<span class="note">${nCab(n)}</span>${delBtn('fin-del', f.id, finishList().length < 2, '×')}</div>
      <div class="autogrid">${FINISH_ROLES.map(([k, l]) => fld(l, 'fin:' + f.id, k, f[k] || '', 'select', { options: k === 'solid' || k === 'front' ? azOpts(S.materials, m => (m.kind || 'sheet') !== 'top') : matOpts('sheet') })).join('')}</div></div>`; }).join('')}</div></div>
` : ''}
  ${view === 'templates' ? `<div class="card">${cardHead('Material templates', '<span class="note">Doors, finish, cabinet and drawers in one pick. Swap the whole job under Settings › Room settings.</span><button class="btn sm" data-act="mset-add">Add</button>')}<div class="cardbody">${matSets().map(t => { const on = MAT_SET_KEYS.every(k => t[k] === S.job.defaults[k]); return `<div class="tplrow msrow">
      <div class="tplhead">${swatch(mat(doorStyle(doorTpl(t.doorT).door).mat), 22)}${ctl('mset:' + t.id, 'name', t.name, 'text', { label: 'Material template name' })}${on ? '<span class="chip cab">This job</span>' : ''}${delBtn('mset-del', t.id, false, '×')}</div>
      <div class="autogrid">${fld('Doors', 'mset:' + t.id, 'doorT', t.doorT, 'select', { options: opts(S.doorTemplates) })}${fld('Finish', 'mset:' + t.id, 'finish', t.finish || '', 'select', { options: opts(finishList()) })}${fld('Cabinet', 'mset:' + t.id, 'cabMatT', t.cabMatT, 'select', { options: opts(mc) })}${fld('Drawers', 'mset:' + t.id, 'drawerMatT', t.drawerMatT, 'select', { options: opts(md) })}</div></div>`; }).join('') || '<div class="note">No material templates yet.</div>'}</div></div>
  <div class="cards">
    <div class="card">${cardHead('Cabinet material templates', '<button class="btn sm" data-act="mtc-add">Add</button>')}<div class="cardbody">${mc.map(t => `<div class="tplrow" data-drag="cabMatT:${t.id}">
      <div class="tplhead">${swatch(mat(t.carcass), 22)}${ctl('mtc:' + t.id, 'name', t.name, 'text', { label: 'Template name' })}<span class="note">${nCab(usedBy(c => cabSet(c, 'cabMatT') === t.id))}</span>${delBtn('mtc-del', t.id, mc.length < 2, '×')}</div>
      <div class="autogrid">${fld('Cabinet (sides, top, bottom)', 'mtc:' + t.id, 'carcass', t.carcass, 'select', { options: matOpts('sheet') })}${fld('Back', 'mtc:' + t.id, 'back', t.back, 'select', { options: matOpts('sheet') })}${fld('Shelves', 'mtc:' + t.id, 'shelf', t.shelf, 'select', { options: matOpts('sheet') })}${fld('Toe kick', 'mtc:' + t.id, 'toeKick', t.toeKick, 'select', { options: matOpts('sheet') })}</div></div>`).join('')}</div></div>
    <div class="card">${cardHead('Drawer material templates', '<button class="btn sm" data-act="mtd-add">Add</button>')}<div class="cardbody">${md.map(t => `<div class="tplrow" data-drag="drawerMatT:${t.id}">
      <div class="tplhead">${swatch(mat(t.sides), 22)}${ctl('mtd:' + t.id, 'name', t.name, 'text', { label: 'Template name' })}<span class="note">${nCab(usedBy(c => cabSet(c, 'drawerMatT') === t.id))}</span>${delBtn('mtd-del', t.id, md.length < 2, '×')}</div>
      <div class="autogrid">${fld('Sides, front, back', 'mtd:' + t.id, 'sides', t.sides, 'select', { options: matOpts('sheet') })}${fld('Bottom', 'mtd:' + t.id, 'bottom', t.bottom, 'select', { options: matOpts('sheet') })}${fld('Box build', 'mtd:' + t.id, 'box', t.box || '', 'select', { options: DRAWER_BOX_TYPES })}${t.box === 'slide12' ? `${fld('Side trim below the bottom', 'mtd:' + t.id, 'trim', t.trim ?? 0.125, 'len')}${fld('Back notch width', 'mtd:' + t.id, 'notchW', t.notchW ?? 35 / 25.4, 'len')}` : ''}</div>${t.box === 'slide12' ? '<div class="note help">The back gets a notch at each bottom corner as tall as the runner\'s bottom recess. The inside of the sides (not the box front, where the locking devices go) is cut back by the trim below the bottom, and the bottom groove goes that much deeper.</div>' : ''}</div>`).join('')}</div></div>
  </div>
` : ''}
  ${view === 'hw' ? `<div class="card">${cardHead('Hardware list', '<span class="note">Counted from every cabinet in the job</span>')}
    <div class="tscroll"><table class="t"><thead><tr><th>Item</th><th class="r">Qty</th></tr></thead><tbody>${Object.entries(bom).sort().map(([k, q]) => `<tr><td>${esc(k)}</td><td class="n">${q}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No hardware yet</td></tr>'}</tbody></table></div></div>` : ''}`;
}

/* ---------- Doors ---------- */
function renderDoors() {
  ensureLibPrices();
  const types = [{ v: 'slab', l: 'Slab' }, { v: 'routed', l: 'Routed shaker (CNC pocket)' }, { v: 'twopiece', l: 'Two-piece (CNC frame, recessed panel)' }, { v: 'fivepiece', l: '5-piece (stiles, rails, panel)' }];
  const styleOpts = opts(S.doorStyles), pullOpts = opts(hwOf('pull'));
  const keep3d = $('#door3d');
  const view = ['templates', 'gaps'].includes(ui.doorView) ? ui.doorView : 'styles';
  const tabRow = `<div class="mlx-tabs" role="tablist">${[['styles', 'Door styles', S.doorStyles.length, 'door'], ['templates', 'Door templates', S.doorTemplates.length, 'stack'], ['gaps', 'Gaps', fmtLen(jobGaps().frontGap), 'ruler']].map(([k, l, n, ic]) => `<button role="tab" data-act="door-view" data-id="${k}" aria-selected="${view === k}">${icon(ic)}<span>${l}</span><span class="ct">${n}</span></button>`).join('')}</div>`;
  const acts = view === 'gaps' ? '' : view === 'styles' ? `<label class="dpreset"><span>Start from</span><select id="doorpreset" aria-label="Start from">${DOOR_PRESETS.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><button class="btn primary" data-act="door-add">${icon('plus')}New door style</button>` : `<button class="btn primary" data-act="dtpl-add">${icon('plus')}Add door template</button>`;
  $('#tab-doors').innerHTML = `<div class="pagehead"><div><h2>Doors</h2><p>Door styles are shapes only; the material comes from the finish. A door template picks the styles and pulls for doors, drawer fronts and false fronts in one go.</p></div><div class="row-actions">${acts}</div></div>
  ${tabRow}${view === 'gaps' ? doorGapsView() : view === 'styles' ? doorDesigner() : `
  ${doorTplView(styleOpts, pullOpts)}`}`;
  if (ui.door3d) mountDoor3D(keep3d);
}
// Shaded drawing of one door style, lit from the top left: frame, recessed or raised panels, glass, grooves and edge profile.
// o.dims adds width and height callouts around it.
let doorSvgN = 0;
function doorRenderSVG(raw, w, h, o = {}) {
  const ds = { ...DOOR_DEFAULTS, ...raw }, framed = ds.type !== 'slab' && w > 2 * ds.stile + 2 && h > 2 * ds.rail + 2;
  const m = mat(ds.mat), pm = ds.type === 'fivepiece' ? mat(ds.panelMat) || m : m, im = mat(ds.panelMat) || m, lay = doorLayout(ds, w, h, framed), Y = z => h - z, id = 'dr' + (++doorSvgN);
  const k = Math.max(w, h), b = Math.min(0.45, k / 70), rect = (x, y, rw, rh, a) => `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" ${a}/>`;
  const poly = (pts, a) => `<polygon points="${pts.map(q => q.join(',')).join(' ')}" ${a}/>`;
  const lit = a => `fill="#fff" fill-opacity="${a}"`, dark = a => `fill="#000" fill-opacity="${a}"`;
  // A recessed box: shadow on the top and left inside edges, light on the bottom and right.
  const recess = (x, y, rw, rh, d) => poly([[x, y], [x + rw, y], [x + rw - d, y + d], [x + d, y + d], [x + d, y + rh - d], [x, y + rh]], dark(0.3)) + poly([[x + rw, y], [x + rw, y + rh], [x, y + rh], [x + d, y + rh - d], [x + rw - d, y + rh - d], [x + rw - d, y + d]], lit(0.35));
  // A raised box: light on the top and left, shadow on the bottom and right.
  const raise = (x, y, rw, rh, d, a = 1) => poly([[x, y], [x + rw, y], [x + rw - d, y + d], [x + d, y + d]], lit(0.34 * a)) + poly([[x, y], [x + d, y + d], [x + d, y + rh - d], [x, y + rh]], lit(0.18 * a)) + poly([[x, y + rh], [x + d, y + rh - d], [x + rw - d, y + rh - d], [x + rw, y + rh]], dark(0.26 * a)) + poly([[x + rw, y], [x + rw, y + rh], [x + rw - d, y + rh - d], [x + rw - d, y + d]], dark(0.16 * a));
  let s = `<rect ${fillFor(m, 'ev-front')} x="0" y="0" width="${w}" height="${h}"/>`;
  if (framed) {
    if (ds.type === 'fivepiece') lay.frame.filter(f => f.kind !== 'stile').forEach(f => { s += rect(f.x0, Y(f.z1), f.x1 - f.x0, f.z1 - f.z0, 'fill="none" stroke="#000" stroke-opacity=".35" stroke-width="' + b * 0.25 + '"'); });
    lay.fields.forEach(fl => {
      const x = fl.x0, y = Y(fl.z1), fw = fl.x1 - fl.x0, fh = fl.z1 - fl.z0;
      if (fl.pt === 'glass') {
        s += rect(x, y, fw, fh, `fill="url(#${id}g)"`) + `<path d="M${x + fw * 0.12} ${y + fh * 0.4}L${x + fw * 0.5} ${y + fh * 0.08}M${x + fw * 0.2} ${y + fh * 0.55}L${x + fw * 0.68} ${y + fh * 0.15}" stroke="#fff" stroke-opacity=".7" stroke-width="${b * 0.6}" stroke-linecap="round"/>`;
      } else if (fl.pt === 'open') s += rect(x, y, fw, fh, 'fill="#1d2326" fill-opacity=".85"');
      else {
        s += `<rect ${fillFor(fl.pt === 'insert' ? im : pm, 'ev-front')} x="${x}" y="${y}" width="${fw}" height="${fh}"/>`;
        const r = Math.min(ds.raiseW, fw / 2 - 0.5, fh / 2 - 0.5);
        if (fl.pt === 'raised' && r > 0.2) s += raise(x, y, fw, fh, r, 0.9) + rect(x + r, y + r, fw - 2 * r, fh - 2 * r, 'fill="none" stroke="#000" stroke-opacity=".18" stroke-width="' + b * 0.2 + '"');
        else s += rect(x, y, fw, fh, dark(0.05));
      }
      s += recess(x, y, fw, fh, b);
      if (ds.insideProfile !== 'square') s += rect(x - b * 0.8, y - b * 0.8, fw + b * 1.6, fh + b * 1.6, 'fill="none" stroke="#000" stroke-opacity=".2" stroke-width="' + b * 0.2 + '"');
    });
  }
  lay.fields.forEach(fl => {
    if (framed && (fl.pt === 'glass' || fl.pt === 'open')) return;
    const fh = fl.z1 - fl.z0, fw = fl.x1 - fl.x0;
    designLines(ds, fl).forEach(l => {
      if (ds.design === 'xbrace') {
        const bw = Math.min(ds.grooveW / Math.sin(Math.atan2(fh, fw)), fw / 2), d = l.x2 > l.x1 ? 1 : -1;
        s += `<polygon ${fillFor(m, 'ev-front')} points="${l.x1},${Y(l.z1)} ${l.x1 + d * bw},${Y(l.z1)} ${l.x2},${Y(l.z2)} ${l.x2 - d * bw},${Y(l.z2)}" stroke="#000" stroke-opacity=".35" stroke-width="${b * 0.25}"/>`;
      } else {
        const gw = Math.max(b * 0.5, ds.grooveW * 0.8);
        s += `<line x1="${l.x1}" y1="${Y(l.z1)}" x2="${l.x2}" y2="${Y(l.z2)}" stroke="#000" stroke-opacity=".42" stroke-width="${gw}"/><line x1="${l.x1 + gw * 0.6}" y1="${Y(l.z1)}" x2="${l.x2 + gw * 0.6}" y2="${Y(l.z2)}" stroke="#fff" stroke-opacity=".35" stroke-width="${gw * 0.4}"/>`;
      }
    });
  });
  // Outside edge: a profile catches the light around the face; a square edge is only a crisp outline.
  if (ds.edgeProfile !== 'square') s += raise(0, 0, w, h, Math.min(b * (ds.edgeProfile === 'ogee' ? 1.6 : 1.1), w / 6), ds.edgeProfile === 'eased' ? 0.6 : 1);
  s += rect(0, 0, w, h, `fill="url(#${id}s)"`) + rect(0, 0, w, h, `fill="none" stroke="#000" stroke-opacity=".55" stroke-width="${b * 0.3}"`);
  const defs = `<defs>${texDefs([...new Set([m && m.id, pm && pm.id, im && im.id])].filter(Boolean))}<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".1"/></linearGradient><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9ecf5"/><stop offset="1" stop-color="#8fb5c9"/></linearGradient></defs>`;
  if (o.dims && framed && lay.fields.length > 1) lay.fields.forEach(fl => { const fs = Math.max(1, Math.min(2.4, (fl.x1 - fl.x0) / 4)); s += `<g class="drnum"><circle cx="${(fl.x0 + fl.x1) / 2}" cy="${Y((fl.z0 + fl.z1) / 2)}" r="${fs * 0.75}"/><text x="${(fl.x0 + fl.x1) / 2}" y="${Y((fl.z0 + fl.z1) / 2) + fs * 0.35}" font-size="${fs}" text-anchor="middle">${fl.i + 1}</text></g>`; });
  // Click targets over the frame and the openings; the picked one gets an outline.
  if (o.pick && framed) {
    const pk = o.pick, hit = (k, i, x0, z0, x1, z1) => `<rect class="dhit${pk.k === k && pk.i === i ? ' on' : ''}" data-act="door-pick" data-id="${k}:${i}" x="${x0}" y="${Y(z1)}" width="${x1 - x0}" height="${z1 - z0}"><title>${{ field: 'Opening ' + (i + 1), stile: 'Stile', rail: 'Rail', midrail: 'Mid rail ' + (i + 1), midstile: 'Mid stile ' + (i + 1) }[k]}</title></rect>`;
    s += `<g class="dhits" style="--dw:${b * 0.5}">${lay.fields.map(fl => hit('field', fl.i, fl.x0, fl.z0, fl.x1, fl.z1)).join('')}${lay.frame.map(f => hit(f.kind, f.kind === 'stile' || f.kind === 'rail' ? 0 : f.i, f.x0, f.z0, f.x1, f.z1)).join('')}</g>`;
  }
  if (!o.dims) return `<svg viewBox="${-b} ${-b} ${w + 2 * b} ${h + 2 * b}" aria-hidden="true">${defs}${s}</svg>`;
  const fs = Math.max(1.1, k / 16), g = fs * 1.4, tick = fs * 0.45, dl = 'stroke="currentColor" stroke-opacity=".55" stroke-width="' + fs * 0.06 + '"';
  const dims = `<g class="drdim"><path d="M0 ${-g}H${w}M0 ${-g - tick}V${-g + tick}M${w} ${-g - tick}V${-g + tick}M${w + g} 0V${h}M${w + g - tick} 0H${w + g + tick}M${w + g - tick} ${h}H${w + g + tick}" ${dl}/>
    <text x="${w / 2}" y="${-g - fs * 0.45}" font-size="${fs}" text-anchor="middle">${fmtLen(w)}</text><text x="${w + g + fs * 0.55}" y="${h / 2}" font-size="${fs}" text-anchor="middle" transform="rotate(-90 ${w + g + fs * 0.55} ${h / 2})">${fmtLen(h)}</text></g>`;
  return `<svg viewBox="${-fs} ${-g - fs * 1.6} ${w + g + fs * 2.6} ${h + g + fs * 2.6}" role="img" aria-label="${esc(ds.name)} at ${fmtLen(w)} by ${fmtLen(h)}">${defs}<ellipse cx="${w / 2}" cy="${h + fs * 0.55}" rx="${w * 0.55}" ry="${fs * 0.35}" fill="#000" fill-opacity=".12"/>${s}${dims}</svg>`;
}
// Small drawing of a door style, for the style list.
const doorThumb = (raw, w = 15, h = 24) => doorRenderSVG(raw, w, h);
const DOOR_PREVIEWS = [['wall', 'Wall door', 15, 30], ['base', 'Base door', 18, 24], ['tall', 'Tall door', 18, 48], ['drawer', 'Drawer front', 24, 8]];
// The preview size: one of the samples, or any width and height typed in.
function doorPreviewSize() {
  if (ui.doorPrev === 'custom') return ['custom', 'Custom door', Math.max(4, +ui.doorCW || 15), Math.max(4, +ui.doorCH || 30)];
  return DOOR_PREVIEWS.find(x => x[0] === ui.doorPrev) || DOOR_PREVIEWS[0];
}
const DOOR_TYPE_SHORT = { slab: 'Slab', routed: 'Routed', twopiece: 'Two-piece', fivepiece: '5-piece' };
// One-line description of a door style, for the gallery and the preview.
function doorSpecs(d) {
  const lbl = (list, v) => (list.find(x => x.v === v) || {}).l || v, out = [DOOR_TYPE_SHORT[d.type] || d.type];
  if (d.type !== 'slab') {
    out.push(`${fmtLen(d.stile)} stiles, ${fmtLen(d.rail)} rails`);
    if (d.midRailsF || d.midStilesF) out.push('Mid rails by formula');
    else if (d.midRails || d.midStiles) out.push([d.midRails ? `${d.midRails} mid rail${d.midRails > 1 ? 's' : ''}` : '', d.midStiles ? `${d.midStiles} mid stile${d.midStiles > 1 ? 's' : ''}` : ''].filter(Boolean).join(', '));
    out.push((d.fieldPanels || []).some(v => v && v !== d.panelType) ? 'Mixed panels' : lbl(PANEL_TYPES, d.panelType));
  }
  if (d.design !== 'none') out.push(lbl(PANEL_DESIGNS, d.design));
  if (d.edgeProfile !== 'square') out.push(lbl(EDGE_PROFILES, d.edgeProfile) + ' edge');
  return out;
}
// Opening sizes and each mid rail and mid stile, for a split door, with what each works out to at the preview size.
function splitFields(d, R, pw, ph) {
  const lay = doorLayout(d, pw, ph, true), { nR, nS, mrs, mss } = doorMids(d, pw, ph);
  const rows = [...new Set(lay.fields.map(f => (f.z1 - f.z0).toFixed(4) + '|' + f.z1))].map(k => k.split('|')).sort((a, b) => b[1] - a[1]).map(k => +k[0]);
  const cols = [...new Set(lay.fields.map(f => (f.x1 - f.x0).toFixed(4) + '|' + f.x0))].map(k => k.split('|')).sort((a, b) => a[1] - b[1]).map(k => +k[0]);
  const one = (key, i, label, now, ph0 = '*') => fld(`${label} <span class="muted">= ${fmtLen(now || 0)}</span>`, `sub:${key}|${R}`, String(i), (d[key] || [])[i] || '', 'text', { ph: ph0, wide: true });
  const rw = fmtLen(d.midRailW || d.rail), sw = fmtLen(d.midStileW || d.stile), out = [];
  for (let i = 0; i <= nR; i++) {
    out.push(one('splitH', i, i ? i === nR ? 'Bottom opening height' : `Opening ${i + 1} height` : nR ? 'Top opening height' : 'Opening height', rows[i]));
    if (i < nR) out.push(one('midRailWs', i, `Mid rail ${i + 1} width`, mrs[i], rw));
  }
  const outW = [];
  for (let i = 0; i <= nS; i++) {
    outW.push(one('splitW', i, i ? i === nS ? 'Right opening width' : `Opening ${i + 1} width` : nS ? 'Left opening width' : 'Opening width', cols[i]));
    if (i < nS) outW.push(one('midStileWs', i, `Mid stile ${i + 1} width`, mss[i], sw));
  }
  return `<div class="dsec">${secHead('ruler', 'Split openings', 'violet')}
    <div class="note">Every size can be a number or a formula: W and H are the door's width and height (H/3, W/2 - 1, 10). A blank opening shares what is left, and a blank rail or stile uses the width above. Positions follow from the openings, top to bottom and left to right.</div>
    ${nR ? out.join('') : ''}${nS ? outW.join('') : ''}</div>`;
}
// What was clicked on the door drawing, with its sizes to type in and buttons to split or join openings.
function doorPickBar(d, R, pw, ph) {
  const lay = doorLayout(d, pw, ph, true), { nR, nS, mrs, mss } = doorMids(d, pw, ph), cols = nS + 1, pk = ui.doorPick;
  const valid = pk && (pk.k === 'field' ? pk.i < lay.fields.length : pk.k === 'midrail' ? pk.i < nR : pk.k === 'midstile' ? pk.i < nS : pk.k === 'stile' || pk.k === 'rail');
  if (!valid) return `<div class="doorpick idle">${icon('hint')}Click an opening, a stile or a rail on the drawing to size it or split it.</div>`;
  const sub = (key, i, label, now, ph0 = '*') => fld(`${label} <span class="muted">= ${fmtLen(now || 0)}</span>`, `sub:${key}|${R}`, String(i), (d[key] || [])[i] || '', 'text', { ph: ph0 });
  const fxR = !!String(d.midRailsF || '').trim(), fxS = !!String(d.midStilesF || '').trim();
  const btn = (act, id, ic, l, off, why) => `<button class="btn sm" data-act="${act}" data-id="${id}"${off ? ` disabled title="${why}"` : ''}>${icon(ic)}${l}</button>`;
  let title = '', body = '', acts = '';
  if (pk.k === 'field') {
    const fl = lay.fields[pk.i], ri = Math.floor(pk.i / cols), ci = pk.i % cols;
    title = lay.fields.length > 1 ? `Opening ${pk.i + 1}` : 'Opening';
    body = (nR ? sub('splitH', ri, 'Height', fl.z1 - fl.z0) : '') + (nS ? sub('splitW', ci, 'Width', fl.x1 - fl.x0) : '')
      + fld('Panel', lay.fields.length > 1 ? `sub:fieldPanels|${R}` : R, lay.fields.length > 1 ? String(pk.i) : 'panelType', lay.fields.length > 1 ? (d.fieldPanels || [])[pk.i] || '' : d.panelType, 'select', { options: lay.fields.length > 1 ? [{ v: '', l: 'Same as the rest' }, ...PANEL_TYPES] : PANEL_TYPES });
    if (!nR && !nS) body = `<span class="muted">${fmtLen(fl.x1 - fl.x0)} × ${fmtLen(fl.z1 - fl.z0)}</span>` + body;
    acts = btn('door-split', 'rail:' + ri + ':' + ci, 'hsplit', 'Split top and bottom', fxR || nR >= MAX_MIDS, 'Mid rails come from a formula') + btn('door-split', 'stile:' + ri + ':' + ci, 'vsplit', 'Split side by side', fxS || nS >= MAX_MIDS, 'Mid stiles come from a formula');
  } else if (pk.k === 'midrail') {
    title = `Mid rail ${pk.i + 1}`;
    body = sub('midRailWs', pk.i, 'Width', mrs[pk.i], fmtLen(d.midRailW || d.rail)) + sub('splitH', pk.i, 'Opening above', (lay.fields.find(f => Math.floor(f.i / cols) === pk.i) || {}).z1 - (lay.fields.find(f => Math.floor(f.i / cols) === pk.i) || {}).z0);
    acts = btn('door-join', 'rail:' + pk.i, 'trash', 'Remove rail', fxR, 'Mid rails come from a formula');
  } else if (pk.k === 'midstile') {
    title = `Mid stile ${pk.i + 1}`;
    body = sub('midStileWs', pk.i, 'Width', mss[pk.i], fmtLen(d.midStileW || d.stile)) + sub('splitW', pk.i, 'Opening left of it', (lay.fields[pk.i] || {}).x1 - (lay.fields[pk.i] || {}).x0);
    acts = btn('door-join', 'stile:' + pk.i, 'trash', 'Remove stile', fxS, 'Mid stiles come from a formula');
  } else {
    title = pk.k === 'stile' ? 'Stiles' : 'Rails';
    body = pk.k === 'stile' ? fld('Width', R, 'stile', d.stile, 'len') : fld('Width', R, 'rail', d.rail, 'len');
  }
  return `<div class="doorpick"><b>${title}</b>${body}<span class="dp-acts">${acts}<button class="btn sm qe-x" data-act="door-pick" data-id="" aria-label="Done">${icon('close')}</button></span></div>`;
}
// Add a mid rail through row ri, or a mid stile through column ci. The opening's panel choice carries to both halves.
function doorSplit(d, dir, ri, ci) {
  const { nR, nS } = doorMids(d, 1e3, 1e3), cols = nS + 1, rows = nR + 1, pad = (a, n) => { const o = [...(a || [])]; while (o.length < n) o.push(''); return o; };
  const fp = pad(d.fieldPanels, rows * cols), np = [];
  if (dir === 'rail') {
    d.midRails = nR + 1;
    const h = pad(d.splitH, rows); h.splice(ri, 1, '', ''); d.splitH = h;
    const w = pad(d.midRailWs, nR); w.splice(ri, 0, ''); d.midRailWs = w;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const v = fp[r * cols + c]; np[(r > ri ? r + 1 : r) * cols + c] = v; if (r === ri) np[(ri + 1) * cols + c] = v; }
  } else {
    d.midStiles = nS + 1;
    const w = pad(d.splitW, cols); w.splice(ci, 1, '', ''); d.splitW = w;
    const m = pad(d.midStileWs, nS); m.splice(ci, 0, ''); d.midStileWs = m;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const v = fp[r * cols + c]; np[r * (cols + 1) + (c > ci ? c + 1 : c)] = v; if (c === ci) np[r * (cols + 1) + ci + 1] = v; }
  }
  d.fieldPanels = Array.from(np, v => v || '');
}
// Take out mid rail i (joining the rows on each side) or mid stile i.
function doorJoin(d, dir, i) {
  const { nR, nS } = doorMids(d, 1e3, 1e3), cols = nS + 1, rows = nR + 1, pad = (a, n) => { const o = [...(a || [])]; while (o.length < n) o.push(''); return o; };
  const fp = pad(d.fieldPanels, rows * cols);
  if (dir === 'rail' && nR) {
    d.midRails = nR - 1; const h = pad(d.splitH, rows); h.splice(i, 2, ''); d.splitH = h; const w = pad(d.midRailWs, nR); w.splice(i, 1); d.midRailWs = w;
    d.fieldPanels = fp.filter((_, j) => Math.floor(j / cols) !== i + 1);
  } else if (dir === 'stile' && nS) {
    d.midStiles = nS - 1; const w = pad(d.splitW, cols); w.splice(i, 2, ''); d.splitW = w; const m = pad(d.midStileWs, nS); m.splice(i, 1); d.midStileWs = m;
    d.fieldPanels = fp.filter((_, j) => j % cols !== i + 1);
  }
}
// Sections that start folded until opened once: the ones set up once and rarely changed.
const doorSecShut = t => { const f = ui.doorFold || {}; return t in f ? !!f[t] : t === 'Size rules' || t === 'Cost'; };
// Every section on the right of the door designer folds shut from its title; which ones are shut is remembered.
function foldDsecs(html) {
  return html.replace(/<div class="dsec"><div class="sechead([^"]*)">(.*?)<span>([^<]*)<\/span><\/div>/g, (_, cls, ic, t) => {
    const shut = doorSecShut(t);
    return `<div class="dsec${shut ? ' shut' : ''}"><button class="sechead dfold${cls}" data-act="door-fold" data-id="${t}" aria-expanded="${!shut}">${ic}<span>${t}</span>${icon('chevr', shut ? 'dchev' : 'dchev rot90')}</button>`;
  });
}
// Coloured tiles under the door picture: what this size costs and makes, and where the style is used.
function doorStats(d, pw, ph, parts, nOps, usedIn, buyout) {
  let price = ''; try { price = money(priceFront(d, pw * ph / 144, priceSheet()).total); } catch (_) {}
  const cabs = (() => { try { const ids = new Set(S.doorTemplates.filter(t => [t.door, t.drawer, t.falseFront, t.wallDoor, t.drawerTop, t.drawerBot].includes(d.id)).map(t => t.id)); return allCabs().filter(c => ids.has(cabSet(c, 'doorT'))).length; } catch (_) { return 0; } })();
  const t = (tone, ic, v, lb) => `<div class="edx-stat ${tone}">${icon(ic)}<b>${v}</b><span>${lb}</span></div>`;
  return `<div class="edx-stats plx-stats dstats">${price ? t('green', 'tag', price, 'This size') : ''}${buyout ? t('amber', 'download', 'Buyout', 'Door maker') : t('amber', 'list', parts.reduce((a, p) => a + p.qty, 0), 'Parts')}${buyout ? '' : t('blue', 'cube', nOps, 'Machining ops')}${t('violet', 'stack', usedIn, usedIn === 1 ? 'Template' : 'Templates')}${t('teal', 'home', cabs, 'Cabinets in this job')}</div>`;
}
// Door templates, like the Materials page: the list on the left, a big sample cabinet with tiles, and boxed choices on the right.
function doorTplView(styleOpts, pullOpts) {
  const id = pickId('doorT', S.doorTemplates), d = S.doorTemplates.find(x => x.id === id) || S.doorTemplates[0];
  const used = t => usedBy(c => cabSet(c, 'doorT') === t.id);
  const list = S.doorTemplates.map(t => `<button class="mli${t === d ? ' on' : ''}" data-act="dtpl-sel" data-id="${t.id}" data-drag="doorT:${t.id}">${miniTplSVG(t)}<span><b>${esc(t.name)}</b><small>${esc((S.doorStyles.find(x => x.id === t.door) || {}).name || '')} · ${nCab(used(t))}</small></span></button>`).join('');
  if (!d) return `<div class="card cardbody note">No door templates yet.</div>`;
  const R = 'dtpl:' + d.id, pv = ['base', 'drawers', 'wall'].includes(ui.dtplPv) ? ui.dtplPv : 'base';
  const sn = k => (S.doorStyles.find(x => x.id === k) || {}).name || '–', pn = k => (hw(k) || {}).name || 'No pull';
  const t = (tone, ic, v, lb) => `<div class="edx-stat ${tone}">${icon(ic)}<b>${esc(v)}</b><span>${lb}</span></div>`;
  const same = (v, l) => [{ v: '', l }, ...styleOpts];
  return `<div class="plx mlx dtx"><div class="card plx-list"><div class="cardbody libtree"><div class="mlx-tools"><button class="btn sm" data-act="lp-expall" data-id="doorT">${icon('download')}Export</button><label class="btn sm">${icon('upload')}Import<input type="file" class="lp-imp" data-key="doorT" accept=".json,application/json" hidden></label>${aiAskBtn('doorT')}</div>${list}</div></div>
    <div class="plx-main mlx-main">
      <div class="card plx-pic">${cardHead(esc(d.name), `${dupBtn('dtpl-dup', d.id)}${delBtn('dtpl-del', d.id, S.doorTemplates.length < 2)}`)}
        <div class="plx-pv dtx-pv"><div class="seg dtx-seg" role="group" aria-label="Sample">${[['base', 'Base cabinet'], ['drawers', 'Drawer stack'], ['wall', 'Wall cabinet']].map(([k, l]) => `<button data-act="dtpl-pv" data-id="${k}" aria-pressed="${pv === k}">${l}</button>`).join('')}</div>${dtplScene(d, pv)}</div>
        <div class="edx-stats plx-stats mlx-stats">${t('violet', 'door', sn(d.door), 'Doors')}${t('teal', 'shelf', sn(d.drawer), 'Drawer fronts')}${t('amber', 'sliders', pn(d.pull), 'Door pull')}${t('blue', 'home', String(used(d)), 'Cabinets in this job')}</div></div>
      <div class="card plx-props mlx-props">
        ${cardHead('Template', '')}<div class="cardbody">${fld('Name', R, 'name', d.name, 'text', { wide: true })}</div>
        ${cardHead('Doors', '')}<div class="cardbody">${fld('Doors', R, 'door', d.door, 'select', { options: styleOpts })}${fld('Wall cabinet doors', R, 'wallDoor', d.wallDoor || '', 'select', { options: same('', 'Same as doors') })}</div>
        ${cardHead('Drawer fronts', '')}<div class="cardbody">${fld('Drawer fronts', R, 'drawer', d.drawer, 'select', { options: styleOpts })}${fld('Top drawer', R, 'drawerTop', d.drawerTop || '', 'select', { options: same('', 'Same as drawer fronts') })}${fld('Bottom drawer', R, 'drawerBot', d.drawerBot || '', 'select', { options: same('', 'Same as drawer fronts') })}${fld('Slab under', R, 'minFrameHeight', d.minFrameHeight, 'len')}${fld('False fronts', R, 'falseFront', d.falseFront, 'select', { options: styleOpts })}</div>
        ${cardHead('Pulls', '')}<div class="cardbody">${fld('Door pull', R, 'pull', d.pull, 'select', { options: pullOpts })}${fld('Drawer pull', R, 'drawerPull', d.drawerPull, 'select', { options: pullOpts })}${fld('From edge', R, 'pullFromEdge', d.pullFromEdge, 'len')}${fld('From end', R, 'pullFromEnd', d.pullFromEnd, 'len')}${fld('Drawer from top', R, 'drawerPullFromTop', d.drawerPullFromTop, 'len', { title: '0 = centered' })}</div>
      </div></div></div>`;
}
// The job's gaps around doors and drawer fronts (Settings › Construction holds the same numbers, with room overrides).
const jobGaps = () => Object.assign({}, SHOP_PARAMS, S.job.params);
// Doors › Gaps: every gap around the fronts on one screen, drawn on a sample cabinet.
function doorGapsView() {
  const g = jobGaps(), rooms = S.rooms.filter(r => ['frontGap', 'frontSideReveal', 'frontTopReveal', 'frontBottomReveal'].some(k => has(r.params || {}, k)));
  const pv = ['base', 'drawers', 'wall'].includes(ui.dtplPv) ? ui.dtplPv : 'base', t = S.doorTemplates.find(x => x.id === (S.job.defaults || {}).doorT) || S.doorTemplates[0];
    return `<div class="plx-main mlx-main gapx">
    <div class="card plx-pic">${cardHead('Gaps around doors and drawers', '')}
      <div class="plx-pv dtx-pv"><div class="seg dtx-seg" role="group" aria-label="Sample">${[['base', 'Base cabinet'], ['drawers', 'Drawer stack'], ['wall', 'Wall cabinet']].map(([k, l]) => `<button data-act="dtpl-pv" data-id="${k}" aria-pressed="${pv === k}">${l}</button>`).join('')}</div>${t ? dtplScene(t, pv) : ''}</div>
      <div class="edx-stats plx-stats mlx-stats">${[['violet', 'face', g.frontGap, 'Gap'], ['amber', 'up', g.frontTopReveal, 'At the top'], ['blue', 'down', g.frontBottomReveal, 'At the bottom']].map(([tone, ic, v, l]) => `<div class="edx-stat ${tone}">${icon(ic)}<b>${fmtLen(v)}</b><span>${l}</span></div>`).join('')}</div></div>
    <div class="card plx-props mlx-props">
      ${cardHead('Whole job', '')}<div class="cardbody">
        ${fld('Gap', 'jobgap', 'gap', g.frontGap, 'len')}
        <div class="note show gapnote">Between doors, between drawers, and between cabinets side by side.</div>
        ${fld('At the top', 'jobp', 'frontTopReveal', g.frontTopReveal, 'len')}
        ${fld('At the bottom', 'jobp', 'frontBottomReveal', g.frontBottomReveal, 'len')}
</div>
      ${cardHead('Rooms and cabinets', '')}<div class="cardbody"><div class="note show">${rooms.length ? `${rooms.map(r => esc(r.name)).join(', ')} ${rooms.length === 1 ? 'has' : 'have'} its own gaps.` : 'Every room uses these.'} A room's own gaps are under Settings › Construction, and one cabinet's under its editor › Parameters.</div>
        <button class="btn sm" data-act="gaps-settings">Open Settings › Construction</button></div>
    </div></div>`;
}
// One shaded sample cabinet for a door template: every front drawn in its real style and the job's finish, with the pulls where they go.
function dtplScene(t, pv) {
  const st = id => { const raw = S.doorStyles.find(x => x.id === id); return raw ? withFinish({ ...DOOR_DEFAULTS, ...raw }, null) : null; };
  const jg = jobGaps(), g = jg.frontGap, W = pv === 'drawers' ? 18 : 30, H = pv === 'wall' ? 30 : 30.75, toe = pv === 'wall' ? 0 : 4, k = 1;
  const fronts = [];
  const drawerStyle = (id, h) => { const ds = st(id || t.drawer); return ds && ds.type !== 'slab' && h < (t.minFrameHeight || 0) ? { ...ds, type: 'slab' } : ds; };
  const sr = jg.frontSideReveal, tr = jg.frontTopReveal, br = jg.frontBottomReveal, fw = (W - 2 * sr - g) / 2, x2 = sr + fw + g;
  if (pv === 'wall') { const ds = st(t.wallDoor || t.door), h = H - tr - br; fronts.push({ x: sr, y: tr, w: fw, h, ds, pull: 'door', side: 'r', top: true }, { x: x2, y: tr, w: fw, h, ds, pull: 'door', side: 'l', top: true }); }
  else if (pv === 'base') { const dh = 6, ds = st(t.door), dy = tr + dh + g; fronts.push({ x: sr, y: tr, w: W - 2 * sr, h: dh, ds: drawerStyle(t.drawerTop, dh), pull: 'drawer' }, { x: sr, y: dy, w: fw, h: H - br - dy, ds, pull: 'door', side: 'r' }, { x: x2, y: dy, w: fw, h: H - br - dy, ds, pull: 'door', side: 'l' }); }
  else { const hs = [6, 10], rest = H - tr - br - hs[0] - hs[1] - 2 * g; let y = tr; [[hs[0], t.drawerTop], [hs[1], ''], [rest, t.drawerBot]].forEach(([h, id]) => { fronts.push({ x: sr, y, w: W - 2 * sr, h, ds: drawerStyle(id, h), pull: 'drawer' }); y += h + g; }); }
  const pullLen = id => { const p = hw(id); if (!id || !p) return 0; const m = String(p.name).match(/(\d+)\s*mm/); return m ? Math.min(12, +m[1] / 25.4 + 0.6) : 5; };
  const dp = pullLen(t.pull), wp = pullLen(t.drawerPull);
  const pullSVG = f => {
    if (f.pull === 'door' && dp) { const x = f.side === 'r' ? f.x + f.w - (t.pullFromEdge || 2) : f.x + (t.pullFromEdge || 2), y0 = f.top ? f.y + f.h - (t.pullFromEnd || 3) - dp : f.y + (t.pullFromEnd || 3); return `<rect class="dtx-pull" x="${x - 0.22}" y="${y0}" width="0.44" height="${dp}" rx="0.22"/>`; }
    if (f.pull === 'drawer' && wp) { const y = t.drawerPullFromTop ? f.y + t.drawerPullFromTop : f.y + f.h / 2; return `<rect class="dtx-pull" x="${f.x + f.w / 2 - wp / 2}" y="${y - 0.22}" width="${wp}" height="0.44" rx="0.22"/>`; }
    return '';
  };
  const m = 3, vw = W + 2 * m, vh = H + toe + 2 * m;
  return `<svg class="dtx-scene" viewBox="${-m} ${-m} ${vw} ${vh}" role="img" aria-label="${esc(t.name)} sample">
    ${toe ? `<ellipse cx="${W / 2}" cy="${H + toe + 0.3}" rx="${W * 0.62}" ry="0.9" fill="#000" fill-opacity=".14"/>` : ''}
    <rect class="dtx-box" x="0" y="0" width="${W}" height="${H}" rx="0.1"/>${toe ? `<rect class="dtx-toe" x="0.75" y="${H}" width="${W - 1.5}" height="${toe}"/>` : ''}
    ${fronts.map(f => f.ds ? `${doorRenderSVG(f.ds, f.w, f.h, {}).replace('<svg ', `<svg x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" preserveAspectRatio="none" `)}${pullSVG(f)}` : '').join('')}
  </svg>`;
}
// Little door picture for the template list: the template's door style drawn small.
function miniTplSVG(t) {
  const ds = S.doorStyles.find(x => x.id === t.door);
  return `<span class="dtx-mini">${ds ? doorRenderSVG(ds, 15, 30, {}) : ''}</span>`;
}
function doorDesigner() {
  if (!S.doorStyles.some(d => d.id === ui.doorSel)) ui.doorSel = S.doorStyles[0].id;
  const raw = S.doorStyles.find(d => d.id === ui.doorSel), d = withFinish({ ...DOOR_DEFAULTS, ...raw }, null), R = 'door:' + d.id;
  const pv = doorPreviewSize(), [, , pw, ph] = pv;
  // Parts list: a one-front cabinet the size of the chosen sample, using a throwaway template.
  const smp = sampleCab({ doorT: '_tmp', rows: [{ type: pv[0] === 'drawer' ? 'drawer' : 'door', h: '*', count: 1 }], w: pw, h: ph, cat: 'Wall', construction: { toeKick: false, top: 'full' }, params: { frontSideReveal: 0, frontTopReveal: 0, frontBottomReveal: 0 } });
  const tmp = { id: '_tmp', name: '', door: d.id, drawer: d.id, falseFront: d.id, minFrameHeight: 0, pull: '', drawerPull: '', pullFromEdge: 2, pullFromEnd: 3, drawerPullFromTop: 0 };
  S.doorTemplates.push(tmp);
  let parts = [], bom = {};
  try { const b = buildParts(smp); parts = b.parts.filter(p => /^(Door|Drawer front)/.test(p.name)); bom = b.bom; } finally { S.doorTemplates.pop(); }
  const pvLay = doorLayout(d, pw, ph, d.type !== 'slab'), nFields = d.type !== 'slab' ? pvLay.fields.length : 1, ptUsed = new Set(pvLay.fields.map(f => f.pt));
  const buyout = d.source === 'buyout', framedT = d.type !== 'slab', fp = d.type === 'fivepiece', two = d.type === 'twopiece', usedIn = S.doorTemplates.filter(t => [t.door, t.drawer, t.falseFront].includes(d.id)).length;
  const glassKey = Object.keys(bom).filter(k => k.startsWith('Glass')), nOps = parts.reduce((a, p) => a + p.ops.length * p.qty, 0), m = mat(d.mat);
  return foldDsecs(`<div class="card doorshop">
  <div class="doordes">
    <div class="doorlist" role="listbox" aria-label="Door styles"><input id="doorfind" type="search" placeholder="Find a style" value="${esc(ui.doorFind || '')}" aria-label="Find a door style">${DOOR_CATS.map(cat => { const list = S.doorStyles.filter(x => doorCat({ ...DOOR_DEFAULTS, ...x }) === cat.v && (!ui.doorFind || x.name.toLowerCase().includes(ui.doorFind.toLowerCase()))), shut = (ui.doorShut || {})[cat.v] && !ui.doorFind; return !list.length && ui.doorFind ? '' : `<button class="doorcat" data-act="door-cat" data-id="${cat.v}" aria-expanded="${!shut}">${icon('chevr', shut ? '' : 'rot90')}<span>${cat.l}</span><small>${list.length}</small></button>${shut ? '' : list.map(x => { const xd = { ...DOOR_DEFAULTS, ...x }; return `<button class="dooritem${x.id === d.id ? ' on' : ''}" data-act="door-sel" data-id="${x.id}" role="option" aria-selected="${x.id === d.id}">${doorThumb(x)}<span><b>${esc(x.name)}</b><small>${xd.source === 'buyout' ? 'Buyout · ' : ''}${esc(DOOR_TYPE_SHORT[xd.type] || '')}${xd.design !== 'none' ? ' · ' + esc((PANEL_DESIGNS.find(p => p.v === xd.design) || {}).l || '') : xd.type !== 'slab' ? ' · ' + esc((xd.fieldPanels || []).some(v => v && v !== xd.panelType) ? 'Mixed panels' : (PANEL_TYPES.find(p => p.v === xd.panelType) || {}).l || '') : ''}</small></span></button>`; }).join('')}`; }).join('')}</div>
    <div class="doorstage">
      <div class="stagehead"><div><div class="stagename">${esc(d.name)}</div><div class="note">${m ? swatch(m, 14) + ' ' + esc(m.name) + ' · ' : ''}used in ${usedIn} template${usedIn === 1 ? '' : 's'}</div></div><div class="row-actions">${dupBtn('door-dup', d.id)}${delBtn('door-del', d.id, S.doorStyles.length < 2)}</div></div>
      <div class="stage${ui.door3d ? ' is3d' : ''}">
        <div class="stagebtns"><button class="btn sm stagebtn" data-act="door-3d" aria-pressed="${!!ui.door3d}" title="${ui.door3d ? 'Back to the drawing' : 'Turn it around in 3D'}">${icon(ui.door3d ? 'face' : 'cube')}${ui.door3d ? '2D' : '3D'}</button>${ui.door3d ? `<button class="btn sm stagebtn" data-act="door3d-view" data-id="front" title="Straight on">${icon('face')}</button><button class="btn sm stagebtn" data-act="door3d-view" data-id="angle" title="At an angle">${icon('cube')}</button>` : ''}</div>
        ${ui.door3d ? '<div id="door3d-slot"></div>' : `<div class="stagesvg">${doorRenderSVG(d, pw, ph, { dims: true, pick: ui.doorPick || {} })}</div>`}
      </div>
      <div class="seg sizeseg" role="group" aria-label="Preview size">${DOOR_PREVIEWS.map(([k, l, w, h]) => `<button data-act="door-prev" data-id="${k}" aria-pressed="${pv[0] === k}">${l} <span class="muted">${w}×${h}</span></button>`).join('')}<button data-act="door-prev" data-id="custom" aria-pressed="${pv[0] === 'custom'}">Any size</button></div>
      <div class="doorsize"><label>Width <input id="doorcw" class="num" inputmode="decimal" value="${esc(fmtLen(pw))}" aria-label="Preview width"></label><span>×</span><label>Height <input id="doorch" class="num" inputmode="decimal" value="${esc(fmtLen(ph))}" aria-label="Preview height"></label></div>
      ${framedT ? doorPickBar(d, R, pw, ph) : `<div class="specchips">${doorSpecs(d).map(x => `<span class="specchip">${esc(x)}</span>`).join('')}</div>`}
      ${doorStats(d, pw, ph, parts, nOps, usedIn, buyout)}
      ${buyout ? `<div class="note doorparts">${icon('list')}Bought from a door maker, so nothing goes on the cut list or the CNC file. It goes on the Buyout door order export.</div>` : ''}<details class="doorparts"${buyout ? ' hidden' : ''}><summary>${icon('list')}${parts.length} part${parts.length === 1 ? '' : 's'} and ${nOps} machining operation${nOps === 1 ? '' : 's'} for this ${pv[1].toLowerCase()}${glassKey.length ? ', plus ' + glassKey.map(esc).join(', ') : ''}</summary>
        <div class="tscroll"><table class="t"><thead><tr><th>Part</th><th class="r">Qty</th><th class="r">Size</th><th>Machining</th></tr></thead><tbody>${parts.map(p => `<tr><td>${esc(p.name)}</td><td class="n">${p.qty}</td><td class="n">${fmtLen(p.L)} × ${fmtLen(p.W)}</td><td class="muted">${[...new Set(p.ops.map(o => opText(o).split(' ')[0] + (o.why ? ' (' + o.why + ')' : '')))].map(esc).join(', ')}</td></tr>`).join('')}</tbody></table></div></details>
    </div>
    <div class="doorform">
      <div class="dsec">${secHead('tag', 'Style', 'violet')}
        ${fld('Name', R, 'name', d.name, 'text', { wide: true })}
        ${fld('Category', R, 'cat', d.cat || '', 'select', { options: [{ v: '', l: `Automatic · ${(DOOR_CATS.find(c => c.v === doorCat({ ...d, cat: '' })) || {}).l}` }, ...DOOR_CATS], wide: true })}
        ${fld('Made by', R, 'source', d.source, 'select', { options: DOOR_SOURCES, wide: true })}
        ${fld('Construction', R, 'type', d.type, 'select', { options: DOOR_TYPES, wide: true })}
        <div class="note">Material comes from the room's finish (${esc((finishOf(null) || {}).name || '')}), not the door style. Set finishes under Libraries › Materials.</div>
        ${fld('Outside edge', R, 'edgeProfile', d.edgeProfile, 'select', { options: EDGE_PROFILES })}
        ${buyout || d.type === 'fivepiece' ? '' : fld('CNC tool group', R, 'cncGroup', d.cncGroup || '', 'text', { wide: true, ph: 'Like 60 panel' })}${buyout || d.type === 'fivepiece' ? '' : `<div class="note">The panel tool group in CNC Cutlist that cuts this door's recess and edges, by its name there. Blank: pick it in CNC Cutlist.</div>`}</div>
      ${buyout && doorExportOf(S) === 'bywater' ? bywaterStyleFields(d, R, framedT) : ''}${buyout && doorExportOf(S) !== 'bywater' ? `<div class="dsec">${secHead('list', 'Door maker order', 'amber')}
        <div class="note">What goes on the buyout door order. Blank boxes use this style's own settings.</div>
        ${fld('Their door name', R, 'vName', d.vName || '', 'text', { wide: true, ph: d.name })}
        ${fld('Wood', R, 'vWood', d.vWood || '', 'text', { wide: true, ph: m ? m.name : '' })}${fld('Panel face', R, 'vFace', d.vFace || '', 'text', { wide: true, ph: 'Vertical grain' })}
        ${fld('Panel material', R, 'vPanel', d.vPanel || '', 'text', { wide: true, ph: framedT ? (mat(fp ? d.panelMat : d.mat) || m || {}).name || '' : '' })}${fld('Stile and rail profile', R, 'vSR', d.vSR || '', 'text', { wide: true, ph: framedT ? 'SR22' : '' })}
        ${fld('Edge profile', R, 'vEdge', d.vEdge || '', 'text', { wide: true, ph: (EDGE_PROFILES.find(x => x.v === d.edgeProfile) || {}).l || '' })}${fld('Hinge boring', R, 'vHinge', d.vHinge, 'select', { options: VENDOR_HINGE, wide: true })}
        ${framedT ? '<div class="grid2">' + [['topRail', 'Top rail', d.rail], ['botRail', 'Bottom rail', d.rail], ['leftStile', 'Left stile', d.stile], ['rightStile', 'Right stile', d.stile], ['horizRail', 'Horizontal rail', d.midRailW || d.rail], ['vertRail', 'Vertical rail', d.midStileW || d.stile]].map(([k, l, ph]) => fld(l, R, k, d[k] || '', 'len', { blank: true, ph: fmtLen(ph) })).join('') + '</div>' : ''}</div>` : ''}
      ${framedT ? `<div class="dsec">${secHead('face', 'Stiles and rails', 'amber')}
        <div class="grid2">${fld('Stile width', R, 'stile', d.stile, 'len')}${fld('Rail width', R, 'rail', d.rail, 'len')}
        ${fld('Mid rails', R, 'midRails', d.midRails, 'selnum', { options: [0, 1, 2, 3, 4, 5, 6, 7, 8] })}${fld('Mid rail width', R, 'midRailW', d.midRailW || '', 'len', { blank: true, ph: fmtLen(d.rail) })}
        ${fld('Mid stiles', R, 'midStiles', d.midStiles, 'selnum', { options: [0, 1, 2, 3, 4, 5, 6] })}${fld('Mid stile width', R, 'midStileW', d.midStileW || '', 'len', { blank: true, ph: fmtLen(d.stile) })}
        ${fp ? fld('Tenon / groove', R, 'tenon', d.tenon, 'len') : two ? '' : fld('Pocket depth', R, 'pocketDepth', d.pocketDepth, 'len')}</div>
        ${fld('Mid rails by formula', R, 'midRailsF', d.midRailsF || '', 'text', { ph: 'like round(H/12) - 1', wide: true })}${fld('Mid stiles by formula', R, 'midStilesF', d.midStilesF || '', 'text', { ph: 'like floor(W/20)', wide: true })}
        ${fld('Inside edge', R, 'insideProfile', d.insideProfile, 'select', { options: EDGE_PROFILES })}</div>
      ${(() => { const k = doorMids(d, pw, ph); return k.nR || k.nS ? splitFields(d, R, pw, ph) : ''; })()}
      <div class="dsec">${secHead('shelf', 'Panel', 'teal')}
        ${fld(nFields > 1 ? 'Panels' : 'Panel type', R, 'panelType', d.panelType, 'select', { options: PANEL_TYPES, wide: true })}
        ${nFields > 1 ? `<div class="note">Swap any opening's panel. The numbers match the drawing, across then down from the top left.</div>${Array.from({ length: nFields }, (_, i) => fld(`Opening ${i + 1}`, `sub:fieldPanels|${R}`, String(i), (d.fieldPanels || [])[i] || '', 'select', { options: [{ v: '', l: 'Same as Panels' }, ...PANEL_TYPES], wide: true })).join('')}` : ''}
        ${ptUsed.has('raised') ? `<div class="grid2">${fld('Raise width', R, 'raiseW', d.raiseW, 'len')}</div>` : ''}
        </div>` : ''}
      ${two ? `<div class="dsec">${secHead('box', 'Panel recess', 'teal')}
        <div class="grid2">${fld('Recess width', R, 'recessW', d.recessW, 'len')}${fld('Recess depth', R, 'recessD', d.recessD, 'len')}${fld('Panel clearance', R, 'panelGap', d.panelGap, 'len')}</div>
        <div class="note">The CNC cuts the frame from the 3/4 material, cuts out each opening and rabbets the back. The panel drops into the rabbet from the back: opening plus twice the recess width, less the clearance.</div></div>` : ''}
      <div class="dsec">${secHead('ruler', 'Size rules', 'slate')}
        <div class="grid2">${fld('Min width', R, 'minW', d.minW, 'len', { blank: true, ph: 'none' })}${fld('Max width', R, 'maxW', d.maxW, 'len', { blank: true, ph: 'none' })}${fld('Min height', R, 'minH', d.minH, 'len', { blank: true, ph: 'none' })}${fld('Max height', R, 'maxH', d.maxH, 'len', { blank: true, ph: 'none' })}</div>
        ${fld('Outside these, use', R, 'swap', d.swap || '', 'select', { options: [{ v: '', l: 'This style anyway' }, ...S.doorStyles.filter(x => x.id !== d.id).map(x => ({ v: x.id, l: x.name }))], wide: true })}
        <div class="note">A door or drawer front smaller or bigger than these limits is built with the style you pick here instead, like Mozaik's minimum and maximum sizes.</div>${typeof sizeRuleUse === 'function' && d.swap ? sizeRuleUse(d) : ''}</div>
      <div class="dsec">${secHead('tag', 'Price', 'teal')}
        <div class="grid2">${fld('Price ($/sq ft)', R, 'rate', d.rate, 'num')}${fld('Minimum per front', R, 'min', d.min, 'num')}${fld('Material ($/sq ft)', R, 'matCost', d.matCost, 'num', { blank: true, ph: doorMatRate({ ...d, matCost: '' }, priceSheet()).toFixed(2) })}</div>
        <div class="note">Every door, drawer front, false front and applied end panel in this style costs its size times the price plus material, and never less than the minimum per front. Blank material uses the material's sheet price. A job can use its own price under Pricing › Edit prices.</div></div>
      ${!framedT || d.panelType === 'flat' || d.panelType === 'raised' ? `<div class="dsec">${secHead('palette', 'Panel design', 'rose')}
        ${fld('Design', R, 'design', d.design, 'select', { options: PANEL_DESIGNS, wide: true })}<div class="grid2">
        ${d.design !== 'none' && d.design !== 'xbrace' ? fld('Spacing', R, 'grooveSpacing', d.grooveSpacing, 'len') : ''}
        ${d.design !== 'none' ? fld(d.design === 'xbrace' ? 'Brace width' : 'Groove width', R, 'grooveW', d.grooveW, 'len') : ''}
        ${d.design !== 'none' && !(d.design === 'xbrace' && fp) ? fld('Groove depth', R, 'grooveDepth', d.grooveDepth, 'len') : ''}</div></div>` : ''}
    </div>
  </div></div>`);
}
// The door preview in 3D: made the first time it is shown, then kept between redraws.
let doorViewer = null;
function mountDoor3D(keep) {
  const slot = $('#door3d-slot'); if (!slot) return;
  if (keep) slot.replaceWith(keep); else slot.id = 'door3d';
  const host = $('#door3d');
  if (!doorViewer) { doorViewer = new Viewer3D(host); viewers.push(doorViewer); }
  else if (doorViewer.host !== host && doorViewer.ok) { host.appendChild(doorViewer.renderer.domElement); doorViewer.host = host; new ResizeObserver(() => doorViewer.resize()).observe(host); }
  buildDoor3D();
}
function buildDoor3D() {
  const v = doorViewer; if (!v || !v.ok) return;
  const d = doorStyle(ui.doorSel), pv = doorPreviewSize(), w = pv[2], h = pv[3];
  const framed = d.type !== 'slab' && w > 2 * d.stile + 2 && h > 2 * d.rail + 2, m = mat(d.mat), ft = m ? m.thick : 0.75;
  v.setBackground(cssVar('--bg')); v.clear();
  const g = new THREE.Group(); g.position.x = -w / 2;
  doorMeshes(d, framed, { x0: 0, x1: w, z0: 0, z1: h }, ft, mat3(m), mat3(mat(d.panelMat) || m), 0, o => g.add(o));
  v.root.add(g); v.resize();
  const key = d.id + pv[0];
  if (v.fitted !== key) { v.fitted = key; v.look(ui.door3dView === 'front' ? { x: 0, y: 0, z: 1 } : { x: -0.65, y: 0.3, z: 1 }); }
  v.requestRender();
}

/* ---------- Applied panels ---------- */
// A panel fit seen from the side: the cabinet dashed, the panel past its front by the overhang, scribe at the back.
function panelSideSVG(d, ds, m, H = 34.5, D = 24) {
  const W = D + d.frontOverhang + d.scribe, toe = d.toFloor ? 0 : 4, framed = ds.type !== 'slab', fr = framed ? Math.max(+ds.stile || 0, +ds.rail || 0) : 0, x0 = -d.frontOverhang;
  const dim = (xa, ya, xb, yb, l, tx, ty, an = 'middle') => `<g class="ctp-dim"><line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}"/><text x="${tx}" y="${ty}" font-size="1.3" text-anchor="${an}" dominant-baseline="central">${esc(l)}</text></g>`;
  return `<svg class="pnx-svg" viewBox="${x0 - 5} ${-H - 5} ${W + 12} ${H + 9}"><defs>${texDefs([ds.mat])}</defs>
    <line class="ctp-floor" x1="${x0 - 5}" y1="0" x2="${D + 7}" y2="0"/><rect class="ctp-wallsec" x="${D + d.scribe}" y="${-H - 5}" width="1" height="${H + 5}"/>
    <rect ${fillFor(m, 'ev-front')} x="${x0}" y="${-H}" width="${W}" height="${H - toe}"/>${fr > 0 ? `<rect class="ev-inner nss" x="${x0 + fr}" y="${-H + fr}" width="${W - 2 * fr}" height="${H - toe - 2 * fr}"/>` : ''}
    <path class="pnx-cab" d="M0 ${-H}H${D}V0H3V-4H0Z"/>
    ${d.frontOverhang > 0 ? dim(x0, -H - 1.6, 0, -H - 1.6, fmtLen(d.frontOverhang), x0 + d.frontOverhang / 2, -H - 3) : ''}
    ${d.scribe > 0 ? dim(D, -H - 1.6, D + d.scribe, -H - 1.6, fmtLen(d.scribe), D + d.scribe / 2 + 1.5, -H - 3) : ''}
    ${dim(x0 - 2, -H, x0 - 2, -toe, fmtLen(H - toe), x0 - 2.6, -(H + toe) / 2, 'end')}</svg>`;
}
function renderPanels() {
  // The panel's look and price come from a door style (Settings › Cabinet and panels); this library keeps only how it fits.
  const ds = doorStyle(roomSet('panelDoor') || doorTpl(roomSet('doorT')).door), m = mat(ds.mat);
  const used = d => usedBy(c => (hasPanel(c, 'L') || hasPanel(c, 'R')) && cabSet(c, 'panelStyle') === d.id);
  const head = `<div class="pagehead"><div><h2>Applied panels</h2><p>Finished end panels for exposed cabinet sides. Each panel is made and priced in a door style picked for the job or room under Settings › Cabinet and panels. These only set how the panel fits.</p></div><div class="row-actions"><button class="btn primary" data-act="panel-add">${icon('plus')}Add panel fit</button></div></div>`;
  const mini = d => `<svg viewBox="-1 -36 28 37"><rect ${fillFor(m, 'ev-front')} x="0" y="-34.5" width="${24 + d.frontOverhang + d.scribe}" height="${d.toFloor ? 34.5 : 30.5}"/></svg>`;
  const listCard = libSimpleList('panel', S.panels, mini, d => { const n = used(d); return `${fmtLen(d.frontOverhang)} overhang${d.toFloor ? ' · to the floor' : ''}${n ? ` · ${nCab(n)}` : ''}`; });
  const id = pickId('panel', S.panels), d = S.panels.find(x => x.id === id) || S.panels[0], R = 'panel:' + d.id;
  const pic = panelSideSVG(d, ds, m), seg = '';
  $('#tab-panels').innerHTML = `${head}<div class="plx mlx ilx pnx">${listCard}<div class="plx-main mlx-main">
    <div class="card plx-pic">${cardHead(esc(d.name), `<button class="btn sm" data-act="lp-copy" data-id="panel">${icon('copy')}Copy</button>${S.panels.length > 1 ? `<button class="btn sm danger" data-act="panel-del" data-id="${esc(d.id)}">${icon('trash')}Delete</button>` : ''}`)}
      <div class="plx-pv ilx-pv">${seg}${pic}</div>
      <div class="edx-stats plx-stats mlx-stats">${libTile('teal', 'ruler', fmtLen(d.frontOverhang), 'Front overhang')}${libTile('amber', 'ruler', fmtLen(d.scribe), 'Back scribe')}${libTile('violet', 'down', d.toFloor ? 'Yes' : 'No', 'Runs to the floor')}${libTile('blue', 'home', used(d), 'Cabinets in this job')}</div></div>
    <div class="card plx-props mlx-props">
      ${cardHead('Panel fit', '')}<div class="cardbody">${fld('Name', R, 'name', d.name, 'text', { wide: true })}${fld('Front overhang', R, 'frontOverhang', d.frontOverhang, 'len')}${fld('Back scribe', R, 'scribe', d.scribe, 'len')}<label class="checkrow">${ctl(R, 'toFloor', d.toFloor, 'bool', { label: 'Runs to floor' })} Runs to the floor (covers the toe kick)</label></div>
      ${cardHead('Look and price', '')}<div class="cardbody"><div class="pnx-look">${swatch(m, 40)}<span><b>${esc(ds.name)}</b><small>${esc(curRoom().name)} · ${money(doorRate(ds))}/sq ft</small></span></div>
        <div class="row-actions"><button class="btn sm" data-act="tab" data-id="settings">${icon('sliders')}Change in Settings</button><button class="btn sm" data-act="tab" data-id="doors">${icon('door')}Door designer</button></div></div>
    </div></div></div>`;
}

/* ---------- Hardware ---------- */
const HOLE_REFS = [{ v: 'set', l: 'Runner hole # (per length)' }, { v: 'front', l: 'From cabinet front' }, { v: 'mid32', l: 'Middle 32 mm hole' }, { v: 'rear32', l: 'Last 32 mm hole' }, { v: 'slideEnd', l: 'Back from slide end' }];
// Hardware page, like Materials: a tab per kind, the list of that kind on the left, the picked one beside it.
const HW_ICONS = { slide: ['shelf', 'teal'], hinge: ['door', 'violet'], pull: ['magnet', 'amber'], shelfpin: ['list', 'blue'], joint: ['join', 'rose'], leg: ['down', 'green'], other: ['box', 'slate'] };
function hwTabs(k) {
  return `<div class="mlx-tabs hw-tabs" role="tablist">${HW_KINDS.map(([kk, l]) => `<button role="tab" data-act="hw-kind" data-id="${kk}" aria-selected="${kk === k}">${icon(HW_ICONS[kk][0])}<span>${l}</span><span class="ct">${hwOf(kk).length}</span></button>`).join('')}</div>`;
}
function hwList(k, items) {
  const id = items.length ? pickId('hw-' + k, items) : '', key = 'hw-' + k;
  const used = h => { try { return allCabs().filter(c => JSON.stringify([c.slide, c.hinge, c.pull, cabSet(c, 'slide'), cabSet(c, 'hinge'), cabSet(c, 'pull')]).includes('"' + h.id + '"')).length; } catch (_) { return 0; } };
  const [ic, tone] = HW_ICONS[k] || HW_ICONS.other;
  return `<div class="cardbody libtree"><div class="mlx-tools"><button class="btn sm" data-act="lp-expall" data-id="${key}">${icon('download')}Export</button><label class="btn sm">${icon('upload')}Import<input type="file" class="lp-imp" data-key="${key}" accept=".json,application/json" hidden></label>${aiAskBtn(key)}</div>
    ${items.map(h => { const n = used(h); return `<button class="mli hwli tone-${tone}${h.id === id ? ' on' : ''}" data-act="hw-sel" data-id="${h.id}" data-drag="hw:${h.id}"><span class="ln-ic">${icon(ic)}</span><span><b>${esc(h.name)}</b><small>${esc(h.notes || '')}${n ? `${h.notes ? ' · ' : ''}${n} cabinet${n === 1 ? '' : 's'}` : ''}</small></span></button>`; }).join('') || '<div class="note show">None yet.</div>'}</div>`;
}
// Hinge placement: three sample doors with the hinges measured from the door's top and bottom,
// and the cabinet side beside each one with its plates on the same lines.
function hingePlaceSVG(h) {
  const jp = { ...SHOP_PARAMS, ...S.job.params }, top = +jp.hingeInset || 0, bot = +(jp.hingeInsetB ?? jp.hingeInset) || 0;
  const doors = [[30], [Math.min(60, (+h.max3 || 80) - 4)], [Math.max(84, (+h.max3 || 80) + 4)]];
  const Hmax = Math.max(...doors.map(d => d[0])), W = 15, D = 12, gap = 4, col = W + gap + D + 14, fs = 3.2;
  const cupX = ((+(h.cupEdgeMM ?? 3)) + (+h.cupDiaMM || 35) / 2) / 25.4, cupR = (+h.cupDiaMM || 35) / 50.8, plX = 37 / 25.4;
  let s = '', x0 = 0;
  doors.forEach(([H]) => {
    const n = H <= h.max2 ? 2 : H <= h.max3 ? 3 : 4, a = bot, b = H - top, z = [...Array(n)].map((_, i) => a + (b - a) * i / (n - 1));
    const y = v => Hmax - v, sx = x0 + W + gap;
    s += `<text x="${x0 + (W + gap + D) / 2}" y="${Hmax + 5.5}" text-anchor="middle" class="hp-name" font-size="${fs * 1.1}">${fmtLen(H)}" door · ${n} hinges</text>`;
    s += `<rect x="${x0}" y="${y(H)}" width="${W}" height="${H}" class="hp-door"/><rect x="${sx}" y="${y(H)}" width="${D}" height="${H}" class="hp-side"/>`;
    s += `<text x="${x0 + W / 2}" y="${y(H) - 1.2}" text-anchor="middle" class="hp-lbl" font-size="${fs * .8}">Door</text><text x="${sx + D / 2}" y="${y(H) - 1.2}" text-anchor="middle" class="hp-lbl" font-size="${fs * .8}">Side</text>`;
    z.forEach(v => {
      s += `<line x1="${x0 + cupX}" y1="${y(v)}" x2="${sx + plX}" y2="${y(v)}" class="hp-link"/>`;
      s += `<circle cx="${x0 + cupX}" cy="${y(v)}" r="${cupR}" class="hp-cup"/>`;
      s += `<rect x="${sx + plX - 0.35}" y="${y(v) - 1.1}" width="0.7" height="2.2" rx="0.3" class="hp-plate"/>`;
      (h.plateHoles || []).forEach(ph => s += `<circle cx="${sx + (+ph.y || 37) / 25.4}" cy="${y(v + (+ph.dz || 0) / 25.4)}" r="0.22" class="hp-hole"/>`);
    });
    const dim = (z1, z2, t) => { const dx = x0 - 1.6; return `<line x1="${dx}" y1="${y(z1)}" x2="${dx}" y2="${y(z2)}" class="hp-dim"/><line x1="${dx - .6}" y1="${y(z1)}" x2="${dx + .6}" y2="${y(z1)}" class="hp-dim"/><line x1="${dx - .6}" y1="${y(z2)}" x2="${dx + .6}" y2="${y(z2)}" class="hp-dim"/><text x="${dx - .8}" y="${(y(z1) + y(z2)) / 2 + fs * .35}" text-anchor="end" class="hp-dt" font-size="${fs}">${t}</text>`; };
    s += dim(H, b, fmtLen(top)) + dim(a, 0, fmtLen(bot));
    x0 += col;
  });
  return `<svg viewBox="-12 -6 ${x0 + 2} ${Hmax + 14}" class="hp-svg" aria-label="Where the hinges go">${s}</svg>`;
}
// Fact tiles under the hardware picture.
function hwTiles(k, h) {
  const T = libTile, mm = v => (v ?? 0) + ' mm', n = f => { try { return usedBy(f); } catch (_) { return 0; } }, yes = v => v ? 'Yes' : 'No';
  switch (k) {
    case 'slide': return T('teal', 'ruler', (h.lengths || []).join(', ') + '"', 'Lengths') + T('violet', 'ruler', mm(h.sideThickMM), 'Drawer sides') + T('amber', 'list', (h.cabHoles || []).length, 'Holes per side') + T('blue', 'home', n(c => cabSet(c, 'slide') === h.id), 'Cabinets in this job');
    case 'hinge': { const jp = { ...SHOP_PARAMS, ...S.job.params }; return T('violet', 'door', `${fmtLen(+jp.hingeInset)} / ${fmtLen(+(jp.hingeInsetB ?? jp.hingeInset))}`, 'From door top / bottom') + T('teal', 'ruler', mm(h.cupDiaMM), 'Cup') + T('amber', 'list', `${h.max2 ?? ''}" / ${h.max3 ?? ''}"`, '2 / 3 hinges up to') + T('blue', 'home', n(c => cabSet(c, 'hinge') === h.id), 'Cabinets in this job'); }
    case 'pull': return T('amber', 'magnet', +h.ccMM ? mm(h.ccMM) : 'Knob', 'Hole spacing') + T('teal', 'ruler', mm(h.lengthMM), 'Length') + T('violet', 'ruler', mm(h.holeDiaMM), 'Hole') + T('blue', 'home', n(c => cabSet(c, 'pull') === h.id), 'Cabinets in this job');
    case 'shelfpin': return T('blue', 'list', mm(h.pinDiaMM), 'Hole') + T('teal', 'ruler', mm(h.pitchMM), 'Pitch') + T('violet', 'ruler', mm(h.pinSetbackMM), 'Row setback') + T('green', 'check', yes(S.job.defaults.shelfpin === h.id), 'Used for this job');
    case 'joint': return T('violet', 'join', money(+h.cost || 0), 'Each') + T('teal', 'ruler', (h.female || {}).dia ?? '', 'Female hole') + T('amber', 'ruler', (h.male || {}).dia ?? '', 'Male hole') + T('green', 'check', yes(S.job.defaults.jointU === h.id || S.job.defaults.jointF === h.id), 'Used for this job');
    case 'leg': return T('green', 'down', money(+h.cost || 0), 'Each') + T('teal', 'ruler', `${h.width ?? ''} × ${h.depth ?? ''}`, 'Leg size') + T('amber', 'ruler', h.inToe ?? '', 'Inset at toe') + T('blue', 'check', yes(S.job.defaults.leg === h.id), 'Used for this job');
    default: return T('blue', 'box', h.feet ? 'Feet' : (h.perCabinet ?? 1), h.feet ? 'Counted as cabinet feet' : 'Per cabinet') + T('green', 'tag', money(+h.cost || 0), 'Each') + T('teal', 'list', [].concat(h.cats || []).join(', ') || 'All', 'Cabinet types');
  }
}
function renderHardware() {
  const k = ui.hwKind || 'slide', items = hwOf(k);
  const num = (R, key, label, unit, val) => `<label class="f"><span>${label}${unit ? ` <span class="muted">(${unit})</span>` : ''}</span>${ctl(R, key, val, 'num', { label })}</label>`;
  const body = picked('hw-' + k, items).map(h => {
    const R = 'hw:' + h.id; let inner = '', prev = ''; const figs = [];
    if (k === 'slide') {
      const c = sampleCab({ slide: h.id, rows: [{ type: 'drawer', h: '*', count: 1 }, { type: 'drawer', h: '*', count: 1 }, { type: 'drawer', h: '*', count: 1 }], libParams: { shelfCount: 0 }, w: 18 });
      const b = buildParts(c), side = b.parts.find(p => p.name === 'Left side'), ds = b.parts.find(p => p.name === 'Drawer side');
      inner = `${fld('Notes', R, 'notes', h.notes, 'text', { wide: true })}${fld('Nominal lengths (in)', R, 'lengths', h.lengths, 'list', { wide: true })}
        <div class="autogrid">${num(R, 'sideThickMM', 'Drawer side thickness', 'mm', h.sideThickMM)}${num(R, 'widthDeductMM', 'Box width deduction', 'mm', h.widthDeductMM)}${num(R, 'bottomRecessMM', 'Bottom recess', 'mm', h.bottomRecessMM)}${num(R, 'bottomClearMM', 'Box above opening bottom', 'mm', h.bottomClearMM)}${num(R, 'topClearMM', 'Clearance above box', 'mm', h.topClearMM)}${num(R, 'rearClearMM', 'Extra depth needed', 'mm', h.rearClearMM)}</div>
        ${fld('Also add to hardware list', R, 'bomExtra', h.bomExtra, 'text', { wide: true })}
        <div class="eyebrow">Each length</div>
        <div class="note">Part number for the hardware list, the shortest inside cabinet depth it fits, and the runner screw holes measured back from the cabinet front (a "Runner hole #" row below drills hole 1, 2 or 3 of this list).</div>
        <div class="tscroll"><table class="t slen"><thead><tr><th>Length</th><th>Part number</th><th>Runner (mm)</th><th>Min inside depth (mm)</th><th>Screw holes from front (mm)</th></tr></thead><tbody>${(h.lengths || []).map(L => { const LR = 'hwlen:' + h.id + ':' + L, g = (m, d = '') => ((h[m] || {})[L] ?? d); return `<tr><td class="mono">${L}"</td><td>${ctl(LR, 'pn', g('partNos'), 'text', { label: L + '" part number' })}</td><td style="width:90px">${ctl(LR, 'runner', g('runnerMM'), 'num', { label: L + '" runner length' })}</td><td style="width:110px">${ctl(LR, 'minD', g('minDepthMM'), 'num', { label: L + '" minimum inside depth', ph: String(Math.round(L * 25.4 + (+h.rearClearMM || 0))) })}</td><td>${ctl(LR, 'holes', g('holeSets', []) || [], 'list', { label: L + '" screw holes' })}</td></tr>`; }).join('')}</tbody></table></div>
        <div class="eyebrow">Drilling on the cabinet sides (per drawer, both sides)</div>
        <div class="note">y is measured back from the cabinet front, z up from the drawer box bottom. Pick a reference to follow the runner's own holes, the 32 mm system or the slide length.</div>
        ${listEditor(R, 'cabHoles', [{ k: 'ref', label: 'Reference', type: 'select', options: HOLE_REFS }, { k: 'i', label: 'Hole #', w: 54 }, { k: 'y', label: 'y mm', w: 64 }, { k: 'z', label: 'z mm', w: 64 }, { k: 'dia', label: 'Ø mm', w: 58 }, { k: 'depth', label: 'Depth', w: 58 }], h.cabHoles)}
        <div class="eyebrow">Drilling on the drawer box</div>
        <div class="note">Side edge bores go in the end of each drawer side. x is from the front of the part, y up from its bottom edge, inset from the outer face.</div>
        ${listEditor(R, 'boxOps', [{ k: 'part', label: 'Part', type: 'select', options: ['side', 'back', 'bottom'] }, { k: 'type', label: 'Type', type: 'select', options: [{ v: 'hbore', l: 'Edge bore' }, { v: 'bore', l: 'Face bore' }] }, { k: 'edge', label: 'End', type: 'select', options: ['rear', 'front', ''] }, { k: 'x', label: 'x mm', w: 54 }, { k: 'y', label: 'y mm', w: 54 }, { k: 'inset', label: 'Inset', w: 54 }, { k: 'dia', label: 'Ø', w: 50 }, { k: 'depth', label: 'Depth', w: 54 }], h.boxOps)}`;
      if (side) { figs.push(['Cabinet side', partSVG(side, 220), 'Sample 18" base with three drawers']); if (ds) figs.push(['Drawer side', partSVG(ds, 140), `${fmtLen(ds.L, 1)} × ${fmtLen(ds.W, 1)}`]); } else prev = `<div class="warnbox">${esc(b.warn[0] || 'This slide does not fit the sample cabinet.')}</div>`;
    } else if (k === 'hinge') {
      const c = sampleCab({ hinge: h.id, rows: [{ type: 'door', h: '*', count: 1 }], cat: 'Wall', h: 30, d: 12, construction: { toeKick: false, top: 'full' }, libParams: { shelfCount: 0 } });
      const b = buildParts(c), door = b.parts.find(p => p.name === 'Door' || p.name.startsWith('Door stile')), side = b.parts.find(p => p.name === 'Left side');
      const jp = { ...SHOP_PARAMS, ...S.job.params };
      inner = `<div class="hwx-sub">${icon('door')}Where the hinges go</div><div class="autogrid">${fld('From top of door', 'jobp', 'hingeInset', jp.hingeInset, 'len')}${fld('From bottom of door', 'jobp', 'hingeInsetB', jp.hingeInsetB ?? jp.hingeInset, 'len')}${num(R, 'max2', '2 hinges on doors up to', 'in', h.max2)}${num(R, 'max3', '3 hinges on doors up to', 'in', h.max3)}${num(R, 'cupEdgeMM', 'Cup hole from door edge', 'mm', h.cupEdgeMM)}</div>
        <div class="hwx-ok">${icon('check')}<span>Taller doors get more hinges, spaced evenly between these two. Every door in this job uses these distances, and the mounting plates on the cabinet side are drilled to match.</span></div>
        <div class="hwx-sub">${icon('sliders')}The hinge</div><div class="autogrid">${num(R, 'cupDiaMM', 'Cup Ø', 'mm', h.cupDiaMM)}${num(R, 'cupDepthMM', 'Cup depth', 'mm', h.cupDepthMM)}</div>
        <div class="eyebrow">Extra holes on the door, per hinge</div><div class="note">dx along the door from the cup center, dy from the cup center toward the middle of the door.</div>
        ${listEditor(R, 'cupExtra', [{ k: 'dx', label: 'dx mm' }, { k: 'dy', label: 'dy mm' }, { k: 'dia', label: 'Ø mm' }, { k: 'depth', label: 'Depth' }], h.cupExtra)}
        <div class="eyebrow">Mounting plate holes on the cabinet side, per hinge</div><div class="note">dz up or down from the hinge centerline, y back from the cabinet front.</div>
        ${listEditor(R, 'plateHoles', [{ k: 'dz', label: 'dz mm' }, { k: 'y', label: 'y mm' }, { k: 'dia', label: 'Ø mm' }, { k: 'depth', label: 'Depth' }], h.plateHoles)}`;
      figs.push(['Placement', hingePlaceSVG(h), 'The plates on the cabinet side always line up with the hinges, on any door height']);
      if (door) figs.push(['Door', partSVG(door, 200), 'Sample 30" wall door']); if (side) figs.push(['Cabinet side', partSVG(side, 140), 'Mounting plate holes']);
    } else if (k === 'pull') {
      inner = `<div class="autogrid">${num(R, 'ccMM', 'Hole spacing (0 = knob)', 'mm', h.ccMM)}${num(R, 'lengthMM', 'Overall length', 'mm', h.lengthMM)}${num(R, 'holeDiaMM', 'Hole Ø', 'mm', h.holeDiaMM)}<label class="f"><span>Finish</span>${ctl(R, 'finish', h.finish, 'color', { label: 'Finish' })}</label></div>
        <div class="note">Where pulls land on each front is set in the door template (Doors tab).</div>`;
      const c = sampleCab({ doorT: S.doorTemplates[0].id, pull: h.id, w: 21 });
      const b = buildParts(c), df = b.parts.find(p => p.name === 'Drawer front');
      figs.push(['On a cabinet', frontPreviewSVG(c, 200), 'Sample 21" base']); if (df) figs.push(['Drawer front', partSVG(df, 110), 'Pull holes']);
    } else if (k === 'shelfpin') {
      inner = `<div class="autogrid">${num(R, 'pinDiaMM', 'Hole Ø', 'mm', h.pinDiaMM)}${num(R, 'pinDepthMM', 'Hole depth', 'mm', h.pinDepthMM)}${num(R, 'pinSetbackMM', 'Row setback (front and back)', 'mm', h.pinSetbackMM)}${num(R, 'pitchMM', 'Hole pitch', 'mm', h.pitchMM)}</div>
        <div class="note">Pin holes are skipped where they would hit a hinge plate or slide hole. ${S.job.defaults.shelfpin === h.id ? '<b>Used for this job.</b>' : `<button class="btn sm" data-act="pin-use" data-id="${h.id}">Use for this job</button>`}</div>`;
    } else if (k === 'joint') {
      const X = sub => 'hwx:' + h.id + ':' + sub, a = h.applies || {}, chk = (key, l) => `<label class="checkrow">${ctl(X('applies'), key, a[key] !== false && !!(a[key] ?? true), 'bool', { label: l })} ${l}</label>`;
      const loc = (sub, l, from) => { const o = h[sub] || (from && h[from]) || JOINT_LOC, cnt = o.mode === 'count';
        return `<div class="jt-loc"><b>${l}</b><label class="f"><span>How many</span>${ctl(X(sub), 'mode', o.mode || 'gap', 'select', { label: 'How many', options: [{ v: 'gap', l: 'By max spacing' }, { v: 'count', l: 'Set count' }] })}</label>${cnt ? fld('Holes per end', X(sub), 'count', o.count ?? 3, 'int') : fld('Max spacing', X(sub), 'maxGap', o.maxGap, 'num')}${fld('From front', X(sub), 'front', o.front, 'num')}${fld('From back', X(sub), 'back', o.back, 'num')}</div>`; };
      const fe = h.female || {}, ma = h.male || {};
      inner = `<div class="autogrid">${fld('Cost each', R, 'cost', h.cost, 'num')}</div>
        <div class="eyebrow">Applies to</div><div class="jt-applies">${chk('Base', 'Base cabinets')}${chk('Wall', 'Wall cabinets')}${chk('Tall', 'Tall cabinets')}${chk('fin', 'Finished ends')}${chk('unfin', 'Unfinished ends')}</div>
        <div class="eyebrow">Holes <span class="muted">(inches)</span></div><div class="note">Female: in the face of the side (or the bottom and top under a divider). Male: in the end of the panel that butts into it. Depth 0 drills through.</div>
        <div class="jt-holes"><div><b>Female side</b>${fld('Diameter', X('female'), 'dia', fe.dia, 'num')}${fld('Depth (0 = through)', X('female'), 'depth', fe.depth, 'num')}</div>
          <div><b>Male side</b>${fld('Diameter', X('male'), 'dia', ma.dia, 'num')}${fld('Depth', X('male'), 'depth', ma.depth, 'num')}</div></div>
        ${fld('Break dado distance', R, 'breakDado', h.breakDado, 'num')}
        <div class="eyebrow">Fastener</div>${jtFastenerBox(h, R)}
        <div class="eyebrow">Where they go</div><div class="note">Holes are spread evenly between the two insets: either no farther apart than the max spacing, or a set count at each end of the piece.</div>
        ${loc('ends', 'Bottom (into the sides)')}${loc('top', 'Top (into the sides)', 'ends')}${loc('dividers', 'Dividers (into the bottom and top)')}
        <div class="jt-loc"><b>Top stretchers</b>${fld('Holes per stretcher end', X('stretchers'), 'n', (h.stretchers || {}).n ?? 2, 'int')}</div>
        ${jtTypesBox(h)}
        <div class="note">${['jointU', 'jointF'].map(key => S.job.defaults[key] === h.id ? `<b>Job ${key === 'jointF' ? 'finished' : 'unfinished'} ends.</b>` : '').join(' ')} Pick which template each end uses in Settings › Templates and hardware › Cabinet and panels, for a room, or per cabinet in the cabinet editor.</div>`;
      const c = sampleCab({ w: 24, endL: a.fin ? 'fin' : 'unfin', endR: a.fin ? 'fin' : 'unfin', jointU: h.id, jointF: h.id, libParams: { shelfCount: 0 }, rows: [{ type: 'door', h: '*', count: 1 }] });
      const b = buildParts(c), side = b.parts.find(p => p.name === 'Left side'), bot = b.parts.find(p => p.name === 'Bottom');
      if (side) figs.push(['Cabinet side', partSVG(side, 200), 'Sample 24" base, left side']); if (bot) figs.push(['Bottom', partSVG(bot, 140), 'Sample 24" base']);
    } else if (k === 'leg') {
      inner = `<div class="autogrid">${fld('Cost each', R, 'cost', h.cost, 'num')}${fld('Leg width', R, 'width', h.width, 'num')}${fld('Leg depth', R, 'depth', h.depth, 'num')}</div>
        <div class="eyebrow">Position <span class="muted">(inches)</span></div><div class="note">Insets from the outside of the cabinet to the leg center. A finished end is an exposed end with no panel on it.</div>
        <div class="autogrid">${fld('Inset at toe (front)', R, 'inToe', h.inToe, 'num')}${fld('Inset at finished end', R, 'inFin', h.inFin, 'num')}${fld('Inset at unfinished end', R, 'inUnfin', h.inUnfin, 'num')}${fld('Inset at back', R, 'inBack', h.inBack, 'num')}${fld('Max leg separation (0 = off)', R, 'maxSep', h.maxSep, 'num')}</div>
        <label class="checkrow">${ctl(R, 'noBack', !!h.noBack, 'bool', { label: 'Remove back legs' })} Remove back legs</label>
        <div class="eyebrow">Hole in the bottom (flip side)</div><div class="autogrid">${fld('Hole diameter', R, 'holeDia', h.holeDia, 'num')}${fld('Hole depth', R, 'holeDepth', h.holeDepth, 'num')}</div>
        <div class="note">${S.job.defaults.leg === h.id ? '<b>Used for this job.</b>' : `<button class="btn sm" data-act="leg-use" data-id="${h.id}">Use for this job</button>`} The hole size is a starting guess; check it against the leg's spec sheet.</div>`;
      const c = sampleCab({ w: 36, libParams: { shelfCount: 0 } }), bot = buildParts(c).parts.find(p => p.name === 'Bottom');
      if (bot) figs.push(['Bottom', partSVG(bot, 200), 'Sample 36" base, leg holes on the underside']);
    } else {
      inner = `<label class="checkrow">${ctl(R, 'feet', h.feet, 'bool', { label: 'Cabinet feet' })} These are the cabinet feet (counted from the Feet per cabinet setting)</label>${h.feet ? '' : `<div class="autogrid">${fld('Per cabinet', R, 'perCabinet', h.perCabinet, 'int')}</div>`}${fld('Cabinet types (Base, Wall, Tall)', R, 'cats', [].concat(h.cats || []).join(', '), 'text', { wide: true })}<div class="note">Counted into the hardware list for every matching cabinet.</div>`;
    }
    const [hic] = HW_ICONS[k] || HW_ICONS.other, fi = Math.min(+ui.hwPv || 0, Math.max(0, figs.length - 1));
    // Main fields stay open; each table section (lengths, holes, ...) folds shut until opened.
    const parts = inner.split(/<div class="eyebrow">([\s\S]*?)<\/div>/); ui.hwOpen = ui.hwOpen || {};
    inner = parts[0] + parts.slice(1).map((x, j, a) => j % 2 ? '' : `<details class="hwx-fold"${ui.hwOpen[x.replace(/<[^>]+>/g, '')] ? ' open' : ''}><summary>${x}</summary><div class="hwx-fbody">${a[j + 1] || ''}</div></details>`).join('');
    return `<div class="hwx3" data-drag="hw:${h.id}">
      <div class="card plx-pic hwx-picc">${cardHead(esc(h.name), `${dupBtn('hw-dup', h.id)}${delBtn('hw-del', h.id, items.length < 2 && k !== 'other')}`)}
        ${figs.length > 1 ? `<div class="hwx-seg"><div class="seg">${figs.map((f, i) => `<button data-act="hw-pv" data-id="${i}" aria-pressed="${i === fi}">${f[0]}</button>`).join('')}</div></div>` : ''}
        <div class="hwx-pv">${figs.length ? `<div class="preview">${figs[fi][1]}</div><div class="hwx-cap">${esc(figs[fi][2] || '')}</div>` : prev || `<div class="hwx-ic">${icon(hic)}</div>`}</div>
        <div class="edx-stats plx-stats mlx-stats">${hwTiles(k, h)}</div></div>
      <div class="card hwcard hwx-props${ui.hwHelp ? ' help' : ''}">${cardHead('Settings', `<button class="btn sm${ui.hwHelp ? ' on' : ''}" data-act="hw-help" aria-pressed="${!!ui.hwHelp}" title="Show or hide the explanations">?</button>`)}
        <div class="cardbody"><div class="stack">${fld('Name', R, 'name', h.name, 'text', { wide: true })}${inner}<div class="note">Hardware drives part sizes and drilling: change a hole here and every cabinet using it updates. Starting numbers are typical published values; check them against the maker's spec sheet.</div></div></div></div></div>`;
  }).join('');
  $('#tab-hardware').innerHTML = `<div class="pagehead"><div><h2>Hardware</h2></div><button class="btn primary" data-act="hw-add" data-id="${k}">${icon('plus')}Add ${HW_KINDS.find(x => x[0] === k)[1].toLowerCase().replace(/s$/, '').replace('pulls and knob', 'pull')}</button></div>
  ${hwTabs(k)}
  <div class="plx mlx hwx"><div class="card plx-list">${hwList(k, items)}</div><div class="hwx-main">${body || `<div class="card rlx-empty"><div class="rlx-art">${icon((HW_ICONS[k] || HW_ICONS.other)[0])}</div><h3>No ${esc(HW_KINDS.find(x => x[0] === k)[1].toLowerCase())} yet</h3><p>Anything here is counted into the hardware list for every matching cabinet.</p><button class="btn primary" data-act="hw-add" data-id="${k}">${icon('plus')}Add one</button></div>`}</div></div>`;
}

/* ---------- Countertops ---------- */
// Tops page, laid out like Pricing and Cutlist: summary and styles on the left, the room's tops drawn in plan
// with the runs under it in the middle, the buttons on the right.
const TOP_TONES = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#0ea5e9', '#d946ef'];
function topTone(t) { const i = S.countertops.indexOf(t); return TOP_TONES[(i < 0 ? 0 : i) % TOP_TONES.length]; }
function topRunPoly(r) {
  const w = wall(r.wall); if (!w) return null;
  const g = wg(w), f = w.thick / 2;
  return r.poly || [wallPt(w, g, r.side, r.start - r.ovS, f), wallPt(w, g, r.side, r.end + r.ovE, f), wallPt(w, g, r.side, r.end + r.ovE, f + r.depth), wallPt(w, g, r.side, r.start - r.ovS, f + r.depth)];
}
// The open room seen from above: walls, base cabinets faint, each top in its style's colour with its run number.
function topsPlanSVG(runs) {
  const walls = S.walls || [];
  if (!walls.length) return '<div class="note show">Draw the walls in the Room tab to see the tops here.</div>';
  const pts = []; walls.forEach(w => pts.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }));
  const polys = runs.map(r => r.on ? topRunPoly(r) : null); polys.forEach(p => p && pts.push(...p));
  const x0 = Math.min(...pts.map(p => p.x)) - 24, y0 = Math.min(...pts.map(p => p.y)) - 24, x1 = Math.max(...pts.map(p => p.x)) + 24, y1 = Math.max(...pts.map(p => p.y)) + 24;
  const fs = Math.max(x1 - x0, y1 - y0) / 42;
  let svg = walls.map(w => `<line class="ctp-wall" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke-width="${w.thick || 4.5}"/>`).join('');
  svg += S.cabinets.filter(c => c.cat !== 'Wall').map(c => { const p = cabPoly(c); return p ? `<polygon class="ctp-cab" points="${polyPts(p)}"/>` : ''; }).join('');
  runs.forEach((r, i) => {
    const p = polys[i]; if (!p) return;
    const col = r.generic ? '#64748b' : topTone(r.tpl), mx = p.reduce((a, q) => a + q.x, 0) / p.length, my = p.reduce((a, q) => a + q.y, 0) / p.length;
    svg += `<polygon class="ctp-top${ui.topRun === r.key ? ' on' : ''}" data-act="top-run" data-id="${esc(r.key)}" points="${polyPts(p)}" style="--c:${col}"><title>${esc(r.generic ? r.name : r.tpl.name)} · ${fmtLen(r.len, 1)}</title></polygon>`;
    svg += `<g class="ctp-num" pointer-events="none"><circle cx="${mx}" cy="${my}" r="${fs * 0.9}" style="fill:${col}"/><text x="${mx}" y="${my}" font-size="${fs}" text-anchor="middle" dominant-baseline="central">${i + 1}</text></g>`;
  });
  return `<svg class="ctp-svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
}
// A countertop style drawn in section over a cabinet: thickness, front overhang and backsplash, with sizes.
function topSectionSVG(t) {
  const D = 24, H = 34.5, th = +t.thick || 1.25, ov = +t.frontOverhang || 0, bs = +t.backsplash || 0, m = mat(t.mat) || {};
  const col = m.color || '#e7e5e4', x0 = -ov - 7, x1 = D + 7, top = H + th + bs + 5;
  const dim = (xa, ya, xb, yb, l, tx, ty, anchor = 'middle') => `<g class="ctp-dim"><line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}"/><line class="tk" x1="${xa}" y1="${ya}" x2="${xa}" y2="${ya}"/><text x="${tx}" y="${ty}" font-size="1.25" text-anchor="${anchor}" dominant-baseline="central">${esc(l)}</text></g>`;
  const cab = `M0 ${-H}H${D}V0H3V-4H0Z`;
  return `<svg class="ctp-sec" viewBox="${x0} ${-top} ${x1 - x0} ${top + 3}" aria-label="${esc(t.name)} in section">
    <line class="ctp-floor" x1="${x0}" y1="0" x2="${x1}" y2="0"/>
    <rect class="ctp-wallsec" x="${D}" y="${-top}" width="1.2" height="${top}"/>
    <path class="ctp-seccab" d="${cab}"/><rect class="ctp-door" x="-0.75" y="${-H + 0.6}" width="0.75" height="${H - 4.6}"/>
    <rect x="${-ov}" y="${-H - th}" width="${D + ov}" height="${th}" fill="${esc(col)}" stroke="#334155" stroke-width=".15"/>
    ${bs > 0 ? `<rect x="${D - Math.min(th, 0.75)}" y="${-H - th - bs}" width="${Math.min(th, 0.75)}" height="${bs}" fill="${esc(col)}" stroke="#334155" stroke-width=".15"/>` : ''}
    ${ov > 0 ? dim(-ov, -H - th - 1.4, 0, -H - th - 1.4, fmtLen(ov), -ov / 2, -H - th - 2.6) : ''}
    ${dim(-ov - 1.4, -H - th, -ov - 1.4, -H, fmtLen(th), -ov - 2, -H - th / 2, 'end')}
    ${bs > 0 ? dim(D - 2, -H - th - bs, D - 2, -H - th, fmtLen(bs), D - 2.6, -H - th - bs / 2, 'end') : ''}
    ${dim(D + 3.2, -H, D + 3.2, 0, fmtLen(H), D + 3.8, -H / 2, 'start').replace('<text', '<text transform="rotate(90 ' + (D + 3.8) + ' ' + (-H / 2) + ')" ').replace('text-anchor="start"', 'text-anchor="middle"')}
  </svg>`;
}
function renderCountertops() {
  const runs = countertopRuns(), topOpts = opts(S.countertops), room = curRoom(), auto = room.autoTops !== false;
  const on = runs.filter(r => r.on), sq = on.reduce((a, r) => a + r.len * r.depth / 144, 0), lf = on.reduce((a, r) => a + r.len, 0) / 12;
  const view = ui.topView === 'styles' ? 'styles' : 'runs';
  const id = pickId('top', S.countertops), t = S.countertops.find(x => x.id === id) || S.countertops[0];
  const usedRuns = x => S.rooms.reduce((n, r) => n + withRoom(r, () => countertopRuns().filter(q => q.on && q.tpl && q.tpl.id === x.id).length), 0);
  // Left: the totals, the room's style, and the styles as tiles.
  const side = `<div class="prx-grand ctx-grand"><span>Countertops in ${esc(room.name)}</span><b>${sq.toFixed(1)} sq ft</b><small>${on.length} run${on.length === 1 ? '' : 's'} · ${lf.toFixed(1)} ft long</small></div>
    <label class="cl-f"><span>Style for ${esc(room.name)}</span>${ctl('rset:' + room.id, 'countertop', room.settings.countertop || '', 'select', { options: setOpts('countertop', topOpts), label: 'Style for ' + room.name })}</label>
    <div class="prx-navh">Countertop styles</div><div class="cl-mats">${S.countertops.map(x => { const n = usedRuns(x); return `<button class="cl-mat ctx-style${view === 'styles' && x.id === t.id ? ' on' : ''}" data-act="top-pick" data-id="${esc(x.id)}" style="--c:${topTone(x)}">${swatch(mat(x.mat) || {}, 26)}<span><b>${esc(x.name)}</b><small>${fmtLen(x.thick)} thick${n ? ` · ${n} run${n === 1 ? '' : 's'}` : ''}</small></span><i class="ctx-dot"></i></button>`; }).join('')}</div>`;
  const tabs = `<div class="setx-tabs prx-tabs" role="tablist">${[['runs', 'Runs', 'ruler'], ['styles', 'Styles', 'stack']].map(([k, l, ic]) => `<button role="tab" data-act="top-view" data-id="${k}" aria-selected="${view === k}">${icon(ic)}${l}</button>`).join('')}</div>`;
  // Middle, Runs: the plan, then one line per run (number matches the plan), then tops placed by hand.
  const autoRows = runs.map((r, i) => {
    if (r.generic) return '';
    const R = 'ctrun:' + r.key, col = topTone(r.tpl);
    return `<tr class="${r.on ? '' : 'off'}${ui.topRun === r.key ? ' on' : ''}"><td><span class="ctx-num" style="background:${r.on ? col : 'var(--muted)'}">${i + 1}</span></td><td>${wallName(wall(r.wall))}</td><td>${r.cabs.map(cid => LBL[cid]).join(', ')}</td><td style="min-width:150px">${ctl(R, 'top', r.tpl.id, 'select', { options: topOpts, label: 'Style' })}</td><td class="n">${fmtLen(r.len, 1)}</td><td class="n">${fmtLen(r.depth, 1)}</td>
      <td style="width:84px">${ctl(R, 'ovS', r.ovS, 'len', { label: 'Start overhang' })}</td><td style="width:84px">${ctl(R, 'ovE', r.ovE, 'len', { label: 'End overhang' })}</td><td style="text-align:center">${ctl(R, 'off', !r.on, 'bool', { label: 'Leave off' })}</td></tr>`;
  }).join('');
  const runsBody = `<div class="psec box ctx-plan">${secHead('home', `${esc(room.name)} from above`, 'amber')}${topsPlanSVG(runs)}</div>
    <div class="psec box">${secHead('ruler', 'Automatic runs', 'teal')}${auto ? '' : '<div class="note show">Automatic tops are off in this room. Auto build countertops on the right lays a top on every run of base cabinets.</div>'}
      ${autoRows ? `<div class="tscroll"><table class="t ctx-t"><thead><tr><th>#</th><th>Wall</th><th>Cabinets</th><th>Style</th><th class="r">Length</th><th class="r">Depth</th><th>Start overhang</th><th>End overhang</th><th>Leave off</th></tr></thead><tbody>${autoRows}</tbody></table></div>` : auto ? '<div class="note show">Place base cabinets to get countertop runs.</div>' : ''}</div>
    ${(S.genTops || []).length ? genTopsCard(topOpts) : ''}`;
  // Middle, Styles: the picked style drawn in section, its facts, and its boxes.
  const R = 'top:' + t.id, n = usedRuns(t), m = mat(t.mat) || {};
  const tile = (tone, ic, v, lb) => `<div class="edx-stat ${tone}">${icon(ic)}<b>${esc(String(v))}</b><span>${lb}</span></div>`;
  const stylesBody = `<div class="ctx-style-grid"><div class="psec box ctx-pic">${secHead('stack', esc(t.name), 'amber')}<div class="ctx-pv">${topSectionSVG(t)}</div>
      <div class="edx-stats">${tile('amber', 'ruler', fmtLen(t.thick), 'Thickness')}${tile('teal', 'ruler', fmtLen(t.frontOverhang), 'Front overhang')}${tile('violet', 'ruler', fmtLen(t.endOverhang), 'Open end overhang')}${tile('blue', 'home', n, 'Runs using it')}</div></div>
    <div class="ctx-props"><div class="psec box">${secHead('edit', 'Style', 'amber')}${fld('Name', R, 'name', t.name, 'text', { wide: true })}<div class="ctx-matrow">${swatch(m, 30)}${fld('Material', R, 'mat', t.mat, 'select', { options: matOpts('top'), wide: true })}</div></div>
      <div class="psec box">${secHead('ruler', 'Size', 'teal')}<div class="grid2">${fld('Thickness', R, 'thick', t.thick, 'len')}${fld('Backsplash height', R, 'backsplash', t.backsplash, 'len')}${fld('Front overhang', R, 'frontOverhang', t.frontOverhang, 'len')}${fld('End overhang', R, 'endOverhang', t.endOverhang, 'len')}</div><div class="note help">Ends against a wall or a tall cabinet get no overhang; open ends get the end overhang.</div></div></div></div>`;
  const b = (act, ic, l, x = '', bid = '') => `<button class="btn${x}" data-act="${act}"${bid ? ` data-id="${esc(bid)}"` : ''}>${icon(ic)}${l}</button>`;
  const acts = `<div class="prx-acts">${auto ? b('tops-auto', 'check', 'Rebuild tops', ' primary') + b('tops-auto-off', 'close', 'Turn off auto tops') : b('tops-auto', 'check', 'Auto build countertops', ' primary')}
    ${b('gtop-add', 'plus', 'Add a top by hand')}${b('tab', 'home', 'Show in the room', '', 'room')}
    <span class="edx-sep"></span><div class="prx-acth">Styles</div>${b('top-add', 'plus', 'New style')}${b('lp-copy', 'copy', 'Copy this style', '', 'top')}${S.countertops.length > 1 ? b('top-del', 'trash', 'Delete this style', ' danger', t.id) : ''}</div>`;
  $('#tab-countertops').innerHTML = `<div class="prx ctx"><aside class="prx-side">${side}</aside>
    <section class="prx-main"><div class="prx-top"><h2>Countertops</h2>${tabs}</div><div class="prx-body">${view === 'styles' ? stylesBody : runsBody}</div></section>${acts}</div>`;
}

// Automatic countertop runs of the open room, on the Tops tab and in the Room's Tops panel.
function autoTopsCard(runs, topOpts) {
  return `<div class="card">${cardHead('Automatic runs in ' + esc(curRoom().name), curRoom().autoTops === false ? `<button class="btn primary" data-act="tops-auto">${icon('check')}Auto build countertops</button>` : `<button class="btn" data-act="tops-auto">Rebuild</button><button class="btn" data-act="tops-auto-off">Turn off</button>`)}<div class="tscroll"><table class="t"><thead><tr><th>Wall</th><th>Cabinets</th><th>Style</th><th class="r">Length</th><th class="r">Depth</th><th>Start overhang</th><th>End overhang</th><th>Leave off</th></tr></thead><tbody>${runs.filter(r => !r.generic).map(r => {
    const R = 'ctrun:' + r.key;
    return `<tr><td>${wallName(wall(r.wall))}</td><td>${r.cabs.map(id => LBL[id]).join(', ')}</td><td style="min-width:150px">${ctl(R, 'top', r.tpl.id, 'select', { options: topOpts })}</td><td class="n">${fmtLen(r.len, 1)}</td><td class="n">${fmtLen(r.depth, 1)}</td>
      <td style="width:80px">${ctl(R, 'ovS', r.ovS, 'len')}</td><td style="width:80px">${ctl(R, 'ovE', r.ovE, 'len')}</td><td style="text-align:center">${ctl(R, 'off', !r.on, 'bool', { label: 'Leave off' })}</td></tr>`;
  }).join('') || `<tr><td colspan="8" class="muted">${curRoom().autoTops === false ? 'Automatic tops are off in this room. Auto build countertops lays a top on every run of base cabinets.' : 'Place base cabinets to get countertop runs.'}</td></tr>`}</tbody></table></div></div>`;
}
// Tops placed by hand: any length, depth and height on any wall, for islands of loose parts, desks and bars.
const wallOpts = () => S.walls.map(w => ({ v: w.id, l: `${wallName(w)} · ${fmtLen(wg(w).L, 1)}` }));
const sideOpts = [{ v: 1, l: 'Front' }, { v: -1, l: 'Back' }];
function genTopsCard(topOpts) {
  return `<div class="card">${cardHead('Tops placed by hand', `<button class="btn" data-act="gtop-add">${icon('plus')}Add top</button>`)}<div class="tscroll"><table class="t gentab"><thead><tr><th>Name</th><th>Wall</th><th>Side</th><th>Style</th><th class="r">From wall start</th><th class="r">Length</th><th class="r">Depth</th><th class="r">Height to bottom</th><th class="r">Thickness</th><th></th></tr></thead><tbody>
    ${(S.genTops || []).map(g => { const R = 'gtop:' + g.id; return `<tr><td style="min-width:130px">${ctl(R, 'name', g.name, 'text', { label: 'Name' })}</td><td style="min-width:150px">${ctl(R, 'wall', g.wall, 'select', { options: wallOpts(), label: 'Wall' })}</td><td style="width:90px">${ctl(R, 'side', g.side || 1, 'select', { options: sideOpts, label: 'Side' })}</td>
      <td style="min-width:140px">${ctl(R, 'top', g.top || '', 'select', { options: [{ v: '', l: 'Room style' }, ...topOpts], label: 'Style' })}</td>${['off', 'len', 'depth', 'z'].map(k => `<td style="width:90px">${ctl(R, k, g[k], 'len', { label: k })}</td>`).join('')}<td style="width:80px">${ctl(R, 'thick', g.thick || '', 'len', { label: 'Thickness', blank: true, ph: 'Style' })}</td>
      <td><button class="btn sm danger" data-act="gtop-del" data-id="${g.id}" aria-label="Delete top">${icon('trash')}</button></td></tr>`; }).join('') || `<tr><td colspan="10" class="muted">None. Add top puts a ${fmtLen(25.5)} deep top on the wall shown in the elevation; set its size and place here.</td></tr>`}</tbody></table></div></div>`;
}

// Molding runs placed by hand or drawn along the walls in plan, not tied to cabinets.
function genMoldsCard() {
  const mo = opts(S.moldings);
  return `<div class="card">${cardHead('Molding placed by hand', `<button class="btn" data-act="gmold-draw">${icon('wall')}Draw molding runs</button><button class="btn" data-act="gmold-add">${icon('plus')}Add run</button>`)}<div class="tscroll"><table class="t gentab"><thead><tr><th>Wall</th><th>Side</th><th>Molding</th><th class="r">From wall start</th><th class="r">Length</th><th class="r">Height</th><th class="r">Out from wall</th><th>Returns</th><th></th></tr></thead><tbody>
    ${(S.genMolds || []).map(g => { const R = 'gmold:' + g.id; return `<tr><td style="min-width:150px">${ctl(R, 'wall', g.wall, 'select', { options: wallOpts(), label: 'Wall' })}</td><td style="width:90px">${ctl(R, 'side', g.side || 1, 'select', { options: sideOpts, label: 'Side' })}</td>
      <td style="min-width:140px">${ctl(R, 'mold', g.mold || '', 'select', { options: mo, label: 'Molding' })}</td>${['off', 'len', 'z', 'd'].map(k => `<td style="width:90px">${ctl(R, k, g[k], 'len', { label: k })}</td>`).join('')}
      <td class="nowrap"><label class="checkrow">${ctl(R, 'retS', !!g.retS, 'bool', { label: 'Start return' })} Start</label> <label class="checkrow">${ctl(R, 'retE', !!g.retE, 'bool', { label: 'End return' })} End</label></td>
      <td><button class="btn sm danger" data-act="gmold-del" data-id="${g.id}" aria-label="Delete run">${icon('trash')}</button></td></tr>`; }).join('') || '<tr><td colspan="9" class="muted">None. Draw molding runs lets you click along the walls in plan, like drawing walls.</td></tr>'}</tbody></table></div></div>`;
}

/* ---------- Moldings ---------- */
// Auto build molding controls, on the Molding tab and in the Room's Molding panel.
function autoMoldBox(runs) {
  return `<div class="qm-box"><div class="quick">
      <label class="f wide"><span>Molding</span><select class="qm-mold">${S.moldings.map(m => `<option value="${m.id}"${m.id === roomSet('molding') ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <label class="f"><span>Within this much of the ceiling</span><input type="text" class="num qm-gap" value="${esc(fmtLen(ui.qmGap ?? 12))}"></label>
      <label class="checkrow"><input type="checkbox" class="qm-tall"${ui.qmTall !== false ? ' checked' : ''}> Include tall cabinets</label>
      <div class="row-actions"><button class="btn primary" data-act="mold-quick">Auto build molding</button><button class="btn" data-act="mold-clear">Remove from cabinets</button></div>
    </div><div class="note qm-note">${runs.length ? `${runs.length} run${runs.length === 1 ? '' : 's'} in ${esc(curRoom().name)}.` : `No moldings in ${esc(curRoom().name)} yet.`}</div></div>`;
}

// Molding page, laid out like Tops, Pricing and Cutlist.
const MOLD_PROFILES = [{ v: 'crown', l: 'Crown' }, { v: 'cove', l: 'Cove' }, { v: 'flat', l: 'Flat / batten' }, { v: 'shape', l: 'Custom shape' }];
const moldTone = m => TOP_TONES[(Math.max(0, S.moldings.indexOf(m)) + 3) % TOP_TONES.length];
// The molding's side profile; dims adds its height and projection.
function moldProfileSVG(m, dims) {
  const steps = m.profile === 'flat' ? [[1, 1]] : m.profile === 'crown' ? [[0.45, 0.4], [0.55, 1]] : [[0.5, 0.55], [0.5, 1]];
  let y = 0; const outl = moldProfile(m), col = ((mat(m.mat) || {}).color) || '#e7e5e4';
  const st = `fill="${esc(col)}" stroke="#334155" stroke-width="${dims ? 0.03 : 0.06}"`;
  // Stock profiles drawn with their curves: a sprung crown with an ogee face, a cove, a flat batten.
  const h = m.h, d = m.d, P = (x, yy) => `${r3(x)},${r3(-yy)}`;
  const stock = m.profile === 'crown' ? `M${P(0, 0)}L${P(d * 0.22, 0)}L${P(d * 0.22, h * 0.08)}C${P(d * 0.22, h * 0.45)} ${P(d * 0.95, h * 0.4)} ${P(d * 0.92, h * 0.86)}L${P(d, h * 0.9)}L${P(d, h)}L${P(d * 0.78, h)}Z`
    : m.profile === 'cove' ? `M${P(0, 0)}L${P(d * 0.18, 0)}Q${P(d * 0.22, h * 0.82)} ${P(d, h * 0.86)}L${P(d, h)}L${P(0, h)}Z` : '';
  const prof = outl ? `<polygon ${st} points="${outl.map(p => `${r3(p.x)},${r3(-p.y)}`).join(' ')}"/>` : stock ? `<path ${st} d="${stock}"/>` : steps.map(([hf, df]) => { const r = `<rect ${st} x="0" y="${-(y + m.h * hf)}" width="${m.d * df}" height="${m.h * hf}"/>`; y += m.h * hf; return r; }).join('');
  const S_ = Math.max(m.d, m.h);
  if (!dims) return `<svg class="mold-mini" viewBox="${-S_ * 0.1} ${-m.h - S_ * 0.1} ${S_ * 1.2} ${S_ * 1.2}" aria-hidden="true">${prof}</svg>`;
  const u = S_ / 14, fs = u * 0.9;
  return `<svg class="mold-big" viewBox="${-S_ * 0.55} ${-m.h - S_ * 0.35} ${S_ * 1.9} ${m.h + S_ * 0.8}" aria-label="${esc(m.name)} side profile">
    <rect class="mold-cab" x="${-S_ * 0.5}" y="0" width="${S_ * 0.5}" height="${S_ * 0.4}"/>${prof}
    <g class="ctp-dim"><line x1="${m.d + u * 2}" y1="${-m.h}" x2="${m.d + u * 2}" y2="0" style="stroke-width:${u * 0.1}"/><text x="${m.d + u * 2.6}" y="${-m.h / 2}" font-size="${fs}" dominant-baseline="central">${esc(fmtLen(m.h))}</text>
      <line x1="0" y1="${-m.h - u * 1.6}" x2="${m.d}" y2="${-m.h - u * 1.6}" style="stroke-width:${u * 0.1}"/><text x="${m.d / 2}" y="${-m.h - u * 2.6}" font-size="${fs}" text-anchor="middle">${esc(fmtLen(m.d))}</text></g></svg>`;
}
// The open room from above with each molding run drawn along the cabinet fronts, returns back to the wall.
function moldPlanSVG(runs) {
  const walls = S.walls || [];
  if (!walls.length) return '<div class="note show">Draw the walls in the Room tab to see the molding here.</div>';
  const pts = []; walls.forEach(w => pts.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }));
  const x0 = Math.min(...pts.map(p => p.x)) - 24, y0 = Math.min(...pts.map(p => p.y)) - 24, x1 = Math.max(...pts.map(p => p.x)) + 24, y1 = Math.max(...pts.map(p => p.y)) + 24;
  const fs = Math.max(x1 - x0, y1 - y0) / 42;
  let svg = walls.map(w => `<line class="ctp-wall" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke-width="${w.thick || 4.5}"/>`).join('');
  svg += S.cabinets.map(c => { const p = cabPoly(c); return p ? `<polygon class="ctp-cab${c.cat === 'Base' ? ' base' : ''}" points="${polyPts(p)}"/>` : ''; }).join('');
  runs.forEach((r, i) => {
    const w = wall(r.wall); if (!w) return;
    const g = wg(w), f = w.thick / 2, d = f + (r.d || 0) + (r.m ? r.m.d : 0), col = moldTone(r.m);
    const line = [...(r.retS ? [wallPt(w, g, r.side, r.start - (r.m ? r.m.d : 0), f)] : []), wallPt(w, g, r.side, r.start - (r.retS && r.m ? r.m.d : 0), d), wallPt(w, g, r.side, r.end + (r.retE && r.m ? r.m.d : 0), d), ...(r.retE ? [wallPt(w, g, r.side, r.end + (r.m ? r.m.d : 0), f)] : [])];
    const mid = wallPt(w, g, r.side, (r.start + r.end) / 2, d + fs * 1.4);
    svg += `<polyline class="mdp-run${ui.moldRun === i ? ' on' : ''}" data-act="mold-run" data-id="${i}" points="${polyPts(line)}" style="--c:${col}" stroke-width="${fs * 0.45}"><title>${esc(r.m.name)} · ${fmtLen(r.len, 1)}</title></polyline>`;
    svg += `<g class="ctp-num" pointer-events="none"><circle cx="${mid.x}" cy="${mid.y}" r="${fs * 0.9}" style="fill:${col}"/><text x="${mid.x}" y="${mid.y}" font-size="${fs}" text-anchor="middle" dominant-baseline="central">${i + 1}</text></g>`;
  });
  return `<svg class="ctp-svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
}
function renderMoldings() {
  const runs = moldingRuns(), room = curRoom();
  const view = ui.moldView === 'styles' ? 'styles' : 'runs';
  const id = pickId('mold', S.moldings), m = S.moldings.find(x => x.id === id) || S.moldings[0];
  const tot = {}; runs.forEach(r => { tot[r.m.id] = (tot[r.m.id] || 0) + r.len; });
  const all = runs.reduce((a, r) => a + r.len, 0), sticks = Object.values(tot).reduce((a, L) => a + Math.ceil(L * 1.1 / 96), 0);
  const side = `<div class="prx-grand mdx-grand"><span>Molding in ${esc(room.name)}</span><b>${(all * 1.1 / 12).toFixed(1)} ft</b><small>${runs.length} run${runs.length === 1 ? '' : 's'} · ${sticks} stick${sticks === 1 ? '' : 's'} of 8 ft, with 10% waste</small></div>
    <div class="prx-navh">Auto build</div><div class="mdx-auto">${autoMoldBox(runs)}</div>
    <div class="prx-navh">Moldings</div><div class="cl-mats">${S.moldings.map(x => { const n = usedBy(c => c.molding === x.id); return `<button class="cl-mat ctx-style${view === 'styles' && x.id === m.id ? ' on' : ''}" data-act="mold-pick" data-id="${esc(x.id)}" style="--c:${moldTone(x)}" data-drag="mold:${x.id}"><span class="mdx-pic">${moldProfileSVG(x)}</span><span><b>${esc(x.name)}</b><small>${fmtLen(x.h)} high${n ? ` · ${nCab(n)}` : ''}</small></span><i class="ctx-dot"></i></button>`; }).join('')}</div>`;
  const tabs = `<div class="setx-tabs prx-tabs" role="tablist">${[['runs', 'Runs', 'ruler'], ['styles', 'Moldings', 'stack']].map(([k, l, ic]) => `<button role="tab" data-act="mold-view" data-id="${k}" aria-selected="${view === k}">${icon(ic)}${l}</button>`).join('')}</div>`;
  const rows = runs.map((r, i) => `<tr class="${ui.moldRun === i ? 'on' : ''}"><td><span class="ctx-num" style="background:${moldTone(r.m)}">${i + 1}</span></td><td>${wallName(wall(r.wall))}</td><td>${r.generic ? '<span class="muted">Placed by hand</span>' : r.cabs.map(cid => LBL[cid]).join(', ')}</td><td>${esc(r.m.name)}</td><td class="n">${fmtLen(r.h)}</td><td class="n">${fmtLen(r.front, 1)}</td><td class="n">${fmtLen(r.returns, 1)}</td><td class="n"><b>${fmtLen(r.len, 1)}</b></td></tr>`).join('');
  const totals = Object.entries(tot).map(([mid, L]) => { const x = molding(mid); return `<div class="mdx-tot" style="--c:${moldTone(x)}"><span class="mdx-pic">${moldProfileSVG(x)}</span><span><b>${esc(x.name)}</b><small>${(L * 1.1 / 12).toFixed(1)} ft with 10% waste</small></span><b class="mdx-st">${Math.ceil(L * 1.1 / 96)} × 8 ft</b></div>`; }).join('');
  const runsBody = `<div class="psec box ctx-plan">${secHead('home', `${esc(room.name)} from above`, 'violet')}${moldPlanSVG(runs)}</div>
    ${totals ? `<div class="psec box">${secHead('stack', 'To order', 'amber')}<div class="mdx-tots">${totals}</div></div>` : ''}
    <div class="psec box">${secHead('ruler', 'Runs', 'teal')}${rows ? `<div class="tscroll"><table class="t ctx-t"><thead><tr><th>#</th><th>Wall</th><th>Cabinets</th><th>Molding</th><th class="r">Height</th><th class="r">Front</th><th class="r">Returns</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="note show">No molding in ${esc(room.name)} yet. Auto build molding on the left puts it on every upper cabinet close to the ceiling, or drag a molding onto a cabinet in the Room.</div>`}</div>
    ${(S.genMolds || []).length ? genMoldsCard() : ''}`;
  const R = 'mold:' + m.id, n = usedBy(c => c.molding === m.id), ft = S.rooms.reduce((a, rm) => a + withRoom(rm, () => moldingRuns().filter(r => r.m.id === m.id).reduce((q, r) => q + r.len, 0)), 0) / 12;
  const tile = (tone, ic, v, lb) => `<div class="edx-stat ${tone}">${icon(ic)}<b>${esc(String(v))}</b><span>${lb}</span></div>`;
  const stylesBody = `<div class="ctx-style-grid"><div class="psec box ctx-pic">${secHead('stack', esc(m.name), 'violet')}<div class="ctx-pv mdx-pv">${moldProfileSVG(m, true)}</div>
      <div class="edx-stats">${tile('violet', 'ruler', fmtLen(m.h), 'Height')}${tile('teal', 'ruler', fmtLen(m.d), 'Projection')}${tile('amber', 'home', nCab(n), 'In this job')}${tile('blue', 'ruler', ft.toFixed(1) + ' ft', 'Length in this job')}</div></div>
    <div class="ctx-props"><div class="psec box">${secHead('edit', 'Molding', 'violet')}${fld('Name', R, 'name', m.name, 'text', { wide: true })}${fld('Profile', R, 'profile', m.profile, 'select', { options: MOLD_PROFILES })}
        ${m.profile === 'shape' ? `<div class="row-actions"><button class="btn sm" data-act="mold-draw" data-id="${m.id}">${icon('ruler')}Edit the profile in the shape editor</button></div>` : ''}
        <div class="ctx-matrow">${swatch(mat(m.mat) || {}, 30)}${fld('Material', R, 'mat', m.mat, 'select', { options: matOpts(), wide: true })}</div></div>
      <div class="psec box">${secHead('ruler', 'Size', 'teal')}<div class="grid2">${fld('Height', R, 'h', m.h, 'len')}${fld('Projection', R, 'd', m.d, 'len')}</div></div>
      <div class="psec box">${secHead('sliders', 'Where it goes', 'amber')}<label class="checkrow">${ctl(R, 'fill', m.fill, 'bool', { label: 'Fill to ceiling' })} Fill the gap to the ceiling (up to 12")</label>
        <label class="checkrow">${ctl(R, 'bottom', !!m.bottom, 'bool', { label: 'Light rail' })} Goes under the cabinet (light rail)</label></div></div></div>`;
  const b = (act, ic, l, x = '', bid = '') => `<button class="btn${x}" data-act="${act}"${bid ? ` data-id="${esc(bid)}"` : ''}>${icon(ic)}${l}</button>`;
  const acts = `<div class="prx-acts">${b('gmold-draw', 'wall', 'Draw molding runs')}${b('gmold-add', 'plus', 'Add a run by hand')}${b('tab', 'home', 'Show in the room', '', 'room')}
    <span class="edx-sep"></span><div class="prx-acth">Moldings</div>${b('mold-add', 'plus', 'New molding')}${b('mold-add-shape', 'ruler', 'Draw a new profile')}${b('lp-copy', 'copy', 'Copy this molding', '', 'mold')}${S.moldings.length > 1 ? b('mold-del', 'trash', 'Delete this molding', ' danger', m.id) : ''}</div>`;
  $('#tab-moldings').innerHTML = `<div class="prx ctx mdx"><aside class="prx-side">${side}</aside>
    <section class="prx-main"><div class="prx-top"><h2>Molding</h2>${tabs}</div><div class="prx-body">${view === 'styles' ? stylesBody : runsBody}</div></section>${acts}</div>`;
}

/* ---------- Part templates (edgebanding) ---------- */
// Banded length per edgeband over the whole job, in inches.
function bandUsage() {
  const use = {};
  S.rooms.forEach(rm => withRoom(rm, () => allParts().forEach(p => EDGE_KEYS.forEach(k => { const id = p.band[k]; if (id) use[id] = (use[id] || 0) + (k[0] === 'L' ? p.L : p.W) * p.qty; }))));
  return use;
}
function ptMini(t) {
  const b = partBands(t, 'side'), on = k => edgeband(b[k]), col = k => esc((on(k) || {}).color || '#c90');
  const ln = (k, x1, y1, x2, y2) => on(k) ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col(k)}" stroke-width="3" stroke-linecap="round"/>` : '';
  return `<svg viewBox="0 0 30 30" aria-hidden="true"><rect x="5" y="9" width="20" height="12" rx="1" fill="var(--panel)" stroke="var(--muted)" stroke-width="1"/>${ln('L1', 5, 9, 25, 9)}${ln('L2', 5, 21, 25, 21)}${ln('W1', 5, 9, 5, 21)}${ln('W2', 25, 9, 25, 21)}</svg>`;
}
function ebRoll(b, big) {
  const c = esc(b.color || '#d8c49a');
  if (!big) return `<svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="12" fill="${c}" stroke="#0003"/><circle cx="15" cy="15" r="4.5" fill="var(--panel)" stroke="#0003"/></svg>`;
  const rings = [100, 88, 76, 64].map(r => `<circle cx="150" cy="150" r="${r}" fill="none" stroke="#0002" stroke-width="1.5"/>`).join('');
  return `<svg viewBox="0 0 520 300" class="ebx-big" aria-hidden="true"><path d="M150 50 L500 50 L500 ${50 + Math.max(14, Math.min(60, (+b.width || 0.875) * 40))} L150 ${50 + Math.max(14, Math.min(60, (+b.width || 0.875) * 40))} Z" fill="${c}" stroke="#0004"/>
    <circle cx="150" cy="150" r="112" fill="${c}" stroke="#0004" stroke-width="2"/>${rings}<circle cx="150" cy="150" r="42" fill="var(--sunk)" stroke="#0004" stroke-width="2"/>
    <text x="330" y="150" class="ebx-t">${esc(b.code || b.name)}</text><text x="330" y="180" class="ebx-s">${r3(+b.thickMM || 0)} mm × ${esc(fmtLen(+b.width || 0))}</text></svg>`;
}
function renderPartTemplates() {
  const el = $('#tab-parts'); if (!el) return;
  const view = ui.ptView === 'eb' ? 'eb' : 'pt', use = bandUsage();
  const head = libHead('Part templates', [['pt', 'Part templates', 'tag'], ['eb', 'Edgebanding', 'palette']], view, 'pt-view',
    view === 'pt' ? `<button class="btn primary" data-act="pt-add">${icon('plus')}Add part template</button>` : `<button class="btn primary" data-act="eb-add">${icon('plus')}Add edgeband</button>`);
  if (view === 'eb') {
    const L = S.edgebands;
    const list = libSimpleList('eb', L, b => ebRoll(b), b => `${b.code ? esc(b.code) + ' · ' : ''}${r3(+b.thickMM || 0)} mm${use[b.id] ? ` · ${(use[b.id] / 12).toFixed(0)} ft` : ''}`);
    if (!L.length) { el.innerHTML = `${head}<div class="plx mlx">${list}<div class="card cardbody note show">No edgebands yet.</div></div>`; return; }
    const id = pickId('eb', L), b = L.find(x => x.id === id) || L[0], R = 'eb:' + b.id, ft = (use[b.id] || 0) / 12;
    const cost = b.rollCost ?? EB_ROLL.cost, perFt = cost / Math.max(1, b.rollFt ?? EB_ROLL.ft);
    el.innerHTML = `${head}<div class="plx mlx ilx">${list}<div class="plx-main mlx-main">
      <div class="card plx-pic">${cardHead(esc(b.name), `<button class="btn sm" data-act="lp-copy" data-id="eb">${icon('copy')}Copy</button><button class="btn sm danger" data-act="eb-del" data-id="${esc(b.id)}">${icon('trash')}Delete</button>`)}
        <div class="plx-pv ilx-pv">${ebRoll(b, 1)}</div>
        <div class="edx-stats plx-stats mlx-stats">${libTile('teal', 'ruler', r3(+b.thickMM || 0) + ' mm', 'Thickness')}${libTile('violet', 'ruler', fmtLen(+b.width || 0), 'Width')}${libTile('amber', 'tag', money(perFt) + '/ft', `${money(cost)} a roll`)}${libTile('blue', 'list', ft.toFixed(1) + ' ft', 'Banded in this job')}</div></div>
      <div class="card plx-props mlx-props">
        ${cardHead('Edgeband', '')}<div class="cardbody">${fld('Name', R, 'name', b.name, 'text', { wide: true })}${fld('Short code', R, 'code', b.code || '', 'text', { ph: 'PVC1' })}${fld('Group', R, 'group', b.group || '', 'text', { ph: 'No group' })}${fld('Color', R, 'color', b.color, 'color')}</div>
        ${cardHead('Size', '')}<div class="cardbody">${fld('Thickness (mm)', R, 'thickMM', b.thickMM, 'num')}${fld('Width', R, 'width', b.width, 'len')}</div>
        ${cardHead('Price', '')}<div class="cardbody">${fld('Roll price', R, 'rollCost', cost, 'num')}${fld('Feet on a roll', R, 'rollFt', b.rollFt ?? EB_ROLL.ft, 'num')}<div class="note help">The quote charges banding by the foot: roll price over feet on a roll.</div></div>
      </div></div></div>`;
    return;
  }
  const T = S.partTemplates, bands = [{ v: '', l: 'None' }, ...azOpts(S.edgebands).map(o => { const b = edgeband(o.v); return b && b.code ? { ...o, l: `${b.code} · ${o.l}` } : o; })];
  const nOn = t => PART_KINDS.filter(pk => EDGE_KEYS.some(k => partBands(t, pk.id)[k])).length, used = t => usedBy(c => cabSet(c, 'partT') === t.id);
  const list = libSimpleList('ptpl', T, ptMini, t => { const n = used(t); return `${nOn(t)} of ${PART_KINDS.length} parts banded${n ? ` · ${nCab(n)}` : ''}`; });
  if (!T.length) { el.innerHTML = `${head}<div class="plx mlx">${list}<div class="card cardbody note show">No part templates yet.</div></div>`; return; }
  const id = pickId('ptpl', T), t = T.find(x => x.id === id) || T[0], R = 'ptpl:' + t.id;
  const pk = PART_KINDS.find(k => k.id === ui.ptKind) || PART_KINDS[0], band = partBands(t, pk.id), first = EDGE_KEYS.map(k => band[k]).find(Boolean) || (S.edgebands[0] || {}).id || '';
  const edges = PART_KINDS.reduce((n, k) => n + EDGE_KEYS.filter(e => partBands(t, k.id)[e]).length, 0), jobFt = Object.values(use).reduce((a, v) => a + v, 0) / 12;
  const grid = `<div class="ptx-grid">${PART_KINDS.map(k => { const bd = partBands(t, k.id); return `<button class="ptx-kind${k.id === pk.id ? ' on' : ''}" data-act="pt-part" data-id="${k.id}">${bandDiagram(bd, k.id, 120, 54)}<b>${esc(k.name)}</b><small>${edgeSummary(k.id, bd) || 'No banding'}</small></button>`; }).join('')}</div>`;
  el.innerHTML = `${head}<div class="plx mlx ilx ptx">${list}<div class="plx-main mlx-main">
    <div class="card plx-pic">${cardHead(esc(t.name), `<button class="btn sm" data-act="pt-dup" data-id="${esc(t.id)}">${icon('copy')}Copy</button><button class="btn sm danger" data-act="pt-del" data-id="${esc(t.id)}"${T.length < 2 ? ' disabled' : ''}>${icon('trash')}Delete</button>`)}
      <div class="ptx-pv">${grid}</div>
      <div class="edx-stats plx-stats mlx-stats">${libTile('teal', 'tag', nOn(t) + ' of ' + PART_KINDS.length, 'Parts banded')}${libTile('violet', 'ruler', edges, 'Edges banded')}${libTile('amber', 'list', jobFt.toFixed(0) + ' ft', 'Banding in this job')}${libTile('blue', 'home', used(t), 'Cabinets using it')}</div></div>
    <div class="card plx-props mlx-props">
      ${cardHead('Part template', '')}<div class="cardbody">${fld('Name', R, 'name', t.name, 'text', { wide: true })}<div class="note help">Pick one for the whole job or a room on the Settings tab, or for one cabinet in its editor. The cut list, labels and exports carry the banding.</div></div>
      ${cardHead(esc(pk.name), `<button class="btn sm" data-act="pt-kind" data-id="${esc(t.id)}:${pk.id}" data-v="${esc(first)}">All 4</button><button class="btn sm" data-act="pt-kind" data-id="${esc(t.id)}:${pk.id}" data-v="">None</button>`)}
      <div class="cardbody"><div class="ptx-big">${bandDiagram(band, pk.id, 300, 120)}</div>
        ${EDGE_KEYS.map(k => `<label class="f"><span><b>${k}</b> ${esc(pk.edges[k])}</span>${ctl('ptr:' + t.id + ':' + pk.id, k, band[k], 'select', { options: bands, label: pk.name + ', ' + pk.edges[k] })}</label>`).join('')}
        <div class="note help">L1 and L2 run along the length (L1 is the top edge in the cut list drawing). W1 and W2 are the ends.</div></div>
    </div></div></div>`;
}

/* ---------- Labels ---------- */
// Label sizes, wide side first as they come off the roll. DYMO numbers are the LabelWriter rolls (450 / 4XL).
const LABEL_SIZES = [
  { id: 'd30252b', name: '1-1/8 × 3-1/2 (DYMO 30252) with drawing and banding', w: 3.5, h: 1.125, pic: 1, band: 'short', fs: 7.4 },
  { id: 'd30252', name: '1-1/8 × 3-1/2 (DYMO 30252) with drawing', w: 3.5, h: 1.125, pic: 1, band: '', fs: 7.8 },
  { id: 'd30334', name: '1-1/4 × 2-1/4 (DYMO 30334) with drawing', w: 2.25, h: 1.25, pic: 1, band: '', fs: 6.6 },
  { id: 'd30330', name: '3/4 × 2-1/2 (DYMO 30330), text only', w: 2.5, h: 0.75, pic: 0, band: '', fs: 6.6 },
  { id: 'd30323', name: '2-1/8 × 4 (DYMO 30323) with drawing and banding', w: 4, h: 2.125, pic: 1, band: 'full', fs: 8.6 },
  { id: 'sheet', name: '2 × 4 sheet labels with drawing and banding', w: 4, h: 2, pic: 1, band: 'full', fs: 8.6 }
];
function labelSize() { let id = ''; try { id = localStorage.getItem(KEY + '.lblsize') || ''; } catch (_) {} return LABEL_SIZES.find(z => z.id === id) || LABEL_SIZES[0]; }
// The part outline for a label: banded edges drawn heavy, since label printers print black only. Very long parts are drawn fatter so the marks still show.
function labelPartSVG(p) {
  const L = p.L, W = Math.max(p.W, p.L / 5), k = W / p.W, t = Math.max(L, W) * 0.035;
  let s = `<svg class="lz-svg" viewBox="${-t * 2} ${-t * 2} ${L + t * 4} ${W + t * 4}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">`;
  s += p.outline ? `<polygon class="lz-part" points="${p.outline.map(q => `${q.x},${r3((p.W - q.y) * k)}`).join(' ')}" stroke-width="${t * 0.35}"/>` : `<rect class="lz-part" x="0" y="0" width="${L}" height="${W}" stroke-width="${t * 0.35}"/>`;
  const ends = { L1: [0, -t, L, -t], L2: [0, W + t, L, W + t], W1: [-t, 0, -t, W], W2: [L + t, 0, L + t, W] };
  EDGE_KEYS.forEach(e => { if (p.band && edgeband(p.band[e])) { const [x1, y1, x2, y2] = ends[e]; s += `<line class="lz-band" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${t * 1.3}"/>`; } });
  p.ops.forEach(o => { if (o.type === 'bore') s += `<circle class="lz-bore" cx="${o.x}" cy="${o.y * k}" r="${Math.max(o.dia / 2, t * 0.4)}" stroke-width="${t * 0.2}"/>`; });
  return s + '</svg>';
}
function showLabels() {
  const sc = cutScope(), parts = sc.parts, labels = [], z = labelSize();
  parts.forEach(p => { for (let i = 1; i <= p.qty; i++) labels.push({ p, i }); });
  const short = p => EDGE_KEYS.filter(k => p.band[k]).join(' ') || 'none';
  // Edges that share a band are listed together: "PVC 1 mm: L1 L2 W1 W2".
  const full = p => { const g = {}; EDGE_KEYS.filter(k => p.band[k]).forEach(k => { const n = bandCode(edgeband(p.band[k])); (g[n] = g[n] || []).push(k); }); return Object.entries(g).map(([n, ks]) => `${esc(n)}: ${ks.join(' ')}`).join('; ') || 'none'; };
  const el = $('#labelsheet');
  el.innerHTML = `<div class="lbbar"><b>${labels.length} labels</b><label class="f wide lz-pick"><span>Label size</span><select id="lblsize">${LABEL_SIZES.map(x => `<option value="${x.id}"${x.id === z.id ? ' selected' : ''}>${x.name}</option>`).join('')}</select></label>
    <span class="note">Shown at actual size. In the print window pick your label printer and this label size.</span>${typeof labelTplBox === 'function' ? labelTplBox() : ''}
    <div class="row-actions"><button class="btn primary" data-act="labels-print">Print</button><button class="btn" data-act="labels-close">Close</button></div></div>
  <div class="labels lz-${z.id}">${labels.map(({ p, i }, n) => `<div class="label lz${z.pic ? ' pic' : ''}" style="width:${z.w}in;height:${z.h}in;font-size:${z.fs}pt">
    <div class="lz-text">${typeof LABEL_TPL !== 'undefined' && LABEL_TPL.on ? labelLinesHTML(p, i, n) : `
      <div class="lz-line"><span>Job <b>${esc(S.job.name)}</b></span><span class="lz-r">Cab# <b class="lz-cab">${esc(p.cab)}</b></span></div>
      <div class="lz-line lz-big${z.band === 'full' ? ' wrap' : ''}"><b>${esc(p.report || p.name)}</b> <span class="lz-size">${fmtLen(p.L)} × ${fmtLen(p.W)}</span></div>
      <div class="lz-line">MATERIAL <b>${esc((mat(p.mat) || {}).name || '')}</b>${p.grain ? ' · grain ↔' : ''}</div>
      <div class="lz-line"><span>${esc(p.room)}</span><span class="lz-r">Part# ${n + 1}${p.qty > 1 ? ` · ${i} of ${p.qty}` : ''}</span></div>
      ${z.band ? `<div class="lz-line${z.band === 'full' ? ' wrap' : ''}">Banding <b>${z.band === 'full' ? full(p) : short(p)}</b></div>` : ''}`}
    </div>${z.pic && !(typeof LABEL_TPL !== 'undefined' && LABEL_TPL.qr && z.w < 3.6) ? `<div class="lz-pic">${labelPartSVG(p)}</div>` : ''}${typeof LABEL_TPL !== 'undefined' && LABEL_TPL.qr ? `<div class="lz-qr">${qrSVG(qrText(p), z.h * 0.8 + 'in')}</div>` : ''}
  </div>`).join('') || '<div class="muted">No parts in this selection.</div>'}</div>`;
  let st = $('#lblcss'); if (!st) { st = document.createElement('style'); st.id = 'lblcss'; document.head.appendChild(st); }
  st.textContent = `@page{size:${z.w}in ${z.h}in;margin:0}`;
  el.hidden = false; document.body.classList.add('printing-labels');
}
function closeLabels() { const st = $('#lblcss'); if (st) st.remove(); $('#labelsheet').hidden = true; document.body.classList.remove('printing-labels'); }

/* ---------- Cut list ---------- */
function opText(o) {
  const f = v => fmtLen(v, 1), mm = v => (v * 25.4).toFixed(0) + 'mm';
  if (o.type === 'bore') return `Bore Ø${mm(o.dia)} × ${o.through ? 'through' : mm(o.depth)} at x ${f(o.x)}, y ${f(o.y)}`;
  if (o.type === 'edgeslot') return `Edge slot (${o.edge}) ${f(o.len)} long × ${mm(o.depth)} deep at ${f(o.y)}, ${o.why || 'Lamello'}`;
  if (o.type === 'pockethole') return `Pocket hole at x ${f(o.x)}, y ${f(o.y)} (drill by hand)`;
  if (o.type === 'hbore') return `Edge bore (${o.edge}) Ø${mm(o.dia)} × ${mm(o.depth)}, ${f(o.y)} up, ${mm(o.inset)} from outer face`;
  if (o.type === 'groove' && o.tool) return `${o.tool === '90° V-bit' ? 'V-groove' : 'Groove'} ${f(o.width)} wide × ${f(o.depth)} deep (${o.tool}) from x ${f(o.x1)}, y ${f(o.y1)} to x ${f(o.x2)}, y ${f(o.y2)}`;
  if (o.type === 'groove') return `Groove ${f(o.width)} wide × ${f(o.depth)} deep, x ${f(o.x1)} to ${f(o.x2)} at y ${f(o.y1)}`;
  if (o.type === 'cutout') return `Cut out ${f(o.w)} × ${f(o.h)} through at x ${f(o.x)}, y ${f(o.y)}`;
  if (o.type === 'rabbet') return `Rabbet ${f(o.width)} × ${f(o.depth)} around the ${f(o.w)} × ${f(o.h)} opening (back)`;
  if (o.type === 'profile') return `Raised panel profile, ${f(o.inset)} wide, ${f(o.depth)} deep, around ${f(o.w)} × ${f(o.h)} at x ${f(o.x)}, y ${f(o.y)} (${o.tool})`;
  if (o.type === 'edge') return `${(EDGE_PROFILES.find(e => e.v === o.profile) || { l: o.profile }).l} edge profile`;
  if (o.type === 'pocket' && o.profile && o.profile !== 'square') return `Pocket ${f(o.w)} × ${f(o.h)} × ${f(o.depth)} deep at x ${f(o.x)}, y ${f(o.y)}, ${o.profile} inside edge`;
  if (o.type === 'pocket') return `Pocket ${f(o.w)} × ${f(o.h)} × ${f(o.depth)} deep at x ${f(o.x)}, y ${f(o.y)}`;
  if (o.type === 'notch') return `Corner notch ${f(o.w)} × ${f(o.h)}`;
  if (o.type === 'path') return `${o.pocket ? 'Pocket' : o.closed ? 'Closed tool path' : 'Open tool path'} ${o.pts.length} points, ${o.through ? 'through' : f(o.depth) + ' deep'} (${o.tool}${o.side && o.side !== 'center' ? ', ' + o.side + ' of the line' : ''}) from x ${f(o.pts[0].x)}, y ${f(o.pts[0].y)}`;
  return o.type;
}
// Parts, tops and moldings for the rooms in scope, each tagged with its room.
function cutScope() {
  const rooms = ui.cutRoom === 'all' ? S.rooms : [roomById(ui.cutRoom) || curRoom()];
  const parts = [], tops = [], molds = [], cabs = [];
  rooms.forEach(rm => withRoom(rm, () => {
    S.cabinets.forEach(c => { cabs.push({ c, room: rm }); if (!c.noCut) buildParts(c).parts.forEach(p => { if (cutKeep(cutPartKey(p))) parts.push({ ...p, room: rm.name }); }); });
    shapeParts().forEach(p => { if (cutKeep(cutPartKey(p))) parts.push({ ...p, room: rm.name }); });
    countertopRuns().filter(r => r.on).forEach(r => tops.push({ ...r, room: rm.name, wallN: wallName(wall(r.wall)) + (typeof ctjNote === 'function' ? ctjNote(r) : '') }));
    moldingRuns().forEach(r => molds.push({ ...r, room: rm.name, wallN: wallName(wall(r.wall)) }));
  }));
  return { rooms, parts, tops, molds, cabs };
}
// Laid out like Pricing and the cabinet editor: the job's numbers and the material picker down the left,
// one row of tabs over the work, and every button down the right.
function renderCutlist() {
  if (ui.cutRoom !== 'all' && !roomById(ui.cutRoom)) ui.cutRoom = 'all';
  const view = ['parts', 'tops', 'cnc'].includes(ui.cutView) ? ui.cutView : 'parts';
  const sc = cutScope(), multi = sc.rooms.length > 1;
  sc.parts.forEach((p, i) => p.key = p.cabId + '#' + i);
  const mats = [...new Set(sc.parts.map(p => p.mat))], cabsIn = [...new Map(sc.parts.map(p => [p.cabId + '|' + p.room, (multi ? p.room + ' · ' : '') + p.cab])).entries()];
  if (ui.cutMat && !mats.includes(ui.cutMat)) ui.cutMat = '';
  if (ui.cutCab && !cabsIn.some(([k]) => k === ui.cutCab)) ui.cutCab = '';
  const inCab = sc.parts.filter(p => !ui.cutCab || p.cabId + '|' + p.room === ui.cutCab);
  const shown = inCab.filter(p => !ui.cutMat || p.mat === ui.cutMat);
  const sel = shown.find(p => p.key === ui.partSel) || shown[0];
  const cnt = ps => ps.reduce((a, p) => a + p.qty, 0), area = ps => ps.reduce((a, p) => a + p.qty * p.L * p.W, 0) / 144;
  const sheets = (m, ps) => { const M = mat(m); if (!M || !M.sheetW || !M.sheetL || M.kind === 'top') return 0; return Math.ceil(ps.reduce((a, p) => a + p.qty * p.L * p.W, 0) * 1.15 / (M.sheetW * M.sheetL)); };
  const byMat = {}; shown.forEach(p => (byMat[p.mat] = byMat[p.mat] || []).push(p));
  const allMat = {}; inCab.forEach(p => (allMat[p.mat] = allMat[p.mat] || []).push(p));
  const nSheets = Object.entries(allMat).reduce((a, [m, ps]) => a + sheets(m, ps), 0);
  const cabName = p => (multi ? esc(p.room) + ' · ' : '') + p.cab;
  // Left: totals, then one tile per material that filters the list (the old Material dropdown).
  const matTile = (m, ps) => { const M = mat(m) || {}, n = sheets(m, ps); return `<button class="cl-mat${ui.cutMat === m ? ' on' : ''}" data-act="cut-mat" data-id="${esc(m)}">${swatch(M, 26)}<span><b>${esc(M.name || m)}</b><small>${cnt(ps)} parts${n ? ` · about ${n} sheet${n === 1 ? '' : 's'}` : ''}</small></span></button>`; };
  const side = `<div class="prx-grand cl-grand"><span>${ui.cutCab ? 'One cabinet' : ui.cutRoom === 'all' ? `Whole job, ${S.rooms.length} rooms` : esc((roomById(ui.cutRoom) || curRoom()).name)}</span><b>${cnt(inCab)} parts</b><small>${Math.round(area(inCab))} sq ft · about ${nSheets} sheets with waste</small></div>
    <label class="cl-f"><span>Room</span><select id="cutroom"><option value="all">Whole job (${S.rooms.length} rooms)</option>${S.rooms.map(r => `<option value="${r.id}"${ui.cutRoom === r.id ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
    <label class="cl-f"><span>Cabinet</span><select id="cutcab"><option value="">All</option>${cabsIn.map(([k, l]) => `<option value="${esc(k)}"${ui.cutCab === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <label class="cl-f"><span>What to cut</span><button class="btn${ui.cutPick ? ' on' : ''}" data-act="cut-pk-open" aria-expanded="${!!ui.cutPickOpen}">${icon('check')}${esc(cutPickText(sc.rooms))}</button></label>
    <div class="prx-navh">Materials</div><div class="cl-mats"><button class="cl-mat all${ui.cutMat ? '' : ' on'}" data-act="cut-mat" data-id=""><span class="cl-allic">${icon('stack')}</span><span><b>All materials</b><small>${cnt(inCab)} parts</small></span></button>${Object.entries(allMat).map(([m, ps]) => matTile(m, ps)).join('')}</div>`;
  const tabs = `<div class="setx-tabs prx-tabs" role="tablist">${[['parts', 'Parts', 'list'], ['tops', 'Tops and molding', 'ruler'], ['cnc', 'Send to the CNC', 'download']].map(([k, l, ic]) => `<button role="tab" data-act="cut-view" data-id="${k}" aria-selected="${view === k}">${icon(ic)}${l}</button>`).join('')}</div>`;
  const tones = ['teal', 'amber', 'violet', 'blue', 'green', 'rose'];
  const matBox = ([mid, ps], i) => `<div class="psec box">${secHead('stack', `${esc((mat(mid) || {}).name || mid)} · ${fmtLen(ps[0].T)}`, tones[i % tones.length])}<div class="prx-roomh"><span class="note">${cnt(ps)} parts · ${Math.round(area(ps) * 10) / 10} sq ft</span></div>
    <div class="tscroll"><table class="t cl-t"><thead><tr><th class="r">Qty</th><th class="r">Width</th><th class="r">Length</th><th>Part</th><th>Edge</th><th>Cabinet</th><th class="r">Ops</th></tr></thead><tbody>
    ${ps.map(p => `<tr class="click${sel && p.key === sel.key ? ' on' : ''}" data-act="part" data-id="${p.key}" title="Double-click to open the part editor"><td class="n">${p.qty}</td><td class="n">${fmtLen(p.W)}</td><td class="n">${fmtLen(p.L)}</td><td>${esc(p.report || p.name)}${p.report ? ` <span class="muted">(${esc(p.name)})</span>` : ''}</td><td>${p.edges}</td><td>${cabName(p)}</td><td class="n">${p.ops.length || ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  const detail = sel ? `<div class="psec box cl-detail">${secHead('ruler', `${cabName(sel)} · ${esc(sel.report || sel.name)}`, 'blue')}
      <div class="cl-dsize">${fmtLen(sel.L)} × ${fmtLen(sel.W)} × ${fmtLen(sel.T)} <span class="muted">${esc((mat(sel.mat) || {}).name || '')}</span></div>
      <div class="preview">${partSVG(sel)}</div>
      ${EDGE_KEYS.some(k => sel.band[k]) ? `<table class="t"><thead><tr><th>Edge</th><th>Where</th><th>Edgeband</th></tr></thead><tbody>${EDGE_KEYS.filter(k => sel.band[k]).map(k => `<tr><td><b>${k}</b></td><td>${esc(partKind(sel.kind).edges[k])}</td><td>${swatchBand(edgeband(sel.band[k]))} ${esc(edgeband(sel.band[k]).name)}</td></tr>`).join('')}</tbody></table>` : '<div class="note">No edgebanding on this part.</div>'}
      <details class="pe-more"><summary>Edge and origin key</summary><div class="note">Origin (orange dot) is the top-left corner as drawn. L1 is the top edge as drawn, L2 the bottom, W1 the left end and W2 the right end. Cabinet sides: x runs up from the floor, y back from the front edge. Fronts: x up from the bottom edge, y from the left edge as seen from the front.</div></details>
      <div class="tscroll" style="max-height:260px;overflow:auto"><table class="t"><thead><tr><th>Operation</th><th>For</th></tr></thead><tbody>${sel.ops.map(o => `<tr><td>${esc(opText(o))}</td><td class="muted">${esc(o.why || '')}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No machining on this part</td></tr>'}</tbody></table></div></div>` : '';
  const empty = `<div class="psec box">${secHead('list', 'Parts', 'teal')}<div class="note">${ui.cutPick ? 'Nothing picked to cut. Use What to cut on the left to pick cabinets, fillers and panels.' : 'No parts yet. Place cabinets in the Room tab.'}</div></div>`;
  const tops = `<div class="psec box">${secHead('ruler', 'Countertops', 'amber')}<div class="tscroll"><table class="t"><thead><tr><th>Top</th><th>Where</th><th class="r">Length</th><th class="r">Depth</th><th>Material</th></tr></thead><tbody>
      ${sc.tops.map(r => `<tr><td>${esc(r.tpl.name)}</td><td>${multi ? esc(r.room) + ' · ' : ''}${r.wallN}</td><td class="n">${fmtLen(r.len)}</td><td class="n">${fmtLen(r.depth)}</td><td>${esc((mat(r.tpl.mat) || {}).name || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No countertops. Build them on the Tops tab.</td></tr>'}</tbody></table></div></div>
    <div class="psec box">${secHead('ruler', 'Molding', 'violet')}<div class="tscroll"><table class="t"><thead><tr><th>Molding</th><th>Where</th><th class="r">Length</th><th class="r">Height</th><th>Material</th></tr></thead><tbody>
      ${sc.molds.map(r => `<tr><td>${esc(r.m.name)}</td><td>${multi ? esc(r.room) + ' · ' : ''}${r.wallN}</td><td class="n">${fmtLen(r.len)}</td><td class="n">${fmtLen(r.h)}</td><td>${esc((mat(r.m.mat) || {}).name || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No molding. Build it on the Molding tab.</td></tr>'}</tbody></table></div></div>`;
  const body = view === 'tops' ? tops : view === 'cnc' ? cncCard() : `<div class="cl-split"><div class="cl-list">${Object.entries(byMat).map(matBox).join('') || empty}</div><div class="cl-side">${detail}</div></div>`;
  const b = (act, ic, l, x = '', id = '') => `<button class="btn${x}" data-act="${act}"${id ? ` data-id="${esc(id)}"` : ''}>${icon(ic)}${l}</button>`;
  const acts = `<div class="prx-acts">${inHub() ? b('cnc-save', 'check', 'Save CNC parts to Files', ' primary') + b('cnc-download', 'download', 'Download parts file') : b('cnc-download', 'download', 'Download parts file', ' primary')}
    ${b('labels', 'print', 'Print labels')}${b('sv-open', 'list', 'Shop view', '', cutOneCab())}${b('tab', 'stack', 'Other exports', '', 'export')}
    ${sel && view === 'parts' ? `<span class="edx-sep"></span><div class="prx-acth">Picked part</div>${sel.cabId && cab(sel.cabId) ? b('cut-edit-part', 'edit', 'Edit part', '', sel.cabId + '|' + peKeyOf(sel)) : ''}${b('rc-add', 'plus', 'Add to recut list', '', sel.key)}` : ''}</div>`;
  $('#tab-cutlist').innerHTML = `<div class="prx clx"><aside class="prx-side">${side}</aside>
    <section class="prx-main"><div class="prx-top"><h2>Cut list</h2>${tabs}</div><div class="prx-body">${cutPickCard(sc.rooms)}${typeof recutCard === 'function' ? recutCard() : ''}${body}</div></section>${acts}</div>`;
  $('#cutroom').addEventListener('change', e => { ui.cutRoom = e.target.value; ui.partSel = null; renderCutlist(); });
  $('#cutcab').addEventListener('change', e => { ui.cutCab = e.target.value; ui.partSel = null; renderCutlist(); });
  document.querySelectorAll('.cut-pk[data-mixed]').forEach(x => { x.indeterminate = true; });
}
/* ---------- Export ---------- */
function exportData(units) {
  const f = units === 'mm' ? 25.4 : 1, r = v => Math.round(v * f * 1000) / 1000;
  const lenKeys = new Set(PARAM_DEFS.filter(d => d.type === 'len').map(d => d.k));
  const conv = o => { const out = {}; Object.entries(o).forEach(([k, v]) => out[k] = typeof v === 'number' && k !== 'qty' && k !== 'user' && k !== 'passes' ? r(v) : k === 'pts' && Array.isArray(v) ? v.map(q => ({ x: r(q.x), y: r(q.y) })) : v); return out; };
  const room = rm => withRoom(rm, () => ({
    name: rm.name,
    settings: { cabinetMaterials: cabMatT(roomSet('cabMatT')).name, drawerMaterials: drawerMatT(roomSet('drawerMatT')).name, doorTemplate: doorTpl(roomSet('doorT')).name,
      drawerSlide: (hwPick(roomSet('slide'), 'slide') || {}).name, hinge: (hwPick(roomSet('hinge'), 'hinge') || {}).name, shelfPin: (hwPick(roomSet('shelfpin'), 'shelfpin') || {}).name },
    walls: S.walls.map(w => ({ id: w.id, name: wallName(w), x1: r(w.x1), y1: r(w.y1), x2: r(w.x2), y2: r(w.y2), thickness: r(w.thick), height: r(w.height) })),
    cabinets: S.cabinets.map(c => {
      const b = buildParts(c), p = effParams(c), pp = {};
      Object.entries(p).forEach(([k, v]) => pp[k] = lenKeys.has(k) ? r(v) : v);
      return {
        label: LBL[c.id], name: c.name, template: c.libId, category: c.cat,
        width: r(c.w), height: r(c.h), depth: r(c.d), elevation: r(c.elev), wall: c.wall, side: c.side, positionAlongWall: r(c.off),
        cabinetMaterials: cabMatT(cabSet(c, 'cabMatT')).name, drawerMaterials: drawerMatT(cabSet(c, 'drawerMatT')).name, doorTemplate: doorTpl(cabSet(c, 'doorT')).name,
        drawerSlide: (hwPick(cabSet(c, 'slide'), 'slide') || {}).name, hinge: (hwPick(cabSet(c, 'hinge'), 'hinge') || {}).name,
        construction: c.construction, appliedPanels: { left: hasPanel(c, 'L'), right: hasPanel(c, 'R'), style: panelFor(c).door.name, fit: panelFor(c).name }, fillers: fillersOf(c).map(f => ({ end: f.end === 'L' ? 'left' : 'right', width: r3(f.gap) })), molding: c.molding ? (molding(c.molding) || {}).name : null,
        frontLayout: c.rows.map(x => ({ ...x, h: x.h === '*' ? '*' : r(x.h) })),
        fronts: b.fronts.filter(x => x.type !== 'open').map(x => ({ type: x.type, width: r(x.x1 - x.x0), height: r(x.z1 - x.z0) })),
        parameters: pp, custom: Object.fromEntries((c.custom || []).filter(x => x.k).map(x => [x.k, x.v])),
        warnings: b.warn, hardware: b.bom,
        parts: (c.noCut ? [] : b.parts).map(q => ({ name: q.report || q.name, ...(q.report ? { partName: q.name } : {}), kind: q.kind, material: q.mat, qty: q.qty, length: r(q.L), width: r(q.W), thickness: r(q.T), grain: q.grain, edges: q.edges,
          edgebanding: Object.fromEntries(EDGE_KEYS.map(k => { const eb = edgeband(q.band[k]); return [k, eb ? { edge: partKind(q.kind).edges[k], band: eb.name, thicknessMM: eb.thickMM } : null]; })), ops: q.ops.map(conv), ...(q.note ? { comment: q.note } : {}), ...(q.cncGroup ? { cncGroup: q.cncGroup } : {}), ...(q.outline ? { outline: q.outline.map(o => ({ x: r(o.x), y: r(o.y) })) } : {}), ...(q.outline && q.outlineEdges ? { outlineEdges: q.outlineEdges.slice() } : {}) })),
      };
    }),
    shapes: S.shapes.map(s => { const b = shapeBox(s.pts); return { name: s.name, lies: s.plane, material: s.mat, wall: s.wall, side: s.side, positionAlongWall: r(s.off), outset: r(s.outset || 0), elevation: r(s.elev), thickness: r(s.thick), width: r(b.w), depth: r(b.h), points: s.pts.map(q => ({ x: r(q.x), y: r(q.y), ...(q.r ? { cornerRadius: r(q.r) } : {}), ...(q.b ? { bulge: r(q.b) } : {}) })), outline: shapeOutline(s.pts).map(q => [r(q.x - b.x0), r(q.y - b.y0)]) }; }),
    countertops: countertopRuns().filter(x => x.on).map(x => ({ wall: x.wall, style: x.tpl.name, material: x.tpl.mat, length: r(x.len), depth: r(x.depth), thickness: r(x.thick), cabinets: x.cabs.map(id => LBL[id]) })),
    moldings: moldingRuns().map(x => ({ wall: x.wall, molding: x.m.name, material: x.m.mat, height: r(x.h), front: r(x.front), returns: r(x.returns), total: r(x.len), cabinets: x.cabs.map(id => LBL[id]) })),
  }));
  return {
    format: 'cabinet-designer.job', version: 3, units, exported: new Date().toISOString(),
    job: { name: S.job.name, customer: S.job.customer || '', notes: S.job.notes || '' },
    materials: S.materials.map(m => ({ id: m.id, name: m.name, kind: m.kind, thickness: r(m.thick), sheetWidth: r(m.sheetW), sheetLength: r(m.sheetL), grain: m.grain })),
    edgeNaming: 'L1 and L2 run along the part length (L1 at y = 0); W1 and W2 run across the width (W1 at x = 0).',
    edgebands: S.edgebands.map(b => ({ id: b.id, name: b.name, thicknessMM: b.thickMM, width: r(b.width) })),
    rooms: S.rooms.map(room),
  };
}
const csvq = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
// File name for the format on screen; the Bywater file says Bywater so it is easy to find on upload.
function exportFileName() {
  const job = S.job.name.replace(/[^\w -]/g, '').trim() || 'job', f = ui.exportFmt;
  const what = f === 'buyout' && doorExportOf(S) === 'bywater' ? 'Bywater doors' : { cnc: 'parts', json: 'job', cut: 'cut list', labels: 'labels', ops: 'machining', doors: 'door order', buyout: 'buyout doors' }[f];
  return `${job} ${what}.${f === 'cnc' || f === 'json' ? 'json' : 'csv'}`;
}
function exportText() {
  if (ui.exportFmt === 'cnc') return JSON.stringify(cncPartFile().file, null, 2);
  const d = exportData(ui.exportUnits);
  if (ui.exportFmt === 'json') return JSON.stringify(d, null, 2);
  if (ui.exportFmt === 'cut') {
    const rows = [['Room', 'Cabinet', 'Part', 'Qty', 'Length', 'Width', 'Thickness', 'Material', 'Grain', 'Edges', ...EDGE_KEYS.map(k => 'Edge ' + k), 'Ops']];
    d.rooms.forEach(rm => rm.cabinets.forEach(c => c.parts.forEach(p => rows.push([rm.name, c.label, p.name, p.qty, p.length, p.width, p.thickness, (mat(p.material) || {}).name, p.grain ? 'Y' : 'N', p.edges, ...EDGE_KEYS.map(k => (p.edgebanding[k] || {}).band || ''), p.ops.length]))));
    return rows.map(r => r.map(csvq).join(',')).join('\n');
  }
  if (ui.exportFmt === 'labels') {
    // One row per piece, for label software.
    const rows = [['Label ID', 'Job', 'Room', 'Cabinet', 'Part', 'Piece', 'Of', 'Length', 'Width', 'Thickness', 'Material', 'Grain', 'Banded edges', ...EDGE_KEYS.flatMap(k => ['Edge ' + k, 'Edge ' + k + ' is'])]];
    d.rooms.forEach((rm, ri) => rm.cabinets.forEach(c => c.parts.forEach((p, pi) => { for (let i = 1; i <= p.qty; i++) rows.push([`${ri + 1}-${c.label}-${pi + 1}-${i}`, d.job.name, rm.name, c.label, p.name, i, p.qty, p.length, p.width, p.thickness, (mat(p.material) || {}).name, p.grain ? 'Y' : 'N', p.edges, ...EDGE_KEYS.flatMap(k => p.edgebanding[k] ? [p.edgebanding[k].band, p.edgebanding[k].edge] : ['', ''])]); })));
    return rows.map(r => r.map(csvq).join(',')).join('\n');
  }
  if (ui.exportFmt === 'doors') return doorOrderCSV(d.units);
  if (ui.exportFmt === 'buyout') return doorExportOf(S) === 'bywater' ? bywaterCSV() : buyoutOrderCSV(d.units);
  const rows = [['Room', 'Cabinet', 'Part', 'Op', 'X', 'Y', 'X2', 'Y2', 'W', 'H', 'Dia', 'Width', 'Depth', 'Face', 'For']];
  d.rooms.forEach(rm => rm.cabinets.forEach(c => c.parts.forEach(p => p.ops.forEach(o => rows.push([rm.name, c.label, p.name, o.type, o.x ?? o.x1, o.y ?? o.y1, o.x2, o.y2, o.w, o.h, o.dia, o.width, o.depth, o.face || o.edge, o.why])))));
  return rows.map(r => r.map(csvq).join(',')).join('\n');
}
// What the CNC can't cut yet, so it gets done by hand or waits for a tool.
// The CNC Cutlist parts file for the whole job, right on the Cutlist tab.
function cncCard() {
  const f = cncPartFile(true).file, n = (f.parts || []).reduce((a, p) => a + (p.qty || 1), 0);
  const where = ui.cutRoom === 'all' ? 'the whole job' : esc((roomById(ui.cutRoom) || curRoom()).name);
  return `<div class="psec box cnccard">${secHead('download', 'Send to the CNC', 'blue')}<div class="pshead"><span class="cnc-count">${n} part${n === 1 ? '' : 's'} from ${ui.cutPick ? 'what is picked in ' : ''}${where}</span><span class="note">In millimeters, for CNC Cutlist</span></div>
    <div class="row-actions">${inHub() ? `<button class="btn primary" data-act="cnc-save">${icon('check')}Save CNC parts to Files</button>` : ''}<button class="btn${inHub() ? '' : ' primary'}" data-act="cnc-download">Download parts file</button><button class="btn" data-act="tab" data-id="export">Other exports</button></div>
    ${cncSkippedNote()}</div>`;
}
function cncSkippedNote() {
  const { skipped } = cncPartFile(true);
  if (!skipped.length) return '<div class="note">Every part and every machining operation is in the file.</div>';
  return `<details class="note"><summary>${skipped.length} item${skipped.length > 1 ? 's' : ''} not in the file (the CNC can't cut ${skipped.length > 1 ? 'them' : 'it'} yet)</summary><ul>${skipped.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
}
// Door and drawer front order: identical fronts across the whole job grouped into one line with a quantity.
// A plain CSV for now; vendor order formats can be added once we have their files.
function doorOrderCSV(units) {
  const f = units === 'mm' ? 25.4 : 1, r = v => Math.round(v * f * 1000) / 1000, lines = new Map();
  const TYPE = { door: 'Door', drawer: 'Drawer front', false: 'False front' }, HINGE = { L: 'Left', R: 'Right' };
  S.rooms.forEach(rm => withRoom(rm, () => S.cabinets.forEach(c => computeFronts(c).forEach(fr => {
    if (fr.type === 'open') return;
    const { ds, framed } = frontStyle(c, fr), w = r(fr.x1 - fr.x0), h = r(fr.z1 - fr.z0);
    const row = [TYPE[fr.type] || fr.type, ds.name, framed ? ({ slab: 'Slab', routed: 'Routed one-piece', twopiece: 'Two-piece', fivepiece: '5-piece' })[ds.type] || ds.type : 'Slab', (mat(ds.mat) || {}).name || '',
      w, h, framed ? ds.panelType || '' : '', framed && ds.design !== 'none' ? ds.design : '', ds.edgeProfile || '', framed ? ds.insideProfile || '' : '',
      framed ? r(ds.stile) : '', framed ? r(ds.rail) : '', fr.type === 'door' ? HINGE[fr.hinge] || '' : '',
      // Grain-matched fronts stay one line per cabinet so the shop can cut them from one panel in order.
      c.grainMatch ? `${c.grainMatch === 'h' ? 'Horizontal' : 'Vertical'} ${(S.rooms.length > 1 ? rm.name + ' ' : '') + LBL[c.id]}` : ''];
    const key = row.join('|'), e = lines.get(key) || { row, qty: 0, rooms: new Set(), cabs: [] };
    e.qty++; e.rooms.add(rm.name); e.cabs.push((S.rooms.length > 1 ? rm.name + ' ' : '') + LBL[c.id]); lines.set(key, e);
  }))));
  const u = units === 'mm' ? 'mm' : 'in';
  const head = ['Line', 'Qty', 'Type', 'Style', 'Construction', 'Material', `Width (${u})`, `Height (${u})`, 'Panel', 'Design', 'Outside edge', 'Inside profile', `Stile (${u})`, `Rail (${u})`, 'Hinge side', 'Grain match', 'Rooms', 'Cabinets'];
  const rows = [...lines.values()].sort((a, b) => a.row[1].localeCompare(b.row[1]) || a.row[0].localeCompare(b.row[0]) || b.row[5] - a.row[5] || b.row[4] - a.row[4])
    .map((e, i) => [i + 1, e.qty, ...e.row.slice(0, 4), ...e.row.slice(4), [...e.rooms].join('; '), [...new Set(e.cabs)].join(' ')]);
  return [[`Door order for ${S.job.name}`], head, ...rows].map(r => r.map(csvq).join(',')).join('\n');
}
// Buyout doors laid out like the door maker's order form: the style's settings, then qty, size, panels, hinge side and cabinet.
// Identical fronts are one line; every line repeats its settings so it can be imported on its own.
function buyoutOrderCSV(units) {
  const f = units === 'mm' ? 25.4 : 1, r = v => Math.round(v * f * 1000) / 1000, lines = new Map();
  const PT = { door: 'Door', drawer: 'Drawer Front', false: 'False Front' }, txt = (v, d) => v ? v : d || '';
  S.rooms.forEach(rm => withRoom(rm, () => S.cabinets.forEach(c => computeFronts(c).forEach(fr => {
    if (fr.type === 'open') return;
    const { ds, framed } = frontStyle(c, fr); if (ds.source !== 'buyout') return;
    const w = (k, d) => framed ? r(+ds[k] || d) : '', bored = ds.vHinge === 'bored';
    const row = [txt(ds.vName, ds.name), PT[fr.type] || fr.type, txt(ds.vWood, (mat(ds.mat) || {}).name), txt(ds.vFace), txt(ds.vPanel, framed ? (mat(ds.type === 'fivepiece' ? ds.panelMat : ds.mat) || mat(ds.mat) || {}).name : ''),
      txt(ds.vSR), txt(ds.vEdge, (EDGE_PROFILES.find(x => x.v === ds.edgeProfile) || {}).l),
      w('topRail', ds.rail), w('botRail', ds.rail), w('leftStile', ds.stile), w('rightStile', ds.stile), w('horizRail', ds.midRailW || ds.rail), w('vertRail', ds.midStileW || ds.stile),
      bored ? 'Bored' : 'None', r(fr.x1 - fr.x0), r(fr.z1 - fr.z0), framed ? doorMids(ds, fr.x1 - fr.x0, fr.z1 - fr.z0).nS + 1 : 1, framed ? doorMids(ds, fr.x1 - fr.x0, fr.z1 - fr.z0).nR + 1 : 1, bored && fr.type === 'door' ? fr.hinge || 'N' : 'N'];
    const key = row.join('|'), e = lines.get(key) || { row, qty: 0, cabs: [] };
    e.qty++; e.cabs.push((S.rooms.length > 1 ? rm.name + ' ' : '') + LBL[c.id]); lines.set(key, e);
  }))));
  const u = units === 'mm' ? 'mm' : 'in';
  const head = ['Line', 'Door style', 'Part type', 'Wood', 'Panel face', 'Panel material', 'Stile and rail profile', 'Edge profile', `Top rail (${u})`, `Bottom rail (${u})`, `Left stile (${u})`, `Right stile (${u})`, `Horiz. rail (${u})`, `Vert. rail (${u})`, 'Cabinet door hinge boring', 'Qty', `Width (${u})`, `Height (${u})`, 'Panels wide', 'Panels high', 'Hinge boring', 'Cab #'];
  const rows = [...lines.values()].sort((a, b) => a.row[0].localeCompare(b.row[0]) || a.row[1].localeCompare(b.row[1]) || b.row[15] - a.row[15] || b.row[14] - a.row[14])
    .map((e, i) => [i + 1, ...e.row.slice(0, 14), e.qty, ...e.row.slice(14), [...new Set(e.cabs)].join(' ')]);
  if (!rows.length) rows.push(['No buyout doors in this job. Set a door style to Buyout in Door styles.']);
  return [[`Buyout door order for ${S.job.name}`], head, ...rows].map(r => r.map(csvq).join(',')).join('\n');
}
// Bywater's door CSV import (Ayden's Bywater Door CSV Export Guide): no header row, 14 columns in a fixed order,
// width before height in fractions, dropdown values copied letter for letter. Rows: doors, then 5-piece drawer fronts, then slabs.
// One row per room, size and style; Cab # is "R2:202(2),204" (room, then each cabinet with its count when more than one).
function bywaterStyle(ds, framed) {
  const slab = !framed, pick = (k, d) => String(ds['bw' + k] || '').trim() || d;
  return { product: pick('Product', slab ? 'Hardwood Slab' : BYWATER.product[0]), folder: pick('Folder', BYWATER.folder[0]), wood: pick('Wood', BYWATER.wood[0]),
    face: pick('Face', slab ? 'Horizontal Grain' : BYWATER.face[0]),
    // Hardwood Slab has no panel or stile and rail fields, so those columns stay empty.
    profile: slab ? '' : pick('Profile', BYWATER.profile[0]), panel: slab ? '' : pick('Panel', BYWATER.panel[0]), sr: slab ? '' : pick('SR', BYWATER.sr[0]),
    edge: pick('Edge', BYWATER.edge[0]) };
}
function bywaterRows() {
  const lines = new Map();
  S.rooms.forEach((rm, ri) => withRoom(rm, () => S.cabinets.forEach(c => computeFronts(c).forEach(fr => {
    if (fr.type === 'open') return;
    const { ds, framed } = frontStyle(c, fr); if (ds.source !== 'buyout') return;
    const door = fr.type === 'door', b = bywaterStyle(ds, framed), w = fmtLen(fr.x1 - fr.x0), h = fmtLen(fr.z1 - fr.z0);
    const row = [w, h, door ? 'Door' : 'Drawer Front', b.product, b.folder, b.wood, b.face, b.profile, b.panel, b.sr, b.edge, door ? '4" on center' : 'None'];
    const key = ri + '|' + row.join('|'), e = lines.get(key) || { row, qty: 0, room: rm.block || ri + 1, cabs: new Map(), order: door ? 0 : framed ? 1 : 2, W: fr.x1 - fr.x0, H: fr.z1 - fr.z0, ri };
    const cn = String(LBL[c.id] || '').replace(/^#/, '');
    e.qty++; e.cabs.set(cn, (e.cabs.get(cn) || 0) + 1); lines.set(key, e);
  }))));
  return [...lines.values()].sort((a, b) => a.order - b.order || a.ri - b.ri || a.row[3].localeCompare(b.row[3]) || b.H - a.H || b.W - a.W)
    .map(e => [e.qty, e.row[0], e.row[1], e.row[2], `R${e.room}:` + [...e.cabs].map(([n, q]) => q > 1 ? `${n}(${q})` : n).join(','), ...e.row.slice(3)]);
}
const bywaterCSV = () => bywaterRows().map(r => r.map(csvq).join(',')).join('\n');
// Values that aren't on Bywater's dropdown lists, so Ayden can check them before uploading.
function bywaterOddValues() {
  const cols = [[5, 'product'], [6, 'folder'], [7, 'wood'], [8, 'face'], [9, 'profile'], [10, 'panel'], [11, 'sr'], [12, 'edge']], out = new Set();
  bywaterRows().forEach(r => cols.forEach(([i, k]) => { if (r[i] && !BYWATER[k].includes(r[i])) out.add(r[i]); }));
  return [...out];
}
// Bywater values for a buyout door style. Pick from Bywater's own wording; blank uses the shop standard shown.
function bywaterStyleFields(d, R, framed) {
  const b = bywaterStyle({}, framed), dl = k => `<datalist id="bw-${k}">${BYWATER[k].map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const f = (label, key, k) => fld(label, R, 'bw' + key, d['bw' + key] || '', 'text', { wide: true, ph: b[k], list: 'bw-' + k });
  return `<div class="dsec">${secHead('list', 'Bywater order', 'amber')}
    <div class="note">Goes on the Bywater CSV. Pick from the list so it matches Bywater's dropdown exactly. Blank uses the value shown.${framed ? '' : ' Slabs have no panel or stile and rail columns.'}</div>
    ${f('Product', 'Product', 'product')}${f('Folder', 'Folder', 'folder')}${f('Wood', 'Wood', 'wood')}${f('Panel face', 'Face', 'face')}
    ${framed ? f('Panel profile', 'Profile', 'profile') + f('Panel material', 'Panel', 'panel') + f('Stile and rail profile', 'SR', 'sr') : ''}${f('Edge profile', 'Edge', 'edge')}
    <div class="note">Hinge boring is 4" on center on doors and None on drawer fronts. Rail and stile widths are set on Bywater's form.</div>
    ${['product', 'folder', 'wood', 'face', 'profile', 'panel', 'sr', 'edge'].map(dl).join('')}</div>`;
}
// Buyout doors: pick the door maker's format. The choice is saved with the job and libraries and can be swapped any time.
function buyoutExportBar() {
  const how = doorExportOf(S), odd = how === 'bywater' ? bywaterOddValues() : [], n = how === 'bywater' ? bywaterRows().length : 0;
  return `<div class="row-actions"><span class="note">Door maker</span><div class="seg" role="group" aria-label="Door maker format">${DOOR_EXPORTS.map(x => `<button data-act="door-export" data-id="${x.v}" aria-pressed="${how === x.v}">${x.l}</button>`).join('')}</div></div>
    ${how === 'bywater' ? (n ? `<div class="note">Bywater's CSV import: no header row, 14 columns, inches as fractions. Download it and upload the .csv on Bywater's order page. Set each style's Bywater values in Door styles under Bywater order.</div>` : '<div class="note">No buyout doors in this job. Set a door style\'s Made by to Buyout in Door styles.</div>')
      + (odd.length ? `<div class="warnbox">Not on Bywater's dropdown lists, check the spelling: ${odd.map(esc).join(', ')}</div>` : '') : ''}`;
}
// What the Scheduler extension needs to plan the job: counts by room, and how many cabinets are painted.
const SCHED_FOLDER = 'Schedules/From Cabinet Designer';
function scheduleSummary() {
  const KEYS = ['cabinets', 'fillers', 'panels', 'doors', 'drawerFronts', 'drawers', 'painted'];
  const rooms = S.rooms.map(rm => withRoom(rm, () => {
    const n = Object.fromEntries(KEYS.map(k => [k, 0]));
    S.cabinets.forEach(c => {
      n.cabinets++;
      n.fillers += fillersOf(c).length;
      n.panels += ['L', 'R'].filter(e => hasPanel(c, e)).length;
      let paint = false;
      computeFronts(c).forEach(fr => {
        if (fr.type === 'door') n.doors++;
        else if (fr.type === 'drawer') { n.drawerFronts++; n.drawers++; }
        else if (fr.type === 'false') n.drawerFronts++;
        if (fr.type !== 'open' && /paint/i.test((mat(frontStyle(c, fr).ds.mat) || {}).name || '')) paint = true;
      });
      if (paint) n.painted++;
    });
    return { name: rm.name, ...n };
  }));
  const totals = Object.fromEntries(KEYS.map(k => [k, rooms.reduce((a, r) => a + r[k], 0)]));
  return { format: 'larkul.schedule-job', version: 1, sent: new Date().toISOString(), from: 'cabinet-designer', designerJob: jobs.path || '',
    job: { name: S.job.name, customer: S.job.customer || '', notes: S.job.notes || '' }, rooms, totals };
}
// What to buy for the whole job: sheets of each material, countertop area and the hardware list.
function buyList() {
  const { use, bom } = materialUsage();
  const mats = S.materials.map(m => { const u = use[m.id]; if (!u || !u.area) return null; const top = m.kind === 'top';
    return `<tr><td>${swatch(m, 18)} ${esc(m.name)}</td><td class="n">${top ? (u.area / 144).toFixed(1) + ' sq ft' : Math.ceil(u.area * 1.15 / (m.sheetW * m.sheetL)) + ' sheet' + (Math.ceil(u.area * 1.15 / (m.sheetW * m.sheetL)) === 1 ? '' : 's')}</td><td class="n">${u.edge ? Math.ceil(u.edge / 12) + ' ft' : ''}</td></tr>`; }).filter(Boolean).join('');
  const hw = Object.entries(bom).sort((a, b) => a[0].localeCompare(b[0])).map(([k, q]) => `<tr><td>${esc(k)}</td><td class="n">${q}</td></tr>`).join('');
  return `<div class="split2"><div class="card"><div class="cardhead"><h3>${icon('palette')}Materials to buy</h3></div><div class="tscroll"><table class="t"><thead><tr><th>Material</th><th class="r">Amount</th><th class="r">Edge</th></tr></thead><tbody>${mats || '<tr><td colspan="3" class="muted">Nothing yet.</td></tr>'}</tbody></table></div><div class="note show" style="padding:0 12px 10px">Sheets include 15% for waste. Edge is the banding on those parts.</div></div>
    <div class="card"><div class="cardhead"><h3>${icon('sliders')}Hardware to buy</h3></div><div class="tscroll"><table class="t"><thead><tr><th>Item</th><th class="r">Qty</th></tr></thead><tbody>${hw || '<tr><td colspan="2" class="muted">Nothing yet.</td></tr>'}</tbody></table></div></div></div>`;
}
function renderExport() {
  if (ui.tab === 'pricing') return renderPricing();
  $('#tab-export').innerHTML = exportHTML(true);
}
function exportHTML(withHead) {
  const txt = exportText(), bw = ui.exportFmt === 'buyout' && doorExportOf(S) === 'bywater';
  return `${withHead ? '' : '<h3 class="ordh">Files to send</h3>'}<div class="pagehead"${withHead ? '' : ' hidden'}><div><h2>Order and export</h2><p>CNC Cutlist parts is the file CNC Cutlist opens to nest the job and write the Rover programs. It is always in millimeters. The other formats are a neutral job file, the cut list, labels and machining.</p></div></div>
  <div class="card cardbody">
    <div class="row-actions">
      <div class="seg" role="group" aria-label="Format">${[['cnc', 'CNC Cutlist parts'], ['json', 'Job JSON'], ['cut', 'Cut list CSV'], ['labels', 'Labels CSV'], ['ops', 'Machining CSV'], ['doors', 'Door order CSV'], ['buyout', 'Buyout doors CSV']].map(([k, l]) => `<button data-act="exp-fmt" data-id="${k}" aria-pressed="${ui.exportFmt === k}">${l}</button>`).join('')}</div>
      ${bw ? '' : `<div class="seg" role="group" aria-label="Units">${[['in', 'Inches'], ['mm', 'Millimeters']].map(([k, l]) => `<button data-act="exp-units" data-id="${k}" aria-pressed="${ui.exportUnits === k}">${l}</button>`).join('')}</div>`}
      <button class="btn primary" data-act="copy">Copy</button><button class="btn" data-act="exp-download">Download</button>${inHub() ? '<button class="btn" data-act="save-files">Save to hub Files</button>' : ''}<span class="note" id="copynote">${txt.length.toLocaleString()} characters</span>
    </div>
    ${ui.exportFmt === 'cnc' ? cncSkippedNote() : ''}
    ${ui.exportFmt === 'buyout' ? buyoutExportBar() : ''}
    ${ui.exportFmt === 'doors' ? '<div class="note">Every door, drawer front and false front in the job, with identical ones grouped. Send this to your door supplier, or tell us their order format and we will add an export that matches it.</div>' : ''}
    <textarea class="out" id="exptext" readonly spellcheck="false" aria-label="Export output">${esc(txt)}</textarea>
  </div>
  ${inHub() ? (() => { const t = scheduleSummary().totals; return `<div class="card cardbody"><h3>Send to Scheduler</h3>
    <div class="note">Puts this job on the shop schedule: open Scheduler and press Add on the Jobs tab. It sends ${t.cabinets} cabinet${t.cabinets === 1 ? '' : 's'}, ${t.doors} door${t.doors === 1 ? '' : 's'}, ${t.drawerFronts} drawer front${t.drawerFronts === 1 ? '' : 's'}, ${t.fillers} filler${t.fillers === 1 ? '' : 's'} and ${t.panels} end panel${t.panels === 1 ? '' : 's'}, room by room. Send it again after changes to update the counts.</div>
    <div class="row-actions"><button class="btn primary" data-act="send-schedule">Send to Scheduler</button></div></div>`; })() : ''}
  <div class="split2">
    <div class="card cardbody"><h3>Back up or move a job</h3><div class="note">The full job, libraries included. Paste it back here on another computer to load it.</div>
      <div class="row-actions"><button class="btn" data-act="backup">Show full job backup</button></div>
      <textarea id="imptext" rows="5" aria-label="Job backup" placeholder='{"v":3, ...}'></textarea>
      <div class="row-actions"><button class="btn" data-act="import">Load this backup</button><span class="note" id="impnote"></span></div></div>
    <div class="card cardbody"><h3>Start over</h3><div class="note">Load the sample job, or clear ${esc(curRoom().name)} and keep your libraries. Undo brings back what was there.</div>
      <div class="row-actions"><button class="btn" data-act="reset-sample">Load sample job</button><button class="btn danger" data-act="clear-room">Clear ${esc(curRoom().name)}</button></div></div>
  </div>`;
}
