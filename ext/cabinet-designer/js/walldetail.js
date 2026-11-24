// Wall details and scribed walls (0.63.4, Ayden 2026-11-24: "give me a stone/panel option for walls, so i can add stone and
// depth based wall details to walls, i can select an option for things to be able to be scribed to the wall like fillers
// and panels, this would cost extra to scribe to those walls, like $50 each wall").
//
// w.detail = { kind: 'stone'|'shiplap'|'batten'|'wainscot', stone: tile|sand|ledge|field, h, depth, color } on a wall: real depth
// on the room side of the wall (3D, Realistic, Walk and the walk file, and drawn in the elevation). It stops round cabinets,
// appliances, doors and windows. Look only: cabinets keep their places, and nothing is cut or priced for it.
// w.scribe (with w.scribeX, the extra width, 1/2" to start): fillers against the wall and end panels backed by it are cut
// that much wider to scribe, and the quote adds the price sheet's Scribe charge for each scribed wall ($50 to start).
'use strict';
// Stone photos from Poly Haven (CC0): Rustic Stone Wall 02 (Amal Kumar) and Stone Wall (Charlotte Baglioni, Dario Barresi).
// The color picture has its ambient occlusion multiplied in; the depth picture is the height (white = stone face).
// size: inches one copy of the picture covers (1.5 m and 2 m in real life).
// Tiles and fireplace stone (0.63.6, Ayden 2026-11-24: "make it look more like tileing type of stone", "look for more
// backsplash tile and like fireplace stone"), all Poly Haven CC0: Stone tile = stone_tile_wall (Rob Tuytel, made grey so it
// takes a Color well), Sandstone tile = seaworn_sandstone_brick (Rob Tuytel), Subway = long_white_tiles (Jenelle van
// Heerden, Sergej Majboroda), Square mosaic = rounded_square_tiled_wall, Herringbone =
// herringbone_concrete_tile, White brick = whitewashed_brick (Charlotte Baglioni), Stacked stone = stacked_stone_wall,
// Stacked granite = granite_wall (Dimitrios Savva), Slate = castle_wall_slates, White sandstone = white_sandstone_bricks,
// Red brick = red_brick_03 (Rob Tuytel). g: the group in the Stone list; depth: starting depth off the wall (tile is thin).
// New stone details start on Stone tile; saved ones with no pick stay Ledgestone.
const WD_T = (name, f, size, color, g, depth) => ({ name, col: `textures/walls/${f}.jpg`, disp: `textures/walls/${f}-depth.jpg`, size, color, g, depth });
const WALL_STONES = {
  subway: WD_T('Stacked subway', 'subway', 90, '#c4beaf', 'Backsplash tile', 0.5),
  square: WD_T('Square mosaic', 'squaretile', 78.75, '#7a6c5c', 'Backsplash tile', 0.5),
  herring: WD_T('Herringbone', 'herringbone', 70.9, '#847d72', 'Backsplash tile', 0.5),
  tile: WD_T('Stone tile', 'stonetile', 78.75, '#aaaaaa', 'Backsplash tile', 0.75),
  sand: WD_T('Sandstone tile', 'sandstonetile', 66.5, '#7b6a56', 'Backsplash tile', 0.75),
  stacked: WD_T('Stacked stone', 'stacked', 78.75, '#58402c', 'Fireplace stone'),
  granite: WD_T('Stacked granite', 'granite', 74.8, '#6a5944', 'Fireplace stone'),
  slate: WD_T('Slate', 'slate', 98.4, '#564e3f', 'Fireplace stone'),
  whitesand: WD_T('White sandstone', 'whitesand', 78.75, '#837b6a', 'Fireplace stone'),
  ledge: { ...WD_T('Ledgestone', 'ledgestone', 59, '#a8977f', 'Fireplace stone') },
  field: { ...WD_T('Fieldstone', 'fieldstone', 78.75, '#b4a993', 'Fireplace stone') },
  whitebrick: WD_T('White brick', 'whitebrick', 78.75, '#978c80', 'Fireplace stone', 1),
  redbrick: WD_T('Red brick', 'redbrick', 39.4, '#5a463f', 'Fireplace stone', 1),
};
// Colors offered for stone and tile (any other from the color picker).
const WD_TINTS = [['#f2efe8', 'White'], ['#e6dccb', 'Cream'], ['#d4c6ad', 'Beige'], ['#c8c8c4', 'Light grey'], ['#9a9a96', 'Grey'], ['#5a5b5e', 'Charcoal'],
  ['#2a2a2c', 'Black'], ['#a3ad92', 'Sage'], ['#7f9aa6', 'Blue grey'], ['#2e3a4e', 'Navy'], ['#3f5a4a', 'Green'], ['#b5694a', 'Terracotta']];
