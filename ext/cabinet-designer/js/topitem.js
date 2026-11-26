// 0.63.80 (Ayden 2026-11-25: "cant adjust tops at all, i want to be able to move them around and actually set their
// positions and move them not just the generated ones, i cant even adjust the overhangs on the placed ones"):
// a countertop is an item you pick like a cabinet. Pick it in the plan (click it where no cabinet is under it, or click
// the cabinet's Top button, or click the top again once it is picked), in the elevation or in 3D, or from Select item.
// The bottom item bar then shows its place on the wall (From left wall, From right wall, a slider), its sizes, and its
// Left, Right and Front overhangs past the cabinets under it. Drag it in the plan or elevation to move it.
// A top placed by hand keeps its own spot and size (S.genTops: off, len, depth, z, thick, out); its overhangs are worked
// out from the cabinets under it, and setting one moves that edge of the top. An automatic top keeps its overhangs on
// S.ctRuns[key] (ovS, ovE, ovF), so moving it slides both end overhangs together. Never refused: a top moved into
// something shows there.
'use strict';

const topSelKey = () => ui.sel && ui.sel.type === 'top' ? ui.sel.id : '';
const topRunByKey = key => countertopRuns().find(r => r.key === key) || null;
const topGen = r => r && r.generic ? (S.genTops || []).find(g => g.id === r.generic) || null : null;
// The end on the left and the right as you face the wall.
const topEndL = r => r.side === 1 ? 'S' : 'E';
const topEndR = r => r.side === 1 ? 'E' : 'S';

