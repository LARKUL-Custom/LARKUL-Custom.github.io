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
  const w = wall(c.wall); if (!w) return [];
  const g = wg(w), s = c.side, f = w.thick / 2 + (c.outset || 0), depth = c.d + panelFor(c).frontOverhang;
  return panelSpans(c, explicitOnly).map(({ end, a: [a0, a1] }) => { const dp = depth - c.d + endDepth(c, end); return [wallPt(w, g, s, a0, f), wallPt(w, g, s, a1, f), wallPt(w, g, s, a1, f + dp), wallPt(w, g, s, a0, f + dp)]; });
}
// Filler strips in plan: flush with the fronts, across the gap to the wall.
function fillerPolys(c) {
  const w = wall(c.wall); if (!w) return [];
  const g = wg(w), s = c.side, f = w.thick / 2 + (c.outset || 0), t = (mat(fillerMat(c)) || { thick: 0.75 }).thick;
  return fillersOf(c).map(fl => [wallPt(w, g, s, fl.a0, f + c.d), wallPt(w, g, s, fl.a1, f + c.d), wallPt(w, g, s, fl.a1, f + c.d + t), wallPt(w, g, s, fl.a0, f + c.d + t)]);
}
const fillerMat = c => finishRole(c, 'sheet');
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
function computeFronts(c, p) {
  if (c.moz && typeof isMoz === 'function' && isMoz(c)) return [];
  p = p || effParams(c);
  // Face frame cabinets: fronts overlay the frame's openings.
  const ffr = faceFrame(c); if (ffr) return ffFronts(c, p, ffr);
  const tk = hasToe(c) ? p.toeKickHeight : 0;
  const zb = tk + p.frontBottomReveal, zt = c.h - p.frontTopReveal;
  const gap = p.frontGap, bw = blindCorner(c) ? blindWidth(c) : 0;
  // A blind corner's fronts only cover the open part; the blind side has its blind panel.
  const xl = bw && cornerSide(c) === 'L' ? bw + gap : p.frontSideReveal, xr = bw && cornerSide(c) === 'R' ? c.w - bw - gap : c.w - p.frontSideReveal;
  const rows = c.rows || [];
  const fixed = rows.reduce((a, r) => a + (r.h === '*' ? 0 : (+r.h || 0)), 0);
  const stars = rows.filter(r => r.h === '*').length;
  const avail = (zt - zb) - gap * Math.max(0, rows.length - 1);
  const starH = stars ? Math.max(0, (avail - fixed) / stars) : 0;
  const out = []; let z = zt;
  if (angledCorner(c)) {
    const zs = rows.map(r => { const h = r.h === '*' ? starH : (+r.h || 0), z1 = z; z = z1 - h - gap; return [z1 - h, z1]; });
    return Object.assign(cornerFronts(c, p, rows, zs), { overfull: fixed > avail + 0.001 });
  }
  rows.forEach((r, ri) => {
    const h = r.h === '*' ? starH : (+r.h || 0), z1 = z, z0 = z - h;
    const n = Math.max(1, r.count | 0), fw = ((xr - xl) - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const x0 = xl + i * (fw + gap);
      let hinge = null;
      if (r.type === 'door') hinge = n === 1 ? (r.hinge === 'L' || r.hinge === 'R' ? r.hinge : p.hingeSide) : n === 2 ? (i === 0 ? 'L' : 'R') : (i % 2 ? 'R' : 'L');
      out.push({ type: r.type, row: ri, idx: i, n, x0, x1: x0 + fw, z0, z1, hinge, style: r.style || '', ...(r.pull ? { pull: true } : {}) });
    }
    z = z0 - gap;
  });
  out.overfull = fixed > avail + 0.001;
  return out;
}
/* ---------- Doors stop at what they hit ---------- */
// How far a drawer slides out when its cabinet is opened.
const drawerTravel = c => Math.max(4, Math.min(c.d - 3, 21)) * 0.85;
let doorLimCache = {};
function clearDoorLimits() { doorLimCache = {}; }
const segHit = (a, b, c, d) => { const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
// The widest a door can swing (radians, up to 1.75) before it runs into a wall, a cabinet that sticks out past it,
// or an open drawer at the same height. Plan geometry; heights only decide what is in the way.
function doorLimit(c, f) {
  if (f.face) return 1.75;
  const key = c.id + ':' + f.row + ':' + f.idx; if (key in doorLimCache) return doorLimCache[key];
  const MAX = 1.75, w = wall(c.wall); if (!w) return (doorLimCache[key] = MAX);
  const g = wg(w), fb = w.thick / 2 + (c.outset || 0) + c.d + 0.75, z0 = (c.elev || 0) + f.z0, z1 = (c.elev || 0) + f.z1;
  const P = (cc, ww, gg, x, b, f0) => wallPt(ww, gg, cc.side, cc.side === 1 ? cc.off + x : cc.off + cc.w - x, f0 + b);
  const over = (a0, a1) => a0 < z1 - 0.25 && a1 > z0 + 0.25, obs = [];
  S.cabinets.forEach(o => {
    if (o.id === c.id) return;
    const poly = cabPoly(o); if (poly && over(o.elev || 0, (o.elev || 0) + o.h)) obs.push(poly);
  });
  S.cabinets.forEach(o => {
    if (!ui.open[o.id]) return;
    const ow = wall(o.wall); if (!ow) return;
    const og = wg(ow), of = ow.thick / 2 + (o.outset || 0) + o.d, tr = drawerTravel(o);
    computeFronts(o).forEach(d => {
      if (d.type !== 'drawer' || (o.id === c.id && d.row === f.row) || !over((o.elev || 0) + d.z0, (o.elev || 0) + d.z1)) return;
      obs.push([P(o, ow, og, d.x0, 0, of), P(o, ow, og, d.x1, 0, of), P(o, ow, og, d.x1, tr, of), P(o, ow, og, d.x0, tr, of)]);
    });
  });
  S.walls.forEach(ww => { if (ww !== w) { const gg = wg(ww), t = ww.thick / 2; obs.push([wallPt(ww, gg, 1, 0, -t), wallPt(ww, gg, 1, gg.L, -t), wallPt(ww, gg, 1, gg.L, t), wallPt(ww, gg, 1, 0, t)]); }
    // End caps are short walls too, on any wall, including the one this cabinet hangs on.
    capsOf(ww).forEach(cp => { if (cp.height === undefined || over(0, cp.height)) obs.push(capPoly(ww, cp)); }); });
  const R = f.hinge === 'R', hx = R ? f.x1 : f.x0, fw = f.x1 - f.x0, dir = R ? -1 : 1, h = P(c, w, g, hx, 0, fb);
  // The door's back face and its outer face (3/4" thick) both have to stay clear.
  const T = 0.75, hits = a => [0, T].some(t => { const hh = P(c, w, g, hx + dir * t * Math.sin(a), -t * Math.cos(a), fb), e = P(c, w, g, hx + dir * (fw * Math.cos(a) + t * Math.sin(a)), fw * Math.sin(a) - t * Math.cos(a), fb); return obs.some(poly => inPoly(e, poly) || poly.some((q, i) => segHit(hh, e, q, poly[(i + 1) % poly.length]))); });
  let lim = MAX;
  for (let a = 0.04; a <= MAX + 1e-9; a += 0.02) if (hits(a)) { lim = Math.max(0, a - 0.06); break; }
  // Two doors hinged on the same line, swinging away from each other (side-by-side cabinets),
  // would cross past square, so each stops at 90°.
  const wx = (cc, x) => cc.side === 1 ? cc.off + x : cc.off + cc.w - x, lean = (cc, ff) => (ff.hinge === 'R' ? -1 : 1) * cc.side;
  const hxW = wx(c, hx), myLean = lean(c, f);
  if (lim > Math.PI / 2 && S.cabinets.some(o => o.id !== c.id && o.wall === c.wall && o.side === c.side && Math.abs((o.outset || 0) + o.d - (c.outset || 0) - c.d) < 3
    && computeFronts(o).some(d => d.type === 'door' && over((o.elev || 0) + d.z0, (o.elev || 0) + d.z1) && lean(o, d) === -myLean && Math.abs(wx(o, d.hinge === 'R' ? d.x1 : d.x0) - hxW) < 2.5))) lim = Math.PI / 2 - 0.02;
  return (doorLimCache[key] = lim);
}
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
  return doorStyle(f.style && S.doorStyles.some(d => d.id === f.style) ? f.style : f.type === 'door' ? (c.cat === 'Wall' && dt.wallDoor) || dt.door : f.type === 'drawer' ? drawerSlotStyle(c, f, dt) : dt.falseFront);
}
function frontStyle(c, f) {
  const dt = doorTpl(cabSet(c, 'doorT'));
  let ds = frontBaseStyle(c, f, dt);
  const fh = f.z1 - f.z0, fw = f.x1 - f.x0;
  ds = withFinish(sizeRuleStyle(ds, fw, fh), c);
  const { nR, nS, mrs, mss } = doorMids(ds, fw, fh), sum = a => a.reduce((x, y) => x + y, 0);
  const mp = +ds.minPanel > 0 ? +ds.minPanel : 2, needH = 2 * ds.rail + sum(mrs) + (nR + 1) * mp, needW = 2 * ds.stile + sum(mss) + (nS + 1) * mp;
  const framed = ds.type !== 'slab' && fh >= Math.max(needH, f.type === 'door' ? 0 : dt.minFrameHeight || 0) && fw >= needW;
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
  const p = hwPick(cabSet(c, 'pull') || (f.type === 'door' ? dt.pull : dt.drawerPull), 'pull'); if (!p) return null;
  const fh = f.z1 - f.z0, fw = f.x1 - f.x0, len = p.lengthMM * MM;
  if (f.type !== 'door') {
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
function pullHoles(pp) {
  const cc = pp.hw.ccMM * MM, out = [];
  if (!cc) out.push({ x: pp.z, y: pp.x });
  else if (pp.vertical) out.push({ x: pp.z - cc / 2, y: pp.x }, { x: pp.z + cc / 2, y: pp.x });
  else out.push({ x: pp.z, y: pp.x - cc / 2 }, { x: pp.z, y: pp.x + cc / 2 });
  return out.map(h => ({ type: 'bore', x: h.x, y: h.y, dia: pp.hw.holeDiaMM * MM, depth: 0.75, face: 'front', through: true, why: 'pull' }));
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
  const doorZones = fronts.filter(f => (f.type === 'door' || f.type === 'open') && f.idx === 0).map(f => Object.assign([Math.max(f.z0, zIn0), Math.min(f.z1, zIn1)], { row: f.row }));
  const zones = doorZones.length ? doorZones : (fronts.length ? [] : [[zIn0, zIn1]]);
  const low = zones.length ? zones[zones.length - 1] : null, ins = c.inserts || [];
  const hasDoors = fronts.some(f => f.type === 'door');
  const out = { t, zIn0, zIn1, inW, zones, low, spacer: Math.max(hasDoors && !faceFrame(c) ? t : 0, ffOverhang(c, t)), divX: null, rollouts: [], trays: [], bins: [], lazy: [], pulls: [], bom: [] };
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
  return out;
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
function drawerBoxAt(c, p, f) {
  const sl = hwPick(cabSet(c, 'slide'), 'slide'); if (!sl || f.face) return null;
  const mt = cabMatT(cabSet(c, 'cabMatT')), dmt = drawerMatT(cabSet(c, 'drawerMatT'));
  const cm = mat(mt.carcass) || S.materials[0], t = cm.thick, bm = mat(mt.back) || cm, bt = bm.thick;
  const ffr = faceFrame(c), W = c.w, D = c.d - (ffr ? ffr.thick : 0), tk = hasToe(c) ? p.toeKickHeight : 0, inD = D - p.backInset - bt, inW = W - 2 * t;
  const nominal = nominalFor(sl, inD); if (!nominal) return null;
  const ffOpen = !!(ffr && f.open && !blindCorner(c)), z0 = Math.max(ffOpen ? f.open.z0 : f.z0, tk + t), z1 = Math.min(ffOpen ? f.open.z1 : f.z1, c.h - t);
  const bh = Math.floor(((z1 - z0) - (sl.bottomClearMM + sl.topClearMM) * MM) * 4) / 4; if (bh < 2.5) return null;
  const bwD = blindCorner(c) ? blindWidth(c) : 0;
  let ox0, openW;
  if (ffOpen) { ox0 = f.open.x0; openW = f.open.x1 - f.open.x0; }
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
  if (!type) return { type, gd: bd, trim: 0, notchW: 0, notchH: 0, backH: bh - rec - bt, botL: len - st + bd, botW: ow - 2 * st + 2 * bd };
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
  if (c.moz && typeof isMoz === 'function' && isMoz(c)) return mozBuildParts(c);
  const p = effParams(c), lbl = LBL[c.id] || c.name;
  const mt = cabMatT(cabSet(c, 'cabMatT')), dmt = drawerMatT(cabSet(c, 'drawerMatT'));
  const cm = mat(mt.carcass) || S.materials[0], t = cm.thick;
  const bm = mat(mt.back) || cm, bt = bm.thick, sm = mat(mt.shelf) || cm, tkm = mat(mt.toeKick) || cm;
  const pin = hwPick(roomSet('shelfpin'), 'shelfpin'), hg = hwPick(cabSet(c, 'hinge'), 'hinge'), sl = hwPick(cabSet(c, 'slide'), 'slide');
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
  const plateZones = [];
  const fronts = computeFronts(c, p);
  if (fronts.overfull) warn.push('Front rows are taller than the cabinet. Reduce a fixed row height.');

  const frontPart = (label, f) => {
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
      // Plates on a corner's faces go on the box beside the door, not on its sides; that drilling is not made yet.
      if (!f.face && !ffr) hinges.forEach(hp => {
        const z = f.z0 + hp, ops = f.hinge === 'L' ? leftOps : rightOps;
        hg.plateHoles.forEach(ph => ops.push({ type: 'bore', x: z + ph.dz * MM, y: ph.y * MM, dia: ph.dia * MM, depth: ph.depth * MM, face: 'inside', why: 'hinge plate' }));
        if (hg.plateHoles.length) { const ys = hg.plateHoles.map(ph => ph.y * MM), half = Math.max(25, ...hg.plateHoles.map(ph => Math.abs(ph.dz) + 10)) * MM;
          plateZones.push({ ops, z0: z - half, z1: z + half, y0: Math.min(...ys) - 12 * MM, y1: Math.max(...ys) + 12 * MM }); }
      });
    }
    // Cup holes in front-local coordinates, y from the left edge as seen from the front.
    const sgn = f.hinge === 'R' ? -1 : 1, edgeY = f.hinge === 'R' ? fw : 0;
    const cupOps = [];
    hinges.forEach(hp => {
      cupOps.push({ type: 'bore', x: hp, y: edgeY + sgn * cupY, dia: hg.cupDiaMM * MM, depth: hg.cupDepthMM * MM, face: 'back', why: 'hinge cup' });
      (hg.cupExtra || []).forEach(e => cupOps.push({ type: 'bore', x: hp + e.dx * MM, y: edgeY + sgn * (cupY + e.dy * MM), dia: e.dia * MM, depth: e.depth * MM, face: 'back', why: 'hinge dowel' }));
    });
    const pp = pullPlacement(c, f), pullOps = pp ? pullHoles(pp) : [];
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
      const z0 = Math.max(ffOpen ? f.open.z0 : f.z0, zIn0), z1 = Math.min(ffOpen ? f.open.z1 : f.z1, zIn1);
      const boxBot = z0 + sl.bottomClearMM * MM;
      const bh = Math.floor(((z1 - z0) - (sl.bottomClearMM + sl.topClearMM) * MM) * 4) / 4;
      if (bh < 2.5) { warn.push(`Drawer opening at ${fmtLen(f.z0, 1)} is too short for a drawer box.`); return; }
      // A blind corner's drawer runs beside the blind side, on a partition the height of its opening.
      const bwD = blindCorner(c) ? blindWidth(c) : 0;
      if (bwD) part('Drawer partition', cm, r3(z1 - z0), r3(inD), { kind: 'divider' });
      // Behind a face frame the drawer fits the frame's opening; spacers on the sides bring the runners out to it.
      const openW = ffOpen ? f.open.x1 - f.open.x0 : bwD ? W - t - bwD : f.n > 1 ? (inW - (f.n - 1) * t) / f.n : inW;
      const ffSp = ffOpen && f.n === 1 ? Math.max(ffr.ls, ffr.rs) - t : 0;
      if (f.n > 1 && f.idx === 0) warn.push('Side-by-side drawers need a center divider. Dividers are not generated yet.');
      const ow = openW - sl.widthDeductMM * MM, rec = sl.bottomRecessMM * MM, bdT = dbm.thick, bd = p.drawerBottomDado;
      const bx = drawerBoxBuild(dmt, st, bdT, bd, rec, nominal, ow, bh);
      const groove = len => ({ type: 'groove', x1: 0, y1: rec + bdT / 2, x2: len, y2: rec + bdT / 2, width: bdT, depth: bx.gd, face: 'inside', why: 'drawer bottom' });
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
        leftOps.push(op); rightOps.push({ ...op });
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
    const groove = len => ({ type: 'groove', x1: 0, y1: rec + bdT / 2, x2: len, y2: rec + bdT / 2, width: bdT, depth: bx.gd, face: 'inside', why: 'roll-out bottom' });
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
  let shelves = lay.perRow ? lay.perRow.reduce((a, r) => a + r.k, 0) : Math.max(0, p.shelfCount | 0);
  const zones = lay.perRow ? lay.perRow.filter(r => r.k).map(r => r.z) : lay.shelfZones;
  if (shelves && !zones.length) { warn.push(lay.zones.length ? 'Inserts fill the door opening, so adjustable shelves were skipped.' : 'Shelves are set but this cabinet has no door opening. Shelves skipped.'); shelves = 0; }
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
      const wl = lay.divX - t / 2 - t - 0.0625, wr = W - t - (lay.divX + t / 2) - 0.0625;
      part('Adjustable shelf (left)', sm, wl, inD - p.shelfFrontSetback, { qty: shelves, kind: 'shelf' });
      part('Adjustable shelf (right)', sm, wr, inD - p.shelfFrontSetback, { qty: shelves, kind: 'shelf' });
      addB(pin.name, 8 * shelves);
    } else {
      part('Adjustable shelf', sm, inW - 0.0625, inD - p.shelfFrontSetback, { qty: shelves, kind: 'shelf' });
      addB(pin.name, 4 * shelves);
    }
  }

  // Carcass
  const backGroove = { type: 'groove', x1: zIn0 - p.dadoDepth, y1: backY + bt / 2, x2: zIn1 + p.dadoDepth, y2: backY + bt / 2, width: bt, depth: p.dadoDepth, face: 'inside', why: 'back dado' };
  // On feet the sides start at the top of the legs, so their machining moves down by the leg height.
  const feet = onFeet(c, p), sh = feet ? tk : 0, down = o => { const q = { ...o }; ['x', 'x1', 'x2'].forEach(k => { if (typeof q[k] === 'number') q[k] = r3(q[k] - sh); }); return q; };
  const toe = tk && !feet ? [{ type: 'notch', x: 0, y: 0, w: tk, h: p.toeKickSetback, why: 'toe kick' }] : [];
  // No dado (depth 0, the dollhouse set): the back is glued in between the sides, top and bottom.
  const grooves = p.dadoDepth > 0 ? [backGroove] : [];
  // Pin holes (the dollhouse set): through both sides at set heights (p.pinZ, up from the cabinet bottom; a tall cabinet has
  // the base heights low and the wall heights high), 1/4 and 3/4 of the depth, so cabinets side by side pin together with
  // rod, and an applied end panel's matching blind holes pin it onto an exposed side.
  const pinD = +p.pinHoles || 0, pinSpots = [];
  if (pinD > 0) (Array.isArray(p.pinZ) && p.pinZ.length ? p.pinZ : [tk + (H - tk) * 0.25, tk + (H - tk) * 0.75]).filter(z => z > tk + t && z < H - t)
    .forEach(z => [0.25, 0.75].forEach(fy => pinSpots.push({ z: r3(z), y: r3(Math.min(D * fy, backY - pinD)) })));
  const pinOps = pinSpots.map(q => ({ type: 'bore', x: q.z, y: q.y, dia: pinD, depth: t, face: 'inside', why: 'pin hole' }));
  part('Left side', cm, H - sh, D, { kind: 'side', ops: [...grooves, ...toe, ...leftOps, ...pinOps].map(down) });
  part('Right side', cm, H - sh, D, { kind: 'side', ops: [...grooves, ...toe, ...rightOps, ...pinOps.map(o => ({ ...o }))].map(down) });
  const panelGroove = { type: 'groove', x1: 0, y1: backY + bt / 2, x2: inW, y2: backY + bt / 2, width: bt, depth: p.dadoDepth, face: 'inside', why: 'back dado' };
  part('Bottom', cm, inW, D, { kind: 'topbot', ops: p.dadoDepth > 0 ? [panelGroove] : [] });
  if ((c.construction || {}).top === 'stretchers') {
    part('Front stretcher', cm, inW, p.stretcherWidth, { kind: 'stretcher' });
    part('Rear stretcher', cm, inW, p.stretcherWidth, { kind: 'rearStretcher' });
  } else part('Top', cm, inW, D, { kind: 'topbot', ops: p.dadoDepth > 0 ? [{ ...panelGroove }] : [] });
  part('Back', bm, (zIn1 - zIn0) + 2 * p.dadoDepth, inW + 2 * p.dadoDepth, { kind: 'back' });
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
  if (hasCabShape(c)) applyCabShape(c, parts, { p, t, bt, tk, sh, D, dd: p.dadoDepth, warn });
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
        bot.ops.push({ type: 'bore', x: r3(q.x + dx - t), y: r3(D - q.y + dy), dia: +leg.holeDia, depth: Math.min(+leg.holeDepth, t - 0.0625), face: 'outside', why: leg.name }); }));
      n = spots.length;
    } else if (leg && leg.kind === 'leg' && bot) {
      const { xs, ys } = legLayout(c, p, leg, D);
      // A leg with a screw pattern (holesMM, offsets from its centre) gets each screw marked; the pattern's x offset
      // points toward the middle of the cabinet, so legs on the right half mirror it.
      const pat = (leg.holesMM || []).length ? leg.holesMM : [{ x: 0, y: 0 }];
      xs.forEach(x => ys.forEach(y => pat.forEach(o => { const dx = (+o.x || 0) * MM * (x > W / 2 ? -1 : 1), dy = (+o.y || 0) * MM;
        bot.ops.push({ type: 'bore', x: r3(x + dx - t), y: r3(y + dy), dia: +leg.holeDia, depth: Math.min(+leg.holeDepth, t - 0.0625), face: 'outside', why: leg.name }); })));
      n = xs.length * ys.length;
    }
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
  const jx = { t, addB, spread: spots, a: undefined, b: undefined, warn, cat: c.cat };
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
    const J = jFor(end), sp = sideP[end]; if (!J || !sp || !pt) return;
    // A side that is not the full depth (the open end of a 45° or 90° corner) starts that much further back:
    // its holes are measured from its own front edge, the panel's from the cabinet front.
    const off = sp.outline ? 0 : Math.max(0, r3(D - sp.W));
    const fem = [], label = `${J.name} (${pt.name.toLowerCase()})`;
    let pairs;
    if (zr) pairs = jtSpots(J, type, zr[0], zr[1], spots, t).map(z => ({ x: z, y: r3((pt.jy ?? backY - t / 2) - off), m: r3(zr[1] - z) }));
    else pairs = jtSpots(J, type, Math.max(a, off), b, spots, t).map(y => ({ x: fx, y: r3(y - off), m: y }));
    jx.a = zr ? undefined : a; jx.b = zr ? undefined : b; jx.type = type; jx.side = sp; jx.off = off; jx.zs = [sh, H];
    jtFasten(J, fem, pt, end === 'L' ? 0 : r3(pt.L), end === 'L' ? 'W1' : 'W2', pairs, label, jx);
    sp.ops.push(...fem.map(down));
  });
  [['Bottom', 'bottom', zIn0 - t / 2, 0, backY], ['Top', 'top', zIn1 + t / 2, 0, backY], ['Front stretcher', 'stretcher', zIn1 + t / 2, 0, p.stretcherWidth], ['Rear stretcher', 'stretcher', zIn1 + t / 2, backY - p.stretcherWidth, backY]]
    .forEach(([name, type, fx, a, b]) => { const pt = parts.find(q => q.cabId === c.id && q.name === name); if (pt) joinSides(type, pt, fx, null, a, b); });
  jtNailers(c, p, part, { cm, inW, zIn0, zIn1, t, bt, D, backY }).forEach(q => joinSides('nailer', q, null, q.jz));
  if (lay.divX !== null) {
    const J = hw(cabSet(c, 'jointU')), dv = parts.find(q => q.cabId === c.id && q.name === 'Vertical divider');
    if (J && J.kind === 'joint' && dv) ['Bottom', 'Top'].forEach((name, i) => {
      const pt = parts.find(q => q.cabId === c.id && q.name === name); if (!pt) return;
      const fem = []; jx.a = 0; jx.b = dv.W; jx.type = 'divider'; jx.side = null; jx.off = 0;
      jtFasten(J, fem, dv, i ? r3(dv.L) : 0, i ? 'W2' : 'W1', jtSpots(J, 'divider', 0, dv.W, spots, t).map(y => ({ x: lay.divX - t, y, m: y })), `${J.name} (divider)`, jx);
      pt.ops.push(...fem);
    });
  }
  const jtLateCtx = { jt: (type, pt, fx, zr) => joinSides(type, pt, fx, zr, 0, Math.min(backY, pt.W)), jFor, spread: spots, addB };

  // Applied end panels
  const ps = panelFor(c), pm = mat(ps.mat) || cm;
  ['L', 'R'].forEach(sd => {
    if (!hasPanel(c, sd)) return;
    const L = c.cat === 'Wall' ? H : (ps.toFloor ? H : H - tk), Wd = endDepth(c, sd) + ps.frontOverhang + ps.scribe;
    const ops = (ps.type === 'routed' && ps.frame > 0) ? [{ type: 'pocket', x: ps.frame, y: ps.frame + ps.scribe, w: L - 2 * ps.frame, h: Wd - 2 * ps.frame - ps.scribe, depth: ps.pocketDepth, face: 'show', why: 'panel recess' }] : [];
    // Blind pin holes on the hidden face, lined up with the side's (the panel's y runs from its back edge).
    const z0 = c.cat === 'Wall' || ps.toFloor ? 0 : tk;
    pinSpots.forEach(q => ops.push({ type: 'bore', x: r3(q.z - z0), y: r3(Wd - ps.frontOverhang - q.y), dia: pinD, depth: r3(pm.thick / 2), face: 'hidden', why: 'pin hole' }));
    part(`Applied end panel (${sd})`, pm, L, Wd, { kind: 'applied', ops });
  });
  // One rod per pin spot for each applied panel and for the cabinet beside this one on its right (each pair counted once).
  if (pinSpots.length) {
    const rods = ['L', 'R'].filter(sd => hasPanel(c, sd)).length * pinSpots.length
      + (typeof nearestAt === 'function' && c.wall && inRoomOf(c, () => { const n = nearestAt(c, 1); return n && n.kind === 'cab' && n.gap < 0.05; }) ? pinSpots.length : 0);
    if (rods) addB(`${fmtLen(pinD, 1)} dowel pin, ${fmtLen(t * 2, 1)} long`, rods);
  }
  // Fillers between the cabinet and a wall, in the front material
  fillersOf(c).forEach(fl => {
    const fm = mat(fillerMat(c)) || cm;
    part(`Filler (${fl.end})`, fm, c.cat === 'Wall' ? H : H - tk, Math.round(fl.gap * 1000) / 1000, { kind: 'filler' });
  });
  S.hardware.filter(h => h.kind === 'other' && !h.feet && h.perCabinet > 0 && (!h.cats || !h.cats.length || [].concat(h.cats).join(',').includes(c.cat))).forEach(h => {
    addB(h.name, h.perCabinet);
  });
  // Hand edits from the part editor (shape, operations, size), worked out again for this size.
  if (typeof qBuildExtras === 'function') qBuildExtras(c, parts, warn, part, { cm, sm, inW, inD, t, fronts, addB, zIn0, zIn1 });
  if (typeof jtLate === 'function') jtLate(c, parts, jtLateCtx);
  if (typeof jtTabSlot === 'function') jtTabSlot(c, parts, jx);
  if (typeof vBuildExtras === 'function') vBuildExtras(c, parts, warn, p, { t, inD, zIn0, zIn1, addB, pin });
  if (c.addParts && c.addParts.length && typeof addedParts === 'function') addedParts(c, parts, warn, part, cm);
  const removed = (c.partEdits && typeof applyPartEdits === 'function') ? applyPartEdits(c, parts, warn, ptT) : [];
  // A Finished product (editor › Materials and hardware): the box parts you can see are cut from the finish material, when it is the same thickness.
  if (c.finished) {
    const fm = mat(finishMat(c)); let off = 0;
    if (fm && fm.id !== cm.id) parts.forEach(q => { if (q.cabId !== c.id || q.fin === false || q.mat !== cm.id || !['side', 'topbot', 'shelf', 'divider'].includes(q.kind)) return; if (Math.abs(fm.thick - q.T) <= 0.07) { q.mat = fm.id; q.T = fm.thick; q.grain = !!fm.grain; q.fin = true; } else off++; });
    if (off) warn.push(`Finished: ${fm.name} is not the same thickness as ${cm.name}, so ${off} box part${off === 1 ? '' : 's'} stay in ${cm.name}.`);
  }
  // Finished ends (exposed sides) and finished interiors are cut from the finish's sheet material, like a Finished product.
  { const fm = mat(finishMat(c)), keep = new Set();
    if (fm && fm.id !== cm.id) parts.forEach(q => {
      if (q.cabId !== c.id || q.fin === false || q.mat !== cm.id) return;
      const inside = c.finInt && ['side', 'topbot', 'shelf', 'divider', 'stretcher', 'rearStretcher'].includes(q.kind);
      if (!q.finEnd && !inside) return;
      if (Math.abs(fm.thick - q.T) <= 0.07) { q.mat = fm.id; q.T = fm.thick; q.grain = !!fm.grain; q.fin = true; } else keep.add(q.name);
    });
    if (keep.size) warn.push(`${fm.name} is not the same thickness as ${cm.name}, so ${[...keep].join(', ')} stay${keep.size === 1 ? 's' : ''} in ${cm.name}.`); }
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
      const cd = angledCorner(c) ? cornerLeg(c) : c.d;
      const top = c.elev + c.h, k = keyOf(c), fl = fillersOf(c), s0 = Math.min(c.off, ...fl.map(x => x.a0)), s1 = Math.max(c.off + c.w, ...fl.map(x => x.a1));
      if (cur && s0 <= cur.end + 0.25 && (cur.top === null || (Math.abs(top - cur.top) < 0.01 && cur.k === k))) {
        if (cur.top === null) { cur.top = top; cur.k = k; cur.bottom = c.elev; }
        cur.end = Math.max(cur.end, s1); cur.d = Math.max(cur.d, cd + (c.outset || 0)); cur.bottom = Math.min(cur.bottom, c.elev); cur.cabs.push(c.id);
      }
      else { cur = { wall: w.id, side, start: s0, end: s1, top, bottom: c.elev, d: cd + (c.outset || 0), cabs: [c.id], k }; runs.push(cur); }
    });
  }));
  return runs.filter(r => r.cabs.length);
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
function cornerBridges() {
  const out = [];
  S.cabinets.forEach(c => {
    if (c.cat !== 'Base' || !angledCorner(c)) return;
    const poly = cabPoly(c); if (!poly) return;
    S.walls.forEach(w2 => {
      if (w2.id === c.wall) return;
      const g = wg(w2), f = w2.thick / 2;
      [1, -1].forEach(side => {
        const along = poly.map(q => (q.x - w2.x1) * g.u.x + (q.y - w2.y1) * g.u.y), out2 = poly.map(q => ((q.x - w2.x1) * g.n.x + (q.y - w2.y1) * g.n.y) * side);
        const o0 = Math.min(...out2); if (o0 > f + 0.6 || o0 < -0.6 || Math.max(...out2) - f < cornerLeg(c) - 0.01) return;
        const a0 = Math.min(...along), a1 = Math.max(...along);
        if (a0 < -0.5 || a1 > g.L + 0.5) return;
        out.push({ bridge: true, corner: c.id, wall: w2.id, side, off: a0, w: a1 - a0, d: cornerLeg(c) + (c.outset || 0) });
      });
    });
  });
  return out;
}
function countertopRuns() {
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
  return runs;
}

