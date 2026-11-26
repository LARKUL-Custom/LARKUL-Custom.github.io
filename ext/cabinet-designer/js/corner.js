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
// 0.63.65: the return leg (how wide the leg along the other wall is) can differ from the leg depth; unset, it is the same.
const cornerLeg2 = c => { const v = +c.corner.leg2 > 0 ? +c.corner.leg2 : cornerLeg(c); return Math.max(3, Math.min(v, c.w - 3, c.d - 3)); };
// How far the back corner is cut off along each wall (Mozaik's 6"); never more than leaves the legs a 3" back.
const cornerClip = c => { const v = +c.corner.clip || 0; if (!(v > 0) || c.corner.type === 'blind') return 0;
  return Math.max(0, Math.min(v, c.w - cornerLeg2(c) - 3, c.d - cornerLeg(c) - 3)); };
const blindWidth = c => { const v = +c.corner.blind > 0 ? +c.corner.blind : (c.cat === 'Wall' ? 15 : 26); return Math.max(3, Math.min(v, c.w - 6)); };

// The products, from the shop's 2026 Larkul Mozaik library (Blind Corner Left/Right, 45 and 90 Susan Cabinet,
// Wall Blind Left/Right, Wall 45 and Wall 90 Corner). One product per kind; the Left/Right switch replaces the pairs.
function cornerLibItems() {
  const R = (type, h, count = 1) => ({ type, h, count }), con = (cat, full) => ({ toeKick: cat !== 'Wall', top: full || cat === 'Wall' ? 'full' : 'stretchers' });
  const susan = [{ type: 'lazy', name: 'Lazy susan, 2 shelf' }];
  const mk = (id, name, cat, w, h, d, elev, rows, corner, params, extra = {}) => ({ id, name, cat, w, h, d, elev, rows, params, construction: con(cat, corner.type !== 'blind'), folder: 'Corner', corner, ...extra });
  return [
    mk('b-blind', 'Base Blind Corner', 'Base', 42, 34.5, 24, 0, [R('drawer', 6), R('door', '*')], { type: 'blind', side: 'L', blind: 26 }, { shelfCount: 1 }),
    mk('b-corner45', 'Base 45° Corner', 'Base', 36, 34.5, 36, 0, [R('door', '*')], { type: 'diag', side: 'L', leg: 24, clip: 6 }, { shelfCount: 0 }, { inserts: clone(susan) }),
    mk('b-corner90', 'Base 90° Corner', 'Base', 36, 34.5, 36, 0, [R('door', '*')], { type: 'l', side: 'L', leg: 24, clip: 6 }, { shelfCount: 0 }, { inserts: clone(susan) }),
    mk('w-blind', 'Wall Blind Corner', 'Wall', 36, 36, 12, 54, [R('door', '*')], { type: 'blind', side: 'L', blind: 15 }, { shelfCount: 2 }),
    mk('w-corner45', 'Wall 45° Corner', 'Wall', 24, 36, 24, 54, [R('door', '*')], { type: 'diag', side: 'L', leg: 12, clip: 6 }, { shelfCount: 2 }),
    mk('w-corner90', 'Wall 90° Corner', 'Wall', 24, 36, 24, 54, [R('door', '*')], { type: 'l', side: 'L', leg: 12, clip: 6 }, { shelfCount: 2 }),
  ];
}
// Jobs made before corners get them in their Products tree once.
function ensureCornerLib(s) {
  if (!s || !Array.isArray(s.library) || s.cornerLib) return s;
  cornerLibItems().forEach(l => { if (!s.library.some(x => x.id === l.id)) s.library.push(l); });
  s.cornerLib = 1;
  return s;
}
// 0.63.72: the library's 45° and 90° corners get Mozaik's 6" angled back for new cabinets (placed ones keep theirs).
function ensureCornerClip(s) {
  if (!s || !Array.isArray(s.library) || s.cornerClip) return s;
  s.library.forEach(l => { if (/^[bw]-corner(45|90)$/.test(l.id || '') && l.corner && l.corner.clip === undefined) l.corner.clip = 6; });
  s.cornerClip = 1;
  return s;
}

