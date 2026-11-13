/* ---------- V-carve shape library ----------
   A shop-wide library of shapes for the Carve tab, kept between jobs like the CNC tools: borders and frames,
   plaques and badges, ornaments, icons, and your own saved logos and designs (traced pictures, SVG and DXF files).
   A built-in shape is drawn from a recipe (gen) at any size, so it stays crisp; a saved design keeps its outlines
   (loops, height 1) and any open lines (open, engraved on the line). Adding a shape to a sign copies it onto the sign,
   so a job keeps carving the same even if the library changes later.
   Entry: { id, name, group, gen + p (recipe and its settings) | loops + open + bw, h (default height), w (recipe width),
   frame (border width, recipes only), double, mode ('carve' | 'raise' | 'line') }. */
'use strict';

/* ----- Polygon sums (Clipper), in inches; integers at 1/100000" so results are exact and repeatable ----- */
const VC_K = 1e5;
const vcToC = loops => loops.map(l => l.map(p => ({ X: Math.round(p.x * VC_K), Y: Math.round(p.y * VC_K) })));
const vcFromC = paths => paths.filter(l => l.length >= 3).map(l => l.map(p => ({ x: p.X / VC_K, y: p.Y / VC_K })));
function vcClip(type, subj, clip, fill) {
  const C = ClipperLib, c = new C.Clipper(), out = new C.Paths(), ft = fill === 'nonzero' ? C.PolyFillType.pftNonZero : C.PolyFillType.pftEvenOdd;
  if (subj.length) c.AddPaths(vcToC(subj), C.PolyType.ptSubject, true);
  if (clip && clip.length) c.AddPaths(vcToC(clip), C.PolyType.ptClip, true);
  c.Execute(type === 'diff' ? C.ClipType.ctDifference : type === 'and' ? C.ClipType.ctIntersection : C.ClipType.ctUnion, out, ft, ft);
  return vcFromC(out);
}
// One design's outlines filled the even-odd way (letters with holes, frames), as a clean region.
const vcFill = loops => typeof ClipperLib === 'undefined' ? loops : vcClip('or', loops, null, 'evenodd');
// Every carved design merged, then the raised ones taken out: what the bits carve away.
function vcRegion(carve, raise) {
  if (typeof ClipperLib === 'undefined') return carve.flat();
  const C = carve.map(vcFill).flat(), R = raise.map(vcFill).flat();
  if (!C.length) return [];
  const u = vcClip('or', C, null, 'nonzero');
  return R.length ? vcClip('diff', u, vcClip('or', R, null, 'nonzero'), 'nonzero') : u;
}
// Outlines moved in (d < 0) or out by d inches. Sharp corners stay sharp unless round.
function vcOffset(loops, d, round) {
  const C = ClipperLib, co = new C.ClipperOffset(3, 0.0005 * VC_K), out = new C.Paths();
  co.AddPaths(vcToC(loops), round ? C.JoinType.jtRound : C.JoinType.jtMiter, C.EndType.etClosedPolygon);
  co.Execute(out, d * VC_K); return vcFromC(out);
}
// A border band of a solid shape: the outline and a line the band width inside it (twice for a double border).
function vcFrameLoops(loops, band, double) {
  if (!(band > 0) || typeof ClipperLib === 'undefined') return loops;
  const solid = vcFill(loops), out = [...solid];
  const steps = double ? [band, band * 2, band * 3] : [band];
  steps.forEach(d => out.push(...vcOffset(solid, -d)));
  return out;
}

