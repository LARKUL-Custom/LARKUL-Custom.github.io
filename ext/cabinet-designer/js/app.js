// App: UI state, room shell, inspector, drag and drop, actions, keyboard and boot.
'use strict';
const ui = {
  tab: 'room', sel: null, placing: null, drawWalls: false, dock: '', dockOpen: false, railShut: false, ptab: { cab: 'size', wall: 'size' }, view: { x: -30, y: -40, w: 240, h: 160 },
  drawing: null, typed: '', mouse: null, ghost: null, ghostLib: null, drag: null, edrag: null, elevWall: 'w2', libSel: 'b-2d1dr',
  partSel: null, cutPick: null, cutPickOpen: false, exportFmt: 'cnc', exportUnits: 'in', px: 1, src: 'cabinets', viewMode: 'plan', render3d: false, wallOp: 1, cutaway: false, layers: {},
  hwKind: 'slide', dropCab: null, cutRoom: 'all', setRoom: null, dims: { cab: true, fronts: false },
  open: {}, des3d: false,
};
// Main toolbar, in Mozaik's order, then the libraries that sit behind the Libraries menu.
// Shop order, left to right: set up the job, draw it, dress it, then order, price and cut it.
const MAIN_TABS = [['job', 'Job'], ['settings', 'Settings'], ['room', 'Room'], ['countertops', 'Tops'], ['moldings', 'Molding'], ['pricing', 'Pricing'], ['cutlist', 'Cutlist'], ['carve', 'Carve']];
const LIB_TABS = [['library', 'Products'], ['materials', 'Materials'], ['doors', 'Doors'], ['hardware', 'Hardware'], ['inserts', 'Inserts'], ['panels', 'Applied panels'], ['faceframes', 'Face frames'], ['parts', 'Part templates'], ['cnctools', 'CNC tools'], ['rules', 'Rules'], ['remnants', 'Remnants']];
// The Designer opens from Products (and from a cabinet); it has no button of its own.
const HIDDEN_TABS = [['designer', 'Designer'], ['shop', 'Shop view'], ['export', 'Order']];
const TABS = [...MAIN_TABS, ...LIB_TABS, ...HIDDEN_TABS];
const TAB_ICONS = {
  job: '<rect x="3" y="7" width="14" height="10" rx="1.5"/><path d="M7.5 7V5h5v2M3 11h14"/>',
  settings: '<path d="M4 5h12M4 10h12M4 15h12"/><circle cx="8" cy="5" r="1.8"/><circle cx="13" cy="10" r="1.8"/><circle cx="6" cy="15" r="1.8"/>',
  room: '<path d="M3 17V3h14v9M3 9h5M12 17h5v-5"/>',
  library: '<rect x="4" y="3" width="12" height="14" rx="1"/><path d="M4 8h12M10 8v9M8 5.5h4M8.5 12v2M11.5 12v2"/>',
  designer: '<path d="M4 16l1-4 8-8 3 3-8 8zM11.5 5.5l3 3"/>',
  countertops: '<path d="M2 8h16v3H2zM4 11v6M16 11v6"/>',
  moldings: '<path d="M3 4h14v3c-3 0-4 2-4 4H3z"/><path d="M3 15h14"/>',
  cutlist: '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M3 9h14M9 3v14"/>',
  carve: '<path d="M4 4l6 12 6-12"/><path d="M7 4h6"/>',
  pricing: '<path d="M3 10.5V3.5h7l7 7-7 7z"/><circle cx="7" cy="7.5" r="1.3"/>',
  export: '<path d="M3 4h2l2 9h9l1.5-6H6"/><circle cx="8" cy="16" r="1.3"/><circle cx="14.5" cy="16" r="1.3"/>',
  libs: '<path d="M4 3v14M8 3v14M12 4l3.5 12.5"/>',
};
const TAB_TONES = { job: 'indigo', settings: 'slate', room: 'teal', library: 'amber', designer: 'violet', countertops: 'stone', moldings: 'rose', cutlist: 'green', carve: 'rose', pricing: 'teal', export: 'blue', libs: 'amber', materials: 'amber', doors: 'violet', hardware: 'slate', panels: 'stone', parts: 'green' };
const tabIcon = k => `<span class="tabic tone-${TAB_TONES[k] || 'slate'}"><svg viewBox="0 0 20 20" aria-hidden="true">${TAB_ICONS[k]}</svg></span>`;
const RENDER = () => ({ job: renderJob, settings: renderSettings, room: renderRoom, designer: renderDesigner, library: renderLibrary, materials: renderMaterials, doors: renderDoors, hardware: renderHardware, countertops: renderCountertops, moldings: renderMoldings, panels: renderPanels, faceframes: renderFaceFrames, inserts: renderInserts, parts: renderPartTemplates, cnctools: renderCncTools, rules: renderRules, remnants: renderRemnants, shop: renderShop, cutlist: renderCutlist, carve: renderCarve, pricing: renderPricing, export: renderExport });
function fixSel() {
  if (ui.sel && ui.sel.type === 'cab' && !cab(ui.sel.id)) ui.sel = null;
  if (ui.sel && ui.sel.type === 'wall' && !wall(ui.sel.id)) ui.sel = null;
  if (ui.sel && ui.sel.type === 'shape' && !shapeById(ui.sel.id)) ui.sel = null;
  if (ui.sel && ui.sel.type === 'fixt' && !fixtById(ui.sel.id)) ui.sel = null;
  if (!wall(ui.elevWall)) { const c = S.cabinets[0]; ui.elevWall = c ? c.wall : S.walls[0] ? S.walls[0].id : null; }
  if (!libItem(ui.libSel) && !(String(ui.libSel || '').startsWith('shape:') && shapeLibItem(ui.libSel.slice(6)))) ui.libSel = S.library[0] && S.library[0].id;
  if (ui.placing && !libItem(ui.placing) && !shapeLibItem(String(ui.placing).replace(/^shape:/, '')) && !fixtPreset(String(ui.placing).replace(/^fixt:/, ''))) ui.placing = null;
}
function render() {
  // Order lives on the Pricing page now (what to buy and the files to send).
  if (ui.tab === 'export') { ui.tab = 'pricing'; ui.priceView = 'order'; }
  LBL = labels(); fixSel();
  const libOn = LIB_TABS.some(([k]) => k === ui.tab) || ui.tab === 'designer';
  document.body.classList.toggle('room-on', ui.tab === 'room');
  $('#tabs').innerHTML = MAIN_TABS.map(([k, l]) => `<button role="tab" data-act="tab" data-id="${k}" aria-selected="${ui.tab === k}">${tabIcon(k)}<span>${l}</span></button>`).join('')
    + `<button data-act="libmenu" id="libbtn" aria-haspopup="menu" aria-expanded="${!$('#libmenu').hidden}" aria-selected="${libOn}">${tabIcon('libs')}<span>${libOn ? [...LIB_TABS, ...HIDDEN_TABS].find(([k]) => k === ui.tab)[1] : 'Libraries'} ▾</span></button>`;
  $('#libmenu').innerHTML = LIB_TABS.map(([k, l]) => `<button role="menuitem" data-act="tab" data-id="${k}" aria-current="${ui.tab === k}">${l}</button>`).join('');
  const jn = $('#jobname'); if (document.activeElement !== jn) jn.value = S.job.name;
  $('#roomsel').innerHTML = S.rooms.map((r, i) => `<option value="${r.id}"${r.id === S.roomId ? ' selected' : ''}>${i + 1}. ${esc(r.name)}</option>`).join('') + '<option value="__add">+ Add room</option>';
  TABS.forEach(([k]) => { $('#tab-' + k).hidden = ui.tab !== k; });
  if (ui.tab !== 'room') $('#quickedit').hidden = true;
  if (ui.tab !== 'room') $('#dock').innerHTML = '';
  $('#main').classList.toggle('is-room', ui.tab === 'room');
  $('[data-act="undo"]').disabled = !undoStack.length;
  $('[data-act="redo"]').disabled = !redoStack.length;
  showSaveState();
  RENDER()[ui.tab]();
}
function select(sel, keepMulti) {
  ui.sel = sel; if (!keepMulti) ui.multi = [];
  if (sel && sel.type === 'cab') { const c = cab(sel.id); if (c) ui.elevWall = c.wall; }
  renderRoom();
}
function goTab(id) { $('#libmenu').hidden = true; ui.tab = id; try { localStorage.setItem(KEY + '.tab', id); } catch (_) {} render(); if (id === 'room') requestAnimationFrame(() => renderRoom()); }

