/* ---------- Room doors: what goes in a doorway ---------- */
// 0.63.30 (Ayden 2026-11-24: "add doors to doorways, and give me a way to adjust what type of door goes in the opening,
// whether its open or arched or double door, sliding door stuff like that"). Doors and doorways (fixtures of kind
// 'door' and 'opening') take a Door type (f.dtype): an open or cased doorway, an arched opening, a single swing door,
// double or French doors, a pocket door, a barn door, bypass sliding doors or bifolds. f.swing ('L' / 'R', seen from
// the side it opens to, the side Swing flips) says which jamb it hinges on, slides to or folds to; 'both' on bifolds
// folds to both jambs. They draw in the plan, elevation, 3D and Realistic, and Walk opens and closes them (walk3d.js:
// doorLeafPose). Room doors are not cabinet parts: nothing goes on the cut list, CNC or price.
'use strict';

const ROOM_DOOR_TYPES = [
  { v: 'none', l: 'Open doorway (no casing)', n: 'Opening' },
  { v: 'cased', l: 'Cased opening', n: 'Cased Opening' },
  { v: 'arch', l: 'Arched opening', n: 'Arched Opening' },
  { v: 'single', l: 'Single door', n: 'Door' },
  { v: 'double', l: 'Double doors', n: 'Double Doors' },
  { v: 'french', l: 'French doors (glass)', n: 'French Doors' },
  { v: 'pocket', l: 'Pocket door', n: 'Pocket Door' },
  { v: 'barn', l: 'Barn door', n: 'Barn Door' },
  { v: 'bypass', l: 'Sliding doors (bypass)', n: 'Sliding Doors' },
  { v: 'bifold', l: 'Bifold doors', n: 'Bifold Doors' },
];
// The door type, also for jobs saved before there was one (a door's swing, an opening's casing). Kept free of other
// functions: the walk file carries it as text.
function doorType(f) {
  if (!f || (f.kind !== 'door' && f.kind !== 'opening')) return '';
  if (f.dtype) return f.dtype;
  if (f.kind === 'opening') return f.bare ? 'none' : 'cased';
  return f.swing === 'both' ? 'double' : f.swing === 'none' ? 'cased' : 'single';
}
// A doorway with a door in it, which Walk can open.
function doorHasLeaf(f) { const t = doorType(f); return !!t && t !== 'none' && t !== 'cased' && t !== 'arch'; }
const doorIsArch = f => doorType(f) === 'arch';
// The hinge / slide / fold jamb is the one at the wall's start (a0) — seen from the side it opens to, L is the left.
const doorAtStart = f => (f.swing !== 'R') === (f.side === 1);
// What the second pick means for each type, and its choices.
function doorSideOpts(f) {
  const t = doorType(f), lr = (a, b) => [{ v: 'L', l: a }, { v: 'R', l: b }];
  if (t === 'single') return { label: 'Hinge', options: lr('Left', 'Right') };
  if (t === 'pocket' || t === 'barn' || t === 'bypass') return { label: 'Slides to', options: lr('Left', 'Right') };
  if (t === 'bifold') return { label: 'Folds to', options: [...lr('Left', 'Right'), { v: 'both', l: 'Both (pair)' }] };
  return null;
}
const doorSideVal = f => doorType(f) === 'bifold' ? (f.swing === 'R' || f.swing === 'both' ? f.swing : 'L') : f.swing === 'R' ? 'R' : 'L';
// Picking a type: an open doorway has no casing, everything else does; the name follows unless it was typed.
function doorSetType(f, v) {
  if (!ROOM_DOOR_TYPES.some(x => x.v === v)) return;
  const was = doorType(f), autoName = !f.name || f.name === (fixtPreset(f.lib) || {}).name || ROOM_DOOR_TYPES.some(x => x.n === f.name);
  f.dtype = v;
  if (v === 'none') f.bare = true; else delete f.bare;
  if (v === 'double' || v === 'french') f.swing = 'both';
  else if (f.swing !== 'R' && !(v === 'bifold' && f.swing === 'both')) f.swing = 'L';
  if (v === 'arch' && was !== 'arch') delete f.rise;
  if (autoName) f.name = ROOM_DOOR_TYPES.find(x => x.v === v).n;
}
// An arched opening: how high the arch rises above where it springs from the jambs (default a quarter of the width,
// 4" to half the width, so 36" gets 9" and a 60" opening 15"), and the circle it is part of.
function archRise(f) {
  const [a0, a1, z0, z1] = fixtInner(f), iw = a1 - a0, ih = z1 - z0, def = Math.max(4, iw / 4);
  return Math.max(0.5, Math.min(+f.rise > 0 ? +f.rise : def, iw / 2, ih - 1));
}
function archOf(f) {
  const [a0, a1, , z1] = fixtInner(f), c = a1 - a0, r = archRise(f), R = (c * c / 4 + r * r) / (2 * r), zs = z1 - r;
  return { a0, a1, zs, z1, r, R, cx: (a0 + a1) / 2, cz: zs + r - R, at: a => zs + r - R + Math.sqrt(Math.max(0, R * R - Math.pow(a - (a0 + a1) / 2, 2))) };
}

