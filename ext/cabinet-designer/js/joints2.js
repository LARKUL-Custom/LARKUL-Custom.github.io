// Joint types (J1-J6): each kind of joint in the box gets its own hole locations, a center fastener on long joints,
// a "don't use" switch, copy from another type, a fastener kind, and nailer parts joined with their own type.
'use strict';

const JT_TYPES = [['bottom', 'Bottom'], ['top', 'Top'], ['stretcher', 'Stretchers'], ['nailer', 'Nailers'], ['divider', 'Dividers'], ['back', 'Back'], ['toe', 'Toe kick / skin'], ['shelf', 'Fixed shelves']];
const JT_FROM = [{ v: 'none', l: "Don't use" }, { v: 'front', l: 'From front' }, { v: 'back', l: 'From back' }, { v: 'center', l: 'From center' }];
const JT_KINDS = [
  { v: 'holes', l: 'Holes (female and male, as set below)' }, { v: 'confirmat', l: 'Confirmat screws' }, { v: 'dowel', l: 'Dowels' },
  { v: 'combo', l: 'Dowel and confirmat (dowels either side)' }, { v: 'pocket', l: 'Pocket screws' }, { v: 'lamello', l: 'Lamello (Clamex) connectors' },
  { v: 'route', l: 'Route (dado the panel into the side)' },
  { v: 'ledge', l: 'Locating rabbet the side rests on, plus screws or dowels' },
  { v: 'tabslot', l: 'Tab and slot: the side drops over the bottom\'s tabs, stretchers drop into the sides' },
];
// What a locating rabbet (ledge) template drills along with the rabbet.
const JT_LEDGE_WITH = [{ v: 'confirmat', l: 'Confirmat screws' }, { v: 'dowel', l: 'Dowels (no screw heads outside)' }, { v: 'combo', l: 'Dowel and confirmat' }, { v: 'none', l: 'Nothing (glue only)' }];
const JT_LEDGE_TYPES = ['bottom', 'top', 'stretcher', 'shelf'];
// Back and toe joints only count fasteners for the hardware list: the back sits in a dado and the toe skin clips on.
const JT_COUNT_ONLY = ['back', 'toe'];

