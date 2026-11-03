/* ---------- Carve: V-carving like VCarve ----------
   Signs, logos, text, shapes and designs carved with a V-bit. The bit rides deeper where the design is wide and comes
   up to a point in sharp corners, so letters get crisp V walls. Wide areas past the max depth get a flat floor, cleared
   with a straight bit if one is picked. A board is either its own sign or a part from this room (a door, a panel).
   Each board saves as G-code for the router. Sizes are inches, y up from the bottom left corner of the board.
   S.job.carves: [{ id, name, L, W, T, part: {cab, key} | null, items: [], vbit, depth, clear, cutout, cutTool }]
   An item: { id, kind: 'text' | 'art' | 'shape', x, y (its middle), h (text: capital letter height; others: height),
   w (width; blank keeps the proportions), angle, flip, plus text, font, bold, italic, spacing for text; loops, bw, bh
   for art (outlines with height 1); shape, r, band for shapes }. */
'use strict';

const VC_FONTS = ['Arial', 'Arial Black', 'Georgia', 'Times New Roman', 'Impact', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Courier New', 'Palatino Linotype', 'Book Antiqua', 'Garamond', 'Century Gothic', 'Franklin Gothic Medium', 'Copperplate Gothic Bold', 'Rockwell', 'Bookman Old Style', 'Stencil', 'Old English Text MT', 'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', 'Lucida Calligraphy', 'Comic Sans MS', 'Roboto', 'Rajdhani'];
const VC_SHAPES = [['rect', 'Rectangle'], ['rrect', 'Rounded rectangle'], ['oval', 'Oval or circle'], ['border', 'Border (frame)'], ['star', 'Star'], ['heart', 'Heart'], ['diamond', 'Diamond'], ['arrow', 'Arrow']];

/* ----- Geometry ----- */
const vcArea = l => { let a = 0; for (let i = 0, n = l.length; i < n; i++) { const p = l[i], q = l[(i + 1) % n]; a += p.x * q.y - q.x * p.y; } return a / 2; };
function vcInside(pt, l) {
  let c = false;
  for (let i = 0, j = l.length - 1; i < l.length; j = i++) { const a = l[i], b = l[j]; if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) c = !c; }
  return c;
}
// Douglas-Peucker on an open line; z counts too when the points have it.
function vcDP(pts, tol) {
  const n = pts.length; if (n < 3) return pts.slice();
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop(), A = pts[a], B = pts[b], dx = B.x - A.x, dy = B.y - A.y, dz = (B.z || 0) - (A.z || 0), L2 = dx * dx + dy * dy + dz * dz;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i], px = P.x - A.x, py = P.y - A.y, pz = (P.z || 0) - (A.z || 0), t = L2 > 1e-18 ? Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / L2)) : 0;
      const d = Math.hypot(px - dx * t, py - dy * t, pz - dz * t); if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function vcSimplifyLoop(l, tol) {
  if (l.length < 6) return l;
  let far = 0, fd = -1; for (let i = 1; i < l.length; i++) { const d = (l[i].x - l[0].x) ** 2 + (l[i].y - l[0].y) ** 2; if (d > fd) { fd = d; far = i; } }
  const a = vcDP(l.slice(0, far + 1), tol), b = vcDP([...l.slice(far), l[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
// Outside loops turn counter-clockwise and holes clockwise (even-odd), so the part to carve is always on the left.
function vcOrient(loops) {
  const L = loops.filter(l => l.length >= 3 && Math.abs(vcArea(l)) > 1e-7);
  return L.map((l, i) => {
    const a = l[0], b = l[1], t = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let d = 0; L.forEach((m, j) => { if (j !== i && vcInside(t, m)) d++; });
    return Math.sign(vcArea(l)) === (d % 2 ? -1 : 1) ? l : l.slice().reverse();
  });
}
const vcBox = loops => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; loops.forEach(l => l.forEach(p => { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; })); return isFinite(x0) ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } : { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 }; };
// Loops moved so their box is centered on 0,0 and scaled by k.
function vcCenter(loops, k) { const b = vcBox(loops), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return { loops: loops.map(l => l.map(p => ({ x: (p.x - cx) * k, y: (p.y - cy) * k }))), bw: b.w * k, bh: b.h * k }; }

/* ----- Tracing: outlines from a picture (marching squares on the grey levels, so edges land between pixels) ----- */
// g: w*h values 0..1, 1 = carve. Returns closed loops in pixel units, y down.
function vcTrace(g, w, h, th) {
  const W2 = w + 2, val = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? 0 : g[y * w + x];
  const P = new Map(), adj = new Map();
  const pt = (k, x0, y0, x1, y1, a, b) => { if (!P.has(k)) { const t = Math.abs(b - a) < 1e-9 ? 0.5 : (th - a) / (b - a); P.set(k, { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t }); } return k; };
  const link = (a, b) => { let l = adj.get(a); if (!l) adj.set(a, l = []); l.push(b); let m = adj.get(b); if (!m) adj.set(b, m = []); m.push(a); };
  const hk = (x, y) => ((y + 1) * W2 + (x + 1)) * 2, vk = (x, y) => ((y + 1) * W2 + (x + 1)) * 2 + 1;
  for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {
    const a = val(x, y), b = val(x + 1, y), c = val(x + 1, y + 1), d = val(x, y + 1);
    const idx = (a >= th ? 8 : 0) | (b >= th ? 4 : 0) | (c >= th ? 2 : 0) | (d >= th ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const T = () => pt(hk(x, y), x, y, x + 1, y, a, b), R = () => pt(vk(x + 1, y), x + 1, y, x + 1, y + 1, b, c);
    const B = () => pt(hk(x, y + 1), x, y + 1, x + 1, y + 1, d, c), Lf = () => pt(vk(x, y), x, y, x, y + 1, a, d);
    const mid = (a + b + c + d) / 4 >= th;
    switch (idx) {
      case 1: case 14: link(Lf(), B()); break;
      case 2: case 13: link(B(), R()); break;
      case 3: case 12: link(Lf(), R()); break;
      case 4: case 11: link(T(), R()); break;
      case 6: case 9: link(T(), B()); break;
      case 7: case 8: link(Lf(), T()); break;
      case 5: if (mid) { link(Lf(), T()); link(B(), R()); } else { link(Lf(), B()); link(T(), R()); } break;
      case 10: if (mid) { link(Lf(), B()); link(T(), R()); } else { link(Lf(), T()); link(B(), R()); } break;
    }
  }
  const seen = new Set(), loops = [];
  for (const k0 of adj.keys()) {
    if (seen.has(k0)) continue;
    const loop = []; let prev = -1, k = k0;
    while (k !== undefined && !seen.has(k)) { seen.add(k); loop.push(P.get(k)); const n = adj.get(k) || []; const nx = n[0] !== prev ? n[0] : n[1]; prev = k; k = nx; }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
const vcCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; };

/* ----- Text in any font this computer has ----- */
const vcTextCache = new Map(), vcFontWait = new Set();
function vcFontThere(f) {
  const [, c] = vcCanvas(10, 10), t = 'mmmmmmmmmmlli WQ@#';
  return ['monospace', 'serif'].some(fb => { c.font = `40px ${fb}`; const a = c.measureText(t).width; c.font = `40px "${f}", ${fb}`; return Math.abs(c.measureText(t).width - a) > 0.01; });
}
// The outlines of the text with the capital letters 1 tall, centered on 0,0.
function vcTextShape(it) {
  const font = String(it.font || 'Arial').replace(/["\\]/g, ''), style = `${it.italic ? 'italic ' : ''}${it.bold ? 'bold ' : ''}`, sp = +it.spacing || 1.4, align = it.align || 'center';
  const key = [font, style, sp, align, it.text || ''].join('|');
  if (vcTextCache.has(key)) return vcTextCache.get(key);
  const lines = String(it.text || '').split('\n');
  if (!lines.some(t => t.trim())) { const e = { loops: [], bw: 0, bh: 0 }; vcTextCache.set(key, e); return e; }
  const fam = `"${font}", Arial, sans-serif`;
  // A font from the web (Roboto) may still be loading: draw it again once it is here.
  if (document.fonts && !document.fonts.check(`${style}40px ${fam}`) && !vcFontWait.has(key)) {
    vcFontWait.add(key); document.fonts.load(`${style}40px ${fam}`).then(() => { vcTextCache.delete(key); vcPlanCache.clear(); if (ui.tab === 'carve') renderCarve(); }).catch(() => {});
  }
  const [, m] = vcCanvas(10, 10); m.font = `${style}100px ${fam}`;
  const capA = m.measureText('H').actualBoundingBoxAscent || 72;
  let cap = 240;
  const meas = c => { m.font = `${style}${100 * c / capA}px ${fam}`; return lines.map(t => m.measureText(t || ' ')); };
  let ms = meas(cap);
  const ext = list => ({ w: Math.max(1, ...list.map(z => (z.actualBoundingBoxLeft || 0) + (z.actualBoundingBoxRight || z.width))), asc: Math.max(...list.map(z => z.actualBoundingBoxAscent || 0)), desc: Math.max(...list.map(z => z.actualBoundingBoxDescent || 0)) });
  let e = ext(ms);
  const tall = c => e.asc + e.desc + (lines.length - 1) * c * sp;
  const lim = 5200, k = Math.min(1, lim / (e.w + 40), lim / (tall(cap) + 40));
  if (k < 1) { cap *= k; ms = meas(cap); e = ext(ms); }
  const pad = 10, W = Math.ceil(e.w + pad * 2), H = Math.ceil(tall(cap) + pad * 2);
  const [, c] = vcCanvas(W, H);
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = `${style}${100 * cap / capA}px ${fam}`; c.textBaseline = 'alphabetic';
  lines.forEach((t, i) => {
    const z = ms[i], lw = (z.actualBoundingBoxLeft || 0) + (z.actualBoundingBoxRight || z.width);
    const x0 = pad + (align === 'left' ? 0 : align === 'right' ? e.w - lw : (e.w - lw) / 2) + (z.actualBoundingBoxLeft || 0);
    c.fillText(t, x0, pad + e.asc + i * cap * sp);
  });
  const d = c.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
  for (let i = 0; i < g.length; i++) g[i] = d[i * 4] / 255;
  const loops = vcTrace(g, W, H, 0.5).map(l => vcSimplifyLoop(l, 0.25)).filter(l => Math.abs(vcArea(l)) > 2).map(l => l.map(p => ({ x: p.x / cap, y: -p.y / cap })));
  const out = vcCenter(loops, 1);
  if (vcTextCache.size > 60) vcTextCache.delete(vcTextCache.keys().next().value);
  vcTextCache.set(key, out); return out;
}

/* ----- Pictures and logos (PNG, JPG, SVG…), DXF drawings, and shapes ----- */
function vcLoadImage(file) {
  return new Promise((res, rej) => { const url = URL.createObjectURL(file), im = new Image(); im.onload = () => res({ im, url }); im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('not a picture this browser can open')); }; im.src = url; });
}
// Dark parts of the picture are carved; invert carves the light parts. Cut-off 0..1 (blank = picked from the picture).
function vcTraceImage(im, cut, invert) {
  const big = 1400, s = Math.min(1, big / Math.max(im.naturalWidth || im.width || 1, im.naturalHeight || im.height || 1));
  let w = Math.round((im.naturalWidth || im.width || 300) * s), h = Math.round((im.naturalHeight || im.height || 300) * s);
  if (!(w > 2 && h > 2)) { w = 600; h = 600; }
  const [, c] = vcCanvas(w, h); c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.filter = 'blur(0.7px)'; c.drawImage(im, 0, 0, w, h); c.filter = 'none';
  const d = c.getImageData(0, 0, w, h).data, g = new Float32Array(w * h), hist = new Array(256).fill(0);
  for (let i = 0; i < g.length; i++) { const v = 1 - (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255; g[i] = invert ? 1 - v : v; hist[Math.round(g[i] * 255)]++; }
  let th = +cut;
  if (!(th > 0 && th < 1)) { // Otsu: the cut-off that splits the picture into two groups best
    const n = g.length; let sum = 0; hist.forEach((v, i) => { sum += i * v; });
    let sB = 0, wB = 0, best = 0; th = 0.5;
    for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = (i + 0.5) / 255; } }
  }
  const loops = vcTrace(g, w, h, th).map(l => vcSimplifyLoop(l, 0.35)).filter(l => Math.abs(vcArea(l)) > 6).map(l => l.map(p => ({ x: p.x, y: -p.y })));
  return { ...vcNorm(loops), th };
}
// Outlines 1 tall, centered.
function vcNorm(loops) { const b = vcBox(loops); return vcCenter(loops, b.h > 0 ? 1 / b.h : 1); }
function vcDxfShape(text) {
  const d = parseDXF(text), k = d.units === 4 ? 1 / 25.4 : d.units === 5 ? 1 / 2.54 : d.units === 6 ? 1000 / 25.4 : 1, loops = [];
  d.shapes.filter(s => s.closed && s.pts.length >= 2).forEach(sh => {
    const P = sh.pts.map(p => ({ x: p.x * k, y: p.y * k, bulge: p.bulge || 0 })), out = [];
    P.forEach((p, i) => { out.push({ x: p.x, y: p.y }); const nx = P[(i + 1) % P.length]; if (p.bulge) out.push(...bulgeArc(p, nx, p.bulge * Math.hypot(nx.x - p.x, nx.y - p.y) / 2, true)); });
    if (out.length >= 3) loops.push(out);
  });
  d.circles.forEach(ci => { const r = ci.r * k, n = Math.max(24, Math.min(160, Math.ceil(r * 60))); loops.push(Array.from({ length: n }, (_, i) => ({ x: ci.x * k + r * Math.cos(i / n * 2 * Math.PI), y: ci.y * k + r * Math.sin(i / n * 2 * Math.PI) }))); });
  const open = d.shapes.filter(s => !s.closed).length, b = vcBox(loops);
  return { ...vcNorm(loops), h: b.h, open };
}
// Basic shapes at their real size (w by h), centered.
function vcRound(w, h, r, x0 = 0, y0 = 0) {
  r = Math.max(0, Math.min(r, w / 2, h / 2)); const out = [], hw = w / 2, hh = h / 2;
  if (r < 1e-4) return [{ x: x0 - hw, y: y0 - hh }, { x: x0 + hw, y: y0 - hh }, { x: x0 + hw, y: y0 + hh }, { x: x0 - hw, y: y0 + hh }];
  [[hw - r, -hh + r, -90], [hw - r, hh - r, 0], [-hw + r, hh - r, 90], [-hw + r, -hh + r, 180]].forEach(([cx, cy, a0]) => { for (let i = 0; i <= 12; i++) { const a = (a0 + i * 90 / 12) * Math.PI / 180; out.push({ x: x0 + cx + r * Math.cos(a), y: y0 + cy + r * Math.sin(a) }); } });
  return out;
}
function vcShapeLoops(it) {
  const w = Math.max(0.05, +it.w || +it.h || 1), h = Math.max(0.05, +it.h || 1), hw = w / 2, hh = h / 2, s = it.shape || 'rect';
  if (s === 'rect') return [vcRound(w, h, 0)];
  if (s === 'rrect') return [vcRound(w, h, it.r !== undefined && it.r !== '' ? +it.r : Math.min(w, h) / 6)];
  if (s === 'border') { const b = Math.max(0.05, Math.min(+it.band || 0.5, w / 2 - 0.02, h / 2 - 0.02)), r = +it.r || 0; return [vcRound(w, h, r), vcRound(w - 2 * b, h - 2 * b, Math.max(0, r - b))]; }
  if (s === 'oval') return [Array.from({ length: 120 }, (_, i) => ({ x: hw * Math.cos(i / 120 * 2 * Math.PI), y: hh * Math.sin(i / 120 * 2 * Math.PI) }))];
  if (s === 'diamond') return [[{ x: 0, y: -hh }, { x: hw, y: 0 }, { x: 0, y: hh }, { x: -hw, y: 0 }]];
  if (s === 'star') { const n = +it.points || 5, ri = +it.inner || 0.45, pts = []; for (let i = 0; i < n * 2; i++) { const a = Math.PI / 2 + i * Math.PI / n, k = i % 2 ? ri : 1; pts.push({ x: Math.cos(a) * k, y: Math.sin(a) * k }); } return [vcStretch(pts, w, h)]; }
  if (s === 'heart') { const pts = []; for (let i = 0; i < 160; i++) { const t = i / 160 * 2 * Math.PI; pts.push({ x: 16 * Math.sin(t) ** 3, y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) }); } return [vcStretch(pts, w, h)]; }
  if (s === 'arrow') return [vcStretch([{ x: 0, y: 0.32 }, { x: 0.62, y: 0.32 }, { x: 0.62, y: 0.5 }, { x: 1, y: 0 }, { x: 0.62, y: -0.5 }, { x: 0.62, y: -0.32 }, { x: 0, y: -0.32 }], w, h)];
  return [vcRound(w, h, 0)];
}
function vcStretch(pts, w, h) { const b = vcBox([pts]), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return pts.map(p => ({ x: (p.x - cx) / (b.w || 1) * w, y: (p.y - cy) / (b.h || 1) * h })); }

// An item's outlines on the board.
function vcItemBase(it) {
  if (it.kind === 'shape') { const L = vcShapeLoops(it); return { loops: L, sx: 1, sy: 1, bw: +it.w || +it.h || 1, bh: +it.h || 1 }; }
  const src = it.kind === 'text' ? vcTextShape(it) : { loops: it.loops || [], bw: it.bw || 1, bh: it.bh || 1 };
  const sy = +it.h || 1, sx = +it.w > 0 && src.bw ? +it.w / src.bw : sy;
  return { loops: src.loops, sx, sy, bw: src.bw * sx, bh: src.bh * sy };
}
function vcItemLoops(it) {
  const b = vcItemBase(it), a = (+it.angle || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), mx = it.flip ? -1 : 1, x = +it.x || 0, y = +it.y || 0;
  return b.loops.map(l => l.map(p => { const u = p.x * b.sx * mx, v = p.y * b.sy; return { x: x + u * ca - v * sa, y: y + u * sa + v * ca }; }));
}
const vcItemSize = it => { const b = vcItemBase(it); return { w: b.bw, h: b.bh }; };

/* ----- Toolpaths ----- */
// The V-bit rides along each outline with its cone touching the edge; how deep it goes at a point is set by the
// biggest circle that fits in the design there (touching the outline at that point and nowhere else inside it).
// o: { angle (°), dia, depth (max, 0 = as deep as the bit allows), clearDia (0 = no clearing bit), stepover (0..1) }.
const vcPlanCache = new Map();
function vcPlan(loopsIn, o) {
  const key = JSON.stringify([o, loopsIn.map(l => l.map(p => [Math.round(p.x * 1e4), Math.round(p.y * 1e4)]))]);
  if (vcPlanCache.has(key)) return vcPlanCache.get(key);
  const tanH = Math.tan(Math.max(5, Math.min(170, +o.angle || 90)) / 2 * Math.PI / 180), rBit = Math.max(0.01, (+o.dia || 0.5) / 2);
  const rDep = o.depth > 0 ? o.depth * tanH : Infinity, rmax = Math.min(rBit, rDep);
  const loops = vcOrient(loopsIn.map(l => l.filter((p, i) => { const q = l[(i + 1) % l.length]; return Math.hypot(q.x - p.x, q.y - p.y) > 1e-6; })));
  const step = Math.max(0.003, Math.min(0.03, rmax / 12));
  // Points along every outline (with the side to carve), and a grid to find the nearby ones fast.
  const samp = [], cs = Math.max(2 * rmax, step * 4), grid = new Map(), gk = (i, j) => i * 100003 + j;
  const addB = p => { const k = gk(Math.floor(p.x / cs), Math.floor(p.y / cs)); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(p); };
  const chains = loops.map(l => {
    const n = l.length, out = [];
    for (let i = 0; i < n; i++) {
      const A = l[i], B = l[(i + 1) % n], Z = l[(i - 1 + n) % n], len = Math.hypot(B.x - A.x, B.y - A.y), tx = (B.x - A.x) / len, ty = (B.y - A.y) / len;
      const lp = Math.hypot(A.x - Z.x, A.y - Z.y) || 1, px = (A.x - Z.x) / lp, py = (A.y - Z.y) / lp, turn = px * ty - py * tx;
      // An inside corner (the outline turns right): the bit swings around the corner point.
      if (turn < -0.02) {
        let a0 = Math.atan2(px, -py), a1 = Math.atan2(tx, -ty); while (a1 > a0) a1 -= 2 * Math.PI; while (a0 - a1 > 2 * Math.PI) a1 += 2 * Math.PI;
        const k = Math.ceil((a0 - a1) / 0.08); for (let j = 1; j < k; j++) { const a = a0 + (a1 - a0) * j / k; out.push({ x: A.x, y: A.y, nx: Math.cos(a), ny: Math.sin(a) }); }
      }
      const segs = Math.max(1, Math.ceil(len / step));
      for (let k = 0; k < segs; k++) { const p = { x: A.x + tx * len * k / segs, y: A.y + ty * len * k / segs, nx: -ty, ny: tx }; out.push(p); addB(p); }
    }
    return out;
  });
  chains.forEach(ch => ch.forEach(p => { samp.push(p); }));
  const near = (p, R, fn) => { const i0 = Math.floor((p.x - R) / cs), i1 = Math.floor((p.x + R) / cs), j0 = Math.floor((p.y - R) / cs), j1 = Math.floor((p.y + R) / cs); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const c = grid.get(gk(i, j)); if (c && fn(c) === false) return; } };
  let flat = false, wide = false, deep = 0;
  samp.forEach(p => {
    let r = rmax; const R = 2 * rmax + step;
    near(p, R, c => { for (const q of c) { const dx = q.x - p.x, dy = q.y - p.y, dn = dx * p.nx + dy * p.ny; if (dn <= 1e-9) continue; const d2 = dx * dx + dy * dy; if (d2 < 1e-14) continue; const rr = d2 / (2 * dn); if (rr < r) r = rr; } });
    p.r = r; if (r >= rmax - 1e-9) { flat = true; if (rmax === rBit && rBit < rDep) wide = true; }
  });
  const v = chains.map(ch => {
    if (!ch.length) return null;
    const pts = ch.map(p => { const z = -p.r / tanH; if (-z > deep) deep = -z; return { x: p.x + p.nx * p.r, y: p.y + p.ny * p.r, z }; });
    pts.push({ ...pts[0] });
    return vcDP(pts, 0.0005);
  }).filter(Boolean);
  // Flat floors near the edges: the V-bit runs rings at the max depth, each a little further in, so no ridge over
  // about 0.01" is left. With a clearing bit it does only the band that bit can't reach; without one, the whole floor.
  const fd = rmax / tanH, s2 = Math.max(0.006, 0.02 * tanH), vflat = [];
  let huge = false;
  if (flat) {
    const cap2 = o.clearDia > 0 ? rmax + o.clearDia + s2 : rmax * 8;
    samp.forEach(p => {
      if (p.r < rmax - 1e-9) { p.rt = p.r; return; }
      let r = cap2; near(p, 2 * cap2 + step, c => { for (const q of c) { const dx = q.x - p.x, dy = q.y - p.y, dn = dx * p.nx + dy * p.ny; if (dn <= 1e-9) continue; const d2 = dx * dx + dy * dy; if (d2 < 1e-14) continue; const rr = d2 / (2 * dn); if (rr < r) r = rr; } });
      p.rt = r; if (r >= cap2 - 1e-9 && !(o.clearDia > 0)) huge = true;
    });
    const rt = o.clearDia > 0 ? o.clearDia / 2 : 0;
    // Where the clearing bit fits (its middle rmax + rt in from the edge) it does the floor; the V-bit does the rest.
    for (let off = rmax + s2; off < (rt ? rmax + rt : cap2) - 1e-9; off += s2) vcRings(chains, off, p => p.rt >= off && (!rt || p.rt < rmax + rt)).forEach(r => vflat.push(r.map(q => ({ ...q, z: -fd }))));
  }
  // Flat floors: a straight bit clears what the V-bit can't reach at the max depth, back and forth.
  const clear = [];
  if (flat && o.clearDia > 0) {
    const rt = o.clearDia / 2, need = rmax + rt * 0.98, st = Math.max(0.005, o.clearDia * Math.min(0.9, Math.max(0.1, o.stepover || 0.4))), b = vcBox(loops), sx = Math.max(0.004, Math.min(st, rt) / 3);
    const ok = (x, y) => { let good = true; near({ x, y }, need, c => { for (const q of c) if ((q.x - x) ** 2 + (q.y - y) ** 2 < need * need) { good = false; return false; } }); return good; };
    vcRings(chains, rmax + rt, p => p.rt >= rmax + rt).forEach(r => clear.push(r.map(q => ({ x: q.x, y: q.y }))));
    const rows = [];
    for (let y = b.y0 + need; y <= b.y1 - need + 1e-9; y += st) {
      const xs = []; loops.forEach(l => { for (let i = 0, j = l.length - 1; i < l.length; j = i++) { const a = l[i], c = l[j]; if ((a.y > y) !== (c.y > y)) xs.push(a.x + (y - a.y) * (c.x - a.x) / (c.y - a.y)); } });
      xs.sort((a, c) => a - c); const runs = [];
      for (let i = 0; i + 1 < xs.length; i += 2) { let s0 = null, last = null; for (let x = xs[i] + need; x <= xs[i + 1] - need + 1e-9; x += sx) { if (ok(x, y)) { if (s0 === null) s0 = x; last = x; } else if (s0 !== null) { runs.push([s0, last]); s0 = null; } } if (s0 !== null) runs.push([s0, last]); }
      rows.push(runs.map(([a, c]) => [{ x: a, y }, { x: c, y }]));
    }
    // Back and forth: every other row runs right to left, and a run joins the next one when the step between is clear.
    let cur = null;
    rows.forEach((runs, ri) => {
      (ri % 2 ? runs.slice().reverse().map(r => r.slice().reverse()) : runs).forEach(r => {
        if (cur) { const e = cur[cur.length - 1], s = r[0], d = Math.hypot(s.x - e.x, s.y - e.y); if (d < st * 1.6 && ok((s.x + e.x) / 2, (s.y + e.y) / 2) && ok(s.x, e.y)) { cur.push({ x: s.x, y: e.y }, ...r); return; } clear.push(cur); }
        cur = r.slice();
      });
    });
    if (cur) clear.push(cur);
  }
  const res = { v: [...vflat, ...v], clear, flat, wide, huge, deep: Math.max(deep, clear.length ? fd : 0), flatDepth: fd, rmax, tanH };
  if (vcPlanCache.size > 12) vcPlanCache.delete(vcPlanCache.keys().next().value);
  vcPlanCache.set(key, res); return res;
}

// Lines a set distance in from the outlines, through the points where cond(point) holds.
function vcRings(chains, off, cond) {
  const out = [];
  chains.forEach(ch => {
    const runs = []; let cur = null;
    ch.forEach(p => { if (cond(p)) (cur || (cur = [])).push({ x: p.x + p.nx * off, y: p.y + p.ny * off }); else if (cur) { runs.push(cur); cur = null; } });
    if (cur) { if (cur.length === ch.length) { cur.push({ ...cur[0] }); runs.push(cur); } else if (runs.length && cond(ch[0])) runs[0] = [...cur, ...runs[0]]; else runs.push(cur); }
    runs.forEach(r => out.push(r.length > 1 ? vcDP(r, 0.0005) : [r[0], { ...r[0] }]));
  });
  return out;
}

/* ----- Boards ----- */
const vcBoards = () => (S.job && S.job.carves) || [];
const vcBoard = () => vcBoards().find(b => b.id === ui.vcBoard) || vcBoards()[0] || null;
const vcVbits = () => CNC_LIB.tools.filter(t => t.type === 'vbit');
const vcStraights = () => CNC_LIB.tools.filter(t => t.type !== 'vbit' && t.type !== 'drill').sort((a, b) => a.dia - b.dia);
const vcAngle = t => +(t && t.angle) || 90;
const vcCutTool = () => (CNC_LIB.tools.find(t => t.type === 'cutout') || vcStraights().slice(-1)[0] || {}).id || '';
// The parts of this room's cabinets a board can be: the ones that show (doors, fronts, panels, ends, shelves).
function vcRoomParts() {
  const out = [];
  (S.cabinets || []).forEach(c => { let b; try { b = buildParts(c); } catch (_) { return; } b.parts.filter(p => p.cabId === c.id && !/box|back|bottom|nailer|stretcher|toe|side|rail|cleat|divider/i.test(p.name)).forEach(p => out.push({ v: c.id + '|' + peKeyOf(p), l: `${LBL[c.id] || c.name} · ${p.name} (${fmtLen(p.L, 1)} × ${fmtLen(p.W, 1)})`, p })); });
  return out;
}
// Size of the board: its own, or the part's when it is a part.
function vcSize(b) {
  if (b.part) { const p = vcRoomParts().find(x => x.v === b.part); if (p) return { L: p.p.L, W: p.p.W, T: p.p.T, outline: p.p.outline || null, name: p.l }; }
  return { L: +b.L || 24, W: +b.W || 12, T: +b.T || 0.75, outline: null };
}
function vcNewBoard() {
  const n = vcBoards().length + 1, vb = vcVbits()[0];
  return { id: uid('vc'), name: 'Sign ' + n, L: 24, W: 12, T: 0.75, part: '', vbit: vb ? vb.id : '', depth: 0, clear: '', cutout: false, cutTool: vcCutTool(),
    items: [{ id: uid('vi'), kind: 'text', text: 'YOUR TEXT', font: 'Georgia', bold: true, italic: false, h: 2, x: 12, y: 6, angle: 0 }] };
}
function vcBoardPlan(b) {
  const t = cncTool(b.vbit) || vcVbits()[0], ct = b.clear && cncTool(b.clear);
  const loops = []; (b.items || []).forEach(it => { if (!it.off) loops.push(...vcItemLoops(it)); });
  return vcPlan(loops, { angle: vcAngle(t), dia: t ? t.dia / 25.4 : 0.5, depth: +b.depth || 0, clearDia: ct ? ct.dia / 25.4 : 0, stepover: ct ? (ct.stepover || 40) / 100 : 0.4 });
}

/* ----- G-code ----- */
const vcMach = () => ({ gUnits: 'in', gExt: 'nc', gSafe: 12.7, gZero: 'top', gOrigin: 'bl', gChange: 'atc', ...CNC_LIB.machine });
// Passes: each pass goes no deeper than the tool's pass depth.
function vcLevels(tool, depthIn) { const mm = typeof cncPasses === 'function' && tool ? cncPasses(tool.id, depthIn * 25.4) : [depthIn * 25.4]; return mm.map(v => v / 25.4); }
// The cut-out around the board, outside the edge, in passes, with tabs on the last ones when the machine uses tabs.
function vcCutout(sz, tool, M) {
  const r = tool.dia / 25.4 / 2, base = sz.outline && sz.outline.length >= 3 ? sz.outline : [{ x: 0, y: 0 }, { x: sz.L, y: 0 }, { x: sz.L, y: sz.W }, { x: 0, y: sz.W }];
  let ring = offsetPath(base, vcArea(base) > 0 ? -r : r, true);
  // Climb cuts an outside edge clockwise with a right-hand spindle.
  if ((vcArea(ring) > 0) === !!M.climb) ring = ring.slice().reverse();
  const depth = sz.T + (+tool.thruExtra || 0.3) / 25.4, tabH = (+M.tabH || 3) / 25.4, tabL = (+M.tabLen || 10) / 25.4 + 2 * r, tabTop = -(sz.T - tabH);
  const edges = ring.map((p, i) => ({ i, len: Math.hypot(ring[(i + 1) % ring.length].x - p.x, ring[(i + 1) % ring.length].y - p.y) })).sort((a, b) => b.len - a.len).filter(e => e.len > tabL * 3).slice(0, 4).map(e => e.i);
  return vcLevels(tool, depth).map(d => {
    const tabs = M.tabs && d > sz.T - tabH + 1e-6, out = [];
    ring.forEach((p, i) => {
      out.push({ x: p.x, y: p.y, z: -d });
      if (tabs && edges.includes(i)) {
        const q = ring[(i + 1) % ring.length], len = Math.hypot(q.x - p.x, q.y - p.y), ux = (q.x - p.x) / len, uy = (q.y - p.y) / len, a = len / 2 - tabL / 2, b = len / 2 + tabL / 2;
        out.push({ x: p.x + ux * a, y: p.y + uy * a, z: -d }, { x: p.x + ux * a, y: p.y + uy * a, z: tabTop }, { x: p.x + ux * b, y: p.y + uy * b, z: tabTop }, { x: p.x + ux * b, y: p.y + uy * b, z: -d });
      }
    });
    out.push({ ...out[0] }); return out;
  });
}
// The toolpaths for a board, in run order: clearing, V-carve, cut-out.
function vcBoardOps(b) {
  const sz = vcSize(b), plan = vcBoardPlan(b), ops = [], vt = cncTool(b.vbit) || vcVbits()[0], ct = b.clear && cncTool(b.clear), M = vcMach();
  if (plan.clear.length && ct) ops.push({ tool: ct, label: 'Clear the flat areas', paths: vcLevels(ct, plan.flatDepth).flatMap(d => plan.clear.map(l => l.map(p => ({ x: p.x, y: p.y, z: -d })))) });
  if (plan.v.length && vt) {
    const lv = vcLevels(vt, plan.deep), paths = [];
    lv.forEach((d, i) => { const prev = i ? lv[i - 1] : 0; plan.v.forEach(l => { if (i && !l.some(p => -p.z > prev + 1e-4)) return; paths.push(l.map(p => ({ x: p.x, y: p.y, z: Math.max(p.z, -d) }))); }); });
    ops.push({ tool: vt, label: 'V-carve', paths });
  }
  const cut = b.cutout && cncTool(b.cutTool || vcCutTool());
  if (cut && !b.part) ops.push({ tool: cut, label: 'Cut out', paths: vcCutout(sz, cut, M) });
  return { ops, sz, plan };
}
// Paths ordered so the bit travels the least between them.
function vcOrder(paths) {
  const left = paths.slice(), out = []; let at = { x: 0, y: 0 };
  while (left.length) { let bi = 0, bd = Infinity; left.forEach((p, i) => { const d = (p[0].x - at.x) ** 2 + (p[0].y - at.y) ** 2; if (d < bd) { bd = d; bi = i; } }); const p = left.splice(bi, 1)[0]; out.push(p); at = p[p.length - 1]; }
  return out;
}
function vcGcode(ops, sz, name) {
  const M = vcMach(), inch = M.gUnits !== 'mm', k = inch ? 1 : 25.4, dp = inch ? 4 : 3;
  const f = v => { const s = (v * k).toFixed(dp).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); return s === '-0' ? '0' : s; };
  const rate = mm => (inch ? mm / 25.4 : mm).toFixed(1).replace(/\.0$/, '');
  const ox = M.gOrigin === 'center' ? sz.L / 2 : 0, oy = M.gOrigin === 'center' ? sz.W / 2 : 0, zOff = M.gZero === 'bed' ? sz.T : 0;
  const safe = (+M.gSafe || 12.7) / 25.4 + zOff, clr = Math.min(0.1, safe - zOff) + zOff;
  const head = (tools) => [`(${name})`, `(Made by Cabinet Designer · ${new Date().toLocaleDateString()})`, `(Board ${f(sz.L)} x ${f(sz.W)} x ${f(sz.T)} ${inch ? 'in' : 'mm'}, X0 Y0 at the ${M.gOrigin === 'center' ? 'middle' : 'bottom left corner'}, Z0 on the ${M.gZero === 'bed' ? 'spoilboard' : 'top of the board'})`,
    ...tools.map(t => `(T${t.number} ${t.id}: ${t.type === 'vbit' ? vcAngle(t) + ' deg V-bit, ' : ''}${f(t.dia / 25.4)} dia)`), inch ? 'G20' : 'G21', 'G90 G17 G94', `G0 Z${f(safe)}`];
  const files = [], groups = [];
  ops.forEach(o => { const g = groups[groups.length - 1]; if (g && g.tool.id === o.tool.id) g.ops.push(o); else groups.push({ tool: o.tool, ops: [o] }); });
  let lines = head(groups.map(g => g.tool));
  groups.forEach((g, gi) => {
    const t = g.tool;
    if (M.gChange === 'files' && gi) { lines.push(`G0 Z${f(safe)}`, 'M5', 'M30'); files.push(lines); lines = head([t]); }
    if (M.gChange === 'pause' && gi) lines.push(`G0 Z${f(safe)}`, 'M5', `(Put in T${t.number} ${t.id}, set Z0, then press start)`, 'M0');
    else if (M.gChange === 'atc') lines.push(`T${t.number} M6`);
    else if (!gi || M.gChange === 'files') lines.push(`(Tool: T${t.number} ${t.id})`);
    lines.push(`S${Math.round(+t.rpm || 18000)} M3`);
    let at = null;
    g.ops.forEach(o => {
      lines.push(`(${o.label})`);
      vcOrder(o.paths).forEach(path => {
        const P = path.map(p => ({ x: p.x - ox, y: p.y - oy, z: p.z + zOff }));
        lines.push(`G0 Z${f(safe)}`, `G0 X${f(P[0].x)} Y${f(P[0].y)}`, `G0 Z${f(clr)}`, `G1 Z${f(P[0].z)} F${rate(+t.plunge || 2000)}`);
        let lx = P[0].x, ly = P[0].y, lz = P[0].z, first = true;
        P.slice(1).forEach(p => {
          const w = []; if (f(p.x) !== f(lx)) w.push('X' + f(p.x)); if (f(p.y) !== f(ly)) w.push('Y' + f(p.y)); if (f(p.z) !== f(lz)) w.push('Z' + f(p.z));
          if (!w.length) return; lines.push(`G1 ${w.join(' ')}${first ? ' F' + rate(+t.feed || 6000) : ''}`); first = false; lx = p.x; ly = p.y; lz = p.z;
        });
        at = P[P.length - 1];
      });
    });
    lines.push(`G0 Z${f(safe)}`);
  });
  lines.push('M5', ...(M.gHome === false ? [] : [`G0 X${f(-ox)} Y${f(-oy)}`]), 'M30');
  files.push(lines);
  return files.map(l => l.join('\n') + '\n');
}
// Minutes to run, from the feed and plunge rates (rapids not counted).
function vcMinutes(ops) {
  let m = 0; ops.forEach(o => o.paths.forEach(p => { for (let i = 1; i < p.length; i++) m += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y, p[i].z - p[i - 1].z) * 25.4 / (+o.tool.feed || 6000); m += Math.abs(p[0].z) * 25.4 / (+o.tool.plunge || 2000); }));
  return m;
}
function vcSaveGcode(b) {
  const r = vcBoardOps(b); if (!r.ops.length) { flash('Nothing to carve yet. Add text, a picture or a shape.'); return; }
  const M = vcMach(), files = vcGcode(r.ops, r.sz, b.name || 'Sign'), ext = String(M.gExt || 'nc').replace(/^\./, '') || 'nc', base = `${fileSafe(S.job.name) || 'job'} ${fileSafe(b.name || 'sign')}`.replace(/\s+/g, ' ').trim();
  const groups = []; r.ops.forEach(o => { if (!groups.length || groups[groups.length - 1] !== o.tool.id) groups.push(o.tool.id); });
  files.forEach((text, i) => saveFile(new Blob([text], { type: 'text/plain' }), files.length > 1 ? `${base} ${i + 1} ${fileSafe(groups[i] || '')}.${ext}` : `${base}.${ext}`, 'Cabinet Designer/G-code'));
}

