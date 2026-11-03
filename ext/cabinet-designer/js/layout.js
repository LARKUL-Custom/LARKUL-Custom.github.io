// Layout: snapping, placement without overlaps, automatic fillers and end panels, and wall resizing.
'use strict';

/* ---------- Settings ---------- */
const LAYOUT_DEFAULTS = { snapReach: 4, grid: 1, angleSnap: 45, autoFillers: true, fillerW: 1.5, fillerReach: 3, autoPanels: true, panelReach: 1, fitOpenings: true, fitMin: 9, fitMax: 36 };
const LAYOUT_FIELDS = [
  { k: 'snapReach', label: 'Snap reach', type: 'len', note: 'Cabinets jump to walls, other cabinets and lined-up edges inside this distance.' },
  { k: 'grid', label: 'Wall grid', type: 'len', note: 'Wall ends and lengths round to this.' },
  { k: 'angleSnap', label: 'Wall angles snap to', type: 'selnum', options: [{ v: 90, l: '90° only' }, { v: 45, l: 'Every 45°' }, { v: 15, l: 'Every 15°' }], note: 'Hold Shift while drawing for any angle.' },
  { k: 'autoFillers', label: 'Automatic fillers', type: 'bool', note: 'A cabinet that ends at a wall stops short of it and gets a filler.' },
  { k: 'fillerW', label: 'Filler width', type: 'len' },
  { k: 'fillerReach', label: 'Fill gaps to a wall up to', type: 'len', note: 'Any gap to a wall this size or smaller is filled.' },
  { k: 'autoPanels', label: 'Automatic end panels', type: 'bool', note: 'A cabinet end with nothing next to it gets an applied end panel.' },
  { k: 'panelReach', label: 'Counts as next to something within', type: 'len' },
  { k: 'fitOpenings', label: 'Fit new cabinets to openings', type: 'bool', note: 'A cabinet dropped into a gap takes the width of the gap when it is inside the range below. It grows only between two cabinets; against a wall it only shrinks to fit.' },
  { k: 'fitMin', label: 'Narrowest fitted width', type: 'len' },
  { k: 'fitMax', label: 'Widest fitted width', type: 'len', note: 'Wider or narrower gaps keep the cabinet at its library size.' },
];
function lay() { return { ...LAYOUT_DEFAULTS, ...((S && S.job && S.job.layout) || {}) }; }
// Runs fn in the room that holds cabinet c, so neighbors are looked up in the right room.
function inRoomOf(c, fn) {
  if (!c || !c.wall || wall(c.wall)) return fn();
  const r = S.rooms.find(x => x.cabinets.includes(c));
  return r ? withRoom(r, fn) : fn();
}

