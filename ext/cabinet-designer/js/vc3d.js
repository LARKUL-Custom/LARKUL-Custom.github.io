/* ---------- 3D carving (like Vectric Aspire) ----------
   Any design on a sign can be 3D (it.mode '3d'): it becomes a raised shape whose height follows a profile, and the
   shapes combine into one model. The model's top touches the top of the board and the area around the shapes is
   lowered to its base, so a dome stands up out of a carved-down background, like Aspire.

   it.d3 = { profile: 'dome' | 'round' | 'flat' | 'angle' | 'point', h: height (in), base: flat base under it (in),
             combine: 'add' | 'sub' | 'merge' | 'low', ang: wall angle for 'angle' (degrees) }
   b.r3ball (finish ball nose), b.r3step (finish stepover %, blank = the tool's), b.r3rough (roughing bit),
   b.r3area: '' (around the 3D shapes) | 'board' (the whole board).

   The model is a height map on a grid (about 1.6 million cells at most). Roughing clears it in levels with a flat bit,
   leaving 0.01" on; finishing runs a ball nose back and forth across it, lifted wherever the ball would touch the model
   (drop-cutter), so it never cuts below the surface. Same sign, same settings, same G-code. */
'use strict';

const VC3_PROFILES = [['dome', 'Dome', 'Rounded all the way to the top, like a pillow.'], ['round', 'Round', 'Rounded edges, flat on top.'], ['flat', 'Flat', 'Straight walls up to a flat top.'], ['angle', 'Angled', 'Sloped walls (set the angle) up to a flat top.'], ['point', 'Point', 'Straight slopes up to a peak or ridge in the middle.']];
const VC3_COMBINE = [['add', 'Add', 'Stacks on top of what is under it.'], ['sub', 'Subtract', 'Carves into what is under it.'], ['merge', 'Merge', 'The higher one wins where they overlap.'], ['low', 'Low', 'The lower one wins where they overlap.']];
const VC3_LEAVE = 0.01; // inches left on by the roughing for the finish pass
const vc3d = it => ({ profile: 'dome', h: 0.25, base: 0, combine: 'add', ang: 45, ...(it.d3 || {}) });
const vc3Items = b => (b.items || []).filter(it => !it.off && it.mode === '3d');
const vcBalls = () => CNC_LIB.tools.filter(t => t.type === 'ball');
// The finish bit: the one picked, else the first ball nose, else none (the warning says to add one).
const vc3Ball = b => cncTool(b.r3ball) && cncTool(b.r3ball).type === 'ball' ? cncTool(b.r3ball) : vcBalls()[0] || null;
const vc3RoughBit = b => { const t = cncTool(b.r3rough); if (t && t.type !== 'vbit' && t.type !== 'drill' && t.type !== 'ball') return t; const s = vcStraights(); return s.slice().sort((p, q) => Math.abs(p.dia - 6.35) - Math.abs(q.dia - 6.35))[0] || null; };
// A 1/8" ball nose goes into the CNC tools library the first time a design is made 3D, if there is none.
function vc3EnsureBall() {
  if (vcBalls().length) return;
  const n = Math.max(0, ...CNC_LIB.tools.map(t => +t.number || 0)) + 1;
  CNC_LIB.tools.push({ id: '1_8BALL', number: n, dia: 3.175, type: 'ball', passDepth: 3, stepover: 10, plunge: 1500, feed: 4000, thruExtra: 0 });
  saveCncLib();
}

