/* ---------- Copy and paste ---------- */
// Ctrl+C copies the selected cabinet or shape, Ctrl+X cuts it, Ctrl+V pastes it (at the pointer in the plan,
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
  for (const w of [wall(ui.elevWall), ...S.walls].filter(Boolean)) { const g = free(w.id, 1, 0) || free(w.id, -1, 0); if (g) return g; }
  return null;
}
function pasteCab(src, at) {
  const free = (wid, side, want) => { const off = findFree(src, wid, side, want, null); return off === null ? null : { wall: wid, side, off: r3(off) }; };
  const g = pasteSpot(src, src.w, at, free);
  if (!g) { flash('There is no room for the copy there.'); return; }
  let nc; mutate(() => { nc = { ...clone(src), id: uid('c'), num: null, ...g }; S.cabinets.push(nc); ensureNums(); addCabStrips(nc.id, (clip && clip.lights) || []); });
  ui.sel = { type: 'cab', id: nc.id }; ui.elevWall = g.wall; renderRoom();
}
function pasteShape(src, at) {
  const W = shapeBox(src.pts).w;
  const free = (wid, side, want) => { const L = wg(wall(wid)).L; return { wall: wid, side, off: r3(Math.max(0, Math.min(Math.max(0, L - W), want))) }; };
  const g = pasteSpot(src, W, at, free);
  let ns; mutate(() => { ns = { ...clone(src), id: uid('s'), ...g }; S.shapes.push(ns); });
  ui.sel = { type: 'shape', id: ns.id }; ui.elevWall = g.wall; renderRoom();
}
// The plan point under the pointer, when the pointer is over the plan.
let clipOverPlan = false;
document.addEventListener('pointermove', e => { clipOverPlan = !!(e.target.closest && e.target.closest('#plan')); }, true);
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || jobs.shown || ui.tab !== 'room' || ui.quick) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || String(getSelection() || '')) return;
  const k = e.key.toLowerCase();
  if (k === 'c' || k === 'x') { if (clipCopy(k === 'x')) e.preventDefault(); }
  else if (k === 'v') { e.preventDefault(); clipPaste(ui.viewMode === 'plan' && clipOverPlan && ui.mouse ? { p: ui.mouse } : null); }
  else if (k === 'd' && ui.sel && (ui.sel.type === 'cab' || ui.sel.type === 'shape')) { e.preventDefault(); const keep = clip; clip = { type: ui.sel.type, data: clone(ui.sel.type === 'cab' ? cab(ui.sel.id) : shapeById(ui.sel.id)) }; clipPaste(null); clip = keep; }
});
