// Shop-built pieces that aren't cabinet boxes (Ayden 2026-11-18, from Bid Reader's notes, 0.57.0): a desk, a slatted wall
// panel, a curved privacy panel and a wall-hung ADA vanity top on Rakks brackets. Each is placed like a cabinet
// (c.made = kind, its settings in c.mp) and builds its own parts here, so the cut list, CNC file, 3D and elevation all
// see real parts. Visible faces are cut from the Finish material and hidden ones from the cabinet material (Ayden's
// rule: materials never come from a style). Laminate on a core is listed as square feet of laminate on the hardware
// list; the core layers are the cut parts.
'use strict';

// Long core pieces split into this many equal lengths, each fitting the sheet.
function splitLen(L, m) { const max = Math.max(12, ((m && m.sheetL) || 97) - 1); const n = Math.max(1, Math.ceil(L / max - 1e-9)); return { n, len: r3(L / n) }; }
// Points of a quarter circle from angle a0 to a1 (degrees) about cx, cy.
function arcPts(cx, cy, r, a0, a1, seg = 12) {
  const out = []; for (let i = 0; i <= seg; i++) { const a = (a0 + (a1 - a0) * i / seg) * Math.PI / 180; out.push({ x: r3(cx + r * Math.cos(a)), y: r3(cy + r * Math.sin(a)) }); }
  return out;
}
// A through cutout (a sink hole) as a closed tool path the CNC follows, kept inside the line by the bit's radius.
function cutoutPath(x, y, w, h, why) {
  const tool = typeof peDefTool === 'function' ? peDefTool() : '3_8COMP', dia = r3(typeof peToolDia === 'function' ? peToolDia(tool) || 0.375 : 0.375), k = dia / 2;
  const pts = [{ x: x + k, y: y + k }, { x: x + w - k, y: y + k }, { x: x + w - k, y: y + h - k }, { x: x + k, y: y + h - k }].map(q => ({ x: r3(q.x), y: r3(q.y) }));
  return { type: 'path', pts, closed: true, side: 'center', depth: 0, through: true, tool, dia, face: 'top', why };
}
const LAM_SQFT = 'Laminate (HPL), sq ft';
const lamBom = (bom, sqin) => { if (sqin > 0) bom[LAM_SQFT] = r3((bom[LAM_SQFT] || 0) + Math.ceil(sqin / 144 * 10) / 10); };