/* ---------- Room shell ---------- */
const SOURCES = [['cabinets', 'Products'], ['faces', 'Faces'], ['doors', 'Doors'], ['materials', 'Materials'], ['hardware', 'Hardware'], ['moldings', 'Moldings']];
// The library rail can fold away to a slim tab, so the plan and elevation get the room.
// On a phone the library is a sheet that slides up over the drawing instead, and starts closed.
const phoneQuery = matchMedia('(max-width: 760px)');
const isPhone = () => phoneQuery.matches;
const railShut = () => isPhone() ? !ui.libOpen : ui.railShut;
function renderRail() {
  const shut = railShut(), phone = isPhone();
  $('#tab-room').classList.toggle('rail-shut', shut);
  const t = $('#railtab');
  t.innerHTML = phone ? (shut ? `${icon('plus')}<span>Add</span>` : `${icon('close')}<span>Close library</span>`)
    : shut ? `${icon('chevr')}<span>Library</span>` : `${icon('chevl')}<span>Hide library</span>`;
  t.title = shut ? 'Show the library' : 'Hide the library';
  t.setAttribute('aria-expanded', String(!shut));
}
phoneQuery.addEventListener('change', () => { ui.libOpen = false; if (ui.tab === 'room') renderRoom(); });
// Products tree, like Mozaik's: top groups, then folders inside each. Shapes live here too.
const LIB_GROUPS = [['base', 'Base Cabinets'], ['wall', 'Wall Cabinets'], ['tall', 'Tall Cabinets'], ['counter', 'Countertop Cabinets'], ['hood', 'Hoods'], ['shelf', 'Floating Shelves'], ['mantel', 'Fireplace Mantels'], ['special', 'Specialty']];
function libGroup(l) {
  if (l.group) return l.group;
  if (l.cat === 'Wall') return /hood/i.test(l.name) ? 'hood' : 'wall';
  return l.cat === 'Tall' ? 'tall' : 'base';
}
function libFolder(l) {
  if (l.folder) return l.folder;
  const n = l.name || '';
  if (/sink/i.test(n)) return 'Sink Bases';
  if (/corner|lazy|blind/i.test(n)) return 'Corner';
  if (/oven|micro|fridge|refrig|dishw|appliance/i.test(n)) return 'Appliance';
  if (/pantry|broom|utility/i.test(n)) return 'Pantries';
  if (l.cat === 'Base' && /drawer/i.test(n) && !/door/i.test(n)) return 'Base Drawers';
  return 'Standard';
}
const shapeGroup = l => l.group || (/shelf/i.test(l.name) ? 'shelf' : 'special');
const shapeFolder = l => l.folder || (l.plane === 'flat' ? 'Tops' : 'Panels');
function loadFavs() { try { return JSON.parse(localStorage.getItem(KEY + '.favs') || '[]'); } catch (_) { return []; } }
function shapeButton(l) {
  const b = shapeBox(l.pts), o = shapeLocal(l).out, k = Math.max(b.w, b.h), on = ui.placing === 'shape:' + l.id, m = mat(l.mat);
  return `<button class="srcitem libbtn${on ? ' on' : ''}" data-act="shape-pick" data-id="${l.id}" title="${esc(l.name)}"><svg class="shpico" viewBox="${-k * 0.08} ${-k * 0.08} ${k * 1.16} ${k * 1.16}" aria-hidden="true"><polygon style="fill:${esc((m && m.color) || '#d6b07c')}" points="${o.map(p => `${r3(p.x)},${r3(l.plane === 'flat' ? p.y : b.h - p.y)}`).join(' ')}"/></svg><span><span class="nm">${esc(l.name)}</span><span class="ab">${esc(l.name)}</span><span class="dm">${fmtLen(b.w)} × ${fmtLen(b.h)} · ${l.plane === 'flat' ? 'flat' : 'upright'}</span></span></button>`;
}
// The Products tree from the main screen design: a search box, then category heads that open to folders and products.
// Search keeps matching products with their categories opened, and everything under a matching category or folder.
function productTree() {
  const favs = ui.favs || (ui.favs = loadFavs()), q = (ui.libFind || '').trim().toLowerCase(), fold = ui.libFold || (ui.libFold = {});
  const all = S.library.filter(l => l.cat !== 'Shape').map(l => ({ key: l.id, g: libGroup(l), f: libFolder(l), name: l.name, html: libButton(l, 'lib-pick', ui.placing === l.id) }))
    .concat((S.shapeLib || []).map(l => ({ key: 'shape:' + l.id, g: shapeGroup(l), f: shapeFolder(l), name: l.name, html: shapeButton(l) })))
    .concat(fixtTreeItems());
  const wrap = x => `<div class="lw">${x.html}<button class="favbtn${favs.includes(x.key) ? ' on' : ''}" data-act="lib-fav" data-id="${esc(x.key)}" title="${favs.includes(x.key) ? 'Remove from Favorites' : 'Add to Favorites'}" aria-label="Favorite ${esc(x.name)}">★</button></div>`;
  const groups = [...LIB_GROUPS, FIXT_GROUP], gname = g => (groups.find(([k]) => k === g) || [])[1] || '';
  const hit = x => !q || x.name.toLowerCase().includes(q) || gname(x.g).toLowerCase().includes(q) || x.f.toLowerCase().includes(q);
  const list = all.filter(hit);
  const head = (k, label, n, shut, cls) => `<button class="${cls}" data-act="lib-fold" data-id="${esc(k)}" aria-expanded="${!shut}"><span class="arr" aria-hidden="true">${shut ? '▸' : '▾'}</span><span>${label}</span>${n ? `<span class="ct">${n}</span>` : ''}</button>`;
  const fav = list.filter(x => favs.includes(x.key)), favShut = !q && fold.fav;
  const favGrp = fav.length ? `<div class="lgrp lg-fav">${head('fav', '★ Favorites', fav.length, favShut, 'lgrp-h')}${favShut ? '' : `<div class="grp">${fav.map(wrap).join('')}</div>`}</div>` : '';
  const body = groups.map(([g, gl]) => {
    const items = list.filter(x => x.g === g); if (q && !items.length) return '';
    const shut = !q && fold[g], folders = [...new Set(items.map(x => x.f))];
    const inner = !items.length ? '<div class="note show">Nothing here yet.</div>' : folders.length === 1 ? `<div class="grp">${items.map(wrap).join('')}</div>`
      : folders.map(f => { const fk = g + '/' + f, fs = !q && fold[fk], fi = items.filter(x => x.f === f); return `<div class="lfold">${head(fk, esc(f), fi.length, fs, 'lfold-h')}${fs ? '' : `<div class="grp">${fi.map(wrap).join('')}</div>`}</div>`; }).join('');
    return `<div class="lgrp lg-${g}">${head(g, gl, items.length, shut, 'lgrp-h')}${shut ? '' : inner}</div>`;
  }).join('');
  return `<div class="libpeek" id="libpeek">${libPeekHTML(ui.libPeek || ui.placing)}</div>`
    + `<input id="libfind" type="search" placeholder="Search…" value="${esc(ui.libFind || '')}" aria-label="Search products">`
    + `<div class="ptree">${favGrp}${body || '<div class="note show">No products match.</div>'}</div>`
    + `<div class="row-actions libnew"><button class="btn sm" data-act="designer-new">${icon('plus')}New cabinet</button><button class="btn sm" data-act="shape-new">${icon('plus')}New shape</button></div>`;
}
// Picture of the product under the mouse (or the one being placed) above the tree, like Mozaik's preview.
// With nothing to show it says how to start: drag a product onto the drawing.
function libPeekHTML(id) {
  const l = id && typeof id === 'string' && !id.includes(':') && libItem(id);
  if (!l || l.cat === 'Shape') return `<div class="lp-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1"/><path d="M14 7h7m-3-3 3 3-3 3M7 14v7m-3-3 3 3 3-3"/></svg><span>Drag a product onto the drawing</span></div>`;
  let pic = '';
  const late = url => { const img = document.querySelector('#libpeek img[data-peek="' + l.id + '"]'); if (img) img.src = url; };
  const url = typeof libPeek3D === 'function' ? libPeek3D(l, late) : null;
  if (url) pic = `<img src="${url}" data-peek="${esc(l.id)}" alt="">`;
  else try { const c = newCab(S, l, null, 1, 0); c.id = '_peek'; pic = frontPreviewSVG(c, 150); } catch (_) { pic = miniFront(l); }
  return `<div class="lp-pic">${pic}</div><div class="lp-name">${esc(l.name)}</div><div class="lp-dim">${fmtLen(l.w)} × ${fmtLen(l.h)} × ${fmtLen(l.d)}</div>`;
}
document.addEventListener('mouseover', e => {
  const b = e.target.closest && e.target.closest('.ptree .libitem[data-id]'); if (!b) return;
  const el = document.getElementById('libpeek'); if (!el || ui.libPeek === b.dataset.id) return;
  ui.libPeek = b.dataset.id; el.innerHTML = libPeekHTML(ui.libPeek);
});
function renderSources() {
  renderRail();
  const SRC_IC = { cabinets: 'box', faces: 'face', doors: 'door', materials: 'palette', hardware: 'sliders', moldings: 'stack' };
  $('#srctabs').innerHTML = SOURCES.map(([k, l]) => `<button data-act="src" data-id="${k}" aria-pressed="${ui.src === k}" title="${l}">${icon(SRC_IC[k])}<span>${l}</span></button>`).join('');
  const item = (drag, inner, title) => `<button class="srcitem" data-act="src-apply" data-drag="${drag}" title="${esc(title || '')}">${inner}</button>`;
  let h = '';
  if (ui.src === 'shapes') ui.src = 'cabinets';
  if (ui.src === 'cabinets') h = productTree();
  else if (ui.src === 'faces') h = `<div class="faces col">${FACE_PRESETS.map(fp => item('face:' + fp.id, `${faceIcon(fp.rows)}<span>${esc(fp.name)}</span>`, 'Drag onto a cabinet, or click to apply to the selected one')).join('')}</div>`;
  else if (ui.src === 'doors') h = S.doorTemplates.map(d => { const ds = doorStyle(d.door); return item('doorT:' + d.id, `${swatch(mat(ds.mat), 26)}<span><span class="nm">${esc(d.name)}</span><span class="dm">${esc(ds.name)}</span></span>`); }).join('') + `<button class="btn sm" data-act="tab" data-id="doors">Edit door templates</button>`;
  else if (ui.src === 'materials') h = `<div class="eyebrow">Cabinet materials</div>${S.matTemplates.cabinet.map(t => item('cabMatT:' + t.id, `${swatch(mat(t.carcass), 26)}<span><span class="nm">${esc(t.name)}</span></span>`)).join('')}<div class="eyebrow">Drawer materials</div>${S.matTemplates.drawer.map(t => item('drawerMatT:' + t.id, `${swatch(mat(t.sides), 26)}<span><span class="nm">${esc(t.name)}</span></span>`)).join('')}<button class="btn sm" data-act="tab" data-id="materials">Edit materials</button>`;
  else if (ui.src === 'hardware') h = HW_KINDS.filter(([k]) => ['slide', 'hinge', 'pull'].includes(k)).map(([k, l]) => `<div class="eyebrow">${l}</div>${hwOf(k).map(x => item('hw:' + x.id, `<span class="hwdot ${k}"${k === 'pull' ? ` style="background:${esc(x.finish)}"` : ''}></span><span><span class="nm">${esc(x.name)}</span></span>`)).join('')}`).join('') + `<button class="btn sm" data-act="tab" data-id="hardware">Edit hardware</button>`;
  else if (ui.src === 'moldings') h = S.moldings.map(m => item('mold:' + m.id, `${swatch(mat(m.mat), 26)}<span><span class="nm">${esc(m.name)}</span><span class="dm">${fmtLen(m.h)} × ${fmtLen(m.d)}</span></span>`)).join('') + item('mold:', '<span class="sw none"></span><span><span class="nm">No molding</span></span>') + `<button class="btn sm" data-act="tab" data-id="moldings">Quick molding</button>`;
  $('#srclist').innerHTML = `<div class="note">${ui.src === 'cabinets' ? (isPhone() ? 'Tap one, then tap near a wall.' : 'Drag onto a wall, or click and then click a wall.') : 'Drag onto a cabinet in any view, or click to apply to the selected cabinet.'}</div>` + h;
}
// Room viewer: the same live 3D view on the whole screen with a list of views down the side, like Mozaik's.
// Clicking and double-clicking cabinets still works in it.
// The 3D Layers menu: what to show, how see-through the walls are, and the cutaway.
function renderLayers3d() {
  const el = $('#layerpop'); if (!el) return;
  const L = layers3d(), pct = Math.round((ui.wallOp ?? 1) * 100), off = LAYERS3D.filter(([k]) => !L[k]).length;
  $('#layers3d summary').innerHTML = `${icon('stack')}Layers${off ? ` <span class="ct">${off} off</span>` : ''}`;
  el.innerHTML = `<div class="eyebrow">Show</div>${LAYERS3D.map(([k, l]) => `<label class="chk"><input type="checkbox" data-layer="${k}"${L[k] ? ' checked' : ''}>${l}</label>`).join('')}
    <div class="eyebrow">Walls</div><label class="wallop">Opacity <input type="range" id="wallop" min="0" max="100" step="5" value="${pct}" aria-label="Wall opacity"><b id="wallopv">${pct}%</b></label>
    <label class="chk"><input type="checkbox" data-layer="_cutaway"${ui.cutaway ? ' checked' : ''}>Cut away walls in front of the camera</label>
    <div class="row-actions"><button class="btn sm" data-act="layers-all">Show everything</button><button class="btn sm" data-act="layers-faces">Faces only</button><button class="btn sm" data-act="layers-inside">Inside only</button></div>`;
}
function saveLayers3d() { try { localStorage.setItem(KEY + '.layers', JSON.stringify({ layers: ui.layers, wallOp: ui.wallOp, cutaway: ui.cutaway })); } catch (_) {} if (roomViewer) buildRoom3D(); renderLayers3d(); }
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.layer; if (!k) return;
  if (k === '_cutaway') ui.cutaway = e.target.checked; else ui.layers = { ...ui.layers, [k]: e.target.checked };
  saveLayers3d();
  if (k === 'glass') render();
});
document.addEventListener('input', e => {
  if (e.target.id !== 'wallop') return;
  ui.wallOp = +e.target.value / 100; $('#wallopv').textContent = e.target.value + '%';
  if (!saveLayers3d.q) saveLayers3d.q = requestAnimationFrame(() => { saveLayers3d.q = 0; if (roomViewer) buildRoom3D(); });
});
document.addEventListener('change', e => { if (e.target.id === 'wallop') saveLayers3d(); });
function renderFull3d() {
  const on = !!ui.full3d && ui.viewMode === '3d', side = $('#fullside'), b = $('#full3d');
  $('#tab-room').classList.toggle('full3d', on); document.body.classList.toggle('full3d-on', on);
  b.innerHTML = on ? `${icon('close')}Exit full screen` : `${icon('expand')}Full screen`; b.setAttribute('aria-pressed', String(on));
  side.hidden = !on; if (!on) { side.innerHTML = ''; return; }
  const vs = curRoom().views || [], c = ui.sel && ui.sel.type === 'cab' && cab(ui.sel.id);
  const it = (id, label, on) => `<button class="fv${on ? ' on' : ''}" data-act="fv" data-id="${esc(id)}">${label}</button>`;
  side.innerHTML = `<div class="fullhead"><h2 class="ph2">${icon('cube')}${esc(curRoom().name)}</h2></div>
    <div class="eyebrow">Views</div>${it('persp', 'Perspective')}${it('iso', 'Isometric')}${it('top', 'Top down')}${it('fit', 'Whole room')}
    ${S.walls.length ? `<div class="eyebrow">Walls</div>${S.walls.map(w => it('wall:' + w.id, `Facing ${wallName(w)}`)).join('')}` : ''}
    <div class="eyebrow">Saved views</div>${vs.map(v => it('saved:' + v.id, esc(v.name), v.id === ui.view3d)).join('') || '<div class="note show">None yet. Use Save view at the top.</div>'}
    ${c ? `<div class="eyebrow">Selected</div><div class="fvsel">${esc(c.name)} ${esc(LBL[c.id] || '')}</div>${it('sel', 'Zoom to it')}<button class="fv" data-act="ed-open" data-id="${c.id}">Cabinet editor</button>` : ''}
    <div class="fullfoot"><button class="btn primary" data-act="full3d">${icon('close')}Exit full screen</button></div>`;
}
function fullView(id) {
  ensureRoomViewer(); const v = roomViewer;
  if (id.startsWith('wall:')) { ui.elevWall = id.slice(5); view3dPreset(v, 'front'); }
  else if (id.startsWith('saved:')) { const vw = (curRoom().views || []).find(x => x.id === id.slice(6)); if (vw) { ui.view3d = vw.id; v.setView(vw); renderViews3d(); } }
  else view3dPreset(v, id);
  renderFull3d();
}
function toggleFull3d(on = !ui.full3d) {
  ui.full3d = on; if (on && ui.viewMode !== '3d') { setView('3d'); return; }
  renderRoom(); requestAnimationFrame(() => { if (roomViewer) { roomViewer.resize(); roomViewer.requestRender(); } });
}
function renderRoom() {
  clearDoorLimits();
  if (ui.tab !== 'room') return;
  LBL = labels();
  renderSources();
  // View bar pills, from the main screen design: views, Draw, dimensions, open all.
  $('#viewmode').innerHTML = [['plan', 'Plan view (1)', 'Plan'], ['elev', 'Elevation view (2)', 'Elevation'], ['3d', '3D view (3)', '3D']].map(([k, l, ic]) => `<button data-act="viewmode" data-id="${k}" aria-pressed="${ui.viewMode === k}" title="${l}" aria-label="${l}">${vic(ic)}</button>`).join('');
  $('#dimctl').innerHTML = `<span class="seglbl" title="Dimensions">${vic('Dimensions')}</span>` + [['cab', 'Cabinet', 'Show cabinet sizes'], ['fronts', 'Door', 'Show door and drawer front sizes']].map(([k, l, t]) => `<button data-act="dims" data-id="${k}" aria-pressed="${!!ui.dims[k]}" title="${t}">${l}</button>`).join('') + (typeof vChainBtn === 'function' ? vChainBtn() : '');
  const anyOpen = S.cabinets.some(c => ui.open[c.id]), dm = ui.drawMold;
  const drawBtn = (act, on, ic, l, t) => `<button data-act="${act}" aria-pressed="${on}" title="${t}" class="drawbtn">${on ? icon('check') : vic(ic)}<span>${on ? 'Done' : l}</span></button>`;
  $('#drawctl').innerHTML = `<span class="seglbl">Draw</span>${drawBtn('walls-draw', !!ui.drawWalls, 'Walls', 'Walls', 'Draw walls (W). Right-click or Esc stops.')}${drawBtn(dm === true ? 'gmold-stop' : 'gmold-draw', dm === true, 'Molding', 'Molding', 'Draw molding runs along the walls. Right-click or Esc stops.')}${drawBtn(dm === 'top' ? 'gmold-stop' : 'gtop-draw', dm === 'top', 'Tops', 'Tops', 'Draw countertops along the walls. Right-click or Esc stops.')}`;
  const oc = ui.sel && ui.sel.type === 'cab' && cab(ui.sel.id), ocOn = oc && openable(oc);
  $('#openctl').innerHTML = `<button data-act="open-all" aria-pressed="${anyOpen}" title="Open or close every door and drawer in this room">${vic('Open all')}<span>${anyOpen ? 'Close All' : 'Open All'}</span></button>`
    + `<button data-act="open-toggle" data-id="${ocOn ? oc.id : ''}" aria-pressed="${!!(ocOn && ui.open[oc.id])}"${ocOn ? '' : ' disabled'} title="${ocOn ? 'Open or close the doors and drawers of the selected cabinet (O)' : 'Select a cabinet with doors or drawers to open it'}">${vic('Open all')}<span>${ocOn && ui.open[oc.id] ? 'Close Cabinet' : 'Open Cabinet'}</span></button>`;
  // Every cabinet and shape in the room by name and number, grouped by wall, to select without clicking it.
  const cur = ui.sel && (ui.sel.type === 'cab' ? ui.sel.id : ui.sel.type === 'shape' ? 'shape:' + ui.sel.id : '');
  const byWall = w => [...S.cabinets.filter(c => c.wall === w.id).sort((a, b) => a.off - b.off).map(c => [c.id, `${c.name} ${LBL[c.id]}`]), ...(S.shapes || []).filter(x => x.wall === w.id).map(x => ['shape:' + x.id, x.name || 'Shape'])];
  $('#itemsel').innerHTML = `<option value="">Select item…</option>` + S.walls.map(w => { const it = byWall(w); return it.length ? `<optgroup label="${wallName(w)}">${it.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>` : ''; }).join('');
  $('#views').dataset.mode = ui.viewMode;
  $('#v3sel').disabled = !(ui.sel && ui.sel.type === 'cab');
  const wi = S.walls.findIndex(w => w.id === ui.elevWall), nb = d => S.walls.length > 1 && wi >= 0 ? S.walls[((wi + d) % S.walls.length + S.walls.length) % S.walls.length] : null;
  [[-1, '#elevprev'], [1, '#elevnext']].forEach(([d, sel]) => { const b = $(sel), w = nb(d); b.hidden = !w; if (w) { b.title = (d < 0 ? 'Previous: ' : 'Next: ') + wallName(w); b.querySelector('span').textContent = wallName(w); } });
  renderLayers3d();
  renderViews3d();
  $('#render3d').innerHTML = `${icon('sun')}Realistic`; $('#render3d').setAttribute('aria-pressed', String(!!ui.render3d));
  $('[data-act=snap3d]').innerHTML = `${icon('camera')}Save image`;
  renderFull3d();
  const sel = $('#elevwall');
  sel.innerHTML = S.walls.map(w => `<option value="${w.id}"${w.id === ui.elevWall ? ' selected' : ''}>${wallName(w)} · ${fmtLen(wg(w).L, 1)}</option>`).join('') || '<option>No walls yet</option>';
  if (ui.viewMode === 'plan') renderPlan();
  if (ui.viewMode === 'elev') renderElev();
  renderProps(); renderDock(); renderQuick();
  if (ui.viewMode === '3d') { ensureRoomViewer(); buildRoom3D(); }
  if (ui.viewMode !== 'plan') renderHint();
}
function ensureRoomViewer() {
  if (roomViewer) return;
  roomViewer = new Viewer3D($('#room3d'), id => { if (id) select({ type: shapeById(id) ? 'shape' : fixtById(id) ? 'fixt' : 'cab', id }); else if (ui.sel) select(null); });
  roomViewer.onDouble = id => shapeById(id) ? editShape(id) : fixtById(id) ? null : openQuick(id);
  viewers.push(roomViewer);
}

// Saves the 3D view as a PNG: to Files › Cabinet Designer in the hub, or as a download outside it.
function saveRoomImage() {
  ensureRoomViewer();
  const url = roomImage(); if (!url) return flash('3D is not available in this browser');
  const bin = atob(url.split(',')[1]), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'image/png' }), clean = t => String(t || '').replace(/[^\w -]/g, '').trim();
  const name = `${clean(S.job.name) || 'job'} ${clean((curRoom() || {}).name) || 'room'} render.png`;
  if (inHub()) return Hub.files.upload(new File([blob], name, { type: 'image/png' }), 'Cabinet Designer').then(() => flash('Picture saved to Files › Cabinet Designer'), e => flash('Could not save: ' + e.message));
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000); flash('Picture downloaded');
}

