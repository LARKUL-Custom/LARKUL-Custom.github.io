// Drawings for Print (libs2.js): a dimensioned elevation of every wall with the cabinet numbers, the floor plan
// of each room and 3D pictures, as landscape pages the builders can read. Lists (cut list, hardware) stay in libs2.js.
'use strict';

// Page drawing area in CSS pixels: the preset's paper less the margins, the title block and (elevations) the cabinet list.
function printArea(kind) {
  const pg = typeof mpPaper === 'function' ? mpPaper() : { iw: 10.3, ih: 7.8 };
  return { w: Math.round(pg.iw * 96), h: Math.round(Math.max(2, pg.ih - (kind === 'elev' ? 1.55 : 1.05)) * 96) };
}

// Draws with nothing picked, dragged, opened or zoomed, so the paper shows the job and not the screen.
function printQuiet(fn) {
  const K = ['sel', 'multi', 'dropCab', 'ghost', 'ghostLib', 'fixtGhost', 'shapeGhost', 'ghostBlocked', 'measure', 'drawWalls', 'drawMold', 'moldFrom', 'guides', 'open', 'elevZ', 'placing', 'mouse', 'drag', 'dims', 'px', 'elevPx', 'elevL', 'chainDim', 'placeLight', 'topEdit', 'printing'];
  const keep = {}; K.forEach(k => { keep[k] = ui[k]; });
  Object.assign(ui, { sel: null, multi: [], dropCab: null, ghost: null, fixtGhost: null, shapeGhost: null, ghostBlocked: false, measure: null, drawWalls: false, drawMold: false, moldFrom: null, guides: null, open: {}, elevZ: null, placing: null, mouse: null, drag: null, dims: { ...(ui.dims || {}), cab: true, fronts: false }, chainDim: null, placeLight: false, topEdit: null, printing: true });
  try { return fn(); } finally { K.forEach(k => { ui[k] = keep[k]; }); }
}

// The wall sides of a room that have something to show: cabinets, appliances or shapes, or a door or window.
function printWallSides(room) {
  return withRoom(room, () => S.walls.flatMap(w => {
    const on = sd => S.cabinets.some(c => c.wall === w.id && c.side === sd) || (S.shapes || []).some(s => s.wall === w.id && s.side === sd) || fixtList().some(f => f.wall === w.id && f.side === sd && !fixtHole(f));
    const main = elevSide(w), sides = [main, -main].filter(on);
    if (!sides.length && fixtList().some(f => f.wall === w.id)) sides.push(main);
    return sides.map(side => ({ w, side, name: wallName(w) + (side !== main ? ' (other side)' : '') }));
  }));
}

const elevFx = (f, L, side) => side === 1 ? f.off : L - f.off - f.w;
// One wall side's elevation as a page: the drawing with its dimensions, and the cabinets on it listed by number.
function printElevPage(room, { w, side, name }, head) {
  return withRoom(room, () => printQuiet(() => {
    const d = renderElev({ wall: w, side, ...printArea('elev') }); if (!d) return '';
    const L = wg(w).L, cs = S.cabinets.filter(c => c.wall === w.id && c.side === side).sort((a, b) => (a.cat === 'Wall') - (b.cat === 'Wall') || elevX(a, L) - elevX(b, L));
    const list = cs.map(c => `<div class="mp-cab"><b>${esc(LBL[c.id] || '')}</b> ${esc(c.name)} <span>${fmtLen(c.w)} W × ${fmtLen(c.h)} H × ${fmtLen(c.d)} D${printNote(c.notes) ? ' · ' + esc(printNote(c.notes).split('\n')[0]) : ''}</span></div>`).join('')
      // The appliances on this wall too (fridge, range, dishwasher, sink), so the builders know the openings they need.
      + fixtList().filter(f => f.wall === w.id && f.side === side && !fixtHole(f)).sort((a, b) => elevFx(a, L, side) - elevFx(b, L, side))
        .map(f => `<div class="mp-cab mp-fx"><b>Appliance</b> ${esc(fixtName(f))} <span>${fmtLen(f.w)} W × ${fmtLen(f.h)} H${f.d ? ' × ' + fmtLen(f.d) + ' D' : ''}</span></div>`).join('');
    return `<section class="mp-page land mp-draw">${head(room.name, name + ' · ' + fmtLen(L, 1))}
      <svg class="mp-svg" viewBox="${d.vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(name)} elevation">${d.html}</svg>
      ${list ? `<div class="mp-cabs">${list}</div>` : ''}</section>`;
  }));
}

// The room's floor plan, framed to fit the page, with the wall names and cabinet numbers.
function printPlanPage(room, head) {
  return withRoom(room, () => printQuiet(() => {
    const pts = [];
    S.walls.forEach(w => pts.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }));
    S.cabinets.forEach(c => { const p = cabPoly(c); if (p) pts.push(...p); });
    if (!pts.length) return '';
    let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
    const pad = 30; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const PA = printArea('plan'), ar = PA.h / PA.w; let vw = x1 - x0; if ((y1 - y0) / vw > ar) vw = (y1 - y0) / ar;
    const view = { x: (x0 + x1) / 2 - vw / 2, y: (y0 + y1) / 2 - vw * ar / 2, w: vw, h: vw * ar };
    const d = renderPlan({ view, ...PA }); if (!d) return '';
    return `<section class="mp-page land mp-draw">${head(room.name, 'Floor plan')}<svg class="mp-svg" viewBox="${d.vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(room.name)} floor plan">${d.html}</svg></section>`;
  }));
}