/* ---------- The pieces ---------- */
const MADE = {
  // 4. A laminate desktop with an eased front edge, open knee space, and a support panel at each end that nothing holds up.
  desk: {
    name: 'Desk', cat: 'Base', w: 48, h: 30, d: 24, elev: 0, folder: 'Desks and Panels',
    mp: { layers: 1, ends: 'auto', apron: 0 }, price: { base: 150, perFt: 90 },
    fields: [['layers', 'Core layers under the laminate', 'int'], ['ends', 'Support panels', 'select', [['auto', 'Auto (where nothing holds it up)'], ['both', 'Both ends'], ['L', 'Left end'], ['R', 'Right end'], ['none', 'None (between cabinets)']]], ['apron', 'Modesty panel height (0 = none)', 'len']],
    build(c, mp, x) {
      const { part, cm, fm, bom, warn } = x, layers = Math.max(1, mp.layers | 0), topT = layers * cm.thick, H = c.h, D = c.d;
      const ends = madeEnds(c, mp.ends);
      // Ends with nothing beside them get a support panel; one against a wall gets a cleat.
      const panW = fm.thick, xs0 = ends.L === 'panel' ? panW : 0, xs1 = ends.R === 'panel' ? c.w - panW : c.w;
      for (let k = 0; k < layers; k++) {
        const s = splitLen(c.w, cm);
        const pt = part(`Desktop core${layers > 1 ? ' ' + (k + 1) : ''}`, cm, s.len, D, { kind: 'topbot', qty: s.n, ops: k === layers - 1 ? [{ type: 'edge', profile: 'eased', face: 'front', why: 'eased front edge' }] : [] });
        pt.pos = { x: 0, y: H - topT + k * cm.thick, z: 0, dx: c.w, dy: cm.thick, dz: D }; pt.look = 'finished';
        if (s.n > 1 && !k) warn.push(`The desktop is longer than a sheet, so its core comes in ${s.n} pieces. Stagger the seams.`);
      }
      lamBom(bom, c.w * D + c.w * topT + 2 * D * topT);
      ['L', 'R'].forEach(e => {
        const x0 = e === 'L' ? 0 : c.w - panW;
        if (ends[e] === 'panel') { const pt = part(`Support panel (${e})`, fm, r3(H - topT), r3(D - 1), { kind: 'applied' }); pt.pos = { x: x0, y: 0, z: 0, dx: panW, dy: H - topT, dz: D - 1 }; pt.fin = true; }
        if (ends[e] === 'wall') { const pt = part(`Wall cleat (${e})`, cm, r3(D - 2), 3, { kind: 'stretcher' }); pt.pos = { x: e === 'L' ? 0 : c.w - cm.thick, y: H - topT - 3, z: 0, dx: cm.thick, dy: 3, dz: D - 2 }; }
      });
      const bl = r3(xs1 - xs0), bs = splitLen(bl, cm), back = part('Back cleat', cm, bs.len, 3, { kind: 'stretcher', qty: bs.n }); back.pos = { x: xs0, y: H - topT - 3, z: 0, dx: bl, dy: 3, dz: cm.thick };
      if (+mp.apron > 0) { const pt = part('Modesty panel', fm, bl, r3(+mp.apron), { kind: 'applied' }); pt.pos = { x: xs0, y: H - topT - mp.apron, z: cm.thick, dx: bl, dy: +mp.apron, dz: fm.thick }; pt.fin = true; }
      const knee = H - topT - (+mp.apron || 0);
      if (knee < 27) warn.push(`Knee space is ${fmtLen(knee, 1)} high; ADA wants 27" at least.`);
    },
  },
  // 5. Slats wrapped in the finish (all four edges banded) on a finished backer, sized by width and height.
  slatwall: {
    name: 'Slat Wall Panel', cat: 'Wall', w: 48, h: 96, d: 1.5, elev: 0, folder: 'Desks and Panels',
    mp: { slatW: 3, gap: 1, dir: 'v', backer: 'on' }, price: { base: 0, perFt: 0, perSq: 28 },
    fields: [['slatW', 'Slat width', 'len'], ['gap', 'Gap between slats', 'len'], ['dir', 'Slats run', 'select', [['v', 'Up and down'], ['h', 'Across']]], ['backer', 'Backer panel', 'select', [['on', 'Yes (finished, shows in the gaps)'], ['off', 'No (slats go on the wall)']]]],
    build(c, mp, x) {
      const { part, fm, warn } = x, sw = Math.max(0.5, +mp.slatW || 3), g0 = Math.max(0, +mp.gap || 0), vert = mp.dir !== 'h';
      const run = vert ? c.w : c.h, len = vert ? c.h : c.w;
      const n = Math.max(1, Math.floor((run + g0) / (sw + g0) + 1e-9)), gap = n > 1 ? r3((run - n * sw) / (n - 1)) : 0;
      const bT = mp.backer === 'off' ? 0 : fm.thick;
      if (bT) {
        // A backer bigger than a sheet goes up in panels side by side.
        const across = Math.max(1, Math.ceil(c.w / (((fm.sheetW || 49) < 49 ? fm.sheetW : 48)) - 1e-9)), pw = r3(c.w / across), s = splitLen(c.h, fm);
        const pt = part('Slat wall backer', fm, s.len, pw, { kind: 'applied', qty: across * s.n }); pt.fin = true;
        pt.pos = { x: 0, y: 0, z: 0, dx: c.w, dy: c.h, dz: bT };
        if (across * s.n > 1) warn.push(`The backer is bigger than a sheet: ${across * s.n} panels of ${fmtLen(pw, 1)} × ${fmtLen(s.len, 1)}.`);
      }
      const s = splitLen(len, fm);
      if (s.n > 1) warn.push(`Slats are longer than a sheet, so each is in ${s.n} pieces.`);
      const band = (S.edgebands[0] || {}).id || '';
      const pt = part('Slat', fm, s.len, sw, { kind: 'filler', qty: n * s.n }); pt.fin = true;
      pt.band = { L1: band, L2: band, W1: band, W2: band }; pt.edges = edgeSummary('filler', pt.band);
      pt.pos3 = []; for (let i = 0; i < n; i++) { const a = r3(i * (sw + gap)); pt.pos3.push(vert ? { x: a, y: 0, z: bT, dx: sw, dy: c.h, dz: fm.thick } : { x: 0, y: a, z: bT, dx: c.w, dy: sw, dz: fm.thick }); }
      x.note(`${n} slats ${fmtLen(sw, 1)} wide, ${fmtLen(gap, 1)} apart`);
    },
  },
  // 6. A divider panel standing out from the wall with its top front corner rounded (12" in the Tech Center).
  privacy: {
    name: 'Curved Privacy Panel', cat: 'Base', w: 1, h: 18, d: 24, elev: 30, folder: 'Desks and Panels',
    mp: { radius: 12, corners: 'front' }, price: { base: 180, perFt: 0 },
    fields: [['radius', 'Corner radius', 'len'], ['corners', 'Rounded corners', 'select', [['front', 'Top front corner'], ['both', 'Both top corners (stands free)']]]],
    build(c, mp, x) {
      const { part, fm, warn } = x, L = c.d, W = c.h, r = Math.max(0, Math.min(+mp.radius || 0, L, W));
      if (r < (+mp.radius || 0) - 0.01) warn.push(`The radius is bigger than the panel; it is cut at ${fmtLen(r, 1)}.`);
      // Part outline: x along the panel from the wall end, y up from its bottom.
      let out = [{ x: 0, y: 0 }, { x: L, y: 0 }];
      out.push(...(r > 0 ? arcPts(L - r, W - r, r, 0, 90) : [{ x: L, y: W }]));
      if (mp.corners === 'both' && r > 0) out.push(...arcPts(r, W - r, r, 90, 180)); else out.push({ x: 0, y: W });
      out = out.filter((q, i) => !i || Math.hypot(q.x - out[i - 1].x, q.y - out[i - 1].y) > 1e-4);
      const pt = part('Privacy panel', fm, r3(L), r3(W), { kind: 'applied' }); pt.fin = true; pt.outline = out;
      pt.ext = { pts: out, thick: fm.thick };
    },
  },
  // 3. A laminate top on 2 layers of 3/4" core with a front apron, hung on Rakks EHV brackets, no cabinet under it.
  // ADA: knee clearance under the apron 29" at least, the top 34" at most.
  adatop: {
    name: 'Wall-Hung ADA Vanity Top', cat: 'Base', w: 36, h: 4, d: 22, elev: 30, folder: 'Vanities',
    mp: { layers: 2, splash: 4, sink: 'sk-bath' }, price: { base: 120, perFt: 60 },
    fields: [['layers', 'Core layers under the laminate', 'int'], ['splash', 'Backsplash height (0 = none)', 'len'], ['sink', 'Sink cutout', 'select', () => [['', 'None'], ...FIXT_LIB.filter(f => f.kind === 'sink' && !f.apron).map(f => [f.id, `${f.name} (${fmtLen(f.w, 1)} × ${fmtLen(f.d, 1)})`])]]],
    build(c, mp, x) {
      const { part, cm, fm, bom, warn } = x, layers = Math.max(1, mp.layers | 0), topT = layers * cm.thick, D = c.d, H = c.h;
      const top = c.elev + H;
      if (top > 34.001) warn.push(`ADA: the top is at ${fmtLen(top, 1)}; it should be 34" at most.`);
      if (c.elev < 28.999) warn.push(`ADA: knee clearance under the apron is ${fmtLen(c.elev, 1)}; it should be 29" at least.`);
      const sk = mp.sink && fixtPreset(mp.sink);
      const cut = sk ? cutoutPath((c.w - (sk.w - 1)) / 2, Math.max(2, (D - (sk.d - 1)) / 2 - 1), sk.w - 1, sk.d - 1, 'sink cutout (check the sink template)') : null;
      const cw = sk ? sk.w - 1 : 0, chh = sk ? sk.d - 1 : 0;
      if (cut && (cw > c.w - 4 || chh > D - 3)) warn.push('The sink cutout is too big for this top.');
      for (let k = 0; k < layers; k++) {
        const s = splitLen(c.w, cm);
        if (s.n > 1 && cut) warn.push('This top is longer than a sheet and has a sink; place the seam clear of the sink by hand.');
        const pt = part(`Top core${layers > 1 ? ' ' + (k + 1) : ''}`, cm, s.len, D, { kind: 'topbot', qty: s.n, ops: cut && s.n === 1 ? [{ ...cut }] : [] });
        pt.pos = { x: 0, y: H - topT + k * cm.thick, z: 0, dx: c.w, dy: cm.thick, dz: D }; pt.look = 'finished';
      }
      const apH = r3(H - topT);
      if (apH > 0.25) { const pt = part('Apron', cm, r3(c.w), apH, { kind: 'filler' }); pt.pos = { x: 0, y: 0, z: D - cm.thick, dx: c.w, dy: apH, dz: cm.thick }; pt.look = 'finished'; }
      const sp = +mp.splash || 0;
      if (sp > 0) { const pt = part('Backsplash core', cm, r3(c.w), r3(sp), { kind: 'filler' }); pt.pos = { x: 0, y: H, z: 0, dx: c.w, dy: sp, dz: cm.thick }; pt.look = 'finished'; }
      // Side splashes where the top meets a wall at the sink.
      const ends = madeEnds(c, 'auto');
      if (sp > 0 && sk) ['L', 'R'].forEach(e => { if (ends[e] !== 'wall') return; const pt = part(`Side splash (${e})`, cm, r3(D - cm.thick), r3(sp), { kind: 'filler' }); pt.pos = { x: e === 'L' ? 0 : c.w - cm.thick, y: H, z: cm.thick, dx: cm.thick, dy: sp, dz: D - cm.thick }; pt.look = 'finished'; });
      lamBom(bom, c.w * D + c.w * H + (sp > 0 ? c.w * (sp + cm.thick) : 0));
      // Rakks EHV vanity brackets, at most 32" apart (check Rakks' load table for the job).
      const n = Math.max(2, Math.ceil((c.w - 4) / 32 - 1e-9) + 1);
      bom[`Rakks EHV vanity bracket, ${fmtLen(Math.round(D - 1), 1)} deep`] = n;
      x.note(`${n} brackets, knee clearance ${fmtLen(c.elev, 1)}, top at ${fmtLen(top, 1)}`);
    },
  },
};
const madeDef = c => (c && c.made && MADE[c.made]) || null;
const madeMp = c => ({ ...(MADE[c.made] || {}).mp, ...(c.mp || {}) });
// What is at each end of a piece: another cabinet, a wall, or nothing. ends: 'auto' or the panel pick.
function madeEnds(c, pick) {
  const out = { L: 'panel', R: 'panel' };
  ['L', 'R'].forEach(e => {
    if (pick === 'none' || ((pick === 'L' || pick === 'R') && pick !== e)) { out[e] = 'none'; return; }
    if (pick !== 'auto') return;
    if (!c.wall || typeof nearestAt !== 'function') return;
    const n = inRoomOf(c, () => wall(c.wall) ? nearestAt(c, (e === 'L') === (c.side === 1) ? -1 : 1) : null);
    if (n && n.gap < 0.5) out[e] = n.kind === 'wall' ? 'wall' : 'none';
  });
  return out;
}
function madeBuildParts(c) {
  const d = madeDef(c), mp = madeMp(c), lbl = LBL[c.id] || c.name, parts = [], bom = {}, warn = [], notes = [];
  const mt = cabMatT(cabSet(c, 'cabMatT')), cm = mat(mt.carcass) || S.materials[0], fm = mat(finishMat(c)) || cm, ptT = partTpl(cabSet(c, 'partT'));
  const part = (name, m, L, Wd, o = {}) => {
    const band = partBands(ptT, o.kind);
    const pt = { cab: lbl, cabId: c.id, name, kind: o.kind || '', mat: m.id, L: r3(L), W: r3(Wd), T: m.thick, qty: o.qty || 1, grain: !!m.grain, band, edges: edgeSummary(o.kind, band), ops: o.ops || [] };
    if (!(L > 0) || !(Wd > 0)) warn.push(`${name} has a zero or negative size. Check the sizes.`);
    parts.push(pt); return pt;
  };
  d.build(c, mp, { part, cm, fm, bom, warn, note: s => notes.push(s) });
  if (c.addParts && c.addParts.length && typeof addedParts === 'function') addedParts(c, parts, warn, part, cm);
  const removed = (c.partEdits && typeof applyPartEdits === 'function') ? applyPartEdits(c, parts, warn, ptT) : [];
  return { parts, bom, warn, fronts: [], inD: c.d, inW: c.w, removed, notes };
}
// Sizes that follow the settings: a slat wall is as deep as its backer and slats, a privacy panel as wide as its board.
function madeSync(c) {
  const d = madeDef(c); if (!d) return;
  const mp = madeMp(c), cm = mat(cabMatT(cabSet(c, 'cabMatT')).carcass) || S.materials[0], fm = mat(finishMat(c)) || cm;
  if (c.made === 'slatwall') c.d = r3((mp.backer === 'off' ? 0 : fm.thick) + fm.thick);
  if (c.made === 'privacy') c.w = r3(fm.thick);
}
// Own price when the price sheet has none for the product: these aren't priced like cabinets.
function madePrice(c) { const d = madeDef(c); return d ? { own: true, ...d.price } : null; }