/* ---------- Footprints ---------- */
// Point p in a wall's frame: a runs along the wall from its start, b goes out from the wall's centerline on side s.
function wallFrame(w, s) {
  const g = wg(w);
  return p => ({ a: (p.x - w.x1) * g.u.x + (p.y - w.y1) * g.u.y, b: s * ((p.x - w.x1) * g.n.x + (p.y - w.y1) * g.n.y) });
}
function wallPoly(w) { const g = wg(w), h = w.thick / 2; return [wallPt(w, g, 1, -h, -h), wallPt(w, g, 1, g.L + h, -h), wallPt(w, g, 1, g.L + h, h), wallPt(w, g, 1, -h, h)]; }
// Applied panels set to "Always" (or an older yes) take room; automatic ones only show where there is room.
const panelMode = (c, end) => c['panel' + end] || ((end === 'L' ? c.appliedL : c.appliedR) ? 'on' : '');
// Everything that blocks a cabinet of this height and depth on one side of a wall, as spans along the wall.
function obstacles(wallId, side, spec, excludeId) {
  const w = wall(wallId); if (!w) return [];
  const F = wallFrame(w, side), f = w.thick / 2 + (spec.outset || 0), b0 = f, b1 = f + spec.d, out = [];
  const add = (poly, kind, id) => {
    const q = poly.map(F), bl = Math.min(...q.map(p => p.b)), bh = Math.max(...q.map(p => p.b));
    if (Math.min(bh, b1) - Math.max(bl, b0) > 0.01) out.push({ a0: Math.min(...q.map(p => p.a)), a1: Math.max(...q.map(p => p.a)), kind, id });
  };
  S.walls.forEach(k => { if (k.id !== w.id) add(wallPoly(k), 'wall', k.id); capsOf(k).forEach(cp => add(capPoly(k, cp), 'wall', k.id)); });
  S.cabinets.forEach(k => {
    if (k.id === excludeId || !vOverlap(k, spec)) return;
    const p = cabPoly(k); if (!p) return;
    add(p, 'cab', k.id);
    panelPolys(k, true).forEach(pp => add(pp, 'cab', k.id));
  });
  // Doors, windows and appliances keep cabinets out of their space.
  if (typeof fixtObstacles === 'function') fixtObstacles(wallId, side, spec, excludeId, add, out);
  return out;
}
// Extra width a cabinet carries past its box at the low and high ends along the wall (panels set to Always).
function ownExtents(c, side) {
  const pt = panelThick(c), lo = side === 1 ? 'L' : 'R', hi = side === 1 ? 'R' : 'L';
  return [panelMode(c, lo) === 'on' ? pt : 0, panelMode(c, hi) === 'on' ? pt : 0];
}
// Offsets along the wall the cabinet's box may not start in, given what is already there.
function blockedOffs(c, wallId, side, excludeId) {
  const ly = lay(), [eLo, eHi] = ownExtents(c, side), out = [];
  obstacles(wallId, side, c, excludeId).forEach(o => {
    // A wall keeps a filler's width clear, unless that end's filler is set to Never.
    const lo = side === 1 ? 'L' : 'R', hi = side === 1 ? 'R' : 'L', pad = e => o.kind === 'wall' && ly.autoFillers && c['fill' + e] !== 'off' ? ly.fillerW : 0;
    out.push([o.a0 - pad(hi) - c.w - eHi, o.a1 + pad(lo) + eLo]);
  });
  return out;
}
// The free offset nearest to want, or null when the cabinet fits nowhere on that wall side.
function findFree(c, wallId, side, want, excludeId) {
  const w = wall(wallId); if (!w) return null;
  const L = wg(w).L, lo = 0, hi = L - c.w, bl = blockedOffs(c, wallId, side, excludeId), e = 0.005;
  if (hi < lo - e) return null;
  const ok = v => v >= lo - e && v <= hi + e && !bl.some(([x0, x1]) => v > x0 + e && v < x1 - e);
  const cands = [Math.max(lo, Math.min(hi, want)), lo, hi, ...bl.flatMap(([x0, x1]) => [x0, x1])].filter(ok);
  if (!cands.length) return null;
  return cands.reduce((b, v) => Math.abs(v - want) < Math.abs(b - want) ? v : b);
}
// Pulls an offset onto nearby edges: walls (less the filler), cabinet ends, and edges of cabinets above or below.
function snapOff(c, wallId, side, off, excludeId, px) {
  const reach = Math.max(lay().snapReach, 12 * (px || 0)), cands = [];
  blockedOffs(c, wallId, side, excludeId).forEach(([x0, x1]) => cands.push(x0, x1));
  S.cabinets.forEach(k => { if (k.id !== excludeId && k.wall === wallId && k.side === side) cands.push(k.off, k.off + k.w - c.w, k.off + k.w, k.off - c.w); });
  const w = wall(wallId); if (w) cands.push(0, wg(w).L - c.w);
  let best = reach, out = Math.round(off * 4) / 4;
  cands.forEach(v => { const d = Math.abs(v - off); if (d < best) { best = d; out = v; } });
  return out;
}
// The opening around spot t along a wall side, between two cabinets or walls (keeping a wall's filler clear).
// Returns { off, w } when its width is inside the fit range and differs from the cabinet's own, otherwise null.
function fitOpening(spec, wallId, side, t) {
  const ly = lay(); if (!ly.fitOpenings) return null;
  const obs = obstacles(wallId, side, spec, null), e = 0.01;
  if (obs.some(o => t > o.a0 + e && t < o.a1 - e)) return null;
  const left = obs.filter(o => o.a1 <= t + e).sort((a, b) => b.a1 - a.a1)[0], right = obs.filter(o => o.a0 >= t - e).sort((a, b) => a.a0 - b.a0)[0];
  if (!left || !right) return null;
  const pad = o => o.kind === 'wall' && ly.autoFillers ? ly.fillerW : 0;
  const off = left.a1 + pad(left), w = Math.round((right.a0 - pad(right) - off) * 1000) / 1000;
  if (w < ly.fitMin - e || w > ly.fitMax + e || Math.abs(w - spec.w) < e) return null;
  // It only grows to fill a gap between two cabinets; next to a wall it can shrink to fit but never grows.
  if (w > spec.w && (left.kind !== 'cab' || right.kind !== 'cab')) return null;
  return { off: Math.round(off * 1000) / 1000, w };
}
function snapToWall(pt, spec, excludeId, delta, px) {
  let best = null;
  S.walls.forEach(w => {
    const r = segDist(pt, w);
    if (r.d > spec.d + w.thick / 2 + 30) return;
    if (!best || r.d < best.r.d) best = { w, r };
  });
  if (!best) return null;
  const { w, r } = best;
  // A new cabinet over an opening takes the opening's width.
  const fit = !excludeId && fitOpening(spec, w.id, r.side, r.t);
  if (fit) return { wall: w.id, side: r.side, off: fit.off, w: fit.w };
  const want = snapOff(spec, w.id, r.side, r.t - spec.w / 2 - (delta || 0), excludeId, px);
  const off = findFree(spec, w.id, r.side, want, excludeId);
  return off === null ? null : { wall: w.id, side: r.side, off: Math.round(off * 1000) / 1000 };
}
// True when a cabinet's box runs into a wall or another cabinet (at its own spot, or at o).
function conflicts(c, o) {
  const wl = o ? o.wall : c.wall, sd = o ? o.side : c.side, off = o ? o.off : c.off;
  if (!wall(wl)) return false;
  return obstacles(wl, sd, c, c.id).some(k => Math.min(k.a1, off + c.w) - Math.max(k.a0, off) > 0.01);
}
// Moves a cabinet to the nearest free spot on its wall side. Returns false when there is no room for it.
function settle(c) {
  const off = findFree(c, c.wall, c.side, c.off, c.id);
  if (off === null) return false;
  c.off = Math.round(off * 1000) / 1000; return true;
}

