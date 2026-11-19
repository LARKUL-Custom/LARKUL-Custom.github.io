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
    const list = cs.map(c => `<div class="mp-cab"><b>${esc(LBL[c.id] || '')}</b> ${esc(c.name)} <span>${fmtLen(c.w)} W × ${fmtLen(c.h)} H × ${fmtLen(c.d)} D${c.notes ? ' · ' + esc(c.notes.split('\n')[0]) : ''}</span></div>`).join('')
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
    const keep = [ui.layers, ui.cutaway, ui.wallOp]; ui.layers = { ...(ui.layers || {}), walls: true, ceiling: false }; ui.cutaway = true; ui.wallOp = 1;
    const real = o.real ?? !!ui.render3d;
    R3 = real;
    try { buildRoomScene(v); } finally { R3 = false; [ui.layers, ui.cutaway, ui.wallOp] = keep; }
    if (!real) v.setBackground('#ffffff');
    printCutaway(v);
    v.resize();
    if (vw.pos) v.setView(vw); else view3dPreset(v, 'iso');
    // o.fit (the cover): with no saved view, frame the whole kitchen (cabinets, tops and the walls left after the
    // cutaway, not the floor) so all of it fits the picture with a small margin and nothing is cut off.
    if (o.fit && !vw.pos) printFitAll(v, o.aspect || 1.5);
    if (real) v.fitShadow();
    v.draw();
    return v.renderer.domElement.toDataURL('image/jpeg', 0.9);
  }));
}
// Printed 3D: besides the walls whose room side faces away from the camera, hide any wall that stands between the
// camera and the cabinets (the line from the camera to the middle of the cabinets crosses it), whatever the room's shape.
function printCutaway(v) {
  const base = v.beforeDraw;
  const cb = new THREE.Box3(); v.root.traverse(m => { if (m.isMesh && m.userData.cabId) cb.expandByObject(m); });
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
  v.lookBox(cb, { x: -1, y: 1.15, z: 1 });
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
  if (!want('plan') && !want('elev') && !want('tops')) return [];
  const out = [];
  rooms.forEach(room => {
    if (want('elev')) printWallSides(room).forEach(ws => out.push(printElevPage(room, ws, head)));
    if (want('plan')) out.push(printPlanPage(room, head));
    if (want('tops') && typeof printTopsPage === 'function') out.push(printTopsPage(room, head));
  });
  return out.filter(Boolean);
}

/* ----- Notes sheet (Ayden 2026-11-19: right after the cover): the job's notes, then ruled lines to write on ----- */
function printNotesPage(pr, rooms, head) {
  const lines = Array.from({ length: 40 }, () => '<i></i>').join('');
  return `<section class="mp-page land mp-draw mp-notesp">${head(rooms.length > 1 ? 'All rooms' : (rooms[0] || {}).name || '', 'Notes')}
    <h3 class="mp-nh">Notes</h3>${S.job.notes ? `<div class="mp-nt">${esc(S.job.notes)}</div>` : ''}<div class="mp-lines">${lines}</div></section>`;
}

