// Main screen (Room) from Ayden's UI design: view bar icons, the item bar under the drawing and its position tools.
'use strict';
// View bar icons, from Ayden's view icon set. Teal ones are the Draw tools.
const VIEW_ICONS = {
  Plan: '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M3 8h6V3M13 17v-5h4"/>',
  Elevation: '<path d="M2.5 17h15"/><rect x="4" y="9" width="5" height="8"/><rect x="11" y="9" width="5" height="8"/><rect x="4" y="3" width="12" height="4"/>',
  '3D': '<path d="M10 2.5l6.5 3.7v7.6L10 17.5l-6.5-3.7V6.2z"/><path d="M3.5 6.2L10 10l6.5-3.8M10 10v7.5"/>',
  Dimensions: '<path d="M2.5 13.5l11-11 4 4-11 11z"/><path d="M6 10l1.5 1.5M8.5 7.5L10 9M11 5l1.5 1.5"/>',
  Walls: '<path d="M3 16.5V5h14"/><circle class="dot" cx="17" cy="5" r="1.6"/><circle class="dot" cx="3" cy="16.5" r="1.6"/>',
  Molding: '<path d="M2.5 13.5l11-11 4 4-11 11z"/><path d="M6 10l1.5 1.5M8.5 7.5L10 9M11 5l1.5 1.5"/>',
  Tops: '<path d="M3 16.5V4h14v5H8.5v7.5z"/><circle class="dot" cx="17" cy="4" r="1.6"/>',
  'Open all': '<path d="M4 3.5h7v13H4z"/><path d="M11 3.5l5 2v11l-5-1"/><circle class="dot" cx="9" cy="10" r=".6"/>',
};
const vic = k => `<svg class="vic${['Walls', 'Molding', 'Tops'].includes(k) ? ' teal' : ''}" viewBox="0 0 20 20" aria-hidden="true">${VIEW_ICONS[k] || ''}</svg>`;
// The desktop layout from the design; phones and narrow windows keep their own layout.
// Width only: on a phone or tablet the on-screen keyboard makes the window shorter, and switching
// layouts then would close the keyboard the moment it opened.
const deskQuery = matchMedia('(min-width: 961px)');
const deskUI = () => deskQuery.matches;
deskQuery.addEventListener('change', () => { if (ui.tab === 'room') renderRoom(); });

// Space between a cabinet and whatever is next to it (another cabinet, an end cap or the wall), by the viewer's end.
const gapDir = (c, end) => (c.side === 1) === (end === 'L') ? -1 : 1;
function openGap(c, end) {
  const dir = gapDir(c, end), n = nearestAt(c, dir), { lo, hi } = runLimits(c);
  const toWall = dir < 0 ? c.off - lo : hi - (c.off + c.w);
  return Math.max(0, n ? Math.min(n.gap, toWall) : toWall);
}
// Nothing but the wall on that side: the opening is the wall, so it works like From left / From right.
const gapIsWall = (c, end) => Math.abs(openGap(c, end) - fromEnd(c, end)) < 0.01;
function setOpenGap(c, end, v) { c.off = r3(c.off - gapDir(c, end) * (v - openGap(c, end))); }

