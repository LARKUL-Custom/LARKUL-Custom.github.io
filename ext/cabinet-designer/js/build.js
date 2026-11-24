// Build: wall geometry, front layout, parts and machining, countertop and molding runs.
'use strict';

/* ---------- Geometry ---------- */
function wg(w) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy) || 1;
  const u = { x: dx / L, y: dy / L }; return { L, u, n: { x: -u.y, y: u.x } };
}
function wallPt(w, g, s, a, b) { return { x: w.x1 + g.u.x * a + g.n.x * s * b, y: w.y1 + g.u.y * a + g.n.y * s * b }; }
function cabPoly(c, o) {
  const w = wall(o ? o.wall : c.wall); if (!w) return null;
  const g = wg(w), s = o ? o.side : c.side, off = o ? o.off : c.off, f = w.thick / 2 + (c.outset || 0);
  return [wallPt(w, g, s, off, f), wallPt(w, g, s, off + c.w, f), wallPt(w, g, s, off + c.w, f + c.d), wallPt(w, g, s, off, f + c.d)];
}
function panelThick(c) { return (mat(panelFor(c).mat) || { thick: 0.75 }).thick; }
// One applied panel piece as a part: its length (up the end) and width (front to back, overhang and scribe included),
// and the notched outline when its back edge steps. Panel x runs up from the piece's bottom, y forward from its back edge.
// The scribe at the back is only there when the piece reaches the wall; a strip in front of a neighbour gets none.
// 0.63.4: a wall marked Scribe adds its scribe extra on top.
function panelGeom(c, end, pc, ps) {
  ps = ps || panelFor(c);
  const D = endDepth(c, end), dmin = Math.min(...pc.steps.map(q => q.d0)), sc = dmin < 1e-6 ? ps.scribe + (typeof wallScribeX === 'function' ? wallScribeX(wall(c.wall)) : 0) : 0;
  const L = pc.z1 - pc.z0, W = D - dmin + ps.frontOverhang + sc, y = dd => dd - dmin + sc;
  const yb = q => q.d0 < 1e-6 ? 0 : r3(y(q.d0));
  let outline = null;
  if (pc.steps.some(q => Math.abs(q.d0 - dmin) > 1e-6)) {
    const pts = [];
    pc.steps.forEach(q => { pts.push({ x: r3(q.z0 - pc.z0), y: yb(q) }, { x: r3(q.z1 - pc.z0), y: yb(q) }); });
    pts.push({ x: L, y: W }, { x: 0, y: W });
    outline = pts.filter((q, i) => !i || Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) > 1e-4);
  }
  // A point on the piece, kept an inch inside its edges.
  const full = !outline && dmin < 1e-6 && pc.steps.length === 1;
  const inside = (x, yy) => full || x > 1 && x < L - 1 && yy < W - 1 && pc.steps.some(q => x + pc.z0 > q.z0 + 1 && x + pc.z0 < q.z1 - 1 && yy > yb(q) + 1);
  return { D, dmin, sc, L, W, y, yb, outline, inside, full };
}
// Applied panel spans along the wall: [a0, a1] for the viewer's left and right ends. explicitOnly skips automatic ones.
function panelSpans(c, explicitOnly) {
  const pt = panelThick(c), s = c.side, out = [];
  const leftA = s === 1 ? [c.off - pt, c.off] : [c.off + c.w, c.off + c.w + pt];
  const rightA = s === 1 ? [c.off + c.w, c.off + c.w + pt] : [c.off - pt, c.off];
  const on = end => explicitOnly ? panelMode(c, end) === 'on' : hasPanel(c, end);
  if (on('L')) out.push({ end: 'L', a: leftA });
  if (on('R')) out.push({ end: 'R', a: rightA });
  return out;
}
function panelPolys(c, explicitOnly) {
  // 0.58.27: neighbor checks ask every cabinet in the room for its "Always" panels; most have none, so skip the panel lookup.
  if (explicitOnly && panelMode(c, 'L') !== 'on' && panelMode(c, 'R') !== 'on') return [];
  const w = wall(c.wall); if (!w) return [];
  const g = wg(w), s = c.side, f = w.thick / 2 + (c.outset || 0), oh = panelFor(c).frontOverhang;
  return panelSpans(c, explicitOnly).map(({ end, a: [a0, a1] }) => {
    // A strip in front of a shallower neighbour starts at that neighbour's face.
    const pcs = explicitOnly ? null : panelPieces(c, end), d0 = pcs ? Math.min(...pcs.flatMap(pc => pc.steps.map(q => q.d0))) : 0, d1 = endDepth(c, end) + oh;
    return [wallPt(w, g, s, a0, f + d0), wallPt(w, g, s, a1, f + d0), wallPt(w, g, s, a1, f + d1), wallPt(w, g, s, a0, f + d1)];
  });
}
// Filler strips in plan: flush with the fronts, across the gap to the wall.
function fillerPolys(c) {
  const w = wall(c.wall); if (!w) return [];
  const g = wg(w), s = c.side, f = w.thick / 2 + (c.outset || 0), t = (mat(fillerMat(c)) || { thick: 0.75 }).thick;
  return fillersOf(c).map(fl => [wallPt(w, g, s, fl.a0, f + c.d), wallPt(w, g, s, fl.a1, f + c.d), wallPt(w, g, s, fl.a1, f + c.d + t), wallPt(w, g, s, fl.a0, f + c.d + t)]);
}
const fillerMat = c => finishRole(c, 'sheet');
// 0.58.38: the toe skin (or built-in toe kick) is a part you see, so it is cut from the cabinet's finish (Ayden 2026-11-19:
// it wasn't following the finish of the cabinet it's on). It stays in the template's toe material when the finish sheet is
// not the same thickness (within 1/16"), or is a bought door material.
function toeMat(c, mt) {
  mt = mt || cabMatT(cabSet(c, 'cabMatT'));
  const tm = mat(mt.toeKick) || mat(mt.carcass), fm = mat(finishMat(c));
  if (!fm || !tm || fm.id === tm.id || fm.doorBuy || (fm.kind && fm.kind !== 'sheet') || Math.abs(fm.thick - tm.thick) > 0.07) return tm;
  return fm;
}
// The material a cabinet's show parts are made in: the room's finish pick, else its door style's material.
const finishMat = c => finishRole(c, 'sheet');
function segDist(p, w) {
  const g = wg(w); const t = (p.x - w.x1) * g.u.x + (p.y - w.y1) * g.u.y;
  const tc = Math.max(0, Math.min(g.L, t));
  const q = { x: w.x1 + g.u.x * tc, y: w.y1 + g.u.y * tc };
  return { d: Math.hypot(p.x - q.x, p.y - q.y), t, side: ((p.x - w.x1) * g.n.x + (p.y - w.y1) * g.n.y) >= 0 ? 1 : -1, g };
}
function inPoly(p, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) ins = !ins;
  }
  return ins;
}
const vOverlap = (a, b) => Math.min(a.elev + a.h, b.elev + b.h) - Math.max(a.elev, b.elev) > 0.01;
/* ---------- End caps ---------- */
// A short return at either end of a wall, so a run can stop against it without drawing a whole wall.
// End caps come out 26" from the wall, a 24" deep cabinet plus a countertop's overhang.
const CAP_LEN = 26;
const capDefaults = w => ({ on: false, len: CAP_LEN, thick: w.thick, height: w.height, side: 1 });
// True when another wall starts or ends at this wall's start ('S') or end ('E'). A joined end is a corner, so it gets no end cap.
function wallEndJoined(w, end) {
  const x = end === 'S' ? w.x1 : w.x2, y = end === 'S' ? w.y1 : w.y2;
  return S.walls.some(k => k !== w && [[k.x1, k.y1], [k.x2, k.y2]].some(([a, b]) => Math.hypot(a - x, b - y) < 0.5));
}
function capsOf(w) {
  const h = w.thick / 2, L = wg(w).L, out = [];
  [['S', w.capS], ['E', w.capE]].forEach(([end, cp]) => {
    if (!cp || !cp.on || wallEndJoined(w, end)) return;
    const t = cp.thick > 0 ? cp.thick : w.thick, a0 = end === 'S' ? -h : L + h - t;
    out.push({ end, a0, a1: a0 + t, t, side: cp.side === -1 ? -1 : 1, len: cp.len > 0 ? cp.len : CAP_LEN, height: cp.height > 0 ? cp.height : w.height, inner: end === 'S' ? a0 + t : a0 });
  });
  // Custom caps sit anywhere along the wall; a is the along-wall position of the face nearer the wall start.
  (w.caps || []).forEach(cp => {
    const t = cp.thick > 0 ? cp.thick : w.thick, a0 = Math.max(-h, Math.min(L + h - t, +cp.a || 0));
    out.push({ end: 'C', id: cp.id, a0, a1: a0 + t, t, side: cp.side === -1 ? -1 : 1, len: cp.len > 0 ? cp.len : CAP_LEN, height: cp.height > 0 ? cp.height : w.height, inner: a0 });
  });
  return out;
}
function capPoly(w, cp) {
  const g = wg(w), f = w.thick / 2;
  return [wallPt(w, g, cp.side, cp.a0, f), wallPt(w, g, cp.side, cp.a1, f), wallPt(w, g, cp.side, cp.a1, f + cp.len), wallPt(w, g, cp.side, cp.a0, f + cp.len)];
}
// Viewer-facing x of a cabinet in its wall's elevation.
const elevX = (c, L) => c.side === 1 ? c.off : L - c.off - c.w;
/* ---------- Fronts ---------- */
const falseOn = c => !!c && c.falseFront === 'on';
function computeFronts(c, p) {
  if (c.moz && typeof isMoz === 'function' && isMoz(c)) return [];
  if (c.made && typeof madeDef === 'function' && madeDef(c)) return [];
  p = p || effParams(c);
  // Face frame cabinets: fronts overlay the frame's openings.
  const ffr = faceFrame(c); if (ffr) return ffFronts(c, p, ffr);
  const tk = hasToe(c) ? p.toeKickHeight : 0;
  const zb = tk + p.frontBottomReveal, gap = p.frontGap;
  // 0.62.4 (Ayden 2026-11-24, Argil: "the farm sink has two drawers that open, you can't even see the top drawer"):
  // under an apron (farm house) sink the fronts start below the sink's apron, like Mozaik's sink bases; the apron
  // fills the top of the face, so nothing hides or opens behind it.
  const apS = c.cat === 'Base' && typeof apronSinkOn === 'function' ? apronSinkOn(c) : null;
  const apTop = apS ? ((typeof apronTop === 'function' && apronTop(c)) || c.elev + c.h) - c.elev : 0;
  const zt = Math.min(c.h - p.frontTopReveal, apS ? apTop - (+apS.h || 0) - gap : Infinity);
  const bw = blindCorner(c) ? blindWidth(c) : 0;
  // A blind corner's fronts only cover the open part; the blind side has its blind panel.
  const xl = bw && cornerSide(c) === 'L' ? bw + gap : p.frontSideReveal, xr = bw && cornerSide(c) === 'R' ? c.w - bw - gap : c.w - p.frontSideReveal;
  // A row holding an appliance (bidprod.js) is as tall as the appliance's cutout needs.
  // A microwave opening (bidprod.js, mwSpot) is as tall as its clear height needs.
  const rows = (c.rows || []).map((r, i) => r.appl && typeof applOpen === 'function' && applOpen(r.appl) ? { ...r, h: applRowH(c, p, r, i) }
    : r.mw && typeof mwSpot === 'function' && mwSpot(c, i) ? { ...r, h: mwRowH(c, p, i) } : r);
  const fixed = rows.reduce((a, r) => a + (r.h === '*' ? 0 : (+r.h || 0)), 0);
  const stars = rows.filter(r => r.h === '*').length;
  const avail = (zt - zb) - gap * Math.max(0, rows.length - 1);
  const starH = stars ? Math.max(0, (avail - fixed) / stars) : 0;
  const out = []; let z = zt;
  if (angledCorner(c)) {
    const zs = rows.map(r => { const h = r.h === '*' ? starH : (+r.h || 0), z1 = z; z = z1 - h - gap; return [z1 - h, z1]; });
    return Object.assign(cornerFronts(c, p, rows, zs), { overfull: fixed > avail + 0.001 });
  }
  const rowZ = {};
  rows.forEach((r, ri) => {
    const h = r.h === '*' ? starH : (+r.h || 0), z1 = z, z0 = z - h;
    rowZ[ri] = [z0, z1];
    // 0.63.0: a row split side by side into sections, each its own front (or a stack of them), like Mozaik's face splits.
    const cols = !bw ? rowCols(c, r) : null;
    if (cols) { colFronts(c, p, r, ri, cols, xl, xr, z0, z1, gap, out); z = z0 - gap; return; }
    const n = Math.max(1, r.count | 0), fw = ((xr - xl) - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const x0 = xl + i * (fw + gap);
      let hinge = null;
      // A blind corner's single door hinges at the blind edge unless the row says otherwise (Mozaik, Ayden 2026-11-13).
      if (r.type === 'door') hinge = n === 1 ? (r.hinge === 'L' || r.hinge === 'R' ? r.hinge : bw && !faceFrame(c) ? cornerSide(c) : p.hingeSide) : n === 2 ? (i === 0 ? 'L' : 'R') : (i % 2 ? 'R' : 'L');
      // 0.62.4 (Ayden 2026-11-24: "a false front option so it stays like the design but is false front and removes all
      // interior parts that aren't needed"): with False front on, every door and drawer front stays where it is, in its
      // own style and with its pull, but is glued on (no hinges, slides or drawer box). f.was keeps what it looked like.
      if (falseOn(c) && (r.type === 'door' || r.type === 'drawer')) out.push({ type: 'false', was: r.type, row: ri, idx: i, n, x0, x1: x0 + fw, z0, z1, hinge, style: r.style || '', pull: true });
      else out.push({ type: r.type, row: ri, idx: i, n, x0, x1: x0 + fw, z0, z1, hinge, style: r.style || '', ...(r.pull ? { pull: true } : {}) });
    }
    z = z0 - gap;
  });
  // 0.63.0 (Ayden 2026-11-24, Argil butler pantry sink: "this needs work", the apron floated with open gaps beside it):
  // the face wraps the sink's apron like Mozaik's farm sink base: a false front stands each side of the apron, from
  // over the fronts up to the top, so no opening shows round it.
  if (apS) {
    const ax0 = c.side === -1 ? c.off + c.w - (apS.off + apS.w) : apS.off - c.off, ax1 = ax0 + apS.w;
    const z0 = zt + gap, z1 = Math.min(c.h - p.frontTopReveal, apTop - p.frontTopReveal);
    if (z1 - z0 > 0.5) [[xl, Math.min(xr, ax0 - gap / 2)], [Math.max(xl, ax1 + gap / 2), xr]].forEach(([a, b], i) => {
      if (b - a > 0.5) out.push({ type: 'false', row: -1, idx: i, n: 2, x0: a, x1: b, z0, z1, hinge: null, style: '', apron: true });
    });
  }
  out.overfull = out.overfull || fixed > avail + 0.001;
  out.rowZ = rowZ;
  return out;
}
// 0.63.0 (Ayden 2026-11-24: "i want that system to be almost identical to mozaik"): a face row can be split side by side
// into sections (row.cols), and each section can be split again top to bottom (col.rows), like Mozaik's section splits
// (A over B | C/D). A section is a front (or a pair of doors) of its own type, hinge and style. Frameless cabinets only;
// behind each side-by-side split stands a partition (drawerPartitions) that takes the hinge plates and runners.
// Returns the sections, or null when the row is a plain row.
function rowCols(c, r) {
  if (!r || !Array.isArray(r.cols) || r.cols.length < 2) return null;
  if (faceFrame(c) || angledCorner(c) || (typeof blindCorner === 'function' && blindCorner(c))) return null;
  return r.cols;
}
// Sizes along one direction: numbers stay, '*' share what is left. Returns the sizes and whether they overflow.
function secSizes(list, span, gap) {
  const fixed = list.reduce((a, q) => a + (q === '*' || q === '' || q === undefined ? 0 : (+q || 0)), 0), stars = list.filter(q => q === '*' || q === '' || q === undefined).length;
  const avail = span - gap * Math.max(0, list.length - 1), sh = stars ? Math.max(0, (avail - fixed) / stars) : 0;
  return { sizes: list.map(q => q === '*' || q === '' || q === undefined ? sh : (+q || 0)), over: fixed > avail + 0.001 };
}
function colFronts(c, p, r, ri, cols, xl, xr, z0, z1, gap, out) {
  const ws = secSizes(cols.map(q => q.w), xr - xl, gap); if (ws.over) out.overfull = true;
  const nc = cols.length; let x = xl;
  const xs = ws.sizes.map(w => { const a = x; x = a + w + gap; return [a, a + w]; });
  cols.forEach((col, j) => {
    const [x0, x1] = xs[j], gxL = j ? (xs[j - 1][1] + x0) / 2 : null, gxR = j < nc - 1 ? (x1 + xs[j + 1][0]) / 2 : null;
    const leaves = Array.isArray(col.rows) && col.rows.length > 1 ? col.rows : [col];
    const hs = secSizes(leaves.map(q => q === col ? '*' : q.h), z1 - z0, gap); if (hs.over) out.overfull = true;
    let zz = z1;
    leaves.forEach((lf, k) => {
      const lz1 = zz, lz0 = zz - hs.sizes[k]; zz = lz0 - gap;
      const type = lf.type || 'door', n = type === 'door' ? Math.max(1, lf.count | 0) : 1, fw = ((x1 - x0) - gap * (n - 1)) / n;
      const cell = leaves.length > 1 ? `${ri}.${j}.${k}` : `${ri}.${j}`;
      for (let i = 0; i < n; i++) {
        const fx0 = x0 + i * (fw + gap);
        let hinge = null;
        if (type === 'door') hinge = n === 1 ? (lf.hinge === 'L' || lf.hinge === 'R' ? lf.hinge : j === 0 ? 'L' : j === nc - 1 ? 'R' : p.hingeSide) : n === 2 ? (i === 0 ? 'L' : 'R') : (i % 2 ? 'R' : 'L');
        const base = { row: ri, cell, col: j, ncol: nc, sub: leaves.length > 1 ? k : null, idx: i, n, x0: fx0, x1: fx0 + fw, z0: lz0, z1: lz1, hinge, style: lf.style || '', gxL, gxR };
        if (falseOn(c) && (type === 'door' || type === 'drawer')) out.push({ type: 'false', was: type, ...base, pull: true });
        else out.push({ type, ...base, ...(lf.pull ? { pull: true } : {}) });
      }
    });
  });
}
// A section's opening inside the cabinet, side to side: from the cabinet side or the partition on its left to the one
// on its right (t = the partition and side thickness). Null for a front that isn't in a side-by-side section.
function colOpening(c, f, t) {
  if (!f || f.cell === undefined) return null;
  return { o0: f.gxL !== null && f.gxL !== undefined ? f.gxL + t / 2 : t, o1: f.gxR !== null && f.gxR !== undefined ? f.gxR - t / 2 : c.w - t };
}
/* ---------- Doors stop at what they hit ---------- */
// How far a drawer slides out when its cabinet is opened.
const drawerTravel = c => Math.max(4, Math.min(c.d - 3, 21)) * 0.85;
const segHit = (a, b, c, d) => { const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
// True when two plan polygons overlap: an edge crosses, or one sits inside the other.
const polysHit = (A, B) => A.some(p => inPoly(p, B)) || B.some(p => inPoly(p, A)) || A.some((p, i) => B.some((q, j) => segHit(p, A[(i + 1) % A.length], q, B[(j + 1) % B.length])));
const DOOR_MAX = 1.75, FRONT_T = 0.75;
// Where a front sits in plan: P(x, b) is x across the cabinet from its left end, b out from the closed front face.
function frontFrame(c) {
  const w = wall(c.wall); if (!w) return null;
  const g = wg(w), fb = w.thick / 2 + (c.outset || 0) + c.d + FRONT_T;
  return { w, P: (x, b) => wallPt(w, g, c.side, c.side === 1 ? c.off + x : c.off + c.w - x, fb + b) };
}
// One front's own frame in plan: L(x, out) is x along the front's face and out in front of the face it closes on.
// A 45° or 90° corner's fronts sit on their angled faces.
function frontLocal(c, f, fr) {
  if (!f.face) return (x, out) => fr.P(x, out - FRONT_T);
  return (x, out) => { const q = facePt(f.face, x, out); return fr.P(q.x, q.z - c.d - FRONT_T); };
}
// Where a front's pull is across the front (x0..x1 from the front's own left edge), and how far it stands out.
const PULL_OUT = 1.0;
function pullSpan(c, f) {
  let pp = null; try { pp = pullPlacement(c, f); } catch (_) {}
  if (!pp) return null;
  const L = Math.max((pp.hw.lengthMM || 0) * MM, 1), w = pp.hw.ccMM && pp.vertical ? 0.45 : L;
  return { x0: pp.x - w / 2, x1: pp.x + w / 2 };
}
// A door open to angle a, in plan: the door, plus its pull as a small block. It turns on its front hinge-side corner
// (an overlay hinge), so at 90° it stands in front of its own cabinet side and two doors hinged next to each other both clear.
function doorPoly(c, f, a, fr) {
  const R = f.hinge === 'R', hx = R ? f.x1 : f.x0, fw = f.x1 - f.x0, dir = R ? -1 : 1, L = frontLocal(c, f, fr), ps = pullSpan(c, f);
  const at = (s, t) => L(hx + dir * (s * Math.cos(a) + t * Math.sin(a)), FRONT_T + s * Math.sin(a) - t * Math.cos(a));
  const out = [[at(0, 0), at(fw, 0), at(fw, FRONT_T), at(0, FRONT_T)]];
  if (ps) { const s0 = R ? f.x1 - (f.x0 + ps.x1) : ps.x0, s1 = R ? f.x1 - (f.x0 + ps.x0) : ps.x1; out.push([at(s0, -PULL_OUT), at(s1, -PULL_OUT), at(s1, 0), at(s0, 0)]); }
  return out;
}
// A drawer pulled out by tr, in plan: the part that sticks out past the cabinet with its front, plus its pull.
function drawerPoly(c, f, tr, fr) {
  const e = 0.05, L = frontLocal(c, f, fr), o = FRONT_T + tr, ps = pullSpan(c, f);
  const out = [[L(f.x0 + e, e), L(f.x1 - e, e), L(f.x1 - e, o), L(f.x0 + e, o)]];
  if (ps) out.push([L(f.x0 + ps.x0, o), L(f.x0 + ps.x1, o), L(f.x0 + ps.x1, o + PULL_OUT), L(f.x0 + ps.x0, o + PULL_OUT)]);
  return out;
}
// A cabinet's footprint in plan; a 45° or 90° corner is its real angled or L shape, not the box around it.
function cabPlanPoly(o) {
  if (typeof angledCorner === 'function' && angledCorner(o)) { const fr = frontFrame(o); if (fr) return cornerTop(o).pts.map(q => fr.P(q.x, q.y - o.d - FRONT_T)); }
  return cabPoly(o);
}
// Things a front of cabinet c between heights z0 and z1 can't go into: other cabinets, other walls, end caps.
function fixedObstacles(c, z0, z1) {
  const w = wall(c.wall), over = (a0, a1) => a0 < z1 - 0.25 && a1 > z0 + 0.25, obs = [];
  S.cabinets.forEach(o => { if (o.id === c.id) return; const poly = cabPlanPoly(o); if (poly && over(o.elev || 0, (o.elev || 0) + o.h)) obs.push(poly); });
  S.walls.forEach(ww => { if (ww !== w) { const gg = wg(ww), t = ww.thick / 2; obs.push([wallPt(ww, gg, 1, 0, -t), wallPt(ww, gg, 1, gg.L, -t), wallPt(ww, gg, 1, gg.L, t), wallPt(ww, gg, 1, 0, t)]); }
    // End caps are short walls too, on any wall, including the one this cabinet hangs on.
    capsOf(ww).forEach(cp => { if (cp.height === undefined || over(0, cp.height)) obs.push(capPoly(ww, cp)); }); });
  return obs;
}
// Two doors hinged on the same line, swinging away from each other (side-by-side cabinets), would cross past square,
// so each stops at 90°.
function pairCap(c, f) {
  const R = f.hinge === 'R', hx = R ? f.x1 : f.x0, z0 = (c.elev || 0) + f.z0, z1 = (c.elev || 0) + f.z1, over = (a0, a1) => a0 < z1 - 0.25 && a1 > z0 + 0.25;
  const wx = (cc, x) => cc.side === 1 ? cc.off + x : cc.off + cc.w - x, lean = (cc, ff) => (ff.hinge === 'R' ? -1 : 1) * cc.side;
  const hxW = wx(c, hx), myLean = lean(c, f);
  return S.cabinets.some(o => o.id !== c.id && o.wall === c.wall && o.side === c.side && Math.abs((o.outset || 0) + o.d - (c.outset || 0) - c.d) < 3
    && computeFronts(o).some(d => d.type === 'door' && over((o.elev || 0) + d.z0, (o.elev || 0) + d.z1) && lean(o, d) === -myLean && Math.abs(wx(o, d.hinge === 'R' ? d.x1 : d.x0) - hxW) < 2.5)) ? Math.PI / 2 - 0.02 : DOOR_MAX;
}
// Opens one front as far as it goes before it meets a fixed obstacle or a front already placed.
// Doors: the swing in radians. Drawers: how far out it slides.
function openOne(c, f, placed, cap, shutAll) {
  const fr = frontFrame(c); if (!fr) return { v: f.type === 'door' ? DOOR_MAX : drawerTravel(c) };
  const z0 = (c.elev || 0) + f.z0, z1 = (c.elev || 0) + f.z1;
  // A pocket door ends up inside its own cabinet, so once open it is in nobody's way (pocket.js).
  if (f.type === 'door' && typeof pocketDoor === 'function' && pocketDoor(c, f)) return { v: Math.PI / 2, poly: [], z0, z1 };
  // Cabinets, walls and fronts that stay shut are still; anything one of them already touches with this front shut
  // (a corner door's edge over the next front, say) is how the cabinets were placed, not this front running into it.
  const near = placed.filter(p => !(p.c.id === c.id && frontKey3(p.c, p.f) === frontKey3(c, f)) && p.z0 < z1 - 0.25 && p.z1 > z0 + 0.25);
  const still = fixedObstacles(c, z0, z1).concat(near.filter(p => p.v <= 0).reduce((a, p) => a.concat(p.poly), []))
    .concat((shutAll || []).filter(q => q.key !== frontKey3(c, f) && q.z0 < z1 - 0.25 && q.z1 > z0 + 0.25).reduce((a, q) => a.concat(q.poly), []));
  const moving = near.filter(p => p.v > 0).reduce((a, p) => a.concat(p.poly), []);
  const shut = f.type === 'door' ? doorPoly(c, f, 0, fr) : drawerPoly(c, f, 0, fr);
  const obs = still.filter(o => !shut.some(poly => polysHit(poly, o))).concat(moving);
  const hit = polys => polys.some(poly => obs.some(o => polysHit(poly, o)));
  if (f.type === 'door') {
    const max = Math.min(f.face ? DOOR_MAX : pairCap(c, f), cap || DOOR_MAX); let v = max;
    for (let a = 0.04; a <= max + 1e-9; a += 0.02) if (hit(doorPoly(c, f, a, fr))) { v = Math.max(0, a - 0.06); break; }
    return { v, poly: doorPoly(c, f, v, fr), z0, z1 };
  }
  // A drawer on a corner's angled face doesn't slide out in 3D; it stays shut but still blocks.
  const full = f.face ? 0 : drawerTravel(c); let v = full;
  if (full && hit(drawerPoly(c, f, full, fr))) { v = 0; for (let t = 0.25; t <= full; t += 0.25) { if (hit(drawerPoly(c, f, t, fr))) break; v = t; } }
  return { v, poly: drawerPoly(c, f, v, fr), z0, z1 };
}
const frontKey3 = (c, f) => c.id + ':' + (f.cell !== undefined ? f.cell : f.row) + ':' + f.idx + ':' + f.type;
let openCache = null;
function clearDoorLimits() { openCache = null; }
// Every open cabinet's doors and drawers, worked out together so none of them run into each other.
// First every door goes to 90° at most and every drawer slides out, bigger fronts first: a smaller one that would hit
// them opens only as far as it can. Then doors swing on past 90° where nothing is in the way.
function openSolve() {
  if (openCache) return openCache;
  const items = [];
  S.cabinets.forEach((c, ci) => { if (!ui.open[c.id]) return; computeFronts(c).forEach(f => { if (f.type === 'door' || f.type === 'drawer') items.push({ c, f, ci, area: (f.x1 - f.x0) * (f.z1 - f.z0) }); }); });
  items.sort((a, b) => b.area - a.area || a.ci - b.ci || a.f.row - b.f.row || a.f.idx - b.f.idx || (a.f.x0 - b.f.x0));
  // Every front in the room, shut, with its pull: a door or drawer can't swing or slide into one that stays closed.
  const shutAll = [];
  S.cabinets.forEach(c => { const fr = frontFrame(c); if (!fr) return; computeFronts(c).forEach(f => { if (f.type !== 'door' && f.type !== 'drawer' && f.type !== 'false') return;
    const z0 = (c.elev || 0) + f.z0, z1 = (c.elev || 0) + f.z1;
    shutAll.push({ key: frontKey3(c, f), z0, z1, poly: f.type === 'door' ? doorPoly(c, f, 0, fr) : drawerPoly(c, f, 0, fr) }); }); });
  const placed = [], byKey = {}, SQUARE = Math.PI / 2 - 0.02;
  items.forEach(it => { const r = openOne(it.c, it.f, placed, SQUARE, shutAll); const p = { c: it.c, f: it.f, ...r }; if (r.poly) placed.push(p); byKey[frontKey3(it.c, it.f)] = p; });
  placed.forEach(p => {
    if (p.f.type !== 'door' || p.v < SQUARE - 1e-6) return;
    const r = openOne(p.c, p.f, placed, 0, shutAll); if (r.v > p.v) Object.assign(p, r);
  });
  return (openCache = { placed, byKey, shutAll });
}
// How far one front opens: looked up when its cabinet is open, else worked out as if it opened last (closing animation).
// A front that is closing keeps the amount it had while open, so it slides or swings back the way it went out
// (a drawer held back by a bigger one doesn't jump out to full travel and close through it).
const lastOpen = {};
function openAmount(c, f) {
  const sol = openSolve(), k = frontKey3(c, f), hit = sol.byKey[k];
  if (hit) { if (ui.open[c.id]) lastOpen[k] = hit.v; else if (k in lastOpen) return lastOpen[k]; return hit.v; }
  if (!ui.open[c.id] && k in lastOpen) return lastOpen[k];
  const r = openOne(c, f, sol.placed, Math.PI / 2 - 0.02, sol.shutAll); sol.byKey[k] = { c, f, ...r }; return r.v;
}
// The widest a door can swing (radians, up to 1.75) before it runs into a wall, a cabinet that sticks out past it,
// or another open door or drawer.
const doorLimit = (c, f) => openAmount(c, f);
// How far a drawer slides out, after anything in its way.
const frontTravel = (c, f) => openAmount(c, f);
// Which door style a front uses, after the template's frame-height rule.
// Top, middle and bottom drawer fronts can each have their own style on the door template. One drawer is the top one.
function drawerSlotStyle(c, f, dt) {
  if (!dt.drawerTop && !dt.drawerBot) return dt.drawer;
  const dr = computeFronts(c).filter(x => x.type === 'drawer').sort((a, b) => b.z1 - a.z1), i = dr.findIndex(x => Math.abs(x.z0 - f.z0) < 0.01 && Math.abs(x.x0 - f.x0) < 0.01);
  const topZ = dr.length ? dr[0].z1 : 0, botZ = dr.length ? dr[dr.length - 1].z0 : 0;
  if (i >= 0 && Math.abs(f.z1 - topZ) < 0.01) return dt.drawerTop || dt.drawer;
  if (i >= 0 && dr.length > 1 && Math.abs(f.z0 - botZ) < 0.01) return dt.drawerBot || dt.drawer;
  return dt.drawer;
}
// Follows a style's size rules to its replacement, a few hops at most so two styles that point at each other stop.
function sizeRuleStyle(ds, fw, fh) {
  const out = d => { const n = k => d[k] === '' || d[k] == null ? NaN : +d[k]; return fw < n('minW') || fw > n('maxW') || fh < n('minH') || fh > n('maxH'); };
  for (let i = 0; i < 4 && ds.swap && ds.swap !== ds.id && S.doorStyles.some(d => d.id === ds.swap) && out(ds); i++) ds = doorStyle(ds.swap);
  return ds;
}
// The style a front gets before size rules: an opening can pick its own style; otherwise the door template decides.
function frontBaseStyle(c, f, dt) {
  dt = dt || doorTpl(cabSet(c, 'doorT'));
  const ty = f.was || f.type;
  return doorStyle(f.style && S.doorStyles.some(d => d.id === f.style) ? f.style : ty === 'door' ? (c.cat === 'Wall' && dt.wallDoor) || dt.door : ty === 'drawer' ? drawerSlotStyle(c, f, dt) : dt.falseFront);
}
function frontStyle(c, f) {
  const dt = doorTpl(cabSet(c, 'doorT'));
  let ds = frontBaseStyle(c, f, dt);
  const fh = f.z1 - f.z0, fw = f.x1 - f.x0;
  ds = withFinish(sizeRuleStyle(ds, fw, fh), c);
  const { nR, nS, mrs, mss } = doorMids(ds, fw, fh), sum = a => a.reduce((x, y) => x + y, 0);
  const mp = +ds.minPanel > 0 ? +ds.minPanel : 2, needH = 2 * ds.rail + sum(mrs) + (nR + 1) * mp, needW = 2 * ds.stile + sum(mss) + (nS + 1) * mp;
  const framed = ds.type !== 'slab' && fh >= Math.max(needH, (f.was || f.type) === 'door' ? 0 : dt.minFrameHeight || 0) && fw >= needW;
  return { ds, framed, dt };
}
// Frame members and panel openings of one front, in front-local inches (x from the left edge, z up from the bottom).
// A slab, or a front too small for its frame, is one field covering the whole face.
function doorLayout(ds, fw, fh, framed) {
  if (!framed) return { frame: [], fields: [{ x0: 0, z0: 0, x1: fw, z1: fh, i: 0, pt: ds.panelType }] };
  const S = ds.stile, R = ds.rail, { nR, nS, mrs, mss } = doorMids(ds, fw, fh), sum = a => a.reduce((x, y) => x + y, 0);
  const frame = [
    { kind: 'stile', x0: 0, z0: 0, x1: S, z1: fh }, { kind: 'stile', x0: fw - S, z0: 0, x1: fw, z1: fh },
    { kind: 'rail', x0: S, z0: 0, x1: fw - S, z1: R }, { kind: 'rail', x0: S, z0: fh - R, x1: fw - S, z1: fh },
  ];
  const ws = splitSizes(ds.splitW, nS + 1, fw - 2 * S - sum(mss), fw, fh), hs = splitSizes(ds.splitH, nR + 1, fh - 2 * R - sum(mrs), fw, fh), fields = [];
  const cols = [], rows = []; let x = S, z = fh - R;
  ws.forEach((w, i) => { cols.push([x, x + w]); x += w + (mss[i] || 0); });
  hs.forEach((h, i) => { rows.push([z - h, z]); z -= h + (mrs[i] || 0); });
  for (let i = 0; i < nS; i++) frame.push({ kind: 'midstile', i, x0: cols[i][1], z0: R, x1: cols[i][1] + mss[i], z1: fh - R });
  // Each opening is numbered across then down from the top left, and can swap its panel for another kind.
  cols.forEach(([x0, x1], ci) => {
    for (let ri = 0; ri < nR; ri++) frame.push({ kind: 'midrail', i: ri, x0, z0: rows[ri][0] - mrs[ri], x1, z1: rows[ri][0] });
    rows.forEach(([z0, z1], ri) => { const i = ri * cols.length + ci; fields.push({ x0, z0, x1, z1, i, pt: twoPt(ds, (ds.fieldPanels || [])[i] || ds.panelType) }); });
  });
  fields.sort((a, b) => a.i - b.i);
  return { frame, fields };
}
// Names a door formula can use: W and H are the door's width and height, plus the job variables.
const doorVars = (fw, fh) => k => k === 'W' ? fw : k === 'H' ? fh : (v => v ? +v.v : undefined)((S.job.vars || []).find(x => x.k === k));
const MAX_MIDS = 12;
// Mid rails and mid stiles of one door: how many (a number, or a formula like round(H/12) - 1 that wins when set)
// and each one's width (its own size or formula, else the style's mid rail or mid stile width). Top to bottom, left to right.
function doorMids(ds, fw, fh) {
  const vars = doorVars(fw, fh);
  const count = (f, n) => { const t = String(f ?? '').trim(); if (t) { try { const v = Math.round(evalExpr(t, vars)); if (isFinite(v)) return Math.max(0, Math.min(MAX_MIDS, v)); } catch (_) {} } return Math.max(0, Math.min(MAX_MIDS, n | 0)); };
  const widths = (list, n, dflt) => Array.from({ length: n }, (_, i) => { const t = String((list || [])[i] ?? '').trim(); if (t) { try { const v = evalExpr(t, vars); if (v > 0) return v; } catch (_) {} } return dflt; });
  const nR = count(ds.midRailsF, ds.midRails), nS = count(ds.midStilesF, ds.midStiles);
  return { nR, nS, mrs: widths(ds.midRailWs, nR, ds.midRailW || ds.rail), mss: widths(ds.midStileWs, nS, ds.midStileW || ds.stile) };
}
// Opening sizes across one direction of a split door. Each entry is a size or a formula of W and H (the door's width
// and height) or a job variable; blank or * shares what is left. With every entry set, the last one takes the rest.
function splitSizes(list, n, space, fw, fh) {
  const vars = doorVars(fw, fh);
  const vals = Array.from({ length: n }, (_, i) => {
    const t = String((list || [])[i] ?? '').trim(); if (!t || t === '*') return null;
    try { const v = evalExpr(t, vars); return v > 0 ? v : null; } catch (_) { return null; }
  });
  if (!vals.includes(null)) vals[n - 1] = null;
  const fixed = vals.reduce((a, v) => a + (v || 0), 0), stars = vals.filter(v => v === null).length;
  if (fixed > space) return vals.map(v => v === null ? 0 : v * space / fixed);
  return vals.map(v => v === null ? (space - fixed) / stars : v);
}
// Panel design lines inside one field: V-grooves, beadboard or an X brace, as {x1, z1, x2, z2}.
function designLines(ds, fl) {
  const w = fl.x1 - fl.x0, h = fl.z1 - fl.z0, out = [];
  if (ds.design === 'xbrace') return [{ x1: fl.x0, z1: fl.z0, x2: fl.x1, z2: fl.z1 }, { x1: fl.x0, z1: fl.z1, x2: fl.x1, z2: fl.z0 }];
  if (ds.design === 'vgroove' || ds.design === 'beadboard') {
    const n = Math.max(1, Math.round(w / Math.max(ds.grooveSpacing, 0.5))) - 1;
    for (let i = 1; i <= n; i++) { const x = fl.x0 + w * i / (n + 1); out.push({ x1: x, z1: fl.z0, x2: x, z2: fl.z1 }); }
  }
  if (ds.design === 'hgroove') {
    const n = Math.max(1, Math.round(h / Math.max(ds.grooveSpacing, 0.5))) - 1;
    for (let i = 1; i <= n; i++) { const z = fl.z0 + h * i / (n + 1); out.push({ x1: fl.x0, z1: z, x2: fl.x1, z2: z }); }
  }
  return out;
}
const PANEL_FIELD = t => t === 'flat' || t === 'raised';
// A two-piece door drops a separate panel into every flat or raised opening.
const twoPt = (ds, pt) => ds.type === 'twopiece' && PANEL_FIELD(pt) ? 'insert' : pt;
// Pull position on a front, in front-local inches: x from the left edge, z up from the bottom edge.
function pullPlacement(c, f) {
  // A false front gets a pull only when its row asks for one (glued-on drawer fronts that should look like drawers).
  if (f.type !== 'door' && f.type !== 'drawer' && !(f.type === 'false' && f.pull)) return null;
  const dt = doorTpl(cabSet(c, 'doorT'));
  const asDoor = (f.was || f.type) === 'door';
  const p = hwPick(cabSet(c, 'pull') || (asDoor ? dt.pull : dt.drawerPull), 'pull'); if (!p) return null;
  const fh = f.z1 - f.z0, fw = f.x1 - f.x0, len = p.lengthMM * MM;
  if (!asDoor) {
    const z = dt.drawerPullFromTop > 0 ? fh - dt.drawerPullFromTop : fh / 2;
    return { hw: p, x: fw / 2, z, vertical: false };
  }
  const x = f.hinge === 'L' ? fw - dt.pullFromEdge : dt.pullFromEdge;
  const lo = dt.pullFromEnd + len / 2, hi = fh - dt.pullFromEnd - len / 2;
  let z;
  if (c.cat === 'Wall') z = lo;
  else if (c.cat === 'Tall') z = 40 - c.elev - f.z0;
  else z = hi;
  z = Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), z));
  return { hw: p, x, z, vertical: true };
}
// Pull holes go right through the front, so their depth is the front material's thickness (T).
function pullHoles(pp, T) {
  const cc = pp.hw.ccMM * MM, out = [];
  if (!cc) out.push({ x: pp.z, y: pp.x });
  else if (pp.vertical) out.push({ x: pp.z - cc / 2, y: pp.x }, { x: pp.z + cc / 2, y: pp.x });
  else out.push({ x: pp.z, y: pp.x - cc / 2 }, { x: pp.z, y: pp.x + cc / 2 });
  return out.map(h => ({ type: 'bore', x: h.x, y: h.y, dia: pp.hw.holeDiaMM * MM, depth: T, face: 'front', through: true, why: 'pull' }));
}

