/* ---------- Corner cabinets: blind, 45° (diagonal) and 90° (L-shaped) ----------
   c.corner = { type: 'blind' | 'diag' | 'l', side: 'L' | 'R', blind, leg }.
   side is the end of the cabinet that goes into the corner (the return wall's end).
   Blind: a plain box whose fronts only cover the open part; a blind panel closes the rest.
   45° and 90°: c.w runs along the cabinet's wall, c.d runs out along the return wall, and both legs are leg deep.
   The box comes from a top shape made on the fly (sides, bottom, top and back are cut to it like any shaped cabinet),
   and the fronts sit on the angled face (45°) or on the two faces of the L (90°). */
'use strict';
const CORNER_KINDS = { blind: 'Blind corner', diag: '45° corner', l: '90° corner' };
const isCorner = c => !!(c && c.corner && CORNER_KINDS[c.corner.type]);
const angledCorner = c => isCorner(c) && c.corner.type !== 'blind';
const blindCorner = c => isCorner(c) && c.corner.type === 'blind';
const cornerSide = c => (c.corner && c.corner.side === 'R') ? 'R' : 'L';
const cornerLeg = c => { const v = +c.corner.leg > 0 ? +c.corner.leg : (c.cat === 'Wall' ? 12 : 24); return Math.max(3, Math.min(v, c.w - 3, c.d - 3)); };
const blindWidth = c => { const v = +c.corner.blind > 0 ? +c.corner.blind : (c.cat === 'Wall' ? 15 : 26); return Math.max(3, Math.min(v, c.w - 6)); };

// The products, from the shop's 2026 Larkul Mozaik library (Blind Corner Left/Right, 45 and 90 Susan Cabinet,
// Wall Blind Left/Right, Wall 45 and Wall 90 Corner). One product per kind; the Left/Right switch replaces the pairs.
function cornerLibItems() {
  const R = (type, h, count = 1) => ({ type, h, count }), con = (cat, full) => ({ toeKick: cat !== 'Wall', top: full || cat === 'Wall' ? 'full' : 'stretchers' });
  const susan = [{ type: 'lazy', name: 'Lazy susan, 2 shelf' }];
  const mk = (id, name, cat, w, h, d, elev, rows, corner, params, extra = {}) => ({ id, name, cat, w, h, d, elev, rows, params, construction: con(cat, corner.type !== 'blind'), folder: 'Corner', corner, ...extra });
  return [
    mk('b-blind', 'Base Blind Corner', 'Base', 42, 34.5, 24, 0, [R('drawer', 6), R('door', '*')], { type: 'blind', side: 'L', blind: 26 }, { shelfCount: 1 }),
    mk('b-corner45', 'Base 45° Corner', 'Base', 36, 34.5, 36, 0, [R('door', '*')], { type: 'diag', side: 'L', leg: 24 }, { shelfCount: 0 }, { inserts: clone(susan) }),
    mk('b-corner90', 'Base 90° Corner', 'Base', 36, 34.5, 36, 0, [R('door', '*')], { type: 'l', side: 'L', leg: 24 }, { shelfCount: 0 }, { inserts: clone(susan) }),
    mk('w-blind', 'Wall Blind Corner', 'Wall', 36, 36, 12, 54, [R('door', '*')], { type: 'blind', side: 'L', blind: 15 }, { shelfCount: 2 }),
    mk('w-corner45', 'Wall 45° Corner', 'Wall', 24, 36, 24, 54, [R('door', '*')], { type: 'diag', side: 'L', leg: 12 }, { shelfCount: 2 }),
    mk('w-corner90', 'Wall 90° Corner', 'Wall', 24, 36, 24, 54, [R('door', '*')], { type: 'l', side: 'L', leg: 12 }, { shelfCount: 2 }),
  ];
}
// Jobs made before corners get them in their Products tree once.
function ensureCornerLib(s) {
  if (!s || !Array.isArray(s.library) || s.cornerLib) return s;
  cornerLibItems().forEach(l => { if (!s.library.some(x => x.id === l.id)) s.library.push(l); });
  s.cornerLib = 1;
  return s;
}