// Squared distance transform (Felzenszwalb and Huttenlocher) of one line, in place.
function vc3Edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s; while (true) { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k] && k > 0) k--; else break; }
    if (s <= z[k]) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; k = 0; continue; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
}
// Distance (in cells) from every cell to the nearest cell where src is 0. Cells with src 0 get 0.
function vc3Edt(src, w, h) {
  const INF = 1e20, g = new Float64Array(w * h), m = Math.max(w, h), f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let i = 0; i < w; i++) { for (let j = 0; j < h; j++) f[j] = src[j * w + i] ? INF : 0; vc3Edt1(f, h, d, v, z); for (let j = 0; j < h; j++) g[j * w + i] = d[j]; }
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) { for (let i = 0; i < w; i++) f[i] = g[j * w + i]; vc3Edt1(f, w, d, v, z); for (let i = 0; i < w; i++) out[j * w + i] = Math.sqrt(d[i]); }
  return out;
}
// Fills the cells (centres) inside the loops, the even-odd way, into mask (w x h cells of size res, from x0, y0).
function vc3Fill(loops, mask, w, h, res, x0, y0) {
  const xs = [];
  for (let j = 0; j < h; j++) {
    const y = y0 + (j + 0.5) * res; xs.length = 0;
    loops.forEach(l => { for (let i = 0, n = l.length; i < n; i++) { const a = l[i], c = l[(i + 1) % n]; if ((a.y <= y) !== (c.y <= y)) xs.push(a.x + (y - a.y) / (c.y - a.y) * (c.x - a.x)); } });
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.max(0, Math.ceil((xs[k] - x0) / res - 0.5)), i1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) / res - 0.5)); for (let i = i0; i <= i1; i++) mask[j * w + i] = 1; }
  }
}
// Height of a profile at distance d (in) in from the edge; D is the shape's deepest inside distance.
function vc3Height(o, d, D) {
  const H = Math.max(0, +o.h || 0);
  switch (o.profile) {
    case 'flat': return H;
    case 'round': { const r = Math.min(H, D); if (r <= 0) return 0; return d >= r ? H : H - r + Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))); }
    case 'angle': return Math.min(H, d * Math.tan(Math.max(5, Math.min(89, +o.ang || 45)) * Math.PI / 180));
    case 'point': return D > 0 ? H * Math.min(1, d / D) : 0;
    default: { const t = D > 0 ? Math.min(1, d / D) : 0; return H * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))); }
  }
}

// The model on the grid: Z (0 = top of the board, below is negative) and the area that gets machined.
const vc3Cache = new Map();
function vc3Field(b) {
  const items = vc3Items(b); if (!items.length) return null;
  const sz = vcSize(b), key = JSON.stringify([sz.L, sz.W, b.r3area || '', items.map(it => [it, vcItemLoops(it).length])]);
  if (vc3Cache.has(key)) return vc3Cache.get(key);
  const res = Math.max(0.008, Math.sqrt(sz.L * sz.W / 1.6e6)), nx = Math.max(2, Math.ceil(sz.L / res)), ny = Math.max(2, Math.ceil(sz.W / res));
  const M = new Float32Array(nx * ny), any = new Uint8Array(nx * ny);
  items.forEach(it => {
    const loops = vcItemLoops(it); if (!loops.length) return;
    const bx = vcBox(loops), pad = 2, i0 = Math.max(0, Math.floor(bx.x0 / res) - pad), j0 = Math.max(0, Math.floor(bx.y0 / res) - pad), i1 = Math.min(nx - 1, Math.ceil(bx.x1 / res) + pad), j1 = Math.min(ny - 1, Math.ceil(bx.y1 / res) + pad);
    const w = i1 - i0 + 1, h = j1 - j0 + 1; if (w < 1 || h < 1) return;
    const mask = new Uint8Array(w * h); vc3Fill(loops, mask, w, h, res, i0 * res, j0 * res);
    const dist = vc3Edt(mask, w, h); let D = 0;
    for (let k = 0; k < w * h; k++) if (mask[k]) { const d = Math.max(0.5, dist[k] - 0.5) * res; dist[k] = d; if (d > D) D = d; }
    const o = vc3d(it), base = +o.base || 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i; if (!mask[k]) continue;
      const g = (j + j0) * nx + i + i0, v = vc3Height(o, dist[k], D) + base;
      if (o.combine === 'sub') M[g] -= v; else if (o.combine === 'merge') M[g] = any[g] ? Math.max(M[g], v) : v; else if (o.combine === 'low') M[g] = any[g] ? Math.min(M[g], v) : v; else M[g] += v;
      any[g] = 1;
    }
  });
  // The machined area: the whole board, or the shapes plus 1/4" round them (so the bits have room).
  let area;
  if (b.r3area === 'board') area = new Uint8Array(nx * ny).fill(1);
  else { const inv = new Uint8Array(nx * ny); for (let k = 0; k < nx * ny; k++) inv[k] = any[k] ? 0 : 1; const d = vc3Edt(inv, nx, ny), lim = 0.25 / res; area = new Uint8Array(nx * ny); for (let k = 0; k < nx * ny; k++) area[k] = d[k] <= lim ? 1 : 0; }
  let top = -Infinity; for (let k = 0; k < nx * ny; k++) if (area[k] && M[k] > top) top = M[k];
  if (!isFinite(top)) top = 0;
  const Z = new Float32Array(nx * ny); let low = 0;
  for (let k = 0; k < nx * ny; k++) { Z[k] = area[k] ? M[k] - top : 0; if (Z[k] < low) low = Z[k]; }
  const out = { res, nx, ny, Z, area, depth: -low, key };
  vc3Cache.clear(); vc3Cache.set(key, out); return out;
}
// Surface height at a point, smoothly between cells (for the preview).
function vc3At(F, x, y) {
  const fx = x / F.res - 0.5, fy = y / F.res - 0.5, i = Math.max(0, Math.min(F.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(F.ny - 2, Math.floor(fy))), u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fy - j)), Z = F.Z, n = F.nx;
  return (Z[j * n + i] * (1 - u) + Z[j * n + i + 1] * u) * (1 - v) + (Z[(j + 1) * n + i] * (1 - u) + Z[(j + 1) * n + i + 1] * u) * v;
}

