/* Cabinet Designer: interior splits and picking interior parts, like Mozaik's interior editor (0.63.74).
 * Ayden 2026-11-25: "in mozaik i can select every part in the interior or split openings and add parts, when parts are
 * selected you can change them to other types or just remove them".
 *
 * An opening behind a door or open row can be split inside, apart from the face:
 *   row.inner = { dir: 'h' | 'v', parts: [{ s?, k?, inner? }, ...], types?: ['fixed' | 'adj', ...] }
 * 'h' stacks its parts top to bottom with a fixed shelf between each (types[j] 'adj' makes that one an adjustable shelf
 * at that height); 'v' puts them side by side, left to right, with a partition between each. s is a part's height or
 * width inside (blank = shares what is left), k its adjustable shelf count (blank = follows its height like a
 * side-by-side face section), inner a split inside it. Keys: "row/part/part..." ("2/0/1").
 * Interior parts are picked with keys: adj|<opening>|<j> (adjustable shelf j from the bottom), bd|<node>|<j> (the split
 * part under/right of part j), stop|<row> (fixed shelf or stretcher under a row), cs|<cell>|<j> (shelf in a face
 * section), ins|<k> (insert), div (vertical divider).
 */

/* ---------- Model ---------- */
const IN_SEP = '/';
// A row whose inside can be split: a plain door or open row (not side by side, not a microwave opening).
function inRowOK(c, r) {
  return !!r && (r.type === 'door' || r.type === 'open') && !rowCols(c, r) && !r.mw && !faceFrame(c) && !angledCorner(c) && !blindCorner(c) && !hasCabShape(c) && !(cabTopShape(c) || {}).edges;
}
// The node a key names (the row itself, or a part of a split), or null.
function inNode(c, key) {
  const [ri, ...path] = String(key).split(IN_SEP).map(Number); let n = (c.rows || [])[ri];
  for (const j of path) { n = n && n.inner && n.inner.parts[j]; if (!n) return null; }
  return n || null;
}
const inParentKey = key => String(key).split(IN_SEP).slice(0, -1).join(IN_SEP);
const inIsInner = key => String(key).includes(IN_SEP);
// The label of an inside opening: the face letter with the part numbers, "A1", "A1.2".
function inLabel(c, key, L) {
  L = L || faceLetters(c); const [ri, ...path] = String(key).split(IN_SEP);
  return (L[ri] || String(+ri + 1)) + (path.length ? path.map(j => +j + 1).join('.') : '');
}
// Sizes of n parts sharing total (t between each already taken off): set sizes kept, the rest share what is left.
function inSizes(parts, total) {
  const set = parts.map(q => +q.s > 0 ? +q.s : 0), free = parts.filter((q, j) => !set[j]).length, used = set.reduce((a, b) => a + b, 0);
  if (!free) return set.map(v => v * total / (used || 1));
  const each = Math.max(0.5, (total - used) / free);
  return set.map(v => v || each);
}
// The automatic shelf count of an inside opening (as a side-by-side face section: as many as keep the gaps at least the
// minimum shelf spacing, else one when it is taller than 20").
function inAutoK(p, t, h) { const gap = +p.shelfMinSep; return gap > 0 ? Math.max(0, Math.floor((h - gap) / (gap + t) + 1e-6)) : h > 20 ? 1 : 0; }

/* ---------- Layout (called by interiorLayout in build.js) ---------- */
// The split openings: leaf openings with their shelves, the fixed or adjustable shelves between stacked parts and the
// partitions between side-by-side parts, all in cabinet coordinates. Null when no opening is split.
function innerTree(c, p, lay, t) {
  const rows = c.rows || []; if (!rows.some(r => r.inner)) return null;
  const out = { rows: [], zones: [], shelves: [], parts: [] };
  const walk = (node, key, x0, x1, z0, z1, depth) => {
    const sp = node.inner, n = sp && Array.isArray(sp.parts) ? sp.parts.length : 0;
    if (n < 2 || depth > 6) { const h = z1 - z0, k = node.k !== undefined && node.k !== '' ? Math.max(0, node.k | 0) : inAutoK(p, t, h); out.zones.push(Object.assign([r3(z0), r3(z1)], { key, x0: r3(x0), x1: r3(x1), k })); return; }
    if (sp.dir === 'v') {
      const ws = inSizes(sp.parts, x1 - x0 - (n - 1) * t); let x = x0;
      sp.parts.forEach((q, j) => {
        walk(q, key + IN_SEP + j, x, x + ws[j], z0, z1, depth + 1); x += ws[j];
        if (j < n - 1) { out.parts.push({ key, j, x: r3(x), z0: r3(z0), z1: r3(z1) }); x += t; }
      });
    } else {
      const hs = inSizes(sp.parts, z1 - z0 - (n - 1) * t); let z = z1;
      sp.parts.forEach((q, j) => {
        walk(q, key + IN_SEP + j, x0, x1, z - hs[j], z, depth + 1); z -= hs[j];
        if (j < n - 1) { z -= t; out.shelves.push({ key, j, x0: r3(x0), x1: r3(x1), z: r3(z), adj: (sp.types || [])[j] === 'adj' }); }
      });
    }
  };
  lay.zones.forEach(z => {
    const r = rows[z.row]; if (z.row == null || !r || !r.inner || !inRowOK(c, r)) return;
    out.rows.push(z.row); walk(r, String(z.row), lay.x0, lay.x0 + lay.inW, z[0], z[1], 0);
  });
  return out.rows.length ? out : null;
}
// Adjustable shelf heights (bottom face) in an inside opening.
// Where an opening's adjustable shelves are wanted (even spread); with p, where they are drawn: resting on the pins
// drilled for them (pinRest in build.js, 0.64.19).
const inLeafShelves = (zn, p) => Array.from({ length: zn.k }, (_, i) => { const w = r3(zn[0] + (zn[1] - zn[0]) * (i + 1) / (zn.k + 1)); return p ? pinRest(p, zn[0], zn[1], w) : w; });