/* ---------- Library ---------- */
function madeLibItems() {
  return Object.entries(MADE).map(([k, d]) => ({ id: 'made-' + k, name: d.name, cat: d.cat, w: d.w, h: d.h, d: d.d, elev: d.elev, rows: [], params: {},
    construction: { toeKick: false, top: 'full' }, made: k, mp: clone(d.mp), noTop: true, folder: d.folder, group: 'made' }));
}
function ensureMadeLib(s, lib) {
  const had = new Set(s.madeLibKeys || []);
  madeLibItems().forEach(l => { if (had.has(l.id)) return; had.add(l.id); if (!lib.some(x => x.id === l.id)) lib.push(l); });
  s.madeLibKeys = [...had];
}

/* ---------- Drawing ---------- */
// Boxes for one part: its pos, or one per slat (pos3).
const madeBoxes = q => q.pos3 || (q.pos ? [q.pos] : []);
function madeLook(c, q) { const m = mat(q.mat); return typeof texLook === 'function' ? texLook(m, q.fin || q.look === 'finished' ? 'finished' : 'inside', c) : m; }
function madeMeshes(c, opts = {}) {
  const grp = new THREE.Group(), b = buildParts(c);
  b.parts.forEach(q => {
    const M = mat3(madeLook(c, q), opts);
    if (q.ext) {
      // A shaped panel: its outline in the panel's own plane (along the depth, up), cut to its thickness across the width.
      const sh = new THREE.Shape(q.ext.pts.map(p => new THREE.Vector2(p.x, p.y)));
      const g = new THREE.ExtrudeGeometry(sh, { depth: q.ext.thick, bevelEnabled: false, curveSegments: 1 });
      const mesh = new THREE.Mesh(g, M); mesh.rotation.y = -Math.PI / 2; mesh.position.set(q.ext.thick, 0, 0);
      if (!R3) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), edgeMat3()));
      mesh.userData.part = q.name; grp.add(mesh); return;
    }
    madeBoxes(q).forEach(p => { const m = box3(p.dx, p.dy, p.dz, M, p.x + p.dx / 2, p.y + p.dy / 2, p.z + p.dz / 2); m.userData.part = q.name; grp.add(m); });
  });
  grp.traverse(o => { o.userData.cabId = c.id; });
  return grp;
}
// Elevation: each part's face as seen from the front, back to front.
function madeFrontSVG(c, ex, by, opts = {}) {
  const b = buildParts(c), mats = [], faces = [];
  b.parts.forEach(q => {
    const m = madeLook(c, q);
    if (q.ext) { faces.push({ z: 0, m, svg: `<rect ${fillFor(m, 'ev-box')} x="${r3(ex)}" y="${r3(by - Math.max(...q.ext.pts.map(p => p.y)))}" width="${r3(q.ext.thick)}" height="${r3(Math.max(...q.ext.pts.map(p => p.y)))}"/>` }); return; }
    madeBoxes(q).forEach(p => faces.push({ z: p.z + p.dz, m, svg: `<rect ${fillFor(m, 'ev-box')} x="${r3(ex + p.x)}" y="${r3(by - p.y - p.dy)}" width="${r3(p.dx)}" height="${r3(p.dy)}"/>` }));
  });
  faces.sort((a, b2) => a.z - b2.z);
  const s = faces.map(f => { mats.push(f.m && f.m.id); return f.svg; }).join('');
  return opts.withDefs ? { svg: s, mats } : s;
}

