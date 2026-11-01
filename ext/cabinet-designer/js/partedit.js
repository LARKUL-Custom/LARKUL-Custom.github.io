/* ---------- Part editor (like Mozaik's): Shape, Operations and Details for one part ----------
   Open it by double-clicking a part in the cabinet editor's Parts tab. Changes are kept on the cabinet in
   c.partEdits[part name] and put back on the part every time the cut list is built, so they follow size changes.
   Every number can be a formula, like 1.25 + PartTh/2 + 3. Points are x along the length from the left end and
   y up from the bottom edge, as the part is drawn.
   { pts: [{x, y}] outline, ops: [user operations], hide: [generated operations taken off], L, W, name, qty, grain } */
const PE_OPS = [
  ['drill', 'Drill points', 'A hole at every point.'],
  ['path', 'Tool path', 'The bit follows the points. Closed joins the last point back to the first.'],
  ['groove', 'Groove', 'A slot of any width between each pair of points.'],
  ['pocket', 'Pocket', 'Clears everything inside the points to the depth.'],
  ['linebore', '32 mm line bore', 'A row of holes from point 1, so many apart, with an optional second row.'],
  ['perimeter', 'Perimeter path', 'Follows the part outline, moved in by the inset. Follows the part when it changes shape.'],
  ['edgebore', 'Edge bore', 'Holes drilled into an edge, at the positions you list along it.'],
  ['text', 'Engrave text', 'Writes the text with a small bit, starting at point 1.'],
];
const PE_EDGES = [{ v: 'W1', l: 'W1 (left end)' }, { v: 'W2', l: 'W2 (right end)' }, { v: 'L1', l: 'L1 (top edge)' }, { v: 'L2', l: 'L2 (bottom edge)' }];
const PE_OFFSETS = [{ v: 'center', l: 'On the line' }, { v: 'left', l: 'Left of the line' }, { v: 'right', l: 'Right of the line' }];
// Tools come from the CNC tools library (Libraries › CNC tools).
const peTools = () => { const l = typeof cncStraight === 'function' ? cncStraight() : typeof CNC_STRAIGHT !== 'undefined' ? CNC_STRAIGHT : []; return (l.length ? l : [['3_8COMP', 9.525]]).map(([n, mm]) => ({ v: n, l: `${n} (${fmtLen(mm / 25.4, 1)})`, dia: mm / 25.4 })); };
const peDefTool = () => { const t = peTools(); return (t[1] || t[0]).v; };
const peVbits = () => (typeof CNC_LIB !== 'undefined' ? CNC_LIB.tools.filter(t => t.type === 'vbit') : []).map(t => ({ v: t.id, l: `${t.id} (V-bit)` }));
const peToolDia = n => { const t = typeof cncTool === 'function' && cncTool(n); if (t) return t.dia / 25.4; return (peTools().find(x => x.v === n) || peTools()[1] || peTools()[0]).dia; };
const pePassCount = (tool, depthIn) => typeof cncPasses === 'function' ? cncPasses(tool, depthIn * 25.4).length : 1;
const peKey = name => String(name).replace(/ \(finished inside\)$/, '');

// The names a part formula can use: the part's own size, then everything a cabinet formula can use.
function partVars(c, q) {
  // Tomm and mm let formulas written Mozaik's way (3*Tomm, 2.5*mm) work in this program's inches.
  const own = { partl: q.L, partw: q.W, partth: q.T, partt: q.T, partlength: q.L, partwidth: q.W, partthickness: q.T, tomm: 1, mm: 1 / 25.4 };
  const base = typeof fxVarsFor === 'function' ? fxVarsFor('cab:' + c.id, null) : () => undefined;
  let ep = null; try { ep = effParams(c); } catch (_) { ep = null; }
  return name => {
    const k = name.toLowerCase(); if (own[k] !== undefined) return own[k];
    const v = base(name); if (v !== undefined) return v;
    const pv = ep && ep[name]; return typeof pv === 'number' ? pv : undefined;
  };
}
function peNum(v, vars, bad) {
  if (typeof v === 'number') return v;
  if (v === undefined || v === null || v === '') return NaN;
  try { return evalExpr(String(v), vars); } catch (e) { if (bad) bad(String(v), e.message); return NaN; }
}
const peMM = () => ui.peUnits === 'mm';
const peShow = v => typeof v === 'number' ? (peMM() ? String(+(v * 25.4).toFixed(2)) : fmtLen(v, 1)) : String(v ?? '');
/* Points: x from the left end, y up from the bottom edge. An anchor measures from another edge instead, so the point
   follows when the part is resized: ax 'R' = x in from the right end, 'C' = from the middle; ay 'T' = down from the top, 'M' = from the middle.
   r rounds the corner (ri: an inside radius that cuts the corner away), b bulges the edge to the next point (+ out, − in). */
function peXY(p, vars, L, W, bad) {
  let x = peNum(p.x, vars, bad), y = peNum(p.y, vars, bad);
  if (p.ax === 'R') x = L - x; else if (p.ax === 'C') x = L / 2 + x;
  if (p.ay === 'T') y = W - y; else if (p.ay === 'M') y = W / 2 + y;
  return { x: r3(x), y: r3(y) };
}
// Puts an absolute place back into a point's own frame (plain numbers).
function peStore(p, X, Y, L, W) {
  p.x = r3(p.ax === 'R' ? L - X : p.ax === 'C' ? X - L / 2 : X);
  p.y = r3(p.ay === 'T' ? W - Y : p.ay === 'M' ? Y - W / 2 : Y);
}
// A plain point anchored to the nearest end and edge, so it keeps its distance from them when the part grows.
function peAnchor(p, L, W) {
  const o = { ...p }; delete o.ax; delete o.ay;
  if (typeof p.x === 'number' && p.x > L / 2 + 1e-6) { o.x = r3(L - p.x); o.ax = 'R'; }
  if (typeof p.y === 'number' && p.y > W / 2 + 1e-6) { o.y = r3(W - p.y); o.ay = 'T'; }
  return o;
}
// Mirror state of the part (Mirror and Flip buttons); mirroring is its own undo, so this works both ways.
const peView = (z, q, e) => { const xf = (e && e.xf) || {}; return { x: xf.mx ? r3(q.L - z.x) : z.x, y: xf.my ? r3(q.W - z.y) : z.y }; };
function peOutline(list, vars, L, W, bad) {
  const P = list.map(p => { const z = peXY(p, vars, L, W, bad), r = p.r ? peNum(p.r, vars, bad) : 0, b = p.b ? peNum(p.b, vars, bad) : 0; if (r > 0) z.r = r; if (b) z.b = b; if (p.ri) z.ri = true; return z; });
  if (!P.every(z => isFinite(z.x) && isFinite(z.y))) return null;
  if (!P.some(z => z.r || z.b)) return P.map(z => ({ x: z.x, y: z.y }));
  // An inside radius cuts the corner away with an arc around the point; it turns into plain points before the rest is rounded.
  const n = P.length, pre = [];
  P.forEach((z, i) => {
    if (!(z.ri && z.r > 0)) { pre.push(z); return; }
    const A = P[(i - 1 + n) % n], B = P[(i + 1) % n], la = Math.hypot(A.x - z.x, A.y - z.y), lb = Math.hypot(B.x - z.x, B.y - z.y);
    const r = Math.min(z.r, la / 2, lb / 2), a0 = Math.atan2(A.y - z.y, A.x - z.x); let d = Math.atan2(B.y - z.y, B.x - z.x) - a0;
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const steps = Math.max(4, Math.ceil(Math.abs(d) / 0.15));
    for (let k = 0; k <= steps; k++) { const t = a0 + d * k / steps, w = { x: z.x + r * Math.cos(t), y: z.y + r * Math.sin(t) }; if (k === steps && z.b) w.b = z.b; pre.push(w); }
  });
  return shapeOutline(pre).map(z => ({ x: r3(z.x), y: r3(z.y) }));
}
// Mirror and flip the finished part: outline, every operation (the cabinet's too) and the banding.
function peTransform(q, xf) {
  const mx = !!xf.mx, my = !!xf.my, L = q.L, W = q.W; if (!mx && !my && !xf.face) return;
  const X = x => mx ? r3(L - x) : x, Y = y => my ? r3(W - y) : y, OPP = typeof CNC_OPPOSITE !== 'undefined' ? CNC_OPPOSITE : {};
  if (q.outline) { q.outline = q.outline.map(p => ({ x: X(p.x), y: Y(p.y) })); if (mx !== my) q.outline.reverse(); }
  if (!q.outline && (mx || my)) q.ops.forEach(o => { if (o.type === 'notch') { if (mx) o.x = r3(L - o.x - o.w); if (my) o.y = r3(W - o.y - o.h); } });
  q.ops.forEach(o => {
    if (o.type === 'notch' || o.type === 'hbore' || o.type === 'edge') { /* notches done above; edge work follows the edges */ }
    else if (o.pts) { o.pts = o.pts.map(p => ({ x: X(p.x), y: Y(p.y) })); if (mx !== my) o.pts.reverse(); }
    else if ('x1' in o) { o.x1 = X(o.x1); o.x2 = X(o.x2); o.y1 = Y(o.y1); o.y2 = Y(o.y2); }
    else if ('w' in o && 'x' in o) { if (mx) o.x = r3(L - o.x - o.w); if (my) o.y = r3(W - o.y - o.h); }
    else if ('x' in o) { o.x = X(o.x); o.y = Y(o.y); }
    if (xf.face && o.face && OPP[o.face]) o.face = OPP[o.face];
  });
  if (q.band && (mx || my)) { const b = { ...q.band }; if (mx) [b.W1, b.W2] = [b.W2, b.W1]; if (my) [b.L1, b.L2] = [b.L2, b.L1]; q.band = b; q.edges = edgeSummary(q.kind, q.band); }
}

/* ----- Applying the edits while the cut list is built ----- */
function applyPartEdits(c, parts, warn, ptT) {
  const E = c.partEdits || {};
  parts.forEach(q => {
    if (q.cabId !== c.id) return;
    q.editKey = q.editKey || peKey(q.name); const e = E[q.editKey]; if (!e) return;
    const bad = (t, m) => warn.push(`${q.name}: the formula "${t}" did not work (${m}).`);
    // Type and material first: they set the banding, thickness and grain the formulas then see.
    if (e.kind && e.kind !== q.kind) { q.kind = e.kind; if (ptT) { q.band = partBands(ptT, q.kind); } }
    if (e.mat) { const m = mat(e.mat); if (m) { q.mat = m.id; q.T = m.thick; q.grain = !!m.grain; q.matOver = true; } }
    if (e.tex) q.tex = e.tex;
    if (e.band) { q.band = { ...(q.band || {}) }; Object.entries(e.band).forEach(([k, v]) => { q.band[k] = v === 'none' ? null : v; }); }
    if (e.kind || e.band) q.edges = edgeSummary(q.kind, q.band);
    if (e.report) q.report = e.report;
    let vars = partVars(c, q);
    if (e.L !== undefined && e.L !== '') { const v = peNum(e.L, vars, bad); if (v > 0) q.L = r3(v); }
    if (e.W !== undefined && e.W !== '') { const v = peNum(e.W, vars, bad); if (v > 0) q.W = r3(v); }
    if (e.qty !== undefined && e.qty !== '') { const v = Math.round(peNum(e.qty, vars, bad)); if (v >= 0) q.qty = v; }
    if (e.grain !== undefined) q.grain = !!e.grain;
    if (e.name) q.name = e.name;
    if (e.note) q.note = e.note;
    vars = partVars(c, q);
    const P = pt => peXY(pt, vars, q.L, q.W, bad);
    if (e.pts && e.pts.length >= 3) {
      const o = peOutline(e.pts, vars, q.L, q.W, bad); if (o) { q.outline = o; q.ops = q.ops.filter(z => z.type !== 'notch'); }
    }
    if (e.hide && e.hide.length) q.ops = q.ops.filter(o => !e.hide.includes(opText(o)));
    // O1: a generated operation can be hidden by a formula, like PartW < 12.
    if (e.hideIf) q.ops = q.ops.filter(o => { const f = e.hideIf[opText(o)]; return f === undefined || f === '' || !peNum(f, vars, bad); });
    const cnt = {}; q.ops.forEach(o => { if (o.face) cnt[o.face] = (cnt[o.face] || 0) + 1; });
    const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0], OPP = typeof CNC_OPPOSITE !== 'undefined' ? CNC_OPPOSITE : {};
    const faceOf = f => f === 'back' ? (top ? OPP[top] || 'back' : 'back') : (top || 'front');
    const Y = y => r3(q.W - y);
    const n = v => peNum(v, vars, bad);
    (e.ops || []).forEach((u, ui_) => {
      if (u.off || (u.hideIf !== undefined && u.hideIf !== '' && n(u.hideIf))) return;
      const depth = n(u.depth), face = faceOf(u.face), why = u.name || 'custom';
      const thru = !(depth > 0 && depth < q.T), push = o => q.ops.push(o);
      if (typeof peExtraOp === 'function' && peExtraOp(u, q, n, P, Y, push, face, why, thru, depth, ui_)) return;
      let pts = (u.pts || []).map(p => ({ ...P(p), b: p.b !== undefined && p.b !== '' ? n(p.b) || 0 : 0 })).filter(z => isFinite(z.x) && isFinite(z.y)); if (!pts.length) return;
      if (u.type === 'drill') {
        const dia = n(u.dia) || 0.197;
        pts.forEach(z => push({ type: 'bore', x: z.x, y: Y(z.y), dia: r3(dia), depth: thru ? q.T : r3(depth), through: thru, face, why, user: ui_ }));
      } else if (u.type === 'groove') {
        const width = n(u.width) || 0.25;
        // O4: a length (and angle) from point 1 instead of a second point.
        if (u.len !== undefined && u.len !== '' && n(u.len) > 0) { const len = n(u.len), a = (n(u.angle) || 0) * Math.PI / 180; pts = [pts[0], { x: r3(pts[0].x + Math.cos(a) * len), y: r3(pts[0].y + Math.sin(a) * len) }]; }
        for (let i = 0; i + 1 < pts.length; i++) push({ type: 'groove', x1: pts[i].x, y1: Y(pts[i].y), x2: pts[i + 1].x, y2: Y(pts[i + 1].y), width: r3(width), depth: thru ? r3(q.T / 2) : r3(depth), tool: 'flat bit', face, why, user: ui_ });
      } else {
        const pocket = u.type === 'pocket', closed = pocket || !!u.closed, d = thru ? q.T : r3(depth);
        let flat = typeof peFlatPath === 'function' ? peFlatPath(pts, closed) : pts;
        // O6: a path made bigger (+) or smaller (-); an open path moves to its left.
        const off = n(u.offset) || 0; if (off && flat.length > 1) flat = offsetPath(flat, closed ? (polyArea(flat) > 0 ? -off : off) : off, closed);
        const tool = u.tool === 'auto' && typeof vAutoTool === 'function' ? vAutoTool(flat, pocket) : u.tool || peDefTool();
        push({ type: 'path', pts: flat.map(z => ({ x: r3(z.x), y: Y(z.y) })), closed, pocket, side: pocket ? 'center' : (u.side || 'center'), depth: d, through: thru, tool, dia: r3(peToolDia(tool)), face, why, user: ui_, passes: pePassCount(tool, d),
          ...(pocket ? { pocketOpts: { style: u.pStyle || 'raster', order: u.pOrder || 'out-in', dir: u.pDir || '', stepover: (typeof cncTool === 'function' && (cncTool(tool) || {}).stepover) || 80 } } : {}) });
        // O15: V-bit clean-out at the sharp inside corners the round bit leaves rounded.
        if (closed && u.clean && flat.length > 2) {
          const vb = u.cleanTool || (peVbits()[0] || {}).v, rad = peToolDia(tool) / 2, A0 = polyArea(flat);
          flat.forEach((V, i) => {
            const A = flat[(i - 1 + flat.length) % flat.length], B = flat[(i + 1) % flat.length];
            if (Math.sign((V.x - A.x) * (B.y - V.y) - (V.y - A.y) * (B.x - V.x)) !== Math.sign(A0)) return;
            const la = Math.hypot(A.x - V.x, A.y - V.y), lb = Math.hypot(B.x - V.x, B.y - V.y); if (!la || !lb) return;
            const ux = (A.x - V.x) / la + (B.x - V.x) / lb, uy = (A.y - V.y) / la + (B.y - V.y) / lb, ul = Math.hypot(ux, uy); if (ul < 1e-6) return;
            const half = Math.acos(Math.max(-1, Math.min(1, ((A.x - V.x) * (B.x - V.x) + (A.y - V.y) * (B.y - V.y)) / (la * lb)))) / 2; if (half > Math.PI / 2 - 0.05) return;
            const k = rad / Math.sin(half), C = { x: V.x + ux / ul * k, y: V.y + uy / ul * k };
            push({ type: 'path', pts: [{ x: r3(C.x), y: Y(C.y) }, { x: r3(V.x), y: Y(V.y) }], closed: false, pocket: false, side: 'center', depth: d, through: false, tool: vb || 'V-bit', dia: 0.05, face, why: why + ' corner clean-out', cleanout: true, user: ui_ });
          });
        }
      }
    });
    if ((e.ops || []).length && typeof peCheckOps === 'function') peCheckOps(q, warn);
    if (e.xf) peTransform(q, e.xf);
  });
  // Parts left out (Parts to Build unticked, or quantity 0) come off the cut list but stay listed so they can come back.
  const removed = [];
  for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i], e = q.cabId === c.id && E[q.editKey || peKey(q.name)]; if (e && (e.off || q.qty === 0)) { removed.unshift(q); parts.splice(i, 1); } }
  return removed;
}

