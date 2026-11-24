// Countertop corners: where two tops on walls that meet come together, they either miter into each other
// or butt, with one top running through to the wall and the other stopping at its front edge.
// Click the joint in the plan to change it. The choice is kept on each run's end (S.ctRuns[key].jS / jE, or on the
// placed top itself): 'm' mitered, 't' this top runs through, 'c' this top stops against the other one.
'use strict';

const ctjDot = (a, b) => a.x * b.x + a.y * b.y;
const ctjCross = (a, b) => a.x * b.y - a.y * b.x;
// Where two lines (point p, direction u) cross.
function ctjMeet(p1, u1, p2, u2) {
  const k = ctjCross(u1, u2); if (Math.abs(k) < 1e-9) return null;
  const t = ctjCross({ x: p2.x - p1.x, y: p2.y - p1.y }, u2) / k;
  return { x: p1.x + u1.x * t, y: p1.y + u1.y * t };
}
// A run's frame: along and out from its wall, and its back and front edge lines.
function ctjFrame(r) {
  const w = wall(r.wall), g = wg(w), f = w.thick / 2 + (r.back || 0), s = r.side; // r.back: 0.63.5, a top in front of a wall's stone
  const at = (a, b) => wallPt(w, g, s, a, b);
  return {
    r, w, g, f, at, u: g.u,
    back: at(0, f), front: at(0, f + r.depth),
    along: q => (q.x - w.x1) * g.u.x + (q.y - w.y1) * g.u.y,
    out: q => ((q.x - w.x1) * g.n.x + (q.y - w.y1) * g.n.y) * s,
    a0: r.start - r.ovS, a1: r.end + r.ovE
  };
}
// The stored setting object for a run (a placed top keeps it on itself).
function ctjStore(r, write) {
  if (r.generic) return (S.genTops || []).find(g => g.id === r.generic) || {};
  if (write) S.ctRuns[r.key] = S.ctRuns[r.key] || {};
  return S.ctRuns[r.key] || {};
}

