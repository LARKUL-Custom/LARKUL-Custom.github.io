// Custom shapes: wood tops, shelves, panels and anything else drawn as an outline of points.
// Each point can round its corner, and each edge can bulge out (or in) as an arc.
// A flat shape lies like a countertop (x along the wall, y out from it); an upright one stands like a panel (x along, y up).
'use strict';
// Bigger points and + marks on touch screens, so a finger can grab them.
const fingerK = () => matchMedia('(pointer: coarse)').matches ? 1.7 : 1;

/* ---------- Geometry ---------- */
const shapeArea2 = pts => pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p.x * q.y - q.x * p.y; }, 0);
// Unit normal pointing out of the shape for the edge a→b.
function edgeOut(a, b, ccw) { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, dx = (b.x - a.x) / L, dy = (b.y - a.y) / L; return ccw ? { x: dy, y: -dx } : { x: -dy, y: dx }; }
// Points along an arc from a to b whose middle sits s out from the chord (s > 0 bulges out of the shape).
function bulgeArc(a, b, s, ccw, steps) {
  const c = Math.hypot(b.x - a.x, b.y - a.y); if (!s || c < 1e-6) return [];
  const n = edgeOut(a, b, ccw), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, as = Math.abs(s), sg = Math.sign(s);
  const R = (c * c / 4 + as * as) / (2 * as), C = { x: m.x - n.x * sg * (R - as), y: m.y - n.y * sg * (R - as) }, apex = { x: m.x + n.x * s, y: m.y + n.y * s };
  const a0 = Math.atan2(a.y - C.y, a.x - C.x), a1 = Math.atan2(b.y - C.y, b.x - C.x), am = Math.atan2(apex.y - C.y, apex.x - C.x);
  const wrap = v => { while (v <= -Math.PI) v += 2 * Math.PI; while (v > Math.PI) v -= 2 * Math.PI; return v; };
  let d = wrap(a1 - a0); const dm = wrap(am - a0);
  if (!(Math.sign(dm) === Math.sign(d) && Math.abs(dm) < Math.abs(d))) d = d - 2 * Math.PI * Math.sign(d || 1);
  const n2 = steps || Math.max(8, Math.ceil(Math.abs(d) / 0.12)), out = [];
  for (let k = 1; k < n2; k++) { const t = a0 + d * k / n2; out.push({ x: C.x + R * Math.cos(t), y: C.y + R * Math.sin(t) }); }
  return out;
}
// The finished outline as a list of points: rounded corners and bulged edges worked into short straight steps.
function shapeOutline(pts) {
  const n = pts.length; if (n < 3) return pts.map(p => ({ x: p.x, y: p.y }));
  const ccw = shapeArea2(pts) > 0, corner = [];
  for (let i = 0; i < n; i++) {
    const P = pts[i], A = pts[(i - 1 + n) % n], B = pts[(i + 1) % n];
    // Corners next to a bulged edge stay sharp; the arc already shapes them.
    if (!(P.r > 0) || A.b || P.b) { corner.push([{ x: P.x, y: P.y }]); continue; }
    const la = Math.hypot(A.x - P.x, A.y - P.y), lb = Math.hypot(B.x - P.x, B.y - P.y);
    const v1 = { x: (A.x - P.x) / la, y: (A.y - P.y) / la }, v2 = { x: (B.x - P.x) / lb, y: (B.y - P.y) / lb };
    const phi = Math.acos(Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y)));
    if (phi < 0.01 || phi > Math.PI - 0.01) { corner.push([{ x: P.x, y: P.y }]); continue; }
    let d = P.r / Math.tan(phi / 2); d = Math.min(d, la / 2, lb / 2); const r = d * Math.tan(phi / 2);
    const t1 = { x: P.x + v1.x * d, y: P.y + v1.y * d }, t2 = { x: P.x + v2.x * d, y: P.y + v2.y * d };
    const bis = { x: v1.x + v2.x, y: v1.y + v2.y }, bl = Math.hypot(bis.x, bis.y) || 1, h = r / Math.sin(phi / 2);
    const C = { x: P.x + bis.x / bl * h, y: P.y + bis.y / bl * h };
    let a0 = Math.atan2(t1.y - C.y, t1.x - C.x), a1 = Math.atan2(t2.y - C.y, t2.x - C.x), dd = a1 - a0;
    while (dd > Math.PI) dd -= 2 * Math.PI; while (dd < -Math.PI) dd += 2 * Math.PI;
    const steps = Math.max(4, Math.ceil(Math.abs(dd) / 0.15)), arc = [];
    for (let k = 0; k <= steps; k++) { const t = a0 + dd * k / steps; arc.push({ x: C.x + r * Math.cos(t), y: C.y + r * Math.sin(t) }); }
    corner.push(arc);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(...corner[i]);
    if (pts[i].b) out.push(...bulgeArc(pts[i], pts[(i + 1) % n], pts[i].b, ccw));
  }
  return out;
}
function shapeBox(pts) {
  const o = shapeOutline(pts), xs = o.map(p => p.x), ys = o.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
const shapePerim = o => o.reduce((a, p, i) => { const q = o[(i + 1) % o.length]; return a + Math.hypot(q.x - p.x, q.y - p.y); }, 0);
const edgeLen = (pts, i) => { const a = pts[i], b = pts[(i + 1) % pts.length]; return Math.hypot(b.x - a.x, b.y - a.y); };
// New straight length for edge i: its far point moves along the edge, the near one stays.
function setEdgeLen(pts, i, L) {
  const a = pts[i], b = pts[(i + 1) % pts.length], c = edgeLen(pts, i); if (!(L > 0)) return;
  const ux = c ? (b.x - a.x) / c : 1, uy = c ? (b.y - a.y) / c : 0;
  b.x = r3(a.x + ux * L); b.y = r3(a.y + uy * L);
}
// Stretch the whole shape to a new overall width or depth.
function scaleShape(d, key, v) {
  const bx = shapeBox(d.pts), cur = key === 'bw' ? bx.w : bx.h; if (!(v > 0) || !(cur > 0)) return;
  const k = v / cur;
  d.pts.forEach(p => { if (key === 'bw') p.x = r3(bx.x0 + (p.x - bx.x0) * k); else p.y = r3(bx.y0 + (p.y - bx.y0) * k); if (p.b && key === 'bh') p.b = r3(p.b * k); });
}
// Outline moved so its box starts at 0,0.
function shapeLocal(s) { const b = shapeBox(s.pts); return { box: b, out: shapeOutline(s.pts).map(p => ({ x: p.x - b.x0, y: p.y - b.y0 })) }; }

/* ---------- Presets ---------- */
const rect4 = (w, d) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }];
const SHAPE_PRESETS = [
  { id: 'rect', name: 'Rectangle', plane: 'flat', pts: () => rect4(48, 25) },
  { id: 'round-front', name: 'Rounded front corners', plane: 'flat', pts: () => { const p = rect4(60, 26); p[2].r = 3; p[3].r = 3; return p; } },
  { id: 'bow', name: 'Bow front', plane: 'flat', pts: () => { const p = rect4(60, 25); p[2].b = 3; return p; } },
  { id: 'half-round', name: 'Half round end', plane: 'flat', pts: () => { const p = rect4(48, 30); p[1].b = 15; return p; } },
  { id: 'L', name: 'L-shape', plane: 'flat', pts: () => [{ x: 0, y: 0 }, { x: 96, y: 0 }, { x: 96, y: 25 }, { x: 25.5, y: 25 }, { x: 25.5, y: 60 }, { x: 0, y: 60 }] },
  { id: 'clip', name: 'Clipped corner', plane: 'flat', pts: () => [{ x: 0, y: 0 }, { x: 48, y: 0 }, { x: 48, y: 15 }, { x: 38, y: 25 }, { x: 0, y: 25 }] },
  { id: 'panel', name: 'Arched panel', plane: 'upright', pts: () => { const p = rect4(24, 34.5); p[2].b = 4; return p; } },
  { id: 'mold', name: 'Molding profile', plane: 'upright', moldOnly: true, pts: () => [{ x: 0, y: 0 }, { x: 0.75, y: 0 }, { x: 0.75, y: 0.75, b: -0.5 }, { x: 2.25, y: 3 }, { x: 2.25, y: 3.5 }, { x: 0, y: 3.5 }] },
  { id: 'corbel', name: 'Corbel', plane: 'upright', pts: () => [{ x: 0, y: 0 }, { x: 3, y: 0, b: -2.5 }, { x: 10, y: 9 }, { x: 10, y: 12 }, { x: 0, y: 12 }] },
];
function blankShapeDesign(presetId = 'round-front') {
  const ps = SHAPE_PRESETS.find(p => p.id === presetId) || SHAPE_PRESETS[0];
  const top = S.materials.find(m => /butcher|wood|oak|walnut/i.test(m.name) && m.kind === 'top') || S.materials.find(m => m.kind === 'top') || S.materials[0];
  const sheet = S.materials.find(m => (m.kind || 'sheet') === 'sheet') || S.materials[0];
  return { sourceLib: null, editShape: null, name: ps.name, plane: ps.plane, pts: ps.pts(), thick: ps.plane === 'flat' ? 1.5 : 0.75, mat: (ps.plane === 'flat' ? top : sheet).id };
}
const shapeLibItem = id => (S.shapeLib || []).find(x => x.id === id);
const shapeById = id => (S.shapes || []).find(x => x.id === id);
const shapeToLib = (d, id) => ({ id, name: d.name, plane: d.plane, pts: clone(d.pts), thick: d.thick, mat: d.mat });
function defaultShapeLib(S) {
  const top = (S.materials.find(m => /butcher/i.test(m.name)) || S.materials[0]).id, sheet = (S.materials.find(m => (m.kind || 'sheet') === 'sheet') || S.materials[0]).id;
  const p1 = rect4(60, 26); p1[2].r = 3; p1[3].r = 3;
  const p2 = rect4(36, 10); p2[2].b = 1.5;
  return [
    { id: 'sh-wtop', name: 'Wood top, rounded front', plane: 'flat', pts: p1, thick: 1.5, mat: top },
    { id: 'sh-shelf', name: 'Floating shelf, bow front', plane: 'flat', pts: p2, thick: 1.5, mat: top },
    { id: 'sh-arch', name: 'Arched end panel', plane: 'upright', pts: (() => { const p = rect4(24, 34.5); p[2].b = 4; return p; })(), thick: 0.75, mat: sheet },
  ];
}

