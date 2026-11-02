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
  $('#tab-library').innerHTML = `<div class="pagehead"><div><h2>Products</h2></div>
    <div class="row-actions"><button class="btn primary" data-act="designer-new">${icon('plus')}Design a new cabinet</button></div></div>
  <div class="split">
    <div class="card cardbody libtree">${LIB_GROUPS.map(([g, gl]) => { const items = S.library.filter(x => x.cat !== 'Shape' && libGroup(x) === g), shp = (S.shapeLib || []).filter(x => shapeGroup(x) === g); return items.length + shp.length ? `<div class="lgrp lg-${g}"><div class="lgrp-h">${gl}<span class="ct">${items.length + shp.length}</span></div>${items.map(x => libButton(x, 'lib-sel', x.id === ui.libSel)).join('')}${shp.map(x => shapeLibButton(x, 'shape:' + x.id === ui.libSel)).join('')}</div>` : ''; }).join('')}
      <button class="btn sm" data-act="shape-new">${icon('plus')}Draw a new shape</button></div>
    ${sl ? shapeLibCard(sl) : l ? `<div class="card">${cardHead(esc(l.name), `<button class="btn sm primary" data-act="designer-load" data-id="${l.id}">${icon('edit')}Edit in Designer</button><button class="btn sm" data-act="lib-place" data-id="${l.id}">Place in room</button>${dupBtn('lib-dup', l.id)}${delBtn('lib-del', l.id)}`)}
      <div class="cardbody"><div class="split2">
        <div class="stack">
          ${fld('Name', 'lib:' + l.id, 'name', l.name, 'text', { wide: true })}
          <div class="grid2">${fld('Category', 'lib:' + l.id, 'cat', l.cat, 'select', { options: cats })}${fld('Products group', 'lib:' + l.id, 'group', libGroup(l), 'select', { options: LIB_GROUPS.map(([v, t]) => ({ v, l: t })) })}</div>
          ${fld('Folder', 'lib:' + l.id, 'folder', l.folder || '', 'text', { wide: true, ph: libFolder({ ...l, folder: '' }) })}
          <div class="grid2">${fld('Width', 'lib:' + l.id, 'w', l.w, 'len')}${fld('Height', 'lib:' + l.id, 'h', l.h, 'len')}${fld('Depth', 'lib:' + l.id, 'd', l.d, 'len')}${fld('Elevation', 'lib:' + l.id, 'elev', l.elev, 'len')}</div>
        </div>
        <div class="preview pad">${frontPreviewSVG(fake, 320)}</div>
      </div></div></div>` : '<div class="card cardbody">No templates yet.</div>'}
  </div>`;
}
// Short name for the Small library: "Base 3 Drawer" → "Base 3-D", "Base 1 Door 1 Drawer" → "Base 1-DR 1-D".
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
  return `<svg viewBox="${-(s - l.w) / 2 - 1} -1 ${s + 2} ${s + 2}" aria-hidden="true"><g transform="translate(0 ${s - l.h})"><rect class="ev-box nss${l.cat === 'Wall' ? ' wallc' : ''}" x="0" y="0" width="${l.w}" height="${l.h}"/>${fr.filter(f => f.type !== 'open').map(f => `<rect class="ev-front nss" x="${f.x0}" y="${l.h - f.z1}" width="${f.x1 - f.x0}" height="${f.z1 - f.z0}"/>`).join('')}</g></svg>`;
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
function renderMaterials() {
  ensureLibPrices();
  const { use, bom } = materialUsage();
  let totalCost = 0, totalSheets = 0;
  const kinds = [{ v: 'sheet', l: 'Sheet' }, { v: 'top', l: 'Countertop' }, { v: 'solid', l: 'Solid wood' }];
  S.materials.forEach(m => { const u = use[m.id], sheets = u.area ? Math.ceil(u.area * 1.15 / (m.sheetW * m.sheetL)) : 0; totalSheets += m.kind === 'top' ? 0 : sheets; totalCost += sheets * (m.cost || 0); });
  const rows = libRows('mat', S.materials).map(m => {
    if (m.hdr) return `<tr><td colspan="17" class="grouprow"><b>${esc(m.hdr)}</b></td></tr>`;
    const u = use[m.id], sheets = u.area ? Math.ceil(u.area * 1.15 / (m.sheetW * m.sheetL)) : 0;
    const R = 'mat:' + m.id;
    return `<tr><td style="width:46px"><label class="texup" title="Upload a texture photo">${swatch(m, 30)}<input type="file" accept="image/*" data-tex="${m.id}" hidden></label></td>
      <td style="min-width:170px">${ctl(R, 'name', m.name, 'text', { label: 'Material name' })}</td>
      <td style="width:110px">${ctl(R, 'group', m.group || '', 'text', { label: 'Group', ph: 'Group', list: 'matgroups' })}</td>
      <td style="width:124px">${ctl(R, 'kind', m.kind || 'sheet', 'select', { options: kinds, label: 'Kind' })}</td>
      <td style="width:76px">${ctl(R, 'thick', m.thick, 'len', { label: 'Thickness' })}</td>
      <td style="width:64px">${ctl(R, 'sheetW', m.sheetW, 'len', { label: 'Sheet width' })}</td>
      <td style="width:64px">${ctl(R, 'sheetL', m.sheetL, 'len', { label: 'Sheet length' })}</td>
      <td style="width:40px;text-align:center">${ctl(R, 'grain', m.grain, 'bool', { label: 'Grain' })}</td>
      <td style="width:40px;text-align:center">${ctl(R, 'dynamic', !!m.dynamic, 'bool', { label: 'Dynamic (takes the room\'s finish)' })}</td>
      <td style="width:44px">${ctl(R, 'color', m.color, 'color', { label: 'Color' })}</td>
      <td style="width:60px">${ctl(R, 'texScale', m.texScale || 24, 'len', { label: 'Texture size' })}</td>
      <td style="width:70px">${ctl(R, 'cost', m.cost, 'num', { label: 'Cost per sheet' })}</td>
      <td class="n">${u.count}</td><td class="n">${(u.area / 144).toFixed(1)}</td><td class="n"><b>${sheets}</b></td>
      <td style="width:120px;white-space:nowrap"><button class="btn sm" data-act="tex-lib" data-id="${m.id}" title="Pick a texture from the shop's texture library">Library</button>${m.texture ? ` <button class="btn sm" data-act="tex-clear" data-id="${m.id}">Clear</button>` : ''}</td>
      <td style="width:110px">${libRowBtns('mat', m.id)}</td><td style="width:30px"><button class="btn sm" data-act="mat-del" data-id="${m.id}" aria-label="Delete material">×</button></td></tr>`;
  }).join('');
  const mc = S.matTemplates.cabinet, md = S.matTemplates.drawer;
  $('#tab-materials').innerHTML = `<div class="pagehead"><div><h2>Materials</h2><p>The material library holds every sheet, top and solid you use. Pick a texture from the library, or click a swatch to upload your own photo; it shows in the elevation, 3D and Realistic views. Templates bundle materials so a cabinet picks one template instead of five materials.</p></div><div class="row-actions"><button class="btn" data-act="tex-lib" data-id="">From texture library</button><button class="btn primary" data-act="mat-add">Add material</button></div></div>
  <div class="card stats"><div class="stat"><span class="eyebrow">Sheets</span><b>${totalSheets}</b></div><div class="stat"><span class="eyebrow">Material cost</span><b>$${totalCost.toLocaleString()}</b></div><div class="stat"><span class="eyebrow">Cabinets, all rooms</span><b>${allCabs().length}</b></div>${saveNote ? `<div class="warnbox">${esc(saveNote)}</div>` : ''}</div>
  <div class="card">${cardHead('Material library')}${libTableBar('mat', 'Materials')}<datalist id="matgroups">${[...new Set(S.materials.map(m => m.group).filter(Boolean))].sort().map(g => `<option value="${esc(g)}">`).join('')}</datalist><div class="tscroll"><table class="t"><thead><tr><th>Texture</th><th>Name</th><th>Group</th><th>Kind</th><th>Thick</th><th>Sheet W</th><th>Sheet L</th><th>Grain</th><th title="Takes the look of the material picked for each room">Dynamic</th><th>Color</th><th>Tex size</th><th>$/unit</th><th class="r">Parts</th><th class="r">Sq ft</th><th class="r">Sheets</th><th></th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>
  <div class="cards">
    <div class="card">${cardHead('Cabinet material templates', '<button class="btn sm" data-act="mtc-add">Add</button>')}<div class="cardbody">${mc.map(t => `<div class="tplrow" data-drag="cabMatT:${t.id}">
      <div class="tplhead">${swatch(mat(t.carcass), 22)}${ctl('mtc:' + t.id, 'name', t.name, 'text', { label: 'Template name' })}<span class="note">${nCab(usedBy(c => cabSet(c, 'cabMatT') === t.id))}</span>${delBtn('mtc-del', t.id, mc.length < 2, '×')}</div>
      <div class="autogrid">${fld('Box (sides, top, bottom)', 'mtc:' + t.id, 'carcass', t.carcass, 'select', { options: matOpts('sheet') })}${fld('Back', 'mtc:' + t.id, 'back', t.back, 'select', { options: matOpts('sheet') })}${fld('Shelves', 'mtc:' + t.id, 'shelf', t.shelf, 'select', { options: matOpts('sheet') })}${fld('Toe kick', 'mtc:' + t.id, 'toeKick', t.toeKick, 'select', { options: matOpts('sheet') })}</div></div>`).join('')}</div></div>
    <div class="card">${cardHead('Drawer material templates', '<button class="btn sm" data-act="mtd-add">Add</button>')}<div class="cardbody">${md.map(t => `<div class="tplrow" data-drag="drawerMatT:${t.id}">
      <div class="tplhead">${swatch(mat(t.sides), 22)}${ctl('mtd:' + t.id, 'name', t.name, 'text', { label: 'Template name' })}<span class="note">${nCab(usedBy(c => cabSet(c, 'drawerMatT') === t.id))}</span>${delBtn('mtd-del', t.id, md.length < 2, '×')}</div>
      <div class="autogrid">${fld('Sides, front, back', 'mtd:' + t.id, 'sides', t.sides, 'select', { options: matOpts('sheet') })}${fld('Bottom', 'mtd:' + t.id, 'bottom', t.bottom, 'select', { options: matOpts('sheet') })}</div></div>`).join('')}</div></div>
  </div>
  <div class="card">${cardHead('Hardware list', '<span class="note">Counted from every cabinet in the job</span>')}
    <div class="tscroll"><table class="t"><thead><tr><th>Item</th><th class="r">Qty</th></tr></thead><tbody>${Object.entries(bom).sort().map(([k, q]) => `<tr><td>${esc(k)}</td><td class="n">${q}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No hardware yet</td></tr>'}</tbody></table></div></div>`;
}