/* ----- Scope of work: what the job includes, room by room, from the drawing, with the shop's own notes ----- */
const SCOPE_EST = 'This is an estimate only. The final price can vary or change with final measurements, selections, materials and site conditions.';
function printScopeRows(room) {
  return withRoom(room, () => {
    const rs = k => roomSet(k, room), nm = x => (x && x.name) || '';
    const cabs = S.cabinets.filter(c => !c.noCount), rows = [];
    const cats = CAT_FT.map(([cat, name]) => { const cs = cabs.filter(c => c.cat === cat); return cs.length ? `${cs.length} ${name.toLowerCase()} (${ftLen(cs.reduce((a, c) => a + c.w, 0) / 12)} ft)` : ''; }).filter(Boolean);
    const other = cabs.filter(c => !CAT_FT.some(([cat]) => cat === c.cat)).length;
    if (cats.length || other) rows.push(['Cabinets', esc([...cats, other ? `${other} other` : ''].filter(Boolean).join(', '))]);
    const dt = doorTpl(rs('doorT')), fin = finishList().find(f => f.id === rs('finish')) || finishList()[0];
    if (cabs.length) rows.push(['Doors and drawer fronts', esc([nm(dt), nm(fin)].filter(Boolean).join(', '))]);
    const pull = hw(rs('pull') || (dt && dt.pull)); if (cabs.length) rows.push(['Hardware', esc([nm(hw(rs('hinge'))), nm(hw(rs('slide'))), nm(pull)].filter(Boolean).join(', '))]);
    const tops = countertopRuns().filter(t => t.on);
    if (tops.length) { const sq = tops.reduce((a, t) => a + (t.area ?? t.len * t.depth), 0) / 144; rows.push(['Countertops', esc(`${[...new Set(tops.map(t => (t.tpl && t.tpl.name) || t.name || 'Top'))].join(', ')}, about ${Math.round(sq)} sq ft`)]); }
    const molds = moldingRuns(); if (molds.length) rows.push(['Molding', esc([...new Set(molds.map(m => m.m.name))].join(', ') + `, about ${ftLen(molds.reduce((a, m) => a + m.len, 0) / 12)} ft`)]);
    const fx = fixtList().filter(f => !fixtHole(f)); if (fx.length) rows.push(['Appliances and sinks', esc(fx.map(f => fixtName(f)).join(', ')) + ' <span class="muted">(placed for the layout; supplied by others unless noted)</span>']);
    return rows;
  });
}
function printScopePage(pr, rooms, head) {
  const ps = typeof priceSheet === 'function' ? priceSheet() : null, who = ps && typeof jobInstaller === 'function' ? jobInstaller(ps) : null;
  const cards = rooms.map(room => { const rows = printScopeRows(room); return rows.length ? `<div class="mp-spec"><h3>${esc(room.name)}</h3><table class="mp-spect">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table></div>` : ''; }).join('');
  let price = '';
  let opts = [];
  if (pr.estimate && ps && typeof priceJob === 'function') { try { const q = priceJob(ps); price = money(q.total); opts = typeof whatIfPrintRows === 'function' ? whatIfPrintRows(ps, q) : []; } catch (_) { price = ''; } }
  // What-if options (Pricing › Quote): what the price would go to with each change, beside the estimated price.
  const optT = opts.length ? `<table class="mp-wi"><thead><tr><th>Options</th><th>Difference</th><th>New price</th></tr></thead><tbody>${opts.map(R => `<tr><td>${esc(R.name)}</td><td>${wiSigned(R.diff)}</td><td><b>${money(R.total)}</b></td></tr>`).join('')}</tbody></table>` : '';
  const inst = who ? 'Installation is included.' : 'Installation is not included.';
  return `<section class="mp-page land mp-draw mp-scope">${head(rooms.length > 1 ? 'All rooms' : (rooms[0] || {}).name || '', 'Scope of work')}
    <div class="mp-specs">${cards || '<div class="muted">Nothing drawn yet.</div>'}</div>
    ${matAssumed() ? `<div class="mp-assume">${MAT_ASSUMED}</div>` : ''}
    <div class="mp-scopex"><b>${esc(inst)}</b>${S.job.scope ? `<div class="mp-scopen">${esc(S.job.scope)}</div>` : ''}</div>
    ${pr.estimate ? `<div class="mp-estimate">${price ? `<div class="mp-estp"><span>Estimated price</span><b>${price}</b></div>` : ''}${optT}<div>${SCOPE_EST}</div></div>` : ''}</section>`;
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
const jobFromBid = () => (S.rooms || []).some(r => (r.cabinets || []).some(c => c.fromBid));
const matAssumed = () => S.job.matAssume ?? jobFromBid();
const MAT_ASSUMED = 'The bid documents do not say which laminate or material goes where. The materials listed here are what we assumed; please confirm them with us before anything is ordered or cut.';
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
  return `<section class="mp-page land mp-draw">${head(all > 2 ? rooms.map(r => r.name).join(', ') : all > 1 ? 'All rooms' : (rooms[0] || {}).name || '', 'Room settings')}<div class="mp-specs">${cards}</div>${matAssumed() ? `<div class="mp-assume">${MAT_ASSUMED}</div>` : ''}${first && S.job.notes && !pr.items.includes('notes') ? `<div class="mp-notes"><b>Notes</b> ${esc(S.job.notes)}</div>` : ''}</section>`;
}

/* ----- Price sheet (Ayden 2026-11-19): the customer's prices in Print, one page per room or one for the whole job.
   Same numbers as Pricing › Quote (customer copy): markup spread over the rooms, job charges, tax and payments at the end. */
function printPricePages(pr, rooms, head) {
  const ps = typeof priceSheet === 'function' ? priceSheet() : null; if (!ps || typeof priceJob !== 'function') return [];
  let q; try { q = priceJob(ps); } catch (_) { return []; }
  const ids = new Set(rooms.map(r => r.id)), R = q.rooms.filter(x => ids.has(x.r.id)), whole = R.length === q.rooms.length;
  const jl = q.jobLines.reduce((a, l) => a + (+l.amount || 0), 0), base = q.sub - jl, f = base > 0 ? (q.sub + q.markup) / base : 1, mm = v => money(v * f);
  const est = pr.estimate ? `<div class="mp-estimate"><div>${SCOPE_EST}</div></div>` : '';
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
  if (pr.priceBy === 'room') {
    const out = R.map((x, i) => page({ room: x.r.name, sheet: 'Price' }, roomTbl(x) + (R.length === 1 ? totals + est : '')));
    if (R.length > 1) out.push(page({ room: whole ? 'All rooms' : R.map(x => x.r.name).join(', '), sheet: 'Price summary' }, `<h3 class="mp-nh">Price summary</h3><table class="t mp-t mp-price"><tbody>${R.map(x => `<tr><td>${esc(x.r.name)}</td><td class="r">${mm(x.total)}</td></tr>`).join('')}</tbody></table>${totals}${est}`));
    return out;
  }
  return [page({ room: whole ? 'All rooms' : R.map(x => x.r.name).join(', '), sheet: 'Price' }, R.map(roomTbl).join('') + totals + est)];
}
