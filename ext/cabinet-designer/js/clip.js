/* ---------- Copy and paste ---------- */
// Ctrl+C copies the selected cabinet or shape, Ctrl+X cuts it, Ctrl+V pastes it (at the pointer in the plan or elevation,
// next to the original, or on the first wall with room in another room), Ctrl+D duplicates it.
let clip = null;
const clipName = () => !clip ? '' : clip.type === 'cab' ? 'the cabinet' : clip.type === 'cabs' ? `the ${clip.items.length} cabinets` : 'the shape';
function clipCopy(cut) {
  if (typeof qCopyMany === 'function' && qCopyMany(cut)) return true;
  const s = ui.sel; if (!s) return false;
  const o = s.type === 'cab' ? cab(s.id) : s.type === 'shape' ? shapeById(s.id) : null;
  if (!o) { if (s.type === 'wall') flash('Walls cannot be copied. Pick a cabinet or a shape.'); return false; }
  clip = { type: s.type, data: clone(o), room: S.roomId, lights: s.type === 'cab' ? cabStrips(o.id) : [] };
  if (cut) { ui.sel = null; mutate(() => { if (s.type === 'cab') S.cabinets = S.cabinets.filter(c => c.id !== s.id); else S.shapes = S.shapes.filter(x => x.id !== s.id); }); }
  flash(`${cut ? 'Cut' : 'Copied'} ${s.type === 'cab' ? (LBL[o.id] || o.name) : o.name}. Ctrl+V pastes it.`);
  return true;
}
// Where a pasted item goes: { p } a plan point, { wid, a, side } a spot on a wall, or nothing for next to the original.
function clipPaste(at) {
  if (!clip) { flash('Nothing copied yet. Select a cabinet or shape and press Ctrl+C.'); return; }
  if (!S.walls.length) { flash('Draw a wall first.'); return; }
  if (clip.type === 'cabs') return qPasteMany(at);
  return clip.type === 'cab' ? pasteCab(clip.data, at) : pasteShape(clip.data, at);
}
function pasteSpot(o, W, at, free) {
  if (at && at.p) {
    let best = null; S.walls.forEach(w => { const r = segDist(at.p, w); if (r.d < 80 && (!best || r.d < best.r.d)) best = { w, r }; });
    if (best) return free(best.w.id, best.r.side, best.r.t - W / 2);
  }
  if (at && at.wid) return free(at.wid, at.side, at.a - W / 2);
  // Next to the original when it is in this room, else the selected wall or the first wall with room.
  if (wall(o.wall)) { const g = free(o.wall, o.side, o.off + W); if (g) return g; }
  // The room side of a wall first, so a copy never lands on the back of a perimeter wall while there is room inside.
  for (const w of [wall(ui.elevWall), ...S.walls].filter(Boolean)) { const g = free(w.id, elevSide(w), 0); if (g) return g; }
  for (const w of [wall(ui.elevWall), ...S.walls].filter(Boolean)) { const g = free(w.id, -elevSide(w), 0); if (g) return g; }
  return null;
}
function pasteCab(src, at) {
  // 0.63.83: pasting at the pointer (plan or elevation) only goes into the open spot under it.
  const ex = pasteAtWall(at);
  let g;
  if (ex) { g = pasteGapFit(src, ex); if (!g) { flash(pasteNoFit(src, ex)); return; } }
  else g = pasteSpot(src, src.w, at, (wid, side, want) => pasteFit(src, wid, side, want));
  if (!g) { flash('There is no room for the copy there.'); return; }
  let nc; mutate(() => { nc = { ...clone(src), id: uid('c'), num: null, ...g }; S.cabinets.push(nc); ensureNums(); addCabStrips(nc.id, (clip && clip.lights) || []); });
  ui.sel = { type: 'cab', id: nc.id }; ui.elevWall = g.wall; renderRoom();
}
/* 0.63.83 (Ayden 2026-11-26): "paste where the cursor is so it can fit into spots, make size matter so it can only
   copy paste where its size can fit". A paste at the pointer goes into the open stretch of wall under the pointer
   (between cabinets, walls, doors and windows at the copy's height), lands as close to the pointer as it can there
   and butts up to a neighbour inside the snap reach. When the copy is wider than that spot, nothing is pasted and it
   says how wide the spot is. In the elevation the pointer height picks which normal height an upper settles at. */