/* ----- Shape recipes: each draws its outlines w wide and h tall, centered on 0,0 ----- */
const vcArc = (cx, cy, rx, ry, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }; });
const vcBez = (a, b, c, d, n = 24, from = 1) => { const o = []; for (let i = from; i <= n; i++) { const t = i / n, u = 1 - t; o.push({ x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x, y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y }); } return o; };
const vcPoly = (n, rot) => Array.from({ length: n }, (_, i) => { const a = (rot + i * 360 / n) * Math.PI / 180; return { x: Math.cos(a), y: Math.sin(a) }; });
const vcMirrorX = half => [...half, ...half.slice().reverse().map(p => ({ x: -p.x, y: p.y }))];
const vcDedupe = l => l.filter((p, i) => { const q = l[(i + 1) % l.length]; return Math.hypot(q.x - p.x, q.y - p.y) > 1e-7; });
const vcCornerR = (p, w, h, d) => Math.max(0, Math.min(p.r !== undefined && p.r !== '' ? +p.r : d, w / 2, h / 2));
const VC_OLD_SHAPES = ['rect', 'rrect', 'oval', 'border', 'star', 'heart', 'diamond', 'arrow'];
const VC_GEN = {
  rect: { name: 'Rectangle', fn: (w, h) => [vcRound(w, h, 0)] },
  rrect: { name: 'Rounded rectangle', r: 1, fn: (w, h, p) => [vcRound(w, h, vcCornerR(p, w, h, Math.min(w, h) / 6))] },
  chamfer: { name: 'Clipped corners', r: 1, fn: (w, h, p) => { const c = vcCornerR(p, w, h, Math.min(w, h) / 6), x = w / 2, y = h / 2; return [vcDedupe([{ x: -x + c, y: -y }, { x: x - c, y: -y }, { x, y: -y + c }, { x, y: y - c }, { x: x - c, y }, { x: -x + c, y }, { x: -x, y: y - c }, { x: -x, y: -y + c }])]; } },
  notch: { name: 'Notched corners', r: 1, fn: (w, h, p) => {
    const r = vcCornerR(p, w, h, Math.min(w, h) / 7), x = w / 2, y = h / 2;
    if (r < 1e-4) return [vcRound(w, h, 0)];
    return [vcDedupe([...vcArc(x, -y, r, r, 180, 90, 12), ...vcArc(x, y, r, r, 270, 180, 12), ...vcArc(-x, y, r, r, 360, 270, 12), ...vcArc(-x, -y, r, r, 90, 0, 12)])];
  } },
  arch: { name: 'Arch top', rise: 1, fn: (w, h, p) => {
    const x = w / 2, y = h / 2, rise = Math.max(0.01, Math.min(+p.rise || h * 0.28, h * 0.95, x * 2)), R = (x * x + rise * rise) / (2 * rise), cy = y - R, a = Math.asin(Math.min(1, x / R)) * 180 / Math.PI;
    return [vcDedupe([{ x: -x, y: -y }, { x, y: -y }, ...vcArc(0, cy, R, R, 90 - a, 90 + a, 48)])];
  } },
  ogee: { name: 'Ogee top', rise: 1, fn: (w, h, p) => {
    const x = w / 2, y = h / 2, rise = Math.max(0.01, Math.min(+p.rise || h * 0.3, h * 0.9)), s = y - rise;
    const half = [{ x: 0, y: -y }, { x, y: -y }, { x, y: s }, ...vcBez({ x, y: s }, { x: x * 0.42, y: s }, { x: x * 0.38, y }, { x: 0, y }, 32)];
    return [vcDedupe(vcMirrorX(half))];
  } },
  oval: { name: 'Oval', fn: (w, h) => [Array.from({ length: 120 }, (_, i) => ({ x: w / 2 * Math.cos(i / 120 * 2 * Math.PI), y: h / 2 * Math.sin(i / 120 * 2 * Math.PI) }))] },
  circle: { name: 'Circle', round: 1, fn: (w, h) => VC_GEN.oval.fn(w, h) },
  hex: { name: 'Hexagon', fn: (w, h) => [vcStretch(vcPoly(6, 0), w, h)] },
  oct: { name: 'Octagon', fn: (w, h) => [vcStretch(vcPoly(8, 22.5), w, h)] },
  shield: { name: 'Shield', fn: (w, h) => {
    const x = w / 2, y = h / 2, k = y - h * 0.42;
    const half = [{ x: 0, y }, { x, y }, { x, y: k }, ...vcBez({ x, y: k }, { x, y: k - h * 0.32 }, { x: x * 0.45, y: -y + h * 0.1 }, { x: 0, y: -y }, 32)];
    return [vcDedupe(vcMirrorX(half).reverse())];
  } },
  banner: { name: 'Ribbon banner', fn: (w, h) => { const x = w / 2, y = h / 2, n = Math.min(h * 0.45, x * 0.4); return [[{ x: -x, y: -y }, { x, y: -y }, { x: x - n, y: 0 }, { x, y }, { x: -x, y }, { x: -x + n, y: 0 }]]; } },
  star: { name: 'Star', pts: 1, fn: null },
  heart: { name: 'Heart', fn: null },
  diamond: { name: 'Diamond', fn: null },
  arrow: { name: 'Arrow', fn: null },
  cross: { name: 'Cross', fn: (w, h) => { const t = 0.3, a = t / 2; return [vcStretch([{ x: -a, y: -1 }, { x: a, y: -1 }, { x: a, y: 0.15 }, { x: 0.55, y: 0.15 }, { x: 0.55, y: 0.45 }, { x: a, y: 0.45 }, { x: a, y: 1 }, { x: -a, y: 1 }, { x: -a, y: 0.45 }, { x: -0.55, y: 0.45 }, { x: -0.55, y: 0.15 }, { x: -a, y: 0.15 }], w, h)]; } },
  plus: { name: 'Plus', fn: (w, h) => { const a = 0.17; return [vcStretch([{ x: -a, y: -1 }, { x: a, y: -1 }, { x: a, y: -a }, { x: 1, y: -a }, { x: 1, y: a }, { x: a, y: a }, { x: a, y: 1 }, { x: -a, y: 1 }, { x: -a, y: a }, { x: -1, y: a }, { x: -1, y: -a }, { x: -a, y: -a }], w, h)]; } },
  drop: { name: 'Teardrop', fn: (w, h) => { const half = [{ x: 0, y: 1 }, ...vcBez({ x: 0, y: 1 }, { x: 0.25, y: 0.55 }, { x: 0.62, y: 0.15 }, { x: 0.62, y: -0.28 }, 24), ...vcBez({ x: 0.62, y: -0.28 }, { x: 0.62, y: -0.72 }, { x: 0.3, y: -1 }, { x: 0, y: -1 }, 24)]; return [vcStretch(vcDedupe(vcMirrorX(half).reverse()), w, h)]; } },
  leaf: { name: 'Leaf', fn: (w, h) => { const a = vcBez({ x: 0, y: -1 }, { x: 0.75, y: -0.6 }, { x: 0.7, y: 0.4 }, { x: 0, y: 1 }, 32, 0), b = vcBez({ x: 0, y: 1 }, { x: -0.7, y: 0.4 }, { x: -0.75, y: -0.6 }, { x: 0, y: -1 }, 32); return [vcStretch(vcDedupe([...a, ...b.slice(0, -1)]), w, h)]; } },
  lens: { name: 'Divider (pointed)', fn: (w, h) => { const a = vcBez({ x: -1, y: 0 }, { x: -0.4, y: 0.5 }, { x: 0.4, y: 0.5 }, { x: 1, y: 0 }, 32, 0), b = vcBez({ x: 1, y: 0 }, { x: 0.4, y: -0.5 }, { x: -0.4, y: -0.5 }, { x: -1, y: 0 }, 32); return [vcStretch(vcDedupe([...a, ...b.slice(0, -1)]), w, h)]; } },
  moon: { name: 'Crescent moon', fn: (w, h) => { const c = VC_GEN.oval.fn(2, 2)[0], cut = c.map(p => ({ x: p.x * 0.86 + 0.62, y: p.y * 0.86 + 0.28 })); const L = typeof ClipperLib === 'undefined' ? [c] : vcClip('diff', [c], [cut], 'nonzero'); return vcStretchAll(L, w, h); } },
  sun: { name: 'Sun', fn: (w, h) => {
    const n = 12, rays = Array.from({ length: n }, (_, i) => { const a = i * 2 * Math.PI / n, s = Math.PI / n * 0.42; return [{ x: 0.55 * Math.cos(a - s), y: 0.55 * Math.sin(a - s) }, { x: Math.cos(a), y: Math.sin(a) }, { x: 0.55 * Math.cos(a + s), y: 0.55 * Math.sin(a + s) }]; });
    const disc = VC_GEN.oval.fn(1.24, 1.24)[0], L = typeof ClipperLib === 'undefined' ? [disc] : vcClip('or', [disc, ...rays], null, 'nonzero'); return vcStretchAll(L, w, h);
  } },
  bolt: { name: 'Lightning bolt', fn: (w, h) => [vcStretch([{ x: 0.15, y: 1 }, { x: -0.55, y: -0.1 }, { x: -0.05, y: -0.1 }, { x: -0.25, y: -1 }, { x: 0.55, y: 0.18 }, { x: 0.05, y: 0.18 }, { x: 0.35, y: 1 }], w, h)] },
  tree: { name: 'Pine tree', fn: (w, h) => { const half = [{ x: 0, y: 1 }, { x: 0.42, y: 0.42 }, { x: 0.2, y: 0.42 }, { x: 0.62, y: -0.18 }, { x: 0.36, y: -0.18 }, { x: 0.82, y: -0.72 }, { x: 0.12, y: -0.72 }, { x: 0.12, y: -1 }]; return [vcStretch(vcDedupe(vcMirrorX(half)), w, h)]; } },
  mountains: { name: 'Mountains', fn: (w, h) => [vcStretch([{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 0.62, y: -0.25 }, { x: 0.38, y: 0.12 }, { x: 0.22, y: -0.12 }, { x: -0.12, y: 1 }, { x: -0.38, y: 0.3 }, { x: -0.55, y: 0.48 }], w, h)] },
  house: { name: 'House', fn: (w, h) => [vcStretch([{ x: -0.72, y: -1 }, { x: -0.18, y: -1 }, { x: -0.18, y: -0.45 }, { x: 0.18, y: -0.45 }, { x: 0.18, y: -1 }, { x: 0.72, y: -1 }, { x: 0.72, y: 0.18 }, { x: 1, y: 0.18 }, { x: 0, y: 1 }, { x: -1, y: 0.18 }, { x: -0.72, y: 0.18 }], w, h)] },
  gear: { name: 'Gear', fn: (w, h) => {
    const n = 10, o = [], hole = VC_GEN.oval.fn(0.7, 0.7)[0].slice().reverse();
    for (let i = 0; i < n; i++) { const a = i * 360 / n, s = 360 / n; [[a - s * 0.5, 0.78], [a - s * 0.2, 0.78], [a - s * 0.12, 1], [a + s * 0.12, 1], [a + s * 0.2, 0.78]].forEach(([d, r]) => o.push({ x: r * Math.cos(d * Math.PI / 180), y: r * Math.sin(d * Math.PI / 180) })); }
    return vcStretchAll([vcDedupe(o), hole], w, h);
  } },
};
function vcStretchAll(L, w, h) { const b = vcBox(L), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return L.map(l => l.map(p => ({ x: (p.x - cx) / (b.w || 1) * w, y: (p.y - cy) / (b.h || 1) * h }))); }
// The outlines of a recipe shape at its size, with its border band when it has one.
function vcGenLoops(it) {
  const w = Math.max(0.05, +it.w || +it.h || 1), h = Math.max(0.05, +it.h || 1), g = VC_GEN[it.shape];
  // The first shapes (rectangle, rounded, oval, border, star, heart, diamond, arrow) are drawn as they always were.
  const L = g && g.fn && !VC_OLD_SHAPES.includes(it.shape) ? g.fn(w, h, it.p || {}) : vcShapeLoops(it.p ? { ...it, ...it.p } : it);
  return +it.frame > 0 ? vcFrameLoops(L, Math.min(+it.frame, Math.min(w, h) / (it.double ? 6.2 : 2.2)), !!it.double) : L;
}