// Keeps the points where the path bends: Douglas-Peucker in 3D, no point moves more than tol off the cut.
function vc3Thin(pts, tol) {
  const n = pts.length; if (n < 3) return pts;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
  while (st.length) {
    const [a, c] = st.pop(), A = pts[a], C = pts[c], dx = C.x - A.x, dy = C.y - A.y, dz = C.z - A.z, L2 = dx * dx + dy * dy + dz * dz; let m = -1, mi = -1;
    for (let i = a + 1; i < c; i++) { const p = pts[i], t = L2 ? Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy + (p.z - A.z) * dz) / L2)) : 0, d = Math.hypot(p.x - A.x - dx * t, p.y - A.y - dy * t, p.z - A.z - dz * t); if (d > m) { m = d; mi = i; } }
    if (m > tol) { keep[mi] = 1; st.push([a, mi], [mi, c]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// Ball nose finish: rows across the board, each point lifted to where the ball first touches the model.
function vc3Finish(F, tool, stepPct) {
  const r = tool.dia / 25.4 / 2, { res, nx, ny, Z, area } = F, rows = Math.max(1, Math.round(Math.max(res, tool.dia / 25.4 * stepPct / 100) / res)), kr = Math.ceil(r / res);
  const K = []; for (let dj = -kr; dj <= kr; dj++) for (let di = -kr; di <= kr; di++) { const d = Math.hypot(di, dj) * res; if (d <= r) K.push(di, dj, r - Math.sqrt(r * r - d * d)); }
  const tip = (i, j) => { let z = -Infinity; for (let k = 0; k < K.length; k += 3) { const ii = i + K[k], jj = j + K[k + 1]; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const v = Z[jj * nx + ii] - K[k + 2]; if (v > z) z = v; } return Math.min(0, z); };
  const P = (i, j) => ({ x: (i + 0.5) * res, y: (j + 0.5) * res, z: tip(i, j) });
  const paths = []; let last = null, flip = false;
  for (let j = 0; j < ny; j += rows) {
    const runs = []; let s = -1;
    for (let i = 0; i <= nx; i++) { const on = i < nx && area[j * nx + i]; if (on && s < 0) s = i; else if (!on && s >= 0) { runs.push([s, i - 1]); s = -1; } }
    if (!runs.length) continue;
    if (flip) runs.reverse();
    runs.forEach(([a, c]) => {
      const pts = []; if (flip) for (let i = c; i >= a; i--) pts.push(P(i, j)); else for (let i = a; i <= c; i++) pts.push(P(i, j));
      // Stay down onto the next row when it starts close to where the last one ended: the link is lifted the same way.
      if (last && last.j === j - rows && Math.abs(last.i - (flip ? c : a)) <= rows * 4) {
        const i0 = last.i, i1 = flip ? c : a, n = Math.max(Math.abs(i1 - i0), rows), link = [];
        for (let s2 = 1; s2 < n; s2++) link.push(P(Math.round(i0 + (i1 - i0) * s2 / n), Math.round(last.j + rows * s2 / n)));
        last.path.push(...link, ...pts);
      } else { const path = pts; paths.push(path); last = { path }; }
      last.i = flip ? a : c; last.j = j;
    });
    flip = !flip;
  }
  // Between two samples the ball moves in a straight line, which would clip a steep wall: climb straight up before
  // moving over, and move over before dropping, wherever the height changes faster than the step.
  const stair = p => { const o = [p[0]]; for (let i = 1; i < p.length; i++) { const a = p[i - 1], c = p[i], run = Math.hypot(c.x - a.x, c.y - a.y); if (Math.abs(c.z - a.z) > run * 0.25 + 0.001) o.push(c.z > a.z ? { x: a.x, y: a.y, z: c.z } : { x: c.x, y: c.y, z: a.z }); o.push(c); } return o; };
  const thin = p => { if (p.length <= 512) return vc3Thin(p, 0.0005); const o = []; for (let i = 0; i < p.length - 1; i += 511) { const t = vc3Thin(p.slice(i, Math.min(p.length, i + 512)), 0.0005); o.push(...(o.length ? t.slice(1) : t)); } return o; };
  return paths.map(p => thin(stair(p)));
}
// Roughing: levels down with a flat bit, back and forth, only where the whole bit stays above the model (plus 0.01").
function vc3Rough(F, tool) {
  const { res, nx, ny, Z, area } = F, R = tool.dia / 25.4 / 2, w = Math.ceil(R / res), depth = F.depth - VC3_LEAVE;
  if (depth <= 0.005) return [];
  // Highest model point under the bit (a square around it, a little more than the round bit, so it is safe).
  const hi = new Float32Array(nx * ny), tmp = new Float32Array(nx * ny), ok = new Uint8Array(nx * ny), okt = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let m = -Infinity, a = 1; for (let d = -w; d <= w; d++) { const ii = i + d; if (ii < 0 || ii >= nx) continue; const k = j * nx + ii; if (Z[k] > m) m = Z[k]; if (!area[k]) a = 0; } tmp[j * nx + i] = m; okt[j * nx + i] = a; }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { let m = -Infinity, a = 1; for (let d = -w; d <= w; d++) { const jj = j + d; if (jj < 0 || jj >= ny) continue; const k = jj * nx + i; if (tmp[k] > m) m = tmp[k]; if (!okt[k]) a = 0; } hi[j * nx + i] = m; ok[j * nx + i] = a; }
  const rows = Math.max(1, Math.floor(tool.dia / 25.4 * (+tool.stepover || 40) / 100 / res)), paths = [];
  vcLevels(tool, depth).forEach(dz => {
    const z = -dz, can = k => ok[k] && hi[k] + VC3_LEAVE <= z + 1e-9;
    let last = null, flip = false;
    for (let j = 0; j < ny; j += rows) {
      const runs = []; let s = -1;
      for (let i = 0; i <= nx; i++) { const on = i < nx && can(j * nx + i); if (on && s < 0) s = i; else if (!on && s >= 0) { runs.push([s, i - 1]); s = -1; } }
      if (flip) runs.reverse();
      runs.forEach(([a, c]) => {
        const x = i => (i + 0.5) * res, y = (j + 0.5) * res, st = flip ? c : a, en = flip ? a : c;
        let linked = false;
        if (last && last.j === j - rows) { let clear = true; for (let jj = last.j; jj <= j && clear; jj++) if (!can(jj * nx + last.i) || !can(jj * nx + st)) clear = false; if (clear) { last.path.push({ x: x(last.i), y, z }, { x: x(st), y, z }, { x: x(en), y, z }); linked = true; } }
        if (!linked) { const path = [{ x: x(st), y, z }, { x: x(en), y, z }]; paths.push(path); last = { path }; }
        last.i = en; last.j = j;
      });
      flip = !flip;
    }
  });
  return paths;
}
// The 3D toolpaths for a board, worked out once per model and settings.
const vc3OpsCache = new Map();
function vc3Ops(b) {
  const F = vc3Field(b); if (!F) return { ops: [], field: null };
  const ball = vc3Ball(b), rough = vc3RoughBit(b), step = +b.r3step > 0 ? +b.r3step : (ball && +ball.stepover) || 10;
  const key = JSON.stringify([F.key, ball, rough, step]);
  if (vc3OpsCache.has(key)) return vc3OpsCache.get(key);
  const ops = [];
  if (rough && F.depth > VC3_LEAVE * 2) { const p = vc3Rough(F, rough); if (p.length) ops.push({ tool: rough, label: '3D roughing', keep: true, paths: p }); }
  if (ball) { const p = vc3Finish(F, ball, step); if (p.length) ops.push({ tool: ball, label: '3D finishing', keep: true, paths: p }); }
  const out = { ops, field: F }; vc3OpsCache.clear(); vc3OpsCache.set(key, out); return out;
}
