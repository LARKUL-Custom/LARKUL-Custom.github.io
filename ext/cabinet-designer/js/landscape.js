// 0.63.48 (Ayden 2026-11-25): what is outside the walls in Realistic 3D, Walk and the Walk file. Room tab › Walls ›
// Outside picks a generic landscape for the room: Plain (nothing, as before), Fenced backyard, Forest, Suburban
// street, Mountains or Desert. Everything is drawn here from code (no downloaded pictures), so it costs nothing,
// needs no licence and always comes out the same for the same room:
//   - a sky dome whose colours follow the time of day (landSun, called from realLight; the walk file has it too),
//   - a painted band far away (mountains, mesas, tree lines, roofs) that fades with the light,
//   - real 3D ground, trees, fence boards, houses, a street and rocks near the room, lit by the sun and the sky.
// Nothing out here is part of the job: it never blocks the Walk, never counts for the camera fit and is never picked.
'use strict';
const LAND_KINDS = [
  { v: 'plain', l: 'Plain' }, { v: 'yard', l: 'Fenced backyard' }, { v: 'forest', l: 'Forest' },
  { v: 'street', l: 'Suburban street' }, { v: 'mountains', l: 'Mountains' }, { v: 'desert', l: 'Desert' },
];
const LAND = { R: 9000, cache: {}, tex: {} };
const landOf = rm => { const k = (rm || (typeof curRoom === 'function' ? curRoom() : null) || {}).land; return LAND_KINDS.some(o => o.v === k) ? k : 'plain'; };

// Same numbers every time for the same room (rule: same job, same picture).
function landRand(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function landCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function landTexture(key, make, o = {}) {
  if (LAND.tex[key]) return LAND.tex[key];
  const t = new THREE.CanvasTexture(make());
  if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; else if (o.wrapX) t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8; if ('encoding' in t && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
  t.userData.land = true;
  return (LAND.tex[key] = t);
}
const landHex = (c, k = 0) => { const q = new THREE.Color(c); if (k) q.offsetHSL(0, 0, k); return '#' + q.getHexString(); };

/* ---------- Ground pictures (one tile, seamless) ---------- */
function landGroundCanvas(kind) {
  const N = 1024, cv = landCanvas(N, N), g = cv.getContext('2d'), r = landRand(kind.length * 977 + 11);
  const P = {
    grass: { base: '#5b7838', cols: ['#4e6b2f', '#6a8840', '#7c9a4a', '#45612a', '#87a352', '#5f7d36'], n: 60000, len: 7 },
    lawn: { base: '#5f8a39', cols: ['#527d31', '#6d9a42', '#7fae4d', '#4a7029', '#8bb655', '#62903a'], n: 70000, len: 6 },
    meadow: { base: '#6f7f40', cols: ['#7d8a46', '#8e9852', '#5f7236', '#a3a05c', '#6b7d3c', '#b0a865'], n: 60000, len: 8 },
    duff: { base: '#3f4128', cols: ['#4d4a30', '#33321f', '#5a5236', '#3f5228', '#556a32', '#2c3a20'], n: 50000, len: 9 },
    sand: { base: '#c79a6c', cols: ['#d2a678', '#bb8d60', '#c99b6a', '#b48659', '#d8b085', '#a97a50'], n: 90000, len: 2 },
  }[kind];
  g.fillStyle = P.base; g.fillRect(0, 0, N, N);
  // Soft patches first, then blades (or grains), each drawn again across the edges so the tile repeats cleanly.
  const wrap = (x, y, f) => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { const X = x + dx, Y = y + dy; if (X > -60 && X < N + 60 && Y > -60 && Y < N + 60) f(X, Y); } };
  for (let i = 0; i < 90; i++) {
    const x = r() * N, y = r() * N, rad = 40 + r() * 110, c = P.cols[(r() * P.cols.length) | 0];
    wrap(x, y, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, rad); gr.addColorStop(0, c + '55'); gr.addColorStop(1, c + '00'); g.fillStyle = gr; g.fillRect(X - rad, Y - rad, rad * 2, rad * 2); });
  }
  g.lineCap = 'round';
  for (let i = 0; i < P.n; i++) {
    const x = r() * N, y = r() * N, c = P.cols[(r() * P.cols.length) | 0], a = (r() - 0.5) * Math.PI, L = P.len * (0.4 + r());
    g.strokeStyle = c; g.globalAlpha = 0.55 + r() * 0.45; g.lineWidth = kind === 'sand' ? 1.2 : 1 + r() * 0.8;
    wrap(x, y, (X, Y) => { g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.sin(a) * L, Y - Math.cos(a) * L); g.stroke(); });
  }
  g.globalAlpha = 1;
  if (kind === 'duff') for (let i = 0; i < 260; i++) { const x = r() * N, y = r() * N, L = 10 + r() * 30, a = r() * Math.PI; g.strokeStyle = r() < 0.5 ? '#6e5a3a' : '#2f2a1e'; g.lineWidth = 1.5 + r() * 2; wrap(x, y, (X, Y) => { g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.cos(a) * L, Y + Math.sin(a) * L); g.stroke(); }); }
  if (kind === 'sand') { g.globalAlpha = 0.18; for (let y = 0; y < N; y += 9) { g.strokeStyle = (y / 9) % 2 ? '#e6c79e' : '#9c7149'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= N; x += 16) g.lineTo(x, y + Math.sin(x / N * Math.PI * 6 + y * 0.07) * 4); g.stroke(); } g.globalAlpha = 1; for (let i = 0; i < 500; i++) { const x = r() * N, y = r() * N, s = 1.5 + r() * 3.5; g.fillStyle = r() < 0.5 ? '#8a5a3a' : '#e8d2b0'; wrap(x, y, (X, Y) => { g.beginPath(); g.ellipse(X, Y, s, s * 0.7, r() * 3, 0, 7); g.fill(); }); } }
  return cv;
}
function landPaveCanvas(kind) {
  const N = 512, cv = landCanvas(N, N), g = cv.getContext('2d'), r = landRand(kind === 'asphalt' ? 71 : 73);
  g.fillStyle = kind === 'asphalt' ? '#4a4b4d' : '#b9b5ad'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 40000; i++) { const v = kind === 'asphalt' ? 50 + r() * 60 : 150 + r() * 70; g.fillStyle = `rgba(${v},${v},${v - (kind === 'asphalt' ? 0 : 6)},${0.25 + r() * 0.4})`; g.fillRect(r() * N, r() * N, 1 + r() * 2, 1 + r() * 2); }
  if (kind === 'concrete') { g.strokeStyle = 'rgba(80,78,72,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 1); g.lineTo(N, 1); g.moveTo(1, 0); g.lineTo(1, N); g.stroke(); }
  return cv;
}