const WALL_DETAILS = [['', 'None'], ['stone', 'Stone'], ['shiplap', 'Shiplap'], ['batten', 'Board and batten'], ['wainscot', 'Wainscot panels']];
// Starting height (0 = to the ceiling) and depth off the wall of each kind.
const WD_DEF = { stone: { h: 0, depth: 1.5 }, shiplap: { h: 0, depth: 0.75 }, batten: { h: 60, depth: 0.75 }, wainscot: { h: 36, depth: 0.75 } };
function wallDetail(w) {
  const d = w && !w.hidden && !w.island && w.detail; if (!d || !WD_DEF[d.kind]) return null;
  const def = WD_DEF[d.kind], H = +w.height || 96, h = +d.h > 0 ? Math.min(+d.h, H) : def.h > 0 ? Math.min(def.h, H) : H;
  const stone = WALL_STONES[d.stone] ? d.stone : 'ledge', dd = d.kind === 'stone' && WALL_STONES[stone].depth || def.depth;
  return { kind: d.kind, stone, h, full: h >= H - 0.01, depth: +d.depth > 0 ? Math.min(+d.depth, 6) : dd, color: d.color || '#f4f2ec', tint: d.kind === 'stone' && /^#[0-9a-f]{6}$/i.test(d.tint || '') ? d.tint.toLowerCase() : '' };
}
// Scribe: the extra width cut on fillers and panels that meet this wall.
const wallScribeX = w => (w && w.scribe && !w.hidden && !w.island ? (+w.scribeX >= 0 && w.scribeX !== '' && w.scribeX != null ? +w.scribeX : 0.5) : 0);
const scribedWalls = () => (S.walls || []).filter(w => w.scribe && !w.hidden && !w.island);

/* ---------- Real depth: the detail is part of the wall ---------- */
// 0.63.5 (Ayden 2026-11-24: "I would like for it to actually have depth"): the detail's face is the wall face for
// everything that stands against it. Cabinets on the wall stand out by its depth (c.wdOut, added to their Outset and kept
// in step by wdSync), cabinets, fillers and tops on the walls beside it stop at its face (a slab in obstacles), and tops
// in front of it start at its face (r.back). Walls with no detail are untouched.
const WD = { raw: 0 };
function wdRaw(fn) { WD.raw++; try { return fn(); } finally { WD.raw--; } }
// How far the detail on wall w stands off its face over heights z0..z1 on side `side` (0 where there is none).
function wdDepthAt(w, side, z0, z1) {
  const d = wallDetail(w); if (!d || side !== elevSide(w) || z1 <= 0.01) return 0;
  const ledge = !d.full && d.kind !== 'shiplap', top = d.h + (ledge ? 1 : 0);
  if (z0 >= top - 0.01) return 0;
  return d.depth + (ledge && z1 > d.h + 0.01 ? 0.75 : 0);
}
// The detail on wall k as a plan outline, for what stands beside it at spec's heights; null for none.
function wdSlabPoly(k, spec) {
  if (WD.raw || !k || !k.detail || !k.detail.kind) return null;
  const s = elevSide(k), z0 = +spec.elev || 0, D = wdDepthAt(k, s, z0, z0 + (+spec.h || 0)); if (!D) return null;
  const F = wdFrame(k, s), g = wg(k), t = k.thick / 2;
  return [wallPt(k, g, s, F.lo, t), wallPt(k, g, s, F.hi, t), wallPt(k, g, s, F.hi, t + D), wallPt(k, g, s, F.lo, t + D)];
}
// Cabinets stand out from a wall with a detail by its depth where they overlap it (Outset grows by it; taken back off
// when the detail goes). Run on every save.
function wdSync() {
  (S.rooms || []).forEach(r => { if (!(r.walls || []).some(w => w.detail && w.detail.kind) && !(r.cabinets || []).some(c => c.wdOut)) return;
    withRoom(r, () => (r.cabinets || []).forEach(c => {
      const w = c.wall && wall(c.wall), t = w && c.made !== 'pocketdoors' ? wdDepthAt(w, c.side, +c.elev || 0, (+c.elev || 0) + (+c.h || 0)) : 0, was = +c.wdOut || 0;
      if (Math.abs(t - was) < 1e-6) return;
      c.outset = Math.round(((+c.outset || 0) - was + t) * 1000) / 1000; if (t) c.wdOut = t; else delete c.wdOut;
    }));
  });
}
// Does a top's end at `at` (along its wall) stop against the detail of a wall beside it?
function wdEndAt(r, at) {
  const w = wall(r.wall); if (!w) return false;
  const fr = wallFrame(w, r.side), spec = { elev: r.bottom, h: r.top - r.bottom + 2 };
  return (S.walls || []).some(k => { if (k.id === w.id) return false; const p = wdSlabPoly(k, spec); if (!p) return false;
    const as = p.map(q => fr(q).a), bs = p.map(q => fr(q).b), a0 = Math.min(...as), a1 = Math.max(...as);
    return Math.max(...bs) > w.thick / 2 + 0.5 && Math.min(...bs) < w.thick / 2 + r.d && (Math.abs(a0 - at) < 0.5 || Math.abs(a1 - at) < 0.5); });
}

/* ---------- Where the detail goes ---------- */
// The wall's room-side span between the walls at its ends (the drywall faces, details left out), and a function from
// along-the-wall a to the detail's own x (from the viewer's left, like the elevation).
function wdFrame(w, side) {
  const f = wdRaw(() => wallFaces(w.id, side)), L = wg(w).L, lo = f.hi > f.lo ? f.lo : 0, hi = f.hi > f.lo ? f.hi : L;
  return { lo, hi, len: hi - lo, x: a => side === 1 ? a - lo : hi - a, ex0: side === 1 ? lo : L - hi };
}
// Rectangles [x0, x1, z0, z1] (detail x, height) the detail may cover: the wall up to top, less what stands against it.
function wdFree(w, side, top, depth) {
  const F = wdFrame(w, side), fr = wallFrame(w, side), face = w.thick / 2, obs = [];
  const add = (a0, a1, z0, z1) => { const x0 = Math.max(0, Math.min(F.x(a0), F.x(a1))), x1 = Math.min(F.len, Math.max(F.x(a0), F.x(a1))); if (x1 - x0 > 0.01 && z1 > 0.01 && z0 < top - 0.01) obs.push([x0, x1, Math.max(0, z0), Math.min(top, z1)]); };
  // Anything standing within the detail's depth of the wall face: cabinets (on this wall or butting it from another), panels, appliances.
  const near = (poly, z0, z1) => {
    if (!poly) return; let al = Infinity, ah = -Infinity, bl = Infinity, bh = -Infinity;
    poly.forEach(p => { const q = fr(p); al = Math.min(al, q.a); ah = Math.max(ah, q.a); bl = Math.min(bl, q.b); bh = Math.max(bh, q.b); });
    if (bh > face + 0.01 && bl < face + depth - 0.01) add(al, ah, z0, z1);
  };
  (S.cabinets || []).forEach(c => { if (c.made === 'pocketdoors' || !c.wall) return; near(cabPoly(c), c.elev, c.elev + c.h); if (typeof panelPolys === 'function') panelPolys(c, true).forEach(pp => near(pp, c.elev, c.elev + c.h)); });
  if (typeof fixtList === 'function') fixtList().forEach(f => {
    if (!f.wall) return;
    if (fixtHole(f)) { if (f.wall === w.id) add(f.off, f.off + f.w, f.elev, f.elev + f.h); return; }
    if (typeof fixtSink === 'function' && fixtSink(f)) return;
    near(fixtPoly(f), +f.elev || 0, (+f.elev || 0) + (+f.h || 0));
  });
  // Split into upright strips at every obstacle edge; each strip is free between its obstacles.
  const xs = [...new Set([0, F.len, ...obs.flatMap(o => [o[0], o[1]])].map(v => Math.round(v * 1000) / 1000))].filter(v => v >= 0 && v <= F.len).sort((a, b) => a - b);
  let out = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i], x1 = xs[i + 1]; if (x1 - x0 < 0.01) continue;
    const m = (x0 + x1) / 2, bl = obs.filter(o => o[0] < m && o[1] > m).sort((a, b) => a[2] - b[2]);
    let z = 0; const zs = [];
    bl.forEach(o => { if (o[2] > z + 0.01) zs.push([z, o[2]]); z = Math.max(z, o[3]); });
    if (top > z + 0.01) zs.push([z, top]);
    zs.forEach(([z0, z1]) => {
      // Joins onto the strip to its left when it has the same height range.
      const prev = out.find(r => Math.abs(r[1] - x0) < 1e-6 && Math.abs(r[2] - z0) < 1e-6 && Math.abs(r[3] - z1) < 1e-6);
      if (prev) prev[1] = x1; else out.push([x0, x1, z0, z1]);
    });
  }
  return { F, rects: out };
}
// The boards, battens, rails and caps of a panel detail as [x0, x1, z0, z1, depth off the wall], over len × h.
function wdPieces(d, len, h) {
  const D = d.depth, out = [], cap = !d.full;
  if (d.kind === 'shiplap') {
    out.push([0, len, 0, h, Math.min(0.25, D * 0.3)]);
    for (let z = 0; z < h - 0.01; z += 6) out.push([0, len, z + 0.125, Math.min(h, z + 6), D]);
  } else if (d.kind === 'batten') {
    out.push([0, len, 0, h, Math.min(0.5, D * 0.6)]);
    const n = Math.max(1, Math.round(len / 16)), s = len / n;
    for (let i = 0; i <= n; i++) { const c = i * s; out.push([Math.max(0, c - 1.25), Math.min(len, c + 1.25), 0, h - (cap ? 3.5 : 0), D]); }
    if (cap) out.push([0, len, h - 3.5, h, D]);
  } else if (d.kind === 'wainscot') {
    out.push([0, len, 0, h, Math.min(0.25, D * 0.3)]);
    const n = Math.max(1, Math.round((len - 3) / 27)), p = (len - 3 * (n + 1)) / n, top = h - (cap ? 4 : 0);
    out.push([0, len, 0, Math.min(6.5, h), D]);
    if (cap) out.push([0, len, top, h, D]);
    for (let i = 0; i <= n; i++) { const x = i * (p + 3); out.push([x, x + 3, 0, top, D]); }
  }
  // A chair rail ledge on top of a wainscot that stops below the ceiling.
  if (cap && d.kind !== 'shiplap') out.push([0, len, h, h + 1, D + 0.75]);
  return out;
}
const wdClip = (p, r) => { const x0 = Math.max(p[0], r[0]), x1 = Math.min(p[1], r[1]), z0 = Math.max(p[2], r[2]), z1 = Math.min(p[3], r[3]); return x1 - x0 > 0.01 && z1 - z0 > 0.01 ? [x0, x1, z0, z1, p[4]] : null; };
// Every piece cut to the free rectangles, with side-by-side bits of one piece joined back (no seam in a rail).
function wdCut(pieces, rects) {
  const out = [];
  pieces.forEach(p => {
    const bits = rects.map(r => wdClip(p, r)).filter(Boolean).sort((a, b) => a[2] - b[2] || a[0] - b[0]);
    bits.forEach(q => { const k = out.find(o => o.p === p && Math.abs(o.q[1] - q[0]) < 1e-6 && Math.abs(o.q[2] - q[2]) < 1e-6 && Math.abs(o.q[3] - q[3]) < 1e-6); if (k) k.q[1] = q[1]; else out.push({ p, q }); });
  });
  return out.map(o => o.q);
}