/* ----- Parts added by hand: Add part (a new panel) or Copy part (follows the part it was copied from) ----- */
function addedParts(c, parts, warn, part, cm) {
  (c.addParts || []).forEach(a => {
    let q;
    if (a.copyOf) {
      const src = parts.find(p => p.cabId === c.id && !p.added && peKey(p.name) === a.copyOf);
      if (!src) { warn.push(`${a.name}: the part it was copied from (${a.copyOf}) is not in this cabinet any more.`); return; }
      q = { ...clone(src), name: a.name, ops: clone(src.ops) }; delete q.outline; if (src.outline) q.outline = clone(src.outline); parts.push(q);
    } else {
      const m = mat(a.mat) || cm, vars = partVars(c, { L: 0, W: 0, T: m.thick }), bad = (t, e) => warn.push(`${a.name}: the formula "${t}" did not work (${e}).`);
      const L = peNum(a.L, vars, bad), W = peNum(a.W, vars, bad);
      q = part(a.name, m, isFinite(L) ? r3(L) : 0, isFinite(W) ? r3(W) : 0, { kind: a.kind || 'shelf', qty: a.qty || 1 });
    }
    delete q.editKey; q.added = a.id; q.editKey = peKey(a.name); q.graphic = a.graphic !== false; q.pos = a.pos || null;
  });
}
// Added parts drawn in 3D where their 3D position puts them. Face: flat (like a shelf), side (like an end), front (like a back).
function addedParts3d(c, grp, M) {
  const ps = buildParts(c).parts.filter(q => q.cabId === c.id && q.added && q.graphic !== false && q.pos); if (!ps.length) return;
  const vars0 = q => partVars(c, q);
  ps.forEach(q => {
    const P = q.pos, v = vars0(q), n = x => { const r = peNum(x, v); return isFinite(r) ? r : 0; };
    const dims = P.face === 'side' ? [q.T, q.L, q.W] : P.face === 'front' ? [q.L, q.W, q.T] : [q.L, q.T, q.W];
    // X from the cabinet's left, Y from the back, Z up from the floor; the point is the part's left, back, bottom corner.
    const m0 = mat(q.mat) || S.materials[0], m1 = q.tex ? { ...m0, texture: q.tex } : m0;
    const x = n(P.x), y = n(P.y), z = n(P.z), me = box3(dims[0], dims[1], dims[2], M(m1), x + dims[0] / 2, z + dims[1] / 2, y + dims[2] / 2);
    const d2r = Math.PI / 180; me.rotation.set(n(P.rx) * d2r, n(P.rz) * d2r, n(P.ry) * d2r);
    me.userData.part = q.name; me.userData.addedPart = q.editKey; grp.add(me);
  });
}

/* ----- Geometry for tool paths ----- */
// Moves a path sideways by d (positive = left of the direction of travel); corners meet where the moved lines cross.
function offsetPath(pts, d, closed) {
  const n = pts.length; if (n < 2 || !d) return pts.map(p => ({ ...p }));
  const seg = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * d, ny = dx / L * d; return [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }]; };
  const segs = []; for (let i = 0; i < (closed ? n : n - 1); i++) segs.push(seg(pts[i], pts[(i + 1) % n]));
  const cross = (s1, s2) => {
    const [a, b] = s1, [c2, e] = s2, d1x = b.x - a.x, d1y = b.y - a.y, d2x = e.x - c2.x, d2y = e.y - c2.y, den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-9) return { x: b.x, y: b.y };
    const t = ((c2.x - a.x) * d2y - (c2.y - a.y) * d2x) / den; return { x: a.x + d1x * t, y: a.y + d1y * t };
  };
  const out = [];
  if (closed) for (let i = 0; i < segs.length; i++) out.push(cross(segs[(i - 1 + segs.length) % segs.length], segs[i]));
  else { out.push(segs[0][0]); for (let i = 1; i < segs.length; i++) out.push(cross(segs[i - 1], segs[i])); out.push(segs[segs.length - 1][1]); }
  return out;
}
const polyArea = pts => pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2;
// Passes that clear a pocket with a bit of diameter dia: the outline moved in by the bit radius, then back and forth lines across.
// O7 opts: style 'raster' (back and forth) or 'spiral' (rings), order 'out-in' or 'in-out', dir 'cw' / 'ccw' as drawn (pts are y down).
function pocketPaths(pts, dia, opts) {
  opts = opts || {};
  const rad = dia / 2, sg = Math.sign(polyArea(pts)), inward = sg > 0 ? rad : -rad, ring = offsetPath(pts, inward, true), ok = r => Math.sign(polyArea(r)) === sg && Math.abs(polyArea(r)) > 1e-4;
  if (!ok(ring)) return [];
  const step = dia * Math.min(0.95, Math.max(0.2, (+opts.stepover || 80) / 100));
  let out = [[...ring, ring[0]]];
  if (opts.style === 'spiral') { let r = offsetPath(ring, sg > 0 ? step : -step, true); while (ok(r) && out.length < 400) { out.push([...r, r[0]]); r = offsetPath(r, sg > 0 ? step : -step, true); } }
  else { const ys = ring.map(p => p.y), y0 = Math.min(...ys), y1 = Math.max(...ys); for (let y = y0 + step / 2; y < y1; y += step) polySpans(ring, 'y', y).forEach(([a, b]) => { if (b - a > 1e-3) out.push([{ x: a, y }, { x: b, y }]); }); }
  if (opts.order === 'in-out') out.reverse();
  if (opts.dir) out = out.map(p => p.length > 3 && (polyArea(p.slice(0, -1)) < 0) !== (opts.dir === 'ccw') ? p.slice().reverse() : p);
  return out;
}

/* ----- The editor ----- */
function pePart() {
  const s = ui.partEdit, c = s && cab(s.cab); if (!c) return null;
  const b = buildParts(c), q = [...b.parts, ...(b.removed || [])].find(p => p.cabId === c.id && (p.editKey || peKey(p.name)) === s.key);
  return { c, q: q || null, b };
}
const peKeyOf = p => p.editKey || peKey(p.name);
const peAdded = (c, key) => (c.addParts || []).find(a => peKey(a.name) === key);
const peEdit = (c, key) => ((c.partEdits = c.partEdits || {})[key] = c.partEdits[key] || {});
function openPartEdit(cid, key, tab) { ui.partEdit = { cab: cid, key: peKey(key), tab: tab || (ui.partEdit && ui.partEdit.tab) || 'ops', sel: '', pt: -1 }; renderPartEdit(); }
function closePartEdit() { ui.partEdit = null; const el = $('#partedit'); if (el) el.remove(); if (ui.quick) renderQuick(); }
// The outline to start from: the part as it is now, each point anchored to its nearest end and edge.
function peStartPts(q) {
  let pts;
  if (q.outline) pts = q.outline.map(p => ({ x: p.x, y: p.y }));
  else {
    const n = q.ops.find(o => o.type === 'notch' && o.x === 0 && o.y === 0);
    pts = n ? [{ x: 0, y: 0 }, { x: q.L, y: 0 }, { x: q.L, y: q.W }, { x: n.w, y: q.W }, { x: n.w, y: r3(q.W - n.h) }, { x: 0, y: r3(q.W - n.h) }] : [{ x: 0, y: 0 }, { x: q.L, y: 0 }, { x: q.L, y: q.W }, { x: 0, y: q.W }];
  }
  return pts.map(p => peAnchor(p, q.L, q.W));
}
// A generated operation as an editable one, in the editor's frame (y up).
function peFromOp(o, q) {
  const Y = y => r3(q.W - y), base = { name: o.why || '', face: peFaceOf(o, q), depth: o.through ? 0 : o.depth }, A = list => list.map(p => peAnchor(p, q.L, q.W));
  if (o.type === 'bore') return { ...base, type: 'drill', dia: o.dia, pts: A([{ x: o.x, y: Y(o.y) }]) };
  if (o.type === 'groove') return { ...base, type: 'groove', width: o.width, pts: A([{ x: o.x1, y: Y(o.y1) }, { x: o.x2, y: Y(o.y2) }]) };
  if (o.type === 'pocket' || o.type === 'cutout') { const y0 = Y(o.y + o.h), y1 = Y(o.y); return { ...base, type: o.type === 'cutout' ? 'path' : 'pocket', closed: true, depth: o.type === 'cutout' ? 0 : o.depth, tool: peDefTool(), pts: A([{ x: o.x, y: y0 }, { x: o.x + o.w, y: y0 }, { x: o.x + o.w, y: y1 }, { x: o.x, y: y1 }]) }; }
  if (o.type === 'path') return { ...base, type: o.pocket ? 'pocket' : 'path', closed: o.closed, tool: o.tool, side: o.side, pts: A(o.pts.map(z => ({ x: z.x, y: Y(z.y) }))) };
  return null;
}
function peNewOp(type, q) {
  const L = q.L, W = q.W, cx = r3(L / 2), cy = r3(W / 2), a = r3(Math.min(L, W) / 4), A = list => list.map(p => peAnchor(p, L, W));
  const box = A([{ x: r3(cx - a), y: r3(cy - a) }, { x: r3(cx + a), y: r3(cy - a) }, { x: r3(cx + a), y: r3(cy + a) }, { x: r3(cx - a), y: r3(cy + a) }]);
  if (type === 'drill') return { type, name: 'Drill', dia: 0.197, depth: 0.5, face: 'top', pts: A([{ x: 2, y: 2 }, { x: r3(L - 2), y: 2 }]) };
  if (type === 'groove') return { type, name: 'Groove', width: 0.25, depth: 0.25, face: 'top', pts: [{ x: 0, y: cy }, { x: 0, y: cy, ax: 'R' }] };
  if (type === 'pocket') return { type, name: 'Pocket', depth: 0.25, tool: peDefTool(), face: 'top', pts: box };
  if (type === 'linebore') return { type, name: 'Line bore', count: 5, spacing: '32*mm', angle: 0, row2: 0, dia: '5*mm', depth: '13*mm', face: 'top', pts: [{ x: 2, y: '37*mm' }] };
  if (type === 'perimeter') return { type, name: 'Perimeter', inset: 0, side: 'center', depth: 0.25, tool: peDefTool(), face: 'top', pts: [] };
  if (type === 'edgebore') return { type, name: 'Edge bore', edge: 'W1', at: '2, PartW - 2', dia: '8*mm', inset: 'PartTh/2', depth: 1, face: 'top', pts: [] };
  if (type === 'text') return { type, name: 'Engrave', text: 'A1', height: 0.5, angle: 0, depth: 0.04, tool: typeof peEngraveTool === 'function' ? peEngraveTool() : peDefTool(), face: 'back', pts: [{ x: 1, y: 1 }] };
  if (type === 'openpath') return { type: 'path', name: 'Open tool path', closed: false, side: 'center', depth: 0.25, tool: peDefTool(), face: 'top', pts: box };
  return { type: 'path', name: 'Closed tool path', closed: true, side: 'center', depth: 0.25, tool: peDefTool(), face: 'top', pts: box };
}
// Basic shapes for the Shape tab; every point is anchored, so they stay right when the part is resized.
const PE_SHAPES = [
  ['rect', 'Rectangle', () => [{ x: 0, y: 0 }, { x: 0, y: 0, ax: 'R' }, { x: 0, y: 0, ax: 'R', ay: 'T' }, { x: 0, y: 0, ay: 'T' }]],
  ['L', 'L-shape', (L, W) => { const a = r3(L / 3), b = r3(W / 3); return [{ x: 0, y: 0 }, { x: 0, y: 0, ax: 'R' }, { x: 0, y: b, ax: 'R', ay: 'T' }, { x: a, y: b, ax: 'R', ay: 'T' }, { x: a, y: 0, ax: 'R', ay: 'T' }, { x: 0, y: 0, ay: 'T' }]; }],
  ['clip', 'Clipped corner', (L, W) => { const c = r3(Math.min(L, W) / 4); return [{ x: 0, y: 0 }, { x: 0, y: 0, ax: 'R' }, { x: 0, y: c, ax: 'R', ay: 'T' }, { x: c, y: 0, ax: 'R', ay: 'T' }, { x: 0, y: 0, ay: 'T' }]; }],
  ['arch', 'Arch top', (L, W) => { const a = r3(Math.min(L, W) / 4); return [{ x: 0, y: 0 }, { x: 0, y: 0, ax: 'R' }, { x: 0, y: a, ax: 'R', ay: 'T', b: a }, { x: 0, y: a, ay: 'T' }]; }],
  ['round', 'Round', (L, W) => { const r = r3(Math.min(L, W) / 2); return [{ x: 0, y: 0, r }, { x: 0, y: 0, ax: 'R', r }, { x: 0, y: 0, ax: 'R', ay: 'T', r }, { x: 0, y: 0, ay: 'T', r }]; }],
];

