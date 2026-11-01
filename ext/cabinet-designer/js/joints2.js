// Joint types (J1-J6): each kind of joint in the box gets its own hole locations, a center fastener on long joints,
// a "don't use" switch, copy from another type, a fastener kind, and nailer parts joined with their own type.
'use strict';

const JT_TYPES = [['bottom', 'Bottom'], ['top', 'Top'], ['stretcher', 'Stretchers'], ['nailer', 'Nailers'], ['divider', 'Dividers'], ['back', 'Back'], ['toe', 'Toe kick / skin'], ['shelf', 'Fixed shelves']];
const JT_FROM = [{ v: 'none', l: "Don't use" }, { v: 'front', l: 'From front' }, { v: 'back', l: 'From back' }, { v: 'center', l: 'From center' }];
const JT_KINDS = [
  { v: 'holes', l: 'Holes (female and male, as set below)' }, { v: 'confirmat', l: 'Confirmat screws' }, { v: 'dowel', l: 'Dowels' },
  { v: 'combo', l: 'Dowel and confirmat (dowels either side)' }, { v: 'pocket', l: 'Pocket screws' }, { v: 'lamello', l: 'Lamello (Clamex) connectors' },
  { v: 'route', l: 'Route (dado the panel into the side)' },
];
// Back and toe joints only count fasteners for the hardware list: the back sits in a dado and the toe skin clips on.
const JT_COUNT_ONLY = ['back', 'toe'];