/* ---------- Inspector (right) and details dock (below the views) ---------- */
// The side panel, with a small switch at the bottom for its gray help text (same as Look and feel).
// It can fold to a thin strip so the plan gets the width. Walls and shapes open it, since their only editor is here.
const wideQuery = matchMedia('(max-width: 960px)');
const propsShut = () => !!ui.propsShut && !wideQuery.matches && !(ui.sel && (ui.sel.type === 'wall' || ui.sel.type === 'shape' || ui.sel.type === 'fixt'));
function renderProps() {
  const el = $('#props'), room = $('#tab-room'), shut = propsShut();
  if (room && room.classList.contains('props-shut') !== shut) { room.classList.toggle('props-shut', shut); requestAnimationFrame(redrawView); }
  if (shut) { el.innerHTML = `<button class="railtab pstrip" data-act="props-toggle" title="Show the side panel" aria-expanded="false">${icon('chevl')}<span>${ui.sel && ui.sel.type === 'cab' ? 'Cabinet' : 'Room'} details</span></button>`; return; }
  renderPropsBody();
  if (!el || !el.innerHTML) return;
  const hid = look.help !== 'show';
  el.insertAdjacentHTML('beforeend', `<div class="notesw"><button class="linkbtn" data-act="look" data-id="help:${hid ? 'show' : 'hide'}">${icon('eye')}${hid ? 'Show help text' : 'Hide help text'}</button>${wideQuery.matches ? '' : `<button class="linkbtn" data-act="props-toggle" title="Fold this panel to give the drawing more room">${icon('chevr')}Hide panel</button>`}</div>`);
}
// Auto build countertops and molding, right on the Room screen next to the plan.
function roomTopsMoldBoxes(rm) {
  const runs = countertopRuns().filter(r => !r.generic), on = runs.filter(r => r.on).length, auto = rm.autoTops !== false, mr = moldingRuns().length;
  const tset = (rm.settings || {}).countertop || '';
  return `<div class="psec box">${secHead('stack', 'Countertops', 'amber')}
    ${fld('Style', 'rset:' + rm.id, 'countertop', tset, 'select', { options: [{ v: '', l: 'Job: ' + countertop(S.job.defaults.countertop).name }, ...opts(S.countertops)] })}
    <div class="row-actions">${auto ? `<button class="btn" data-act="tops-auto">Rebuild</button><button class="btn" data-act="tops-auto-off">Turn off</button>` : `<button class="btn primary" data-act="tops-auto">${icon('check')}Auto build countertops</button>`}<button class="btn" data-act="dock" data-id="tops">${icon('list')}Runs</button></div>
    <div class="note qm-note" style="display:block">${auto ? `${on} run${on === 1 ? '' : 's'} built${(S.genTops || []).length ? ', plus ' + S.genTops.length + ' placed by hand' : ''}.` : 'Automatic tops are off in this room.'}</div></div>
  <div class="psec box">${secHead('stack', 'Molding', 'violet')}<div class="note">${mr} molding run${mr === 1 ? '' : 's'}${(S.genMolds || []).length ? `, plus ${S.genMolds.length} drawn by hand` : ''}.</div><div class="row-actions"><button class="btn" data-act="gmold-draw">${icon('ruler')}Draw molding</button><button class="btn" data-act="dock" data-id="molding">${icon('list')}Runs</button></div></div>`;
}
function renderPropsBody() {
  const el = $('#props');
  if (multiIds().length > 1) { el.innerHTML = multiProps(); return; }
  if (ui.sel && ui.sel.type === 'cab') { const c = cab(ui.sel.id); if (c) { el.innerHTML = cabProps(c); return; } }
  if (ui.sel && ui.sel.type === 'wall') { const w = wall(ui.sel.id); if (w) { el.innerHTML = wallProps(w); return; } }
  if (ui.sel && ui.sel.type === 'shape') { const s = shapeById(ui.sel.id); if (s) { el.innerHTML = shapeProps(s); return; } }
  if (ui.sel && ui.sel.type === 'fixt') { const f = fixtById(ui.sel.id); if (f) { el.innerHTML = fixtProps(f); return; } }
  const j = S.job, rm = curRoom(), n = {}; S.cabinets.forEach(c => n[c.cat] = (n[c.cat] || 0) + 1);
  el.innerHTML = `<div class="psec"><div class="pshead"><h2 class="ph2">${icon('home')}${esc(rm.name)}</h2><button class="btn" data-act="tab" data-id="job">All rooms</button></div>
    <div class="stats3"><div class="t-wall"><b>${S.walls.length}</b><span>walls</span></div><div class="t-base"><b>${n.Base || 0}</b><span>base</span></div><div class="t-upper"><b>${n.Wall || 0}</b><span>wall</span></div><div class="t-tall"><b>${n.Tall || 0}</b><span>tall</span></div></div>
    ${saveNote ? `<div class="warnbox">${esc(saveNote)}</div>` : ''}</div>
  <div class="psec">${fld('Room name', 'room:' + rm.id, 'name', rm.name, 'text')}
    <div class="note">Click a cabinet or a wall to edit it. Room settings are on the Settings tab, under Job dashboard.</div><button class="btn" data-act="set-dash">${icon('home')}Job dashboard</button>
    ${S.job.labelStyle !== 'type' ? `<div class="note">Cabinets here are numbered #${rm.block || ''}01 and up. They keep their numbers as you edit; renumber to put them back in wall order.</div><button class="btn" data-act="renumber">${icon('list')}Renumber cabinets</button>` : ''}</div>
  ${roomTopsMoldBoxes(rm)}${typeof dynBox === 'function' ? dynBox(rm) : ''}
  <div class="psec how">${secHead('hint', 'How to', 'blue')}
    <p><b>Walls:</b> press <kbd>W</kbd> or Draw walls, click each corner, click the first corner to close the room.</p>
    <p><b>Cabinets:</b> drag one from the left onto a wall, or click it in the list and click a wall.</p>
    <p><b>Keys:</b> <kbd>O</kbd> open or close, <kbd>Del</kbd> remove, <kbd>Ctrl Z</kbd> undo, <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> plan, elevation, 3D. Lengths take 30 1/2, 30.5 or 775mm.</p></div>`;
}
function wallProps(w) {
  const g = wg(w), cs = S.cabinets.filter(c => c.wall === w.id);
  return `<div class="psec"><div class="pshead"><h2 class="ph2">${icon('wall')}${wallName(w)}</h2><button class="btn danger" data-act="wall-del" data-id="${w.id}">${icon('trash')}Delete wall</button></div>
    <div class="note">${nCab(cs.length)} on this wall${cs.length ? '. Deleting the wall removes them.' : ''}</div></div>
  ${ptabs('wall', [['size', 'Wall settings', 'ruler']])}
  <div class="psec box">${secHead('ruler', 'Size and angle', 'teal')}${fld('Length', 'wall:' + w.id, 'len', g.L, 'len')}${fld('Thickness', 'wall:' + w.id, 'thick', w.thick, 'len')}${fld('Ceiling height', 'wall:' + w.id, 'height', w.height, 'len')}
    ${fld('Angle (degrees)', 'wall:' + w.id, 'angle', wallAngle(w), 'num')}${angleDial(w)}
    <div class="note">A new length moves the far end, and a new angle turns the wall around the corner it shares with another wall. Walls joined at the end that moves follow it. 0° points right, 90° points up the plan.</div></div>
  <div class="psec box">${secHead('wall', 'End caps', 'slate')}<div class="note">A short return off this wall. Cabinets and countertops stop against it like a wall. Left and right are as you face the cabinets. Right-click the wall to put one anywhere along it.</div>${capRows(w)}</div>`;
}
// Wall direction in degrees, counterclockwise from pointing right on the plan (plan y grows downward).
const wallAngle = w => { const a = Math.atan2(-(w.y2 - w.y1), w.x2 - w.x1) * 180 / Math.PI; return Math.round(((a % 360) + 360) % 360 * 10) / 10; };
// Turns the wall to deg. It pivots on the end that meets other walls, so the room stays put and the free end swings.
function setWallAngle(w, deg) {
  const g = wg(w), r = deg * Math.PI / 180, ux = Math.cos(r), uy = -Math.sin(r);
  if (wallEndJoined(w, 'E') && !wallEndJoined(w, 'S')) moveWallEnd(w, 1, { x: w.x2 - ux * g.L - w.x1, y: w.y2 - uy * g.L - w.y1 });
  else moveWallEnd(w, 2, { x: w.x1 + ux * g.L - w.x2, y: w.y1 + uy * g.L - w.y2 });
}
// A small compass that shows the wall's direction, with quick buttons for the common angles.
function angleDial(w) {
  const a = wallAngle(w) * Math.PI / 180, x = 20 + Math.cos(a) * 15, y = 20 - Math.sin(a) * 15;
  return `<div class="angledial"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17"/><path d="M20 3v4M37 20h-4M20 37v-4M3 20h4"/><line x1="20" y1="20" x2="${x}" y2="${y}"/><circle class="tip" cx="${x}" cy="${y}" r="2.6"/></svg>
    <div class="anglebtns">${[0, 45, 90, 135, 180, 225, 270, 315].map(d => `<button class="btn sm${Math.abs(wallAngle(w) - d) < 0.05 ? ' on' : ''}" data-act="wall-angle" data-id="${w.id}:${d}">${d}°</button>`).join('')}</div></div>`;
}
// Small tab bar inside the right-hand panel, so only one group of inputs shows at a time.
function ptabs(kind, tabs) {
  if (!tabs.some(([k]) => k === ui.ptab[kind])) ui.ptab[kind] = tabs[0][0];
  return `<div class="ptabs" role="tablist">${tabs.map(([k, l, ic]) => `<button role="tab" data-act="ptab" data-id="${kind}:${k}" aria-selected="${ui.ptab[kind] === k}">${icon(ic)}<span>${l}</span></button>`).join('')}</div>`;
}
function capRows(w) {
  const es = elevSide(w), sides = [{ v: es, l: 'Toward the cabinets' }, { v: -es, l: 'Other side' }];
  const ends = es === 1 ? [['S', 'Left'], ['E', 'Right']] : [['E', 'Left'], ['S', 'Right']];
  return ends.map(([end, label]) => {
    const cp = { ...capDefaults(w), side: es, ...(w['cap' + end] || {}) }, R = 'wcap:' + w.id + ':' + end;
    if (wallEndJoined(w, end)) return `<div class="capbox"><b>${label} end</b> <span class="muted">joins another wall, so it can't have an end cap</span></div>`;
    return `<div class="capbox${cp.on ? ' on' : ''}"><label class="checkrow">${ctl(R, 'on', cp.on, 'bool', { label: label + ' end cap' })} <b>${label} end cap</b></label>
      ${cp.on ? `<div class="grid2">${fld('Length', R, 'len', cp.len, 'len')}${fld('Thickness', R, 'thick', cp.thick, 'len')}${fld('Height', R, 'height', cp.height, 'len')}</div>${fld('Sticks out', R, 'side', cp.side, 'selnum', { options: sides })}` : ''}</div>`;
  }).join('') + (w.caps || []).map((cp, i) => {
    const R = 'wcapx:' + w.id + ':' + cp.id, k = capsOf(w).find(x => x.id === cp.id);
    return `<div class="capbox on"><div class="capx"><b>Custom end cap ${i + 1}</b><button class="btn sm danger" data-act="capx-del" data-id="${w.id}:${cp.id}" aria-label="Remove custom end cap ${i + 1}">${icon('trash')}</button></div>
      <div class="grid2">${fld('From left', R, 'from', capFromLeft(w, k), 'len')}${fld('Length', R, 'len', cp.len, 'len')}${fld('Thickness', R, 'thick', k.t, 'len')}${fld('Height', R, 'height', k.height, 'len')}</div>${fld('Sticks out', R, 'side', cp.side, 'selnum', { options: sides })}</div>`;
  }).join('') + `<div class="row-actions"><button class="btn sm" data-act="capx-add" data-id="${w.id}:">${icon('plus')}Add custom end cap</button></div>`;
}
// Custom cap position as the distance from the left end of the wall, looking at the cabinet side.
const capFromLeft = (w, k) => elevSide(w) === 1 ? k.a0 : wg(w).L - k.a1;
// Adds a custom end cap; a is an along-wall position (the middle of the wall when left out).
function addCustomCap(wid, a) {
  const w = wall(wid); if (!w) return;
  const t = w.thick, L = wg(w).L, at = isFinite(a) ? a - t / 2 : L / 2 - t / 2;
  mutate(() => { (w.caps = w.caps || []).push({ id: uid('cap'), a: r3(Math.max(0, Math.min(L - t, at))), len: CAP_LEN, thick: t, height: w.height, side: elevSide(w) }); settleWall(w); });
  select({ type: 'wall', id: wid }); flash('End cap added. Set its exact spot in the wall details.');
}
// After a cap moves, slide any cabinet it now overlaps to the nearest free spot.
function settleWall(w) { S.cabinets.filter(c => c.wall === w.id).forEach(c => settle(c)); }
const PANEL_MODES = [{ v: '', l: 'Automatic' }, { v: 'on', l: 'Always' }, { v: 'off', l: 'Never' }];
const FILL_MODES = [{ v: '', l: 'Automatic' }, { v: 'on', l: 'Fill any gap' }, { v: 'off', l: 'Never' }];
function endsNote(c) {
  const fl = fillersOf(c), say = end => { const f = fl.find(x => x.end === end); return f ? `filler ${fmtLen(f.gap)}` : hasPanel(c, end) ? 'end panel' : 'nothing'; };
  return `Left end: ${say('L')}. Right end: ${say('R')}.`;
}
// What sits at each end of a cabinet, with one row of buttons to change it: Auto, Filler, Panel or None.
const END_CHOICES = [['auto', 'Auto', '', ''], ['filler', 'Filler', 'on', 'off'], ['panel', 'Panel', 'off', 'on'], ['none', 'None', 'off', 'off']];
function endChoice(c, end) { const f = c['fill' + end] || '', pm = c['panel' + end] || ''; const m = END_CHOICES.find(x => x[2] === f && x[3] === pm); return m ? m[0] : ''; }
function endRows(c) {
  const fl = fillersOf(c);
  return ['L', 'R'].map(end => {
    const f = fl.find(x => x.end === end), now = f ? `Filler ${fmtLen(f.gap)}` : hasPanel(c, end) ? 'End panel' : 'Nothing', pick = endChoice(c, end);
    return `<div class="endrow"><div class="endhead"><b>${end === 'L' ? 'Left' : 'Right'} end</b><span class="note">${now}</span></div>
      <div class="seg" role="group" aria-label="${end === 'L' ? 'Left' : 'Right'} end">${END_CHOICES.map(([k, l]) => `<button data-act="cab-end" data-id="${c.id}:${end}:${k}" aria-pressed="${pick === k}">${l}</button>`).join('')}</div>
      ${f ? fld('Filler width', 'cabpos:' + c.id, end, r3(f.gap), 'len') : ''}</div>`;
  }).join('');
}
function cabProps(c) {
  const lib = libItem(c.libId), id = c.id, R = 'cab:' + id;
  const b = buildParts(c);
  return `<div class="psec"><div class="pshead"><div class="cabtitle"><span class="chip cab">${LBL[id]}</span> <b>${esc(c.name)}</b></div></div>
    <div class="note">${lib ? esc(lib.name) : 'Custom'} · ${wallName(wall(c.wall))}, ${fmtLen(c.off, 1)} from its start</div>
    ${b.warn.map(w => `<div class="warnbox">${esc(w)}</div>`).join('')}${conflicts(c) ? '<div class="warnbox">This cabinet runs into a wall or another cabinet. Drag it, or change its width, to clear it.</div>' : ''}
  </div>
  <div class="psec"><div class="note">Size, position, Edit, Open, Duplicate, Flip and Delete are in the panel under the drawing.</div></div>`;
}
/* ---------- Quick edit (double-click a cabinet) ---------- */
// Opens a room shape in the shape editor; Apply sends the edits back.
function editShape(id) {
  const s = shapeById(id); if (!s) return;
  ui.desMode = 'shape'; ui.shapeSel = null;
  mutate(() => { S.shapeDesign = { sourceLib: s.libId || null, editShape: s.id, name: s.name, plane: s.plane, pts: clone(s.pts), thick: s.thick, mat: s.mat }; });
  goTab('designer');
}
// Double-click opens the cabinet editor (it replaced the small quick edit popup).
function openQuick(id) { openEditor(id); }
function closeQuick() { ui.quick = null; ui.qeBig = false; renderQuick(); }
// The features people change most, on one screen next to a live front view. Every field saves as soon as it changes.
/* ---------- Quick edit: openings and interior ---------- */
const QE_TYPES = [['door', 'Door'], ['drawer', 'Drawer'], ['false', 'False front'], ['open', 'Open']];
// The front view with every opening clickable; the opening being edited is outlined.
function qeFaceSVG(c, qr, maxH = 340, inside = false) {
  const svg = frontPreviewSVG(c, maxH, Math.max(c.w, c.h) / 22, ui.open[c.id], inside), fr = computeFronts(c);
  const hits = fr.map(f => { const [a, b] = frontEX(f); return b - a < 0.25 ? '' : `<rect class="qe-hit${f.row === qr ? ' on' : ''}" data-act="qe-row" data-id="${f.row}" x="${a}" y="${-f.z1}" width="${b - a}" height="${f.z1 - f.z0}"><title>Opening ${f.row + 1}</title></rect>`; }).join('');
  return svg.replace(/<\/svg>$/, hits + '</svg>');
}
// Shelves an opening gets: its own count, or its share of the cabinet's shelf count.
function qeRowShelves(c, i) {
  const row = (c.rows || [])[i]; if (!row) return 0;
  if (row.shelves !== undefined && row.shelves !== '') return row.shelves | 0;
  const p = effParams(c), zs = interiorLayout(c, p, computeFronts(c, p)).shelfZones || [], n = Math.max(0, p.shelfCount | 0), k = zs.findIndex(z => z.row === i);
  return k < 0 ? 0 : Math.floor(n / zs.length) + (k < n % zs.length ? 1 : 0);
}
// Before one opening's shelves change, every opening keeps what it has now.
function qeFreezeShelves(c) {
  if ((c.rows || []).some(r => r.shelves !== undefined && r.shelves !== '')) return;
  const v = c.rows.map((r, i) => qeRowShelves(c, i)); c.rows.forEach((r, i) => { r.shelves = v[i]; });
}
// One opening (a row of the face). Splitting, joining and moving it are the tools above the drawing.
// part 'face' shows what the front is; 'inside' shows its shelves and fittings; anything else shows both.
function qeOpening(c, i, part) {
  const rows = c.rows || [], row = rows[i]; if (!row) return '';
  const R = 'sub:rows|cab:' + c.id, fr = computeFronts(c), f = fr.find(x => x.row === i), n = Math.max(1, row.count | 0);
  const kind = row.type === 'drawer' ? 'drawer' : row.type === 'false' ? 'falseFront' : 'door', dt = doorTpl(cabSet(c, 'doorT'));
  const styleOpts = [{ v: '', l: `Door template · ${(doorStyle(dt[kind]) || {}).name || ''}` }, ...S.doorStyles.map(d => ({ v: d.id, l: d.name }))];
  const seg = (k, list, cur) => `<div class="seg" role="group">${list.map(([v, l]) => `<button data-act="qe-rowset" data-id="${i}:${k}:${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
  const inside = row.type === 'door' || row.type === 'open', sh = qeRowShelves(c, i), own = rows.some(r => r.shelves !== undefined && r.shelves !== '');
  const ins = (c.inserts || []).map((it, k) => ({ it, k })).filter(({ it }) => it.row !== undefined && it.row !== '' && +it.row === i);
  const face = part !== 'inside', inner = part !== 'face' && inside;
  return `<div class="psec box qe-open">${secHead('face', `Opening ${i + 1} of ${rows.length}`, 'violet')}
    <div class="note">${f ? `${fmtLen(f.x1 - f.x0, 1)} wide × ${fmtLen(f.z1 - f.z0, 1)} high${n > 1 ? `, ${n} side by side` : ''}` : ''}${fr.overfull ? ' · The openings add up to more than the cabinet. Make one shorter or use * on one.' : ''}</div>
    ${face ? `${seg('type', QE_TYPES, row.type)}
    <div class="grid2">${fld('Height', R, i + '.h', row.h, 'rowh', { ph: '*' })}${row.type === 'open' ? '' : fld('Style', R, i + '.style', row.style || '', 'select', { options: styleOpts })}</div>
    ${row.type === 'door' && n === 1 ? `<div class="qe-hinge"><span>Hinge</span>${seg('hinge', [['', 'Default'], ['L', 'Left'], ['R', 'Right']], row.hinge || '')}</div>` : ''}` : ''}
    ${inner ? `<div class="stepper"><span>Shelves</span><button class="btn sm" data-act="qe-rowset" data-id="${i}:shelves:-1" aria-label="One less shelf"${sh ? '' : ' disabled'}>&minus;</button><b class="mono">${sh}</b><button class="btn sm" data-act="qe-rowset" data-id="${i}:shelves:1" aria-label="One more shelf">+</button>${own ? `<button class="linkbtn" data-act="qe-rowset" data-id="${i}:shelves:auto" title="Spread the cabinet's shelf count over its openings again">Auto</button>` : ''}</div>
      ${i < rows.length - 1 ? `<label class="checkrow"><input type="checkbox" data-act="q-fixrow" data-id="${c.id}:${i}"${row.fixShelf ? ' checked' : ''}> Fixed shelf under this opening</label>` : ''}
      ${ins.map(({ it, k }) => `<div class="qe-ins"><b>${esc(insertType(it.type).name)}</b>${insertType(it.type).fields.filter(fk => fk !== 'name' && fk !== 'x').map(fk => fld(fk === 'n' ? (it.type === 'traydiv' ? 'Dividers' : 'How many') : 'Box height', 'sub:inserts|cab:' + c.id, k + '.' + fk, it[fk], fk === 'n' ? 'int' : 'len')).join('')}<button class="btn sm" data-act="ins-del" data-ref="cab:${c.id}" data-i="${k}" aria-label="Remove">×</button></div>`).join('')}
      <div class="insadd"><select class="instype" aria-label="Insert to add">${INSERT_TYPES.filter(t => t.id !== 'divider').map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select><button class="btn sm" data-act="ins-add" data-ref="cab:${c.id}" data-row="${i}">${icon('plus')}Add</button></div>` : ''}
    ${part === 'inside' && !inside ? '<div class="note">Drawers and false fronts have nothing inside to set. Pick a door or open opening.</div>' : ''}
  </div>`;
}
// The whole-box fittings: a full height divider and a finished interior. Shelves are set opening by opening.
function qeInside(c) {
  const div = (c.inserts || []).map((it, k) => ({ it, k })).find(({ it }) => it.type === 'divider'), any = (c.inserts || []).length || c.finInt || qeRowsShelved(c);
  const tog = (on, l, act, title) => `<button class="btn sm${on ? ' primary' : ''}" ${act} aria-pressed="${!!on}" title="${title}">${icon(on ? 'check' : 'plus')}${l}</button>`;
  return `<div class="psec box qe-inside">${secHead('shelf', 'Whole cabinet', 'teal')}
    <div class="qe-addrow">${tog(div, 'Vertical divider', div ? `data-act="ins-del" data-ref="cab:${c.id}" data-i="${div.k}"` : `data-act="qe-divider" data-id="${c.id}"`, 'A full height divider down the middle')}${tog(c.finInt, 'Finished interior', `data-act="${c.finInt ? 'qe-finint-off' : 'qe-finint-on'}" data-id="${c.id}"`, 'For open shelving and glass doors')}
      ${any ? `<button class="btn sm danger" data-act="qe-clear-all" data-id="${c.id}">${icon('trash')}Empty the cabinet</button>` : ''}</div>
  </div>`;
}
const qeRowsShelved = c => (c.rows || []).some((r, i) => qeRowShelves(c, i));
// Every part this cabinet makes, as the cut list will have it.
function qeParts(c) {
  const ps = buildParts(c).parts, n = ps.reduce((a, p) => a + p.qty, 0);
  return `<div class="psec box">${secHead('list', `${n} parts`, 'teal')}<div class="tscroll"><table class="t qe-parts"><thead><tr><th>Part</th><th class="r">Qty</th><th class="r">Length</th><th class="r">Width</th><th>Material</th><th>Banding</th></tr></thead><tbody>
    ${ps.map(p => `<tr><td>${esc(p.name)}</td><td class="n">${p.qty}</td><td class="n">${fmtLen(p.L)}</td><td class="n">${fmtLen(p.W)}</td><td>${esc((mat(p.mat) || {}).name || '')}</td><td>${EDGE_KEYS.filter(k => p.band && p.band[k]).join(' ') || '<span class="muted">none</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
}
// Where the cabinet is and what it adds up to.
function qeInfo(c) {
  const w = wall(c.wall), fr = computeFronts(c), cnt = t => fr.filter(f => f.type === t).length, b = buildParts(c);
  const ps = typeof priceSheet === 'function' && priceSheet(), pr = ps ? priceCab(c, ps) : null;
  const sheets = {}; b.parts.forEach(p => { const m = mat(p.mat); if (m && m.kind === 'sheet') sheets[m.name] = (sheets[m.name] || 0) + p.L * p.W * p.qty / 144; });
  const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  return `<div class="psec box">${secHead('hint', 'Info', 'teal')}<table class="t qe-info"><tbody>
    ${row('Number', esc(LBL[c.id] || ''))}${row('Room', esc(curRoom().name))}${row('Wall', w ? `${wallName(w)}, ${fmtLen(c.off, 1)} from the left` : 'Not on a wall')}
    ${row('Type', esc(c.cat))}${row('Size', `${fmtLen(c.w, 1)} wide × ${fmtLen(c.h, 1)} high × ${fmtLen(c.d, 1)} deep, ${fmtLen(c.elev || 0, 1)} off the floor`)}
    ${row('Fronts', [[cnt('door'), 'door'], [cnt('drawer'), 'drawer front'], [cnt('false'), 'false front']].filter(([n]) => n).map(([n, l]) => `${n} ${l}${n > 1 ? 's' : ''}`).join(', ') || 'Open')}
    ${row('Grain match', { v: 'Vertical', h: 'Horizontal' }[c.grainMatch] || 'Off')}
    ${row('Parts', `${b.parts.reduce((a, p) => a + p.qty, 0)} parts`)}
    ${Object.entries(sheets).map(([n, sq]) => row(esc(n), `${sq.toFixed(1)} sq ft`)).join('')}
    ${pr ? row('Price', `${money(pr.total)} <span class="muted">before markup and tax, ${esc(ps.name)}</span>`) : ''}
  </tbody></table></div>`;
}
// The cabinet the face and interior tools act on: the editor's, or the Designer's when no editor is open.
const qeCab = () => ui.quick ? cab(ui.quick) : ui.tab === 'designer' && ui.desMode !== 'shape' ? cab('_designer') : null;
function renderQuick() {
  if (!ui.quick && ui.tab === 'designer') return renderDesigner();
  const el = $('#quickedit'), c = ui.quick && ui.tab === 'room' && qeCab();
  if (!c) { if (ui.quick && !qeCab()) ui.quick = null; el.hidden = true; el.innerHTML = ''; return; }
  ui.qeBig = true; return renderEditor(el, c);
}

// Tabs of the details dock: what each one shows depends on what is selected.
function dockTabs() {
  const c = ui.sel && ui.sel.type === 'cab' && cab(ui.sel.id);
  // The item bar (size and position of the selected item) comes first, then the cabinet's ends, then room-wide tops, molding, lights and layout.
  return [['item', 'Item', 'ruler'], ...(c && multiIds().length < 2 ? [['ends', 'Ends', 'ends']] : []), ['tops', 'Tops', 'stack'], ['molding', 'Molding', 'stack'], ['room', 'Room', 'home'], ['lights', 'Lights', 'sun'], ['layout', 'Layout', 'magnet']];
}
function renderDock() {
  const el = $('#dock'); if (!el) return;
  const tabs = dockTabs(), sc = ui.sel && ui.sel.type === 'cab' && multiIds().length < 2 ? ui.sel.id : null;
  // Picking a cabinet opens the panel on its Size tab; letting go of it puts the panel back as it was.
  if (sc !== ui.dockCab) {
    const was = ui.dockOpen;
    if (sc) { if (!ui.dockCab) ui.dockWas = ui.dockOpen; ui.dock = 'item'; ui.dockOpen = true; }
    else if (ui.dockCab && ui.dockWas !== undefined) { ui.dockOpen = ui.dockWas; ui.dockWas = undefined; }
    ui.dockCab = sc;
    if (was !== ui.dockOpen) requestAnimationFrame(() => { if (typeof redrawView === 'function') redrawView(); });
  }
  if (!tabs.some(([k]) => k === ui.dock)) ui.dock = tabs[0][0];
  const head = `<div class="dockhead"><div class="docktabs" role="tablist">${tabs.map(([k, l, ic]) => `<button role="tab" data-act="dock" data-id="${k}" aria-selected="${ui.dock === k}">${icon(ic)}${l}</button>`).join('')}</div>
    <button class="btn" data-act="dock-toggle" aria-expanded="${ui.dockOpen}">${icon(ui.dockOpen ? 'close' : 'eye')}${ui.dockOpen ? 'Hide' : 'Show'}</button></div>`;
  // On the desktop main screen the panel under the drawing is always open.
  const open = ui.dockOpen || deskUI();
  el.classList.toggle('shut', !open);
  el.innerHTML = head + (open ? `<div class="dockbody dock-${ui.dock}">${dockBody(ui.dock)}</div>` : '');
  if (typeof dockExtras === 'function') dockExtras(el);
}
function dockBody(k) {
  const rm = curRoom(), c = ui.sel && ui.sel.type === 'cab' && cab(ui.sel.id);
  if (k === 'tops') return `${typeof topOpRow === 'function' ? topOpRow() : ''}${autoTopsCard(countertopRuns(), opts(S.countertops))}${genTopsCard(opts(S.countertops))}<div class="row-actions"><button class="btn sm" data-act="tab" data-id="countertops">Countertop styles</button></div>`;
  if (k === 'lights') return lightsCard();
  if (k === 'molding') return `<div class="card cardbody">${autoMoldBox(moldingRuns())}</div>${genMoldsCard()}<div class="row-actions"><button class="btn sm" data-act="tab" data-id="moldings">Molding library and totals</button></div>`;
  if (k === 'room') return roomDockBody();
  if (k === 'item') return itemBar(multiIds().length < 2 ? c : null);
  if (k === 'layout') {
    const L = lay();
    // Automatic fillers and panels are switched on the Item tab.
    return `<div class="dockgrid">${LAYOUT_FIELDS.filter(f => !['autoFillers', 'autoPanels'].includes(f.k)).map(f => `<div class="dockfld">${f.type === 'bool'
      ? `<label class="checkrow">${ctl('layout', f.k, L[f.k], 'bool', { label: f.label })} <b>${f.label}</b></label>`
      : fld(f.label, 'layout', f.k, L[f.k], f.type, { options: f.options })}${f.note ? `<div class="note">${f.note}</div>` : ''}</div>`).join('')}</div>
      <div class="row-actions"><button class="btn sm" data-act="refit-fillers">Fit fillers to cabinets at walls now</button><span class="note">These apply to the whole job.</span></div>`;
  }
  if (!c) return '';
  const id = c.id, R = 'cab:' + id;
  if (k === 'ends') return `<div class="dock-ends">${endRows(c)}</div>`;
  if (k === 'cab-tpl') return `<div class="dockgrid">
    ${fld('Cabinet materials', R, 'cabMatT', c.cabMatT || '', 'select', { options: setOpts('cabMatT', opts(S.matTemplates.cabinet), 'cab') })}
    ${fld('Drawer materials', R, 'drawerMatT', c.drawerMatT || '', 'select', { options: setOpts('drawerMatT', opts(S.matTemplates.drawer), 'cab') })}
    ${fld('Door template', R, 'doorT', c.doorT || '', 'select', { options: setOpts('doorT', opts(S.doorTemplates), 'cab') })}
    ${fld('Pulls', R, 'pull', c.pull || '', 'select', { options: setOpts('pull', opts(hwOf('pull')), 'cab') })}
    ${fld('Drawer slide', R, 'slide', c.slide || '', 'select', { options: setOpts('slide', opts(hwOf('slide')), 'cab') })}
    ${fld('Hinge', R, 'hinge', c.hinge || '', 'select', { options: setOpts('hinge', opts(hwOf('hinge')), 'cab') })}
    ${fld('Part template', R, 'partT', c.partT || '', 'select', { options: setOpts('partT', opts(S.partTemplates), 'cab') })}
    ${fld('Applied panel fit', R, 'panelStyle', c.panelStyle || '', 'select', { options: setOpts('panelStyle', opts(S.panels), 'cab') })}
    ${fld('Top molding', R, 'molding', c.molding || '', 'select', { options: [{ v: '', l: 'None' }, ...opts(S.moldings)] })}
    <div class="checkrow"><label>${ctl('cabc:' + id, 'toeKick', hasToe(c), 'bool', { label: 'Raised base (feet or toe kick)' })} Feet / toe kick</label>${ctl('cabc:' + id, 'top', (c.construction || {}).top || 'full', 'select', { options: [{ v: 'full', l: 'Full top' }, { v: 'stretchers', l: 'Stretchers' }], label: 'Top' })}</div>
    </div>${SETTING_FIELDS.some(f => c[f]) ? `<div class="row-actions"><button class="btn sm" data-act="cab-follow" data-id="${id}">Use room settings for all of these</button></div>` : ''}`;
  if (k === 'cab-int') return interiorSection(R, c, 'cabp:' + id, c);
  if (k === 'cab-par') return `<div class="note">Changes here apply to this cabinet only.</div>${paramRows('cabp:' + id, effParams(c), c.params, c.libParams, c.cat, 'This cabinet', rm.params)}`;
  if (k === 'cab-cus') return `<div class="row-actions"><button class="btn sm" data-act="cust-add" data-ref="${R}">Add field</button><span class="note">Extra values that go out with the export.</span></div>${customRows(R, c.custom)}`;
  if (k === 'cab-out') {
    const b = buildParts(c), nParts = b.parts.reduce((a, p) => a + p.qty, 0);
    return `<div class="row-actions"><button class="btn sm primary" data-act="show-parts" data-id="${id}">Open parts</button><button class="btn sm" data-act="cab-to-lib" data-id="${id}">Save as library template</button><button class="btn sm" data-act="cab-to-designer" data-id="${id}">Open in Designer</button>
      <span class="note">${nParts} parts, ${b.parts.reduce((a, p) => a + p.ops.length * p.qty, 0)} machining operations</span></div>
      <table class="t bomt"><tbody>${Object.entries(b.bom).map(([n, q]) => `<tr><td>${esc(n)}</td><td class="n">${q}</td></tr>`).join('')}</tbody></table>`;
  }
  return '';
}

/* ---------- Placing and applying ---------- */
function placeCabinet(libId, g) {
  const l = libItem(libId); if (!l || !g) return;
  let nc; mutate(() => { nc = newCab(S, l, g.wall, g.side, g.off); if (g.w) nc.w = g.w; S.cabinets.push(nc); if (l.lights && l.lights.length) addCabStrips(nc.id, l.lights); });
  ui.sel = { type: 'cab', id: nc.id }; ui.elevWall = g.wall; renderRoom();
}
function applyPayload(cabId, kind, val) {
  const c = cab(cabId); if (!c) return false;
  mutate(() => {
    if (kind === 'face') { const fp = FACE_PRESETS.find(f => f.id === val); if (fp) c.rows = clone(fp.rows); }
    else if (kind === 'doorT') c.doorT = val;
    else if (kind === 'cabMatT') c.cabMatT = val;
    else if (kind === 'drawerMatT') c.drawerMatT = val;
    else if (kind === 'mold') c.molding = val || null;
    else if (kind === 'hw') { const h = hw(val); if (h && h.kind === 'slide') c.slide = val; else if (h && h.kind === 'hinge') c.hinge = val; else if (h && h.kind === 'pull') c.pull = val; }
  });
  return true;
}

/* ---------- Drag and drop ---------- */
let dnd = null, dndPending = null;
function dndTarget(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el) return {};
  if (el.closest('#plan')) { const p = toWorld(e); return { where: 'plan', p, cab: hitCabs(p)[0] }; }
  if (el.closest('#elev')) { const ev = el.closest('#elev [data-cab]'); return { where: 'elev', cab: ev ? ev.dataset.cab : null, ep: elevPoint(e) }; }
  if (el.closest('#room3d') && roomViewer && roomViewer.ok) return { where: '3d', p: roomViewer.floorPoint(e.clientX, e.clientY), cab: roomViewer.pick(e.clientX, e.clientY) };
  return {};
}
document.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const el = e.target.closest('#tab-room [data-drag]'); if (!el) return;
  if (e.target.closest('input,select,textarea')) return;
  dndPending = { x: e.clientX, y: e.clientY, el, payload: el.dataset.drag };
});
document.addEventListener('pointermove', e => {
  if (dndPending && !dnd && Math.hypot(e.clientX - dndPending.x, e.clientY - dndPending.y) > 6) {
    const [kind, ...rest] = dndPending.payload.split(':');
    const chip = document.createElement('div'); chip.className = 'dndchip';
    chip.innerHTML = dndPending.el.innerHTML; document.body.appendChild(chip);
    dnd = { kind, val: rest.join(':'), chip }; dndPending = null;
    document.body.classList.add('dragging');
  }
  if (!dnd) return;
  e.preventDefault();
  dnd.chip.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
  const t = dndTarget(e);
  if (dnd.kind === 'fixt') {
    const f = fixtNew(dnd.val), at = f && t.p && (t.where === 'plan' || t.where === '3d') ? fixtSpot(f, t.p, ui.px) : null;
    ui.fixtGhost = at ? Object.assign(f, at) : null;
    if (ui.viewMode === 'plan') renderPlan();
  } else if (dnd.kind === 'lib') {
    const l = libItem(dnd.val);
    ui.ghost = !l ? null : t.where === 'elev' ? elevGhost(l, t.ep) : t.p && (t.where === 'plan' || t.where === '3d') ? snapToWall(t.p, l, null, 0, ui.px) : null;
    ui.ghostLib = dnd.val;
    if (ui.viewMode === 'plan') renderPlan(); else if (ui.viewMode === 'elev') renderElev();
  } else {
    const nd = t.cab || null;
    if (nd !== ui.dropCab) { ui.dropCab = nd; redrawView(); }
  }
}, { passive: false });
// A finger drag the browser takes over (a scroll) ends without a pointerup: drop the drag there too.
document.addEventListener('pointercancel', () => {
  dndPending = null; if (!dnd) return;
  dnd.chip.remove(); dnd = null; document.body.classList.remove('dragging'); ui.ghost = null; ui.ghostLib = null; ui.fixtGhost = null; ui.dropCab = null; redrawView();
});
document.addEventListener('pointerup', dndDrop);
// A finger whose lift was lost drops what it carried where it was last seen.
onAllFingersUp(() => { dndPending = null; if (dnd) dndDrop(); });
function dndDrop() {
  dndPending = null;
  if (!dnd) return;
  const d = dnd; dnd = null; d.chip.remove(); document.body.classList.remove('dragging');
  ui.suppressClick = true; setTimeout(() => { ui.suppressClick = false; }, 0);
  if (d.kind === 'fixt') { const g = ui.fixtGhost; ui.fixtGhost = null; if (g) { mutate(() => { S.fixtures = S.fixtures || []; S.fixtures.push(g); }); ui.sel = { type: 'fixt', id: g.id }; ui.elevWall = g.wall; } renderRoom(); return; }
  if (d.kind === 'lib') { const g = ui.ghost; ui.ghost = null; ui.ghostLib = null; if (g) placeCabinet(d.val, g); else renderRoom(); return; }
  const target = ui.dropCab; ui.dropCab = null;
  if (target) { applyPayload(target, d.kind, d.val); ui.sel = { type: 'cab', id: target }; renderRoom(); flash(`Applied to ${LBL[target]}`); }
  else renderRoom();
}