// Item bar: the selected cabinet's position on its wall, its size, and the automatic fillers and panels.
function itemBar(c) {
  const L = lay(), id = c && c.id, onWall = !!(c && c.wall);
  const posOk = onWall, pos = (label, ref, end, val) => `<label class="ib-f"><span>${label}</span>${posOk ? ctl(ref + id, end, r3(val), 'len', { label }) : `<input type="text" disabled aria-label="${label}">`}</label>`;
  // Push left, center, push right: small drawn arrows that say what they do (Mozaik's |<- T ->| buttons).
  const PUSH = {
    L: '<path d="M3 3v14M17 10H7m4-4-4 4 4 4"/>', R: '<path d="M17 3v14M3 10h10m-4-4 4 4-4 4"/>',
    O: '<path d="M2 4v12M18 4v12M10 5v10M6 10H4m12 0h-2"/>', U: '<path d="M3 3h14M10 17V7m-4 4 4-4 4 4"/>', W: '<path d="M2 3v14M18 3v14M5 10h10m-7-3-3 3 3 3m4-6 3 3-3 3"/>'
  };
  const ctr = (act, k, t) => `<button class="ib-ctr" data-act="${act}" data-id="${id || ''}" title="${t}" aria-label="${t}"${posOk ? '' : ' disabled'}><svg viewBox="0 0 20 20" aria-hidden="true">${PUSH[k]}</svg></button>`;
  let slide = '';
  if (posOk) {
    const { lo, hi } = runLimits(c), span = Math.max(0, r3(hi - lo - c.w));
    slide = `<input type="range" class="ib-slide" data-slide="${id}" min="0" max="${span}" step="0.125" value="${r3(fromEnd(c, 'L'))}" aria-label="Slide along the wall" title="Slide it along the wall">`;
  } else slide = '<input type="range" class="ib-slide" disabled aria-label="Slide along the wall">';
  const R = c ? 'cab:' + id : '';
  const sz = (label, f) => `<label class="ib-f"><span>${label}</span>${c ? ctl(R, f, f === 'outset' ? c.outset || 0 : c[f], 'len', { label }) : `<input type="text" disabled aria-label="${label}">`}</label>`;
  const tog = (k, label) => `<label class="ib-tog"><span>${label}</span>${ctl('layout', k, L[k], 'bool', { label })}<i aria-hidden="true"></i></label>`;
  // Nothing picked: no empty boxes, just what to do next (Mozaik shows only its item picker here).
  if (!c) {
    const n = multiIds().length;
    return `<div class="itembar none ib-empty">
    <div class="ib-hint">${typeof multiWIds === 'function' && multiWIds().length > 1 ? `<b>${multiWIds().length} walls picked.</b> Change their ceiling height and thickness together in the side panel. Shift or Ctrl click adds or takes out a wall.` : n > 1 ? `<b>${n} items picked.</b> Edit them together in the side panel. <button class="btn sm" data-act="cab-shift-up" data-id="" title="Move every picked cabinet up to the ceiling, ${fmtLen(ceilGap())}&quot; below it">Shift all up</button>` : S.cabinets.length ? '<b>Click a cabinet</b> to edit it, or <b>drag a product</b> onto the drawing.' : (S.walls.length ? '<b>Drag a product</b> from the library onto a wall to start.' : '<b>Draw the walls</b> first (W), then drag products from the library onto them.')}</div>
    <div class="ib-togs">${tog('autoFillers', 'Fillers')}${tog('autoPanels', 'Panels')}${tog('fridgePanels', 'Fridge panels')}${tog('autoLights', 'Ceiling lights')}</div>
  </div>`;
  }
  return `<div class="itembar">
    <div class="ib-pos">
      ${pos('Left opening', 'cabgap:', 'L', c ? openGap(c, 'L') : 0)}<span class="ib-ctrs ib-ctrs-row1">${ctr('cab-push-L', 'L', 'Push it left, against its neighbour')}${ctr('cab-shift-up', 'U', `Shift up to the ceiling line (${fmtLen(ceilGap())}&quot; off the ceiling, Off ceiling box under Size)`)}${ctr('cab-push-R', 'R', 'Push it right, against its neighbour')}</span>${pos('Right opening', 'cabgap:', 'R', c ? openGap(c, 'R') : 0)}
      ${pos('From left wall', 'cabpos:', 'L', c ? fromEnd(c, 'L') : 0)}<span class="ib-ctrs ib-ctrs-row2">${ctr('cab-center-open', 'O', 'Center it in the opening')}${ctr('cab-center', 'W', 'Center it on the whole wall')}</span>${pos('From right wall', 'cabpos:', 'R', c ? fromEnd(c, 'R') : 0)}
      <div class="ib-slidewrap">${slide}</div>
    </div>
    <div class="ib-size">${sz('Width', 'w')}${sz('Height', 'h')}${sz('Elevation', 'elev')}${ceilCell()}${sz('Depth', 'd')}${sz('Outset', 'outset')}${finEndsCell(c)}</div>
    <div class="ib-togs">${tog('autoFillers', 'Auto fillers')}${tog('autoPanels', 'Auto panels')}${tog('fridgePanels', 'Auto fridge panels')}${tog('autoLights', 'Auto ceiling lights')}</div>
    <div class="ib-acts">${c ? `<button class="ib-edit" data-act="ed-open" data-id="${id}" title="Open this cabinet in the cabinet editor (Enter)">${icon('edit')}<span>Edit ${esc(LBL[c.id] || '')}</span></button>
      <div class="ib-small"><button data-act="cab-dup" data-id="${id}" title="Duplicate">${icon('copy')}Copy</button><button data-act="cab-autofill" data-id="${id}" title="Fill the empty space on this wall with cabinets like this one, split evenly">${icon('ends')}Autofill</button>${cornerBtn(c)}${finIntBtn(c)}${falseBtn(c)}${typeof pocketBtn === 'function' ? pocketBtn(c) : ''}<button data-act="cab-flip" data-id="${id}" title="Move it to the other side of the wall">${icon('flip')}Flip</button>${rehingeable(c) ? `<button data-act="cab-rehinge" data-id="${id}" title="Swap the door hinges to the ${hingeNow(c) === 'L' ? 'right' : 'left'} side, so it swings the other way (H)">${icon('door')}Rehinge</button>` : ''}<button class="danger" data-act="cab-del" data-id="${id}" title="Delete (Del)">${icon('trash')}Delete</button></div>${c.wall && conflicts(c) ? `<div class="ib-ovl" title="It runs into a wall or another piece. It shows red in the plan and is listed on Print, the CNC card and the quote until it's fixed.">${icon('hint')}Overlaps.<span class="ib-ovl2"> Fix before sending.</span></div>` : ''}`
      : `<div class="ib-name">${multiIds().length > 1 ? `${multiIds().length} items picked. Edit them together in the side panel.` : 'Pick a cabinet to size, place and edit it here.'}</div>`}</div>
  </div>`;
}

