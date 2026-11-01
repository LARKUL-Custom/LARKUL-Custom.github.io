/* ---------- Cabinet shapes: front, side and top outlines that change how the box is built ---------- */
// c.shape = { front, side, top }, each { pts, w, h } drawn in inches at the size w × h it was drawn for, and stretched with the cabinet.
// Front: x across from the left, y up from the floor. Side: x from the back (wall) to the front, y up. Top: x across, y out from the back.
const CAB_VIEWS = [['front', 'Front', 'Seen from the front: x across from the left, y up from the floor'], ['side', 'Side', 'Seen from the left end: x from the wall out to the front, y up'], ['top', 'Top', 'Seen from above: x across from the left, y out from the wall']];
const CAB_SHAPE_PRESETS = {
  front: [
    ['farmU', 'Farm sink U (top cut out between the sides)', (W, H) => [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: W - 3, y: H }, { x: W - 3, y: H - 10 }, { x: 3, y: H - 10 }, { x: 3, y: H }, { x: 0, y: H }]],
    ['valance', 'Arched bottom (valance)', (W, H) => [{ x: 0, y: 0, b: -Math.min(4, H / 6) }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }]],
  ],
  side: [
    ['farm', 'Farm sink notch (front top)', (D, H) => [{ x: 0, y: 0 }, { x: D, y: 0 }, { x: D, y: H - 10 }, { x: D - 3, y: H - 10 }, { x: D - 3, y: H }, { x: 0, y: H }]],
    ['slope', 'Sloped top (lower at the front)', (D, H) => [{ x: 0, y: 0 }, { x: D, y: 0 }, { x: D, y: H - 6 }, { x: 0, y: H }]],
    ['round', 'Rounded front top corner', (D, H) => [{ x: 0, y: 0 }, { x: D, y: 0 }, { x: D, y: H, r: Math.min(6, D / 3) }, { x: 0, y: H }]],
  ],
  top: [
    ['clipL', 'Angled left end', (W, D) => [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: Math.min(W / 2, D / 2), y: D }, { x: 0, y: D / 2 }]],
    ['clipR', 'Angled right end', (W, D) => [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D / 2 }, { x: W - Math.min(W / 2, D / 2), y: D }, { x: 0, y: D }]],
    ['bow', 'Bow front', (W, D) => [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D - 2, b: 2 }, { x: 0, y: D - 2 }]],
  ],
};
const cabShapeDims = (c, v) => v === 'front' ? [c.w, c.h] : v === 'side' ? [c.d, c.h] : [c.w, c.d];
const hasCabShape = c => !!c.shape && CAB_VIEWS.some(([v]) => ((c.shape[v] || {}).pts || []).length);
// The drawn points stretched to the cabinet's size now.
function cabShapePts(c, v) {
  const s = (c.shape || {})[v]; if (!s || !(s.pts || []).length) return null;
  const [W, H] = cabShapeDims(c, v), kx = s.w > 0 ? W / s.w : 1, ky = s.h > 0 ? H / s.h : 1;
  return s.pts.map(p => ({ ...p, x: p.x * kx, y: p.y * ky }));
}
// The outline (rounds and bulges turned into points), or the plain rectangle.
function cabOutline(c, v) {
  const pts = cabShapePts(c, v), [W, H] = cabShapeDims(c, v);
  return pts ? shapeOutline(pts) : [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
}
// Where a polygon crosses the line x = v (axis 'x', giving y ranges) or y = v (axis 'y', giving x ranges), inside spans in order.
function polySpans(o, axis, v) {
  const hits = [];
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length], pa = axis === 'x' ? a.x : a.y, pb = axis === 'x' ? b.x : b.y, qa = axis === 'x' ? a.y : a.x, qb = axis === 'x' ? b.y : b.x;
    if ((pa <= v && pb > v) || (pb <= v && pa > v)) hits.push(qa + (v - pa) / (pb - pa) * (qb - qa));
  }
  hits.sort((a, b) => a - b);
  const out = []; for (let i = 0; i + 1 < hits.length; i += 2) if (hits[i + 1] - hits[i] > 1e-6) out.push([hits[i], hits[i + 1]]);
  return out;
}
const longest = spans => spans.reduce((m, s) => !m || s[1] - s[0] > m[1] - m[0] ? s : m, null);
// Overlap of span lists with one range.
const spansIn = (spans, a, b) => spans.map(([s0, s1]) => [Math.max(s0, a), Math.min(s1, b)]).filter(([s0, s1]) => s1 - s0 > 1e-6);
// Clip a polygon to a box (Sutherland–Hodgman; the box is convex, so any polygon clips cleanly).
function clipPoly(o, x0, x1, y0, y1) {
  const edge = (pts, inside, cut) => { const out = []; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length], pi = inside(p), qi = inside(q); if (pi) out.push(p); if (pi !== qi) out.push(cut(p, q)); }); return out; };
  const lerpX = (p, q, x) => ({ x, y: p.y + (q.y - p.y) * (x - p.x) / (q.x - p.x) }), lerpY = (p, q, y) => ({ x: p.x + (q.x - p.x) * (y - p.y) / (q.y - p.y), y });
  let r = o;
  r = edge(r, p => p.x >= x0 - 1e-9, (p, q) => lerpX(p, q, x0)); if (!r.length) return r;
  r = edge(r, p => p.x <= x1 + 1e-9, (p, q) => lerpX(p, q, x1)); if (!r.length) return r;
  r = edge(r, p => p.y >= y0 - 1e-9, (p, q) => lerpY(p, q, y0)); if (!r.length) return r;
  r = edge(r, p => p.y <= y1 + 1e-9, (p, q) => lerpY(p, q, y1));
  return r.map(p => ({ x: r3(p.x), y: r3(p.y) })).filter((p, i, a) => { const q = a[(i + 1) % a.length]; return Math.abs(p.x - q.x) > 1e-4 || Math.abs(p.y - q.y) > 1e-4; });
}
const polyBox = o => { const xs = o.map(p => p.x), ys = o.map(p => p.y); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
const isRect = (o, b) => o.length === 4 && o.every(p => (Math.abs(p.x - b.x0) < 1e-3 || Math.abs(p.x - b.x1) < 1e-3) && (Math.abs(p.y - b.y0) < 1e-3 || Math.abs(p.y - b.y1) < 1e-3));
// The shaped box in cabinet coordinates (x across, y up, z from the back): each panel's outline, for the cut list and 3D.
// sides: [{ x0, poly in (z, y) }]; bottom, top, stretchers: [{ y0, poly in (x, z) }]; back: poly in (x, y).
function cabShapedBox(c, p, t, bt, tk, sideBottom, dd = 0) {
  const bottomY = tk;
  const W = c.w, H = c.h, D = c.d, fo = cabOutline(c, 'front'), so = cabOutline(c, 'side'), to = cabOutline(c, 'top'), sw = p.stretcherWidth, warn = [];
  const out = { sides: [], bottom: [], top: [], stretchers: [], back: null, warn };
  // Sides: the side outline, cut to how deep the top shape is at that end and how tall the front shape is there.
  [['L', 0], ['R', W - t]].forEach(([k, x0]) => {
    const xc = x0 + t / 2, dz = longest(polySpans(to, 'x', xc)), hy = longest(polySpans(fo, 'x', xc));
    if (!dz || !hy) { warn.push(`The ${k === 'L' ? 'left' : 'right'} side is cut away by the shape.`); return; }
    const poly = clipPoly(so, dz[0], dz[1], Math.max(sideBottom, hy[0]), hy[1]);
    if (poly.length >= 3) out.sides.push({ k, x0, poly });
  });
  // A panel lying flat at height y: across, where the front shape is solid there; deep, where the side shape is solid there; cut to the top shape.
  const flat = (y, list, zLim, full) => {
    const xs = full ? [[t, W - t]] : spansIn(polySpans(fo, 'y', y), t, W - t), zs = longest(polySpans(so, 'y', y)); if (!zs) return;
    const z0 = Math.max(zs[0], zLim ? zLim[0] : -1e9), z1 = Math.min(zs[1], zLim ? zLim[1] : 1e9); if (z1 - z0 < 0.5) return;
    xs.forEach(([a, b]) => { if (b - a < 3) return; const poly = clipPoly(to, a, b, z0, z1); if (poly.length >= 3) list.push({ y0: y - t / 2, poly }); });
  };
  flat(bottomY + t / 2, out.bottom);
  if ((c.construction || {}).top === 'stretchers') {
    // Front stretcher sits at the front of what is left at the top (behind a farm sink apron), and pieces under 3" are left out; the rear one stays at the back, full width.
    const zs = longest(polySpans(so, 'y', H - t / 2));
    if (zs) {
      const before = out.stretchers.length;
      flat(H - t / 2, out.stretchers, [Math.max(zs[0], zs[1] - sw), zs[1]]);
      out.stretchers.slice(before).forEach(s => { s.name = 'Front stretcher'; });
      const rb = p.backInset + bt, n0 = out.stretchers.length;
      flat(H - t / 2, out.stretchers, [rb, rb + sw], true);
      out.stretchers.slice(n0).forEach(s => { s.name = 'Rear stretcher'; });
    }
  } else flat(H - t / 2, out.top);
  if (!out.bottom.length) warn.push('The shape leaves no room for a bottom.');
  // Back: the front shape inside the box.
  const back = clipPoly(fo, t - dd, W - t + dd, bottomY + t - dd, H - t + dd); if (back.length >= 3) out.back = back;
  return out;
}

/* ---------- Editing a cabinet shape ---------- */
// Open the shape editor on one view of a cabinet; Save shape brings it back.
function editCabShape(c, v) {
  const [W, H] = cabShapeDims(c, v), pts = cabShapePts(c, v);
  ui.desMode = 'shape'; ui.shapeSel = null;
  S.shapeDesign = { sourceLib: null, editShape: null, forCab: { id: c.id, view: v }, name: `${LBL[c.id] || c.name} ${v}`, plane: v === 'top' ? 'flat' : 'upright', pts: clone(pts || [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }]), thick: 0.75, mat: S.materials[0].id };
}
// Small drawing of one view, with the cabinet's plain box dashed behind it.
function cabShapeSVG(c, v, size = 150) {
  const [W, H] = cabShapeDims(c, v), o = cabOutline(c, v), k = Math.max(W, H), pad = k * 0.06, flip = v !== 'top';
  const Y = y => flip ? H - y : y;
  return `<svg viewBox="${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}" style="max-height:${size}px;max-width:100%" aria-hidden="true"><rect class="cs-box nss" x="0" y="0" width="${W}" height="${H}"/><polygon class="cs-shape nss" points="${o.map(p => `${r3(p.x)},${r3(Y(p.y))}`).join(' ')}"/></svg>`;
}
function cabShapeTab(c) {
  const sh = c.shape || {};
  return `<div class="note">Change the cabinet's outline from the front, the side or the top. The sides, bottom, top, stretchers and back are cut to it in the cut list, the CNC file and 3D, like a U in the front for a farm sink.</div>
  <div class="cs-grid">${CAB_VIEWS.map(([v, l, hint]) => {
    const on = !!(sh[v] && (sh[v].pts || []).length);
    return `<div class="psec box cs-card">${secHead(v === 'top' ? 'plan' : v === 'side' ? 'ends' : 'face', `${l} shape`, on ? 'violet' : 'slate')}
      <div class="cs-prev">${cabShapeSVG(c, v)}</div><div class="note">${hint}</div>
      <label class="f wide"><span>Start from</span><select class="cs-preset" data-id="${c.id}:${v}" aria-label="${l} shape preset"><option value="">${on ? 'Custom' : 'Standard box'}</option>${CAB_SHAPE_PRESETS[v].map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></label>
      <div class="row-actions"><button class="btn sm primary" data-act="cab-shape-edit" data-id="${c.id}:${v}">${icon('ruler')}Edit in the shape editor</button>${v === 'top' ? `<button class="btn sm" data-act="te-start" data-id="${c.id}">Edit on the floor plan</button>` : ''}${on ? `<button class="btn sm" data-act="cab-shape-clear" data-id="${c.id}:${v}">Back to a plain box</button>` : ''}</div>
      ${v === 'top' && on ? cabEdgeTypes(c) : ''}</div>`;
  }).join('')}</div>`;
}

document.addEventListener('change', e => {
  const el = e.target.closest && e.target.closest('select.cs-preset'); if (!el || !el.value) return;
  const [id, v] = el.dataset.id.split(':'), c = cab(id), pr = c && (CAB_SHAPE_PRESETS[v] || []).find(x => x[0] === el.value); if (!pr) return;
  const [W, H] = cabShapeDims(c, v);
  mutate(() => { c.shape = c.shape || {}; c.shape[v] = { pts: pr[2](W, H).map(p => ({ ...p, x: r3(p.x), y: r3(p.y) })), w: W, h: H, preset: pr[0] }; });
  if (ui.quick) renderQuick();
});

/* ---------- Cut list and 3D ---------- */
// Replace the plain box panels with shaped ones: the sides, bottom, top or stretchers and back follow the outlines.
function applyCabShape(c, parts, k) {
  const { p, t, bt, tk, sh, D, dd, warn } = k, box = cabShapedBox(c, p, t, bt, tk, sh, dd), mine = q => q.cabId === c.id;
  warn.push(...box.warn);
  const take = name => { const i = parts.findIndex(q => mine(q) && q.name === name); return i < 0 ? null : parts.splice(i, 1)[0]; };
  const insert = (q, at) => parts.splice(at, 0, q);
  // A flat panel (bottom, top, stretcher) from its outline in (x across, z from the back); its ops are measured from the front edge.
  const flatPart = (src, pc, name) => {
    const b = polyBox(pc.poly), L = r3(b.x1 - b.x0), W = r3(b.y1 - b.y0), dy = D - b.y1, dx = b.x0 - t;
    const ops = src.ops.map(o => ({ ...o, ...(o.x1 !== undefined ? { x1: 0, x2: L } : {}), ...(o.y1 !== undefined ? { y1: r3(o.y1 - dy), y2: r3(o.y2 - dy) } : {}), ...(o.x !== undefined ? { x: r3(o.x - dx) } : {}), ...(o.y !== undefined && o.y1 === undefined ? { y: r3(o.y - dy) } : {}) }))
      .filter(o => (o.y1 === undefined || (o.y1 > 0 && o.y1 < W)) && (o.y === undefined || (o.y > 0 && o.y < W && o.x > 0 && o.x < L)));
    return { ...src, name, L, W, ops, outline: isRect(pc.poly, b) ? undefined : pc.poly.map(q => ({ x: r3(q.x - b.x0), y: r3(q.y - b.y0) })) };
  };
  // Sides: outline in (z from the back, y up); part length runs up from the bottom of the side, width across the depth.
  ['Left side', 'Right side'].forEach((name, i) => {
    const at = parts.findIndex(q => mine(q) && q.name === name), src = take(name); if (!src) return;
    const pc = box.sides.find(s => s.k === (i ? 'R' : 'L')); if (!pc) return;
    const b = polyBox(pc.poly), L = r3(b.y1 - b.y0), W = r3(b.x1 - b.x0), dx = b.y0 - sh, dy = D - b.x1;
    const inside = (x, y) => inPoly({ x: D - (y + dy), y: x + dx + sh }, pc.poly);
    const shaped = !isRect(pc.poly, b);
    if (shaped && src.ops.some(o => o.type === 'notch')) warn.push(`${name}: the toe kick notch is not cut on a shaped side. Use cabinet feet or cut it by hand.`);
    const ops = src.ops.filter(o => !(shaped && o.type === 'notch')).map(o => ({ ...o, ...(o.x !== undefined ? { x: r3(o.x - dx) } : {}), ...(o.y !== undefined ? { y: r3(o.y - dy) } : {}), ...(o.x1 !== undefined ? { x1: r3(Math.max(0, o.x1 - dx)), x2: r3(Math.min(L, o.x2 - dx)) } : {}), ...(o.y1 !== undefined ? { y1: r3(o.y1 - dy), y2: r3(o.y2 - dy) } : {}) }))
      .filter(o => o.x === undefined || o.y === undefined || inside(o.x, o.y));
    insert({ ...src, L, W, ops, outline: shaped ? pc.poly.map(q => ({ x: r3(q.y - b.y0), y: r3(q.x - b.x0) })) : undefined }, at);
  });
  // Bottom, top and stretchers: one part per piece the shape leaves.
  const flats = (names, list) => names.forEach(name => {
    const at = parts.findIndex(q => mine(q) && q.name === name), src = take(name); if (!src) return;
    const mine2 = list.filter(pc => !pc.name || pc.name === name);
    mine2.forEach((pc, j) => insert(flatPart(src, pc, mine2.length > 1 ? `${name} ${j + 1}` : name), at + j));
  });
  flats(['Bottom'], box.bottom); flats(['Top'], box.top); flats(['Front stretcher', 'Rear stretcher'], box.stretchers);
  // Back: outline in (x across, y up); length runs up, width across.
  const at = parts.findIndex(q => mine(q) && q.name === 'Back'), src = take('Back');
  if (src && box.back) {
    const b = polyBox(box.back);
    insert({ ...src, L: r3(b.y1 - b.y0), W: r3(b.x1 - b.x0), outline: isRect(box.back, b) ? undefined : box.back.map(q => ({ x: r3(q.y - b.y0), y: r3(q.x - b.x0) })) }, at);
  }
}
// The shaped box in 3D: each outline pushed out to its panel's thickness.
function cabShape3d(c, p, t, bt, tk, sh, cmM, bmM, add) {
  const box = cabShapedBox(c, p, t, bt, tk, sh);
  const ext = (poly, depth, m) => { const g = new THREE.ExtrudeGeometry(new THREE.Shape(poly.map(q => new THREE.Vector2(q.x, q.y))), { depth, bevelEnabled: false, curveSegments: 6 }), me = new THREE.Mesh(g, m); if (!R3) me.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), edgeMat3())); return me; };
  // Sides: outline in (z, y), pushed across by t. Turned so the outline's x runs toward the front.
  box.sides.forEach(s => { const me = ext(s.poly, t, cmM); me.rotation.y = -Math.PI / 2; me.position.set(s.x0 + t, 0, 0); add(me); });
  // Flat panels: outline in (x, z), pushed up by t.
  [...box.bottom, ...box.top, ...box.stretchers].forEach(f => { const me = ext(f.poly, t, cmM); me.rotation.x = Math.PI / 2; me.position.set(0, f.y0 + t, 0); add(me); });
  if (box.back) { const me = ext(box.back, bt, bmM); me.position.set(0, 0, p.backInset); add(me); }
}