/* ----- The preview: the carving shaded like real wood, lit from the top left ----- */
function vcDrawPreview(cv, b, r, showPaths) {
  const { sz, plan } = r, ppi = Math.max(8, Math.min(140, 1500 / Math.max(sz.L, sz.W))), w = Math.max(10, Math.round(sz.L * ppi)), h = Math.max(10, Math.round(sz.W * ppi));
  cv.width = w; cv.height = h; const c = cv.getContext('2d'), H = new Float32Array(w * h), tanH = plan.tanH;
  const stamp = (x, y, d, flatR) => {
    const R = flatR || d * tanH, px = x * ppi, py = (sz.W - y) * ppi, Rp = R * ppi;
    const i0 = Math.max(0, Math.floor(px - Rp)), i1 = Math.min(w - 1, Math.ceil(px + Rp)), j0 = Math.max(0, Math.floor(py - Rp)), j1 = Math.min(h - 1, Math.ceil(py + Rp));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dd = Math.hypot(i + 0.5 - px, j + 0.5 - py) / ppi; if (dd > R) continue; const dep = flatR ? d : d - dd / tanH; const k = j * w + i; if (dep > H[k]) H[k] = dep; }
  };
  const walk = (path, fn) => { for (let i = 1; i < path.length; i++) { const a = path[i - 1], e = path[i], n = Math.max(1, Math.ceil(Math.hypot(e.x - a.x, e.y - a.y) * ppi * 1.5)); for (let s = i === 1 ? 0 : 1; s <= n; s++) { const t = s / n; fn(a.x + (e.x - a.x) * t, a.y + (e.y - a.y) * t, a.z + (e.z - a.z) * t); } } };
  r.ops.forEach(o => {
    if (o.label === 'V-carve') plan.v.forEach(p => walk(p, (x, y, z) => { if (z < 0) stamp(x, y, -z); }));
    else if (o.label === 'Clear the flat areas') plan.clear.forEach(p => walk(p.map(q => ({ ...q, z: -plan.flatDepth })), (x, y) => stamp(x, y, plan.flatDepth, o.tool.dia / 25.4 / 2)));
  });
  const img = c.createImageData(w, h), D = img.data, mx = Math.max(0.01, ...[plan.deep]);
  const L = [-0.55, -0.6, 0.58], ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
  const g = 1 / ppi;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, hx = ((i < w - 1 ? H[k + 1] : H[k]) - (i > 0 ? H[k - 1] : H[k])) / (2 * g), hy = ((j < h - 1 ? H[k + w] : H[k]) - (j > 0 ? H[k - w] : H[k])) / (2 * g);
    const nl = Math.hypot(hx, hy, 1), lam = Math.max(0, (hx * L[0] + hy * L[1] + L[2]) / nl) / L[2];
    const grain = 0.035 * Math.sin((j / ppi * 9 + 1.6 * Math.sin(i / ppi * 0.9) + 0.5 * Math.sin(i / ppi * 3.1 + j / ppi * 0.7)) * 2.2) + 0.02 * Math.sin(j / ppi * 41 + Math.sin(i / ppi * 2) * 3);
    const dep = H[k] / mx, cut = H[k] > 1e-4;
    const base = cut ? [188 - 28 * dep, 140 - 26 * dep, 92 - 20 * dep] : [228, 192, 142];
    const s = Math.min(1.22, 0.2 + 0.8 * lam) * (1 + grain);
    D[k * 4] = base[0] * s; D[k * 4 + 1] = base[1] * s; D[k * 4 + 2] = base[2] * s; D[k * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  if (sz.outline) { c.save(); c.globalCompositeOperation = 'destination-in'; c.beginPath(); sz.outline.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p.x * ppi, (sz.W - p.y) * ppi)); c.closePath(); c.fill(); c.restore(); }
  if (showPaths) {
    const line = (path, col) => { c.strokeStyle = col; c.beginPath(); path.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p.x * ppi, (sz.W - p.y) * ppi)); c.stroke(); };
    c.lineWidth = 1; plan.clear.forEach(p => line(p, 'rgba(37,99,235,.75)')); plan.v.forEach(p => line(p, 'rgba(225,29,99,.9)'));
    const cut = r.ops.find(o => o.label === 'Cut out'); if (cut) { c.setLineDash([6, 4]); line(cut.paths[cut.paths.length - 1], 'rgba(22,163,74,.95)'); c.setLineDash([]); }
  }
  return ppi;
}