// The location settings a type uses. A type nobody has set yet follows the old template fields, so old jobs build the same.
function jtLegacy(J, type) {
  if (type === 'top') return J.top || J.ends || JOINT_LOC;
  if (type === 'divider') return J.dividers || JOINT_LOC;
  if (type === 'stretcher') return { mode: 'spread', count: ((J.stretchers || {}).n | 0) || 2 };
  if (type === 'nailer') return { mode: 'count', count: 2, front: 0.75, back: 0.75 };
  if (type === 'back' || type === 'toe') return { none: true, mode: 'gap', maxGap: 8, front: 2, back: 2 };
  return J.ends || JOINT_LOC;
}
function jtLoc(J, type) { const o = (J.types || {})[type]; return o && !o.same ? o : jtLegacy(J, type); }
function jtNum(at, L, T) {
  if (typeof at === 'number') return at;
  const s = String(at ?? '').trim(); if (!s) return 0;
  const n = parseLen(s); if (isFinite(n)) return n;
  try { return evalExpr(s.replace(/^=/, ''), k => ({ L, T, LEN: L })[k.toUpperCase()]); } catch (e) { return NaN; }
}
// Where along a joint from a to b the fasteners go.
function jtSpots(J, type, a, b, spread, T = 0.75) {
  const o = jtLoc(J, type), L = b - a;
  if (o.none) return [];
  let ys;
  if (o.mode === 'spread') { const n = Math.max(1, o.count | 0); ys = Array.from({ length: n }, (_, i) => a + L * (i + 0.5) / n); }
  else {
    const used = (o.pts || []).filter(q => q && q.from && q.from !== 'none');
    if (used.length) ys = used.map(q => { const d = jtNum(q.at, L, T); return q.from === 'front' ? a + d : q.from === 'back' ? b - d : (a + b) / 2 + d; })
      .filter(y => isFinite(y) && y >= a - 1e-6 && y <= b + 1e-6);
    else ys = spread(o, a, b);
  }
  // J3: a center fastener once the joint is longer than the threshold.
  if (+o.centerOver > 0 && L > +o.centerOver) { const m = (a + b) / 2; if (!ys.some(y => Math.abs(y - m) < 0.75)) ys.push(m); }
  return [...new Set(ys.map(r3))].sort((p, q) => p - q);
}
function jtKind(J) { return J.fastener || 'holes'; }
// J5: the machining for one joint. pairs: [{x, y, m}] — x, y on the female panel (the side), m along the male panel's edge.
function jtFasten(J, fem, male, edgeX, edge, pairs, why, x) {
  const k = jtKind(J), t = x.t, F = J.female || {}, M = J.male || {};
  if (k === 'ledge') return jtLedge(J, fem, male, edgeX, edge, pairs, why, x);
  if (k === 'tabslot') return jtTabJoin(J, fem, male, edgeX, edge, pairs, why, x);
  const bore = (q, dia, depth) => fem.push({ type: 'bore', x: r3(q.x), y: r3(q.y), dia, depth: +depth > 0 ? +depth : t, through: !(+depth > 0), face: 'inside', why });
  const hb = (m, dia, depth, w) => male && male.ops.push({ type: 'hbore', edge, x: edgeX, y: r3(m), dia, depth, inset: r3(t / 2), why: w || why });
  if (k === 'route') {
    if (!pairs.length) return;
    const d = +J.routeDepth > 0 ? +J.routeDepth : 0.25, xs = pairs.map(q => q.x), ys = pairs.map(q => q.y), mn = r3(Math.min(...ys)), mx = r3(Math.max(...ys));
    const along = Math.abs(Math.max(...xs) - Math.min(...xs)) > Math.abs(mx - mn);
    // A dado the full length of the joint, as wide as the panel that drops in.
    fem.push(along ? { type: 'groove', x1: r3(Math.min(...xs)), y1: r3(pairs[0].y), x2: r3(Math.max(...xs)), y2: r3(pairs[0].y), width: t, depth: d, face: 'inside', why }
      : { type: 'groove', x1: r3(pairs[0].x), y1: x.a ?? mn, x2: r3(pairs[0].x), y2: x.b ?? mx, width: t, depth: d, face: 'inside', why });
    if (male) jtGrow(male, edge, d);
    return;
  }
  pairs.forEach((q, i) => {
    if (k === 'pocket') { if (male) male.ops.push({ type: 'pockethole', edge, x: edgeX ? r3(edgeX - 1) : 1, y: r3(q.m), face: 'inside', why }); x.addB('Pocket screw', 1); return; }
    if (k === 'lamello') {
      const len = +J.lamLen > 0 ? +J.lamLen : 2.2, w = 0.157, dp = 0.39;
      fem.push({ type: 'pocket', x: r3(q.x - w / 2), y: r3(q.y - len / 2), w, h: len, depth: dp, face: 'inside', why });
      if (male) male.ops.push({ type: 'edgeslot', edge, x: edgeX, y: r3(q.m), len, depth: dp, inset: r3(t / 2), why });
      x.addB('Lamello connector', 1); return;
    }
    if (k === 'combo') {
      const off = +J.comboOff > 0 ? +J.comboOff : 1.26, D = J.dowel || { dia: 0.315, depth: 0.5, mdepth: 1 };
      bore(q, F.dia || 0.1969, F.depth); hb(q.m, M.dia || 0.1969, M.depth || 1.75);
      [-off, off].forEach(o => { bore({ x: q.x, y: q.y + o }, D.dia, D.depth); hb(q.m + o, D.dia, D.mdepth || 1, why + ' dowel'); });
      x.addB(J.name, 1); x.addB('Dowel', 2); return;
    }
    bore(q, F.dia, F.depth); hb(q.m, M.dia, M.depth); x.addB(J.name, 1);
  });
}
// Easy assembly (0.55.6): a shallow rabbet or dado in the inside of the side that the panel's end drops into, so the side
// rests on the bottom (and the stretchers or top rest on the side) at the right height while it is screwed or doweled.
// It stops short of the front so no joint shows on the front edge, and runs out the back. The panel gets longer by the
// depth at each end and has a small ear cut off each front corner to clear the stopped end of the rabbet.
function jtLedge(J, fem, male, edgeX, edge, pairs, why, x) {
  const withK = J.routeWith || 'confirmat', sub = withK === 'none' ? null : { ...J, fastener: withK };
  const fasten = eX => { if (sub) jtFasten(sub, fem, male, eX, edge, pairs, why, x); };
  const sp = x.side, types = Array.isArray(J.routeTypes) ? J.routeTypes : JT_LEDGE_TYPES;
  // Shaped panels, short sides (open corner ends) and joints that don't take a ledge just get the fasteners.
  if (!male || !sp || !pairs.length || !types.includes(x.type) || sp.outline || x.off > 0 || (male.outline && !male.ledgeEars) || (edge !== 'W1' && edge !== 'W2')) return fasten(edgeX);
  const d = +J.routeDepth > 0 ? +J.routeDepth : 0.125, T = male.T || x.t, w = r3(T + (+(J.routeClear ?? 0.03125) || 0));
  const fx = pairs[0].x, stop = Math.max(0, +J.routeStop || 0), front = x.a || 0, zs = x.zs || [-Infinity, Infinity];
  // Flush first: the rabbet never decides where a panel's outside face ends up. A rabbet on the top edge keeps its open
  // edge exact and puts the clearance below (the top's face is set flush on the table); a rabbet on the bottom edge or a
  // dado puts it above. Sheets a little thicker than the library says, or a bit a little off size, still drop in.
  const gx = fx + T / 2 >= zs[1] - 0.001 ? r3(fx + T / 2 - w / 2) : r3(fx - T / 2 + w / 2);
  const y1 = r3(Math.max(stop, front)), y2 = r3(sp.W);
  // Front and rear stretchers share one rabbet along the top of the side.
  const led = sp.ledges || (sp.ledges = []);
  if (y2 > y1 && !led.some(l => Math.abs(l.x - fx) < 0.01 && l.y1 <= y1 + 1e-6)) {
    fem.push({ type: 'groove', x1: gx, y1, x2: gx, y2, width: w, depth: d, face: 'inside', why: why + ' locating rabbet' });
    led.push({ x: fx, y1 });
  }
  jtLedgeGrow(male, edge, d);
  // The stopped end is rounded by the bit, so the ear runs a bit radius (plus 1/32") past the stop.
  const bits = typeof cncBits === 'function' ? cncBits() : [], bit = bits.find(([, dia]) => dia <= w * 25.4 + 0.01), rad = bit ? bit[1] / 25.4 / 2 : 0.25;
  const e = stop > 0 ? r3(stop + rad + 0.03125 - front) : 0;
  if (e > 0) { male.ledgeEars = male.ledgeEars || {}; male.ledgeEars[edge] = [d, e]; jtLedgeOutline(male); }
  const n0 = male.ops.length; fasten(edge === 'W1' ? 0 : r3(male.L));
  // A fastener that lands on an ear goes into the end where the ear leaves it.
  if (e > 0) male.ops.slice(n0).forEach(o => { if (o.type === 'hbore' && o.edge === edge && o.y < e) o.x = edge === 'W1' ? r3(d) : r3(male.L - d); });
}
// The panel gets longer at one end. Machining measured from that end moves with it; work that runs to an edge still does.
function jtLedgeGrow(pt, edge, d) {
  const L0 = pt.L, L1 = r3(L0 + d), start = edge === 'W1';
  pt.ops.forEach(o => ['x', 'x1', 'x2'].forEach(k => {
    const v = o[k]; if (typeof v !== 'number') return;
    if (start) o[k] = Math.abs(v) < 1e-6 && (o.type === 'groove' || o.edge === 'W1') ? 0 : r3(v + d);
    else if (Math.abs(v - L0) < 1e-6) o[k] = L1;
  }));
  pt.L = L1;
}
// The panel's outline with the front-corner ears cut off (CNC frame: origin bottom left, y up, front edge at y = W).
// outlineEdges names the edge each outline segment starts, so CNC Cutlist still knows the front and the banded edges.
function jtLedgeOutline(pt) {
  const L = pt.L, W = pt.W, [d1, e1] = pt.ledgeEars.W1 || [0, 0], [d2, e2] = pt.ledgeEars.W2 || [0, 0];
  const P = [[0, 0, 'L2'], [L, 0, 'W2']];
  if (d2 > 0) P.push([L, W - e2, null], [L - d2, W - e2, null], [L - d2, W, 'L1']); else P.push([L, W, 'L1']);
  if (d1 > 0) P.push([d1, W, null], [d1, W - e1, null], [0, W - e1, 'W1']); else P.push([0, W, 'W1']);
  pt.outline = P.map(([x, y]) => ({ x: r3(x), y: r3(y) }));
  pt.outlineEdges = P.map(q => q[2]);
}
/* ----- Tab and slot (0.55.10) -----
   Only outline cuts and cuts right through the sheet, so a CNC table that is not dead level, or a depth that drifts,
   can't change how the parts fit. The bottom stays between the sides. It has tabs on its ends that the side drops over:
   the side has notches open at its bottom edge, cut through it, whose tops rest on the tabs, so the inside of the
   bottom is flush with the notch tops whatever the sheet thickness. The stretchers (or top) have tabs too and drop
   into notches open at the side's top edge, as deep as the stretcher is thick, so their tops come out flush with the
   side. The bottom's ends between the tabs butt against the sides, so the width is set by the cut length. Tabs are
   1/16" short of the side's outside face. Confirmat holes go right through the side between the tabs. Only on
   unfinished ends; finished ends use their own template (dowels), so nothing shows. */