// The top shape of a 45° or 90° corner (x across, y out from the cabinet's wall), with the end of the return leg closed
// by a panel. Edge 0 is the back, the edges after it go round the outside.
function cornerTop(c) {
  const W = c.w, D = c.d, a = cornerLeg(c), L = c.corner.type === 'l';
  let pts = L ? [[0, 0], [W, 0], [W, a], [a, a], [a, D], [0, D]] : [[0, 0], [W, 0], [W, a], [a, D], [0, D]];
  if (cornerSide(c) === 'R') pts = pts.map(([x, y]) => [W - x, y]);
  return { pts: pts.map(([x, y]) => ({ x: r3(x), y: r3(y) })), w: W, h: D, edges: L ? ['', '', '', '', 'unfin', ''] : ['', '', '', 'unfin', ''], corner: true };
}
// The top shape the box is built from: a corner's own, or the one drawn in the Shape tab.
const cabTopShape = c => angledCorner(c) ? cornerTop(c) : ((c && c.shape) || {}).top;
// Edges of the corner's top shape that hold fronts (the angled face, or the two faces of the L).
const cornerFaceEdges = c => c.corner.type === 'l' ? [2, 3] : [2];

// The faces the fronts sit on, left to right as you stand in front of them, in cabinet coordinates (x across, z out from
// the wall): each starts at (ox, oz) and runs along (ux, uz) for len; its outside is (-uz, ux).
function cornerFaces(c) {
  const W = c.w, D = c.d, a = cornerLeg(c);
  let f = c.corner.type === 'l' ? [[[a, D], [a, a]], [[a, a], [W, a]]] : [[[a, D], [W, a]]];
  if (cornerSide(c) === 'R') f = f.map(([p, q]) => [[W - q[0], q[1]], [W - p[0], p[1]]]).reverse();
  return f.map(([p, q]) => { const len = Math.hypot(q[0] - p[0], q[1] - p[1]); return { ox: p[0], oz: p[1], ux: (q[0] - p[0]) / len, uz: (q[1] - p[1]) / len, len }; });
}
// A point on a face: x along it, out in front of it.
const facePt = (fc, x, out = 0) => ({ x: fc.ox + fc.ux * x - fc.uz * out, z: fc.oz + fc.uz * x + fc.ux * out });
// How deep an end of the cabinet is: the open end of a 45° or 90° corner is only its leg deep.
const endDepth = (c, sd) => angledCorner(c) && sd !== cornerSide(c) ? cornerLeg(c) : c.d;
const frontThick = c => (mat(fillerMat(c)) || { thick: 0.75 }).thick;

// Fronts of a 45° or 90° corner: each row of the face goes on every face, one front per face. On a 90° corner the
// front on the face before the inside corner reaches it, and the next one starts past that front's thickness.
// A 45° door hinges like any single door; the two on a 90° corner hinge on their outside ends.
function cornerFronts(c, p, rows, zs) {
  const faces = cornerFaces(c), gap = p.frontGap, rv = p.frontSideReveal, ft = frontThick(c), out = [];
  rows.forEach((r, ri) => {
    const [z0, z1] = zs[ri];
    faces.forEach((fc, i) => {
      const x0 = faces.length > 1 && i === 1 ? ft + gap : rv, x1 = r3(fc.len - rv);
      let hinge = null;
      if (r.type === 'door') hinge = faces.length > 1 ? (i === 0 ? 'L' : 'R') : (r.hinge === 'L' || r.hinge === 'R' ? r.hinge : p.hingeSide);
      out.push({ type: r.type, row: ri, idx: i, n: faces.length, x0, x1, z0, z1, hinge, style: r.style || '', face: fc });
    });
  });
  return out;
}
// Where a front shows across the cabinet in elevation (from its wall): its own x for a plain front, the face seen
// straight on for a corner (a 90° corner's return face is edge-on, so it shows no width).
function frontEX(f) {
  if (!f.face) return [f.x0, f.x1];
  const a = facePt(f.face, f.x0).x, b = facePt(f.face, f.x1).x;
  return [Math.min(a, b), Math.max(a, b)];
}

// Hinges on corner doors, from the shop's Blum CLIP top list: 45° doors take the diagonal hinge; a 90° corner's doors
// are a bi-fold, the hinged door on 155° hinges and the second door on bi-fold hinges.
function cornerHinge(c, f, hg) {
  if (!f.face) return { name: hg.name, plate: true };
  const blum = /blum/i.test(hg.name || '');
  if (c.corner.type === 'diag') return { name: blum ? 'Blum CLIP top BLUMOTION 110° diagonal 45°' : `${hg.name} (45° diagonal)`, plate: true };
  return f.idx === 0 ? { name: blum ? 'Blum CLIP top BLUMOTION 155°' : `${hg.name} (155°)`, plate: true } : { name: blum ? 'Blum CLIP top 60° bi-fold' : `${hg.name} (bi-fold)`, plate: false };
}

