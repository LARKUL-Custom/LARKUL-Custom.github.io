// 0.63.85: Measure tool (Ayden 2026-11-26: "click once and that first connection can and will auto connect to hotspots like
// corners of cabs or other stuff but it doesnt need to connect ... really soft connect, then the second one is the same thing
// but it finishes the connection so i can see that dimension").
// Works in the plan and the elevation. Each click softly snaps to the nearest corner (cabinets, walls, tops, appliances,
// fronts, shapes, other dimensions' ends), else an edge's middle, else a point on an edge, else lands where you clicked.
// The second click finishes the dimension; it stays drawn (saved with the room) and prints with the drawing.
// Nearly level or plumb (within 10°) it measures straight across or up; Shift always measures straight; else the true length.
// Saved as room.mdims[] = { id, v: 'plan' | 'elev', wall, side, a: {x, y}, b: {x, y}, k: 'h' | 'v' | 'a' } in drawing units.
'use strict';

const MD_R = { corner: 13, mid: 9, edge: 7 }; // snap reach in screen pixels
const mdRoom = () => S.rooms.find(r => r.id === S.roomId) || S.rooms[0];
const mdSvg = () => document.getElementById(ui.viewMode === 'elev' ? 'elev' : 'plan');
const mdView = () => (ui.viewMode === 'elev' ? 'elev' : 'plan');
function mdOn() { return !!ui.mdim && (ui.viewMode === 'plan' || ui.viewMode === 'elev'); }

// The dimensions belonging to the drawing being shown (or printed).
function mdList(v, w, side) {
  const r = mdRoom(); return ((r && r.mdims) || []).filter(d => d.v === v && (v === 'plan' || (d.wall === w && d.side === side)));
}
function mdKind(a, b, straight) {
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  if (straight) return dx >= dy ? 'h' : 'v';
  const ang = Math.atan2(Math.min(dx, dy), Math.max(dx, dy)) * 180 / Math.PI;
  return ang < 10 ? (dx >= dy ? 'h' : 'v') : 'a';
}
function mdLen(d) { return d.k === 'h' ? Math.abs(d.b.x - d.a.x) : d.k === 'v' ? Math.abs(d.b.y - d.a.y) : Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y); }

// One dimension drawn: line with end ticks, an extension line to the second point when measured straight, the length on it.
function mdSVG(d, px, opts = {}) {
  const { a, b } = d; let p1 = a, p2 = b, ext = '';
  if (d.k === 'h') { p2 = { x: b.x, y: a.y }; if (Math.abs(b.y - a.y) > 0.01) ext = `M${b.x} ${b.y}L${p2.x} ${p2.y}`; }
  if (d.k === 'v') { p2 = { x: a.x, y: b.y }; if (Math.abs(b.x - a.x) > 0.01) ext = `M${b.x} ${b.y}L${p2.x} ${p2.y}`; }
  const L = Math.hypot(p2.x - p1.x, p2.y - p1.y); if (L < 1e-6) return '';
  const ux = (p2.x - p1.x) / L, uy = (p2.y - p1.y) / L, nx = -uy, ny = ux, t = 5 * px;
  // Architect's ticks: a short bar across each end and a slash through it.
  const tick = p => `M${p.x + nx * t} ${p.y + ny * t}L${p.x - nx * t} ${p.y - ny * t}M${p.x + (ux + nx) * t * 0.7} ${p.y + (uy + ny) * t * 0.7}L${p.x - (ux + nx) * t * 0.7} ${p.y - (uy + ny) * t * 0.7}`;
  let ang = Math.atan2(uy, ux) * 180 / Math.PI; if (ang > 90 || ang <= -90) ang += 180;
  // The text sits on the side of the line that is up on screen (left for a plumb line).
  let sx = nx, sy = ny; if (sy > 1e-6 || (Math.abs(sy) <= 1e-6 && sx > 0)) { sx = -sx; sy = -sy; }
  const fs = (opts.fs || 12) * px, m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, tx = m.x + sx * 4 * px, ty = m.y + sy * 4 * px;
  const del = opts.del ? `<g class="md-del" data-mdel="${esc(d.id)}" transform="translate(${m.x - sx * 9 * px} ${m.y - sy * 9 * px})"><title>Delete this dimension</title><circle r="${7 * px}"/><path class="nss" d="M${-3 * px} ${-3 * px}L${3 * px} ${3 * px}M${3 * px} ${-3 * px}L${-3 * px} ${3 * px}"/></g>` : '';
  return `<g class="mdim${opts.live ? ' live' : ''}"><path class="nss" d="M${p1.x} ${p1.y}L${p2.x} ${p2.y}${tick(p1)}${tick(p2)}"/>${ext ? `<path class="md-ext nss" d="${ext}"/>` : ''}`
    + `<text x="${tx}" y="${ty}" font-size="${fs}" text-anchor="middle" dominant-baseline="text-after-edge" transform="rotate(${ang} ${tx} ${ty})">${fmtLen(mdLen(d))}</text>${del}</g>`;
}
// The saved dimensions for renderPlan / renderElev (screen and paper). The × to delete one shows while the tool is on.
function mdimSVG(v, px, w, side) {
  const del = mdOn() && !ui.printing && !(ui.mdim && ui.mdim.a);
  const s = mdList(v, w, side).map(d => mdSVG(d, px, { del })).join('');
  return s ? `<g class="mdims"${del ? '' : ' pointer-events="none"'}>${s}</g>` : '';
}

