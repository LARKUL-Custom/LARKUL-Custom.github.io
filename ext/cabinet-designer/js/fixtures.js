/* ---------- Appliances and fixtures: sinks, doors, windows, fridges, dishwashers, ranges, washers and dryers ---------- */
// Like Mozaik's appliances and wall openings. Each room keeps a list (S.fixtures). A fixture sits on a wall like a cabinet:
// { id, kind, wall, side, off (low end along the wall), w, h, d, elev }. Doors and windows are holes in the wall and show
// from both sides; appliances stand on the floor and keep cabinets out of their space; a sink sits in the countertop.
// They never go on the cut list. Dishwashers and under-counter fridges get the countertop run over them.
'use strict';
// How each kind behaves and draws. Sizes come from the presets below.
const FIXT_KINDS = [
  { k: 'sink', name: 'Sink', top: true },
  { k: 'door', name: 'Door', wallHole: true },
  { k: 'opening', name: 'Opening', wallHole: true },
  { k: 'window', name: 'Window', wallHole: true },
  { k: 'fridge', name: 'Refrigerator', ab: 'REF' },
  { k: 'ucfridge', name: 'Under-counter fridge', under: true, ab: 'UC' },
  { k: 'dw', name: 'Dishwasher', under: true, ab: 'DW' },
  { k: 'range', name: 'Range', ab: 'RANGE' },
  { k: 'washer', name: 'Washer', ab: 'W' },
  { k: 'dryer', name: 'Dryer', ab: 'D' },
];
// Presets: names, folders and sizes from Mozaik's Appliances and Graphics library (inches). Doors, openings and
// windows are their outside size with the casing (2 1/2" each side, like Mozaik's); windows start with their top at 84".
const FX = (id, kind, folder, name, w, h, d, x = {}) => ({ id, kind, folder, name, w, h, d, elev: kind === 'window' ? 84 - h : 0, ...x });
const FIXT_LIB = [
  FX('sk-um1', 'sink', 'Kitchen sinks', 'Undermount Single', 24, 8, 18),
  FX('sk-um2', 'sink', 'Kitchen sinks', 'Undermount Double', 34, 8, 18, { bowls: 2 }),
  FX('sk-um3', 'sink', 'Kitchen sinks', 'Undermount Triple', 42, 8, 18, { bowls: 3 }),
  FX('sk-zr1', 'sink', 'Kitchen sinks', 'Zero Radius Single', 24, 8, 18),
  FX('sk-zr2', 'sink', 'Kitchen sinks', 'Zero Radius Double', 34, 8, 18, { bowls: 2 }),
  FX('sk-di1', 'sink', 'Kitchen sinks', 'Drop In Single', 24, 8, 20),
  FX('sk-di2', 'sink', 'Kitchen sinks', 'Drop In Double', 34, 8, 20, { bowls: 2 }),
  FX('sk-farm', 'sink', 'Kitchen sinks', 'Farm House Traditional', 36, 10, 22, { apron: true }),
  FX('sk-apron', 'sink', 'Kitchen sinks', 'Stainless Apron Sink', 33, 9, 22.25, { apron: true }),
  FX('sk-bar', 'sink', 'Kitchen sinks', 'Bar Undermount', 16, 8, 16),
  FX('sk-bath', 'sink', 'Kitchen sinks', 'Bath Drop In Oval', 22, 5, 15),
  FX('dw', 'dw', 'Dishwashers', 'Dishwasher', 24, 34.5, 26),
  FX('dw-pr', 'dw', 'Dishwashers', 'Dishwasher (PR)', 24, 34.5, 24, { pr: true }),
  FX('fr-std', 'fridge', 'Refrigerators', 'Standard Fridge', 30, 68, 33),
  FX('fr-fd', 'fridge', 'Refrigerators', 'French Door Fridge', 33, 69, 31),
  FX('fr-sbs', 'fridge', 'Refrigerators', 'Side by Side Fridge', 36, 69, 30),
  FX('fr-fd36', 'fridge', 'Refrigerators', '36in French Door (PR)', 36, 84, 24, { pr: true }),
  FX('fr-fd42', 'fridge', 'Refrigerators', '42in French Door (PR)', 42, 84, 24, { pr: true }),
  FX('fr-profd', 'fridge', 'Refrigerators', 'Pro French Door', 36, 84, 27),
  FX('fr-col30', 'fridge', 'Refrigerators', '30in Column (PR)', 30, 84, 24, { pr: true }),
  FX('fr-col24', 'fridge', 'Refrigerators', '24in Column (PR)', 24, 84, 24, { pr: true }),
  FX('uc-fr24', 'ucfridge', 'Under-counter fridges', '24in Fridge U-C (PR)', 24, 34.5, 24, { pr: true }),
  FX('uc-fr18', 'ucfridge', 'Under-counter fridges', '18in Fridge U-C (PR)', 18, 34.5, 24, { pr: true }),
  FX('uc-bev', 'ucfridge', 'Under-counter fridges', 'Beverage U-C', 24, 35, 27),
  FX('uc-wine', 'ucfridge', 'Under-counter fridges', 'Wine Cooler', 24, 35, 27),
  FX('rg-slide', 'range', 'Ranges', 'Range-Slide In', 30, 36.5, 28),
  FX('rg-free', 'range', 'Ranges', 'Range-Freestanding', 30, 48, 28, { guard: true }),
  FX('rg-pro30', 'range', 'Ranges', 'Pro Range 30', 30, 38.25, 30.75),
  FX('rg-pro36', 'range', 'Ranges', 'Pro Range 36', 36, 38.25, 30.75),
  FX('rg-pro48', 'range', 'Ranges', 'Pro Range 48', 48, 38.25, 30.75),
  FX('ld-fw', 'washer', 'Laundry', 'Front Load Washer', 27, 38.75, 31),
  FX('ld-fd', 'dryer', 'Laundry', 'Front Load Dryer', 27, 38.75, 31),
  FX('ld-tw', 'washer', 'Laundry', 'Washer (top load)', 27, 42, 27, { topLoad: true }),
  FX('ld-td', 'dryer', 'Laundry', 'Dryer (top load set)', 27, 42, 27),
  FX('ld-combo', 'washer', 'Laundry', 'Combo Washer + Dryer', 27, 78, 32, { stack: true }),
  FX('dr-int-l', 'door', 'Doors', 'Interior Door (LH)', 39, 84, 0, { swing: 'L' }),
  FX('dr-int-r', 'door', 'Doors', 'Interior Door (RH)', 39, 84, 0, { swing: 'R' }),
  FX('dr-ent-l', 'door', 'Doors', 'Entry Door (LH)', 43, 84, 0, { swing: 'L' }),
  FX('dr-ent-r', 'door', 'Doors', 'Entry Door (RH)', 43, 84, 0, { swing: 'R' }),
  FX('dr-dbl', 'door', 'Doors', 'Interior Double Door', 67, 84, 0, { swing: 'both' }),
  FX('op', 'opening', 'Doorways and openings', 'Opening', 30, 84, 0, { bare: true }),
  FX('op-cased', 'opening', 'Doorways and openings', 'Cased Opening', 42, 84, 0),
  FX('op-pass', 'opening', 'Doorways and openings', 'Cased Pass Thru', 72, 48, 0, { elev: 36 }),
  FX('wn-1', 'window', 'Windows', 'Window 1', 30, 42, 0),
  FX('wn-2', 'window', 'Windows', 'Window 2', 48, 42, 0),
  FX('wn-3', 'window', 'Windows', 'Window 3', 72, 42, 0),
  FX('wn-4', 'window', 'Windows', 'Window 4', 90, 42, 0),
  FX('wn-sh1', 'window', 'Windows', 'Single Hung 1', 36, 48, 0, { hung: true }),
  FX('wn-sh2', 'window', 'Windows', 'Single Hung 2', 54, 48, 0, { hung: true }),
  FX('wn-pic', 'window', 'Windows', 'Picture Window', 90, 60, 0),
];
const FIXT_FOLDERS = ['Kitchen sinks', 'Dishwashers', 'Refrigerators', 'Under-counter fridges', 'Ranges', 'Laundry', 'Doors', 'Doorways and openings', 'Windows'];
const fixtPreset = id => FIXT_LIB.find(x => x.id === id);
const CASE = 2.5;
const fixtKind = k => FIXT_KINDS.find(x => x.k === k);
const fixtDef = f => fixtKind(f.kind) || FIXT_KINDS[0];
const fixtList = () => S.fixtures || [];
const fixtById = id => fixtList().find(f => f.id === id);
const fixtHole = f => !!fixtDef(f).wallHole;
const fixtSink = f => !!fixtDef(f).top;
const fixtFloor = f => !fixtHole(f) && !fixtSink(f);
const fixtUnder = f => !!fixtDef(f).under;
const fixtName = f => f.name || fixtDef(f).name;
// The hole in the wall inside the casing: [a0, a1, z0, z1].
const fixtInner = f => { const c = f.bare ? 0 : CASE; return [f.off + c, f.off + f.w - c, f.kind === 'door' || f.kind === 'opening' && !f.elev ? f.elev : f.elev + c, f.elev + f.h - c]; };
const fixtSel = id => !!(ui.sel && ui.sel.type === 'fixt' && ui.sel.id === id);
// A sink sits at the top of the countertop under it (36" when there is none).
function fixtCounter(f) {
  const mid = f.off + f.w / 2;
  const r = countertopRuns().find(x => x.on && x.wall === f.wall && x.side === f.side && mid >= x.start - x.ovS && mid <= x.end + x.ovE);
  return r ? { top: r.top + r.thick, depth: r.depth } : { top: 36, depth: 25 };
}
// Footprint in plan. Doors and windows take the wall's thickness; a sink is its bowl.
function fixtPoly(f, o) {
  const w = wall(o ? o.wall : f.wall); if (!w) return null;
  const g = wg(w), s = o ? o.side : f.side, off = o ? o.off : f.off, h = w.thick / 2;
  if (fixtHole(f)) return [wallPt(w, g, s, off, -h), wallPt(w, g, s, off + f.w, -h), wallPt(w, g, s, off + f.w, h), wallPt(w, g, s, off, h)];
  let b0 = h, b1 = h + f.d;
  if (fixtSink(f)) { const c = fixtCounter({ ...f, wall: w.id, side: s, off }), m = h + c.depth / 2 - 0.5; b0 = m - f.d / 2; b1 = m + f.d / 2; }
  return [wallPt(w, g, s, off, b0), wallPt(w, g, s, off + f.w, b0), wallPt(w, g, s, off + f.w, b1), wallPt(w, g, s, off, b1)];
}
function fixtHit(p) { return fixtList().filter(f => { const poly = fixtPoly(f); return poly && inPoly(p, poly); }).map(f => f.id); }