/* ---------- Doors ---------- */
function renderDoors() {
  ensureLibPrices();
  const types = [{ v: 'slab', l: 'Slab' }, { v: 'routed', l: 'Routed shaker (CNC pocket)' }, { v: 'twopiece', l: 'Two-piece (CNC frame, recessed panel)' }, { v: 'fivepiece', l: '5-piece (stiles, rails, panel)' }];
  const styleOpts = opts(S.doorStyles), pullOpts = opts(hwOf('pull'));
  const keep3d = $('#door3d');
  $('#tab-doors').innerHTML = `${doorDesigner()}
  <div class="pagehead"><h3>Door templates</h3><button class="btn primary" data-act="dtpl-add">Add door template</button></div>
  ${pickBar('doorT', S.doorTemplates, 'Door template')}<div class="cards">${picked('doorT', S.doorTemplates).map(d => {
    const R = 'dtpl:' + d.id, smp = sampleCab({ doorT: d.id, w: 21 });
    return `<div class="card" data-drag="doorT:${d.id}">${cardHead(esc(d.name), `<span class="note">${nCab(usedBy(c => cabSet(c, 'doorT') === d.id))}</span>${dupBtn('dtpl-dup', d.id)}${delBtn('dtpl-del', d.id, S.doorTemplates.length < 2)}`)}
    <div class="cardbody"><div class="cardsplit"><div class="stack">
      ${fld('Name', R, 'name', d.name, 'text', { wide: true })}
      ${fld('Doors', R, 'door', d.door, 'select', { options: styleOpts })}
      ${fld('Wall cabinet doors', R, 'wallDoor', d.wallDoor || '', 'select', { options: [{ v: '', l: 'Same as doors' }, ...styleOpts] })}
      ${fld('Top drawer front', R, 'drawerTop', d.drawerTop || '', 'select', { options: [{ v: '', l: 'Same as drawer fronts' }, ...styleOpts] })}
      ${fld('Drawer fronts', R, 'drawer', d.drawer, 'select', { options: styleOpts })}
      ${fld('Bottom drawer front', R, 'drawerBot', d.drawerBot || '', 'select', { options: [{ v: '', l: 'Same as drawer fronts' }, ...styleOpts] })}
      ${fld('False fronts', R, 'falseFront', d.falseFront, 'select', { options: styleOpts })}
      ${fld('Slab drawer fronts under', R, 'minFrameHeight', d.minFrameHeight, 'len')}
      ${fld('Door pull', R, 'pull', d.pull, 'select', { options: pullOpts })}
      ${fld('Drawer pull', R, 'drawerPull', d.drawerPull, 'select', { options: pullOpts })}
      ${fld('Door pull from edge', R, 'pullFromEdge', d.pullFromEdge, 'len')}
      ${fld('Door pull from end', R, 'pullFromEnd', d.pullFromEnd, 'len')}
      ${fld('Drawer pull from top (0 = centered)', R, 'drawerPullFromTop', d.drawerPullFromTop, 'len')}
    </div><div class="preview pad">${frontPreviewSVG(smp, 240)}</div></div></div></div>`;
  }).join('')}</div>`;
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
function doorDesigner() {
  if (!S.doorStyles.some(d => d.id === ui.doorSel)) ui.doorSel = S.doorStyles[0].id;
  const raw = S.doorStyles.find(d => d.id === ui.doorSel), d = { ...DOOR_DEFAULTS, ...raw }, R = 'door:' + d.id;
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
  <div class="cardhead"><h3>${icon('door')}Door designer</h3><div class="row-actions"><select id="doorpreset" aria-label="Start from">${DOOR_PRESETS.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><button class="btn primary" data-act="door-add">${icon('plus')}New door style</button></div></div>
  <div class="doordes">
    <div class="doorlist" role="listbox" aria-label="Door styles"><input id="doorfind" type="search" placeholder="Find a style" value="${esc(ui.doorFind || '')}" aria-label="Find a door style">${DOOR_CATS.map(cat => { const list = S.doorStyles.filter(x => doorCat({ ...DOOR_DEFAULTS, ...x }) === cat.v && (!ui.doorFind || x.name.toLowerCase().includes(ui.doorFind.toLowerCase()))), shut = (ui.doorShut || {})[cat.v] && !ui.doorFind; return !list.length && ui.doorFind ? '' : `<button class="doorcat" data-act="door-cat" data-id="${cat.v}" aria-expanded="${!shut}">${icon('chevr', shut ? '' : 'rot90')}<span>${cat.l}</span><small>${list.length}</small></button>${shut ? '' : list.map(x => { const xd = { ...DOOR_DEFAULTS, ...x }; return `<button class="dooritem${x.id === d.id ? ' on' : ''}" data-act="door-sel" data-id="${x.id}" role="option" aria-selected="${x.id === d.id}">${doorThumb(x)}<span><b>${esc(x.name)}</b><small>${xd.source === 'buyout' ? 'Buyout · ' : ''}${esc(DOOR_TYPE_SHORT[xd.type] || '')}${xd.design !== 'none' ? ' · ' + esc((PANEL_DESIGNS.find(p => p.v === xd.design) || {}).l || '') : xd.type !== 'slab' ? ' · ' + esc((xd.fieldPanels || []).some(v => v && v !== xd.panelType) ? 'Mixed panels' : (PANEL_TYPES.find(p => p.v === xd.panelType) || {}).l || '') : ''}</small></span></button>`; }).join('')}`; }).join('')}</div>
    <div class="doorstage">
      <div class="stagehead"><div><div class="stagename">${esc(d.name)}</div><div class="note">${m ? swatch(m, 14) + ' ' + esc(m.name) + ' · ' : ''}used in ${usedIn} template${usedIn === 1 ? '' : 's'}</div></div><div class="row-actions">${dupBtn('door-dup', d.id)}${delBtn('door-del', d.id, S.doorStyles.length < 2)}</div></div>
      <div class="stage${ui.door3d ? ' is3d' : ''}">
        <div class="stagebtns"><button class="btn sm stagebtn" data-act="door-3d" aria-pressed="${!!ui.door3d}" title="${ui.door3d ? 'Back to the drawing' : 'Turn it around in 3D'}">${icon(ui.door3d ? 'face' : 'cube')}${ui.door3d ? '2D' : '3D'}</button>${ui.door3d ? `<button class="btn sm stagebtn" data-act="door3d-view" data-id="front" title="Straight on">${icon('face')}</button><button class="btn sm stagebtn" data-act="door3d-view" data-id="angle" title="At an angle">${icon('cube')}</button>` : ''}</div>
        ${ui.door3d ? '<div id="door3d-slot"></div>' : `<div class="stagesvg">${doorRenderSVG(d, pw, ph, { dims: true, pick: ui.doorPick || {} })}</div>`}
      </div>
      <div class="seg sizeseg" role="group" aria-label="Preview size">${DOOR_PREVIEWS.map(([k, l, w, h]) => `<button data-act="door-prev" data-id="${k}" aria-pressed="${pv[0] === k}">${l} <span class="muted">${w}×${h}</span></button>`).join('')}<button data-act="door-prev" data-id="custom" aria-pressed="${pv[0] === 'custom'}">Any size</button></div>
      <div class="doorsize"><label>Width <input id="doorcw" class="num" inputmode="decimal" value="${esc(fmtLen(pw))}" aria-label="Preview width"></label><span>×</span><label>Height <input id="doorch" class="num" inputmode="decimal" value="${esc(fmtLen(ph))}" aria-label="Preview height"></label><span class="muted">${money(priceFront(d, pw * ph / 144, priceSheet()).total)} on ${esc(priceSheet().name)}</span></div>
      ${framedT ? doorPickBar(d, R, pw, ph) : `<div class="specchips">${doorSpecs(d).map(x => `<span class="specchip">${esc(x)}</span>`).join('')}</div>`}
      ${buyout ? `<div class="note doorparts">${icon('list')}Bought from a door maker, so nothing goes on the cut list or the CNC file. It goes on the Buyout door order export.</div>` : ''}<details class="doorparts"${buyout ? ' hidden' : ''}><summary>${icon('list')}${parts.length} part${parts.length === 1 ? '' : 's'} and ${nOps} machining operation${nOps === 1 ? '' : 's'} for this ${pv[1].toLowerCase()}${glassKey.length ? ', plus ' + glassKey.map(esc).join(', ') : ''}</summary>
        <div class="tscroll"><table class="t"><thead><tr><th>Part</th><th class="r">Qty</th><th class="r">Size</th><th>Machining</th></tr></thead><tbody>${parts.map(p => `<tr><td>${esc(p.name)}</td><td class="n">${p.qty}</td><td class="n">${fmtLen(p.L)} × ${fmtLen(p.W)}</td><td class="muted">${[...new Set(p.ops.map(o => opText(o).split(' ')[0] + (o.why ? ' (' + o.why + ')' : '')))].map(esc).join(', ')}</td></tr>`).join('')}</tbody></table></div></details>
    </div>
    <div class="doorform">
      <div class="dsec">${secHead('tag', 'Style', 'violet')}
        ${fld('Name', R, 'name', d.name, 'text', { wide: true })}
        ${fld('Category', R, 'cat', d.cat || '', 'select', { options: [{ v: '', l: `Automatic · ${(DOOR_CATS.find(c => c.v === doorCat({ ...d, cat: '' })) || {}).l}` }, ...DOOR_CATS], wide: true })}
        ${fld('Made by', R, 'source', d.source, 'select', { options: DOOR_SOURCES, wide: true })}
        ${fld('Construction', R, 'type', d.type, 'select', { options: DOOR_TYPES, wide: true })}
        ${fld('Material', R, 'mat', d.mat, 'select', { options: matOpts('sheet'), wide: true })}
        ${fld('Outside edge', R, 'edgeProfile', d.edgeProfile, 'select', { options: EDGE_PROFILES })}</div>
      ${buyout ? `<div class="dsec">${secHead('list', 'Door maker order', 'amber')}
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
        ${two ? '' : (fp && (ptUsed.has('flat') || ptUsed.has('raised'))) || ptUsed.has('insert') ? fld('Panel material', R, 'panelMat', d.panelMat, 'select', { options: matOpts('sheet'), wide: true }) : ''}</div>` : ''}
      ${two ? `<div class="dsec">${secHead('box', 'Panel recess', 'teal')}
        ${fld('Panel', R, 'panelMat', d.panelMat, 'select', { options: matOpts('sheet'), wide: true })}
        <div class="grid2">${fld('Recess width', R, 'recessW', d.recessW, 'len')}${fld('Recess depth', R, 'recessD', d.recessD, 'len')}${fld('Panel clearance', R, 'panelGap', d.panelGap, 'len')}</div>
        <div class="note">The CNC cuts the frame from the 3/4 material, cuts out each opening and rabbets the back. The panel drops into the rabbet from the back: opening plus twice the recess width, less the clearance.</div></div>` : ''}
      <div class="dsec">${secHead('ruler', 'Size rules', 'slate')}
        <div class="grid2">${fld('Min width', R, 'minW', d.minW, 'len', { blank: true, ph: 'none' })}${fld('Max width', R, 'maxW', d.maxW, 'len', { blank: true, ph: 'none' })}${fld('Min height', R, 'minH', d.minH, 'len', { blank: true, ph: 'none' })}${fld('Max height', R, 'maxH', d.maxH, 'len', { blank: true, ph: 'none' })}</div>
        ${fld('Outside these, use', R, 'swap', d.swap || '', 'select', { options: [{ v: '', l: 'This style anyway' }, ...S.doorStyles.filter(x => x.id !== d.id).map(x => ({ v: x.id, l: x.name }))], wide: true })}
        <div class="note">A door or drawer front smaller or bigger than these limits is built with the style you pick here instead, like Mozaik's minimum and maximum sizes.</div>${typeof sizeRuleUse === 'function' && d.swap ? sizeRuleUse(d) : ''}</div>
      <div class="dsec">${secHead('tag', 'Price', 'teal')}
        <div class="grid2">${fld('Price ($/sq ft)', R, 'rate', d.rate, 'num')}${fld('Minimum per front', R, 'min', d.min, 'num')}${fld('Material ($/sq ft)', R, 'matCost', d.matCost, 'num', { blank: true, ph: doorMatRate({ ...d, matCost: '' }, priceSheet()).toFixed(2) })}</div>
        <div class="note">Every door, drawer front, false front and applied end panel in this style costs its size times the price, never under the minimum, plus material. Blank material uses the material's sheet price. A job can use its own price under Pricing › Edit prices.</div></div>
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
function renderPanels() {
  // The panel's look and price come from a door style (Settings › Box and panels); this library keeps only how it fits.
  const ds = doorStyle(roomSet('panelDoor') || doorTpl(roomSet('doorT')).door), m = mat(ds.mat), framed = ds.type !== 'slab', fr = framed ? Math.max(+ds.stile || 0, +ds.rail || 0) : 0;
  $('#tab-panels').innerHTML = `<div class="pagehead"><div><h2>Applied panels</h2><p>Finished end panels for exposed cabinet sides. Each panel is made and priced in a door style picked for the job or room under Settings › Box and panels. These styles only set how the panel fits.</p></div><button class="btn primary" data-act="panel-add">Add panel fit</button></div>
  <div class="card"><div class="cardbody"><div class="roomsum">${swatch(m, 16)}<span>${esc(curRoom().name)} uses <b>${esc(ds.name)}</b>, ${money(doorRate(ds))}/sq ft</span><button class="linkbtn" data-act="tab" data-id="settings">Change in Settings</button><button class="linkbtn" data-act="tab" data-id="doors">Door designer</button></div></div></div>
  ${pickBar('panel', S.panels, 'Panel fit')}<div class="cards">${picked('panel', S.panels).map(d => {
    const R = 'panel:' + d.id, W = 24 + d.frontOverhang + d.scribe, H = 34.5;
    const pk = fr > 0 ? `<rect class="ev-inner nss" x="${fr + d.scribe}" y="${-H + fr}" width="${W - 2 * fr - d.scribe}" height="${H - 2 * fr}"/>` : '';
    return `<div class="card">${cardHead(esc(d.name), `<span class="note">${nCab(usedBy(c => (hasPanel(c, 'L') || hasPanel(c, 'R')) && cabSet(c, 'panelStyle') === d.id))}</span>${delBtn('panel-del', d.id, S.panels.length < 2)}`)}
    <div class="cardbody"><div class="cardsplit"><div class="stack">
      ${fld('Name', R, 'name', d.name, 'text', { wide: true })}
      ${fld('Front overhang', R, 'frontOverhang', d.frontOverhang, 'len')}
      ${fld('Back scribe', R, 'scribe', d.scribe, 'len')}
      <label class="checkrow">${ctl(R, 'toFloor', d.toFloor, 'bool', { label: 'Runs to floor' })} Runs to the floor (covers toe kick)</label>
    </div><div class="preview pad"><svg viewBox="-2 ${-H - 2} ${W + 4} ${H + 4}"><defs>${texDefs([ds.mat])}</defs><rect ${fillFor(m, 'ev-front')} x="0" y="${-H}" width="${W}" height="${H}"/>${pk}</svg></div></div></div></div>`;
  }).join('')}</div>`;
}

/* ---------- Hardware ---------- */
const HOLE_REFS = [{ v: 'set', l: 'Runner hole # (per length)' }, { v: 'front', l: 'From cabinet front' }, { v: 'mid32', l: 'Middle 32 mm hole' }, { v: 'rear32', l: 'Last 32 mm hole' }, { v: 'slideEnd', l: 'Back from slide end' }];
function renderHardware() {
  const k = ui.hwKind || 'slide', items = hwOf(k);
  const num = (R, key, label, unit, val) => `<label class="f"><span>${label}${unit ? ` <span class="muted">(${unit})</span>` : ''}</span>${ctl(R, key, val, 'num', { label })}</label>`;
  const pbar = pickBar('hw-' + k, items, HW_KINDS.find(x => x[0] === k)[1]);
  const body = picked('hw-' + k, items).map(h => {
    const R = 'hw:' + h.id; let inner = '', prev = '';
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
      prev = side ? `<div class="note">Sample 18" base, three drawers. Cabinet side:</div><div class="preview">${partSVG(side, 220)}</div>${ds ? `<div class="note">Drawer side ${fmtLen(ds.L, 1)} × ${fmtLen(ds.W, 1)}:</div><div class="preview">${partSVG(ds, 140)}</div>` : ''}` : `<div class="warnbox">${esc(b.warn[0] || 'This slide does not fit the sample cabinet.')}</div>`;
    } else if (k === 'hinge') {
      const c = sampleCab({ hinge: h.id, rows: [{ type: 'door', h: '*', count: 1 }], cat: 'Wall', h: 30, d: 12, construction: { toeKick: false, top: 'full' }, libParams: { shelfCount: 0 } });
      const b = buildParts(c), door = b.parts.find(p => p.name === 'Door' || p.name.startsWith('Door stile')), side = b.parts.find(p => p.name === 'Left side');
      inner = `<div class="autogrid">${num(R, 'cupDiaMM', 'Cup Ø', 'mm', h.cupDiaMM)}${num(R, 'cupDepthMM', 'Cup depth', 'mm', h.cupDepthMM)}${num(R, 'cupEdgeMM', 'Cup boring distance', 'mm', h.cupEdgeMM)}${num(R, 'max2', '2 hinges up to', 'in', h.max2)}${num(R, 'max3', '3 hinges up to', 'in', h.max3)}</div>
        <div class="eyebrow">Extra holes on the door, per hinge</div><div class="note">dx along the door from the cup center, dy from the cup center toward the middle of the door.</div>
        ${listEditor(R, 'cupExtra', [{ k: 'dx', label: 'dx mm' }, { k: 'dy', label: 'dy mm' }, { k: 'dia', label: 'Ø mm' }, { k: 'depth', label: 'Depth' }], h.cupExtra)}
        <div class="eyebrow">Mounting plate holes on the cabinet side, per hinge</div><div class="note">dz up or down from the hinge centerline, y back from the cabinet front.</div>
        ${listEditor(R, 'plateHoles', [{ k: 'dz', label: 'dz mm' }, { k: 'y', label: 'y mm' }, { k: 'dia', label: 'Ø mm' }, { k: 'depth', label: 'Depth' }], h.plateHoles)}`;
      prev = `${door ? `<div class="note">Sample 30" door:</div><div class="preview">${partSVG(door, 200)}</div>` : ''}${side ? `<div class="note">Cabinet side:</div><div class="preview">${partSVG(side, 140)}</div>` : ''}`;
    } else if (k === 'pull') {
      inner = `<div class="autogrid">${num(R, 'ccMM', 'Hole spacing (0 = knob)', 'mm', h.ccMM)}${num(R, 'lengthMM', 'Overall length', 'mm', h.lengthMM)}${num(R, 'holeDiaMM', 'Hole Ø', 'mm', h.holeDiaMM)}<label class="f"><span>Finish</span>${ctl(R, 'finish', h.finish, 'color', { label: 'Finish' })}</label></div>
        <div class="note">Where pulls land on each front is set in the door template (Doors tab).</div>`;
      const c = sampleCab({ doorT: S.doorTemplates[0].id, pull: h.id, w: 21 });
      const b = buildParts(c), df = b.parts.find(p => p.name === 'Drawer front');
      prev = `<div class="preview pad">${frontPreviewSVG(c, 200)}</div>${df ? `<div class="preview">${partSVG(df, 110)}</div>` : ''}`;
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
        <div class="note">${['jointU', 'jointF'].map(key => S.job.defaults[key] === h.id ? `<b>Job ${key === 'jointF' ? 'finished' : 'unfinished'} ends.</b>` : '').join(' ')} Pick which template each end uses in Settings › Templates and hardware › Box and panels, for a room, or per cabinet in the cabinet editor.</div>`;
      const c = sampleCab({ w: 24, endL: a.fin ? 'fin' : 'unfin', endR: a.fin ? 'fin' : 'unfin', jointU: h.id, jointF: h.id, libParams: { shelfCount: 0 }, rows: [{ type: 'door', h: '*', count: 1 }] });
      const b = buildParts(c), side = b.parts.find(p => p.name === 'Left side'), bot = b.parts.find(p => p.name === 'Bottom');
      prev = `${side ? `<div class="note">Sample 24" base, left side:</div><div class="preview">${partSVG(side, 200)}</div>` : ''}${bot ? `<div class="note">Bottom:</div><div class="preview">${partSVG(bot, 140)}</div>` : ''}`;
    } else if (k === 'leg') {
      inner = `<div class="autogrid">${fld('Cost each', R, 'cost', h.cost, 'num')}${fld('Leg width', R, 'width', h.width, 'num')}${fld('Leg depth', R, 'depth', h.depth, 'num')}</div>
        <div class="eyebrow">Position <span class="muted">(inches)</span></div><div class="note">Insets from the outside of the cabinet to the leg center. A finished end is an exposed end with no panel on it.</div>
        <div class="autogrid">${fld('Inset at toe (front)', R, 'inToe', h.inToe, 'num')}${fld('Inset at finished end', R, 'inFin', h.inFin, 'num')}${fld('Inset at unfinished end', R, 'inUnfin', h.inUnfin, 'num')}${fld('Inset at back', R, 'inBack', h.inBack, 'num')}${fld('Max leg separation (0 = off)', R, 'maxSep', h.maxSep, 'num')}</div>
        <label class="checkrow">${ctl(R, 'noBack', !!h.noBack, 'bool', { label: 'Remove back legs' })} Remove back legs</label>
        <div class="eyebrow">Hole in the bottom (flip side)</div><div class="autogrid">${fld('Hole diameter', R, 'holeDia', h.holeDia, 'num')}${fld('Hole depth', R, 'holeDepth', h.holeDepth, 'num')}</div>
        <div class="note">${S.job.defaults.leg === h.id ? '<b>Used for this job.</b>' : `<button class="btn sm" data-act="leg-use" data-id="${h.id}">Use for this job</button>`} The hole size is a starting guess; check it against the leg's spec sheet.</div>`;
      const c = sampleCab({ w: 36, libParams: { shelfCount: 0 } }), bot = buildParts(c).parts.find(p => p.name === 'Bottom');
      prev = bot ? `<div class="note">Sample 36" base, bottom (leg holes are on the underside):</div><div class="preview">${partSVG(bot, 200)}</div>` : '';
    } else {
      inner = `<label class="checkrow">${ctl(R, 'feet', h.feet, 'bool', { label: 'Cabinet feet' })} These are the cabinet feet (counted from the Feet per cabinet setting)</label>${h.feet ? '' : `<div class="autogrid">${fld('Per cabinet', R, 'perCabinet', h.perCabinet, 'int')}</div>`}${fld('Cabinet types (Base, Wall, Tall)', R, 'cats', [].concat(h.cats || []).join(', '), 'text', { wide: true })}<div class="note">Counted into the hardware list for every matching cabinet.</div>`;
    }
    return `<div class="card hwcard" data-drag="hw:${h.id}">${cardHead(esc(h.name), `<span class="note">${k === 'slide' ? nCab(usedBy(c => cabSet(c, 'slide') === h.id)) : k === 'hinge' ? nCab(usedBy(c => cabSet(c, 'hinge') === h.id)) : ''}</span>${dupBtn('hw-dup', h.id)}${delBtn('hw-del', h.id, items.length < 2 && k !== 'other')}`)}
      <div class="cardbody"><div class="cardsplit wide"><div class="stack">${fld('Name', R, 'name', h.name, 'text', { wide: true })}${inner}</div><div class="stack">${prev}</div></div></div></div>`;
  }).join('');
  $('#tab-hardware').innerHTML = `<div class="pagehead"><div><h2>Hardware library</h2><p>Hardware drives part sizes and drilling. Change a hole here and every cabinet using that hardware updates its machining. Starting numbers are typical published values; check them against the maker’s spec sheet before you cut.</p></div><button class="btn primary" data-act="hw-add" data-id="${k}">Add ${HW_KINDS.find(x => x[0] === k)[1].toLowerCase().replace(/s$/, '').replace('pulls and knob', 'pull')}</button></div>
  <div class="seg" role="tablist">${HW_KINDS.map(([kk, l]) => `<button data-act="hw-kind" data-id="${kk}" aria-pressed="${kk === k}">${l} <span class="muted">${hwOf(kk).length}</span></button>`).join('')}</div>
  ${pbar}<div class="stack">${body || '<div class="card cardbody muted">Nothing here yet.</div>'}</div>`;
}

/* ---------- Countertops ---------- */
function renderCountertops() {
  const runs = countertopRuns(), topOpts = opts(S.countertops);
  const sq = runs.filter(r => r.on).reduce((a, r) => a + r.len * r.depth / 144, 0);
  $('#tab-countertops').innerHTML = `<div class="pagehead"><div><h2>Countertops</h2><p>Press Auto build countertops to lay a top on every run of base cabinets; until then a room has no tops. Ends against a wall or a tall cabinet get no overhang; open ends get the style’s end overhang. Change any run below.</p></div><button class="btn primary" data-act="top-add">Add countertop style</button></div>
  <div class="card stats"><div class="stat"><span class="eyebrow">Runs</span><b>${runs.filter(r => r.on).length}</b></div><div class="stat"><span class="eyebrow">Area</span><b>${sq.toFixed(1)} sq ft</b></div><label class="f wide" style="min-width:300px"><span>Style for ${esc(curRoom().name)}</span>${ctl('rset:' + curRoom().id, 'countertop', curRoom().settings.countertop || '', 'select', { options: setOpts('countertop', topOpts) })}</label></div>
  ${genTopsCard(topOpts)}
  ${autoTopsCard(runs, topOpts)}
  ${pickBar('top', S.countertops, 'Countertop style')}<div class="cards">${picked('top', S.countertops).map(t => {
    const R = 'top:' + t.id, m = mat(t.mat);
    return `<div class="card">${cardHead(`${swatch(m, 18)} ${esc(t.name)}`, delBtn('top-del', t.id, S.countertops.length < 2))}<div class="cardbody">
      ${fld('Name', R, 'name', t.name, 'text', { wide: true })}${fld('Material', R, 'mat', t.mat, 'select', { options: matOpts('top'), wide: true })}
      <div class="autogrid">${fld('Thickness', R, 'thick', t.thick, 'len')}${fld('Front overhang', R, 'frontOverhang', t.frontOverhang, 'len')}${fld('End overhang', R, 'endOverhang', t.endOverhang, 'len')}${fld('Backsplash height', R, 'backsplash', t.backsplash, 'len')}</div></div></div>`;
  }).join('')}</div>`;
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

function renderMoldings() {
  const runs = moldingRuns(), profiles = [{ v: 'crown', l: 'Crown' }, { v: 'cove', l: 'Cove' }, { v: 'flat', l: 'Flat / batten' }, { v: 'shape', l: 'Custom shape' }];
  const tot = {}; runs.forEach(r => { tot[r.m.name] = (tot[r.m.name] || 0) + r.len; });
  $('#tab-moldings').innerHTML = `<div class="pagehead"><div><h2>Moldings</h2><p>Nothing gets molding on its own. Auto build molding puts a molding from the library on top of every upper cabinet that sits close to the ceiling, with returns on open ends. You can also drag a molding onto a single cabinet, or pick it in the Room inspector.</p></div><div class="row-actions"><button class="btn" data-act="mold-add">Add molding</button><button class="btn primary" data-act="mold-add-shape">${icon('ruler')}New molding, draw its profile</button></div></div>
  <div class="card cardbody"><h3>Auto build molding</h3>${autoMoldBox(runs)}</div>
  ${genMoldsCard()}
  <div class="card">${cardHead('Runs in ' + esc(curRoom().name))}<div class="tscroll"><table class="t"><thead><tr><th>Wall</th><th>Cabinets</th><th>Molding</th><th class="r">Height</th><th class="r">Front</th><th class="r">Returns</th><th class="r">Total</th></tr></thead><tbody>${runs.map(r => `<tr><td>${wallName(wall(r.wall))}</td><td>${r.generic ? '<span class="muted">Placed by hand</span>' : r.cabs.map(id => LBL[id]).join(', ')}</td><td>${esc(r.m.name)}</td><td class="n">${fmtLen(r.h, 1)}</td><td class="n">${fmtLen(r.front, 1)}</td><td class="n">${fmtLen(r.returns, 1)}</td><td class="n">${fmtLen(r.len, 1)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">None</td></tr>'}
    ${Object.entries(tot).map(([n, L]) => `<tr><td colspan="6"><b>${esc(n)}</b> with 10% waste, in 8 ft sticks</td><td class="n"><b>${(L * 1.1 / 12).toFixed(1)} ft · ${Math.ceil(L * 1.1 / 96)}</b></td></tr>`).join('')}</tbody></table></div></div>
  ${pickBar('mold', S.moldings, 'Molding')}<div class="cards">${picked('mold', S.moldings).map(m => {
    const R = 'mold:' + m.id, steps = m.profile === 'flat' ? [[1, 1]] : m.profile === 'crown' ? [[0.45, 0.4], [0.55, 1]] : [[0.5, 0.55], [0.5, 1]];
    let y = 0; const outl = moldProfile(m), prof = outl ? `<polygon class="ev-mold nss" points="${outl.map(p => `${r3(p.x)},${r3(-p.y)}`).join(' ')}"/>` : steps.map(([hf, df]) => { const r = `<rect class="ev-mold nss" x="0" y="${-(y + m.h * hf)}" width="${m.d * df}" height="${m.h * hf}"/>`; y += m.h * hf; return r; }).join('');
    return `<div class="card" data-drag="mold:${m.id}">${cardHead(esc(m.name), `<span class="note">${nCab(usedBy(c => c.molding === m.id))}</span>${delBtn('mold-del', m.id, S.moldings.length < 2)}`)}<div class="cardbody"><div class="cardsplit"><div class="stack">
      ${fld('Name', R, 'name', m.name, 'text', { wide: true })}${fld('Profile', R, 'profile', m.profile, 'select', { options: profiles })}
      ${m.profile === 'shape' ? `<div class="row-actions"><button class="btn sm" data-act="mold-draw" data-id="${m.id}">${icon('ruler')}Edit the profile in the shape editor</button></div>` : ''}
      ${fld('Material', R, 'mat', m.mat, 'select', { options: matOpts() })}
      ${fld('Height', R, 'h', m.h, 'len')}${fld('Projection', R, 'd', m.d, 'len')}
      <label class="checkrow">${ctl(R, 'fill', m.fill, 'bool', { label: 'Fill to ceiling' })} Fill the gap to the ceiling (up to 12")</label>
      <label class="checkrow">${ctl(R, 'bottom', !!m.bottom, 'bool', { label: 'Light rail' })} Goes under the cabinet (light rail)</label>
    </div><div class="preview pad"><svg viewBox="-1 ${-m.h - 1} ${Math.max(m.d, m.h) + 2} ${m.h + 2}" style="max-height:120px">${prof}</svg><div class="note">Side profile</div></div></div></div></div>`;
  }).join('')}</div>`;
}

/* ---------- Part templates (edgebanding) ---------- */
// Banded length per edgeband over the whole job, in inches.
function bandUsage() {
  const use = {};
  S.rooms.forEach(rm => withRoom(rm, () => allParts().forEach(p => EDGE_KEYS.forEach(k => { const id = p.band[k]; if (id) use[id] = (use[id] || 0) + (k[0] === 'L' ? p.L : p.W) * p.qty; }))));
  return use;
}
function renderPartTemplates() {
  const bands = [{ v: '', l: 'None' }, ...azOpts(S.edgebands).map(o => { const b = edgeband(o.v); return b && b.code ? { ...o, l: `${b.code} · ${o.l}` } : o; })], use = bandUsage();
  $('#tab-parts').innerHTML = `<div class="pagehead"><div><h2>Part templates</h2><p>A part template says which edges of each kind of part get edgebanded, and with what. Pick one for the whole job or a room on the Settings tab, or for one cabinet in the Room tab. The cut list, labels and exports carry the banding for every part.</p></div></div>
  <div class="note ebnote">Edges follow the part drawing in the cut list: <b>L1</b> and <b>L2</b> run along the length (L1 is the y&nbsp;=&nbsp;0 edge, drawn on top), <b>W1</b> and <b>W2</b> are the ends (W1 at x&nbsp;=&nbsp;0). Each cell also says where that edge is on the cabinet, such as Front or Top.</div>
  <div class="pagehead"><h3>Part templates</h3><button class="btn primary" data-act="pt-add">Add part template</button></div>
  ${pickBar('ptpl', S.partTemplates, 'Part template')}${picked('ptpl', S.partTemplates).map(t => {
    const R = 'ptpl:' + t.id;
    return `<div class="card ptcard">${cardHead(esc(t.name), `<span class="note">${nCab(usedBy(c => cabSet(c, 'partT') === t.id))}</span>${dupBtn('pt-dup', t.id)}${delBtn('pt-del', t.id, S.partTemplates.length < 2)}`)}
    <div class="cardbody">${fld('Name', R, 'name', t.name, 'text', { wide: true })}</div>
    <div class="tscroll"><table class="t pttab"><thead><tr><th>Part</th><th>Edges</th>${EDGE_KEYS.map(k => `<th>${k}</th>`).join('')}<th></th></tr></thead><tbody>${PART_KINDS.map(pk => {
      const band = partBands(t, pk.id), first = EDGE_KEYS.map(k => band[k]).find(Boolean) || (S.edgebands[0] || {}).id || '';
      return `<tr><td><b>${esc(pk.name)}</b><div class="note">${edgeSummary(pk.id, band) || 'No banding'}</div></td><td>${bandDiagram(band, pk.id)}</td>
        ${EDGE_KEYS.map(k => `<td><label class="ebcell"><span>${esc(pk.edges[k])}</span>${ctl('ptr:' + t.id + ':' + pk.id, k, band[k], 'select', { options: bands, label: pk.name + ', ' + pk.edges[k] })}</label></td>`).join('')}
        <td class="nowrap"><button class="btn sm" data-act="pt-kind" data-id="${t.id}:${pk.id}" data-v="${first}">All 4</button> <button class="btn sm" data-act="pt-kind" data-id="${t.id}:${pk.id}" data-v="">None</button></td></tr>`;
    }).join('')}</tbody></table></div></div>`;
  }).join('')}
  <div class="pagehead"><h3>Edgebanding</h3><button class="btn primary" data-act="eb-add">Add edgeband</button></div>
  <div class="card">${libTableBar('eb', 'Edgebands')}<div class="tscroll"><table class="t"><thead><tr><th>Color</th><th>Name</th><th>Code</th><th>Group</th><th>Thickness (mm)</th><th>Width</th><th class="r">Used in job</th><th></th><th></th></tr></thead><tbody>${libRows('eb', S.edgebands).map(b => b.hdr ? `<tr><td colspan="9" class="grouprow"><b>${esc(b.hdr)}</b></td></tr>` : `<tr>
    <td style="width:56px">${ctl('eb:' + b.id, 'color', b.color, 'color', { label: 'Color' })}</td><td>${ctl('eb:' + b.id, 'name', b.name, 'text', { label: 'Name' })}</td><td style="width:80px">${ctl('eb:' + b.id, 'code', b.code || '', 'text', { label: 'Short code', ph: 'PVC1' })}</td><td style="width:110px">${ctl('eb:' + b.id, 'group', b.group || '', 'text', { label: 'Group', ph: 'Group' })}</td>
    <td style="width:110px">${ctl('eb:' + b.id, 'thickMM', b.thickMM, 'num', { label: 'Thickness in mm' })}</td><td style="width:100px">${ctl('eb:' + b.id, 'width', b.width, 'len', { label: 'Width' })}</td>
    <td class="n">${use[b.id] ? (use[b.id] / 12).toFixed(1) + ' ft' : '<span class="muted">0</span>'}</td><td style="width:110px">${libRowBtns('eb', b.id)}</td><td style="width:40px">${delBtn('eb-del', b.id, false, '×')}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">No edgebands yet</td></tr>'}</tbody></table></div></div>`;
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
    countertopRuns().filter(r => r.on).forEach(r => tops.push({ ...r, room: rm.name, wallN: wallName(wall(r.wall)) }));
    moldingRuns().forEach(r => molds.push({ ...r, room: rm.name, wallN: wallName(wall(r.wall)) }));
  }));
  return { rooms, parts, tops, molds, cabs };
}
function renderCutlist() {
  if (ui.cutRoom !== 'all' && !roomById(ui.cutRoom)) ui.cutRoom = 'all';
  const sc = cutScope(), multi = sc.rooms.length > 1;
  sc.parts.forEach((p, i) => p.key = p.cabId + '#' + i);
  const shown = sc.parts;
  const sel = shown.find(p => p.key === ui.partSel) || shown[0];
  const byMat = {}; shown.forEach(p => (byMat[p.mat] = byMat[p.mat] || []).push(p));
  const cabName = p => (multi ? esc(p.room) + ' · ' : '') + p.cab;
  $('#tab-cutlist').innerHTML = `<div class="pagehead"><div><h2>Cut list</h2><p>Every part with its machining. Length (x) runs with the grain where the material has grain. Click a part to see its drilling.</p></div>
    <div class="row-actions"><button class="btn primary" data-act="labels">Print labels</button><button class="btn" data-act="mp-open">${icon('print')}Multi print</button><button class="btn" data-act="sv-open" data-id="${cutOneCab()}">${icon('list')}Shop view</button><label class="f wide" style="min-width:220px"><span>Room</span><select id="cutroom"><option value="all">Whole job (${S.rooms.length} rooms)</option>${S.rooms.map(r => `<option value="${r.id}"${ui.cutRoom === r.id ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
    <label class="f wide cp-open"><span>What to cut</span><button class="btn${ui.cutPick ? ' on' : ''}" data-act="cut-pk-open" aria-expanded="${!!ui.cutPickOpen}">${icon('check')}${esc(cutPickText(sc.rooms))}</button></label></div></div>
  ${cutPickCard(sc.rooms)}${cncCard()}${typeof recutCard === 'function' ? recutCard() : ''}
  <div class="split2">
    <div class="stack"><div class="card tscroll"><table class="t"><thead><tr><th>Cab</th><th>Part</th><th class="r">Qty</th><th class="r">Length</th><th class="r">Width</th><th class="r">Thick</th><th>Edge</th><th class="r">Ops</th></tr></thead>
    <tbody>${Object.entries(byMat).map(([mid, ps]) => `<tr><td colspan="8" class="grouprow">${swatch(mat(mid), 14)} <b>${esc((mat(mid) || {}).name || mid)}</b> <span class="muted">· ${ps.reduce((a, p) => a + p.qty, 0)} parts</span></td></tr>` + ps.map(p => `<tr class="click${sel && p.key === sel.key ? ' on' : ''}" data-act="part" data-id="${p.key}" title="Double-click to open the part editor"><td>${cabName(p)}</td><td>${esc(p.report || p.name)}${p.report ? ` <span class="muted">(${esc(p.name)})</span>` : ''}</td><td class="n">${p.qty}</td><td class="n">${fmtLen(p.L)}</td><td class="n">${fmtLen(p.W)}</td><td class="n">${fmtLen(p.T)}</td><td>${p.edges}</td><td class="n">${p.ops.length || ''}</td></tr>`).join('')).join('') || `<tr><td colspan="8" class="muted">${ui.cutPick ? 'Nothing picked to cut. Use What to cut above to pick cabinets, fillers and panels.' : 'No parts yet. Place cabinets in the Room tab.'}</td></tr>`}</tbody></table></div>
    ${!ui.cutPick && (sc.tops.length || sc.molds.length) ? `<div class="card tscroll"><table class="t"><thead><tr><th>Countertops and moldings</th><th class="r">Length</th><th class="r">Depth / height</th><th>Material</th></tr></thead><tbody>
      ${sc.tops.map(r => `<tr><td>${esc(r.tpl.name)} · ${multi ? esc(r.room) + ' · ' : ''}${r.wallN}</td><td class="n">${fmtLen(r.len)}</td><td class="n">${fmtLen(r.depth)}</td><td>${esc((mat(r.tpl.mat) || {}).name || '')}</td></tr>`).join('')}
      ${sc.molds.map(r => `<tr><td>${esc(r.m.name)} · ${multi ? esc(r.room) + ' · ' : ''}${r.wallN}</td><td class="n">${fmtLen(r.len)}</td><td class="n">${fmtLen(r.h)}</td><td>${esc((mat(r.m.mat) || {}).name || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>
    <div class="card sticky">${sel ? `${cardHead(`${cabName(sel)} · ${esc(sel.report || sel.name)}`, `<span class="mono">${fmtLen(sel.L)} × ${fmtLen(sel.W)} × ${fmtLen(sel.T)}</span>${sel.cabId && cab(sel.cabId) ? `<button class="btn sm primary" data-act="cut-edit-part" data-id="${esc(sel.cabId + '|' + peKeyOf(sel))}">Edit part</button>` : ''}<button class="btn sm" data-act="rc-add" data-id="${esc(sel.key)}" title="Add to the recut list">Recut</button>`)}
      <div class="cardbody"><div class="preview">${partSVG(sel)}</div>
      ${EDGE_KEYS.some(k => sel.band[k]) ? `<table class="t"><thead><tr><th>Edge</th><th>Where</th><th>Edgeband</th></tr></thead><tbody>${EDGE_KEYS.filter(k => sel.band[k]).map(k => `<tr><td><b>${k}</b></td><td>${esc(partKind(sel.kind).edges[k])}</td><td>${swatchBand(edgeband(sel.band[k]))} ${esc(edgeband(sel.band[k]).name)}</td></tr>`).join('')}</tbody></table>` : '<div class="note">No edgebanding on this part.</div>'}
      <div class="note">Origin (orange dot) is the top-left corner as drawn. L1 is the top edge as drawn, L2 the bottom, W1 the left end and W2 the right end. Cabinet sides: x runs up from the floor, y back from the front edge. Fronts: x up from the bottom edge, y from the left edge as seen from the front.</div>
      <div class="tscroll" style="max-height:300px;overflow:auto"><table class="t"><thead><tr><th>Operation</th><th>For</th></tr></thead><tbody>${sel.ops.map(o => `<tr><td>${esc(opText(o))}</td><td class="muted">${esc(o.why || '')}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No machining on this part</td></tr>'}</tbody></table></div></div>` : '<div class="cardbody muted">Select a part.</div>'}</div>
  </div>`;
  $('#cutroom').addEventListener('change', e => { ui.cutRoom = e.target.value; ui.partSel = null; renderCutlist(); });
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
          edgebanding: Object.fromEntries(EDGE_KEYS.map(k => { const eb = edgeband(q.band[k]); return [k, eb ? { edge: partKind(q.kind).edges[k], band: eb.name, thicknessMM: eb.thickMM } : null]; })), ops: q.ops.map(conv), ...(q.note ? { comment: q.note } : {}), ...(q.outline ? { outline: q.outline.map(o => ({ x: r(o.x), y: r(o.y) })) } : {}) })),
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
  if (ui.exportFmt === 'buyout') return buyoutOrderCSV(d.units);
  const rows = [['Room', 'Cabinet', 'Part', 'Op', 'X', 'Y', 'X2', 'Y2', 'W', 'H', 'Dia', 'Width', 'Depth', 'Face', 'For']];
  d.rooms.forEach(rm => rm.cabinets.forEach(c => c.parts.forEach(p => p.ops.forEach(o => rows.push([rm.name, c.label, p.name, o.type, o.x ?? o.x1, o.y ?? o.y1, o.x2, o.y2, o.w, o.h, o.dia, o.width, o.depth, o.face || o.edge, o.why])))));
  return rows.map(r => r.map(csvq).join(',')).join('\n');
}
// What the CNC can't cut yet, so it gets done by hand or waits for a tool.
// The CNC Cutlist parts file for the whole job, right on the Cutlist tab.
function cncCard() {
  const f = cncPartFile(true).file, n = (f.parts || []).reduce((a, p) => a + (p.qty || 1), 0);
  const where = ui.cutRoom === 'all' ? 'the whole job' : esc((roomById(ui.cutRoom) || curRoom()).name);
  return `<div class="card cardbody cnccard"><div class="pshead"><h3>${icon('export')}Send to the CNC</h3><span class="cnc-count">${n} part${n === 1 ? '' : 's'} from ${ui.cutPick ? 'what is picked in ' : ''}${where}</span><span class="note">In millimeters, for CNC Cutlist</span></div>
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
  const txt = exportText();
  return `${withHead ? '' : '<h3 class="ordh">Files to send</h3>'}<div class="pagehead"${withHead ? '' : ' hidden'}><div><h2>Order and export</h2><p>CNC Cutlist parts is the file CNC Cutlist opens to nest the job and write the Rover programs. It is always in millimeters. The other formats are a neutral job file, the cut list, labels and machining.</p></div></div>
  <div class="card cardbody">
    <div class="row-actions">
      <div class="seg" role="group" aria-label="Format">${[['cnc', 'CNC Cutlist parts'], ['json', 'Job JSON'], ['cut', 'Cut list CSV'], ['labels', 'Labels CSV'], ['ops', 'Machining CSV'], ['doors', 'Door order CSV'], ['buyout', 'Buyout doors CSV']].map(([k, l]) => `<button data-act="exp-fmt" data-id="${k}" aria-pressed="${ui.exportFmt === k}">${l}</button>`).join('')}</div>
      <div class="seg" role="group" aria-label="Units">${[['in', 'Inches'], ['mm', 'Millimeters']].map(([k, l]) => `<button data-act="exp-units" data-id="${k}" aria-pressed="${ui.exportUnits === k}">${l}</button>`).join('')}</div>
      <button class="btn primary" data-act="copy">Copy</button>${inHub() ? '<button class="btn" data-act="save-files">Save to hub Files</button>' : ''}<span class="note" id="copynote">${txt.length.toLocaleString()} characters</span>
    </div>
    ${ui.exportFmt === 'cnc' ? cncSkippedNote() : ''}
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
