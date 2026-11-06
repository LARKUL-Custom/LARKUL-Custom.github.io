// Drawings for Print (libs2.js): a dimensioned elevation of every wall with the cabinet numbers, the floor plan
// of each room and 3D pictures, as landscape pages the builders can read. Lists (cut list, hardware) stay in libs2.js.
'use strict';

// Page drawing area in CSS pixels: letter landscape less the margins, the page header and (elevations) the cabinet list.
const PRINT_ELEV = { w: 980, h: 500 }, PRINT_PLAN = { w: 980, h: 640 };

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

// One wall side's elevation as a page: the drawing with its dimensions, and the cabinets on it listed by number.
function printElevPage(room, { w, side, name }, head) {
  return withRoom(room, () => printQuiet(() => {
    const d = renderElev({ wall: w, side, ...PRINT_ELEV }); if (!d) return '';
    const L = wg(w).L, cs = S.cabinets.filter(c => c.wall === w.id && c.side === side).sort((a, b) => (a.cat === 'Wall') - (b.cat === 'Wall') || elevX(a, L) - elevX(b, L));
    const list = cs.map(c => `<div class="mp-cab"><b>${esc(LBL[c.id] || '')}</b> ${esc(c.name)} <span>${fmtLen(c.w)} W × ${fmtLen(c.h)} H × ${fmtLen(c.d)} D${c.notes ? ' · ' + esc(c.notes.split('\n')[0]) : ''}</span></div>`).join('');
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
    const ar = PRINT_PLAN.h / PRINT_PLAN.w; let vw = x1 - x0; if ((y1 - y0) / vw > ar) vw = (y1 - y0) / ar;
    const view = { x: (x0 + x1) / 2 - vw / 2, y: (y0 + y1) / 2 - vw * ar / 2, w: vw, h: vw * ar };
    const d = renderPlan({ view, ...PRINT_PLAN }); if (!d) return '';
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
    const keep = [ui.layers, ui.cutaway, ui.wallOp]; ui.layers = { ...(ui.layers || {}), walls: true, ceiling: false }; ui.cutaway = true; ui.wallOp = 1;
    const real = o.real ?? !!ui.render3d;
    R3 = real;
    try { buildRoomScene(v); } finally { R3 = false; [ui.layers, ui.cutaway, ui.wallOp] = keep; }
    if (!real) v.setBackground('#ffffff');
    v.resize();
    if (vw.pos) v.setView(vw); else view3dPreset(v, 'iso');
    // o.tight (the cover): with no saved view, frame the cabinets themselves so they fill the picture.
    if (o.tight && !vw.pos) {
      const box = new THREE.Box3(); v.root.traverse(m => { if (m.isMesh && m.userData.cabId) box.expandByObject(m); });
      if (!box.isEmpty()) { v.lookBox(box, { x: -1, y: 1.15, z: 1 }); v.orthoH = Math.max(12, box.getSize(new THREE.Vector3()).length() / 2) * 1.3; v.resize(); }
    }
    if (real) v.fitShadow();
    v.draw();
    return v.renderer.domElement.toDataURL('image/jpeg', 0.9);
  }));
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
    const key = room.id + '|' + vw.id, url = printPic(key, () => print3DShot(room, vw));
    if (!url) return '';
    return `<section class="mp-page land mp-draw">${head(room.name, vw.name || '3D view')}<div class="mp-pic"><img src="${url}" alt="${esc(room.name)} ${esc(vw.name || '3D view')}" data-pic="${esc(key)}"></div></section>`;
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
function printDrawings(pr, rooms, head) {
  const want = k => pr.items.includes(k);
  if (!want('plan') && !want('elev') && !want('3d')) return [];
  const out = [];
  rooms.forEach(room => {
    if (want('plan')) out.push(printPlanPage(room, head));
    if (want('elev')) printWallSides(room).forEach(ws => out.push(printElevPage(room, ws, head)));
    if (want('3d')) out.push(print3DPages(room, head));
  });
  return out.filter(Boolean);
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
function printSpecPage(pr, rooms, head) {
  const cards = rooms.map(room => {
    const { rows, odd } = printSpecRows(room);
    return `<div class="mp-spec"><h3>${esc(room.name)}</h3><table class="mp-spect">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v || '—'}</td></tr>`).join('')}</table>${odd.length ? `<div class="mp-odd"><b>Different on these cabinets</b><br>${odd.join('<br>')}</div>` : ''}</div>`;
  }).join('');
  return `<section class="mp-page land mp-draw">${head(rooms.length > 1 ? 'All rooms' : (rooms[0] || {}).name || '', 'Job specs')}<div class="mp-specs">${cards}</div>${S.job.notes ? `<div class="mp-notes"><b>Notes</b> ${esc(S.job.notes)}</div>` : ''}</section>`;
}
