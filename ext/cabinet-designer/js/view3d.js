// 3D view: three.js scene of walls, cabinets, fronts, pulls, countertops and moldings.
// Scene units are inches. Plan x maps to X, plan y maps to Z, height maps to Y.
'use strict';
const has3D = () => typeof THREE !== 'undefined' && THREE.OrbitControls;
const matCache3 = {};
// True while the room is built in the realistic look: generated wood grain, soft shadows, no outlines.
let R3 = false;
function mat3(m, opts = {}) {
  if (!m) m = { id: '_none', color: '#cccccc' };
  const tx = opts.noTex ? null : texURL(m);
  const key = m.id + '|' + (m.color || '') + '|' + (m.name || '') + '|' + (tx ? tx.length + tx.slice(-24) : '') + (opts.ghost ? '|g' : '') + (opts.sel ? '|s' + opts.sel : '') + (R3 ? '|r' : '');
  if (matCache3[key]) return matCache3[key];
  if (R3) return (matCache3[key] = realMat3(m, opts));
  const mm = new THREE.MeshStandardMaterial({ color: tx ? 0xffffff : new THREE.Color(m.color || '#cccccc'), roughness: m.kind === 'top' ? 0.35 : 0.8, metalness: 0 });
  if (tx) {
    const t = new THREE.TextureLoader().load(tx, () => viewers.forEach(v => v.requestRender()));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if ('encoding' in t && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    mm.map = t; mm.userData.texScale = m.texScale || 24;
  }
  if (opts.ghost) { mm.transparent = true; mm.opacity = 0.35; mm.depthWrite = false; }
  if (opts.sel) { mm.emissive = new THREE.Color(opts.sel); mm.emissiveIntensity = 0.32; }
  matCache3[key] = mm;
  return mm;
}
/* ---------- Realistic look ---------- */
// Tileable value noise: periods px and py are in lattice cells, so a texture built from it repeats without seams.
function noise2(seed) {
  const h = (x, y) => { let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  return (x, y, px, py) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const m = (a, p) => ((a % p) + p) % p, x0 = m(ix, px), x1 = m(ix + 1, px), y0 = m(iy, py), y1 = m(iy + 1, py);
    const a = h(x0, y0), b = h(x1, y0), c = h(x0, y1), d = h(x1, y1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
const hexRGB = hex => { const v = parseInt(String(hex || '#cccccc').replace('#', '').padEnd(6, 'c').slice(0, 6), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; };
const texCache3 = {};
// Wood grain: growth rings bent by noise, fine pores along the grain, and a little tone drift. strength 0.1 (maple) .. 0.3 (oak).
function woodCanvas(hex, strength, across) {
  const key = 'w' + hex + strength + across; if (texCache3[key]) return texCache3[key];
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data, base = hexRGB(hex), n1 = noise2(3), n2 = noise2(11), n3 = noise2(29);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (across ? y : x) / N, w = (across ? x : y) / N;
    const t = u * 16 + n1(u * 4, w * 2, 4, 2) * 2.2 + n2(u * 3, w * 1, 3, 1) * 0.8;
    const ring = Math.pow(Math.abs(Math.sin(t * Math.PI)), 10);
    const pore = n3(u * 220, w * 3, 220, 3), drift = n2(u * 5, w * 5, 5, 5) - 0.5;
    const v = strength * (0.55 * ring + 0.45 * (pore - 0.5) + 0.35 * drift);
    const i = (y * N + x) * 4;
    for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, base[k] * (1 - v)));
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (texCache3[key] = cv);
}
// Wood plank floor: 6 in planks over a 48 in tile, staggered joints, each board its own tone.
function floorCanvas() {
  if (texCache3.floor) return texCache3.floor;
  const N = 1024, P = 8, pw = N / P, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data, base = hexRGB('#b48d63'), n1 = noise2(5), n3 = noise2(17);
  const off = [0, 410, 170, 690, 300, 860, 90, 560], tone = [0.01, -0.035, 0.025, -0.015, 0.04, -0.025, 0, 0.03, -0.04, 0.015, -0.01, 0.035, -0.02, 0.02, 0.005, -0.03];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = Math.floor(x / pw), j = (y + off[p]) % N, seg = Math.floor(j / (N / 2)), u = x / N, w = y / N;
    const gap = x % pw < 2 || j % (N / 2) < 2;
    const t = u * 40 + n1(u * 16, w * 2, 16, 2) * 2.5, ring = Math.pow(Math.abs(Math.sin(t * Math.PI)), 8), pore = n3(u * 300, w * 4, 300, 4);
    const v = gap ? 0.45 : 0.09 * ring + 0.07 * (pore - 0.5) - tone[p * 2 + seg];
    const i = (y * N + x) * 4;
    for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, base[k] * (1 - v)));
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (texCache3.floor = cv);
}
const WOOD_STRENGTH = { oak: 0.24, maple: 0.12, birch: 0.1 };
// How a material reads in the realistic look, from its texture setting and name.
function surfaceLook(m) {
  const name = (m.name || '').toLowerCase(), proc = m.procedural;
  // Photos: stone tops get a polished finish, paint a satin one, wood a soft sheen.
  if (m.texture) return { url: texURL(m), rough: m.kind === 'top' && !/butcher|wood|block/.test(name) ? 0.22 : /paint/.test(m.texture.toLowerCase()) ? 0.45 : 0.58, env: m.kind === 'top' ? 0.9 : 0.6, scale: m.texScale || 24 };
  if (proc === 'stone') return { url: texURL(m), rough: 0.18, env: 1, scale: m.texScale || 40 };
  const named = /walnut|cherry|alder|hickory|\bash\b|oak|maple|birch|veneer|butcher|wood/.exec(name);
  if (!/mdf|paint|melamine|laminate/.test(name) && (WOOD_STRENGTH[proc] || named)) {
    const st = WOOD_STRENGTH[proc] || (/oak|ash|hickory/.test(name) ? 0.28 : /walnut|cherry|alder/.test(name) ? 0.22 : 0.12);
    return { canvas: woodCanvas(m.color, st, m.kind === 'top'), rough: 0.55, env: 0.45, scale: m.kind === 'top' ? 36 : 30 };
  }
  if (m.kind === 'top') return { rough: 0.32, env: 0.8 };
  return { rough: /paint/.test(name) ? 0.42 : 0.5, env: 0.3 };
}
function realMat3(m, opts) {
  const look = surfaceLook(m);
  const mm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: look.rough, metalness: 0, envMapIntensity: look.env });
  let t = null;
  if (look.canvas) t = new THREE.CanvasTexture(look.canvas);
  else if (look.url) t = new THREE.TextureLoader().load(look.url, () => viewers.forEach(v => v.requestRender()));
  if (t) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if ('encoding' in t && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    mm.map = t; mm.userData.texScale = look.scale;
  } else mm.color = new THREE.Color(m.color || '#cccccc');
  if (opts.ghost) { mm.transparent = true; mm.opacity = 0.35; mm.depthWrite = false; }
  if (opts.sel) { mm.emissive = new THREE.Color(opts.sel); mm.emissiveIntensity = 0.25; }
  return mm;
}
const metal3 = color => metal3[color] || (metal3[color] = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.32, metalness: 0.85 }));
const plain3 = {};
function flat3(color, opacity) {
  const key = color + '|' + (opacity || 1);
  if (!plain3[key]) plain3[key] = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.9, transparent: opacity < 1, opacity: opacity || 1, depthWrite: !(opacity < 1) });
  return plain3[key];
}
const edgeMat3 = () => edgeMat3.m || (edgeMat3.m = new THREE.LineBasicMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.35 }));
// Box with UVs in world inches so textures keep their real scale on every face.
function box3(w, h, d, material, x, y, z, edges = true) {
  const g = new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01));
  const k = (material.userData && material.userData.texScale) || 24;
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const j = f * 4 + i; uv.setXY(j, uv.getX(j) * dims[f][0] / k, uv.getY(j) * dims[f][1] / k); }
  const mesh = new THREE.Mesh(g, material);
  mesh.position.set(x, y, z);
  if (edges && !R3) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat3()); mesh.add(e); }
  return mesh;
}
// Group whose local axes are: x from the viewer's left end, y up, z out from the wall face.
function wallGroup(w, side, leftAlong, out = 0) {
  const g = wg(w), xdir = side === 1 ? g.u : { x: -g.u.x, y: -g.u.y };
  const P = wallPt(w, g, side, leftAlong, w.thick / 2 + out);
  const grp = new THREE.Group();
  grp.position.set(P.x, 0, P.y);
  grp.rotation.y = Math.atan2(-xdir.y, xdir.x);
  return grp;
}
function cabinetMeshes(c, opts = {}) {
  const grp = new THREE.Group();
  const p = effParams(c), mt = cabMatT(cabSet(c, 'cabMatT'));
  const cm = mat(mt.carcass) || S.materials[0], bm = mat(mt.back) || cm, t = cm.thick, bt = bm.thick;
  const M = m => mat3(m, opts);
  const W = c.w, H = c.h, D = c.d, tk = hasToe(c) ? p.toeKickHeight : 0, sb = tk ? p.toeKickSetback : 0;
  const cmM = M(cm);
  const feet = onFeet(c, p);
  if (hasCabShape(c)) cabShape3d(c, p, t, bt, tk, feet ? tk : 0, cmM, M(bm), o => grp.add(o));
  if (((c.shape || {}).top || {}).edges && typeof edgeParts3d === 'function') { const dp = buildParts(c).parts.find(q => q.cabId === c.id && / door$/.test(q.name)); edgeParts3d(c, o => grp.add(o), t, feet ? tk : 0, { box: cmM, back: M(bm), door: dp ? M(mat(dp.mat)) : cmM }); }
  else {
    [t / 2, W - t / 2].forEach(x => {
      if (tk && !feet) grp.add(box3(t, tk, D - sb, cmM, x, tk / 2, (D - sb) / 2));
      grp.add(box3(t, H - tk, D, cmM, x, tk + (H - tk) / 2, D / 2));
    });
    grp.add(box3(W - 2 * t, t, D, cmM, W / 2, tk + t / 2, D / 2));
    if ((c.construction || {}).top === 'stretchers') {
      grp.add(box3(W - 2 * t, t, p.stretcherWidth, cmM, W / 2, H - t / 2, D - p.stretcherWidth / 2));
      grp.add(box3(W - 2 * t, t, p.stretcherWidth, cmM, W / 2, H - t / 2, p.stretcherWidth / 2 + p.backInset + bt));
    } else grp.add(box3(W - 2 * t, t, D, cmM, W / 2, H - t / 2, D / 2));
    grp.add(box3(W - 2 * t, H - tk - 2 * t, bt, M(bm), W / 2, tk + H / 2 - tk / 2, p.backInset + bt / 2, false));
  }
  if (tk && p.toeSkin !== 'off') grp.add(box3(W, tk, t, M(mat(mt.toeKick) || cm), W / 2, tk / 2, D - sb - t / 2));
  if (feet) {
    const n = feetCount(c, p), per = Math.ceil(n / 2), leg = R3 ? metal3('#2b2f33') : flat3('#2b2f33');
    for (let i = 0; i < per; i++) { const x = per > 1 ? 3 + (W - 6) * i / (per - 1) : W / 2; [D - sb - t - 1.5, 3].forEach(z => grp.add(box3(1.6, tk, 1.6, leg, x, tk / 2, z, false))); }
  }
  if (c.addParts && c.addParts.length && typeof addedParts3d === 'function') addedParts3d(c, grp, M);
  const fronts = computeFronts(c, p), lay = interiorLayout(c, p, fronts);
  const inD = D - p.backInset - bt, sm = M(mat(mt.shelf) || cm);
  // shelves, split by a divider when there is one
  const spans = lay.divX !== null ? [[t, lay.divX - t / 2], [lay.divX + t / 2, W - t]] : [[t, W - t]];
  shelfHeights(lay, Math.max(0, p.shelfCount | 0)).forEach(z => spans.forEach(([a, b]) => grp.add(box3(b - a - 0.06, t, inD - p.shelfFrontSetback, sm, (a + b) / 2, z + t / 2, p.backInset + bt + (inD - p.shelfFrontSetback) / 2))));
  if (lay.divX !== null) grp.add(box3(t, lay.zIn1 - lay.zIn0, inD, cmM, lay.divX, (lay.zIn0 + lay.zIn1) / 2, p.backInset + bt + inD / 2));
  // inserts
  const dmt = drawerMatT(cabSet(c, 'drawerMatT')), dbx = M(mat(dmt.sides) || cm);
  const trayBox = (x0, x1, z, h, d, zBack, into) => {
    const w = x1 - x0, st = 0.5, g = into ? { add: o => { o.userData.layer = 'drawerBox'; into.add(o); } } : grp;
    g.add(box3(w, 0.25, d, dbx, (x0 + x1) / 2, z + 0.125, zBack + d / 2, false));
    [x0 + st / 2, x1 - st / 2].forEach(x => g.add(box3(st, h, d, dbx, x, z + h / 2, zBack + d / 2)));
    [zBack + st / 2, zBack + d - st / 2].forEach(zz => g.add(box3(w - 2 * st, h, st, dbx, (x0 + x1) / 2, z + h / 2, zz)));
  };
  const ix0 = t + lay.spacer, ix1 = W - t - lay.spacer, idx = (ix1 - ix0);
  if (lay.spacer && lay.rollouts.length) [t + lay.spacer / 2, W - t - lay.spacer / 2].forEach(x => grp.add(box3(lay.spacer, 2.5, inD, cmM, x, lay.rollouts[0].z + 1.25, p.backInset + bt + inD / 2)));
  lay.rollouts.forEach(ro => trayBox(ix0 + 0.5, ix1 - 0.5, ro.z, ro.h, inD - 1.5, p.backInset + bt + 0.5));
  lay.trays.forEach(tr => { for (let i = 1; i <= tr.n; i++) grp.add(box3(0.25, tr.z1 - tr.z0 - 1, inD - 1, M(bm), t + (W - 2 * t) * i / (tr.n + 1), (tr.z0 + tr.z1) / 2, p.backInset + bt + (inD - 1) / 2)); });
  lay.bins.forEach(bn => { const bh = Math.min(20, bn.z1 - bn.z0 - 2); [0.27, 0.73].forEach(k => grp.add(box3(idx * 0.42, bh, inD * 0.7, flat3('#8d949a'), ix0 + idx * k, bn.z0 + bh / 2 + 0.5, p.backInset + bt + inD * 0.45))); });
  lay.lazy.forEach(lz => { const r = Math.min(W - 2 * t, inD) / 2 - 0.75; [0.3, 0.72].forEach(k => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 40), flat3('#d9cfbf')); m.position.set(W / 2, lz.z0 + (lz.z1 - lz.z0) * k, p.backInset + bt + inD / 2); grp.add(m); }); });
  fronts.forEach(f => {
    if (f.type === 'open') return;
    const { ds, framed } = frontStyle(c, f), fm = mat(ds.mat) || cm, ft = fm.thick, fmM = M(fm);
    const fw = f.x1 - f.x0, fh = f.z1 - f.z0, cx = f.x0 + fw / 2, cy = f.z0 + fh / 2;
    // Each front lives in its own group so it can swing on its hinge or slide out.
    const fg = new THREE.Group(), add = (o, ly = 'fronts') => { o.userData.layer = ly; fg.add(o); };
    doorMeshes(ds, framed, f, ft, fmM, M(mat(ds.panelMat) || fm), D, add);
    const pp = pullPlacement(c, f);
    if (pp) {
      const L = Math.max(pp.hw.lengthMM * MM, 1), pm = (R3 ? metal3 : flat3)(pp.hw.finish || '#333333');
      const px = f.x0 + pp.x, py = f.z0 + pp.z, pz = D + ft + 0.55;
      if (!pp.hw.ccMM) add(box3(L, L, 0.9, pm, px, py, pz - 0.1, false), 'pulls');
      else add(box3(pp.vertical ? 0.45 : L, pp.vertical ? L : 0.45, 0.45, pm, px, py, pz, false), 'pulls');
    }
    if (f.type === 'drawer') {
      const ox0 = f.n > 1 ? f.x0 + 0.5 : t + 0.5, ox1 = f.n > 1 ? f.x1 - 0.5 : W - t - 0.5, bd = Math.min(inD - 1, 21);
      trayBox(ox0 + 0.2, ox1 - 0.2, Math.max(f.z0, tk + t) + 0.5, Math.max(2.5, fh - 2.5), bd, D - bd, fg);
      fg.userData.open = { kind: 'drawer', travel: drawerTravel(c) };
      grp.add(fg);
    } else if (f.type === 'door') {
      const hx = f.hinge === 'R' ? f.x1 : f.x0, pivot = new THREE.Group();
      pivot.position.set(hx, 0, D); fg.position.set(-hx, 0, -D); pivot.add(fg);
      pivot.userData.open = { kind: 'door', sign: f.hinge === 'R' ? 1 : -1, f };
      grp.add(pivot);
    } else grp.add(fg);
  });
  const ps = panelFor(c), pmM = M(mat(ps.mat) || cm), pt = panelThick(c);
  const ph = ps.toFloor || c.cat === 'Wall' ? H : H - tk, py0 = H - ph, pd = D + ps.frontOverhang;
  const pL = hasPanel(c, 'L'), pR = hasPanel(c, 'R');
  if (pL) grp.add(box3(pt, ph, pd, pmM, -pt / 2, py0 + ph / 2, pd / 2));
  if (pR) grp.add(box3(pt, ph, pd, pmM, W + pt / 2, py0 + ph / 2, pd / 2));
  // Fillers to the wall, flush with the fronts, with a short return behind them.
  const flm = mat(fillerMat(c)) || cm, flM = M(flm), fy0 = c.cat === 'Wall' ? 0 : tk;
  fillersOf(c).forEach(fl => {
    const x0 = fl.end === 'L' ? -fl.gap - (pL ? pt : 0) : W + (pR ? pt : 0), fh = H - fy0;
    grp.add(box3(fl.gap, fh, flm.thick, flM, x0 + fl.gap / 2, fy0 + fh / 2, D + flm.thick / 2));
    grp.add(box3(Math.min(fl.gap, flm.thick), fh, 3, flM, fl.end === 'L' ? x0 + Math.min(fl.gap, flm.thick) / 2 : x0 + fl.gap - Math.min(fl.gap, flm.thick) / 2, fy0 + fh / 2, D - 1.5));
  });
  grp.traverse(o => { o.userData.cabId = c.id; });
  // Layers: drop the meshes of any kind that is turned off (untagged meshes are the box).
  const lay3 = opts.layers;
  if (lay3 && lay3.fasteners && typeof vFasteners3d === 'function') vFasteners3d(c, grp);
  if (lay3) { const off = []; grp.traverse(o => { if (o.isMesh && lay3[o.userData.layer || 'box'] === false) off.push(o); }); off.forEach(o => o.parent.remove(o)); }
  applyOpen(grp, openT[c.id] || 0);
  return grp;
}