/* ---------- Slide geometry ---------- */
function nominalFor(sl, inD) {
  const ls = [...sl.lengths].sort((a, b) => b - a);
  // A runner with its own minimum inside depths (from the maker's sheet) uses those.
  const need = l => sl.minDepthMM && sl.minDepthMM[l] ? sl.minDepthMM[l] * MM : l + sl.rearClearMM * MM;
  return ls.find(l => need(l) <= inD + 1e-6) || null;
}
// "Blum TANDEM 563H 21" 563H5330B (pair)": the part number goes on the hardware list when the runner has one.
const slideBomName = (sl, nominal) => `${sl.name} ${nominal}"${sl.partNos && sl.partNos[nominal] ? ' ' + sl.partNos[nominal] : ''} (pair)`;
function slideHoleY(sl, nominal, h) {
  const Lmm = nominal * 25.4, first = 37, pitch = 32;
  const last = first + pitch * Math.floor((Lmm - first - 25) / pitch);
  let ymm;
  if (h.ref === 'set') { const set = (sl.holeSets || {})[nominal], k = Math.max(1, h.i | 0) - 1; if (!set || set[k] === undefined) return null; ymm = set[k] + (+h.y || 0); }
  else if (h.ref === 'front') ymm = h.y;
  else if (h.ref === 'slideEnd') ymm = Lmm - h.y;
  else if (h.ref === 'mid32') ymm = first + pitch * Math.round(((first + last) / 2 - first) / pitch) + h.y;
  else ymm = last + h.y;
  return ymm * MM;
}