// The cabinets a top sits on: same wall and side, their top at the top's underside, in a row touching each other (a
// run, like an automatic top's), any run the top overlaps. Overhangs are measured past the ends of that run, so moving
// an end over the next cabinet in the row doesn't change what the overhang is measured from.
// { lo, hi, d } (the run's ends along the wall and its depth with outset), or null.
function topUnder(r) {
  const cs = S.cabinets.filter(c => c.wall === r.wall && c.side === r.side && c.cat !== 'Wall' && !c.autoOf
    && Math.abs(((typeof apronTop === 'function' && apronTop(c)) || (c.elev || 0) + c.h) - r.top) < 1.01).sort((a, b) => a.off - b.off);
  const dOf = c => (typeof angledCorner === 'function' && angledCorner(c) ? cornerLeg(c) : c.d) + (c.outset || 0);
  const groups = []; let g = null;
  cs.forEach(c => { if (g && c.off <= g.hi + 0.25) { g.hi = Math.max(g.hi, c.off + c.w); g.d = Math.max(g.d, dOf(c)); g.n++; } else groups.push(g = { lo: c.off, hi: c.off + c.w, d: dOf(c), n: 1 }); });
  const on = groups.filter(q => q.lo < r.end - 0.01 && q.hi > r.start + 0.01); if (!on.length) return null;
  return { lo: Math.min(...on.map(q => q.lo)), hi: Math.max(...on.map(q => q.hi)), d: Math.max(...on.map(q => q.d)), n: on.reduce((a, q) => a + q.n, 0) };
}
// A top's overhang at an end ('S'|'E') or the front ('F'): null when a placed top has no cabinet under it.
function topOv(r, k) {
  if (!r.generic) return k === 'F' ? r.ovF : r['ov' + k] || 0;
  const u = topUnder(r); if (!u) return null;
  return r3(k === 'F' ? (r.back || 0) + r.depth - u.d : k === 'S' ? u.lo - r.start : r.end - u.hi);
}
// Distance from the inside face of the wall on the left (or right) to the top's end, as you face the wall.
function topFrom(r, end) {
  const { lo, hi } = wallFaces(r.wall, r.side), x0 = ctX0(r), x1 = ctX1(r);
  return r3((r.side === 1) === (end === 'L') ? x0 - lo : hi - x1);
}
// Slides a top da along its wall (+ toward the wall's end). No mutate: callers wrap it.
function topShift(r, da) {
  const g = topGen(r);
  if (g) { g.off = r3((+g.off || 0) + da); return; }
  const o = S.ctRuns[r.key] = S.ctRuns[r.key] || {};
  o.ovS = r3((r.ovS || 0) - da); o.ovE = r3((r.ovE || 0) + da);
}
// The boxes on the item bar read and write through this (forms.js 'tsel:<key>').
function topSelRef(key) {
  const run = () => topRunByKey(key);
  const along = (r, end, v) => { const d = v - topFrom(r, end); return (r.side === 1) === (end === 'L') ? d : -d; };
  return {
    get L() { const r = run(); return r ? topFrom(r, 'L') : 0; },
    set L(v) { const r = run(); if (r && isFinite(v)) topShift(r, along(r, 'L', v)); },
    get R() { const r = run(); return r ? topFrom(r, 'R') : 0; },
    set R(v) { const r = run(); if (r && isFinite(v)) topShift(r, along(r, 'R', v)); },
    set len(v) {
      const r = run(); if (!r || !(v > 0)) return; const g = topGen(r), dl = v - r.len;
      // A placed top grows to the right as you face the wall (its left end stays).
      if (g) { g.len = r3(Math.max(0.25, (+g.len || 0) + dl)); if (r.side !== 1) g.off = r3((+g.off || 0) - dl); return; }
      const j = r.joints || {}, open = e => !j[e] && !r['block' + e], e = open(topEndR(r)) ? topEndR(r) : open(topEndL(r)) ? topEndL(r) : topEndR(r);
      const o = S.ctRuns[r.key] = S.ctRuns[r.key] || {}; o['ov' + e] = Math.max(-(r.end - r.start) + 1, r3((r['ov' + e] || 0) + dl));
    },
    set depth(v) {
      const r = run(); if (!r || !(v > 0)) return; const g = topGen(r);
      if (g) { g.depth = r3(Math.max(1, (+g.depth || 0) + v - r.depth)); return; }
      const o = S.ctRuns[r.key] = S.ctRuns[r.key] || {}; o.ovF = r3(Math.max(-r.d + 1, r.ovF + v - r.depth));
    },
    set z(v) { const g = topGen(run()); if (g && isFinite(v)) g.z = r3(Math.max(0, v)); },
    set thick(v) { const g = topGen(run()); if (g && v > 0) g.thick = r3(v); },
    set out(v) { const g = topGen(run()); if (g && isFinite(v)) { if (v > 0) g.out = r3(v); else delete g.out; } },
    set ovL(v) { topSetOv(run(), topEndL(run() || { side: 1 }), v); },
    set ovR(v) { topSetOv(run(), topEndR(run() || { side: 1 }), v); },
    set ovF(v) { topSetOv(run(), 'F', v); },
    set top(v) { const r = run(); if (!r) return; const st = topGen(r) || (S.ctRuns[r.key] = S.ctRuns[r.key] || {}); if (v) st.top = v; else delete st.top; },
    set bs(v) { const r = run(); if (!r || !isFinite(v)) return; const st = topGen(r) || (S.ctRuns[r.key] = S.ctRuns[r.key] || {}); st.bs = Math.max(0, r3(v)); },
  };
}
// Sets an overhang. Auto top: kept as that overhang. Placed top: moves that edge so it hangs v past the cabinets.
function topSetOv(r, k, v) {
  if (!r || !isFinite(v)) return;
  const g = topGen(r);
  if (!g) { const o = S.ctRuns[r.key] = S.ctRuns[r.key] || {}; o['ov' + k] = k === 'F' ? Math.max(-r.d + 1, r3(v)) : Math.max(-(r.end - r.start) + 1, r3(v)); return; }
  const u = topUnder(r); if (!u) { flash('No cabinet is under this top, so it has no overhang. Set its Length, Depth or position instead.'); return; }
  if (k === 'F') { g.depth = r3(Math.max(1, u.d + v - (+g.out || 0))); return; }
  const s = +g.off || 0, e = s + (+g.len || 0);
  if (k === 'S') { const ns = Math.min(e - 0.25, u.lo - v); g.off = r3(ns); g.len = r3(e - ns); }
  else g.len = r3(Math.max(0.25, u.hi + v - s));
}