// The location settings a type uses. A type nobody has set yet follows the old template fields, so old jobs build the same.
function jtLegacy(J, type) {
  if (type === 'top') return J.top || J.ends || JOINT_LOC;
  if (type === 'divider') return J.dividers || JOINT_LOC;
  if (type === 'stretcher') return { mode: 'spread', count: ((J.stretchers || {}).n | 0) || 2 };
  if (type === 'nailer') return { mode: 'count', count: 2, front: 0.75, back: 0.75 };
  if (type === 'back' || type === 'toe') return { none: true, mode: 'gap', maxGap: 8, front: 2, back: 2 };
  return J.ends || JOINT_LOC;
}
function jtLoc(J, type) { const o = (J.types || {})[type]; return o && !o.same ? o : jtLegacy(J, type); }
function jtNum(at, L, T) {
  if (typeof at === 'number') return at;
  const s = String(at ?? '').trim(); if (!s) return 0;
  const n = parseLen(s); if (isFinite(n)) return n;
  try { return evalExpr(s.replace(/^=/, ''), k => ({ L, T, LEN: L })[k.toUpperCase()]); } catch (e) { return NaN; }
}
// Where along a joint from a to b the fasteners go.
function jtSpots(J, type, a, b, spread, T = 0.75) {
  const o = jtLoc(J, type), L = b - a;
  if (o.none) return [];
  let ys;
  if (o.mode === 'spread') { const n = Math.max(1, o.count | 0); ys = Array.from({ length: n }, (_, i) => a + L * (i + 0.5) / n); }
  else {
    const used = (o.pts || []).filter(q => q && q.from && q.from !== 'none');
    if (used.length) ys = used.map(q => { const d = jtNum(q.at, L, T); return q.from === 'front' ? a + d : q.from === 'back' ? b - d : (a + b) / 2 + d; })
      .filter(y => isFinite(y) && y >= a - 1e-6 && y <= b + 1e-6);
    else ys = spread(o, a, b);
  }
  // J3: a center fastener once the joint is longer than the threshold.
  if (+o.centerOver > 0 && L > +o.centerOver) { const m = (a + b) / 2; if (!ys.some(y => Math.abs(y - m) < 0.75)) ys.push(m); }
  return [...new Set(ys.map(r3))].sort((p, q) => p - q);
}
function jtKind(J) { return J.fastener || 'holes'; }
// J5: the machining for one joint. pairs: [{x, y, m}] — x, y on the female panel (the side), m along the male panel's edge.
function jtFasten(J, fem, male, edgeX, edge, pairs, why, x) {
  const k = jtKind(J), t = x.t, F = J.female || {}, M = J.male || {};
  const bore = (q, dia, depth) => fem.push({ type: 'bore', x: r3(q.x), y: r3(q.y), dia, depth: +depth > 0 ? +depth : t, through: !(+depth > 0), face: 'inside', why });
  const hb = (m, dia, depth, w) => male && male.ops.push({ type: 'hbore', edge, x: edgeX, y: r3(m), dia, depth, inset: r3(t / 2), why: w || why });
  if (k === 'route') {
    if (!pairs.length) return;
    const d = +J.routeDepth > 0 ? +J.routeDepth : 0.25, xs = pairs.map(q => q.x), ys = pairs.map(q => q.y), mn = r3(Math.min(...ys)), mx = r3(Math.max(...ys));
    const along = Math.abs(Math.max(...xs) - Math.min(...xs)) > Math.abs(mx - mn);
    // A dado the full length of the joint, as wide as the panel that drops in.
    fem.push(along ? { type: 'groove', x1: r3(Math.min(...xs)), y1: r3(pairs[0].y), x2: r3(Math.max(...xs)), y2: r3(pairs[0].y), width: t, depth: d, face: 'inside', why }
      : { type: 'groove', x1: r3(pairs[0].x), y1: x.a ?? mn, x2: r3(pairs[0].x), y2: x.b ?? mx, width: t, depth: d, face: 'inside', why });
    if (male) jtGrow(male, edge, d);
    return;
  }
  pairs.forEach((q, i) => {
    if (k === 'pocket') { if (male) male.ops.push({ type: 'pockethole', edge, x: edgeX ? r3(edgeX - 1) : 1, y: r3(q.m), face: 'inside', why }); x.addB('Pocket screw', 1); return; }
    if (k === 'lamello') {
      const len = +J.lamLen > 0 ? +J.lamLen : 2.2, w = 0.157, dp = 0.39;
      fem.push({ type: 'pocket', x: r3(q.x - w / 2), y: r3(q.y - len / 2), w, h: len, depth: dp, face: 'inside', why });
      if (male) male.ops.push({ type: 'edgeslot', edge, x: edgeX, y: r3(q.m), len, depth: dp, inset: r3(t / 2), why });
      x.addB('Lamello connector', 1); return;
    }
    if (k === 'combo') {
      const off = +J.comboOff > 0 ? +J.comboOff : 1.26, D = J.dowel || { dia: 0.315, depth: 0.5, mdepth: 1 };
      bore(q, F.dia || 0.1969, F.depth); hb(q.m, M.dia || 0.1969, M.depth || 1.75);
      [-off, off].forEach(o => { bore({ x: q.x, y: q.y + o }, D.dia, D.depth); hb(q.m + o, D.dia, D.mdepth || 1, why + ' dowel'); });
      x.addB(J.name, 1); x.addB('Dowel', 2); return;
    }
    bore(q, F.dia, F.depth); hb(q.m, M.dia, M.depth); x.addB(J.name, 1);
  });
}
// A routed panel drops into the dado, so it gets longer by the dado depth on that end.
function jtGrow(pt, edge, d) {
  const atStart = edge === 'W1' || edge === 'L1';
  if (edge === 'W1' || edge === 'W2') {
    if (atStart) pt.ops.forEach(o => ['x', 'x1', 'x2'].forEach(k => { if (typeof o[k] === 'number') o[k] = r3(o[k] + d); }));
    pt.L = r3(pt.L + d);
  } else {
    if (atStart) pt.ops.forEach(o => ['y', 'y1', 'y2'].forEach(k => { if (typeof o[k] === 'number') o[k] = r3(o[k] + d); }));
    pt.W = r3(pt.W + d);
  }
}
// J6: nailer parts, from the cabinet's construction settings.
function jtNailers(c, p, part, x) {
  const kind = p.nailers || 'none', nw = +p.nailerWidth > 0 ? +p.nailerWidth : 3.5, out = [];
  if (kind === 'none') return out;
  const add = (name, z0, z1) => { const q = part(name, x.cm, x.inW, nw, { kind: 'nailer' }); q.jz = [z0, z1]; out.push(q); };
  if (kind === 'top' || kind === 'both') add('Top wall nailer', x.zIn1 - nw, x.zIn1);
  if (kind === 'bottom' || kind === 'both') add('Bottom wall nailer', x.zIn0, x.zIn0 + nw);
  return out;
}
// Joins the parts that are made after the main box (fixed shelves) at both ends; nailers are joined with the box.
function jtLate(c, parts, x) {
  if (!x.jt) return;
  parts.filter(q => q.cabId === c.id && /^Fixed shelf \d+$/.test(q.name) && q.jx !== undefined).forEach(q => x.jt('shelf', q, q.jx));
  // Back and toe joints just count fasteners.
  JT_COUNT_ONLY.forEach(type => ['L', 'R'].forEach(end => {
    const J = x.jFor(end); if (!J) return;
    const pt = parts.find(q => q.cabId === c.id && (type === 'back' ? q.name === 'Back' : /^Toe (skin|kick)$/.test(q.name))); if (!pt) return;
    const n = jtSpots(J, type, 0, type === 'back' ? pt.L : pt.W, x.spread).length;
    if (n) x.addB(`${J.name} (${type === 'back' ? 'back' : 'toe'})`, n);
  }));
}