/* ---------- Fillers and automatic panels ---------- */
// The nearest thing past one end of a cabinet: { gap, kind } or null when nothing is that side of it on the wall.
function nearestAt(c, dir) {
  const lo = c.off, hi = c.off + c.w;
  let best = null;
  obstacles(c.wall, c.side, c, c.id).forEach(o => {
    if (Math.min(o.a1, hi) - Math.max(o.a0, lo) > 0.01) return;
    const gap = dir < 0 ? lo - o.a1 : o.a0 - hi;
    if (gap > -0.01 && (!best || gap < best.gap)) best = { gap: Math.max(0, gap), kind: o.kind };
  });
  return best;
}
// Fillers between a cabinet and a wall, by the viewer's end: [{ end, gap, a0, a1 }].
function fillersOf(c) {
  const ly = lay(); if (!c.wall || (!ly.autoFillers && c.fillL !== 'on' && c.fillR !== 'on')) return [];
  return inRoomOf(c, () => {
    if (!wall(c.wall)) return [];
    const out = [];
    [-1, 1].forEach(dir => {
      const end = (dir < 0) === (c.side === 1) ? 'L' : 'R', mode = c['fill' + end] || '';
      const n = nearestAt(c, dir); if (!n || n.kind !== 'wall' || n.gap < 0.01 || mode === 'off') return;
      // Automatic fills small gaps; "Always" fills whatever gap there is, as when the cabinet was set a distance off the wall.
      if (mode !== 'on' && n.gap > Math.max(ly.fillerReach, ly.fillerW) + 0.01) return;
      const a0 = dir < 0 ? c.off - n.gap : c.off + c.w;
      out.push({ end, gap: n.gap, a0, a1: a0 + n.gap });
    });
    return out;
  });
}
// Does this end of the cabinet get an applied panel? end is the viewer's L or R.
function hasPanel(c, end) {
  const m = panelMode(c, end);
  if (m === 'on') return true;
  if (m === 'off' || !c.wall) return false;
  const ly = lay(); if (!ly.autoPanels) return false;
  return inRoomOf(c, () => {
    if (!wall(c.wall)) return false;
    const dir = (end === 'L') === (c.side === 1) ? -1 : 1, n = nearestAt(c, dir);
    if (!n) return true;
    if (n.kind === 'wall' && fillersOf(c).some(f => f.end === end)) return false;
    return n.gap > Math.max(ly.panelReach, panelThick(c) + 0.01);
  });
}
// Is this end of the cabinet a finished (exposed) end? Set by hand per end, else: no neighbor, wall or applied panel covers it.
function endFinished(c, end) {
  const o = end === 'L' ? c.endL : c.endR;
  if (o === 'fin') return true; if (o === 'unfin') return false;
  if (!c.wall || hasPanel(c, end)) return false;
  return inRoomOf(c, () => {
    if (!wall(c.wall)) return false;
    const dir = (end === 'L') === (c.side === 1) ? -1 : 1, n = nearestAt(c, dir);
    if (n && n.kind === 'wall' && fillersOf(c).some(f => f.end === end)) return false;
    return !n || n.gap > Math.max(lay().panelReach || 0, 0.5);
  });
}
// Moves cabinets that end at a wall so the gap matches the filler setting. from and to are layout settings.
function refitFillers(from, to) {
  let moved = 0;
  S.rooms.forEach(r => withRoom(r, () => {
    S.cabinets.forEach(c => {
      if (!wall(c.wall)) return;
      [-1, 1].forEach(dir => {
        const n = nearestAt(c, dir); if (!n || n.kind !== 'wall') return;
        const had = from.autoFillers ? from.fillerW : 0, want = to.autoFillers ? to.fillerW : 0;
        if (n.gap > Math.max(had, from.fillerReach || 0, to.fillerReach) + 0.01 || Math.abs(n.gap - want) < 0.01) return;
        if (!to.autoFillers && Math.abs(n.gap - had) > 0.01) return;
        if (shiftRun(c, -dir * (want - n.gap))) moved++;
      });
    });
  }));
  return moved;
}
// Slides a cabinet and the cabinets butted against it in the same direction. Undone if anything would overlap.
function shiftRun(c, d) {
  const run = [c], dir = Math.sign(d);
  for (let i = 0; i < run.length; i++) {
    const k = run[i];
    S.cabinets.forEach(o => {
      if (run.includes(o) || o.wall !== k.wall || o.side !== k.side || !vOverlap(o, k)) return;
      const gap = dir > 0 ? o.off - (k.off + k.w) : k.off - (o.off + o.w);
      if (gap > -0.01 && gap < Math.abs(d) + 0.01) run.push(o);
    });
  }
  const was = run.map(k => k.off);
  run.forEach(k => { k.off = Math.round((k.off + d) * 1000) / 1000; });
  const L = wg(wall(c.wall)).L;
  if (run.some(k => k.off < -0.01 || k.off + k.w > L + 0.01 || conflicts(k))) { run.forEach((k, i) => { k.off = was[i]; }); return false; }
  return true;
}