/* ----- The library: shop-wide, kept in Hub storage ----- */
const VC_LIB_DEF = [
  ['Borders and frames', [['frame', 'Frame', 'rect', 0.5], ['frame-r', 'Rounded frame', 'rrect', 0.5], ['frame-n', 'Notched frame', 'notch', 0.5], ['frame-c', 'Clipped frame', 'chamfer', 0.5], ['frame-a', 'Arch frame', 'arch', 0.5], ['frame-g', 'Ogee frame', 'ogee', 0.5], ['frame-o', 'Oval frame', 'oval', 0.5], ['ring', 'Ring', 'circle', 0.5], ['frame-d', 'Double line frame', 'rect', 0.25, 1], ['frame-rd', 'Double rounded frame', 'rrect', 0.25, 1]]],
  ['Plaques and badges', [['rect', 'Rectangle', 'rect'], ['rrect', 'Rounded rectangle', 'rrect'], ['chamfer', 'Clipped corners', 'chamfer'], ['notch', 'Notched corners', 'notch'], ['arch', 'Arch top', 'arch'], ['ogee', 'Ogee top', 'ogee'], ['oval', 'Oval', 'oval'], ['circle', 'Circle', 'circle'], ['hex', 'Hexagon', 'hex'], ['oct', 'Octagon', 'oct'], ['shield', 'Shield', 'shield'], ['banner', 'Ribbon banner', 'banner']]],
  ['Ornaments', [['star', 'Star', 'star'], ['star6', 'Six point star', 'star', 0, 0, { points: 6, inner: 0.55 }], ['heart', 'Heart', 'heart'], ['diamond', 'Diamond', 'diamond'], ['lens', 'Divider', 'lens'], ['drop', 'Teardrop', 'drop'], ['leaf', 'Leaf', 'leaf'], ['arrow', 'Arrow', 'arrow'], ['cross', 'Cross', 'cross'], ['plus', 'Plus', 'plus']]],
  ['Icons', [['moon', 'Crescent moon', 'moon'], ['sun', 'Sun', 'sun'], ['bolt', 'Lightning bolt', 'bolt'], ['tree', 'Pine tree', 'tree'], ['mountains', 'Mountains', 'mountains'], ['house', 'House', 'house'], ['gear', 'Gear', 'gear']]],
];
// Sizes a new shape starts at (inches): frames fit the board, the rest by kind.
const VC_DEF_SIZE = { banner: [10, 2.5], lens: [8, 1], oval: [8, 5], rect: [10, 6], rrect: [10, 6], chamfer: [10, 6], notch: [10, 6], arch: [8, 8], ogee: [10, 7], shield: [5, 6], arrow: [6, 2.5], cross: [3, 4.5] };
function vcLibDefaults() {
  const out = [];
  VC_LIB_DEF.forEach(([group, list]) => list.forEach(([k, name, gen, frame, double, p]) => {
    const sz = VC_DEF_SIZE[gen] || [4, 4];
    out.push({ id: 'vs-' + k, name, group, gen, p: p || {}, w: sz[0], h: sz[1], frame: frame || 0, double: double ? 1 : 0, mode: 'carve', builtin: 1 });
  }));
  return out;
}
let VC_LIB = { items: vcLibDefaults(), gone: [] };
function vcLibFix(v) {
  const items = Array.isArray(v && v.items) ? v.items.filter(x => x && x.id) : [], gone = Array.isArray(v && v.gone) ? v.gone : [];
  // New built-in shapes from an update show up; ones you deleted stay gone.
  vcLibDefaults().forEach(d => { if (!items.some(x => x.id === d.id) && !gone.includes(d.id)) items.push(d); });
  return { items, gone };
}
if (typeof shopLoad === 'function') shopLoad('vcShapes', v => { VC_LIB = vcLibFix(v); if (ui && (ui.tab === 'vcshapes' || ui.tab === 'carve')) render(); });
const vcLibSave = () => { if (typeof shopSave === 'function') shopSave('vcShapes', VC_LIB, 'the V-carve shape library'); };
const vcLibItem = id => VC_LIB.items.find(x => x.id === id);
const vcLibGroups = () => { const g = []; VC_LIB_DEF.forEach(([n]) => g.push(n)); VC_LIB.items.forEach(x => { if (!g.includes(x.group || 'My designs')) g.push(x.group || 'My designs'); }); return g; };

// What a library entry looks like on a sign: a recipe shape or a saved design, copied onto the sign.
function vcFromLib(e, sz) {
  const base = { id: uid('vi'), name: e.name, angle: 0, mode: e.mode || 'carve', lib: e.id };
  if (e.gen) {
    let w = +e.w || 4, h = +e.h || 4;
    if (+e.frame > 0) { const m = Math.max(0.25, Math.min(sz.L, sz.W) * 0.06); w = r3(sz.L - 2 * m); h = r3(sz.W - 2 * m); if (VC_GEN[e.gen].round) w = h = Math.min(w, h); }
    else { const k = Math.min(1, sz.L * 0.7 / w, sz.W * 0.7 / h); w = r3(w * k); h = r3(h * k); }
    return { ...base, kind: 'shape', shape: e.gen, p: clone(e.p || {}), w, h, ...(+e.frame > 0 ? { frame: +e.frame, double: e.double ? 1 : 0 } : {}) };
  }
  const h = r3(Math.min(+e.h || 2, sz.W * 0.7, sz.L * 0.7 / (+e.bw || 1)));
  return { ...base, kind: 'art', src: 'lib', loops: clone(e.loops || []), open: clone(e.open || []), bw: +e.bw || 1, bh: 1, h };
}
// A design on a sign saved as a library entry (its shape at height 1, not where it sits or how it is turned).
function vcToLib(it) {
  const b = vcItemBase(it), L = b.loops.map(l => l.map(p => ({ x: p.x * b.sx, y: p.y * b.sy }))), O = (b.open || []).map(l => l.map(p => ({ x: p.x * b.sx, y: p.y * b.sy })));
  const bx = vcBox(L.length ? L : O), k = bx.h > 0 ? 1 / bx.h : 1, cx = (bx.x0 + bx.x1) / 2, cy = (bx.y0 + bx.y1) / 2, n = l => l.map(p => ({ x: (p.x - cx) * k, y: (p.y - cy) * k }));
  return { id: uid('vs'), name: it.kind === 'text' ? String(it.text || 'Text').split('\n')[0].slice(0, 40) : (it.name || 'My design'), group: 'My designs', loops: vcRound4(L.map(n)), open: vcRound4(O.map(n)), bw: r3(bx.w * k), h: r3(bx.h || +it.h || 2), mode: it.mode || 'carve' };
}