/* ----- The Carve tab ----- */
const vcF = v => (ui.vcMM ? String(+(v * 25.4).toFixed(2)) : fmtLen(v, 1));
const vcIn = (label, k, v, extra) => `<label class="f"><span>${label}</span><input class="vc-in" data-k="${k}" value="${esc(v === undefined || v === '' || v === null ? '' : typeof v === 'number' ? vcF(v) : String(v))}" aria-label="${esc(label)}"${extra || ''}></label>`;
const vcNum = (label, k, v, extra) => `<label class="f"><span>${label}</span><input type="number" step="any" class="vc-in vc-raw" data-k="${k}" value="${esc(v ?? '')}" aria-label="${esc(label)}"${extra || ''}></label>`;
const vcSel = (label, k, v, opts) => `<label class="f"><span>${label}</span><select class="vc-in vc-raw" data-k="${k}" aria-label="${esc(label)}">${opts.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(v ?? '') ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`;
const vcChk = (label, k, v) => `<label class="f chk"><input type="checkbox" class="vc-in" data-k="${k}"${v ? ' checked' : ''}> <span>${label}</span></label>`;
const vcFold = (k, title, body) => { const f = ui.vcFold || (ui.vcFold = { board: false, bits: false, gcode: true }), shut = !!f[k]; return `<div class="vc-sec"><button class="vc-sech" data-act="vc-fold" data-id="${k}" aria-expanded="${!shut}"><span aria-hidden="true">${shut ? '▸' : '▾'}</span>${title}</button>${shut ? '' : `<div class="vc-secb">${body}</div>`}</div>`; };
const vcItemName = it => it.kind === 'text' ? `“${String(it.text || '').split('\n')[0].slice(0, 24)}”` : it.kind === 'shape' ? (VC_SHAPES.find(s => s[0] === it.shape) || [0, 'Shape'])[1] : (it.name || 'Picture');
let vcLastImg = null; // the last opened picture, so the cut-off can change without opening it again