// The top shape of a 45° or 90° corner (x across, y out from the cabinet's wall), with the end of the return leg closed
// by a panel. Edge 0 is the back, the edges after it go round the outside.
function cornerTop(c) {
  const W = c.w, D = c.d, a = cornerLeg(c), b = cornerLeg2(c), L = c.corner.type === 'l';
  // 0.63.72 (Ayden 2026-11-25: "look at our cabinet in mozaik, we have an angled back"): the back corner, where the two
  // walls meet, is cut off at 45° (6" each way in the shop's 90 and 45 Susan and Wall Corner cabinets), with a back
  // panel across it. corner.clip sets it; 0 is square.
  const k = cornerClip(c);
  let pts = L ? [[k, 0], [W, 0], [W, a], [b, a], [b, D], [0, D]] : [[k, 0], [W, 0], [W, a], [b, D], [0, D]];
  const edges = L ? ['', '', '', '', 'unfin', ''] : ['', '', '', 'unfin', ''];
  if (k > 0) { pts.push([0, k]); edges.push('back'); }
  if (cornerSide(c) === 'R') pts = pts.map(([x, y]) => [W - x, y]);
  return { pts: pts.map(([x, y]) => ({ x: r3(x), y: r3(y) })), w: W, h: D, edges, corner: true };
}
// The top shape the box is built from: a corner's own, or the one drawn in the Shape tab.
const cabTopShape = c => angledCorner(c) ? cornerTop(c) : (c && c.moz && typeof mozTopShape === 'function' && mozTopShape(c)) || ((c && c.shape) || {}).top;
// Edges of the corner's top shape that hold fronts (the angled face, or the two faces of the L).
const cornerFaceEdges = c => c.corner.type === 'l' ? [2, 3] : [2];