// Finished interior on/off for the picked cabinet (Ayden 2026-11-19): the parts you see inside are cut from the
// room's Finish material (build.js), never from the door style. Same switch as the editor's Interior tab.
function finIntBtn(c) {
  const on = !!c.finInt, fm = typeof finishMat === 'function' ? mat(finishMat(c)) : null, fn = fm ? fm.name : 'the finish material';
  return `<button data-act="cab-finint" data-id="${c.id}" aria-pressed="${on}" title="${on ? `Finished interior is on: the inside is cut from ${esc(fn)}. Click to turn it off.` : `Make the inside finished: sides, top, bottom, shelves and dividers are cut from ${esc(fn)}.`}">${icon('shelf')}Fin. inside</button>`;
}
// The picked appliance, fixture or shape, for the same item bar as a cabinet.
function xItem() {
  const s = ui.sel; if (!s) return null;
  if (s.type === 'fixt') { const o = fixtById(s.id); return o && { k: 'fixt', o }; }
  if (s.type === 'shape') { const o = shapeById(s.id); return o && { k: 'shp', o }; }
  return null;
}
// Stands in for a cabinet so the wall-end math (runLimits, fromEnd) works on appliances and shapes.
function xProxy(o) {
  const b = o.pts ? shapeBox(o.pts) : null, flat = o.pts && o.plane === 'flat';
  return { id: o.id, wall: o.wall, side: o.side || 1, off: o.off || 0, w: b ? b.w : o.w, d: Math.max(1, b ? (flat ? b.h : o.thick) : o.d || 0), h: b ? (flat ? o.thick : b.h) : o.h, elev: o.elev || 0, outset: o.outset || 0 };
}
// Item bar for a non-cabinet: the same place-on-the-wall tools and size boxes as a cabinet, and its own buttons.
function itemBarX(x) {
  const o = x.o, id = o.id, fx = x.k === 'fixt', R = (fx ? 'fixt:' : 'shp:') + id, P = (fx ? 'fixtpos:' : 'shppos:') + id, w = wall(o.wall);
  const px = w ? xProxy(o) : null, { lo, hi } = px ? runLimits(px) : { lo: 0, hi: 0 };
  const box = (label, ref, f, val) => `<label class="ib-f"><span>${label}</span>${ctl(ref, f, val, 'len', { label })}</label>`;
  const pos = (label, end) => `<label class="ib-f"><span>${label}</span>${px ? ctl(P, end, r3(fromEnd(px, end)), 'len', { label }) : `<input type="text" disabled aria-label="${label}">`}</label>`;
  const span = px ? Math.max(0, r3(hi - lo - px.w)) : 0;
  const ctr = `<span class="ib-ctrs"><button class="ib-ctr" data-act="x-center" data-id="${x.k}:${id}" title="Center it on the wall" aria-label="Center it on the wall"${px ? '' : ' disabled'}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 3v14M18 3v14M5 10h10m-7-3-3 3 3 3m4-6 3 3-3 3"/></svg></button></span>`;
  const sizes = fx ? `${box('Width', R, 'w', o.w)}${fixtSink(o) ? box('Front to back', R, 'd', o.d) : box('Height', R, 'h', o.h)}${fixtHole(o) ? box(o.kind === 'window' ? 'Bottom of casing' : 'Off the floor', R, 'elev', o.elev || 0) : ''}${doorType(o) ? `<label class="ib-f ib-wide"><span>Door type</span>${ctl(R, 'dtype', doorType(o), 'select', { options: ROOM_DOOR_TYPES.map(({ v, l }) => ({ v, l })), label: 'Door type' })}</label>${(d => d ? `<label class="ib-f"><span>${d.label}</span>${ctl(R, 'swing', doorSideVal(o), 'select', { options: d.options, label: d.label })}</label>` : '')(doorSideOpts(o))}` : ''}${fixtFloor(o) ? box('Depth', R, 'd', o.d) : ''}${fixtLoose(o) || fixtHung(o) ? box(fixtHung(o) ? 'Bottom off floor' : 'Off the floor', R, 'elev', o.elev || 0) : ''}`
    : `${box(o.plane === 'flat' ? 'Bottom height' : 'Off the floor', R, 'elev', o.elev || 0)}${box('Out from wall', R, 'outset', o.outset || 0)}${typeof shapeLeg === 'function' && shapeLeg(o) ? `${box('Width', R, 'legW', r3(shapeBox(o.pts).w))}${box('Depth', R, 'thick', o.thick)}${box('Height', R, 'legH', r3(shapeBox(o.pts).h))}` : box('Thickness', R, 'thick', o.thick)}${o.plane === 'upright' && typeof postDoorOpts === 'function' ? `<label class="ib-f"><span>Leg door style</span>${ctl(R, 'postDoor', o.postDoor || '', 'select', { options: postDoorOpts(o), label: 'Leg door style (miter-folded)' })}</label>` : ''}`;
  const name = fx ? fixtName(o) : o.name || 'Shape', kind = fx ? ((fixtPreset(o.lib) || {}).folder || fixtDef(o).name) : 'Shape';
  const sb = (act, ic, l, t, cls = '') => `<button class="${cls}" data-act="${act}" data-id="${id}" title="${t}">${icon(ic)}${l}</button>`;
  return `<div class="itembar xbar">
    <div class="ib-pos">${pos('From left wall', 'L')}${ctr}${pos('From right wall', 'R')}
      <div class="ib-slidewrap"><input type="range" class="ib-slide" data-xslide="${x.k}:${id}" min="0" max="${span}" step="0.125" value="${px ? r3(fromEnd(px, 'L')) : 0}" aria-label="Slide along the wall" title="Slide it along the wall"${px ? '' : ' disabled'}></div></div>
    <div class="ib-size">${sizes}</div>
    <div class="ib-acts"><div class="ib-name"><span class="chip shape">${esc(kind)}</span> <b>${esc(name)}</b></div>
      ${fx ? '' : `<button class="ib-edit" data-act="shape-edit" data-id="${id}" title="Change its outline in the shape editor">${icon('edit')}<span>Edit shape</span></button>`}
      <div class="ib-small">${fx ? (fixtSink(o) ? sb('fixt-center', 'ends', 'Center', 'Center on the cabinet under it') : sb('fixt-flip', 'flip', doorHasLeaf(o) && !['pocket', 'bypass'].includes(doorType(o)) ? 'Swing' : 'Flip', 'Flip it to the other side')) + (PANEL_KINDS.includes(o.kind) ? sb('fixt-panels', 'door', o.panels ? 'Panels on' : 'Panels', 'Panel fronts in the room\'s door style, cut from the Finish', o.panels ? 'on' : '') : '') + (o.panels && rehingeable(fixtPanelCab(o)) ? `<button data-act="cab-rehinge" data-fixt="${id}" title="Swap its panel door's hinge to the other side">${icon('door')}Rehinge</button>` : '') + sb('fixt-dup', 'copy', 'Copy', 'Duplicate') + sb('fixt-del', 'trash', 'Delete', 'Delete')
        : sb('shape-flip', 'flip', 'Flip', 'Flip it to the other side') + sb('shape-dup', 'copy', 'Copy', 'Duplicate') + sb('shape-del', 'trash', 'Delete', 'Delete')}</div></div>
  </div>`;
}
// Sliding an appliance or shape: it follows live, and one undo step is saved when it is let go.
let xSlideWas = null;
const xSlideObj = el => { const [k, xid] = el.dataset.xslide.split(':'); return k === 'fixt' ? fixtById(xid) : shapeById(xid); };
document.addEventListener('input', e => {
  const el = e.target; if (!el.matches || !el.matches('.ib-slide[data-xslide]')) return;
  const o = xSlideObj(el); if (!o) return;
  if (!xSlideWas || xSlideWas.id !== o.id) xSlideWas = { id: o.id, off: o.off };
  const px = xProxy(o); setFromEnd(px, 'L', +el.value); o.off = px.off;
  if (ui.viewMode === 'plan') renderPlan(); else if (ui.viewMode === 'elev') renderElev();
});
document.addEventListener('change', e => {
  const el = e.target; if (!el.matches || !el.matches('.ib-slide[data-xslide]')) return;
  const o = xSlideObj(el); if (!o) return;
  const v = +el.value; if (xSlideWas && xSlideWas.id === o.id) o.off = xSlideWas.off; xSlideWas = null;
  mutate(() => { const px = xProxy(o); setFromEnd(px, 'L', v); o.off = px.off; });
});