/* ---------- Interior ---------- */
// Where shelves and inserts sit inside the box, in cabinet coordinates (x from the left outside, z up from the cabinet bottom).
function interiorLayout(c, p, fronts) {
  p = p || effParams(c); fronts = fronts || computeFronts(c, p);
  const cm = mat(cabMatT(cabSet(c, 'cabMatT')).carcass) || S.materials[0], t = cm.thick;
  const tk = hasToe(c) ? p.toeKickHeight : 0, zIn0 = tk + t, zIn1 = c.h - t, inW = c.w - 2 * t;
  // A microwave opening holds the microwave, not shelves or inserts; the doors over one start on its fixed shelf.
  const mwRow = i => typeof mwSpot === 'function' && !!mwSpot(c, i);
  const doorZones = fronts.filter(f => (f.type === 'door' || f.type === 'open') && f.idx === 0 && f.cell === undefined && !mwRow(f.row))
    .map(f => Object.assign([Math.max(f.z0, zIn0, mwRow(f.row + 1) ? f.z0 - p.frontGap / 2 + t : -1e9), Math.min(f.z1, zIn1)], { row: f.row }));
  const zones = doorZones.length ? doorZones : (fronts.length ? [] : [[zIn0, zIn1]]);
  const low = zones.length ? zones[zones.length - 1] : null, ins = falseOn(c) ? [] : c.inserts || [];
  const hasDoors = fronts.some(f => f.type === 'door');
  // Pocket doors: each pocket (slot + pocket panel) takes its width out of the inside (pocket.js).
  const pk = typeof pocketInfo === 'function' ? pocketInfo(c, p, fronts, t, zIn0, zIn1) : null;
  const out = { t, zIn0, zIn1, inW: pk ? inW - pk.wL - pk.wR : inW, x0: t + (pk ? pk.wL : 0), pocket: pk, zones, low, spacer: Math.max(hasDoors && !faceFrame(c) ? t : 0, ffOverhang(c, t)), divX: null, rollouts: [], trays: [], bins: [], lazy: [], pulls: [], bom: [] };
  // An insert goes in the door opening it names (it.row), or else the bottom one.
  const used = new Set();
  ins.forEach(it => {
    const low = (it.row !== undefined && it.row !== '' && zones.find(z => z.row === +it.row)) || out.low;
    // A product made in the insert designer builds its own parts (dpBuild); it is still drawn like its kind.
    const designed = typeof intItemOf === 'function' && ((intItemOf(it) || {}).parts || []).length > 0;
    // These fill their opening top to bottom, so it gets no adjustable shelves (tray dividers would have to go through them).
    if (SHELF_BLOCKERS.includes(it.type) && low) used.add(low);
    if (it.type === 'divider') out.divX = it.x > 0 ? Math.min(c.w - t * 1.5, t + it.x) : c.w / 2;
    else if (['rollout', 'rotray', 'roshelf'].includes(it.type) && low) {
      // Roll-out trays and shelves are roll-outs with low sides (a lip on a shelf).
      const label = { rollout: 'Roll-out', rotray: 'Roll-out tray', roshelf: 'Roll-out shelf' }[it.type];
      const n = Math.max(1, it.n | 0), h = it.h > 0 ? it.h : { rollout: 4, rotray: 2.5, roshelf: 1.5 }[it.type], step = (low[1] - low[0]) / n;
      for (let i = 0; i < n; i++) out.rollouts.push({ z: low[0] + 0.5 + i * step, h: Math.min(h, step - 1), label, designed });
    } else if (it.type === 'traydiv' && low) out.trays.push({ n: Math.max(1, it.n | 0), z0: low[0], z1: low[1], designed });
    else if (it.type === 'trash') { if (low) out.bins.push({ z0: low[0], z1: low[1] }); out.bom.push(it.name || insertType('trash').def.name); }
    else if (it.type === 'lazy') { if (low) out.lazy.push({ z0: low[0], z1: low[1] }); out.bom.push(it.name || insertType('lazy').def.name); }
    else if (it.type === 'pullout') { if (low) out.pulls.push({ z0: low[0], z1: low[1] }); out.bom.push(it.name || insertType('pullout').def.name); }
    else if (it.type === 'other') out.bom.push(it.name || 'Insert');
  });
  out.shelfZones = zones.filter(z => !used.has(z));
  // Shelves set opening by opening (row.shelves) replace the cabinet's single shelf count.
  const rows = c.rows || [];
  out.perRow = rows.some(r => r.shelves !== undefined && r.shelves !== '') ? out.shelfZones.map(z => ({ z, k: Math.max(0, (rows[z.row] || {}).shelves | 0) })) : null;
  // V1: with a minimum shelf spacing, each opening gets as many shelves as keep the gaps at least that tall.
  const gap = +p.shelfMinSep;
  if (!out.perRow && gap > 0) out.perRow = out.shelfZones.map(z => ({ z, k: Math.max(0, Math.floor((z[1] - z[0] - gap) / (gap + t) + 1e-6)) }));
  out.colZones = colZones(c, p, fronts, t, zIn0, zIn1);
  return out;
}
// 0.63.0: the openings behind side-by-side sections that are doors or open: each its own width (side or partition to
// partition) and height, with the adjustable shelves set on that section (leaf.shelves; none set = as many as keep the
// shelf gaps at least the Minimum shelf spacing, else one in a section taller than 20").
function colZones(c, p, fronts, t, zIn0, zIn1) {
  const out = []; if (falseOn(c) || !fronts.some(f => f.cell !== undefined)) return out;
  const rails = caseRails(c, p, fronts, t);
  fronts.filter(f => f.cell !== undefined && f.idx === 0 && (f.type === 'door' || f.type === 'open')).forEach(f => {
    const lf = colLeaf(c, f.cell); if (!lf) return;
    const o = colOpening(c, f, t), [z0, z1] = drawerSpan(c, p, f, Math.max(f.z0, zIn0), Math.min(f.z1, zIn1), t, rails);
    const gap = +p.shelfMinSep, hh = z1 - z0;
    const k = lf.shelves !== undefined && lf.shelves !== '' ? Math.max(0, lf.shelves | 0) : gap > 0 ? Math.max(0, Math.floor((hh - gap) / (gap + t) + 1e-6)) : hh > 20 ? 1 : 0;
    out.push(Object.assign([z0, z1], { row: f.row, cell: f.cell, col: f.col, x0: o.o0, x1: o.o1, k }));
  });
  return out;
}
// Mozaik's section letters: A, B, C... over every opening, top row first, side-by-side sections left to right, each
// one's stack top to bottom. Keyed by the row index (plain rows) or the cell key.
function faceLetters(c) {
  const out = {}; let n = 0;
  const L = i => i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + i % 26);
  (c.rows || []).forEach((r, ri) => {
    const cols = rowCols(c, r);
    if (!cols) { out[ri] = L(n++); return; }
    cols.forEach((col, j) => { const sub = Array.isArray(col.rows) && col.rows.length > 1 ? col.rows : null; if (!sub) out[`${ri}.${j}`] = L(n++); else sub.forEach((_, k) => { out[`${ri}.${j}.${k}`] = L(n++); }); });
  });
  return out;
}
// The section a cell key ("row.col" or "row.col.sub") names, or null.
function colLeaf(c, cell) {
  const [ri, j, k] = String(cell).split('.').map(Number), r = (c.rows || [])[ri], col = r && Array.isArray(r.cols) ? r.cols[j] : null;
  if (!col) return null;
  return Number.isFinite(k) ? (col.rows || [])[k] || null : col;
}

// 0.63.0: the adjustable shelves of side-by-side sections: { x0, x1, z (bottom face) } each, spread evenly in the section.
function colShelves(lay) {
  return (lay.colZones || []).flatMap(zn => Array.from({ length: zn.k }, (_, i) => ({ x0: zn.x0, x1: zn.x1, z: zn[0] + (zn[1] - zn[0]) * (i + 1) / (zn.k + 1) })));
}
// Shelf heights (bottom face) spread over the openings shelves can use.
function shelfHeights(lay, n) {
  if (lay.perRow) return lay.perRow.flatMap(({ z, k }) => Array.from({ length: k }, (_, i) => z[0] + (z[1] - z[0]) * (i + 1) / (k + 1)));
  if (!n || !lay.shelfZones.length) return [];
  const z0 = Math.min(...lay.shelfZones.map(z => z[0])), z1 = Math.max(...lay.shelfZones.map(z => z[1])), out = [];
  for (let i = 1; i <= n; i++) { const z = z0 + (z1 - z0) * i / (n + 1); if (lay.shelfZones.some(([a, b]) => z > a + 1 && z < b - 1)) out.push(z); }
  return out;
}

/* ---------- Edgebanding ---------- */
// Which band goes on each edge of a part kind under a part template: { L1: bandId or '', ... }.
function partBands(tpl, kind) {
  const r = (tpl && tpl.rules && tpl.rules[kind]) || {}, out = {};
  EDGE_KEYS.forEach(k => { out[k] = r[k] && edgeband(r[k]) ? r[k] : ''; });
  return out;
}
// Readable list of banded edges, such as "Front" or "All 4" or "Front, Top".
function edgeSummary(kind, band) {
  const on = EDGE_KEYS.filter(k => band[k]);
  if (!on.length) return '';
  if (on.length === 4) return 'All 4';
  const names = partKind(kind).edges; return on.map(k => names[k]).join(', ');
}
const bandLen = p => EDGE_KEYS.reduce((a, k) => a + (p.band && p.band[k] ? (k[0] === 'L' ? p.L : p.W) : 0), 0);

/* ---------- Legs and drawer boxes, shared by the cut list and the 3D ---------- */
// Where the legs stand under a plain cabinet: x from its left outside, y from the front of the box (D deep).
function legLayout(c, p, leg, D) {
  const W = c.w, xl = endFinished(c, 'L') ? +leg.inFin : +leg.inUnfin, xr = W - (endFinished(c, 'R') ? +leg.inFin : +leg.inUnfin), span = xr - xl;
  const per = +leg.maxSep > 0 ? Math.ceil(span / +leg.maxSep) + 1 : (p.feetCount | 0) > 0 ? Math.max(2, Math.ceil((p.feetCount | 0) / (leg.noBack ? 1 : 2))) : W > 36 ? 3 : 2;
  return { xs: Array.from({ length: per }, (_, i) => xl + span * i / Math.max(1, per - 1)), ys: leg.noBack ? [+leg.inToe] : [+leg.inToe, D - +leg.inBack] };
}
const cabLeg = () => { const l = hw(roomSet('leg')) || S.hardware.find(h => h.feet); return l && l.kind === 'leg' ? l : null; };
// The drawer box behind a drawer front, as it is cut: x0/x1 across the cabinet outside, z up from the cabinet bottom,
// d long (the runner length), st side and bt bottom thickness, rec the bottom's recess. Null when no runner fits.
// Case parts between front rows, as Ayden's Mozaik library (2026 Larkul) builds them (0.55.44):
// - a drawer stretcher under the top drawer of a drawer stack when more fronts sit below it, centred on the gap between
//   the two fronts (Mozaik "Drawer Stretcher Alignment"), the top stretcher's width deep, at the front;
// - a fixed shelf over a drawer stack when a door or opening sits above it (Mozaik's F.Shelf), and under any row set to
//   "Fixed shelf under it". z is each part's centre height. The automatic ones can be turned off (drawerRails).
// Face frame cabinets (the frame's rails do this), angled and blind corners (the blind panel is in the way) and shaped
// cabinets get only the fixed shelves asked for by hand.
function caseRails(c, p, fronts, t) {
  p = p || effParams(c); fronts = fronts || computeFronts(c, p);
  if (t === undefined) t = (mat(cabMatT(cabSet(c, 'cabMatT')).carcass) || S.materials[0]).thick;
  const out = { stretchers: [], shelves: [] }, rows = c.rows || [];
  if (c.moz && typeof isMoz === 'function' && isMoz(c)) return out;
  if (c.made && typeof madeDef === 'function' && madeDef(c)) return out;
  // A row split side by side (rowCols) counts as one opening as tall as the row.
  const rz = fronts.rowZ || {}, first = i => rowCols(c, rows[i]) && rz[i] ? { z0: rz[i][0], z1: rz[i][1] } : fronts.find(f => f.row === i && !f.face);
  const tk = hasToe(c) ? p.toeKickHeight : 0, zIn0 = tk + t, zIn1 = c.h - t;
  const auto = p.drawerRails !== 'off' && !faceFrame(c) && !angledCorner(c) && !hasCabShape(c) && !(cabTopShape(c) || {}).edges;
  const solid = !faceFrame(c) && !angledCorner(c) && !hasCabShape(c) && !(cabTopShape(c) || {}).edges;
  rows.forEach((r, i) => {
    const f = first(i), nx = rows[i + 1]; if (!f) return;
    // 0.63.0: a side-by-side row has a fixed shelf over and under it (where another row is), so its partitions stand on
    // something and the sections behind them close off, as Mozaik's automatic interior does.
    if (nx && solid && (rowCols(c, r) || rowCols(c, nx))) {
      const b = first(i + 1);
      if (b) out.shelves.push({ row: i, auto: true, cols: true, z: r3(Math.min(zIn1 - t, Math.max(zIn0 + t, (f.z0 + b.z1) / 2))) });
      return;
    }
    if (rowCols(c, r)) return;
    // A microwave opening always has its fixed shelf, placed as Ayden's Mozaik library does (mwShelfZ in bidprod.js).
    const mz = typeof mwShelfZ === 'function' ? mwShelfZ(c, p, i, f, t) : null;
    if (nx && (mz !== null || r.fixShelf || (auto && r.type !== 'drawer' && nx.type === 'drawer'))) out.shelves.push({ row: i, auto: mz === null && !r.fixShelf, ...(mz !== null ? { mw: true } : {}), z: r3(Math.min(zIn1 - t, Math.max(zIn0 + t, mz !== null ? mz : f.z0 - t / 2))) });
    if (auto && r.type === 'drawer' && !(i > 0 && rows[i - 1].type === 'drawer' && !rowCols(c, rows[i - 1])) && nx) {
      const b = first(i + 1); if (b) out.stretchers.push({ row: i, z: r3(Math.min(zIn1 - t, Math.max(zIn0 + t, (f.z0 + b.z1) / 2))) });
    }
  });
  return out;
}
// A blind corner (no face frame), as Ayden's Mozaik library builds it (0.55.47, Ayden 2026-11-13): an inside panel stands
// at the blind edge, just behind the edge of the doors like a cabinet side, so a door hinged on that edge gets its plates
// on it (hinged the other way they go on the cabinet side). The blind panel goes on the front, beside the doors.
// x0/x1 are the inside panel's faces, o0/o1 the opening beside it.
// A sink base stands its front stretcher up as a 7" apron behind the fronts, as Ayden's Mozaik library does (Ayden
// 2026-11-18). Farm house, apron and vanity sinks keep the flat stretcher like there, and so does a sink with real drawers on top. Returns the apron height, or 0.
function sinkApronH(c, p) {
  p = p || effParams(c); const h = +p.sinkApron || 0;
  if (h <= 0 || c.cat !== 'Base' || (c.construction || {}).top !== 'stretchers' || faceFrame(c) || angledCorner(c) || blindCorner(c) || hasCabShape(c) || (cabTopShape(c) || {}).edges) return 0;
  const lib = [...(S.library || []), ...(typeof AMERICAN_LIB !== 'undefined' ? AMERICAN_LIB : [])].find(l => l.id === c.libId) || {};
  const txt = [c.name, lib.name, lib.folder, lib.desc].join(' ');
  // Real drawers at the top (a drawer sink) keep the flat stretcher: the apron would stand in front of them.
  if (((c.rows || [])[0] || {}).type === 'drawer') return 0;
  return /sink/i.test(txt) && !/farm|apron|vanity/i.test(txt) ? Math.min(h, c.h / 2) : 0;
}
// 0.62.6 (Ayden 2026-11-24, Argil farm sink: "stretcher in top of cabinet with sink that covers the front"): under an apron
// (farm house) sink that drops into the cabinet, the front stretcher comes down to just under the sink's apron, on top of
// the fronts, so the sink's face shows and the sink sits on it. Returns its centre height up from the cabinet bottom, or
// null when the stretcher stays at the top (no apron sink, or the sink sits above the cabinet).
function apronStretcherZ(c, p, t) {
  if (c.cat !== 'Base' || (c.construction || {}).top !== 'stretchers' || typeof apronSinkOn !== 'function') return null;
  const f = apronSinkOn(c); if (!f) return null;
  const top = ((typeof apronTop === 'function' && apronTop(c)) || c.elev + c.h) - c.elev, bot = top - (+f.h || 0);
  if (!(bot < c.h - t / 2 - 0.01)) return null;
  const tk = hasToe(c) ? (p || effParams(c)).toeKickHeight : 0;
  return r3(Math.max(tk + 2 * t, bot - t / 2));
}
// The rear stretcher runs out to the back edge with the back in a groove in it (Ayden 2026-11-18, like Mozaik), when the
// back sits inside its width. Returns its front edge (inches from the cabinet front) and the groove, or null.
function rearStretcherAt(p, D, backY, bt) {
  const sw = p.stretcherWidth; if (!(D - backY < sw - 0.25)) return null;
  return { y0: r3(D - sw), y1: D, groove: r3(backY + bt / 2 - (D - sw)) };
}
function blindPart(c, p, t) {
  if (!blindCorner(c) || faceFrame(c)) return null;
  p = p || effParams(c); const bw = blindWidth(c), g = p.frontGap, sr = p.frontSideReveal, W = c.w;
  if (cornerSide(c) === 'L') { const x0 = r3(bw + g - sr); return { side: 'L', x0, x1: r3(x0 + t), o0: r3(x0 + t), o1: r3(W - t) }; }
  const x1 = r3(W - bw - g + sr); return { side: 'R', x0: r3(x1 - t), x1, o0: t, o1: r3(x1 - t) };
}
// The inside panel's pieces: one between each pair of the bottom, drawer stretchers and the top (x = its left face).
function blindPieces(c, p, t, rails) {
  const bp = blindPart(c, p, t); if (!bp) return [];
  const tk = hasToe(c) ? p.toeKickHeight : 0, out = [];
  const cuts = [tk + t, ...rails.stretchers.flatMap(q => [r3(q.z - t / 2), r3(q.z + t / 2)]), c.h - t].sort((a, b) => a - b);
  for (let i = 0; i + 1 < cuts.length; i += 2) if (cuts[i + 1] - cuts[i] > 0.5) out.push({ x: bp.x0, z0: r3(cuts[i]), z1: r3(cuts[i + 1]) });
  return out;
}
// The height a drawer's box can use: its front, inside the cabinet, between the stretchers and fixed shelves around it.
function drawerSpan(c, p, f, z0, z1, t, rails) {
  [...rails.stretchers, ...rails.shelves].forEach(q => {
    if (q.z < f.z0 - t || q.z > f.z1 + t) return;
    if (q.z < (f.z0 + f.z1) / 2) z0 = Math.max(z0, q.z + t / 2); else z1 = Math.min(z1, q.z - t / 2);
  });
  return [z0, z1];
}
// Partitions between side-by-side drawers (Mozaik's Partition): one between each pair, the carcass thickness, as deep as the
// inside, from the rail or bottom under the row to the top or rail over it. The drawer boxes already fit openings this
// thick apart (drawerBoxAt). Only where caseRails runs, and only rows with something solid above and below.
function drawerPartitions(c, p, fronts, t, rails) {
  const out = []; if (faceFrame(c) || angledCorner(c) || hasCabShape(c) || (cabTopShape(c) || {}).edges) return out;
  if (p.drawerRails === 'off' && !(c.rows || []).some(r => rowCols(c, r))) return out;
  // A blind corner's drawers share the opening beside its inside panel (blindPart).
  const bp = blindPart(c, p, t), tk = hasToe(c) ? p.toeKickHeight : 0, zIn0 = tk + t, zIn1 = c.h - t, x0 = bp ? bp.o0 : t, inW = bp ? bp.o1 - bp.o0 : c.w - 2 * t;
  (c.rows || []).forEach((r, i) => {
    // 0.63.0: a partition behind each side-by-side split, as tall as the row between what is over and under it. It is
    // made even with automatic drawer rails off: the sections hinge and run on it.
    const cols = rowCols(c, r), rz = (fronts.rowZ || {})[i];
    if (cols && rz) {
      const [z0, z1] = drawerSpan(c, p, { z0: rz[0], z1: rz[1] }, Math.max(rz[0], zIn0), Math.min(rz[1], zIn1), t, rails);
      const gx = [...new Set(fronts.filter(f => f.row === i && f.gxR !== null && f.gxR !== undefined).map(f => r3(f.gxR)))].sort((a, b) => a - b);
      gx.forEach((g, k) => out.push({ row: i, k: k + 1, cols: true, x: r3(g - t / 2), z0: r3(z0), z1: r3(z1) }));
      return;
    }
    if (p.drawerRails === 'off') return;
    const fs = fronts.filter(f => f.row === i && f.type === 'drawer' && !f.face); if (r.type !== 'drawer' || fs.length < 2) return;
    const f = fs[0], [z0, z1] = drawerSpan(c, p, f, Math.max(f.z0, zIn0), Math.min(f.z1, zIn1), t, rails);
    const lo = z0 > f.z0 + 1e-6 || f.z0 - zIn0 < 1, hi = z1 < f.z1 - 1e-6 || zIn1 - f.z1 < 1;
    if (!lo || !hi) return;
    const n = fs.length, openW = (inW - (n - 1) * t) / n;
    for (let k = 1; k < n; k++) out.push({ row: i, k, x: r3(x0 + k * openW + (k - 1) * t), z0: r3(lo && z0 > f.z0 + 1e-6 ? z0 : zIn0), z1: r3(hi && z1 < f.z1 - 1e-6 ? z1 : zIn1) });
  });
  return out;
}
function drawerBoxAt(c, p, f) {
  const sl = hwPick(cabSet(c, 'slide'), 'slide'); if (!sl || f.face) return null;
  const mt = cabMatT(cabSet(c, 'cabMatT')), dmt = drawerMatT(cabSet(c, 'drawerMatT'));
  const cm = mat(mt.carcass) || S.materials[0], t = cm.thick, bm = mat(mt.back) || cm, bt = bm.thick;
  const ffr = faceFrame(c), W = c.w, D = c.d - (ffr ? ffr.thick : 0), tk = hasToe(c) ? p.toeKickHeight : 0, inD = D - p.backInset - bt, inW = W - 2 * t;
  const nominal = nominalFor(sl, inD); if (!nominal) return null;
  const ffOpen = !!(ffr && f.open && !blindCorner(c));
  const [z0, z1] = drawerSpan(c, p, f, Math.max(ffOpen ? f.open.z0 : f.z0, tk + t), Math.min(ffOpen ? f.open.z1 : f.z1, c.h - t), t, caseRails(c, p, null, t));
  const bh =Math.floor(((z1 - z0) - (sl.bottomClearMM + sl.topClearMM) * MM) * 4) / 4; if (bh < 2.5) return null;
  const bwD = blindCorner(c) ? blindWidth(c) : 0, bp = blindPart(c, p, t);
  let ox0, openW;
  if (ffOpen) { ox0 = f.open.x0; openW = f.open.x1 - f.open.x0; }
  else if (f.cell !== undefined) { const o = colOpening(c, f, t); ox0 = o.o0; openW = o.o1 - o.o0; }
  else if (bp) { const n = f.n > 1 ? f.n : 1; openW = (bp.o1 - bp.o0 - (n - 1) * t) / n; ox0 = bp.o0 + (n > 1 ? f.idx : 0) * (openW + t); }
  else if (bwD) { openW = W - t - bwD; ox0 = cornerSide(c) === 'L' ? bwD : t; }
  else if (f.n > 1) { openW = (inW - (f.n - 1) * t) / f.n; ox0 = t + f.idx * (openW + t); }
  else { openW = inW; ox0 = t; }
  const ow = openW - sl.widthDeductMM * MM, x0 = ox0 + (openW - ow) / 2;
  const dm = mat(dmt.sides) || cm, dbm = mat(dmt.bottom) || bm;
  return { x0, x1: x0 + ow, z: z0 + sl.bottomClearMM * MM, h: bh, d: nominal, st: dm.thick, bt: dbm.thick, rec: sl.bottomRecessMM * MM, front: D, side: dm, bottom: dbm, full: !!drawerBoxBuild(dmt, dm.thick, dbm.thick, 0, 0, nominal, ow, bh).type };
}