/* ---------- Where it can go ---------- */
// Spans along a wall side that a fixture (or a cabinet of this height and depth) runs into. Used by the cabinet layout too.
function fixtObstacles(wallId, side, spec, excludeId, add, out) {
  fixtList().forEach(f => {
    if (f.id === excludeId || fixtSink(f) || !vOverlap(f, spec)) return;
    if (fixtHole(f)) { if (f.wall === wallId) out.push({ a0: f.off, a1: f.off + f.w, kind: 'fx', id: f.id }); return; }
    const p = fixtPoly(f); if (p) add(p, 'fx', f.id);
  });
}
// The free spot nearest to want for a floor appliance, snapping to cabinet and appliance ends nearby.
function fixtFree(f, wallId, side, want, px) {
  const w = wall(wallId); if (!w) return null;
  const L = wg(w).L, hi = L - f.w, e = 0.005;
  if (hi < -e) return null;
  if (!fixtFloor(f)) return Math.max(0, Math.min(hi, want));
  const obs = obstacles(wallId, side, { ...f, outset: 0 }, f.id), bl = obs.map(o => [o.a0 - f.w, o.a1]);
  const reach = Math.max(lay().snapReach, 12 * (px || 0));
  bl.forEach(([x0, x1]) => { if (Math.abs(want - x0) < reach) want = x0; else if (Math.abs(want - x1) < reach) want = x1; });
  if (Math.abs(want) < reach) want = 0; if (Math.abs(want - hi) < reach) want = hi;
  const ok = v => v >= -e && v <= hi + e && !bl.some(([x0, x1]) => v > x0 + e && v < x1 - e);
  const cands = [Math.max(0, Math.min(hi, want)), 0, hi, ...bl.flatMap(b => b)].filter(ok);
  if (!cands.length) return null;
  return cands.reduce((b, v) => Math.abs(v - want) < Math.abs(b - want) ? v : b);
}
// Where a fixture lands for a plan point: the nearest wall (a sink centers on the base cabinet under it).
function fixtSpot(f, p, px) {
  if (fixtSink(f)) {
    const c = hitCabs(p).map(cab).find(k => k && k.cat !== 'Wall' && wall(k.wall));
    if (c) return { wall: c.wall, side: c.side, off: r3(c.off + (c.w - f.w) / 2) };
  }
  let best = null;
  S.walls.forEach(w => { const r = segDist(p, w), lim = w.thick / 2 + (f.d || 0) + 30; if (r.d < lim && (!best || r.d < best.r.d)) best = { w, r }; });
  if (!best) return null;
  const gr = lay().grid > 0 ? lay().grid : 1;
  const want = Math.round((best.r.t - f.w / 2) / gr) * gr, off = fixtFree(f, best.w.id, best.r.side, want, px);
  return off === null ? null : { wall: best.w.id, side: best.r.side, off: r3(off) };
}
function fixtNew(pid) {
  const d = fixtPreset(pid); if (!d) return null;
  const f = { id: uid('fx'), kind: d.kind, lib: d.id, name: d.name, w: d.w, h: d.h, d: d.d, elev: d.elev };
  ['swing', 'bowls', 'apron', 'pr', 'guard', 'topLoad', 'stack', 'hung', 'bare'].forEach(k => { if (d[k] !== undefined) f[k] = d[k]; });
  return f;
}
function fixtPlace(k, p) {
  const f = fixtNew(k); if (!f) return false;
  const at = fixtSpot(f, p, ui.px);
  if (!at) { flash(fixtFloor(f) ? 'There is no room for that there.' : 'Move closer to a wall.'); return false; }
  mutate(() => { S.fixtures = S.fixtures || []; S.fixtures.push(Object.assign(f, at)); });
  ui.sel = { type: 'fixt', id: f.id }; ui.elevWall = f.wall; ui.fixtGhost = null;
  return true;
}

