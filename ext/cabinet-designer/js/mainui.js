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
  const ctr = (act, n, t) => `<button class="ib-ctr" data-act="${act}" data-id="${id || ''}" title="${t}" aria-label="${t}"${posOk ? '' : ' disabled'}>${n}</button>`;
  let slide = '';
  if (posOk) {
    const { lo, hi } = runLimits(c), span = Math.max(0, r3(hi - lo - c.w));
    slide = `<input type="range" class="ib-slide" data-slide="${id}" min="0" max="${span}" step="0.125" value="${r3(fromEnd(c, 'L'))}" aria-label="Slide along the wall" title="Slide it along the wall">`;
  } else slide = '<input type="range" class="ib-slide" disabled aria-label="Slide along the wall">';
  const R = c ? 'cab:' + id : '';
  const sz = (label, f) => `<label class="ib-f"><span>${label}</span>${c ? ctl(R, f, f === 'outset' ? c.outset || 0 : c[f], 'len', { label }) : `<input type="text" disabled aria-label="${label}">`}</label>`;
  const tog = (k, label) => `<label class="ib-tog"><span>${label}</span>${ctl('layout', k, L[k], 'bool', { label })}<i aria-hidden="true"></i></label>`;
  return `<div class="itembar${c ? '' : ' none'}">
    <div class="ib-pos">
      ${pos('Left opening', 'cabgap:', 'L', c ? openGap(c, 'L') : 0)}${ctr('cab-center-open', 1, 'Center it in the opening')}${pos('Right opening', 'cabgap:', 'R', c ? openGap(c, 'R') : 0)}
      ${pos('From left wall', 'cabpos:', 'L', c ? fromEnd(c, 'L') : 0)}${ctr('cab-center', 2, 'Center it on the whole wall')}${pos('From right wall', 'cabpos:', 'R', c ? fromEnd(c, 'R') : 0)}
      <div class="ib-slidewrap">${slide}</div>
    </div>
    <div class="ib-size">${sz('Width', 'w')}${sz('Height', 'h')}${sz('Elevation', 'elev')}<span class="ib-gap"></span>${sz('Depth', 'd')}${sz('Outset', 'outset')}</div>
    <div class="ib-togs">${tog('autoFillers', 'Automatic fillers')}${tog('autoPanels', 'Automatic panels')}</div>
    <div class="ib-acts">${c ? `<button class="ib-edit" data-act="ed-open" data-id="${id}" title="Open this cabinet in the cabinet editor (Enter)">${icon('edit')}<span>Edit ${esc(LBL[c.id] || '')}</span></button>
      <div class="ib-small"><button data-act="cab-dup" data-id="${id}" title="Duplicate">${icon('copy')}Copy</button>${rehingeable(c) ? `<button data-act="cab-rehinge" data-id="${id}" title="Swap the door hinges to the ${hingeNow(c) === 'L' ? 'right' : 'left'} side (H)">${icon('flip')}Hinge</button>` : ''}<button data-act="cab-flip" data-id="${id}" title="Move it to the other side of the wall">${icon('flip')}Flip</button><button class="danger" data-act="cab-del" data-id="${id}" title="Delete (Del)">${icon('trash')}Delete</button></div>`
      : `<div class="ib-name">${multiIds().length > 1 ? `${multiIds().length} items picked. Edit them together in the side panel.` : 'Pick a cabinet to size, place and edit it here.'}</div>`}</div>
  </div>`;
}

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
  mutate(() => { const was = c.off; setFromEnd(c, 'L', v); if (!settle(c)) { c.off = was; flash('There is no room for it there.'); } });
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
function setDesignScale() {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const u = Math.max(0.62, Math.min(innerWidth / 1920, screenH() / 1080)) / z;
  document.documentElement.style.setProperty('--u', u.toFixed(4) + 'px');
  document.body && document.body.classList.toggle('desk', deskUI());
}
addEventListener('resize', setDesignScale);
deskQuery.addEventListener('change', setDesignScale);
setDesignScale();