// Flat text label that always faces the camera; h is its height in inches.
const spriteCache = {};
function textSprite(text, h, o = {}) {
  const key = text + '|' + (o.color || '') + '|' + (o.bg || '');
  let tex = spriteCache[key];
  if (!tex) {
    const cv = document.createElement('canvas'), g = cv.getContext('2d'), fpx = 48;
    g.font = `600 ${fpx}px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif`;
    cv.width = Math.ceil(g.measureText(text).width + fpx * 0.6); cv.height = Math.ceil(fpx * 1.45);
    g.font = `600 ${fpx}px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif`;
    g.fillStyle = o.bg || 'rgba(255,255,255,0.88)';
    const r = cv.height / 2.6; g.beginPath(); g.moveTo(r, 0); g.arcTo(cv.width, 0, cv.width, cv.height, r); g.arcTo(cv.width, cv.height, 0, cv.height, r); g.arcTo(0, cv.height, 0, 0, r); g.arcTo(0, 0, cv.width, 0, r); g.fill();
    g.fillStyle = o.color || '#1c2326'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(text, cv.width / 2, cv.height / 2 + 2);
    tex = spriteCache[key] = new THREE.CanvasTexture(cv);
    if ('encoding' in tex && THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.userData = { aspect: cv.width / cv.height };
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: !o.onTop, transparent: true }));
  sp.scale.set(h * tex.userData.aspect, h, 1); sp.renderOrder = o.onTop ? 20 : 5; sp.userData.noBounds = true;
  return sp;
}
/* ---------- Door faces ---------- */
// Frame, panels and design grooves of one front, from the door designer's layout. z = D is the cabinet front.
function doorMeshes(ds, framed, f, ft, fmM, panelM, D, add) {
  const fw = f.x1 - f.x0, fh = f.z1 - f.z0, lay = doorLayout(ds, fw, fh, framed), X = x => f.x0 + x, Z = z => f.z0 + z;
  const box = (x0, z0, x1, z1, d, zc, m, edges) => add(box3(x1 - x0, z1 - z0, d, m, X((x0 + x1) / 2), Z((z0 + z1) / 2), zc, edges));
  if (!framed) {
    add(box3(fw, fh, ft, fmM, f.x0 + fw / 2, f.z0 + fh / 2, D + ft / 2));
  } else {
    const routed = cncFramed(ds), pd = routed ? Math.min(ds.pocketDepth, ft * 0.6) : ft * 0.5;
    if (routed && !R3) {
      // One piece: outline of the whole door, frame at full thickness, fields recessed.
      const ol = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(fw, fh, ft)), edgeMat3()); ol.position.set(f.x0 + fw / 2, f.z0 + fh / 2, D + ft / 2); add(ol);
    }
    lay.frame.forEach(m => box(m.x0, m.z0, m.x1, m.z1, ft, D + ft / 2, fmM, !routed));
    lay.fields.forEach(fl => {
      const w = fl.x1 - fl.x0, h = fl.z1 - fl.z0, r = Math.min(ds.raiseW, w / 2 - 0.5, h / 2 - 0.5);
      if (fl.pt === 'glass') { const g = box3(w, h, 0.15, glass3(), X((fl.x0 + fl.x1) / 2), Z((fl.z0 + fl.z1) / 2), D + ft * 0.4, false); add(g); g.userData.layer = 'glass'; return; }
      if (fl.pt === 'open') return;
      if (routed && fl.pt === 'insert') { const pt = ds.type === 'twopiece' ? Math.min(ft - 0.1, (mat(ds.panelMat) || {}).thick || 0.375) : 0.25; return box(fl.x0, fl.z0, fl.x1, fl.z1, pt, D + pt / 2 + (ds.type === 'twopiece' ? 0 : 0.125), panelM, true); }
      const back = routed ? ft - pd : 0.25, zc = routed ? D + back / 2 : D + ft * 0.35;
      box(fl.x0, fl.z0, fl.x1, fl.z1, back, zc, routed ? fmM : panelM, !routed);
      if (fl.pt === 'raised' && r > 0.2) box(fl.x0 + r, fl.z0 + r, fl.x1 - r, fl.z1 - r, routed ? ft - 0.05 : ft * 0.75, routed ? D + (ft - 0.05) / 2 : D + ft * 0.4, routed ? fmM : panelM, true);
    });
  }
  // Design grooves as thin dark strips on the field surface.
  if (ds.design !== 'none') {
    const surf = !framed ? D + ft : cncFramed(ds) ? D + (ds.panelType === 'raised' ? ft - 0.05 : ft - Math.min(ds.pocketDepth, ft * 0.6)) : D + ft * 0.35 + (ds.panelType === 'raised' ? ft * 0.375 : 0.125);
    const gm = flat3('#1c1c1c', 0.45);
    lay.fields.filter(fl => !framed || (fl.pt !== 'glass' && fl.pt !== 'open')).forEach(fl => designLines(ds, fl).forEach(l => {
      const len = Math.hypot(l.x2 - l.x1, l.z2 - l.z1), g = box3(ds.design === 'xbrace' ? ds.grooveW : Math.max(0.08, ds.grooveW * 0.45), len, ds.design === 'xbrace' ? 0.4 : 0.02, ds.design === 'xbrace' ? fmM : gm, X((l.x1 + l.x2) / 2), Z((l.z1 + l.z2) / 2), surf + (ds.design === 'xbrace' ? 0.2 : 0.012), ds.design === 'xbrace');
      g.rotation.z = Math.atan2(l.z2 - l.z1, l.x2 - l.x1) - Math.PI / 2; add(g);
    }));
  }
}
const glass3 = () => glass3.m || (glass3.m = new THREE.MeshStandardMaterial({ color: 0xbcd9e8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false }));