// How a drawer or roll-out box is built from its drawer material template (DRAWER_BOX_TYPES in core.js): st side and bt bottom
// thickness, bd the bottom dado, rec the runner's bottom recess, len the side length, ow the box outside width, bh its height.
// The standard box keeps its old sizes exactly; the melamine ones have a full-height back and the bottom in all four parts.
function drawerBoxBuild(dmt, st, bt, bd, rec, len, ow, bh) {
  const type = DRAWER_BOX_TYPES.some(t => t.v && t.v === dmt.box) ? dmt.box : '';
  if (!type) return { type, gd: bd, trim: 0, notchW: 0, notchH: 0, backH: bh - rec - bt, botL: r3(len - st + bd - DRAWER_BOTTOM_CLEAR / 2), botW: r3(ow - 2 * st + 2 * bd - DRAWER_BOTTOM_CLEAR) };
  const s12 = type === 'slide12', bl = ow - 2 * st;
  const trim = s12 ? Math.max(0, Math.min(st - 0.25, +dmt.trim >= 0 ? +dmt.trim : 0.125)) : 0, gd = bd + trim;
  const notchW = s12 ? Math.max(0, Math.min(bl / 2 - 0.5, +dmt.notchW > 0 ? +dmt.notchW : 35 * MM)) : 0;
  return { type, gd, trim, notchW, notchH: s12 && notchW > 0 ? rec : 0, backH: bh, botL: r3(len - 2 * st + 2 * gd - DRAWER_BOTTOM_CLEAR), botW: r3(bl + 2 * gd - DRAWER_BOTTOM_CLEAR) };
}
// A drawer back L long and W tall with a notch nw wide and nh tall at each bottom corner, for the runners.
// CNC frame (origin bottom left, y up): the box bottom edge is the L1 edge at y = W, like the groove's y from L1.
function notchedBack(L, W, nw, nh) {
  const P = [[0, 0, 'L2'], [L, 0, 'W2'], [L, W - nh, null], [L - nw, W - nh, null], [L - nw, W, 'L1'], [nw, W, null], [nw, W - nh, null], [0, W - nh, 'W1']];
  const r6 = v => Math.round(v * 1e6) / 1e6;
  return { outline: P.map(([x, y]) => ({ x: r6(x), y: r6(y) })), outlineEdges: P.map(q => q[2]) };
}