/* ---------- Walls ---------- */
const samePt = (x, y, p) => Math.abs(x - p.x) < 0.01 && Math.abs(y - p.y) < 0.01;
// Keeps a wall's cabinets where they are in the room when its start point moves by d.
function startMoved(w, d) { const g = wg(w), k = d.x * g.u.x + d.y * g.u.y; S.cabinets.forEach(c => { if (c.wall === w.id) c.off = Math.round((c.off - k) * 1000) / 1000; }); }
// Walls joined at point p follow a move of d: a wall running the same way stretches, any other wall slides along with it.
function carryJoined(p, d, seen) {
  const dl = Math.hypot(d.x, d.y); if (dl < 1e-9) return;
  S.walls.forEach(k => {
    if (seen.has(k.id)) return;
    const e = samePt(k.x1, k.y1, p) ? 1 : samePt(k.x2, k.y2, p) ? 2 : 0; if (!e) return;
    seen.add(k.id);
    const g = wg(k), across = Math.abs(g.u.x * d.y - g.u.y * d.x) / dl;
    if (across < 0.02) {
      if (e === 1) { k.x1 += d.x; k.y1 += d.y; startMoved(k, d); } else { k.x2 += d.x; k.y2 += d.y; }
    } else {
      const other = e === 1 ? { x: k.x2, y: k.y2 } : { x: k.x1, y: k.y1 };
      k.x1 += d.x; k.y1 += d.y; k.x2 += d.x; k.y2 += d.y;
      carryJoined(other, d, seen);
    }
  });
}
// Moves one end of a wall by d (end 1 is the start); the walls joined there come along.
function moveWallEnd(w, end, d) {
  const p = end === 1 ? { x: w.x1, y: w.y1 } : { x: w.x2, y: w.y2 };
  if (end === 1) { w.x1 += d.x; w.y1 += d.y; startMoved(w, d); } else { w.x2 += d.x; w.y2 += d.y; }
  carryJoined(p, d, new Set([w.id]));
  tidyWalls();
}
// Slides a whole wall by d; walls joined to either end stretch or follow.
function moveWall(w, d) {
  const p1 = { x: w.x1, y: w.y1 }, p2 = { x: w.x2, y: w.y2 }, seen = new Set([w.id]);
  w.x1 += d.x; w.y1 += d.y; w.x2 += d.x; w.y2 += d.y;
  carryJoined(p1, d, seen); carryJoined(p2, d, seen);
  tidyWalls();
}
function setWallLen(w, L) {
  if (!(L > 1)) return;
  const g = wg(w);
  moveWallEnd(w, 2, { x: g.u.x * (L - g.L), y: g.u.y * (L - g.L) });
}
function tidyWalls() { S.walls.forEach(k => ['x1', 'y1', 'x2', 'y2'].forEach(f => { k[f] = Math.round(k[f] * 1000) / 1000; })); }
// Snaps a free point for wall drawing: wall ends first, then lines through other wall ends, then the grid.
function wallSnap(p, skip) {
  const px = ui.px, ly = lay(), reach = 14 * px, pts = [];
  S.walls.forEach(w => [[w.x1, w.y1], [w.x2, w.y2]].forEach(([x, y]) => { if (!skip || !samePt(x, y, skip)) pts.push({ x, y }); }));
  if (ui.drawing && ui.drawing.first && !samePt(ui.drawing.first.x, ui.drawing.first.y, ui.drawing)) pts.push(ui.drawing.first);
  let best = null, bd = reach;
  pts.forEach(q => { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd) { bd = d; best = q; } });
  if (best) return { x: best.x, y: best.y, at: true };
  const g = ly.grid > 0 ? ly.grid : 1, out = { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g, guides: [] };
  let bx = 10 * px, by = 10 * px;
  pts.forEach(q => {
    if (Math.abs(p.x - q.x) < bx) { bx = Math.abs(p.x - q.x); out.x = q.x; out.gx = q; }
    if (Math.abs(p.y - q.y) < by) { by = Math.abs(p.y - q.y); out.y = q.y; out.gy = q; }
  });
  return out;
}