/* ---------- Trees, shrubs and boards (pictures with see-through backgrounds) ---------- */
function landTreeCanvas(kind) {
  const W = kind === 'shrub' ? 256 : 512, H = kind === 'shrub' ? 160 : 1024, cv = landCanvas(W, H), g = cv.getContext('2d'), r = landRand({ pine: 5, broad: 7, aspen: 9, shrub: 13, sage: 17 }[kind]);
  const leafs = { pine: ['#14261a', '#1a301c', '#22402a', '#2c5030', '#3a6238'], broad: ['#22401c', '#2b4d20', '#355e26', '#41702d', '#4f8236', '#62983f'], aspen: ['#4c6a2a', '#5f7d32', '#749440', '#8aa84c', '#a4b85a'], shrub: ['#3a6128', '#4a7631', '#2f5021', '#5a8a3a'], sage: ['#7d8a6c', '#8f9a7c', '#6c7a5e', '#a2aa8c'] }[kind];
  const blob = (x, y, s, c, a = 1) => { g.globalAlpha = a; g.fillStyle = c; g.beginPath(); g.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * 3, 0, 7); g.fill(); };
  if (kind === 'pine') {
    g.strokeStyle = '#4a3423'; g.lineWidth = 14; g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, H * 0.1); g.stroke();
    // Tiers of drooping branches, wide at the bottom and narrow at the tip, darker inside and lit on the sunny side.
    for (let i = 0; i < 9000; i++) {
      const t = Math.pow(r(), 0.8), y = H * 0.06 + t * H * 0.86, half = (W * 0.47) * (0.08 + t * 0.92), x = W / 2 + (r() * 2 - 1) * half * Math.sqrt(r());
      const edge = Math.abs(x - W / 2) / Math.max(1, half), lit = x < W / 2 ? 1 : 0, ci = Math.min(leafs.length - 1, ((1 - edge) * 1.5 + lit * 1.8 + r() * 1.5) | 0);
      blob(x, y + edge * 10, 2 + r() * 4.5, leafs[ci], 0.9);
    }
  } else if (kind === 'broad' || kind === 'aspen') {
    const trunk = kind === 'aspen' ? '#d8d4c8' : '#3a2d23', top = kind === 'aspen' ? 0.12 : 0.05, crownY = kind === 'aspen' ? H * 0.38 : H * 0.36, crownR = kind === 'aspen' ? W * 0.3 : W * 0.44;
    g.strokeStyle = trunk; g.lineCap = 'round'; g.lineWidth = kind === 'aspen' ? 12 : 22; g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2 + 4, H * 0.45); g.stroke();
    if (kind === 'aspen') { g.fillStyle = '#3a3a36'; for (let i = 0; i < 14; i++) g.fillRect(W / 2 - 5, H * 0.5 + r() * H * 0.48, 9, 3); }
    for (let i = 0; i < (kind === 'aspen' ? 4 : 9); i++) { const a = -Math.PI / 2 + (r() - 0.5) * (kind === 'aspen' ? 0.9 : 1.6), L = crownR * (0.4 + r() * 0.35); g.lineWidth = 4 + r() * 6; g.beginPath(); g.moveTo(W / 2, H * 0.55); g.lineTo(W / 2 + Math.cos(a) * L, H * 0.55 + Math.sin(a) * L * 1.1); g.stroke(); }
    // The crown: lumpy clusters of small leaves, each cluster lit on its upper left and shaded underneath, with sky
    // showing between them at the edge.
    const cl = [];
    for (let i = 0; i < (kind === 'aspen' ? 16 : 22); i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.78; cl.push({ x: W / 2 + Math.cos(a) * d * crownR, y: crownY + Math.sin(a) * d * crownR * (kind === 'aspen' ? 1.6 : 0.95), s: crownR * (0.22 + r() * 0.18) }); }
    cl.sort((p, q) => q.y - p.y);
    cl.forEach(c => {
      for (let i = 0; i < 900; i++) {
        const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6), x = c.x + Math.cos(a) * d * c.s, y = c.y + Math.sin(a) * d * c.s * 0.85;
        if (y < H * top) continue;
        const light = (c.x - x) / c.s * 0.5 + (c.y - y) / c.s * 0.9 + (crownY - c.y) / crownR * 0.5 - d * 0.3 + (r() - 0.5) * 0.9;
        const ci = Math.max(0, Math.min(leafs.length - 1, Math.round((light + 1) / 2 * (leafs.length - 1))));
        blob(x, y, 1.6 + r() * 3, leafs[ci], 0.9);
      }
    });
  } else {
    for (let i = 0; i < 900; i++) {
      const a = Math.PI + r() * Math.PI, d = Math.sqrt(r()), x = W / 2 + Math.cos(a) * d * W * 0.46, y = H - 4 + Math.sin(a) * d * H * 0.9;
      const ci = Math.max(0, Math.min(leafs.length - 1, Math.round(((H - y) / H + r() * 0.8) * (leafs.length - 1) / 1.6)));
      blob(x, y, 3 + r() * 6, leafs[ci], 0.9);
    }
  }
  g.globalAlpha = 1;
  return cv;
}
// The same tree seen from above: a round crown of leaf clusters (so the 3D view from overhead shows trees, not crosses).
function landTopCanvas(kind) {
  const N = 256, cv = landCanvas(N, N), g = cv.getContext('2d'), r = landRand({ pine: 41, broad: 43, aspen: 47, shrub: 53, sage: 59 }[kind]);
  const leafs = { pine: ['#14261a', '#1a301c', '#22402a', '#2c5030', '#3a6238'], broad: ['#22401c', '#2b4d20', '#355e26', '#41702d', '#4f8236', '#62983f'], aspen: ['#4c6a2a', '#5f7d32', '#749440', '#8aa84c', '#a4b85a'], shrub: ['#2f5021', '#3a6128', '#4a7631', '#5a8a3a'], sage: ['#6c7a5e', '#7d8a6c', '#8f9a7c', '#a2aa8c'] }[kind];
  const cl = []; for (let i = 0; i < (kind === 'pine' ? 10 : 14); i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * N * 0.3; cl.push({ x: N / 2 + Math.cos(a) * d, y: N / 2 + Math.sin(a) * d, s: N * (0.12 + r() * 0.08) }); }
  cl.forEach(c => { for (let i = 0; i < 500; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6), x = c.x + Math.cos(a) * d * c.s, y = c.y + Math.sin(a) * d * c.s;
    const light = (c.x - x) / c.s * 0.5 + (c.y - y) / c.s * 0.5 - d * 0.4 - Math.hypot(c.x - N / 2, c.y - N / 2) / N + (r() - 0.5) * 0.9;
    g.fillStyle = leafs[Math.max(0, Math.min(leafs.length - 1, Math.round((light + 1) / 2 * (leafs.length - 1))))];
    g.beginPath(); g.ellipse(x, y, 1.5 + r() * 2.5, 1.2 + r() * 2, r() * 3, 0, 7); g.fill();
  } });
  return cv;
}
function landBoardCanvas() {
  const W = 512, H = 512, cv = landCanvas(W, H), g = cv.getContext('2d'), r = landRand(29), bw = W / 6;
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Color().setHSL(0.07 + r() * 0.02, 0.38 + r() * 0.12, 0.42 + r() * 0.1);
    g.fillStyle = '#' + c.getHexString(); g.fillRect(i * bw, 0, bw, H);
    for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(${r() < 0.5 ? '70,40,20' : '200,150,110'},${0.12 + r() * 0.15})`; g.lineWidth = 1 + r() * 2; const x = i * bw + r() * bw; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 8, H / 3, x + (r() - 0.5) * 8, H * 2 / 3, x + (r() - 0.5) * 6, H); g.stroke(); }
    if (r() < 0.6) { g.fillStyle = 'rgba(60,35,18,.55)'; g.beginPath(); g.ellipse(i * bw + bw * (0.3 + r() * 0.4), r() * H, 4, 6, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(30,18,10,.85)'; g.fillRect(i * bw, 0, 3, H);
  }
  return cv;
}
function landSidingCanvas() {
  const W = 1024, H = 256, cv = landCanvas(W, H), g = cv.getContext('2d');
  g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 10) { g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(0, y + 8, W, 2); }
  // Windows with white trim, a door in the middle; one picture fits a 50' face 11' tall.
  const win = (x, y, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(x - 5, y - 5, w + 10, h + 10); g.fillStyle = '#2d3946'; g.fillRect(x, y, w, h); const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, 'rgba(190,210,230,.55)'); gr.addColorStop(0.5, 'rgba(120,140,160,.1)'); gr.addColorStop(1, 'rgba(200,215,230,.35)'); g.fillStyle = gr; g.fillRect(x, y, w, h); g.fillStyle = '#ffffff'; g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h / 2 - 2, w, 4); };
  [70, 230, 690, 850].forEach(x => win(x, 70, 100, 90));
  g.fillStyle = '#ffffff'; g.fillRect(455, 60, 114, 196); g.fillStyle = '#4b3a30'; g.fillRect(465, 70, 94, 186); g.fillStyle = '#c9a54a'; g.fillRect(540, 160, 8, 8);
  return cv;
}
function landShingleCanvas() {
  const N = 256, cv = landCanvas(N, N), g = cv.getContext('2d'), r = landRand(31);
  g.fillStyle = '#4a4b4f'; g.fillRect(0, 0, N, N);
  for (let y = 0; y < N; y += 16) for (let x = -((y / 16) % 2) * 16; x < N; x += 32) { const v = 55 + r() * 30; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(x + 1, y + 1, 30, 14); }
  return cv;
}

/* ---------- The far band: mountains, mesas, tree lines and roofs painted around the horizon ---------- */
// A wavy line that joins up all the way round (only whole numbers of waves), u from 0 to 1.
function landRidge(r, n, rough) {
  const w = []; for (let i = 0; i < n; i++) w.push({ f: 1 + ((r() * (3 + i * i * 1.6)) | 0) + i, a: Math.pow(rough, i) * (0.6 + r() * 0.4), p: r() * Math.PI * 2, sharp: r() < 0.5 });
  const S = w.reduce((s, x) => s + x.a, 0);
  return u => w.reduce((s, x) => { const v = Math.sin(u * Math.PI * 2 * x.f + x.p); return s + x.a * (x.sharp ? 1 - Math.abs(v) * 2 + 0.5 : v * 0.5 + 0.5); }, 0) / S;
}
function landBandCanvas(kind) {
  const W = 4096, H = 512, cv = landCanvas(W, H), g = cv.getContext('2d'), r = landRand(kind.length * 131 + 3);
  const fill = (col, f) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 4) g.lineTo(x, H - f(x / W) * H); g.lineTo(W, H); g.closePath(); g.fill(); };
  // Trees along a line: little cones or round crowns standing on the given height.
  const trees = (base, col, size, n, round, hz) => {
    for (let i = 0; i < n; i++) {
      const u = r(), x = u * W, y = H - base(u) * H, s = size * (0.6 + r() * 0.7), c = col[(r() * col.length) | 0];
      for (const X of [x, x - W, x + W]) {
        g.fillStyle = c; g.beginPath();
        if (round) g.ellipse(X, y - s * 0.55, s * 0.55, s * 0.6, 0, 0, 7); else { g.moveTo(X - s * 0.32, y + 2); g.lineTo(X, y - s * 1.4); g.lineTo(X + s * 0.32, y + 2); }
        g.fill();
      }
    }
    if (hz) { g.fillStyle = hz; g.fillRect(0, H - base(0) * H, 0, 0); }
  };
  const flat = h => () => h;
  if (kind === 'mountains') {
    const a = landRidge(r, 6, 0.55), b = landRidge(r, 6, 0.5), c = landRidge(r, 5, 0.5);
    const far = u => 0.42 + a(u) * 0.5, mid = u => 0.22 + b(u) * 0.36, low = u => 0.08 + c(u) * 0.16;
    fill('#a9b9cc', far);
    // Snow on the high peaks of the far range.
    g.save(); g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 4) g.lineTo(x, H - far(x / W) * H); g.lineTo(W, H); g.closePath(); g.clip();
    g.fillStyle = '#eef2f6'; g.beginPath(); g.moveTo(0, 0); for (let x = 0; x <= W; x += 4) g.lineTo(x, H - (0.7 + 0.04 * Math.sin(x / 37) + 0.03 * Math.sin(x / 11)) * H); g.lineTo(W, 0); g.closePath(); g.fill();
    g.restore();
    fill('#7f93a7', mid);
    fill('#5f7660', low);
    trees(low, ['#3d5638', '#344c31', '#46603f'], 26, 900, false);
    fill('#4f6845', flat(0.035));
  } else if (kind === 'desert') {
    // Flat topped mesas and buttes with steep sides, lighter and pinker the farther away.
    const mesa = (col, base, top, n, minW, maxW) => {
      for (let i = 0; i < n; i++) {
        const cx = r() * W, w = minW + r() * (maxW - minW), h = (base + r() * top) * H, k = w * (0.08 + r() * 0.1);
        for (const X of [cx, cx - W, cx + W]) {
          g.fillStyle = col; g.beginPath(); g.moveTo(X - w / 2 - k * 2, H); g.lineTo(X - w / 2, H - h + 4); g.lineTo(X - w / 2 + k, H - h); g.lineTo(X + w / 2 - k, H - h); g.lineTo(X + w / 2, H - h + 6); g.lineTo(X + w / 2 + k * 2.5, H); g.closePath(); g.fill();
          g.fillStyle = 'rgba(255,240,220,.18)'; for (let s = 0; s < 4; s++) g.fillRect(X - w / 2 + k * 0.5, H - h + 10 + s * h * 0.16, w - k, 3);
        }
      }
    };
    fill('#d9b9a6', u => 0.12 + landRidge(r, 4, 0.5)(u) * 0.12);
    mesa('#cf9f86', 0.25, 0.35, 10, 120, 420);
    mesa('#b9714c', 0.16, 0.28, 12, 80, 300);
    fill('#b98a62', u => 0.06 + landRidge(r, 5, 0.5)(u) * 0.07);
    for (let i = 0; i < 1800; i++) { const x = r() * W, y = H - r() * H * 0.08; g.fillStyle = r() < 0.5 ? '#8f8a6a' : '#a39a76'; g.beginPath(); g.ellipse(x, y, 3 + r() * 4, 2 + r() * 2, 0, 0, 7); g.fill(); }
  } else if (kind === 'forest') {
    const a = landRidge(r, 5, 0.5), hill = u => 0.25 + a(u) * 0.35;
    fill('#8ea6a0', hill);
    trees(hill, ['#6f8c80', '#7a978a', '#678476'], 22, 900, false);
    const b = landRidge(r, 5, 0.5), near = u => 0.08 + b(u) * 0.12;
    fill('#3c5636', near);
    trees(near, ['#29432a', '#304d2f', '#3a5a35', '#24391f'], 60, 1100, false);
    trees(flat(0.05), ['#2f4a2c', '#3b5b34', '#456a3a'], 70, 400, true);
    fill('#2f472b', flat(0.03));
  } else {
    // Backyard and street: neighbours' trees with a roof here and there, then low hills far off.
    const a = landRidge(r, 4, 0.5);
    fill('#a3b4bd', u => 0.16 + a(u) * 0.22);
    const line = u => 0.07;
    for (let i = 0; i < 26; i++) {
      const x = r() * W, w = 60 + r() * 90, h = H * (0.1 + r() * 0.05), roof = ['#5c5d62', '#6b5a4e', '#4c4f55'][(r() * 3) | 0], wall = ['#d9d4c9', '#c7cdd0', '#d8c7ad', '#b9b2a6'][(r() * 4) | 0];
      g.fillStyle = wall; g.fillRect(x - w / 2, H - h, w, h);
      g.fillStyle = roof; g.beginPath(); g.moveTo(x - w / 2 - 8, H - h + 2); g.lineTo(x, H - h - w * 0.28); g.lineTo(x + w / 2 + 8, H - h + 2); g.closePath(); g.fill();
    }
    trees(line, ['#4c6b3c', '#557645', '#3f5c33', '#5f7f48'], 70, 380, true);
    trees(line, ['#3a5631', '#2f4a2b'], 80, 90, false);
    fill('#557a3c', flat(0.04));
  }
  return cv;
}

/* ---------- Geometry helpers: many small pieces become one mesh per look ---------- */
function landMerge(geos) {
  const parts = geos.map(g => g.index ? g.toNonIndexed() : g), n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  let o = 0;
  parts.forEach(g => {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + c) * 3);
    o += c;
  });
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const landTint = (geo, c) => { const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };
// A tree or shrub: two crossed pictures standing on the ground. Normals point up and a little out, so the whole
// tree takes the sky and the sun evenly instead of flipping light to dark as you walk round it.
function landCross(x, z, w, h, turn, tint) {
  // Each picture twice, back to back, so both faces keep the same upward normal (a two-sided face would turn dark from behind).
  const geos = [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(a => {
    const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2 - 2, 0); g.rotateY(turn + a); g.translate(x, 0, z);
    const nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
    return landTint(g, tint);
  });
  return geos;
}
function landStd(key, o) {
  LAND.mats = LAND.mats || {};
  return LAND.mats[key] || (LAND.mats[key] = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, envMapIntensity: 0.15, ...o }));
}
function landMesh(geo, mat, o = {}) {
  const m = new THREE.Mesh(geo, mat); m.userData.noBounds = true; m.userData.noAO = !!o.noAO; m.userData.land = o.land || 'near';
  m.receiveShadow = o.shadow !== false; m.castShadow = false; if (o.order) m.renderOrder = o.order;
  return m;
}
function landBox(w, h, d, x, y, z, ry = 0) { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(ry); g.translate(x, y, z); return g; }

/* ---------- One landscape around the room ---------- */
// ext: the room's floor box in plan inches. Pieces stay out of a clear zone round the room so nothing stands in a window.
function landBuild(kind, ext) {
  const key = kind + ':' + [ext.x0, ext.x1, ext.y0, ext.y1].map(n => Math.round(n / 12)).join(',');
  if (LAND.cache[key]) return LAND.cache[key];
  const ks = Object.keys(LAND.cache); if (ks.length > 4) delete LAND.cache[ks[0]];
  const grp = new THREE.Group(); grp.userData.noBounds = true; grp.userData.land = 'root';
  const R = LAND.R, cx = (ext.x0 + ext.x1) / 2, cz = (ext.y0 + ext.y1) / 2, r = landRand(4242 + kind.length * 7);
  const clear = 216, out = (x, z, m = clear) => x < ext.x0 - m || x > ext.x1 + m || z < ext.y0 - m || z > ext.y1 + m;

  // Sky: a dome with a colour at every point (landSun sets them for the time of day).
  const sg = new THREE.SphereGeometry(R * 1.6, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.62); sg.translate(cx, 0, cz);
  sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sg.attributes.position.count * 3).fill(1), 3));
  grp.add(landMesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false }), { land: 'sky', noAO: true, shadow: false, order: -20 }));

  // Ground: a big square with its picture repeating every 12', plus faint large patches so the repeat doesn't show.
  const gk = { yard: 'lawn', street: 'lawn', forest: 'duff', mountains: 'meadow', desert: 'sand' }[kind];
  const gg = new THREE.PlaneGeometry(R * 2.2, R * 2.2, 96, 96); gg.rotateX(-Math.PI / 2); gg.translate(cx, -0.6, cz);
  const uv = gg.attributes.uv, gp = gg.attributes.position, gc = new Float32Array(gp.count * 3), nz = landRidge(landRand(77), 4, 0.6), nz2 = landRidge(landRand(78), 4, 0.6);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * R * 2.2 / 144, uv.getY(i) * R * 2.2 / 144);
    const x = gp.getX(i), z = gp.getZ(i), k = 0.86 + 0.14 * nz((x / 6000) % 1 + 1) * nz2((z / 5200) % 1 + 1) * 2;
    gc.set([k, k, k * 0.97], i * 3);
  }
  gg.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  grp.add(landMesh(gg, landStd('g-' + gk, { map: landTexture('g-' + gk, () => landGroundCanvas(gk), { repeat: true }), vertexColors: true, color: gk === 'sand' ? 0xc4c4c4 : 0x9a9a9a })));

  // Far band all the way round, standing on the ground at the edge.
  const bandH = { mountains: 1700, desert: 1100, forest: 700, yard: 560, street: 560 }[kind];
  const bg = new THREE.CylinderGeometry(R, R, bandH, 128, 1, true); bg.translate(cx, bandH / 2 - 8, cz);
  const bt = landTexture('band-' + kind, () => landBandCanvas(kind), { wrapX: true }); bt.repeat.set(kind === 'mountains' || kind === 'desert' ? 1 : 2, 1);
  grp.add(landMesh(bg, new THREE.MeshBasicMaterial({ map: bt, transparent: true, side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false }), { land: 'far', noAO: true, shadow: false, order: -19 }));

  // Trees and shrubs, merged into one mesh per picture.
  const flora = {};
  const TOPS = { broad: [[0.64, 0.92]], aspen: [[0.66, 0.9]], pine: [[0.22, 0.95], [0.5, 0.6]], shrub: [[0.55, 0.95]], sage: [[0.5, 0.95]] };
  const plant = (pic, x, z, w, h, tint) => {
    (flora[pic] = flora[pic] || []).push(...landCross(x, z, w, h, r() * Math.PI, tint));
    // A flat crown seen from above at the height of its widest part.
    (TOPS[pic] || []).forEach(([y, k]) => { const g = new THREE.PlaneGeometry(w * k, w * k); g.rotateX(-Math.PI / 2); g.rotateY(r() * 6); g.translate(x, h * y, z); (flora['top-' + pic] = flora['top-' + pic] || []).push(landTint(g, tint)); });
  };
  const tint = (h, s, l) => new THREE.Color().setHSL(h, s, l);
  const scatter = (n, rMin, rMax, f) => { let k = 0, tries = 0; while (k < n && tries++ < n * 30) { const a = r() * Math.PI * 2, d = rMin + Math.pow(r(), 0.7) * (rMax - rMin), x = cx + Math.cos(a) * (d + (ext.x1 - ext.x0) / 2), z = cz + Math.sin(a) * (d + (ext.y1 - ext.y0) / 2); if (!out(x, z)) continue; if (f(x, z, d) !== false) k++; } };
  const pine = (x, z, s = 1) => { const h = (360 + r() * 360) * s; plant('pine', x, z, h * 0.42, h, tint(0.28, 0.1 + r() * 0.15, 0.78 + r() * 0.22)); };
  const broad = (x, z, s = 1) => { const h = (300 + r() * 220) * s; plant('broad', x, z, h * 0.85, h, tint(0.2 + r() * 0.06, 0.15, 0.8 + r() * 0.2)); };
  const aspen = (x, z) => { const h = 300 + r() * 220; plant('aspen', x, z, h * 0.5, h, tint(0.16, 0.2, 0.85 + r() * 0.15)); };
  const shrub = (x, z, pic = 'shrub') => { const w = (pic === 'sage' ? 36 : 54) + r() * 40; plant(pic, x, z, w, w * 0.62, tint(0.2, 0.1, 0.82 + r() * 0.18)); };
  const solid = [], flat = [];   // solid: 3D pieces that take the sun; flat: paving just above the ground

  if (kind === 'forest') {
    scatter(520, 160, 4200, (x, z) => { const q = r(); if (q < 0.55) pine(x, z); else if (q < 0.8) broad(x, z); else aspen(x, z); });
    scatter(160, 10, 900, (x, z) => shrub(x, z));
  } else if (kind === 'mountains') {
    scatter(150, 300, 5200, (x, z) => { const q = r(); if (q < 0.65) pine(x, z, 0.9); else aspen(x, z); });
    scatter(120, 30, 2400, (x, z) => shrub(x, z, r() < 0.5 ? 'sage' : 'shrub'));
  } else if (kind === 'desert') {
    scatter(260, 20, 5000, (x, z) => shrub(x, z, 'sage'));
    // Red sandstone boulders, chunky and lit by the sun.
    const rocks = [];
    scatter(70, 60, 4000, (x, z) => {
      const s = 14 + Math.pow(r(), 2.5) * 90, g = new THREE.IcosahedronGeometry(s, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 0.75 + r() * 0.45; p.setXYZ(i, p.getX(i) * k * 1.3, p.getY(i) * k * 0.7, p.getZ(i) * k); }
      g.computeVertexNormals(); g.rotateY(r() * 6); g.translate(x, s * 0.25, z);
      rocks.push(landTint(g, tint(0.04 + r() * 0.03, 0.45, 0.42 + r() * 0.12)));
    });
    if (rocks.length) solid.push([landMerge(rocks), landStd('rock', { vertexColors: true, flatShading: true, roughness: 1 })]);
  } else if (kind === 'yard') {
    // A 6' cedar privacy fence 30' out from the room, posts every 8', boards on the inside face.
    const m = 360, fx0 = ext.x0 - m, fx1 = ext.x1 + m, fz0 = ext.y0 - m, fz1 = ext.y1 + m, H = 72, boards = [], posts = [];
    const run = (x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(-(z1 - z0), x1 - x0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const g = landBox(L, H, 0.75, 0, H / 2, 0); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * L / 33, u.getY(i)); g.rotateY(a); g.translate(mx, 0, mz); boards.push(g);
      const n = Math.max(1, Math.round(L / 96)); for (let i = 0; i <= n; i++) { const t = i / n; posts.push(landBox(3.5, H + 4, 3.5, x0 + (x1 - x0) * t, (H + 4) / 2, z0 + (z1 - z0) * t)); }
      posts.push(landBox(L, 1.5, 3.5, 0, 0, 0, a).translate(mx, H * 0.15, mz), landBox(L, 1.5, 3.5, 0, 0, 0, a).translate(mx, H * 0.85, mz));
    };
    run(fx0, fz0, fx1, fz0); run(fx1, fz0, fx1, fz1); run(fx1, fz1, fx0, fz1); run(fx0, fz1, fx0, fz0);
    solid.push([landMerge(boards), landStd('fence', { map: landTexture('fence', landBoardCanvas, { repeat: true }), side: THREE.DoubleSide })]);
    solid.push([landMerge(posts), landStd('post', { color: 0x7a5a40 })]);
    // Shrubs along the fence inside, a couple of yard trees, the neighbours' trees beyond.
    for (let i = 0; i < 40; i++) { const t = r(), side = (r() * 4) | 0, x = side < 2 ? fx0 + 30 + t * (fx1 - fx0 - 60) : side === 2 ? fx0 + 30 : fx1 - 30, z = side >= 2 ? fz0 + 30 + t * (fz1 - fz0 - 60) : side === 0 ? fz0 + 30 : fz1 - 30; if (out(x, z, 120)) shrub(x, z); }
    [[fx0 + 110, fz0 + 120], [fx1 - 140, fz1 - 110]].forEach(([x, z]) => broad(x, z, 0.85));
    scatter(110, m + 120, 2600, (x, z) => { if (x > fx0 - 60 && x < fx1 + 60 && z > fz0 - 60 && z < fz1 + 60) return false; r() < 0.75 ? broad(x, z) : pine(x, z); });
  } else if (kind === 'street') {
    // The street runs along the bottom of the plan: lawn, sidewalk, park strip, curb, road; houses across and beside.
    const zL = ext.y1 + 300, zW = zL + 60, zP = zW + 54, zR = zP + 360, zP2 = zR + 54, zW2 = zP2 + 60, xa = cx - R, xb = cx + R;
    const strip = (z0, z1, k) => { const g = new THREE.PlaneGeometry(xb - xa, z1 - z0); g.rotateX(-Math.PI / 2); g.translate(cx, 0, (z0 + z1) / 2); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * (xb - xa) / (k === 'asphalt' ? 240 : 60), u.getY(i) * (z1 - z0) / (k === 'asphalt' ? 240 : 60)); return g; };
    const walk = [strip(zL, zW, 'concrete'), strip(zP2, zW2, 'concrete')];
    flat.push([landMerge(walk), landStd('concrete', { map: landTexture('concrete', () => landPaveCanvas('concrete'), { repeat: true }) }), 0.3]);
    flat.push([landMerge([strip(zP, zR, 'asphalt')]), landStd('asphalt', { map: landTexture('asphalt', () => landPaveCanvas('asphalt'), { repeat: true }), roughness: 0.9 }), -0.2]);
    solid.push([landMerge([landBox(xb - xa, 6, 6, cx, 3, zP - 3), landBox(xb - xa, 6, 6, cx, 3, zR + 3)]), landStd('curb', { color: 0xbdb8b0 })]);
    // Houses: siding walls with windows and a door, a shingle gable roof, a driveway to the road.
    const walls = [], roofs = [], drives = [], sideT = [0.07, 0.55, 0.12, 0.6, 0.1];
    const house = (x, z, face) => {
      const W = 600, D = 420, Hh = 132, rise = 110, col = tint(sideT[(r() * 5) | 0], 0.12 + r() * 0.12, 0.78 + r() * 0.12);
      const g = landBox(W, Hh, D, 0, Hh / 2, 0); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i), u.getY(i));
      g.rotateY(face); g.translate(x, 0, z); walls.push(landTint(g, col));
      // Gable roof: a long triangle prism with 18" eaves.
      const sh = new THREE.Shape([new THREE.Vector2(-D / 2 - 18, 0), new THREE.Vector2(D / 2 + 18, 0), new THREE.Vector2(0, rise)].map(p => p));
      const rg = new THREE.ExtrudeGeometry(sh, { depth: W + 24, bevelEnabled: false }); rg.translate(0, 0, -(W + 24) / 2); rg.rotateY(Math.PI / 2 + face); rg.translate(x, Hh, z);
      const ru = rg.attributes.uv; for (let i = 0; i < ru.count; i++) ru.setXY(i, ru.getX(i) / 60, ru.getY(i) / 60);
      roofs.push(rg);
      const dz = face === 0 ? 1 : -1;
      const dg = new THREE.PlaneGeometry(200, Math.abs(zW2 - (z - dz * D / 2)) + 6); dg.rotateX(-Math.PI / 2); dg.translate(x + W / 2 - 140, 0, ((z - dz * D / 2) + zW2) / 2); if (face === Math.PI) drives.push(dg);
      broad(x - W / 2 - 60, z - dz * (D / 2 + 140), 0.8); shrub(x - 120, z - dz * (D / 2 + 30)); shrub(x + 40, z - dz * (D / 2 + 30));
    };
    for (let i = -4; i <= 4; i++) house(cx + i * 840 + 120, zW2 + 300 + 210, Math.PI);
    // Next door on each side and a row behind, set off the room so its windows look out on yards.
    const sx = Math.max(ext.x1 - cx, cx - ext.x0) + 300 + 300;
    house(cx - sx, cz + 60, 0); house(cx + sx, cz + 60, 0);
    for (let i = -3; i <= 3; i++) house(cx + i * 840 - 200, ext.y0 - 900, 0);
    for (let i = -10; i <= 10; i++) { broad(cx + i * 480 + 90, (zW + zP) / 2, 0.9); broad(cx + i * 480 + 330, (zP2 + zW2) / 2, 0.9); }
    scatter(60, 1600, 4000, (x, z) => { if (z > zL - 60 && z < zW2 + 60) return false; broad(x, z); });
    solid.push([landMerge(walls), landStd('siding', { map: landTexture('siding', landSidingCanvas), vertexColors: true, roughness: 0.85 })]);
    solid.push([landMerge(roofs), landStd('roof', { map: landTexture('roof', landShingleCanvas, { repeat: true }), roughness: 0.9 })]);
    if (drives.length) flat.push([landMerge(drives), landStd('concrete2', { map: landTexture('concrete', () => landPaveCanvas('concrete'), { repeat: true }) }), 0.2]);
    for (let i = 0; i < 30; i++) shrub(cx + (r() - 0.5) * (ext.x1 - ext.x0 + 600), zL - 20 - r() * 40);
  }
  Object.entries(flora).forEach(([pic, geos]) => {
    const m = landMesh(landMerge(geos), landStd('tree-' + pic, { map: landTexture('tree-' + pic, () => pic.startsWith('top-') ? landTopCanvas(pic.slice(4)) : landTreeCanvas(pic)), alphaTest: 0.45, vertexColors: true, envMapIntensity: 0 }), { noAO: true, shadow: false });
    grp.add(m);
  });
  solid.forEach(([g, m]) => grp.add(landMesh(g, m)));
  flat.forEach(([g, m, y]) => { g.translate(0, y, 0); const o = landMesh(g, m); o.material.polygonOffset = true; o.material.polygonOffsetFactor = -1; grp.add(o); });
  return (LAND.cache[key] = grp);
}

// Called from buildRoomScene: adds the room's landscape (Realistic only, the room's 3D view only, not in prints).
function landAdd(v, ext) {
  const kind = landOf(); if (kind === 'plain' || !ext) return false;
  if (typeof roomViewer !== 'undefined' && v !== roomViewer) return false;
  if (typeof BEVEL3 === 'object' && BEVEL3.off) return false;
  try { v.root.add(landBuild(kind, ext)); return true; } catch (e) { console.error('landscape', e); return false; }
}

/* ---------- Time of day (runs in Cabinet Designer and in the walk file) ---------- */
// The sky: deep blue overhead, pale at the horizon, warm toward a low sun, dark blue at night. The far band dims with it.
function landSun(v, S0) {
  if (!v || !v.root) return;
  const d = S0.day, low = S0.low, sd = S0.dir;
  const zen = mixHex(0x0b1020, 0x3f78c4, d), hor = mixHex(0x1d2540, 0xd6e3ef, d).lerp(new THREE.Color(0xf2b68a), low * d * 0.7), glow = new THREE.Color(0xfff0d6).lerp(new THREE.Color(0xffa060), low);
  const far = mixHex(0x1e2433, 0xffffff, Math.pow(d, 0.8)).lerp(new THREE.Color(0xffd2b0), low * d * 0.35);
  v.root.traverse(o => {
    const L = o.userData && o.userData.land; if (!L || !o.isMesh) return;
    if (L === 'far') { o.material.color.copy(far); return; }
    if (L !== 'sky') return;
    const p = o.geometry.attributes.position, c = o.geometry.attributes.color, sp = o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere);
    const R = sp.radius, cx = sp.center.x, cz = sp.center.z, q = new THREE.Color(), n = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      n.set(p.getX(i) - cx, p.getY(i), p.getZ(i) - cz).normalize();
      const up = Math.max(0, n.y), t = Math.pow(up, 0.45);
      q.copy(hor).lerp(zen, t);
      const s = Math.max(0, n.dot(sd)), gk = d * (Math.pow(s, 24) * 0.9 + Math.pow(s, 4) * 0.25 * (0.4 + low));
      q.lerp(glow, Math.min(1, gk));
      c.setXYZ(i, q.r, q.g, q.b);
    }
    c.needsUpdate = true;
  });
}

/* ---------- Floors (Ayden 2026-11-25): look only, per room ----------
   Room tab › Floor (and Textures › Floor, the same pick: room.tex.floor = 'fl:<key>'). Each floor is painted from
   code as a 96" tile that repeats without seams, like the oak floor before it. Plain 3D shows its colour. */
const FLOORS = [
  { k: 'oak', n: 'Oak planks', g: 'Wood', t: 'wood', col: '#b8916a', pw: 5, con: 1 },
  { k: 'whiteoak', n: 'White oak planks', g: 'Wood', t: 'wood', col: '#cdb08a', pw: 7, con: 0.8 },
  { k: 'hickory', n: 'Hickory planks', g: 'Wood', t: 'wood', col: '#a7774c', pw: 5, con: 1.6 },
  { k: 'walnut', n: 'Walnut planks', g: 'Wood', t: 'wood', col: '#6b4932', pw: 5, con: 1.1 },
  { k: 'espresso', n: 'Dark stained planks', g: 'Wood', t: 'wood', col: '#3f2c22', pw: 5, con: 0.8 },
  { k: 'lvp-grey', n: 'LVP grey oak', g: 'LVP', t: 'wood', col: '#9d958b', pw: 7, con: 0.7, lvp: true },
  { k: 'lvp-natural', n: 'LVP natural oak', g: 'LVP', t: 'wood', col: '#c2a27c', pw: 7, con: 0.7, lvp: true },
  { k: 'lvp-white', n: 'LVP whitewashed', g: 'LVP', t: 'wood', col: '#d8cfc2', pw: 7, con: 0.6, lvp: true },
  { k: 'tile-grey', n: 'Grey tile 12×24', g: 'Tile', t: 'tile', col: '#b3b1ac', tw: 24, th: 12, grout: '#8f8c86', run: 0.5 },
  { k: 'tile-white', n: 'White tile 24×24', g: 'Tile', t: 'tile', col: '#e6e3dd', tw: 24, th: 24, grout: '#c9c5bd' },
  { k: 'tile-black', n: 'Charcoal tile 12×24', g: 'Tile', t: 'tile', col: '#4b4c4e', tw: 24, th: 12, grout: '#3a3a3a', run: 0.5 },
  { k: 'checker', n: 'Black and white 12×12', g: 'Tile', t: 'tile', col: '#ecebe6', alt: '#2b2b2c', tw: 12, th: 12, grout: '#bdbab3' },
  { k: 'slate', n: 'Slate 16×16', g: 'Stone', t: 'tile', col: '#5c6163', tw: 16, th: 16, grout: '#47494a', stone: 1 },
  { k: 'travertine', n: 'Travertine 18×18', g: 'Stone', t: 'tile', col: '#d4c3a4', tw: 18, th: 18, grout: '#c2b398', stone: 0.6 },
  { k: 'concrete', n: 'Polished concrete', g: 'Other', t: 'concrete', col: '#a8a59f' },
  { k: 'carpet-beige', n: 'Carpet beige', g: 'Carpet', t: 'carpet', col: '#bcae96' },
  { k: 'carpet-grey', n: 'Carpet grey', g: 'Carpet', t: 'carpet', col: '#8d8b87' },
];
const floorOf = k => FLOORS.find(f => f.k === k);
function floorPaint(f) {
  const key = 'fl-' + f.k; if (texCache3[key]) return texCache3[key];
  if (f.k === 'oak' && typeof floorCanvas === 'function') return (texCache3[key] = floorCanvas());
  const N = f.t === 'carpet' ? 1024 : 2048, IN = N / 96, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data, base = hexRGB(f.col), alt = f.alt ? hexRGB(f.alt) : null, n1 = noise2(5 + f.k.length), n2 = noise2(9 + f.k.length), n3 = noise2(17 + f.k.length);
  let seed = 7 + f.k.length * 13; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  if (f.t === 'wood') {
    const P = Math.ceil(96 / f.pw), rows = [];
    for (let r = 0; r < P; r++) { const cuts = []; let at = rnd() * 60; while (at < 96 + 72) { cuts.push(at % 96); at += (f.lvp ? 36 : 24) + rnd() * 48; } rows.push({ cuts: cuts.sort((x, y) => x - y), tone: [] }); for (let i = 0; i <= cuts.length; i++) rows[r].tone.push((rnd() - 0.5) * 0.14 * f.con); }
    for (let y = 0; y < N; y++) {
      const yi = y / IN, r = Math.min(rows.length - 1, Math.floor(yi / f.pw)), row = rows[r], inRow = yi - r * f.pw;
      for (let x = 0; x < N; x++) {
        const xi = x / IN; let k = 0; while (k < row.cuts.length && row.cuts[k] <= xi) k++;
        let near = 99; for (const c of row.cuts) near = Math.min(near, Math.abs(c - xi), 96 - Math.abs(c - xi));
        const seam = inRow < 0.05 || inRow > f.pw - 0.05 || near < 0.04, u = x / N, w = y / N, off = r * 0.37 + k * 0.61;
        // LVP repeats a printed board every few planks, so it gets calmer grain than real wood.
        const t = (w * 96 * 0.9 + off * 7) + n1(u * 12 + off, w * 24, 12, 24) * 1.4, ring = Math.pow(Math.abs(Math.sin(t * Math.PI)), 6);
        const pore = n3(u * 64, w * 400, 64, 400), drift = n2(u * 6 + off, w * 20, 6, 20) - 0.5;
        const v = seam ? 0.36 : (0.1 * ring + 0.05 * (pore - 0.5) + 0.08 * drift) * f.con - row.tone[k];
        const i = (y * N + x) * 4; for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, base[c] * (1 - v))); d[i + 3] = 255;
      }
    }
  } else if (f.t === 'tile') {
    const cols = Math.round(96 / f.tw), rowsN = Math.round(96 / f.th), tone = []; for (let i = 0; i < cols * rowsN * 2; i++) tone.push((rnd() - 0.5) * (f.stone ? 0.22 : 0.05));
    for (let y = 0; y < N; y++) {
      const yi = y / IN, r = Math.floor(yi / f.th), iy = yi - r * f.th;
      for (let x = 0; x < N; x++) {
        const sh = f.run && r % 2 ? f.tw * f.run : 0, xi = (x / IN + sh) % 96, c0 = Math.floor(xi / f.tw), ix = xi - c0 * f.tw;
        const grout = ix < 0.09 || ix > f.tw - 0.09 || iy < 0.09 || iy > f.th - 0.09, u = x / N, w = y / N, tn = tone[(r * cols + c0) % tone.length];
        const b = alt && (r + c0) % 2 ? alt : base;
        let v;
        if (grout) v = 0;
        else if (f.stone) v = tn + (n1(u * 10 + c0, w * 10 + r, 10, 10) - 0.5) * 0.3 * f.stone + (n3(u * 300, w * 300, 300, 300) - 0.5) * 0.12 * f.stone + (n2(u * 40, w * 40, 40, 40) > 0.8 ? -0.08 : 0);
        else v = tn + (n1(u * 16, w * 16, 16, 16) - 0.5) * 0.05 + (n3(u * 500, w * 500, 500, 500) - 0.5) * 0.03;
        const i = (y * N + x) * 4, gc = hexRGB(f.grout);
        for (let c = 0; c < 3; c++) d[i + c] = grout ? gc[c] : Math.max(0, Math.min(255, b[c] * (1 - v))); d[i + 3] = 255;
      }
    }
  } else {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, w = y / N;
      const v = f.t === 'carpet' ? (n3(u * 400, w * 400, 400, 400) - 0.5) * 0.35 + (n2(u * 90, w * 90, 90, 90) - 0.5) * 0.12 + (n1(u * 6, w * 6, 6, 6) - 0.5) * 0.06
        : (n1(u * 5, w * 5, 5, 5) - 0.5) * 0.14 + (n2(u * 22, w * 22, 22, 22) - 0.5) * 0.06 + (n3(u * 600, w * 600, 600, 600) > 0.86 ? 0.07 : 0);
      const i = (y * N + x) * 4; for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, base[c] * (1 - v))); d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return (texCache3[key] = cv);
}
function floorMat3(f) {
  floorMat3.c = floorMat3.c || {}; if (floorMat3.c[f.k]) return floorMat3.c[f.k];
  if (f.k === 'oak' && typeof realFloor3 === 'function') return (floorMat3.c[f.k] = realFloor3());
  const t = new THREE.CanvasTexture(floorPaint(f)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.userData.floor = true;
  if ('encoding' in t && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
  const rough = { wood: f.lvp ? 0.5 : 0.6, tile: f.stone ? 0.7 : 0.3, concrete: 0.45, carpet: 1 }[f.t];
  return (floorMat3.c[f.k] = new THREE.MeshStandardMaterial({ map: t, roughness: rough, envMapIntensity: f.t === 'carpet' ? 0 : f.t === 'tile' && !f.stone ? 0.7 : 0.4 }));
}