/* ---------- Opening doors and drawers ---------- */
const openT = {};     // cabinet id -> 0 (closed) .. 1 (open), animated
function applyOpen(root, t) {
  root.traverse(o => {
    const op = o.userData.open; if (!op) return;
    if (op.kind === 'door') o.rotation.y = op.sign * ease(t) * doorSwing(o);
    else o.position.z = ease(t) * op.travel;
  });
}
// A door opens as far as it can before it hits something (see doorLimit).
function doorSwing(o) { const c = cab(o.userData.cabId), f = o.userData.open.f; return c && f ? doorLimit(c, f) : 1.75; }
let openAnim = 0;
function animateOpen() {
  if (openAnim) return;
  let last = performance.now();
  const step = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; let moving = false;
    const ids = new Set([...Object.keys(openT), ...Object.keys(ui.open)]);
    ids.forEach(id => {
      const goal = ui.open[id] ? 1 : 0, cur = openT[id] || 0;
      if (Math.abs(goal - cur) < 1e-3) { openT[id] = goal; return; }
      openT[id] = cur + Math.sign(goal - cur) * Math.min(Math.abs(goal - cur), dt / 0.45); moving = true;
    });
    viewers.forEach(v => { if (!v.ok) return; v.root.traverse(o => { if (o.userData.open && o.userData.cabId) { const t = openT[o.userData.cabId] || 0; if (o.userData.open.kind === 'door') o.rotation.y = o.userData.open.sign * ease(t) * doorSwing(o); else o.position.z = ease(t) * o.userData.open.travel; } }); v.requestRender(); });
    openAnim = moving ? requestAnimationFrame(step) : 0;
  };
  openAnim = requestAnimationFrame(step);
}
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
class Viewer3D {
  constructor(host, onPick) {
    this.host = host; this.onPick = onPick; this.ok = false;
    if (!has3D()) { host.innerHTML = '<div class="v3msg">The 3D engine did not load.</div>'; return; }
    try { this.renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch (e) { host.innerHTML = '<div class="v3msg">This browser could not start 3D (WebGL is off or unavailable).</div>'; return; }
    this.ok = true;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    if ('outputEncoding' in this.renderer && THREE.sRGBEncoding) this.renderer.outputEncoding = THREE.sRGBEncoding;
    host.appendChild(this.renderer.domElement);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a8577, 0.85); this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 0.55); sun.position.set(-120, 260, 180); this.scene.add(sun); this.scene.add(sun.target);
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.3;
    const fill = this.fill = new THREE.DirectionalLight(0xffffff, 0.25); fill.position.set(200, 120, -150); this.scene.add(fill);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.persp = new THREE.PerspectiveCamera(40, 1, 1, 20000);
    this.ortho = new THREE.OrthographicCamera(-100, 100, 100, -100, -20000, 20000);
    this.cam = this.persp;
    this.controls = new THREE.OrbitControls(this.cam, this.renderer.domElement);
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => this.requestRender());
    // Phones: when every finger is off the screen, the controls forget any finger whose lift was lost.
    if (typeof onAllFingersUp === 'function') onAllFingersUp(() => { if (this.controls.resetPointers) this.controls.resetPointers(); });
    this.persp.position.set(-150, 160, 250); this.controls.target.set(70, 30, 40); this.controls.update();
    new ResizeObserver(() => this.resize()).observe(host);
    const el = this.renderer.domElement; let down = null;
    el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || e.button !== 0) return;
      const id = this.pick(e.clientX, e.clientY); if (this.onPick) this.onPick(id);
    });
    host.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target !== el) return;
      if (typeof partDrag3d === 'function') partDrag3d(this, e);
    }, true);
    el.addEventListener('dblclick', e => { const id = this.pick(e.clientX, e.clientY); if (id && this.onDouble) this.onDouble(id); else if (id && this.onPick) { this.onPick(id); view3dPreset(this, 'sel'); } });
    this.resize();
  }
  setBackground(css) { if (this.ok) { this.scene.background = new THREE.Color(css); this.requestRender(); } }
  resize() {
    if (!this.ok) return;
    const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.persp.aspect = w / h; this.persp.updateProjectionMatrix();
    const fh = this.orthoH || 200; this.ortho.left = -fh * w / h / 2; this.ortho.right = fh * w / h / 2; this.ortho.top = fh / 2; this.ortho.bottom = -fh / 2; this.ortho.updateProjectionMatrix();
    this.requestRender();
  }
  requestRender() { if (!this.ok || this.raf) return; this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); }); }
  draw() { if (this.beforeDraw) this.beforeDraw(); this.renderer.render(this.scene, this.cam); }
  // Realistic look: tone mapping, soft shadows from one sun and reflections from a soft studio around the room.
  setReal(on) {
    if (!this.ok || this.real === on) return;
    this.real = on; const r = this.renderer;
    r.shadowMap.enabled = on; r.toneMapping = on ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping; r.toneMappingExposure = on ? 0.85 : 1;
    this.scene.environment = on ? this.studio() : null;
    this.hemi.intensity = on ? 0.35 : 0.85; this.sun.intensity = on ? 2.2 : 0.55; this.sun.castShadow = on; this.fill.intensity = on ? 0.2 : 0.25;
    // Materials shared with the plain look have to recompile for the shadow and tone settings.
    [plain3, metal3, matCache3].forEach(c => Object.values(c).forEach(m => { if (m && m.isMaterial) m.needsUpdate = true; }));
  }
  studio() {
    if (this.env) return this.env;
    const pm = new THREE.PMREMGenerator(this.renderer), sc = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(100, 60, 100), new THREE.MeshBasicMaterial({ color: 0x4a4844, side: THREE.BackSide })); room.position.y = 20; sc.add(room);
    // Soft boxes: a big one overhead and two dimmer ones at the sides.
    const lamp = (w, h, x, y, z, rx, ry, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); sc.add(m); };
    lamp(40, 30, 0, 48, 0, Math.PI / 2, 0, 1.6); lamp(20, 50, -45, 25, 10, 0, Math.PI / 2, 0.9); lamp(20, 50, 45, 25, -10, 0, Math.PI / 2, 0.5);
    this.env = pm.fromScene(sc, 0.04).texture; pm.dispose();
    return this.env;
  }
  // Point the sun's shadow at the whole room.
  fitShadow() {
    const b = this.bounds(), c = b.getCenter(new THREE.Vector3()), R = Math.max(60, b.getSize(new THREE.Vector3()).length() / 2), s = this.sun.shadow.camera;
    this.sun.target.position.copy(c); this.sun.position.copy(c).add(new THREE.Vector3(-0.45, 1.4, 0.7).normalize().multiplyScalar(R * 2));
    s.left = -R; s.right = R; s.top = R; s.bottom = -R; s.near = 1; s.far = R * 4; s.updateProjectionMatrix();
  }
  clear() {
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    while (this.root.children.length) this.root.remove(this.root.children[0]);
  }
  setMode(mode) {
    if (!this.ok) return;
    const next = mode === 'ortho' ? this.ortho : this.persp; if (next === this.cam) return;
    next.position.copy(this.cam.position); next.quaternion.copy(this.cam.quaternion);
    this.cam = next; this.controls.object = next; this.controls.update(); this.fit();
  }
  bounds() {
    const b = new THREE.Box3();
    this.root.children.forEach(o => { if (!o.userData.noBounds && !o.isSprite) b.expandByObject(o); }); return b.isEmpty() ? new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 90, 100)) : b; }
  look(dir, keepDistance) {
    if (!this.ok) return;
    const b = this.bounds(), c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2;
    const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    const dist = keepDistance ? this.cam.position.distanceTo(this.controls.target) : r / Math.sin((this.persp.fov * Math.PI / 180) / 2) * 1.1;
    this.controls.target.copy(c);
    this.cam.position.copy(c).add(d.multiplyScalar(dist));
    this.orthoH = r * 1.6; this.ortho.zoom = 1; this.resize();
    this.cam.lookAt(c); this.controls.update(); this.requestRender();
  }
  // Frame one box from direction dir.
  lookBox(box, dir) {
    const c = box.getCenter(new THREE.Vector3()), r = Math.max(12, box.getSize(new THREE.Vector3()).length() / 2);
    const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    this.controls.target.copy(c);
    this.cam.position.copy(c).add(d.multiplyScalar(r / Math.sin((this.persp.fov * Math.PI / 180) / 2) * 1.7));
    this.orthoH = r * 2.4; this.ortho.zoom = 1; this.resize();
    this.cam.lookAt(c); this.controls.update(); this.requestRender();
  }
  // The camera as plain numbers, for saved views.
  getView() {
    const P = v => [v.x, v.y, v.z].map(n => Math.round(n * 100) / 100);
    return { mode: this.cam === this.ortho ? 'ortho' : 'persp', pos: P(this.cam.position), target: P(this.controls.target), zoom: this.ortho.zoom, orthoH: this.orthoH || 200 };
  }
  setView(v) {
    if (!this.ok || !v) return;
    const next = v.mode === 'ortho' ? this.ortho : this.persp;
    this.cam = next; this.controls.object = next;
    this.orthoH = v.orthoH || 200; this.ortho.zoom = v.zoom || 1; this.resize();
    this.controls.target.set(...v.target); next.position.set(...v.pos);
    next.lookAt(this.controls.target); next.updateProjectionMatrix(); this.controls.update(); this.requestRender();
  }
  fit() { const d = this.cam.position.clone().sub(this.controls.target); this.look(d.lengthSq() ? d : { x: 1, y: 1, z: 1 }); }
  pick(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(v, this.cam);
    const hit = rc.intersectObjects(this.root.children, true).find(h => h.object.isMesh && (h.object.userData.cabId || h.object.userData.shapeId || h.object.userData.fixtId));
    return hit ? hit.object.userData.cabId || hit.object.userData.shapeId || hit.object.userData.fixtId : null;
  }
  // Floor point under the cursor, as a plan point.
  floorPoint(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(v, this.cam);
    const pt = new THREE.Vector3();
    return rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt) ? { x: pt.x, y: pt.z } : null;
  }
}
const viewers = [];