/* ---------- Plan ---------- */
function fixtPlanOne(f, ghost) {
  const w = wall(f.wall); if (!w) return '';
  const g = wg(w), poly = fixtPoly(f), px = ui.px || 0.1, sel = !ghost && fixtSel(f.id), id = ghost ? '' : ` data-fixt="${f.id}"`;
  const P = (a, b) => wallPt(w, g, f.side, a, b), h = w.thick / 2;
  const cls = `fixt fx-${f.kind}${sel ? ' sel' : ''}${ghost ? ' ghost' : ''}`;
  let s = '';
  if (fixtHole(f)) {
    const [a0, a1] = fixtInner(f), q = (x0, x1, b0, b1) => polyPts([P(x0, b0), P(x1, b0), P(x1, b1), P(x0, b1)]);
    s += `<polygon class="fx-gap nss" points="${q(a0, a1, -h - 0.05, h + 0.05)}"/>`;
    // Jambs across the wall, and the casing on both faces.
    s += `<path class="${cls} nss" d="M${polyPts([P(a0, -h), P(a0, h)]).replace(' ', 'L')}M${polyPts([P(a1, -h), P(a1, h)]).replace(' ', 'L')}"/>`;
    if (!f.bare) [[-h - 0.75, -h], [h, h + 0.75]].forEach(([b0, b1]) => { s += `<polygon class="${cls} fx-case nss" points="${q(f.off, a0, b0, b1)}"/><polygon class="${cls} fx-case nss" points="${q(a1, f.off + f.w, b0, b1)}"/>`; });
    if (f.kind === 'window') [-h / 3, h / 3].forEach(b => { const u = P(a0, b), z = P(a1, b); s += `<line class="${cls} nss" x1="${u.x}" y1="${u.y}" x2="${z.x}" y2="${z.y}"/>`; });
    if (f.kind === 'door' && f.swing && f.swing !== 'none') {
      // Seen from the side it swings into, LH means the hinge is on the left. A double door has a leaf on each jamb.
      const lw = a1 - a0, leaves = f.swing === 'both' ? [[a0, a0 + lw / 2], [a1, a1 - lw / 2]] : (() => { const left = (f.swing !== 'R') === (f.side === 1); return [left ? [a0, a1] : [a1, a0]]; })();
      leaves.forEach(([ha, fa]) => {
        const r = Math.abs(fa - ha), hp = P(ha, h), leaf = P(ha, h + r), shut = P(fa, h);
        s += `<line class="${cls} fx-leafln nss" x1="${hp.x}" y1="${hp.y}" x2="${leaf.x}" y2="${leaf.y}"/>`;
        const ax = leaf.x - hp.x, ay = leaf.y - hp.y, bx = shut.x - hp.x, by = shut.y - hp.y, gs = ax * by - ay * bx > 0 ? 1 : 0;
        s += `<path class="fx-swing nss" d="M${leaf.x} ${leaf.y}A${r} ${r} 0 0 ${gs} ${shut.x} ${shut.y}"/>`;
      });
    }
    s += `<polygon class="fx-hit" points="${q(f.off, f.off + f.w, -h - 2, h + 2)}"${id}/>`;
    return s;
  }
  s += `<polygon class="${cls} nss" points="${polyPts(poly)}"${id}/>`;
  const at = (a, b) => P(f.off + a, h + b), ang = (() => { let a = Math.atan2(g.u.y, g.u.x) * 180 / Math.PI; if (a > 90 || a <= -90) a += 180; return a; })();
  if (fixtSink(f)) {
    const c = fixtCounter(f), m = c.depth / 2 - 0.5, n = Math.max(1, Math.min(3, f.bowls | 0 || 1)), gap = 1.5, bw = (f.w - 1.5 - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const a0 = 0.75 + i * (bw + gap), q = [at(a0, m - f.d / 2 + 1.5), at(a0 + bw, m - f.d / 2 + 1.5), at(a0 + bw, m + f.d / 2 - 0.75), at(a0, m + f.d / 2 - 0.75)];
      s += `<polygon class="fx-bowl nss" points="${polyPts(q)}"/>`;
    }
    const fc = at(f.w / 2, m - f.d / 2 - 1.25); s += `<circle class="fx-faucet nss" cx="${fc.x}" cy="${fc.y}" r="1.1"/>`;
    return s;
  }
  if (f.kind === 'range') [[0.27, 0.3], [0.73, 0.3], [0.27, 0.68], [0.73, 0.68]].forEach(([u, v]) => { const c = at(f.w * u, f.d * v); s += `<circle class="fx-burner nss" cx="${c.x}" cy="${c.y}" r="${Math.min(f.w, f.d) * 0.13}"/>`; });
  if (f.kind === 'washer' || f.kind === 'dryer') { const c = at(f.w / 2, f.d * 0.55); s += `<circle class="fx-burner nss" cx="${c.x}" cy="${c.y}" r="${Math.min(f.w, f.d) * 0.3}"/>`; }
  const fs = Math.min(13 * px, f.w * 0.3, f.d * 0.3), mid = at(f.w / 2, f.d / 2);
  s += `<text class="lbl fx-lbl" x="${mid.x}" y="${mid.y}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang} ${mid.x} ${mid.y})" pointer-events="none">${esc(fixtDef(f).ab || '')}</text>`;
  return s;
}
// low: the appliances under the countertop, drawn before the tops so the top shows over them.
function fixtPlanSVG(low) {
  let s = fixtList().filter(f => !fixtSel(f.id) && fixtUnder(f) === !!low).map(f => fixtPlanOne(f)).join('');
  if (low) return s;
  const sel = ui.sel && ui.sel.type === 'fixt' && fixtById(ui.sel.id); if (sel) s += fixtPlanOne(sel);
  const gh = ui.fixtGhost; if (gh && wall(gh.wall)) s += fixtPlanOne(gh, true);
  return s;
}