// The item bar for a picked top (in place of a cabinet's).
function topItemBar(r) {
  const key = r.key, R = 'tsel:' + key, g = topGen(r), i = countertopRuns().findIndex(q => q.key === key);
  const box = (label, f, val, t) => `<label class="ib-f"${t ? ` title="${esc(t)}"` : ''}><span>${label}</span>${ctl(R, f, r3(val), 'len', { label })}</label>`;
  const off = (label, t) => `<label class="ib-f" title="${esc(t)}"><span>${label}</span><input type="text" disabled value="—" aria-label="${label}"></label>`;
  const ov = (label, f, k) => { const v = topOv(r, k); return v === null ? off(label, 'No cabinet is under this top, so it has no overhang') : box(label, f, v, `How far the top hangs past the cabinets under it`); };
  const { lo, hi } = wallFaces(r.wall, r.side), span = Math.max(0, r3(hi - lo - (ctX1(r) - ctX0(r))));
  const name = g ? g.name || 'Top' : `Top ${i + 1}`;
  const sb = (act, ic, l, t, cls = '') => `<button class="${cls}" data-act="${act}" data-id="${esc(key)}" title="${t}">${icon(ic)}${l}</button>`;
  return `<div class="itembar xbar topbar">
    <div class="ib-pos">${box('From left wall', 'L', topFrom(r, 'L'))}<span class="ib-ctrs"><button class="ib-ctr" data-act="tsel-center" data-id="${esc(key)}" title="Center it on the cabinets under it (or the wall)" aria-label="Center it"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 3v14M18 3v14M5 10h10m-7-3-3 3 3 3m4-6 3 3-3 3"/></svg></button></span>${box('From right wall', 'R', topFrom(r, 'R'))}
      <div class="ib-slidewrap"><input type="range" class="ib-slide" data-tslide="${esc(key)}" min="0" max="${span}" step="0.125" value="${Math.max(0, Math.min(span, topFrom(r, 'L')))}" aria-label="Slide the top along the wall" title="Slide it along the wall"></div></div>
    <div class="ib-size">${box('Length', 'len', r.len)}${box('Depth', 'depth', r.depth)}${g ? box('Bottom height', 'z', r.top) + box('Thickness', 'thick', r.thick) : ''}
      ${ov('Left overhang', 'ovL', topEndL(r))}${ov('Right overhang', 'ovR', topEndR(r))}${ov('Front overhang', 'ovF', 'F')}${g ? box('Off the wall', 'out', Math.max(0, r.back || 0), 'Gap between the wall and the back of the top') : ''}
      <label class="ib-f ib-wide"><span>Style</span>${ctl(R, 'top', r.tpl.id, 'select', { options: opts(S.countertops), label: 'Countertop style' })}</label>${box('Backsplash', 'bs', r.bs, 'Backsplash height (0 for none)')}</div>
    <div class="ib-acts"><div class="ib-name"><span class="chip shape">${g ? 'Placed top' : 'Auto top'}</span> <b>${esc(name)}</b> · ${esc(wallName(wall(r.wall)))}</div>
      <div class="ib-small">${sb('tsel-sides', 'edit', 'Sides…', 'Backsplash, side splashes, waterfalls and corner joints for each side')}${g ? sb('tsel-dup', 'copy', 'Copy', 'Duplicate this top') + sb('tsel-del', 'trash', 'Delete', 'Delete this top') : sb('tsel-reset', 'undo', 'Normal', 'Put its overhangs back to the style\'s') + sb('tsel-off', 'trash', 'Leave off', 'Leave this top off (turn it back on in the Tops tab)')}</div></div>
  </div>`;
}

// Picks a top (and its wall for the elevation).
function topSelect(key) {
  const r = topRunByKey(key); if (!r) return false;
  ui.elevWall = r.wall; ui.topRun = key; select({ type: 'top', id: key }); return true;
}
// Plan press: a top is picked where no cabinet is under the point, or when it is already the picked one (so it can be
// dragged). Returns true when it took the press.
function topPlanDown(p, hits) {
  const hit = ctjSideAt(p, 3 * ui.px); if (!hit) return false;
  const was = topSelKey() === hit.r.key;
  if (hits.length && !was) return false;
  if (!was && !(topOp() > 0)) return false;
  if (!was) topSelect(hit.r.key);
  ui.drag = ctjDragStart(p, 3 * ui.px);
  if (ui.drag && ui.drag.key !== hit.r.key) ui.drag = null;
  return true;
}
function topSelAct(a, id) {
  const r = topRunByKey(id);
  switch (a) {
    case 'tsel-pick': if (!topSelect(id)) flash('That top is gone.'); return true;
    case 'tsel-sides': { if (!r) return true; const b = document.querySelector(`[data-act="tsel-sides"]`), rc = b ? b.getBoundingClientRect() : { left: 200, top: 200 }; ctjEdgeCtx(id + '|front', rc.left, rc.top - 10); return true; }
    case 'tsel-center': {
      if (!r) return true; const u = topUnder(r), { lo, hi } = wallFaces(r.wall, r.side), x0 = ctX0(r), x1 = ctX1(r);
      const mid = u ? (u.lo + u.hi) / 2 : (lo + hi) / 2;
      mutate(() => topShift(r, r3(mid - (x0 + x1) / 2))); return true;
    }
    case 'tsel-dup': {
      const g = topGen(r); if (!g) return true; let ng;
      mutate(() => { ng = { ...clone(g), id: uid('gt'), name: (g.name || 'Top') + ' copy', off: r3((+g.off || 0) + (+g.len || 0)) }; S.genTops.push(ng); });
      topSelect('gen:' + ng.id); flash('Copied. The copy sits next to it; move it where it goes.'); return true;
    }
    case 'tsel-del': { const g = topGen(r); if (!g) return true; ui.sel = null; ui.topRun = ''; mutate(() => { S.genTops = S.genTops.filter(x => x.id !== g.id); }); render(); return true; }
    case 'tsel-off': if (!r) return true; ui.sel = null; ui.topRun = ''; mutate(() => { (S.ctRuns[id] = S.ctRuns[id] || {}).off = true; }); render(); flash('Top left off. Turn it back on in the Tops tab (Leave off).'); return true;
    case 'tsel-reset': if (!r) return true; mutate(() => { const o = S.ctRuns[id] || {}; delete o.ovS; delete o.ovE; delete o.ovF; }); return true;
  }
  return false;
}
// The cabinet item bar's Top button: the top over this cabinet.
function topOverCab(c) {
  if (!c || c.cat === 'Wall') return null;
  const runs = countertopRuns().filter(r => r.on);
  return runs.find(r => !r.generic && r.cabs.includes(c.id)) || runs.find(r => r.generic && r.wall === c.wall && r.side === c.side && c.off < r.end && c.off + c.w > r.start && Math.abs((c.elev || 0) + c.h - r.top) < 1.01) || null;
}
const topBtn = c => { const r = topOverCab(c); return r ? `<button data-act="tsel-pick" data-id="${esc(r.key)}" title="Pick the countertop on it to move it or set its overhangs">${icon('stack')}Top</button>` : ''; };