const JT_TAB_TYPES = ['bottom', 'top', 'stretcher'];
function jtTabJoin(J, fem, male, edgeX, edge, pairs, why, x) {
  const sp = x.side, zs = x.zs || [0, 0], T = (male && male.T) || x.t, fx = pairs.length ? pairs[0].x : 0;
  const atBottom = Math.abs(fx - T / 2 - zs[0]) < 0.002, atTop = Math.abs(fx + T / 2 - zs[1]) < 0.002;
  const ok = male && sp && pairs.length && JT_TAB_TYPES.includes(x.type) && !sp.outline && !(x.off > 0) && !male.outline
    && (edge === 'W1' || edge === 'W2') && (x.type === 'bottom' ? atBottom && x.cat !== 'Wall' : atTop);
  const holes = { ...J, fastener: 'holes' };
  // Anything else (fixed shelves, nailers, dividers, a bottom above a toe kick notch, a wall cabinet's bottom, which is
  // seen from below) gets the template's holes.
  if (!ok) return jtFasten(holes, fem, male, edgeX, edge, pairs, why, x);
  const a = x.a || 0, b = x.b, spans = jtTabSpans(a, b);
  (x.tabJobs = x.tabJobs || []).push({ sp, pt: male, edge, type: x.type, spans, a, bottom: x.type === 'bottom', why });
  // Confirmats between the tabs (one each side of a lone tab), through the side.
  const ys = (spans.length === 1 ? [spans[0][0] - 0.5, spans[0][1] + 0.5] : [a + 1, ...spans.slice(1).map((q, i) => (spans[i][1] + q[0]) / 2), b - 1])
    .filter((y, i, all) => y > a + 0.25 && y < b - 0.25 && spans.every(([p, q]) => y < p - 0.3 || y > q + 0.3) && all.indexOf(y) === i).map(r3);
  // m is along the panel's own edge, which starts at the joint's front (a rear stretcher starts well back).
  jtFasten(holes, fem, male, edgeX, edge, ys.map(y => ({ x: fx, y, m: r3(y - a) })), why, x);
}
// Tab spans along a joint from a to b (inches from the cabinet front): a short joint (a stretcher) gets one tab in the
// middle, a long one a tab 2" in from each end and one in the middle once it is over 20".
function jtTabSpans(a, b) {
  const L = b - a, w = 2;
  if (L <= 6) { const h = Math.min(w, L / 2) / 2, m = (a + b) / 2; return [[r3(m - h), r3(m + h)]]; }
  const out = [[a + 2, a + 2 + w], [b - 2 - w, b - 2]];
  if (L > 20) out.splice(1, 0, [(a + b) / 2 - w / 2, (a + b) / 2 + w / 2]);
  return out.map(([p, q]) => [r3(p), r3(q)]);
}
// Inside corners are cut round by the outline bit, so each one gets a relief the bit fits in.
function jtCutterR() { const b = typeof cncBits === 'function' ? cncBits().find(([n]) => n === (typeof CNC_TOOLS !== 'undefined' ? CNC_TOOLS.cutter : '')) : null; return r3((b ? b[1] / 25.4 : 0.375) / 2 + 0.01); }
// Turns designer points (x along the length, y from the front) into an outline (y up, front at the top) with edge names.
// Points go counter-clockwise like a plain part's outline; each edge name stays with its segment.
function jtSetOutline(pt, P) {
  let pts = P.map(([x, y]) => ({ x: r3(x), y: r3(pt.W - y) })), tags = P.map(q => q[2] || null);
  const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0), n = pts.length;
  if (area < 0) { tags = pts.map((_, k) => tags[k === n - 1 ? n - 1 : n - 2 - k]); pts = pts.reverse(); }
  pt.outline = pts; pt.outlineEdges = tags;
}
// Runs after every joint is made: notches in the sides, tabs on the panels.
function jtTabSlot(c, parts, x) {
  const jobs = x.tabJobs || []; if (!jobs.length) return;
  const g = 0.0625, cy = 0.005, rr = jtCutterR();
  // Sides: notches open at the bottom edge (bottom tabs) and top edge (stretcher tabs). A notch's closed end is exact
  // (it bears on the tab); its inside corners get reliefs sideways so the bit's round corners clear the square tab.
  [...new Set(jobs.map(j => j.sp))].forEach(sp => {
    const mine = jobs.filter(j => j.sp === sp), L = sp.L, W = sp.W;
    const dn = mine.filter(j => j.bottom).flatMap(j => j.spans.map(s => [s, j.pt.T])).sort((p, q) => q[0][0] - p[0][0]);
    const up = mine.filter(j => !j.bottom).flatMap(j => j.spans.map(s => [s, j.pt.T])).sort((p, q) => p[0][0] - q[0][0]);
    const P = [[0, 0, 'L1'], [L, 0, 'W2']];
    up.forEach(([[y0, y1], h]) => { const Y0 = y0 - cy, Y1 = y1 + cy, X = L - h, R = X + 2 * rr;
      P.push([L, Y0, null], [R, Y0, null], [R, Y0 - rr, null], [X, Y0 - rr, null], [X, Y1 + rr, null], [R, Y1 + rr, null], [R, Y1, null], [L, Y1, 'W2']); });
    P.push([L, W, 'L2'], [0, W, 'W1']);
    dn.forEach(([[y0, y1], h]) => { const Y0 = y0 - cy, Y1 = y1 + cy, R = h - 2 * rr;
      P.push([0, Y1, null], [R, Y1, null], [R, Y1 + rr, null], [h, Y1 + rr, null], [h, Y0 - rr, null], [R, Y0 - rr, null], [R, Y0, null], [0, Y0, 'W1']); });
    jtSetOutline(sp, P);
  });
  // Panels: tabs out of each joined end, as long as the side is thick less 1/16"; the panel's machining moves with its
  // new start. The tab roots get small reliefs into the panel's end for the same round-corner reason.
  [...new Set(jobs.map(j => j.pt))].forEach(pt => {
    const mine = jobs.filter(j => j.pt === pt), e1 = mine.find(j => j.edge === 'W1'), e2 = mine.find(j => j.edge === 'W2');
    const t1 = e1 ? r3(e1.sp.T - g) : 0, t2 = e2 ? r3(e2.sp.T - g) : 0, body = pt.L, L = r3(body + t1 + t2), W = pt.W;
    if (t1) pt.ops.forEach(o => ['x', 'x1', 'x2'].forEach(k => { if (typeof o[k] === 'number') o[k] = r3(o[k] + t1); }));
    const a = t1, b = r3(t1 + body), P = [[a, 0, 'L1'], [b, 0, 'W2']];
    // Tab spans are measured from the cabinet front; the panel's own y starts at its front edge.
    if (e2) e2.spans.map(([p, q]) => [p - e2.a, q - e2.a]).sort((p, q) => p[0] - q[0]).forEach(([y0, y1]) =>
      P.push([b, y0 - 2 * rr, null], [b - rr, y0 - 2 * rr, null], [b - rr, y0, null], [L, y0, null], [L, y1, null], [b - rr, y1, null], [b - rr, y1 + 2 * rr, null], [b, y1 + 2 * rr, 'W2']));
    P.push([b, W, 'L2'], [a, W, 'W1']);
    if (e1) e1.spans.map(([p, q]) => [p - e1.a, q - e1.a]).sort((p, q) => q[0] - p[0]).forEach(([y0, y1]) =>
      P.push([a, y1 + 2 * rr, null], [a + rr, y1 + 2 * rr, null], [a + rr, y1, null], [0, y1, null], [0, y0, null], [a + rr, y0, null], [a + rr, y0 - 2 * rr, null], [a, y0 - 2 * rr, 'W1']));
    pt.L = L; jtSetOutline(pt, P);
    pt.note = [pt.note, 'Length includes the tabs'].filter(Boolean).join('. ');
  });
}
// A routed panel drops into the dado, so it gets longer by the dado depth on that end.
function jtGrow(pt, edge, d) {
  const atStart = edge === 'W1' || edge === 'L1';
  if (edge === 'W1' || edge === 'W2') {
    if (atStart) pt.ops.forEach(o => ['x', 'x1', 'x2'].forEach(k => { if (typeof o[k] === 'number') o[k] = r3(o[k] + d); }));
    pt.L = r3(pt.L + d);
  } else {
    if (atStart) pt.ops.forEach(o => ['y', 'y1', 'y2'].forEach(k => { if (typeof o[k] === 'number') o[k] = r3(o[k] + d); }));
    pt.W = r3(pt.W + d);
  }
}
// J6: nailer parts, from the cabinet's construction settings.
function jtNailers(c, p, part, x) {
  const kind = p.nailers || 'none', nw = +p.nailerWidth > 0 ? +p.nailerWidth : 3.5, out = [];
  if (kind === 'none') return out;
  const add = (name, z0, z1) => { const q = part(name, x.cm, x.inW, nw, { kind: 'nailer' }); q.jz = [z0, z1]; out.push(q); };
  if (kind === 'top' || kind === 'both') add('Top wall nailer', x.zIn1 - nw, x.zIn1);
  if (kind === 'bottom' || kind === 'both') add('Bottom wall nailer', x.zIn0, x.zIn0 + nw);
  return out;
}
// Joins the parts that are made after the main box (fixed shelves) at both ends; nailers are joined with the box.
function jtLate(c, parts, x) {
  if (!x.jt) return;
  parts.filter(q => q.cabId === c.id && /^Fixed shelf \d+$/.test(q.name) && q.jx !== undefined).forEach(q => x.jt('shelf', q, q.jx));
  // Back and toe joints just count fasteners.
  JT_COUNT_ONLY.forEach(type => ['L', 'R'].forEach(end => {
    const J = x.jFor(end); if (!J) return;
    const pt = parts.find(q => q.cabId === c.id && (type === 'back' ? q.name === 'Back' : /^Toe (skin|kick)$/.test(q.name))); if (!pt) return;
    const n = jtSpots(J, type, 0, type === 'back' ? pt.L : pt.W, x.spread).length;
    if (n) x.addB(`${J.name} (${type === 'back' ? 'back' : 'toe'})`, n);
  }));
}