/* ---------- Room scene ---------- */
let roomViewer = null;
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#eeeeee'; }
function buildRoom3D() {
  const v = roomViewer; if (!v || !v.ok) return;
  R3 = !!ui.render3d;
  try { buildRoomScene(v); } finally { R3 = false; }
}
function realWall3(op = 1) {
  const k = op >= 0.98 ? 1 : Math.round(op * 50) / 50, c = realWall3.c || (realWall3.c = {});
  return c[k] || (c[k] = new THREE.MeshStandardMaterial({ color: 0xeceae5, roughness: 0.95, envMapIntensity: 0.3, transparent: k < 1, opacity: k, depthWrite: k >= 1 }));
}
// What the 3D room shows. Each is on unless turned off in the Layers menu (the ceiling only shows from below).
const LAYERS3D = [['walls', 'Walls'], ['ceiling', 'Ceiling'], ['floor', 'Floor'], ['box', 'Cabinet boxes'], ['fronts', 'Doors and drawer fronts'], ['drawerBox', 'Drawer boxes'], ['pulls', 'Pulls'], ['tops', 'Countertops'], ['molding', 'Molding'], ['shapes', 'Shapes, appliances and fixtures'], ['lights', 'Lights'], ['labels', 'Labels and sizes'], ['glass', 'Glass (3D and elevation)'], ['fasteners', 'Joint fasteners']];
// Fasteners start hidden; everything else starts shown.
const layers3d = () => ({ ...Object.fromEntries(LAYERS3D.map(([k]) => [k, k !== 'fasteners'])), ...(ui.layers || {}) });
function realFloor3() {
  if (realFloor3.m) return realFloor3.m;
  const t = new THREE.CanvasTexture(floorCanvas()); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if ('encoding' in t && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
  return (realFloor3.m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, envMapIntensity: 0.4 }));
}
function buildRoomScene(v) {
  v.setReal(R3);
  v.setBackground(R3 ? '#e4e1db' : cssVar('--paper'));
  v.clear();
  // Layers turn whole kinds of things off; walls also have an opacity from the Layers menu.
  const L = layers3d(), op = Math.max(0, Math.min(1, ui.wallOp ?? 1)), wallMode = !L.walls || op <= 0.02 ? 'hidden' : op < 0.98 ? 'faded' : 'solid';
  const pts = []; S.walls.forEach(w => pts.push([w.x1, w.y1], [w.x2, w.y2]));
  const mid = pts.length ? { x: pts.reduce((a, p) => a + p[0], 0) / pts.length, y: pts.reduce((a, p) => a + p[1], 0) / pts.length } : { x: 0, y: 0 };
  // Cutaway (a Layers option): walls between the camera and the room hide, so you see in without lowering the opacity.
  const cutaway = !!ui.cutaway && wallMode !== 'hidden';
  S.walls.forEach(w => {
    if (wallMode === 'hidden') return;
    const g = wg(w), grp = new THREE.Group(), mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
    grp.position.set(mx, 0, my);
    grp.rotation.y = Math.atan2(-g.u.y, g.u.x);
    const wm = R3 ? realWall3(op) : flat3(cssVar('--wall3d'), op);
    fixtWall3(w, g, wm, wallMode !== 'faded').forEach(m => grp.add(m));
    const inward = (mid.x - mx) * g.n.x + (mid.y - my) * g.n.y >= 0 ? 1 : -1, cut = { x: mx, z: my, nx: g.n.x * inward, nz: g.n.y * inward };
    grp.userData.wall = true; if (cutaway) grp.userData.cut = cut;
    v.root.add(grp);
    capsOf(w).forEach(cp => {
      const cg = wallGroup(w, cp.side, cp.side === 1 ? cp.a0 : cp.a1);
      cg.add(box3(cp.t, cp.height, cp.len, wm, cp.t / 2, cp.height / 2, cp.len / 2, wallMode !== 'faded'));
      cg.userData.wall = true; if (cutaway) cg.userData.cut = cut;
      v.root.add(cg);
    });
  });
  v.beforeDraw = cutaway ? () => {
    const p = v.cam.position;
    v.root.children.forEach(o => { const c = o.userData.cut; if (c) o.visible = (p.x - c.x) * c.nx + (p.z - c.z) * c.nz > -2; });
  } : null;
  // floor and a ceiling at the tallest wall. The ceiling faces down, so it shows from inside the room and never blocks a view from above.
  if (pts.length && L.ceiling && S.walls.length) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), hgt = Math.max(...S.walls.map(w => w.height || 96));
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const vc = typeof vCeiling3d === 'function' ? vCeiling3d(v, R3 ? realWall3() : flat3(cssVar('--wall3d'))) : null;
    if (vc) v.root.add(vc);
    else { const cl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), R3 ? realWall3() : flat3(cssVar('--wall3d')));
      cl.rotation.x = Math.PI / 2; cl.position.set((x0 + x1) / 2, hgt, (y0 + y1) / 2); cl.userData.noBounds = true; cl.userData.wall = true; v.root.add(cl); }
  }
  if (pts.length && L.floor) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    // Well past the walls, so open sides and wide views never run off the edge of the floor.
    const pad = Math.max(120, 0.6 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
    const fg = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
    if (R3) { const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / 48, uv.getY(i) * (y1 - y0) / 48); }
    const fl = new THREE.Mesh(fg, R3 ? realFloor3() : flat3(cssVar('--floor3d')));
    fl.rotation.x = -Math.PI / 2; fl.position.set((x0 + x1) / 2, -0.02, (y0 + y1) / 2); fl.userData.noBounds = true; fl.receiveShadow = true; v.root.add(fl);
  }
  const selId = ui.sel && ui.sel.type === 'cab' ? ui.sel.id : null, selCol = cssVar('--sel'), dropCol = cssVar('--drop');
  // Labels grow with the room so they stay readable when the whole room is in view.
  const ext = pts.length ? Math.hypot(Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]))) : 120;
  const k = Math.max(1, Math.min(2.4, ext / 70));
  S.cabinets.forEach(c => {
    const w = wall(c.wall); if (!w) return;
    const grp = wallGroup(w, c.side, c.side === 1 ? c.off : c.off + c.w, c.outset || 0);
    const hot = ui.dropCab === c.id ? dropCol : selId === c.id ? selCol : null;
    const m = cabinetMeshes(c, hot ? { sel: hot, layers: L } : { layers: L }); m.position.y = c.elev; grp.add(m);
    const p = effParams(c), D = c.d;
    if (ui.dims.fronts && !R3 && L.labels && L.fronts) computeFronts(c, p).filter(f => f.type !== 'open').forEach(f => {
      const fw = f.x1 - f.x0, fh = f.z1 - f.z0, ft = (mat(frontStyle(c, f).ds.mat) || { thick: 0.75 }).thick;
      const sp = textSprite(`${fmtLen(fw)} × ${fmtLen(fh)}`, Math.min(2.1 * k, fh * 0.3, fw / 6), { onTop: true });
      sp.position.set(f.x0 + fw / 2, f.type === 'drawer' && fh < 12 ? f.z0 + fh * 0.72 : f.z0 + fh / 2, D + ft + 1); m.add(sp);
    });
    if ((ui.dims.cab && !R3 && L.labels) || hot) {
      const sp = textSprite(`${LBL[c.id] || ''}  ${fmtLen(c.w)} × ${fmtLen(c.h)}`, 2.6 * k, hot ? { onTop: true, bg: hot, color: '#ffffff' } : { onTop: true });
      sp.position.set(c.w / 2, c.h + 2.2 * k, D * 0.6); m.add(sp);
    }
    v.root.add(grp);
    if (hot) {
      // Outline drawn on top of everything so the selection shows through walls and other cabinets.
      grp.updateMatrixWorld(true);
      const bh = new THREE.BoxHelper(m, new THREE.Color(hot)); bh.material.depthTest = false; bh.material.transparent = true; bh.renderOrder = 15; bh.update();
      bh.userData.noBounds = true; v.root.add(bh);
    }
  });
  if (L.shapes) S.shapes.forEach(s => {
    const sel = ui.sel && ui.sel.type === 'shape' && ui.sel.id === s.id, g = shapeMesh3(s, sel ? { sel: selCol } : {});
    if (g) v.root.add(g);
  });
  if (L.shapes) fixt3d(v, selCol);
  if (L.tops) countertopRuns().filter(r => r.on).forEach(r => {
    const w = wall(r.wall), a = r.start - r.ovS, b = r.end + r.ovE;
    const grp = wallGroup(w, r.side, r.side === 1 ? a : b), tm = mat3(mat(r.tpl.mat));
    grp.add(box3(r.len, r.thick, r.depth, tm, r.len / 2, r.top + r.thick / 2, r.depth / 2));
    if (r.tpl.backsplash > 0) { const off = r.side === 1 ? r.ovS : r.ovE; grp.add(box3(r.end - r.start, r.tpl.backsplash, 0.75, tm, off + (r.end - r.start) / 2, r.top + r.thick + r.tpl.backsplash / 2, 0.375)); }
    v.root.add(grp);
  });
  if (L.molding) moldingRuns().forEach(r => {
    const w = wall(r.wall), m = r.m, mm = mat3(mat(m.mat));
    const leftRet = r.side === 1 ? r.retS : r.retE, rightRet = r.side === 1 ? r.retE : r.retS;
    const a = (r.side === 1 ? r.start : r.end);
    const grp = wallGroup(w, r.side, a);
    const fz = r.d + 0.75, run = r.end - r.start;
    const outl = moldProfile({ ...m, h: r.h });
    if (outl) {
      const shp = new THREE.Shape(outl.map(p => new THREE.Vector2(p.x, p.y)));
      const piece = (len, ry, x, z) => {
        const geo = new THREE.ExtrudeGeometry(shp, { depth: len, bevelEnabled: false, curveSegments: 4 }), me = new THREE.Mesh(geo, mm);
        me.rotation.y = ry; me.position.set(x, r.z, z); grp.add(me);
        if (!R3) { const ol = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat3()); ol.rotation.y = ry; ol.position.copy(me.position); grp.add(ol); }
      };
      const x0 = leftRet ? -m.d : 0, x1 = run + (rightRet ? m.d : 0);
      piece(x1 - x0, -Math.PI / 2, x1, fz);
      if (leftRet) piece(fz, Math.PI, 0, fz);
      if (rightRet) piece(fz, 0, run, 0);
      v.root.add(grp); return;
    }
    const steps = m.profile === 'flat' ? [[1, 1]] : m.profile === 'crown' ? [[0.45, 0.4], [0.55, 1]] : [[0.5, 0.55], [0.5, 1]];
    let y = r.z;
    steps.forEach(([hf, df]) => {
      const h = r.h * hf, d = m.d * df;
      const x0 = leftRet ? -d : 0, x1 = run + (rightRet ? d : 0);
      grp.add(box3(x1 - x0, h, d, mm, (x0 + x1) / 2, y + h / 2, fz + d / 2));
      if (leftRet) grp.add(box3(d, h, fz, mm, -d / 2, y + h / 2, fz / 2));
      if (rightRet) grp.add(box3(d, h, fz, mm, run + d / 2, y + h / 2, fz / 2));
      y += h;
    });
    v.root.add(grp);
  });
  addLights3d(v, R3, L.lights);
  if (!v.fitted) { v.fitted = true; v.look({ x: -0.6, y: 0.75, z: 1 }); }
  if (R3) {
    v.root.traverse(o => { if (o.isMesh && !o.material.transparent && !o.receiveShadow && o.userData.layer !== 'lights') { o.castShadow = true; o.receiveShadow = true; } });
    v.root.children.forEach(o => { if (o.userData.wall) o.traverse(m => { m.castShadow = false; }); });
    v.fitShadow();
  }
  v.requestRender();
}
// Presentation picture of the 3D view at about 2400 pixels wide, without the selection highlight.
function roomImage() {
  const v = roomViewer; if (!v || !v.ok) return null;
  const keep = ui.sel; ui.sel = null; buildRoom3D();
  const r = v.renderer, pr = r.getPixelRatio(), w = v.host.clientWidth, h = v.host.clientHeight;
  let url = null;
  try { r.setPixelRatio(Math.min(4, Math.max(pr, 2400 / w))); r.setSize(w, h, false); v.draw(); url = r.domElement.toDataURL('image/png'); }
  finally { r.setPixelRatio(pr); r.setSize(w, h, false); ui.sel = keep; buildRoom3D(); }
  return url;
}
function view3dPreset(v, k) {
  if (!v || !v.ok) return;
  if (k === 'iso') { v.setMode('ortho'); v.look({ x: -1, y: 1.15, z: 1 }); }
  else if (k === 'persp') { v.setMode('persp'); v.look({ x: -0.6, y: 0.75, z: 1 }); }
  else if (k === 'top') v.look({ x: 0, y: 1, z: 0.001 });
  else if (k === 'fit') v.fit();
  else if (k === 'sel') {
    const id = ui.sel && ui.sel.type === 'cab' && ui.sel.id, c = id && cab(id), w = c && wall(c.wall); if (!w) return;
    const box = new THREE.Box3(); v.root.traverse(o => { if (o.isMesh && o.userData.cabId === id) box.expandByObject(o); });
    if (box.isEmpty()) return;
    const g = wg(w); v.lookBox(box, { x: g.n.x * c.side - g.u.x * c.side * 0.35, y: 0.45, z: g.n.y * c.side - g.u.y * c.side * 0.35 });
  }
  else if (k === 'front') {
    const w = wall(ui.elevWall); if (!w) return v.fit();
    const g = wg(w), s = elevSide(w); v.look({ x: g.n.x * s, y: 0.12, z: g.n.y * s });
  }
}