// Finds the corners between runs and reshapes each top. Sets r.poly (plan points: back start, back end, front end,
// front start), r.x0 / r.x1 (the slab's ends along its wall) and r.len. Returns the corners.
function ctjApply(runs) {
  const on = runs.filter(r => r.on && wall(r.wall)), F = new Map(on.map(r => [r, ctjFrame(r)])), used = new Set(), corners = [];
  const endAt = (fr, P0, P1) => {
    const t0 = fr.along(P0), t1 = fr.along(P1), lo = Math.min(t0, t1) - 1.5, hi = Math.max(t0, t1) + 1.5;
    if (fr.a1 >= lo && fr.a1 <= hi && fr.a0 < lo) return { end: 'E', gap: Math.abs(fr.a1 - t0) };
    if (fr.a0 >= lo && fr.a0 <= hi && fr.a1 > hi) return { end: 'S', gap: Math.abs(fr.a0 - t0) };
    return null;
  };
  for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
    const A = F.get(on[i]), B = F.get(on[j]);
    if (A.w.id === B.w.id || Math.abs(A.r.top - B.r.top) > 0.5 || Math.abs(ctjCross(A.u, B.u)) < 0.25) continue;
    const P0 = ctjMeet(A.back, A.u, B.back, B.u), P1 = ctjMeet(A.front, A.u, B.front, B.u); if (!P0 || !P1) continue;
    const eA = endAt(A, P0, P1), eB = endAt(B, P0, P1); if (!eA || !eB) continue;
    if (used.has(A.r.key + eA.end) || used.has(B.r.key + eB.end)) continue;
    // Each top has to sit on the side of the other wall that faces it.
    const far = (fr, e) => fr.at(e === 'E' ? fr.a0 : fr.a1, fr.f + fr.r.depth / 2);
    if (A.out(far(B, eB.end)) < A.f || B.out(far(A, eA.end)) < B.f) continue;
    used.add(A.r.key + eA.end); used.add(B.r.key + eB.end);
    corners.push({ A, B, eA: eA.end, eB: eB.end, P0, P1, gapA: eA.gap, gapB: eB.gap });
  }
  // The joint each corner uses: what was picked, else mitered (jobs made from 0.60.8 on, S.job.ctMiter: Ayden 2026-11-20,
  // "mitered corner tops are standard"), else on older jobs the top that already reaches the wall runs through.
  corners.forEach(k => {
    const vA = ctjStore(k.A.r)['j' + k.eA], vB = ctjStore(k.B.r)['j' + k.eB];
    let t = vA === 'm' || vB === 'm' ? 'm' : vA === 't' || vB === 'c' ? 'A' : vA === 'c' || vB === 't' ? 'B' : null;
    if (!t && S.job && S.job.ctMiter) t = 'm';
    if (!t) t = Math.abs(k.gapA - k.gapB) > 0.25 ? (k.gapA < k.gapB ? 'A' : 'B') : (k.A.r.end - k.A.r.start >= k.B.r.end - k.B.r.start ? 'A' : 'B');
    k.type = t;
    k.id = `${k.A.r.key}~${k.eA}~${k.B.r.key}~${k.eB}`;
  });
  // The top's ends: straight across unless a corner reshapes them.
  const ends = new Map(on.map(r => { const fr = F.get(r); return [r, { S: [fr.at(fr.a0, fr.f), fr.at(fr.a0, fr.f + r.depth)], E: [fr.at(fr.a1, fr.f), fr.at(fr.a1, fr.f + r.depth)] }]; }));
  corners.forEach(k => {
    const { A, B } = k;
    if (k.type === 'm') { ends.get(A.r)[k.eA] = [k.P0, k.P1]; ends.get(B.r)[k.eB] = [k.P0, k.P1]; k.seam = [k.P0, k.P1]; return; }
    const [T, C, eT, eC] = k.type === 'A' ? [A, B, k.eA, k.eB] : [B, A, k.eB, k.eA];
    const tFront = ctjMeet(T.front, T.u, C.back, C.u), cBack = ctjMeet(C.back, C.u, T.front, T.u);
    ends.get(T.r)[eT] = [k.P0, tFront || k.P1];
    ends.get(C.r)[eC] = [cBack || k.P0, k.P1];
    k.seam = [cBack || k.P0, k.P1]; k.thru = T.r;
  });
  on.forEach(r => {
    const fr = F.get(r), e = ends.get(r);
    r.poly = [e.S[0], e.E[0], e.E[1], e.S[1]];
    const as = r.poly.map(fr.along);
    r.x0 = Math.min(...as); r.x1 = Math.max(...as); r.len = r.x1 - r.x0;
  });
  corners.forEach(ctjDiagFill);
  corners.forEach(k => { const m = k.type === 'm'; [[k.A.r, k.eA, 'A'], [k.B.r, k.eB, 'B']].forEach(([r, e, me]) => { (r.joints = r.joints || {})[e] = m ? 'mitered' : k.type === me ? 'runs through' : 'butts into the other top'; }); });
  return corners;
}
// A 45° corner cabinet's angled front sticks out past the inside corner of the two tops (each top is only its leg
// deep), so the top that runs through (or the first one at a miter) gets the triangle out to the angled front plus
// the front overhang. Without it the corner cabinet's box top showed in the inside corner.
function ctjDiagFill(k) {
  const T = k.type === 'B' ? k.B : k.A, O = T === k.A ? k.B : k.A, eT = T === k.A ? k.eA : k.eB, r = T.r;
  if (!r.poly || r.poly.length !== 4) return;
  const c = S.cabinets.find(x => (k.A.r.cabs.includes(x.id) || k.B.r.cabs.includes(x.id)) && x.cat === 'Base' &&
    typeof angledCorner === 'function' && angledCorner(x) && x.corner.type === 'diag' &&
    (cabPoly(x) || []).some(q => Math.hypot(q.x - k.P0.x, q.y - k.P0.y) < 3));
  if (!c) return;
  const w = wall(c.wall), g = wg(w), f = w.thick / 2 + (c.outset || 0), fc = cornerFaces(c)[0];
  const pt = (x, z) => wallPt(w, g, c.side, c.side === 1 ? c.off + x : c.off + c.w - x, f + z);
  const ov = r.tpl.frontOverhang || 0, p0 = facePt(fc, 0, ov), p1 = facePt(fc, fc.len, ov);
  const D0 = pt(p0.x, p0.z), D1 = pt(p1.x, p1.z), du = { x: D1.x - D0.x, y: D1.y - D0.y };
  // Only when the inside corner of the two tops is behind the angled front (on the wall side of it).
  const side = q => ctjCross(du, { x: q.x - D0.x, y: q.y - D0.y });
  if (side(k.P1) * side(k.P0) <= 0 || Math.abs(side(k.P1)) < 1e-6) return;
  const qT = ctjMeet(T.front, T.u, D0, du), qO = ctjMeet(O.front, O.u, D0, du); if (!qT || !qO) return;
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.01;
  const p = r.poly, ins = eT === 'E' ? [k.P1, qO, qT] : [qT, qO, k.P1];
  const at = eT === 'E' ? 2 : 3, pts = ins.filter(q => !near(q, p[at]));
  r.poly = [p[0], p[1], p[2], ...pts, p[3]];
  r.diagFill = c.id;
}
// Cut list words for a top's corners, like " · mitered at the start".
function ctjNote(r) {
  const j = r.joints || {}, parts = [];
  if (j.S && j.S !== 'runs through') parts.push(`${j.S} at the ${r.side === 1 ? 'left' : 'right'}`);
  if (j.E && j.E !== 'runs through') parts.push(`${j.E} at the ${r.side === 1 ? 'right' : 'left'}`);
  return parts.length ? ' · ' + parts.join(', ') : '';
}
// The corners of the room's tops, worked out with the runs.
function ctjCorners() { const runs = countertopRuns(); return runs.corners || []; }