// Sliding: the cabinet follows the slider live, and one undo step is saved when it is let go.
let slideWas = null;
document.addEventListener('input', e => {
  const el = e.target; if (!el.matches || !el.matches('.ib-slide[data-slide]')) return;
  const c = cab(el.dataset.slide); if (!c) return;
  if (!slideWas || slideWas.id !== c.id) slideWas = { id: c.id, off: c.off };
  setFromEnd(c, 'L', +el.value);
  if (ui.viewMode === 'plan') renderPlan(); else if (ui.viewMode === 'elev') renderElev();
});
document.addEventListener('change', e => {
  const el = e.target; if (!el.matches || !el.matches('.ib-slide[data-slide]')) return;
  const c = cab(el.dataset.slide); if (!c) return;
  const v = +el.value; if (slideWas && slideWas.id === c.id) c.off = slideWas.off; slideWas = null;
  mutate(() => { setFromEnd(c, 'L', v); const want = c.off; if (!settle(c)) { c.off = want; const n = overlapSay(c); if (n) flash(n); } });
});
// The job name box wraps over two lines; Enter saves it instead of starting a new line.
document.addEventListener('keydown', e => { if (e.target.id === 'jobname' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
// The design scales as one piece with the window, like the design tool's "Scale with screen":
// one design pixel is min(width / 1920, height / 1080) of the window, never smaller than 0.62.
// Touch screens: the keyboard shortens the window while typing; keep the height it had without it
// (tallest seen at this width), so the screen doesn't shrink and jump under the finger.
const tallAt = {};
function screenH() {
  if (!matchMedia('(pointer: coarse)').matches) return innerHeight;
  return (tallAt[innerWidth] = Math.max(innerHeight, tallAt[innerWidth] || 0));
}
// Tablets: the same design drawn bigger (as if the screen were 1500 x 1000), so buttons, fields and
// text are big enough for a finger. Only on touch screens; a computer with a mouse is unchanged.
const touchScreen = () => matchMedia('(pointer: coarse)').matches;
function setDesignScale() {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const [dw, dh] = touchScreen() ? [1500, 1000] : [1920, 1080];
  const u = Math.max(0.62, Math.min(innerWidth / dw, screenH() / dh)) / z;
  document.documentElement.style.setProperty('--u', u.toFixed(4) + 'px');
  document.body && document.body.classList.toggle('desk', deskUI());
}
addEventListener('resize', setDesignScale);
deskQuery.addEventListener('change', setDesignScale);
setDesignScale();

// Panel under the drawing: drag its top edge to make it taller or shorter (remembered), and its
// contents shrink or grow to fit it, so it never needs scroll bars. Double-click the edge to reset.
const DOCK_KEY = () => (typeof KEY === 'string' ? KEY : 'cd') + '.dockh5';
// The panel can be dragged as short or tall as you like (down to a thin strip); its contents
// always scale to fit. Heights saved back when the panel scrolled instead of scaling are dropped (key .dockh2).
function dockMinH() { return 40; }
// The height you dragged it to is kept; when the window is too short for it the panel only borrows
// a smaller height (at most 70% of the room) and goes back to yours as soon as the window has room again.
// (It used to overwrite your height, so a minimized or briefly small hub window left the panel tiny for good.)
// Starting height of the panel under the drawing: the item bar at its set size, in screen pixels.
const DOCK_H = 120;
function applyDockH() {
  // No drag handle on the desktop main screen any more (0.56.9): the panel is always its set height.
  let h = 0; if (!deskUI()) try { h = +localStorage.getItem(DOCK_KEY()) || 0; } catch (_) {}
  const room = document.getElementById('tab-room'); if (!room) return;
  const rh = room.getBoundingClientRect().height, max = rh * 0.7;
  // A minimized or hidden window has no room to measure: keep the height you chose.
  if (rh > 100 && deskUI()) {
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
    const want = h > 0 ? h : DOCK_H;
    if (want > max) { room.style.setProperty('--dockh', Math.round(Math.max(dockMinH(), max)) + 'px'); return; }
  }
  if (h > 0) room.style.setProperty('--dockh', h + 'px');
  // Touch screens start with a taller panel, so the fields in it come out big enough to tap.
  else if (deskUI()) room.style.setProperty('--dockh', DOCK_H + 'px');
  else room.style.removeProperty('--dockh');
}
// The panel's contents stay one set, readable size (Ayden 2026-11-18: "instead of having it scale just have it
// be one set readable size"). Nothing zooms; a panel too short or narrow for its contents scrolls.
let dockKeep = { k: '', h: 0 };
function fitDock(el = document.getElementById('dock')) {
  if (typeof ui === 'undefined' || !el || !deskUI() || ui.tab !== 'room') return;
  const body = el.querySelector('.dockbody');
  if (body) { body.classList.add('scroll'); body.querySelectorAll(':scope > .dockfit').forEach(f => { f.style.zoom = ''; f.style.width = ''; }); }
  const tabs = el.querySelector('.dockhead .docktabs'); if (tabs) tabs.style.zoom = '';
  // A narrow window wraps the item bar onto a second row: the panel grows to show it (unless you dragged its height),
  // up to half the room, so Edit, Copy and Delete never hide behind a scroll bar.
  const saved = 0;
  const room = document.getElementById('tab-room');
  // Hidden panel: just the thin strip.
  if (el.isConnected && room && el.classList.contains('dmin')) {
    const h = 36;
    if (Math.abs(h - el.getBoundingClientRect().height) > 2) { room.style.setProperty('--dockh', h + 'px'); if (typeof relayoutView === 'function') requestAnimationFrame(relayoutView); }
    return;
  }
  if (el.isConnected && body && room && !saved) {
    // Nothing picked on the Item tab: the panel drops to a thin strip (Ayden 2026-11-24: "less of the screen when
    // nothing is selected") and grows back to the item bar's height when something is picked.
    const slim = body.classList.contains('dock-item') && !!body.querySelector('.ib-empty');
    const base = slim ? dockMinH() : DOCK_H;
    const was = room.style.getPropertyValue('--dockh'); room.style.setProperty('--dockh', base + 'px');
    const head = el.querySelector('.dockhead'), r = el.getBoundingClientRect().height;
    // The tab list beside it must fit too (all nine tabs, no scroll bar).
    let need = Math.max(r + body.scrollHeight - body.clientHeight, head ? r + head.scrollHeight - head.clientHeight : 0);
    // Item tab with something picked: the tallest height seen at this panel size is kept, so switching from one
    // item to another never moves the drawing (Ayden 2026-11-20).
    if (body.classList.contains('dock-item') && !slim) {
      const key = Math.round(body.clientWidth) + 'x' + Math.round(room.getBoundingClientRect().height);
      if (dockKeep.k !== key) dockKeep = { k: key, h: 0 };
      need = dockKeep.h = Math.max(dockKeep.h, need);
    }
    room.style.setProperty('--dockh', was || DOCK_H + 'px');
    // Every other tab stays about as short as the item bar (Ayden 2026-11-24: the tabs "take up so much of the
    // screen its insane"): at most 30% of the room (never under 200px); anything longer scrolls inside the panel.
    const rh = room.getBoundingClientRect().height;
    const cap = body.classList.contains('dock-item') ? rh * 0.6 : Math.min(rh * 0.6, Math.max(200, rh * 0.3));
    const h = Math.round(Math.min(cap, Math.max(base, need)));
    if (Math.abs(h - el.getBoundingClientRect().height) > 2) { room.style.setProperty('--dockh', h + 'px'); if (typeof relayoutView === 'function') requestAnimationFrame(relayoutView); }
  }
}
// tmp is the panel's new content built off screen; it gets the same wrapping and zoom as the real one.
function dockExtras(tmp, el = tmp) {
  applyDockH();
  if (!tmp.querySelector('.dockgrip')) tmp.insertAdjacentHTML('afterbegin', '<div class="dockgrip" title="Drag to resize this panel. Double-click to reset." aria-hidden="true"></div>');
  if (tmp !== el) fitDock(tmp);
  requestAnimationFrame(() => { watchDock(); fitDock(); });
}
document.addEventListener('pointerdown', e => {
  const g = e.target.closest && e.target.closest('.dockgrip'); if (!g || !deskUI()) return;
  e.preventDefault();
  const room = document.getElementById('tab-room'), dock = document.getElementById('dock'), y0 = e.clientY, h0 = dock.getBoundingClientRect().height;
  const max = room.getBoundingClientRect().height * 0.7;
  document.body.classList.add('dockdrag');
  const move = ev => { const h = Math.round(Math.max(dockMinH(), Math.min(max, h0 + (y0 - ev.clientY)))); room.style.setProperty('--dockh', h + 'px'); fitDock(); };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); unhook(); document.body.classList.remove('dockdrag');
    try { localStorage.setItem(DOCK_KEY(), String(Math.round(dock.getBoundingClientRect().height))); } catch (_) {}
    dockRefit();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  const unhook = onAllFingersUp(up);
});
document.addEventListener('dblclick', e => {
  if (!(e.target.closest && e.target.closest('.dockgrip'))) return;
  try { localStorage.removeItem(DOCK_KEY()); } catch (_) {} applyDockH(); fitDock(); dockRefit();
});
// Whenever the panel itself changes size (the window, the top bar, fonts or pictures finishing loading,
// the hub resizing its frame), fit its contents again so they never stay shrunk from an early measurement.
let dockRO = null, dockROel = null, dockROsz = '';
function watchDock() {
  const d = document.getElementById('dock'); if (!d || typeof ResizeObserver !== 'function' || d === dockROel) return;
  if (dockRO) dockRO.disconnect();
  dockROel = d; dockROsz = '';
  dockRO = new ResizeObserver(() => {
    const r = d.getBoundingClientRect(), sz = Math.round(r.width) + 'x' + Math.round(r.height);
    if (sz === dockROsz) return; dockROsz = sz; requestAnimationFrame(() => fitDock());
  });
  dockRO.observe(d);
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(() => fitDock()));
addEventListener('load', () => requestAnimationFrame(() => fitDock()));
// After the panel changes height the drawing gets a new size, so fit the room in it again.
function dockRefit() { requestAnimationFrame(() => { fitDock(); if (ui.viewMode === 'plan' && typeof fitView === 'function') fitView(); if (typeof relayoutView === 'function') relayoutView(); }); }
// A saved panel height never takes more than 70% of the room, even after the window gets smaller.
addEventListener('resize', () => requestAnimationFrame(() => { applyDockH(); fitDock(); }));

// How solid the countertops look in the plan: 0 hides them, 100 covers the cabinets (remembered on this computer).
function topOp() { if (ui.topOp === undefined) { let v = 30; try { const s = localStorage.getItem((typeof KEY === 'string' ? KEY : 'cd') + '.topop'); if (s !== null) v = +s; } catch (_) {} ui.topOp = v; } return ui.topOp / 100; }
const topOpRow = () => `<label class="topop">Tops in the plan <input type="range" id="topop" min="0" max="100" step="5" value="${Math.round(topOp() * 100)}" aria-label="How solid tops look in the plan"><b id="topopv">${topOp() ? Math.round(topOp() * 100) + '%' : 'Hidden'}</b></label>`;
document.addEventListener('input', e => {
  if (e.target.id !== 'topop') return;
  ui.topOp = +e.target.value; try { localStorage.setItem((typeof KEY === 'string' ? KEY : 'cd') + '.topop', String(ui.topOp)); } catch (_) {}
  $('#topopv').textContent = ui.topOp ? ui.topOp + '%' : 'Hidden'; if (ui.viewMode === 'plan') renderPlan();
});

/* ----- Ceiling gap: uppers and talls stay this far below the ceiling (room standard, 3" to start). ----- */
function ceilGap(rm) { const g = ((rm || curRoom()).ceiling || {}).gap; return g === undefined || g === '' ? 3 : Math.max(0, +g || 0); }
// The lowest the ceiling gets over a cabinet's footprint, following a sloped ceiling.
function ceilOver(c) {
  const w = wall(c.wall); if (!w) return Infinity;
  // With no ceiling height set, the ceiling is the tallest wall in the room (as the Ceiling box says), never the wall
  // the cabinet stands on: an island's back or a half wall is short, and its cabinets must not be cut down to it.
  const cl = roomCeiling(), H = +cl.h > 0 ? +cl.h : (Math.max(0, ...S.walls.map(x => +x.height || 0)) || w.height || 96), slope = cl.slope && cl.slope !== 'none' ? cl.slope : null;
  const poly = cabPoly(c); if (!slope || !poly) return H;
  const pts = []; S.walls.forEach(x => pts.push([x.x1, x.y1], [x.x2, x.y2]));
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const low = +cl.low > 0 ? +cl.low : 48, run = +cl.run > 0 ? +cl.run : 60;
  const at = q => { const d = slope === 'N' ? q.y - y0 : slope === 'S' ? y1 - q.y : slope === 'W' ? q.x - x0 : x1 - q.x; return d >= run ? H : low + (H - low) * Math.max(0, d) / run; };
  return Math.min(...poly.map(at));
}
// Highest a cabinet's top may go.
function ceilMax(c) { return ceilOver(c) - ceilGap(); }
// Keep a cabinet under the line: uppers move down, cabinets on the floor get shorter.
function keepOffCeiling(c) {
  const max = ceilMax(c); if (!(c.elev + c.h > max + 0.001)) return false;
  if (c.elev > 0 && c.cat !== 'Tall') c.elev = r3(Math.max(0, max - c.h));
  if (c.elev + c.h > max + 0.001) c.h = r3(Math.max(6, max - c.elev));
  return true;
}
// Shift up: the cabinet's top goes up to the ceiling line (the room's "Cabinets off the ceiling" gap below the
// ceiling, following a slope). Floor cabinets lift off the floor too. A cabinet too tall to fit stays on the floor.
function shiftUp(c) {
  const max = ceilMax(c); if (!isFinite(max)) return false;
  const e = r3(Math.max(0, max - c.h)); if (Math.abs(e - (c.elev || 0)) < 0.001) return false;
  c.elev = e; return true;
}
// Item bar cell under Width: the room's ceiling gap that Shift up (arrow above the push arrows) stops at.
// Shelves (the mitre fold floating shelf, open shelf units): which ends are finished, one click to change (0.58.36).
function finEndsCell(c) {
  const e = typeof shelfEnds === 'function' ? shelfEnds(c) : null;
  return e ? `<div class="ib-f ib-fin"><span>Finished ends</span>${mozEndsSeg(c, e)}</div>` : '';
}
function ceilCell() {
  return `<div class="ib-f ib-ceil"><span title="Room setting: cabinets stay this far below the ceiling (room for crown molding). Same as Room tab › Ceiling.">Off ceiling</span><div class="ib-ceilrow">${ctl('rceil', 'gap', ceilGap(), 'len', { label: 'Cabinets off the ceiling (room setting)' })}</div></div>`;
}
function keepAllOffCeiling() { (S.cabinets || []).forEach(keepOffCeiling); }
// The height all of this room's walls share, or '' when they differ (the Wall height box then shows Mixed).
function wallsHeight() {
  const hs = [...new Set((S.walls || []).map(w => r3(+w.height || 96)))];
  return hs.length === 1 ? hs[0] : hs.length ? '' : (curRoom() || {}).wallHeight || 96;
}
// Bottom panel Room tab: the ceiling (height, slope, gap above the cabinets) and the walls.
function roomDockBody() {
  const rm = curRoom(), ws = S.walls;
  return `<div class="roomdock">${typeof ceilingBox === 'function' ? ceilingBox(rm) : ''}
    <div class="psec box">${secHead('wall', 'Walls', 'teal')}<div class="autogrid">${fld('Wall height', 'rwalls', 'h', wallsHeight(), 'len', { blank: true, ph: 'Mixed' })}</div><div class="note show">Wall height sets every wall in this room. Change the room's corners and wall lengths point by point.</div><div class="row-actions"><button class="btn sm" data-act="walls-shape"${ws.length ? '' : ' disabled'}>${icon('edit')}Edit walls in the shape editor</button></div></div></div>`;
}

/* ----- Edit the room's walls in the shape editor: each point is a corner, each edge a wall. ----- */
// Walls are put in order corner to corner. Each point remembers the wall that starts at it (w) and whether that wall
// runs the other way (rev), so walls keep their cabinets. A point added on an edge makes a new wall.
function wallChain() {
  const ws = S.walls.slice(); if (!ws.length) return null;
  const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.5, ends = w => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }];
  // Start at a wall end no other wall touches (an open room), else anywhere (a closed room).
  const free = (w, i) => !ws.some(k => k !== w && ends(k).some(p => same(p, ends(w)[i])));
  let start = ws.find(w => free(w, 0)), at;
  if (start) at = ends(start)[0]; else { start = ws.find(w => free(w, 1)); at = start ? ends(start)[1] : null; }
  if (!start) { start = ws[0]; at = ends(start)[0]; }
  const pts = [], used = new Set(); let cur = start;
  while (cur && !used.has(cur)) {
    used.add(cur); const e = ends(cur), r = !same(e[0], at); pts.push({ x: r3(at.x), y: r3(at.y), w: cur.id, rev: r });
    at = r ? e[0] : e[1];
    cur = ws.find(k => !used.has(k) && ends(k).some(p => same(p, at)));
  }
  if (used.size !== ws.length) return null; // walls that do not join up in one run
  const closed = same(at, pts[0]);
  if (!closed) pts.push({ x: r3(at.x), y: r3(at.y) });
  return { pts, closed };
}
function editWallsShape() {
  const ch = wallChain(); if (!ch) { flash('The walls need to join up corner to corner in one run to edit them as a shape.'); return; }
  ui.desMode = 'shape'; ui.shapeSel = null;
  mutate(() => { S.shapeDesign = { sourceLib: null, editShape: null, forWalls: { room: S.roomId, closed: ch.closed }, name: curRoom().name + ' walls', plane: 'flat', pts: ch.pts, thick: 0.75, mat: S.materials[0].id }; });
  goTab('designer');
}
function wallShapePage(d, selBox, rows, b) {
  const open = !d.forWalls.closed;
  return `<div class="pagehead"><div><button class="linkbtn back" data-act="se-walls-cancel">${icon('back')}Back to the room</button><h2>Walls of ${esc(curRoom().name)}</h2><p>Each point is a corner and each edge is a wall, seen from above.${open ? ` The dashed edge is the open side of the room.` : ''}</p></div>
    <div class="row-actions"><button class="btn" data-act="se-walls-cancel">Cancel</button><button class="btn primary" data-act="se-walls-save">${icon('check')}Save walls</button></div></div>
  ${seMz(d, '', rows, b, selBox, '', 'Corners and walls', `${fmtLen(b.w, 1)} × ${fmtLen(b.h, 1)} overall`)}`;
}
function saveWallsShape() {
  const d = S.shapeDesign, fw = d && d.forWalls; if (!fw) return;
  const rm = S.rooms.find(r => r.id === fw.room); if (!rm) return;
  if (rm.id !== S.roomId) switchRoom(rm.id);
  const P = d.pts, n = P.length, edges = fw.closed ? n : n - 1;
  mutate(() => {
    const keep = new Set(), touched = [];
    for (let i = 0; i < edges; i++) {
      const a = P[i], b = P[(i + 1) % n]; if (Math.hypot(a.x - b.x, a.y - b.y) < 0.25) continue;
      let w = a.w && !keep.has(a.w) && wall(a.w);
      if (!w) { const like = S.walls[0] || {}; w = { id: uid('w'), x1: 0, y1: 0, x2: 0, y2: 0, thick: like.thick ?? (curRoom().wallThick ?? S.job.wallThick), height: like.height ?? (curRoom().wallHeight ?? 96) }; S.walls.push(w); }
      // A wall keeps its own direction, so its cabinets stay on the same side and the same distance from its start.
      const [p, q] = a.rev && a.w === w.id ? [b, a] : [a, b];
      w.x1 = r3(p.x); w.y1 = r3(p.y); w.x2 = r3(q.x); w.y2 = r3(q.y); keep.add(w.id); touched.push(w.id);
    }
    // Walls whose corners were taken out go, with what was on them.
    const gone = S.walls.filter(w => !keep.has(w.id)).map(w => w.id);
    if (gone.length) { S.walls = S.walls.filter(w => keep.has(w.id)); S.cabinets = S.cabinets.filter(c => !gone.includes(c.wall)); }
    S.cabinets.filter(c => touched.includes(c.wall)).forEach(c => { if (typeof settle === 'function') settle(c); });
    S.shapeDesign = blankShapeDesign();
  });
  goTab('room'); requestAnimationFrame(() => { if (typeof fitView === 'function') fitView(); });
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act="walls-shape"],[data-act="se-walls-save"],[data-act="se-walls-cancel"]'); if (!b) return;
  e.stopPropagation();
  const a = b.dataset.act;
  if (a === 'walls-shape') editWallsShape();
  else if (a === 'se-walls-save') saveWallsShape();
  else { mutate(() => { S.shapeDesign = blankShapeDesign(); }); goTab('room'); }
}, true);