/* ---------- Molding runs ---------- */
function moldingRuns() {
  const runs = runsBy(c => !!c.molding && !!molding(c.molding), c => c.molding);
  runs.forEach(r => {
    const m = molding(r.k), w = wall(r.wall);
    r.m = m;
    r.retS = !endBlocked(r, r.start, -1); r.retE = !endBlocked(r, r.end, 1);
    r.h = m.fill ? Math.max(0.5, Math.min(12, w.height - r.top)) : m.h;
    r.z = m.bottom ? r.bottom - r.h : r.top;
    r.front = (r.end - r.start) + m.d * ((r.retS ? 1 : 0) + (r.retE ? 1 : 0));
    r.returns = (r.retS ? r.d + m.d : 0) + (r.retE ? r.d + m.d : 0);
    r.len = r.front + r.returns;
  });
  (S.genMolds || []).forEach(g => {
    const m = molding(g.mold || roomSet('molding')); if (!m || !wall(g.wall)) return;
    const start = +g.off || 0, run = Math.max(0.25, +g.len || 0), d = +g.d || 0, retS = !!g.retS, retE = !!g.retE;
    const front = run + m.d * (retS + retE), returns = (retS ? d + m.d : 0) + (retE ? d + m.d : 0);
    runs.push({ generic: g.id, wall: g.wall, side: +g.side || 1, start, end: start + run, top: +g.z || 0, bottom: +g.z || 0, d, cabs: [], k: m.id, m, retS, retE, h: m.h, z: +g.z || 0, front, returns, len: front + returns });
  });
  return runs;
}