// Sliding a top: it follows live, and one undo step is saved when it is let go.
let topSlideWas = null;
document.addEventListener('input', e => {
  const el = e.target; if (!el.matches || !el.matches('.ib-slide[data-tslide]')) return;
  const key = el.dataset.tslide;
  if (!topSlideWas || topSlideWas.key !== key) topSlideWas = { key, snap: JSON.stringify(S) };
  const r = topRunByKey(key); if (!r) return;
  topSelRef(key).L = +el.value;
  if (ui.viewMode === 'plan') renderPlan(); else if (ui.viewMode === 'elev') renderElev();
});
document.addEventListener('change', e => {
  const el = e.target; if (!el.matches || !el.matches('.ib-slide[data-tslide]')) return;
  const w = topSlideWas; topSlideWas = null; if (!w) return;
  undoStack.push(w.snap); redoStack = []; save(); render();
});

// Elevation: press on a top to pick it; drag to slide it along the wall (and, for a placed top, up or down).
let topElevDrag = null;
document.addEventListener('pointerdown', e => {
  if (e.button !== 0 || ui.placing || ui.printing) return;
  const el = e.target.closest && e.target.closest('#elev [data-cttop]'); if (!el) return;
  const ctm = el.getScreenCTM(); if (!ctm) return;
  const key = el.dataset.cttop, r = topRunByKey(key); if (!r) return;
  e.stopPropagation(); e.preventDefault();
  topSelect(key);
  const g = topGen(r);
  topElevDrag = { key, x: e.clientX, y: e.clientY, ctm, live: false, snap: JSON.stringify(S), off: g ? +g.off || 0 : 0, z: g ? +g.z || 0 : 0, ovS: r.ovS || 0, ovE: r.ovE || 0, gen: !!g, side: r.side };
}, true);
document.addEventListener('pointermove', e => {
  const d = topElevDrag; if (!d) return;
  if (!d.live && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
  d.live = true; ui.suppressClick = true;
  const inv = d.ctm.inverse(), a = new DOMPoint(d.x, d.y).matrixTransform(inv), b = new DOMPoint(e.clientX, e.clientY).matrixTransform(inv);
  const st = e.shiftKey ? 16 : 8, dx = Math.round((b.x - a.x) * st) / st, dz = Math.round(-(b.y - a.y) * st) / st, da = d.side === 1 ? dx : -dx;
  const r = topRunByKey(d.key); if (!r) return;
  if (d.gen) { const g = topGen(r); g.off = r3(d.off + da); if (Math.abs(dz) >= 0.5) g.z = r3(Math.max(0, d.z + dz)); else g.z = d.z; }
  else { const o = S.ctRuns[d.key] = S.ctRuns[d.key] || {}; o.ovS = r3(d.ovS - da); o.ovE = r3(d.ovE + da); }
  renderElev(); if (typeof renderDock === 'function') renderDock();
});
document.addEventListener('pointerup', () => {
  const d = topElevDrag; topElevDrag = null; if (!d) return;
  if (d.live) { undoStack.push(d.snap); redoStack = []; save(); render(); setTimeout(() => { ui.suppressClick = false; }, 0); }
});
