// Layout: snapping, placement without overlaps, automatic fillers and end panels, and wall resizing.
'use strict';

/* ---------- Settings ---------- */
const LAYOUT_DEFAULTS = { snapReach: 4, grid: 1, angleSnap: 45, autoFillers: true, fillerW: 1.5, fillerReach: 3, autoPanels: true, panelReach: 1, autoLights: true, winOnly: false, fridgePanels: true, fitOpenings: true, fitMin: 9, fitMax: 36 };
const LAYOUT_FIELDS = [
  { k: 'snapReach', label: 'Snap reach', type: 'len', note: 'Cabinets jump to walls, other cabinets and lined-up edges inside this distance.' },
  { k: 'grid', label: 'Wall grid', type: 'len', note: 'Wall ends and lengths round to this.' },
  { k: 'angleSnap', label: 'Wall angles snap to', type: 'selnum', options: [{ v: 90, l: '90° only' }, { v: 45, l: 'Every 45°' }, { v: 15, l: 'Every 15°' }], note: 'Hold Shift while drawing for any angle.' },
  { k: 'autoFillers', label: 'Automatic fillers', type: 'bool', note: 'A cabinet that ends at a wall stops short of it and gets a filler.' },
  { k: 'fillerW', label: 'Filler width', type: 'len' },
  { k: 'fillerReach', label: 'Fill gaps to a wall up to', type: 'len', note: 'Any gap to a wall this size or smaller is filled.' },
  { k: 'autoPanels', label: 'Automatic end panels', type: 'bool', note: 'Any cabinet end that shows gets an applied end panel: one with nothing next to it, the part of a deeper cabinet that sticks out past its neighbour, and the sides above and below a floating shelf or a shorter cabinet.' },
  { k: 'autoLights', label: 'Automatic ceiling lights', type: 'bool', note: 'A closed-in room with no ceiling lights drawn gets recessed pucks in Realistic, shown dashed in the plan. Placing any ceiling light turns them off.' },
  { k: 'fridgePanels', label: 'Automatic fridge panels', type: 'bool', note: 'A fridge with no wall or tall cabinet beside it gets a full-height panel on each open side, floor to the top of the cabinet over it. Cabinets butted against it slide over to make room. Delete a panel to leave that side bare; turning this off takes them all out.' },
  { k: 'panelReach', label: 'Counts as next to something within', type: 'len' },
  { k: 'panelItems', label: 'Panels as separate pieces', type: 'bool', note: 'Each automatic end panel is its own panel in the room that you can pick, move and size. It follows its cabinet until you change it; after that it stays where you put it. Delete one to leave that end bare.' },
  { k: 'fitOpenings', label: 'Fit new cabinets to openings', type: 'bool', note: 'A cabinet dropped into a gap takes the width of the gap when it is inside the range below. It grows only between two cabinets; against a wall it only shrinks to fit.' },
  { k: 'fitMin', label: 'Narrowest fitted width', type: 'len' },
  { k: 'fitMax', label: 'Widest fitted width', type: 'len', note: 'Wider or narrower gaps keep the cabinet at its library size.' },
];
// 0.61.3 (Ayden 2026-11-23: "i want the automatic panels to be placed not just on the cabinet, that way i can adjust when i
// need to"): with Layout › Panels as separate pieces on (new jobs), each automatic end panel is a panel piece of its own in
// the room (a Support Panel, c.autoOf = its cabinet, c.autoEnd = L/R). It follows its cabinet while untouched; once moved
// or resized it is yours (the cabinet's end turns to Never so no second panel comes); deleted, that end stays bare.
// Only plain rectangular panels become pieces; one notched round a shelf or stepped past a neighbour stays on the cabinet.
function panelItemSync() {
  const on = lay().autoPanels && lay().panelItems, lib = typeof libItem === 'function' && libItem('made-panel');
  (S.rooms || []).forEach(r => {
    const sig = k => [k.wall, k.side, k.off, k.w, k.h, k.d, k.elev, k.outset || 0].map(v => typeof v === 'number' ? r3(v) : v).join('|');
    const byId = id => r.cabinets.find(k => k.id === id);
    // Deleted by hand: that end stays bare. Moved or resized by hand: the piece is yours.
    r.cabinets.forEach(c => { if (!c.pItems) return; Object.keys(c.pItems).forEach(e => { if (!byId(c.pItems[e])) { c['panel' + e] = 'off'; delete c.pItems[e]; } }); if (!Object.keys(c.pItems).length) delete c.pItems; });
    r.cabinets.forEach(k => {
      if (!k.autoOf) return;
      const c = byId(k.autoOf);
      if (c && k.autoSig && sig(k) !== k.autoSig) { c['panel' + k.autoEnd] = 'off'; if (c.pItems) { delete c.pItems[k.autoEnd]; if (!Object.keys(c.pItems).length) delete c.pItems; } delete k.autoOf; delete k.autoEnd; delete k.autoSig; }
    });
    // What the automatic panels would be, worked out with the pieces left out.
    const want = new Map(), all = r.cabinets;
    if (on && lib) {
      r.cabinets = all.filter(k => !k.autoOf);
      try { withRoom(r, () => r.cabinets.forEach(c => { if (c.made || c.moz || !c.wall) return; ['L', 'R'].forEach(e => { const d = panelItemWant(c, e); if (d) want.set(c.id + ':' + e, { c, e, d }); }); })); }
      finally { r.cabinets = all; }
    }
    const keep = new Set();
    want.forEach(({ c, e, d }, key) => {
      let k = c.pItems && c.pItems[e] && byId(c.pItems[e]);
      if (!k || k.autoOf !== c.id) {
        k = withRoom(r, () => newCab(S, lib, d.wall, d.side, d.off));
        Object.assign(k, { name: c.cat === 'Wall' ? 'Wall End Panel' : c.cat === 'Tall' ? 'Tall End Panel' : 'Base End Panel', cat: c.cat, autoOf: c.id, autoEnd: e, num: null });
        r.cabinets.push(k); c.pItems = { ...(c.pItems || {}), [e]: k.id };
      }
      Object.assign(k, d); k.autoSig = sig(k); keep.add(k.id);
    });
    r.cabinets = r.cabinets.filter(k => {
      if (!k.autoOf || keep.has(k.id)) return true;
      const c = byId(k.autoOf); if (c && c.pItems) { delete c.pItems[k.autoEnd]; if (!Object.keys(c.pItems).length) delete c.pItems; }
      return false;
    });
  });
}
// The panel piece for one end of a cabinet, or null when it has none or it isn't a plain rectangle.
function panelItemWant(c, end) {
  const pcs = panelPieces(c, end); if (!pcs || pcs.length !== 1) return null;
  const pc = pcs[0], d0 = pc.steps[0].d0; if (pc.steps.some(q => Math.abs(q.d0 - d0) > 1e-6)) return null;
  const t = panelThick(c), ps = panelFor(c), D = endDepth(c, end) + ps.frontOverhang, dir = (end === 'L') === (c.side === 1) ? -1 : 1;
  return { wall: c.wall, side: c.side, off: r3(dir < 0 ? c.off - t : c.off + c.w), w: r3(t), h: r3(pc.z1 - pc.z0), elev: r3((c.elev || 0) + pc.z0), outset: r3((c.outset || 0) + d0), d: r3(D - d0) };
}
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
// 0.63.20 (Ayden 2026-11-24: "turning off the automatic panels doesnt remove them from the job"): an end panel or filler
// that came in with a Mozaik job is set to Always on its cabinet, but it is still one the program put there, so the
// Panels / Fillers switches take it out and bring it back. One you set on that end yourself (Ends pick, endHand) stays.
// Bid Reader jobs keep theirs: there the bid decides (bidDraw).
const mozDrawn = (c, end) => !!c.fromMozaik && !(S.job && S.job.bidDraw) && !(c.endHand && c.endHand[end]);
const panelMode = (c, end) => { const m = c['panel' + end] || ((end === 'L' ? c.appliedL : c.appliedR) ? 'on' : ''); return m === 'on' && mozDrawn(c, end) && !lay().autoPanels ? 'off' : m; };
const fillMode = (c, end) => { const m = c['fill' + end] || ''; return m === 'on' && mozDrawn(c, end) && !lay().autoFillers ? 'off' : m; };
// Everything that blocks a cabinet of this height and depth on one side of a wall, as spans along the wall.
function obstacles(wallId, side, spec, excludeId) {
  const w = wall(wallId); if (!w) return [];
  const F = wallFrame(w, side), f = w.thick / 2 + (spec.outset || 0), b0 = f, b1 = f + spec.d, out = [];
  // 0.58.27: plain loop instead of four map() calls; this runs for every cabinet in the room on every neighbor check.
  const add = (poly, kind, id) => {
    let al = Infinity, ah = -Infinity, bl = Infinity, bh = -Infinity;
    for (let i = 0; i < poly.length; i++) { const p = F(poly[i]); if (p.a < al) al = p.a; if (p.a > ah) ah = p.a; if (p.b < bl) bl = p.b; if (p.b > bh) bh = p.b; }
    if (Math.min(bh, b1) - Math.max(bl, b0) > 0.01) out.push({ a0: al, a1: ah, kind, id });
  };
  S.walls.forEach(k => {
    // 0.63.5: a wall's stone or panel detail is part of it for what stands beside it (walldetail.js).
    const sl = k.id !== w.id && k.detail && typeof wdSlabPoly === 'function' ? wdSlabPoly(k, spec) : null;
    if (k.id !== w.id) add(sl ? wallPoly(k).concat(sl) : wallPoly(k), 'wall', k.id); capsOf(k).forEach(cp => add(capPoly(k, cp), 'wall', k.id)); });
  S.cabinets.forEach(k => {
    if (k.id === excludeId || !vOverlap(k, spec)) return;
    // Pocket Doors (0.61.9) are fronts standing in front of other pieces: nothing is kept out of their space.
    if (k.made === 'pocketdoors') return;
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
  // Pocket Doors go anywhere along the wall: they stand in front of what is there (pocketDoorsSync sets their outset).
  if (c && c.made === 'pocketdoors') return [];
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
  const ly = lay(); if (!ly.fitOpenings || spec.made === 'pocketdoors') return null;
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
  if (!wall(wl) || c.made === 'pocketdoors') return false;
  return obstacles(wl, sd, c, c.id).some(k => Math.min(k.a1, off + c.w) - Math.max(k.a0, off) > 0.01);
}
// 0.62.4 (Ayden 2026-11-24: "I don't care if it overlaps as long as it tells me in some way so I can fix it before it
// gets sent out"): every piece in the job that runs into a wall, a cabinet or an appliance, room by room, each pair once.
// [{ room, c, what: 'the wall' | other piece's name }]. Shown red in the plan, on the item, and on Print, CNC and the quote.
const cabTag = c => (c.num ? '#' + c.num : LBL[c.id] || '');
function jobOverlaps() {
  const out = [], seen = new Set();
  (S.rooms || []).forEach(r => withRoom(r, () => S.cabinets.forEach(c => {
    if (!c.wall || !wall(c.wall) || c.made === 'pocketdoors') return;
    obstacles(c.wall, c.side, c, c.id).forEach(k => {
      if (Math.min(k.a1, c.off + c.w) - Math.max(k.a0, c.off) <= 0.01) return;
      const key = r.id + '|' + [c.id, k.kind + ':' + k.id].sort().join('|'), key2 = r.id + '|' + [k.id, 'cab:' + c.id].sort().join('|');
      if (seen.has(key) || seen.has(key2)) return; seen.add(key); seen.add(r.id + '|' + ['cab:' + c.id, k.id].sort().join('|'));
      const o = k.kind === 'cab' && S.cabinets.find(x => x.id === k.id), f = k.kind !== 'cab' && k.kind !== 'wall' && (S.fixtures || []).find(x => x.id === k.id);
      // An automatic end panel piece (0.61.3) stands where its cabinet's own panel is: that is the same panel, not an overlap.
      if (o && (o.autoOf === c.id || c.autoOf === o.id)) return;
      out.push({ room: r, c, what: k.kind === 'wall' ? 'a wall' : o ? `${o.name} ${cabTag(o)}`.trim() : f ? fixtName(f) : 'something' });
    });
  })));
  return out;
}
// The warning box listing them (empty when there are none).
function overlapsNote(list) {
  const L = list || jobOverlaps(); if (!L.length) return '';
  const many = S.rooms.length > 1, show = L.slice(0, 8);
  return `<div class="warnbox ovl-note"><b>${L.length} overlap${L.length === 1 ? '' : 's'} to fix before this goes out:</b> ${show.map(o => esc(`${many ? o.room.name + ': ' : ''}${o.c.name} ${cabTag(o.c)} runs into ${o.what}`)).join('; ')}${L.length > show.length ? `; and ${L.length - show.length} more` : ''}. They show red in the plan.</div>`;
}
// Moves a cabinet to the nearest free spot on its wall side. Returns false when there is no room for it.
function settle(c) {
  const off = findFree(c, c.wall, c.side, c.off, c.id);
  if (off === null) return false;
  c.off = Math.round(off * 1000) / 1000; return true;
}

/* ---------- Fillers and automatic panels ---------- */
// The nearest thing past one end of a cabinet: { gap, kind } or null when nothing is that side of it on the wall.
// 0.58.27: while the screen is drawn the job does not change, so each cabinet's neighbor answer is kept and reused.
// A cabinet asks the same question many times (finished ends, panels, fillers, joints) and every ask walks the whole room.
// Kept per room (cabinet and wall lists) and per cabinet, and only while its place and size stay the same.
let nearMemo = null;
function nearWindow(fn) { if (nearMemo) return fn(); nearMemo = new WeakMap(); try { return fn(); } finally { nearMemo = null; } }
// This cabinet's answers kept for the drawing window (null outside one).
function nearSlot(c) {
  if (!nearMemo || !c || typeof c !== 'object' || !S.cabinets || !S.walls) return null;
  let a = nearMemo.get(S.cabinets); if (!a) nearMemo.set(S.cabinets, a = new WeakMap());
  let b = a.get(S.walls); if (!b) a.set(S.walls, b = new WeakMap());
  let m = b.get(c); if (!m) b.set(c, m = new Map());
  return m;
}
function nearestAt(c, dir) {
  if (!nearMemo || !c || typeof c !== 'object' || !S.cabinets || !S.walls) return nearestAtNow(c, dir);
  let a = nearMemo.get(S.cabinets); if (!a) nearMemo.set(S.cabinets, a = new WeakMap());
  let b = a.get(S.walls); if (!b) a.set(S.walls, b = new WeakMap());
  let m = b.get(c); if (!m) b.set(c, m = new Map());
  const k = [dir, c.id, c.wall, c.side, c.off, c.w, c.d, c.h, c.elev, c.outset].join('|');
  if (!m.has(k)) m.set(k, nearestAtNow(c, dir));
  const r = m.get(k); return r && { ...r };
}
function nearestAtNow(c, dir) {
  const lo = c.off, hi = c.off + c.w;
  let best = null;
  obstacles(c.wall, c.side, c, c.id).forEach(o => {
    if (Math.min(o.a1, hi) - Math.max(o.a0, lo) > 0.01) return;
    const gap = dir < 0 ? lo - o.a1 : o.a0 - hi;
    if (gap > -0.01 && (!best || gap < best.gap)) best = { gap: Math.max(0, gap), kind: o.kind, id: o.id };
  });
  return best;
}
// A Mozaik filler placed beside a cabinet starts at the same outset as that cabinet's doors:
// its face (the product's front) lines up with the door faces. Corner fillers and ceiling trim keep their own spot.
// Returns the outset to use, or null when there is no cabinet touching either end.
function fillerFlushOutset(c) {
  const d = c && c.moz && typeof mozDef === 'function' && mozDef(c.moz);
  if (!d || d.group !== 'filler' || /corner|ceiling/.test(c.moz) || !c.wall) return null;
  return inRoomOf(c, () => {
    if (!wall(c.wall)) return null;
    let best = null;
    obstacles(c.wall, c.side, { ...c, outset: 0, d: 999 }, c.id).forEach(o => {
      if (o.kind !== 'cab') return;
      const nb = cab(o.id); if (!nb || nb.moz) return;
      const gap = Math.min(Math.abs(o.a0 - (c.off + c.w)), Math.abs(c.off - o.a1));
      if (gap > 1 + 0.01 || (best && gap >= best.gap)) return;
      best = { gap, nb };
    });
    if (!best) return null;
    const nb = best.nb, fr = computeFronts(nb).find(f => f.type !== 'open');
    const ft = fr ? ((mat(frontStyle(nb, fr).ds.mat) || {}).thick || 0.75) : 0;
    return Math.round(((nb.outset || 0) + nb.d + ft - c.d) * 1000) / 1000;
  });
}
// Fillers between a cabinet and a wall, by the viewer's end: [{ end, gap, a0, a1 }].
function fillersOf(c) {
  if (c.moz || c.made) return []; // a Mozaik product is its own filler or trim
  const ly = lay(); if (!c.wall || (!ly.autoFillers && fillMode(c, 'L') !== 'on' && fillMode(c, 'R') !== 'on')) return [];
  return inRoomOf(c, () => {
    if (!wall(c.wall)) return [];
    const out = [];
    [-1, 1].forEach(dir => {
      const end = (dir < 0) === (c.side === 1) ? 'L' : 'R', mode = fillMode(c, end);
      const n = nearestAt(c, dir); if (!n || n.kind !== 'wall' || n.gap < 0.01 || mode === 'off') return;
      // Automatic fills small gaps; "Always" fills whatever gap there is, as when the cabinet was set a distance off the wall.
      if (mode !== 'on' && n.gap > Math.max(ly.fillerReach, ly.fillerW) + 0.01) return;
      const a0 = dir < 0 ? c.off - n.gap : c.off + c.w;
      out.push({ end, gap: n.gap, a0, a1: a0 + n.gap, wallId: n.id });
    });
    return out;
  });
}
// Does this end of the cabinet get an applied panel? end is the viewer's L or R.
function hasPanel(c, end) { return !!panelPieces(c, end); }
// Where the panel at this end goes: null for none, else pieces [{ z0, z1, steps: [{ z0, z1, d0 }] }] in the cabinet's
// own terms: z up from its bottom, d0 how far from its back the panel starts (0 = full depth). A full end panel is one
// piece with one step at d0 0.
// 0.58.30: any part of an end that can be seen gets covered (Ayden 2026-11-19). A neighbour butted against the end covers
// it only over the height it shares and only out to its own front face (doors included). An upper deeper than the
// cabinets beside it gets a panel on the strip that sticks out; a floating shelf between two uppers leaves the sides above
// and below it showing, so each upper gets a panel notched around the shelf. Set to Never, nothing.
// 0.61.3: when this end's panel is a piece of its own in the room (panelItemSync), the piece is what is drawn (drawnPanels),
// but for everything else (cut list, CNC, price, molding returns, tops) the cabinet still has its panel, worked out with
// the automatic pieces left out of the room, so nothing changes but the drawing.
// Runs fn in the current room with its automatic end panel pieces left out.
function withoutPieces(fn) {
  const r = typeof curRoom === 'function' && curRoom(); if (!r || !r.cabinets.some(x => x.autoOf)) return fn();
  const all = r.cabinets; r.cabinets = all.filter(x => !x.autoOf);
  try { return withRoom(r, fn); } finally { r.cabinets = all; }
}
let panelDrawing = 0;
function drawnPanels(fn) { panelDrawing++; try { return fn(); } finally { panelDrawing--; } }
function panelPieces(c, end) {
  const id = c.pItems && c.pItems[end], k = id && S.cabinets.find(x => x.id === id);
  if (k) {
    if (panelDrawing || k.autoOf !== c.id) return null;
    const r = S.rooms.find(x => x.cabinets.includes(c)); if (!r) return null;
    const all = r.cabinets; r.cabinets = all.filter(x => !x.autoOf);
    try { return withRoom(r, () => panelPieces(c, end)); } finally { r.cabinets = all; }
  }
  const own = panelPiecesOwn(c, end);
  const isl = islandPartner(c, end); if (!isl) return own;
  // 0.61.0 (Ayden 2026-11-23: "the island need end panels that cover all the cabinets even if its double sided"): on an
  // island with cabinets back to back, one end panel runs across both. The taller cabinet carries it (side 1 when they
  // match) out past its back to the other cabinet's front; the other one gets no panel at that end.
  if (!isl.owner) return panelPiecesOwn(isl.k, isl.end) ? null : own;
  if (!own) return own;
  const w = wall(c.wall), ext = -r3((c.outset || 0) + (w ? w.thick : 0) + faceOut(isl.k)), z0 = isl.k.elev - c.elev, z1 = z0 + isl.k.h;
  return own.map(pc => ({ ...pc, steps: pc.steps.map(q => { const mid = (q.z0 + q.z1) / 2; return mid > z0 && mid < z1 ? { ...q, d0: Math.min(q.d0, ext) } : q; }) }));
}
// The cabinet back to back with this one at this end, on the other side of an island line: { k, end (k's end), owner
// (this cabinet carries the shared panel) }, or null.
function islandPartner(c, end) {
  if (c.moz || c.made || !c.wall) return null;
  const w = wall(c.wall); if (!w || !(w.hidden || w.island)) return null;
  const dir = (end === 'L') === (c.side === 1) ? -1 : 1, at = k => dir < 0 ? k.off : k.off + k.w;
  const k = (S.cabinets || []).find(x => x !== c && x.wall === c.wall && x.side === -c.side && !x.moz && !x.made && Math.abs(at(x) - at(c)) <= 1
    && Math.min(x.elev + x.h, c.elev + c.h) - Math.max(x.elev, c.elev) > 1);
  if (!k) return null;
  const tc = c.elev + c.h, tk = k.elev + k.h, owner = Math.abs(tc - tk) > 0.5 ? tc > tk : c.side === 1;
  return { k, end: (dir < 0) === (k.side === 1) ? 'L' : 'R', owner };
}
function panelPiecesOwn(c, end) {
  if (c.moz || c.made) return null;
  const m = panelMode(c, end), full = () => { const z0 = panelZ0(c); return [{ z0, z1: c.h, steps: [{ z0, z1: c.h, d0: 0 }] }]; };
  // Products wrapped in the finish material all round (open shelf units, the open vanity) are their own finished ends.
  if (c.wrap && m !== 'on') return null;
  if (m === 'on') return full();
  if (m === 'off' || !c.wall) return null;
  // A finished exterior (laminate outside) is its own finished end; it gets no applied panel unless one is asked for.
  if (typeof finExterior === 'function' && finExterior(c)) return null;
  const ly = lay(); if (!ly.autoPanels) return null;
  return exposedPieces(c, end);
}
// What of this end shows, whatever covers it (panel, finished end): null when nothing does, else panel pieces.
function exposedPieces(c, end) {
  const full = () => { const z0 = panelZ0(c); return [{ z0, z1: c.h, steps: [{ z0, z1: c.h, d0: 0 }] }]; };
  return inRoomOf(c, () => {
    if (!wall(c.wall)) return null;
    const dir = (end === 'L') === (c.side === 1) ? -1 : 1, n = nearestAt(c, dir);
    if (!n) return full();
    if (n.kind === 'wall' && fillersOf(c).some(f => f.end === end)) return null;
    if (n.gap > Math.max(lay().panelReach, panelThick(c) + 0.01)) return applianceGap(c, dir, n) ? null : full();
    return endExposed(c, end, dir);
  });
}
// 0.58.38: an opening 15" to 36" wide between two base cabinets on the floor is an appliance space (dishwasher, range), even
// when no appliance is drawn in it, as on jobs from Bid Reader. The cabinets beside it get no automatic panel there.
function applianceGap(c, dir, n) {
  if (c.cat !== 'Base' || (c.elev || 0) > 1 || n.kind !== 'cab' || n.gap < 14.5 || n.gap > 36.5) return false;
  const lo = c.off, hi = c.off + c.w;
  return obstacles(c.wall, c.side, c, c.id).some(o => {
    if (o.kind !== 'cab') return false;
    const gap = dir < 0 ? lo - o.a1 : o.a0 - hi; if (Math.abs(gap - n.gap) > 0.01) return false;
    const k = cab(o.id); return !!k && k.cat === 'Base' && (k.elev || 0) <= 1 && !k.moz && !k.made;
  });
}
// The bottom of an end panel, up from the cabinet's bottom: a base stops on its toe kick unless the fit runs to the floor.
function panelZ0(c) { return c.cat === 'Wall' || panelFor(c).toFloor || !hasToe(c) ? 0 : effParams(c).toeKickHeight; }
// How far a cabinet's front sticks out from the wall: box plus its doors (a product with no doors, just its box).
function faceOut(k) {
  let ft = 0;
  if (!k.moz && !k.made) { const fr = computeFronts(k).find(f => f.type !== 'open'); if (fr) ft = (mat(frontStyle(k, fr).ds.mat) || {}).thick || 0.75; }
  return (k.outset || 0) + k.d + ft;
}
// The parts of an end that cabinets butted against it leave showing, as panel pieces (see panelPieces).
// Bands up the end: each one is covered out to the deepest neighbour face in it. Strips under 1/2" deep or 1" tall
// are left, they hide behind the panel's own overhang and the molding.
function endExposed(c, end, dir) {
  const memo = nearSlot(c), mk = ['exp', end, c.wall, c.side, c.off, c.w, c.d, c.h, c.elev, c.outset].join('|');
  if (memo && memo.has(mk)) return memo.get(mk);
  const reach = Math.max(lay().panelReach, panelThick(c) + 0.01), lo = c.off, hi = c.off + c.w, back = c.outset || 0;
  const z0 = panelZ0(c), D = endDepth(c, end), covers = [];
  let wallHit = false;
  obstacles(c.wall, c.side, c, c.id).forEach(o => {
    const gap = dir < 0 ? lo - o.a1 : o.a0 - hi; if (gap < -0.01 || gap > reach) return;
    if (o.kind !== 'cab') { wallHit = true; return; }
    const k = cab(o.id); if (!k) return;
    // A filler beside the end (a Mozaik filler product) is that end's finish: a filler and a panel are never both needed.
    // A fridge panel that wants fillers too is set to Always.
    const kd = k.moz && typeof mozDef === 'function' && mozDef(k.moz);
    if (kd && kd.group === 'filler' && !/ceiling/.test(k.moz)) { wallHit = true; return; }
    covers.push({ z0: Math.max(z0, k.elev - c.elev), z1: Math.min(c.h, k.elev + k.h - c.elev), d: Math.min(D, faceOut(k) - back) });
    // A base's countertop covers the end too, up its thickness and out to its overhang (a tall beside a base run).
    if (k.cat === 'Base' && !k.noTop && curRoom().autoTops !== false && typeof countertop === 'function') {
      const tp = countertop(roomSet('countertop')) || {}, kt = k.elev + k.h - c.elev;
      if (+tp.thick > 0) covers.push({ z0: Math.max(z0, kt), z1: Math.min(c.h, kt + +tp.thick), d: Math.min(D, (k.outset || 0) + k.d + (+tp.frontOverhang || 0) - back) });
    }
  });
  let out = null;
  if (!wallHit) {
    const zs = [...new Set([z0, c.h, ...covers.flatMap(v => [v.z0, v.z1])].filter(z => z >= z0 - 1e-6 && z <= c.h + 1e-6).map(z => Math.round(z * 1000) / 1000))].sort((a, b) => a - b);
    const bands = [];
    for (let i = 0; i + 1 < zs.length; i++) {
      const a = zs[i], b = zs[i + 1], mid = (a + b) / 2; if (b - a < 1e-6) continue;
      const cov = Math.max(0, ...covers.filter(v => v.z0 < mid && v.z1 > mid).map(v => v.d));
      const prev = bands[bands.length - 1];
      if (prev && Math.abs(prev.d0 - cov) < 1e-6 && Math.abs(prev.z1 - a) < 1e-6) prev.z1 = b; else bands.push({ z0: a, z1: b, d0: Math.round(cov * 1000) / 1000 });
    }
    // A band that is too thin or too shallow to see counts as covered, and splits the end into separate pieces.
    const pieces = [];
    let cur = null;
    bands.forEach(bd => {
      const show = D - bd.d0 > 0.5 && bd.z1 - bd.z0 >= 1;
      if (!show) { cur = null; return; }
      if (!cur) pieces.push(cur = { z0: bd.z0, z1: bd.z1, steps: [] });
      cur.z1 = bd.z1; cur.steps.push(bd);
    });
    out = pieces.length ? pieces : null;
  }
  if (memo) memo.set(mk, out);
  return out;
}
// Is this end of the cabinet a finished (exposed) end? Set by hand per end, else: no neighbor, wall or applied panel covers it.
function endFinished(c, end) {
  const o = end === 'L' ? c.endL : c.endR;
  if (o === 'fin') return true; if (o === 'unfin') return false;
  if (!c.wall || hasPanel(c, end)) return false;
  // Covered by the island panel the cabinet back to back with it carries.
  const isl = islandPartner(c, end); if (isl && !isl.owner && panelPiecesOwn(isl.k, isl.end)) return false;
  // 0.58.39: any part of the end that shows makes it a finished end (a deeper upper's strip past its neighbour, the side
  // above and below a floating shelf), the same test the automatic panels use. Before, only an end with nothing near it.
  return !!exposedPieces(c, end);
}
// Moves cabinets that end at a wall so the gap matches the filler setting. from and to are layout settings.
function refitFillers(from, to) {
  let moved = 0;
  S.rooms.forEach(r => withRoom(r, () => {
    S.cabinets.forEach(c => {
      if (!wall(c.wall)) return;
      [-1, 1].forEach(dir => {
        // 0.63.20: only ends that take an automatic filler move. Fillers and panels placed as products, ends set to Never
        // or Always, and a Mozaik job's own fillers stay where they are (they were sliding 1 1/2" each time).
        const end = (dir < 0) === (c.side === 1) ? 'L' : 'R'; if (c.made || c.moz || (c['fill' + end] || '') !== '') return;
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
  // 0.63.1: while drawing, the chain's own corners are its drawn (inside face) points, not its centerline ends.
  const ch = ui.drawing && ui.drawing.chain, own = ch ? ch.ids : [];
  S.walls.forEach(w => { if (!own.includes(w.id)) [[w.x1, w.y1], [w.x2, w.y2]].forEach(([x, y]) => { if (!skip || !samePt(x, y, skip)) pts.push({ x, y }); }); });
  if (ch) ch.pts.forEach(q => { if (!samePt(q.x, q.y, ui.drawing)) pts.push({ x: q.x, y: q.y }); });
  else if (ui.drawing && ui.drawing.first && !samePt(ui.drawing.first.x, ui.drawing.first.y, ui.drawing)) pts.push(ui.drawing.first);
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
// The inside wall faces on one side of a wall, for placing things by "from the left wall" before a cabinet exists.
// 0 from the left is the inside face of the wall at that end; the wall's thickness is behind it, never in front.
const wallFaces = (wallId, side) => wall(wallId) ? runLimits({ id: null, wall: wallId, side, off: 0, w: 0, d: 1, h: 1, elev: 0, outset: 0 }) : { lo: 0, hi: 0 };
// Saved jobs from before 0.57.3: a row of bid-placed items (same wall, side and height) whose first one starts inside the
// left wall moves right together, so the first one sits at 0 and the 2" gaps stay. Rows that start at or past 0 stay put.
function bidFaceFix(st) {
  st.rooms.forEach(rm => withRoom(rm, () => {
    const rows = {};
    (rm.cabinets || []).forEach(c => { if (c.fromBid && c.wall && wall(c.wall)) (rows[[c.wall, c.side, r3(c.elev || 0)].join('|')] ||= []).push(c); });
    Object.values(rows).forEach(cs => {
      const d = -Math.min(...cs.map(c => fromEnd(c, 'L'))); if (!(d > 0.01)) return;
      cs.forEach(c => { c.off = r3(c.off + (c.side === -1 ? -d : d)); });
    });
  }));
}
// The along-the-wall offset for something w wide that sits x from the viewer's left wall face.
// 0.63.1: a wall's length on the room side, face to face between the walls at its ends (its centerline length when nothing meets it).
function insideLen(w) { const L = wg(w).L; if (w.hidden) return L; const f = typeof wdRaw === 'function' ? wdRaw(() => wallFaces(w.id, elevSide(w))) : wallFaces(w.id, elevSide(w)); return r3(f.hi > f.lo ? f.hi - f.lo : L); }
function offFromLeft(wallId, side, x, w) { const { lo, hi } = wallFaces(wallId, side); return r3(side === -1 ? hi - x - w : lo + x); }
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