/* ---------- Elevation ---------- */
function fixtElevSVG(w, side, L, fs, holes) {
  return fixtList().filter(f => f.wall === w.id && fixtHole(f) === !!holes && (holes || f.side === side)).map(f => {
    const x = side === 1 ? f.off : L - f.off - f.w, sel = fixtSel(f.id), cls = `fixt fx-${f.kind}${sel ? ' sel' : ''} nss`;
    let s = `<g data-fixt="${f.id}">`;
    if (fixtSink(f)) {
      // Under the countertop: dashed bowl; above it the faucet.
      const t = fixtCounter(f).top, cx = x + f.w / 2;
      s += f.apron ? `<rect class="fixt fx-sink nss" x="${x}" y="${-t}" width="${f.w}" height="${f.h}"/>` : `<rect class="fx-bowl ev nss" x="${x + 0.75}" y="${-t}" width="${f.w - 1.5}" height="${f.h}"/>`;
      s += `<path class="fx-faucet ev nss" d="M${cx - 1} ${-t}V${-t - 11}Q${cx - 1} ${-t - 14} ${cx + 2} ${-t - 14}Q${cx + 5} ${-t - 14} ${cx + 5} ${-t - 11}V${-t - 9.5}"/>`;
      s += `<rect class="ev-hit" x="${x}" y="${-t - 14}" width="${f.w}" height="${14 + f.h}"/>`;
    } else {
      const y = -(f.elev + f.h);
      s += `<rect class="${cls}" x="${x}" y="${y}" width="${f.w}" height="${f.h}"/>`;
      if (fixtHole(f)) {
        const [a0, a1, z0, z1] = fixtInner(f), ix = side === 1 ? a0 : L - a1, iw = a1 - a0, iy = -z1, ih = z1 - z0;
        s += `<rect class="fx-hole nss" x="${ix}" y="${iy}" width="${iw}" height="${ih}"/>`;
        if (f.kind === 'window') s += `<rect class="fx-glass nss" x="${ix + 1}" y="${iy + 1}" width="${iw - 2}" height="${ih - 2}"/><path class="fx-line nss" d="${f.hung ? `M${ix} ${iy + ih / 2}H${ix + iw}` : iw > 40 ? `M${ix + iw / 2} ${iy}V${iy + ih}` : ''}"/>`;
        else if (f.kind === 'door' && f.swing && f.swing !== 'none') {
          const one = (lx, lw, knobRight) => `<rect class="fx-leaf nss" x="${lx + 0.25}" y="${iy + 0.25}" width="${lw - 0.5}" height="${ih - 0.25}"/><circle class="fx-knob nss" cx="${knobRight ? lx + lw - 2.5 : lx + 2.5}" cy="${-(z0 + 36)}" r="1.1"/>`;
          if (f.swing === 'both') s += one(ix, iw / 2, true) + one(ix + iw / 2, iw / 2, false);
          else { const left = (f.swing !== 'R') === (f.side === side); s += one(ix, iw, left); }
        }
      }
      else if (f.kind === 'fridge') s += `<path class="fx-line nss" d="M${x} ${y + f.h * 0.32}H${x + f.w}M${x + f.w / 2} ${y}V${y + f.h * 0.32}M${x + f.w / 2 - 2} ${y + f.h * 0.06}V${y + f.h * 0.26}M${x + f.w / 2 + 2} ${y + f.h * 0.06}V${y + f.h * 0.26}M${x + 3} ${y + f.h * 0.38}H${x + f.w - 3}"/>`;
      else if (f.kind === 'dw') s += `<path class="fx-line nss" d="M${x} ${y + 4}H${x + f.w}M${x + 3} ${y + 6}H${x + f.w - 3}"/>`;
      else if (f.kind === 'ucfridge') s += `<rect class="fx-glass nss" x="${x + 2}" y="${y + 3}" width="${f.w - 4}" height="${f.h - 9}"/>`;
      else if (f.kind === 'range') s += `<path class="fx-line nss" d="M${x} ${y + 4}H${x + f.w}"/><rect class="fx-glass nss" x="${x + 3}" y="${y + 9}" width="${f.w - 6}" height="${f.h * 0.42}"/>`;
      else if (f.kind === 'washer' || f.kind === 'dryer') s += `<path class="fx-line nss" d="M${x} ${y + 6}H${x + f.w}"/><circle class="fx-glass nss" cx="${x + f.w / 2}" cy="${y + 6 + (f.h - 6) * 0.48}" r="${Math.min(f.w, f.h) * 0.3}"/>`;
      if (fixtDef(f).ab) s += `<text class="lbl-m fx-lbl" x="${x + f.w / 2}" y="${y + f.h * 0.82}" font-size="${fs}" text-anchor="middle" pointer-events="none">${esc(fixtName(f))}</text>`;
      s += `<rect class="ev-hit" x="${x}" y="${y}" width="${f.w}" height="${f.h}"/>`;
      if (sel) s += `<rect class="ev-halo nss" x="${x}" y="${y}" width="${f.w}" height="${f.h}"/><rect class="ev-sel nss" x="${x}" y="${y}" width="${f.w}" height="${f.h}"/>`;
    }
    if (sel && fixtSink(f)) { const t = fixtCounter(f).top; s += `<rect class="ev-sel nss" x="${x}" y="${-t - 14}" width="${f.w}" height="${14 + f.h}"/>`; }
    return s + '</g>';
  }).join('');
}
// Elevation drag: along the wall, and up and down for windows.
function fixtElevMove(d, p) {
  const f = fixtById(d.fixt), w = f && wall(f.wall); if (!w) return;
  const dx = p.x - d.sx, dz = -(p.y - d.sy), side = elevSide(w);
  if (!d.live && Math.abs(dx) < 1 && Math.abs(dz) < 1) return;
  d.live = true;
  const off = fixtFree(f, f.wall, f.side, Math.round((d.off + (side === 1 ? dx : -dx)) * 4) / 4, ui.elevPx);
  if (off !== null) f.off = r3(off);
  if (f.kind === 'window') f.elev = Math.max(0, Math.round((d.elev + dz) * 4) / 4);
  renderElev(); renderPlan();
}