/* ----- Hotspots, read off what is drawn, so anything on the drawing can be snapped to ----- */
let mdHot = null; // { svg, pts: [{x, y}], segs: [[a, b]] } in drawing units; cleared on every redraw
const MD_SKIP = '.ghost,.guide,.handle,.ev-halo,.ev-sel,.ev-drop,.g-minor,.g-major,.mdims,.md-live,[data-rz],.lbl,.dimtxt,.lbl-m,.cab-lbls,.house-plan,.ev-ceilgap';
function mdimAfter(svg) {
  mdHot = null;
  if (!svg || !mdOn()) return;
  let g = svg.querySelector(':scope > g.md-live');
  if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'md-live'); g.setAttribute('pointer-events', 'none'); }
  svg.appendChild(g);
  mdLive();
}
function mdCollect(svg) {
  if (mdHot && mdHot.svg === svg) return mdHot;
  const pts = [], segs = [], inv = svg.getScreenCTM() && svg.getScreenCTM().inverse();
  if (!inv) return { svg, pts, segs };
  svg.querySelectorAll('rect,polygon,polyline,line').forEach(el => {
    if (el.closest('defs,pattern,clipPath,mask,symbol,title') || el.closest(MD_SKIP)) return;
    if (el.getAttribute('fill') && /^url\(#(gmin|gmaj)\)/.test(el.getAttribute('fill'))) return;
    const m = el.getScreenCTM(); if (!m) return;
    const M = inv.multiply(m), P = (x, y) => ({ x: M.a * x + M.c * y + M.e, y: M.b * x + M.d * y + M.f });
    let q = [], closed = true;
    if (el.localName === 'rect') {
      const x = +el.getAttribute('x') || 0, y = +el.getAttribute('y') || 0, w = +el.getAttribute('width') || 0, h = +el.getAttribute('height') || 0;
      if (!(w > 0 && h > 0)) return; q = [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)];
    } else if (el.localName === 'line') {
      closed = false; q = [P(+el.getAttribute('x1') || 0, +el.getAttribute('y1') || 0), P(+el.getAttribute('x2') || 0, +el.getAttribute('y2') || 0)];
    } else {
      closed = el.localName === 'polygon';
      q = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number).reduce((o, v, i, arr) => (i % 2 ? o : o.concat([P(v, arr[i + 1])])), []).filter(p => isFinite(p.x) && isFinite(p.y));
    }
    if (!q.length) return;
    pts.push(...q);
    for (let i = 0; i < q.length - (closed ? 0 : 1); i++) segs.push([q[i], q[(i + 1) % q.length]]);
  });
  // The ends of dimensions already drawn here, so they chain.
  const w = ui.elevWall && typeof wall === 'function' && wall(ui.elevWall);
  mdList(mdView(), w && w.id, w && elevSide(w)).forEach(d => { pts.push(d.a, d.b); });
  mdHot = { svg, pts, segs };
  return mdHot;
}
// Where a click at screen point (cx, cy) lands: { x, y (drawing units), how: 'corner' | 'mid' | 'edge' | 'free' }.
function mdSnap(svg, cx, cy) {
  const ctm = svg.getScreenCTM(); if (!ctm) return null;
  const S2 = p => ({ x: ctm.a * p.x + ctm.c * p.y + ctm.e, y: ctm.b * p.x + ctm.d * p.y + ctm.f });
  const inv = ctm.inverse(), free = { x: inv.a * cx + inv.c * cy + inv.e, y: inv.b * cx + inv.d * cy + inv.f, how: 'free' };
  const H = mdCollect(svg);
  let best = null, bd = MD_R.corner;
  H.pts.forEach(p => { const s = S2(p), d = Math.hypot(s.x - cx, s.y - cy); if (d < bd) { bd = d; best = p; } });
  if (best) return { x: best.x, y: best.y, how: 'corner' };
  bd = MD_R.mid;
  H.segs.forEach(([a, b]) => { const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, s = S2(m), d = Math.hypot(s.x - cx, s.y - cy); if (d < bd) { bd = d; best = m; } });
  if (best) return { x: best.x, y: best.y, how: 'mid' };
  bd = MD_R.edge;
  H.segs.forEach(([a, b]) => {
    const sa = S2(a), sb = S2(b), vx = sb.x - sa.x, vy = sb.y - sa.y, l2 = vx * vx + vy * vy; if (l2 < 1) return;
    const t = Math.max(0, Math.min(1, ((cx - sa.x) * vx + (cy - sa.y) * vy) / l2)), d = Math.hypot(sa.x + vx * t - cx, sa.y + vy * t - cy);
    if (d < bd) { bd = d; best = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
  });
  if (best) return { x: best.x, y: best.y, how: 'edge' };
  return free;
}
const mdPx = () => (ui.viewMode === 'elev' ? ui.elevPx : ui.px) || 1;
// The snap marker under the pointer and, after the first click, the dimension it would make.
function mdLive() {
  const svg = mdSvg(), g = svg && svg.querySelector(':scope > g.md-live'); if (!g) return;
  const px = mdPx(), at = ui.mdim && ui.mdim.at, a = ui.mdim && ui.mdim.a; let s = '';
  if (a) s += `<circle class="md-pt nss" cx="${a.x}" cy="${a.y}" r="${3.5 * px}"/>`;
  if (a && at) s += mdSVG({ a, b: at, k: mdKind(a, at, ui.mdim.shift) }, px, { live: true });
  if (at) {
    const r = 6 * px;
    if (at.how === 'corner') s += `<circle class="md-snap nss" cx="${at.x}" cy="${at.y}" r="${r}"/>`;
    else if (at.how === 'mid') s += `<path class="md-snap nss" d="M${at.x} ${at.y - r}L${at.x + r} ${at.y + r * 0.7}L${at.x - r} ${at.y + r * 0.7}Z"/>`;
    else if (at.how === 'edge') s += `<rect class="md-snap nss" x="${at.x - r * 0.7}" y="${at.y - r * 0.7}" width="${r * 1.4}" height="${r * 1.4}"/>`;
    else s += `<path class="md-free nss" d="M${at.x - r} ${at.y}H${at.x + r}M${at.x} ${at.y - r}V${at.y + r}"/>`;
  }
  g.innerHTML = s;
}
function mdRedraw() { if (ui.viewMode === 'elev') renderElev(); else renderPlan(); mdHint(); }
function mdHint() {
  const msg = !mdOn() ? '' : ui.mdim.a ? 'Click the second point to finish the dimension. <b>Shift</b> measures straight across or up. <b>Right-click</b> or <b>Esc</b> drops the first point.'
    : 'Click the first point. It snaps to corners and edges near the pointer, or lands anywhere. Click a dimension\'s <b>×</b> to delete it. <b>Esc</b> or <button class="btn sm" data-act="v-mdim">Done</button>';
  let h = document.getElementById('mdimhint');
  const card = document.getElementById(ui.viewMode === 'elev' ? 'elev-card' : 'plan-card');
  if (!msg) { if (h) h.hidden = true; return; }
  if (!h) { h = document.createElement('div'); h.id = 'mdimhint'; h.className = 'mdimhint'; }
  if (card && h.parentNode !== card) card.appendChild(h);
  if (h._m !== msg) { h.innerHTML = msg; h._m = msg; }
  h.hidden = false;
}
function mdStart() {
  // 0.63.96: D is a Walk key (step right) and the 3D view has no Measure, so the tool only starts from the plan or elevation
  // (Ayden 2026-11-26: walking kept throwing him out of Walk into the plan with Measure on).
  if (ui.viewMode === '3d' || (typeof WALK !== 'undefined' && WALK.on)) return;
  if (typeof stopDrawing === 'function') stopDrawing();
  ui.chainDim = null;
  ui.mdim = { a: null, at: null, shift: false };
  render(); mdHint();
}
function mdStop() { ui.mdim = null; mdHot = null; render(); mdHint(); }

function mdDown(e) {
  if (!mdOn()) return;
  const svg = e.currentTarget;
  // Starting another drawing tool (walls, placing, chain) hands the clicks back to it.
  if ((typeof drawingNow === 'function' && drawingNow()) || ui.chainDim) { ui.mdim = null; mdHint(); return; }
  if (e.pointerType === 'touch' && !e.isPrimary) return;
  if (e.button === 1) return; // middle button still pans
  if (e.button === 2) { e.stopImmediatePropagation(); e.preventDefault(); if (ui.mdim.a) { ui.mdim.a = null; mdRedraw(); } else mdStop(); return; }
  if (e.button !== 0) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const del = e.target.closest && e.target.closest('[data-mdel]');
  if (del && !ui.mdim.a) { const id = del.dataset.mdel; mutate(() => { const r = mdRoom(); r.mdims = (r.mdims || []).filter(d => d.id !== id); }); mdHint(); return; }
  const p = mdSnap(svg, e.clientX, e.clientY); if (!p) return;
  if (!ui.mdim.a) { ui.mdim.a = { x: p.x, y: p.y }; ui.mdim.at = p; mdLive(); mdHint(); mdRedraw(); return; }
  const a = ui.mdim.a, b = { x: p.x, y: p.y }, k = mdKind(a, b, e.shiftKey);
  ui.mdim.a = null; ui.mdim.at = p;
  const d = { id: uid('md'), v: mdView(), a: { x: r3(a.x), y: r3(a.y) }, b: { x: r3(b.x), y: r3(b.y) }, k };
  if (mdLen(d) < 1 / 64) { mdRedraw(); return; }
  if (d.v === 'elev') { const w = wall(ui.elevWall); if (!w) return; d.wall = w.id; d.side = elevSide(w); }
  mutate(() => { const r = mdRoom(); r.mdims = r.mdims || []; r.mdims.push(d); });
  mdHint();
}
function mdMove(e) {
  if (!mdOn()) return;
  const svg = e.currentTarget, p = mdSnap(svg, e.clientX, e.clientY); if (!p) return;
  ui.mdim.at = p; ui.mdim.shift = e.shiftKey; mdLive();
}
(function mdInit() {
  const hook = () => {
    ['plan', 'elev'].forEach(id => {
      const svg = document.getElementById(id); if (!svg || svg._md) return; svg._md = true;
      svg.addEventListener('pointerdown', mdDown, true);
      svg.addEventListener('pointermove', mdMove);
      svg.addEventListener('contextmenu', e => { if (mdOn()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
      svg.addEventListener('pointerleave', () => { if (mdOn() && ui.mdim.at) { ui.mdim.at = null; mdLive(); } });
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  window.addEventListener('keydown', e => {
    if (typeof ui === 'undefined') return;
    const typing = e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable],dialog,.qe');
    if (mdOn() && e.key === 'Escape') { e.stopImmediatePropagation(); if (ui.mdim.a) { ui.mdim.a = null; mdRedraw(); } else mdStop(); return; }
    if (mdOn() && e.key === 'Shift' && ui.mdim.a) { ui.mdim.shift = true; mdLive(); }
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'd' || e.key === 'D') && ui.tab === 'room' && !ui.quick && (ui.viewMode === 'plan' || ui.viewMode === 'elev') && !(typeof WALK !== 'undefined' && WALK.on)) { e.preventDefault(); if (ui.mdim) mdStop(); else mdStart(); }
  }, true);
  window.addEventListener('keyup', e => { if (typeof ui !== 'undefined' && mdOn() && e.key === 'Shift') { ui.mdim.shift = false; mdLive(); } });
})();
// The toolbar button, beside Cabinet and Door in the Dimensions group.
function mdBtn() { return ui.viewMode === '3d' ? '' : `<button data-act="v-mdim" aria-pressed="${mdOn()}" title="Measure: click two points to add a dimension (D). Each click snaps to nearby corners and edges.">${mdOn() ? 'Done' : 'Measure'}</button>`; }
const vActMd = vAct;
vAct = function (a, id) {
  if (a === 'v-mdim') { if (ui.mdim) mdStop(); else mdStart(); return true; }
  return vActMd(a, id);
};