/* ---------- In the room ---------- */
// Plan point for shape-local x (from its left end, as seen facing the wall) and b out from the wall face.
function shapeWallPt(s, x, b) {
  const w = wall(s.wall), g = wg(w), W = shapeBox(s.pts).w;
  return wallPt(w, g, s.side, s.side === 1 ? s.off + x : s.off + W - x, w.thick / 2 + (s.outset || 0) + b);
}
function shapePlanPoly(s) {
  if (!wall(s.wall)) return null;
  const { box, out } = shapeLocal(s);
  if (s.plane === 'flat') return out.map(p => shapeWallPt(s, p.x, p.y));
  return [shapeWallPt(s, 0, 0), shapeWallPt(s, box.w, 0), shapeWallPt(s, box.w, s.thick), shapeWallPt(s, 0, s.thick)];
}
function shapesPlanSVG() {
  const px = ui.px;
  return S.shapes.map(s => {
    const poly = shapePlanPoly(s); if (!poly) return '';
    const sel = ui.sel && ui.sel.type === 'shape' && ui.sel.id === s.id, m = mat(s.mat);
    const c = poly.reduce((a, p) => ({ x: a.x + p.x / poly.length, y: a.y + p.y / poly.length }), { x: 0, y: 0 }), fs = 11 * px;
    return `${sel ? `<polygon class="halo nss" points="${polyPts(poly)}"/>` : ''}<polygon class="shp nss${sel ? ' sel' : ''}" style="fill:${esc((m && m.color) || '#d6b07c')}" points="${polyPts(poly)}"/>`
      + (s.plane === 'flat' ? `<text class="lbl-m" x="${c.x}" y="${c.y}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" pointer-events="none">${esc(s.name)}</text>` : '');
  }).join('');
}
function hitShapes(p) { return S.shapes.filter(s => { const poly = shapePlanPoly(s); return poly && inPoly(p, poly); }).map(s => s.id); }
// Elevation: a flat shape shows its front edge as a band, an upright one shows its whole outline.
function shapesElevSVG(w, side, L, mats) {
  return S.shapes.filter(s => s.wall === w.id && s.side === side).map(s => {
    const { box, out } = shapeLocal(s), x0 = side === 1 ? s.off : L - s.off - box.w, m = mat(s.mat); mats.push(m && m.id);
    const sel = ui.sel && ui.sel.type === 'shape' && ui.sel.id === s.id;
    const shape = s.plane === 'flat' ? `<rect ${fillFor(m, 'ev-top')} x="${x0}" y="${-(s.elev + s.thick)}" width="${box.w}" height="${s.thick}"/>`
      : `<polygon ${fillFor(m, 'ev-top')} points="${out.map(p => `${r3(x0 + p.x)},${r3(-(s.elev + p.y))}`).join(' ')}"/>`;
    const hb = s.plane === 'flat' ? [x0, -(s.elev + s.thick), box.w, s.thick] : [x0, -(s.elev + box.h), box.w, box.h];
    return `<g data-shape="${s.id}">${shape}<rect class="ev-hit" x="${hb[0]}" y="${hb[1] - (s.plane === 'flat' ? 1 : 0)}" width="${hb[2]}" height="${hb[3] + (s.plane === 'flat' ? 2 : 0)}"/>${sel ? `<rect class="ev-sel nss" x="${hb[0]}" y="${hb[1]}" width="${hb[2]}" height="${hb[3]}"/>` : ''}</g>`;
  }).join('');
}
// 3D: the outline pushed out to its thickness.
function shapeMesh3(s, opts = {}) {
  const w = wall(s.wall); if (!w) return null;
  const { box, out } = shapeLocal(s), sh = new THREE.Shape(out.map(p => new THREE.Vector2(p.x, p.y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: s.thick, bevelEnabled: false, curveSegments: 1 });
  const mm = mat3(mat(s.mat), opts), k = (mm.userData && mm.userData.texScale) || 24, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / k, uv.getY(i) / k);
  const mesh = new THREE.Mesh(g, mm);
  if (!R3) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), edgeMat3()));
  const grp = wallGroup(w, s.side, s.side === 1 ? s.off : s.off + box.w, s.outset || 0);
  // Flat: shape y runs out from the wall, the thickness goes down from the top. Upright: shape y runs up, thickness out from the wall.
  if (s.plane === 'flat') { mesh.rotation.x = Math.PI / 2; mesh.position.y = s.elev + s.thick; }
  else mesh.position.y = s.elev;
  grp.add(mesh); grp.traverse(o => { o.userData.shapeId = s.id; });
  return grp;
}
function placeShape(libId, p) {
  const l = shapeLibItem(libId); if (!l) return false;
  let best = null; S.walls.forEach(w => { const r = segDist(p, w); if (r.d < 60 && (!best || r.d < best.r.d)) best = { w, r }; });
  if (!best) { flash('Move closer to a wall to place the shape.'); return false; }
  const W = shapeBox(l.pts).w, L = best.r.g.L, off = Math.max(0, Math.min(Math.max(0, L - W), best.r.t - W / 2));
  // Flat shapes land at counter height over base cabinets; upright ones stand on the floor.
  const elev = l.plane === 'flat' ? 34.5 + 0.75 : 0;
  let ns; mutate(() => { ns = { ...clone(l), id: uid('s'), libId: l.id, wall: best.w.id, side: best.r.side, off: r3(off), outset: 0, elev }; S.shapes.push(ns); });
  ui.sel = { type: 'shape', id: ns.id }; ui.elevWall = ns.wall; renderRoom();
  return true;
}
function shapeProps(s) {
  const id = s.id, R = 'shp:' + id, b = shapeBox(s.pts), o = shapeOutline(s.pts);
  return `<div class="psec"><div class="pshead"><div class="cabtitle"><span class="chip shape">Shape</span> <b>${esc(s.name)}</b></div></div>
    <div class="row-actions"><button class="btn primary" data-act="shape-edit" data-id="${id}">${icon('ruler')}Edit shape</button><button class="btn" data-act="shape-dup" data-id="${id}">${icon('copy')}Duplicate</button><button class="btn" data-act="shape-flip" data-id="${id}">${icon('flip')}Flip</button><button class="btn danger" data-act="shape-del" data-id="${id}">${icon('trash')}Delete</button></div>
    <div class="sizeline">${fmtLen(b.w, 1)} × ${fmtLen(b.h, 1)} × ${fmtLen(s.thick, 1)}</div>
    <div class="note">${s.plane === 'flat' ? 'Lies flat' : 'Stands up'} · ${wallName(wall(s.wall))} · ${o.length} outline points</div></div>
  <div class="psec box">${secHead('magnet', 'Position', 'blue')}
    <div class="grid2">${fld('Along the wall', R, 'off', s.off, 'len')}${fld('Out from wall', R, 'outset', s.outset || 0, 'len')}${fld(s.plane === 'flat' ? 'Bottom height' : 'Height off floor', R, 'elev', s.elev, 'len')}${fld('Thickness', R, 'thick', s.thick, 'len')}</div>
    <div class="note">Along the wall is measured from the wall's start to the shape's end nearest it.</div></div>
  <div class="psec box">${secHead('palette', 'Finish', 'amber')}${fld('Name', R, 'name', s.name, 'text', { wide: true })}${fld('Material', R, 'mat', s.mat, 'select', { options: azOpts(S.materials) })}
    <div class="row-actions"><button class="btn sm" data-act="shape-to-lib" data-id="${id}">Save to shape library</button></div></div>${typeof vFitBox === 'function' ? vFitBox(s) : ''}`;
}
// Cut list rows for the shapes in the open room.
function shapeParts() {
  return S.shapes.map(s => { const b = shapeBox(s.pts); return { cabId: s.id, cab: 'Shape', name: s.name, kind: 'shape', qty: 1, L: r3(b.w), W: r3(b.h), T: s.thick, mat: s.mat, grain: false, edges: '', band: {}, ops: [], outline: shapeOutline(s.pts).map(p => ({ x: r3(p.x - b.x0), y: r3(p.y - b.y0) })) }; });
}