// Doors and drawers: true opens, false closes, undefined flips each one.
const openable = c => computeFronts(c).some(f => f.type === 'door' || f.type === 'drawer');
function setOpen(ids, v) {
  clearDoorLimits();
  ids.forEach(id => { if (v === undefined ? !ui.open[id] : v) ui.open[id] = true; else delete ui.open[id]; });
  animateOpen();
  if (ui.tab === 'designer') renderDesigner();
  else if (ui.tab === 'room') renderRoom();
}

/* ---------- Right-click menu on a cabinet ---------- */
let ctxDown = null;
function cabAt(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY); if (!el) return null;
  if (el.closest('#plan')) { const h = hitCabs(toWorld(e)); return ui.sel && h.includes(ui.sel.id) ? ui.sel.id : h[0] || null; }
  if (el.closest('#elev')) { const g = el.closest('[data-cab]'); return g ? g.dataset.cab : null; }
  if (el.closest('#room3d') && roomViewer && roomViewer.ok) return roomViewer.pick(e.clientX, e.clientY);
  return null;
}
function hideCtx() { const m = $('#ctxmenu'); if (m && !m.hidden) m.hidden = true; }
function showCtx(id, x, y) {
  const c = cab(id); if (!c) return;
  if (inMulti(id)) { showMultiCtx(x, y); return; }
  select({ type: 'cab', id });
  const m = $('#ctxmenu'), item = (act, label, extra = '') => `<button role="menuitem" data-act="${act}" data-id="${id}"${extra}>${label}</button>`;
  m.innerHTML = `<div class="ctxhead">${esc(LBL[id] || '')} · ${esc(c.name)}</div>`
    + item('ed-open', 'Cabinet editor', ' data-kb="Double-click"')
    + (openable(c) ? item('open-toggle', ui.open[id] ? 'Close doors and drawers' : 'Open doors and drawers', ' data-kb="O"') : '')
    + item('light-draw-one', cabStrips(id).some(x => x.where === stripWhereFor(c)) ? 'Remove LED strip' : 'Add LED strip', ` data-kb="${esc((STRIP_SPOTS.find(x => x.v === stripWhereFor(c)) || {}).l || '')}"`) + (cabStrips(id).length ? item('light-copy', 'Copy its lights') : '') + (lightClip && lightClip.length ? item('light-paste', `Paste lights (${lightClip.length})`) : '')
    + item('q-copyset', 'Copy settings') + (typeof setClip !== 'undefined' && setClip ? item('q-pasteset', 'Paste settings') : '')
    + item('te-start', 'Edit top shape here') + item('cab-zoom3d', 'Zoom to it in 3D') + item('clip-copy', 'Copy', ' data-kb="Ctrl+C"') + item('clip-cut', 'Cut', ' data-kb="Ctrl+X"') + item('cab-dup', 'Duplicate', ' data-kb="Ctrl+D"') + item('cab-to-designer', 'Open in Designer')
    + item('cab-del', 'Delete', ' class="danger"');
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  const first = m.querySelector('[role=menuitem]'); if (first) first.focus({ preventScroll: true });
}
// Right-click on a wall: end caps at its ends or right where you clicked.
function showWallCtx(wid, a, x, y) {
  const w = wall(wid); if (!w) return;
  const es = elevSide(w), L = wg(w).L, from = es === 1 ? a : L - a, m = $('#ctxmenu');
  const item = (act, id, label) => `<button role="menuitem" data-act="${act}" data-id="${id}">${label}</button>`;
  const end = side => (es === 1) === (side === 'L') ? 'S' : 'E', on = side => (w['cap' + end(side)] || {}).on || wallEndJoined(w, end(side));
  m.innerHTML = `<div class="ctxhead">${esc(wallName(w))}</div>` + item('capx-add', `${wid}:${r3(a)}`, `Add end cap here (${fmtLen(Math.max(0, from), 1)} from left)`)
    + (on('L') ? '' : item('cap-end', `${wid}:${end('L')}`, 'Add left end cap')) + (on('R') ? '' : item('cap-end', `${wid}:${end('R')}`, 'Add right end cap'))
    + (clip ? item('clip-paste-at', `${wid}:${r3(a)}`, `Paste ${clipName()} here`) : '') + item('wall-sel', wid, 'Wall details');
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  const first = m.querySelector('[role=menuitem]'); if (first) first.focus({ preventScroll: true });
}
function showPasteCtx(x, y) {
  const m = $('#ctxmenu');
  m.innerHTML = `<button role="menuitem" data-act="clip-paste-pt" data-kb="Ctrl+V">Paste ${clipName()} here</button>`;
  m.hidden = false; m.style.left = Math.min(x, innerWidth - 220) + 'px'; m.style.top = Math.min(y, innerHeight - 60) + 'px';
}
// The wall under a right-click and the along-wall spot clicked, in plan or elevation.
function wallAt(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY); if (!el) return null;
  if (el.closest('#plan')) { const p = toWorld(e), wid = hitWall(p); if (!wid) return null; const r = segDist(p, wall(wid)); return { wid, a: Math.max(0, Math.min(r.g.L, r.t)) }; }
  const svg = el.closest('#elev'), w = wall(ui.elevWall);
  if (svg && w && svg.getScreenCTM()) {
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()), L = wg(w).L;
    if (q.x < 0 || q.x > L) return null;
    return { wid: w.id, a: elevSide(w) === 1 ? q.x : L - q.x };
  }
  return null;
}
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('#ctxmenu')) hideCtx();
  ctxDown = e.button === 2 && !ui.drawWalls && !ui.placing && e.target.closest('#plan,#elev,#room3d') ? { x: e.clientX, y: e.clientY } : null;
}, true);
document.addEventListener('pointerup', e => {
  const d = ctxDown; ctxDown = null;
  if (!d || e.button !== 2 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
  if (ui.topEdit && ui.teCtxAt && Date.now() - ui.teCtxAt < 1500) return;
  const id = cabAt(e); if (id) { showCtx(id, e.clientX, e.clientY); return; }
  ui.ctxPt = e.target.closest && e.target.closest('#plan') ? toWorld(e) : null;
  const wa = wallAt(e); if (wa) showWallCtx(wa.wid, wa.a, e.clientX, e.clientY);
  else if (clip && ui.ctxPt) showPasteCtx(e.clientX, e.clientY);
}, true);
document.addEventListener('contextmenu', e => { if (e.target.closest('#plan,#elev,#room3d,#ctxmenu')) e.preventDefault(); });
window.addEventListener('blur', hideCtx);
// Touch screens: press and hold on a cabinet or wall for the same menu a right-click opens.
let hold = null;
const dropHold = () => { if (hold) { clearTimeout(hold.t); hold = null; } };
document.addEventListener('pointerdown', e => {
  dropHold();
  if (e.pointerType !== 'touch' || !e.isPrimary || ui.drawWalls || ui.placing || !e.target.closest('#plan,#elev,#room3d')) return;
  const at = { clientX: e.clientX, clientY: e.clientY };
  hold = { x: e.clientX, y: e.clientY, t: setTimeout(() => {
    hold = null;
    const id = cabAt(at), wa = !id && wallAt(at);
    if (!id && !wa) return;
    ui.drag = null; if (navigator.vibrate) navigator.vibrate(12);
    if (id) showCtx(id, at.clientX, at.clientY); else showWallCtx(wa.wid, wa.a, at.clientX, at.clientY);
  }, 550) };
}, true);
document.addEventListener('pointermove', e => { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) dropHold(); }, true);
document.addEventListener('pointerup', dropHold, true);
document.addEventListener('pointercancel', dropHold, true);
// Tapping outside the phone library sheet closes it.
document.addEventListener('pointerdown', e => {
  if (ui.libOpen && isPhone() && ui.tab === 'room' && !e.target.closest('.rail')) { ui.libOpen = false; renderRail(); }
});