/* ---------- Parts ---------- */
function buildParts(c) {
  // Mozaik products (fillers, C mold, hoods...) bring their own parts (js/mozprod.js).
  if (c.moz && typeof isMoz === 'function' && isMoz(c)) { const mb = mozBuildParts(c); return typeof shelfExtras === 'function' ? shelfExtras(c, mb) : mb; }
  if (c.made && typeof madeBuildParts === 'function' && madeDef(c)) return madeBuildParts(c);
  const p = effParams(c), lbl = LBL[c.id] || c.name;
  const mt = cabMatT(cabSet(c, 'cabMatT')), dmt = drawerMatT(cabSet(c, 'drawerMatT'));
  const cm = mat(mt.carcass) || S.materials[0], t = cm.thick;
  const bm = mat(mt.back) || cm, bt = bm.thick, sm = mat(mt.shelf) || cm, tkm = toeMat(c, mt) || cm;
  const pin = hwPick(roomSet('shelfpin'), 'shelfpin'), hg = hwPick(cabSet(c, 'hinge'), 'hinge'), sl = hwPick(cabSet(c, 'slide'), 'slide');
  const hgAll = hg;
  // Room in every groove and dado (Ayden 2026-11-10: a little slop, or a slightly thick sheet won't go in).
  const gcB = Math.max(0, +(p.grooveClear ?? 0.03125) || 0);
  // A face frame is part of the cabinet's depth, so the box behind it is that much shallower.
  const ffr = faceFrame(c), W = c.w, H = c.h, D = c.d - (ffr ? ffr.thick : 0), tk = hasToe(c) ? p.toeKickHeight : 0;
  const parts = [], bom = {}, warn = [], ptT = partTpl(cabSet(c, 'partT'));
  const addB = (k, q) => { if (k) bom[k] = (bom[k] || 0) + q; };
  const part = (name, m, L, Wd, o = {}) => {
    const band = partBands(ptT, o.kind);
    const pt = { cab: lbl, cabId: c.id, name, kind: o.kind || '', mat: m.id, L, W: Wd, T: m.thick, qty: o.qty || 1, grain: !!m.grain, band, edges: edgeSummary(o.kind, band), ops: o.ops || [] };
    if (!(L > 0) || !(Wd > 0)) warn.push(`${name} has a zero or negative size. Check the cabinet dimensions.`);
    parts.push(pt); return pt;
  };
  const zIn0 = tk + t, zIn1 = H - t, inW = W - 2 * t;
  const backY = D - p.backInset - bt, inD = backY;
  const leftOps = [], rightOps = [];
  // Where each hinge's mounting plate sits on a side, so shelf pin holes stay out from under it.
  const plateZones = [], edgePlateAt = [];
  const fronts = computeFronts(c, p), rails = caseRails(c, p, fronts, t);
  const dParts = drawerPartitions(c, p, fronts, t, rails).map(q => ({ ...q, ops: [] })), bpC = blindPart(c, p, t);
  if (fronts.overfull) warn.push('Front rows are taller than the cabinet. Reduce a fixed row height.');
  // Pocket doors (pocket.js): their hinges go on the pocket system, not on the cabinet side.
  const pk = typeof pocketInfo === 'function' ? pocketInfo(c, p, fronts, t, zIn0, zIn1) : null;

  const frontPart = (label, f) => {
    const hg = (f.face && cornerHingeHw(c, f)) || hgAll; // a corner door can take its own hinge
    const fh = f.z1 - f.z0, fw = f.x1 - f.x0, isDoor = f.type === 'door';
    const { ds, framed } = frontStyle(c, f), dm = mat(ds.mat) || cm;
    const cupY = hg ? (hg.cupEdgeMM + hg.cupDiaMM / 2) * MM : 0; // no hinge: the front is glued on
    const hinges = [];
    if (isDoor && hg) {
      const n = fh <= hg.max2 ? 2 : fh <= hg.max3 ? 3 : 4;
      // Measured from the door's own bottom and top, so the hinges (and the plates that follow them) fit any door height.
      const a = p.hingeInsetB ?? p.hingeInset, b = fh - p.hingeInset;
      for (let i = 0; i < n; i++) hinges.push(a + (b - a) * i / (n - 1));
      const hk = cornerHinge(c, f, hg);
      // On a face frame the plates screw to the frame's stile, so the box sides get no plate holes.
      addB(hk.name, n); if (hk.plate) addB(hk.name + (ffr ? ' face frame mounting plate' : ' mounting plate'), n);
      // A corner door's plates go on whatever its hinge end meets: a box side, or the end panel on the return leg
      // (drilled once that panel is made, in edgePlates). A bi-fold's second door hangs on the first, so no plates.
      const he = f.face && hk.plate ? cornerHingeEnd(f) : null, atSide = he && (Math.abs(he.x) < 0.05 ? 'L' : Math.abs(he.x - W) < 0.05 ? 'R' : '');
      if (he && !atSide && !ffr) hinges.forEach(hp => edgePlateAt.push({ p: { x: he.x, y: he.z }, z: f.z0 + hp, hg }));
      // A door in the middle of a row (4 doors across, no divider) hinges on nothing: no side can take its plates.
      // (A blind corner door hinges on the blind inside panel, which takes the plates.)
      // 0.63.0: a door in a side-by-side section hinged on the split screws its plates to the partition there.
      const hp = f.cell !== undefined && !ffr ? dParts.find(q => q.row === f.row && q.cols && q.k === (f.hinge === 'R' ? f.col + 1 : f.col) && (f.hinge === 'R' ? f.gxR !== null && Math.abs(f.gxR - f.x1) < 1 : f.gxL !== null && Math.abs(f.x0 - f.gxL) < 1)) : null;
      const midHinge = !f.face && !ffr && hk.plate && !hp && (f.hinge === 'R' ? (bpC && bpC.side === 'R' ? bpC.x1 : W) - f.x1 : f.x0 - (bpC && bpC.side === 'L' ? bpC.x0 : 0)) > t + 0.5;
      const mhMsg = `A door hinges in the middle of ${lbl} with no side to screw its hinge plates to. Change the door count, or hinge the door on a side.`;
      if (midHinge && !warn.includes(mhMsg)) warn.push(mhMsg);
      const inPocket = pocketOf(c, f, pk);
      if (inPocket) { addB(POCKET_HW, 1); if (fw > inD - 0.5) warn.push(`A ${fmtLen(fw)}" pocket door is wider than ${lbl} is deep inside (${fmtLen(inD)}"), so it can't slide all the way in.`); }
      const hpP = hp;
      if ((!f.face || atSide) && !ffr && hk.plate && !midHinge && !inPocket) hinges.forEach(hp => {
        const z = f.z0 + hp, ops = hpP ? hpP.ops : (atSide || f.hinge) === 'L' ? leftOps : rightOps, dz = hpP ? hpP.z0 : 0;
        hg.plateHoles.forEach(ph => ops.push({ type: 'bore', x: hpP ? r3(z + ph.dz * MM - dz) : z + ph.dz * MM, y: ph.y * MM, dia: ph.dia * MM, depth: hpP ? Math.min(ph.depth * MM, Math.floor((t - 0.13) / 2 * 100) / 100) : ph.depth * MM, face: hpP ? (f.hinge === 'R' ? 'left' : 'right') : 'inside', why: 'hinge plate' }));
        if (hg.plateHoles.length) { const ys = hg.plateHoles.map(ph => ph.y * MM), half = Math.max(25, ...hg.plateHoles.map(ph => Math.abs(ph.dz) + 10)) * MM;
          plateZones.push({ ops, z0: z - dz - half, z1: z - dz + half, y0: Math.min(...ys) - 12 * MM, y1: Math.max(...ys) + 12 * MM }); }
      });
    }
    // Cup holes in front-local coordinates, y from the left edge as seen from the front.
    const sgn = f.hinge === 'R' ? -1 : 1, edgeY = f.hinge === 'R' ? fw : 0;
    const cupOps = [];
    hinges.forEach(hp => {
      cupOps.push({ type: 'bore', x: hp, y: edgeY + sgn * cupY, dia: hg.cupDiaMM * MM, depth: hg.cupDepthMM * MM, face: 'back', why: 'hinge cup' });
      (hg.cupExtra || []).forEach(e => cupOps.push({ type: 'bore', x: hp + e.dx * MM, y: edgeY + sgn * (cupY + e.dy * MM), dia: e.dia * MM, depth: e.depth * MM, face: 'back', why: 'hinge dowel' }));
    });
    const pp = pullPlacement(c, f), pullOps = pp ? pullHoles(pp, dm.thick) : [];
    if (pp) addB(pp.hw.name, 1);
    // Buyout fronts come from the door maker: hinges and pulls stay on the list, but no parts get cut.
    if (ds.source === 'buyout') return;
    const lay = doorLayout(ds, fw, fh, framed), dName = (PANEL_DESIGNS.find(d => d.v === ds.design) || {}).l || '';
    const edgeOp = ds.edgeProfile !== 'square' ? [{ type: 'edge', profile: ds.edgeProfile, face: 'front', why: 'outside edge' }] : [];
    // Design grooves for one field, shifted into the coordinates of the part they are cut in (part x = front z, part y = front x).
    const grooveOps = (fl, ox = 0, oz = 0, extraDepth = 0) => ds.design === 'none' || (ds.design === 'xbrace' && ds.type === 'fivepiece') ? [] : designLines(ds, fl).map(l => ({
      type: 'groove', x1: l.z1 - oz, y1: l.x1 - ox, x2: l.z2 - oz, y2: l.x2 - ox, width: ds.grooveW, depth: ds.grooveDepth + extraDepth, face: 'front',
      tool: ds.design === 'beadboard' ? 'beading bit' : ds.design === 'xbrace' ? 'flat bit' : '90° V-bit', why: dName }));
    const glassBom = fl => addB(`Glass ${fmtLen(fl.x1 - fl.x0 + 2 * (ds.tenon || 0.375) - 0.125, 1)} × ${fmtLen(fl.z1 - fl.z0 + 2 * (ds.tenon || 0.375) - 0.125, 1)}`, 1);
    if (ds.type === 'fivepiece' && framed) {
      const pm = mat(ds.panelMat) || bm, tn = ds.tenon, insideOp = ds.insideProfile !== 'square' ? [{ type: 'edge', profile: ds.insideProfile, face: 'front', why: 'inside edge (sticking)' }] : [];
      // Stile ops measured from the stile's outer edge.
      const toStile = (ops, outerAtLeft) => ops.filter(o => outerAtLeft ? o.y < ds.stile : o.y > fw - ds.stile).map(o => ({ ...o, y: outerAtLeft ? o.y : fw - o.y }));
      const all = [...cupOps, ...pullOps];
      part(label + ' stile (left)', dm, fh, ds.stile, { kind: 'frame', ops: [...toStile(all, true), ...edgeOp, ...insideOp] });
      part(label + ' stile (right)', dm, fh, ds.stile, { kind: 'frame', ops: [...toStile(all, false), ...edgeOp.map(o => ({ ...o })), ...insideOp.map(o => ({ ...o }))] });
      part(label + ' rail', dm, fw - 2 * ds.stile + 2 * tn, ds.rail, { qty: 2, kind: 'frame', ops: [...edgeOp, ...insideOp] });
      const mids = {};
      lay.frame.filter(m => m.kind === 'midrail' || m.kind === 'midstile').forEach(m => {
        const isRail = m.kind === 'midrail', L = (isRail ? m.x1 - m.x0 : m.z1 - m.z0) + 2 * tn, Wd = isRail ? m.z1 - m.z0 : m.x1 - m.x0, k = m.kind + L.toFixed(3) + Wd.toFixed(3);
        (mids[k] = mids[k] || { name: label + (isRail ? ' mid rail' : ' mid stile'), L, Wd, qty: 0 }).qty++;
      });
      Object.values(mids).forEach(m => part(m.name, dm, m.L, m.Wd, { qty: m.qty, kind: 'frame', ops: insideOp.map(o => ({ ...o })) }));
      const panels = {};
      lay.fields.forEach(fl => {
        if (fl.pt === 'glass') return glassBom(fl);
        if (fl.pt === 'open') return;
        const raised = fl.pt === 'raised', L = fl.z1 - fl.z0 + 2 * tn - 0.125, Wd = fl.x1 - fl.x0 + 2 * tn - 0.125, k = L.toFixed(3) + Wd.toFixed(3) + raised;
        const pfl = { x0: 0, z0: 0, x1: Wd, z1: L }, ops = [...grooveOps(pfl)];
        if (raised) ops.push({ type: 'profile', x: 0, y: 0, w: L, h: Wd, inset: ds.raiseW + tn, depth: ds.pocketDepth || 0.25, face: 'front', tool: 'raised panel bit', why: 'raised panel' });
        (panels[k] = panels[k] || { L, Wd, ops, raised, qty: 0 }).qty++;
        if (ds.design === 'xbrace') part(label + ' X brace', dm, Math.hypot(fl.x1 - fl.x0, fl.z1 - fl.z0), ds.grooveW, { qty: 2, kind: 'frame' });
      });
      Object.values(panels).forEach(pn => part(label + (pn.raised ? ' raised panel' : ' panel'), pn.raised ? (mat(ds.panelMat) || dm) : pm, pn.L, pn.Wd, { qty: pn.qty, kind: 'frame', ops: pn.ops }));
      const nGlass = lay.fields.filter(fl => fl.pt === 'glass').length;
      if (nGlass) addB('Glass retainer clips', 8 * nGlass);
    } else {
      const ops = [...cupOps, ...pullOps, ...edgeOp], inserts = {};
      lay.fields.forEach(fl => {
        const pk = { x: fl.z0, y: fl.x0, w: fl.z1 - fl.z0, h: fl.x1 - fl.x0 };
        if (!framed) { ops.push(...grooveOps(fl)); return; }
        if (fl.pt === 'glass' || fl.pt === 'open' || fl.pt === 'insert') {
          ops.push({ type: 'cutout', ...pk, face: 'front', why: { glass: 'glass opening', open: 'open panel', insert: 'panel opening' }[fl.pt] });
          if (fl.pt === 'glass') { ops.push({ type: 'rabbet', ...pk, width: 0.375, depth: 0.375, face: 'back', why: 'glass rabbet' }); glassBom(fl); }
          if (fl.pt === 'insert') {
            // A separate panel dropped into a rabbet from the back, cut from the panel material.
            const two = ds.type === 'twopiece', rw = two ? +ds.recessW || 0.375 : 0.375, rd = two ? +ds.recessD || 0.375 : 0.375, gap = two ? +ds.panelGap || 0 : 0.0625;
            ops.push({ type: 'rabbet', ...pk, width: rw, depth: rd, face: 'back', why: 'panel rabbet' });
            const L = pk.w + 2 * rw - gap, Wd = pk.h + 2 * rw - gap, k = L.toFixed(3) + Wd.toFixed(3);
            (inserts[k] = inserts[k] || { L, Wd, ops: grooveOps({ x0: 0, z0: 0, x1: Wd, z1: L }), qty: 0 }).qty++;
          }
          return;
        }
        ops.push({ type: 'pocket', ...pk, depth: ds.pocketDepth, face: 'front', profile: ds.insideProfile, why: 'panel recess' });
        if (fl.pt === 'raised') ops.push({ type: 'profile', ...pk, inset: ds.raiseW, depth: ds.pocketDepth, face: 'front', tool: 'raised panel bit', why: 'raised panel' });
        ops.push(...grooveOps(fl, 0, 0, ds.pocketDepth));
      });
      const fp = part(label, dm, fh, fw, { kind: label === 'Drawer front' ? 'drawerFront' : 'door', ops });
      // CNC Cutlist cuts the recess and edges of a made door with its own panel tool group.
      if (ds.cncGroup) fp.cncGroup = ds.cncGroup;
      Object.values(inserts).forEach(pn => part(label + (ds.type === 'twopiece' ? ' panel' : ' insert panel'), mat(ds.panelMat) || dm, pn.L, pn.Wd, { qty: pn.qty, kind: 'frame', ops: pn.ops }));
    }
  };

  // One front panel (the mini cabinets): doors and false fronts become V-grooved lines and shaker recesses on a single
  // glued-on panel, so no small fronts get cut. Drawers with boxes and corner faces still get their own fronts.
  const onePc = !!p.onePieceFront && fronts.some(f => f.type === 'door' || f.type === 'false') && !fronts.some(f => f.face);
  if (onePc) {
    const fl = fronts.filter(f => f.type === 'door' || f.type === 'false'), X0 = Math.min(...fl.map(f => f.x0)), X1 = Math.max(...fl.map(f => f.x1)), Z0 = Math.min(...fl.map(f => f.z0)), Z1 = Math.max(...fl.map(f => f.z1));
    const { ds } = frontStyle(c, fl[0]), dm = mat(ds.mat) || cm, g = p.frontGap, ops = [], seen = new Set();
    const line = (za, xa, zb, xb) => { const o = { type: 'groove', x1: r3(za - Z0), y1: r3(xa - X0), x2: r3(zb - Z0), y2: r3(xb - X0), width: g, depth: r3(g / 2), face: 'front', tool: '90° V-bit', why: 'front line' }, k = [o.x1, o.y1, o.x2, o.y2].join(); if (!seen.has(k)) { seen.add(k); ops.push(o); } };
    fl.forEach(f => {
      if (f.x1 < X1 - 1e-3) line(f.z0, f.x1 + g / 2, f.z1, f.x1 + g / 2);
      if (f.z0 > Z0 + 1e-3) line(f.z0 - g / 2, Math.max(X0, f.x0 - g), f.z0 - g / 2, Math.min(X1, f.x1 + g));
      const st = frontStyle(c, f);
      if (st.framed && st.ds.type === 'routed') { const fr = st.ds.stile; ops.push({ type: 'pocket', x: r3(f.z0 - Z0 + fr), y: r3(f.x0 - X0 + fr), w: r3(f.z1 - f.z0 - 2 * fr), h: r3(f.x1 - f.x0 - 2 * fr), depth: st.ds.pocketDepth, face: 'front', why: 'panel recess' }); }
    });
    part('Front panel', dm, r3(Z1 - Z0), r3(X1 - X0), { kind: 'door', ops });
  }
  fronts.forEach(f => {
    if (onePc && (f.type === 'door' || f.type === 'false')) return;
    if (f.type === 'door') frontPart('Door', f);
    else if (f.type === 'false') frontPart('False front', f);
    else if (f.type === 'drawer') {
      frontPart('Drawer front', f);
      if (f.face) { if (!warn.some(w => w.startsWith('Drawers on a corner'))) warn.push('Drawers on a corner\'s angled faces get their fronts only; build the drawer boxes by hand.'); return; }
      if (!sl) { warn.push('No drawer slide in the hardware library.'); return; }
      const dm = mat(dmt.sides) || cm, dbm = mat(dmt.bottom) || bm, st = dm.thick;

      const nominal = nominalFor(sl, inD);
      if (!nominal) { warn.push(`No ${sl.name} length fits ${fmtLen(inD, 1)} inside depth.`); return; }
      // A face frame drawer fits between the rails of its opening.
      const ffOpen = !!(ffr && f.open && !blindCorner(c));
      const [z0, z1] = drawerSpan(c, p, f, Math.max(ffOpen ? f.open.z0 : f.z0, zIn0), Math.min(ffOpen ? f.open.z1 : f.z1, zIn1), t, rails);
      const boxBot = z0 + sl.bottomClearMM * MM;
      const bh = Math.floor(((z1 - z0) - (sl.bottomClearMM + sl.topClearMM) * MM) * 4) / 4;
      if (bh < 2.5) { warn.push(`Drawer opening at ${fmtLen(f.z0, 1)} is too short for a drawer box.`); return; }
      // A blind corner's drawer runs beside the blind side, on a partition the height of its opening.
      const bwD = blindCorner(c) ? blindWidth(c) : 0;
      if (bwD && !bpC) part('Drawer partition', cm, r3(z1 - z0), r3(inD), { kind: 'divider' });
      // Behind a face frame the drawer fits the frame's opening; spacers on the sides bring the runners out to it.
      const openW = ffOpen ? f.open.x1 - f.open.x0 : f.cell !== undefined ? (o => o.o1 - o.o0)(colOpening(c, f, t)) : bpC ? (bpC.o1 - bpC.o0 - (f.n > 1 ? f.n - 1 : 0) * t) / (f.n > 1 ? f.n : 1) : bwD ? W - t - bwD : f.n > 1 ? (inW - (f.n - 1) * t) / f.n : inW;
      const ffSp = ffOpen && f.n === 1 ? Math.max(ffr.ls, ffr.rs) - t : 0;
      const kk = f.cell !== undefined ? f.col : f.idx, pL = dParts.find(q => q.row === f.row && q.k === kk), pR = dParts.find(q => q.row === f.row && q.k === kk + 1);
      if (f.cell === undefined && f.n > 1 && f.idx === 0 && !dParts.some(q => q.row === f.row)) warn.push('Side-by-side drawers need a center divider. One is only made where a stretcher, shelf, top or bottom holds it.');
      const ow = openW - sl.widthDeductMM * MM, rec = sl.bottomRecessMM * MM, bdT = dbm.thick, bd = p.drawerBottomDado;
      const bx = drawerBoxBuild(dmt, st, bdT, bd, rec, nominal, ow, bh);
      const groove = len => ({ type: 'groove', x1: 0, y1: rec + bdT / 2, x2: len, y2: rec + bdT / 2, width: r3(bdT + gcB), depth: bx.gd, face: 'inside', why: 'drawer bottom' });
      // For 1/2" slides: the inside of the sides is cut back below the bottom, so the runner sees a thinner side. The box front
      // stays full thickness: the locking devices screw on there (Ayden).
      const trimOp = len => bx.trim > 0 ? [{ type: 'groove', x1: 0, y1: rec / 2, x2: len, y2: rec / 2, width: rec, depth: bx.trim, face: 'inside', why: 'trim for the runner' }] : [];
      const sideOps = [groove(nominal), ...trimOp(nominal)], backOps = bx.type ? [groove(ow - 2 * st)] : [], bottomOps = [];
      (sl.boxOps || []).forEach(o => {
        const op = { dia: o.dia * MM, depth: o.depth * MM, why: sl.name };
        if (o.part === 'side' && o.type === 'hbore') sideOps.push({ ...op, type: 'hbore', edge: (o.edge || 'rear') + ' end', x: o.edge === 'front' ? 0 : nominal, y: o.y * MM, inset: o.inset * MM });
        else if (o.part === 'side') sideOps.push({ ...op, type: 'bore', x: o.x * MM, y: o.y * MM, face: 'outside' });
        else if (o.part === 'back') backOps.push({ ...op, type: 'bore', x: o.x * MM, y: o.y * MM, face: 'back' });
        else if (o.part === 'bottom') bottomOps.push({ ...op, type: 'bore', x: o.x * MM, y: o.y * MM, face: 'bottom' }, { ...op, type: 'bore', x: o.x * MM, y: bx.botW - o.y * MM, face: 'bottom' });
      });
      // The side the runner sees: the trimmed thickness below the bottom on a box for thinner-side slides.
      const runSide = st - bx.trim;
      if ((bx.type === 'slide12' ? runSide - sl.sideThickMM * MM > 0.03 : Math.abs(st - sl.sideThickMM * MM) > 0.03) && !warn.some(w => w.startsWith('Drawer box material')))
        warn.push(bx.type === 'slide12' ? `Drawer box material is ${fmtLen(st, 1)}; trimmed to ${fmtLen(runSide, 1)} it is still thicker than the ${fmtLen(sl.sideThickMM * MM, 1)} sides ${sl.name} expects. Trim more in the drawer material template.`
          : `Drawer box material is ${fmtLen(st, 1)} but ${sl.name} expects ${fmtLen(sl.sideThickMM * MM, 1)} sides.`);
      part('Drawer side', dm, nominal, bh, { qty: 2, kind: 'drawerBox', ops: sideOps });
      part('Drawer box front', dm, ow - 2 * st, bh, { kind: 'drawerBox', ops: [groove(ow - 2 * st)] });
      const bk = part('Drawer box back', dm, ow - 2 * st, bx.backH, { kind: 'drawerBox', ops: backOps });
      if (bx.notchH > 0) Object.assign(bk, notchedBack(ow - 2 * st, bx.backH, bx.notchW, bx.notchH));
      part('Drawer bottom', dbm, bx.botL, bx.botW, { kind: 'drawerBottom', ops: bottomOps });
      addB(slideBomName(sl, nominal), 1);
      addB(sl.bomExtra, 1);
      if (ffSp > 0.03) {
        if (false && Math.abs(ffSp - t) > 0.07 && !warn.some(w => w.startsWith('Drawer spacers'))) warn.push(`Drawer spacers need to be ${fmtLen(ffSp, 1)} thick to bring the runners out to the face frame; the box material is ${fmtLen(t, 1)}.`);
        part('Drawer slide spacer', cm, inD, 2.5, { qty: 2, kind: 'spacer', ops: (sl.cabHoles || []).filter(h => slideHoleY(sl, nominal, h) !== null).map(h => ({ type: 'bore', x: slideHoleY(sl, nominal, h), y: 1.25, dia: h.dia * MM, depth: h.depth * MM, face: 'inside', why: sl.name + ' runner' })) });
      } else (sl.cabHoles || []).forEach(h => {
        if (slideHoleY(sl, nominal, h) === null) return;
        const op = { type: 'bore', x: boxBot + h.z * MM, y: slideHoleY(sl, nominal, h), dia: h.dia * MM, depth: h.depth * MM, face: 'inside', why: sl.name + ' runner' };
        // Side by side: a runner on a partition goes on that partition's face, the cabinet side only gets the end drawers'.
        // A partition has runners on both faces at the same spots: keep each hole short enough that the two leave 1/8" between them.
        const pDep = Math.min(op.depth, Math.floor((t - 0.13) / 2 * 100) / 100);
        if ((pL || pR) && pDep < op.depth - 1e-6 && !warn.some(w => w.startsWith('Drawer partition'))) warn.push(`Drawer partition: runner holes are ${fmtLen(pDep, 1)} deep from each face so they don't meet. Use runner screws no longer than ${fmtLen(pDep, 1)} there.`);
        if (pL) pL.ops.push({ ...op, depth: pDep, x: r3(op.x - pL.z0), face: 'right' }); else leftOps.push(op);
        if (pR) pR.ops.push({ ...op, depth: pDep, x: r3(op.x - pR.z0), face: 'left' }); else rightOps.push({ ...op });
      });
    }
  });

  // Interior: roll-outs take over their door opening, shelves use the rest.
  const lay = interiorLayout(c, p, fronts);
  lay.rollouts.forEach((ro, i) => {
    if (!sl || ro.designed) return;
    const nominal = nominalFor(sl, inD); if (!nominal) { if (!i) warn.push(`No ${sl.name} length fits behind the doors for roll-outs.`); return; }
    const dm = mat(dmt.sides) || cm, dbm = mat(dmt.bottom) || bm, st = dm.thick, bdT = dbm.thick, bd = p.drawerBottomDado, rec = sl.bottomRecessMM * MM;
    const ow = lay.inW - 2 * lay.spacer - sl.widthDeductMM * MM, bh = ro.h;
    const bx = drawerBoxBuild(dmt, st, bdT, bd, rec, nominal, ow, bh);
    const groove = len => ({ type: 'groove', x1: 0, y1: rec + bdT / 2, x2: len, y2: rec + bdT / 2, width: r3(bdT + gcB), depth: bx.gd, face: 'inside', why: 'roll-out bottom' });
    const trimOp = len => bx.trim > 0 ? [{ type: 'groove', x1: 0, y1: rec / 2, x2: len, y2: rec / 2, width: rec, depth: bx.trim, face: 'inside', why: 'trim for the runner' }] : [];
    const tag = lay.rollouts.length > 1 ? ` ${i + 1}` : '', RO = ro.label || 'Roll-out';
    part(RO + ' side' + tag, dm, nominal, bh, { qty: 2, kind: 'drawerBox', ops: [groove(nominal), ...trimOp(nominal)] });
    part(RO + ' front' + tag, dm, ow - 2 * st, bh, { kind: 'drawerBox', ops: [groove(ow - 2 * st)] });
    const bk = part(RO + ' back' + tag, dm, ow - 2 * st, Math.max(0.5, bx.backH), { kind: 'drawerBox', ...(bx.type ? { ops: [groove(ow - 2 * st)] } : {}) });
    if (bx.notchH > 0) Object.assign(bk, notchedBack(ow - 2 * st, bk.W, bx.notchW, bx.notchH));
    part(RO + ' bottom' + tag, dbm, bx.botL, bx.botW, { kind: 'drawerBottom' });
    if (lay.spacer > 0) part(RO + ' spacer' + tag, cm, inD, 2.5, { qty: 2, kind: 'spacer', ops: (sl.cabHoles || []).filter(h => slideHoleY(sl, nominal, h) !== null).map(h => ({ type: 'bore', x: slideHoleY(sl, nominal, h), y: 1.25, dia: h.dia * MM, depth: h.depth * MM, face: 'inside', why: sl.name + ' runner' })) });
    addB(slideBomName(sl, nominal), 1);
    addB(sl.bomExtra, 1);
  });
  if (lay.divX !== null) part('Vertical divider', cm, lay.zIn1 - lay.zIn0, inD - 0.0625, { kind: 'divider' });
  lay.trays.forEach(tr => { if (!tr.designed) part('Tray divider', bm, tr.z1 - tr.z0 - 1, inD - 1, { qty: tr.n, kind: 'divider' }); });
  lay.bom.forEach(n => addB(n, 1));
  if (typeof dpBuild === 'function') dpBuild(c, part, addB, warn);

  // Shelf pins over the door openings that have no roll-outs
  let shelves = falseOn(c) ? 0 : lay.perRow ? lay.perRow.reduce((a, r) => a + r.k, 0) : Math.max(0, p.shelfCount | 0);
  const zones = lay.perRow ? lay.perRow.filter(r => r.k).map(r => r.z) : lay.shelfZones;
  if (shelves && !zones.length) { if (!lay.colZones.length) warn.push(lay.zones.length ? 'Inserts fill the door opening, so adjustable shelves were skipped.' : 'Shelves are set but this cabinet has no door opening. Shelves skipped.'); shelves = 0; }
  if (lay.divX !== null && (lay.rollouts.length || lay.bins.length || lay.lazy.length)) warn.push('The divider runs through the roll-outs or pull-out. Remove one of them, or check the sizes by hand.');
  if (shelves && pin) {
    const pitch = pin.pitchMM * MM, ys = [pin.pinSetbackMM * MM, inD - pin.pinSetbackMM * MM], divOps = [];
    // Line bore drills the whole opening on the pin pitch; a set drills a few holes (5 to start) centered on each shelf.
    const perZone = lay.perRow ? lay.perRow.filter(r => r.k).map(r => r.k) : zones.map((_, i) => Math.floor(shelves / zones.length) + (i < shelves % zones.length ? 1 : 0));
    const holeZs = (a, b, k) => {
      const grid = []; for (let z = a + p.pinZoneInset; z <= b - p.pinZoneInset + 1e-6; z += pitch) grid.push(z);
      if (p.shelfDrill === 'line' || !grid.length) return grid;
      const n = Math.max(1, p.shelfHoles | 0), out = new Set();
      for (let i = 1; i <= k; i++) {
        const want = a + (b - a) * i / (k + 1), c0 = grid.reduce((m, z, j) => Math.abs(z - want) < Math.abs(grid[m] - want) ? j : m, 0);
        const lo = Math.max(0, Math.min(grid.length - n, c0 - Math.floor(n / 2)));
        grid.slice(lo, lo + n).forEach(z => out.add(z));
      }
      return [...out].sort((x, y) => x - y);
    };
    zones.forEach(([a, b], zi) => {
      for (const z of holeZs(a, b, perZone[zi] || 0)) {
        ys.forEach(y => {
          [leftOps, rightOps].forEach(ops => {
            const clash = ops.some(o => o.why !== 'shelf pin' && o.type === 'bore' && Math.hypot(o.x - z, o.y - y) < 12 * MM)
              || plateZones.some(pz => pz.ops === ops && z > pz.z0 && z < pz.z1 && y > pz.y0 && y < pz.y1);
            if (!clash) ops.push({ type: 'bore', x: z, y, dia: pin.pinDiaMM * MM, depth: pin.pinDepthMM * MM, face: 'inside', why: 'shelf pin' });
          });
          if (lay.divX !== null) ['left', 'right'].forEach(face => divOps.push({ type: 'bore', x: z - lay.zIn0, y, dia: pin.pinDiaMM * MM, depth: Math.min(pin.pinDepthMM * MM, t * 0.4), face, why: 'shelf pin' }));
        });
      }
    });
    if (lay.divX !== null) {
      parts.find(q => q.name === 'Vertical divider' && q.cabId === c.id).ops.push(...divOps);
      const wl = lay.divX - t / 2 - t - 0.0625 - (pk ? pk.wL : 0), wr = W - t - (lay.divX + t / 2) - 0.0625 - (pk ? pk.wR : 0);
      part('Adjustable shelf (left)', sm, wl, inD - p.shelfFrontSetback, { qty: shelves, kind: 'shelf' });
      part('Adjustable shelf (right)', sm, wr, inD - p.shelfFrontSetback, { qty: shelves, kind: 'shelf' });
      addB(pin.name, 8 * shelves);
    } else {
      part('Adjustable shelf', sm, (bpC ? bpC.o1 - bpC.o0 : lay.inW) - 0.0625, inD - p.shelfFrontSetback, { qty: shelves, kind: 'shelf' });
      addB(pin.name, 4 * shelves);
    }
  }

  // 0.63.0: adjustable shelves in side-by-side sections: each its own width, pins in the side or partition on each side.
  if (pin && lay.colZones.length) {
    const pitch = pin.pitchMM * MM, ys = [pin.pinSetbackMM * MM, inD - pin.pinSetbackMM * MM], L = faceLetters(c);
    lay.colZones.filter(zn => zn.k > 0).forEach(zn => {
      const [a, b] = zn, k = zn.k, grid = []; for (let z = a + p.pinZoneInset; z <= b - p.pinZoneInset + 1e-6; z += pitch) grid.push(z);
      let zs = grid;
      if (p.shelfDrill !== 'line' && grid.length) {
        const n = Math.max(1, p.shelfHoles | 0), set = new Set();
        for (let i = 1; i <= k; i++) { const want = a + (b - a) * i / (k + 1), c0 = grid.reduce((m, z, j) => Math.abs(z - want) < Math.abs(grid[m] - want) ? j : m, 0), lo = Math.max(0, Math.min(grid.length - n, c0 - Math.floor(n / 2))); grid.slice(lo, lo + n).forEach(z => set.add(z)); }
        zs = [...set].sort((x, y) => x - y);
      }
      const pl = dParts.find(q => q.cols && q.row === zn.row && q.k === zn.col), pr = dParts.find(q => q.cols && q.row === zn.row && q.k === zn.col + 1);
      const sides = [[pl, leftOps, 'right'], [pr, rightOps, 'left']];
      zs.forEach(z => ys.forEach(y => sides.forEach(([pp, so, face]) => {
        const ops = pp ? pp.ops : so, x = pp ? r3(z - pp.z0) : z;
        const clash = ops.some(o => o.why !== 'shelf pin' && o.type === 'bore' && Math.hypot(o.x - x, o.y - y) < 12 * MM) || plateZones.some(pz => pz.ops === ops && x > pz.z0 && x < pz.z1 && y > pz.y0 && y < pz.y1);
        if (!clash) ops.push({ type: 'bore', x, y, dia: pin.pinDiaMM * MM, depth: pp ? Math.min(pin.pinDepthMM * MM, t * 0.4) : pin.pinDepthMM * MM, face: pp ? face : 'inside', why: 'shelf pin' });
      })));
      part(`Adjustable shelf (${L[zn.cell] || zn.cell})`, sm, r3(zn.x1 - zn.x0 - 0.0625), inD - p.shelfFrontSetback, { qty: k, kind: 'shelf' });
      addB(pin.name, 4 * k);
    });
  }

  // Pocket panels: one each side a door slides into, front to back between the bottom and the top (or as high as the
  // doors reach). The shelves rest on them, so that side's shelf pins move onto the panel's inside face.
  if (pk) [pk.L, pk.R].filter(Boolean).forEach(s => {
    const from = s.side === 'L' ? leftOps : rightOps, face = s.side === 'L' ? 'right' : 'left';
    const pins = []; for (let i = from.length - 1; i >= 0; i--) if (from[i].why === 'shelf pin' && from[i].x >= s.z0 && from[i].x <= s.z1) pins.unshift(...from.splice(i, 1));
    const pp = part(`Pocket panel (${s.side === 'L' ? 'left' : 'right'})`, cm, r3(s.z1 - s.z0), r3(inD - 0.0625), { kind: 'divider', ops: pins.map(o => ({ ...o, x: r3(o.x - s.z0), face })) });
    pp.pocket = s.side;
  });

  // Carcass
  // On feet the sides start at the top of the legs, so their machining moves down by the leg height.
  const feet = onFeet(c, p), sh = feet ? tk : 0, down = o => { const q = { ...o }; ['x', 'x1', 'x2'].forEach(k => { if (typeof q[k] === 'number') q[k] = r3(q[k] - sh); }); return q; };
  // The back dado runs the full length of each side, out both ends (Ayden 2026-11-09: a stopped groove ended short, as
  // the CNC stops a bit radius before an end inside the part and leaves it round, so the back's corners did not go in).
  // Room in every groove and dado (Ayden 2026-11-10: a little slop, or a slightly thick sheet won't go in): the groove is
  // gc wider than the panel, and the panel stops gc short of the groove's bottom.
  const gc = gcB, gReach = Math.max(0, p.dadoDepth - gc);
  const apZ = apronStretcherZ(c, p, t), apH = sinkApronH(c, p), rsAt = rearStretcherAt(p, D, backY, bt), rsA0 = rsAt ? rsAt.y0 : r3(backY - p.stretcherWidth);
  const backGroove = { type: 'groove', x1: sh, y1: backY + bt / 2, x2: H, y2: backY + bt / 2, width: r3(bt + gc), depth: p.dadoDepth, face: 'inside', why: 'back dado' };
  const toe = tk && !feet ? [{ type: 'notch', x: 0, y: 0, w: tk, h: p.toeKickSetback, why: 'toe kick' }] : [];
  // No dado (depth 0, the dollhouse set): the back is glued in between the sides, top and bottom.
  const grooves = p.dadoDepth > 0 ? [backGroove] : [];
  // Pin holes (the dollhouse set): through both sides at set heights (p.pinZ, up from the cabinet bottom; a tall cabinet has
  // the base heights low and the wall heights high), 1/4 and 3/4 of the depth, so cabinets side by side pin together with
  // rod, and an applied end panel's matching blind holes pin it onto an exposed side.
  const pinD = +p.pinHoles || 0, pinSpots = [];
  if (pinD > 0) (Array.isArray(p.pinZ) && p.pinZ.length ? p.pinZ : [tk + (H - tk) * 0.25, tk + (H - tk) * 0.75]).filter(z => z > tk + t && z < H - t)
    .forEach(z => [0.25, 0.75].forEach(fy => pinSpots.push({ z: r3(z), y: r3(Math.min(D * fy, backY - pinD)) })));
  const pinOps = pinSpots.map(q => ({ type: 'bore', x: q.z, y: q.y, dia: pinD, depth: t, through: true, face: 'inside', why: 'pin hole' }));
  // Blind corner: what the opening's blind-side wall carries (plates of doors hinged there, runners, shelf pins) goes on the
  // inside panel, one piece between each pair of the bottom, drawer stretchers and the top.
  const bpPieces = [];
  if (bpC) {
    blindPieces(c, p, t, rails).forEach(q => bpPieces.push({ ...q, ops: [] }));
    const from = bpC.side === 'L' ? leftOps : rightOps, face = bpC.side === 'L' ? 'right' : 'left';
    from.splice(0).forEach(o => { const z = o.x ?? o.x1, q = bpPieces.find(b => z >= b.z0 - 1e-6 && z <= b.z1 + 1e-6);
      if (q) q.ops.push({ ...o, ...(typeof o.x === 'number' ? { x: r3(o.x - q.z0) } : {}), ...(typeof o.x1 === 'number' ? { x1: r3(o.x1 - q.z0), x2: r3(o.x2 - q.z0) } : {}), face }); });
    // The shelves rest on the inside panel there too.
    pinOps.forEach(o => { const q = bpPieces.find(b => o.x >= b.z0 + 0.5 && o.x <= b.z1 - 0.5); if (q) q.ops.push({ ...o, x: r3(o.x - q.z0), face }); });
  }
  const pinL = bpC && bpC.side === 'L' ? [] : pinOps, pinR = bpC && bpC.side === 'R' ? [] : pinOps;
  part('Left side', cm, H - sh, D, { kind: 'side', ops: [...grooves, ...toe, ...leftOps, ...pinL].map(down) });
  part('Right side', cm, H - sh, D, { kind: 'side', ops: [...grooves, ...toe, ...rightOps, ...pinR.map(o => ({ ...o }))].map(down) });
  const panelGroove = { type: 'groove', x1: 0, y1: backY + bt / 2, x2: inW, y2: backY + bt / 2, width: r3(bt + gc), depth: p.dadoDepth, face: 'inside', why: 'back dado' };
  part('Bottom', cm, inW, D, { kind: 'topbot', ops: p.dadoDepth > 0 ? [panelGroove] : [] });
  if ((c.construction || {}).top === 'stretchers') {
    if (apH) { const q = part('Sink apron', cm, inW, apH, { kind: 'stretcher' }); q.jy = r3(t / 2); }
    else part('Front stretcher', cm, inW, p.stretcherWidth, { kind: 'stretcher' });
    part('Rear stretcher', cm, inW, p.stretcherWidth, { kind: 'rearStretcher', ops: rsAt && p.dadoDepth > 0 ? [{ ...panelGroove, y1: rsAt.groove, y2: rsAt.groove }] : [] });
  } else part('Top', cm, inW, D, { kind: 'topbot', ops: p.dadoDepth > 0 ? [{ ...panelGroove }] : [] });
  // Drawer stretchers (caseRails): flat, the top stretcher's width deep, at the front, joined into the sides like it.
  rails.stretchers.forEach((q, i) => { q.pt = part('Drawer stretcher' + (rails.stretchers.length > 1 ? ' ' + (i + 1) : ''), cm, inW, p.stretcherWidth, { kind: 'stretcher' }); });
  part('Back', bm, r3((zIn1 - zIn0) + 2 * gReach), r3(inW + 2 * gReach), { kind: 'back' });
  if (tk && p.toeSkin !== 'off') part(feet ? 'Toe skin' : 'Toe kick', tkm, W, tk, { kind: 'toekick' });
  // Ladder base (2026-11-09; its two settings are not in SHOP_PARAMS so older jobs export byte for byte the same): a box built under the cabinet, the toe kick height tall. Front and back rails run the full
  // width, rungs fit between them at each end and at most ladderGap apart. The front sits behind the toe skin (or at the
  // setback when the skin is off), the back is flush with the cabinet back. Cut from the cabinet material unless one is set.
  if (onLadder(c, p) && tk) {
    if (angledCorner(c)) warn.push('The ladder base is not drawn for angled corner cabinets yet. Build it by hand or use legs.');
    else {
      const lm = mat(p.ladderMat) || cm, lt = lm.thick, yf = r3(p.toeKickSetback + (p.toeSkin !== 'off' ? tkm.thick : 0)), dep = r3(D - yf);
      const gap = +p.ladderGap > 0 ? +p.ladderGap : 24, n = Math.max(2, Math.ceil((W - lt) / gap - 1e-6) + 1);
      if (hasCabShape(c)) warn.push('This cabinet has a shape; the ladder base is cut square to its width and depth. Check it.');
      part('Ladder front rail', lm, W, tk, { kind: 'ladder' });
      part('Ladder back rail', lm, W, tk, { kind: 'ladder' });
      part('Ladder rung', lm, r3(dep - 2 * lt), tk, { kind: 'ladder', qty: n });
    }
  }
  // Face frame parts stay off the cut list for now (Ayden, 2026-11-03); ffParts in faceframe.js builds them when wanted.
  // A front, side or top shape cuts the box panels to it.
  if (hasCabShape(c)) applyCabShape(c, parts, { p, t, bt, tk, sh, D, dd: Math.max(0, p.dadoDepth - Math.max(0, +(p.grooveClear ?? 0.03125) || 0)), warn });
  if ((cabTopShape(c) || {}).edges && typeof edgeParts === 'function') edgeParts(c, parts, { t, bt, sh, warn }, part, cm);
  if (isCorner(c)) cornerParts(c, parts, { p, t, bt, tk, feet: onFeet(c, p), part, cm, sm, warn, addB, ptT });
  // Legs press into holes on the underside of the bottom (the flip side on the CNC), laid out from the leg's insets.
  if (onLegs(c, p)) {
    const leg = hw(roomSet('leg')) || S.hardware.find(h => h.feet), bot = parts.find(q => q.cabId === c.id && q.name === 'Bottom');
    let n = feetCount(c, p);
    if (leg && leg.kind === 'leg' && bot && angledCorner(c)) {
      // A corner gets a leg in from each corner of its footprint (ops measured from the bottom's front edge).
      const spots = cornerLegSpots(c, p), pat = (leg.holesMM || []).length ? leg.holesMM : [{ x: 0, y: 0 }];
      spots.forEach(q => pat.forEach(o => { const dx = (+o.x || 0) * MM * (q.x > W / 2 ? -1 : 1), dy = (+o.y || 0) * MM;
        bot.ops.push({ type: 'bore', x: r3(q.x + dx - t), y: r3(D - q.y + dy), dia: +leg.holeDia, depth: Math.min(+leg.holeDepth, t - 0.0625), face: 'outside', why: leg.name, leg: true }); }));
      n = spots.length;
    } else if (leg && leg.kind === 'leg' && bot) {
      const { xs, ys } = legLayout(c, p, leg, D);
      // A leg with a screw pattern (holesMM, offsets from its centre) gets each screw marked; the pattern's x offset
      // points toward the middle of the cabinet, so legs on the right half mirror it.
      const pat = (leg.holesMM || []).length ? leg.holesMM : [{ x: 0, y: 0 }];
      xs.forEach(x => ys.forEach(y => pat.forEach(o => { const dx = (+o.x || 0) * MM * (x > W / 2 ? -1 : 1), dy = (+o.y || 0) * MM;
        bot.ops.push({ type: 'bore', x: r3(x + dx - t), y: r3(y + dy), dia: +leg.holeDia, depth: Math.min(+leg.holeDepth, t - 0.0625), face: 'outside', why: leg.name, leg: true }); })));
      n = xs.length * ys.length;
    }
    // A cabinet too small for its legs (a mini on feet): the screw holes would run off the bottom or into each other.
    if (bot) { const lo = bot.ops.filter(o => o.leg), off = lo.some(o => o.x - o.dia / 2 < 0 || o.x + o.dia / 2 > bot.L || o.y - o.dia / 2 < 0 || o.y + o.dia / 2 > bot.W)
        || lo.some((o, i) => lo.some((q, j) => j > i && Math.hypot(o.x - q.x, o.y - q.y) < (o.dia + q.dia) / 2 + 0.0625));
      if (off) { bot.ops = bot.ops.filter(o => !o.leg); warn.push(`${lbl} is too small for its legs: their holes would run off the bottom or into each other, so none are drilled. Pick a different base.`); } }
    addB(leg ? leg.name : `Cabinet leveler leg ${fmtLen(tk, 1)}`, n); if (p.toeSkin !== 'off') addB('Toe skin clip', Math.ceil(n / 2));
  }

  // Joinery from the joint templates: the finished-end template on exposed ends, the unfinished one elsewhere.
  const spots = (loc, a, b) => {
    loc = loc || JOINT_LOC; const f = a + (+loc.front || 0), e = b - (+loc.back || 0);
    if (e <= f + 0.01) return [(a + b) / 2];
    // A set count spreads that many holes evenly between the insets (one goes in the middle).
    if (loc.mode === 'count') { const k = Math.max(1, +(loc.count ?? 3) | 0 || 1); return k === 1 ? [r3((f + e) / 2)] : Array.from({ length: k }, (_, i) => r3(f + (e - f) * i / (k - 1))); }
    const n = +loc.maxGap > 0 ? Math.max(1, Math.ceil((e - f) / +loc.maxGap - 1e-6)) : 1;
    return Array.from({ length: n + 1 }, (_, i) => r3(f + (e - f) * i / n));
  };
  // J1-J6: each joint type has its own spots (joints2.js), and the fastener kind decides the machining.
  const jx = { t, addB, spread: spots, a: undefined, b: undefined, warn, cat: c.cat, gc: gcB };
  const jFor = end => { const J = hw(cabSet(c, endFinished(c, end) ? 'jointF' : 'jointU')); return J && J.kind === 'joint' ? J : null; };
  const sideP = { L: parts.find(q => q.cabId === c.id && q.name === 'Left side'), R: parts.find(q => q.cabId === c.id && q.name === 'Right side') };
  ['L', 'R'].forEach(end => {
    const fin = endFinished(c, end), J = jFor(end);
    if (J && J.applies && sideP[end] && (!J.applies[fin ? 'fin' : 'unfin'] || J.applies[c.cat] === false)) warn.push(`${J.name} is not set for ${fin ? 'finished' : 'unfinished'} ends of ${c.cat.toLowerCase()} cabinets (${end === 'L' ? 'left' : 'right'} end). Check the joint template.`);
    if (fin && sideP[end]) sideP[end].finEnd = true;
  });
  // Joins a panel into both sides. Horizontal panels (fx = height of their center) run front to back from a to b;
  // vertical ones (zr = [z0, z1]) sit at the back, in front of the back panel.
  const joinSides = (type, pt, fx, zr, a = 0, b = backY) => ['L', 'R'].forEach(end => {
    // A blind corner's fixed shelf stops at the inside panel, so its blind end is fastened into that (flush at the front).
    const bq = type === 'shelf' && !zr && bpC && end === bpC.side ? bpPieces.find(q => q.pt && fx > q.z0 && fx < q.z1) : null;
    const J = jFor(end), sp = bq ? bq.pt : sideP[end]; if (!J || !sp || !pt) return;
    // A side that is not the full depth (the open end of a 45° or 90° corner) starts that much further back:
    // its holes are measured from its own front edge, the panel's from the cabinet front.
    const off = bq || sp.outline ? 0 : Math.max(0, r3(D - sp.W));
    const fem = [], label = `${J.name} (${pt.name.toLowerCase()})`;
    let pairs;
    if (zr) pairs = jtSpots(J, type, zr[0], zr[1], spots, t).map(z => ({ x: z, y: r3((pt.jy ?? backY - t / 2) - off), m: r3(zr[1] - z) }));
    // m runs along the panel's own edge, from its front (a rear stretcher starts well back of the cabinet front).
    else pairs = jtSpots(J, type, Math.max(a, off), b, spots, t).map(y => ({ x: fx, y: r3(y - off), m: r3(y - a) }));
    jx.a = zr ? undefined : a; jx.b = zr ? undefined : b; jx.zr = zr || undefined; jx.type = type; jx.side = sp; jx.off = off; jx.zs = bq ? [bq.z0, bq.z1] : [sh, H];
    jtFasten(J, fem, pt, end === 'L' ? 0 : r3(pt.L), end === 'L' ? 'W1' : 'W2', pairs, label, jx);
    sp.ops.push(...fem.map(bq ? o => { const q = { ...o, face: bpC.side === 'L' ? 'right' : 'left' }; ['x', 'x1', 'x2'].forEach(k => { if (typeof q[k] === 'number') q[k] = r3(q[k] - bq.z0); }); return q; } : down));
  });
  [['Bottom', 'bottom', zIn0 - t / 2, 0, backY], ['Top', 'top', zIn1 + t / 2, 0, backY], ['Front stretcher', 'stretcher', apZ !== null ? apZ : zIn1 + t / 2, 0, p.stretcherWidth], ['Rear stretcher', 'stretcher', zIn1 + t / 2, rsA0, backY]]
    .forEach(([name, type, fx, a, b]) => { const pt = parts.find(q => q.cabId === c.id && q.name === name); if (pt) joinSides(type, pt, fx, null, a, b); });
  rails.stretchers.forEach(q => joinSides('stretcher', q.pt, q.z, null, 0, p.stretcherWidth));
  { const ap = parts.find(q => q.cabId === c.id && q.name === 'Sink apron'); if (ap) joinSides('nailer', ap, null, [r3(zIn1 + t - ap.W), r3(zIn1 + t)]); }
  // Drawer partitions: fastened through what is under and over them, like the vertical divider into the bottom and top.
  // 0.63.0: the partitions behind side-by-side sections are named Partition (Mozaik's name), the drawer ones as before.
  const dpN = dParts.filter(q => !q.cols), cpN = dParts.filter(q => q.cols), colJoins = [];
  [...dParts.map(q => q.cols ? { ...q, name: 'Partition' + (cpN.length > 1 ? ' ' + (cpN.indexOf(q) + 1) : '') } : { ...q, name: 'Drawer partition' + (dpN.length > 1 ? ' ' + (dpN.indexOf(q) + 1) : '') }),
   ...bpPieces.map((q, i) => ({ ...q, blindUp: i > 0, name: 'Blind corner inside panel' + (bpPieces.length > 1 ? (i ? ' (upper)' : ' (lower)') : '') }))].forEach(q => {
    const pt = part(q.name, cm, r3(q.z1 - q.z0), r3(inD - 0.0625), { kind: 'divider', ops: q.ops }), src = bpPieces.find(b => b.ops === q.ops); if (src) src.pt = pt;
    const J = hw(cabSet(c, 'jointU')); if (!J || J.kind !== 'joint') return;
    const mine = n => parts.find(z => z.cabId === c.id && z.name === n), rs = rails.stretchers.find(s => Math.abs(s.z + t / 2 - q.z0) < 1e-3), sh = rails.shelves.find(s => Math.abs(s.z - t / 2 - q.z1) < 1e-3), rsA = rails.stretchers.find(s => Math.abs(s.z - t / 2 - q.z1) < 1e-3);
    const shelfPt = s => s && parts.find(z => z.cabId === c.id && z.name === `Fixed shelf ${s.row + 1}`);
    // [host part, the partition edge (top or bottom), where it touches front to back]
    // A blind corner's upper inside panel stands on the drawer stretcher the lower one is fastened up into (one hole can't hold both).
    const shB = q.cols && rails.shelves.find(s => Math.abs(s.z + t / 2 - q.z0) < 1e-3);
    const below = rs ? (q.blindUp ? [] : [[rs.pt, 0, 0, p.stretcherWidth]]) : shB ? [[shelfPt(shB), 0, 0, pt.W]] : [[mine('Bottom'), 0, 0, pt.W]];
    const top = mine('Top'), above = rsA ? [[rsA.pt, 1, 0, p.stretcherWidth]] : sh ? [[shelfPt(sh), 1, 0, pt.W]] : top ? [[top, 1, 0, pt.W]] : [[mine('Front stretcher'), 1, 0, p.stretcherWidth], [mine('Rear stretcher'), 1, rsA0, backY]];
    const fasten = ([host, atTop, a, b], shelf) => {
      if (!host) return;
      const fem = []; jx.a = a; jx.b = b; jx.type = 'divider'; jx.side = null; jx.off = 0; jx.zr = undefined;
      jtFasten(J, fem, pt, atTop ? r3(pt.L) : 0, atTop ? 'W2' : 'W1', jtSpots(J, 'divider', a, Math.min(b, pt.W), spots, t).map(y => ({ x: r3(q.x + t / 2 - t), y: r3(y - a), m: y })), `${J.name} (${q.name.replace(/ \d+$| \((upper|lower)\)$/, '').toLowerCase()})`, jx);
      // A partition standing on a drawer stretcher meets its top face; 'inside' is the stretcher's underside. Blind holes
      // (dowels) have to start there, so the whole joint goes on the top face (a through hole is the same from either side).
      // 0.63.0: a fixed shelf takes the joint on the face the partition meets: its top under it, its underside over it.
      if (shelf) return host.ops.push(...jtShift(host, fem.map(o => ({ ...o, face: atTop ? 'bottom' : 'top' }))));
      host.ops.push(...jtShift(host, !atTop && rs && host === rs.pt && fem.some(o => o.type === 'bore' && !o.through) ? fem.map(o => ({ ...o, face: 'top' })) : fem));
    };
    // The fixed shelves are made later (qBuildExtras): a side-by-side partition fastens to them once they are there.
    if (q.cols) {
      const now = [...(shB ? [] : below), ...(sh && !rsA ? [] : above)];
      now.forEach(h => fasten(h));
      if (shB) colJoins.push(() => fasten([shelfPt(shB), 0, 0, pt.W], true));
      if (sh && !rsA) colJoins.push(() => fasten([shelfPt(sh), 1, 0, pt.W], true));
      return;
    }
    [...below, ...above].forEach(h => fasten(h));
  });
  jtNailers(c, p, part, { cm, inW, zIn0, zIn1, t, bt, D, backY }).forEach(q => joinSides('nailer', q, null, q.jz));
  // A shaped cabinet's end panels (the open end of a corner's return) join to the bottom, top and the side they butt against.
  if (hasCabShape(c) && typeof edgeJoin === 'function') edgeJoin(c, parts, { t, sh, zIn0, zIn1, H, W, spots, jx, jFor });
  if (edgePlateAt.length && typeof edgePlates === 'function') edgePlates(c, parts, edgePlateAt, hg, t, sh, warn);
  if (lay.divX !== null) {
    const J = hw(cabSet(c, 'jointU')), dv = parts.find(q => q.cabId === c.id && q.name === 'Vertical divider');
    if (J && J.kind === 'joint' && dv) ['Bottom', 'Top'].forEach((name, i) => {
      const pt = parts.find(q => q.cabId === c.id && q.name === name); if (!pt) return;
      const fem = []; jx.a = 0; jx.b = dv.W; jx.type = 'divider'; jx.side = null; jx.off = 0; jx.zr = undefined;
      jtFasten(J, fem, dv, i ? r3(dv.L) : 0, i ? 'W2' : 'W1', jtSpots(J, 'divider', 0, dv.W, spots, t).map(y => ({ x: lay.divX - t, y, m: y })), `${J.name} (divider)`, jx);
      pt.ops.push(...jtShift(pt, fem));
    });
  }
  if (pk) {
    const J = hw(cabSet(c, 'jointU'));
    if (J && J.kind === 'joint') [pk.L, pk.R].filter(Boolean).forEach(s => {
      const pp = parts.find(q => q.cabId === c.id && q.pocket === s.side); if (!pp) return;
      [['Bottom', zIn0, 0, 'W1'], ['Top', zIn1, 1, 'W2']].forEach(([name, zEnd, i, end]) => {
        if (Math.abs((i ? s.z1 : s.z0) - zEnd) > 0.01) return;
        const pt = parts.find(q => q.cabId === c.id && q.name === name); if (!pt) return;
        const fem = []; jx.a = 0; jx.b = pp.W; jx.type = 'divider'; jx.side = null; jx.off = 0; jx.zr = undefined;
        jtFasten(J, fem, pp, i ? r3(pp.L) : 0, end, jtSpots(J, 'divider', 0, pp.W, spots, t).map(y => ({ x: s.x - t, y, m: y })), `${J.name} (pocket panel)`, jx);
        pt.ops.push(...jtShift(pt, fem));
      });
    });
  }
  const jtLateCtx = { jt: (type, pt, fx, zr) => joinSides(type, pt, fx, zr, 0, Math.min(backY, pt.W)), jFor, spread: spots, addB };

  // Applied end panels. 0.58.30: a panel covers only the part of the end that shows (see panelPieces): a strip past a
  // shallower neighbour, or a panel notched around a floating shelf or a shorter cabinet beside it.
  const ps = panelFor(c), pm = mat(ps.mat) || cm;
  ['L', 'R'].forEach(sd => {
    const pcs = panelPieces(c, sd); if (!pcs) return;
    pcs.forEach((pc, i) => {
      const g = panelGeom(c, sd, pc, ps), { L, W: Wd } = g;
      const ops = (ps.type === 'routed' && ps.frame > 0 && (g.full || (!g.outline && Wd - 2 * ps.frame - g.sc > 1 && L - 2 * ps.frame > 1))) ? [{ type: 'pocket', x: ps.frame, y: ps.frame + g.sc, w: L - 2 * ps.frame, h: Wd - 2 * ps.frame - g.sc, depth: ps.pocketDepth, face: 'show', why: 'panel recess' }] : [];
      // Blind pin holes on the hidden face, lined up with the side's (the panel's y runs from its back edge).
      pinSpots.forEach(q => { const y = g.y(g.D - q.y), x = r3(q.z - pc.z0); if (g.inside(x, y)) ops.push({ type: 'bore', x, y: r3(y), dia: pinD, depth: r3(pm.thick / 2), face: 'hidden', why: 'pin hole' }); });
      const pt = part(`Applied end panel${i ? ' ' + (i + 1) : ''} (${sd})`, pm, g.L, Wd, { kind: 'applied', ops });
      if (g.outline) pt.outline = g.outline;
    });
  });
  // One rod per pin spot for each applied panel and for the cabinet beside this one on its right (each pair counted once).
  if (pinSpots.length) {
    const rods = ['L', 'R'].filter(sd => !!panelPieces(c, sd)).length * pinSpots.length
      + (typeof nearestAt === 'function' && c.wall && inRoomOf(c, () => { const n = nearestAt(c, 1); return n && n.kind === 'cab' && n.gap < 0.05; }) ? pinSpots.length : 0);
    if (rods) addB(`${fmtLen(pinD, 1)} dowel pin, ${fmtLen(t * 2, 1)} long`, rods);
  }
  // Fillers between the cabinet and a wall, in the front material
  fillersOf(c).forEach(fl => {
    const fm = mat(fillerMat(c)) || cm;
    // 0.63.4: against a wall marked Scribe, the filler is cut wider by the wall's scribe extra.
    const sx = typeof wallScribeX === 'function' ? wallScribeX(wall(fl.wallId)) : 0;
    part(sx ? `Filler (${fl.end}, scribe)` : `Filler (${fl.end})`, fm, c.cat === 'Wall' ? H : H - tk, Math.round((fl.gap + sx) * 1000) / 1000, { kind: 'filler' });
  });
  S.hardware.filter(h => h.kind === 'other' && !h.feet && h.perCabinet > 0 && (!h.cats || !h.cats.length || [].concat(h.cats).join(',').includes(c.cat))).forEach(h => {
    addB(h.name, h.perCabinet);
  });
  // Hand edits from the part editor (shape, operations, size), worked out again for this size.
  if (typeof qBuildExtras === 'function') qBuildExtras(c, parts, warn, part, { cm, sm, inW, shW: bpC ? bpC.o1 - bpC.o0 : inW, inD, t, fronts, addB, zIn0, zIn1, rails });
  colJoins.forEach(fn => fn());
  if (typeof jtLate === 'function') jtLate(c, parts, jtLateCtx);
  if (typeof jtTabSlot === 'function') jtTabSlot(c, parts, jx);
  if (typeof vBuildExtras === 'function') vBuildExtras(c, parts, warn, p, { t, inD, zIn0, zIn1, addB, pin });
  if (typeof bidBuildExtras === 'function') bidBuildExtras(c, parts, warn, part, { p, cm, addB, legs: onLegs(c, p) });
  if (c.addParts && c.addParts.length && typeof addedParts === 'function') addedParts(c, parts, warn, part, cm);
  const removed = (c.partEdits && typeof applyPartEdits === 'function') ? applyPartEdits(c, parts, warn, ptT) : [];
  // A Finished product (editor › Materials and hardware): the box parts you can see are cut from the finish material, when it is the same thickness.
  // An angled corner or shaped cabinet can't make up for a sheet of another thickness, so it only swaps to the same thickness.
  // Tab and slot parts (outlines with tabs sized from the sheet) can't either.
  const exactT = angledCorner(c) || hasCabShape(c) || parts.some(q => q.cabId === c.id && q.outline && ['topbot', 'stretcher', 'rearStretcher'].includes(q.kind));
  const swapOK = (fm, q) => Math.abs(fm.thick - q.T) <= (exactT ? 0.001 : 0.07);
  // Cut from the finish sheet: edge holes stay in the middle of the part's own (measured) thickness.
  const swapTo = (q, fm) => { const T0 = q.T; q.ops.forEach(o => { if ((o.type === 'hbore' || o.type === 'edgeslot') && Math.abs((o.inset ?? -1) - T0 / 2) < 0.002) o.inset = r3(fm.thick / 2); });
    q.mat = fm.id; q.T = fm.thick; q.grain = !!fm.grain; q.fin = true; };
  if (c.finished) {
    const fm = mat(finishMat(c)); let off = 0;
    if (fm && fm.id !== cm.id) parts.forEach(q => { if (q.cabId !== c.id || q.fin === false || q.mat !== cm.id || !['side', 'topbot', 'shelf', 'divider'].includes(q.kind)) return; if (swapOK(fm, q)) swapTo(q, fm); else off++; });
    if (off) warn.push(`Finished: ${fm.name} is not the same thickness as ${cm.name}, so ${off} box part${off === 1 ? '' : 's'} stay in ${cm.name}.`);
  }
  // Finished ends (exposed sides) and finished interiors are cut from the finish's sheet material, like a Finished product.
  { const fm = mat(finishMat(c)), keep = new Set();
    if (fm && fm.id !== cm.id) parts.forEach(q => {
      if (q.cabId !== c.id || q.fin === false || q.mat !== cm.id) return;
      const inside = c.finInt && ['side', 'topbot', 'shelf', 'divider', 'stretcher', 'rearStretcher'].includes(q.kind);
      if (!q.finEnd && !inside) return;
      if (swapOK(fm, q)) swapTo(q, fm); else keep.add(q.name);
    });
    if (keep.size) warn.push(`${fm.name} is not the same thickness as ${cm.name}, so ${[...keep].join(', ')} stay${keep.size === 1 ? 's' : ''} in ${cm.name}.`); }
  // The cabinet keeps its outside size (Ayden 2026-11-20). A side cut from a finish sheet a little thicker or thinner
  // than the cabinet material moves its inside face, so the panels between the sides get that much shorter (or longer)
  // at that end. Holes stay where they are in the cabinet: work measured from that end moves with it.
  { const sd = n => parts.find(q => q.cabId === c.id && q.kind === 'side' && q.name.startsWith(n)), sL = sd('Left side'), sR = sd('Right side');
    const dL = sL ? sL.T - t : 0, dR = sR ? sR.T - t : 0;
    if ((Math.abs(dL) > 1e-4 || Math.abs(dR) > 1e-4) && !angledCorner(c) && !hasCabShape(c)) {
      let odd = 0;
      parts.forEach(q => {
        if (q.cabId !== c.id) return;
        if (q.kind === 'back') { if (q.W > inW - 0.5 && q.W < W - 0.01) q.W = r3(q.W - dL - dR); return; }
        if (!['topbot', 'stretcher', 'rearStretcher', 'nailer', 'shelf'].includes(q.kind) || Math.abs(q.L - inW) > 0.6) return;
        if (q.outline) { odd++; return; }
        const adj = q.kind === 'shelf' && Math.abs(q.L - inW) > 0.02; // an adjustable shelf: just as much shorter
        if (adj) { q.L = r3(q.L - dL - dR); return; }
        if (Math.abs(dL) > 1e-4) jtLedgeGrow(q, 'W1', -dL);
        if (Math.abs(dR) > 1e-4) jtLedgeGrow(q, 'W2', -dR);
      });
      if (odd) warn.push(`A finished side is a different thickness from ${cm.name}; ${odd} shaped part${odd === 1 ? ' was' : 's were'} left as drawn. Check the fit by hand.`);
    } }
  // Same up and down: a bottom from a thicker sheet stays flush with the sides' bottom edge and a top with their top edge,
  // so the inside gets that much shorter. What stands between them (the back in its dados, a divider, drawer partitions,
  // a blind corner's inside panel) gets shorter to match; a drawer stretcher or fixed shelf grows half each way.
  if (!angledCorner(c) && !hasCabShape(c)) {
    const mine = n => parts.find(q => q.cabId === c.id && q.name.startsWith(n)), dOf = q => q ? q.T - t : 0;
    const bot = mine('Bottom'), topP = mine('Top') || mine('Front stretcher'), rear = mine('Rear stretcher') || mine('Top');
    const endD = z => { if (Math.abs(z - zIn0) < 2e-3) return dOf(bot); if (Math.abs(z - zIn1) < 2e-3) return dOf(topP);
      const s = rails.stretchers.find(q => Math.abs(q.z - t / 2 - z) < 2e-3 || Math.abs(q.z + t / 2 - z) < 2e-3); if (s) return dOf(s.pt) / 2;
      const f = rails.shelves.find(q => Math.abs(q.z - t / 2 - z) < 2e-3 || Math.abs(q.z + t / 2 - z) < 2e-3); if (f) return dOf(mine(`Fixed shelf ${f.row + 1}`)) / 2;
      return 0; };
    const trim = (pt, d0, d1) => { if (!pt || pt.outline) return; if (Math.abs(d0) > 1e-4) jtLedgeGrow(pt, 'W1', -d0); if (Math.abs(d1) > 1e-4) jtLedgeGrow(pt, 'W2', -d1); };
    if (Math.abs(dOf(bot)) > 1e-4 || Math.abs(dOf(topP)) > 1e-4 || rails.stretchers.some(q => Math.abs(dOf(q.pt)) > 1e-4) || Math.abs(dOf(rear)) > 1e-4) {
      const bk = parts.find(q => q.cabId === c.id && q.kind === 'back' && q.name.startsWith('Back'));
      if (bk && bk.L > zIn1 - zIn0 + 0.01 && bk.L < H - 0.01) bk.L = r3(bk.L - dOf(bot) - dOf(rear));
      if (lay.divX !== null) trim(mine('Vertical divider'), endD(zIn0), endD(zIn1));
      dParts.forEach(q => trim(parts.find(z => z.cabId === c.id && z.ops === q.ops && z.kind === 'divider'), endD(q.z0), endD(q.z1)));
      bpPieces.forEach(q => trim(q.pt, endD(q.z0), endD(q.z1)));
    }
  }
  // A finished interior is called out on every part you see inside the box.
  if (c.finInt) parts.forEach(q => { if (q.cabId === c.id && ['side', 'topbot', 'back', 'shelf', 'divider', 'stretcher', 'rearStretcher'].includes(q.kind)) q.name += ' (finished inside)'; });
  return { parts, bom, warn, fronts, inD, inW, removed };
}
function allParts() {
  const out = [];
  S.cabinets.forEach(c => { if (!c.noCut) out.push(...buildParts(c).parts); });
  return out;
}