// Panel under the drawing: drag its top edge to make it taller or shorter (remembered), and its
// contents shrink or grow to fit it, so it never needs scroll bars. Double-click the edge to reset.
const DOCK_KEY = () => (typeof KEY === 'string' ? KEY : 'cd') + '.dockh';
function applyDockH() {
  let h = 0; try { h = +localStorage.getItem(DOCK_KEY()) || 0; } catch (_) {}
  const room = document.getElementById('tab-room'); if (!room) return;
  if (h > 0) room.style.setProperty('--dockh', h + 'px'); else room.style.removeProperty('--dockh');
}
// The panel keeps its normal size whatever its height: a taller panel shows more, a shorter one
// scrolls. Its contents wrap to the width so nothing runs off the side.
function fitDock() {
  const el = document.getElementById('dock'); if (!el || !deskUI() || ui.tab !== 'room') return;
  const body = el.querySelector('.dockbody'), inner = body && body.firstElementChild;
  if (body && inner) {
    let fit = body.querySelector(':scope > .dockfit');
    if (!fit) { fit = document.createElement('div'); fit.className = 'dockfit'; while (body.firstChild) fit.appendChild(body.firstChild); body.appendChild(fit); }
    fit.style.zoom = ''; fit.style.width = '';
    const bar = fit.querySelector('.itembar'); if (bar) bar.classList.add('ib-wrap');
    body.classList.add('scroll');
  }
  const tabs = el.querySelector('.dockhead .docktabs'); if (tabs) tabs.style.zoom = '';
}
function dockExtras(el) {
  applyDockH();
  if (!el.querySelector('.dockgrip')) el.insertAdjacentHTML('afterbegin', '<div class="dockgrip" title="Drag to resize this panel. Double-click to reset." aria-hidden="true"></div>');
  requestAnimationFrame(fitDock);
}
document.addEventListener('pointerdown', e => {
  const g = e.target.closest && e.target.closest('.dockgrip'); if (!g || !deskUI()) return;
  e.preventDefault();
  const room = document.getElementById('tab-room'), dock = document.getElementById('dock'), y0 = e.clientY, h0 = dock.getBoundingClientRect().height;
  const max = room.getBoundingClientRect().height * 0.7;
  document.body.classList.add('dockdrag');
  const move = ev => { const h = Math.round(Math.max(70, Math.min(max, h0 + (y0 - ev.clientY)))); room.style.setProperty('--dockh', h + 'px'); fitDock(); };
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
// After the panel changes height the drawing gets a new size, so fit the room in it again.
function dockRefit() { requestAnimationFrame(() => { fitDock(); if (ui.viewMode === 'plan' && typeof fitView === 'function') fitView(); if (typeof redrawView === 'function') redrawView(); }); }
// A saved panel height never takes more than 70% of the room, even after the window gets smaller.
addEventListener('resize', () => requestAnimationFrame(() => {
  const room = document.getElementById('tab-room'), dock = document.getElementById('dock');
  if (room && dock && deskUI()) { const max = room.getBoundingClientRect().height * 0.7; if (dock.getBoundingClientRect().height > max + 1) room.style.setProperty('--dockh', Math.round(max) + 'px'); }
  fitDock();
}));

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
  const cl = roomCeiling(), H = +cl.h > 0 ? +cl.h : (w.height || 96), slope = cl.slope && cl.slope !== 'none' ? cl.slope : null;
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
function keepAllOffCeiling() { (S.cabinets || []).forEach(keepOffCeiling); }
// Bottom panel Room tab: the ceiling (height, slope, gap above the cabinets) and the walls.
function roomDockBody() {
  const rm = curRoom(), ws = S.walls;
  return `<div class="roomdock">${typeof ceilingBox === 'function' ? ceilingBox(rm) : ''}
    <div class="psec box">${secHead('wall', 'Walls', 'teal')}<div class="note show">Change the room's corners and wall lengths point by point.</div><div class="row-actions"><button class="btn sm" data-act="walls-shape"${ws.length ? '' : ' disabled'}>${icon('edit')}Edit walls in the shape editor</button></div></div></div>`;
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
  return `<div class="pagehead"><div><button class="linkbtn back" data-act="se-walls-cancel">${icon('back')}Back to the room</button><h2>Walls of ${esc(curRoom().name)}</h2><p>Each point is a corner and each edge is a wall, seen from above. Drag corners or type exact wall lengths. A point added on an edge splits that wall in two.${open ? ` The edge from the last point back to point 1 is the open side of the room, not a wall.` : ''} Round corners and bulges are ignored.</p></div>
    <div class="row-actions"><button class="btn" data-act="se-walls-cancel">Cancel</button><button class="btn primary" data-act="se-walls-save">${icon('check')}Save walls</button></div></div>
  <div class="designer shapedes">
    <div class="card stack cardbody des-form">${selBox}
      <div class="eyebrow">Corners and walls</div>
      <div class="tscroll"><table class="t setable"><thead><tr><th>Pt</th><th>x</th><th>y</th><th>Round</th><th>Edge</th><th>Length</th><th>Bulge</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row-actions"><button class="btn sm" data-act="se-split" data-id="${d.pts.length - 1}">${icon('plus')}Add a corner</button></div>
    </div>
    <div class="stack"><div class="card cardbody stack"><div class="se-stage">${shapeEditorSVG(d)}</div><div class="note">${fmtLen(b.w, 1)} × ${fmtLen(b.h, 1)} overall</div></div></div>
  </div>`;
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
function hingeRows(c) { return (c && c.rows || []).filter(r => r.type === 'door' && (r.count | 0) <= 1); }
function rehingeable(c) { return hingeRows(c).length > 0; }
function hingeNow(c) { const r = hingeRows(c)[0]; return r && (r.hinge === 'L' || r.hinge === 'R') ? r.hinge : effParams(c).hingeSide; }
function rehinge(c) {
  if (!rehingeable(c)) { flash('This cabinet has no single doors to rehinge.'); return; }
  const to = hingeNow(c) === 'L' ? 'R' : 'L';
  mutate(() => hingeRows(c).forEach(r => { r.hinge = to; }));
  flash(`Hinged on the ${to === 'L' ? 'left' : 'right'}`);
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act="cab-rehinge"]'); if (!b) return;
  e.stopPropagation(); rehinge(cab(b.dataset.id));
}, true);
document.addEventListener('keydown', e => {
  if ((e.key !== 'h' && e.key !== 'H') || e.ctrlKey || e.metaKey || e.altKey || !ui.sel || ui.sel.type !== 'cab') return;
  const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const c = cab(ui.sel.id); if (c && rehingeable(c)) { e.preventDefault(); rehinge(c); }
});