/* ---------- Cut list (called by buildParts in build.js) ---------- */
// A split part's name: the two openings it is between, "B1/B2".
const inBetween = (c, q, L) => `${inLabel(c, q.key + IN_SEP + q.j, L)}/${inLabel(c, q.key + IN_SEP + (q.j + 1), L)}`;
function innerParts(c, x) {
  const { part, p, t, cm, sm, inD, lay, leftOps, rightOps, pin, plateZones, addB } = x, inr = lay.inner, L = faceLetters(c);
  const xR = lay.x0 + lay.inW, out = { parts: [], shelves: [] };
  inr.parts.forEach(q => {
    const pt = part(`Partition (${inBetween(c, q, L)})`, cm, r3(q.z1 - q.z0), r3(inD - 0.0625), { kind: 'divider', ops: [] });
    Object.defineProperty(pt, 'inq', { value: { x: q.x, z0: q.z0 }, enumerable: false });
    out.parts.push({ ...q, pt });
  });
  inr.shelves.filter(q => !q.adj).forEach(q => {
    const pt = part(`Fixed shelf (${inBetween(c, q, L)})`, sm, r3(q.x1 - q.x0), Math.max(1, r3(inD - 0.0625)), { kind: 'shelf' });
    Object.defineProperty(pt, 'inq', { value: { x0: q.x0, z: q.z }, enumerable: false });
    out.shelves.push({ ...q, pt });
  });
  // The upright each side of an opening: a cabinet side (its pins go with the side's), or a partition.
  const vert = (xx, right) => {
    if (!right && Math.abs(xx - lay.x0) < 0.01) return { ops: leftOps, face: 'inside' };
    if (right && Math.abs(xx - xR) < 0.01) return { ops: rightOps, face: 'inside' };
    const q = out.parts.find(v => right ? Math.abs(v.x - xx) < 0.01 : Math.abs(v.x + t - xx) < 0.01);
    return q ? { ops: q.pt.ops, face: right ? 'left' : 'right', z0: q.z0 } : null;
  };
  if (!pin) return out;
  const pitch = pin.pitchMM * MM, ys = [pin.pinSetbackMM * MM, inD - pin.pinSetbackMM * MM], n = Math.max(1, p.shelfHoles | 0);
  const drill = (zs, x0, x1) => {
    const sides = [vert(x0, false), vert(x1, true)].filter(Boolean);
    zs.forEach(z => ys.forEach(y => sides.forEach(sd => {
      const xx = sd.z0 !== undefined ? r3(z - sd.z0) : z;
      const clash = sd.ops.some(o => o.why !== 'shelf pin' && o.type === 'bore' && Math.hypot(o.x - xx, o.y - y) < 12 * MM) || plateZones.some(pz => pz.ops === sd.ops && xx > pz.z0 && xx < pz.z1 && y > pz.y0 && y < pz.y1);
      if (!clash) sd.ops.push({ type: 'bore', x: xx, y, dia: pin.pinDiaMM * MM, depth: sd.z0 !== undefined ? Math.min(pin.pinDepthMM * MM, t * 0.4) : pin.pinDepthMM * MM, face: sd.face, why: 'shelf pin' });
    })));
  };
  inr.zones.filter(zn => zn.k > 0).forEach(zn => {
    drill(pinHoleZs(p, pin, zn[0], zn[1], inLeafShelves(zn)), zn.x0, zn.x1);
    part(`Adjustable shelf (${inLabel(c, zn.key, L)})`, sm, r3(zn.x1 - zn.x0 - 0.0625), r3(inD - p.shelfFrontSetback), { qty: zn.k, kind: 'shelf' });
    addB(pin.name, 4 * zn.k);
  });
  // A split set to an adjustable shelf: the shelf rests on pins at that height.
  inr.shelves.filter(q => q.adj).forEach(q => {
    const g = []; for (let i = -Math.floor(n / 2); i < n - Math.floor(n / 2); i++) g.push(r3(q.z + i * pitch));
    drill(g, q.x0, q.x1);
    part(`Adjustable shelf (${inBetween(c, q, L)})`, sm, r3(q.x1 - q.x0 - 0.0625), r3(inD - p.shelfFrontSetback), { kind: 'shelf' });
    addB(pin.name, 4);
  });
  return out;
}
// Fastens the inside partitions into what is under and over them, and the fixed shelves into the sides or partitions
// each end, with the cabinet's unfinished joint (a dado joint gets screws, like a divider).
function innerJoints(c, b, x) {
  const { parts, J, jx, spots, joinSides, rails, t, zIn0, zIn1, backY, sw } = x;
  if (!J || J.kind !== 'joint') return;
  const mine = n => parts.find(z => z.cabId === c.id && z.name === n), e = 1e-3;
  // What a partition's bottom (atTop false) or top edge meets: [host part, x of the host's left end, depth, face].
  const hostH = (q, atTop) => {
    const z = atTop ? q.z1 : q.z0, mid = q.x + t / 2;
    const s = b.shelves.find(f => mid > f.x0 && mid < f.x1 && Math.abs((atTop ? f.z : f.z + t) - z) < e);
    if (s) return [s.pt, s.x0, s.pt.W, atTop ? 'bottom' : 'top'];
    const rs = rails.shelves.find(f => Math.abs(f.z + (atTop ? -t / 2 : t / 2) - z) < e), rp = rs && mine(`Fixed shelf ${rs.row + 1}`);
    if (rp) return [rp, t, rp.W, atTop ? 'bottom' : 'top'];
    const st = rails.stretchers.find(f => Math.abs(f.z + (atTop ? -t / 2 : t / 2) - z) < e);
    if (st && st.pt) return [st.pt, t, sw, atTop ? null : 'top'];
    if (!atTop && Math.abs(z - zIn0) < e) { const bt = mine('Bottom'); if (bt) return [bt, t, bt.W, null]; }
    if (atTop && Math.abs(z - zIn1) < e) { const tp = mine('Top') || mine('Front stretcher'); if (tp) return [tp, t, tp.name === 'Top' ? tp.W : sw, null]; }
    return null;
  };
  b.parts.forEach(q => [false, true].forEach(atTop => {
    const h = hostH(q, atTop); if (!h) return;
    const [host, hx0, depth, face] = h, pt = q.pt, fem = [];
    jx.a = 0; jx.b = depth; jx.type = 'divider'; jx.side = null; jx.off = 0; jx.zr = undefined;
    jtFasten(J, fem, pt, atTop ? r3(pt.L) : 0, atTop ? 'W2' : 'W1', jtSpots(J, 'divider', 0, Math.min(depth, pt.W), spots, t).map(y => ({ x: r3(q.x + t / 2 - hx0), y: r3(y), m: y })), `${J.name} (partition)`, jx);
    host.ops.push(...jtShift(host, face ? fem.map(o => ({ ...o, face })) : fem));
  }));
  // Fixed shelves: an end at a cabinet side joins like any fixed shelf; an end at a partition screws through it.
  b.shelves.forEach(s => ['L', 'R'].forEach(end => {
    const xx = end === 'L' ? s.x0 : s.x1, pq = b.parts.find(v => end === 'L' ? Math.abs(v.x + t - xx) < e : Math.abs(v.x - xx) < e);
    if (!pq) { if (Math.abs(xx - (end === 'L' ? t : c.w - t)) < e) joinSides('shelf', s.pt, r3(s.z + t / 2), null, 0, backY, end); return; }
    const fem = []; jx.a = 0; jx.b = s.pt.W; jx.type = 'divider'; jx.side = null; jx.off = 0; jx.zr = undefined;
    jtFasten(J, fem, s.pt, end === 'L' ? 0 : r3(s.pt.L), end === 'L' ? 'W1' : 'W2', jtSpots(J, 'divider', 0, s.pt.W, spots, t).map(y => ({ x: r3(s.z + t / 2 - pq.z0), y: r3(y), m: y })), `${J.name} (fixed shelf)`, jx);
    pq.pt.ops.push(...fem.map(o => ({ ...o, face: end === 'L' ? 'right' : 'left' })));
  }));
}