function pasteAtWall(at) {
  if (!at) return null;
  if (at.wid && wall(at.wid)) return { wid: at.wid, side: at.side, t: +at.a, y: isFinite(at.y) ? +at.y : NaN };
  if (!at.p) return null;
  let best = null; S.walls.forEach(w => { const r = segDist(at.p, w); if (r.d < 80 && (!best || r.d < best.r.d)) best = { w, r }; });
  return best ? { wid: best.w.id, side: best.r.side, t: best.r.t, y: NaN } : null;
}
// The open offsets for c on that wall side, as [lo, hi] stretches of where its left end may go.
function pasteFreeOffs(c, wid, side) {
  const L = wg(wall(wid)).L, e = 0.005; let iv = L - c.w >= -e ? [[0, Math.max(0, L - c.w)]] : [];
  blockedOffs(c, wid, side, null).forEach(([x0, x1]) => {
    iv = iv.flatMap(([a, b]) => x1 <= a + e || x0 >= b - e ? [[a, b]] : [[a, Math.min(b, x0)], [Math.max(a, x1), b]].filter(([p, q]) => q >= p - e));
  });
  return iv;
}
// The spot in the open stretch under pointer spot t, or null when the copy is too big for it.
function pasteGapOff(c, wid, side, t) {
  const e = 0.005, g = pasteFreeOffs(c, wid, side).find(([a, b]) => t >= a - e && t <= b + c.w + e);
  if (!g) return null;
  const clamp = v => Math.max(g[0], Math.min(g[1], v)), want = clamp(t - c.w / 2);
  let off = clamp(snapOff(c, wid, side, want, null, 0));
  const reach = lay().snapReach; if (off - g[0] < reach) off = g[0]; else if (g[1] - off < reach) off = g[1];
  return r3(off);
}
function pasteGapFit(src, ex) {
  const h = +src.h || 0, y = ex.y, vd = e => !isFinite(y) ? 0 : y < e ? e - y : y > e + h ? y - e - h : 0;
  const els = pasteElevs(src, ex.wid, ex.side, ex.t - src.w / 2).map((e, i) => ({ e, i }));
  els.sort((a, b) => vd(a.e) - vd(b.e) || a.i - b.i);
  for (const { e } of els) { const off = pasteGapOff({ ...src, elev: e }, ex.wid, ex.side, ex.t); if (off !== null) return { wall: ex.wid, side: ex.side, off, elev: e }; }
  return null;
}
// Why it did not go in: the pointer is on something, or the open spot there is narrower than the copy.
function pasteNoFit(src, ex) {
  const el = pasteElevs(src, ex.wid, ex.side, ex.t - src.w / 2)[0], spec = { ...src, elev: el };
  const L = wg(wall(ex.wid)).L, ly = lay(), obs = obstacles(ex.wid, ex.side, spec, null), t = ex.t;
  const name = LBL[src.id] || src.name || 'the cabinet';
  if (obs.some(o => t > o.a0 + 0.01 && t < o.a1 - 0.01)) return `That spot is taken. Point at open wall to paste ${name}.`;
  const pad = o => o.kind === 'wall' && ly.autoFillers ? ly.fillerW : 0;
  const lo = obs.filter(o => o.a1 <= t + 0.01).reduce((m, o) => Math.max(m, o.a1 + pad(o)), 0);
  const hi = obs.filter(o => o.a0 >= t - 0.01).reduce((m, o) => Math.min(m, o.a0 - pad(o)), L);
  return `${name} is ${fmtLen(src.w, 1)} wide and the open spot there is only ${fmtLen(Math.max(0, hi - lo), 1)}. Nothing was pasted.`;
}
/* 0.59.29 (Ayden 2026-11-20): a pasted cabinet goes where it fits and settles at its normal height, not the
   copy's odd one; he moves it up or down himself after. Bases and talls go to the floor (their library height),
   uppers line their top up with the nearest upper on that wall (else the library height), and an upper with no
   room there goes up to the ceiling line or back down to the standard height, whichever lands nearest. */