/* ---------- Countertop runs ---------- */
// bridges: spans a run carries on over without a cabinet (a dishwasher under the countertop). A run that is
// only bridges is left out; one that starts on a bridge takes the height of the first cabinet after it.
function runsBy(filter, keyOf, bridges) {
  const runs = [];
  S.walls.forEach(w => [1, -1].forEach(side => {
    const cs = S.cabinets.filter(c => c.wall === w.id && c.side === side && filter(c)).concat((bridges || []).filter(b => b.wall === w.id && b.side === side)).sort((a, b) => a.off - b.off);
    let cur = null;
    cs.forEach(c => {
      if (c.bridge) {
        if (cur && c.off <= cur.end + 0.25) { cur.end = Math.max(cur.end, c.off + c.w); cur.d = Math.max(cur.d, c.d); }
        else { cur = { wall: w.id, side, start: c.off, end: c.off + c.w, top: null, bottom: 0, d: c.d, cabs: [], k: null }; runs.push(cur); }
        return;
      }
      // A 45° or 90° corner is only its leg deep along its own wall; its return leg is covered from the other wall (cornerBridges).
      // 0.60.8: a corner filler in an empty corner is as deep as the cabinets on its own wall (the rest of it is behind the
      // other wall's cabinets, carried by a bridge on that wall).
      const cd = angledCorner(c) ? cornerLeg(c) : cfLeg(c, true) || c.d;
      const top = (typeof apronTop === 'function' && apronTop(c)) || c.elev + c.h, k = keyOf(c), fl = fillersOf(c), s0 = Math.min(c.off, ...fl.map(x => x.a0)), s1 = Math.max(c.off + c.w, ...fl.map(x => x.a1));
      if (cur && s0 <= cur.end + 0.25 && (cur.top === null || (Math.abs(top - cur.top) < 0.01 && cur.k === k))) {
        if (cur.top === null) { cur.top = top; cur.k = k; cur.bottom = c.elev; }
        cur.end = Math.max(cur.end, s1); cur.d = Math.max(cur.d, cd + (c.outset || 0)); cur.bottom = Math.min(cur.bottom, c.elev); cur.cabs.push(c.id);
      }
      else { cur = { wall: w.id, side, start: s0, end: s1, top, bottom: c.elev, d: cd + (c.outset || 0), cabs: [c.id], k }; runs.push(cur); }
    });
  }));
  return runs.filter(r => r.cabs.length);
}
// Does this end of a top butt a wall (a wall the run's wall meets there, or a wall cap)? Open wall ends, cabinets and
// appliances don't count.
function ctWallEnd(r, e) {
  const w = wall(r.wall); if (!w) return false;
  const L = wg(w).L, at = e === 'S' ? r.start : r.end, f = w.thick / 2;
  if (e === 'S' && at <= f + 0.5) return wallEndJoined(w, 'S');
  if (e === 'E' && at >= L - f - 0.5) return wallEndJoined(w, 'E');
  return capsOf(w).some(cp => cp.side === r.side && Math.abs((e === 'S' ? cp.a1 : cp.a0) - at) < 0.5 && cp.height > r.top + 0.01);
}
// Is a run end against a wall or another cabinet? "at" is the along-wall position of that end.
function endBlocked(r, at, dir) {
  const w = wall(r.wall), L = wg(w).L;
  if (at <= w.thick / 2 + 0.5 || at >= L - w.thick / 2 - 0.5) return true;
  if (capsOf(w).some(cp => cp.side === r.side && (Math.abs(cp.a0 - at) < 0.5 || Math.abs(cp.a1 - at) < 0.5) && cp.height > r.bottom + 0.01)) return true;
  if (typeof fixtBlocksEnd === 'function' && fixtBlocksEnd(r, at, dir)) return true;
  return S.cabinets.some(k => k.wall === r.wall && k.side === r.side && !r.cabs.includes(k.id) &&
    k.elev < r.top - 0.01 && k.elev + k.h > r.bottom + 0.01 && Math.abs((dir < 0 ? k.off + k.w : k.off) - at) < 0.5);
}
// The return leg of each 45° or 90° base corner, as a span on the wall it comes out along, so the top on that wall
// carries on over it to the corner (and the corner joint between the two tops is found like any other).
// 0.60.8: a corner filler (Ayden's Mozaik one, in an empty corner) has the same: its depth along the other wall, as deep
// as the cabinets there.
const cfLeg = (c, own) => typeof isCornerFiller === 'function' && isCornerFiller(c) ? (n => own ? c.d - n[1] : c.w - n[0])(cfNotch(c)) : 0;
function cornerBridges() {
  const out = [];
  S.cabinets.forEach(c => {
    if (c.cat !== 'Base' || !(angledCorner(c) || cfLeg(c))) return;
    const leg = angledCorner(c) ? cornerLeg(c) : cfLeg(c);
    const poly = cabPoly(c); if (!poly) return;
    S.walls.forEach(w2 => {
      if (w2.id === c.wall) return;
      const g = wg(w2), f = w2.thick / 2;
      [1, -1].forEach(side => {
        const along = poly.map(q => (q.x - w2.x1) * g.u.x + (q.y - w2.y1) * g.u.y), out2 = poly.map(q => ((q.x - w2.x1) * g.n.x + (q.y - w2.y1) * g.n.y) * side);
        const o0 = Math.min(...out2); if (o0 > f + 0.6 || o0 < -0.6 || Math.max(...out2) - f < leg - 0.01) return;
        const a0 = Math.min(...along), a1 = Math.max(...along);
        if (a0 < -0.5 || a1 > g.L + 0.5) return;
        out.push({ bridge: true, corner: c.id, wall: w2.id, side, off: a0, w: a1 - a0, d: leg + (c.outset || 0) });
      });
    });
  });
  return out;
}
// 0.61.3: worked out with automatic end panel pieces left out, so tops and molding are as with panels on the cabinets.
function countertopRuns() { return withoutPieces(countertopRunsAll); }
function countertopRunsAll() {
  // Automatic runs on base cabinets (unless the room turned them off), then any tops placed by hand.
  const runs = curRoom().autoTops === false ? [] : runsBy(c => c.cat === 'Base' && !c.noTop, () => 'top', (typeof fixtUnderList === 'function' ? fixtUnderList() : []).concat(cornerBridges()));
  runs.forEach(r => {
    r.key = r.wall + ':' + r.side + ':' + r.cabs[0];
    const o = S.ctRuns[r.key] || {}; r.o = o;
    r.tpl = countertop(o.top || roomSet('countertop'));
    r.on = o.off !== true;
    r.blockS = endBlocked(r, r.start, -1); r.blockE = endBlocked(r, r.end, 1);
    r.ovS = has(o, 'ovS') ? o.ovS : (r.blockS ? 0 : r.tpl.endOverhang);
    r.ovE = has(o, 'ovE') ? o.ovE : (r.blockE ? 0 : r.tpl.endOverhang);
    r.len = (r.end - r.start) + r.ovS + r.ovE;
    r.depth = r.d + r.tpl.frontOverhang;
    r.thick = r.tpl.thick;
  });
  (S.genTops || []).forEach(g => {
    if (!wall(g.wall)) return;
    const tpl = countertop(g.top || roomSet('countertop')), start = +g.off || 0, len = Math.max(0.25, +g.len || 0), depth = +g.depth || 25.5;
    runs.push({ generic: g.id, key: 'gen:' + g.id, name: g.name, wall: g.wall, side: +g.side || 1, start, end: start + len, top: +g.z || 0, bottom: +g.z || 0, d: depth - tpl.frontOverhang, cabs: [], o: {}, tpl, on: true, ovS: 0, ovE: 0, len, depth, thick: +g.thick || tpl.thick });
  });
  // Corners where two tops meet: mitered or one running through (ctjoint.js). Reshapes the tops and their lengths.
  runs.corners = typeof ctjApply === 'function' ? ctjApply(runs) : [];
  // 0.59.1 (Ayden 2026-11-19, right-click a top's edge in the Tops tab): each top's backsplash height (bs on the run, or
  // the style's) and waterfall ends (wfS / wfE: the top turns down to the floor at that end, only where no corner joins).
  // area: what the top is priced and counted by, its face plus any waterfall panels.
  runs.forEach(r => {
    const st = r.generic ? (S.genTops || []).find(g => g.id === r.generic) || {} : r.o || {};
    // An island top (on an island wall or a see-through island line) gets no backsplash unless one is set on it
    // by right-click (Ayden 2026-11-19: "it wont ever be there"); every job, old ones too, since it is worked out here.
    const wl = wall(r.wall), island = !!(wl && (wl.island || wl.hidden));
    r.island = island;
    r.bs = has(st, 'bs') && st.bs !== '' ? Math.max(0, +st.bs || 0) : island ? 0 : Math.max(0, +r.tpl.backsplash || 0);
    const j = r.joints || {}, wfH = r.top + r.thick;
    r.wfS = !!st.wfS && !j.S; r.wfE = !!st.wfE && !j.E;
    // 0.60.8 (Ayden 2026-11-20: "if a countertop is against a wall give it backsplash on the left or right or whatever side
    // touches"): an end that butts a wall (no corner joint, no waterfall) gets a side splash as tall as the backsplash.
    // Right-click the end on the Tops tab to take it off (ssS / ssE false) or put one on.
    ['S', 'E'].forEach(e => { r['ss' + e] = r.bs > 0 && !j[e] && !r['wf' + e] && (has(st, 'ss' + e) ? !!st['ss' + e] : ctWallEnd(r, e)); });
    r.area = r.len * r.depth + ((r.wfS ? 1 : 0) + (r.wfE ? 1 : 0)) * wfH * r.depth;
    // 0.62.6 (Ayden 2026-11-24, Argil butler's pantry: "backsplash into cabinet"): the backsplash stops at a cabinet standing
    // on the countertop against the wall (an open tall on the counter); bsSegs are the stretches along the wall it runs.
    r.bsSegs = r.bs > 0 ? bsSegsOf(r, wfH) : [];
  });
  return runs;
}