/* ---------- Edge types on a top shape (Mozaik's shaped-cabinet edges) ----------
   Each edge of the top shape (edge i runs from point i to point i+1) can say what closes it: a finished or unfinished
   panel, an applied door, a back, or nothing. Automatic keeps the plain box's own sides, back and fronts. */
const EDGE_TYPES = [['', 'Automatic (the box\'s own parts)'], ['fin', 'Finished end panel'], ['unfin', 'Unfinished end panel'], ['door', 'Applied door'], ['back', 'Back panel'], ['open', 'Open (nothing)']];
const edgeTypeName = v => (EDGE_TYPES.find(x => x[0] === (v || '')) || EDGE_TYPES[0])[1];
// The top shape's edges at the cabinet's size now: from, to, length and the outward normal (x across, y out from the wall).
function cabTopEdges(c) {
  const pts = cabShapePts(c, 'top'); if (!pts) return [];
  const ccw = shapeArea2(pts) > 0, types = ((c.shape.top || {}).edges) || [];
  return pts.map((a, i) => { const b = pts[(i + 1) % pts.length], L = Math.hypot(b.x - a.x, b.y - a.y), n = edgeOut(a, b, ccw); return { i, a, b, L, n, type: types[i] || '', curved: !!a.b }; });
}
// Edges the plain box does not already close: off the box lines, or cutting across it.
const onBoxLine = (c, e) => { const W = c.w, D = c.d, eq = (u, v) => Math.abs(u - v) < 0.05; return (eq(e.a.x, e.b.x) && (eq(e.a.x, 0) || eq(e.a.x, W))) || (eq(e.a.y, e.b.y) && (eq(e.a.y, 0) || eq(e.a.y, D))); };
function cabEdgeTypes(c) {
  const E = cabTopEdges(c);
  return `<div class="eyebrow">Edges</div><table class="t cs-edges"><tbody>${E.map(e => `<tr${!onBoxLine(c, e) && !e.type ? ' class="warnrow"' : ''}><td>Edge ${e.i + 1}→${(e.i + 1) % E.length + 1}</td><td class="n">${fmtLen(e.L, 1)}</td><td><select class="cs-edge" data-id="${c.id}:${e.i}" aria-label="Edge ${e.i + 1} type">${EDGE_TYPES.map(([v, l]) => `<option value="${v}"${e.type === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>
    ${E.some(e => !onBoxLine(c, e) && !e.type) ? '<div class="note">Highlighted edges are open now. Give them a panel, a door or a back.</div>' : ''}`;
}
function setEdgeType(c, i, v) {
  mutate(() => { const t = c.shape.top; t.edges = t.edges || []; while (t.edges.length < t.pts.length) t.edges.push(''); t.edges[i] = v || ''; if (t.edges.every(x => !x)) delete t.edges; });
}
document.addEventListener('change', e => {
  const el = e.target.closest && e.target.closest('select.cs-edge'); if (!el) return;
  const [id, i] = el.dataset.id.split(':'), c = cab(id); if (!c || !(c.shape || {}).top) return;
  setEdgeType(c, +i, el.value); if (ui.quick) renderQuick();
});
// Panels along typed edges, for the cut list. They stand from the bottom of the sides to the top of the cabinet.
function edgeParts(c, parts, k, part, cm) {
  const E = cabTopEdges(c).filter(e => e.type && e.type !== 'open'); if (!E.length) return;
  const { t, bt, sh, warn } = k, Hs = r3(c.h - sh), mt = cabMatT(cabSet(c, 'cabMatT')), bm = mat(mt.back) || cm;
  const fin = mat(panelStyle(cabSet(c, 'panelStyle')).mat) || cm, door = parts.find(q => q.cabId === c.id && /^Door/.test(q.name)), dm = door ? mat(door.mat) || cm : fin;
  E.forEach(e => {
    if (e.curved) warn.push(`Edge ${e.i + 1} is curved; its ${edgeTypeName(e.type).toLowerCase()} is listed flat at the straight length.`);
    const L = r3(e.L), nm = `Edge ${e.i + 1} `;
    if (e.type === 'door') { const q = part(nm + 'door', dm, r3(Hs - 0.125), r3(L - 0.125), { kind: 'door' }); q.edgeType = 'door'; }
    else if (e.type === 'back') { const q = part(nm + 'back', bm, Hs, L, { kind: 'back' }); q.edgeType = 'back'; }
    else { const q = part(nm + (e.type === 'fin' ? 'finished panel' : 'panel'), e.type === 'fin' ? fin : cm, Hs, L, { kind: 'side' }); q.edgeType = e.type; }
  });
}
// The same panels in 3D: each stands just inside its edge.
function edgeParts3d(c, add, t, sh, mats) {
  cabTopEdges(c).filter(e => e.type && e.type !== 'open').forEach(e => {
    const th = e.type === 'door' ? 0.75 : e.type === 'back' ? 0.25 : t, h = c.h - sh, m = e.type === 'door' ? mats.door : e.type === 'back' ? mats.back : mats.box;
    const inset = e.type === 'door' ? -th / 2 : th / 2, mx = (e.a.x + e.b.x) / 2 - e.n.x * inset, mz = (e.a.y + e.b.y) / 2 - e.n.y * inset;
    const me = box3(e.L, h, th, m, mx, sh + h / 2, mz); me.rotation.y = -Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x); if (e.type === 'door') me.userData.layer = 'fronts'; add(me);
  });
}

/* ---------- Editing the top shape right on the floor plan ---------- */
// Points in the cabinet's frame (x across from its left, y out from the wall) at its size now.
function topEditStart(c) {
  const pts = cabShapePts(c, 'top') || [{ x: 0, y: 0 }, { x: c.w, y: 0 }, { x: c.w, y: c.d }, { x: 0, y: c.d }];
  const edges = ((c.shape || {}).top || {}).edges;
  mutate(() => { c.shape = c.shape || {}; c.shape.top = { pts: pts.map(p => ({ ...p, x: r3(p.x), y: r3(p.y) })), w: c.w, h: c.d, ...(edges ? { edges } : {}) }; });
  ui.topEdit = c.id; select({ type: 'cab', id: c.id });
}
const tePlan = (c, p) => cabPt(c, c.side === 1 ? p.x : c.w - p.x, p.y);
function teLocal(c, p) {
  const w = wall(c.wall), g = wg(w), a = (p.x - w.x1) * g.u.x + (p.y - w.y1) * g.u.y - c.off;
  const b = ((p.x - w.x1) * g.n.x + (p.y - w.y1) * g.n.y) * c.side - w.thick / 2 - (c.outset || 0);
  return { x: c.side === 1 ? a : c.w - a, y: b };
}
function topEditSVG() {
  const c = ui.topEdit && cab(ui.topEdit); if (!c || !(c.shape || {}).top) return '';
  const pts = c.shape.top.pts, k = ui.px, r = rzR() * k * 0.7, P = pts.map(p => tePlan(c, p)), types = c.shape.top.edges || [];
  let s = '';
  P.forEach((a, i) => { const b = P[(i + 1) % P.length]; s += `<line class="te-edge nss${types[i] ? ' typed' : ''}" data-te="e${i}" x1="${r3(a.x)}" y1="${r3(a.y)}" x2="${r3(b.x)}" y2="${r3(b.y)}"><title>Edge ${i + 1}: ${esc(edgeTypeName(types[i]))}. Right-click for more.</title></line>`; });
  P.forEach((a, i) => { const b = P[(i + 1) % P.length], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; s += `<g class="te-add" data-te="m${i}"><title>Add a point here</title><circle cx="${r3(m.x)}" cy="${r3(m.y)}" r="${r3(r * 0.75)}"/><path class="nss" d="M${r3(m.x - r * 0.45)} ${r3(m.y)}H${r3(m.x + r * 0.45)}M${r3(m.x)} ${r3(m.y - r * 0.45)}V${r3(m.y + r * 0.45)}"/></g>`; });
  P.forEach((a, i) => { s += `<g class="te-node" data-te="n${i}"><title>Point ${i + 1}: drag to move, right-click for more</title><circle class="nss" cx="${r3(a.x)}" cy="${r3(a.y)}" r="${r3(r)}"/><text x="${r3(a.x)}" y="${r3(a.y + r * 0.4)}" font-size="${r3(r * 1.1)}" text-anchor="middle">${i + 1}</text></g>`; });
  return s;
}
function teSplit(c, i, at) {
  const t = c.shape.top, a = t.pts[i], b = t.pts[(i + 1) % t.pts.length], p = at || { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // The new point sits on the edge, under the click.
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1, u = Math.max(0.05, Math.min(0.95, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  mutate(() => { t.pts.splice(i + 1, 0, { x: r3(a.x + dx * u), y: r3(a.y + dy * u) }); if (a.b) { delete a.b; } if (t.edges) t.edges.splice(i + 1, 0, t.edges[i] || ''); });
}
function topEditDown(key, e, p) {
  const c = cab(ui.topEdit); if (!c) return false; const kind = key[0], i = +key.slice(1);
  if (e.button === 2) { showTopCtx(c, kind, i, e.clientX, e.clientY, teLocal(c, p)); return true; }
  if (e.button !== 0) return false;
  if (kind === 'n') { ui.drag = { mode: 'topnode', id: c.id, i, snap: JSON.stringify(S), live: false }; return true; }
  if (kind === 'm') { teSplit(c, i); return true; }
  return true;
}
function topEditMove(d, p, fine) {
  const c = cab(d.id); if (!c) return; const t = c.shape.top, q = teLocal(c, p), step = fine ? 0.0625 : 0.5;
  // Snaps to the box lines and to the other points' lines when close.
  const near = 6 * ui.px, xs = [0, c.w, ...t.pts.filter((_, j) => j !== d.i).map(z => z.x)], ys = [0, c.d, ...t.pts.filter((_, j) => j !== d.i).map(z => z.y)];
  const sn = (v, list) => { const hit = list.find(x => Math.abs(x - v) < near); return hit !== undefined ? hit : Math.round(v / step) * step; };
  t.pts[d.i].x = r3(sn(q.x, xs)); t.pts[d.i].y = r3(sn(q.y, ys));
}
function showTopCtx(c, kind, i, x, y, at) {
  const m = $('#ctxmenu'), t = c.shape.top, n = t.pts.length, b = (act, label, id = i, extra = '') => `<button role="menuitem" data-act="${act}" data-id="${id}"${extra}>${label}</button>`;
  let h = `<div class="ctxhead">${esc(LBL[c.id] || '')} top shape · ${kind === 'n' ? `point ${i + 1}` : `edge ${i + 1}→${(i + 1) % n + 1}`}</div>`;
  if (kind === 'n') h += b('te-del', 'Delete this point', i, n <= 3 ? ' disabled' : '');
  else {
    ui.teAt = at;
    h += b('te-split', 'Split the edge here') + `<div class="ctxrow"><label>Extend edge out by <input class="te-ext" data-id="${i}" value="1" aria-label="Extend the edge out by"></label>${b('te-ext', 'Apply')}</div>`;
    h += `<div class="ctxhead">Edge type</div>` + EDGE_TYPES.map(([v, l]) => b('te-type', ((t.edges || [])[i] || '') === v ? '✓ ' + esc(l) : esc(l), `${i}:${v}`)).join('');
  }
  h += b('te-done', 'Done editing the top');
  m.innerHTML = h; m.hidden = false; ui.teCtxAt = Date.now();
  const r = m.getBoundingClientRect(); m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
function topEditAct(a, id) {
  if (a === 'te-start') { const c = cab(id || (ui.sel && ui.sel.id)); if (!c) return true; if (ui.quick && typeof closeQuick === 'function') closeQuick(); if (typeof setView === 'function' && ui.view3dOnly) setView('plan'); topEditStart(c); render(); return true; }
  const c = cab(ui.topEdit); if (!c && a !== 'te-done') return true;
  switch (a) {
    case 'te-done': ui.topEdit = null; hideCtx(); render(); return true;
    case 'te-del': mutate(() => { const t = c.shape.top; if (t.pts.length > 3) { t.pts.splice(+id, 1); if (t.edges) t.edges.splice(+id, 1); } }); return true;
    case 'te-split': teSplit(c, +id, ui.teAt); return true;
    case 'te-ext': {
      const el = document.querySelector('#ctxmenu .te-ext'), v = el ? parseLen(el.value) : NaN; hideCtx(); if (!isFinite(v) || !v) return true;
      // The edge moves straight out by the amount; the edges beside it stretch to meet it.
      // Each end slides along the edge next to it, so those edges keep their direction (a wall-side edge stays on the wall).
      mutate(() => {
        const t = c.shape.top, n2 = t.pts.length, i = +id, E = cabTopEdges(c)[i], A = t.pts[i], B = t.pts[(i + 1) % n2], Pv = t.pts[(i - 1 + n2) % n2], Nx = t.pts[(i + 2) % n2];
        const slide = (P, from) => { const dx = P.x - from.x, dy = P.y - from.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, k = ux * E.n.x + uy * E.n.y; return Math.abs(k) > 0.05 ? { x: P.x + ux * v / k, y: P.y + uy * v / k } : { x: P.x + E.n.x * v, y: P.y + E.n.y * v }; };
        const A2 = slide(A, Pv), B2 = slide(B, Nx); A.x = r3(A2.x); A.y = r3(A2.y); B.x = r3(B2.x); B.y = r3(B2.y);
      });
      return true;
    }
    case 'te-type': { const [i, v] = id.split(':'); setEdgeType(c, +i, v); hideCtx(); return true; }
  }
  return false;
}
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('te-ext')) { e.preventDefault(); topEditAct('te-ext', e.target.dataset.id); } });