// 3D pictures come from one hidden viewer, so the room on screen keeps its camera.
let printViewer = null;
const printPics = {};
function printViewer3D() {
  if (!has3D()) return null;
  if (!printViewer) {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1500px;height:1000px;pointer-events:none';
    document.body.appendChild(host); printViewer = new Viewer3D(host);
    printViewer.requestRender = () => {};
  }
  return printViewer.ok ? printViewer : null;
}
// The room's saved 3D views, or one view from the front corner when none are saved.
const print3DViews = room => (room.views || []).length ? room.views : [{ id: 'iso', name: '3D view' }];
// o.real: the realistic look (the cover picture); o.aspect: width / height of the box the picture goes in.
function print3DShot(room, vw, o = {}) {
  const v = printViewer3D(); if (!v) return null;
  const W = 1600, H = Math.round(W / (o.aspect || 1.5));
  v.host.style.width = W + 'px'; v.host.style.height = H + 'px';
  return withRoom(room, () => printQuiet(() => {
    // Printed 3D keeps the walls but cuts away the ones between the camera and the cabinets, and drops the ceiling.
    const keep = [ui.layers, ui.cutaway, ui.wallOp]; ui.layers = { ...(ui.layers || {}), walls: true, ceiling: false, ...(o.wall ? { labels: true, fasteners: false } : {}) }; ui.cutaway = true; ui.wallOp = 1;
    const real = o.real ?? !!ui.render3d;
    R3 = real;
    try { buildRoomScene(v); } finally { R3 = false; [ui.layers, ui.cutaway, ui.wallOp] = keep; }
    if (!real) v.setBackground('#ffffff');
    if (!o.wall) printCutaway(v);
    v.resize();
    // o.wall (installer drawings): straight at one wall side, turned a little, framed on that wall's cabinets.
    if (o.wall) printWallCam(v, o.wall, o.aspect || 1.5);
    else if (vw.pos) v.setView(vw); else view3dPreset(v, 'iso');
    // o.fit (the cover): with no saved view, frame the whole kitchen (cabinets, tops and the walls left after the
    // cutaway, not the floor) so all of it fits the picture with a small margin and nothing is cut off.
    if (o.fit && !vw.pos) printFitAll(v, o.aspect || 1.5);
    if (real) v.fitShadow();
    v.draw();
    const url = v.renderer.domElement.toDataURL('image/jpeg', 0.9);
    if (v.afterShot) { v.afterShot(); v.afterShot = null; }
    return url;
  }));
}
// Printed 3D: besides the walls whose room side faces away from the camera, hide any wall that stands between the
// camera and the cabinets (the line from the camera to the middle of the cabinets crosses it), whatever the room's shape.
function printCutaway(v, only) {
  const base = v.beforeDraw;
  const cb = new THREE.Box3(); v.root.traverse(m => { if (m.isMesh && m.userData.cabId && (!only || only.has(m.userData.cabId))) cb.expandByObject(m); });
  if (cb.isEmpty()) return;
  const c = cb.getCenter(new THREE.Vector3());
  v.beforeDraw = () => {
    if (base) base();
    const p = v.cam.position, dx = c.x - p.x, dz = c.z - p.z;
    v.root.children.forEach(o => {
      const k = o.userData.cut; if (!k || !o.visible || !k.half) return;
      // Where the camera-to-cabinets line meets the wall line: t along the sight line (0..1), s along the wall.
      const den = dx * k.uz - dz * k.ux; if (Math.abs(den) < 1e-6) return;
      const ox = k.x - p.x, oz = k.z - p.z, t = (ox * k.uz - oz * k.ux) / den, s2 = (ox * dz - oz * dx) / den;
      if (t > 0 && t < 0.97 && Math.abs(s2) < k.half) o.visible = false;
    });
  };
}
function printFitAll(v, aspect) {
  const cb = new THREE.Box3(); v.root.traverse(m => { if (m.isMesh && m.userData.cabId) cb.expandByObject(m); });
  if (cb.isEmpty()) return;
  v.lookBox(cb, typeof roomViewDir === 'function' ? roomViewDir(1.15, Math.SQRT2) : { x: -1, y: 1.15, z: 1 });
  v.root.updateMatrixWorld(true);
  if (v.beforeDraw) v.beforeDraw(); // the cutaway hides the walls in front for this camera
  const cam = v.cam; cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse.clone(), pts = [], b = new THREE.Box3(), q = new THREE.Vector3();
  const seen = o => { for (let x = o; x; x = x.parent) { if (x.visible === false || (x.userData && x.userData.noBounds)) return false; } return true; };
  v.root.traverse(m => {
    if (!m.isMesh || m.isSprite || !seen(m)) return;
    b.setFromObject(m); if (b.isEmpty()) return;
    const sz = b.getSize(q.clone());
    if (!m.userData.cabId && sz.y < 0.6 && b.min.y < 0.3 && sz.x * sz.z > 4000) return; // the floor
    [b.min.x, b.max.x].forEach(x => [b.min.y, b.max.y].forEach(y => [b.min.z, b.max.z].forEach(z => pts.push(new THREE.Vector3(x, y, z).applyMatrix4(inv)))));
  });
  if (!pts.length) return;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  // Slide the camera sideways so the kitchen sits in the middle, then size the view to fit it.
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  const shift = right.multiplyScalar((x0 + x1) / 2).add(up.multiplyScalar((y0 + y1) / 2));
  cam.position.add(shift); v.controls.target.add(shift);
  v.orthoH = Math.max(y1 - y0, (x1 - x0) / aspect) * 1.08; v.ortho.zoom = 1;
  cam.lookAt(v.controls.target); v.controls.update(); v.resize();
}
// One wall side in 3D for the installers: the camera in front of the wall, turned a little and looking down a little,
// framed on that wall's cabinets and appliances; walls between the camera and them are cut away.
function printWallCam(v, ws, aspect) {
  const { w, side } = ws, ids = new Set(S.cabinets.filter(c => c.wall === w.id && c.side === side).map(c => c.id));
  const fx = new Set(fixtList().filter(f => f.wall === w.id && f.side === side && !fixtHole(f)).map(f => f.id));
  v.root.updateMatrixWorld(true);
  const box = new THREE.Box3(); v.root.traverse(m => { if (m.isMesh && (ids.has(m.userData.cabId) || fx.has(m.userData.fixtId))) box.expandByObject(m); });
  if (box.isEmpty()) { view3dPreset(v, 'iso'); return; }
  // Taken from inside the room, standing back from the wall at about eye height (Ayden 2026-11-24: the 3D pictures need
  // the walls), so the wall and the walls at its ends show as they will be. Walls between the camera and the cabinets
  // (a room shallower than the camera needs) are cut away.
  const g = wg(w), nx = g.n.x * side, nz = g.n.y * side, c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const W = Math.abs(g.u.x) * sz.x + Math.abs(g.u.y) * sz.z + 12, H = sz.y + 14, front = (Math.abs(nx) * sz.x + Math.abs(nz) * sz.z) / 2;
  // How deep the room is in front of this wall: the first wall the line out from the cabinets meets.
  let depth = Infinity;
  const walls = []; v.root.children.forEach(o => { if (o.userData.cut) walls.push(o); });
  const rc = new THREE.Raycaster(new THREE.Vector3(c.x + nx * (front + 1), Math.min(60, c.y), c.z + nz * (front + 1)), new THREE.Vector3(nx, 0, nz).normalize());
  const hit = rc.intersectObjects(walls, true)[0]; if (hit) depth = hit.distance + front + 1;
  const p = v.persp, keepFov = p.fov; let fov = 50;
  const need = f => { const t = Math.tan(f * Math.PI / 360); return Math.max(H / 2 / t, W / 2 / (t * aspect)) + front; };
  // Stand back far enough to see the whole wall; in a tight room, widen the view (up to 75°) before going outside it.
  while (need(fov) > depth - 8 && fov < 75) fov += 5;
  const D = need(fov);
  v.setMode('persp'); p.fov = fov; p.updateProjectionMatrix();
  const eye = Math.max(c.y, 54);
  v.cam = p; v.controls.object = p;
  v.controls.target.set(c.x, c.y + 3, c.z);
  p.position.set(c.x + nx * D, eye, c.z + nz * D);
  p.lookAt(v.controls.target); v.controls.update(); v.resize();
  // Cabinets and appliances standing near or behind the camera (the run across the room) would block the picture: left out.
  const ob = new THREE.Box3(), mine = o => { let y = false; o.traverse(m => { if (ids.has(m.userData.cabId) || fx.has(m.userData.fixtId)) y = true; }); return y; };
  v.root.children.forEach(o => {
    if (o.userData.cut || o.userData.noBounds || o.isLight || !o.visible || mine(o)) return;
    ob.setFromObject(o); if (ob.isEmpty()) return;
    const s3 = ob.getSize(new THREE.Vector3()); if (s3.y < 1 && ob.min.y < 0.3) return; // the floor
    const far = Math.max(...[ob.min.x, ob.max.x].flatMap(x => [ob.min.z, ob.max.z].map(z => (x - c.x) * nx + (z - c.z) * nz)));
    if (far > D - 30) o.visible = false;
  });
  printCutaway(v, ids.size ? ids : null);
  v.afterShot = () => { p.fov = keepFov; p.updateProjectionMatrix(); };
}
function printWall3DPage(room, ws, head) {
  const PA = printArea('plan'), aspect = PA.w / PA.h, key = room.id + '|wall|' + ws.w.id + '|' + ws.side + '|' + aspect.toFixed(2);
  const url = printPic(key, () => print3DShot(room, { id: 'wall' }, { aspect, real: false, wall: ws }));
  if (!url) return '';
  return `<section class="mp-page land mp-draw">${head(room.name, ws.name + ' · 3D')}<div class="mp-pic"><img src="${url}" alt="${esc(room.name)} ${esc(ws.name)} in 3D" data-pic="${esc(key)}"></div></section>`;
}