/* ----- The editor: a "Joint types" box inside a joint template ----- */
function jtTypesBox(h) {
  const cur = ui.jtType || 'bottom', o = (h.types || {})[cur], set = o && !o.same, R = `jtt:${h.id}:${cur}`;
  const tabs = JT_TYPES.map(([k, l]) => { const t = (h.types || {})[k], none = t && !t.same ? t.none : jtLegacy(h, k).none;
    return `<button class="${none ? 'jt-off' : ''}" data-act="jt-type" data-id="${k}" aria-pressed="${k === cur}"${none ? ' title="Not used"' : ''}>${l}</button>`; }).join('');
  let body;
  if (!set) body = `<div class="note">${JT_COUNT_ONLY.includes(cur) ? 'Not used yet.' : 'Uses the template settings above.'}</div><button class="btn sm" data-act="jt-own" data-id="${h.id}:${cur}">Set ${esc(JT_TYPES.find(t => t[0] === cur)[1].toLowerCase())} on its own</button>`;
  else {
    const pts = [0, 1, 2, 3].map(i => (o.pts || [])[i] || {}), anyPt = pts.some(q => q.from && q.from !== 'none');
    body = `<label class="checkrow">${ctl(R, 'none', !!o.none, 'bool', { label: 'No fasteners for this joint' })} No fasteners for this joint</label>
      ${o.none ? '' : `<div class="eyebrow">Locations</div><div class="note">Up to four set spots. Leave them all at "Don't use" to spread holes by the spacing below. A distance can be a formula of L (joint length), like L/2-1.</div>
      <div class="jt-pts">${pts.map((q, i) => `<div class="jt-pt"><b>Location ${i + 1}</b>${ctl(`jtp:${h.id}:${cur}:${i}`, 'from', q.from || 'none', 'select', { label: `Location ${i + 1} from`, options: JT_FROM })}${q.from && q.from !== 'none' ? ctl(`jtp:${h.id}:${cur}:${i}`, 'at', q.at ?? 2, 'text', { label: `Location ${i + 1} distance`, ph: '2 or L/2' }) : ''}</div>`).join('')}</div>
      ${anyPt ? '' : `<div class="autogrid"><label class="f"><span>How many</span>${ctl(R, 'mode', o.mode || 'gap', 'select', { label: 'How many', options: [{ v: 'gap', l: 'By max spacing' }, { v: 'count', l: 'Set count' }, { v: 'spread', l: 'Evenly, none at the ends' }] })}</label>${o.mode === 'count' || o.mode === 'spread' ? fld('Count', R, 'count', o.count ?? 3, 'int') : fld('Max spacing', R, 'maxGap', o.maxGap ?? 8, 'num')}${o.mode === 'spread' ? '' : fld('From front', R, 'front', o.front ?? 2, 'num') + fld('From back', R, 'back', o.back ?? 2, 'num')}</div>`}
      <div class="autogrid">${fld('Center one past length', R, 'centerOver', o.centerOver || 0, 'num', { ph: '0 = off' })}</div>`}
      <div class="jt-row"><label class="f"><span>Copy from</span><select class="jt-copy" data-id="${h.id}:${cur}" aria-label="Copy from another joint type"><option value="">Pick a type…</option>${JT_TYPES.filter(t => t[0] !== cur).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <button class="btn sm" data-act="jt-same" data-id="${h.id}:${cur}">Back to template settings</button></div>`;
  }
  return `<div class="eyebrow">Joint types</div><div class="note">Each joint in the box can have its own spots. Back and toe only count fasteners for the hardware list.</div><div class="seg jt-types" role="group" aria-label="Joint type">${tabs}</div><div class="jt-type">${body}</div>`;
}
function jtFastenerBox(h, R) {
  const k = jtKind(h);
  return `<div class="autogrid"><label class="f wide"><span>Fastener</span>${ctl(R, 'fastener', k, 'select', { label: 'Fastener', options: JT_KINDS })}</label>
    ${k === 'route' ? fld('Dado depth', R, 'routeDepth', h.routeDepth ?? 0.25, 'num') : ''}${k === 'lamello' ? fld('Connector length', R, 'lamLen', h.lamLen ?? 2.2, 'num') : ''}${k === 'combo' ? fld('Dowels this far either side', R, 'comboOff', h.comboOff ?? 1.26, 'num') : ''}</div>
    ${k === 'pocket' ? '<div class="note">Pocket holes are marked on the panel and counted, but angled holes are drilled by hand.</div>' : ''}${k === 'lamello' ? '<div class="note">The face slots are cut on the CNC; the edge slots are marked for the Lamello tool.</div>' : ''}${k === 'route' ? '<div class="note">Panels that drop into a dado get longer by the dado depth.</div>' : ''}`;
}
function jtResolve(kind, id) {
  const [hid, type, i] = id.split(':'), h = hw(hid); if (!h) return null;
  h.types = h.types || {};
  const o = h.types[type] = h.types[type] || { ...jtLegacy(h, type), same: true };
  if (kind === 'jtt') return o;
  o.pts = o.pts || []; return (o.pts[+i] = o.pts[+i] || { from: 'none', at: 2 });
}
function jtAct(act, id) {
  if (act === 'jt-type') { ui.jtType = id; render(); return true; }
  const [hid, type] = (id || '').split(':'), h = hw(hid); if (!h) return false;
  if (act === 'jt-own') { mutate(() => { h.types = h.types || {}; const was = h.types[type]; h.types[type] = { ...JSON.parse(JSON.stringify(was && !was.same ? was : jtLegacy(h, type))), none: false }; delete h.types[type].same; }); return true; }
  if (act === 'jt-same') { mutate(() => { if (h.types) delete h.types[type]; }); return true; }
  return false;
}
function jtCopy(id, from) {
  const [hid, type] = id.split(':'), h = hw(hid); if (!h || !from) return;
  mutate(() => { h.types = h.types || {}; const src = h.types[from] && !h.types[from].same ? h.types[from] : jtLegacy(h, from); h.types[type] = JSON.parse(JSON.stringify(src)); delete h.types[type].same; });
  flash(`Copied ${JT_TYPES.find(t => t[0] === from)[1].toLowerCase()} locations`);
}
document.addEventListener('change', e => { const s = e.target.closest && e.target.closest('.jt-copy'); if (s && s.value) jtCopy(s.dataset.id, s.value); });