/* ---------- Plan ---------- */
// P(a, b): a along the wall, b across it (+ toward the side it opens to); h is half the wall's thickness.
function doorPlanSVG(f, P, h, a0, a1, cls) {
  const t = doorType(f), iw = a1 - a0, st = doorAtStart(f), L = (u, v) => { const a = P(u[0], u[1]), b = P(v[0], v[1]); return `M${a.x} ${a.y}L${b.x} ${b.y}`; };
  const rect = (x0, x1, b0, b1, c) => `<polygon class="${c} nss" points="${polyPts([P(x0, b0), P(x1, b0), P(x1, b1), P(x0, b1)])}"/>`;
  let s = '';
  if (t === 'single' || t === 'double' || t === 'french') {
    // Seen from the side it swings into, LH means the hinge is on the left. A double door has a leaf on each jamb.
    const leaves = t !== 'single' ? [[a0, a0 + iw / 2], [a1, a1 - iw / 2]] : [st ? [a0, a1] : [a1, a0]];
    leaves.forEach(([ha, fa]) => {
      const r = Math.abs(fa - ha), hp = P(ha, h), leaf = P(ha, h + r), shut = P(fa, h);
      s += `<line class="${cls} fx-leafln nss" x1="${hp.x}" y1="${hp.y}" x2="${leaf.x}" y2="${leaf.y}"/>`;
      const ax = leaf.x - hp.x, ay = leaf.y - hp.y, bx = shut.x - hp.x, by = shut.y - hp.y, gs = ax * by - ay * bx > 0 ? 1 : 0;
      s += `<path class="fx-swing nss" d="M${leaf.x} ${leaf.y}A${r} ${r} 0 0 ${gs} ${shut.x} ${shut.y}"/>`;
    });
  } else if (t === 'pocket') {
    // The door in the middle of the wall, and the pocket it slides into (dashed) inside the wall beside the opening.
    s += rect(a0, a1, -0.69, 0.69, cls + ' fx-leafpl');
    s += st ? rect(a0 - iw + 3, a0, -0.9, 0.9, 'fx-swing') : rect(a1, a1 + iw - 3, -0.9, 0.9, 'fx-swing');
  } else if (t === 'barn') {
    // On the wall's face, a little wider than the opening; dashed where it slides to.
    const w2 = iw + 4, b0 = h + 0.9, b1 = b0 + 1.375;
    s += rect(a0 - 2, a1 + 2, b0, b1, cls + ' fx-leafpl');
    s += st ? rect(a0 - 2 - w2 + 2, a0 + 0, b0, b1, 'fx-swing') : rect(a1, a1 + w2, b0, b1, 'fx-swing');
    s += `<path class="fx-swing nss" d="${L([Math.min(a0 - 2, st ? a0 - w2 : a0), b1 + 0.6], [Math.max(a1 + 2, st ? a1 : a1 + w2), b1 + 0.6])}"/>`;
  } else if (t === 'bypass') {
    // Two panels on their own tracks, overlapping 2" in the middle.
    const lw = iw / 2 + 1;
    s += rect(a0, a0 + lw, -1.45, -0.2, cls + ' fx-leafpl') + rect(a1 - lw, a1, 0.2, 1.45, cls + ' fx-leafpl');
  } else if (t === 'bifold') {
    // Each pair of panels drawn part open (30°) toward the side they fold to.
    const stacks = f.swing === 'both' ? [[a0, 1, iw / 2], [a1, -1, iw / 2]] : [st ? [a0, 1, iw] : [a1, -1, iw]];
    const ca = Math.cos(Math.PI / 6), sa = Math.sin(Math.PI / 6);
    stacks.forEach(([ha, dir, sw]) => {
      const pw = sw / 2, p0 = P(ha, h), p1 = P(ha + dir * pw * ca, h + pw * sa), p2 = P(ha + dir * 2 * pw * ca, h);
      s += `<path class="${cls} fx-leafln nss" d="M${p0.x} ${p0.y}L${p1.x} ${p1.y}L${p2.x} ${p2.y}"/>`;
    });
  }
  return s;
}