/* ----- SVG files read as real lines and curves (not traced), so logos stay sharp ----- */
function vcSvgShape(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), root = doc.querySelector('svg');
  if (!root || doc.querySelector('parsererror')) throw new Error('not an SVG drawing');
  const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:-99999px;top:0;width:10px;height:10px;overflow:hidden';
  const svg = document.importNode(root, true); host.appendChild(svg); document.body.appendChild(host);
  const els = [];
  try {
    svg.querySelectorAll('path,polygon,polyline,rect,circle,ellipse,line').forEach(el => {
      if (el.closest('defs,clipPath,mask,symbol,pattern,marker')) return;
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const m = el.getCTM && el.getCTM(), T = p => { if (!m) return { x: p.x, y: -p.y }; const q = new DOMPoint(p.x, p.y).matrixTransform(m); return { x: q.x, y: -q.y }; };
      const subs = vcSvgSubpaths(el), loops = [], open = [];
      subs.forEach(s => { const P = s.pts.map(T); if (s.closed && P.length >= 3) loops.push(P); else if (P.length >= 2) open.push(P); });
      if (!loops.length && !open.length) return;
      const fill = cs.fill || 'black', none = fill === 'none' || /^rgba\(.*,\s*0\)$/.test(fill);
      const rgb = (fill.match(/\d+(\.\d+)?/g) || [0, 0, 0]).slice(0, 3).map(Number), light = !none && (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) > 200;
      els.push({ loops, open, none, light, evenodd: cs.fillRule === 'evenodd' });
    });
  } finally { host.remove(); }
  const open = els.flatMap(e => e.open);
  let loops;
  // Outline drawings (no fills) carve like VCarve: shapes inside shapes are holes. Filled drawings are painted
  // in order: dark fills add, white fills on top take away.
  if (els.every(e => e.none || !e.loops.length) || typeof ClipperLib === 'undefined') loops = els.flatMap(e => e.loops);
  else {
    loops = [];
    els.forEach(e => { if (!e.loops.length) return; const f = e.evenodd ? vcFill(e.loops) : vcClip('or', e.loops, null, 'nonzero'); loops = e.light ? (loops.length ? vcClip('diff', loops, f, 'nonzero') : loops) : (loops.length ? vcClip('or', [...loops, ...f], null, 'nonzero') : f); });
  }
  const all = [...loops, ...open], b = vcBox(all), k = b.h > 0 ? 1 / b.h : 1, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, n = l => l.map(p => ({ x: (p.x - cx) * k, y: (p.y - cy) * k }));
  return { loops: loops.map(n), open: open.map(n), bw: b.w * k, bh: 1 };
}
// Points along an SVG element's subpaths, curves cut into short straight pieces.
function vcSvgSubpaths(el) {
  const tag = el.tagName.toLowerCase(), A = k => +el.getAttribute(k) || 0;
  if (tag === 'rect') { const x = A('x'), y = A('y'), w = A('width'), h = A('height'); let rx = A('rx') || A('ry'), ry = A('ry') || A('rx'); rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2); if (!(w > 0 && h > 0)) return []; if (!rx) return [{ closed: true, pts: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }]; return [{ closed: true, pts: [...vcArc(x + w - rx, y + ry, rx, ry, -90, 0, 8), ...vcArc(x + w - rx, y + h - ry, rx, ry, 0, 90, 8), ...vcArc(x + rx, y + h - ry, rx, ry, 90, 180, 8), ...vcArc(x + rx, y + ry, rx, ry, 180, 270, 8)] }]; }
  if (tag === 'circle' || tag === 'ellipse') { const rx = tag === 'circle' ? A('r') : A('rx'), ry = tag === 'circle' ? A('r') : A('ry'); if (!(rx > 0 && ry > 0)) return []; return [{ closed: true, pts: vcArc(A('cx'), A('cy'), rx, ry, 0, 360, 96).slice(0, -1) }]; }
  if (tag === 'line') return [{ closed: false, pts: [{ x: A('x1'), y: A('y1') }, { x: A('x2'), y: A('y2') }] }];
  if (tag === 'polygon' || tag === 'polyline') { const n = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number), pts = []; for (let i = 0; i + 1 < n.length; i += 2) pts.push({ x: n[i], y: n[i + 1] }); return [{ closed: tag === 'polygon', pts }]; }
  return vcPathD(el.getAttribute('d') || '');
}
function vcPathD(d) {
  const tok = String(d).match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [], subs = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, cur = null, prev = '';
  const num = () => +tok[i++], isNum = () => i < tok.length && !/[a-zA-Z]/.test(tok[i]);
  const start = () => { if (cur && cur.pts.length > 1) subs.push(cur); cur = { closed: false, pts: [{ x, y }] }; };
  const to = (nx, ny) => { if (!cur) start(); cur.pts.push({ x: nx, y: ny }); x = nx; y = ny; };
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { if (cur) { cur.closed = true; x = sx; y = sy; subs.push(cur); cur = null; } prev = 'Z'; continue; }
    if (!isNum()) { i++; continue; }
    if (C === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; start(); cmd = rel ? 'l' : 'L'; }
    else if (C === 'L') to(ox + num(), oy + num());
    else if (C === 'H') to(ox + num(), y);
    else if (C === 'V') to(x, oy + num());
    else if (C === 'C' || C === 'S') {
      let x1, y1; if (C === 'C') { x1 = ox + num(); y1 = oy + num(); } else { const r = /[CS]/.test(prev); x1 = r ? 2 * x - cx : x; y1 = r ? 2 * y - cy : y; }
      const x2 = ox + num(), y2 = oy + num(), ex = ox + num(), ey = oy + num();
      vcBez({ x, y }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x: ex, y: ey }, 16).forEach(p => to(p.x, p.y)); cx = x2; cy = y2; x = ex; y = ey;
    } else if (C === 'Q' || C === 'T') {
      let x1, y1; if (C === 'Q') { x1 = ox + num(); y1 = oy + num(); } else { const r = /[QT]/.test(prev); x1 = r ? 2 * x - cx : x; y1 = r ? 2 * y - cy : y; }
      const ex = ox + num(), ey = oy + num(), x0 = x, y0 = y;
      for (let k = 1; k <= 12; k++) { const t = k / 12, u = 1 - t; to(u * u * x0 + 2 * u * t * x1 + t * t * ex, u * u * y0 + 2 * u * t * y1 + t * t * ey); }
      cx = x1; cy = y1;
    } else if (C === 'A') {
      let rx = Math.abs(num()), ry = Math.abs(num()); const ph = num() * Math.PI / 180, la = !!num(), sw = !!num(), ex = ox + num(), ey = oy + num();
      if (!rx || !ry) { to(ex, ey); }
      else {
        const cp = Math.cos(ph), sp = Math.sin(ph), dx = (x - ex) / 2, dy = (y - ey) / 2, x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
        const lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
        let s = Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) / (rx * rx * y1 * y1 + ry * ry * x1 * x1))); if (la === sw) s = -s;
        const ccx = s * rx * y1 / ry, ccy = -s * ry * x1 / rx, mx = cp * ccx - sp * ccy + (x + ex) / 2, my = sp * ccx + cp * ccy + (y + ey) / 2;
        const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        const t1 = ang(1, 0, (x1 - ccx) / rx, (y1 - ccy) / ry); let dt = ang((x1 - ccx) / rx, (y1 - ccy) / ry, (-x1 - ccx) / rx, (-y1 - ccy) / ry);
        if (!sw && dt > 0) dt -= 2 * Math.PI; else if (sw && dt < 0) dt += 2 * Math.PI;
        const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 24)));
        for (let k = 1; k <= n; k++) { const t = t1 + dt * k / n, px = rx * Math.cos(t), py = ry * Math.sin(t); to(cp * px - sp * py + mx, sp * px + cp * py + my); }
        x = ex; y = ey;
      }
    } else { i++; continue; }
    if (!/[CS]/.test(C)) { cx = x; cy = y; } prev = C;
  }
  if (cur && cur.pts.length > 1) subs.push(cur);
  // A path that ends where it started counts as closed.
  subs.forEach(s => { const a = s.pts[0], b = s.pts[s.pts.length - 1]; if (!s.closed && s.pts.length > 2 && Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) s.closed = true; if (s.closed && s.pts.length > 1 && Math.hypot(a.x - b.x, a.y - b.y) < 1e-9) s.pts.pop(); });
  return subs;
}
// Any design file read into outlines at height 1: SVG (real curves), DXF (closed shapes + open lines) or a picture (traced).
async function vcReadDesign(f) {
  if (/\.dxf$/i.test(f.name)) { const d = vcDxfShape(await f.text()); return { src: 'dxf', loops: d.loops, open: d.open || [], bw: d.bw, h: d.h > 0 ? d.h : 2 }; }
  if (/\.svg$/i.test(f.name) || f.type === 'image/svg+xml') {
    try { const d = vcSvgShape(await f.text()); if (d.loops.length || d.open.length) return { src: 'svg', ...d, h: 0 }; } catch (_) { /* traced below */ }
  }
  const { im, url } = await vcLoadImage(f); try { const tr = vcTraceImage(im, '', false); return { src: 'img', loops: tr.loops, open: [], bw: tr.bw, h: 0, th: tr.th, im }; } finally { URL.revokeObjectURL(url); }
}