const PASTE_SETTLE = { Base: 1, Wall: 1, Tall: 1 };
function pasteElevs(src, wid, side, want) {
  const cur = +src.elev || 0;
  if (!PASTE_SETTLE[src.cat] || (typeof isFloatShelf === 'function' && isFloatShelf(src))) return [cur];
  const l = src.libId ? libItem(src.libId) : null, libE = l && l.cat === src.cat && isFinite(+l.elev) ? +l.elev : null;
  if (src.cat !== 'Wall') return [libE !== null ? libE : 0];
  const h = +src.h || 0, probe = { ...src, wall: wid, side, off: want }, max = ceilMax(probe), top = isFinite(max) ? max : Infinity;
  const fit = e => r3(Math.max(0, Math.min(e, top - h)));
  // The nearest upper on this wall side: its top is the line the copy hangs from.
  let near = null, nd = Infinity;
  S.cabinets.forEach(k => {
    if (k.wall !== wid || k.side !== side || k.cat !== 'Wall' || (typeof isFloatShelf === 'function' && isFloatShelf(k))) return;
    const d = Math.max(0, k.off - (want + src.w), want - (k.off + k.w)); if (d < nd) { nd = d; near = k; }
  });
  const out = [];
  if (near) out.push(fit(near.elev + near.h - h));
  out.push(fit(libE !== null ? libE : cur));
  if (isFinite(top)) out.push(fit(top - h));
  return out.filter((e, i) => out.findIndex(x => Math.abs(x - e) < 0.01) === i);
}
// The spot nearest want along the wall at one of those heights. The first height is the normal one; another
// only wins when it lands more than a foot closer.
function pasteFit(src, wid, side, want) {
  let best = null;
  pasteElevs(src, wid, side, want).forEach((e, i) => {
    const off = findFree({ ...src, elev: e }, wid, side, want, null); if (off === null) return;
    const s = Math.abs(off - want) + (i ? 12 : 0); if (!best || s < best.s - 1e-9) best = { s, off, e };
  });
  return best && { wall: wid, side, off: r3(best.off), elev: best.e };
}
function pasteShape(src, at) {
  const W = shapeBox(src.pts).w;
  const free = (wid, side, want) => { const L = wg(wall(wid)).L; return { wall: wid, side, off: r3(Math.max(0, Math.min(Math.max(0, L - W), want))) }; };
  const g = pasteSpot(src, W, at, free);
  let ns; mutate(() => { ns = { ...clone(src), id: uid('s'), ...g }; S.shapes.push(ns); });
  ui.sel = { type: 'shape', id: ns.id }; ui.elevWall = g.wall; renderRoom();
}
// The plan point under the pointer, when the pointer is over the plan.
let clipOverPlan = false, clipOverElev = null;
document.addEventListener('pointermove', e => { clipOverPlan = !!(e.target.closest && e.target.closest('#plan')); clipOverElev = e.target.closest && e.target.closest('#elev') ? { clientX: e.clientX, clientY: e.clientY } : null; }, true);
// Ctrl+V over the elevation pastes at the pointer along that wall.
function clipElevAt() { const wa = clipOverElev && typeof wallAt === 'function' ? wallAt(clipOverElev) : null, w = wa && wall(wa.wid); if (!w) return null; const q = typeof elevPoint === 'function' ? elevPoint(clipOverElev) : null; return { wid: w.id, a: wa.a, side: elevSide(w), y: q ? -q.y : NaN }; }
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || jobs.shown || ui.tab !== 'room' || ui.quick) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || String(getSelection() || '')) return;
  const k = e.key.toLowerCase();
  if (k === 'c' || k === 'x') { if (clipCopy(k === 'x')) e.preventDefault(); }
  else if (k === 'v') { e.preventDefault(); clipPaste(ui.viewMode === 'plan' && clipOverPlan && ui.mouse ? { p: ui.mouse } : clipElevAt()); }
  else if (k === 'd' && ui.sel && (ui.sel.type === 'cab' || ui.sel.type === 'shape')) { e.preventDefault(); const keep = clip; clip = { type: ui.sel.type, data: clone(ui.sel.type === 'cab' ? cab(ui.sel.id) : shapeById(ui.sel.id)) }; clipPaste(null); clip = keep; }
});