/* ---------- Every interior part with where it is drawn, for picking ---------- */
// [{ key, kind, name, x0, x1, z0, z1, open }] in cabinet coordinates; open is the opening key it belongs to.
function inPickParts(c) {
  const p = effParams(c), fr = computeFronts(c, p), lay = interiorLayout(c, p, fr), t = lay.t, out = [], L = faceLetters(c);
  const xa = lay.x0, xb = lay.x0 + lay.inW;
  // Adjustable shelves of plain openings, numbered from the bottom in each opening.
  const per = {};
  shelfHeights(lay, Math.max(0, p.shelfCount | 0)).forEach(z => {
    const zn = lay.shelfZones.find(q => z > q[0] - 0.01 && z < q[1] + 0.01); if (!zn) return;
    (per[zn.row] = per[zn.row] || []).push(z);
  });
  Object.entries(per).forEach(([ri, zs]) => zs.sort((a, b) => a - b).forEach((z, j) => out.push({ key: `adj|${ri}|${j}`, kind: 'adj', name: `Adjustable shelf, opening ${L[ri] || +ri + 1}`, x0: xa, x1: xb, z0: z, z1: z + t, open: String(ri) })));
  (lay.colZones || []).forEach(zn => colWants(zn).map(z => pinRest(p, zn[0], zn[1], z)).forEach((z, j) => out.push({ key: `cs|${zn.cell}|${j}`, kind: 'cs', name: `Adjustable shelf, section ${L[zn.cell] || ''}`, x0: zn.x0, x1: zn.x1, z0: z, z1: z + t, open: zn.cell })));
  if (lay.inner) {
    lay.inner.zones.forEach(zn => inLeafShelves(zn, p).forEach((z, j) => out.push({ key: `adj|${zn.key}|${j}`, kind: 'adj', name: `Adjustable shelf, opening ${inLabel(c, zn.key, L)}`, x0: zn.x0, x1: zn.x1, z0: z, z1: z + t, open: zn.key })));
    lay.inner.shelves.forEach(q => out.push({ key: `bd|${q.key}|${q.j}`, kind: q.adj ? 'bdadj' : 'bdfix', name: `${q.adj ? 'Adjustable' : 'Fixed'} shelf under ${inLabel(c, q.key + IN_SEP + q.j, L)}`, x0: q.x0, x1: q.x1, z0: q.z, z1: q.z + t, open: q.key + IN_SEP + q.j }));
    lay.inner.parts.forEach(q => out.push({ key: `bd|${q.key}|${q.j}`, kind: 'bdpart', name: `Partition right of ${inLabel(c, q.key + IN_SEP + q.j, L)}`, x0: q.x, x1: q.x + t, z0: q.z0, z1: q.z1, open: q.key + IN_SEP + q.j }));
  }
  // Fixed shelves and stretchers between rows (automatic or set by hand). Microwave shelves and the ones that hold
  // side-by-side face sections stay: the face needs them.
  const rl = caseRails(c, p, fr, t);
  rl.shelves.filter(q => !q.mw && !q.cols).forEach(q => out.push({ key: `stop|${q.row}`, kind: 'stop', name: `Fixed shelf under opening ${L[q.row] || q.row + 1}`, x0: t, x1: c.w - t, z0: q.z - t / 2, z1: q.z + t / 2, open: String(q.row) }));
  rl.stretchers.forEach(q => out.push({ key: `stop|${q.row}`, kind: 'stop', name: `${q.door ? 'Door' : 'Drawer'} stretcher under ${L[q.row] || q.row + 1}`, x0: t, x1: c.w - t, z0: q.z - t / 2, z1: q.z + t / 2, open: String(q.row) }));
  const ins = c.inserts || [], nm = k => { const it = ins[k]; return it ? (typeof intItemOf === 'function' && (intItemOf(it) || {}).name) || it.name || (typeof intName === 'function' ? intName(it.type) : it.type) : ''; };
  lay.rollouts.forEach(ro => out.push({ key: `ins|${ro.ins}`, kind: 'ins', name: nm(ro.ins), x0: xa + lay.spacer + 0.5, x1: xb - lay.spacer - 0.5, z0: ro.z, z1: ro.z + ro.h, open: String((ins[ro.ins] || {}).row ?? '') }));
  [...lay.trays, ...lay.bins, ...lay.lazy, ...(lay.pulls || [])].forEach(q => out.push({ key: `ins|${q.ins}`, kind: 'ins', name: nm(q.ins), x0: xa + lay.inW * 0.2, x1: xb - lay.inW * 0.2, z0: q.z0 + 1, z1: q.z1 - 1, open: String((ins[q.ins] || {}).row ?? ''), fill: true }));
  if (lay.divX !== null) out.push({ key: 'div', kind: 'div', name: 'Vertical divider', x0: lay.divX - t / 2, x1: lay.divX + t / 2, z0: lay.zIn0, z1: lay.zIn1, open: '' });
  return out;
}
// The picked parts of the open cabinet (cleared when another cabinet is opened).
function inSel() { const id = (qeCab() || {}).id; if (ui.inSelCab !== id) { ui.inSel = []; ui.inSelCab = id; } return ui.inSel || (ui.inSel = []); }