/* ---------- Elevation ---------- */
// EX(a): elevation x of a point a along the wall; z0..z1 the opening inside the casing; fs the label size.
function doorElevSVG(f, EX, a0, a1, z0, z1, side) {
  const t = doorType(f), iw = a1 - a0, ih = z1 - z0, st = doorAtStart(f);
  const R = (u0, u1, v0, v1, c) => { const x = Math.min(EX(u0), EX(u1)); return `<rect class="${c} nss" x="${x}" y="${-v1}" width="${Math.abs(u1 - u0)}" height="${v1 - v0}"/>`; };
  const knob = (a, z = z0 + 36) => `<circle class="fx-knob nss" cx="${EX(a)}" cy="${-z}" r="1.1"/>`;
  const glassIn = (u0, u1) => t === 'french' ? R(u0 + 4, u1 - 4, z0 + 9, z1 - 4, 'fx-glass') : '';
  const leaf = (u0, u1, kA) => R(u0 + 0.25, u1 - 0.25, z0 + 0.25, z1, 'fx-leaf') + glassIn(u0, u1) + (kA === undefined ? '' : knob(kA));
  if (t === 'single') return leaf(a0, a1, st ? a1 - 2.5 : a0 + 2.5);
  if (t === 'double' || t === 'french') { const m = (a0 + a1) / 2; return leaf(a0, m, m - 2.5) + leaf(m, a1, m + 2.5); }
  if (t === 'pocket') {
    // The pocket inside the wall, dashed, and a finger pull at the door's leading edge.
    const pk = st ? R(a0 - iw + 3, a0, z0, z1, 'fx-swing') : R(a1, a1 + iw - 3, z0, z1, 'fx-swing'), pa = st ? a1 - 2 : a0 + 1;
    return pk + leaf(a0, a1) + R(pa, pa + 1, z0 + 33, z0 + 39, 'fx-knob');
  }
  if (t === 'barn') {
    // Over the opening on the wall, with the track above and a Z brace; a bar pull on the edge it slides away from.
    const w2 = iw + 4, b0 = a0 - 2, b1 = a1 + 2, tr0 = st ? b0 - w2 + 4 : b0, tr1 = st ? b1 : b1 + w2 - 4, x = Math.min(EX(b0), EX(b1)), y = -(z1 + 2);
    const ex = u => EX(u), pa = st ? b1 - 3 : b0 + 3;
    return R(b0, b1, Math.max(0, z0 + 0.5), z1 + 2, 'fx-leaf') + `<path class="fx-line nss" d="M${x} ${y + 6}H${x + w2}M${x} ${-(z0 + 6.5)}H${x + w2}M${ex(st ? b1 : b0)} ${-(z0 + 6.5)}L${ex(st ? b0 : b1)} ${y + 6}"/>` +
      R(tr0, tr1, z1 + 3, z1 + 4.5, 'fx-track') + R(pa - 0.5, pa + 0.5, z0 + 30, z0 + 48, 'fx-knob');
  }
  if (t === 'bypass') {
    // The back panel first, then the front one over it, each with a recessed pull.
    const lw = iw / 2 + 1;
    return leaf(a0, a0 + lw) + R(a0 + 2, a0 + 3, z0 + 33, z0 + 39, 'fx-knob') + leaf(a1 - lw, a1) + R(a1 - 3, a1 - 2, z0 + 33, z0 + 39, 'fx-knob');
  }
  if (t === 'bifold') {
    const both = f.swing === 'both', n = both ? 4 : 2, pw = iw / n;
    let s = '';
    for (let i = 0; i < n; i++) s += leaf(a0 + i * pw, a0 + (i + 1) * pw);
    // Knobs on the panels that lead (the ones away from the jamb they fold to).
    if (both) s += knob(a0 + 2 * pw - 2) + knob(a0 + 2 * pw + 2);
    else s += st ? knob(a1 - pw - 2) : knob(a0 + pw + 2);
    return s;
  }
  return '';
}
// The arch in the elevation: the opening's outline (for the hole) and the casing's outside.
function archElevD(f, EX) {
  const k = archOf(f), z0 = fixtInner(f)[2];
  const A = (u0, u1, r, bot) => { const c = Math.abs(u1 - u0), R2 = (c * c / 4 + r * r) / (2 * r), x0 = EX(u0), x1 = EX(u1), l = Math.min(x0, x1), rr = Math.max(x0, x1);
    return `M${l} ${-bot}V${-k.zs}A${R2} ${R2} 0 0 1 ${rr} ${-k.zs}V${-bot}Z`; };
  return { hole: A(k.a0, k.a1, k.r, z0), outer: A(f.off, f.off + f.w, k.r + (f.bare ? 0 : CASE), f.elev || 0) };
}

