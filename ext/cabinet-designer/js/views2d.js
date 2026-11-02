// Plan and elevation views.
'use strict';

/* ---------- Plan ---------- */
function planSize() { const r = $('#plan').getBoundingClientRect(); return { w: r.width, h: r.height, left: r.left, top: r.top }; }
function toWorld(e) { const sz = planSize(); return { x: ui.view.x + (e.clientX - sz.left) / sz.w * ui.view.w, y: ui.view.y + (e.clientY - sz.top) / sz.h * ui.view.h }; }
const polyPts = poly => poly.map(p => r3(p.x) + ',' + r3(p.y)).join(' ');
function renderPlan() {
  const svg = $('#plan'); const sz = planSize(); if (!sz.w || !sz.h) return;
  const v = ui.view; v.h = v.w * sz.h / sz.w; ui.px = v.w / sz.w; const px = ui.px;
  svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  let s = `<defs><pattern id="gmin" width="1" height="1" patternUnits="userSpaceOnUse"><path class="g-minor nss" d="M1 0H0V1"/></pattern><pattern id="gmaj" width="12" height="12" patternUnits="userSpaceOnUse"><path class="g-major nss" d="M12 0H0V12"/></pattern></defs>`;
  if (px < 0.12) s += `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="url(#gmin)"/>`;
  s += `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="url(#gmaj)"/>`;
  const fs = 13 * px;
  // Base and tall first, uppers over them; the selected cabinet last so its outline is never hidden.
  const hot = c => (ui.sel && ui.sel.id === c.id) || ui.dropCab === c.id;
  const order = [...S.cabinets].sort((a, b) => ((a.cat === 'Wall') - (b.cat === 'Wall')) || (hot(a) - hot(b)));
  order.filter(c => c.cat !== 'Wall' && !hot(c)).forEach(c => { s += cabPlanSVG(c); });
  // Countertops: solid, in their own color, over the base cabinets, so you can see which tops there are and where.
  if (topOp() > 0) countertopRuns().filter(r => r.on).forEach(r => {
    const w = wall(r.wall), g = wg(w), f = w.thick / 2;
    const poly = [wallPt(w, g, r.side, r.start - r.ovS, f), wallPt(w, g, r.side, r.end + r.ovE, f), wallPt(w, g, r.side, r.end + r.ovE, f + r.depth), wallPt(w, g, r.side, r.start - r.ovS, f + r.depth)];
    const mx = poly.reduce((a, p) => a + p.x, 0) / 4, my = poly.reduce((a, p) => a + p.y, 0) / 4;
    let ang = Math.atan2(g.u.y, g.u.x) * 180 / Math.PI; if (ang > 90 || ang <= -90) ang += 180;
    s += `<polygon class="ct-solid nss" style="fill-opacity:${topOp()}" points="${polyPts(poly)}"/>`;
    if (r.len > 8) s += `<text class="lbl ct-lbl" x="${mx}" y="${my}" font-size="${fs * 0.9}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang} ${mx} ${my})">${esc(r.generic ? r.name : (r.tpl && r.tpl.name) || 'Top')} · ${fmtLen(r.len, 1)}</text>`;
  });
  order.filter(c => c.cat === 'Wall' || hot(c)).forEach(c => { s += cabPlanSVG(c); });
  s += shapesPlanSVG();
  s += lightsPlanSVG(px);
  // walls
  S.walls.forEach(w => {
    const g = wg(w), h = w.thick / 2, P = (a, b) => ({ x: w.x1 + g.u.x * a + g.n.x * b, y: w.y1 + g.u.y * a + g.n.y * b });
    const isSel = ui.sel && ui.sel.type === 'wall' && ui.sel.id === w.id;
    s += `<polygon class="wallpoly nss${isSel ? ' sel' : ''}" data-wall="${w.id}" points="${polyPts([P(-h, -h), P(g.L + h, -h), P(g.L + h, h), P(-h, h)])}"/>`;
    capsOf(w).forEach(cp => { s += `<polygon class="wallpoly cap nss${isSel ? ' sel' : ''}" points="${polyPts(capPoly(w, cp))}"/>`; });
    const out = -elevSide(w);
    const m = P(g.L / 2, out * (h + 15 * px)); let ang = Math.atan2(g.u.y, g.u.x) * 180 / Math.PI; if (ang > 90 || ang <= -90) ang += 180;
    if (ui.dims.cab) {
      // Dimension line along the outside of the wall, Mozaik style.
      const o = out * (h + 6 * px), a = P(0, o), b = P(g.L, o), t = 4 * px;
      s += `<path class="dimln nss" d="M${a.x} ${a.y}L${b.x} ${b.y}M${P(0, o - t).x} ${P(0, o - t).y}L${P(0, o + t).x} ${P(0, o + t).y}M${P(g.L, o - t).x} ${P(g.L, o - t).y}L${P(g.L, o + t).x} ${P(g.L, o + t).y}"/>`;
    }
    s += `<text class="lbl dimtxt walltxt" x="${m.x}" y="${m.y}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang} ${m.x} ${m.y})"><tspan font-weight="600">${wallName(w)}</tspan> · ${fmtLen(g.L, 1)}</text>`;
    if (isSel) [[w.x1, w.y1], [w.x2, w.y2]].forEach(([x, y]) => { s += `<circle class="handle nss" cx="${x}" cy="${y}" r="${7 * px}"/>`; });
  });
  // ghost (placing from the library, or drag and drop)
  const gl = ui.ghost && libItem(ui.ghostLib || ui.placing);
  if (gl) { const poly = cabPoly({ ...gl, w: ui.ghost.w || gl.w }, ui.ghost); if (poly) s += `<polygon class="ghost nss" points="${polyPts(poly)}"/>`; }
  if (ui.ghostBlocked && ui.mouse) s += `<text class="lbl dimtxt warntxt" x="${ui.mouse.x}" y="${ui.mouse.y - 14 * px}" font-size="${fs}" text-anchor="middle">No room here</text>`;
  // molding runs, drawn along the cabinet fronts or where they were placed
  moldingRuns().forEach(r => {
    const w = wall(r.wall), g = wg(w), f = w.thick / 2 + r.d;
    s += `<polygon class="mold-outline nss" points="${polyPts([wallPt(w, g, r.side, r.start, f), wallPt(w, g, r.side, r.end, f), wallPt(w, g, r.side, r.end, f + r.m.d), wallPt(w, g, r.side, r.start, f + r.m.d)])}"/>`;
  });
  if (ui.drawWalls) s += wallDrawSVG(fs, px);
  if (ui.drawMold && ui.mouse) {
    const to = moldSnap(ui.mouse);
    if (to) s += `<circle class="handle nss" cx="${to.pt.x}" cy="${to.pt.y}" r="${5 * px}"/>`;
    if (ui.moldFrom && to && to.wall === ui.moldFrom.wall && to.side === ui.moldFrom.side) s += `<line class="mold-draw nss" x1="${ui.moldFrom.pt.x}" y1="${ui.moldFrom.pt.y}" x2="${to.pt.x}" y2="${to.pt.y}"/><text class="lbl dimtxt" x="${(ui.moldFrom.pt.x + to.pt.x) / 2}" y="${(ui.moldFrom.pt.y + to.pt.y) / 2 - 10 * px}" font-size="${fs}" text-anchor="middle">${fmtLen(Math.abs(to.a - ui.moldFrom.a))}</text>`;
  }
  if (ui.guides) ui.guides.forEach(gd => { s += `<line class="guide nss" x1="${gd.x1}" y1="${gd.y1}" x2="${gd.x2}" y2="${gd.y2}"/>`; });
  s += resizeHandlesPlan();
  if (typeof topEditSVG === 'function') s += topEditSVG();
  s += boxSVG();
  svg.innerHTML = s;
  renderHint();
}
// Preview of the wall being drawn: dashed segment, live length, snap marker and alignment guides.
function wallDrawSVG(fs, px) {
  let s = '';
  if (ui.drawing) {
    const e = wallPreviewEnd();
    if (e) {
      e.guides.forEach(q => { s += `<line class="guide nss" x1="${q.x}" y1="${q.y}" x2="${e.x}" y2="${e.y}"/>`; });
      const L = Math.hypot(e.x - ui.drawing.x, e.y - ui.drawing.y), mx = (ui.drawing.x + e.x) / 2, my = (ui.drawing.y + e.y) / 2;
      s += `<line class="prev-wall nss" x1="${ui.drawing.x}" y1="${ui.drawing.y}" x2="${e.x}" y2="${e.y}" stroke-width="${Math.max(2, (curRoom().wallThick ?? S.job.wallThick) / px)}"/>`;
      s += `<text class="lbl dimtxt" x="${mx}" y="${my - 12 * px}" font-size="${fs * 1.2}" font-weight="600" text-anchor="middle">${ui.typed ? esc(ui.typed) + '_' : fmtLen(L, 1)}</text>`;
      s += `<circle class="snapdot${e.at ? ' at' : ''}" cx="${e.x}" cy="${e.y}" r="${(e.at ? 7 : 4.5) * px}"/>`;
    }
    s += `<circle class="snapdot" cx="${ui.drawing.x}" cy="${ui.drawing.y}" r="${4.5 * px}"/>`;
    if (ui.drawing.first) s += `<circle class="snapring nss" cx="${ui.drawing.first.x}" cy="${ui.drawing.first.y}" r="${9 * px}"/>`;
  } else if (ui.mouse) {
    const sp = wallSnap(ui.mouse);
    [sp.gx, sp.gy].filter(Boolean).forEach(q => { s += `<line class="guide nss" x1="${q.x}" y1="${q.y}" x2="${sp.x}" y2="${sp.y}"/>`; });
    s += `<circle class="snapdot${sp.at ? ' at' : ''}" cx="${sp.x}" cy="${sp.y}" r="${(sp.at ? 7 : 4.5) * px}"/>`;
  }
  return s;
}
// A point in a cabinet's own frame: a along its wall from the cabinet's start, b out from the wall face.
function cabPt(c, a, b) { const w = wall(c.wall), g = wg(w); return wallPt(w, g, c.side, c.off + a, w.thick / 2 + (c.outset || 0) + b); }
function cabPlanSVG(c) {
  const box = cabPoly(c); if (!box) return '';
  // A top shape draws its own outline: x across from the cabinet's left, y out from the wall.
  const poly = (c.shape || {}).top ? cabOutline(c, 'top').map(q => cabPt(c, c.side === 1 ? q.x : c.w - q.x, q.y)) : box;
  const px = ui.px, isSel = (ui.sel && ui.sel.type === 'cab' && ui.sel.id === c.id) || inMulti(c.id), isDrop = ui.dropCab === c.id;
  const cls = c.cat === 'Wall' ? 'c-wall' : c.cat === 'Tall' ? 'c-tall' : 'c-base';
  let s = panelPolys(c).map(pp => `<polygon class="apanel nss" points="${polyPts(pp)}"/>`).join('');
  s += fillerPolys(c).map(pp => `<polygon class="filler nss" points="${polyPts(pp)}"/>`).join('');
  if (isSel || isDrop) s += `<polygon class="halo nss${isDrop ? ' drop' : ''}" points="${polyPts(poly)}"/>`;
  s += `<polygon class="${cls} nss${isDrop ? ' c-drop' : isSel ? ' c-sel' : conflicts(c) ? ' c-bad' : ''}" points="${polyPts(poly)}"/>`;
  const a = box[3], b = box[2];
  if (c.cat !== 'Wall' && poly === box) s += `<line class="c-front nss" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  s += planFrontsSVG(c);
  if (ui.open[c.id]) s += planOpenSVG(c);
  // Uppers are labeled near the wall and bases near the front, so a stacked pair never prints on top of each other.
  const fs = Math.min(13 * px, c.w * 0.32, c.d * 0.3), at = cabPt(c, c.w / 2, c.cat === 'Wall' ? c.d * 0.36 : c.d * 0.62);
  const showW = ui.dims.cab && c.w / px > 34;
  s += `<text class="lbl ${c.cat === 'Wall' ? 'lbl-up' : ''}" x="${at.x}" y="${at.y - (showW ? fs * 0.15 : -fs * 0.35)}" font-size="${fs}" text-anchor="middle" font-weight="600">${LBL[c.id] || ''}</text>`;
  if (showW) s += `<text class="lbl-m" x="${at.x}" y="${at.y + fs * 0.95}" font-size="${fs * 0.85}" text-anchor="middle">${fmtLen(c.w)}</text>`;
  return s;
}
// Closed fronts in plan, like Mozaik: the door and drawer front thickness on the cabinet face, joints between them,
// a quarter swing from each door's hinge, and a short pull-out mark on drawers. Uppers draw dashed, since they sit overhead.
function planFrontsSVG(c) {
  const w = wall(c.wall); if (!w) return '';
  const g = wg(w), fr = computeFronts(c).filter(f => f.type !== 'open'); if (!fr.length) return '';
  const ft = (mat(frontStyle(c, fr[0]).ds.mat) || {}).thick || 0.75, fb = w.thick / 2 + (c.outset || 0) + c.d, up = c.cat === 'Wall' ? ' up' : '', open = !!ui.open[c.id];
  const P = (x, b) => wallPt(w, g, c.side, c.side === 1 ? c.off + x : c.off + c.w - x, fb + b);
  const cols = new Map();
  fr.forEach(f => { const k = f.x0.toFixed(2) + '|' + f.x1.toFixed(2); const e = cols.get(k) || { x0: f.x0, x1: f.x1, door: null, drawer: false }; if (f.type === 'door' && !e.door) e.door = f; if (f.type === 'drawer' || f.type === 'false') e.drawer = e.drawer || f.type === 'drawer'; cols.set(k, e); });
  let s = '';
  cols.forEach(e => {
    s += `<polygon class="p-front${up} nss" points="${polyPts([P(e.x0, 0), P(e.x1, 0), P(e.x1, ft), P(e.x0, ft)])}"/>`;
    if (open) return;
    const fw = e.x1 - e.x0;
    if (e.door) {
      const R = e.door.hinge === 'R', hx = R ? e.x1 : e.x0, dir = R ? -1 : 1, r = Math.min(fw, c.d * 1.2);
      const h = P(hx, ft), e0 = P(hx + dir * r, ft), e1 = P(hx, ft + r);
      const sweep = (e0.x - h.x) * (e1.y - h.y) - (e0.y - h.y) * (e1.x - h.x) > 0 ? 1 : 0;
      s += `<path class="p-swing${up} nss" d="M${e0.x} ${e0.y}A${r} ${r} 0 0 ${sweep} ${e1.x} ${e1.y}"/><line class="p-swing leaf${up} nss" x1="${h.x}" y1="${h.y}" x2="${e1.x}" y2="${e1.y}"/>`;
    } else if (e.drawer) {
      const d = Math.min(4, c.d * 0.2), m0 = e.x0 + fw * 0.25, m1 = e.x1 - fw * 0.25;
      s += `<polyline class="p-swing${up} nss" points="${polyPts([P(m0, ft), P(m0, ft + d), P(m1, ft + d), P(m1, ft)])}"/>`;
    }
  });
  return s;
}
// Open cabinet in plan: door swings drawn from the hinge, pulled-out drawers as dashed boxes.
function planOpenSVG(c) {
  const w = wall(c.wall); if (!w) return '';
  const g = wg(w), fb = w.thick / 2 + (c.outset || 0) + c.d + 0.75, fr = computeFronts(c), seen = new Set();
  const P = (x, b) => wallPt(w, g, c.side, c.side === 1 ? c.off + x : c.off + c.w - x, fb + b);
  let s = '';
  fr.forEach(f => {
    const key = f.type + f.x0.toFixed(2) + f.x1.toFixed(2); if (seen.has(key)) return; seen.add(key);
    if (f.type === 'door') {
      const R = f.hinge === 'R', hx = R ? f.x1 : f.x0, fw = f.x1 - f.x0, dir = R ? -1 : 1, a = doorLimit(c, f);
      const h = P(hx, 0), e0 = P(hx + dir * fw, 0), e1 = P(hx + dir * fw * Math.cos(a), fw * Math.sin(a));
      const sweep = (e0.x - h.x) * (e1.y - h.y) - (e0.y - h.y) * (e1.x - h.x) > 0 ? 1 : 0;
      s += `<path class="p-open nss" d="M${e0.x} ${e0.y}A${fw} ${fw} 0 0 ${sweep} ${e1.x} ${e1.y}"/><line class="p-open door nss" x1="${h.x}" y1="${h.y}" x2="${e1.x}" y2="${e1.y}"/>`;
    } else if (f.type === 'drawer') {
      const tr = drawerTravel(c);
      s += `<polygon class="p-open nss" points="${polyPts([P(f.x0, 0), P(f.x1, 0), P(f.x1, tr), P(f.x0, tr)])}"/>`;
    }
  });
  return s;
}
// End of the wall being drawn: wall ends and the room's first corner pull hardest, then angle steps, the grid, and lines through other ends.
function wallPreviewEnd() {
  if (!ui.drawing) return null;
  const st = ui.drawing, ly = lay(), m = ui.mouse || st, g = ly.grid > 0 ? ly.grid : 1;
  if (!ui.typed) { const sp = wallSnap(m); if (sp.at) return { x: sp.x, y: sp.y, at: true, guides: [] }; }
  let ang = Math.atan2(m.y - st.y, m.x - st.x), L = Math.hypot(m.x - st.x, m.y - st.y);
  if (!ui.shift) { const k = (ly.angleSnap || 90) * Math.PI / 180; ang = Math.round(ang / k) * k; }
  const ux = Math.cos(ang), uy = Math.sin(ang), guides = [];
  if (ui.typed) { const t = parseLen(ui.typed); if (isFinite(t) && t > 0) return { x: st.x + ux * t, y: st.y + uy * t, guides }; }
  L = Math.round(L / g) * g;
  // Stop level with another wall end when the line passes close to it.
  const reach = 10 * ui.px; let best = reach;
  S.walls.forEach(w => [[w.x1, w.y1], [w.x2, w.y2]].forEach(([x, y]) => {
    [[Math.abs(ux) > 0.01 ? (x - st.x) / ux : null, 'x'], [Math.abs(uy) > 0.01 ? (y - st.y) / uy : null, 'y']].forEach(([t, ax]) => {
      if (t === null || t <= 0) return;
      const ex = st.x + ux * t, ey = st.y + uy * t, d = Math.abs(t - Math.hypot(m.x - st.x, m.y - st.y));
      if (d < best && Math.abs(ax === 'x' ? ex - x : ey - y) < 1e-6) { best = d; L = t; guides.length = 0; guides.push({ x, y }); }
    });
  }));
  return { x: st.x + ux * L, y: st.y + uy * L, guides };
}
// Touch: the Length box's arrow buttons draw a wall of that length to the right, up, left or down.
function wallByLength(deg) {
  const box = $('#walllen'), t = parseLen(box ? box.value : ''), st = ui.drawing;
  if (!st) return;
  if (!isFinite(t) || t <= 0) { flash('Type a length first, like 96 or 8\' 2 1/2'); if (box) box.focus(); return; }
  const a = deg * Math.PI / 180, shift = ui.shift;
  ui.mouse = { x: st.x + Math.cos(a) * 10, y: st.y + Math.sin(a) * 10 }; ui.typed = box.value; ui.shift = false;
  commitWallSegment(); ui.shift = shift; ui.typed = '';
  const nb = $('#walllen'); if (nb) nb.value = '';
}
function commitWallSegment() {
  const e = wallPreviewEnd(); if (!e) return;
  const st = ui.drawing; if (Math.hypot(e.x - st.x, e.y - st.y) < 1) return;
  const rm = curRoom(), first = st.first || { x: st.x, y: st.y };
  mutate(() => S.walls.push({ id: uid('w'), x1: r3(st.x), y1: r3(st.y), x2: r3(e.x), y2: r3(e.y), thick: rm.wallThick ?? S.job.wallThick, height: rm.wallHeight ?? S.job.wallHeight }));
  ui.elevWall = S.walls[S.walls.length - 1].id;
  ui.typed = '';
  // Back at the first corner: the room is closed, so drawing ends.
  if (samePt(r3(e.x), r3(e.y), first)) { stopWalls(); flash('Room closed'); return; }
  ui.drawing = { x: r3(e.x), y: r3(e.y), first }; renderRoom();
}
function startWalls() { ui.placeLight = false; ui.drawMold = false; ui.moldFrom = null; ui.drawWalls = true; ui.placing = null; ui.ghost = null; ui.drawing = null; ui.typed = ''; if (ui.viewMode !== 'plan') setView('plan'); else renderRoom(); }
function stopWalls() { ui.drawWalls = false; ui.drawing = null; ui.typed = ''; renderRoom(); }
// Drawing molding: click along a wall face to start, click again to end the run, and keep clicking to chain more.
// Each run follows one wall; a click on another wall starts a new run there.
function startMoldDraw(kind) { ui.placeLight = false; stopWalls(); ui.drawMold = kind === 'top' ? 'top' : true; ui.moldFrom = null; ui.placing = null; if (ui.tab !== 'room') goTab('room'); if (ui.viewMode !== 'plan') setView('plan'); else renderRoom(); }
function stopMoldDraw() { ui.drawMold = false; ui.moldFrom = null; renderRoom(); }
function moldSnap(p) {
  let best = null;
  S.walls.forEach(w => {
    const g = wg(w), dx = p.x - w.x1, dy = p.y - w.y1, a = dx * g.u.x + dy * g.u.y, b = dx * g.n.x + dy * g.n.y, side = b >= 0 ? 1 : -1;
    if (a < -6 || a > g.L + 6) return;
    const d = Math.abs(Math.abs(b) - w.thick / 2); if (d > 40 || (best && d >= best.d)) return;
    const at = Math.round(Math.max(0, Math.min(g.L, a)) * 8) / 8;
    best = { wall: w.id, side, a: at, d, pt: wallPt(w, g, side, at, w.thick / 2) };
  });
  return best;
}
function moldDefaults(w, side) {
  const up = S.cabinets.filter(c => c.wall === w.id && c.side === side && c.cat !== 'Base'), m = molding(roomSet('molding')) || S.moldings[0];
  return { mold: m ? m.id : '', z: up.length ? Math.max(...up.map(c => c.elev + c.h)) : Math.max(0, w.height - (m ? m.h : 3)), d: up.length ? Math.max(...up.map(c => c.d)) : 12 };
}
function topDefaults(w, side) {
  const lo = S.cabinets.filter(c => c.wall === w.id && c.side === side && c.cat !== 'Wall');
  const oh = (countertop(roomSet('countertop')) || {}).frontOverhang ?? 1;
  return { depth: lo.length ? r3(Math.max(...lo.map(c => c.d)) + oh) : 25.5, z: lo.length ? r3(Math.max(...lo.map(c => c.elev + c.h))) : 34.5 };
}
function moldClick(p) {
  const to = moldSnap(p); if (!to) { flash(ui.drawMold === 'top' ? 'Click along a wall to draw a top.' : 'Click along a wall to draw molding.'); return; }
  const fr = ui.moldFrom;
  if (fr && fr.wall === to.wall && fr.side === to.side && Math.abs(to.a - fr.a) > 0.25) {
    const w = wall(to.wall);
    const off = r3(Math.min(fr.a, to.a)), len = r3(Math.abs(to.a - fr.a));
    // Draw Tops makes a top placed by hand, sitting on the base cabinets of that wall when there are any.
    if (ui.drawMold === 'top') mutate(() => S.genTops.push({ id: uid('gt'), name: 'Top ' + (S.genTops.length + 1), wall: to.wall, side: to.side, off, len, ...topDefaults(w, to.side) }));
    else mutate(() => S.genMolds.push({ id: uid('gm'), wall: to.wall, side: to.side, off, len, ...moldDefaults(w, to.side) }));
  }
  ui.moldFrom = to; renderRoom();
}
function fitView() {
  const pts = [];
  S.walls.forEach(w => pts.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }));
  S.cabinets.forEach(c => { const p = cabPoly(c); if (p) pts.push(...p); });
  const sz = planSize(); if (!sz.w) return;
  if (!pts.length) { ui.view = { x: -24, y: -24, w: 240, h: 0 }; renderPlan(); return; }
  let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
  const pad = 30; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const ar = sz.h / sz.w; let w = x1 - x0; const h = y1 - y0;
  if (h / w > ar) w = h / ar;
  ui.view = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - (w * ar) / 2, w, h: w * ar };
  renderPlan();
}
function zoomAt(f, wx, wy) {
  const v = ui.view; if (wx === undefined) { wx = v.x + v.w / 2; wy = v.y + v.h / 2; }
  const nw = Math.max(20, Math.min(4000, v.w * f)), k = nw / v.w;
  v.x = wx - (wx - v.x) * k; v.y = wy - (wy - v.y) * k; v.w = nw; renderPlan();
}
function hitCabs(p) {
  const order = [...S.cabinets].sort((a, b) => (b.cat === 'Wall') - (a.cat === 'Wall'));
  return order.filter(c => { const poly = cabPoly(c); return poly && inPoly(p, poly); }).map(c => c.id);
}
function hitWall(p) {
  let best = null, bd = Infinity;
  S.walls.forEach(w => {
    const r = segDist(p, w); if (r.d < w.thick / 2 + 6 * ui.px && r.d < bd) { bd = r.d; best = w.id; }
    if (!best && capsOf(w).some(cp => inPoly(p, capPoly(w, cp)))) best = w.id;
  });
  return best;
}
function hitHandle(p) {
  if (!ui.sel || ui.sel.type !== 'wall') return null;
  const w = wall(ui.sel.id); if (!w) return null;
  if (Math.hypot(p.x - w.x1, p.y - w.y1) < 10 * ui.px) return { w, end: 1 };
  if (Math.hypot(p.x - w.x2, p.y - w.y2) < 10 * ui.px) return { w, end: 2 };
  return null;
}
function renderHint() {
  const h = $('#hint'); if (!h) return;
  h.classList.remove('idle');
  // Phones and tablets get touch wording and a Stop button, since there is no Esc key or right-click,
  // and a Length box (which brings up the keyboard) with arrow buttons in place of typing a length.
  if ((typeof isPhone === 'function' && isPhone()) || matchMedia('(pointer: coarse)').matches) {
    const stop = '<button class="btn sm" data-act="place-stop">Stop</button>', what = ui.placing && (String(ui.placing).startsWith('shape:') ? shapeLibItem(ui.placing.slice(6)) : libItem(ui.placing));
    const arrows = [['0', '→', 'right'], ['270', '↑', 'up'], ['180', '←', 'left'], ['90', '↓', 'down']].map(([d, a, t]) => `<button class="btn sm wdir" data-act="wall-dir" data-id="${d}" aria-label="Wall going ${t}" title="Wall going ${t}">${a}</button>`).join('');
    const lenBox = `<span class="hintlen"><input id="walllen" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="Length" aria-label="Wall length"> ${arrows}</span>`;
    const html = ui.drawWalls ? (ui.drawing ? 'Tap the next corner (the first one closes the room), or type a length and tap an arrow. ' + lenBox : 'Tap to start a wall. ') + stop
      : what ? `Placing <b>${esc(what.name)}</b>. Tap near a wall. ${stop}`
      : ui.sel && ui.sel.type === 'wall' ? 'Drag the wall to slide it. Drag an orange end to change its length.'
      : 'Tap to select, double tap to edit, hold for more. Two fingers to zoom and pan.';
    // Rebuilt only when it changes, so the Length box keeps its keyboard and what is typed while the plan redraws.
    if (h._html !== html) { h.innerHTML = html; h._html = html; }
    if (!ui.drawWalls && !what && !(ui.sel && ui.sel.type === 'wall')) h.classList.add('idle');
    return;
  }
  h._html = null;
  if (ui.topEdit && cab(ui.topEdit)) { h.innerHTML = `Editing the top shape of <b>${esc(LBL[ui.topEdit] || '')}</b>. Drag a point, click a + to add one, <b>right-click</b> a point or an edge for more. <b>Esc</b> or <button class="btn sm" data-act="te-done">Done</button>`; return; }
  if (ui.placeLight === 'strip') { h.innerHTML = 'Click each cabinet that gets an LED strip; click again to take it off. <b>Right-click</b> or <b>Esc</b> to stop.'; return; }
  if (ui.placeLight) { h.innerHTML = 'Click where each ceiling light goes. <b>Right-click</b> or <b>Esc</b> to stop.'; return; }
  if (ui.drawMold) { h.innerHTML = ui.moldFrom ? `Click where the ${ui.drawMold === 'top' ? 'top' : 'run'} ends. Keep clicking to add more. <b>Right-click</b> or <b>Esc</b> to stop.` : `Click on a wall face where the ${ui.drawMold === 'top' ? 'top' : 'molding'} starts.`; return; }
  if (ui.drawWalls) {
    if (!ui.drawing) h.innerHTML = 'Click to start a wall. Ends snap to other walls, to lines through them and to the grid.';
    else h.innerHTML = `Type a length and press <b>Enter</b>, or click. Click the first corner to close the room. <b>Shift</b> for any angle. <b>Right-click</b> or <b>Esc</b> to stop.`;
  } else if (ui.placing && String(ui.placing).startsWith('shape:')) {
    const l = shapeLibItem(ui.placing.slice(6));
    h.innerHTML = l ? `Placing <b>${esc(l.name)}</b>. Click near a wall. Hold <b>Shift</b> to place more. <b>Right-click</b> or <b>Esc</b> to stop.` : '';
  } else if (ui.placing) {
    const l = libItem(ui.placing);
    h.innerHTML = l ? `Placing <b>${esc(l.name)}</b>. Move near a wall and click. Hold <b>Shift</b> to place more. <b>Right-click</b> or <b>Esc</b> to stop.` : '';
  } else if (ui.sel && ui.sel.type === 'wall') h.innerHTML = 'Drag the wall to slide it; walls joined to it follow. Drag an orange end to change the length, or <b>Shift</b>-drag it to move the corner freely.';
  else { h.innerHTML = 'Drag cabinets from the left onto a wall. Drag a cabinet to slide it. Click a wall to move or resize it. Drag empty space to pan, scroll to zoom.'; h.classList.add('idle'); }
}
// Snapshot of wall ends and cabinet offsets, so a drag can be redone from the start on every move.
function wallSnapState() { return { walls: S.walls.map(w => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })), offs: S.cabinets.map(c => c.off) }; }
function restoreWallState(st) { S.walls.forEach((w, i) => Object.assign(w, st.walls[i])); S.cabinets.forEach((c, i) => { c.off = st.offs[i]; }); }
let lastDown = null;
// Second left press within 400 ms and a few pixels of the first.
function isDouble(e) {
  if (e.button !== 0) return false;
  // Fingers land less precisely than a mouse, so a double tap gets more room.
  const touch = e.pointerType === 'touch', now = performance.now(), l = lastDown;
  const hit = l && now - l.t < (touch ? 450 : 400) && Math.hypot(e.clientX - l.x, e.clientY - l.y) < (touch ? 24 : 6);
  lastDown = hit ? null : { t: now, x: e.clientX, y: e.clientY };
  return !!hit;
}
/* ---------- Resize arrows on the selected cabinet ---------- */
// Arrow size in screen pixels: bigger on touch screens so a finger can grab one.
const rzR = () => (matchMedia('(pointer: coarse)').matches ? 14 : 9);
// A round handle at (x, y) with a two-way arrow along (dx, dy); k is view units per screen pixel.
function rzHandle(key, x, y, dx, dy, k, title) {
  const r = rzR() * k, a = r * 0.55, h = r * 0.32, nx = -dy, ny = dx;
  const head = s => { const ex = x + dx * a * s, ey = y + dy * a * s; return `M${r3(ex - dx * h * s + nx * h)} ${r3(ey - dy * h * s + ny * h)}L${r3(ex)} ${r3(ey)}L${r3(ex - dx * h * s - nx * h)} ${r3(ey - dy * h * s - ny * h)}`; };
  return `<g class="rz" data-rz="${key}"><title>${title}</title><circle cx="${r3(x)}" cy="${r3(y)}" r="${r3(r)}"/><path class="nss" d="M${r3(x - dx * a)} ${r3(y - dy * a)}L${r3(x + dx * a)} ${r3(y + dy * a)}${head(1)}${head(-1)}"/></g>`;
}
const rzShow = () => ui.sel && ui.sel.type === 'cab' && !ui.drawWalls && !ui.placing && cab(ui.sel.id);
// Plan: arrows on both ends (width) and on the front (depth).
function resizeHandlesPlan() {
  const c = rzShow(); if (!c || !wall(c.wall)) return '';
  const w = wall(c.wall), g = wg(w), k = ui.px, o = rzR() * k * 1.25, n = { x: g.n.x * c.side, y: g.n.y * c.side };
  const at = (a, b) => cabPt(c, a, b);
  const pS = at(-o, c.d / 2), pE = at(c.w + o, c.d / 2), pD = at(c.w / 2, c.d + o);
  return rzHandle('S', pS.x, pS.y, -g.u.x, -g.u.y, k, 'Drag to change the width') + rzHandle('E', pE.x, pE.y, g.u.x, g.u.y, k, 'Drag to change the width') + rzHandle('D', pD.x, pD.y, n.x, n.y, k, 'Drag to change the depth');
}
// Elevation: arrows on both sides (width) and on top (height).
function resizeHandlesElev(c, ex, L) {
  const k = ui.elevPx || 1, o = rzR() * k * 1.25, by = -c.elev, side = elevSide(wall(c.wall));
  return rzHandle(side === 1 ? 'S' : 'E', ex - o, by - c.h / 2, -1, 0, k, 'Drag to change the width') + rzHandle(side === 1 ? 'E' : 'S', ex + c.w + o, by - c.h / 2, 1, 0, k, 'Drag to change the width')
    + rzHandle('H', ex + c.w / 2, by - c.h - o, 0, -1, k, 'Drag to change the height');
}
// Try a new size (and spot along the wall). It is kept only where it fits without sliding or overlapping;
// otherwise it backs off a step at a time toward the size it had, so the cabinet stops against what is in the way.
function rzApply(c, key, v, step) {
  const field = { S: 'w', E: 'w', D: 'd', H: 'h' }[key], end = c.off + c.w, cur = c[field];
  v = Math.max(6, Math.round(v / step) * step);
  const fits = val => {
    const was = { off: c.off, w: c.w, d: c.d, h: c.h };
    c[field] = val; if (key === 'S') c.off = end - val;
    const off = findFree(c, c.wall, c.side, c.off, c.id);
    if (off !== null && Math.abs(off - c.off) < 0.01) return true;
    Object.assign(c, was); return false;
  };
  const dir = v > cur ? 1 : -1;
  for (let i = 0, x = v; i < 400 && (x - cur) * dir > 0.001; i++, x -= dir * step) if (fits(r3(x))) return;
}
// Depth drag: the nearest depth of the cabinets beside it on the same wall (same height band), when the drag is close to it.
function rzDepthSnap(c, v) {
  const tol = Math.max(0.75, 12 * (ui.px || 0.1)), top = c.elev + c.h;
  let best = null;
  S.cabinets.forEach(o => {
    if (o.id === c.id || o.wall !== c.wall || o.side !== c.side || o.elev >= top || o.elev + o.h <= c.elev) return;
    const gap = Math.max(o.off - (c.off + c.w), c.off - (o.off + o.w), 0), dd = Math.abs(o.d - v);
    if (dd <= tol && (!best || gap < best.gap || (gap === best.gap && dd < best.dd))) best = { d: o.d, gap, dd, lbl: `${LBL[o.id] || ''} ${o.name}`.trim() };
  });
  return best;
}
// Height drag: the height of a cabinet beside it, or the top of any cabinet on the wall, when the drag is close to it.
function rzHeightSnap(c, v) {
  const tol = Math.max(0.75, 12 * (ui.elevPx || 0.1)), top = c.elev + c.h;
  let best = null;
  const take = (val, why, gap) => { const dd = Math.abs(val - v); if (val > 0 && dd <= tol && (!best || dd < best.dd - 0.01 || (Math.abs(dd - best.dd) <= 0.01 && gap < best.gap))) best = { v: val, dd, gap, why }; };
  S.cabinets.forEach(o => {
    if (o.id === c.id || o.wall !== c.wall || o.side !== c.side) return;
    const gap = Math.max(o.off - (c.off + c.w), c.off - (o.off + o.w), 0), lbl = `${LBL[o.id] || ''} ${o.name}`.trim();
    if (o.elev < top && o.elev + o.h > c.elev) take(o.h, `same as ${lbl}`, gap);
    take(o.elev + o.h - c.elev, `top lined up with ${lbl}`, gap);
  });
  return best;
}
// End of an arrow drag: typed formulas on that size give way to the dragged size, and it goes on the undo list.
function rzFinish(d) {
  if (!d.live) return;
  const f = { S: 'w', E: 'w', D: 'd', H: 'h' }[d.key];
  if (typeof setFormula === 'function') setFormula('cab:' + d.id, f, null);
  undoStack.push(d.snap); redoStack = []; save(); render();
}
function initPlan() {
  const plan = $('#plan');
  plan.addEventListener('contextmenu', e => e.preventDefault());
  // Two fingers on a phone or tablet pinch to zoom and drag to pan. Mouse use is unchanged.
  const touches = new Map(); let pinch = null;
  const pinchAt = () => { const [a, b] = [...touches.values()]; return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  // When one finger of a pinch lifts, the other one carries on as a pan.
  const touchUp = e => {
    touches.delete(e.pointerId);
    if (touches.size >= 2 || !pinch) return;
    pinch = null;
    const [f] = [...touches.values()];
    if (f) { ui.downAt = { x: f.x, y: f.y }; ui.drag = { mode: 'pan', vx: ui.view.x, vy: ui.view.y }; }
  };
  plan.addEventListener('pointerdown', e => {
    if (dnd) return;
    ui.touchDown = e.pointerType === 'touch';
    if (e.pointerType === 'touch') {
      // A first finger starts fresh: a finger whose lift never reached the plan must not turn one-finger drags into a pinch.
      if (e.isPrimary) { touches.clear(); pinch = null; }
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size > 1) {
        try { plan.setPointerCapture(e.pointerId); } catch (_) {}
        if (ui.drag && ui.drag.live) end(); else ui.drag = null;
        lastDown = null;
        const m = pinchAt(); pinch = { ...m, view: { ...ui.view }, world: toWorld({ clientX: m.x, clientY: m.y }) };
        return;
      }
    }
    const p = toWorld(e); ui.mouse = p; ui.shift = e.shiftKey;
    try { plan.setPointerCapture(e.pointerId); } catch (_) {}
    ui.downAt = { x: e.clientX, y: e.clientY };
    // Right-click finishes drawing walls (or stops placing a cabinet).
    if (e.button === 2 && ui.drawWalls) { stopWalls(); return; }
    if (e.button === 2 && ui.drawMold) { stopMoldDraw(); return; }
    if (ui.drawMold && e.button === 0) { moldClick(p); return; }
    if (e.button === 2 && ui.placeLight) { stopLightPlace(); return; }
    if (ui.placeLight === 'strip' && e.button === 0) { const h = hitCabs(p); if (h.length) toggleStrip(h[0]); return; }
    if (ui.placeLight && e.button === 0) { placeLightAt(p); return; }
    if (e.button === 2 && ui.placing) { placeMode(null); return; }
    const teEl = ui.topEdit && e.target.closest && e.target.closest('[data-te]');
    if (teEl && topEditDown(teEl.dataset.te, e, p)) return;
    if (e.button === 1 || e.button === 2) { ui.drag = { mode: 'pan', vx: ui.view.x, vy: ui.view.y }; return; }
    // Touch: a corner goes down when the finger lifts after a tap, so dragging pans and pinching zooms without adding walls.
    if (ui.drawWalls && e.pointerType === 'touch') { ui.drag = { mode: 'walltap', vx: ui.view.x, vy: ui.view.y }; return; }
    if (ui.drawWalls) { if (!ui.drawing) { const sp = wallSnap(p); ui.drawing = { x: sp.x, y: sp.y }; ui.drawing.first = { x: sp.x, y: sp.y }; ui.typed = ''; renderPlan(); } else commitWallSegment(); return; }
    if (ui.placing && String(ui.placing).startsWith('shape:')) {
      const keep = e.shiftKey ? ui.placing : null;
      if (placeShape(ui.placing.slice(6), p)) { ui.placing = keep; renderRoom(); }
      return;
    }
    if (ui.placing) {
      const l = libItem(ui.placing), g = l && snapToWall(p, l, null, 0, ui.px);
      if (!g) { flash('There is no room for that cabinet there.'); return; }
      const keep = e.shiftKey ? ui.placing : null; placeCabinet(ui.placing, g); ui.placing = keep; ui.ghost = null; renderRoom(); return;
    }
    const rz = e.target.closest && e.target.closest('[data-rz]');
    if (rz && rzShow()) { ui.drag = { mode: 'resize', key: rz.dataset.rz, id: ui.sel.id, snap: JSON.stringify(S), live: false }; return; }
    const hd = hitHandle(p);
    if (hd) { ui.drag = { mode: 'handle', ...hd, snap: JSON.stringify(S), st: wallSnapState(), live: false, ox: hd.end === 1 ? hd.w.x1 : hd.w.x2, oy: hd.end === 1 ? hd.w.y1 : hd.w.y2 }; return; }
    const hits = hitCabs(p), sh = hitShapes(p), dbl = hits.length || sh.length ? isDouble(e) : false;
    // A shape over cabinets (like a top) is picked by clicking again once the cabinet under it is selected.
    const shSel = ui.sel && ui.sel.type === 'shape' && sh.includes(ui.sel.id);
    if (sh.length && (!hits.length || shSel || (ui.sel && ui.sel.type === 'cab' && hits.includes(ui.sel.id)))) {
      const id = shSel ? ui.sel.id : sh[0], s = shapeById(id);
      if (dbl) { editShape(id); return; }
      select({ type: 'shape', id }); const r = segDist(p, wall(s.wall));
      ui.drag = { mode: 'shape', id, snap: JSON.stringify(S), live: false, grab: r.t - s.off, side: s.side, W: shapeBox(s.pts).w };
      return;
    }
    // The plan redraws on the first click, so the browser's dblclick never arrives: count two quick clicks here.
    // Shift or Ctrl click adds a cabinet to the selection or takes it out; Shift-drag on an empty spot draws a box.
    if (hits.length && (e.shiftKey || e.ctrlKey || e.metaKey)) { toggleMulti(hits[0]); return; }
    if (!hits.length && (e.shiftKey || e.ctrlKey || e.metaKey) && e.pointerType !== 'touch') { ui.drag = { mode: 'box', p0: p, add: e.ctrlKey || e.metaKey || multiIds().length > 0 }; return; }
    if (hits.length && dbl) { openQuick(ui.sel && hits.includes(ui.sel.id) ? ui.sel.id : hits[0]); return; }
    if (hits.length) {
      const was = ui.sel && ui.sel.type === 'cab' && hits.includes(ui.sel.id);
      const id = was ? ui.sel.id : hits[0], c = cab(id);
      const r = segDist(p, wall(c.wall));
      select({ type: 'cab', id });
      ui.drag = { mode: 'cab', id, snap: JSON.stringify(S), was, hits, delta: r.t - (c.off + c.w / 2), wall: c.wall, live: false };
      return;
    }
    const wh = hitWall(p);
    if (wh) { select({ type: 'wall', id: wh }); ui.elevWall = wh; renderRoom(); ui.drag = { mode: 'wall', w: wall(wh), p0: p, snap: JSON.stringify(S), st: wallSnapState(), live: false }; return; }
    if (ui.sel) select(null);
    ui.drag = { mode: 'pan', vx: ui.view.x, vy: ui.view.y };
  });
  plan.addEventListener('pointermove', e => {
    if (dnd) return;
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {
      if (touches.size < 2) return;
      const m = pinchAt(), sz = planSize(), v = ui.view;
      v.w = Math.max(20, Math.min(4000, pinch.view.w * pinch.d / m.d)); v.h = v.w * sz.h / sz.w;
      v.x = pinch.world.x - (m.x - sz.left) / sz.w * v.w; v.y = pinch.world.y - (m.y - sz.top) / sz.h * v.h;
      renderPlan(); return;
    }
    const p = toWorld(e); ui.mouse = p; ui.shift = e.shiftKey;
    const d = ui.drag, moved = () => Math.hypot(e.clientX - ui.downAt.x, e.clientY - ui.downAt.y) >= 4;
    if (d && d.mode === 'topnode') { if (!d.live && !moved()) return; d.live = true; topEditMove(d, p, e.shiftKey); renderPlan(); return; }
    if (d && d.mode === 'resize') {
      if (!d.live && !moved()) return;
      d.live = true; const c = cab(d.id), w = c && wall(c.wall); if (!w) return;
      const r = segDist(p, w), g = r.g, step = e.shiftKey ? 0.0625 : 0.5;
      if (d.key === 'E') rzApply(c, 'E', r.t - c.off, step);
      else if (d.key === 'S') rzApply(c, 'S', c.off + c.w - r.t, step);
      else {
        let v = ((p.x - w.x1) * g.n.x + (p.y - w.y1) * g.n.y) * c.side - w.thick / 2 - (c.outset || 0);
        const near = !e.shiftKey && rzDepthSnap(c, v); if (near) v = near.d;
        rzApply(c, 'D', v, near ? 0.0625 : step);
        if (near && Math.abs(c.d - near.d) < 0.001) { renderPlan(); renderElev(); $('#hint').textContent = `Depth ${fmtLen(c.d)}, lined up with ${near.lbl}`; return; }
      }
      renderPlan(); renderElev(); return;
    }
    if (d && d.mode === 'walltap' && moved()) d.mode = 'pan';
    if (d && d.mode === 'pan') {
      const sz = planSize(); ui.view.x = d.vx - (e.clientX - ui.downAt.x) * ui.view.w / sz.w; ui.view.y = d.vy - (e.clientY - ui.downAt.y) * ui.view.h / sz.h;
      renderPlan(); return;
    }
    if (d && d.mode === 'handle') {
      if (!d.live && !moved()) return;
      d.live = true; restoreWallState(d.st);
      const w = d.w, g = wg(w), ly = lay(), gr = ly.grid > 0 ? ly.grid : 1;
      ui.guides = null;
      if (e.shiftKey) {
        // Free corner: every wall that meets here follows the point.
        const sp = wallSnap(p, { x: d.ox, y: d.oy });
        S.walls.forEach(k => {
          if (samePt(k.x1, k.y1, { x: d.ox, y: d.oy })) { k.x1 = sp.x; k.y1 = sp.y; }
          if (samePt(k.x2, k.y2, { x: d.ox, y: d.oy })) { k.x2 = sp.x; k.y2 = sp.y; }
        });
      } else {
        // Along the wall: the length changes and walls joined at this end slide with it.
        const fx = d.end === 1 ? w.x2 : w.x1, fy = d.end === 1 ? w.y2 : w.y1, dir = d.end === 1 ? -1 : 1;
        let L = Math.max(gr, Math.round(((p.x - fx) * g.u.x + (p.y - fy) * g.u.y) * dir / gr) * gr);
        const sp = wallSnap(p, { x: d.ox, y: d.oy });
        if (sp.at) { const t = ((sp.x - fx) * g.u.x + (sp.y - fy) * g.u.y) * dir; if (t > 1) L = t; }
        const nx = fx + g.u.x * dir * L, ny = fy + g.u.y * dir * L;
        moveWallEnd(w, d.end, { x: nx - d.ox, y: ny - d.oy });
      }
      renderPlan(); renderElev(); renderProps(); return;
    }
    if (d && d.mode === 'wall') {
      if (!d.live && !moved()) return;
      d.live = true; restoreWallState(d.st);
      const w = d.w, g = wg(w), gr = lay().grid > 0 ? lay().grid : 1;
      const t = Math.round(((p.x - d.p0.x) * g.n.x + (p.y - d.p0.y) * g.n.y) / gr) * gr;
      moveWall(w, { x: g.n.x * t, y: g.n.y * t });
      renderPlan(); renderElev(); return;
    }
    if (d && d.mode === 'box') { d.p1 = p; renderPlan(); return; }
    if (d && d.mode === 'shape') {
      if (!d.live && !moved()) return;
      d.live = true; const s = shapeById(d.id), w = wall(s.wall), r = segDist(p, w), gr = lay().grid > 0 ? lay().grid : 1;
      s.off = Math.max(-d.W, Math.min(r.g.L, Math.round((r.t - d.grab) / gr) * gr));
      renderPlan(); renderElev(); return;
    }
    if (d && d.mode === 'cab') {
      if (!d.live && !moved()) return;
      d.live = true; const c = cab(d.id);
      const g = snapToWall(p, c, c.id, 0, ui.px);
      if (g) {
        const g2 = (g.wall === d.wall && snapToWall(p, c, c.id, d.delta, ui.px)) || g;
        c.wall = g2.wall; c.side = g2.side; c.off = g2.off; ui.elevWall = c.wall;
      }
      renderPlan(); renderElev(); return;
    }
    if (ui.placing) { const l = libItem(ui.placing); ui.ghost = l ? snapToWall(p, l, null, 0, ui.px) : null; ui.ghostBlocked = !!l && !ui.ghost && S.walls.some(w => segDist(p, w).d < l.d + 30); ui.ghostLib = null; renderPlan(); return; }
    if (ui.drawWalls || ui.drawMold || ui.placeLight) renderPlan();
  });
  const end = () => {
    const d = ui.drag; ui.drag = null; ui.guides = null; if (!d) return;
    if (d.mode === 'resize') { rzFinish(d); return; }
    if (d.mode === 'topnode') { if (d.live) { undoStack.push(d.snap); redoStack = []; save(); render(); } return; }
    if (d.mode === 'box') { finishBox(d); return; }
    if (d.mode === 'walltap' && ui.drawWalls) {
      if (!ui.drawing) { const sp = wallSnap(ui.mouse); ui.drawing = { x: sp.x, y: sp.y, first: { x: sp.x, y: sp.y } }; ui.typed = ''; renderPlan(); }
      else commitWallSegment();
      return;
    }
    if (d.mode === 'cab' && d.live) { const c = cab(d.id); if (c) ['L', 'R'].forEach(e => { if (c['fill' + e] === 'on') c['fill' + e] = ''; }); }
    if ((d.mode === 'cab' || d.mode === 'handle' || d.mode === 'wall' || d.mode === 'shape') && d.live) { undoStack.push(d.snap); redoStack = []; save(); render(); }
    else if (d.mode === 'cab' && d.was && d.hits.length > 1) { const i = d.hits.indexOf(d.id); select({ type: 'cab', id: d.hits[(i + 1) % d.hits.length] }); }
  };
  plan.addEventListener('pointerup', e => { const was = pinch; touchUp(e); if (!was) end(); });
  plan.addEventListener('pointercancel', e => { const was = pinch; touchUp(e); if (!was) end(); });
  // Every finger is off the screen: forget them all, and finish a drag whose lift was lost.
  onAllFingersUp(() => { touches.clear(); pinch = null; if (ui.drag && ui.touchDown) end(); });
  plan.addEventListener('pointerleave', () => { if (ui.placing && !dnd) { ui.ghost = null; ui.ghostBlocked = false; renderPlan(); } });
  // A double tap must not end the walls on a phone; there the Stop button does.
  plan.addEventListener('dblclick', () => { if (ui.drawWalls && !ui.touchDown) stopWalls(); });
  plan.addEventListener('wheel', e => { e.preventDefault(); const p = toWorld(e); zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y); }, { passive: false });
}

/* ---------- Elevation ---------- */
// Side of a wall the elevation looks at: the one its cabinets are on, else the one facing into the room.
function elevSide(w) {
  if (w.viewSide) return w.viewSide;
  const c = S.cabinets.find(k => k.wall === w.id); if (c) return c.side;
  const pts = S.walls.flatMap(k => [[k.x1, k.y1], [k.x2, k.y2]]), cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const g = wg(w); return (cx - (w.x1 + w.x2) / 2) * g.n.x + (cy - (w.y1 + w.y2) / 2) * g.n.y < -0.01 ? -1 : 1;
}
const fillFor = (m, cls) => { if (!m) return `class="${cls} nss"`; const tx = texURL(m); return tx ? `class="${cls} nss" style="fill:url(#tx-${m.id})"` : `class="${cls} nss" style="fill:${esc(m.color || '')}"`; };
function texDefs(ids) {
  return [...new Set(ids)].map(id => { const m = mat(id), tx = texURL(m); if (!tx) return ''; const k = m.texScale || 24; return `<pattern id="tx-${m.id}" patternUnits="userSpaceOnUse" width="${k}" height="${k}"><image href="${tx}" width="${k}" height="${k}" preserveAspectRatio="none"/></pattern>`; }).join('');
}
// Face of one front in elevation: frame joints, panels by type, and the panel design. (x, y) is the top-left corner.
function doorFaceSVG(ds, framed, x, y, w, h) {
  const lay = doorLayout(ds, w, h, framed), Y = z => y + h - z;
  let s = '';
  if (framed && ds.type === 'fivepiece') lay.frame.filter(m => m.kind !== 'stile').forEach(m => { s += `<rect class="ev-frame nss" x="${x + m.x0}" y="${Y(m.z1)}" width="${m.x1 - m.x0}" height="${m.z1 - m.z0}"/>`; });
  lay.fields.forEach(fl => {
    const fx = x + fl.x0, fy = Y(fl.z1), fw = fl.x1 - fl.x0, fh = fl.z1 - fl.z0;
    if (framed) {
      if (fl.pt === 'glass' && typeof layers3d === 'function' && layers3d().glass === false) { s += `<rect class="ev-inner nss" x="${fx}" y="${fy}" width="${fw}" height="${fh}" stroke-dasharray="2 2"/>`; return; }
      if (fl.pt === 'glass') { s += `<rect class="ev-glass nss" x="${fx}" y="${fy}" width="${fw}" height="${fh}"/><path class="ev-bevel nss" d="M${fx + fw * 0.15} ${fy + fh * 0.35}L${fx + fw * 0.45} ${fy + fh * 0.1}M${fx + fw * 0.2} ${fy + fh * 0.5}L${fx + fw * 0.6} ${fy + fh * 0.17}"/>`; return; }
      if (fl.pt === 'open') { s += `<rect class="ev-openfield nss" x="${fx}" y="${fy}" width="${fw}" height="${fh}"/>`; return; }
      s += `<rect class="ev-field nss" x="${fx}" y="${fy}" width="${fw}" height="${fh}"/>`;
      const r = Math.min(ds.raiseW, fw / 2 - 0.5, fh / 2 - 0.5);
      if (fl.pt === 'raised' && r > 0.2) {
        s += `<rect class="ev-raise nss" x="${fx + r}" y="${fy + r}" width="${fw - 2 * r}" height="${fh - 2 * r}"/>`;
        s += `<path class="ev-bevel nss" d="M${fx} ${fy}L${fx + r} ${fy + r}M${fx + fw} ${fy}L${fx + fw - r} ${fy + r}M${fx} ${fy + fh}L${fx + r} ${fy + fh - r}M${fx + fw} ${fy + fh}L${fx + fw - r} ${fy + fh - r}"/>`;
      }
    }
    designLines(ds, fl).forEach(l => {
      if (ds.design === 'xbrace') {
        // The brace as a board clipped to the field: its ends sit flat on the top and bottom of the opening.
        const bw = Math.min(ds.grooveW / Math.sin(Math.atan2(fh, fw)), fw / 2), d = l.x2 > l.x1 ? 1 : -1;
        s += `<polygon class="ev-xbrace nss" points="${x + l.x1},${Y(l.z1)} ${x + l.x1 + d * bw},${Y(l.z1)} ${x + l.x2},${Y(l.z2)} ${x + l.x2 - d * bw},${Y(l.z2)}"/>`;
      }
      else {
        s += `<line class="ev-groove nss" x1="${x + l.x1}" y1="${Y(l.z1)}" x2="${x + l.x2}" y2="${Y(l.z2)}"/>`;
        if (ds.design === 'beadboard') s += `<line class="ev-groove nss" x1="${x + l.x1 + 0.3}" y1="${Y(l.z1)}" x2="${x + l.x2 + 0.3}" y2="${Y(l.z2)}" stroke-opacity=".2"/>`;
      }
    });
  });
  return s;
}
// Front drawing for one cabinet in elevation space; by is the cabinet bottom's y (y grows downward).
function frontsSVG(c, ex, by, opts = {}) {
  const p = effParams(c), fr = computeFronts(c, p), tk = hasToe(c) ? p.toeKickHeight : 0;
  const Y = z => by - z, cm = mat(cabMatT(cabSet(c, 'cabMatT')).carcass);
  const mats = [];
  const fo = (c.shape || {}).front ? clipPoly(cabOutline(c, 'front'), 0, c.w, tk, c.h) : null;
  let s = fo ? `<polygon ${fillFor(cm, 'ev-box')} points="${fo.map(q => `${r3(ex + q.x)},${r3(Y(q.y))}`).join(' ')}"/>` : `<rect ${fillFor(cm, 'ev-box')} x="${ex}" y="${Y(c.h)}" width="${c.w}" height="${c.h - tk}"/>`;
  mats.push(cm && cm.id);
  if (tk && p.toeSkin !== 'off') s += `<rect class="ev-toe" x="${ex + 0.2}" y="${Y(tk)}" width="${c.w - 0.4}" height="${tk}"/>`;
  else if (tk && onFeet(c, p)) { const per = Math.ceil(feetCount(c, p) / 2); for (let i = 0; i < per; i++) s += `<rect class="ev-leg" x="${ex + (per > 1 ? 3 + (c.w - 6) * i / (per - 1) : c.w / 2) - 0.8}" y="${Y(tk)}" width="1.6" height="${tk}"/>`; }
  // Interior, seen when the fronts are open or where a row has no fronts.
  const lay = interiorLayout(c, p, fr), t = lay.t, X = v => ex + v;
  s += `<rect class="ev-cavity nss" x="${X(t)}" y="${Y(lay.zIn1)}" width="${c.w - 2 * t}" height="${lay.zIn1 - lay.zIn0}"/>`;
  const spans = lay.divX !== null ? [[t, lay.divX - t / 2], [lay.divX + t / 2, c.w - t]] : [[t, c.w - t]];
  shelfHeights(lay, Math.max(0, p.shelfCount | 0)).forEach(z => spans.forEach(([a, b]) => { s += `<rect class="ev-shelf nss" x="${X(a)}" y="${Y(z + t)}" width="${b - a}" height="${t}"/>`; }));
  if (lay.divX !== null) s += `<rect class="ev-shelf nss" x="${X(lay.divX - t / 2)}" y="${Y(lay.zIn1)}" width="${t}" height="${lay.zIn1 - lay.zIn0}"/>`;
  lay.rollouts.forEach(ro => { s += `<rect class="ev-dbox nss" x="${X(t + lay.spacer + 0.5)}" y="${Y(ro.z + ro.h)}" width="${c.w - 2 * (t + lay.spacer + 0.5)}" height="${ro.h}"/>`; });
  lay.trays.forEach(tr => { for (let i = 1; i <= tr.n; i++) { const xx = t + (c.w - 2 * t) * i / (tr.n + 1); s += `<line class="ev-inner nss" x1="${X(xx)}" x2="${X(xx)}" y1="${Y(tr.z1 - 0.5)}" y2="${Y(tr.z0 + 0.5)}" stroke-width="2"/>`; } });
  lay.bins.forEach(bn => { const bh = Math.min(20, bn.z1 - bn.z0 - 2), iw = c.w - 2 * t; [0.06, 0.52].forEach(k => { s += `<rect class="ev-bin nss" x="${X(t + iw * k)}" y="${Y(bn.z0 + 0.5 + bh)}" width="${iw * 0.42}" height="${bh}" rx="1"/>`; }); });
  lay.lazy.forEach(lz => [0.3, 0.72].forEach(k => { s += `<ellipse class="ev-dbox nss" cx="${X(c.w / 2)}" cy="${Y(lz.z0 + (lz.z1 - lz.z0) * k)}" rx="${(c.w - 2 * t) / 2 - 0.75}" ry="1.2"/>`; }));
  fr.forEach(f => {
    const x = ex + f.x0, y = Y(f.z1), w = f.x1 - f.x0, h = f.z1 - f.z0;
    if (f.type === 'open' || opts.noFronts) {
      // Inside view (no fronts): the opening outline, and the drawer box where a drawer is.
      if (opts.noFronts && f.type === 'drawer' && h > 2.5 && w > 2) s += `<rect class="ev-dbox nss" x="${x + 0.75}" y="${y + 1}" width="${w - 1.5}" height="${h - 2}"/>`;
      s += `<rect class="ev-inner nss" x="${x}" y="${y}" width="${w}" height="${h}" stroke-dasharray="2 2"/>`; return;
    }
    const { ds, framed } = frontStyle(c, f), fm = mat(ds.mat); mats.push(fm && fm.id);
    if (opts.open && f.type === 'door') {
      // Door swung open on its hinge: seen nearly edge-on beside the hinge side.
      const hx = f.hinge === 'R' ? x + w : x, o = (f.hinge === 'R' ? 1 : -1) * Math.min(w * 0.22, 4), k = Math.abs(o) * 0.3;
      s += `<polygon ${fillFor(fm, 'ev-front')} points="${hx},${y} ${hx + o},${y - k} ${hx + o},${y + h + k} ${hx},${y + h}"/>`;
      return;
    }
    if (opts.open && f.type === 'drawer') {
      // Drawer pulled out: the box shows behind a see-through front.
      s += `<rect class="ev-dbox nss" x="${x + 0.75}" y="${y + 1}" width="${Math.max(0.1, w - 1.5)}" height="${Math.max(0.1, h - 2)}"/>`;
      s += `<rect class="ev-front ev-ghostfront nss" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
      return;
    }
    s += `<rect ${fillFor(fm, 'ev-front')} x="${x}" y="${y}" width="${w}" height="${h}"/>`;
    s += doorFaceSVG(ds, framed, x, y, w, h);
    if (typeof vGlassInside === 'function') s += vGlassInside(c, f, ds, x, y, w, h);
    if (f.type === 'door' && !opts.noSwing) {
      const hx = f.hinge === 'L' ? x : x + w, ox = f.hinge === 'L' ? x + w : x;
      s += `<path class="ev-swing nss" d="M${ox} ${y} L${hx} ${y + h / 2} L${ox} ${y + h}"/>`;
    }
    const pp = pullPlacement(c, f);
    if (opts.dims) {
      // Finished front size, centered (drawers: above the pull so both stay readable).
      const t = `${fmtLen(w)} × ${fmtLen(h)}`, fz = Math.min(opts.dims, h * 0.3, w * 0.86 / (t.length * 0.6)), ty = f.type === 'drawer' && h < 12 ? y + h * 0.28 : y + h / 2;
      if (fz > 0.5) s += `<text class="lbl dimtxt fdim" x="${x + w / 2}" y="${ty}" font-size="${fz}" text-anchor="middle" dominant-baseline="middle" pointer-events="none">${t}</text>`;
    }
    if (pp) {
      const L = Math.max(pp.hw.lengthMM * MM, 1), px = x + pp.x, py = y + h - pp.z, th = 0.5;
      s += pp.hw.ccMM ? (pp.vertical ? `<rect class="ev-pull" x="${px - th / 2}" y="${py - L / 2}" width="${th}" height="${L}" rx="${th / 2}" style="fill:${esc(pp.hw.finish)}"/>` : `<rect class="ev-pull" x="${px - L / 2}" y="${py - th / 2}" width="${L}" height="${th}" rx="${th / 2}" style="fill:${esc(pp.hw.finish)}"/>`) : `<circle class="ev-pull" cx="${px}" cy="${py}" r="${L / 2}" style="fill:${esc(pp.hw.finish)}"/>`;
    }
  });
  return opts.withDefs ? { svg: s, mats } : s;
}
function renderElev() {
  const svg = $('#elev'), w = wall(ui.elevWall), note = $('#elevnote');
  if (!w) { svg.innerHTML = ''; note.textContent = 'Draw a wall to see its elevation.'; return; }
  const g = wg(w), L = g.L, H = w.height, side = elevSide(w);
  const cs = S.cabinets.filter(c => c.wall === w.id && c.side === side);
  note.textContent = cs.length ? `${cs.length} cabinet${cs.length > 1 ? 's' : ''}. Drag a cabinet to move it.` : 'No cabinets on this side yet';
  const dm = ui.dims.cab, r = svg.getBoundingClientRect(), x0 = -12, top = -H - (dm ? 22 : 8), vbW = L + (dm ? 46 : 24), vbH = -top + (dm ? 40 : 22);
  let px = Math.max(vbW / (r.width || 600), vbH / (r.height || 300));
  // Zoomed in (pinch, scroll wheel or the + button): a smaller window on the same drawing.
  ui.elevBase = { wall: w.id, x0, top, vbW, vbH, px };
  const z = ui.elevZ && ui.elevZ.wall === w.id ? ui.elevZ : null;
  let vb = `${x0} ${top} ${vbW} ${vbH}`;
  if (z) { const zw = vbW / z.k, zh = vbH / z.k; px /= z.k; vb = `${z.cx - zw / 2} ${z.cy - zh / 2} ${zw} ${zh}`; }
  const fs = 10.5 * px;
  ui.elevPx = px; ui.elevL = L;
  svg.setAttribute('viewBox', vb);
  const zc = $('#elevzoom'); if (zc) zc.style.display = z ? '' : 'none';
  let body = `<rect class="ev-wall nss" x="0" y="${-H}" width="${L}" height="${H}"/><line class="ev-floor nss" x1="-8" x2="${L + 8}" y1="0" y2="0" stroke-width="2"/>`;
  const mats = [], dims = []; let labels = '';
  cs.forEach(c => {
    const ex = elevX(c, L), by = -c.elev, f = frontsSVG(c, ex, by, { withDefs: true, dims: ui.dims.fronts ? fs * 0.95 : 0, open: !!ui.open[c.id] });
    mats.push(...f.mats);
    body += `<g data-cab="${c.id}">` + f.svg;
    const ps = panelStyle(cabSet(c, 'panelStyle')), pt = panelThick(c), ph = ps.toFloor || c.cat === 'Wall' ? c.h : c.h - effParams(c).toeKickHeight, pm = mat(ps.mat); mats.push(pm && pm.id);
    if (hasPanel(c, 'L')) body += `<rect ${fillFor(pm, 'apanel')} x="${ex - pt}" y="${by - c.h}" width="${pt}" height="${ph}"/>`;
    if (hasPanel(c, 'R')) body += `<rect ${fillFor(pm, 'apanel')} x="${ex + c.w}" y="${by - c.h}" width="${pt}" height="${ph}"/>`;
    const fm = mat(fillerMat(c)), ftk = c.cat === 'Wall' || !hasToe(c) ? 0 : effParams(c).toeKickHeight; mats.push(fm && fm.id);
    fillersOf(c).forEach(fl => { body += `<rect ${fillFor(fm, 'ev-filler')} x="${fl.end === 'L' ? ex - fl.gap : ex + c.w}" y="${by - c.h}" width="${fl.gap}" height="${c.h - ftk}"/>`; });
    body += `<rect class="ev-hit" x="${ex}" y="${by - c.h}" width="${c.w}" height="${c.h}"/>`;
    if (ui.dropCab === c.id) body += `<rect class="ev-halo drop nss" x="${ex}" y="${by - c.h}" width="${c.w}" height="${c.h}"/><rect class="ev-drop nss" x="${ex}" y="${by - c.h}" width="${c.w}" height="${c.h}"/>`;
    else if ((ui.sel && ui.sel.type === 'cab' && ui.sel.id === c.id) || inMulti(c.id)) body += `<rect class="ev-halo nss" x="${ex}" y="${by - c.h}" width="${c.w}" height="${c.h}"/><rect class="ev-sel nss" x="${ex}" y="${by - c.h}" width="${c.w}" height="${c.h}"/>`;
    body += '</g>';
    labels += `<text class="lbl dimtxt" x="${ex + c.w / 2}" y="${by - c.h - 2 * px}" font-size="${fs}" text-anchor="middle" font-weight="600" pointer-events="none">${LBL[c.id]}</text>`;
    if (!c.noDim) dims.push([ex, ex + c.w, c.cat === 'Wall' ? 'up' : 'down']);
    fillersOf(c).forEach(fl => { const fx = fl.end === 'L' ? ex - fl.gap : ex + c.w; dims.push([fx, fx + fl.gap, c.cat === 'Wall' ? 'up' : 'down', 'fill']); });
  });
  // Open stretches of wall get a dimension too: below for the base run, above for the uppers.
  const levels = [['down', cs.filter(c => c.cat !== 'Wall')], ['up', cs.filter(c => c.cat === 'Wall')]];
  levels.forEach(([where, lv]) => {
    if (!lv.length) return;
    const z0 = Math.min(...lv.map(c => c.elev)), z1 = Math.max(...lv.map(c => c.elev + c.h));
    const spec = { d: Math.max(...lv.map(c => c.d)), outset: 0, elev: z0, h: z1 - z0 };
    const spans = obstacles(w.id, side, spec, null).map(o => [o.a0, o.a1]);
    cs.forEach(c => { if (vOverlap(c, spec)) fillersOf(c).forEach(fl => spans.push([fl.a0, fl.a1])); });
    spans.sort((a, b) => a[0] - b[0]);
    let at = 0;
    spans.forEach(([a0, a1]) => { if (a0 > at + 0.05 && a0 > 0) { const g0 = Math.max(0, at), g1 = Math.min(L, a0); if (g1 - g0 > 0.05) dims.push([side === 1 ? g0 : L - g1, side === 1 ? g1 : L - g0, where, 'gap']); } at = Math.max(at, a1); });
    if (at < L - 0.05) dims.push([side === 1 ? Math.max(0, at) : 0, side === 1 ? L : L - Math.max(0, at), where, 'gap']);
  });
  // ghost while dragging a library cabinet over the elevation
  const gl = ui.ghost && ui.ghost.wall === w.id && ui.ghost.side === side && libItem(ui.ghostLib);
  if (gl) { const gw = ui.ghost.w || gl.w, gx = elevX({ ...gl, w: gw, side, off: ui.ghost.off }, L); body += `<rect class="ghost nss" x="${gx}" y="${-gl.elev - gl.h}" width="${gw}" height="${gl.h}"/>`; }
  body += shapesElevSVG(w, side, L, mats);
  // The room standard gap under the ceiling: a dashed line that uppers and talls stay below.
  if (typeof ceilGap === 'function' && ceilGap() > 0 && !(roomCeiling().slope && roomCeiling().slope !== 'none')) { const cy = (+roomCeiling().h > 0 ? +roomCeiling().h : (w.height || 96)) - ceilGap(); body += `<line class="ev-ceilgap nss" x1="0" x2="${L}" y1="${-cy}" y2="${-cy}"><title>Cabinets stay ${fmtLen(ceilGap())} off the ceiling (Room tab below)</title></line>`; }
  // end caps that stick out toward the viewer
  capsOf(w).filter(cp => cp.side === side).forEach(cp => {
    const a = side === 1 ? cp.a0 : L - cp.a1;
    body += `<rect class="ev-cap nss" x="${a}" y="${-cp.height}" width="${cp.t}" height="${cp.height}"/>`;
  });
  // countertops and moldings on this wall side
  countertopRuns().filter(rn => rn.on && rn.wall === w.id && rn.side === side).forEach(rn => {
    const a = side === 1 ? rn.start - rn.ovS : L - rn.end - rn.ovE, m = mat(rn.tpl.mat); mats.push(m && m.id);
    body += `<rect ${fillFor(m, 'ev-top')} x="${a}" y="${-(rn.top + rn.thick)}" width="${rn.len}" height="${rn.thick}"/>`;
    if (rn.tpl.backsplash > 0) body += `<rect ${fillFor(m, 'ev-top')} x="${side === 1 ? rn.start : L - rn.end}" y="${-(rn.top + rn.thick + rn.tpl.backsplash)}" width="${rn.end - rn.start}" height="${rn.tpl.backsplash}" opacity=".75"/>`;
  });
  moldingRuns().filter(rn => rn.wall === w.id && rn.side === side).forEach(rn => {
    const a = (side === 1 ? rn.start : L - rn.end) - (side === 1 ? (rn.retS ? rn.m.d : 0) : (rn.retE ? rn.m.d : 0)), m = mat(rn.m.mat); mats.push(m && m.id);
    body += `<rect ${fillFor(m, 'ev-mold')} x="${a}" y="${-(rn.z + rn.h)}" width="${rn.front}" height="${rn.h}"/>`;
    if (rn.m.profile !== 'flat') body += `<line class="ev-inner nss" x1="${a}" x2="${a + rn.front}" y1="${-(rn.z + rn.h * 0.45)}" y2="${-(rn.z + rn.h * 0.45)}"/>`;
  });
  if (dm) {
    // Width chains: base and tall below the floor, uppers above the ceiling. Heights chain on the right.
    // Fillers and open wall show in the same chain; narrow ones put their number one line further out.
    dims.forEach(([a, b, where, kind]) => {
      const up = where === 'up', dy = up ? -H - 10 : 9, narrow = b - a < fs * 2.6, ty = (up ? dy - 3 - fs * 0.3 : dy + 3 + fs) + (narrow ? (up ? -fs * 1.05 : fs * 1.05) : 0);
      body += `<path class="dimln nss" d="M${a} ${dy - 3}V${dy + 3}M${b} ${dy - 3}V${dy + 3}M${a} ${dy}H${b}"/>`;
      body += `<text class="lbl-m${kind ? ' dim-' + kind : ''}" x="${(a + b) / 2}" y="${ty}" font-size="${fs}" text-anchor="middle">${fmtLen(b - a)}</text>`;
    });
    // Overall wall length under everything.
    const ty0 = 9 + 3 + fs * 2.3, dyT = ty0 + 4;
    body += `<path class="dimln nss" d="M0 ${dyT - 3}V${dyT + 3}M${L} ${dyT - 3}V${dyT + 3}M0 ${dyT}H${L}"/><text class="lbl-m dim-total" x="${L / 2}" y="${dyT + 3 + fs}" font-size="${fs}" text-anchor="middle">${fmtLen(L)} wall</text>`;
    const zs = [...new Set([0, H, ...cs.flatMap(c => [c.elev, c.elev + c.h])].map(z => Math.round(z * 32) / 32))].sort((a, b) => a - b), dx = L + 8;
    body += `<path class="dimln nss" d="M${dx} ${-zs[zs.length - 1]}V${-zs[0]}${zs.map(z => `M${dx - 3} ${-z}H${dx + 3}`).join('')}"/>`;
    zs.slice(1).forEach((z, i) => { const m = (z + zs[i]) / 2; if (z - zs[i] > fs * 1.2) body += `<text class="lbl-m" x="${dx + 4}" y="${-m}" font-size="${fs}" dominant-baseline="middle">${fmtLen(z - zs[i])}</text>`; });
  } else body += `<text class="lbl-m" x="${L + 4}" y="${-H / 2}" font-size="${fs}" text-anchor="middle" transform="rotate(-90 ${L + 4} ${-H / 2})">${fmtLen(H, 1)} ceiling</text>`;
  const ms = ui.measure;
  if (ms && ms.wall === w.id && ms.side === side) {
    const y = -ms.z, ah = 2.2 * px, fy = y - 3 * px;
    labels += `<g class="ev-meas" pointer-events="none"><path class="nss" d="M${ms.a} ${y}H${ms.b}M${ms.a + ah * 2} ${y - ah}L${ms.a} ${y}L${ms.a + ah * 2} ${y + ah}M${ms.b - ah * 2} ${y - ah}L${ms.b} ${y}L${ms.b - ah * 2} ${y + ah}"/>
      <text x="${(ms.a + ms.b) / 2}" y="${fy}" font-size="${fs * 1.1}" text-anchor="middle" paint-order="stroke">${fmtLen(ms.b - ms.a)}</text></g>`;
  }
  const rc = rzShow(); if (rc && rc.wall === w.id && rc.side === side) labels += resizeHandlesElev(rc, elevX(rc, L), L);
  if (typeof vChainSVG === 'function') labels += vChainSVG(w, side, fs, px);
  svg.innerHTML = `<defs>${texDefs(mats.filter(Boolean))}</defs>` + body + labels;
}
// The open span at elevation point (x, z): out to the nearest thing at that height on each side, or the wall ends.
// Spans are in elevation x, so they match what is drawn whichever side of the wall is shown.
function elevMeasure(x, z) {
  const w = wall(ui.elevWall); if (!w) return null;
  const L = wg(w).L, side = elevSide(w); if (x < 0 || x > L || z < 0 || z > w.height) return null;
  const spans = [], at = (z0, z1) => z >= z0 - 0.01 && z <= z1 + 0.01;
  S.cabinets.filter(c => c.wall === w.id && c.side === side && at(c.elev, c.elev + c.h)).forEach(c => {
    const ex = elevX(c, L), pt = panelThick(c);
    let a = ex - (hasPanel(c, 'L') ? pt : 0), b = ex + c.w + (hasPanel(c, 'R') ? pt : 0);
    fillersOf(c).forEach(fl => { if (fl.end === 'L') a = Math.min(a, ex - fl.gap); else b = Math.max(b, ex + c.w + fl.gap); });
    spans.push([a, b]);
  });
  capsOf(w).filter(cp => cp.side === side && at(0, cp.height)).forEach(cp => { const a = side === 1 ? cp.a0 : L - cp.a1; spans.push([a, a + cp.t]); });
  countertopRuns().filter(rn => rn.on && rn.wall === w.id && rn.side === side && at(rn.top, rn.top + rn.thick)).forEach(rn => { const a = side === 1 ? rn.start - rn.ovS : L - rn.end - rn.ovE; spans.push([a, a + rn.len]); });
  if (spans.some(([a, b]) => x > a && x < b)) return null;
  const a = Math.max(0, ...spans.filter(sp => sp[1] <= x + 0.01).map(sp => sp[1])), b = Math.min(L, ...spans.filter(sp => sp[0] >= x - 0.01).map(sp => sp[0]));
  return b - a > 0.05 ? { wall: w.id, side, z, a, b } : null;
}
// Where a library cabinet would land if dropped at elevation point p on the wall being shown.
function elevGhost(l, p) {
  const w = wall(ui.elevWall); if (!w || !p) return null;
  const L = wg(w).L, side = elevSide(w);
  const fit = fitOpening(l, w.id, side, side === 1 ? p.x : L - p.x);
  if (fit) return { wall: w.id, side, off: fit.off, w: fit.w };
  const want = snapOff(l, w.id, side, side === 1 ? p.x - l.w / 2 : L - p.x - l.w / 2, null, ui.elevPx || 1);
  const off = findFree(l, w.id, side, want, null);
  return off === null ? null : { wall: w.id, side, off };
}
function elevPoint(e) {
  const svg = $('#elev'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const m = svg.getScreenCTM(); return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
}
// Zoom the elevation to k times its fitted size, with drawing point wp under screen point m.
function elevZoomTo(k, wp, m) {
  const b = ui.elevBase, svg = $('#elev'); if (!b || !svg || b.wall !== ui.elevWall) return;
  const r = svg.getBoundingClientRect(), clamp = (v, a, z) => Math.max(a, Math.min(z, v));
  k = clamp(k, 1, 40);
  if (k <= 1.001) ui.elevZ = null;
  else {
    const upp = b.px / k;
    ui.elevZ = { wall: b.wall, k,
      cx: clamp(wp.x - (m.x - (r.left + r.width / 2)) * upp, b.x0, b.x0 + b.vbW),
      cy: clamp(wp.y - (m.y - (r.top + r.height / 2)) * upp, b.top, b.top + b.vbH) };
  }
  renderElev();
}
// The + and - buttons zoom about the middle of the view; Fit goes back to the whole wall.
function elevZoomStep(f) {
  const b = ui.elevBase, svg = $('#elev'); if (!b || !svg) return;
  if (!f) { ui.elevZ = null; renderElev(); return; }
  const z = ui.elevZ && ui.elevZ.wall === b.wall ? ui.elevZ : null, r = svg.getBoundingClientRect();
  elevZoomTo((z ? z.k : 1) * f, z ? { x: z.cx, y: z.cy } : { x: b.x0 + b.vbW / 2, y: b.top + b.vbH / 2 }, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
}
function initElev() {
  const svg = $('#elev');
  // Two fingers pinch to zoom and drag to pan; one finger (or the mouse) on open wall pans once zoomed in.
  const touches = new Map(); let pinch = null;
  const pinchAt = () => { const [a, b] = [...touches.values()]; return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const panFrom = (x, y) => { const z = ui.elevZ && ui.elevZ.wall === ui.elevWall ? ui.elevZ : null; ui.edrag = { pan: true, x, y, z: z && { ...z }, moved: false }; };
  svg.addEventListener('pointerdown', e => {
    if (dnd) return;
    if (e.pointerType === 'touch') {
      if (e.isPrimary) { touches.clear(); pinch = null; }
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size > 1) {
        try { svg.setPointerCapture(e.pointerId); } catch (_) {}
        if (ui.edrag && !ui.edrag.pan) end(); ui.edrag = null; lastDown = null;
        const m = pinchAt(), z = ui.elevZ && ui.elevZ.wall === ui.elevWall ? ui.elevZ : null;
        pinch = { d: m.d, k: z ? z.k : 1, world: elevPoint({ clientX: m.x, clientY: m.y }) };
        return;
      }
    }
    if (ui.chainDim && typeof vChainClick === 'function') { const w = wall(ui.elevWall); if (w && vChainClick(e, w, elevSide(w))) return; }
    const rz = e.target.closest('[data-rz]');
    if (rz && rzShow()) {
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      const p = elevPoint(e); ui.edrag = { resize: true, key: rz.dataset.rz, id: ui.sel.id, sx: p.x, sy: p.y, snap: JSON.stringify(S), live: false };
      return;
    }
    const gs = e.target.closest('[data-shape]');
    if (gs) {
      const s = shapeById(gs.dataset.shape); if (!s) return;
      if (isDouble(e)) { editShape(s.id); return; }
      select({ type: 'shape', id: s.id });
      const p = elevPoint(e);
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      ui.edrag = { shape: s.id, sx: p.x, sy: p.y, off: s.off, elev: s.elev, snap: JSON.stringify(S), live: false };
      return;
    }
    const g = e.target.closest('[data-cab]');
    // A click on open wall measures the opening there, wall to wall or to the nearest cabinet, end cap or top.
    // Dragging there instead pans the zoomed-in view.
    if (!g) {
      if (e.button === 0 && !ui.placing && !ui.drawWalls) { try { svg.setPointerCapture(e.pointerId); } catch (_) {} panFrom(e.clientX, e.clientY); ui.edrag.measure = elevPoint(e); }
      return;
    }
    const c = cab(g.dataset.cab); if (!c) return;
    ui.measure = null;
    if (ui.placeLight === 'strip') { toggleStrip(c.id); return; }
    if (e.shiftKey || e.ctrlKey || e.metaKey) { toggleMulti(c.id); return; }
    if (isDouble(e)) { openQuick(c.id); return; }
    select({ type: 'cab', id: c.id });
    const p = elevPoint(e);
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    ui.edrag = { id: c.id, sx: p.x, sy: p.y, off: c.off, elev: c.elev, snap: JSON.stringify(S), live: false };
  });
  svg.addEventListener('pointermove', e => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {
      if (touches.size < 2) return;
      const m = pinchAt(); elevZoomTo(pinch.k * m.d / pinch.d, pinch.world, m); return;
    }
    const d = ui.edrag; if (!d) return;
    if (d.pan) {
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.moved = true; if (!d.z) return;
      const b = ui.elevBase, upp = b.px / d.z.k, r = svg.getBoundingClientRect();
      elevZoomTo(d.z.k, { x: d.z.cx - (e.clientX - d.x) * upp, y: d.z.cy - (e.clientY - d.y) * upp }, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      return;
    }
    if (d.resize) {
      const p = elevPoint(e), c = cab(d.id), w = c && wall(c.wall); if (!w) return;
      if (!d.live && Math.abs(p.x - d.sx) < 1 && Math.abs(p.y - d.sy) < 1) return;
      d.live = true; const L = wg(w).L, t = elevSide(w) === 1 ? p.x : L - p.x, step = e.shiftKey ? 0.0625 : 0.5;
      if (d.key === 'E') rzApply(c, 'E', t - c.off, step);
      else if (d.key === 'S') rzApply(c, 'S', c.off + c.w - t, step);
      else {
        let v = -p.y - c.elev; const near = !e.shiftKey && rzHeightSnap(c, v); if (near) v = near.v;
        if (typeof ceilMax === 'function') v = Math.min(v, ceilMax(c) - c.elev);
        rzApply(c, 'H', v, near ? 0.0625 : step);
        if (near && Math.abs(c.h - near.v) < 0.001) { renderElev(); renderPlan(); $('#hint').textContent = `Height ${fmtLen(c.h)}, ${near.why}`; return; }
      }
      renderElev(); renderPlan(); return;
    }
    if (d.shape) {
      const p = elevPoint(e), s = shapeById(d.shape); if (!s) return;
      const dx = p.x - d.sx, dz = -(p.y - d.sy);
      if (!d.live && Math.abs(dx) < 1 && Math.abs(dz) < 1) return;
      d.live = true;
      s.off = Math.round((d.off + (s.side === 1 ? dx : -dx)) * 4) / 4; s.elev = Math.max(0, Math.round((d.elev + dz) * 4) / 4);
      // Tops snap to sit on the cabinets below them.
      let best = Math.max(lay().snapReach, 10 * ui.elevPx);
      S.cabinets.forEach(k => { if (k.wall === s.wall) { const v = k.elev + k.h; if (Math.abs(v - (d.elev + dz)) < best) { best = Math.abs(v - (d.elev + dz)); s.elev = v; } } });
      renderElev(); renderPlan(); return;
    }
    const p = elevPoint(e), c = cab(d.id); if (!c) return;
    const dx = p.x - d.sx, dz = -(p.y - d.sy);
    if (!d.live && Math.abs(dx) < 1 && Math.abs(dz) < 1) return;
    d.live = true;
    // Uppers move up and down too, snapping to the tops and bottoms of other cabinets on the wall.
    const was = { off: c.off, elev: c.elev };
    if (c.cat === 'Wall') {
      let z = Math.max(0, Math.round((d.elev + dz) * 4) / 4), best = Math.max(lay().snapReach, 10 * ui.elevPx);
      S.cabinets.forEach(k => { if (k.id !== c.id && k.wall === c.wall) [k.elev, k.elev + k.h - c.h, k.elev + k.h].forEach(v => { if (Math.abs(v - (d.elev + dz)) < best) { best = Math.abs(v - (d.elev + dz)); z = v; } }); });
      c.elev = typeof ceilMax === 'function' ? Math.max(0, Math.min(z, r3(ceilMax(c) - c.h))) : z;
    }
    const want = snapOff(c, c.wall, c.side, d.off + (c.side === 1 ? dx : -dx), c.id, ui.elevPx);
    const off = findFree(c, c.wall, c.side, want, c.id);
    if (off === null) { c.off = was.off; c.elev = was.elev; } else c.off = Math.round(off * 1000) / 1000;
    renderElev(); renderPlan();
  });
  function end() {
    const d = ui.edrag; ui.edrag = null; if (!d) return;
    if (d.pan) { if (!d.moved && d.measure) { ui.measure = elevMeasure(d.measure.x, -d.measure.y); renderElev(); } return; }
    if (d.resize) { rzFinish(d); return; }
    if (d.live) { undoStack.push(d.snap); redoStack = []; save(); render(); }
  }
  // When one finger of a pinch lifts, the other one carries on as a pan.
  const up = e => {
    touches.delete(e.pointerId);
    if (!pinch) { end(); return; }
    if (touches.size >= 2) return;
    pinch = null; const [f] = [...touches.values()]; ui.edrag = null;
    if (f) panFrom(f.x, f.y);
  };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  onAllFingersUp(() => { touches.clear(); pinch = null; if (ui.edrag) end(); });
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const z = ui.elevZ && ui.elevZ.wall === ui.elevWall ? ui.elevZ : null;
    elevZoomTo((z ? z.k : 1) * (e.deltaY > 0 ? 1 / 1.15 : 1.15), elevPoint(e), { x: e.clientX, y: e.clientY });
  }, { passive: false });
  $('#elevwall').addEventListener('change', e => { ui.elevWall = e.target.value; renderElev(); });
}
// The touch Length box: what is typed shows on the wall being drawn; Enter draws it the way the last finger pointed.
document.addEventListener('input', e => { if (e.target.id === 'walllen' && ui.drawWalls) { ui.typed = e.target.value.trim(); renderPlan(); } });
document.addEventListener('keydown', e => {
  if (e.target.id !== 'walllen' || e.key !== 'Enter') return;
  e.preventDefault(); const t = parseLen(e.target.value);
  if (ui.drawing && isFinite(t) && t > 0) { ui.typed = e.target.value.trim(); commitWallSegment(); ui.typed = ''; const nb = $('#walllen'); if (nb) nb.value = ''; }
});