/* ----- Little pictures of shapes ----- */
function vcLibGeo(e) { return { loops: e.loops || [], open: e.open || [] }; }
function vcThumb(e) {
  let g; try { g = e.gen ? { loops: vcGenLoops({ shape: e.gen, p: e.p || {}, w: +e.w || 4, h: +e.h || 4, frame: +e.frame > 0 ? Math.max(+e.w || 4, +e.h || 4) * (e.double ? 0.035 : 0.07) : 0, double: e.double }), open: [] } : vcLibGeo(e); } catch (_) { g = { loops: [], open: [] }; }
  const all = [...g.loops, ...g.open], b = vcBox(all), s = Math.max(b.w, b.h) || 1, pad = s * 0.08;
  const d = l => l.map((p, i) => `${i ? 'L' : 'M'}${r3(p.x)} ${r3(-p.y)}`).join('');
  return `<svg viewBox="${r3(b.x0 - pad)} ${r3(-b.y1 - pad)} ${r3(b.w + 2 * pad || 1)} ${r3(b.h + 2 * pad || 1)}" class="vcs-th" aria-hidden="true"><path d="${g.loops.map(l => d(l) + 'Z').join('')}" fill-rule="evenodd" class="vcs-fill"/>${g.open.length ? `<path d="${g.open.map(d).join('')}" fill="none" class="vcs-line" stroke-width="${r3(s * 0.025)}"/>` : ''}</svg>`;
}

/* ----- The library picker on the Carve tab ----- */
function vcPickerHTML() {
  const q = String(ui.vcPickQ || '').toLowerCase(), groups = vcLibGroups();
  const tiles = g => VC_LIB.items.filter(e => (e.group || 'My designs') === g && (!q || String(e.name).toLowerCase().includes(q) || g.toLowerCase().includes(q)));
  const room = (S.shapeLib || []).filter(l => !q || String(l.name || '').toLowerCase().includes(q));
  return `<div class="vcs-pick"><div class="vcs-pickh"><b>Shape library</b><span class="grow"></span><button class="linkbtn" data-act="vc-lib-open">Open the library</button><button class="btn sm pe-x" data-act="vc-pick" aria-label="Close" title="Close">×</button></div>
    <input type="search" class="vc-pickq" placeholder="Find a shape" value="${esc(ui.vcPickQ || '')}" aria-label="Find a shape">
    ${groups.map(g => { const t = tiles(g); return t.length ? `<div class="vcs-gh">${esc(g)}</div><div class="vcs-grid">${t.map(e => `<button class="vcs-tile" data-act="vc-lib-add" data-id="${esc(e.id)}" title="${esc(e.name)}">${vcThumb(e)}<span>${esc(e.name)}</span></button>`).join('')}</div>` : ''; }).join('')}
    ${room.length ? `<div class="vcs-gh">From the shape designer</div><div class="vcs-grid">${room.map(l => `<button class="vcs-tile" data-act="vc-add" data-id="lib:${esc(l.id)}" title="${esc(l.name || '')}">${typeof seThumb === 'function' ? seThumb(l.pts, false) : ''}<span>${esc(l.name || 'Shape')}</span></button>`).join('')}</div>` : ''}</div>`;
}