/* ---------- 3D ---------- */
// The wall cut into pieces around its doors and windows (local x runs along the wall, centered on its middle).
function fixtWall3(w, g, wm, edges) {
  const L = g.L, H = w.height, t = w.thick;
  const holes = fixtList().filter(f => f.wall === w.id && fixtHole(f)).map(f => { const [a0, a1, z0, z1] = fixtInner(f); return { a0: Math.max(0, a0), a1: Math.min(L, a1), z0: Math.max(0, z0), z1: Math.min(H, z1) }; })
    .filter(o => o.a1 - o.a0 > 0.1 && o.z1 - o.z0 > 0.1).sort((a, b) => a.a0 - b.a0);
  if (!holes.length) return [box3(L + t, H, t, wm, 0, H / 2, 0, edges)];
  const out = [], piece = (a0, a1, z0, z1) => { if (a1 - a0 > 0.01 && z1 - z0 > 0.01) out.push(box3(a1 - a0, z1 - z0, t, wm, (a0 + a1) / 2 - L / 2, (z0 + z1) / 2, 0, edges)); };
  let at = -t / 2;
  holes.forEach(o => {
    const a0 = Math.max(at, o.a0); if (o.a1 <= a0) return;
    piece(at, a0, 0, H); piece(a0, o.a1, 0, o.z0); piece(a0, o.a1, o.z1, H); at = o.a1;
  });
  piece(at, L + t / 2, 0, H);
  return out;
}
function fixt3d(v, selCol) {
  const metal = flat3('#c3c7cc'), white = flat3('#f3f3f1'), dark = flat3('#3b3f44'), glass = flat3('#a8cfe6', 0.35), wood = flat3('#d9c3a0'), trim = flat3('#ffffff');
  fixtList().forEach(f => {
    const w = wall(f.wall); if (!w) return;
    const sel = fixtSel(f.id), hot = sel ? flat3(selCol) : null, tag = o => { o.traverse(m => { if (m.isMesh) m.userData.fixtId = f.id; }); return o; };
    if (fixtHole(f)) {
      // In the wall: glass for a window, a closed slab for a door, and a thin casing on both faces.
      const grp = wallGroup(w, 1, 0, -w.thick), T = w.thick, [a0, a1, z0, z1] = fixtInner(f), iw = a1 - a0, ih = z1 - z0, c = f.bare ? 0 : CASE;
      if (f.kind === 'window') grp.add(box3(iw, ih, 0.25, hot || glass, (a0 + a1) / 2, (z0 + z1) / 2, T / 2, false));
      if (f.kind === 'door' && f.swing && f.swing !== 'none') {
        const zc = f.side === 1 ? T - 0.7 : 0.7, lv = f.swing === 'both' ? [[a0, iw / 2], [a0 + iw / 2, iw / 2]] : [[a0, iw]];
        lv.forEach(([x0, lw]) => grp.add(box3(lw - 0.2, ih - 0.15, 1.375, hot || wood, x0 + lw / 2, z0 + (ih - 0.15) / 2, zc)));
      }
      if (c) [-0.25, T + 0.25].forEach(zc => {
        grp.add(box3(c, f.h - (z0 - f.elev), 0.5, hot || trim, f.off + c / 2, z0 + (f.h - (z0 - f.elev)) / 2, zc));
        grp.add(box3(c, f.h - (z0 - f.elev), 0.5, hot || trim, f.off + f.w - c / 2, z0 + (f.h - (z0 - f.elev)) / 2, zc));
        grp.add(box3(iw, c, 0.5, hot || trim, (a0 + a1) / 2, z1 + c / 2, zc));
        if (z0 > f.elev) grp.add(box3(iw, c, 0.5, hot || trim, (a0 + a1) / 2, f.elev + c / 2, zc));
      });
      v.root.add(tag(grp)); return;
    }
    const grp = wallGroup(w, f.side, f.side === 1 ? f.off : f.off + f.w);
    if (fixtSink(f)) {
      const c = fixtCounter(f), m = c.depth / 2 - 0.5;
      grp.add(box3(f.w, 0.2, f.d, hot || metal, f.w / 2, c.top + 0.1, m));
      const n = Math.max(1, Math.min(3, f.bowls | 0 || 1)), gap = 1.5, bw = (f.w - 1.5 - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) grp.add(box3(bw, 0.1, f.d - 2.25, dark, 0.75 + i * (bw + gap) + bw / 2, c.top + 0.22, m + 0.4, false));
      grp.add(box3(1.2, 13, 1.2, hot || metal, f.w / 2, c.top + 6.5, m - f.d / 2 - 1.25));
      grp.add(box3(1, 1, 7, hot || metal, f.w / 2, c.top + 13, m - f.d / 2 + 2));
      v.root.add(tag(grp)); return;
    }
    const body = f.kind === 'washer' || f.kind === 'dryer' ? white : metal;
    grp.add(box3(f.w, f.h, f.d, hot || body, f.w / 2, f.elev + f.h / 2, f.d / 2));
    const z = f.d + 0.4;
    if (f.kind === 'fridge') { grp.add(box3(f.w, 0.3, 0.2, dark, f.w / 2, f.h * 0.68, f.d + 0.1, false)); grp.add(box3(0.3, f.h * 0.32, 0.2, dark, f.w / 2, f.h * 0.84, f.d + 0.1, false)); [-2, 2].forEach(dx => grp.add(box3(0.8, f.h * 0.2, 0.8, dark, f.w / 2 + dx, f.h * 0.84, z))); grp.add(box3(f.w - 6, 0.8, 0.8, dark, f.w / 2, f.h * 0.62, z)); }
    else if (f.kind === 'dw' || f.kind === 'ucfridge') grp.add(box3(f.w - 6, 0.8, 0.8, dark, f.w / 2, f.h - 5, z));
    else if (f.kind === 'range') { grp.add(box3(f.w, 0.6, f.d, dark, f.w / 2, f.h + 0.3, f.d / 2)); grp.add(box3(f.w - 6, f.h * 0.4, 0.2, dark, f.w / 2, f.h * 0.42, f.d + 0.1, false)); grp.add(box3(f.w, 5, 2, dark, f.w / 2, f.h + 2.5, 1)); }
    else if (f.kind === 'washer' || f.kind === 'dryer') { const r = Math.min(f.w, f.h) * 0.3, cy = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 32), hot || (f.kind === 'washer' ? glass : dark)); cy.rotation.x = Math.PI / 2; cy.position.set(f.w / 2, (f.h - 6) * 0.52, f.d + 0.3); grp.add(cy); grp.add(box3(f.w, 6, 0.3, dark, f.w / 2, f.h - 3, f.d + 0.15, false)); }
    v.root.add(tag(grp));
  });
}