/* ---------- Position from the wall ends ---------- */
// Inside faces of the walls (or caps) at each end of a cabinet's wall, along the wall; the bare wall ends when nothing meets them.
function runLimits(c) {
  const w = wall(c.wall), L = wg(w).L; let lo = 0, hi = L;
  obstacles(c.wall, c.side, c, c.id).filter(o => o.kind === 'wall').forEach(o => {
    if (o.a0 <= 0.5 && o.a1 < L / 2) lo = Math.max(lo, o.a1);
    if (o.a1 >= L - 0.5 && o.a0 > L / 2) hi = Math.min(hi, o.a0);
  });
  return { lo, hi };
}
// Distance from the viewer's left or right wall face (looking at the cabinet's front) to the cabinet box.
function fromEnd(c, end) {
  const { lo, hi } = runLimits(c), left = end === 'L';
  return (c.side === 1) === left ? c.off - lo : hi - (c.off + c.w);
}
function setFromEnd(c, end, v) {
  const { lo, hi } = runLimits(c), left = end === 'L';
  c.off = r3((c.side === 1) === left ? lo + v : hi - v - c.w);
}
// Centers a cabinet between the wall faces, or in the open space between its nearest neighbors.
function centerCab(c, inOpening) {
  let { lo, hi } = runLimits(c);
  if (inOpening) {
    const a = nearestAt(c, -1), b = nearestAt(c, 1);
    if (a) lo = Math.max(lo, c.off - a.gap); if (b) hi = Math.min(hi, c.off + c.w + b.gap);
  }
  c.off = r3((lo + hi) / 2 - c.w / 2);
}