/* ----- Libraries › V-carve shapes ----- */
function vcLibUse(id) { let n = 0; vcBoards().forEach(b => (b.items || []).forEach(it => { if (it.lib === id) n++; })); return n; }
function renderVcShapes() {
  const el = $('#tab-vcshapes'); if (!el) return;
  const items = VC_LIB.items, q = String(ui.vcLibQ || '').toLowerCase(), shut = ui.vcLibShut || (ui.vcLibShut = {});
  let e = vcLibItem(ui.vcLibSel) || items[0]; if (e) ui.vcLibSel = e.id;
  const head = libHead('V-carve shapes', null, '', '', `<button class="btn" data-act="vc-lib-reset" title="Bring back built-in shapes you deleted">Back to the starting shapes</button><label class="btn primary">${icon('upload')}Import SVG, DXF or picture<input type="file" class="vc-lib-imp" accept=".svg,.dxf,image/*" multiple hidden></label>`);
  const list = `<div class="card plx-list"><div class="cardbody libtree"><label class="f pick-findf"><span>Find</span><input type="search" class="vc-libq" value="${esc(ui.vcLibQ || '')}" placeholder="Find a shape" aria-label="Find a shape"></label>
    ${vcLibGroups().map(g => { const t = items.filter(x => (x.group || 'My designs') === g && (!q || String(x.name).toLowerCase().includes(q) || g.toLowerCase().includes(q))); if (!t.length) return ''; const s = !q && !!shut[g];
      return `<div class="lgrp"><button class="lgrp-h" data-act="vc-lib-fold" data-id="${esc(g)}" aria-expanded="${!s}"><span class="arr" aria-hidden="true">${s ? '▸' : '▾'}</span><span>${esc(g)}</span><span class="ct">${t.length}</span></button></div>${s ? '' : t.map(x => `<button class="mli sli${e && x.id === e.id ? ' on' : ''}" data-act="vc-lib-sel" data-id="${esc(x.id)}"><span class="sli-pic vcs-pic">${vcThumb(x)}</span><span><b>${esc(x.name)}</b><small>${x.gen ? (+x.frame > 0 ? 'Border' : 'Shape') : x.open && x.open.length && !(x.loops || []).length ? 'Lines' : 'Design'} · ${vcModeName(x.mode)}</small></span></button>`).join('')}`; }).join('') || '<div class="note show">No shapes match.</div>'}</div></div>`;
  if (!e) { el.innerHTML = `${head}<div class="plx mlx">${list}<div class="card cardbody note show">No shapes yet. Import an SVG, DXF or picture.</div></div>`; return; }
  const R = (k, l, v, o = {}) => `<label class="f${o.wide ? ' wide' : ''}"><span>${l}</span><input class="vc-lib-in" data-k="${k}"${o.num ? ' type="number" step="any"' : ''} value="${esc(v === undefined || v === null || v === '' ? '' : o.len ? fmtLen(+v || 0, 1) : String(v))}"${o.list ? ` list="${o.list}"` : ''}></label>`;
  const g = e.gen && VC_GEN[e.gen];
  const props = `${cardHead('Shape', '')}<div class="cardbody">${R('name', 'Name', e.name, { wide: 1 })}${R('group', 'Group', e.group || 'My designs', { wide: 1, list: 'vcs-groups' })}<datalist id="vcs-groups">${vcLibGroups().map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <label class="f wide"><span>Carve it</span><select class="vc-lib-in" data-k="mode">${VC_MODES.map(([v, l]) => `<option value="${v}"${(e.mode || 'carve') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      ${R('h', 'Height to start at', e.h, { len: 1 })}${e.gen ? R('w', 'Width to start at', e.w, { len: 1 }) : ''}</div>
    ${e.gen ? `${cardHead('Shape settings', '')}<div class="cardbody">
      <label class="f wide"><span>Shape</span><select class="vc-lib-in" data-k="gen">${Object.entries(VC_GEN).map(([k, v]) => `<option value="${k}"${e.gen === k ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
      ${R('frame', 'Border width (blank = solid shape)', +e.frame > 0 ? e.frame : '', { len: 1 })}${+e.frame > 0 ? `<label class="f chk"><input type="checkbox" class="vc-lib-in" data-k="double"${e.double ? ' checked' : ''}> <span>Double line</span></label>` : ''}
      ${g && g.r ? R('p.r', 'Corner size', (e.p || {}).r ?? '', { len: 1 }) : ''}${g && g.rise ? R('p.rise', 'Top rise', (e.p || {}).rise ?? '', { len: 1 }) : ''}${e.gen === 'star' ? R('p.points', 'Points', (e.p || {}).points || 5, { num: 1 }) + R('p.inner', 'Inner size (0.2 to 0.9)', (e.p || {}).inner || 0.45, { num: 1 }) : ''}
      <div class="note help">Built-in shapes are drawn fresh at any size, so they stay crisp. Blank sizes use the shape's normal proportions.</div></div>` : `${cardHead('Design', '')}<div class="cardbody"><div class="note">${(e.loops || []).length} outline${(e.loops || []).length === 1 ? '' : 's'}${(e.open || []).length ? `, ${(e.open || []).length} open line${e.open.length === 1 ? '' : 's'} (engraved on the line)` : ''}. ${fmtLen(r3((+e.bw || 1) * (+e.h || 1)), 1)} wide at ${fmtLen(+e.h || 1, 1)} high.</div></div>`}`;
  const used = vcLibUse(e.id);
  el.innerHTML = `${head}<div class="plx mlx ilx vcs">${list}<div class="plx-main mlx-main">
    <div class="card plx-pic">${cardHead(esc(e.name), `<button class="btn sm" data-act="vc-lib-copy">${icon('copy')}Copy</button><button class="btn sm" data-act="vc-lib-exp">${icon('download')}Export</button><button class="btn sm danger" data-act="vc-lib-del">${icon('trash')}Delete</button>`)}
      <div class="plx-pv vcs-pv"><canvas id="vcs-canvas" aria-label="Carved preview"></canvas></div>
      <div class="edx-stats plx-stats mlx-stats">${libTile('rose', 'ruler', fmtLen(+e.h || 0, 1), 'High to start')}${libTile('violet', 'edit', vcModeName(e.mode), 'Carve it')}${libTile('teal', 'folder', e.group || 'My designs', 'Group')}${libTile('amber', 'list', used, 'On signs in this job')}</div>
      ${ui.tab === 'vcshapes' && vcBoard() ? `<div class="row-actions vcs-acts"><button class="btn primary" data-act="vc-lib-place">${icon('plus')}Add to ${esc(vcBoard().name)}</button></div>` : ''}</div>
    <div class="card plx-props mlx-props">${props}</div></div></div>`;
  requestAnimationFrame(() => vcLibPreview(e));
}
// The carved look of a library shape, on a small board with the first V-bit.
function vcLibPreview(e) {
  const cv = $('#vcs-canvas'); if (!cv || !e) return;
  const sz0 = { L: 12, W: 12 }, it = vcFromLib(e, sz0);
  if (it.kind === 'shape') { if (!(+e.frame > 0)) { it.w = +e.w || 4; it.h = +e.h || 4; } else { it.w = +e.w || 10; it.h = +e.h || 6; } }
  else it.h = +e.h || 2;
  const s = vcItemSize(it), L = r3(s.w + 1.5), W = r3(s.h + 1.5);
  it.x = L / 2; it.y = W / 2;
  const b = { id: 'vcs-pv', name: e.name, L, W, T: 0.75, part: '', merge: 1, vbit: (vcVbits()[0] || {}).id || '', depth: 0, clear: vcDefClear(), items: [it] };
  if (it.mode === 'raise') b.items.unshift({ id: 'vcs-bg', kind: 'shape', shape: 'rect', w: L - 0.5, h: W - 0.5, x: L / 2, y: W / 2, mode: 'carve' });
  try { const r = vcBoardOps(b); vcDrawPreview(cv, b, r, false); } catch (err) { cv.width = 10; cv.height = 10; }
}
const VC_MODES = [['carve', 'Carve it in'], ['raise', 'Leave it raised'], ['line', 'Outline only (on the line)']];
const vcModeName = m => (VC_MODES.find(x => x[0] === (m || 'carve')) || VC_MODES[0])[1];

async function vcLibImport(files) {
  let n = 0;
  for (const f of files) {
    try {
      const d = await vcReadDesign(f);
      if (!d.loops.length && !(d.open || []).length) { flash(`Nothing to carve in ${f.name}.`); continue; }
      const e = { id: uid('vs'), name: f.name.replace(/\.[^.]+$/, ''), group: 'My designs', loops: vcRound4(d.loops), open: vcRound4(d.open || []), bw: r3(d.bw), h: r3(d.h > 0 ? d.h : 3), mode: (d.loops.length ? 'carve' : 'line') };
      VC_LIB.items.push(e); ui.vcLibSel = e.id; n++;
    } catch (err) { flash(`Could not read ${f.name}: ${err.message}`); }
  }
  if (n) { (ui.vcLibShut || {})['My designs'] = false; vcLibSave(); render(); flash(`Added ${n} design${n === 1 ? '' : 's'} to My designs`); }
}
function vcLibAct(a, id) {
  const e = vcLibItem(ui.vcLibSel);
  switch (a) {
    case 'vc-lib-sel': ui.vcLibSel = id; renderVcShapes(); return true;
    case 'vc-lib-fold': (ui.vcLibShut = ui.vcLibShut || {})[id] = !ui.vcLibShut[id]; renderVcShapes(); return true;
    case 'vc-lib-open': goTab('vcshapes'); return true;
    case 'vc-lib-copy': if (e) { const c = clone(e); c.id = uid('vs'); c.name = e.name + ' copy'; delete c.builtin; VC_LIB.items.splice(VC_LIB.items.indexOf(e) + 1, 0, c); ui.vcLibSel = c.id; vcLibSave(); renderVcShapes(); } return true;
    case 'vc-lib-del': if (e && confirmDel(e.name)) { VC_LIB.items = VC_LIB.items.filter(x => x !== e); if (e.builtin && !VC_LIB.gone.includes(e.id)) VC_LIB.gone.push(e.id); ui.vcLibSel = ''; vcLibSave(); renderVcShapes(); } return true;
    case 'vc-lib-reset': VC_LIB.gone = []; VC_LIB = vcLibFix(VC_LIB); vcLibSave(); renderVcShapes(); flash('The built-in shapes are back'); return true;
    case 'vc-lib-exp': if (e) libDownload(`${String(e.name || 'shape').replace(/[^\w -]/g, '')}.json`, { format: 'cabinet-designer-library', kind: 'vcShapes', items: [e] }); return true;
    case 'vc-lib-place': if (e && vcBoard()) { vcAddItem(vcFromLib(e, vcSize(vcBoard()))); goTab('carve'); } return true;
    case 'vc-lib-add': { const x = vcLibItem(id), b = vcBoard(); if (x && b) { ui.vcPick = false; vcAddItem(vcFromLib(x, vcSize(b))); } return true; }
  }
  return false;
}
document.addEventListener('change', ev => {
  const t = ev.target; if (!t.classList) return;
  if (t.classList.contains('vc-lib-imp')) { const fs = [...(t.files || [])]; t.value = ''; if (fs.length) vcLibImport(fs); return; }
  if (t.classList.contains('vc-lib-imp-json')) return;
  if (!t.classList.contains('vc-lib-in')) return;
  const e = vcLibItem(ui.vcLibSel); if (!e) return;
  const k = t.dataset.k, raw = t.type === 'checkbox' ? t.checked : t.value;
  const len = v => { const s = String(v).trim(); if (s === '') return ''; const n = parseLen(s); return isFinite(n) ? r3(n) : null; };
  if (k === 'name') e.name = String(raw).trim() || e.name;
  else if (k === 'group') e.group = String(raw).trim() || 'My designs';
  else if (k === 'mode') e.mode = raw;
  else if (k === 'gen') e.gen = raw;
  else if (k === 'double') e.double = raw ? 1 : 0;
  else if (k === 'h' || k === 'w' || k === 'frame') { const v = len(raw); if (v === null) { flash('Type a size, like 2, 1 1/2 or 38mm.'); renderVcShapes(); return; } e[k] = v === '' ? (k === 'frame' ? 0 : e[k]) : v; }
  else if (k.startsWith('p.')) { const f = k.slice(2), v = f === 'points' || f === 'inner' ? (String(raw).trim() === '' ? '' : +raw) : len(raw); if (v === null || (v !== '' && !isFinite(v))) { renderVcShapes(); return; } e.p = { ...(e.p || {}) }; if (v === '') delete e.p[f]; else e.p[f] = f === 'points' ? Math.max(3, Math.min(24, Math.round(v))) : f === 'inner' ? Math.max(0.15, Math.min(0.95, v)) : v; }
  vcLibSave(); renderVcShapes();
});
document.addEventListener('input', ev => {
  const t = ev.target; if (!t.classList) return;
  if (t.classList.contains('vc-libq')) { ui.vcLibQ = t.value; const pos = t.selectionStart; renderVcShapes(); const n = $('.vc-libq'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} } }
  else if (t.classList.contains('vc-pickq')) { ui.vcPickQ = t.value; const pos = t.selectionStart; renderCarve(); const n = $('.vc-pickq'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} } }
});

/* ----- Trace a picture into a vector (like VCarve's Trace Bitmap) ----- */
// Open a picture, see the outlines it makes over the picture, tune them, then put it on the sign, keep it in the
// library, or save it as an SVG or DXF vector file.
async function vcTraceStart(f) {
  try {
    const { im, url } = await vcLoadImage(f); URL.revokeObjectURL(url);
    ui.vcTrace = { im, name: f.name.replace(/\.[^.]+$/, ''), th: '', smooth: 1, speck: 0.05, invert: false, h: 6 };
    ui.vcPick = false; if (ui.tab !== 'carve') goTab('carve'); else renderCarve();
  } catch (e) { flash('Could not open that picture: ' + e.message + '. Use a PNG or JPG.'); }
}
let vcTraceMemo = null;
function vcTraceNow() {
  const t = ui.vcTrace, key = [t.th, t.smooth, t.speck, t.invert].join('|');
  if (vcTraceMemo && vcTraceMemo.im === t.im && vcTraceMemo.key === key) return vcTraceMemo.r;
  const r = vcTraceImage(t.im, t.th, t.invert, { smooth: t.smooth, speck: t.speck });
  if (!(+t.th > 0)) t.th = r3(r.th);
  vcTraceMemo = { im: t.im, key: [t.th, t.smooth, t.speck, t.invert].join('|'), r }; return r;
}
function vcTraceView(el) {
  const t = ui.vcTrace; let r; try { r = vcTraceNow(); } catch (e) { r = { loops: [], bw: 1 }; }
  const pts = r.loops.reduce((n, l) => n + l.length, 0), hIn = +t.h || 6, wIn = (r.bw || 1) * hIn, b = vcBoard();
  const sl = (k, l, min, max, step, v, help) => `<label class="f vc-wide"><span>${l} <b class="vct-v">${v}</b></span><input type="range" class="vct-in" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}" aria-label="${l}"><small class="muted">${help}</small></label>`;
  el.innerHTML = `<div class="prx vcx"><aside class="prx-side"><div class="prx-grand vcx-grand"><span>Trace a picture</span><b>${esc(t.name)}</b><small>${r.loops.length} outline${r.loops.length === 1 ? '' : 's'} · ${pts.toLocaleString()} points</small></div>
      <div class="prx-navh">How to trace</div><div class="vc-grid vct-set">
      ${sl('th', 'Dark cut-off', 0.05, 0.95, 0.01, (+t.th || r.th || 0.5).toFixed(2), 'Higher takes in lighter greys.')}
      ${sl('smooth', 'Smoothing', 0, 3, 1, +t.smooth || 0, '0 follows every pixel; 3 is the smoothest. Sharp corners stay sharp.')}
      ${sl('speck', 'Remove specks', 0, 1, 0.01, (+t.speck || 0).toFixed(2), 'Drops spots and holes smaller than this much of the picture.')}
      <label class="f chk vc-wide"><input type="checkbox" class="vct-in" data-k="invert"${t.invert ? ' checked' : ''}> <span>Trace the light parts instead</span></label>
      <label class="f vc-wide"><span>Size (height)</span><input class="vct-in" data-k="h" value="${esc(fmtLen(hIn, 1))}" aria-label="Height"><small class="muted">${fmtLen(r3(wIn), 1)} wide at this height.</small></label></div></aside>
    <section class="prx-main"><div class="prx-top"><h2>Trace</h2><span class="grow"></span><span class="muted">The pink is what gets carved</span></div>
      <div class="prx-body vcx-body"><div class="psec box vc-stage vcx-stage"><div class="vc-view"><div class="vc-wrap vct-wrap" style="aspect-ratio:${r3(r.px ? r.px.w : 1)} / ${r3(r.px ? r.px.h : 1)}"><canvas id="vct-canvas" aria-label="Traced picture"></canvas></div></div></div></div></section>
    <aside class="vcx-right"><div class="vcx-acts vct-acts">${b ? `<button class="btn primary" data-act="vc-trace-add">${icon('plus')}Add to ${esc(b.name)}</button>` : `<button class="btn primary" data-act="vc-trace-add">${icon('plus')}Start a sign with it</button>`}</div>
      <div class="psec box"><div class="vc-grid"><button class="btn" data-act="vc-trace-lib">${icon('stack')}Save to the shape library</button><button class="btn" data-act="vc-trace-svg">${icon('download')}Save as SVG</button><button class="btn" data-act="vc-trace-dxf">${icon('download')}Save as DXF</button>
      <div class="note help vc-wide">SVG and DXF files open in VCarve, Mozaik, SketchUp and most CAD and sign programs.</div></div></div>
      <div class="vcx-acts"><button class="btn" data-act="vc-trace-close">${icon('back')}Back to the sign</button></div></aside></div>`;
  requestAnimationFrame(() => {
    const cv = $('#vct-canvas'); if (!cv || !r.px) return;
    const W = r.px.w, H = r.px.h, k = Math.min(2, 1400 / Math.max(W, H)); cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.globalAlpha = 0.35; c.drawImage(t.im, 0, 0, cv.width, cv.height); c.globalAlpha = 1;
    // Loops are 1 tall around the middle of what was traced; back to picture pixels.
    const B = r.px.box, s = (B.h || 1) * k, ox = (B.x0 + B.x1) / 2 * k, oy = -(B.y0 + B.y1) / 2 * k;
    c.beginPath(); r.loops.forEach(l => l.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](ox + p.x * s, oy - p.y * s))); c.closePath();
    c.fillStyle = 'rgba(219,39,119,.55)'; c.fill('evenodd'); c.lineWidth = 1.2; c.strokeStyle = '#9d174d'; c.stroke();
  });
}
// The traced outlines in inches with the bottom left corner at 0,0, for files.
function vcTraceInches() { const t = ui.vcTrace, r = vcTraceNow(), h = +t.h || 6; return { loops: r.loops.map(l => l.map(p => ({ x: r3((p.x + r.bw / 2) * h * 1000) / 1000, y: r3((p.y + 0.5) * h * 1000) / 1000 }))), w: r.bw * h, h }; }
function vcSvgFile(loops, w, h, name) {
  const f = v => (Math.round(v * 10000) / 10000).toString();
  const d = loops.map(l => l.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(h - p.y)}`).join(' ') + ' Z').join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}in" height="${f(h)}in" viewBox="0 0 ${f(w)} ${f(h)}">\n<title>${esc(name)}</title>\n<path d="${d}" fill="#000" fill-rule="evenodd"/>\n</svg>\n`;
}
// A DXF in inches: one closed polyline per outline, which VCarve, CAD and CAM programs read.
function vcDxfFile(loops) {
  const o = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'], f = v => (Math.round(v * 10000) / 10000).toString();
  loops.forEach(l => { o.push('0', 'LWPOLYLINE', '8', 'VECTOR', '100', 'AcDbEntity', '100', 'AcDbPolyline', '90', String(l.length), '70', '1'); l.forEach(p => o.push('10', f(p.x), '20', f(p.y))); });
  o.push('0', 'ENDSEC', '0', 'EOF'); return o.join('\n') + '\n';
}
function vcTraceAct(a) {
  const t = ui.vcTrace; if (!t) return false;
  if (a === 'vc-trace-close') { ui.vcTrace = null; renderCarve(); return true; }
  const r = vcTraceNow(); if (!r.loops.length) { flash('Nothing traced yet. Move the dark cut-off.'); return true; }
  if (a === 'vc-trace-add') {
    if (!vcBoard()) { const nb = vcNewBoard(); nb.items = []; const h = +t.h || 6; nb.L = r3(Math.max(6, r.bw * h + 2)); nb.W = r3(h + 2); mutate(() => { (S.job.carves = S.job.carves || []).push(nb); ui.vcBoard = nb.id; }); }
    const sz = vcSize(vcBoard()), h = r3(Math.min(+t.h || 6, sz.W * 0.9, sz.L * 0.9 / (r.bw || 1))), it = { id: uid('vi'), kind: 'art', src: 'img', name: t.name, loops: vcRound4(r.loops), bw: r3(r.bw), bh: 1, th: r3(+t.th || r.th), invert: !!t.invert, h, angle: 0 };
    vcLastImg = { id: it.id, im: t.im }; ui.vcTrace = null; vcAddItem(it); flash(`Added ${t.name}${h < (+t.h || 6) ? `, made ${fmtLen(h, 1)} high to fit the board` : ''}`); return true;
  }
  if (a === 'vc-trace-lib') { const e = { id: uid('vs'), name: t.name, group: 'My designs', loops: vcRound4(r.loops), open: [], bw: r3(r.bw), h: r3(+t.h || 6), mode: 'carve' }; VC_LIB.items.push(e); vcLibSave(); flash(`Saved “${t.name}” to Libraries › V-carve shapes`); return true; }
  const v = vcTraceInches();
  if (a === 'vc-trace-svg') { saveFile(new Blob([vcSvgFile(v.loops, v.w, v.h, t.name)], { type: 'image/svg+xml' }), `${fileSafe(t.name) || 'traced'}.svg`, 'Cabinet Designer/Vectors'); return true; }
  if (a === 'vc-trace-dxf') { saveFile(new Blob([vcDxfFile(v.loops)], { type: 'application/dxf' }), `${fileSafe(t.name) || 'traced'}.dxf`, 'Cabinet Designer/Vectors'); return true; }
  return false;
}
document.addEventListener('change', ev => {
  const t = ev.target; if (!t.classList || !t.classList.contains('vct-in') || !ui.vcTrace) return;
  const k = t.dataset.k, T = ui.vcTrace;
  if (k === 'invert') T.invert = t.checked;
  else if (k === 'h') { const v = parseLen(t.value); if (isFinite(v) && v > 0) T.h = r3(v); else flash('Type a size, like 6 or 150mm.'); }
  else T[k] = +t.value;
  renderCarve();
});
document.addEventListener('input', ev => { const t = ev.target; if (t.classList && t.classList.contains('vct-in') && t.type === 'range') { const b = t.closest('label') && t.closest('label').querySelector('.vct-v'); if (b) b.textContent = t.value; } });