function renderCarve() {
  const el = $('#tab-carve'); if (!el) return;
  const B = vcBoards(), b = vcBoard();
  if (b && ui.vcBoard !== b.id) ui.vcBoard = b.id;
  const head = `<div class="pagehead"><div><h2>Carve</h2><p class="note">V-carve signs, logos, text and shapes, then save G-code for the router. Carve a part from this room the same way, like a door.</p></div>
    <div class="row-actions">${B.length ? `<select class="vc-pick" aria-label="Board">${B.map(x => `<option value="${x.id}"${x.id === (b && b.id) ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
    <button class="btn" data-act="vc-new">${icon('plus')}New sign</button>${b ? `<button class="btn" data-act="vc-del" title="Delete this sign">${icon('trash')}</button><button class="btn primary" data-act="vc-gcode">${icon('download')}Save G-code</button>` : ''}</div></div>`;
  if (!b) { el.innerHTML = `${head}<div class="card cardbody vc-empty"><h3>Nothing to carve yet</h3><p>Start a sign, then add text in any font on this computer, a picture or logo, a DXF drawing or a shape.</p><button class="btn primary" data-act="vc-new">${icon('plus')}New sign</button></div>`; return; }
  const sel = (b.items || []).find(i => i.id === ui.vcSel), sz = vcSize(b), vb = vcVbits(), st = vcStraights();
  if (!vb.length) b.vbit = '';
  const vbOpts = vb.length ? vb.map(t => ({ v: t.id, l: `${t.id} (${vcAngle(t)}°, ${fmtLen(t.dia / 25.4, 1)})` })) : [{ v: '', l: 'Add a V-bit in Libraries › CNC tools' }];
  const parts = vcRoomParts();
  const boardBox = `${vcIn('Name', 'b.name', b.name)}
    ${vcSel('Carve on', 'b.part', b.part || '', [{ v: '', l: 'Its own board (a sign)' }, ...parts.map(p => ({ v: p.v, l: p.l }))])}
    ${b.part ? `<div class="muted vc-small">${fmtLen(sz.L, 1)} × ${fmtLen(sz.W, 1)} × ${fmtLen(sz.T, 1)}, from the part. Cut the part out with the rest of the job; this carves it.</div>` : `<div class="vc-row3">${vcIn('Width', 'b.L', b.L)}${vcIn('Height', 'b.W', b.W)}${vcIn('Thickness', 'b.T', b.T)}</div>
    ${vcChk('Cut the sign out at the end', 'b.cutout', b.cutout)}${b.cutout ? vcSel('Cut-out bit', 'b.cutTool', b.cutTool || vcCutTool(), st.map(t => ({ v: t.id, l: `${t.id} (${fmtLen(t.dia / 25.4, 1)})` }))) : ''}`}`;
  const bits = `${vcSel('V-bit', 'b.vbit', b.vbit || (vb[0] || {}).id || '', vbOpts)}
    ${vcIn('Max depth (blank = as deep as the bit goes)', 'b.depth', +b.depth || '')}
    ${vcSel('Clear wide areas with', 'b.clear', b.clear || '', [{ v: '', l: 'Nothing (V-bit only)' }, ...st.map(t => ({ v: t.id, l: `${t.id} (${fmtLen(t.dia / 25.4, 1)})` }))])}`;
  const M = vcMach();
  const gset = `<div class="vc-row2">${vcSel('Units', 'm.gUnits', M.gUnits, [{ v: 'in', l: 'Inches (G20)' }, { v: 'mm', l: 'Millimeters (G21)' }])}${vcIn('File type', 'm.gExt', M.gExt)}</div>
    <div class="vc-row2">${vcSel('X0 Y0 at', 'm.gOrigin', M.gOrigin, [{ v: 'bl', l: 'Bottom left corner' }, { v: 'center', l: 'Middle of the board' }])}${vcSel('Z0 on', 'm.gZero', M.gZero, [{ v: 'top', l: 'Top of the board' }, { v: 'bed', l: 'Spoilboard' }])}</div>
    <div class="vc-row2">${vcNum('Safe height (mm)', 'm.gSafe', M.gSafe)}${vcSel('Tool changes', 'm.gChange', M.gChange, [{ v: 'atc', l: 'Tool changer (T# M6)' }, { v: 'pause', l: 'Stop for a hand change (M0)' }, { v: 'files', l: 'One file per bit' }])}</div>
    <div class="note">Feeds, spindle speed and tool numbers come from Libraries › CNC tools. These settings are kept for every job.</div>`;
  const designForm = sel ? vcItemForm(sel) : `<div class="vc-hint">${(b.items || []).length ? 'Click a design on the board to change it, or drag it to move it.' : 'Add a design to start.'}</div>`;
  const list = (b.items || []).length ? `<div class="vc-list">${b.items.map(it => `<button class="vc-li${it.id === ui.vcSel ? ' on' : ''}${it.off ? ' off' : ''}" data-act="vc-sel" data-id="${it.id}">${esc(vcItemName(it))}</button>`).join('')}</div>` : '';
  el.innerHTML = `${head}
    <div class="vc-layout">
      <div class="card vc-stage">
        <div class="vc-bar"><div class="seg sm" role="group" aria-label="View">${[['shade', 'Carved'], ['paths', 'Toolpaths']].map(([k, l]) => `<button data-act="vc-view" data-id="${k}" aria-pressed="${(ui.vcView || 'shade') === k}">${l}</button>`).join('')}</div>
          <div class="seg sm" role="group" aria-label="Units">${[['in', 'Inches'], ['mm', 'mm']].map(([k, l]) => `<button data-act="vc-units" data-id="${k}" aria-pressed="${(ui.vcMM ? 'mm' : 'in') === k}">${l}</button>`).join('')}</div>
          <span class="grow"></span><span class="vc-stats" id="vc-stats">Working…</span></div>
        <div class="vc-view" id="vc-view"><div class="vc-wrap" id="vc-wrap" style="aspect-ratio:${r3(sz.L)} / ${r3(sz.W)}"><canvas id="vc-canvas" aria-label="Carving preview"></canvas><svg id="vc-over" viewBox="0 0 ${r3(sz.L)} ${r3(sz.W)}" preserveAspectRatio="none"></svg></div></div>
        <div id="vc-warn"></div>
      </div>
      <div class="card vc-side">
        <div class="vc-add"><span class="eyebrow">Add</span><div class="row-actions">
          <button class="btn sm" data-act="vc-add" data-id="text">Text</button>
          <button class="btn sm" data-act="vc-add" data-id="art">Picture or logo</button>
          <button class="btn sm" data-act="vc-add" data-id="dxf">DXF</button>
          <select class="vc-addshape" aria-label="Add a shape"><option value="">Shape…</option>${VC_SHAPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}${(S.shapeLib || []).length ? `<optgroup label="Shape library">${S.shapeLib.map(l => `<option value="lib:${esc(l.id)}">${esc(l.name)}</option>`).join('')}</optgroup>` : ''}</select></div>
          <div class="note">Put a shape around text to carve the background and leave the letters raised.</div></div>
        ${list}
        <div class="vc-form">${designForm}</div>
        ${vcFold('board', b.part ? 'Part' : 'Board', boardBox)}
        ${vcFold('bits', 'Bits', bits)}
        ${vcFold('gcode', 'G-code settings', gset)}
      </div>
    </div>`;
  requestAnimationFrame(vcPaint);
}
function vcItemForm(it) {
  const k = 'i.', fonts = [...new Set([...VC_FONTS, it.font || 'Arial'])];
  let f = '';
  if (it.kind === 'text') {
    const missing = it.font && !vcFontThere(it.font);
    f = `<label class="f vc-wide"><span>Text</span><textarea class="vc-in" data-k="i.text" rows="2" aria-label="Text">${esc(it.text || '')}</textarea></label>
      <label class="f vc-wide"><span>Font</span><input class="vc-in" data-k="i.font" list="vc-fonts" value="${esc(it.font || 'Arial')}" aria-label="Font"><datalist id="vc-fonts">${fonts.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
      ${missing ? `<div class="warnbox vc-wide">“${esc(it.font)}” isn't on this computer, so Arial is used. Type the font's name as Windows shows it.</div>` : ''}
      <div class="vc-row3 vc-wide">${vcChk('Bold', k + 'bold', it.bold)}${vcChk('Italic', k + 'italic', it.italic)}${vcSel('Line up', k + 'align', it.align || 'center', [{ v: 'left', l: 'Left' }, { v: 'center', l: 'Center' }, { v: 'right', l: 'Right' }])}</div>`;
  } else if (it.kind === 'art') {
    f = `<div class="vc-wide muted vc-small">${esc(it.name || 'Picture')}${it.src === 'dxf' ? ' (DXF)' : ''}</div>
      ${it.src !== 'dxf' && vcLastImg && vcLastImg.id === it.id ? `<div class="vc-row2 vc-wide"><label class="f"><span>Dark cut-off</span><input type="range" min="0.05" max="0.95" step="0.01" class="vc-in vc-raw" data-k="i.th" value="${esc(String(it.th || 0.5))}" aria-label="Dark cut-off"></label>${vcChk('Carve the light parts', k + 'invert', it.invert)}</div>` : ''}`;
  } else {
    f = `${vcSel('Shape', k + 'shape', it.shape, VC_SHAPES.map(([v, l]) => ({ v, l })))}${it.shape === 'rrect' || it.shape === 'border' ? vcIn('Corner radius', k + 'r', it.r === undefined ? '' : +it.r) : ''}${it.shape === 'border' ? vcIn('Border width', k + 'band', +it.band || 0.5) : ''}`;
  }
  const sz = vcItemSize(it);
  return `<div class="vc-formhead"><b>${esc(vcItemName(it))}</b><span class="grow"></span><button class="btn sm pe-x" data-act="vc-desel" aria-label="Done" title="Done">×</button></div>
    <div class="vc-grid">${f}
      ${vcIn(it.kind === 'text' ? 'Letter height' : 'Height', k + 'h', +it.h || '')}${vcIn('Width', k + 'w', it.kind === 'shape' ? +it.w || '' : r3(sz.w))}
      ${vcIn('Across (middle)', k + 'x', +it.x || 0)}${vcIn('Up (middle)', k + 'y', +it.y || 0)}
      ${vcNum('Angle°', k + 'angle', +it.angle || 0)}${vcChk('Mirror', k + 'flip', it.flip)}</div>
    <div class="row-actions"><button class="btn sm" data-act="vc-center" data-id="x">Center across</button><button class="btn sm" data-act="vc-center" data-id="y">Center up</button>${it.kind !== 'shape' ? '<button class="btn sm" data-act="vc-fit">Fit the board</button>' : ''}<button class="btn sm" data-act="vc-dup">Duplicate</button><span class="grow"></span><button class="btn sm danger" data-act="vc-rm">Delete</button></div>`;
}
// Works out the carving and draws it. Big designs take a moment, so it runs after the page is drawn.
let vcPaintRun = 0;
function vcPaint() {
  const b = vcBoard(), cv = $('#vc-canvas'), over = $('#vc-over'); if (!b || !cv || !over) return;
  const run = ++vcPaintRun;
  setTimeout(() => {
    if (run !== vcPaintRun || !cv.isConnected) return;
    let r; try { r = vcBoardOps(b); } catch (e) { $('#vc-stats').textContent = 'Could not work out the carving: ' + e.message; return; }
    vcDrawPreview(cv, b, r, ui.vcView === 'paths');
    const sz = r.sz, W = sz.W;
    over.innerHTML = (b.items || []).filter(it => !it.off).map(it => {
      const s = vcItemSize(it), a = +it.angle || 0, x = +it.x || 0, y = W - (+it.y || 0);
      return `<g class="vc-it${it.id === ui.vcSel ? ' on' : ''}" data-vc-item="${it.id}" transform="translate(${r3(x)} ${r3(y)}) rotate(${-a})"><rect x="${r3(-s.w / 2)}" y="${r3(-s.h / 2)}" width="${r3(Math.max(0.05, s.w))}" height="${r3(Math.max(0.05, s.h))}"/></g>`;
    }).join('');
    const T = vcMinutes(r.ops), tl = r.ops.map(o => o.tool.id).filter((v, i, a) => a.indexOf(v) === i);
    $('#vc-stats').textContent = r.ops.length ? `${fmtLen(r.plan.deep, 1)} deep · ${tl.join(', ')} · about ${T < 1 ? '1' : Math.round(T)} min` : 'Nothing to carve';
    const warn = [];
    if (!vcVbits().length) warn.push('There is no V-bit in Libraries › CNC tools. Add one with its angle.');
    if (r.plan.huge) warn.push('Some areas are very wide for the V-bit alone: it clears only near the edges. Pick a bit to clear wide areas.');
    const off = (b.items || []).some(it => { if (it.off) return false; const L = vcItemLoops(it), bx = vcBox(L); return L.length && (bx.x0 < -1e-3 || bx.y0 < -1e-3 || bx.x1 > sz.L + 1e-3 || bx.y1 > sz.W + 1e-3); });
    if (off) warn.push('A design runs off the board.');
    if (r.plan.deep > sz.T * 0.8) warn.push(`The carving goes ${fmtLen(r.plan.deep, 1)} deep, close to the board's ${fmtLen(sz.T, 1)} thickness. Set a max depth.`);
    $('#vc-warn').innerHTML = warn.map(w => `<div class="warnbox">${esc(w)}</div>`).join('');
  }, 0);
}

/* ----- Changes ----- */
function vcSetVal(k, raw, t) {
  const b = vcBoard(); if (!b) return;
  const [o, f] = [k.slice(0, 1), k.slice(2)];
  if (o === 'm') { const M = CNC_LIB.machine; M[f] = f === 'gSafe' ? (+raw || 12.7) : String(raw).trim(); saveCncLib(); renderCarve(); return; }
  const lenK = ['L', 'W', 'T', 'depth', 'h', 'w', 'x', 'y', 'r', 'band'];
  const val = t.type === 'checkbox' ? t.checked : t.classList.contains('vc-raw') ? (t.type === 'number' || t.type === 'range' ? (isFinite(+raw) ? +raw : 0) : raw) : lenK.includes(f) ? (String(raw).trim() === '' ? '' : (ui.vcMM && /^-?\d*\.?\d+$/.test(String(raw).trim()) ? +raw / 25.4 : parseLen(raw))) : f === 'text' ? String(raw).replace(/\r/g, '') : String(raw).trim();
  if (lenK.includes(f) && val !== '' && !isFinite(val)) { flash('Type a size, like 2, 1 1/2 or 38mm.'); renderCarve(); return; }
  mutate(() => {
    if (o === 'b') {
      const was = vcSize(b); b[f] = typeof val === 'number' ? r3(val) : val; if (f === 'part' && val) b.cutout = false;
      // A new board size keeps each design in the same place relative to the board.
      const now = vcSize(b); if (was.L > 0 && was.W > 0 && (now.L !== was.L || now.W !== was.W)) (b.items || []).forEach(it => { it.x = r3((+it.x || 0) * now.L / was.L); it.y = r3((+it.y || 0) * now.W / was.W); });
    }
    else {
      const it = (b.items || []).find(i => i.id === ui.vcSel); if (!it) return;
      if (f === 'w' && it.kind !== 'shape') { it.w = val === '' ? '' : r3(val); if (val !== '' && !(+it.h > 0)) it.h = 1; }
      else if (f === 'h' && it.kind !== 'shape' && val !== '' && +it.w > 0) { const k2 = val / (+it.h || 1); it.w = r3(it.w * k2); it.h = r3(val); }
      else it[f] = typeof val === 'number' ? r3(val) : val;
      if (it.kind === 'art' && (f === 'th' || f === 'invert') && vcLastImg && vcLastImg.id === it.id) { const tr = vcTraceImage(vcLastImg.im, it.th, it.invert); it.loops = vcRound4(tr.loops); it.bw = r3(tr.bw); it.bh = 1; }
    }
  }, true);
}
const vcRound4 = loops => loops.map(l => l.map(p => ({ x: Math.round(p.x * 1e4) / 1e4, y: Math.round(p.y * 1e4) / 1e4 })));
document.addEventListener('change', ev => {
  const t = ev.target; if (!t.closest || !t.closest('#tab-carve')) return;
  if (t.classList.contains('vc-pick')) { ui.vcBoard = t.value; ui.vcSel = ''; renderCarve(); return; }
  if (t.classList.contains('vc-addshape') && t.value) { vcAct('vc-add', t.value); return; }
  if (t.classList.contains('vc-in')) vcSetVal(t.dataset.k, t.value, t);
});
function vcPickFile(accept, cb) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.style.display = 'none'; document.body.appendChild(inp);
  inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) cb(f); }; inp.click();
}
function vcAddItem(it) {
  const b = vcBoard(); if (!b) return; const sz = vcSize(b);
  if (it.x === undefined) { it.x = r3(sz.L / 2); it.y = r3(sz.W / 2); }
  mutate(() => { (b.items = b.items || []).push(it); ui.vcSel = it.id; });
}
function vcAct(a, id) {
  const b = vcBoard(), it = b && (b.items || []).find(i => i.id === ui.vcSel);
  switch (a) {
    case 'vc-new': { const nb = vcNewBoard(); mutate(() => { (S.job.carves = S.job.carves || []).push(nb); ui.vcBoard = nb.id; ui.vcSel = ''; }); return true; }
    case 'vc-del': if (b && confirmDel(b.name)) mutate(() => { S.job.carves = vcBoards().filter(x => x.id !== b.id); ui.vcBoard = ''; ui.vcSel = ''; }); return true;
    case 'vc-gcode': if (b) vcSaveGcode(b); return true;
    case 'vc-view': ui.vcView = id; renderCarve(); return true;
    case 'vc-units': ui.vcMM = id === 'mm'; renderCarve(); return true;
    case 'vc-fold': (ui.vcFold = ui.vcFold || {})[id] = !ui.vcFold[id]; renderCarve(); return true;
    case 'vc-sel': ui.vcSel = id; renderCarve(); return true;
    case 'vc-desel': ui.vcSel = ''; renderCarve(); return true;
    case 'vc-rm': if (it) mutate(() => { b.items = b.items.filter(x => x !== it); ui.vcSel = ''; }); return true;
    case 'vc-dup': if (it) { const c = clone(it); c.id = uid('vi'); c.x = r3((+c.x || 0) + 0.5); c.y = r3((+c.y || 0) - 0.5); if (vcLastImg && vcLastImg.id === it.id) vcLastImg = null; mutate(() => { b.items.push(c); ui.vcSel = c.id; }); } return true;
    case 'vc-center': if (it) { const sz = vcSize(b); mutate(() => { it[id] = r3((id === 'x' ? sz.L : sz.W) / 2); }); } return true;
    case 'vc-fit': if (it) { const sz = vcSize(b), s = vcItemSize(it), m = Math.min(sz.L, sz.W) * 0.08, k = Math.min((sz.L - 2 * m) / (s.w || 1), (sz.W - 2 * m) / (s.h || 1)); mutate(() => { it.h = r3((+it.h || 1) * k); if (+it.w > 0) it.w = r3(it.w * k); it.x = r3(sz.L / 2); it.y = r3(sz.W / 2); it.angle = 0; }); } return true;
    case 'vc-add': {
      if (!b) return true; const sz = vcSize(b);
      if (id === 'text') vcAddItem({ id: uid('vi'), kind: 'text', text: 'TEXT', font: 'Georgia', bold: true, h: r3(Math.max(0.25, Math.min(sz.W / 4, 3))), angle: 0 });
      else if (id === 'art') vcPickFile('image/*,.svg', async f => {
        try { const { im, url } = await vcLoadImage(f), tr = vcTraceImage(im, '', false), nid = uid('vi'); URL.revokeObjectURL(url);
          if (!tr.loops.length) { flash('Nothing dark enough to carve in that picture.'); return; }
          vcLastImg = { id: nid, im }; const h = r3(Math.min(sz.W * 0.6, (sz.L * 0.6) / (tr.bw || 1)));
          vcAddItem({ id: nid, kind: 'art', src: 'img', name: f.name, loops: vcRound4(tr.loops), bw: r3(tr.bw), bh: 1, th: r3(tr.th), h, angle: 0 });
          flash(`Traced ${tr.loops.length} outline${tr.loops.length === 1 ? '' : 's'} from ${f.name}`);
        } catch (e) { flash('Could not open that picture: ' + e.message); }
      });
      else if (id === 'dxf') vcPickFile('.dxf', f => f.text().then(t => {
        let d; try { d = vcDxfShape(t); } catch (e) { flash('This DXF could not be read: ' + e.message); return; }
        if (!d.loops.length) { flash('No closed shapes in this DXF. Carving needs closed outlines.'); return; }
        vcAddItem({ id: uid('vi'), kind: 'art', src: 'dxf', name: f.name, loops: vcRound4(d.loops), bw: r3(d.bw), bh: 1, h: r3(d.h > 0 ? d.h : 2), angle: 0 });
        if (d.open) flash(`${d.open} open line${d.open === 1 ? '' : 's'} left out; only closed shapes carve.`);
      }));
      else if (String(id).startsWith('lib:')) { const l = (S.shapeLib || []).find(x => x.id === id.slice(4)); if (l) { const n = vcNorm([shapeOutline(l.pts)]), bx = shapeBox(l.pts); vcAddItem({ id: uid('vi'), kind: 'art', src: 'shape', name: l.name, loops: vcRound4(n.loops), bw: r3(n.bw), bh: 1, h: r3(Math.min(bx.h, sz.W * 0.8)), angle: 0 }); } }
      else { const w = r3(sz.L * 0.5), h = r3(sz.W * 0.5); vcAddItem({ id: uid('vi'), kind: 'shape', shape: id, w: id === 'border' ? r3(sz.L - 1) : id === 'oval' || id === 'star' || id === 'heart' ? Math.min(w, h) : w, h: id === 'border' ? r3(sz.W - 1) : h, angle: 0, ...(id === 'border' ? { band: 0.5 } : {}) }); }
      return true;
    }
  }
  return false;
}
const confirmDel = name => window.confirm(`Delete ${name}?`);
// Click a design to pick it; drag it to move it (snaps to 1/16").
let vcDrag = null;
document.addEventListener('pointerdown', ev => {
  const g = ev.target.closest && ev.target.closest('#vc-over [data-vc-item]'), svg = ev.target.closest && ev.target.closest('#vc-over');
  if (!svg) return;
  if (!g) { if (ui.vcSel) { ui.vcSel = ''; renderCarve(); } return; }
  const m = svg.getScreenCTM(); if (!m) return;
  const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
  vcDrag = { id: g.dataset.vcItem, g, svg, x0: p.x, y0: p.y, t0: g.getAttribute('transform'), moved: false };
  try { svg.setPointerCapture(ev.pointerId); } catch (_) {}
  ev.preventDefault();
});
document.addEventListener('pointermove', ev => {
  if (!vcDrag) return; const m = vcDrag.svg.getScreenCTM(); if (!m) return;
  const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse()); vcDrag.dx = p.x - vcDrag.x0; vcDrag.dy = p.y - vcDrag.y0;
  if (Math.hypot(vcDrag.dx, vcDrag.dy) > 0.02) vcDrag.moved = true;
  vcDrag.g.setAttribute('transform', `translate(${r3(vcDrag.dx)} ${r3(vcDrag.dy)}) ${vcDrag.t0}`);
});
function vcDragEnd() {
  const d = vcDrag; vcDrag = null; if (!d) return;
  const b = vcBoard(), it = b && (b.items || []).find(i => i.id === d.id); if (!it) return;
  if (!d.moved) { ui.vcSel = it.id; renderCarve(); return; }
  const sn = v => Math.round(v * 16) / 16;
  mutate(() => { it.x = r3(sn((+it.x || 0) + d.dx)); it.y = r3(sn((+it.y || 0) - d.dy)); ui.vcSel = it.id; });
}
document.addEventListener('pointerup', vcDragEnd);
document.addEventListener('pointercancel', vcDragEnd);
document.addEventListener('keydown', ev => {
  if (ui.tab !== 'carve' || !ui.vcSel || /^(INPUT|SELECT|TEXTAREA)$/.test((ev.target && ev.target.tagName) || '')) return;
  const b = vcBoard(), it = b && (b.items || []).find(i => i.id === ui.vcSel); if (!it) return;
  const k = ev.shiftKey ? 1 : 1 / 16, mv = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, k], ArrowDown: [0, -k] }[ev.key];
  if (mv) { ev.preventDefault(); mutate(() => { it.x = r3((+it.x || 0) + mv[0]); it.y = r3((+it.y || 0) + mv[1]); }); }
  else if (ev.key === 'Delete') { ev.preventDefault(); vcAct('vc-rm'); }
  else if (ev.key === 'Escape') { ui.vcSel = ''; renderCarve(); }
});