// The drawing: the part, its operations (click one to pick it; it turns red), and the points of the picked one as numbered handles.
function peSVG(q, e, s) {
  const pick = s.tab === 'shape' ? '' : s.sel || '';
  let svg = partSVG(q, 2000, { sel: pick, hit: s.tab !== 'band' && !s.trace }).replace(/style="max-height:[^"]*"/, 'preserveAspectRatio="xMidYMid meet"').replace('class="partsvg"', 'class="partsvg pe-draw"');
  const fs = Math.max(q.L, q.W) / 34 + 0.6, r = fs * 0.32, Y = y => q.W - y;
  let pts = [], closed = false;
  if (s.tab === 'shape') { pts = e.pts || peStartPts(q); closed = true; }
  else if (s.tab === 'ops') { const sel = peSelOp(cab(s.cab), q, e, s), u = sel && sel.u; if (u && !['perimeter', 'edgebore'].includes(u.type)) { pts = u.pts || []; closed = u.type === 'pocket' || (u.type === 'path' && u.closed); } }
  const vars = partVars(cab(s.cab), q), P = pts.map(p => { const z = peView(peXY(p, vars, q.L, q.W), q, e); return { x: z.x, y: Y(z.y), fx: typeof p.x === 'string' || typeof p.y === 'string' }; }).filter(p => isFinite(p.x) && isFinite(p.y));
  let under = '', h = '';
  // A picture to trace over, and the snap grid.
  const im = ui.peImg; if (im && s.tab !== 'band') under += `<image href="${im.url}" x="0" y="${r3(q.W - im.h)}" width="${r3(im.w)}" height="${r3(im.h)}" opacity="${im.op}" preserveAspectRatio="none" pointer-events="none"/>`;
  const g0 = ui.peGrid; if (g0 && s.tab !== 'band') {
    let g = g0; while (Math.max(q.L, q.W) / g > 120) g *= 2;
    let gl = ''; for (let x = 0; x <= q.L + 1e-6; x += g) gl += `<line x1="${r3(x)}" y1="0" x2="${r3(x)}" y2="${r3(q.W)}"/>`; for (let y = 0; y <= q.W + 1e-6; y += g) gl += `<line x1="0" y1="${r3(q.W - y)}" x2="${r3(q.L)}" y2="${r3(q.W - y)}"/>`;
    under += `<g class="pe-gridl" pointer-events="none">${gl}</g>`;
  }
  if (s.tab === 'band') EDGE_KEYS.forEach(k => {
    const [x1, y1, x2, y2] = { L1: [0, 0, q.L, 0], L2: [0, q.W, q.L, q.W], W1: [0, 0, 0, q.W], W2: [q.L, 0, q.L, q.W] }[k], on = q.band && q.band[k];
    h += `<g data-act="pe-edge" data-id="${k}" class="pe-edge${on ? ' on' : ''}"><line class="nss" x1="${r3(x1)}" y1="${r3(y1)}" x2="${r3(x2)}" y2="${r3(y2)}"/><text class="pe-elbl" x="${r3(k === 'W1' ? fs * 0.5 : k === 'W2' ? q.L - fs * 0.5 : q.L / 2)}" y="${r3(k === 'L1' ? fs * 1.1 : k === 'L2' ? q.W - fs * 0.5 : q.W / 2)}" font-size="${r3(fs * 0.75)}" text-anchor="${k === 'W1' ? 'start' : k === 'W2' ? 'end' : 'middle'}">${k}</text></g>`;
  });
  if (P.length > 1) {
    if (s.tab === 'shape') P.forEach((p, i) => { const q2 = P[(i + 1) % P.length]; h += `<line class="pe-seg nss${i === s.seg ? ' on' : ''}" data-act="pe-seg" data-id="${i}" x1="${r3(p.x)}" y1="${r3(p.y)}" x2="${r3(q2.x)}" y2="${r3(q2.y)}"/>`; });
    else h += `<${closed ? 'polygon' : 'polyline'} class="pe-line nss" points="${P.map(p => `${r3(p.x)},${r3(p.y)}`).join(' ')}"/>`;
  }
  const hc = s.tab === 'ops' ? ' op' : '';
  P.forEach((p, i) => { h += `<g class="pe-h${hc}${i === s.pt ? ' on' : ''}${p.fx ? ' fx' : ''}" data-pe-pt="${i}"><circle class="nss" cx="${r3(p.x)}" cy="${r3(p.y)}" r="${r}"/><text x="${r3(p.x + r * 1.3)}" y="${r3(p.y - r * 1.3)}" font-size="${fs * 0.8}">${i + 1}</text></g>`; });
  return svg.replace(/(<svg[^>]*>)/, `$1${under}`).replace('</svg>', h + '</svg>');
}
const PE_AX = [{ v: '', l: 'L' }, { v: 'R', l: 'R' }, { v: 'C', l: 'C' }], PE_AY = [{ v: '', l: 'B' }, { v: 'T', l: 'T' }, { v: 'M', l: 'M' }];
const peAnc = (path, v, list, label) => `<select class="pe-in pe-anc" data-path="${path}" aria-label="${esc(label)}" title="${esc(label)}">${list.map(o => `<option value="${o.v}"${(v || '') === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}</select>`;
function pePtsTable(list, path, sel, bulge) {
  return `<table class="t pe-pts"><thead><tr><th>#</th><th>X</th><th title="Measured from: L left end, R right end, C middle">From</th><th>Y</th><th title="Measured from: B bottom edge, T top edge, M middle">From</th>${bulge ? '<th title="Bows the line to the next point into an arc this far out (+ to the right as it travels, − to the left)">Arc</th>' : ''}<th></th></tr></thead><tbody>${list.map((p, i) => `<tr class="${i === sel ? 'on' : ''}"><td class="n"><button class="lnk" data-act="pe-pt" data-id="${i}">${i + 1}</button></td>
    <td><input class="pe-in${typeof p.x === 'string' ? ' fx' : ''}" data-path="${path}.${i}.x" value="${esc(peShow(p.x))}" aria-label="Point ${i + 1} X"></td><td>${peAnc(`${path}.${i}.ax`, p.ax, PE_AX, `Point ${i + 1} X measured from: left end, right end or middle`)}</td>
    <td><input class="pe-in${typeof p.y === 'string' ? ' fx' : ''}" data-path="${path}.${i}.y" value="${esc(peShow(p.y))}" aria-label="Point ${i + 1} Y"></td><td>${peAnc(`${path}.${i}.ay`, p.ay, PE_AY, `Point ${i + 1} Y measured from: bottom edge, top edge or middle`)}</td>${bulge ? `<td><input class="pe-in pe-b${typeof p.b === 'string' ? ' fx' : ''}" data-path="${path}.${i}.b" value="${esc(peShow(p.b))}" placeholder="0" aria-label="Point ${i + 1} arc to the next point"></td>` : ''}
    <td class="pe-rowbtn"><button class="btn sm" data-act="pe-pt-add" data-id="${path}:${i}" title="Add a point after this one" aria-label="Add a point after ${i + 1}">+</button><button class="btn sm" data-act="pe-pt-del" data-id="${path}:${i}" title="Delete this point" aria-label="Delete point ${i + 1}"${list.length < 2 ? ' disabled' : ''}>−</button></td></tr>`).join('')}</tbody></table>`;
}
const peIn = (label, path, v, hint) => `<label class="f"><span>${label}</span><input class="pe-in${typeof v === 'string' && v !== '' && !/name|note|report|text$|\.at$/.test(path) ? ' fx' : ''}" data-path="${path}" value="${esc(peShow(v))}" aria-label="${esc(label)}"${hint ? ` placeholder="${esc(hint)}"` : ''}></label>`;
const peCount = (label, path, v) => `<label class="f"><span>${label}</span><input class="pe-in${typeof v === 'string' && v !== '' && !isFinite(+v) ? ' fx' : ''}" data-path="${path}" value="${esc(v ?? '')}" aria-label="${esc(label)}"></label>`;
const peSel = (label, path, v, options) => `<label class="f"><span>${label}</span><select class="pe-in" data-path="${path}" aria-label="${esc(label.replace(/<[^>]+>/g, ''))}">${options.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(v) ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`;