/* ----- The editor: a "Joint types" box inside a joint template ----- */
function jtTypesBox(h) {
  const cur = ui.jtType || 'bottom', o = (h.types || {})[cur], set = o && !o.same, R = `jtt:${h.id}:${cur}`;
  const tabs = JT_TYPES.map(([k, l]) => { const t = (h.types || {})[k], none = t && !t.same ? t.none : jtLegacy(h, k).none;
    return `<button class="${none ? 'jt-off' : ''}" data-act="jt-type" data-id="${k}" aria-pressed="${k === cur}"${none ? ' title="Not used"' : ''}>${l}</button>`; }).join('');
  let body;
  if (!set) body = `<div class="note">${JT_COUNT_ONLY.includes(cur) ? 'Not used yet.' : 'Uses the template settings above.'}</div><button class="btn sm" data-act="jt-own" data-id="${h.id}:${cur}">Set ${esc(JT_TYPES.find(t => t[0] === cur)[1].toLowerCase())} on its own</button>`;
  else {
    const pts = [0, 1, 2, 3].map(i => (o.pts || [])[i] || {}), anyPt = pts.some(q => q.from && q.from !== 'none');
    body = `<label class="checkrow">${ctl(R, 'none', !!o.none, 'bool', { label: 'No fasteners for this joint' })} No fasteners for this joint</label>
      ${o.none ? '' : `<div class="eyebrow">Locations</div><div class="note">Up to four set spots. Leave them all at "Don't use" to spread holes by the spacing below. A distance can be a formula of L (joint length), like L/2-1.</div>
      <div class="jt-pts">${pts.map((q, i) => `<div class="jt-pt"><b>Location ${i + 1}</b>${ctl(`jtp:${h.id}:${cur}:${i}`, 'from', q.from || 'none', 'select', { label: `Location ${i + 1} from`, options: JT_FROM })}${q.from && q.from !== 'none' ? ctl(`jtp:${h.id}:${cur}:${i}`, 'at', q.at ?? 2, 'text', { label: `Location ${i + 1} distance`, ph: '2 or L/2' }) : ''}</div>`).join('')}</div>
      ${anyPt ? '' : `<div class="autogrid"><label class="f"><span>How many</span>${ctl(R, 'mode', o.mode || 'gap', 'select', { label: 'How many', options: [{ v: 'gap', l: 'By max spacing' }, { v: 'count', l: 'Set count' }, { v: 'spread', l: 'Evenly, none at the ends' }] })}</label>${o.mode === 'count' || o.mode === 'spread' ? fld('Count', R, 'count', o.count ?? 3, 'int') : fld('Max spacing', R, 'maxGap', o.maxGap ?? 8, 'num')}${o.mode === 'spread' ? '' : fld('From front', R, 'front', o.front ?? 2, 'num') + fld('From back', R, 'back', o.back ?? 2, 'num')}</div>`}
      <div class="autogrid">${fld('Center one past length', R, 'centerOver', o.centerOver || 0, 'num', { ph: '0 = off' })}</div>`}
      <div class="jt-row"><label class="f"><span>Copy from</span><select class="jt-copy" data-id="${h.id}:${cur}" aria-label="Copy from another joint type"><option value="">Pick a type…</option>${JT_TYPES.filter(t => t[0] !== cur).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <button class="btn sm" data-act="jt-same" data-id="${h.id}:${cur}">Back to template settings</button></div>`;
  }
  return `<div class="eyebrow">Joint types</div><div class="note">Each joint in the box can have its own spots. Back and toe only count fasteners for the hardware list.</div><div class="seg jt-types" role="group" aria-label="Joint type">${tabs}</div><div class="jt-type">${body}</div>`;
}
function jtFastenerBox(h, R) {
  const k = jtKind(h);
  return `<div class="autogrid"><label class="f wide"><span>Fastener</span>${ctl(R, 'fastener', k, 'select', { label: 'Fastener', options: JT_KINDS })}</label>
    ${k === 'route' ? fld('Dado depth', R, 'routeDepth', h.routeDepth ?? 0.25, 'num') : ''}${k === 'ledge' ? fld('Rabbet depth', R, 'routeDepth', h.routeDepth ?? 0.125, 'num') + fld('Stops this far from the front', R, 'routeStop', h.routeStop ?? 1, 'num') + fld('Extra room for thick sheets', R, 'routeClear', h.routeClear ?? 0.03125, 'num') + `<label class="f wide"><span>Also drill</span>${ctl(R, 'routeWith', h.routeWith || 'confirmat', 'select', { label: 'Also drill', options: JT_LEDGE_WITH })}</label>` : ''}${k === 'lamello' ? fld('Connector length', R, 'lamLen', h.lamLen ?? 2.2, 'num') : ''}${k === 'combo' ? fld('Dowels this far either side', R, 'comboOff', h.comboOff ?? 1.26, 'num') : ''}</div>
    ${k === 'pocket' ? '<div class="note">Pocket holes are marked on the panel and counted, but angled holes are drilled by hand.</div>' : ''}${k === 'lamello' ? '<div class="note">The face slots are cut on the CNC; the edge slots are marked for the Lamello tool.</div>' : ''}${k === 'route' ? '<div class="note">Panels that drop into a dado get longer by the dado depth.</div>' : ''}${k === 'tabslot' ? '<div class="note">Only outline cuts and cuts through the sheet, so cutting depth can\'t change the fit. The bottom stays between the sides: it has tabs on its ends, and the side drops over them (notches open at its bottom edge). Stretchers or the top have tabs that drop into notches open at the side\'s top edge, so they come out flush. Confirmat holes go through the side between the tabs. Bottoms above a built-in toe kick, wall cabinet bottoms, shelves, nailers and dividers get the holes below.</div>' : ''}${k === 'ledge' ? '<div class="note">Bottom, top, stretchers and fixed shelves drop into a shallow rabbet in the side that lines them up and keeps the box square. The rabbet is 1/32" roomier than the panel so a thicker sheet or a bit a little off size still fits; the outside faces are set flush on a flat table. The rabbet stops short of the front (nothing shows) and runs out the back; panels get longer by the depth and lose a small ear at each front corner. Other joints just get the screws or dowels.</div>' : ''}`;
}
function jtResolve(kind, id) {
  const [hid, type, i] = id.split(':'), h = hw(hid); if (!h) return null;
  h.types = h.types || {};
  const o = h.types[type] = h.types[type] || { ...jtLegacy(h, type), same: true };
  if (kind === 'jtt') return o;
  o.pts = o.pts || []; return (o.pts[+i] = o.pts[+i] || { from: 'none', at: 2 });
}
function jtAct(act, id) {
  if (act === 'jt-type') { ui.jtType = id; render(); return true; }
  const [hid, type] = (id || '').split(':'), h = hw(hid); if (!h) return false;
  if (act === 'jt-own') { mutate(() => { h.types = h.types || {}; const was = h.types[type]; h.types[type] = { ...JSON.parse(JSON.stringify(was && !was.same ? was : jtLegacy(h, type))), none: false }; delete h.types[type].same; }); return true; }
  if (act === 'jt-same') { mutate(() => { if (h.types) delete h.types[type]; }); return true; }
  return false;
}
function jtCopy(id, from) {
  const [hid, type] = id.split(':'), h = hw(hid); if (!h || !from) return;
  mutate(() => { h.types = h.types || {}; const src = h.types[from] && !h.types[from].same ? h.types[from] : jtLegacy(h, from); h.types[type] = JSON.parse(JSON.stringify(src)); delete h.types[type].same; });
  flash(`Copied ${JT_TYPES.find(t => t[0] === from)[1].toLowerCase()} locations`);
}
document.addEventListener('change', e => { const s = e.target.closest && e.target.closest('.jt-copy'); if (s && s.value) jtCopy(s.dataset.id, s.value); });