/* ---------- Size tab ---------- */
function madeBox(c) {
  const d = madeDef(c); if (!d) return '';
  const mp = madeMp(c), R = 'cabmp:' + c.id, notes = (buildParts(c).notes || []);
  const f = ([k, label, type, op]) => type === 'select' ? fld(label, R, k, mp[k] ?? '', 'select', { options: (typeof op === 'function' ? op() : op).map(([v, l]) => ({ v, l })) }) : fld(label, R, k, mp[k] ?? '', type);
  return `<div class="psec box">${secHead('sliders', d.name, 'violet')}<div class="grid2">${d.fields.map(f).join('')}</div>${notes.length ? `<div class="note">${esc(notes.join('. '))}.</div>` : ''}</div>`;
}

/* ---------- Countertops built in the shop (13) ---------- */
// A countertop style with core layers (tpl.layers > 0) is laminate glued on that many layers of core (the cabinet
// material unless the style names one), so its layers, backsplash and side splashes are cut parts. Sinks on the run
// get a cutout through every layer. The edge profile goes on the top layer's front edge.
const TOP_EDGES = [['square', 'Square'], ['halfbull', 'Half bullnose'], ['bullnose', 'Full bullnose'], ['eased', 'Eased'], ['bevel', 'Bevel'], ['postform', 'Post-form']];
const shopTop = tpl => !!tpl && (+tpl.layers | 0) > 0;
function topCoreParts() {
  const out = [], runs = countertopRuns().filter(r => r.on && shopTop(r.tpl));
  const room = curRoom(), cm0 = mat(cabMatT(roomSet('cabMatT')).carcass) || S.materials[0];
  runs.forEach((r, i) => {
    const t = r.tpl, cm = mat(t.core) || cm0, layers = t.layers | 0, lbl = `Top ${i + 1}`, ptT = partTpl(roomSet('partT'));
    const part = (name, L, W, o = {}) => { const band = partBands(ptT, o.kind || 'topbot'); const p = { cab: lbl, cabId: 'top:' + room.id + ':' + r.key, name, kind: o.kind || 'topbot', mat: cm.id, L: r3(L), W: r3(W), T: cm.thick, qty: o.qty || 1, grain: !!cm.grain, band, edges: edgeSummary(o.kind || 'topbot', band), ops: o.ops || [], top: true }; if (o.note) p.note = o.note; out.push(p); return p; };
    const x0 = r.start - r.ovS, sinks = (typeof fixtList === 'function' ? fixtList() : []).filter(f => fixtSink(f) && !f.apron && f.wall === r.wall && f.side === r.side && f.off + f.w / 2 > x0 && f.off + f.w / 2 < x0 + r.len);
    const s = splitLen(r.len, cm), notes = [];
    if (r.pts || r.shape) notes.push('corner joint: cut the end to the plan');
    for (let k = 0; k < layers; k++) {
      for (let j = 0; j < s.n; j++) {
        const a = j * s.len, ops = [];
        sinks.forEach(f => {
          const cx0 = f.off - x0 + 0.5 - a, cw = f.w - 1, ch = Math.min(f.d - 1, r.depth - 4);
          if (cx0 + cw <= 0 || cx0 >= s.len) return;
          if (cx0 < 0 || cx0 + cw > s.len) { notes.push(`${fixtName(f)} crosses a seam; move the seam`); return; }
          ops.push(cutoutPath(cx0, Math.max(1.5, (t.frontOverhang || 0) + 2.5), cw, ch, `${fixtName(f)} cutout (check the sink template)`));
        });
        if (k === layers - 1 && t.edge && t.edge !== 'square') ops.push({ type: 'edge', profile: t.edge, face: 'front', why: (TOP_EDGES.find(e => e[0] === t.edge) || [0, t.edge])[1] + ' front edge' });
        part(`Countertop core${layers > 1 ? ', layer ' + (k + 1) : ''}${s.n > 1 ? `, piece ${j + 1} of ${s.n}` : ''}`, s.len, r.depth, { ops });
      }
    }
    if (+t.backsplash > 0) { const b = splitLen(r.len, cm); part('Backsplash core', b.len, +t.backsplash, { kind: 'filler', qty: b.n }); }
    const sideAt = t.sideSplash === 'ends' || (t.sideSplash === 'sinks' && sinks.length);
    if (+t.backsplash > 0 && sideAt) [['S', r.blockS], ['E', r.blockE]].forEach(([e, blocked]) => { if (blocked) part(`Side splash (${e === 'S' ? 'start' : 'end'})`, r.depth - cm.thick, +t.backsplash, { kind: 'filler' }); });
    if (notes.length) out.filter(p => p.cab === lbl).forEach(p => { p.note = notes.join('; '); });
  });
  return out;
}
// Top style box: how it is built and how it is priced.
function topBuildBox(t) {
  const R = 'top:' + t.id, mats = S.materials.filter(m => m.kind === 'sheet').map(m => ({ v: m.id, l: m.name }));
  return `<div class="psec box">${secHead('stack', 'Built in the shop', 'violet')}<div class="grid2">
    ${fld('Core layers (0 = bought in)', R, 'layers', t.layers || 0, 'int')}${fld('Core material', R, 'core', t.core || '', 'select', { options: [{ v: '', l: 'Cabinet material' }, ...mats] })}
    ${fld('Front edge', R, 'edge', t.edge || 'square', 'select', { options: TOP_EDGES.map(([v, l]) => ({ v, l })) })}${fld('Side splash', R, 'sideSplash', t.sideSplash || '', 'select', { options: [{ v: '', l: 'None' }, { v: 'sinks', l: 'Only at sinks' }, { v: 'ends', l: 'Every end against a wall' }] })}
    ${fld('Priced', R, 'priceBy', t.priceBy || 'sqft', 'select', { options: [{ v: 'sqft', l: 'By the square foot' }, { v: 'ft', l: 'By the foot' }] })}</div>
    <div class="note help">With core layers, each run's layers, backsplash and side splashes are cut parts with the sink cutouts, and go to the CNC.</div></div>`;
}
// The shop's laminate top from the bids: laminate on 2 layers of 3/4" core, half bullnose, 4" splash, side splash at sinks, by the foot.
const LAM2_TOP = { id: 'top-lam2', name: 'Laminate on 2 layers 3/4" ply, half bullnose', mat: 'm-lam', thick: 1.5, frontOverhang: 1, endOverhang: 0.75, backsplash: 4, layers: 2, core: '', edge: 'halfbull', sideSplash: 'sinks', priceBy: 'ft' };
function ensureLamTop(s) {
  if (!s || s.lamTop2 || !Array.isArray(s.countertops)) return s;
  if (!s.countertops.some(t => t.id === LAM2_TOP.id)) s.countertops.push({ ...LAM2_TOP, mat: (s.materials || []).some(m => m.id === 'm-lam') ? 'm-lam' : (s.countertops[0] || {}).mat });
  s.lamTop2 = 1; return s;
}
// Ayden 2026-11-18: a flat crown called Cmold for crown runs, about $4/ft. Added once per job (s.cmold), so a deleted one stays deleted.
const CMOLD = { id: 'mo-cmold', name: 'Cmold', profile: 'flat', h: 3.5, d: 0.75, fill: false, mat: 'm-mdf' };
function ensureCmold(s) {
  if (!s || s.cmold || !Array.isArray(s.moldings)) return s;
  if (!s.moldings.some(m => m.id === CMOLD.id)) s.moldings.push({ ...CMOLD, mat: (s.materials || []).some(m => m.id === 'm-mdf') ? 'm-mdf' : (s.moldings[0] || {}).mat });
  s.cmold = 1; return s;
}
const topRate = (t, len, depth, rate) => t.priceBy === 'ft' ? len / 12 * rate : len * depth / 144 * rate;
// The room's shop-built tops in the job export (and so the CNC parts file), as one entry after the cabinets.
function topExportCab(partEx) {
  const ps = topCoreParts(); if (!ps.length) return [];
  return [{ label: 'Tops', name: 'Countertops built in the shop', template: 'countertop', category: 'Top', countertop: true, parts: ps.map(partEx) }];
}