/* ---------- Door models ---------- */
// 0.63.40 (Ayden 2026-11-24: "I want actual doors for doorways"; he picked his own Mozaik door models): the leaves
// draw with the moving parts cut out of his Mozaik door graphics (tools/door-models.py packs them into models/), each
// stretched so its leaf fits the opening. Door style picks which one; Plain is the drawn slab from 0.63.33, which also
// shows while a model is still loading.
const ROOM_DOOR_STYLES = [
  { v: 'panel', l: 'Panel', m: 'Door Leaf Panel' },
  { v: 'slab', l: 'Slab', m: 'Door Leaf Slab' },
  { v: 'glass', l: 'Full glass', m: 'Door Leaf Glass' },
  { v: 'halfglass', l: 'Half glass', m: 'Door Leaf Half Glass' },
  { v: 'closet', l: 'Closet panel', m: 'Door Leaf Closet' },
  { v: 'patio', l: 'Sliding glass (patio)', m: 'Door Leaf Patio Slider' },
  { v: 'barn', l: 'Barn door', m: 'Barn Door Leaf' },
  { v: 'louvred', l: 'Louvred', m: 'Door Leaf Louvred' },
  { v: 'plain', l: 'Plain (drawn)' },
];
const DOOR_STYLE_OF = {
  single: ['panel', 'slab', 'glass', 'halfglass', 'closet', 'plain'], double: ['panel', 'slab', 'glass', 'halfglass', 'closet', 'plain'],
  french: ['glass', 'halfglass', 'plain'], pocket: ['panel', 'slab', 'glass', 'halfglass', 'closet', 'plain'], barn: ['barn', 'plain'],
  bypass: ['patio', 'panel', 'slab', 'closet', 'plain'], bifold: ['louvred', 'closet', 'panel', 'slab', 'plain'],
};
function roomDoorStyle(f) { const ok = DOOR_STYLE_OF[doorType(f)] || []; return ok.includes(f.dstyle) ? f.dstyle : ok[0] || ''; }
const roomDoorStyleOpts = f => (DOOR_STYLE_OF[doorType(f)] || []).map(v => ({ v, l: ROOM_DOOR_STYLES.find(x => x.v === v).l }));
// Where each piece's leaf body is, in the model's own inches [x0, y0, z0, x1, y1, z1] (the rest is handles, hangers).
// A piece not listed is all leaf.
const DM_BODY = (() => {
  const o = {}, lf = (n, x1) => { o[n] = o[n + ' Bare'] = [3.5, 8.375, 0, x1, 9.875, 80]; };
  lf('Door Leaf Panel', 32.5); lf('Door Leaf Slab', 32.5); lf('Door Leaf Glass', 39.5); lf('Door Leaf Half Glass', 39.5); lf('Door Leaf Closet', 19.5);
  o['Door Leaf Patio Slider'] = [3.5, 8.375, 0.5, 37.5, 9.875, 80]; o['Door Leaf Patio Fixed'] = [35.625, 9.875, 0.5, 69.625, 11.375, 80];
  o['Barn Door Leaf'] = [3, 2.5, 0, 35, 3.5, 84];
  return o;
})();
// The piece sized so its leaf body spans x 0..w and y z0..z0+h, its middle on z = 0 (+z is the side the model's
// handle or pull faces); depth keeps its own inches. Null until the model is in (it redraws the room then).
function doorModel3(name, w, h, z0, selCol) {
  if (typeof modelMesh !== 'function') return null;
  const key = 'std:' + name, mm = modelMesh(key, 1, 1, 1, selCol); if (!mm) return null;
  const b = modelGeo[key].box, B = DM_BODY[name] || b, sx = w / (B[3] - B[0]), sz = h / (B[5] - B[2]);
  mm.scale.set((b[3] - b[0]) * sx, (b[5] - b[2]) * sz, b[4] - b[1]);
  mm.position.set(-(B[0] - b[0]) * sx, z0 - (B[2] - b[2]) * sz, -(b[4] - (B[1] + B[4]) / 2));
  return mm;
}
// The piece a leaf of this door draws with; pocket, bypass and bifold leaves leave their lever handles off.
function doorLeafModel(f) {
  const t = doorType(f), s = ROOM_DOOR_STYLES.find(x => x.v === roomDoorStyle(f)), n = s && s.m; if (!n) return null;
  return (t === 'pocket' || t === 'bypass' || t === 'bifold') && DM_BODY[n + ' Bare'] ? n + ' Bare' : n;
}