/* ---------- Products tree, side panel and actions ---------- */
const FIXT_ICON = {
  sink: '<rect x="3" y="7" width="14" height="7" rx="1.5"/><path d="M10 7V3.5h3"/>',
  sink2: '<rect x="2.5" y="7" width="7" height="7" rx="1.2"/><rect x="10.5" y="7" width="7" height="7" rx="1.2"/><path d="M10 7V3.5h3"/>',
  door: '<path d="M4 17V3h9v14"/><circle cx="11" cy="10.5" r=".8"/><path d="M2.5 17h15"/>',
  opening: '<path d="M4 17V3h12v14M2.5 17h3M14.5 17h3"/>',
  window: '<rect x="3.5" y="3.5" width="13" height="13"/><path d="M10 3.5v13M3.5 10h13"/>',
  fridge: '<rect x="5" y="2" width="10" height="16" rx="1"/><path d="M5 8h10M7 4v2.5M7 10v4"/>',
  ucfridge: '<rect x="4" y="6" width="12" height="12" rx="1"/><rect x="6" y="8.5" width="8" height="7"/><path d="M2.5 6h15"/>',
  dw: '<rect x="4" y="6" width="12" height="12" rx="1"/><path d="M4 9h12M7 11h6M2.5 6h15"/>',
  range: '<rect x="4" y="5" width="12" height="13" rx="1"/><path d="M4 8h12"/><rect x="6" y="10" width="8" height="5"/>',
  washer: '<rect x="4" y="3" width="12" height="15" rx="1"/><path d="M4 6h12"/><circle cx="10" cy="11.5" r="3.6"/>',
  dryer: '<rect x="4" y="3" width="12" height="15" rx="1"/><path d="M4 6h12"/><circle cx="10" cy="11.5" r="3.6"/><path d="M8.2 11.5h3.6"/>',
};
function fixtButton(d) {
  const on = ui.placing === 'fixt:' + d.id, ic = FIXT_ICON[d.kind === 'sink' && d.bowls > 1 ? 'sink2' : d.kind] || '';
  return `<button class="srcitem libbtn fixtbtn${on ? ' on' : ''}" data-act="fixt-pick" data-id="${d.id}" data-drag="fixt:${d.id}" title="${esc(d.name)}"><svg class="shpico fx-ico" viewBox="0 0 20 20" aria-hidden="true">${ic}</svg><span><span class="nm">${esc(d.name)}</span><span class="ab">${esc(d.name)}</span><span class="dm">${fmtLen(d.w)} × ${fmtLen(d.h)}${d.d ? ' × ' + fmtLen(d.d) : ''}</span></span></button>`;
}
// Entries for the Products tree, in their own group at the bottom, foldered like Mozaik's library.
const FIXT_GROUP = ['fixt', 'Appliances and Fixtures'];
const fixtTreeItems = () => FIXT_LIB.map(d => ({ key: 'fixt:' + d.id, g: 'fixt', f: d.folder, name: d.name, html: fixtButton(d) }));
function fixtProps(f) {
  const id = f.id, R = 'fixt:' + id, d = fixtDef(f), pre = fixtPreset(f.lib) || {}, w = wall(f.wall), L = w ? wg(w).L : 0;
  const from = fixtHole(f) ? 'From the wall start' : 'Along the wall';
  return `<div class="psec"><div class="pshead"><div class="cabtitle"><span class="chip shape">${esc(pre.folder || d.name)}</span> <b>${esc(fixtName(f))}</b></div></div>
    <div class="row-actions">${fixtSink(f) ? '' : `<button class="btn" data-act="fixt-flip" data-id="${id}">${icon('flip')}${f.kind === 'door' ? 'Swing to the other side' : fixtHole(f) ? 'Other side' : 'Flip'}</button>`}<button class="btn" data-act="fixt-dup" data-id="${id}">${icon('copy')}Duplicate</button><button class="btn danger" data-act="fixt-del" data-id="${id}">${icon('trash')}Delete</button></div>
    <div class="sizeline">${fixtHole(f) && !f.bare ? 'With casing: ' : ''}${fmtLen(f.w, 1)} wide × ${fmtLen(f.h, 1)} high${f.d ? ` × ${fmtLen(f.d, 1)} deep` : ''}</div>
    <div class="note">${w ? esc(wallName(w)) : ''}${fixtSink(f) ? ' · sits in the countertop' : fixtUnder(f) ? ' · the countertop runs over it' : fixtHole(f) ? ' · cabinets stay out of it where they would overlap' : ' · cabinets stay out of its space'}. Not on the cut list.</div></div>
  <div class="psec box">${secHead('ruler', 'Size and position', 'teal')}
    <div class="grid2">${fld('Width', R, 'w', f.w, 'len')}${fixtSink(f) ? fld('Front to back', R, 'd', f.d, 'len') : fld('Height', R, 'h', f.h, 'len')}${fixtFloor(f) ? fld('Depth', R, 'd', f.d, 'len') : ''}${fixtHole(f) ? fld(f.kind === 'window' ? 'Bottom of casing' : 'Off the floor', R, 'elev', f.elev, 'len') : ''}${fld(from, R, 'off', f.off, 'len')}${w ? `<label class="f"><span>To the wall end</span><input type="text" class="num" disabled value="${esc(fmtLen(r3(L - f.off - f.w)))}"></label>` : ''}</div>
    ${f.kind === 'door' ? fld('Door', R, 'swing', f.swing || 'L', 'select', { options: [{ v: 'L', l: 'LH, hinge on the left' }, { v: 'R', l: 'RH, hinge on the right' }, { v: 'both', l: 'Double door' }, { v: 'none', l: 'No door (open doorway)' }] }) : ''}
    ${fixtSink(f) ? fld('Bowls', R, 'bowls', f.bowls || 1, 'selnum', { options: [{ v: 1, l: 'Single bowl' }, { v: 2, l: 'Double bowl' }, { v: 3, l: 'Triple bowl' }] }) : ''}
    ${fixtSink(f) ? `<div class="row-actions"><button class="btn sm" data-act="fixt-center" data-id="${id}">${icon('ends')}Center on the cabinet under it</button></div>` : ''}
    ${fld('Name', R, 'name', f.name || '', 'text', { ph: d.name, wide: true })}</div>`;
}
function fixtAct(a, id) {
  const f = fixtById(id);
  switch (a) {
    case 'fixt-pick': ui.libOpen = false; placeMode(ui.placing === 'fixt:' + id ? null : 'fixt:' + id); return true;
    case 'fixt-del': ui.sel = null; mutate(() => { S.fixtures = fixtList().filter(x => x.id !== id); }); return true;
    case 'fixt-flip': if (f) mutate(() => { f.side = -f.side; }); return true;
    case 'fixt-dup': {
      if (!f) return true;
      const n = { ...clone(f), id: uid('fx') }, off = fixtFree(n, f.wall, f.side, f.off + f.w, 0);
      if (off === null || (fixtFloor(f) && Math.abs(off - f.off) < 0.01)) { flash('There is no room for another one on this wall.'); return true; }
      n.off = r3(off); mutate(() => { S.fixtures.push(n); }); ui.sel = { type: 'fixt', id: n.id }; renderRoom(); return true;
    }
    case 'fixt-center': {
      if (!f) return true;
      const c = S.cabinets.filter(k => k.wall === f.wall && k.side === f.side && k.cat !== 'Wall').find(k => f.off + f.w / 2 >= k.off && f.off + f.w / 2 <= k.off + k.w);
      if (!c) { flash('There is no base cabinet under the sink.'); return true; }
      mutate(() => { f.off = r3(c.off + (c.w - f.w) / 2); }); return true;
    }
  }
  return false;
}
// Countertop runs bridge over dishwashers and under-counter fridges.
const fixtUnderList = () => fixtList().filter(fixtUnder).map(f => ({ id: f.id, wall: f.wall, side: f.side, off: f.off, w: f.w, d: f.d, bridge: true }));
// A countertop run stops flush against a fridge, range or washer.
const fixtBlocksEnd = (r, at, dir) => fixtList().some(f => fixtFloor(f) && !fixtUnder(f) && f.wall === r.wall && f.side === r.side && f.elev < r.top - 0.01 && f.elev + f.h > r.bottom + 0.01 && Math.abs((dir < 0 ? f.off + f.w : f.off) - at) < 0.5);