/* ---------- Autofill (like Mozaik's) ---------- */
// The empty stretches on cabinet c's wall side at c's height, as [start, end] along the wall,
// keeping a filler's width clear at each wall that meets this one.
function autofillSpans(c) {
  const w = wall(c.wall); if (!w) return [];
  const ly = lay(), L = wg(w).L, pad = o => o.kind === 'wall' && ly.autoFillers ? ly.fillerW : 0;
  const obs = obstacles(c.wall, c.side, c, null).map(o => [o.a0 - pad(o), o.a1 + pad(o)]).sort((a, b) => a[0] - b[0]);
  const out = []; let at = 0;
  obs.forEach(([a0, a1]) => { if (a0 > at) out.push([at, Math.min(a0, L)]); at = Math.max(at, a1); });
  if (at < L) out.push([at, L]);
  return out.filter(([a, b]) => b - a > 0.01);
}
// Fills every empty stretch on c's wall side with copies of c, split evenly so each is between the
// fit-opening min and max widths (Layout settings). Returns the new cabinets. Stretches too narrow are left.
function autofillWall(c) {
  const ly = lay(), min = ly.fitMin || 9, max = ly.fitMax || 36, made = [];
  autofillSpans(c).forEach(([a, b]) => {
    const span = b - a; if (span < min - 0.01) return;
    const n = Math.max(1, Math.ceil(span / max - 0.001)), each = Math.floor(span / n * 16) / 16;
    if (each < min - 0.01) return;
    let off = a;
    for (let i = 0; i < n; i++) {
      const nc = clone(c); nc.id = uid('c'); nc.w = r3(i === n - 1 ? b - off : each); nc.off = r3(off);
      off += nc.w;
      if (conflicts(nc)) continue;
      S.cabinets.push(nc); made.push(nc);
    }
  });
  return made;
}