// A polygon moved in by d[i] on each edge i (the edge from point i to point i+1).
function insetPoly(pts, d) {
  const n = pts.length, s = shapeArea2(pts) > 0 ? 1 : -1, lines = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b.x - a.x, b.y - a.y) || 1, u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, nn = { x: -u.y * s, y: u.x * s }, k = d[i] || 0;
    lines.push({ p: { x: a.x + nn.x * k, y: a.y + nn.y * k }, u });
  }
  return lines.map((l1, i) => {
    const l0 = lines[(i + n - 1) % n], den = l0.u.x * l1.u.y - l0.u.y * l1.u.x;
    if (Math.abs(den) < 1e-9) return { x: r3(l1.p.x), y: r3(l1.p.y) };
    const t = ((l1.p.x - l0.p.x) * l1.u.y - (l1.p.y - l0.p.y) * l1.u.x) / den;
    return { x: r3(l0.p.x + l0.u.x * t), y: r3(l0.p.y + l0.u.y * t) };
  });
}
// Inside outline of a corner box at shelf level: in from the back by the back, from the faces by the shelf setback,
// and from every other edge by a side's thickness.
function cornerInside(c, p, t, bt, setback) {
  const top = cornerTop(c), faces = cornerFaceEdges(c);
  return insetPoly(top.pts, top.pts.map((_, i) => i === 0 ? p.backInset + bt : faces.includes(i) ? setback : t + 0.03125));
}
// Where a lazy susan turns in a corner and how big it can be: in the middle of a 45° corner, and at the inside corner
// of a 90° one, pie cut so the doors fold into the cut. pie is where the cut starts (three.js cylinder angle).
function cornerSusan(c, p, t, bt) {
  const poly = cornerInside(c, p, t, bt, 0.5), R = cornerSide(c) === 'R';
  const segD = (q, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, k = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(q.x - a.x - dx * k, q.y - a.y - dy * k); };
  let q;
  if (c.corner.type === 'l') { const v = poly[3]; q = { x: v.x + (R ? 1.5 : -1.5), y: v.y - 1.5 }; }
  else { const b = polyBox(poly); q = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; }
  const r = Math.max(4, Math.min(...poly.map((a, i) => c.corner.type === 'l' && (i === 2 || i === 3) ? 1e9 : segD(q, a, poly[(i + 1) % poly.length]))) - 0.5);
  return { cx: q.x, cz: q.y, r, pie: c.corner.type === 'l' ? (R ? 0 : Math.PI / 2) : null };
}
// Where the legs go on a corner: a leg in from each corner of the footprint.
const cornerLegSpots = (c, p) => insetPoly(cornerTop(c).pts, cornerTop(c).pts.map((_, i) => i === 0 ? 3 : cornerFaceEdges(c).includes(i) ? (p.toeKickSetback || 3) + 2.5 : 2.5));

// Cut list for corners, after the box and its shaped panels are made.
function cornerParts(c, parts, k) {
  const { p, t, bt, tk, feet, part, cm, sm, warn, addB, ptT } = k, mine = q => q.cabId === c.id;
  if (blindCorner(c)) {
    // The blind panel closes the box front over the part with no doors, set between the sides.
    const bw = blindWidth(c), zIn0 = tk + t, zIn1 = c.h - t;
    // A face frame's wide stile covers the blind side instead.
    if (!faceFrame(c)) part('Blind panel', cm, r3(zIn1 - zIn0 + 2 * t), r3(bw - t), { kind: 'divider' });
    return;
  }
  // The end of the return leg is its end panel.
  parts.forEach(q => { if (mine(q) && q.edgeType && /^Edge \d+ /.test(q.name)) q.name = q.edgeType === 'fin' ? 'Finished end (return)' : 'End (return)'; });
  // Shelves follow the inside of the L or the angled face.
  const i = parts.findIndex(q => mine(q) && q.name === 'Adjustable shelf');
  if (i >= 0) {
    const src = parts[i], poly = cornerInside(c, p, t, bt, p.shelfFrontSetback), b = polyBox(poly);
    parts.splice(i, 1, { ...src, L: r3(b.x1 - b.x0), W: r3(b.y1 - b.y0), outline: poly.map(q => ({ x: r3(q.x - b.x0), y: r3(q.y - b.y0) })) });
  }
  // A toe skin along each face.
  const ts = parts.findIndex(q => mine(q) && (q.name === 'Toe skin' || q.name === 'Toe kick'));
  if (ts >= 0) {
    const src = parts.splice(ts, 1)[0], fs = cornerFaces(c);
    fs.forEach((fc, j) => parts.splice(ts + j, 0, { ...src, name: fs.length > 1 ? `${src.name} ${j + 1}` : src.name, L: r3(fc.len), ops: [] }));
  }
}