/* ---------- Stone height ---------- */
// The depth picture read once into heights 0-1 (512 x 512, wraps), for the stone's shape; null while it loads.
const WD_HT = {};
function wdHeight(key) {
  const st = WALL_STONES[key]; let e = WD_HT[key]; if (e) return e.f || null;
  e = WD_HT[key] = {};
  const im = new Image();
  im.onload = () => {
    const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d'); g.drawImage(im, 0, 0, N, N);
    const px = g.getImageData(0, 0, N, N).data, h = new Float32Array(N * N); let lo = 1, hi = 0;
    for (let i = 0; i < N * N; i++) { const v = px[i * 4] / 255; h[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
    const k = 1 / Math.max(0.05, hi - lo); for (let i = 0; i < N * N; i++) h[i] = (h[i] - lo) * k;
    e.f = (u, v) => {
      const x = ((u % 1) + 1) % 1 * N, y = ((1 - v) % 1 + 1) % 1 * N, x0 = Math.floor(x) % N, y0 = Math.floor(y) % N, x1 = (x0 + 1) % N, y1 = (y0 + 1) % N, fx = x - Math.floor(x), fy = y - Math.floor(y);
      return (h[y0 * N + x0] * (1 - fx) + h[y0 * N + x1] * fx) * (1 - fy) + (h[y1 * N + x0] * (1 - fx) + h[y1 * N + x1] * fx) * fy;
    };
    if (typeof redrawView === 'function' && typeof ui !== 'undefined' && ui.viewMode === '3d') redrawView();
  };
  im.src = st.disp;
  return null;
}
function wdTex(url, srgb) {
  const c = wdTex.c || (wdTex.c = {}); if (c[url]) return c[url];
  const t = new THREE.TextureLoader().load(url, () => { if (typeof viewers !== 'undefined') viewers.forEach(v => v.requestRender()); });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb && 'encoding' in t && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
  return (c[url] = t);
}
// The color picture in greys (for a Color), made once per picture; drawn plain grey until the picture loads.
function wdGreyTex(url) {
  const c = wdGreyTex.c || (wdGreyTex.c = {}); if (c[url]) return c[url];
  const cv = document.createElement('canvas'); cv.width = cv.height = 4; cv.getContext('2d').fillStyle = '#aaa'; cv.getContext('2d').fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if ('encoding' in t && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
  const im = new Image();
  im.onload = () => {
    const N = im.width, g = document.createElement('canvas'); g.width = g.height = N; const x = g.getContext('2d'); x.drawImage(im, 0, 0);
    const D = x.getImageData(0, 0, N, N), p = D.data; let sum = 0;
    for (let i = 0; i < p.length; i += 4) { const v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; sum += v; }
    // Evened to a mid-light grey (average 200) so the Color comes out close to itself.
    const k = 200 / Math.max(1, sum / (p.length / 4));
    for (let i = 0; i < p.length; i += 4) { const v = Math.min(255, (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) * k); p[i] = p[i + 1] = p[i + 2] = v; }
    x.putImageData(D, 0, 0); t.image = g; t.needsUpdate = true;
    if (typeof viewers !== 'undefined') viewers.forEach(v => v.requestRender());
  };
  im.src = url;
  return (c[url] = t);
}
// Stone tile is grey already; a Color tints the stone (the color on the faces, the grout and shading kept).
function wdStoneMat(key, tint) {
  const k = key + (R3 ? '|r' : '') + (tint ? '|' + tint : ''), c = wdStoneMat.c || (wdStoneMat.c = {}); if (c[k]) return c[k];
  const st = WALL_STONES[key], m = new THREE.MeshStandardMaterial({ map: tint ? wdGreyTex(st.col) : wdTex(st.col, true), roughness: 0.92, metalness: 0, envMapIntensity: 0.25 });
  if (tint) { m.color.set(tint); m.color.multiplyScalar(255 / 200); }
  // Fine detail past what the shape holds (the mortar edges, the stone's grain) as a bump.
  if (R3) { m.bumpMap = wdTex(st.disp, false); m.bumpScale = 0.6; }
  return (c[k] = m);
}
// The stone over the free rectangles: one surface raised by the depth picture (stone faces at the full depth, the mortar back
// at a third of it), closed round its open edges down to the wall. The grid lines take in every rectangle edge, so it stops
// exactly at cabinets and casings, and neighbouring rectangles share their edge (no seam). UVs are inches over the stone's size.
function wdStoneGeo(rects, d) {
  const st = WALL_STONES[d.stone], hf = R3 ? wdHeight(d.stone) : null, S0 = st.size, D = d.depth;
  const step = !hf ? 0 : typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 1 : 0.5;
  const lines = (k0, k1) => {
    const lo = Math.min(...rects.map(r => r[k0])), hi = Math.max(...rects.map(r => r[k1])), v = rects.flatMap(r => [r[k0], r[k1]]);
    if (step) for (let x = Math.ceil(lo / step) * step; x < hi; x += step) v.push(x);
    const o = [...new Set(v.map(x => Math.round(x * 1000) / 1000))].sort((a, b) => a - b);
    return o.filter((x, i) => !i || x - o[i - 1] > 0.02 || x === hi);
  };
  const xs = lines(0, 1), zs = lines(2, 3), nx = xs.length - 1, nz = zs.length - 1;
  const inc = new Uint8Array(nx * nz), on = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && inc[j * nx + i] === 1;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const mx = (xs[i] + xs[i + 1]) / 2, mz = (zs[j] + zs[j + 1]) / 2; if (rects.some(r => mx > r[0] && mx < r[1] && mz > r[2] && mz < r[3])) inc[j * nx + i] = 1; }
  const pos = [], uv = [], idx = [], vid = new Int32Array((nx + 1) * (nz + 1)).fill(-1), at = (x, z) => hf ? D * (0.35 + 0.65 * hf(x / S0, z / S0)) : D;
  const V = (i, j) => { const k = j * (nx + 1) + i; if (vid[k] < 0) { vid[k] = pos.length / 3; pos.push(xs[i], zs[j], at(xs[i], zs[j])); uv.push(xs[i] / S0, zs[j] / S0); } return vid[k]; };
  // One upright edge quad from grid point (i0, j0) to (i1, j1), going counterclockwise round the stone seen from the room.
  const skirt = (i0, j0, i1, j1) => {
    const P = [xs[i0], zs[j0]], Q = [xs[i1], zs[j1]], tp = at(P[0], P[1]), tq = at(Q[0], Q[1]), n = pos.length / 3, up = i0 === i1;
    pos.push(P[0], P[1], 0, Q[0], Q[1], 0, P[0], P[1], tp, Q[0], Q[1], tq);
    const s0 = (up ? P[1] : P[0]) / S0, s1 = (up ? Q[1] : Q[0]) / S0;
    uv.push(s0, 0, s1, 0, s0, tp / S0, s1, tq / S0);
    idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!on(i, j)) continue;
    const a = V(i, j), b = V(i + 1, j), c = V(i, j + 1), e = V(i + 1, j + 1); idx.push(a, b, c, b, e, c);
    if (!on(i, j - 1)) skirt(i, j, i + 1, j);
    if (!on(i + 1, j)) skirt(i + 1, j, i + 1, j + 1);
    if (!on(i, j + 1)) skirt(i + 1, j + 1, i, j + 1);
    if (!on(i - 1, j)) skirt(i, j + 1, i, j);
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}
const wdPaintMat = color => (R3 && typeof paint3 === 'function' ? paint3(color, 'smooth') : flat3(color));
// The wall's detail as a group on its room side (x from the viewer's left inside face, y up, z out from the face), or null.
function wdMeshes3(w, side) {
  const d = wallDetail(w); if (!d) return null;
  const top = d.h + (d.full || d.kind === 'shiplap' ? 0 : 1), { F, rects } = wdFree(w, side, top, d.depth + (d.full ? 0 : 0.75));
  if (!rects.length || F.len < 0.5) return null;
  const grp = wallGroup(w, side, side === 1 ? F.lo : F.hi);
  if (d.kind === 'stone') {
    const m = wdStoneMat(d.stone, d.tint);
    // Edges that stop at something (a cabinet, appliance, panel, casing) run 1/16" into it, so the stone's edge isn't in the
    // same plane as that thing's side (they flickered there as white lines, Ayden 2026-11-24). Wall ends and the top stay put.
    const E = 0.0625, rs = rects.map(r => [r[0] > 0.01 ? r[0] - E : r[0], r[1] < F.len - 0.01 ? r[1] + E : r[1], r[2] > 0.01 ? r[2] - E : r[2], Math.min(r[3], d.h) < d.h - 0.01 ? Math.min(r[3], d.h) + E : Math.min(r[3], d.h)]).filter(r => r[3] - r[2] > 0.01), g = rs.length && wdStoneGeo(rs, d);
    if (g) { const me = new THREE.Mesh(g, m); me.userData.wallDetail = w.id; grp.add(me); }
  } else {
    const m = wdPaintMat(d.color);
    wdCut(wdPieces(d, F.len, d.h), rects).forEach(q => grp.add(box3(q[1] - q[0], q[3] - q[2], q[4], m, (q[0] + q[1]) / 2, (q[2] + q[3]) / 2, q[4] / 2)));
  }
  return grp.children.length ? grp : null;
}

/* ---------- Elevation ---------- */
// The detail drawn on the elevation of wall w (side), in the elevation's x (from the left end of the drawing) and -z.
function wdElevSVG(w, side) {
  const d = wallDetail(w); if (!d) return '';
  const top = d.h + (d.full || d.kind === 'shiplap' ? 0 : 1), { F, rects } = wdFree(w, side, top, d.depth + (d.full ? 0 : 0.75)), X = x => F.ex0 + x;
  if (!rects.length) return '';
  let s = '<g class="ev-wdetail" pointer-events="none">';
  if (d.kind === 'stone') {
    const st = WALL_STONES[d.stone], id = 'wd-' + d.stone + (d.tint ? d.tint.slice(1) : ''), T = d.tint;
    const img = `<image href="${st.col}" width="${st.size}" height="${st.size}" preserveAspectRatio="none"${T ? ` filter="url(#${id}f)"` : ' opacity=".85"'}/>`;
    s += `<defs>${T ? `<filter id="${id}f" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="${(parseInt(T.slice(1, 3), 16) / 200).toFixed(3)}"/><feFuncG type="linear" slope="${(parseInt(T.slice(3, 5), 16) / 200).toFixed(3)}"/><feFuncB type="linear" slope="${(parseInt(T.slice(5, 7), 16) / 200).toFixed(3)}"/></feComponentTransfer></filter>` : ''}<pattern id="${id}" patternUnits="userSpaceOnUse" x="${F.ex0}" y="0" width="${st.size}" height="${st.size}">${img}</pattern></defs>`;
    rects.forEach(r => { const z1 = Math.min(r[3], d.h); if (z1 - r[2] > 0.01) s += `<rect x="${X(r[0])}" y="${-z1}" width="${r[1] - r[0]}" height="${z1 - r[2]}" fill="url(#${id})" stroke="#6d6458" stroke-width=".25"/>`; });
  } else {
    wdCut(wdPieces(d, F.len, d.h), rects).forEach(q => { s += `<rect x="${X(q[0])}" y="${-q[3]}" width="${q[1] - q[0]}" height="${q[3] - q[2]}" fill="${esc(d.color)}" stroke="#8a8a86" stroke-width=".2"/>`; });
  }
  return s + '</g>';
}

/* ---------- Wall panel ---------- */
function wallDetailBox(w) {
  const d = w.detail || {}, k = WD_DEF[d.kind] ? d.kind : '', R = 'wdet:' + w.id, W = 'wall:' + w.id, def = { ...(WD_DEF[k] || {}) };
  const sk = WALL_STONES[d.stone] ? d.stone : 'ledge', st = WALL_STONES[sk], tint = wallDetail(w)?.tint || '';
  const pic = k === 'stone' ? `<div class="wd-pic"><b style="background-image:url('${st.col}')${tint ? ';filter:grayscale(1) brightness(1.25)' : ''}"></b>${tint ? `<i style="background:${tint}"></i>` : ''}</div>` : '';
  const tints = [{ v: '', l: 'Natural' }, ...WD_TINTS.map(([v, l]) => ({ v, l }))]; if (tint && !WD_TINTS.some(t => t[0] === tint)) tints.push({ v: tint, l: 'Custom' });
  const colorRow = `<label class="f"><span>Color</span><span class="wd-tint">${ctl(R, 'tint', tint, 'select', { options: tints, label: 'Color' })}${ctl(R, 'tint', tint || st.color, 'color', { label: 'Pick a color' })}</span></label>`;
  if (k === 'stone') def.depth = st.depth || def.depth;
  const body = !k ? '' : `${k === 'stone' ? fld('Stone', R, 'stone', sk, 'select', { options: Object.entries(WALL_STONES).map(([v, s]) => ({ v, l: s.name, g: s.g })) }) + colorRow + pic
      : fld('Paint', R, 'color', d.color || '#f4f2ec', 'select', { options: (typeof WALL_PAINTS !== 'undefined' ? WALL_PAINTS : [['#f4f2ec', 'White']]).map(([v, l]) => ({ v, l })) })}
    <div class="grid2">${fld('Height', R, 'h', d.h ?? '', 'len', { blank: true, ph: def.h ? fmtLen(def.h) : 'Ceiling' })}${fld('Depth', R, 'depth', d.depth ?? '', 'len', { blank: true, ph: fmtLen(def.depth) })}</div>`;
  const sx = wallScribeX(w);
  return `<div class="psec box">${secHead('wall', 'Wall finish', 'amber')}
    ${fld('Detail', R, 'kind', k, 'select', { options: WALL_DETAILS.map(([v, l]) => ({ v, l })) })}${body}
    <label class="checkrow">${ctl(W, 'scribe', !!w.scribe, 'bool', { label: 'Scribe to this wall' })} <b>Scribe to this wall</b></label>
    ${w.scribe ? fld('Scribe extra', W, 'scribeX', w.scribeX ?? '', 'len', { blank: true, ph: fmtLen(0.5) }) : ''}
    <div class="note">${k ? 'Real depth: cabinets on this wall stand out by it, cabinets and tops beside it stop at its face. Shows in 3D, Realistic, Walk, the plan and the elevation. ' : ''}Scribe cuts fillers and end panels against this wall ${sx ? fmtLen(sx) : '1/2"'} wider and adds the scribe charge to the quote (Pricing › Adders).</div></div>`;
}

/* ---------- Plan ---------- */
// The detail's depth on the plan, a band on the room side of each wall that has one.
function wdPlanSVG() {
  let s = '';
  (S.walls || []).forEach(w => { const d = wallDetail(w); if (!d) return; const side = elevSide(w), F = wdFrame(w, side), g = wg(w), t = w.thick / 2;
    const p = [wallPt(w, g, side, F.lo, t), wallPt(w, g, side, F.hi, t), wallPt(w, g, side, F.hi, t + d.depth), wallPt(w, g, side, F.lo, t + d.depth)];
    s += `<polygon class="wdplan wd-${d.kind} nss" points="${p.map(q => q.x + ',' + q.y).join(' ')}"><title>${esc(d.kind === 'stone' ? WALL_STONES[d.stone].name : (WALL_DETAILS.find(x => x[0] === d.kind) || [])[1] || '')}, ${fmtLen(d.depth)} deep</title></polygon>`; });
  return s;
}