/* ---------- Shape editor (Designer › Custom shape) ---------- */
function shapeView(d) {
  // The outline and the points: a rounded or bulged corner can sit inside its point, and the point must stay in view.
  const o = shapeBox(d.pts), xs = d.pts.map(p => p.x).concat(o.x0, o.x1), ys = d.pts.map(p => p.y).concat(o.y0, o.y1);
  const b = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; b.w = b.x1 - b.x0; b.h = b.y1 - b.y0;
  const m = d.forMold ? Math.max(0.75, Math.max(b.w, b.h) * 0.3) : Math.max(8, Math.max(b.w, b.h) * 0.16), flip = d.plane !== 'flat';
  return { b, m, flip, Y: v => flip ? -v : v, vb: [b.x0 - m, (flip ? -b.y1 : b.y0) - m, b.w + 2 * m, b.h + 2 * m] };
}
function shapeEditorSVG(d) {
  const v = shapeView(d), Y = v.Y, pts = d.pts, n = pts.length, o = shapeOutline(pts), k = Math.max(v.vb[2], v.vb[3]) / 100;
  const sel = ui.shapeSel || {}, ccw = shapeArea2(pts) > 0;
  let s = `<defs><pattern id="sgmin" width="1" height="1" patternUnits="userSpaceOnUse"><path class="g-minor nss" d="M1 0H0V1"/></pattern><pattern id="sgmaj" width="12" height="12" patternUnits="userSpaceOnUse"><path class="g-major nss" d="M12 0H0V12"/></pattern></defs>`;
  s += `<rect x="${v.vb[0]}" y="${v.vb[1]}" width="${v.vb[2]}" height="${v.vb[3]}" fill="url(#sgmaj)"/>`;
  if (k < 0.9) s += `<rect x="${v.vb[0]}" y="${v.vb[1]}" width="${v.vb[2]}" height="${v.vb[3]}" fill="url(#sgmin)"/>`;
  // The wall side, for flat shapes (y = 0 is the wall face), and the floor for upright ones.
  s += `<line class="se-ref nss" x1="${v.vb[0]}" x2="${v.vb[0] + v.vb[2]}" y1="0" y2="0"/><text class="se-reftxt" x="${v.vb[0] + k}" y="${(v.flip ? 2.6 : -1.2) * k}" font-size="${2.2 * k}">${d.forMold ? 'Bottom' : v.flip ? 'Floor' : 'Wall'}</text>`;
  // A molding profile stands against the cabinet at x = 0.
  if (d.forMold) s += `<line class="se-ref nss" y1="${v.vb[1]}" y2="${v.vb[1] + v.vb[3]}" x1="0" x2="0"/><text class="se-reftxt" x="${-1.2 * k}" y="${v.vb[1] + 3 * k}" font-size="${2.2 * k}" text-anchor="end">Cabinet</text>`;
  // The cabinet's plain box, dashed, behind a cabinet shape.
  const fcab = d.forCab && cab(d.forCab.id);
  if (fcab) { const [cw, ch] = cabShapeDims(fcab, d.forCab.view); s += `<rect class="se-cabbox nss" x="0" y="${v.flip ? -ch : 0}" width="${cw}" height="${ch}"/>`; }
  // Side titles, so it is clear which side an edge is on.
  const cx = v.b.x0 + v.b.w / 2, side = (t, y) => `<text class="se-side" x="${r3(cx)}" y="${r3(y)}" font-size="${2.6 * k}" text-anchor="middle" dominant-baseline="middle">${t}</text>`;
  s += d.forMold ? side('TOP', Y(v.b.y1) - v.m * 0.45) : d.forCab ? '' : v.flip ? side('TOP', Y(v.b.y1) - v.m * 0.45) + side('FRONT FACE · as seen from the room', Y(v.b.y0) + v.m * 0.55)
    : side('BACK · wall side', v.b.y0 - v.m * 0.5) + side('FRONT', v.b.y1 + v.m * 0.5);
  const m = mat(d.mat);
  const outPts = o.map(p => `${r3(p.x)},${r3(Y(p.y))}`).join(' ');
  s += `<polygon class="se-shape nss" style="fill:${esc((m && m.color) || '#d6b07c')}" points="${outPts}"/><polygon class="se-line nss" points="${outPts}"/>`;
  // Lines across the drawing where a dragged point lines up with another point (Shift).
  (ui.seGuides || []).forEach(gd => { s += gd.x !== undefined ? `<line class="se-guide nss" x1="${r3(gd.x)}" x2="${r3(gd.x)}" y1="${v.vb[1]}" y2="${v.vb[1] + v.vb[3]}"/>` : `<line class="se-guide nss" x1="${v.vb[0]}" x2="${v.vb[0] + v.vb[2]}" y1="${r3(Y(gd.y))}" y2="${r3(Y(gd.y))}"/>`; });
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], on = sel.kind === 'edge' && sel.i === i, nrm = edgeOut(a, b, ccw), L = edgeLen(pts, i);
    const mx = (a.x + b.x) / 2 + nrm.x * (a.b || 0), my = (a.y + b.y) / 2 + nrm.y * (a.b || 0);
    const path = a.b ? [a, ...bulgeArc(a, b, a.b, ccw), b] : [a, b];
    s += `<polyline class="se-edge nss${on ? ' on' : ''}" data-edge="${i}" points="${path.map(p => `${r3(p.x)},${r3(Y(p.y))}`).join(' ')}"/>`;
    const tx = mx + nrm.x * 3.6 * k, ty = my + nrm.y * 3.6 * k;
    s += `<text class="se-dim${on ? ' on' : ''}" x="${r3(tx)}" y="${r3(Y(ty))}" font-size="${2.3 * k}" style="stroke-width:${r3(0.35 * k)}px" text-anchor="middle" dominant-baseline="middle" data-edge="${i}">${fmtLen(L)}</text>`;
    s += `<circle class="se-mid" data-mid="${i}" cx="${r3(mx)}" cy="${r3(Y(my))}" r="${1.25 * k * fingerK()}" style="stroke-width:${r3(0.25 * k)}px"><title>Add a point here</title></circle><path class="se-plus nss" d="M${r3(mx - 0.7 * k)} ${r3(Y(my))}h${r3(1.4 * k)}M${r3(mx)} ${r3(Y(my) - 0.7 * k)}v${r3(1.4 * k)}" pointer-events="none"/>`;
  }
  pts.forEach((p, i) => { s += `<circle class="se-pt${sel.kind === 'pt' && sel.i === i ? ' on' : ''}${p.r > 0 ? ' round' : ''}" data-pt="${i}" cx="${r3(p.x)}" cy="${r3(Y(p.y))}" r="${1.5 * k * fingerK()}"><title>Point ${i + 1}</title></circle>`; });
  return `<svg id="shapesvg" viewBox="${v.vb.map(r3).join(' ')}" preserveAspectRatio="xMidYMid meet">${s}</svg>`;
}
function renderShapeDesigner() {
  if (!S.shapeDesign) S.shapeDesign = blankShapeDesign();
  const d = S.shapeDesign, b = shapeBox(d.pts), o = shapeOutline(d.pts), n = d.pts.length, sel = ui.shapeSel || {};
  if (sel.i >= n) ui.shapeSel = null;
  const src = d.sourceLib && shapeLibItem(d.sourceLib), inRoom = d.editShape && S.rooms.some(r => (r.shapes || []).some(x => x.id === d.editShape));
  const P = i => 'shdpt:' + i;
  const selBox = sel.kind === 'pt' && d.pts[sel.i] ? `<div class="psec box">${secHead('ruler', `Point ${sel.i + 1}`, 'teal')}<div class="grid3">${fld('Across (x)', P(sel.i), 'x', d.pts[sel.i].x, 'len')}${fld(d.plane === 'flat' ? 'Out (y)' : 'Up (y)', P(sel.i), 'y', d.pts[sel.i].y, 'len')}${fld('Round corner', P(sel.i), 'r', d.pts[sel.i].r || 0, 'len')}</div>
      <div class="row-actions"><button class="btn sm" data-act="se-round" data-id="${sel.i}:0">Sharp</button><button class="btn sm" data-act="se-round" data-id="${sel.i}:1">1"</button><button class="btn sm" data-act="se-round" data-id="${sel.i}:3">3"</button><button class="btn sm" data-act="se-round" data-id="${sel.i}:6">6"</button><button class="btn sm danger" data-act="se-del" data-id="${sel.i}"${n <= 3 ? ' disabled' : ''}>${icon('trash')}Remove point</button></div></div>`
    : sel.kind === 'edge' && d.pts[sel.i] ? `<div class="psec box">${secHead('ruler', `Edge ${sel.i + 1} to ${(sel.i + 1) % n + 1}`, 'violet')}<div class="grid2">${fld('Length', P(sel.i), 'len', r3(edgeLen(d.pts, sel.i)), 'len')}${fld('Bulge', P(sel.i), 'b', d.pts[sel.i].b || 0, 'len')}</div>
      <div class="note">Bulge is how far the middle of the edge sits out from a straight line. Negative curves it in.</div>
      <div class="row-actions"><button class="btn sm" data-act="se-bulge" data-id="${sel.i}:0">Straight</button><button class="btn sm" data-act="se-bulge" data-id="${sel.i}:out">Gentle bow</button><button class="btn sm" data-act="se-bulge" data-id="${sel.i}:in">Curve in</button><button class="btn sm" data-act="se-bulge" data-id="${sel.i}:half">Half round</button><button class="btn sm" data-act="se-split" data-id="${sel.i}">${icon('plus')}Add point in the middle</button></div></div>`
    : `<div class="note">Click a point or an edge to change it. Drag points to move them (they snap to 1/4"; hold Shift to line up with another point's x or y). Click a + on an edge to add a point there.</div>`;
  const rows = d.pts.map((p, i) => `<tr class="${sel.i === i ? 'on' : ''}"><td><button class="linkbtn" data-act="se-sel" data-id="pt:${i}">${i + 1}</button></td><td>${calcWrap(ctl(P(i), 'x', p.x, 'len', { label: `Point ${i + 1} x` }), P(i), 'x')}</td><td>${calcWrap(ctl(P(i), 'y', p.y, 'len', { label: `Point ${i + 1} y` }), P(i), 'y')}</td><td>${ctl(P(i), 'r', p.r || 0, 'len', { label: `Point ${i + 1} corner radius` })}</td>
    <td><button class="linkbtn" data-act="se-sel" data-id="edge:${i}">${i + 1}→${(i + 1) % n + 1}</button></td><td>${calcWrap(ctl(P(i), 'len', r3(edgeLen(d.pts, i)), 'len', { label: `Edge ${i + 1} length` }), P(i), 'len')}</td><td>${ctl(P(i), 'b', p.b || 0, 'len', { label: `Edge ${i + 1} bulge` })}</td><td><button class="btn sm" data-act="se-del" data-id="${i}" aria-label="Remove point ${i + 1}"${n <= 3 ? ' disabled' : ''}>×</button></td></tr>`).join('');
  const fm = d.forMold && molding(d.forMold), fc = d.forCab && cab(d.forCab.id);
  if (fc) {
    const vl = (CAB_VIEWS.find(x => x[0] === d.forCab.view) || [])[2] || '', [cw, ch] = cabShapeDims(fc, d.forCab.view);
    $('#tab-designer').innerHTML = `<div class="pagehead"><div><button class="linkbtn back" data-act="se-cab-cancel">${icon('back')}Back to the room</button><h2>${esc(LBL[fc.id] || '')} ${esc(fc.name)}: ${d.forCab.view} shape</h2><p>${vl}. The dashed box is the cabinet, ${fmtLen(cw)} × ${fmtLen(ch)}. Cut it in where the cabinet should be cut away, like a U for a farm sink.</p></div>
    <div class="row-actions"><button class="btn" data-act="se-cab-cancel">Cancel</button><button class="btn primary" data-act="se-cab-save">${icon('check')}Save shape</button></div></div>
  <div class="designer shapedes">
    <div class="card stack cardbody des-form">${selBox}
      <div class="eyebrow">Points and edges</div>
      <div class="tscroll"><table class="t setable"><thead><tr><th>Pt</th><th>x</th><th>y</th><th>Round</th><th>Edge</th><th>Length</th><th>Bulge</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row-actions"><button class="btn sm" data-act="se-split" data-id="${n - 1}">${icon('plus')}Add a point</button><button class="btn sm" data-act="se-cab-reset">Back to the plain box</button></div>
    </div>
    <div class="stack"><div class="card cardbody stack"><div class="se-stage">${shapeEditorSVG(d)}</div><div class="note">${fmtLen(b.w, 1)} × ${fmtLen(b.h, 1)}</div></div></div>
  </div>`;
    initShapeEditor(); return;
  }
  $('#tab-designer').innerHTML = fm ? `<div class="pagehead"><div><button class="linkbtn back" data-act="se-mold-cancel">${icon('back')}Moldings</button><h2>Molding profile: ${esc(fm.name)}</h2><p>Draw the side profile of the molding. x is how far it sticks out from the cabinet, y is up from the bottom. Round corners and bulge edges for coves and ogees.</p></div>
    <div class="row-actions"><button class="btn" data-act="se-mold-cancel">Cancel</button><button class="btn primary" data-act="se-mold">${icon('check')}Save profile</button></div></div>
  <div class="designer shapedes">
    <div class="card stack cardbody des-form">
      <div class="grid2">${fld('Projection', 'shd', 'bw', r3(b.w), 'len')}${fld('Height', 'shd', 'bh', r3(b.h), 'len')}</div>
      ${selBox}
      <div class="eyebrow">Points and edges</div>
      <div class="tscroll"><table class="t setable"><thead><tr><th>Pt</th><th>x</th><th>y</th><th>Round</th><th>Edge</th><th>Length</th><th>Bulge</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row-actions"><button class="btn sm" data-act="se-split" data-id="${n - 1}">${icon('plus')}Add a point</button><button class="btn sm" data-act="se-mold-reset">Start over from a crown</button></div>
    </div>
    <div class="stack"><div class="card cardbody stack"><div class="se-stage">${shapeEditorSVG(d)}</div>
      <div class="note">${fmtLen(b.w, 1)} out × ${fmtLen(b.h, 1)} tall</div></div></div>
  </div>` : `<div class="pagehead"><div><button class="linkbtn back" data-act="tab" data-id="library">${icon('back')}Products</button><h2>Shape editor</h2><p>Draw custom wood tops, shelves, panels and other parts point by point. Type exact edge lengths, round any corner, and bulge any edge into an arc.</p></div>
    <div class="row-actions">${desModeSeg()}<select id="shape-load" aria-label="Start from" style="width:auto"><option value="">Start from…</option><optgroup label="Starting shapes">${SHAPE_PRESETS.filter(p => !p.moldOnly).map(p => `<option value="pre:${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>${(S.shapeLib || []).length ? `<optgroup label="Shape library">${S.shapeLib.map(l => `<option value="lib:${l.id}">${esc(l.name)}</option>`).join('')}</optgroup>` : ''}</select>
    ${inRoom ? `<button class="btn primary" data-act="se-apply">${icon('check')}Apply to the shape in the room</button>` : ''}${src ? `<button class="btn" data-act="se-update">Update “${esc(src.name)}”</button>` : ''}<button class="btn${inRoom ? '' : ' primary'}" data-act="se-save">Save to shape library</button></div></div>
  <div class="designer shapedes">
    <div class="card stack cardbody des-form">
      ${inRoom ? '<div class="note">Editing a shape that is in a room. Apply sends the changes back to it.</div>' : src ? `<div class="note">Editing a copy of <b>${esc(src.name)}</b>.</div>` : '<div class="note">New shape, not saved yet.</div>'}
      ${fld('Name', 'shd', 'name', d.name, 'text', { wide: true })}
      <div class="grid2">${fld('Lies', 'shd', 'plane', d.plane, 'select', { options: [{ v: 'flat', l: 'Flat, like a top or shelf' }, { v: 'upright', l: 'Upright, like a panel' }] })}${fld('Thickness', 'shd', 'thick', d.thick, 'len')}
      ${fld('Overall width', 'shd', 'bw', r3(b.w), 'len')}${fld(d.plane === 'flat' ? 'Overall depth' : 'Overall height', 'shd', 'bh', r3(b.h), 'len')}</div>
      ${fld('Material', 'shd', 'mat', d.mat, 'select', { options: azOpts(S.materials), wide: true })}
      ${selBox}
      <div class="eyebrow">Points and edges</div>
      <div class="tscroll"><table class="t setable"><thead><tr><th>Pt</th><th>x</th><th>y</th><th>Round</th><th>Edge</th><th>Length</th><th>Bulge</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row-actions"><button class="btn sm" data-act="se-split" data-id="${n - 1}">${icon('plus')}Add a point</button><span class="note">Every x, y and length takes math or a formula, like =W/2. The calculator button opens the calculator.</span></div>
    </div>
    <div class="stack">
      <div class="card cardbody stack"><div class="se-stage">${shapeEditorSVG(d)}</div>
        <div class="note">${fmtLen(b.w, 1)} × ${fmtLen(b.h, 1)} × ${fmtLen(d.thick, 1)} · ${r3(Math.abs(shapeArea2(o)) / 2 / 144)} sq ft · edge ${fmtLen(shapePerim(o), 1)} around</div></div>
      <div class="card cardbody"><div class="row-actions"><button class="btn primary" data-act="se-place">${icon('plus')}Save and place in room</button><span class="note">Click near a wall in the plan to put it there.</span></div></div>
    </div>
  </div>`;
  if ($('#shape-load')) $('#shape-load').addEventListener('change', e => {
    const [k, id] = e.target.value.split(':'); if (!k) return;
    ui.shapeSel = null;
    mutate(() => { if (k === 'pre') S.shapeDesign = blankShapeDesign(id); else { const l = shapeLibItem(id); S.shapeDesign = { ...clone(l), sourceLib: l.id, editShape: null }; delete S.shapeDesign.id; } });
  });
  initShapeEditor();
}
const desModeSeg = () => `<div class="seg" role="group" aria-label="What to design">${[['cab', 'Cabinet', 'box'], ['shape', 'Custom shape', 'ruler']].map(([k, l, ic]) => `<button data-act="des-mode" data-id="${k}" aria-pressed="${(ui.desMode || 'cab') === k}">${icon(ic)}${l}</button>`).join('')}</div>`;
function shapeSvgPoint(e) {
  const svg = $('#shapesvg'), m = svg && svg.getScreenCTM(); if (!m) return null;
  const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()), v = shapeView(S.shapeDesign);
  return { x: q.x, y: v.flip ? -q.y : q.y };
}
let seDrag = null;
function initShapeEditor() {
  const stage = $('.se-stage'); if (!stage) return;
  stage.addEventListener('pointerdown', e => {
    const d = S.shapeDesign, t = e.target;
    if (t.dataset.pt !== undefined) { const i = +t.dataset.pt; ui.shapeSel = { kind: 'pt', i }; seDrag = { i, snap: JSON.stringify(S), live: false, view: shapeView(d) }; }
    else if (t.dataset.mid !== undefined) { const i = +t.dataset.mid; mutate(() => splitEdge(d, i)); ui.shapeSel = { kind: 'pt', i: i + 1 }; renderShapeDesigner(); return; }
    else if (t.dataset.edge !== undefined) { ui.shapeSel = { kind: 'edge', i: +t.dataset.edge }; renderShapeDesigner(); return; }
    else { ui.shapeSel = null; renderShapeDesigner(); return; }
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    redrawShapeSvg();
  });
  stage.addEventListener('pointermove', e => {
    if (!seDrag) return;
    const p = shapeSvgPoint(e); if (!p) return;
    const pts = S.shapeDesign.pts, pt = pts[seDrag.i], g = 0.25, tol = Math.max(seDrag.view.vb[2], seDrag.view.vb[3]) / 60;
    pt.x = Math.round(p.x / g) * g; pt.y = Math.round(p.y / g) * g; ui.seGuides = [];
    // Shift lines the point up with the x or y of any other point close by.
    if (e.shiftKey) {
      const near = k => pts.filter((q, j) => j !== seDrag.i && Math.abs(q[k] - p[k]) < tol).sort((a, b) => Math.abs(a[k] - p[k]) - Math.abs(b[k] - p[k]))[0];
      const nx = near('x'), ny = near('y');
      if (nx) { pt.x = nx.x; ui.seGuides.push({ x: nx.x }); }
      if (ny) { pt.y = ny.y; ui.seGuides.push({ y: ny.y }); }
    }
    seDrag.live = true;
    // Keep the view still while dragging so the point stays under the pointer.
    redrawShapeSvg(seDrag.view);
  });
  const end = () => { const dr = seDrag; seDrag = null; ui.seGuides = []; if (dr && dr.live) { undoStack.push(dr.snap); redoStack = []; save(); } if (dr) render(); };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
}
function redrawShapeSvg(view) {
  const st = $('.se-stage'); if (!st) return;
  st.innerHTML = shapeEditorSVG(S.shapeDesign);
  if (view) $('#shapesvg').setAttribute('viewBox', view.vb.map(r3).join(' '));
}
function splitEdge(d, i) {
  const a = d.pts[i], b = d.pts[(i + 1) % d.pts.length], ccw = shapeArea2(d.pts) > 0, n = edgeOut(a, b, ccw);
  const mid = { x: r3((a.x + b.x) / 2 + n.x * (a.b || 0)), y: r3((a.y + b.y) / 2 + n.y * (a.b || 0)) };
  // A bulged edge splits into two arcs with about a quarter of the bulge each.
  if (a.b) { const s = a.b / 4; a.b = r3(s); mid.b = r3(s); }
  d.pts.splice(i + 1, 0, mid);
}
document.addEventListener('keydown', e => {
  if (ui.tab !== 'designer' || ui.desMode !== 'shape' || !ui.shapeSel) return;
  const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && ui.shapeSel.kind === 'pt' && S.shapeDesign.pts.length > 3) { e.preventDefault(); const i = ui.shapeSel.i; ui.shapeSel = null; mutate(() => S.shapeDesign.pts.splice(i, 1)); }
  if (e.key === 'Escape') { ui.shapeSel = null; renderShapeDesigner(); }
});

/* ---------- Molding profiles ---------- */
// A molding with a custom profile keeps its own outline (m.pts), drawn in the shape editor: x is how far it sticks out from the cabinet, y is up.
const moldStartPts = () => SHAPE_PRESETS.find(p => p.id === 'mold').pts();
// The profile outline scaled to the molding's height and projection, or null for the built-in profiles.
function moldProfile(m) {
  if (m.profile !== 'shape' || !(m.pts || []).length) return null;
  const { box, out } = shapeLocal(m), sx = box.w > 0 ? m.d / box.w : 1, sy = box.h > 0 ? m.h / box.h : 1;
  return out.map(p => ({ x: p.x * sx, y: p.y * sy }));
}
// Height and projection from the drawn profile.
function moldFitShape(m) { if (!(m.pts || []).length) return; const b = shapeBox(m.pts); m.h = r3(b.h); m.d = r3(b.w); }
// Open the shape editor on a molding's profile.
function editMoldProfile(m) {
  ui.desMode = 'shape'; ui.shapeSel = null;
  S.shapeDesign = { sourceLib: null, editShape: null, forMold: m.id, name: m.name, plane: 'upright', pts: clone((m.pts || []).length ? m.pts : moldStartPts()), thick: 0.75, mat: m.mat };
}