/* ----- Install list (Installer drawings): every cabinet to hang or set, wall by wall, with where it goes and what goes
   with it, a box to tick, then the appliances, molding and tops. No prices. ----- */
function printInstallPage(room, head) {
  // In the order they go in (Ayden 2026-11-24): base and tall cabinets, uppers, fillers, panels, molding, then the rest
  // (appliances, shelves and other products, countertops). Each section is sorted wall by wall, left to right.
  return withRoom(room, () => {
    const tbl = (h, rows) => `<table class="t mp-t mp-inst"><thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
    const ps = typeof priceSheet === 'function' ? priceSheet() : null, who = ps && typeof roomInstaller === 'function' ? roomInstaller(ps, room) : null;
    const wn = id => wall(id) ? wallName(wall(id)) + '' : 'Not on a wall', wi = id => { const i = S.walls.findIndex(w => w.id === id); return i < 0 ? 999 : i; };
    // Where a thing starts from the left end of its wall as you face it (the inside face of the wall at that end).
    const fromLeft = (wallId, side, x0, w) => { const ww = wall(wallId); if (!ww) return null; const L = wg(ww).L, f = wallFaces(wallId, side), eL = side === 1 ? f.lo : L - f.hi; return Math.max(0, (side === 1 ? x0 : L - x0 - w) - eL); };
    const cl = c => fromLeft(c.wall, c.side, c.off, c.w);
    const order = (a, b) => wi(a.wall) - wi(b.wall) || (a.side || 1) - (b.side || 1) || (cl(a) ?? 0) - (cl(b) ?? 0);
    // By the product's classification (Products page), then by name for cabinets without a library product.
    const grp = c => { const l = c.libId && typeof libItem === 'function' && libItem(c.libId); return l && typeof libGroup === 'function' ? libGroup(l) : ''; };
    const isTrim = c => grp(c) === 'filler' && /mold|trim/i.test(c.name || '') || grp(c) === 'molding';
    const isFiller = c => !isTrim(c) && (grp(c) === 'filler' || /filler/i.test(c.name || ''));
    const isPanel = c => !isTrim(c) && !isFiller(c) && (!!c.autoOf || grp(c) === 'panel' || /panel/i.test(c.name || '') && !/door/i.test(c.name || ''));
    const isOther = c => !isTrim(c) && !isFiller(c) && !isPanel(c) && ((typeof isSpecialty === 'function' && isSpecialty(c)) || c.made || c.noCount);
    const all = S.cabinets.slice().sort(order), cabs = all.filter(c => !isTrim(c) && !isFiller(c) && !isPanel(c) && !isOther(c));
    const box = '<td class="mp-box"></td>', H8 = ['✓', '#', 'Cabinet', 'Wall', 'W × H × D', 'From left', 'Bottom', 'Top', 'Notes'];
    const cabRow = (c, note) => `<tr>${box}<td><b>${esc(LBL[c.id] || '')}</b></td><td>${esc(c.name)}</td><td>${esc(wn(c.wall))}</td><td>${fmtLen(c.w)} × ${fmtLen(c.h)} × ${fmtLen(c.d)}</td><td>${cl(c) == null ? '' : fmtLen(cl(c))}</td><td>${c.elev > 0.01 ? fmtLen(c.elev) : 'Floor'}</td><td>${fmtLen((c.elev || 0) + c.h)}</td><td>${esc(note ?? printNote(c.notes).split('\n')[0])}</td></tr>`;
    // Heading and table in one block, so a heading never sits alone at the bottom of a sheet (mpPaginate keeps it with its rows).
    const sec = (h, rows, cols = H8) => rows.length ? `<div class="mp-instsec"><h4 class="mp-muh mp-insth">${h}</h4>${tbl(cols, rows)}</div>` : '';
    const base = cabs.filter(c => c.cat !== 'Wall').map(c => cabRow(c)), upper = cabs.filter(c => c.cat === 'Wall').map(c => cabRow(c));
    // Fillers: the automatic ones beside cabinets, then filler products placed on their own.
    const fl = [];
    all.filter(c => !c.autoOf && wall(c.wall)).forEach(c => {
      const ftk = c.cat === 'Wall' || !hasToe(c) ? 0 : effParams(c).toeKickHeight;
      fillersOf(c).forEach(f => fl.push(`<tr>${box}<td></td><td>Filler ${f.end === 'L' ? 'left' : 'right'} of <b>${esc(LBL[c.id] || '')}</b></td><td>${esc(wn(c.wall))}</td><td>${fmtLen(f.gap)} W × ${fmtLen(c.h - ftk)} H</td><td>${fmtLen(fromLeft(c.wall, c.side, f.a0, f.gap) ?? 0)}</td><td>${c.elev > 0.01 ? fmtLen(c.elev) : 'Floor'}</td><td>${fmtLen((c.elev || 0) + c.h)}</td><td></td></tr>`));
    });
    all.filter(isFiller).forEach(c => fl.push(cabRow(c)));
    // Panels: end panel pieces, panels drawn on a cabinet's end, and panel products.
    const pn = [];
    all.filter(c => !c.autoOf && !isPanel(c)).forEach(c => ['L', 'R'].forEach(e => { if (!S.cabinets.some(k => k.autoOf === c.id && k.autoEnd === e) && hasPanel(c, e)) pn.push(`<tr>${box}<td></td><td>End panel ${e === 'L' ? 'left' : 'right'} of <b>${esc(LBL[c.id] || '')}</b></td><td>${esc(wn(c.wall))}</td><td>${fmtLen(c.h)} H × ${fmtLen(c.d)} D</td><td></td><td>${c.elev > 0.01 ? fmtLen(c.elev) : 'Floor'}</td><td>${fmtLen((c.elev || 0) + c.h)}</td><td></td></tr>`); }));
    all.filter(isPanel).forEach(c => pn.push(cabRow(c, c.autoOf ? `End panel ${c.autoEnd === 'L' ? 'left' : 'right'} of ${LBL[c.autoOf] || ''}` : undefined)));
    // Molding in feet (Ayden 2026-11-24), each run and the total of each kind.
    const ft = n => `${(n / 12).toFixed(1)} ft`, runs = moldingRuns().slice().sort((a, b) => wi(a.wall) - wi(b.wall)), mTot = {};
    runs.forEach(r => { const k = r.m.name || 'Molding'; mTot[k] = (mTot[k] || 0) + r.len; });
    const md = runs.map(r => `<tr>${box}<td>${esc(r.m.name || 'Molding')}</td><td>${esc(wn(r.wall))}</td><td><b>${ft(r.len)}</b> <span class="muted">(${fmtLen(r.len)}${r.retS || r.retE ? `, ${[r.retS, r.retE].filter(Boolean).length === 2 ? 'both ends return' : 'one end returns'}` : ''})</span></td></tr>`)
      .concat(Object.entries(mTot).map(([k, n]) => `<tr class="mp-insttot"><td></td><td>Total ${esc(k)}</td><td></td><td><b>${ft(n)}</b></td></tr>`));
    // The rest: shelves, hoods and other products, appliances, countertops.
    const other = all.filter(isOther).map(c => cabRow(c));
    const fx = fixtList().filter(f => wall(f.wall) && !fixtHole(f)).sort((a, b) => wi(a.wall) - wi(b.wall)).map(f => `<tr>${box}<td>${esc(fixtName(f))}</td><td>${esc(wn(f.wall))}</td><td>${fmtLen(f.w)} W × ${fmtLen(f.h)} H${f.d ? ' × ' + fmtLen(f.d) + ' D' : ''}</td></tr>`);
    const tp = countertopRuns().filter(t => t.on).sort((a, b) => wi(a.wall) - wi(b.wall)).map(t => `<tr>${box}<td>Countertop${t.tpl && mat(t.tpl.mat) ? ' · ' + esc(mat(t.tpl.mat).name) : ''}</td><td>${esc(wn(t.wall))}</td><td>${fmtLen(t.len)} long${t.bs > 0 ? `, ${fmtLen(t.bs)} backsplash` : ''}</td></tr>`);
    const H4 = ['✓', 'What', 'Wall', 'Size'];
    // Trim products (C mold, ceiling trim) go with the molding.
    all.filter(isTrim).forEach(c => md.unshift(`<tr>${box}<td><b>${esc(LBL[c.id] || '')}</b> ${esc(c.name)}</td><td>${esc(wn(c.wall))}</td><td><b>${ft(c.w)}</b> <span class="muted">(${fmtLen(c.w)}, ${fmtLen(c.elev || 0)} off the floor)</span></td></tr>`));
    if (!base.length && !upper.length && !fl.length && !pn.length && !other.length) return '';
    return `<section class="mp-page mp-flow mp-draw mp-instp">${head(room.name, 'Install list')}
      <h3 class="mp-nh">Install list${who ? ` <span class="muted">· ${esc(who.name)}</span>` : ''}</h3>
      <div class="mp-instnote muted">From left is measured from the left end of the wall as you face it (the inside face of the wall at that end). Heights are off the finished floor.</div>
      ${sec('1. Base and tall cabinets', base)}${sec('2. Upper cabinets', upper)}${sec('3. Fillers', fl)}${sec('4. Panels', pn)}${sec('5. Molding', md, H4)}
      ${sec('6. Hoods, shelves and other products', other)}${sec('7. Appliances', fx, H4)}${sec('8. Countertops', tp, H4)}</section>`;
  });
}

// Pictures are kept while Print is open; each remembers how to take itself again once textures have loaded.
const printShots = {};
function printPic(key, shot) {
  printShots[key] = shot;
  if (!printPics[key]) { try { printPics[key] = shot(); } catch (_) { printPics[key] = null; } }
  print3DLater();
  return printPics[key];
}
function print3DPages(room, head) {
  return print3DViews(room).map(vw => {
    const PA = printArea('plan'), aspect = PA.w / PA.h, key = room.id + '|' + vw.id + '|' + aspect.toFixed(2), url = printPic(key + '|real', () => print3DShot(room, vw, { aspect, fit: true, real: true }));
    if (!url) return '';
    return `<section class="mp-page land mp-draw">${head(room.name, vw.name || '3D view')}<div class="mp-pic"><img src="${url}" alt="${esc(room.name)} ${esc(vw.name || '3D view')}" data-pic="${esc(key + '|real')}"></div></section>`;
  }).join('');
}
// Wood textures load a moment after the first picture: take the pictures again once and swap them in.
let printLate = 0, printLateDone = {};
function print3DLater() {
  clearTimeout(printLate);
  printLate = setTimeout(() => {
    document.querySelectorAll('img[data-pic]').forEach(img => {
      const k = img.dataset.pic, shot = printShots[k]; if (!shot || printLateDone[k]) return;
      try { const url = shot(); if (url) { printPics[k] = url; printLateDone[k] = true; document.querySelectorAll(`img[data-pic="${CSS.escape(k)}"]`).forEach(i => { i.src = url; }); } } catch (_) {}
    });
  }, 900);
}
function printPicsClear() { Object.keys(printPics).forEach(k => delete printPics[k]); printLateDone = {}; }

// All the drawing pages for the preset's picks, room by room (plan, then the walls, then 3D).
// Page order (Ayden 2026-11-19): the realistic 3D pictures come first (after the cover), then the room settings (Job specs)
// and Scope of work (libs2.js mpPages), then each room's wall elevations, its floor plan and its countertop layout.
function print3DFirst(pr, rooms, head) {
  return pr.items.includes('3d') ? rooms.map(room => print3DPages(room, head)).filter(Boolean) : [];
}
function printDrawings(pr, rooms, head) {
  const want = k => pr.items.includes(k);
  if (!want('plan') && !want('elev') && !want('tops') && !want('install') && !want('wall3d')) return [];
  const out = [];
  rooms.forEach(room => {
    // Installer drawings: the plan and the install list first, then each wall's elevation with its 3D picture next to it.
    const inst = want('install');
    if (inst && want('plan')) out.push(printPlanPage(room, head));
    if (inst) out.push(printInstallPage(room, head));
    printWallSides(room).forEach(ws => { if (want('elev')) out.push(printElevPage(room, ws, head)); if (want('wall3d')) out.push(printWall3DPage(room, ws, head)); });
    if (!inst && want('plan')) out.push(printPlanPage(room, head));
    if (want('tops') && typeof printTopsPage === 'function') out.push(printTopsPage(room, head));
  });
  return out.filter(Boolean);
}

/* ----- Notes sheet (Ayden 2026-11-19: right after the cover): the job's notes, then ruled lines to write on ----- */
function printNotesPage(pr, rooms, head) {
  // Notes are just notes (Ayden 2026-11-19): the laminate line on a bid job, the job's notes, and lines to write on.
  const notes = printNote(S.job.notes), lines = Array.from({ length: 40 }, () => '<i></i>').join('');
  return `<section class="mp-page land mp-draw mp-notesp">${head(rooms.length > 1 ? 'All rooms' : (rooms[0] || {}).name || '', 'Notes')}
    <h3 class="mp-nh">Notes</h3>${matAssumed() ? `<div class="mp-assume">${MAT_ASSUMED}</div>` : ''}${notes ? `<div class="mp-nt">${esc(notes)}</div>` : ''}<div class="mp-lines">${lines}</div></section>`;
}

/* ----- Scope of work: what the job includes, room by room, from the drawing, with the shop's own notes ----- */
const SCOPE_EST = 'This is an estimate only. The final price can vary or change with final measurements, selections, materials and site conditions.';
// The estimate notice as its own section on the price pages (Ayden 2026-11-20: bigger, its own part of the pricing).
const printEstSec = () => `<div class="mp-estsec"><b>This is an estimate</b><div>${SCOPE_EST}</div></div>`;
// One sentence for a room: "Build and install 8 base and 5 wall cabinets with Shaker doors, plus a slat wall, countertops and molding."
// Products that aren't cabinets (slat walls, desks, floating shelves, anything priced on its own or left out of the
// cabinet counts) and the bid's own rows are named, so nothing priced goes unmentioned (Ayden 2026-11-19: slat wall).
function printScopeIdea(room, inst, ps) {
  return withRoom(room, () => {
    const special = c => c.noCount || c.made || (ps && typeof ownRule === 'function' && ownRule(c, ps));
    const cabs = S.cabinets.filter(c => !special(c)), n = cat => cabs.filter(c => c.cat === cat).length;
    const kinds = [['Base', 'base'], ['Wall', 'wall'], ['Tall', 'tall']].map(([c, w]) => n(c) ? `${n(c)} ${w}` : '').filter(Boolean);
    const other = cabs.filter(c => !CAT_FT.some(([cat]) => cat === c.cat)).length;
    if (other) kinds.push(`${other} other`);
    const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0] || '';
    const low = t => String(t || '').trim();
    const named = new Map(), add = (name, q) => { const k = low(name); if (k) named.set(k, (named.get(k) || 0) + (q || 1)); };
    S.cabinets.filter(special).forEach(c => add(c.name, 1));
    (room.bidItems || []).forEach(it => add(it.name, +it.qty || 1));
    const dt = doorTpl(roomSet('doorT', room)), extra = [...named].map(([k, q]) => q > 1 ? `${q} × ${k}` : k);
    if (countertopRuns().some(t => t.on)) extra.push('countertops');
    if (moldingRuns().length) extra.push('molding');
    if (!cabs.length && !extra.length) return '';
    const what = cabs.length ? `${list(kinds)} cabinet${cabs.length === 1 ? '' : 's'}${dt && dt.name ? ` with ${dt.name} doors` : ''}` : '';
    return `${inst ? 'Build and install' : 'Build'} ${[what, list(extra)].filter(Boolean).join(', plus ')}.`;
  });
}
function printScopePage(pr, rooms, head) {
  const ps = typeof priceSheet === 'function' ? priceSheet() : null, who = ps && typeof jobInstaller === 'function' ? jobInstaller(ps) : null;
  // Just the room and the general idea of the work, one line each (Ayden 2026-11-19); the details are on the room pages.
  const ideas = rooms.map(room => [room, printScopeIdea(room, ps && roomInstaller(ps, room), ps)]).filter(([, t]) => t);
  const cards = ideas.length ? `<table class="mp-spect mp-scopet">${ideas.map(([r, t]) => `<tr><th>${esc(r.name)}</th><td>${esc(t)}</td></tr>`).join('')}</table>` : '';
  let price = '';
  let opts = [];
  if (pr.estimate && ps && typeof priceJob === 'function') { try { const q = priceJob(ps); price = money(q.total); opts = typeof whatIfPrintRows === 'function' ? whatIfPrintRows(ps, q) : []; } catch (_) { price = ''; } }
  // What-if options (Pricing › Quote): what the price would go to with each change, beside the estimated price.
  const optT = opts.length ? `<table class="mp-wi"><thead><tr><th>Options</th><th>Difference</th><th>New price</th></tr></thead><tbody>${opts.map(R => `<tr><td>${esc(R.name)}</td><td>${wiSigned(R.diff)}</td><td><b>${money(R.total)}</b></td></tr>`).join('')}</tbody></table>` : '';
  const inst = (ps && typeof anyInstaller === 'function' ? anyInstaller(ps) : who) ? 'Installation is included.' : 'Installation is not included.';
  return `<section class="mp-page ${ideas.length > 14 ? 'mp-flow' : 'land'} mp-draw mp-scope">${head(rooms.length > 1 ? 'All rooms' : (rooms[0] || {}).name || '', 'Scope of work')}
    <h3 class="mp-nh">Scope of work</h3><div class="mp-specs mp-scopel">${cards || '<div class="muted">Nothing drawn yet.</div>'}</div>
    <div class="mp-scopex"><b>${esc(inst)}</b>${S.job.scope ? `<div class="mp-scopen">${esc(S.job.scope)}</div>` : ''}</div>
    ${pr.estimate ? `<div class="mp-estimate">${price ? `<div class="mp-estp"><span>Estimated price</span><b>${price}</b></div>` : ''}${optT}</div>${printEstSec()}` : ''}</section>`;
}

/* ----- Job specs: what the job is made of, room by room (door style, finish, cabinet material, hardware, color) ----- */
function printSpecRows(room) {
  return withRoom(room, () => {
    const rs = k => roomSet(k, room), nm = x => (x && x.name) || '';
    const dt = doorTpl(rs('doorT')), fin = finishList().find(f => f.id === rs('finish')) || finishList()[0], cm = cabMatT(rs('cabMatT')), dm = drawerMatT(rs('drawerMatT'));
    const pick = texPickOf('doors'), paint = TEX_PAINTS.find(([h]) => h.toLowerCase() === String(pick).toLowerCase());
    const color = !pick ? `Natural ${esc(nm(fin))}` : pick[0] === '#' ? `<i class="mp-sw" style="background:${esc(pick)}"></i>${paint ? esc(paint[1]) + ' ' : ''}<span class="muted">${esc(pick)}</span>` : esc(nm(skinOf(pick, null)));
    const pull = hw(rs('pull') || (dt && dt.pull));
    const rows = [['Door style', esc(nm(dt))], ['Door and drawer front material', esc(nm(fin)) + (fin && mat(fin.front) ? ` <span class="muted">${esc(mat(fin.front).name)}</span>` : '')], ['Stain / paint color', color],
      ['Cabinet material', esc(nm(cm)) + (cm && mat(cm.carcass) ? ` <span class="muted">${esc(mat(cm.carcass).name)}</span>` : '')], ['Drawer boxes', esc(nm(dm))],
      ['Drawer guides', esc(nm(hw(rs('slide'))))], ['Hinges', esc(nm(hw(rs('hinge'))))], ['Pulls and knobs', esc(nm(pull)) || 'None'],
      ['Countertops', esc(nm(countertop(rs('countertop'))))]];
    // Cabinets that differ from their room, so the shop doesn't miss them.
    const odd = [];
    S.cabinets.forEach(c => {
      const d = [];
      if (c.doorT && c.doorT !== rs('doorT')) d.push('door style ' + nm(doorTpl(c.doorT)));
      if (c.finish && c.finish !== rs('finish')) d.push('finish ' + nm(finishList().find(f => f.id === c.finish)));
      if (c.cabMatT && c.cabMatT !== rs('cabMatT')) d.push('cabinet ' + nm(cabMatT(c.cabMatT)));
      if (c.slide && c.slide !== rs('slide')) d.push('guides ' + nm(hw(c.slide)));
      if (c.hinge && c.hinge !== rs('hinge')) d.push('hinges ' + nm(hw(c.hinge)));
      if (c.tex && c.tex.doors && c.tex.doors !== pick) d.push('color ' + (c.tex.doors[0] === '#' ? c.tex.doors : nm(skinOf(c.tex.doors, null))));
      if (d.length) odd.push(`<b>${esc(LBL[c.id] || '')}</b> ${esc(d.join(', '))}`);
    });
    return { rows, odd };
  });
}
// Two rooms to a page, so a big job's specs never run off the bottom.
// Which material goes on which parts, from the parts the cabinets are cut into (Ayden 2026-11-19: the Refuge job didn't
// say which laminate goes where). Parts are put in plain groups so the shop and the customer can read it.
const MAT_USE = [['Doors and drawer fronts', /^(door|drawer front|false front)|door (stile|rail|panel|raised|glass)/i], ['Drawer boxes', /drawer (side|box|bottom)/i],
  ['Finished ends, panels and fillers', /fin\.? ?end|end panel|applied|filler|front (lower |top )?panel|^panel|scribe/i], ['Toe skin', /toe/i], ['Backs', /back/i], ['Shelves', /shelf/i],
  ['Countertops', /countertop|^top \(/i], ['Molding', /molding|crown|light rail/i]];
function printMatUse(room) {
  return withRoom(room, () => {
    const by = {}, cabsOf = {}, n = S.cabinets.length;
    S.cabinets.forEach(c => { let ps = []; try { ps = buildParts(c).parts; } catch (_) {}
      ps.forEach(p => { const m = mat(p.mat); if (!m) return; const nm = String(p.report || p.name || ''), g = (MAT_USE.find(([, re]) => re.test(nm)) || ['Cabinet box (sides, tops, bottoms, stretchers)'])[0];
        ((by[m.id] = by[m.id] || { m, g: new Set() }).g).add(g); (cabsOf[m.id] = cabsOf[m.id] || new Set()).add(c.id); }); });
    const rows = Object.values(by).map(({ m, g }) => { const cs = [...cabsOf[m.id]], few = cs.length < n && cs.length <= 8;
      return [m.name, [...g].join(', ') + (few ? ` <span class="muted">(only on ${cs.map(id => esc(LBL[id] || '')).join(', ')})</span>` : '')]; });
    countertopRuns().filter(t => t.on).forEach(t => { const m = mat(t.tpl && t.tpl.mat); if (m && !rows.some(r => r[0] === m.name)) rows.push([m.name, 'Countertops']); });
    return rows;
  });
}
// A bid job's documents often don't say which laminate goes where: the print says the materials are our pick, to confirm.
// A job from a bid: cabinets placed from the takeoff, bid lines on a room, an import from Bid Reader, or a job in the Bids folder.
const jobFromBid = () => (S.rooms || []).some(r => (r.cabinets || []).some(c => c.fromBid) || (r.bidItems || []).length)
  || /bid reader/i.test(S.job.notes || '') || (typeof jobs !== 'undefined' && /^Jobs\/Bids\//.test(jobs.path || ''));
// Bid jobs only, and only on the Notes sheet (Ayden 2026-11-19: no Print option for it, just put it in the notes).
const matAssumed = () => jobFromBid();
const MAT_ASSUMED = 'Laminate: the bid documents do not state which laminate goes in which room. The laminate shown on the room settings pages is our assumption. Please confirm each room before we order material.';
// Notes on paper read like the shop wrote them: lines left by imports and the takeoff tools ("Imported from…", "From
// Bid Reader", "(Claude: …)", "Seen 3× in plans; check qty") are left off (Ayden 2026-11-19).
function printNote(t) {
  return String(t || '').split('\n').map(l => l.replace(/\((?:Claude|AI)\b[^)]*\)/gi, '').replace(/\bSeen \d+× in plans; check qty\b/gi, '').replace(/(^|\s·\s)From Bid Reader\b/gi, '').replace(/\s+·\s*$/, '').trim())
    .filter(l => l && !/^imported from\b/i.test(l) && !/\b(claude|chatgpt|\bAI\b|drawn in cabinet designer|cabinet designer)\b/i.test(l)).join('\n');
}
function printSpecPage(pr, rooms, head) {
  const out = [];
  for (let i = 0; i < Math.max(1, rooms.length); i += 2) out.push(printSpecSheet(pr, rooms.slice(i, i + 2), head, rooms.length, i === 0));
  return out.join('');
}
function printSpecSheet(pr, rooms, head, all, first) {
  const cards = rooms.map(room => {
    const { rows, odd } = printSpecRows(room);
    const mu = printMatUse(room);
    return `<div class="mp-spec"><h3>${esc(room.name)}</h3><table class="mp-spect">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v || '—'}</td></tr>`).join('')}</table>
      ${mu.length ? `<h4 class="mp-muh">Materials and where they go</h4><table class="mp-spect mp-mut">${mu.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>` : ''}${odd.length ? `<div class="mp-odd"><b>Different on these cabinets</b><br>${odd.join('<br>')}</div>` : ''}</div>`;
  }).join('');
  return `<section class="mp-page land mp-draw">${head(all > 2 ? rooms.map(r => r.name).join(', ') : all > 1 ? 'All rooms' : (rooms[0] || {}).name || '', 'Room settings')}<div class="mp-specs">${cards}</div>${first && printNote(S.job.notes) && !pr.items.includes('notes') ? `<div class="mp-notes"><b>Notes</b> ${esc(printNote(S.job.notes))}</div>` : ''}</section>`;
}