/* ---------- Changes ---------- */
// Freezes every plain opening's shelf count before one changes (qeFreezeShelves in app.js).
const inFreeze = c => { if (typeof qeFreezeShelves === 'function') qeFreezeShelves(c); };
// The shelf count of an opening key (a plain row or an inside opening) right now.
function inShelfCount(c, key) {
  if (!inIsInner(key)) return qeRowShelves(c, +key);
  const p = effParams(c), lay = interiorLayout(c, p), zn = lay.inner && lay.inner.zones.find(z => z.key === key);
  return zn ? zn.k : 0;
}
// Splits opening key into n parts, across ('h', fixed shelves) or side by side ('v', partitions). '' or a message.
function inSplit(c, key, dir, n) {
  n = Math.max(2, Math.min(8, n | 0));
  const [ri] = String(key).split(IN_SEP).map(Number), row = (c.rows || [])[ri];
  if (!inRowOK(c, row)) return 'Only a door or open opening of a plain frameless cabinet can be split inside (not corners, face frames or shaped cabinets). Split side-by-side face sections on the Face tab.';
  const node = inNode(c, key); if (!node) return 'Pick an opening first.';
  if (node.inner) return 'This opening is split already. Pick one of its parts.';
  if (!inIsInner(key) && (c.inserts || []).some(it => it.row !== undefined && it.row !== '' && +it.row === ri && it.type !== 'rod' && it.type !== 'divider'))
    return 'Take the inserts out of this opening first; they fill the whole opening.';
  if (!inIsInner(key)) { inFreeze(c); delete row.shelves; } else delete node.k;
  node.inner = { dir: dir === 'v' ? 'v' : 'h', parts: Array.from({ length: n }, () => ({})) };
  if (!inIsInner(key) && (c.rows || []).some((r, i) => i !== ri && r.shelves !== undefined && r.shelves !== '')) row.shelves = 0;
  return '';
}
// Takes out split part j of node key (the fixed shelf, adjustable shelf or partition after part j): the two parts join.
function inJoin(c, key, j) {
  const node = inNode(c, key), sp = node && node.inner; if (!sp || !sp.parts[j + 1]) return;
  const A = sp.parts[j], B = sp.parts[j + 1], t = interiorLayout(c).t;
  const kOf = (q, k) => q.inner ? 0 : q.k !== undefined && q.k !== '' ? q.k | 0 : inShelfCount(c, key + IN_SEP + k);
  const m = A.inner ? { inner: A.inner } : B.inner ? { inner: B.inner } : { k: kOf(A, j) + kOf(B, j + 1) + ((sp.types || [])[j] === 'adj' ? 1 : 0) };
  if (+A.s > 0 && +B.s > 0) m.s = r3(+A.s + +B.s + t);
  sp.parts.splice(j, 2, m);
  if (sp.types) { sp.types.splice(j, 1); if (!sp.types.some(Boolean)) delete sp.types; }
  if (sp.parts.length > 1) return;
  // One part left: the opening is whole again.
  const only = sp.parts[0];
  if (only.inner) { node.inner = only.inner; return; }
  delete node.inner;
  if (!inIsInner(key)) { inFreeze(c); node.shelves = only.k | 0; } else node.k = only.k | 0;
}
// Shelves j (a set, numbered from the bottom) of opening key, of k there, become fixed: the opening splits at each.
function inShelvesToFixed(c, key, js) {
  const node = inNode(c, key); if (!node || node.inner) return;
  const k = inShelfCount(c, key); js = [...new Set(js)].filter(j => j >= 0 && j < k).sort((a, b) => a - b); if (!js.length) return;
  const p = effParams(c), lay = interiorLayout(c, p), t = lay.t;
  const zn = inIsInner(key) ? lay.inner.zones.find(z => z.key === key) : lay.zones.find(z => z.row === +key); if (!zn) return;
  // 0.64.19: each fixed shelf stays where the adjustable one was drawn (on its pins).
  const h = zn[1] - zn[0], at = j => pinRest(p, zn[0], zn[1], zn[0] + h * (j + 1) / (k + 1)) - zn[0];
  // Parts top to bottom; each keeps the shelves between its fixed shelves, sized so the fixed shelves stay put.
  const cuts = [...js].reverse(), parts = []; let top = h, prev = k;
  cuts.forEach(j => { parts.push({ k: prev - j - 1, s: r3(top - at(j) - t) }); top = at(j); prev = j; });
  parts.push({ k: prev });
  delete parts[0].s;
  if (!inIsInner(key)) { inFreeze(c); node.shelves = 0; } else delete node.k;
  node.inner = { dir: 'h', parts };
}
// Takes n adjustable shelves out of opening key.
function inShelvesLess(c, key, n) {
  const node = inNode(c, key); if (!node) return;
  const k = inShelfCount(c, key);
  if (!inIsInner(key)) inFreeze(c);
  if (inIsInner(key)) node.k = Math.max(0, k - n); else node.shelves = Math.max(0, k - n);
}
// The picked keys grouped by what they are: { adj: {key: [j]}, cs: {cell: n}, bd: [[key, j]], stop: [row], ins: [k], div }.
function inGroup(sel) {
  const g = { adj: {}, cs: {}, bd: [], stop: [], ins: [], div: false };
  sel.forEach(s => {
    const [k, a, b] = s.split('|');
    if (k === 'adj') (g.adj[a] = g.adj[a] || []).push(+b);
    else if (k === 'cs') g.cs[a] = (g.cs[a] || 0) + 1;
    else if (k === 'bd') g.bd.push([a, +b]);
    else if (k === 'stop') g.stop.push(+a);
    else if (k === 'ins') g.ins.push(+a);
    else if (k === 'div') g.div = true;
  });
  // Deepest splits first, then from the last part back, so the keys still left stay right.
  g.bd.sort((x, y) => y[0].split(IN_SEP).length - x[0].split(IN_SEP).length || y[1] - x[1]);
  g.ins.sort((x, y) => y - x);
  return g;
}
// Removes every picked part. Returns how many.
function inRemove(c, sel) {
  const g = inGroup(sel);
  Object.entries(g.adj).forEach(([key, js]) => inShelvesLess(c, key, js.length));
  Object.entries(g.cs).forEach(([cell, n]) => {
    const lf = colLeaf(c, cell); if (!lf) return;
    const p = effParams(c), zn = (interiorLayout(c, p).colZones || []).find(z => z.cell === cell);
    lf.shelves = Math.max(0, (zn ? zn.k : 0) - n);
  });
  g.stop.forEach(ri => { const r = c.rows[ri]; if (!r) return; delete r.fixShelf; r.noStop = true; });
  g.ins.forEach(k => { if (c.inserts && c.inserts[k]) c.inserts.splice(k, 1); });
  if (g.div) c.inserts = (c.inserts || []).filter(it => it.type !== 'divider');
  g.bd.forEach(([key, j]) => inJoin(c, key, j));
  return sel.length;
}
// What the picked parts can change to: [[value, label]]; only choices every picked part can take.
const IN_TO = {
  adj: [['fixed', 'Fixed shelf'], ['rollout', 'Roll-out shelf']],
  bdadj: [['fixed', 'Fixed shelf']],
  bdfix: [['adj', 'Adjustable shelf']],
  stop: [], cs: [], bdpart: [], div: [],
  ins: [['adj', 'Adjustable shelf'], ['rollout', 'Roll-out'], ['rotray', 'Roll-out tray'], ['roshelf', 'Roll-out shelf, lip only'], ['traydiv', 'Tray dividers'], ['trash', 'Waste bin pull-out'], ['pullout', 'Full-height pull-out']]
};
function inChoices(c, sel) {
  const kinds = [...new Set(sel.map(s => { const pp = inPickParts(c).find(q => q.key === s); return pp ? pp.kind : ''; }))];
  if (!kinds.length || kinds.some(k => !k)) return [];
  let out = IN_TO[kinds[0]] || [];
  kinds.slice(1).forEach(k => { const ok = (IN_TO[k] || []).map(o => o[0]); out = out.filter(o => ok.includes(o[0])); });
  // A roll-out goes in a whole door opening, not an inside one.
  if (sel.some(s => s.startsWith('adj|') && inIsInner(s.split('|')[1]))) out = out.filter(o => o[0] !== 'rollout');
  return out;
}
// Changes every picked part to type v. Returns a message, or ''.
function inChange(c, sel, v) {
  const g = inGroup(sel); let msg = '';
  g.bd.forEach(([key, j]) => {
    const sp = (inNode(c, key) || {}).inner; if (!sp || sp.dir !== 'h') return;
    sp.types = sp.types || []; while (sp.types.length < sp.parts.length - 1) sp.types.push('');
    sp.types[j] = v === 'adj' ? 'adj' : ''; if (!sp.types.some(Boolean)) delete sp.types;
  });
  Object.entries(g.adj).forEach(([key, js]) => {
    if (v === 'fixed') inShelvesToFixed(c, key, js);
    else if (v === 'rollout' && !inIsInner(key)) { inShelvesLess(c, key, js.length); msg = intApply(c, +key, 'rollout') || msg; }
  });
  if (g.ins.length) {
    g.ins.forEach(k => {
      const it = (c.inserts || [])[k]; if (!it) return;
      const row = it.row !== undefined && it.row !== '' ? +it.row : c.rows.length - 1;
      c.inserts.splice(k, 1);
      if (v === 'adj') { inFreeze(c); const r = c.rows[row]; if (r) r.shelves = Math.min(12, (r.shelves | 0) + 1); }
      else msg = intApply(c, row, v) || msg;
    });
  }
  return msg;
}

