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
const deskQuery = matchMedia('(min-width: 961px) and (min-height: 561px), (min-width: 961px) and (pointer: fine)');
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
      <div class="ib-small">${openable(c) ? `<button data-act="open-toggle" data-id="${id}" aria-pressed="${!!ui.open[id]}" title="Open or close its doors and drawers (O)">${icon('open')}${ui.open[id] ? 'Close' : 'Open'}</button>` : ''}<button data-act="cab-dup" data-id="${id}" title="Duplicate">${icon('copy')}Copy</button>${rehingeable(c) ? `<button data-act="cab-rehinge" data-id="${id}" title="Swap the door hinges to the ${hingeNow(c) === 'L' ? 'right' : 'left'} side (H)">${icon('flip')}Hinge</button>` : ''}<button data-act="cab-flip" data-id="${id}" title="Move it to the other side of the wall">${icon('flip')}Flip</button><button class="danger" data-act="cab-del" data-id="${id}" title="Delete (Del)">${icon('trash')}Delete</button></div>`
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
function setDesignScale() {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const u = Math.max(0.62, Math.min(innerWidth / 1920, innerHeight / 1080)) / z;
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
function fitDock() {
  const el = document.getElementById('dock'); if (!el || !deskUI() || ui.tab !== 'room') return;
  const body = el.querySelector('.dockbody'), inner = body && body.firstElementChild;
  if (body && inner) {
    let fit = body.querySelector(':scope > .dockfit');
    if (!fit) { fit = document.createElement('div'); fit.className = 'dockfit'; while (body.firstChild) fit.appendChild(body.firstChild); body.appendChild(fit); }
    fit.style.zoom = 1; body.classList.remove('scroll');
    const cs = getComputedStyle(body), aw = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), ah = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const w = fit.scrollWidth, h = fit.scrollHeight;
    // Room-wide tabs (long tables) only shrink so far, then scroll up and down; the item bar always fits.
    const lo = ui.dock === 'item' || ui.dock === 'ends' ? 0.3 : 0.7;
    let z = Math.min(1.35, aw / w, ah / h);
    if (z < lo) { z = Math.min(1, aw / w); body.classList.add('scroll'); }
    fit.style.zoom = Math.max(0.3, z).toFixed(3);
  }
  const head = el.querySelector('.dockhead'), tabs = head && head.querySelector('.docktabs');
  if (head && tabs) { tabs.style.zoom = 1; const z = Math.min(1, (head.clientHeight - 8) / tabs.scrollHeight); tabs.style.zoom = Math.max(0.4, z).toFixed(3); }
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
    if (typeof redrawView === 'function') redrawView();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  const unhook = onAllFingersUp(up);
});
document.addEventListener('dblclick', e => {
  if (!(e.target.closest && e.target.closest('.dockgrip'))) return;
  try { localStorage.removeItem(DOCK_KEY()); } catch (_) {} applyDockH(); fitDock(); if (typeof redrawView === 'function') redrawView();
});
addEventListener('resize', () => requestAnimationFrame(fitDock));

// How solid the countertops look in the plan: 0 hides them, 100 covers the cabinets (remembered on this computer).
function topOp() { if (ui.topOp === undefined) { let v = 30; try { const s = localStorage.getItem((typeof KEY === 'string' ? KEY : 'cd') + '.topop'); if (s !== null) v = +s; } catch (_) {} ui.topOp = v; } return ui.topOp / 100; }
const topOpRow = () => `<label class="topop">Tops in the plan <input type="range" id="topop" min="0" max="100" step="5" value="${Math.round(topOp() * 100)}" aria-label="How solid tops look in the plan"><b id="topopv">${topOp() ? Math.round(topOp() * 100) + '%' : 'Hidden'}</b></label>`;
document.addEventListener('input', e => {
  if (e.target.id !== 'topop') return;
  ui.topOp = +e.target.value; try { localStorage.setItem((typeof KEY === 'string' ? KEY : 'cd') + '.topop', String(ui.topOp)); } catch (_) {}
  $('#topopv').textContent = ui.topOp ? ui.topOp + '%' : 'Hidden'; if (ui.viewMode === 'plan') renderPlan();
});

/* ----- Soffits: a boxed-in drop from the ceiling along a wall. Shown in plan, elevation and 3D. ----- */
// room.soffits: [{ id, wall, side, from, len (0 = to the end of the wall), drop, depth }]; from is measured from the viewer's left.
const soffitsOf = () => (curRoom().soffits || []);
function soffitSpan(s) {
  const w = wall(s.wall); if (!w) return null;
  const L = wg(w).L, from = Math.max(0, Math.min(L, +s.from || 0)), len = +s.len > 0 ? Math.min(+s.len, L - from) : L - from;
  return { w, L, from, len, a0: elevSide(w) === 1 ? from : L - from - len, drop: +s.drop > 0 ? +s.drop : 12, depth: +s.depth > 0 ? +s.depth : 14, top: w.height || 96 };
}
function soffitsPlanSVG() {
  return soffitsOf().map(s => { const k = soffitSpan(s); if (!k) return ''; const g = wg(k.w), f = k.w.thick / 2, sd = s.side || elevSide(k.w);
    return `<polygon class="p-soffit nss" points="${polyPts([wallPt(k.w, g, sd, k.a0, f), wallPt(k.w, g, sd, k.a0 + k.len, f), wallPt(k.w, g, sd, k.a0 + k.len, f + k.depth), wallPt(k.w, g, sd, k.a0, f + k.depth)])}"/>`; }).join('');
}
function soffitsElevSVG(w, side, L) {
  return soffitsOf().filter(s => s.wall === w.id && (s.side || elevSide(w)) === side).map(s => { const k = soffitSpan(s); if (!k) return '';
    return `<rect class="ev-soffit nss" x="${k.from}" y="${-k.top}" width="${k.len}" height="${k.drop}"/>`; }).join('');
}
function soffits3d(v, material) {
  soffitsOf().forEach(s => { const k = soffitSpan(s); if (!k) return; const g = wg(k.w), f = k.w.thick / 2, sd = s.side || elevSide(k.w);
    const a = wallPt(k.w, g, sd, k.a0 + k.len / 2, f + k.depth / 2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(k.len, k.drop, k.depth), material);
    m.position.set(a.x, k.top - k.drop / 2, a.y); m.rotation.y = -Math.atan2(g.u.y, g.u.x); m.userData.noBounds = true; m.userData.wall = true; v.root.add(m); });
}
// Bottom panel Room tab: the ceiling (height, slope) and the soffits, in one place.
function roomDockBody() {
  const rm = curRoom(), ws = S.walls, cur = wall(ui.elevWall) || ws[0];
  const rows = soffitsOf().map(s => { const R = 'soffit:' + s.id;
    return `<tr><td>${ctl(R, 'wall', s.wall, 'select', { label: 'Wall', options: ws.map(w => ({ v: w.id, l: wallName(w) })) })}</td><td>${ctl(R, 'from', s.from || 0, 'len', { label: 'From left' })}</td><td>${ctl(R, 'len', s.len || '', 'len', { label: 'Length', ph: 'Whole wall', blank: true })}</td><td>${ctl(R, 'drop', s.drop ?? 12, 'len', { label: 'Drop from ceiling' })}</td><td>${ctl(R, 'depth', s.depth ?? 14, 'len', { label: 'Depth off the wall' })}</td><td><button class="btn sm danger" data-act="soffit-del" data-id="${s.id}" aria-label="Delete soffit">${icon('trash')}</button></td></tr>`; }).join('');
  return `<div class="roomdock">${typeof ceilingBox === 'function' ? ceilingBox(rm) : ''}
    <div class="psec box">${secHead('wall', 'Soffits', 'slate')}
      <table class="t soffitt"><thead><tr><th>Wall</th><th>From left</th><th>Length</th><th>Drop</th><th>Depth</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">None yet.</td></tr>'}</tbody></table>
      <div class="row-actions"><button class="btn sm" data-act="soffit-add"${cur ? '' : ' disabled'}>${icon('plus')}Add soffit${cur ? ' on ' + esc(wallName(cur)) : ''}</button></div></div>
    <div class="psec box">${secHead('wall', 'Walls', 'teal')}<div class="note show">Change the room's corners and wall lengths point by point.</div><div class="row-actions"><button class="btn sm" data-act="walls-shape"${ws.length ? '' : ' disabled'}>${icon('edit')}Edit walls in the shape editor</button></div></div></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act="soffit-add"],[data-act="soffit-del"]'); if (!b) return;
  e.stopPropagation();
  if (b.dataset.act === 'soffit-add') { const w = wall(ui.elevWall) || S.walls[0]; if (!w) return; mutate(() => { const r = curRoom(); (r.soffits = r.soffits || []).push({ id: uid('sf'), wall: w.id, side: elevSide(w), from: 0, len: 0, drop: 12, depth: 14 }); }); }
  else mutate(() => { const r = curRoom(); r.soffits = (r.soffits || []).filter(s => s.id !== b.dataset.id); });
}, true);

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