function redrawView() { if (ui.viewMode === 'plan') renderPlan(); else if (ui.viewMode === 'elev') renderElev(); else buildRoom3D(); }
function flash(text) {
  if (inHub()) { Hub.notify(text); return; }
  const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(flash.tm); flash.tm = setTimeout(() => { t.hidden = true; }, 1800);
}

/* ---------- Actions ---------- */
const LIST_DEFAULTS = {
  cabHoles: { ref: 'front', y: 37, z: 7, dia: 5, depth: 12 }, boxOps: { part: 'side', type: 'bore', edge: '', x: 37, y: 20, inset: 0, dia: 5, depth: 10 },
  cupExtra: { dx: 0, dy: 10, dia: 8, depth: 11 }, plateHoles: { dz: 0, y: 37, dia: 5, depth: 12 },
};
function removeFrom(listName, id, fallbackFields) {
  // Removes a library entry and points anything that used it at the first remaining one.
  S[listName] = S[listName].filter(x => x.id !== id);
  const f = S[listName][0] && S[listName][0].id;
  fallbackFields.forEach(([arr, key]) => arr().forEach(o => { if (o[key] === id) o[key] = f; }));
}
document.addEventListener('click', e => {
  if (ui.suppressClick) return;
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.closest('#ctxmenu')) hideCtx();
  const a = el.dataset.act, id = el.dataset.id, ref = el.dataset.ref;
  const selCab = () => ui.sel && ui.sel.type === 'cab' ? ui.sel.id : null;
  if (/^multi-|^light-paste-multi$/.test(a) && multiAct(a)) return;
  if (/^cut-pk-/.test(a) && cutPickAct(a)) return;
  if (/^pe-/.test(a) && typeof partsTabAct === 'function' && partsTabAct(a, id)) return;
  if (/^ct-/.test(a) && typeof cncToolsAct === 'function' && cncToolsAct(a, id)) return;
  if (/^vc-/.test(a) && typeof vcAct === 'function' && vcAct(a, id)) return;
  if (/^q-/.test(a) && typeof quickAct === 'function' && quickAct(a, id, el)) return;
  if (/^jt-/.test(a) && typeof jtAct === 'function' && jtAct(a, id, el)) return;
  if (/^(mp|rem|rc|sv|mt)-/.test(a) && typeof libs2Act === 'function' && libs2Act(a, id)) return;
  if (/^(ds|dt|v)-/.test(a) && typeof vAct === 'function' && vAct(a, id)) return;
  if (/^lp-/.test(a) && typeof libAct === 'function' && libAct(a, id)) return;
  if (/^(rl|rvar|jfield|fx)-/.test(a) && typeof fxAct === 'function' && fxAct(a, id, el)) return;
  if (/^te-/.test(a) && typeof topEditAct === 'function' && topEditAct(a, id)) return;
  if (/^fixt-/.test(a) && typeof fixtAct === 'function' && fixtAct(a, id)) return;
  if (/^ctj-/.test(a) && typeof ctjAct === 'function' && ctjAct(a, id)) return;
  switch (a) {
    case 'tab': goTab(id); break;
    case 'walls-draw': if (ui.drawWalls) stopWalls(); else startWalls(); break;
    case 'ptab': { const [kind, k] = id.split(':'); ui.ptab[kind] = k; try { localStorage.setItem(KEY + '.ptab', JSON.stringify(ui.ptab)); } catch (_) {} render(); break; }
    case 'wall-angle': { const [wid, d] = id.split(':'), w = wall(wid); if (w) mutate(() => setWallAngle(w, +d)); break; }
    case 'dock': ui.dock = id; ui.dockOpen = true; renderDock(); break;
    case 'dock-open': ui.dock = id; ui.dockOpen = true; renderDock(); $('#dock').scrollIntoView({ block: 'nearest' }); break;
    case 'dock-toggle': ui.dockOpen = !ui.dockOpen; ui.dockWas = undefined; try { localStorage.setItem(KEY + '.dock', ui.dockOpen ? '1' : '0'); } catch (_) {} renderDock(); requestAnimationFrame(redrawView); break;
    case 'rail-toggle': if (isPhone()) { ui.libOpen = !ui.libOpen; renderRail(); break; } ui.railShut = !ui.railShut; try { localStorage.setItem(KEY + '.rail', ui.railShut ? '1' : '0'); } catch (_) {} renderRail(); requestAnimationFrame(redrawView); break;
    case 'refit-fillers': { const was = { ...lay(), autoFillers: false }; let n = 0; mutate(() => { n = refitFillers(was, lay()); }); flash(n ? `Fillers fitted on ${nCab(n)}` : 'No cabinets needed moving'); break; }
    case 'undo': undoRedo(-1); break;
    case 'redo': undoRedo(1); break;
    case 'fit': fitView(); break;
    case 'zoom-in': zoomAt(1 / 1.3); break;
    case 'zoom-out': zoomAt(1.3); break;
    case 'elev-zoom': elevZoomStep(id === 'in' ? 1.3 : id === 'out' ? 1 / 1.3 : 0); break;
    case 'src': ui.src = id; renderSources(); break;
    case 'props-toggle': ui.propsShut = !propsShut(); if (ui.sel && /wall|shape/.test(ui.sel.type) && ui.propsShut) ui.sel = null; try { localStorage.setItem(KEY + '.side', ui.propsShut ? '1' : '0'); } catch (_) {} renderProps(); break;
    case 'lib-view': ui.libFavs = id === 'favs'; renderSources(); break;
    case 'lib-fold': (ui.libFold || (ui.libFold = {}))[id] = !ui.libFold[id]; try { localStorage.setItem(KEY + '.fold', JSON.stringify(ui.libFold)); } catch (_) {} renderSources(); break;
    case 'lib-fav': { const f = ui.favs || (ui.favs = loadFavs()), i = f.indexOf(id); if (i < 0) f.push(id); else f.splice(i, 1); try { localStorage.setItem(KEY + '.favs', JSON.stringify(f)); } catch (_) {} renderSources(); break; }
    case 'src-apply': {
      const [kind, ...rest] = el.dataset.drag.split(':');
      if (!selCab()) { flash('Select a cabinet first, or drag this onto one.'); break; }
      applyPayload(selCab(), kind, rest.join(':')); break;
    }
    case 'viewmode': setView(id); break;
    case 'dims': ui.dims[id] = !ui.dims[id]; try { localStorage.setItem(KEY + '.dims', JSON.stringify(ui.dims)); } catch (_) {} renderRoom(); break;
    case 'v3': ensureRoomViewer(); view3dPreset(roomViewer, id); break;
    case 'libmenu': {
      const m = $('#libmenu'), b = el.getBoundingClientRect();
      m.hidden = !m.hidden; el.setAttribute('aria-expanded', String(!m.hidden));
      if (!m.hidden) { m.style.left = Math.min(b.left, innerWidth - 200) + 'px'; m.style.top = b.bottom + 4 + 'px'; }
      break;
    }
    case 'room-open': switchRoom(id); goTab('room'); requestAnimationFrame(fitView); break;
    case 'room-settings': ui.setRoom = id; ui.setTab = 'templates'; goTab('settings'); break;
    case 'set-dash': ui.setTab = 'rooms'; goTab('settings'); break;
    case 'set-tab': ui.setTab = id; renderSettings(); break;
    case 'room-add': { addRoom(); ui.sel = null; if (roomViewer) roomViewer.fitted = false; goTab('room'); startWalls(); flash('New room. Click in the plan to start drawing walls.'); break; }
    case 'room-dup': { const r = duplicateRoom(roomById(id)); mutate(() => { S.rooms.splice(S.rooms.indexOf(roomById(id)) + 1, 0, r); }); break; }
    case 'room-del': {
      if (S.rooms.length < 2) break;
      mutate(() => { S.rooms = S.rooms.filter(r => r.id !== id); if (!roomById(S.roomId)) S.roomId = S.rooms[0].id; });
      ui.sel = null; if (roomViewer) roomViewer.fitted = false; flash('Room deleted. Undo brings it back.'); break;
    }
    case 'dash-cat': ui.dashCat = id; renderSettings(); break;
    case 'dash-csv': saveFile(new Blob([dashCSV()], { type: 'text/csv' }), `${fileSafe(S.job.name) || 'job'} rooms.csv`, 'Cabinet Designer'); break;
    case 'room-move': { const [rid, dir] = id.split(':'), i = S.rooms.findIndex(r => r.id === rid), j = i + +dir; if (i < 0 || j < 0 || j >= S.rooms.length) break; mutate(() => { const [r] = S.rooms.splice(i, 1); S.rooms.splice(j, 0, r); }); break; }
    case 'renumber': mutate(() => renumberRoom(curRoom())); flash('Cabinets renumbered in wall order'); break;
    case 'tops-auto': mutate(() => { curRoom().autoTops = true; Object.values(S.ctRuns).forEach(o => { delete o.off; }); }); flash(`Countertops built on ${countertopRuns().filter(r => !r.generic).length} runs`); break;
    case 'tops-auto-off': mutate(() => { curRoom().autoTops = false; }); flash('Automatic tops are off in this room'); break;
    case 'gtop-add': { const w = wall(ui.elevWall) || S.walls[0]; if (!w) { flash('Draw a wall first.'); break; } mutate(() => S.genTops.push({ id: uid('gt'), name: 'Top ' + (S.genTops.length + 1), wall: w.id, side: elevSide(w), off: 0, len: 36, depth: 25.5, z: 34.5 })); break; }
    case 'gtop-del': mutate(() => { S.genTops = S.genTops.filter(g => g.id !== id); }); break;
    case 'gmold-add': { const w = wall(ui.elevWall) || S.walls[0]; if (!w) { flash('Draw a wall first.'); break; } const sd = elevSide(w); mutate(() => S.genMolds.push({ id: uid('gm'), wall: w.id, side: sd, off: 0, len: r3(wg(w).L), ...moldDefaults(w, sd) })); break; }
    case 'gmold-del': mutate(() => { S.genMolds = S.genMolds.filter(g => g.id !== id); }); break;
    case 'gmold-draw': startMoldDraw(); break;
    case 'gtop-draw': startMoldDraw('top'); break;
    case 'light-strips': addStrips(id); break;
    case 'light-strip-sel': { const c = ui.sel && cab(ui.sel.id); if (c) mutate(() => S.lights.push({ id: uid('lt'), kind: 'strip', cab: c.id, where: c.cat === 'Wall' ? 'under' : 'toe', temp: 'warm' })); break; }
    case 'light-del': mutate(() => { S.lights = S.lights.filter(l => l.id !== id); }); break;
    case 'light-clear': mutate(() => { S.lights = S.lights.filter(l => l.kind !== id); }); break;
    case 'light-grid': lightGrid(); break;
    case 'light-place': startLightPlace(); break;
    case 'light-draw': startStripDraw(); break;
    case 'light-draw-one': toggleStrip(id); break;
    case 'light-copy': lightClip = cabStrips(id); flash(`Copied ${lightClip.length} light${lightClip.length === 1 ? '' : 's'}. Right-click another cabinet for Paste lights.`); break;
    case 'light-paste': pasteLights(inMulti(id) ? multiIds() : [id]); break;
    case 'light-place-stop': stopLightPlace(); break;
    case 'gmold-stop': stopMoldDraw(); break;
    case 'tpl-scope': ui.tplScope = id || ''; renderSettings(); break;
    case 'tpl-3d': ui.tpl3d = id === '3d'; renderSettings(); break;
    case 'room-notes': ui.roomNotes = !ui.roomNotes; renderSettings(); break;
    case 'tpl-cat': ui.tplCat = id; renderSettings(); break;
    case 'set-room-job': { const r = roomById(id); mutate(() => { r.settings = {}; }); flash(`${r.name} now follows the job picks`); break; }
    case 'set-job-all': mutate(() => S.rooms.forEach(r => { r.settings = {}; })); flash('Every room now follows the job settings'); break;
    case 'set-room-follow': { const r = roomById(id); mutate(() => r.cabinets.forEach(c => SETTING_FIELDS.forEach(k => { c[k] = ''; }))); flash(`Cabinets in ${r.name} now follow the room`); break; }
    case 'cab-follow': { const c = cab(id); mutate(() => SETTING_FIELDS.forEach(k => { c[k] = ''; })); break; }
    case 'view3d-save': ui.viewNaming = true; renderViews3d(); requestAnimationFrame(() => { const i = $('#view3d-name'); if (i) { i.focus(); i.select(); } }); break;
    case 'view3d-cancel': ui.viewNaming = false; renderViews3d(); break;
    case 'view3d-ok': saveView3d(); break;
    case 'view3d-del': { const r = curRoom(), vw = (r.views || []).find(x => x.id === ui.view3d); if (!vw) break; ui.view3d = ''; mutate(() => { r.views = r.views.filter(x => x !== vw); }); flash(`View "${vw.name}" deleted. Undo brings it back.`); break; }
    case 'render3d': ui.render3d = !ui.render3d; try { localStorage.setItem(KEY + '.render', ui.render3d ? '1' : '0'); } catch (_) {} renderRoom(); break;
    case 'snap3d': saveRoomImage(); break;
    case 'full3d': toggleFull3d(); break;
    case 'layers-all': ui.layers = {}; ui.wallOp = 1; saveLayers3d(); break;
    case 'layers-faces': ui.layers = { box: false, drawerBox: false, tops: false, molding: false, ceiling: false }; saveLayers3d(); break;
    case 'layers-inside': ui.layers = { fronts: false, pulls: false, ceiling: false, tops: false }; saveLayers3d(); break;
    case 'fv': fullView(id); break;
    case 'des3d': view3dPreset(designerViewer, id); break;
    case 'wall-dir': wallByLength(+id); break;
    case 'place-stop': stopDrawing(); break;
    case 'sel-del': deleteSelected(); break;
    case 'sel-none': select(null); break;
    case 'lib-pick': ui.libOpen = false; placeMode(ui.placing === id ? null : id); break;
    case 'elev-step': stepElev(+id); break;
    case 'elev-flip': { const w = wall(ui.elevWall); if (w) mutate(() => { w.viewSide = -elevSide(w); }); break; }
    case 'open-toggle': setOpen([id]); break;
    case 'open-all': { const ids = S.cabinets.filter(openable).map(c => c.id); setOpen(ids, !ids.some(k => ui.open[k])); break; }
    case 'cab-zoom3d': select({ type: 'cab', id }); setView('3d'); requestAnimationFrame(() => requestAnimationFrame(() => { if (roomViewer) view3dPreset(roomViewer, 'sel'); })); break;
    case 'shelf-step': { const o = resolve(ref); if (o) mutate(() => { o.shelfCount = Math.max(0, Math.min(12, (+el.dataset.v || 0) + (+id))); }); break; }
    case 'ins-add': {
      const o = resolve(ref), t = el.parentElement.querySelector('select.instype').value;
      if (!o) break;
      if (t === 'divider' && (o.inserts || []).some(k => k.type === 'divider')) { flash('This cabinet already has a divider.'); break; }
      mutate(() => { (o.inserts = o.inserts || []).push({ type: t, ...clone(insertType(t).def), ...(el.dataset.row !== undefined ? { row: +el.dataset.row } : {}) }); }); break;
    }
    case 'qe-row': ui.qeRow = +id; if (ui.qeBig && ui.edTab !== 'interior') ui.edTab = 'face'; renderQuick(); break;
    case 'qe-rowset': {
      const c = qeCab(), [i, k, v] = id.split(':'), row = c && c.rows && c.rows[+i]; if (!row) break;
      mutate(() => {
        if (k === 'type') row.type = v;
        else if (k === 'count') row.count = +v;
        else if (k === 'hinge') { if (v) row.hinge = v; else delete row.hinge; }
        else if (k === 'shelves') { if (v === 'auto') c.rows.forEach(r => { delete r.shelves; }); else { qeFreezeShelves(c); row.shelves = Math.max(0, Math.min(12, (row.shelves | 0) + (+v))); } }
      }); break;
    }
    case 'qe-finint-on': case 'qe-finint-off': { const c = cab(id); if (c) mutate(() => { c.finInt = a === 'qe-finint-on'; }); break; }
    case 'qe-clear-shelves': { const c = cab(id); if (c) mutate(() => { c.params = c.params || {}; c.params.shelfCount = 0; (c.rows || []).forEach(r => { delete r.shelves; }); }); flash('Adjustable shelves removed'); break; }
    case 'qe-clear-all': { const c = cab(id); if (c) mutate(() => { c.params = c.params || {}; c.params.shelfCount = 0; (c.rows || []).forEach(r => { delete r.shelves; }); c.inserts = []; c.finInt = false; }); flash('Interior removed. Undo brings it back.'); break; }
    case 'qe-clear-row': {
      const c = qeCab(), i = +id; if (!c || !c.rows[i]) break;
      mutate(() => {
        // Openings that follow the cabinet's shelf count keep the shelves they have now, so only this one empties.
        if (!c.rows.some(r => r.shelves !== undefined && r.shelves !== '')) {
          const p = effParams(c), lay = interiorLayout(c, p, computeFronts(c, p)), n = Math.max(0, p.shelfCount | 0), zs = lay.shelfZones;
          zs.forEach((z, k) => { const r = c.rows[z.row]; if (r) r.shelves = Math.floor(n / zs.length) + (k < n % zs.length ? 1 : 0); });
        }
        c.rows[i].shelves = 0;
        c.inserts = (c.inserts || []).filter(it => !(it.row !== undefined && it.row !== '' && +it.row === i));
      }); flash(`Opening ${i + 1} cleared`); break;
    }
    case 'qe-rowequal': { const c = cab(id); if (c) mutate(() => c.rows.forEach(r => { r.h = '*'; })); break; }
    case 'qe-tab': ui.qeTab = id; renderQuick(); break;
    case 'qe-rowadd': { const c = qeCab(), i = +id; if (!c) break; mutate(() => { c.rows.splice(i + 1, 0, { type: c.rows[i].type, h: '*', count: 1 }); (c.inserts || []).forEach(it => { if (it.row !== undefined && it.row !== '' && +it.row > i) it.row = +it.row + 1; }); }); ui.qeRow = i + 1; renderQuick(); break; }
    case 'qe-rowdel': {
      const c = qeCab(), i = +id; if (!c || c.rows.length < 2) break;
      mutate(() => { c.rows.splice(i, 1); (c.inserts || []).forEach(it => { if (it.row !== undefined && it.row !== '') { if (+it.row === i) delete it.row; else if (+it.row > i) it.row = +it.row - 1; } }); });
      ui.qeRow = Math.max(0, i - 1); renderQuick(); break;
    }
    case 'qe-rowmove': {
      const c = qeCab(), [a, d] = id.split(':').map(Number), b = a + d; if (!c || b < 0 || b >= c.rows.length) break;
      mutate(() => { [c.rows[a], c.rows[b]] = [c.rows[b], c.rows[a]]; (c.inserts || []).forEach(it => { if (it.row === a) it.row = b; else if (it.row === b) it.row = a; }); });
      ui.qeRow = b; renderQuick(); break;
    }
    case 'qe-divider': { const c = cab(id); if (c) mutate(() => { (c.inserts = c.inserts || []).push({ type: 'divider', ...clone(insertType('divider').def) }); }); break; }
    case 'ins-del': { const o = resolve(ref); if (o) mutate(() => o.inserts.splice(+el.dataset.i, 1)); break; }
    case 'des-view': ui.des3d = id === '3d'; renderDesigner(); break;
    case 'pt-add': mutate(() => S.partTemplates.push({ id: uid('pt'), name: 'New part template', rules: clone(partTpl(S.job.defaults.partT).rules || {}) })); break;
    case 'pt-dup': { const t = partTpl(id); mutate(() => S.partTemplates.push({ ...clone(t), id: uid('pt'), name: t.name + ' copy' })); break; }
    case 'pt-del': mutate(() => { S.partTemplates = S.partTemplates.filter(x => x.id !== id); unsetPick('partT', id, S.partTemplates[0].id); }); break;
    case 'pt-kind': { const [tid, kind] = id.split(':'), v = el.dataset.v; mutate(() => { const t = partTpl(tid); t.rules = t.rules || {}; t.rules[kind] = v ? { L1: v, L2: v, W1: v, W2: v } : {}; }); break; }
    case 'eb-add': mutate(() => S.edgebands.push({ id: uid('eb'), name: 'New edgeband', thickMM: 0.5, width: 0.875, color: '#d8c49a' })); break;
    case 'eb-del': mutate(() => {
      S.edgebands = S.edgebands.filter(x => x.id !== id);
      S.partTemplates.forEach(t => Object.values(t.rules || {}).forEach(r => EDGE_KEYS.forEach(k => { if (r[k] === id) r[k] = ''; })));
    }); break;
    case 'labels': showLabels(); break;
    case 'labels-print': window.print(); break;
    case 'labels-close': closeLabels(); break;
    case 'cab-del': if (ui.quick === id) ui.quick = null; mutate(() => { S.cabinets = S.cabinets.filter(c => c.id !== id); }); ui.sel = null; render(); break;
    case 'qe-open': openQuick(id); break;
    case 'des-mode': ui.desMode = id; ui.shapeSel = null; renderDesigner(); break;
    case 'shape-new': ui.desMode = 'shape'; mutate(() => { S.shapeDesign = blankShapeDesign(); }); goTab('designer'); break;
    case 'shape-pick': ui.libOpen = false; placeMode(ui.placing === 'shape:' + id ? null : 'shape:' + id); break;
    case 'shape-edit': editShape(id); break;
    case 'shape-lib-edit': { const l = shapeLibItem(id); if (!l) break; ui.desMode = 'shape'; ui.shapeSel = null; mutate(() => { S.shapeDesign = { ...clone(l), sourceLib: l.id, editShape: null }; delete S.shapeDesign.id; }); goTab('designer'); break; }
    case 'shape-lib-del': mutate(() => { S.shapeLib = S.shapeLib.filter(x => x.id !== id); }); ui.libSel = null; break;
    case 'shape-del': mutate(() => { S.shapes = S.shapes.filter(x => x.id !== id); }); ui.sel = null; render(); break;
    case 'shape-dup': { const s = shapeById(id); let ns; mutate(() => { ns = { ...clone(s), id: uid('s'), off: r3(s.off + shapeBox(s.pts).w) }; S.shapes.push(ns); }); ui.sel = { type: 'shape', id: ns.id }; render(); break; }
    case 'shape-flip': { const s = shapeById(id); mutate(() => { s.side = -s.side; }); break; }
    case 'shape-to-lib': { const s = shapeById(id), nid = uid('sl'); mutate(() => { S.shapeLib.push(shapeToLib(s, nid)); s.libId = nid; }); flash('Saved to the shape library'); break; }
    case 'se-sel': { const [k, i] = id.split(':'); ui.shapeSel = { kind: k, i: +i }; renderShapeDesigner(); break; }
    case 'se-del': { const i = +id; if (S.shapeDesign.pts.length > 3) { ui.shapeSel = null; mutate(() => S.shapeDesign.pts.splice(i, 1)); } break; }
    case 'se-round': { const [i, r] = id.split(':'); mutate(() => { S.shapeDesign.pts[+i].r = +r; }); break; }
    case 'se-bulge': {
      const [i, k] = id.split(':'), d = S.shapeDesign, L = edgeLen(d.pts, +i);
      mutate(() => { d.pts[+i].b = k === 'out' ? r3(L / 12) : k === 'in' ? -r3(L / 12) : k === 'half' ? r3(L / 2) : 0; }); break;
    }
    case 'se-split': { const i = +id; mutate(() => splitEdge(S.shapeDesign, i)); ui.shapeSel = { kind: 'pt', i: i + 1 }; renderShapeDesigner(); break; }
    case 'se-save': { const nid = uid('sl'); mutate(() => { S.shapeLib.push(shapeToLib(S.shapeDesign, nid)); S.shapeDesign.sourceLib = nid; }); flash('Saved to the shape library. Find it under Shapes on the left of the room.'); break; }
    case 'se-mold': {
      // Save the drawn profile into the molding it came from.
      const d = S.shapeDesign, m = d && molding(d.forMold); if (!m) { goTab('moldings'); break; }
      mutate(() => { m.profile = 'shape'; m.pts = clone(d.pts); moldFitShape(m); S.shapeDesign = blankShapeDesign(); });
      flash(`Saved the profile for ${m.name}`); goTab('moldings'); break;
    }
    case 'se-cab-save': {
      const d = S.shapeDesign, fc = d && d.forCab, c = fc && cab(fc.id); if (!c) { goTab('room'); break; }
      const [W, H] = cabShapeDims(c, fc.view), b = shapeBox(d.pts), plain = d.pts.length === 4 && !d.pts.some(p => p.r || p.b) && Math.abs(b.x0) < 1e-3 && Math.abs(b.y0) < 1e-3 && Math.abs(b.w - W) < 1e-3 && Math.abs(b.h - H) < 1e-3;
      mutate(() => { c.shape = c.shape || {}; if (plain) delete c.shape[fc.view]; else c.shape[fc.view] = { pts: clone(d.pts), w: W, h: H }; S.shapeDesign = blankShapeDesign(); });
      goTab('room'); openEditor(c.id, 'shape'); break;
    }
    case 'se-cab-cancel': { const fc = S.shapeDesign && S.shapeDesign.forCab; mutate(() => { S.shapeDesign = blankShapeDesign(); }); goTab('room'); if (fc && cab(fc.id)) openEditor(fc.id, 'shape'); break; }
    case 'se-cab-reset': { const fc = S.shapeDesign.forCab, c = fc && cab(fc.id); if (!c) break; const [W, H] = cabShapeDims(c, fc.view); mutate(() => { S.shapeDesign.pts = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }]; }); break; }
    case 'cab-shape-edit': { const [cid, v] = id.split(':'), c = cab(cid); if (!c) break; closeQuick(); mutate(() => editCabShape(c, v)); goTab('designer'); break; }
    case 'cab-shape-clear': { const [cid, v] = id.split(':'), c = cab(cid); if (!c) break; mutate(() => { if (c.shape) delete c.shape[v]; }); if (ui.quick) renderQuick(); break; }
    case 'se-mold-cancel': mutate(() => { S.shapeDesign = blankShapeDesign(); }); goTab('moldings'); break;
    case 'se-mold-reset': mutate(() => { S.shapeDesign.pts = moldStartPts(); }); break;
    case 'mold-draw': { const m = molding(id); if (!m) break; mutate(() => editMoldProfile(m)); goTab('designer'); break; }
    case 'mold-add-shape': { const mid = uid('mo'); mutate(() => { S.moldings.push({ id: mid, name: 'New molding', profile: 'shape', pts: moldStartPts(), h: 3.5, d: 2.25, fill: false, mat: S.materials[0].id }); moldFitShape(molding(mid)); editMoldProfile(molding(mid)); }); goTab('designer'); break; }
    case 'se-update': { const l = shapeLibItem(S.shapeDesign.sourceLib); if (l) mutate(() => Object.assign(l, shapeToLib(S.shapeDesign, l.id))); flash('Shape updated'); break; }
    case 'se-apply': {
      const d = S.shapeDesign, rm = S.rooms.find(r => (r.shapes || []).some(x => x.id === d.editShape));
      if (rm) { mutate(() => { const s = rm.shapes.find(x => x.id === d.editShape); Object.assign(s, { name: d.name, plane: d.plane, pts: clone(d.pts), thick: d.thick, mat: d.mat }); }); S.roomId = rm.id; ui.sel = { type: 'shape', id: d.editShape }; goTab('room'); }
      break;
    }
    case 'se-place': {
      const d = S.shapeDesign; let nid = d.sourceLib && shapeLibItem(d.sourceLib) ? d.sourceLib : null;
      mutate(() => { if (nid) Object.assign(shapeLibItem(nid), shapeToLib(d, nid)); else { nid = uid('sl'); S.shapeLib.push(shapeToLib(d, nid)); d.sourceLib = nid; } });
      ui.src = 'cabinets'; placeMode('shape:' + nid); break;
    }
    case 'calc': e.preventDefault(); if (calcFor && calcFor.id === id) closeCalc(); else openCalc(id); break;
    case 'calc-close': closeCalc(); break;
    case 'calc-apply': calcApply(); break;
    case 'calc-clear': { const t = document.getElementById(calcFor.id); closeCalc(); if (t) { t.value = t.dataset.shown || t.value.replace(/^=.*/, '') || '0'; delete t.dataset.shown; mutate(() => setFormula(t.dataset.obj, t.dataset.field, null)); } break; }
    case 'calc-ins': case 'calc-key': {
      const inp = $('#calc-in'); if (!inp) break;
      const a0 = inp.selectionStart ?? inp.value.length, a1 = inp.selectionEnd ?? a0;
      if (id === '⌫') { const b = a0 === a1 ? Math.max(0, a0 - 1) : a0; inp.value = inp.value.slice(0, b) + inp.value.slice(a1); inp.setSelectionRange(b, b); }
      else { const t = a === 'calc-ins' && /[\w)]$/.test(inp.value.slice(0, a0).trim()) ? ' + ' + id : id; inp.value = inp.value.slice(0, a0) + t + inp.value.slice(a1); inp.setSelectionRange(a0 + t.length, a0 + t.length); }
      inp.focus(); calcPreview(); break;
    }
    case 'look': { const i = id.indexOf(':'); setLook(id.slice(0, i), id.slice(i + 1)); if (ui.tab === 'settings') renderSettings(); else if (ui.tab === 'room') { renderSources(); renderProps(); } break; }
    case 'help-flip': setLook('help', look.help === 'show' ? 'hide' : 'show'); if (ui.tab === 'settings') renderSettings(); else if (ui.tab === 'room') { renderSources(); renderProps(); } break;
    case 'theme-flip': flipTheme(); if (ui.tab === 'settings' && typeof renderSettings === 'function') renderSettings(); break;
    case 'look-reset': look = { ...LOOK_DEFAULTS }; setLook('theme', ''); renderSettings(); break;
    case 'var-add': mutate(() => { const n = (S.job.vars || []).length + 1; (S.job.vars = S.job.vars || []).push({ id: uid('v'), k: 'VAR' + n, v: 0 }); }); break;
    case 'cvar-add': { const c = cab(id); if (c) mutate(() => { c.vars = c.vars || []; c.vars.push({ id: uid('cv'), k: 'P' + (c.vars.length + 1), v: 0 }); }); break; }
    case 'cvar-del': { const [cid, vid] = id.split(':'), c = cab(cid); if (c) mutate(() => { c.vars = (c.vars || []).filter(v => v.id !== vid); }); break; }
    case 'var-del': mutate(() => { S.job.vars = S.job.vars.filter(v => v.id !== id); }); break;
    case 'qe-close': closeQuick(); break;
    case 'qe-more': case 'ed-open': openEditor(id || ui.quick); break;
    case 'ed-quick': ui.qeBig = false; renderQuick(); break;
    case 'ed-tab': ui.edTab = id; renderQuick(); break;
    case 'ed-part': { if (e.target.closest('.pe-build')) break; const now = Date.now(), dbl = ui.edPartClick && ui.edPartClick.i === id && now - ui.edPartClick.t < 450; ui.edPartClick = { i: id, t: now }; ui.edPart = id; if (dbl && cab(ui.quick)) { openPartEdit(ui.quick, id); break; } renderQuick(); break; }
    case 'ed-step': edStep(+id); break;
    case 'ed-split': { const c = qeCab(), [i, n] = id.split(':').map(Number); if (c) mutate(() => edSplitRows(c, i, n)); break; }
    case 'ed-hsplit': { const c = qeCab(); if (c && c.rows[+id]) mutate(() => edSplitRows(c, +id, 2)); break; }
    case 'ed-join': {
      // Side by side fronts become one; otherwise the opening takes in the one below it.
      const c = qeCab(), i = +id, row = c && c.rows[i]; if (!row) break;
      if ((row.count | 0) > 1) { mutate(() => { row.count = 1; }); break; }
      const nx = c.rows[i + 1]; if (!nx) break;
      mutate(() => {
        const num = v => v !== '*' && v !== '' && v !== undefined && isFinite(+v);
        row.h = num(row.h) && num(nx.h) ? +row.h + +nx.h : '*';
        c.rows.splice(i + 1, 1);
        (c.inserts || []).forEach(it => { if (it.row !== undefined && it.row !== '' && +it.row > i) it.row = +it.row - 1; });
      }); break;
    }
    case 'ed-vsplit': { const c = qeCab(), row = c && c.rows[+id]; if (row) mutate(() => { row.count = Math.min(6, (row.count || 1) * 2); if (row.count > 1) delete row.hinge; }); break; }
    case 'ed-grid': ui.edGrid = !ui.edGrid; renderQuick(); break;
    case 'ed-gridset': { const [k, v] = id.split(':'); ui['edGrid' + k] = v; renderQuick(); break; }
    case 'ed-grid-apply': { const c = qeCab(); if (c && c.rows[+id]) { mutate(() => edGridSplit(c, +id)); ui.edGrid = false; renderQuick(); } break; }
    case 'clip-copy': case 'clip-cut': ui.sel = { type: 'cab', id }; hideCtx(); clipCopy(a === 'clip-cut'); break;
    case 'clip-paste-pt': hideCtx(); clipPaste(ui.ctxPt ? { p: ui.ctxPt } : null); break;
    case 'clip-paste-at': {
      // On a wall: the side clicked in the plan, or the side the elevation looks at.
      const [wid, at] = id.split(':'), w = wall(wid); hideCtx(); if (!w) break;
      const side = ui.viewMode === 'plan' && ui.ctxPt ? segDist(ui.ctxPt, w).side : elevSide(w);
      clipPaste({ wid, a: +at, side }); break;
    }
    case 'cab-dup': {
      const c = cab(id), off = findFree(c, c.wall, c.side, c.off + c.w, null);
      if (off === null) { flash('There is no room on this wall for a copy.'); break; }
      let nc; mutate(() => { nc = clone(c); nc.id = uid('c'); nc.off = r3(off); S.cabinets.push(nc); addCabStrips(nc.id, cabStrips(c.id)); });
      ui.sel = { type: 'cab', id: nc.id }; render(); break;
    }
    case 'cab-center': case 'cab-center-open': {
      const c = cab(id), was = c.off;
      mutate(() => { centerCab(c, a === 'cab-center-open'); if (!settle(c)) c.off = was; });
      flash(Math.abs(c.off - was) > 0.001 ? (a === 'cab-center' ? 'Centered on the wall' : 'Centered in the opening') : 'It is already there, or there is no room to move it'); break;
    }
    case 'cab-push-L': case 'cab-push-R': {
      // Slide it until it touches its neighbour (or the wall) on that side, like Mozaik's clearance arrows.
      const c = cab(id), was = c.off, end = a.slice(-1);
      mutate(() => { setOpenGap(c, end, 0); if (!settle(c)) c.off = was; });
      if (Math.abs(c.off - was) < 0.001) flash('It is already against that side'); break;
    }
    case 'cab-flip': {
      if ((cab(id) || {}).noMirror) { flash('Flip is turned off for this cabinet (Info tab).'); break; }
      const c = cab(id), off = findFree(c, c.wall, -c.side, c.off, c.id);
      if (off === null) { flash('There is no room on the other side of this wall.'); break; }
      mutate(() => { c.side = -c.side; c.off = r3(off); }); break;
    }
    case 'cab-to-lib': {
      const c = cab(id), nid = uid('l');
      mutate(() => { const li = designToLib({ ...designCabFrom(c), name: c.name + ' (custom)' }, nid), lt = cabStrips(c.id); if (lt.length) li.lights = lt; S.library.push(li); c.libId = nid; });
      flash('Saved to the library'); break;
    }
    case 'cab-to-designer': { const c = cab(id); mutate(() => { S.designer = { ...designCabFrom(c), sourceLib: null, name: c.name + ' (custom)' }; }); goTab('designer'); break; }
    case 'capx-add': { const [wid, a] = id.split(':'); addCustomCap(wid, a === '' ? NaN : +a); break; }
    case 'capx-del': { const [wid, cid] = id.split(':'), w = wall(wid); if (w) mutate(() => { w.caps = (w.caps || []).filter(x => x.id !== cid); }); break; }
    case 'cab-end': { const [cid, end, k] = id.split(':'), c = cab(cid), ch = END_CHOICES.find(x => x[0] === k); if (c && ch) mutate(() => { c['fill' + end] = ch[2]; c['panel' + end] = ch[3]; }); break; }
    case 'cap-end': { const [wid, end] = id.split(':'), w = wall(wid); if (w && !wallEndJoined(w, end)) { mutate(() => { w['cap' + end] = { ...capDefaults(w), side: elevSide(w), ...(w['cap' + end] || {}), on: true }; settleWall(w); }); select({ type: 'wall', id: wid }); } break; }
    case 'wall-sel': select({ type: 'wall', id }); ui.elevWall = id; renderRoom(); break;
    case 'wall-del': mutate(() => { S.walls = S.walls.filter(w => w.id !== id); S.cabinets = S.cabinets.filter(c => c.wall !== id); S.fixtures = (S.fixtures || []).filter(f => f.wall !== id); }); ui.sel = null; render(); break;
    case 'face': { const o = resolve(ref), fp = FACE_PRESETS.find(f => f.id === id); if (o && fp) mutate(() => { o.rows = clone(fp.rows); }); break; }
    case 'row-add': { const o = resolve(ref); if (o) { ui.rowsOpen = true; mutate(() => o.rows.push({ type: 'door', h: '*', count: 1 })); } break; }
    case 'row-del': { const o = resolve(ref); if (o) { ui.rowsOpen = true; mutate(() => o.rows.splice(+el.dataset.i, 1)); } break; }
    case 'param-reset': { const o = resolve(ref); if (o) mutate(() => { delete o[el.dataset.k]; }); break; }
    case 'cust-add': { const o = resolve(ref); if (o) mutate(() => { (o.custom = o.custom || []).push({ k: '', v: '' }); }); break; }
    case 'cust-del': { const o = resolve(ref); if (o) mutate(() => o.custom.splice(+el.dataset.i, 1)); break; }
    case 'list-add': { const o = resolve(ref), p = el.dataset.prop; if (o) mutate(() => { (o[p] = o[p] || []).push({ ...LIST_DEFAULTS[p] }); }); break; }
    case 'list-del': { const o = resolve(ref), p = el.dataset.prop; if (o) mutate(() => o[p].splice(+el.dataset.i, 1)); break; }
    case 'show-parts': cutPickOnly([id]); break;
    case 'part': { const now = Date.now(), dbl = ui.cutClick && ui.cutClick.i === id && now - ui.cutClick.t < 450; ui.cutClick = { i: id, t: now }; ui.partSel = id; renderCutlist(); if (dbl) { const p = cutScope().parts.find((q, i) => q.cabId + '#' + i === id); if (p && cab(p.cabId)) openPartEdit(p.cabId, peKeyOf(p)); } break; }
    case 'cut-edit-part': { const [cid, ...k] = id.split('|'); openPartEdit(cid, k.join('|')); break; }
    case 'lib-sel': ui.libSel = id; renderLibrary(); break;
    case 'lib-dup': { const l = libItem(id), nl = { ...clone(l), id: uid('l'), name: l.name + ' copy' }; mutate(() => S.library.push(nl)); ui.libSel = nl.id; render(); break; }
    case 'lib-del': mutate(() => { S.library = S.library.filter(x => x.id !== id); }); break;
    case 'lib-place': ui.tab = 'room'; placeMode(id); break;
    case 'designer-new': mutate(() => { S.designer = blankDesign(); }); if (designerViewer) designerViewer.fitted = false; goTab('designer'); break;
    case 'designer-load': mutate(() => { S.designer = designFromLib(libItem(id)); }); if (designerViewer) designerViewer.fitted = false; goTab('designer'); break;
    case 'des-save': case 'des-place': case 'des-update': {
      const d = S.designer; let lid = d.sourceLib;
      mutate(() => {
        if (a === 'des-save' || !lid || !libItem(lid)) { lid = uid('l'); S.library.push(designToLib(d, lid)); d.sourceLib = lid; }
        else S.library[S.library.findIndex(l => l.id === lid)] = designToLib(d, lid);
      });
      if (a === 'des-place') { ui.libSel = lid; ui.tab = 'room'; ui.src = 'cabinets'; placeMode(lid); }
      else flash(a === 'des-update' ? 'Library template updated' : 'Saved to the library');
      break;
    }
    case 'mat-add': mutate(() => S.materials.push({ id: uid('m'), name: 'New material', kind: 'sheet', thick: 0.75, sheetW: 49, sheetL: 97, grain: false, cost: 0, color: '#d8cfc0', texture: null, procedural: null, texScale: 24 })); break;
    case 'mat-del': {
      const inUse = JSON.stringify({ t: S.matTemplates, d: S.doorStyles, p: S.panels, c: S.countertops, m: S.moldings }).includes('"' + id + '"');
      if (inUse) { el.textContent = 'In use'; el.disabled = true; break; }
      mutate(() => { S.materials = S.materials.filter(m => m.id !== id); }); break;
    }
    case 'tex-clear': mutate(() => { mat(id).texture = null; }); renderTexPick(); break;
    case 'tex-lib': openTexPick(id); break;
    case 'tex-close': closeTexPick(); break;
    case 'tex-cat': ui.texPick.cat = id; ui.texPick.sub = ''; ui.texPick.q = ''; renderTexPick(); break;
    case 'tex-sub': ui.texPick.sub = id; renderTexPick(); break;
    case 'tex-pick': pickTexture(+id); break;
    case 'mtc-add': mutate(() => S.matTemplates.cabinet.push({ ...clone(S.matTemplates.cabinet[0]), id: uid('mt'), name: 'New cabinet materials' })); break;
    case 'mtd-add': mutate(() => S.matTemplates.drawer.push({ ...clone(S.matTemplates.drawer[0]), id: uid('dt'), name: 'New drawer materials' })); break;
    case 'mtc-del': mutate(() => { S.matTemplates.cabinet = S.matTemplates.cabinet.filter(t => t.id !== id); unsetPick('cabMatT', id, S.matTemplates.cabinet[0].id); }); break;
    case 'mtd-del': mutate(() => { S.matTemplates.drawer = S.matTemplates.drawer.filter(t => t.id !== id); unsetPick('drawerMatT', id, S.matTemplates.drawer[0].id); }); break;
    case 'door-add': {
      const pr = DOOR_PRESETS.find(x => x.id === ($('#doorpreset') || {}).value) || DOOR_PRESETS[0], nid = uid('d'), { id: _, name, ...rest } = pr;
      const m = (S.doorStyles.find(x => x.id === ui.doorSel) || S.doorStyles[0] || {}).mat || S.materials[0].id;
      mutate(() => S.doorStyles.push({ ...DOOR_DEFAULTS, id: nid, name: 'New ' + name.toLowerCase() + ' door', mat: m, panelMat: m, ...rest, ...(rest.panelMat && !mat(rest.panelMat) ? { panelMat: m } : {}) }));
      ui.doorSel = nid; render(); break;
    }
    case 'door-dup': { const t = S.doorStyles.find(x => x.id === id), nid = uid('d'); mutate(() => S.doorStyles.push({ ...clone(t), id: nid, name: t.name + ' copy' })); ui.doorSel = nid; render(); break; }
    case 'door-sel': ui.doorSel = id; ui.doorPick = null; renderDoors(); break;
    case 'door-pick': { const [k, i] = id.split(':'); ui.doorPick = !k || (ui.doorPick && ui.doorPick.k === k && ui.doorPick.i === +i) ? null : { k, i: +i }; renderDoors(); break; }
    case 'door-split': { const [dir, ri, ci] = id.split(':'), d = S.doorStyles.find(x => x.id === ui.doorSel); if (!d) break; mutate(() => doorSplit(d, dir, +ri, +ci)); ui.doorPick = { k: 'mid' + dir, i: dir === 'rail' ? +ri : +ci }; renderDoors(); break; }
    case 'door-join': { const [dir, i] = id.split(':'), d = S.doorStyles.find(x => x.id === ui.doorSel); if (!d) break; mutate(() => doorJoin(d, dir, +i)); ui.doorPick = null; renderDoors(); break; }
    case 'door-prev': ui.doorPrev = id; if (id === 'custom' && !ui.doorCW) { ui.doorCW = 15; ui.doorCH = 30; } renderDoors(); break;
    case 'param-fold': ui.paramFold = { ...(ui.paramFold || {}), [id]: !(ui.paramFold || {})[id] }; try { localStorage.setItem(KEY + '.paramFold', JSON.stringify(ui.paramFold)); } catch (_) {} render(); if (ui.quick) renderQuick(); break;
    case 'door-fold': ui.doorFold = { ...(ui.doorFold || {}), [id]: !doorSecShut(id) }; try { localStorage.setItem(KEY + '.doorFold', JSON.stringify(ui.doorFold)); } catch (_) {} renderDoors(); break;
    case 'door-cat': ui.doorShut = { ...(ui.doorShut || {}), [id]: !(ui.doorShut || {})[id] }; renderDoors(); break;
    case 'door-3d': ui.door3d = !ui.door3d; renderDoors(); break;
    case 'door3d-view': ui.door3dView = id; if (doorViewer) doorViewer.fitted = null; buildDoor3D(); break;
    case 'door-del': mutate(() => removeFrom('doorStyles', id, [[() => S.doorTemplates, 'door'], [() => S.doorTemplates, 'drawer'], [() => S.doorTemplates, 'falseFront']])); break;
    case 'dtpl-add': mutate(() => S.doorTemplates.push({ ...clone(S.doorTemplates[0]), id: uid('door'), name: 'New door template' })); break;
    case 'dtpl-dup': { const t = S.doorTemplates.find(x => x.id === id); mutate(() => S.doorTemplates.push({ ...clone(t), id: uid('door'), name: t.name + ' copy' })); break; }
    case 'dtpl-del': mutate(() => { S.doorTemplates = S.doorTemplates.filter(x => x.id !== id); unsetPick('doorT', id, S.doorTemplates[0].id); }); break;
    case 'panel-add': mutate(() => S.panels.push({ id: uid('p'), name: 'New panel fit', frontOverhang: 0.75, scribe: 0.5, toFloor: true })); break;
    case 'panel-del': mutate(() => { S.panels = S.panels.filter(x => x.id !== id); unsetPick('panelStyle', id, S.panels[0].id); }); break;
    case 'hw-kind': ui.hwKind = id; renderHardware(); break;
    case 'hw-add': {
      const base = hwOf(id)[0];
      const blank = { slide: hwOf('slide')[0], hinge: hwOf('hinge')[0], pull: hwOf('pull')[0], shelfpin: hwOf('shelfpin')[0], joint: defaultJoints()[0], leg: { kind: 'leg', feet: true, ...LEG_DEF } }[id];
      mutate(() => S.hardware.push(base || blank ? { ...clone(base || blank), id: uid('hw'), name: 'New ' + (HW_KINDS.find(k => k[0] === id) || [, 'hardware'])[1].toLowerCase() } : { id: uid('hw'), kind: 'other', name: 'New hardware', perCabinet: 1, cats: ['Base', 'Wall', 'Tall'] }));
      break;
    }
    case 'hw-dup': { const h = hw(id); mutate(() => S.hardware.push({ ...clone(h), id: uid('hw'), name: h.name + ' copy' })); break; }
    case 'hw-del': mutate(() => {
      const k = hw(id).kind; S.hardware = S.hardware.filter(h => h.id !== id); const f = hwOf(k)[0];
      if (['slide', 'hinge', 'pull', 'shelfpin', 'leg'].includes(k)) unsetPick(k, id, k === 'pull' ? '' : f && f.id);
      if (k === 'joint') ['jointU', 'jointF'].forEach(j => unsetPick(j, id, f && f.id));
      if (k === 'pull') S.doorTemplates.forEach(t => { if (t.pull === id) t.pull = f && f.id; if (t.drawerPull === id) t.drawerPull = f && f.id; });
    }); break;
    case 'pin-use': mutate(() => { S.job.defaults.shelfpin = id; }); break;
    case 'leg-use': mutate(() => { S.job.defaults.leg = id; }); break;
    case 'top-add': mutate(() => S.countertops.push({ ...clone(S.countertops[0]), id: uid('top'), name: 'New countertop' })); break;
    case 'top-del': mutate(() => { S.countertops = S.countertops.filter(t => t.id !== id); unsetPick('countertop', id, S.countertops[0].id); S.rooms.forEach(r => Object.values(r.ctRuns || {}).forEach(o => { if (o.top === id) delete o.top; })); }); break;
    case 'mold-add': mutate(() => S.moldings.push({ id: uid('mo'), name: 'New molding', profile: 'crown', h: 3, d: 2, fill: false, mat: S.materials[0].id })); break;
    case 'mold-del': mutate(() => { S.moldings = S.moldings.filter(m => m.id !== id); allCabs().forEach(c => { if (c.molding === id) c.molding = null; }); unsetPick('molding', id, S.moldings[0].id); }); break;
    case 'mold-quick': {
      const box = el.closest('.qm-box'), q = k => box.querySelector('.qm-' + k);
      const mid = q('mold').value, gap = parseLen(q('gap').value), tall = q('tall').checked;
      if (!isFinite(gap)) { q('note').textContent = 'Enter a distance, like 12 or 6 1/2.'; break; }
      ui.qmGap = gap; ui.qmTall = tall; let n = 0;
      mutate(() => { curRoom().settings.molding = mid === S.job.defaults.molding ? '' : mid; S.cabinets.forEach(c => { const w = wall(c.wall); if (!w) return; if ((c.cat === 'Wall' || (tall && c.cat === 'Tall')) && w.height - (c.elev + c.h) <= gap + 1e-6) { c.molding = mid; n++; } }); });
      flash(n ? `Molding added to ${nCab(n)}` : 'No upper cabinets are that close to the ceiling'); break;
    }
    case 'mold-clear': mutate(() => S.cabinets.forEach(c => { c.molding = null; })); break;
    case 'exp-fmt': ui.exportFmt = id; renderExport(); break;
    case 'exp-units': ui.exportUnits = id; renderExport(); break;
    case 'copy': {
      const ta = $('#exptext'), note = $('#copynote');
      const fallback = () => { ta.focus(); ta.select(); note.textContent = 'Selected. Press Ctrl+C (Cmd+C) to copy.'; };
      try { navigator.clipboard.writeText(ta.value).then(() => { note.textContent = 'Copied'; }, fallback); } catch (_) { fallback(); }
      break;
    }
    case 'save-files': {
      const job = S.job.name.replace(/[^\w -]/g, '').trim() || 'job';
      const ext = { cnc: 'json', json: 'json', cut: 'csv', labels: 'csv', ops: 'csv', doors: 'csv', buyout: 'csv' }[ui.exportFmt], name = `${job} ${{ cnc: 'parts', json: 'job', cut: 'cut list', labels: 'labels', ops: 'machining', doors: 'door order', buyout: 'buyout doors' }[ui.exportFmt]}.${ext}`;
      // The parts file goes next to the CIX files CNC Cutlist writes for the job.
      const folder = ui.exportFmt === 'cnc' ? `CNC/${job}` : 'Cabinet Designer';
      Hub.files.upload(new File([$('#exptext').value], name), folder).then(() => flash(`Saved to Files › ${folder.replace('/', ' › ')}`), err => flash('Could not save: ' + err.message));
      break;
    }
    case 'cnc-save': case 'cnc-download': {
      const job = S.job.name.replace(/[^\w -]/g, '').trim() || 'job', name = `${typeof cncFileName === 'function' ? cncFileName() : job + ' parts'}.json`, cf = cncPartFile(true).file, text = JSON.stringify(cf, null, 2);
      if (!cf.parts.length) { flash('Nothing to send. Pick something to cut first.'); break; }
      if (a === 'cnc-download') { const u = URL.createObjectURL(new Blob([text], { type: 'application/json' })), ln = document.createElement('a'); ln.href = u; ln.download = name; document.body.appendChild(ln); ln.click(); ln.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); break; }
      Hub.files.upload(new File([text], name), `CNC/${job}`).then(() => flash(`Saved to Files › CNC › ${job}. Open CNC Cutlist to nest it.`), err => flash('Could not save: ' + err.message));
      break;
    }
    case 'send-schedule': {
      const name = `${S.job.name.replace(/[^\w &-]/g, '').trim() || 'job'}.json`, path = `${SCHED_FOLDER}/${name}`;
      Hub.files.delete(path).catch(() => {})
        .then(() => Hub.files.upload(new File([JSON.stringify(scheduleSummary(), null, 1)], name, { type: 'application/json' }), SCHED_FOLDER))
        .then(() => flash('Sent to Scheduler. Open Scheduler and add it from the Jobs tab.'), err => flash('Could not send: ' + err.message));
      break;
    }
    case 'backup': $('#imptext').value = JSON.stringify(S); break;
    case 'import': {
      let d; try { d = JSON.parse($('#imptext').value); } catch (_) { $('#impnote').textContent = 'That is not valid JSON.'; break; }
      d = migrate(d);
      if (!d) { $('#impnote').textContent = 'This is not a Cabinet Designer backup. Use "Show full job backup" to make one.'; break; }
      mutate(() => { S = d; }); ui.sel = null; goTab('room'); requestAnimationFrame(fitView); break;
    }
    case 'reset-sample': { const fresh = seed(); mutate(() => { S = fresh; }); ui.sel = null; goTab('room'); requestAnimationFrame(fitView); break; }
    case 'clear-room': mutate(() => { S.walls = []; S.cabinets = []; S.ctRuns = {}; }); ui.sel = null; goTab('room'); startWalls(); break;
  }
});
// A library entry was deleted: anything that picked it goes back to following the level above.
function unsetPick(k, id, fallback) {
  allCabs().concat(S.library, S.designer ? [S.designer] : []).forEach(o => { if (o[k] === id) o[k] = ''; });
  S.rooms.forEach(r => { if (r.settings && r.settings[k] === id) delete r.settings[k]; });
  if (S.job.defaults[k] === id) S.job.defaults[k] = fallback;
}
// Next or previous wall in the elevation, wrapping around the room.
function stepElev(dir) {
  // Short stubs with nothing on them (end caps drawn as walls) don't get an elevation of their own.
  const list = S.walls.filter(w => w.id === ui.elevWall || wg(w).L >= 12 || S.cabinets.some(c => c.wall === w.id)), n = list.length; if (!n) return;
  const i = list.findIndex(w => w.id === ui.elevWall);
  ui.elevWall = list[((i < 0 ? 0 : i + dir) % n + n) % n].id;
  if (ui.sel && ui.sel.type === 'cab') { const c = cab(ui.sel.id); if (c && c.wall !== ui.elevWall) ui.sel = null; }
  renderRoom();
}
function setView(id) {
  ui.viewMode = id; if (id !== '3d') ui.full3d = false; renderRoom();
  requestAnimationFrame(() => { if (id === 'plan') fitView(); else if (id === 'elev') renderElev(); else if (roomViewer) { roomViewer.resize(); buildRoom3D(); } });
}
document.addEventListener('pointerdown', e => { const m = $('#libmenu'); if (!m.hidden && !e.target.closest('#libmenu,#libbtn')) { m.hidden = true; const b = $('#libbtn'); if (b) b.setAttribute('aria-expanded', 'false'); } });
function designCabFrom(c) {
  return { sourceLib: c.libId, name: c.name, cat: c.cat, w: c.w, h: c.h, d: c.d, elev: c.elev, rows: clone(c.rows), params: { ...(c.libParams || {}), ...(c.params || {}) },
    construction: clone(c.construction || defaultConstruction(c.cat)), cabMatT: c.cabMatT, drawerMatT: c.drawerMatT, doorT: c.doorT, slide: c.slide, hinge: c.hinge, partT: c.partT || '', appliedL: panelMode(c, 'L') === 'on', appliedR: panelMode(c, 'R') === 'on', custom: clone(c.custom || []), inserts: clone(c.inserts || []), ...(c.corner ? { corner: clone(c.corner) } : {}) };
}
document.addEventListener('toggle', e => { if (e.target.id === 'rowsdetails') ui.rowsOpen = e.target.open; if (e.target.id === 'qelayouts') ui.qeLayouts = e.target.open; }, true);
document.addEventListener('change', e => {
  const inp = e.target.closest('input[data-tex]'); if (!inp || !inp.files[0]) return;
  readTexture(inp.files[0]).then(url => mutate(() => { const m = mat(inp.dataset.tex); m.texture = url; }), err => flash(err.message));
});
// Door designer: any preview size, and finding a style in a long gallery.
document.addEventListener('change', e => {
  if (e.target.id !== 'doorcw' && e.target.id !== 'doorch') return;
  const v = parseLen(e.target.value); if (!(v > 0)) { flash('Type a size, like 15 or 15 1/2.'); renderDoors(); return; }
  const [, , w, h] = doorPreviewSize();
  ui.doorCW = w; ui.doorCH = h; ui[e.target.id === 'doorcw' ? 'doorCW' : 'doorCH'] = Math.min(120, Math.max(4, v)); ui.doorPrev = 'custom'; renderDoors();
});
document.addEventListener('input', e => {
  if (e.target.id === 'libfind') {
    ui.libFind = e.target.value; renderSources();
    const f = $('#libfind'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
    return;
  }
  if (e.target.id !== 'doorfind') return;
  ui.doorFind = e.target.value; renderDoors();
  const f = $('#doorfind'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
});
document.addEventListener('change', e => {
  if (e.target.id !== 'lblsize') return;
  try { localStorage.setItem(KEY + '.lblsize', e.target.value); } catch (_) {}
  showLabels();
});
/* ---------- Saved 3D views: a named camera angle kept with the room ---------- */
function renderViews3d() {
  const el = $('#views3d'); if (!el) return;
  const vs = curRoom().views || [];
  if (!vs.some(v => v.id === ui.view3d)) ui.view3d = '';
  el.innerHTML = ui.viewNaming
    ? `<input type="text" id="view3d-name" value="${esc('View ' + (vs.length + 1))}" aria-label="Name for this view" maxlength="40"><button class="btn sm primary" data-act="view3d-ok">Save</button><button class="btn sm" data-act="view3d-cancel">Cancel</button>`
    : `<select id="view3d-pick" aria-label="Saved views"><option value="">${vs.length ? 'Views…' : 'No saved views'}</option>${vs.map(v => `<option value="${v.id}"${v.id === ui.view3d ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
      <button class="btn sm" data-act="view3d-save" title="Save this camera angle with the room">${icon('eye')}Save view</button>${ui.view3d ? `<button class="btn sm" data-act="view3d-del" title="Delete this saved view">${icon('trash')}</button>` : ''}`;
}
function saveView3d() {
  const v = roomViewer; if (!v || !v.ok) return;
  const r = curRoom(), name = ($('#view3d-name').value || '').trim().slice(0, 40) || 'View ' + ((r.views || []).length + 1);
  const old = (r.views || []).find(x => x.name.toLowerCase() === name.toLowerCase()), cam = v.getView();
  ui.viewNaming = false;
  // Saving under a name you already have moves that view to the new angle.
  mutate(() => {
    r.views = r.views || [];
    if (old) Object.assign(old, cam); else { const id = uid('v'); r.views.push({ id, name, ...cam }); ui.view3d = id; }
  });
  if (old) ui.view3d = old.id;
  renderViews3d(); flash(old ? `View "${name}" updated` : `Saved view "${name}"`);
}
document.addEventListener('change', e => {
  if (e.target.id !== 'view3d-pick') return;
  ui.view3d = e.target.value; const vw = (curRoom().views || []).find(x => x.id === ui.view3d);
  if (vw && roomViewer) roomViewer.setView(vw);
  renderViews3d();
});
document.addEventListener('keydown', e => {
  if (e.target.id !== 'view3d-name') return;
  if (e.key === 'Enter') { e.preventDefault(); saveView3d(); } else if (e.key === 'Escape') { e.stopPropagation(); ui.viewNaming = false; renderViews3d(); }
}, true);
// Click a library cabinet, then click a wall: one placement (Shift keeps placing). null stops.
function placeMode(id) {
  ui.placing = id; ui.drawWalls = false; ui.drawing = null; ui.typed = ''; ui.ghost = null; ui.fixtGhost = null; ui.ghostBlocked = false;
  if (id && ui.viewMode !== 'plan') { ui.viewMode = 'plan'; requestAnimationFrame(fitView); }
  if (ui.tab !== 'room') { ui.tab = 'room'; render(); requestAnimationFrame(() => renderRoom()); } else renderRoom();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.quick) { e.stopImmediatePropagation(); closeQuick(); } }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#labelsheet').hidden) closeLabels(); });
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
  if (jobs.shown) return;
  if ((e.ctrlKey || e.metaKey) && !typing) {
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); undoRedo(e.shiftKey ? 1 : -1); return; }
    if (e.key.toLowerCase() === 'y') { e.preventDefault(); undoRedo(1); return; }
  }
  if (typing || ui.tab !== 'room' || e.ctrlKey || e.metaKey || e.altKey || ui.quick) return;
  if (e.key === 'Enter' && ui.sel && ui.sel.type === 'cab' && !ui.drawWalls) { e.preventDefault(); openEditor(ui.sel.id); return; }
  if (ui.drawWalls && ui.drawing) {
    if (/^[0-9./\- ]$/.test(e.key) || (e.key === 'm' && ui.typed)) { e.preventDefault(); ui.typed += e.key; renderPlan(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); ui.typed = ui.typed.slice(0, -1); renderPlan(); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (ui.typed) commitWallSegment(); else stopWalls(); return; }
    if (e.key === 'Escape') { if (ui.typed) { ui.typed = ''; renderPlan(); } else stopWalls(); return; }
  }
  if (e.key === 'Escape' && !$('#ctxmenu').hidden) { hideCtx(); return; }
  if (e.key === 'Escape' && ui.topEdit) { ui.topEdit = null; renderPlan(); return; }
  if (e.key === 'Escape' && ui.drawMold) { stopMoldDraw(); return; }
  if (e.key === 'Escape' && ui.placeLight) { stopLightPlace(); return; }
  if (e.key === 'Escape') { if (ui.drawWalls) stopWalls(); else if (ui.placing) placeMode(null); else if (ui.full3d && ui.viewMode === '3d' && !ui.sel) toggleFull3d(false); else { ui.measure = null; select(null); } return; }
  if (e.key === 'w' || e.key === 'W') { if (ui.drawWalls) stopWalls(); else startWalls(); }
  else if (e.key === 'f' || e.key === 'F') toggleFull3d();
  else if ((e.key === 'o' || e.key === 'O') && ui.sel && ui.sel.type === 'cab') { const c = cab(ui.sel.id); if (c && openable(c)) setOpen([c.id]); }
  else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && ui.viewMode === 'elev') { e.preventDefault(); stepElev(e.key === 'ArrowLeft' ? -1 : 1); }
  else if (e.key === '1' || e.key === '2' || e.key === '3') setView(['plan', 'elev', '3d'][+e.key - 1]);
  else if ((e.key === 'Delete' || e.key === 'Backspace') && ui.sel) { e.preventDefault(); deleteSelected(); }
});
// Delete key and the touch bar's Delete: the picked cabinets, shape or wall (a wall takes what is on it).
function deleteSelected() {
  const many = typeof multiIds === 'function' ? multiIds() : [];
  if (many.length > 1) { mutate(() => { S.cabinets = S.cabinets.filter(c => !many.includes(c.id)); }); ui.multi = []; ui.sel = null; render(); flash(`Deleted ${many.length} cabinets`); return; }
  const s = ui.sel; if (!s) return; ui.sel = null;
  if (s.type === 'cab') mutate(() => { S.cabinets = S.cabinets.filter(c => c.id !== s.id); });
  else if (s.type === 'shape') mutate(() => { S.shapes = S.shapes.filter(x => x.id !== s.id); });
  else if (s.type === 'fixt') mutate(() => { S.fixtures = (S.fixtures || []).filter(x => x.id !== s.id); });
  else if (s.type === 'wall') mutate(() => { S.walls = S.walls.filter(w => w.id !== s.id); S.cabinets = S.cabinets.filter(c => c.wall !== s.id); S.shapes = S.shapes.filter(x => x.wall !== s.id); S.fixtures = (S.fixtures || []).filter(x => x.wall !== s.id); });
  render();
}
// Ends whatever drawing or placing is going on (walls, a cabinet being placed, molding or tops, lights, a top's shape).
const drawingNow = () => !!(ui.drawWalls || ui.placing || ui.drawMold || ui.placeLight || ui.topEdit);
function stopDrawing() {
  if (ui.drawWalls) stopWalls();
  if (ui.placing) placeMode(null);
  if (ui.drawMold) stopMoldDraw();
  if (ui.placeLight) stopLightPlace();
  if (ui.topEdit) { ui.topEdit = null; hideCtx(); render(); }
}
// Tapping or clicking anywhere outside the drawing (menus, panels, the library) ends drawing, as Esc does.
document.addEventListener('pointerdown', e => {
  if (!drawingNow() || ui.tab !== 'room' || !e.isPrimary || e.button > 0) return;
  const t = e.target; if (!t.closest) return;
  if (t.closest('#plan,#elev,#room3d,#hint,#drawctl,.viewctl,.zoomctl,#ctxmenu,.menu,.qe,dialog,#flash,.toast')) return;
  // Picking a cabinet in the library while placing switches to it; dragging one in works as before.
  if (ui.placing && t.closest('.rail')) return;
  stopDrawing();
}, true);
window.addEventListener('resize', () => { if (ui.tab === 'room') { if (ui.viewMode === 'plan') renderPlan(); if (ui.viewMode === 'elev') renderElev(); } });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (ui.tab === 'room' && roomViewer) buildRoom3D(); });

/* ---------- Boot ---------- */
(async function boot() {
  S = await loadState();
  await loadPrices();
  try { const t = localStorage.getItem(KEY + '.tab'); if (t && TABS.some(x => x[0] === t)) ui.tab = t; } catch (_) {}
  try { const d = JSON.parse(localStorage.getItem(KEY + '.dims')); if (d) ui.dims = { ...ui.dims, ...d }; } catch (_) {}
  try { const t = JSON.parse(localStorage.getItem(KEY + '.ptab')); if (t) ui.ptab = { ...ui.ptab, ...t }; } catch (_) {}
  try { const t = JSON.parse(localStorage.getItem(KEY + '.paramFold')); if (t && typeof t === 'object') ui.paramFold = t; } catch (_) {}
  try { const t = JSON.parse(localStorage.getItem(KEY + '.doorFold')); if (t && typeof t === 'object') ui.doorFold = t; } catch (_) {}
  try { ui.dockOpen = localStorage.getItem(KEY + '.dock') === '1'; } catch (_) {}
  // The Products tree opens with every group closed; folders inside keep how they were left.
  ui.libFold = Object.fromEntries([...LIB_GROUPS, FIXT_GROUP].map(([g]) => [g, true]).concat(FIXT_FOLDERS.map(f => ['fixt/' + f, true])));
  try { ui.railShut = localStorage.getItem(KEY + '.rail') === '1'; ui.libFold = JSON.parse(localStorage.getItem(KEY + '.fold') || '{}'); [...LIB_GROUPS, FIXT_GROUP].forEach(([g]) => ui.libFold[g] = true); FIXT_FOLDERS.forEach(f => { if (!(('fixt/' + f) in ui.libFold)) ui.libFold['fixt/' + f] = true; }); ui.propsShut = localStorage.getItem(KEY + '.side') !== '0'; const ly = JSON.parse(localStorage.getItem(KEY + '.layers') || 'null'); if (ly) { ui.layers = ly.layers || {}; ui.wallOp = ly.wallOp ?? 1; ui.cutaway = !!ly.cutaway; } } catch (_) {}
  try { ui.render3d = localStorage.getItem(KEY + '.render') === '1'; } catch (_) {}
  initPlan(); initElev();
  $('#quickedit').addEventListener('pointerdown', e => { if (e.target.id === 'quickedit') closeQuick(); });
  $('#roomsel').addEventListener('change', e => {
    const v = e.target.value;
    if (v === '__add') { addRoom(); ui.sel = null; if (roomViewer) roomViewer.fitted = false; goTab('room'); startWalls(); flash('New room. Click in the plan to start drawing walls.'); }
    else switchRoom(v);
  });
  new ResizeObserver(() => { if (ui.tab === 'room' && ui.viewMode === 'plan') renderPlan(); }).observe($('#plan'));
  new ResizeObserver(() => { if (ui.tab === 'room' && ui.viewMode === 'elev') renderElev(); }).observe($('#elev'));
  render();
  requestAnimationFrame(() => { if (ui.tab === 'room') fitView(); });
})();
document.addEventListener('change', e => {
  if (e.target.id !== 'itemsel' || !e.target.value) return;
  const v = e.target.value, sh = v.startsWith('shape:') ? shapeById(v.slice(6)) : null, c = sh ? null : cab(v);
  if (sh) { select({ type: 'shape', id: sh.id }); ui.elevWall = sh.wall; } else if (c) { select({ type: 'cab', id: c.id }); ui.elevWall = c.wall; }
  ui.measure = null; renderRoom();
});
document.addEventListener('change', e => { if (e.target.id === 'edgridstyle') ui.edGridStyle = e.target.value; });
document.addEventListener('pointerdown', e => { const d = $('#layers3d'); if (d && d.open && !e.target.closest('#layers3d')) d.open = false; });