/* ---------- 3D ---------- */
// The leaves inside the wall group grp (x along the wall from its start, y up, z through the wall: 0 on the side -1
// face, T on the side 1 face). Each moving piece carries userData.doorLeaf, which Walk turns, slides or folds.
function doorLeaves3(f, grp, T, a0, a1, z0, z1, m) {
  const t = doorType(f), iw = a1 - a0, ih = z1 - z0, st = doorAtStart(f), out = f.side === 1 ? 1 : -1, id = f.id;
  const ajar = typeof doorAjar === 'function' ? doorAjar(id) : 0;
  const pose = o => { if (typeof doorLeafPose === 'function') doorLeafPose(o, ajar); return o; };
  // A leaf spanning x 0 → dir*w from its group's origin, from z0 up; French doors get a glass field.
  const slab = (w, h, th, dir, mat = m.wood) => {
    const g = new THREE.Group(), cx = dir * w / 2;
    if (t !== 'french' || m.hot) { g.add(box3(w - 0.2, h, th, m.hot || mat, cx, z0 + h / 2, 0)); return g; }
    const sw = 4.5, rb = 9, rt = 4.5;
    [[dir * sw / 2, sw, h, z0 + h / 2], [dir * (w - sw / 2), sw, h, z0 + h / 2]].forEach(([x, bw, bh, y]) => g.add(box3(bw - 0.1, bh, th, mat, x, y, 0)));
    g.add(box3(w - 2 * sw, rb, th, mat, cx, z0 + rb / 2, 0)); g.add(box3(w - 2 * sw, rt, th, mat, cx, z0 + h - rt / 2, 0));
    g.add(box3(w - 2 * sw, h - rb - rt, 0.25, m.glass, cx, z0 + rb + (h - rb - rt) / 2, 0, false));
    return g;
  };
  // 0.63.40: a leaf drawn with its door model, the plain slab while that is loading or for Plain.
  const dm = doorLeafModel(f), plain = slab;
  const mleaf = (w, h, th, dir, name = dm) => {
    const mm = name && doorModel3(name, w, h, z0, m.selCol); if (!mm) return plain(w, h, th, dir);
    const g = new THREE.Group(); g.add(mm); if (dir < 0) g.scale.x = -1; return g;
  };
  const hang = (o, leafData) => { o.userData.doorLeaf = { id, ...leafData }; grp.add(pose(o)); return o; };
  const lh = ih - 0.15;
  if (t === 'single' || t === 'double' || t === 'french') {
    const zc = f.side === 1 ? T - 0.7 : 0.7, lv = t === 'single' ? [[st ? a0 : a1, st ? 1 : -1, iw]] : [[a0, 1, iw / 2], [a1, -1, iw / 2]];
    lv.forEach(([hx, dir, lw]) => {
      const piv = new THREE.Group(); piv.position.set(hx, 0, zc); piv.add(mleaf(lw, lh, 1.375, dir));
      // Swings toward the side the door opens to (side 1 is +z here).
      hang(piv, { k: -out * dir });
    });
  } else if (t === 'pocket') {
    // Rides in the middle of the wall and slides into it, leaving 3" out to pull it back by.
    const g = new THREE.Group(); g.position.set(0, 0, T / 2);
    const lf = mleaf(iw, lh, 1.375, 1); lf.position.x = a0; g.add(lf);
    // Its finger pull (from the Mozaik pocket door) near the edge that stays out.
    const pl = dm && doorModel3('Door Pocket Pull', 3.696, 3, z0 + 34.5, m.selCol); if (pl) { pl.position.x += st ? a1 - 4.7 : a0 + 1; g.add(pl); }
    hang(g, { kind: 'slide', x0: 0, dx: (st ? -1 : 1) * (iw - 3) });
  } else if (t === 'barn') {
    // Hung on the face of the wall, 2" past the opening each side and 2" above it, on a black track over where it goes.
    const w2 = iw + 4, zc = f.side === 1 ? T + 1.6 : -1.6, g = new THREE.Group(); g.position.set(0, 0, zc);
    const bh = z1 + 2 - Math.max(0, z0 + 0.5), y0 = Math.max(0, z0 + 0.5), x0 = a0 - 2;
    const t0 = st ? x0 - w2 + 4 : x0, t1 = st ? x0 + w2 : x0 + 2 * w2 - 4;
    // The Mozaik barn door (door, hangers and pull) and its rail, the pull on the edge away from where it slides.
    const bm = dm && doorModel3(dm, w2, bh, y0, m.selCol), rail = bm && doorModel3('Barn Door Rail', t1 - t0, 3, y0 + bh * 83.5 / 84, m.selCol);
    if (bm && rail) {
      const bw = new THREE.Group(); bw.add(bm); bw.scale.set(st ? 1 : -1, 1, out); bw.position.x = st ? x0 : x0 + w2; g.add(bw);
      hang(g, { kind: 'slide', x0: 0, dx: (st ? -1 : 1) * (w2 - 4) });
      rail.position.x += t0; rail.position.z += zc - out * 0.25; grp.add(rail);
      return;
    }
    g.add(box3(w2, bh, 1.375, m.hot || m.wood, x0 + w2 / 2, y0 + bh / 2, 0));
    // Rails and a Z brace on the room side (cosmetic, very thin).
    const fz = out * 0.75, br = m.hot || m.wood;
    [y0 + 6.5, y0 + bh - 6].forEach(y => g.add(box3(w2 - 1, 5, 0.25, br, x0 + w2 / 2, y, fz)));
    const dy = bh - 12.5 - 5, dx = w2 - 6, dl = Math.hypot(dx, dy), brace = box3(dl, 4.5, 0.25, br, x0 + w2 / 2, y0 + 6.5 + 2.5 + dy / 2, fz);
    brace.rotation.z = (st ? -1 : 1) * Math.atan2(dy, dx); g.add(brace);
    [[x0 + 5], [x0 + w2 - 5]].forEach(([x]) => g.add(box3(0.4, 5, 0.3, m.hot || m.dark, x, y0 + bh + 1, -out * 0.2)));
    const pa = st ? x0 + w2 - 3 : x0 + 3; g.add(box3(0.75, 16, 0.75, m.hot || m.dark, pa, z0 + 39, out * 1.3));
    hang(g, { kind: 'slide', x0: 0, dx: (st ? -1 : 1) * (w2 - 4) });
    grp.add(box3(t1 - t0, 1.5, 0.3, m.hot || m.dark, (t0 + t1) / 2, y0 + bh + 3, zc - out * 0.2));
  } else if (t === 'bypass') {
    // Back panel (side -1 track) on the start half, front panel on the end half; the one away from where they slide
    // to moves over the other.
    const lw = iw / 2 + 1, back = new THREE.Group(), front = new THREE.Group();
    back.position.set(0, 0, T / 2 - 0.8); front.position.set(0, 0, T / 2 + 0.8);
    // Patio: the fixed panel and the slider from the Mozaik patio door; the slider's handle on its outside edge.
    const pat = dm === 'Door Leaf Patio Slider', lb = mleaf(lw, lh, 1.25, 1, pat ? (st ? 'Door Leaf Patio Fixed' : dm) : dm), lf = mleaf(lw, lh, 1.25, 1, pat ? (st ? dm : 'Door Leaf Patio Fixed') : dm);
    if (pat && st) { lf.scale.x = -lf.scale.x; lf.position.x = a1; } else lf.position.x = a1 - lw;
    if (pat && !st) { lb.scale.x = -lb.scale.x; lb.position.x = a0 + lw; } else lb.position.x = a0;
    back.add(lb); front.add(lf);
    if (st) { grp.add(back); hang(front, { kind: 'slide', x0: 0, dx: -(iw - lw) }); }
    else { grp.add(front); hang(back, { kind: 'slide', x0: 0, dx: iw - lw }); }
  } else if (t === 'bifold') {
    // Two panels per jamb: the first turns on the jamb, the second on the first's edge, so its end runs along the track.
    const zc = f.side === 1 ? T - 0.7 : 0.7, stacks = f.swing === 'both' ? [[a0, 1, iw / 2], [a1, -1, iw / 2]] : [st ? [a0, 1, iw] : [a1, -1, iw]];
    stacks.forEach(([hx, dir, sw]) => {
      const pw = sw / 2, p1 = new THREE.Group(), p2 = new THREE.Group();
      p1.position.set(hx, 0, zc); p1.add(mleaf(pw, lh, 1.125, dir));
      p2.position.set(dir * pw, 0, 0); p2.add(mleaf(pw, lh, 1.125, dir));
      p2.userData.doorLeaf = { id, kind: 'fold2', k: -out * dir }; pose(p2); p1.add(p2);
      hang(p1, { kind: 'fold', k: -out * dir });
    });
  }
}
// An arched opening's casing on both faces: the legs up to where it springs, then the arch in short pieces.
function archCasing3(f, grp, T, trim) {
  const k = archOf(f), c = f.bare ? 0 : CASE; if (!c) return;
  const [, , z0] = fixtInner(f), n = Math.max(8, Math.round(k.r * 1.5));
  const th0 = Math.asin(Math.min(1, (k.a1 - k.a0) / 2 / k.R)), Rm = k.R + c / 2;
  [-0.25, T + 0.25].forEach(zc => {
    grp.add(box3(c, k.zs - z0, 0.5, trim, f.off + c / 2, z0 + (k.zs - z0) / 2, zc));
    grp.add(box3(c, k.zs - z0, 0.5, trim, f.off + f.w - c / 2, z0 + (k.zs - z0) / 2, zc));
    for (let i = 0; i < n; i++) {
      const u0 = -th0 + (2 * th0) * i / n, u1 = -th0 + (2 * th0) * (i + 1) / n, um = (u0 + u1) / 2;
      const len = 2 * (k.R + c) * Math.sin((u1 - u0) / 2) + 0.05;
      const b = box3(len, c, 0.5, trim, k.cx + Rm * Math.sin(um), k.cz + Rm * Math.cos(um), zc, false);
      b.rotation.z = -um; grp.add(b);
    }
  });
}
// The wall filled in above an arch, either side of its curve, in the wall's own centred frame (fixtWall3): x from
// -L/2, z through the wall from -t/2.
function archSpandrel3(f, L, t, wm) {
  const k = archOf(f), n = 24, pts = [new THREE.Vector2(k.a0 - L / 2, k.z1 + 0.01), new THREE.Vector2(k.a0 - L / 2, k.zs)];
  for (let i = 1; i < n; i++) { const a = k.a0 + (k.a1 - k.a0) * i / n; pts.push(new THREE.Vector2(a - L / 2, Math.min(k.z1, k.at(a)))); }
  pts.push(new THREE.Vector2(k.a1 - L / 2, k.zs), new THREE.Vector2(k.a1 - L / 2, k.z1 + 0.01));
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: t, bevelEnabled: false, curveSegments: 1 });
  const uv = geo.attributes.uv; if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 24, uv.getY(i) / 24);
  const me = new THREE.Mesh(geo, wm); me.position.z = -t / 2;
  return me;
}