const PE_ADD = [['drill', 'Drill points'], ['linebore', '32 mm line bore'], ['closedpath', 'Tool path, closed'], ['openpath', 'Tool path, open'], ['perimeter', 'Perimeter path (follows the outline)'], ['groove', 'Groove'], ['pocket', 'Pocket'], ['edgebore', 'Edge bore'], ['text', 'Engrave text']];
const peOpName = o => (PE_OPS.find(t => t[0] === o.type) || [])[1] || o.type;
// The operations that come from the cabinet (hardware, joints, templates), in the order the drawing numbers them.
const peGen = q => q.ops.filter(o => o.user === undefined && o.type !== 'notch');
const peFaceOf = (o, q) => { const f = partFaces(q); return f.back && o.face === f.back ? 'back' : 'top'; };
// The picked operation: one of the part's own ('u3'), or one from the cabinet ('g5') shown as the operation it would become.
function peSelOp(c, q, e, s) {
  const k = s.sel || '', i = +k.slice(1);
  if (k[0] === 'u') { const u = (e.ops || [])[i]; return u ? { kind: 'u', i, u, P: 'ops.' + i } : null; }
  if (k[0] === 'g') { const o = peGen(q)[i]; return o ? { kind: 'g', i, o, u: peFromOp(o, q), P: 'gen.' + i } : null; }
  return null;
}
// Changing an operation from the cabinet makes it the part's own: the original is turned off and an editable copy takes its place.
function peTake(e, q, gi) {
  const o = peGen(q)[gi], u = o && peFromOp(o, q); if (!u) return -1;
  const t = opText(o); (e.hide = e.hide || []).push(t);
  if (e.hideIf && e.hideIf[t] !== undefined) { u.hideIf = e.hideIf[t]; delete e.hideIf[t]; if (!Object.keys(e.hideIf).length) delete e.hideIf; }
  (e.ops = e.ops || []).push(u); return e.ops.length - 1;
}
// A path into the editor's data; 'gen.5.dia' takes operation 5 over first and becomes 'ops.N.dia'.
function peRealPath(e, q, s, path) {
  const m = path.match(/^gen\.(\d+)(.*)$/); if (!m) return path;
  const i = peTake(e, q, +m[1]); if (i < 0) return null;
  s.sel = 'u' + i; return 'ops.' + i + m[2];
}
// A copy of the picked operation as a part operation (for Duplicate, Copy and templates).
function peOpCopy(c, q, key) { const e = (c.partEdits || {})[ui.partEdit.key] || {}, sel = peSelOp(c, q, e, { sel: key }); return sel && sel.u ? clone(sel.u) : null; }
function peOpsTab(c, q, e, s) {
  const ops = e.ops || [], gen = peGen(q), hif = e.hideIf || {}, sel = peSelOp(c, q, e, s);
  const tpls = typeof OP_TEMPLATES !== 'undefined' ? OP_TEMPLATES : [], clip = typeof opClip !== 'undefined' && opClip ? opClip : null;
  const bar = `<div class="pe-addbar"><select class="pe-addtype" aria-label="Add an operation"><option value="">+ Add an operation…</option>${PE_ADD.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}${tpls.length ? `<optgroup label="Templates">${tpls.map(t => `<option value="tpl:${esc(t.id)}">${esc(t.name)}</option>`).join('')}</optgroup>` : ''}</select>
    ${clip ? `<button class="btn sm" data-act="pe-op-paste">Paste ${clip.length === 1 ? '' : clip.length + ' '}operation${clip.length === 1 ? '' : 's'}</button>` : ''}</div>`;
  const shown = q.ops.filter(o => o.type !== 'notch' && o.type !== 'edge').length;
  const legend = `<div class="pe-legend"><span><i class="lg"></i>This face</span><span><i class="lg flip"></i>Flip side</span><span><i class="lg sel"></i>Picked</span></div>`;
  // Turned off: the part's own operations switched off, the cabinet's taken off, and the ones a hide rule takes off.
  const hidRule = Object.keys(hif).filter(k => hif[k] !== '' && !gen.some(o => opText(o) === k));
  const off = [...ops.map((u, i) => u.off ? `<tr><td>${esc(u.name || peOpName(u))}</td><td><button class="btn sm" data-act="pe-op-on" data-id="${i}">Turn on</button></td></tr>` : '').filter(Boolean),
    ...(e.hide || []).map((t, i) => `<tr><td>${esc(t)}</td><td><button class="btn sm" data-act="pe-unhide" data-id="${i}">Turn on</button></td></tr>`),
    ...hidRule.map(k => `<tr><td>${esc(k)} <span class="muted">(hide rule ${esc(String(hif[k]))})</span></td><td><button class="btn sm" data-act="pe-unrule" data-id="${esc(k)}">Turn on</button></td></tr>`)];
  const offBox = off.length ? `<details class="pe-gen"><summary>Turned off (${off.length})</summary><table class="t"><tbody>${off.join('')}</tbody></table></details>` : '';
  // Operations with nothing to draw (an edge profile) can still be picked here.
  const blind = gen.map((o, i) => o.type === 'edge' ? `<button class="btn sm${s.sel === 'g' + i ? ' on' : ''}" data-act="pe-pick" data-id="g${i}">${esc(o.why || opText(o))}</button>` : '').join('');
  if (!sel) return `${bar}${legend}<div class="pe-empty">${shown ? `Click an operation in the drawing to change it. <span class="muted">${shown} on this part.</span>` : 'No operations on this part yet. Add one above.'}</div>
    ${blind ? `<div class="pe-blind"><span class="muted">Not in the drawing:</span>${blind}</div>` : ''}${ops.length > 1 ? '<div class="row-actions"><button class="btn sm" data-act="pe-op-copyall">Copy all of this part\'s own operations</button></div>' : ''}${offBox}`;
  return `${bar}${legend}${peOpForm(c, q, e, s, sel)}${offBox}`;
}
// The picked operation's settings. One from the cabinet shows the same boxes; changing any of them makes it the part's own.
function peOpForm(c, q, e, s, sel) {
  const key = s.sel, gen = sel.kind === 'g', u = sel.u, o = sel.o, hif = e.hideIf || {};
  const flip = gen ? peFaceOf(o, q) === 'back' : u.face === 'back';
  const close = `<button class="btn sm pe-x" data-act="pe-desel" aria-label="Done with this operation" title="Done">×</button>`;
  const head = `<div class="pe-formhead"><span class="pe-dot${flip ? ' flip' : ''}"></span><b>${esc(gen ? (o.why || opText(o)) : (u.name || peOpName(u)))}</b>${u ? (gen || (u.name && u.name !== peOpName(u)) ? `<span class="muted">${esc(peOpName(u))}${gen ? ', from the cabinet' : ''}</span>` : '') : '<span class="muted">from the cabinet</span>'}<span class="grow"></span>${close}</div>`;
  const hideGen = gen ? `<label class="f"><span>Hide when (formula)</span><input class="pe-hideif" data-key="${esc(opText(o))}" value="${esc(peShow(hif[opText(o)]))}" placeholder="PartW < 12" aria-label="Hide when (formula)"></label>` : '';
  const tplName = u && (u.name || peOpName(u)), tpl = !gen && (typeof OP_TEMPLATES !== 'undefined' ? OP_TEMPLATES : []).find(t => t.name === tplName);
  const actions = `<div class="row-actions">${u ? `<button class="btn sm" data-act="pe-op-dup" data-id="${key}">Duplicate</button><button class="btn sm" data-act="pe-op-copy" data-id="${key}">Copy</button><button class="btn sm" data-act="pe-op-tpl" data-id="${key}">${tpl ? 'Update template' : 'Save as template'}</button>${tpl ? `<button class="btn sm" data-act="pe-tpl-del" data-id="${esc(tpl.id)}">Delete template</button>` : ''}` : ''}
    <span class="grow"></span>${gen ? `<button class="btn sm danger" data-act="pe-hide" data-id="${sel.i}">Turn off</button>` : `<button class="btn sm danger" data-act="pe-op-del" data-id="${sel.i}">Delete</button>`}</div>`;
  if (!u) return `<div class="pe-form">${head}<div>${esc(opText(o))}</div><div class="pe-grid">${hideGen}</div>${actions}</div>`;
  const P = sel.P, t = u.type, path = t === 'path' || t === 'pocket', made = gen ? [] : q.ops.filter(z => z.user === sel.i);
  const passes = Math.max(0, ...made.filter(z => z.passes).map(z => z.passes)), tools = peTools();
  const toolList = t === 'pocket' ? [{ v: 'auto', l: 'Auto (biggest bit that fits)' }, ...tools] : tools;
  const toolSel = peSel('Tool', P + '.tool', u.tool || peDefTool(), toolList.some(x => x.v === u.tool) || !u.tool ? toolList : [...toolList, { v: u.tool, l: u.tool + ' (not in the tool library)' }]);
  const fields = t === 'drill' ? peIn('Diameter', P + '.dia', u.dia)
    : t === 'groove' ? `${peIn('Width', P + '.width', u.width)}${peIn('Length (blank = to point 2)', P + '.len', u.len)}${peCount('Angle°', P + '.angle', u.angle)}`
    : t === 'linebore' ? `${peCount('Holes', P + '.count', u.count)}${peIn('Spacing', P + '.spacing', u.spacing)}${peCount('Angle°', P + '.angle', u.angle)}${peIn('Second row offset (0 = none)', P + '.row2', u.row2)}${peIn('Diameter', P + '.dia', u.dia)}`
    : t === 'perimeter' ? `${toolSel}${peIn('Inset from the edge', P + '.inset', u.inset)}${peSel('Cut', P + '.side', u.side || 'center', PE_OFFSETS)}`
    : t === 'edgebore' ? `${peSel('Edge', P + '.edge', u.edge || 'W1', PE_EDGES)}${peIn('Positions along the edge', P + '.at', u.at, '2, PartW - 2')}${peIn('Diameter', P + '.dia', u.dia)}${peIn('In from the face', P + '.inset', u.inset)}`
    : t === 'text' ? `${peIn('Text', P + '.text', u.text)}${peIn('Letter height', P + '.height', u.height)}${peCount('Angle°', P + '.angle', u.angle)}${toolSel}`
    : `${toolSel}${t === 'path' ? `${peSel('Path', P + '.closed', u.closed ? '1' : '', [{ v: '1', l: 'Closed' }, { v: '', l: 'Open' }])}${peSel('Cut', P + '.side', u.side || 'center', PE_OFFSETS)}` : ''}${peIn('Offset (+ bigger, − smaller)', P + '.offset', u.offset)}`;
  const pocketF = t === 'pocket' ? `${peSel('Pocket pattern', P + '.pStyle', u.pStyle || 'raster', [{ v: 'raster', l: 'Back and forth' }, { v: 'spiral', l: 'Spiral (rings)' }])}${peSel('Order', P + '.pOrder', u.pOrder || 'out-in', [{ v: 'out-in', l: 'Outside in' }, { v: 'in-out', l: 'Inside out (less tear-out)' }])}${peSel('Direction', P + '.pDir', u.pDir || '', [{ v: '', l: 'Machine setting' }, { v: 'cw', l: 'Clockwise' }, { v: 'ccw', l: 'Counter-clockwise' }])}` : '';
  const cleanF = path && (t === 'pocket' || u.closed) ? `<label class="f chk"><input type="checkbox" class="pe-in" data-path="${P}.clean"${u.clean ? ' checked' : ''}> <span>Clean out sharp inside corners with a V-bit</span></label>${u.clean ? peSel('Clean-out bit', P + '.cleanTool', u.cleanTool || (peVbits()[0] || {}).v || '', peVbits().length ? peVbits() : [{ v: '', l: 'Add a V-bit in CNC tools' }]) : ''}` : '';
  const offCopy = !gen && (path || t === 'perimeter') ? `<div class="row-actions"><span class="pe-copyoff"><input class="pe-copyoff-v" value="${esc(peShow(ui.peCopyOff ?? 0.125))}" aria-label="Offset for the copy"><button class="btn sm" data-act="pe-op-offcopy" data-id="${sel.i}" title="A copy moved out (+) or in (−) by this much, for a second bit">Copy with offset</button></span></div>` : '';
  const pills = `${passes > 1 ? ` <span class="pill">${passes} passes</span>` : ''}${made.some(z => z.cleanout) ? ` <span class="pill">${made.filter(z => z.cleanout).length} corner clean-outs</span>` : ''}`;
  return `<div class="pe-form">${head}${pills ? `<div>${pills}</div>` : ''}
    <div class="pe-grid">${peSel('Side', P + '.face', flip ? 'back' : 'top', [{ v: 'top', l: 'This face' }, { v: 'back', l: 'Flip side' }])}
    ${fields}${peIn(t === 'edgebore' ? 'Depth into the edge' : 'Depth (0 = through)', P + '.depth', u.depth)}${pocketF}${gen ? hideGen : peIn('Hide when (formula)', P + '.hideIf', u.hideIf, 'PartW < 12')}${gen ? '' : peIn('Name', P + '.name', u.name)}</div>${cleanF}
    ${t === 'perimeter' || t === 'edgebore' ? '' : `<div class="eyebrow">Points <span class="muted">drag them in the drawing, or type them</span></div>${pePtsTable(u.pts || [], P + '.pts', s.pt, path)}`}
    ${offCopy}${actions}</div>`;
}
function peShapeTab(c, q, e, s) {
  const pts = e.pts || peStartPts(q), i = s.pt, p = pts[i], n = pts.length, xf = e.xf || {};
  const vars = partVars(c, q), A = p && peXY(p, vars, q.L, q.W), B = p && peXY(pts[(i + 1) % n], vars, q.L, q.W);
  const len = p ? r3(Math.hypot(B.x - A.x, B.y - A.y)) : 0;
  const lib = PART_SHAPES.map(x => ({ v: x.id, l: x.name }));
  return `<div class="pe-seg-row"><span class="eyebrow">Start from</span>${PE_SHAPES.map(([k, l]) => `<button class="btn sm" data-act="pe-preset" data-id="${k}">${l}</button>`).join('')}</div>
    <div class="note">Click a point or an edge in the drawing. L/R/C and B/T/M say which end and edge a point is measured from, so it follows when the part changes size.</div>
    ${pePtsTable(pts, 'pts', i)}
    ${p ? `<div class="pe-ptbox"><div class="eyebrow">Point ${i + 1}, and the edge to point ${(i + 1) % n + 1}</div><div class="pe-grid">
      ${peIn('Corner radius', `pts.${i}.r`, p.r ?? '', '0')}
      <label class="f chk"><input type="checkbox" class="pe-in" data-path="pts.${i}.ri"${p.ri ? ' checked' : ''}> <span>Inside radius (cuts the corner away)</span></label>
      ${peIn(`Bulge to point ${(i + 1) % n + 1} (+ out, − in)`, `pts.${i}.b`, p.b ?? '', '0 = straight')}
      <label class="f"><span>Edge length to point ${(i + 1) % n + 1}</span><input class="pe-in" data-path="len.${i}" value="${esc(peShow(len))}" aria-label="Edge length"></label></div></div>` : ''}
    <div class="row-actions">${e.pts ? '<button class="btn sm" data-act="pe-shape-reset">Back to the plain part</button>' : ''}</div>
    <div class="eyebrow">Turn it</div>
    <div class="row-actions"><button class="btn sm" data-act="pe-xf" data-id="mx" aria-pressed="${!!xf.mx}">Mirror left–right</button><button class="btn sm" data-act="pe-xf" data-id="my" aria-pressed="${!!xf.my}">Mirror top–bottom</button><button class="btn sm" data-act="pe-xf" data-id="rot" aria-pressed="${!!(xf.mx && xf.my)}">Rotate 180°</button><button class="btn sm" data-act="pe-xf" data-id="face" aria-pressed="${!!xf.face}">Flip over (machining to the other face)</button></div>
    <div class="note">These turn the whole part, the cabinet's own drilling included.</div>
    <div class="eyebrow">Stretch test <span class="muted">see how the shape and operations follow a size change; nothing is saved</span></div>
    <div class="pe-grid"><label class="f"><span>Length ${(s.st || {}).dl ? (s.st.dl > 0 ? '+' : '') + fmtLen(s.st.dl, 1) : ''}</span><input type="range" class="pe-stretch" data-k="dl" min="${-Math.floor(q.L * 0.6)}" max="${Math.ceil(q.L)}" step="0.5" value="${(s.st || {}).dl || 0}" aria-label="Stretch length"></label>
      <label class="f"><span>Width ${(s.st || {}).dw ? (s.st.dw > 0 ? '+' : '') + fmtLen(s.st.dw, 1) : ''}</span><input type="range" class="pe-stretch" data-k="dw" min="${-Math.floor(q.W * 0.6)}" max="${Math.ceil(q.W)}" step="0.5" value="${(s.st || {}).dw || 0}" aria-label="Stretch width"></label></div>
    ${s.st && (s.st.dl || s.st.dw) ? '<div class="row-actions"><button class="btn sm" data-act="pe-stretch-off">Back to the real size</button></div>' : ''}
    <div class="eyebrow">Library and DXF</div>
    <div class="pe-grid"><label class="f"><span>Save this shape as</span><input class="pe-lib-name" value="${esc(q.name)}" aria-label="Name for the saved shape"></label><div class="f"><span>&nbsp;</span><button class="btn sm" data-act="pe-lib-save">Save to library</button></div>
      ${lib.length ? `<label class="f"><span>Saved shapes (every job)</span><select class="pe-lib-pick" aria-label="Saved shape">${lib.map(o => `<option value="${o.v}">${esc(o.l)}</option>`).join('')}</select></label><div class="f"><span>&nbsp;</span><div class="row-actions"><button class="btn sm" data-act="pe-lib-load">Load</button><button class="btn sm danger" data-act="pe-lib-del">Delete</button></div></div>` : ''}</div>
    <div class="row-actions"><button class="btn sm" data-act="pe-dxf-out">Save as DXF</button><label class="btn sm">Open DXF<input type="file" accept=".dxf,application/dxf" class="pe-dxf-in" hidden></label>
      <label class="f inl"><span>DXF units</span><select class="pe-dxf-units" aria-label="DXF units"><option value="auto"${(ui.peDxfUnits || 'auto') === 'auto' ? ' selected' : ''}>From the file</option><option value="in"${ui.peDxfUnits === 'in' ? ' selected' : ''}>Inches</option><option value="mm"${ui.peDxfUnits === 'mm' ? ' selected' : ''}>Millimetres</option></select></label></div>
    <div class="note">A DXF brings in the outline (the biggest closed shape) and turns circles into drill points and other lines into tool paths. Layer names like POCKET, GROOVE_W0.25, D0.5 (depth), THRU and BACK are read too.</div>
    <div class="eyebrow">Trace a picture</div>
    <div class="row-actions"><label class="btn sm">${ui.peImg ? 'Change picture' : 'Add a picture'}<input type="file" accept="image/*" class="pe-img-in" hidden></label>${ui.peImg ? `<button class="btn sm" data-act="pe-trace" aria-pressed="${!!s.trace}">${s.trace ? 'Stop adding points' : 'Click to add points'}</button><button class="btn sm" data-act="pe-trace-new">Start a new outline</button><button class="btn sm danger" data-act="pe-img-off">Remove picture</button>` : ''}</div>
    ${ui.peImg ? `<div class="pe-grid"><label class="f"><span>Picture width</span><input class="pe-img-w" value="${esc(fmtLen(ui.peImg.w, 1))}" aria-label="Picture width"></label><label class="f"><span>See-through</span><input type="range" class="pe-img-op" min="0.1" max="1" step="0.05" value="${ui.peImg.op}" aria-label="Picture strength"></label></div><div class="note">Set the picture width to the real width of what it shows. The picture is only kept while the editor is open.</div>` : ''}`;
}
const texChoices = () => { const seen = new Set(); return (S.materials || []).filter(m => m.texture && !seen.has(m.texture) && seen.add(m.texture)).map(m => ({ v: m.texture, l: m.name })); };
function peDetailsTab(c, q, e, s) {
  const a = peAdded(c, s.key), P = (a && a.pos) || {};
  const kinds = [{ v: '', l: 'From the cabinet' }, ...PART_KINDS.map(k => ({ v: k.id, l: k.name }))];
  const mats = [{ v: '', l: 'From the cabinet' }, ...azOpts(S.materials || [])];
  const texs = [{ v: '', l: 'From the material' }, ...texChoices()];
  return `<div class="pe-grid">${peIn('Name', 'name', e.name || '', q.name)}${peIn('Report name', 'report', e.report || '', 'Shop name for labels and the cut list')}${peIn('Comment', 'note', e.note || '', 'Shows on the cut list and labels')}${peIn('Quantity (0 = leave out)', 'qty', e.qty ?? '', String(q.qty))}
    ${peIn('Length (x)', 'L', e.L ?? '', fmtLen(q.L, 1))}${peIn('Width (y)', 'W', e.W ?? '', fmtLen(q.W, 1))}
    <label class="f"><span>Thickness</span><input disabled value="${esc(fmtLen(q.T, 1))}" aria-label="Thickness"></label>
    ${peSel('Grain', 'grain', e.grain === undefined ? '' : e.grain ? '1' : '0', [{ v: '', l: `From the material (${q.grain ? 'along the length' : 'none'})` }, { v: '1', l: 'Along the length (x)' }, { v: '0', l: 'No grain' }])}
    ${peSel('Part type', 'kind', e.kind || '', kinds)}${peSel('Material', 'mat', e.mat || '', mats)}${peSel('Texture', 'tex', e.tex || '', texs)}</div>
    <div class="note">Part type sets the banding from the part template. Material sets the thickness and grain. Texture only changes how it looks.</div>
    ${a ? `<div class="eyebrow">3D position</div>
      <label class="f chk"><input type="checkbox" class="pe-in" data-path="add.graphic"${a.graphic !== false ? ' checked' : ''}> <span>Draw it in 3D (untick for a cut-list-only part)</span></label>
      <div class="pe-grid">${peSel('Part faces', 'add.pos.face', P.face || 'flat', [{ v: 'flat', l: 'Flat, like a shelf' }, { v: 'side', l: 'On edge, like an end' }, { v: 'front', l: 'Facing front, like a back' }])}
      ${peIn('X from the left', 'add.pos.x', P.x ?? 0)}${peIn('Y from the back', 'add.pos.y', P.y ?? 0)}${peIn('Z up from the floor', 'add.pos.z', P.z ?? 0)}
      ${peIn('Rotate X°', 'add.pos.rx', P.rx ?? '', '0')}${peIn('Rotate Y°', 'add.pos.ry', P.ry ?? '', '0')}${peIn('Rotate Z°', 'add.pos.rz', P.rz ?? '', '0')}</div>
      <div class="note">The point is the part's left, back, bottom corner. Or drag the part in the 3D view.</div>` : ''}
    <div class="eyebrow">Names you can use in formulas</div>
    <div class="note pe-names">PartL ${fmtLen(q.L, 1)} · PartW ${fmtLen(q.W, 1)} · PartTh ${fmtLen(q.T, 1)} · W ${fmtLen(c.w, 1)} · H ${fmtLen(c.h, 1)} · D ${fmtLen(c.d, 1)}${(c.vars || []).filter(v => v.k).map(v => ` · ${esc(v.k)} ${esc(String(v.v))}`).join('')}${(S.job.vars || []).filter(v => v.k).map(v => ` · ${esc(v.k)} ${esc(String(v.v))}`).join('')}, and the cabinet's parameters by name.</div>
    <div class="row-actions">${Object.keys(e).length ? '<button class="btn sm danger" data-act="pe-reset-all">Rebuild (take off every change to this part)</button>' : ''}${a ? '<button class="btn sm danger" data-act="pe-del-added">Delete this added part</button>' : ''}</div>`;
}
function peBandTab(c, q, e) {
  const k = partKind(q.kind), eb = [{ v: '', l: 'From the part template' }, { v: 'none', l: 'No banding' }, ...opts(S.edgebands || [])];
  return `<div class="note">Click an edge in the drawing to band it or take the banding off, or pick a band for each edge.</div>
    <div class="pe-grid">${EDGE_KEYS.map(x => peSel(`${x} · ${esc(k.edges[x])} <span class="muted">(${esc((edgeband(q.band && q.band[x]) || {}).name || 'none')})</span>`, 'band.' + x, (e.band || {})[x] || '', eb)).join('')}</div>
    ${e.band ? '<div class="row-actions"><button class="btn sm" data-act="pe-band-reset">Back to the template banding</button></div>' : ''}`;
}
// The drawing, or a stretched copy of the part while the Stretch test sliders are moved.
function peDrawing(c, q, e, s) {
  const st = s.st || {};
  if (st.dl || st.dw) {
    const c2 = clone(c), e2 = ((c2.partEdits = c2.partEdits || {})[s.key] = c2.partEdits[s.key] || {});
    e2.L = r3(q.L + (st.dl || 0)); e2.W = r3(q.W + (st.dw || 0)); delete e2.off;
    const b2 = buildParts(c2), q2 = [...b2.parts, ...(b2.removed || [])].find(p => p.cabId === c.id && peKeyOf(p) === s.key);
    if (q2) return `<div class="pe-stretchnote">Stretch test: ${fmtLen(q2.L, 1)} × ${fmtLen(q2.W, 1)}, not saved</div>${peSVG(q2, e, s)}`;
  }
  return peSVG(q, e, s);
}
const peViewBar = () => `<div class="seg sm" role="group" aria-label="Units">${[['in', 'Inches'], ['mm', 'mm']].map(([k, l]) => `<button data-act="pe-units" data-id="${k}" aria-pressed="${(ui.peUnits || 'in') === k}">${l}</button>`).join('')}</div>
  <label class="f inl"><span>Grid</span><select class="pe-grid-pick" aria-label="Grid">${[['', 'Off'], [1 / 16, '1/16"'], [1 / 8, '1/8"'], [1 / 4, '1/4"'], [1 / 2, '1/2"'], [1, '1"'], [2, '2"'], [5 / 25.4, '5 mm'], [10 / 25.4, '10 mm']].map(([v, l]) => `<option value="${v}"${String(ui.peGrid || '') === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
  <label class="f inl chk"><input type="checkbox" class="pe-snap"${ui.peSnap === false ? '' : ' checked'}> <span>Snap</span></label>
  <span class="grow"></span><button class="btn sm" data-act="pe-sim" title="Runs the bit over every cut, in order">${icon('play')}Simulate</button>`;
function renderPartEdit() {
  const s = ui.partEdit; let el = $('#partedit');
  if (!s) { if (el) el.remove(); return; }
  const r = pePart(); if (!r || !r.q) { closePartEdit(); return; }
  const { c, q, b } = r, e = (c.partEdits || {})[s.key] || {};
  if (!el) { el = document.createElement('div'); el.id = 'partedit'; el.className = 'pe-back'; document.body.appendChild(el); }
  const T = [['shape', 'Shape'], ['ops', 'Operations'], ['band', 'Banding'], ['details', 'Details']];
  const warn = b.warn.filter(w => w.startsWith(q.name + ':'));
  el.innerHTML = `<div class="pe-win" role="dialog" aria-label="Part editor">
    <div class="pe-top"><span class="pill">${esc(LBL[c.id] || '')}</span><b>${esc(q.name)}</b>${q.out || (b.removed || []).includes(q) ? '<span class="pill warn">Left out</span>' : ''}<span class="muted">${fmtLen(q.L, 1)} × ${fmtLen(q.W, 1)} × ${fmtLen(q.T, 1)}</span><span class="grow"></span><button class="btn primary" data-act="pe-close">Done</button></div>
    <div class="pe-body"><div class="pe-left"><div class="pe-view">${peViewBar()}</div><div id="pe-drawwrap">${peDrawing(c, q, e, s)}</div></div>
    <div class="pe-right"><div class="pe-tabs" role="tablist">${T.map(([k, l]) => `<button role="tab" data-act="pe-tab" data-id="${k}" aria-selected="${s.tab === k}">${l}</button>`).join('')}</div>
      ${warn.map(w => `<div class="warnbox">${esc(w)}</div>`).join('')}
      <div class="pe-pane">${s.tab === 'shape' ? peShapeTab(c, q, e, s) : s.tab === 'details' ? peDetailsTab(c, q, e, s) : s.tab === 'band' ? peBandTab(c, q, e) : peOpsTab(c, q, e, s)}</div></div></div></div>`;
}

/* ----- Changing values ----- */
function peSetPath(o, path, v) {
  const ks = path.split('.'); let t = o;
  for (let i = 0; i < ks.length - 1; i++) { const k = ks[i], nk = ks[i + 1]; if (t[k] === undefined) t[k] = /^\d+$/.test(nk) ? [] : {}; t = t[k]; }
  const last = ks[ks.length - 1]; if (v === undefined) delete t[last]; else t[last] = v;
}
function peGetPath(o, path) { return path.split('.').reduce((t, k) => t == null ? t : t[k], o); }
// A typed value: a plain length becomes a number; anything else is kept as a formula.
function peValue(text) {
  let s = String(text).trim(); if (s === '') return undefined;
  if (peMM() && /^-?\d*\.?\d+$/.test(s)) s += 'mm';
  const n = parseLen(s); return isFinite(n) && !/[A-Za-z(]/.test(s.replace(/mm$/i, '')) ? n : s.replace(/^=/, '');
}
function peChange(path, raw, isSelect) {
  const s = ui.partEdit, c = s && cab(s.cab); if (!c) return;
  if (path.startsWith('add.')) {
    const a = peAdded(c, s.key); if (!a) return;
    mutate(() => { const k = path.slice(4); let v = k === 'graphic' ? !!raw : isSelect ? raw : peValue(raw); if (k.startsWith('pos.') && v === undefined) v = /\.r[xyz]$/.test(k) ? undefined : 0; if (k.startsWith('pos.') && !a.pos) a.pos = { face: 'flat', x: 0, y: 0, z: 0 }; peSetPath(a, k, v); });
    renderPartEdit(); return;
  }
  mutate(() => {
    const e = peEdit(c, s.key), r = pePart();
    if (path.startsWith('gen.')) { path = r && r.q ? peRealPath(e, r.q, s, path) : null; if (!path) return; }
    if (path.startsWith('ops.') && /\.face$/.test(path)) { peSetPath(e, path, raw === 'back' ? 'back' : 'top'); return; }
    if ((path.startsWith('pts') || path.startsWith('len.')) && !e.pts && r && r.q) e.pts = peStartPts(r.q);
    const q = r && r.q, vars = q && partVars(c, q);
    // Edge length: the far point moves along the edge; it keeps its anchor and becomes a plain number.
    if (path.startsWith('len.')) {
      const i = +path.slice(4), n = e.pts.length, A = peXY(e.pts[i], vars, q.L, q.W), Bp = e.pts[(i + 1) % n], B = peXY(Bp, vars, q.L, q.W), Lnew = peValue(raw);
      const c0 = Math.hypot(B.x - A.x, B.y - A.y), ux = c0 ? (B.x - A.x) / c0 : 1, uy = c0 ? (B.y - A.y) / c0 : 0;
      if (typeof Lnew === 'number' && Lnew > 0) peStore(Bp, A.x + ux * Lnew, A.y + uy * Lnew, q.L, q.W);
      return;
    }
    // A new anchor keeps the point where it is: its value is measured again from the new end or edge.
    const am = path.match(/^(.*)\.(ax|ay)$/);
    if (am) { const pt = peGetPath(e, am[1]); if (!pt) return; const z = peXY(pt, vars, q.L, q.W); if (raw) pt[am[2]] = raw; else delete pt[am[2]]; peStore(pt, z.x, z.y, q.L, q.W); return; }
    if (/\.(ri|clean)$/.test(path)) { peSetPath(e, path, raw ? true : undefined); return; }
    if (/^ops\.\d+\.(text|at)$/.test(path)) { peSetPath(e, path, String(raw).trim()); return; }
    if (/^ops\.\d+\.(count|angle)$/.test(path)) { const t = String(raw).trim(); peSetPath(e, path, t === '' ? undefined : isFinite(+t) ? +t : t.replace(/^=/, '')); return; }
    let v = isSelect ? raw : peValue(raw);
    if (path === 'grain') v = raw === '' ? undefined : raw === '1';
    else if (/\.closed$/.test(path)) v = raw === '1';
    else if (['name', 'note', 'report'].includes(path) && v !== undefined) v = String(raw).trim();
    else if (['kind', 'mat', 'tex'].includes(path) || path.startsWith('band.')) v = raw === '' ? undefined : raw;
    peSetPath(e, path, v);
    if (e.band && !Object.keys(e.band).length) delete e.band;
  });
  renderPartEdit();
}
document.addEventListener('change', ev => {
  const t = ev.target; if (!t.classList || !t.classList.contains('pe-hideif') || !ui.partEdit) return;
  const s = ui.partEdit, c = cab(s.cab); if (!c) return; const v = peValue(t.value), k = t.dataset.key;
  mutate(() => { const e = peEdit(c, s.key); e.hideIf = e.hideIf || {}; if (v === undefined || v === 0) delete e.hideIf[k]; else e.hideIf[k] = v; if (!Object.keys(e.hideIf).length) delete e.hideIf; });
  renderPartEdit();
});
document.addEventListener('change', ev => {
  const t = ev.target; if (!t.closest || !t.closest('#partedit') || !t.classList.contains('pe-in')) return;
  if (t.type === 'checkbox') peChange(t.dataset.path, t.checked, true); else peChange(t.dataset.path, t.value, t.tagName === 'SELECT');
});
function peAct(a, id) {
  const s = ui.partEdit, c = s && cab(s.cab); if (!c) return false;
  const r = pePart(), q = r && r.q;
  const edit = fn => { mutate(() => fn(peEdit(c, s.key))); renderPartEdit(); };
  switch (a) {
    case 'pe-close': closePartEdit(); return true;
    case 'pe-tab': s.tab = id; s.pt = -1; renderPartEdit(); return true;
    case 'pe-pick': s.sel = id || ''; s.pt = -1; if (s.tab !== 'ops' && s.sel) s.tab = 'ops'; renderPartEdit(); return true;
    case 'pe-desel': s.sel = ''; s.pt = -1; renderPartEdit(); return true;
    case 'pe-pt': s.pt = +id; renderPartEdit(); return true;
    case 'pe-op-add': {
      const type = id || 'drill', tpl = type.startsWith('tpl:') && OP_TEMPLATES.find(t => t.id === type.slice(4));
      edit(e => { (e.ops = e.ops || []).push(tpl ? clone(tpl.op) : peNewOp(type, q)); s.sel = 'u' + (e.ops.length - 1); }); s.pt = -1; return true;
    }
    case 'pe-op-copy': { const u = peOpCopy(c, q, id); if (u) { opClip = [u]; flash('Copied. Open any part and press Paste.'); renderPartEdit(); } return true; }
    case 'pe-op-copyall': { const e = (c.partEdits || {})[s.key]; opClip = clone((e && e.ops) || []); flash(`Copied ${opClip.length} operations.`); renderPartEdit(); return true; }
    case 'pe-op-paste': if (opClip) edit(e => { (e.ops = e.ops || []).push(...clone(opClip)); s.sel = 'u' + (e.ops.length - 1); }); return true;
    case 'pe-op-offcopy': {
      const v = peValue(($('#partedit .pe-copyoff-v') || {}).value || ''); if (typeof v !== 'number' || !v) { flash('Type how far to move the copy, like 0.125 or -0.25.'); return true; }
      ui.peCopyOff = v;
      edit(e => { const o = clone(e.ops[+id]), was = o.offset; o.offset = typeof was === 'string' && was ? `(${was}) + ${v}` : r3((+was || 0) + v); if (o.type === 'perimeter') { o.inset = typeof o.inset === 'string' && o.inset ? `(${o.inset}) - ${v}` : r3((+o.inset || 0) - v); delete o.offset; } o.name = (o.name || 'Path') + ' copy'; e.ops.splice(+id + 1, 0, o); s.sel = 'u' + (+id + 1); });
      return true;
    }
    case 'pe-op-tpl': {
      const u = peOpCopy(c, q, id); if (!u) return true;
      const name = u.name || peOpName(u), old = OP_TEMPLATES.findIndex(t => t.name === name), item = { id: old >= 0 ? OP_TEMPLATES[old].id : uid('opt'), name, op: u };
      if (old >= 0) OP_TEMPLATES[old] = item; else OP_TEMPLATES.push(item);
      saveOpTemplates(); flash(`Saved "${name}" to the operation templates.`); renderPartEdit(); return true;
    }
    case 'pe-tpl-del': OP_TEMPLATES = OP_TEMPLATES.filter(t => t.id !== id); saveOpTemplates(); renderPartEdit(); return true;
    case 'pe-sim': peSimulate(); return true;
    case 'pe-op-del': edit(e => { e.ops.splice(+id, 1); s.sel = ''; s.pt = -1; }); return true;
    case 'pe-op-dup': { const u = peOpCopy(c, q, id); if (u) edit(e => { (e.ops = e.ops || []).push(u); s.sel = 'u' + (e.ops.length - 1); }); return true; }
    case 'pe-op-on': edit(e => { delete e.ops[+id].off; s.sel = 'u' + id; }); return true;
    case 'pe-hide': { const o = peGen(q)[+id]; if (o) edit(e => { (e.hide = e.hide || []).push(opText(o)); s.sel = ''; s.pt = -1; }); return true; }
    case 'pe-unhide': edit(e => { e.hide.splice(+id, 1); if (!e.hide.length) delete e.hide; }); return true;
    case 'pe-unrule': edit(e => { if (e.hideIf) { delete e.hideIf[id]; if (!Object.keys(e.hideIf).length) delete e.hideIf; } }); return true;
    case 'pe-pt-add': case 'pe-pt-del': {
      const [path, i] = id.split(':'), n = +i;
      edit(e => {
        if (path === 'pts' && !e.pts) e.pts = peStartPts(q);
        const real = peRealPath(e, q, s, path); if (!real) return;
        const list = peGetPath(e, real); if (!list) return;
        if (a === 'pe-pt-del') { if (list.length > 1) list.splice(n, 1); s.pt = -1; return; }
        const vars = partVars(c, q), A = list[n], B = list[(n + 1) % list.length], num = v => peNum(v, vars);
        list.splice(n + 1, 0, { x: r3((num(A.x) + num(B.x)) / 2), y: r3((num(A.y) + num(B.y)) / 2) }); s.pt = n + 1;
      });
      return true;
    }
    case 'pe-shape-reset': edit(e => { delete e.pts; }); return true;
    case 'pe-reset-all': mutate(() => { delete c.partEdits[s.key]; }); renderPartEdit(); return true;
    case 'pe-band-reset': edit(e => { delete e.band; }); return true;
    case 'pe-seg': s.pt = +id; s.seg = +id; renderPartEdit(); return true;
    case 'pe-preset': { const sh = PE_SHAPES.find(x => x[0] === id); if (sh) edit(e => { e.pts = sh[2](q.L, q.W); s.pt = -1; }); return true; }
    case 'pe-xf': edit(e => { const x = e.xf = e.xf || {}; if (id === 'rot') { const on = !(x.mx && x.my); x.mx = on; x.my = on; } else x[id] = !x[id]; ['mx', 'my', 'face'].forEach(k => { if (!x[k]) delete x[k]; }); if (!Object.keys(x).length) delete e.xf; }); return true;
    case 'pe-units': ui.peUnits = id === 'mm' ? 'mm' : 'in'; renderPartEdit(); return true;
    case 'pe-stretch-off': s.st = null; renderPartEdit(); return true;
    case 'pe-lib-save': {
      const e = (c.partEdits || {})[s.key] || {}, name = (($('#partedit .pe-lib-name') || {}).value || q.name).trim() || q.name;
      const item = { id: uid('psh'), name, pts: clone(e.pts || peStartPts(q)), ops: clone(e.ops || []), L: q.L, W: q.W };
      const old = PART_SHAPES.findIndex(x => x.name === name); if (old >= 0) { item.id = PART_SHAPES[old].id; PART_SHAPES[old] = item; } else PART_SHAPES.push(item);
      savePartShapes(); flash(`Saved "${name}" to the shape library`); renderPartEdit(); return true;
    }
    case 'pe-lib-load': { const it = PART_SHAPES.find(x => x.id === ($('#partedit .pe-lib-pick') || {}).value); if (it) edit(e => { e.pts = clone(it.pts); if ((it.ops || []).length) e.ops = [...(e.ops || []), ...clone(it.ops)]; s.pt = -1; }); return true; }
    case 'pe-lib-del': { const v = ($('#partedit .pe-lib-pick') || {}).value; PART_SHAPES = PART_SHAPES.filter(x => x.id !== v); savePartShapes(); renderPartEdit(); return true; }
    case 'pe-dxf-out': { const name = `${fileSafe(S.job.name) || 'job'} ${fileSafe(LBL[c.id] || '')} ${fileSafe(q.name)}.dxf`.replace(/\s+/g, ' '); saveFile(new Blob([peDXF(c, q, (c.partEdits || {})[s.key] || {})], { type: 'application/dxf' }), name, 'Cabinet Designer/DXF'); return true; }
    case 'pe-trace': s.trace = !s.trace; renderPartEdit(); return true;
    case 'pe-trace-new': if (s.tab === 'shape') edit(e => { e.pts = []; s.trace = true; s.pt = -1; }); return true;
    case 'pe-img-off': ui.peImg = null; s.trace = false; renderPartEdit(); return true;
    case 'pe-edge': {
      const cur = q.band && q.band[id], others = EDGE_KEYS.map(k => q.band && q.band[k]).filter(Boolean), pick = others[0] || ((S.edgebands || [])[0] || {}).id;
      if (!cur && !pick) return true;
      edit(e => { e.band = e.band || {}; e.band[id] = cur ? 'none' : pick; });
      return true;
    }
    case 'pe-del-added': mutate(() => { c.addParts = (c.addParts || []).filter(a => peKey(a.name) !== s.key); if (c.partEdits) delete c.partEdits[s.key]; }); closePartEdit(); return true;
  }
  return false;
}
document.addEventListener('click', ev => {
  const s = ui.partEdit, svg = s && s.trace && ev.target.closest && !ev.target.closest('[data-pe-pt]') && ev.target.closest('#partedit svg.pe-draw');
  if (svg) { peTraceClick(svg, ev); ev.stopPropagation(); return; }
  // Click an operation in the drawing to pick it; click the empty drawing to let it go.
  const op = s && ev.target.closest && ev.target.closest('#partedit svg.pe-draw [data-pe-op]');
  if (op && s.tab !== 'band') { peAct('pe-pick', op.dataset.peOp); ev.stopPropagation(); return; }
  if (s && s.tab === 'ops' && s.sel && ev.target.closest && ev.target.closest('#partedit svg.pe-draw') && !ev.target.closest('[data-pe-pt],[data-act]')) { peAct('pe-desel'); ev.stopPropagation(); return; }
  const b = ev.target.closest && ev.target.closest('#partedit [data-act]'); if (!b) return;
  if (peAct(b.dataset.act, b.dataset.id)) { ev.stopPropagation(); ev.preventDefault(); }
}, true);
document.addEventListener('keydown', ev => {
  const s = ui.partEdit; if (!s || !$('#partedit')) return;
  const typing = ev.target && /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName);
  // Escape lets go of the picked operation first, then closes the editor. Delete removes (or turns off) the picked one.
  if (ev.key === 'Escape') { ev.stopPropagation(); if (s.sel && s.tab === 'ops') peAct('pe-desel'); else closePartEdit(); }
  else if ((ev.key === 'Delete' || ev.key === 'Backspace') && !typing && s.tab === 'ops' && s.sel) {
    ev.stopPropagation(); ev.preventDefault(); const k = s.sel; peAct(k[0] === 'u' ? 'pe-op-del' : 'pe-hide', k.slice(1));
  }
}, true);
document.addEventListener('change', ev => { const t = ev.target; if (t.classList && t.classList.contains('pe-addtype') && t.value) peAct('pe-op-add', t.value); });

// Dragging a numbered point in the drawing; it snaps to 1/16".
let peDrag = null;
document.addEventListener('pointerdown', ev => {
  const g = ev.target.closest && ev.target.closest('#partedit [data-pe-pt]'); if (!g) return;
  const svg = g.ownerSVGElement; ui.partEdit.pt = +g.dataset.pePt;
  peDrag = { i: +g.dataset.pePt, svg, g, moved: false }; try { svg.setPointerCapture(ev.pointerId); } catch (_) {}
  ev.preventDefault();
});
document.addEventListener('pointermove', ev => {
  if (!peDrag) return; const m = peDrag.svg.getScreenCTM(); if (!m) return;
  const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse()); peDrag.at = p; peDrag.moved = true;
  const c = peDrag.g.querySelector('circle'), t = peDrag.g.querySelector('text');
  c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); if (t) { t.setAttribute('x', p.x); t.setAttribute('y', p.y); }
});
function peDragEnd() {
  const d = peDrag; peDrag = null; if (!d) return;
  if (!d.moved) { renderPartEdit(); return; }
  const s = ui.partEdit, r = pePart(); if (!r || !r.q) return;
  const g = ui.peSnap === false ? 0 : (ui.peGrid || 1 / 16), snap = v => g ? Math.round(v / g) * g : v;
  const sel = s.tab === 'shape' ? null : peSelOp(r.c, r.q, (r.c.partEdits || {})[s.key] || {}, s); if (s.tab !== 'shape' && !sel) return;
  mutate(() => {
    const e = peEdit(r.c, s.key); if (!sel && !e.pts) e.pts = peStartPts(r.q);
    const path = sel ? peRealPath(e, r.q, s, sel.P + '.pts') : 'pts'; if (!path) return;
    const list = peGetPath(e, path), z = peView({ x: snap(d.at.x), y: snap(r.q.W - d.at.y) }, r.q, e);
    if (list && list[d.i]) peStore(list[d.i], z.x, z.y, r.q.L, r.q.W);
  });
  renderPartEdit();
}
document.addEventListener('pointerup', peDragEnd);
document.addEventListener('pointercancel', peDragEnd);
onAllFingersUp(peDragEnd);

// Little tags on the Parts tab for what was changed by hand, like Mozaik's colour codes.
function peBadges(e) {
  if (!e) return '';
  const t = [];
  if (e.pts) t.push(['shape', 'Shape']);
  if ((e.ops || []).length || (e.hide || []).length) t.push(['ops', 'Operations']);
  if (e.band) t.push(['band', 'Banding']);
  if (e.xf) t.push(['shape', 'Mirrored']);
  if (['L', 'W', 'qty', 'grain', 'name', 'note', 'report', 'kind', 'mat', 'tex'].some(k => e[k] !== undefined && e[k] !== '')) t.push(['det', 'Details']);
  return t.map(([k, l]) => ` <span class="pe-tag ${k}">${l}</span>`).join('');
}

/* ----- Parts tab of the cabinet editor: Add part, Copy part, Rebuild, sorting, Parts to Build ----- */
function peUniqueName(c, base) {
  const names = new Set(buildParts(c).parts.filter(p => p.cabId === c.id).map(p => peKey(p.name)).concat((c.addParts || []).map(a => a.name)));
  if (!names.has(base)) return base; let i = 2; while (names.has(`${base} ${i}`)) i++; return `${base} ${i}`;
}
function partsTabAct(a, id) {
  const c = cab(ui.quick); if (!c) return false;
  const sel = () => ui.edPart;
  switch (a) {
    case 'pe-add-part': {
      const name = peUniqueName(c, 'Added part');
      mutate(() => { (c.addParts = c.addParts || []).push({ id: uid('ap'), name, L: 12, W: 12, kind: 'shelf', qty: 1, graphic: true, pos: { face: 'flat', x: '(W - PartL)/2', y: 0, z: 'H/2' } }); });
      ui.edPart = name; openPartEdit(c.id, name, 'details'); return true;
    }
    case 'pe-copy-part': {
      const k = sel(); if (!k) return true;
      const src = (c.addParts || []).find(x => peKey(x.name) === k), name = peUniqueName(c, k + ' copy');
      mutate(() => {
        (c.addParts = c.addParts || []).push(src ? { ...clone(src), id: uid('ap'), name } : { id: uid('ap'), copyOf: k, name, graphic: false });
        const e = (c.partEdits || {})[k]; if (e) { const ne = clone(e); delete ne.name; delete ne.off; c.partEdits[name] = ne; }
      });
      ui.edPart = name; renderQuick(); return true;
    }
    case 'pe-del-part': { const k = id || sel(); mutate(() => { c.addParts = (c.addParts || []).filter(x => peKey(x.name) !== k); if (c.partEdits) delete c.partEdits[k]; }); renderQuick(); return true; }
    case 'pe-open-name': { const k = id || sel(); if (k) openPartEdit(c.id, k); return true; }
    case 'pe-rebuild': { const k = id || sel(); if (k && c.partEdits) mutate(() => { delete c.partEdits[k]; }); renderQuick(); return true; }
    case 'pe-rebuild-all':
      if (!ui.edRebuildAll) { ui.edRebuildAll = true; renderQuick(); setTimeout(() => { if (ui.edRebuildAll) { ui.edRebuildAll = false; if (ui.quick) renderQuick(); } }, 4000); return true; }
      ui.edRebuildAll = false; mutate(() => { delete c.partEdits; delete c.addParts; }); renderQuick(); return true;
    case 'pe-legend': ui.edLegend = !ui.edLegend; renderQuick(); return true;
    case 'pe-sort': { const sk = ui.edSort || { k: '', d: 1 }; ui.edSort = sk.k === id ? (sk.d > 0 ? { k: id, d: -1 } : { k: '', d: 1 }) : { k: id, d: 1 }; renderQuick(); return true; }
  }
  return false;
}
document.addEventListener('change', ev => {
  const t = ev.target; if (!t.classList || !t.classList.contains('pe-build')) return;
  const c = cab(ui.quick); if (!c) return; const k = t.dataset.id;
  mutate(() => { const e = peEdit(c, k); if (t.checked) { delete e.off; if (e.qty === 0) delete e.qty; if (!Object.keys(e).length) delete c.partEdits[k]; } else e.off = true; });
  renderQuick();
});

/* ----- Dragging an added part in 3D (P10). The cabinet has to be selected first so a drag elsewhere still orbits.
   It moves in the plane facing you (the cabinet axis you look along stays put), snaps its faces to the faces of the
   other parts within 3/4", and otherwise to 1/16". Letting go writes plain numbers into the part's 3D position. ----- */
function partDrag3d(v, e) {
  const r = v.renderer.domElement.getBoundingClientRect(), m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(m, v.cam);
  // The first added part along the ray, even behind a door, since its cabinet is already selected.
  const hit = rc.intersectObjects(v.root.children, true).find(h => h.object.isMesh && h.object.visible && h.object.userData.addedPart); const o = hit && hit.object;
  if (!o || !o.userData.addedPart) return;
  const c = cab(o.userData.cabId); if (!c || !((ui.sel && ui.sel.id === c.id) || ui.quick === c.id)) return;
  e.stopPropagation(); e.preventDefault();
  const grp = o.parent; grp.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert(), ld = v.cam.getWorldDirection(new THREE.Vector3()).transformDirection(inv);
  const ax = ['x', 'y', 'z'].reduce((b, k) => Math.abs(ld[k]) > Math.abs(ld[b]) ? k : b, 'x');
  const nl = new THREE.Vector3(); nl[ax] = 1;
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(nl.clone().transformDirection(grp.matrixWorld), hit.point);
  // Boxes of everything else in the cabinet, in the cabinet's own frame.
  const localBox = obj => { const wb = new THREE.Box3().setFromObject(obj), lb = new THREE.Box3(); if (wb.isEmpty()) return null; [0, 1].forEach(i => [0, 1].forEach(j => [0, 1].forEach(k => lb.expandByPoint(grp.worldToLocal(new THREE.Vector3(i ? wb.max.x : wb.min.x, j ? wb.max.y : wb.min.y, k ? wb.max.z : wb.min.z)))))); return lb; };
  const boxes = []; grp.traverse(x => { if (x.isMesh && x !== o && x.visible) { const b = localBox(x); if (b) boxes.push(b); } });
  const ob = localBox(o), half = ob.getSize(new THREE.Vector3()).multiplyScalar(0.5), off = ob.getCenter(new THREE.Vector3()).sub(o.position);
  const d = { v, o, grp, plane, ax, rc, start: grp.worldToLocal(hit.point.clone()), pos0: o.position.clone(), boxes, half, off, cid: c.id, key: o.userData.addedPart, moved: false };
  v.controls.enabled = false; v.renderer.domElement.style.cursor = 'grabbing';
  const move = ev => {
    const R = v.renderer.domElement.getBoundingClientRect(); rc.setFromCamera(new THREE.Vector2(((ev.clientX - R.left) / R.width) * 2 - 1, -((ev.clientY - R.top) / R.height) * 2 + 1), v.cam);
    const p = rc.ray.intersectPlane(plane, new THREE.Vector3()); if (!p) return;
    const dl = grp.worldToLocal(p).sub(d.start); dl[ax] = 0;
    const np = d.pos0.clone().add(dl), cen = np.clone().add(off);
    ['x', 'y', 'z'].forEach(k => {
      if (k === ax) return;
      const lo = cen[k] - half[k], hi = cen[k] + half[k]; let best = 0.75, shift = null;
      boxes.forEach(b => [b.min[k], b.max[k]].forEach(t => [lo, hi].forEach(edge => { const g = Math.abs(edge - t); if (g < best) { best = g; shift = t - edge; } })));
      np[k] += shift !== null ? shift : Math.round((lo) * 16) / 16 - lo;
    });
    d.np = np; d.moved = true; o.position.copy(np); v.requestRender();
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); unhook();
    v.controls.enabled = true; v.renderer.domElement.style.cursor = '';
    if (!d.moved) return;
    const cc = cab(d.cid), a = cc && peAdded(cc, d.key); if (!a) return;
    const q = buildParts(cc).parts.find(p => p.added && p.editKey === d.key), vars = q ? partVars(cc, q) : () => undefined, n = x => { const t = peNum(x ?? 0, vars); return isFinite(t) ? t : 0; };
    const dd = d.np.clone().sub(d.pos0), P = a.pos || { face: 'flat', x: 0, y: 0, z: 0 };
    mutate(() => { a.pos = { ...P, x: r3(n(P.x) + dd.x), z: r3(n(P.z) + dd.y), y: r3(n(P.y) + dd.z) }; });
    if (ui.partEdit) renderPartEdit();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  const unhook = onAllFingersUp(up);
}

/* ----- Editor controls that are not buttons: grid, snap, stretch sliders, DXF and picture files ----- */
document.addEventListener('change', ev => {
  const t = ev.target, s = ui.partEdit; if (!s || !t.closest || !t.closest('#partedit')) return;
  if (t.classList.contains('pe-grid-pick')) { ui.peGrid = t.value ? +t.value : 0; renderPartEdit(); }
  else if (t.classList.contains('pe-snap')) { ui.peSnap = t.checked; }
  else if (t.classList.contains('pe-dxf-units')) { ui.peDxfUnits = t.value; }
  else if (t.classList.contains('pe-stretch')) { renderPartEdit(); }
  else if (t.classList.contains('pe-img-w')) { const w = peValue(t.value); if (ui.peImg && typeof w === 'number' && w > 0) { ui.peImg.h = ui.peImg.h * w / ui.peImg.w; ui.peImg.w = w; } renderPartEdit(); }
  else if (t.classList.contains('pe-dxf-in') && t.files[0]) t.files[0].text().then(peImportDXF, err => flash('Could not read the file: ' + err.message));
  else if (t.classList.contains('pe-img-in') && t.files[0]) {
    const fr = new FileReader(); fr.onload = () => { const im = new Image(); im.onload = () => { const r = pePart(); const w = r && r.q ? r.q.L : 24; ui.peImg = { url: fr.result, w, h: w * im.naturalHeight / (im.naturalWidth || 1), op: 0.5 }; renderPartEdit(); }; im.src = fr.result; };
    fr.readAsDataURL(t.files[0]);
  }
});
// While a slider moves only the drawing is redrawn, so the slider keeps working.
document.addEventListener('input', ev => {
  const t = ev.target, s = ui.partEdit; if (!s || !t.closest || !t.closest('#partedit')) return;
  if (t.classList.contains('pe-stretch')) { s.st = { ...(s.st || {}), [t.dataset.k]: +t.value }; const r = pePart(), w = $('#pe-drawwrap'); if (r && r.q && w) w.innerHTML = peDrawing(r.c, r.q, (r.c.partEdits || {})[s.key] || {}, s); const sp = t.closest('label').querySelector('span'); if (sp) sp.textContent = `${t.dataset.k === 'dl' ? 'Length' : 'Width'} ${+t.value ? (+t.value > 0 ? '+' : '') + fmtLen(+t.value, 1) : ''}`; }
  else if (t.classList.contains('pe-img-op') && ui.peImg) { ui.peImg.op = +t.value; const im = $('#partedit svg.pe-draw image'); if (im) im.setAttribute('opacity', t.value); }
});
function peTraceClick(svg, ev) {
  const s = ui.partEdit, r = pePart(); if (!r || !r.q) return; const m = svg.getScreenCTM(); if (!m) return;
  const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse()), g = ui.peSnap === false ? 0 : (ui.peGrid || 1 / 16), snap = v => g ? Math.round(v / g) * g : v;
  mutate(() => {
    const e = peEdit(r.c, s.key), z = peView({ x: snap(p.x), y: snap(r.q.W - p.y) }, r.q, e), pt = peAnchor({ x: r3(z.x), y: r3(z.y) }, r.q.L, r.q.W);
    const k = s.tab === 'ops' && /^u\d+$/.test(s.sel || '') ? +s.sel.slice(1) : -1;
    if (k >= 0 && e.ops && e.ops[k]) { (e.ops[k].pts = e.ops[k].pts || []).push(pt); s.pt = e.ops[k].pts.length - 1; }
    else { if (!e.pts) e.pts = []; e.pts.push(pt); s.pt = e.pts.length - 1; }
  });
  renderPartEdit();
}

