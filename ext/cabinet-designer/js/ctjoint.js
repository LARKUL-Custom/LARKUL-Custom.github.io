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
  const w = wall(r.wall), g = wg(w), f = w.thick / 2, s = r.side;
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
  // The joint each corner uses: what was picked, or by default the top that already reaches the wall runs through.
  corners.forEach(k => {
    const vA = ctjStore(k.A.r)['j' + k.eA], vB = ctjStore(k.B.r)['j' + k.eB];
    let t = vA === 'm' || vB === 'm' ? 'm' : vA === 't' || vB === 'c' ? 'A' : vA === 'c' || vB === 't' ? 'B' : null;
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
  corners.forEach(k => { const m = k.type === 'm'; [[k.A.r, k.eA, 'A'], [k.B.r, k.eB, 'B']].forEach(([r, e, me]) => { (r.joints = r.joints || {})[e] = m ? 'mitered' : k.type === me ? 'runs through' : 'butts into the other top'; }); });
  return corners;
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
function ctjAct(a, id) {
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