// Stretches [a0, a1] along the wall where a top's backsplash runs: its length less the cabinets sitting on the top.
function bsSegsOf(r, onTop) {
  const cut = S.cabinets.filter(k => k.wall === r.wall && k.side === r.side && !k.autoOf && Math.abs((k.elev || 0) - onTop) < 1 && !(k.outset > 1))
    .map(k => [Math.max(r.start, k.off), Math.min(r.end, k.off + k.w)]).filter(([a, b]) => b - a > 0.01).sort((x, y) => x[0] - y[0]);
  const out = []; let at = r.start;
  cut.forEach(([a, b]) => { if (a - at > 0.25) out.push([r3(at), r3(a)]); at = Math.max(at, b); });
  if (r.end - at > 0.25) out.push([r3(at), r3(r.end)]);
  return out;
}

/* ---------- Molding runs ---------- */
// Auto runs follow the cabinets: a run breaks where the cabinet depth or top changes. Each end either dies into a
// wall or a cabinet that covers it, turns back along the cabinet side to the wall (a return), turns back only as far
// as a shallower neighbor's face (a short return), or meets the run on the other wall of an inside corner.
// Every run carries: fz (front of the doors), extS / extE (how far the front piece goes past the run's ends),
// backS / backE (where a return stops, out from the wall face), front, returns and len.
const moldCabD = c => (angledCorner(c) ? cornerLeg(c) : c.d) + (c.outset || 0);
// 0.61.3: worked out with automatic end panel pieces left out, so tops and molding are as with panels on the cabinets.
function moldingRuns() { return withoutPieces(moldingRunsAll); }
function moldingRunsAll() {
  const runs = runsBy(c => !!c.molding && !!molding(c.molding), c => c.molding + '@' + Math.round(moldCabD(c) * 16));
  runs.forEach(r => {
    r.k = String(r.k).split('@')[0];
    const m = molding(r.k), w = wall(r.wall);
    r.m = m;
    r.h = m.fill ? Math.max(0.5, Math.min(12, w.height - r.top)) : m.h;
    r.z = m.bottom ? r.bottom - r.h : r.top;
    r.fz = r.d + 0.75;
    // The heights a neighbor has to fill to stop this run: the molding itself plus the edge it sits on.
    r.lo = m.bottom ? r.z : r.top - 0.01; r.hi = m.bottom ? r.bottom + 0.01 : r.z + r.h;
  });
  runs.forEach(r => {
    ['S', 'E'].forEach(e => {
      const at = e === 'S' ? r.start : r.end, n = moldEnd(r, at, e === 'S' ? -1 : 1, runs);
      r['ret' + e] = n.ret; r['back' + e] = n.back || 0; r['ext' + e] = n.ret ? r.m.d : 0;
    });
  });
  moldCorners(runs);
  runs.forEach(moldLens);
  (S.genMolds || []).forEach(g => {
    const m = molding(g.mold || roomSet('molding')); if (!m || !wall(g.wall)) return;
    const start = +g.off || 0, run = Math.max(0.25, +g.len || 0), d = +g.d || 0, retS = !!g.retS, retE = !!g.retE;
    const r = { generic: g.id, wall: g.wall, side: +g.side || 1, start, end: start + run, top: +g.z || 0, bottom: +g.z || 0, d, cabs: [], k: m.id, m, retS, retE, h: m.h, z: +g.z || 0,
      fz: d + 0.75, backS: 0, backE: 0, extS: retS ? m.d : 0, extE: retE ? m.d : 0 };
    moldLens(r); runs.push(r);
  });
  return runs;
}
function moldLens(r) {
  const md = r.m.d;
  r.front = (r.end - r.start) + r.extS + r.extE;
  r.returns = (r.retS ? Math.max(0, r.fz - r.backS) + md : 0) + (r.retE ? Math.max(0, r.fz - r.backE) + md : 0);
  r.len = r.front + r.returns;
}
// A run's outline in the plan: the front piece and its returns.
function moldPlanPts(r) {
  const w = wall(r.wall); if (!w) return null;
  const g = wg(w), f = w.thick / 2, md = r.m.d, P = (a, b) => wallPt(w, g, r.side, a, f + b);
  const a0 = r.start - r.extS, a1 = r.end + r.extE, fz = r.fz, fo = fz + md;
  return [...(r.retS ? [P(a0, r.backS)] : [P(a0, fz)]), P(a0, fo), P(a1, fo), ...(r.retE ? [P(a1, r.backE), P(a1 - md, r.backE), P(a1 - md, fz)] : [P(a1, fz)]), ...(r.retS ? [P(a0 + md, fz), P(a0 + md, r.backS)] : [])];
}
// One end of an auto run. dir -1 is the start, 1 the end.
function moldEnd(r, at, dir, runs) {
  const w = wall(r.wall), L = wg(w).L, f = w.thick / 2, band = { wall: r.wall, side: r.side, top: r.hi, bottom: r.lo };
  // A wall end stops it only where another wall joins (a wall that just ends leaves the cabinet side open).
  if (at <= f + 0.5 && wallEndJoined(w, 'S')) return { ret: false };
  if (at >= L - f - 0.5 && wallEndJoined(w, 'E')) return { ret: false };
  if (capsOf(w).some(cp => cp.side === r.side && (Math.abs(cp.a0 - at) < 0.5 || Math.abs(cp.a1 - at) < 0.5) && cp.height > r.lo)) return { ret: false };
  if (typeof fixtBlocksEnd === 'function' && fixtBlocksEnd(band, at, dir)) return { ret: false };
  // The deepest cabinet right beside this end that reaches the molding's height.
  let nd = -1;
  S.cabinets.forEach(k => {
    if (k.wall !== r.wall || k.side !== r.side || r.cabs.includes(k.id) || !(k.elev < r.hi && k.elev + k.h > r.lo)) return;
    const fl = fillersOf(k), e = dir < 0 ? Math.max(k.off + k.w, ...fl.map(x => x.a1)) : Math.min(k.off, ...fl.map(x => x.a0));
    if (Math.abs(e - at) < 0.5) nd = Math.max(nd, moldCabD(k));
  });
  if (nd < 0) return { ret: true, back: 0 };
  if (nd >= r.d - 0.01) return { ret: false };
  // A shallower neighbor: the return comes back to its doors, or to the face of its own molding.
  const o = runs.find(q => q !== r && q.wall === r.wall && q.side === r.side && Math.abs((dir < 0 ? q.end : q.start) - at) < 0.5 && q.lo < r.hi && q.hi > r.lo);
  return { ret: true, back: o ? o.fz + o.m.d : nd + 0.75 };
}
// Inside corners: where runs on two walls that meet come together, the longer one runs through to the other's back
// face and the other stops against its front, so they never overlap or run over the other wall's cabinets.
function moldCorners(runs) {
  const X = (a, b) => a.x * b.y - a.y * b.x;
  const meet = (p1, u1, p2, u2) => { const k = X(u1, u2); if (Math.abs(k) < 1e-9) return null; const t = X({ x: p2.x - p1.x, y: p2.y - p1.y }, u2) / k; return { x: p1.x + u1.x * t, y: p1.y + u1.y * t }; };
  const F = r => { const w = wall(r.wall), g = wg(w), f = w.thick / 2; return { r, w, g, f, at: (a, b) => wallPt(w, g, r.side, a, f + b), along: q => (q.x - w.x1) * g.u.x + (q.y - w.y1) * g.u.y, out: q => ((q.x - w.x1) * g.n.x + (q.y - w.y1) * g.n.y) * r.side - f }; };
  const fr = runs.filter(r => wall(r.wall)).map(F), used = new Set();
  for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) {
    const A = fr[i], B = fr[j];
    if (A.w.id === B.w.id || Math.abs(X(A.g.u, B.g.u)) < 0.25 || Math.abs(A.r.z - B.r.z) > 0.5) continue;
    // Along each run: where the other run's back face and front face cross its molding.
    const cross = (P, Q, dq) => { const p = meet(P.at(0, P.r.fz + P.r.m.d / 2), P.g.u, Q.at(0, dq), Q.g.u); return p && P.along(p); };
    const aIn = cross(A, B, B.r.fz), aOut = cross(A, B, B.r.fz + B.r.m.d), bIn = cross(B, A, A.r.fz), bOut = cross(B, A, A.r.fz + A.r.m.d);
    if ([aIn, aOut, bIn, bOut].some(v => v == null)) continue;
    // Which end of each run is at the corner: it has to reach from about the other's front face back to its wall.
    const endOf = (P, tIn, tOut, reach) => {
      const lo = Math.min(tIn, tOut), hi = Math.max(tIn, tOut), dirOut = tOut > tIn ? 1 : -1;
      const near = x => dirOut > 0 ? x >= lo - reach - 0.5 && x <= hi + 0.5 : x <= hi + reach + 0.5 && x >= lo - 0.5;
      if (near(P.r.end) && P.r.start < lo - 0.5 && dirOut < 0) return 'E';
      if (near(P.r.start) && P.r.end > hi + 0.5 && dirOut > 0) return 'S';
      return null;
    };
    const eA = endOf(A, aIn, aOut, B.r.fz), eB = endOf(B, bIn, bOut, A.r.fz); if (!eA || !eB) continue;
    if (used.has(A.r.cabs[0] + eA) || used.has(B.r.cabs[0] + eB)) continue;
    // Both runs have to be in front of the other's wall.
    const far = (P, e) => P.at(e === 'E' ? P.r.start : P.r.end, P.r.fz / 2);
    if (A.out(far(B, eB)) < -0.5 || B.out(far(A, eA)) < -0.5) continue;
    used.add(A.r.cabs[0] + eA); used.add(B.r.cabs[0] + eB);
    // The run that goes further into the corner runs through; ties go to the longer run.
    const into = (P, e, tIn) => e === 'E' ? P.r.end - tIn : tIn - P.r.start;
    const dA = into(A, eA, aIn), dB = into(B, eB, bIn);
    const aT = Math.abs(dA - dB) > 0.25 ? dA > dB : (A.r.end - A.r.start) >= (B.r.end - B.r.start);
    const set = (P, e, t) => { P.r['ret' + e] = false; P.r['back' + e] = 0; P.r['ext' + e] = e === 'E' ? t - P.r.end : P.r.start - t; };
    if (aT) { set(A, eA, aIn); set(B, eB, bOut); } else { set(B, eB, bIn); set(A, eA, aOut); }
  }
}