/* ---------- Job lines (14): window sills and other runs priced by the foot, with no wall needed ---------- */
// S.job.lines: { id, name, qty, len (inches, for per-foot lines), unit 'ft' | 'each', rate, material }.
const JOB_LINE_PRESETS = [{ name: 'Window sill, solid surface', unit: 'ft', material: 'Solid surface' }, { name: 'Window sill, laminate', unit: 'ft', material: 'Laminate' }, { name: 'Other line', unit: 'each' }];
const jobLineList = () => (S.job.lines = Array.isArray(S.job.lines) ? S.job.lines : []);
const jobLineAmt = l => (+l.qty || 0) * (+l.rate || 0) * (l.unit === 'ft' ? (+l.len || 0) / 12 : 1);
function jobLineRef(id) { return (S.job.lines || []).find(l => l.id === id) || null; }
function addJobLine(o) { const l = { id: uid('jl'), name: 'Line', qty: 1, len: 0, unit: 'each', rate: '', material: '', ...o }; jobLineList().push(l); return l; }
// For priceJob: priced lines only.
function jobLinePrices() {
  return (S.job.lines || []).filter(l => jobLineAmt(l) > 0).map(l => ({ name: `${l.name}${l.material ? ', ' + l.material : ''} (${l.unit === 'ft' ? `${l.qty} × ${fmtLen(+l.len || 0, 1)}, ${money(+l.rate)}/ft` : `${l.qty} × ${money(+l.rate)}`})`, amount: jobLineAmt(l) }));
}
function jobLinesCard() {
  const ls = S.job.lines || [], R = l => 'jline:' + l.id;
  const row = l => `<tr><td>${ctl(R(l), 'name', l.name, 'text', { label: 'Line' })}</td><td>${ctl(R(l), 'material', l.material || '', 'text', { label: 'Material' })}</td>
    <td style="width:70px">${ctl(R(l), 'qty', l.qty, 'num', { label: 'How many' })}</td><td style="width:90px">${l.unit === 'ft' ? ctl(R(l), 'len', l.len, 'len', { label: 'Length each' }) : '<span class="muted">–</span>'}</td>
    <td style="width:110px">${ctl(R(l), 'unit', l.unit, 'select', { options: [{ v: 'ft', l: 'Per foot' }, { v: 'each', l: 'Each' }], label: 'Priced' })}</td><td style="width:90px">${ctl(R(l), 'rate', l.rate, 'num', { label: 'Price', ph: '0.00' })}</td>
    <td class="n">${jobLineAmt(l) ? money(jobLineAmt(l)) : '–'}</td><td><button class="btn sm" data-act="jline-del" data-id="${l.id}" title="Take this line off the job">${icon('trash')}</button></td></tr>`;
  return `<div class="psec box prx-room" id="prx-jobl">${secHead('list', 'Job lines', 'teal')}<div class="prx-roomh"><span class="note">Things priced on their own that aren't drawn on a wall, like window sills by the foot.</span></div>
    ${ls.length ? `<div class="tscroll"><table class="t quote"><thead><tr><th>Line</th><th>Material</th><th class="r">Qty</th><th>Length each</th><th>Priced</th><th>Price</th><th class="r">Comes to</th><th></th></tr></thead><tbody>${ls.map(row).join('')}</tbody></table></div>` : ''}
    <div class="row-actions">${JOB_LINE_PRESETS.map((p, i) => `<button class="btn sm" data-act="jline-add" data-id="${i}">${icon('plus')}${esc(p.name)}</button>`).join('')}</div></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act="jline-add"],[data-act="jline-del"]'); if (!b) return;
  if (b.dataset.act === 'jline-add') mutate(() => { addJobLine({ ...JOB_LINE_PRESETS[+b.dataset.id] }); });
  else mutate(() => { S.job.lines = jobLineList().filter(l => l.id !== b.dataset.id); });
});