/* ----- Shape library: shaped parts saved for every job (in the hub's storage, or this browser) ----- */
let PART_SHAPES = [];
async function loadPartShapes() {
  try { let v = typeof inHub === 'function' && inHub() ? await Hub.storage.get('partShapes') : JSON.parse(localStorage.getItem(KEY + '.partShapes') || '[]'); if (v && v.value) v = v.value; PART_SHAPES = Array.isArray(v) ? v : []; } catch (_) { PART_SHAPES = []; }
}
function savePartShapes() {
  try { localStorage.setItem(KEY + '.partShapes', JSON.stringify(PART_SHAPES)); } catch (_) {}
  if (typeof inHub === 'function' && inHub()) Hub.storage.set('partShapes', PART_SHAPES).catch(() => flash('Could not save the shape library.'));
}

/* ----- DXF out and in. Inches, y up from the bottom edge, like the editor. ----- */
function peDXF(c, q, e) {
  const n = v => String(r3(v)), out = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const poly = (pts, closed, layer) => { out.push('0', 'LWPOLYLINE', '8', layer, '90', String(pts.length), '70', closed ? '1' : '0'); pts.forEach(p => { out.push('10', n(p.x), '20', n(p.y)); if (p.bulge) out.push('42', String(+p.bulge.toFixed(6))); }); };
  const Y = y => q.W - y, vars = partVars(c, q);
  // The outline keeps its arcs as DXF bulges when it has no rounded corners; otherwise it goes out as the finished points.
  const src = e.pts && e.pts.length >= 3 ? e.pts : null;
  if (src && !src.some(p => p.r)) {
    const P = src.map(p => ({ ...peView(peXY(p, vars, q.L, q.W), q, e), b: p.b ? peNum(p.b, vars) : 0 })), ccw = shapeArea2(P) > 0;
    poly(P.map((p, i) => { const nx = P[(i + 1) % P.length], ch = Math.hypot(nx.x - p.x, nx.y - p.y); return { x: p.x, y: p.y, bulge: p.b && ch ? (ccw ? 1 : -1) * p.b / (ch / 2) : 0 }; }), true, 'OUTLINE');
  } else poly(q.outline || peOutline(peStartPts(q), vars, q.L, q.W) || [], true, 'OUTLINE');
  const cnt = {}; q.ops.forEach(o => { if (o.face) cnt[o.face] = (cnt[o.face] || 0) + 1; }); const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  q.ops.forEach(o => {
    const d = o.through ? 'THRU' : 'D' + n(o.depth), back = o.face && top && o.face !== top ? '_BACK' : '';
    if (o.type === 'bore') out.push('0', 'CIRCLE', '8', `DRILL_${d}${back}`, '10', n(o.x), '20', n(Y(o.y)), '40', n(o.dia / 2));
    else if (o.type === 'groove') poly([{ x: o.x1, y: Y(o.y1) }, { x: o.x2, y: Y(o.y2) }], false, `GROOVE_W${n(o.width)}_${d}${back}`);
    else if (o.type === 'path') poly(o.pts.map(p => ({ x: p.x, y: Y(p.y) })), o.closed, `${o.pocket ? 'POCKET' : 'PATH'}_${d}${o.side && o.side !== 'center' ? '_' + o.side.toUpperCase() : ''}${back}`);
    else if ((o.type === 'pocket' || o.type === 'cutout') && isFinite(o.w)) { const y0 = Y(o.y + o.h), y1 = Y(o.y); poly([{ x: o.x, y: y0 }, { x: o.x + o.w, y: y0 }, { x: o.x + o.w, y: y1 }, { x: o.x, y: y1 }], true, o.type === 'cutout' ? `PATH_THRU${back}` : `POCKET_${d}${back}`); }
  });
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n') + '\n';
}
// Reads LWPOLYLINE, POLYLINE, LINE, ARC and CIRCLE. Loose lines and arcs that meet end to end are joined into one shape.
function parseDXF(text) {
  const raw = text.split(/\r?\n/), pairs = []; for (let i = 0; i + 1 < raw.length; i += 2) pairs.push([parseInt(raw[i].trim(), 10), raw[i + 1].trim()]);
  let units = 0, inEnt = false, cur = null, poly = null; const ents = [];
  for (let i = 0; i < pairs.length; i++) {
    const [k, v] = pairs[i];
    if (k === 9 && v === '$INSUNITS') { const nx = pairs[i + 1]; if (nx && nx[0] === 70) units = +nx[1]; }
    if (k === 2 && v === 'ENTITIES') inEnt = true;
    if (k === 0 && v === 'ENDSEC') { if (cur) ents.push(cur); cur = null; inEnt = false; }
    if (!inEnt) continue;
    if (k === 0) {
      if (v === 'VERTEX' && poly) { cur = { type: 'VERTEX', parent: poly }; continue; }
      if (cur && cur.type !== 'VERTEX') ents.push(cur);
      if (v === 'SEQEND') { poly = null; cur = null; continue; }
      cur = { type: v, layer: '', pts: [], flags: 0 }; if (v === 'POLYLINE') poly = cur;
      continue;
    }
    if (!cur) continue;
    const f = parseFloat(v);
    if (cur.type === 'VERTEX') { const P = cur.parent; if (k === 10) P.pts.push({ x: f, y: 0, bulge: 0 }); else if (k === 20 && P.pts.length) P.pts[P.pts.length - 1].y = f; else if (k === 42 && P.pts.length) P.pts[P.pts.length - 1].bulge = f; continue; }
    if (k === 8) cur.layer = v;
    else if (k === 70) cur.flags = +v;
    else if (cur.type === 'LWPOLYLINE') { if (k === 10) cur.pts.push({ x: f, y: 0, bulge: 0 }); else if (k === 20 && cur.pts.length) cur.pts[cur.pts.length - 1].y = f; else if (k === 42 && cur.pts.length) cur.pts[cur.pts.length - 1].bulge = f; }
    else cur[k] = f;
  }
  if (cur && cur.type !== 'VERTEX') ents.push(cur);
  const shapes = [], loose = [], circles = [];
  ents.forEach(e => {
    if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.pts.length >= 2) { const cl = !!(e.flags & 1); const pts = e.pts.slice(); if (!cl && pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-3) { pts.pop(); shapes.push({ pts, closed: true, layer: e.layer }); } else shapes.push({ pts, closed: cl, layer: e.layer }); }
    else if (e.type === 'LINE') loose.push({ a: { x: e[10], y: e[20] }, b: { x: e[11], y: e[21] }, bulge: 0, layer: e.layer });
    else if (e.type === 'ARC') { const s0 = e[50] * Math.PI / 180, s1 = e[51] * Math.PI / 180; let sw = s1 - s0; while (sw <= 0) sw += 2 * Math.PI; loose.push({ a: { x: e[10] + e[40] * Math.cos(s0), y: e[20] + e[40] * Math.sin(s0) }, b: { x: e[10] + e[40] * Math.cos(s1), y: e[20] + e[40] * Math.sin(s1) }, bulge: Math.tan(sw / 4), layer: e.layer }); }
    else if (e.type === 'CIRCLE') circles.push({ x: e[10], y: e[20], r: e[40], layer: e.layer });
  });
  // Join loose segments end to end.
  const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.01;
  while (loose.length) {
    const s0 = loose.shift(), pts = [{ ...s0.a, bulge: s0.bulge }]; let end = s0.b, found = true;
    while (found && !near(end, pts[0].x !== undefined ? pts[0] : end)) {
      found = false;
      for (let i = 0; i < loose.length; i++) {
        const g = loose[i];
        if (near(g.a, end)) { pts.push({ ...g.a, bulge: g.bulge }); end = g.b; loose.splice(i, 1); found = true; break; }
        if (near(g.b, end)) { pts.push({ ...g.b, bulge: -g.bulge }); end = g.a; loose.splice(i, 1); found = true; break; }
      }
    }
    const closed = near(end, pts[0]); if (!closed) pts.push({ ...end, bulge: 0 });
    shapes.push({ pts, closed, layer: s0.layer });
  }
  return { shapes, circles, units };
}
function peImportDXF(text) {
  const s = ui.partEdit, r = pePart(); if (!r || !r.q) return;
  let d; try { d = parseDXF(text); } catch (err) { flash('This DXF could not be read: ' + err.message); return; }
  const mode = ui.peDxfUnits || 'auto', k = mode === 'mm' || (mode === 'auto' && d.units === 4) ? 1 / 25.4 : mode === 'auto' && d.units === 5 ? 1 / 2.54 : mode === 'auto' && d.units === 6 ? 1000 / 25.4 : 1;
  const area = pts => Math.abs(shapeArea2(pts));
  const closed = d.shapes.filter(x => x.closed && x.pts.length >= 3).sort((a, b) => area(b.pts) - area(a.pts));
  const outline = closed.find(x => /outline|profile|part|cut|border/i.test(x.layer)) || closed[0];
  if (!outline) { flash('No closed outline in this DXF. Draw the part outline as one closed polyline.'); return; }
  // Sizes in inches, moved so the outline starts at 0,0; DXF bulges become the editor's edge bulges (+ out of the part).
  const sc = p => ({ x: p.x * k, y: p.y * k, bulge: p.bulge || 0 });
  const O = outline.pts.map(sc), ccw = shapeArea2(O) > 0;
  const withB = O.map((p, i) => { const nx = O[(i + 1) % O.length], ch = Math.hypot(nx.x - p.x, nx.y - p.y), b = p.bulge * ch / 2; return { x: p.x, y: p.y, ...(b ? { b: r3(ccw ? b : -b) } : {}) }; });
  // The size includes the top of each arc (the flattened arc can fall just short of it).
  const ext = [...shapeOutline(withB)]; withB.forEach((p, i) => { if (!p.b) return; const nx = withB[(i + 1) % withB.length], no = edgeOut(p, nx, ccw); ext.push({ x: (p.x + nx.x) / 2 + no.x * p.b, y: (p.y + nx.y) / 2 + no.y * p.b }); });
  const xs = ext.map(p => p.x), ys = ext.map(p => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys), L = r3(Math.max(...xs) - x0), W = r3(Math.max(...ys) - y0);
  const layerDepth = l => /THRU/i.test(l) ? 0 : (m => m ? r3(+m[1] * k) : 0.25)(l.match(/D(\d*\.?\d+)/i)), face = l => /BACK/i.test(l) ? 'back' : 'top';
  const flat = sh => { const P = sh.pts.map(sc), out = []; P.forEach((p, i) => { out.push({ x: p.x, y: p.y }); const nx = P[i + 1] || (sh.closed ? P[0] : null); if (nx && p.bulge) out.push(...bulgeArc(p, nx, p.bulge * Math.hypot(nx.x - p.x, nx.y - p.y) / 2, true)); }); return out; };
  const at = list => list.map(p => peAnchor({ x: r3(p.x - x0), y: r3(p.y - y0), ...(p.b ? { b: p.b } : {}) }, L, W));
  const ops = [];
  d.shapes.filter(x => x !== outline).forEach(sh => {
    const l = sh.layer || '', pts = at(flat(sh)), base = { name: l || 'From DXF', face: face(l), depth: layerDepth(l), tool: peDefTool() };
    if (/GROOVE/i.test(l) && !sh.closed) { const w = l.match(/W(\d*\.?\d+)/i); ops.push({ ...base, type: 'groove', width: w ? r3(+w[1] * k) : 0.25, pts }); }
    else if (/POCKET/i.test(l) && sh.closed) ops.push({ ...base, type: 'pocket', pts });
    else ops.push({ ...base, type: 'path', closed: sh.closed, side: /_LEFT/i.test(l) ? 'left' : /_RIGHT/i.test(l) ? 'right' : 'center', pts });
  });
  const groups = {}; d.circles.forEach(ci => { const key = r3(ci.r * 2 * k) + '|' + (ci.layer || ''); (groups[key] = groups[key] || []).push(ci); });
  Object.entries(groups).forEach(([key, cs]) => { const l = cs[0].layer || ''; ops.push({ type: 'drill', name: l || 'Drill', dia: r3(cs[0].r * 2 * k), depth: layerDepth(l), face: face(l), pts: at(cs.map(ci => ({ x: ci.x * k, y: ci.y * k }))) }); });
  mutate(() => { const e = peEdit(r.c, s.key); e.L = L; e.W = W; e.pts = at(withB); if (ops.length) e.ops = ops; delete e.xf; });
  s.pt = -1; s.sel = ''; renderPartEdit();
  flash(`Opened the DXF: ${fmtLen(L, 1)} × ${fmtLen(W, 1)}, ${ops.length} operation${ops.length === 1 ? '' : 's'}`);
}
loadPartShapes();