// A top's ends along its wall (corners can move them past the run's own ends).
const ctX0 = r => has(r, 'x0') ? r.x0 : r.start - r.ovS;
const ctX1 = r => has(r, 'x1') ? r.x1 : r.end + r.ovE;

/* ---------- Plan: the joint marker and its menu ---------- */
function ctjPlanSVG(px) {
  let s = '';
  ctjCorners().forEach(k => {
    const [a, b] = k.seam, m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, r = 7 * px;
    const tip = k.type === 'm' ? 'Mitered corner' : `${wallName(k.thru === k.A.r ? k.A.w : k.B.w)} top runs through`;
    s += `<g class="ctj" data-ctj="${esc(k.id)}"><title>${tip}. Click to change the corner joint.</title>`
      + `<line class="ctj-seam nss" x1="${r3(a.x)}" y1="${r3(a.y)}" x2="${r3(b.x)}" y2="${r3(b.y)}"/>`
      + `<line class="ctj-hit" x1="${r3(a.x)}" y1="${r3(a.y)}" x2="${r3(b.x)}" y2="${r3(b.y)}" stroke-width="${r3(r * 1.6)}"/>`
      + `<circle class="ctj-dot nss" cx="${r3(m.x)}" cy="${r3(m.y)}" r="${r3(r)}"/>`
      + `<path class="ctj-ico nss" d="${k.type === 'm' ? `M${r3(m.x - r * 0.5)} ${r3(m.y + r * 0.5)}L${r3(m.x + r * 0.5)} ${r3(m.y - r * 0.5)}` : `M${r3(m.x - r * 0.5)} ${r3(m.y)}H${r3(m.x + r * 0.5)}M${r3(m.x)} ${r3(m.y - r * 0.5)}V${r3(m.y + r * 0.5)}`}"/></g>`;
  });
  return s;
}
function ctjShowCtx(id, x, y) {
  const k = ctjCorners().find(q => q.id === id); if (!k) return;
  const m = $('#ctxmenu'), cur = k.type, nA = wallName(k.A.w), nB = wallName(k.B.w);
  const b = (v, label) => `<button role="menuitem" data-act="ctj-set" data-id="${esc(id)}#${v}">${cur === v ? '✓ ' : ''}${label}</button>`;
  m.innerHTML = `<div class="ctxhead">Countertop corner · ${nA} and ${nB}</div>${b('m', 'Mitered')}${b('A', `${nA} top runs through`)}${b('B', `${nB} top runs through`)}`;
  m.hidden = false;
  const rc = m.getBoundingClientRect(); m.style.left = Math.min(x, innerWidth - rc.width - 8) + 'px'; m.style.top = Math.min(y, innerHeight - rc.height - 8) + 'px';
}
// A top's back edge or end, right-clicked on the Tops tab (0.59.1): backsplash on, off or a height; waterfall an end.
function ctjEdgeCtx(id, x, y) {
  const [key, part] = id.split('|'), runs = countertopRuns(), i = runs.findIndex(r => r.key === key), r = runs[i]; if (!r) return;
  const m = $('#ctxmenu'), b = (v, label, on) => `<button role="menuitem" data-act="ctj-edge" data-id="${esc(key + '|' + v)}">${on ? '✓ ' : ''}${label}</button>`;
  const st = ctjStore(r), def = Math.max(0, +r.tpl.backsplash || 0), own = has(st, 'bs') && st.bs !== '';
  let h = `<div class="ctxhead">Top ${i + 1} · ${esc(wallName(wall(r.wall)))}</div>`;
  if (part === 'back') {
    h += b('bs=0', 'No backsplash', r.bs === 0);
    [4, 6, 18].forEach(v => { h += b('bs=' + v, `${fmtLen(v)} backsplash`, own && r.bs === v); });
    h += b('bs=', r.island ? 'Island default (none)' : `Style's backsplash${def ? ` (${fmtLen(def)})` : ' (none)'}`, !own);
    h += `<label class="ctx-in"><span>Height</span><input type="text" class="num cte-bs" data-id="${esc(key)}" value="${esc(fmtLen(r.bs))}" aria-label="Backsplash height"></label>`;
  } else {
    const on = !!r['wf' + part], side = (part === 'S') === (r.side === 1) ? 'left' : 'right', ss = !!r['ss' + part];
    if (r.bs > 0 && !on) h += b('ss' + part + '=' + (ss ? 0 : 1), ss ? `Take the side splash off the ${side} end` : `Side splash on the ${side} end`, false);
    h += b('wf' + part + '=' + (on ? 0 : 1), on ? `Take the waterfall off the ${side} end` : `Waterfall the ${side} end to the floor`, false);
  }
  m.innerHTML = h; m.hidden = false;
  const rc = m.getBoundingClientRect(); m.style.left = Math.min(x, innerWidth - rc.width - 8) + 'px'; m.style.top = Math.min(y, innerHeight - rc.height - 8) + 'px';
}
function ctjEdgeSet(key, k, v) {
  const r = countertopRuns().find(q => q.key === key); if (!r) return;
  mutate(() => { const o = ctjStore(r, true); if (k === 'bs' && v === '') delete o.bs; else if (k === 'bs') o.bs = Math.max(0, +v || 0); else if (/^ss/.test(k)) o[k] = !!+v; else if (+v) o[k] = true; else delete o[k]; });
}
document.addEventListener('change', e => {
  const t = e.target; if (!t.classList || !t.classList.contains('cte-bs')) return;
  const n = parseLen(t.value); if (!isFinite(n)) return;
  hideCtx(); ctjEdgeSet(t.dataset.id, 'bs', r3(n));
});
function ctjAct(a, id) {
  if (a === 'ctj-edge') { const i = id.lastIndexOf('|'), key = id.slice(0, i), [k, v] = id.slice(i + 1).split('='); hideCtx(); ctjEdgeSet(key, k, v); return true; }
  if (a !== 'ctj-set') return false;
  const i = id.lastIndexOf('#'), cid = id.slice(0, i), v = id.slice(i + 1), k = ctjCorners().find(q => q.id === cid);
  hideCtx(); if (!k) return true;
  mutate(() => {
    const oA = ctjStore(k.A.r, true), oB = ctjStore(k.B.r, true);
    oA['j' + k.eA] = v === 'm' ? 'm' : v === 'A' ? 't' : 'c';
    oB['j' + k.eB] = v === 'm' ? 'm' : v === 'B' ? 't' : 'c';
  });
  flash(v === 'm' ? 'The tops miter at this corner' : `${wallName(v === 'A' ? k.A.w : k.B.w)} top runs through the corner`);
  return true;
}