/* ----- Price sheet (Ayden 2026-11-19): the customer's prices in Print, one page per room or one for the whole job.
   Same numbers as Pricing › Quote (customer copy): markup spread over the rooms, job charges, tax and payments at the end. */
function printPricePages(pr, rooms, head, part) {
  const ps = typeof priceSheet === 'function' ? priceSheet() : null; if (!ps || typeof priceJob !== 'function') return [];
  let q; try { q = priceJob(ps); } catch (_) { return []; }
  const ids = new Set(rooms.map(r => r.id)), R = q.rooms.filter(x => ids.has(x.r.id)), whole = R.length === q.rooms.length;
  const jl = q.jobLines.reduce((a, l) => a + (+l.amount || 0), 0), base = q.sub - jl, f = base > 0 ? (q.sub + q.markup) / base : 1, mm = v => money(v * f);
  const est = pr.estimate ? printEstSec() : '';
  const roomTbl = x => `<h3 class="mp-nh">${esc(x.r.name)}</h3><table class="t mp-t mp-price"><thead><tr><th>#</th><th>Cabinet</th><th>Size (W × H × D)</th><th class="r">Price</th></tr></thead><tbody>
    ${x.cabs.map(k => `<tr><td>${esc(k.label || '')}</td><td>${esc(k.c.name)}</td><td>${fmtLen(k.c.w)} × ${fmtLen(k.c.h)} × ${fmtLen(k.c.d)}</td><td class="r">${mm(k.total)}</td></tr>`).join('') || '<tr><td colspan="4">No cabinets</td></tr>'}
    ${x.lines.map(l => `<tr><td></td><td colspan="2">${esc(lineName(l.name))}</td><td class="r">${mm(l.amount)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="3"><b>${esc(x.r.name)} total</b></td><td class="r"><b>${mm(x.total)}</b></td></tr></tfoot></table>`;
  // Job charges and markup are spread over the room prices (as on the customer's quote), so the totals are the subtotal,
  // tax and total. Totals: the whole job's (with payments), or the rooms printed with tax on them when only some are.
  const roomsSum = R.reduce((a, x) => a + x.total * f, 0), taxPart = roomsSum * (+ps.tax || 0) / 100;
  const totals = whole
    ? `<table class="t mp-t mp-ptot"><tbody><tr><td>Subtotal</td><td class="r">${money(roomsSum)}</td></tr>
      ${q.tax ? `<tr><td>Tax ${ps.tax}%</td><td class="r">${money(q.tax)}</td></tr>` : ''}<tr class="grand"><td>${pr.estimate ? 'Estimated total' : 'Total'}</td><td class="r">${money(q.total)}</td></tr></tbody></table>
      ${(() => { const W = typeof whatIfPrintRows === 'function' ? whatIfPrintRows(ps, q) : []; return W.length ? `<table class="t mp-t mp-ptot mp-pwi"><thead><tr><th>Options</th><th class="r">Difference</th><th class="r">New total</th></tr></thead><tbody>${W.map(o => `<tr><td>${esc(o.name)}</td><td class="r">${wiSigned(o.diff)}</td><td class="r"><b>${money(o.total)}</b></td></tr>`).join('')}</tbody></table>` : ''; })()}
      ${q.payments.length ? `<table class="t mp-t mp-ptot"><thead><tr><th>Payment schedule</th><th class="r">Amount</th></tr></thead><tbody>${q.payments.map(x => `<tr><td>${esc(x.name)} (${x.pct}%)</td><td class="r">${money(x.amount)}</td></tr>`).join('')}</tbody></table>` : ''}`
    : `<table class="t mp-t mp-ptot"><tbody><tr><td>${esc(R.map(x => x.r.name).join(', '))}</td><td class="r">${money(roomsSum)}</td></tr>${taxPart ? `<tr><td>Tax ${ps.tax}%</td><td class="r">${money(taxPart)}</td></tr>` : ''}<tr class="grand"><td>${pr.estimate ? 'Estimated total' : 'Total'} for these rooms</td><td class="r">${money(roomsSum + taxPart)}</td></tr></tbody></table>`;
  const page = (what, body) => `<section class="mp-page mp-flow mp-draw mp-pricep">${head(what.room, what.sheet)}${body}</section>`;
  // Per room (Ayden 2026-11-19): one page per room at the end, plus a separate whole-job price page right after the
  // Notes sheet (part 'summary'); part 'rooms' gives the room pages only.
  if (pr.priceBy === 'room') {
    const sumPage = page({ room: whole ? 'All rooms' : R.map(x => x.r.name).join(', '), sheet: 'Price summary' }, `<h3 class="mp-nh">Price summary</h3><table class="t mp-t mp-price"><tbody>${R.map(x => `<tr><td>${esc(x.r.name)}</td><td class="r">${mm(x.total)}</td></tr>`).join('')}</tbody></table>${totals}${est}`);
    if (part === 'summary') return [sumPage];
    const out = R.map(x => page({ room: x.r.name, sheet: 'Price' }, roomTbl(x)));
    return part === 'rooms' ? out : [sumPage, ...out];
  }
  if (part === 'summary') return [];
  return [page({ room: whole ? 'All rooms' : R.map(x => x.r.name).join(', '), sheet: 'Price' }, R.map(roomTbl).join('') + totals + est)];
}
