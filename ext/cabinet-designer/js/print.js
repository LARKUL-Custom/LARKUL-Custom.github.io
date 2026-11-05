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
// The room's saved 3D views, or one view from the front corner when none are saved. Walls are left out.
const print3DViews = room => (room.views || []).length ? room.views : [{ id: 'iso', name: '3D view' }];
function print3DShot(room, vw) {
  const v = printViewer3D(); if (!v) return null;
  return withRoom(room, () => printQuiet(() => {
    // Printed 3D shows the cabinets on their own: no walls or ceiling in the way.
    const keepL = ui.layers; ui.layers = { ...(ui.layers || {}), walls: false, ceiling: false };
    R3 = !!ui.render3d;
    try { buildRoomScene(v); } finally { R3 = false; ui.layers = keepL; }
    if (!ui.render3d) v.setBackground('#ffffff');
    v.resize();
    if (vw.pos) v.setView(vw); else view3dPreset(v, 'iso');
    v.draw();
    return v.renderer.domElement.toDataURL('image/jpeg', 0.9);
  }));
}
function print3DPages(room, head) {
  return print3DViews(room).map(vw => {
    const key = room.id + '|' + vw.id;
    if (!printPics[key]) { try { printPics[key] = print3DShot(room, vw); } catch (_) { printPics[key] = null; } }
    if (!printPics[key]) return '';
    return `<section class="mp-page land mp-draw">${head(room.name, vw.name || '3D view')}<div class="mp-pic"><img src="${printPics[key]}" alt="${esc(room.name)} ${esc(vw.name || '3D view')}" data-pic="${esc(key)}"></div></section>`;
  }).join('');
}
// Wood textures load a moment after the first picture: take the pictures again once and swap them in.
let printLate = 0;
function print3DLater() {
  clearTimeout(printLate);
  printLate = setTimeout(() => {
    document.querySelectorAll('#multiprint img[data-pic]').forEach(img => {
      const [rid, vid] = img.dataset.pic.split('|'), room = S.rooms.find(r => r.id === rid), vw = room && print3DViews(room).find(x => x.id === vid);
      if (!vw) return;
      try { const url = print3DShot(room, vw); if (url) { printPics[img.dataset.pic] = url; img.src = url; } } catch (_) {}
    });
  }, 900);
}
function printPicsClear() { Object.keys(printPics).forEach(k => delete printPics[k]); }

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
  if (want('3d')) print3DLater();
  return out.filter(Boolean);
}