// 3D: shelves cut to the inside outline, toe skins along the faces, and the legs at the footprint's corners.
function cornerShelf3d(c, p, t, bt, z, m) {
  const poly = cornerInside(c, p, t, bt, p.shelfFrontSetback);
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(poly.map(q => new THREE.Vector2(q.x, q.y))), { depth: t, bevelEnabled: false });
  const me = new THREE.Mesh(g, m); me.rotation.x = Math.PI / 2; me.position.set(0, z + t, 0);
  if (!R3) me.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat3()));
  return me;
}
function cornerToe3d(c, tk, sb, t, m, add) {
  cornerFaces(c).forEach(fc => {
    const P = facePt(fc, fc.len / 2, -sb - t / 2), me = box3(fc.len, tk, t, m, P.x, tk / 2, P.z);
    me.rotation.y = Math.atan2(-fc.uz, fc.ux); add(me);
  });
}
// The group a corner front is built in: x along its face, z out of it, so the usual door and pull code works there.
function cornerFaceGroup(f) {
  const g = new THREE.Group(); g.position.set(f.face.ox, 0, f.face.oz); g.rotation.y = Math.atan2(-f.face.uz, f.face.ux);
  return g;
}

// Plan: the fronts drawn just outside each face.
function cornerPlanFronts(c, fr, P, ft, up) {
  let s = '';
  const seen = new Set();
  fr.forEach(f => {
    const k = f.idx + '|' + f.x0.toFixed(2); if (seen.has(k)) return; seen.add(k);
    const q = [facePt(f.face, f.x0), facePt(f.face, f.x1), facePt(f.face, f.x1, ft), facePt(f.face, f.x0, ft)].map(v => P(v.x, v.z));
    s += `<polygon class="p-front${up} nss" points="${polyPts(q)}"/>`;
  });
  return s;
}

/* ---------- Editing ---------- */
// The Corner box in the cabinet editor's Size tab: which end goes in the corner, and the blind width or leg depth.
function cornerBox(c) {
  if (!isCorner(c)) return '';
  const K = 'cabk:' + c.id, side = cornerSide(c), blind = blindCorner(c);
  const seg = `<div class="seg" role="group" aria-label="Corner side">${[['L', 'Left'], ['R', 'Right']].map(([v, l]) => `<button data-act="corner-side" data-id="${c.id}:${v}" aria-pressed="${side === v}">${l}</button>`).join('')}</div>`;
  return `<div class="psec box">${secHead('plan', CORNER_KINDS[c.corner.type], 'violet')}
    <div class="grid4"><label class="f"><span>${blind ? 'Blind side' : 'Corner on the'}</span>${seg}</label>
    ${blind ? fld('Blind width', K, 'blind', blindWidth(c), 'len') : fld('Leg depth', K, 'leg', cornerLeg(c), 'len')}</div>
    <div class="note">${blind ? 'The blind side goes into the corner, behind the cabinet on the other wall. A blind panel covers it; the doors and drawers fill the rest.' : 'Width runs along this wall and depth runs out along the other wall. Both legs are the leg depth.'}</div></div>`;
}
// The Left/Right switch on the bar under the drawing.
const cornerBtn = c => isCorner(c) ? `<button data-act="corner-flip" data-id="${c.id}" title="Put the ${blindCorner(c) ? 'blind side' : 'corner'} on the ${cornerSide(c) === 'L' ? 'right' : 'left'} end">${icon('flip')}Corner ${cornerSide(c) === 'L' ? 'left' : 'right'}</button>` : '';
function setCornerSide(c, v) {
  if (!isCorner(c) || cornerSide(c) === v) return;
  mutate(() => { c.corner.side = v; if (typeof cabLog === 'function') cabLog(c, `Corner on the ${v === 'L' ? 'left' : 'right'}`); });
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act="corner-side"],[data-act="corner-flip"]'); if (!b) return;
  e.stopPropagation();
  if (b.dataset.act === 'corner-flip') { const c = cab(b.dataset.id); if (c) setCornerSide(c, cornerSide(c) === 'L' ? 'R' : 'L'); }
  else { const [id, v] = b.dataset.id.split(':'), c = cab(id); if (c) setCornerSide(c, v); }
  if (ui.quick) renderQuick();
}, true);