// Rehinge: single doors swap their hinge side. Pairs of doors have nothing to swap.
// 0.62.4: False front (Ayden 2026-11-24, the cooktop base and sink bases): every front stays as drawn but is glued on.
function falseBtn(c) {
  if (!c || c.moz || c.made || !(c.rows || []).some(r => r.type === 'door' || r.type === 'drawer')) return '';
  const on = c.falseFront === 'on';
  return `<button data-act="cab-false" data-id="${c.id}" aria-pressed="${on}" title="${on ? 'False fronts are on: the fronts look the same but are glued on, with no hinges, slides, drawer boxes, shelves or inserts. Click to turn them off.' : 'Make every front a false front: it looks the same, but hinges, slides, drawer boxes, shelves and inserts come out of the cut list, hardware and price.'}">${icon('box')}False front</button>`;
}
function hingeRows(c) { return (c && c.rows || []).filter(r => r.type === 'door' && (r.count | 0) <= 1); }
// 0.62.4 (Ayden 2026-11-24: "a rehinge option so it can swap what side the door swings from"): appliance panel fronts
// (fridges) rehinge too: every single door on them (not one of a pair). Their pull moves to the other edge.
function apSingles(c) {
  if (!c || c.made !== 'apfront' || typeof apFronts !== 'function') return [];
  const fr = apFronts(c);
  return fr.map((q, i) => ({ q, i })).filter(({ q }) => q.type !== 'drawer' && q.h >= 20 && !fr.some(o => o !== q && Math.abs(o.z - q.z) < 0.5 && Math.abs(o.h - q.h) < 0.5));
}
function rehingeable(c) { return hingeRows(c).length > 0 || apSingles(c).length > 0; }
function hingeNow(c) {
  const a = apSingles(c)[0]; if (a) return a.q.hinge === 'R' ? 'R' : 'L';
  const r = hingeRows(c)[0]; return r && (r.hinge === 'L' || r.hinge === 'R') ? r.hinge : effParams(c).hingeSide;
}
function rehinge(c) {
  if (!rehingeable(c)) { flash('This has no single doors to rehinge.'); return; }
  const to = hingeNow(c) === 'L' ? 'R' : 'L';
  mutate(() => {
    hingeRows(c).forEach(r => { r.hinge = to; });
    const sg = apSingles(c); if (!sg.length) return;
    c.mp = c.mp || {};
    if (!(c.mp.fr || []).length) c.mp.hinge = to; else sg.forEach(({ i }) => { if (c.mp.fr[i]) c.mp.fr[i].hinge = to; });
  });
  flash(`Hinged on the ${to === 'L' ? 'left' : 'right'}`);
}
// A fridge's panel front, for Rehinge on the fridge itself.
const fixtPanelCab = f => f && S.cabinets.find(k => k.made === 'apfront' && k.fixt === f.id);
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act="cab-rehinge"]'); if (!b) return;
  e.stopPropagation(); rehinge(b.dataset.fixt ? fixtPanelCab(fixtById(b.dataset.fixt)) : cab(b.dataset.id));
}, true);
document.addEventListener('keydown', e => {
  if ((e.key !== 'h' && e.key !== 'H') || e.ctrlKey || e.metaKey || e.altKey || !ui.sel || ui.sel.type !== 'cab') return;
  const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const c = cab(ui.sel.id); if (c && rehingeable(c)) { e.preventDefault(); rehinge(c); }
});