// The faces the fronts sit on, left to right as you stand in front of them, in cabinet coordinates (x across, z out from
// the wall): each starts at (ox, oz) and runs along (ux, uz) for len; its outside is (-uz, ux).
function cornerFaces(c) {
  const W = c.w, D = c.d, a = cornerLeg(c), b = cornerLeg2(c);
  let f = c.corner.type === 'l' ? [[[b, D], [b, a]], [[b, a], [W, a]]] : [[[b, D], [W, a]]];
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
// A 45° door hinges like any single door. A 90° corner's two doors are a bi-fold: the door on the return leg hinges on
// its outside end (on the end panel), and the other folds onto it, hinged to it at the inside corner. Both hinge on the
// corner's side in their face's own left-to-right, so a right-hand corner is the mirror of a left-hand one.
function cornerFronts(c, p, rows, zs) {
  const faces = cornerFaces(c), gap = p.frontGap, rv = p.frontSideReveal, ft = frontThick(c), out = [];
  rows.forEach((r, ri) => {
    const [z0, z1] = zs[ri];
    faces.forEach((fc, i) => {
      // Two separate doors are each as wide as their face, as Mozaik draws them (0.63.19); a bi-fold's second door starts past the first.
      const one = faces.length === 1, rvL = one && isFinite(c.revL) ? +c.revL : rv, rvR = one && isFinite(c.revR) ? +c.revR : rv; // Mozaik's reveals (0.63.19)
      const x0 = faces.length > 1 && i === 1 && !cornerPair(c) ? ft + gap : rvL, x1 = r3(fc.len - rvR);
      let hinge = null;
      // A 90° corner set to two separate doors (0.62.6) hinges like the bi-fold too (Ayden 2026-11-24, 0.63.2: "the
      // continuing door should be seen as a continuation"): the hinge-side door on its outside end, the other on the
      // inside corner, so its pull sits out at its own outside end. Swapping the hinge side swaps both.
      if (r.type === 'door') hinge = faces.length > 1 ? cornerSide(c) : (r.hinge === 'L' || r.hinge === 'R' ? r.hinge : p.hingeSide);
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
// are a bi-fold (Ayden 2026-11-10): the door that hangs on the cabinet on the regular hinge, the second on bi-fold hinges.
// Either door of a 90° corner can take its own hinge from the hardware list (Corner box in the editor): hingeMain for the
// door on the cabinet, hingeFold for the folding door. Blank keeps the defaults below.
function cornerHingeHw(c, f) {
  if (!f.face || !c.corner || c.corner.type !== 'l') return null;
  const h = hw(cornerMainDoor(c, f) ? c.corner.hingeMain : c.corner.hingeFold);
  return h && h.kind === 'hinge' ? h : null;
}
// A 90° corner with two separate doors (not a bi-fold): c.corner.doors 'pair'.
const cornerPair = c => !!(c && c.corner && c.corner.type === 'l' && c.corner.doors === 'pair');
function cornerHinge(c, f, hg) {
  if (!f.face) return { name: hg.name, plate: true };
  // Two separate doors: each hangs on the cabinet (plates on its end), the second on its own pick or the cabinet hinge.
  const own = cornerHingeHw(c, f); if (own) return { name: own.name, plate: cornerMainDoor(c, f) };
  const blum = /blum/i.test(hg.name || '');
  if (c.corner.type === 'diag') return { name: blum ? 'Blum CLIP top BLUMOTION 110° diagonal 45°' : `${hg.name} (45° diagonal)`, plate: true };
  // 0.63.71 (Ayden 2026-11-25: "the hinge side has regular hinges but the connection between the two has 110 degree
  // hinges"): the folding door hangs on the other door on 110° hinges, no plates on the cabinet.
  // 0.63.77 (Ayden 2026-11-25: "make that 90 corner cabinet have a 185 degree hinge thats on the cabinet side door"):
  // the door on the cabinet hangs on 185° hinges (one from the hardware list with 185 in its name, else by name).
  if (cornerMainDoor(c, f)) { const h185 = (typeof hwOf === 'function' ? hwOf('hinge') : []).find(h => /185/.test(h.name || '')); return { name: h185 ? h185.name : blum ? 'Blum CLIP top 185°' : '185° hinge', plate: true }; }
  const h110 = /110/.test(hg.name || '') ? hg : (typeof hwOf === 'function' ? hwOf('hinge') : []).find(h => /110/.test(h.name || ''));
  return { name: h110 ? h110.name : blum ? 'Blum CLIP top 110°' : `${hg.name} (bi-fold)`, plate: false };
}
// The door of a 90° corner's bi-fold that hinges on the cabinet: the one on the return leg (faces run left to right).
const cornerMainDoor = (c, f) => f.idx === (cornerSide(c) === 'R' ? 1 : 0);
// 0.63.68 (Ayden 2026-11-25: "the corner doors wont fold open"): a bi-fold opens as one, in one move (0.63.71).
// 0.63.72 (Ayden: "the door opens differently than that, get real information from 90 degree corners in real life"):
// the doors make an L when shut and straighten when opened (the connecting hinge, 110° in the shop, opens 90°), so
// the two become one wide flat door that swings out on the cabinet's hinges ("regular hinges" on the hinge side).
// Mozaik's 90 Susan Cabinet is the same: a 155° hinge on the return-leg door, a bi-fold hinge between the doors and
// one pull, out at the free end of the other door. cornerFoldDoor is the door that straightens; cornerFoldOf finds it
// for the cabinet's door.
// Both door widths open as a bi-fold (Mozaik imports set 'pair'; Ayden 2026-11-25: "only opens one door not both in one action").
const cornerBifold = c => !!(c && c.corner && c.corner.type === 'l');
const cornerFoldDoor = (c, f) => !!(f && f.face && f.type === 'door' && cornerBifold(c) && !cornerMainDoor(c, f));
const cornerFoldOf = (c, f, fr) => f && f.face && f.type === 'door' && cornerBifold(c) && cornerMainDoor(c, f) ? (fr || computeFronts(c)).find(d => d.type === 'door' && d.face && d.row === f.row && d.idx !== f.idx) || null : null;
// How far the second door has straightened when the pair is share k of the way open. It straightens late: the L
// swings out on the cabinet's hinges first, then flattens as it clears the cabinet next to it (real bi-folds: "bend
// at 90 degrees when shut, but straighten up when opened"; "these doors now become flat").
const cornerFoldShare = k => k * k;
// The cabinet hinge on the hinge side opens 185° (0.63.77), so the straightened pair can swing back flat against the
// cabinet beside it, as far as nothing is in the way.
const CORNER_PAIR_MAX = 185 * Math.PI / 180;
// Where the straightening door turns, along its own face (its face's x): halfway through the other door's thickness
// at the inside corner, so straightened it lines up with that door, its back flush with the other door's back.
const cornerFoldPivot = (g, t) => g.hinge === 'R' ? g.face.len - t / 2 : t / 2;
// The straightening door turned phi on its connecting hinge (pi/2 = straight, in line with the door it hangs on, past
// that door's free edge), as points in the cabinet (x across, z out). t is the doors' thickness.
function cornerFoldedLeaf(g, t, phi = Math.PI / 2) {
  const R = g.hinge === 'R', px = cornerFoldPivot(g, t), pz = t / 2, cs = Math.cos(phi), sn = Math.sin(phi);
  const turn = ([x, o]) => { const dx = x - px, dz = o - pz; return R ? [px + dx * cs - dz * sn, pz + dx * sn + dz * cs] : [px + dx * cs + dz * sn, pz - dx * sn + dz * cs]; };
  return [[g.x0, 0], [g.x1, 0], [g.x1, t], [g.x0, t]].map(turn).map(([x, o]) => facePt(g.face, x, o));
}
// Where a corner door's hinges are, in cabinet coordinates (x across, z out from the wall).
function cornerHingeEnd(f) {
  return facePt(f.face, f.hinge === 'R' ? f.face.len : 0);
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
  return insetPoly(top.pts, top.pts.map((_, i) => i === 0 || top.edges[i] === 'back' ? p.backInset + bt : faces.includes(i) ? setback : t + 0.03125));
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
const cornerLegSpots = (c, p) => { const tp = cornerTop(c); return insetPoly(tp.pts, tp.pts.map((_, i) => i === 0 || tp.edges[i] === 'back' ? 3 : cornerFaceEdges(c).includes(i) ? (p.toeKickSetback || 3) + 2.5 : 2.5)); };

// Where a blind corner's blind panel sits on the front: x0..x1 across, z0..z1 up (the fronts' reveals and gap).
function blindPanelAt(c, p) {
  p = p || effParams(c); const bw = blindWidth(c), sr = p.frontSideReveal, tk = hasToe(c) ? p.toeKickHeight : 0;
  const z0 = tk + p.frontBottomReveal, z1 = c.h - p.frontTopReveal;
  return cornerSide(c) === 'L' ? { x0: sr, x1: bw, z0, z1 } : { x0: c.w - bw, x1: c.w - sr, z0, z1 };
}
// Cut list for corners, after the box and its shaped panels are made.
function cornerParts(c, parts, k) {
  const { p, t, bt, tk, feet, part, cm, sm, warn, addB, ptT } = k, mine = q => q.cabId === c.id;
  if (blindCorner(c)) {
    // The blind panel closes the box front over the part with no doors, set between the sides.
    const bw = blindWidth(c), zIn0 = tk + t, zIn1 = c.h - t;
    // A face frame's wide stile covers the blind side instead. Otherwise (Mozaik's FinExterior panel, 0.55.45) it goes on
    // the front like a door, from the cabinet's edge to the doors' gap, as tall as the fronts, in the door material.
    if (!faceFrame(c)) { const bpz = blindPanelAt(c, p), fr = computeFronts(c, p), dm = fr.length ? (mat(frontStyle(c, fr[0]).ds.mat) || cm) : cm;
      part('Blind panel', dm, r3(bpz.z1 - bpz.z0), r3(bpz.x1 - bpz.x0), { kind: 'applied' }); }
    return;
  }
  // The end of the return leg is its end panel.
  parts.forEach(q => { if (mine(q) && q.edgeType && /^Edge \d+ /.test(q.name)) q.name = q.edgeType === 'back' ? 'Angled back' : q.edgeType === 'fin' ? 'Finished end (return)' : 'End (return)'; });
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
function cornerShelf3d(c, p, t, bt, z, m, setback) {
  const poly = cornerInside(c, p, t, bt, setback === undefined ? p.shelfFrontSetback : setback);
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
    const o = frontOff(c), q = [facePt(f.face, f.x0, o), facePt(f.face, f.x1, o), facePt(f.face, f.x1, o + ft), facePt(f.face, f.x0, o + ft)].map(v => P(v.x, v.z));
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
    ${blind ? fld('Blind width', K, 'blind', blindWidth(c), 'len') : fld('Depth on this wall', K, 'leg', cornerLeg(c), 'len') + fld('Depth on the other wall', K, 'leg2', cornerLeg2(c), 'len') + fld('Angled back', K, 'clip', cornerClip(c), 'len')}
    ${c.corner.type === 'l' ? fld('Door widths', K, 'doors', c.corner.doors || '', 'select', { options: [{ v: '', l: 'Second door past the first' }, { v: 'pair', l: 'Each as wide as its face (Mozaik)' }] })
      + fld('Door on the cabinet', K, 'hingeMain', c.corner.hingeMain || '', 'select', { options: [{ v: '', l: 'Cabinet hinge' }, ...opts(hwOf('hinge'))] })
      + fld('Between the doors', K, 'hingeFold', c.corner.hingeFold || '', 'select', { options: [{ v: '', l: '110° hinge' }, ...opts(hwOf('hinge'))] }) : ''}</div>
    <div class="note">${blind ? 'The blind side goes into the corner, behind the cabinet on the other wall. A blind panel covers it; the doors and drawers fill the rest.' : 'Width runs along this wall and depth runs out along the other wall. Depth on each wall is how deep the cabinet is there; Angled back cuts off the back corner where the walls meet (0 is square).'}${c.corner.type === 'l' ? ' The two doors are a bi-fold: one hangs on the cabinet, the other hangs on it and they straighten out as they open. One pull, on the second door.' : ''}</div></div>`;
}
// The Left/Right switch on the bar under the drawing.
const cornerBtn = c => isCorner(c) ? `<button data-act="corner-flip" data-id="${c.id}" title="Corner: put the ${blindCorner(c) ? 'blind side' : 'corner'} on the ${cornerSide(c) === 'L' ? 'right' : 'left'} end">${icon('flip')}Corner ${cornerSide(c) === 'L' ? 'left' : 'right'}</button>` : '';
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

// 0.63.65 (Ayden: "i keep changing it to 15 instead of 12 and it resets"): a 45° or 90° corner's top is made from its
// width, depth and legs, so a top drawn in the shape editor is read back into those. Gives false when the drawing is
// not a corner of that kind (then nothing changes).
function cornerFromTop(c, pts) {
  const L = c.corner.type === 'l', n = L ? 6 : 5; if (!pts || (pts.length !== n && pts.length !== n + 1) || pts.some(p => p.r || p.b)) return false;
  const b0 = shapeBox(pts), W = b0.w, D = b0.h;
  let q = pts.map(p => [p.x - b0.x0, p.y - b0.y0]);
  if (cornerSide(c) === 'R') q = q.map(([x, y]) => [W - x, y]);
  // 0.63.72: an angled back is the two points (k, 0) and (0, k) next to each other in place of the back corner.
  let clip = 0;
  if (q.length === n + 1) {
    const i = q.findIndex((p, j) => { const r = q[(j + 1) % q.length]; return (Math.abs(p[1]) < 1e-3 && Math.abs(r[0]) < 1e-3 && p[0] > 0 && r[1] > 0 && Math.abs(p[0] - r[1]) < 1e-3) || (Math.abs(p[0]) < 1e-3 && Math.abs(r[1]) < 1e-3 && p[1] > 0 && r[0] > 0 && Math.abs(p[1] - r[0]) < 1e-3); });
    if (i < 0) return false;
    clip = Math.max(q[i][0], q[i][1]); const j2 = (i + 1) % q.length;
    q = q.flatMap((p, j) => j === i ? [[0, 0]] : j === j2 ? [] : [p]);
  }
  const near = (p, x, y) => Math.abs(p[0] - x) < 1e-3 && Math.abs(p[1] - y) < 1e-3;
  // The points can start anywhere and go either way round.
  for (const dir of [1, -1]) for (let s = 0; s < n; s++) {
    const r = q.map((_, i) => q[((s + dir * i) % n + n) % n]);
    if (!near(r[0], 0, 0) || !near(r[1], W, 0) || !near(r[n - 1], 0, D)) continue;
    const a = r[2][1], b = r[3][0];
    if (Math.abs(r[2][0] - W) > 1e-3 || a < 3 - 1e-3 || a > D - 3 + 1e-3 || b < 3 - 1e-3 || b > W - 3 + 1e-3) continue;
    if (L ? !(near(r[3], b, a) && near(r[4], b, D)) : !near(r[3], b, D)) continue;
    c.w = r3(W); c.d = r3(D); c.corner.leg = r3(a); if (clip || c.corner.clip) c.corner.clip = r3(clip);
    if (Math.abs(a - b) < 1e-3) delete c.corner.leg2; else c.corner.leg2 = r3(b);
    return true;
  }
  return false;
}