/* ---------- Drawing: hits over the inside picture (fsFaceSVG in facesec.js) ---------- */
function inPickSVG(c) {
  const sel = inSel(), fs = Math.max(0.35, Math.min(c.w, c.h) / 90), up = q => q.kind === 'bdpart' || q.kind === 'div';
  // Fillers under, then uprights, then shelves on top, so a thin shelf where it meets a partition still takes the click.
  const ord = q => q.fill ? 0 : up(q) ? 1 : 2;
  return inPickParts(c).sort((a, b) => ord(a) - ord(b)).map(q => {
    const on = sel.includes(q.key), px = !q.fill && up(q) ? 0.35 : 0, pz = !q.fill && !up(q) ? 0.35 : 0;
    const w = Math.max(q.x1 - q.x0, 0.6) + 2 * px, h = Math.max(q.z1 - q.z0, 0.6) + 2 * pz;
    return `<rect class="in-part${q.fill ? ' fill' : ''}${on ? ' on' : ''}" data-act="isp-pick" data-id="${esc(q.key)}" x="${r3((q.x0 + q.x1) / 2 - w / 2)}" y="${r3(-(q.z0 + q.z1) / 2 - h / 2)}" width="${r3(w)}" height="${r3(h)}" stroke-width="${fs}"><title>${esc(q.name)}${on ? ' (picked)' : ''}</title></rect>`;
  }).join('');
}

/* ---------- Panel ---------- */
// The right panel while parts are picked: what they are, Change to, Remove.
function inSelPanel(c) {
  const sel = inSel(), all = inPickParts(c), picked = sel.map(k => all.find(q => q.key === k)).filter(Boolean);
  if (!picked.length) return '';
  const ch = inChoices(c, sel), names = {};
  picked.forEach(q => { names[q.name] = (names[q.name] || 0) + 1; });
  return `<aside class="fs-panel in-selp"><div class="fs-head"><b>${picked.length === 1 ? 'Picked part' : `${picked.length} parts picked`}</b><button class="btn sm" data-act="isp-none" data-id="" title="Unpick (Esc)">Unpick</button></div>
    <ul class="in-names">${Object.entries(names).map(([n, k]) => `<li>${k > 1 ? `${k} × ` : ''}${esc(n)}</li>`).join('')}</ul>
    ${ch.length ? `<label class="fs-row"><span>Change to</span><select data-ispchange="1" aria-label="Change the picked parts to"><option value="">Pick a type…</option>${ch.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>` : ''}
    <button class="btn sm danger" data-act="isp-remove" data-id="">${icon('trash')}Remove ${picked.length > 1 ? `all ${picked.length}` : 'it'}</button>
    <div class="note show">${isPhone() ? 'Tap' : 'Shift-click or Ctrl-click'} more parts to pick several. Delete removes, Esc unpicks.</div></aside>`;
}
// The split tools for the picked opening (in the opening panel).
function inSplitBox(c, key) {
  const row = (c.rows || [])[+String(key).split(IN_SEP)[0]];
  if (String(key).includes('.') || !inRowOK(c, row)) return '';
  const node = inNode(c, key); if (!node || node.inner) return '';
  const n = Math.max(2, ui.inSplitN | 0 || 2);
  return `<div class="in-split"><span class="eyebrow">Split this opening</span>
    <div class="fs-row"><span>Parts</span><div class="fs-step"><button class="btn sm icon-only" data-act="isp-n" data-id="-1" aria-label="One part less"${n > 2 ? '' : ' disabled'}>−</button><b>${n}</b><button class="btn sm icon-only" data-act="isp-n" data-id="1" aria-label="One part more"${n < 8 ? '' : ' disabled'}>+</button></div></div>
    <div class="in-split-btns"><button class="btn sm" data-act="isp-split" data-id="${esc(key)}|h" title="Fixed shelves across, ${n} openings one over another">${icon('hsplit')}Across (fixed shelves)</button>
    <button class="btn sm" data-act="isp-split" data-id="${esc(key)}|v" title="Partitions, ${n} openings side by side">${icon('vsplit')}Side by side (partitions)</button></div></div>`;
}
// The panel for an inside opening (a part of a split opening).
function inLeafPanel(c, key, zn, L) {
  const node = inNode(c, key), k = zn.k, own = node && node.k !== undefined && node.k !== '';
  const pk = inParentKey(key), par = inNode(c, pk), dir = par && par.inner ? par.inner.dir : 'h', j = +String(key).split(IN_SEP).pop();
  const sz = node && +node.s > 0 ? node.s : '';
  return `<aside class="fs-panel"><div class="fs-head"><b>Opening ${esc(inLabel(c, key, L))}</b><span class="muted">${fmtLen(zn.x1 - zn.x0, 1)} × ${fmtLen(zn[1] - zn[0], 1)} inside</span></div>
    <div class="fs-row"><span>Adjustable shelves</span><div class="fs-step"><button class="btn sm icon-only" data-act="isp-k" data-id="${esc(key)}|-1" aria-label="One shelf less"${k ? '' : ' disabled'}>−</button><b>${k}</b><button class="btn sm icon-only" data-act="isp-k" data-id="${esc(key)}|1" aria-label="One shelf more">+</button></div></div>
    ${own ? `<button class="btn sm" data-act="isp-k" data-id="${esc(key)}|auto" title="Let the shelf count follow the opening's height">Auto count</button>` : ''}
    <label class="fs-row"><span>${dir === 'v' ? 'Width' : 'Height'}</span><input type="text" inputmode="decimal" data-ispsize="${esc(key)}" value="${sz === '' ? '' : esc(fmtLen(+sz))}" placeholder="* shares" aria-label="${dir === 'v' ? 'Width' : 'Height'} inside"></label>
    ${inSplitBox(c, key)}
    <button class="btn sm" data-act="isp-join" data-id="${esc(pk)}|${j}" title="Take out the ${dir === 'v' ? 'partition' : 'fixed shelf'} ${j < par.inner.parts.length - 1 ? 'after' : 'before'} this opening and join it to the next one">Join with the next opening</button>
    <div class="note show">Click a shelf or partition in the drawing to pick it, then change it or remove it.</div></aside>`;
}

/* ---------- Actions ---------- */
function inPickOpen(c, q) { if (q && q.open) { ui.fsSel = q.open; ui.fsSelCab = c.id; const ri = +String(q.open).split(/[./]/)[0]; if (Number.isFinite(ri)) ui.qeRow = ri; } }
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act^="isp-"]'); if (!b || b.disabled) return;
  const a = b.dataset.act, id = b.dataset.id || '', c = qeCab(); if (!c) return;
  e.stopPropagation(); e.preventDefault();
  if (a === 'isp-pick') {
    const s = inSel(), many = e.shiftKey || e.ctrlKey || e.metaKey || ui.inMany;
    ui.inSel = many ? (s.includes(id) ? s.filter(x => x !== id) : [...s, id]) : (s.length === 1 && s[0] === id ? [] : [id]);
    if (!many) inPickOpen(c, inPickParts(c).find(q => q.key === id));
    renderQuick(); return;
  }
  if (a === 'isp-none') { ui.inSel = []; renderQuick(); return; }
  if (a === 'isp-remove') { inRemoveSel(); return; }
  if (a === 'isp-n') { ui.inSplitN = Math.max(2, Math.min(8, (ui.inSplitN | 0 || 2) + +id)); renderQuick(); return; }
  if (a === 'isp-split') {
    const j = id.lastIndexOf('|'), key = id.slice(0, j), dir = id.slice(j + 1); let msg = '';
    mutate(() => { msg = inSplit(c, key, dir, ui.inSplitN | 0 || 2); });
    if (msg) flash(msg); else { ui.fsSel = key + IN_SEP + '0'; ui.fsSelCab = c.id; ui.inSel = []; renderQuick(); }
    return;
  }
  if (a === 'isp-join') { const j = id.lastIndexOf('|'), key = id.slice(0, j); let k = +id.slice(j + 1); const par = inNode(c, key); if (par && par.inner && k >= par.inner.parts.length - 1) k--; mutate(() => inJoin(c, key, k)); ui.fsSel = key; ui.inSel = []; renderQuick(); return; }
  if (a === 'isp-k') {
    const j = id.lastIndexOf('|'), key = id.slice(0, j), v = id.slice(j + 1);
    mutate(() => { const n = inNode(c, key); if (!n) return; if (v === 'auto') delete n.k; else n.k = Math.max(0, Math.min(12, inShelfCount(c, key) + +v)); });
    return;
  }
}, true);
function inRemoveSel() {
  const c = qeCab(), sel = inSel(); if (!c || !sel.length) return;
  let n = 0; mutate(() => { n = inRemove(c, sel); });
  ui.inSel = []; flash(`Removed ${n} part${n > 1 ? 's' : ''}. Undo brings ${n > 1 ? 'them' : 'it'} back.`); renderQuick();
}
document.addEventListener('change', e => {
  const el = e.target; if (!el || !el.dataset) return;
  if (el.dataset.ispchange && el.value) {
    const c = qeCab(), sel = inSel(); if (!c || !sel.length) return; let msg = '';
    mutate(() => { msg = inChange(c, sel, el.value); });
    ui.inSel = []; if (msg) flash(msg); renderQuick(); return;
  }
  if (el.dataset.ispsize !== undefined) {
    const c = qeCab(), key = el.dataset.ispsize, v = String(el.value).trim(), len = v === '' || v === '*' ? null : parseLen(v);
    if (len !== null && !(len > 0)) { flash('That is not a size.'); return; }
    mutate(() => { const n = inNode(c, key); if (!n) return; if (len === null) delete n.s; else n.s = r3(len); });
  }
}, true);
// Delete removes the picked parts; Escape unpicks them (Interior tab only).
document.addEventListener('keydown', e => {
  if (!ui.quick || ui.edTab !== 'interior' || !(ui.inSel || []).length) return;
  const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); inRemoveSel(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); ui.inSel = []; renderQuick(); }
}, true);

/* ---------- 3D and elevation ---------- */
// The inside parts as boxes: [{ x0, x1, z0, z1, kind: 'part' | 'fixed' | 'adj' }] (z0 = bottom face).
function inDrawParts(lay) {
  const inr = lay.inner, t = lay.t; if (!inr) return [];
  return [...inr.parts.map(q => ({ x0: q.x, x1: q.x + t, z0: q.z0, z1: q.z1, kind: 'part' })),
    ...inr.shelves.map(q => ({ x0: q.x0, x1: q.x1, z0: q.z, z1: q.z + t, kind: q.adj ? 'adj' : 'fixed' })),
    ...inr.zones.flatMap(zn => inLeafShelves(zn, lay.p).map(z => ({ x0: zn.x0, x1: zn.x1, z0: z, z1: z + t, kind: 'adj' })))];
}
