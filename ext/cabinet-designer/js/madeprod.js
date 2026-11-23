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
// A sink's cutout (sinkCut in fixtures.js) as the tool path the CNC follows, on a part whose x runs along the wall from
// ax and whose y runs back from its front edge (D deep). The bit stays inside the line, so round corners keep their
// radius (a corner tighter than the bit comes out at the bit's radius). An apron sink's notch is open at the front edge.
function sinkCutPath(k, ax, D, why, mirror, L) {
  const tool = typeof peDefTool === 'function' ? peDefTool() : '3_8COMP', dia = r3(typeof peToolDia === 'function' ? peToolDia(tool) || 0.375 : 0.375), t = dia / 2;
  const X = x => r3(mirror ? L - (x - ax) : x - ax), Y = y => r3(Math.max(0, D - y));
  const pts = k.open ? apronNotchPts(k.x0 + t, k.y0 + t, k.x1 - t, k.y1, Math.max(0, k.r - t)) : roundRectPts(k.x0 + t, k.y0 + t, k.x1 - t, k.y1 - t, Math.max(0, k.r - t), k.oval);
  return { type: 'path', pts: pts.map(q => ({ x: X(q.x), y: Y(q.y) })), closed: !k.open, side: 'center', depth: 0, through: true, tool, dia, face: 'top', why, sink: true };
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
  // 0.59.27 (Ayden 2026-11-19: "the bid reader keeps putting shelves without panels and keeps missing panels"): a finished panel
  // standing on its own, out from the wall, with no cabinet it belongs to. It holds up the open end of a stack of floating shelves
  // (a shelf gable), stands beside a fridge, or is any panel from a bid with no box beside it. Cut from the Finish material,
  // as wide as that sheet is thick. A panel beside a cabinet covers that cabinet's end, so the cabinet gets no automatic panel there.
  panel: {
    name: 'Support Panel', cat: 'Tall', w: 0.75, h: 84, d: 24, elev: 0, folder: 'Desks and Panels',
    mp: {}, price: { base: 0, perFt: 0 }, fields: [],
    build(c, mp, x) {
      // 0.61.3: an automatic end panel piece is cut and priced by its cabinet (panelPieces); here it is only drawn.
      if (c.autoOf) { const o = allCabs().find(k => k.id === c.autoOf), pm = o && typeof panelFor === 'function' && mat(panelFor(o).mat); x.show({ name: 'End panel', mat: (pm || x.fm).id, fin: true, pos: { x: 0, y: 0, z: 0, dx: c.w, dy: c.h, dz: c.d } }); x.note('Cut and priced with its cabinet as an applied end panel. Move or resize it to make it your own'); return; }
      const pt = x.part('Support panel', x.fm, r3(c.h), r3(c.d), { kind: 'applied' }); pt.fin = true;
      pt.pos = { x: 0, y: 0, z: 0, dx: c.w, dy: c.h, dz: c.d };
    },
  },
  // 0.61.0 (Ayden 2026-11-23: panel-ready fridge columns and dishwashers came in as cabinets): the panel fronts on a
  // panel-ready appliance, standing in front of it. mp.fr = the fronts [{ z (up from the bottom), h }], from Mozaik's
  // doors and drawer fronts on the product; none = one front the whole size. Cut from the Finish material and priced like
  // doors of the room's door style.
  apfront: {
    name: 'Appliance Panel Front', cat: 'Base', w: 24, h: 34.5, d: 0.75, elev: 0, folder: 'Desks and Panels',
    mp: { fr: [] }, price: { base: 0, perFt: 0 }, fields: [],
    build(c, mp, x) {
      const fr = apFronts(c, mp), fx = apFixt(c);
      fr.forEach((q, i) => {
        // 0.61.3 (Ayden 2026-11-23: "have them use the door styles"): each front is a door of the room's door style (shape
        // only); its material comes from the Finish, like every door (frontStyle applies withFinish).
        // 0.61.5: a front can be one of a pair (Mozaik's French-door fridge columns): x and w across the appliance.
        const fw = q.w, f = { type: 'door', x0: q.x, x1: q.x + fw, z0: q.z, z1: q.z + q.h }, st = apStyle(c, f), ds = st.ds, dm = mat(ds.mat) || x.fm;
        const name = fr.length > 1 ? `Panel front ${i + 1}` : 'Panel front';
        if (ds.source === 'buyout') { x.bom[`${name}, ${ds.name} ${fmtLen(fw, 1)} × ${fmtLen(q.h, 1)} (buyout)`] = 1; x.note(`${name} is bought from the door maker`); }
        const ops = st.framed && ds.type === 'routed' ? [{ type: 'pocket', x: r3(ds.rail), y: r3(ds.stile), w: r3(q.h - 2 * ds.rail), h: r3(fw - 2 * ds.stile), depth: r3(+ds.pocketDepth || 0.25), face: 'front', why: 'shaker field' }] : [];
        if (st.framed && ds.type !== 'routed' && ds.source !== 'buyout') x.warn.push(`${name}: a ${ds.name} front is cut here as one panel; build it like the room's doors.`);
        if (ds.source !== 'buyout') { const pt = x.part(name, dm, r3(q.h), r3(fw), { kind: 'door', ops }); pt.fin = true; pt.front = true; pt.pos = { x: q.x, y: q.z, z: 0, dx: fw, dy: q.h, dz: c.d }; }
        const pull = apPull(c, fx, q, fr);
        if (pull) x.bom[pull.name] = (x.bom[pull.name] || 0) + 1;
        x.front({ f, ds, framed: st.framed, m: dm, pull });
      });
    },
  },
  // 0.61.7 (Ayden 2026-11-23, the Argil laundry: "the openings on the left and right are for the doors to slide in"):
  // pocket doors on their own, standing in front of an opening built from separate pieces (end panels, fillers, shelves).
  // The doors hinge at the outer edges; open, each swings to 90°, steps into the slot at its end (slotL / slotR wide,
  // measured in from that edge) and slides back (back = how deep the pocket is). Doors of the room's door style, cut from
  // the Finish like every door; a pocket door system per door and the room's pull on the hardware list.
  pocketdoors: {
    name: 'Pocket Doors', cat: 'Tall', w: 60, h: 96, d: 0.75, elev: 0, folder: 'Pocket Doors',
    mp: { n: 2, slotL: 4, slotR: 4, back: 30, front: 'auto' }, price: { base: 0, perFt: 0 },
    fields: [['front', 'Stands', 'select', [['auto', 'In front of what is behind it (auto)'], ['own', 'At the Outset I type']]], ['n', 'Doors', 'select', [[2, '2 (a pair)'], [1, '1 (hinged left)']]], ['slotL', 'Left pocket slot width', 'len'], ['slotR', 'Right pocket slot width', 'len'], ['back', 'Pocket depth (how far back they slide)', 'len']],
    build(c, mp, x) {
      const n = +mp.n === 1 ? 1 : 2, g = 0.125, fw = r3((c.w - g * (n - 1)) / n), back = Math.max(1, +mp.back || 30);
      const pl = hwPick(cabSet(c, 'pull'), 'pull');
      for (let i = 0; i < n; i++) {
        const R = n === 2 && i === 1, x0 = R ? r3(c.w - fw) : 0, f = { type: 'door', x0, x1: r3(x0 + fw), z0: 0, z1: c.h, hinge: R ? 'R' : 'L' };
        const st = apStyle(c, f), ds = st.ds, dm = mat(ds.mat) || x.fm, name = n > 1 ? `Pocket door ${R ? 'right' : 'left'}` : 'Pocket door';
        if (ds.source === 'buyout') { x.bom[`${name}, ${ds.name} ${fmtLen(fw, 1)} × ${fmtLen(c.h, 1)} (buyout)`] = 1; x.note(`${name} is bought from the door maker`); }
        const ops = st.framed && ds.type === 'routed' ? [{ type: 'pocket', x: r3(ds.rail), y: r3(ds.stile), w: r3(c.h - 2 * ds.rail), h: r3(fw - 2 * ds.stile), depth: r3(+ds.pocketDepth || 0.25), face: 'front', why: 'shaker field' }] : [];
        if (st.framed && ds.type !== 'routed' && ds.source !== 'buyout') x.warn.push(`${name}: a ${ds.name} front is cut here as one panel; build it like the room's doors.`);
        if (ds.source !== 'buyout') { const pt = x.part(name, dm, r3(c.h), fw, { kind: 'door', ops }); pt.fin = true; pt.front = true; pt.pos = { x: x0, y: 0, z: 0, dx: fw, dy: c.h, dz: c.d }; }
        x.bom[POCKET_HW] = (x.bom[POCKET_HW] || 0) + 1;
        // The room's pull, upright near the edge the door opens from, at hand height.
        const len = pl ? Math.max(1, (pl.lengthMM || 128) * MM) : 5, zc = r3(Math.min(c.h - len / 2 - 2, Math.max(len / 2 + 2, 42 - c.elev)));
        const pull = pl ? { name: pl.name, vert: true, x: r3(R ? x0 + 2 : x0 + fw - 2), z: zc, len: r3(len), slim: true } : null;
        if (pull) x.bom[pull.name] = (x.bom[pull.name] || 0) + 1;
        // Where it goes open: its outside face (and pull) toward the end, its back riding by the inside of the slot.
        const slot = Math.max(fm0(dm) + 0.25, +(R ? mp.slotR : mp.slotL) || 4), ft = fm0(dm), cl = 0.0625, hx = R ? c.w : 0;
        const pocket = { dx: r3((R ? c.w - slot + cl + ft : slot - cl - ft) - hx), dz: -r3(Math.min(fw + ft + 0.25, back + ft)) };
        if (fw > back - 0.25) x.warn.push(`${name} is ${fmtLen(fw, 1)} wide but the pocket is ${fmtLen(back, 1)} deep, so it can't slide all the way in.`);
        x.front({ f, ds, framed: st.framed, m: dm, pull, pocket });
      }
      x.note(`${n} pocket door${n > 1 ? 's' : ''} ${fmtLen(fw, 1)} × ${fmtLen(c.h, 1)}, sliding ${fmtLen(back, 1)} back into ${n > 1 ? `slots ${fmtLen(+mp.slotL || 4, 1)} and ${fmtLen(+mp.slotR || 4, 1)} wide` : `a ${fmtLen(+mp.slotL || 4, 1)} slot`}`);
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
      // The sink centred on the top, cut the same way as a sink placed on a countertop.
      const kk = sk ? sinkCut({ ...sk, lib: sk.id, off: (c.w - sk.w) / 2 }, { top: c.elev + H, depth: D, thick: topT }) : null;
      const cut = kk ? sinkCutPath(kk, 0, D, `${sk.name} cutout ${fmtLen(kk.w, 1)} × ${fmtLen(kk.d, 1)}${kk.oval ? ' oval' : kk.r ? ', ' + fmtLen(kk.r, 1) + ' corners' : ''} (check the sink template)`) : null;
      const cw = kk ? kk.w : 0, chh = kk ? kk.d : 0;
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
  const panelFronts = [], show = [];
  d.build(c, mp, { part, cm, fm, bom, warn, note: s => notes.push(s), front: o => panelFronts.push(o), show: o => show.push(o) });
  if (c.addParts && c.addParts.length && typeof addedParts === 'function') addedParts(c, parts, warn, part, cm);
  const removed = (c.partEdits && typeof applyPartEdits === 'function') ? applyPartEdits(c, parts, warn, ptT) : [];
  return { parts, bom, warn, fronts: [], panelFronts, show, inD: c.d, inW: c.w, removed, notes };
}
// Sizes that follow the settings: a slat wall is as deep as its backer and slats, a privacy panel as wide as its board.
// A panel front's style: the room's door style for a door of that size (frontStyle: size rules, and the Finish material).
function apStyle(c, f) { return typeof frontStyle === 'function' ? frontStyle(c, f) : { ds: panelDoor(c), framed: false }; }
// 0.61.3: every appliance with Panel fronts on has one Appliance Panel Front standing in front of it, kept to its size and
// spot; one whose appliance is gone or has them off is taken out. Runs after every change (mutate).
function apFrontSync() {
  const lib = typeof libItem === 'function' && libItem('made-apfront');
  (S.rooms || []).forEach(r => {
    const fx = r.fixtures || [], keep = [];
    r.cabinets = r.cabinets.filter(c => {
      if (c.made !== 'apfront' || !c.fixt) return true;
      const f = fx.find(x => x.id === c.fixt); if (!f || !f.panels || keep.includes(f.id)) return false;
      keep.push(f.id); apFrontFit(c, f); return true;
    });
    if (!lib) return;
    fx.forEach(f => {
      if (!f.panels || !PANEL_KINDS.includes(f.kind) || keep.includes(f.id) || !f.wall) return;
      const c = newCab(S, lib, f.wall, f.side, f.off);
      Object.assign(c, { name: (f.name || 'Appliance') + ' panel front', fixt: f.id, mp: { fr: [], toe: f.kind === 'fridge' ? 0 : 4.5 } });
      apFrontFit(c, f); r.cabinets.push(c);
    });
  });
}
// 0.61.9 (Ayden 2026-11-23: "keeps saying there is no room for that here"): Pocket Doors stand in front of the pieces
// behind them (fillers, end panels, an open base): their outset follows the deepest piece they cover, along the wall and
// up and down. Runs after every change (mutate). Mode 'own' keeps the Outset typed in.
function pocketDoorsSync() {
  (S.cabinets || []).forEach(c => {
    if (c.made !== 'pocketdoors' || !c.wall || (c.mp || {}).front === 'own') return;
    let deep = null;
    S.cabinets.forEach(k => {
      if (k === c || k.made === 'pocketdoors' || k.wall !== c.wall || k.side !== c.side) return;
      if (Math.min(k.off + k.w, c.off + c.w) - Math.max(k.off, c.off) < 0.01 || !vOverlap(k, c)) return;
      const f = r3((k.outset || 0) + k.d); if (deep === null || f > deep) deep = f;
    });
    if (deep !== null && c.outset !== deep) c.outset = deep;
  });
}
function apFrontFit(c, f) {
  const toe = Math.max(0, +(c.mp || {}).toe || 0), fm = mat(typeof finishMat === 'function' ? finishMat(c) : '') || { thick: 0.75 };
  const want = { wall: f.wall, side: f.side, off: f.off, w: f.w, h: r3(Math.max(1, f.h - toe)), elev: r3((f.elev || 0) + toe), outset: r3((f.outset || 0) + f.d), d: r3(fm.thick) };
  Object.keys(want).forEach(k => { if (c[k] !== want[k]) c[k] = want[k]; });
}
// The fronts of an Appliance Panel Front that fit on it, top first; none = one front the whole size.
function apFronts(c, mp = madeMp(c)) {
  const fr = (Array.isArray(mp.fr) ? mp.fr : []).filter(q => +q.h > 0 && +q.z >= -0.01 && +q.z + +q.h <= c.h + 0.01);
  // 0.61.5: x and w across the front (a pair of doors); none = the whole width. hinge L/R when Mozaik says.
  const one = q => { const x0 = Math.max(0, +q.x || 0), w = +q.w > 0 ? Math.min(+q.w, c.w - x0) : c.w - x0; return { z: +q.z, h: +q.h, x: r3(x0), w: r3(w), hinge: q.hinge || '', type: q.type || 'door' }; };
  return fr.length ? fr.map(one) : [{ z: 0, h: c.h, x: 0, w: c.w, hinge: '', type: 'door' }];
}
const apFixt = c => c.fixt && typeof fixtList === 'function' ? fixtList().find(f => f.id === c.fixt) || (S.rooms || []).flatMap(r => r.fixtures || []).find(f => f.id === c.fixt) : null;
// 0.61.5 (Ayden 2026-11-23: "the fridge doors need tall handles in the center where you would pull the handle on a normal
// fridge"): a fridge's panel doors get a tall upright appliance pull on the edge they open from: the meeting edges of a pair
// (French doors, in the middle), the side away from the hinge on a single door. A drawer front, a dishwasher or an
// under-counter fridge gets a pull across near its top. Returns { name, vert, x, z, len } in the front's terms
// (x across from the appliance's left, z up), or null.
function apPull(c, fx, q, fr) {
  const kind = fx ? fx.kind : 'fridge';
  if (kind === 'fridge' && q.type !== 'drawer' && q.h >= 20) {
    const len = q.h >= 48 ? 24 : q.h >= 30 ? 18 : 12, inset = 2;
    const mate = fr.find(o => o !== q && Math.abs(o.z - q.z) < 0.5 && Math.abs(o.h - q.h) < 0.5);
    let side = q.hinge === 'R' ? 'L' : q.hinge === 'L' ? 'R' : '';
    if (mate) side = mate.x > q.x ? 'R' : 'L';
    if (!side) side = 'R';
    const x = side === 'R' ? q.x + q.w - inset : q.x + inset;
    // On a tall door the pull sits where a hand reaches it: low on an upper door, high on a lower one, else centered.
    const mid = q.z + q.h / 2, reach = 40, zc = q.h > len + 8 ? Math.min(q.z + q.h - len / 2 - 3, Math.max(q.z + len / 2 + 3, mid > reach ? q.z + len / 2 + 3 : mid)) : mid;
    return { name: `Appliance pull ${len}" (fridge)`, vert: true, x: r3(x), z: r3(zc), len };
  }
  const len = q.w >= 24 ? 18 : 12;
  return { name: `Appliance pull ${len}"`, vert: false, x: r3(q.x + q.w / 2), z: r3(q.z + q.h - Math.min(3, q.h / 4)), len };
}
// A pull's bar and posts in 3D, standing off the front face (at depth d).
function apPullMeshes(p, d, M, add) {
  const t = 0.75, off = 1.25, post = 0.5;
  if (p.vert) { add(box3(t, p.len, t, M, p.x, p.z, d + off + t / 2)); [-1, 1].forEach(s => add(box3(post, post, off, M, p.x, p.z + s * (p.len / 2 - 1), d + off / 2))); }
  else { add(box3(p.len, t, t, M, p.x, p.z, d + off + t / 2)); [-1, 1].forEach(s => add(box3(post, post, off, M, p.x + s * (p.len / 2 - 1), p.z, d + off / 2))); }
}
function madeSync(c) {
  const d = madeDef(c); if (!d) return;
  const mp = madeMp(c), cm = mat(cabMatT(cabSet(c, 'cabMatT')).carcass) || S.materials[0], fm = mat(finishMat(c)) || cm;
  if (c.made === 'slatwall') c.d = r3((mp.backer === 'off' ? 0 : fm.thick) + fm.thick);
  if (c.made === 'privacy' || c.made === 'panel') c.w = r3(fm.thick);
  if (c.made === 'apfront') c.d = r3(fm.thick);
  // Pocket doors are as thick as the doors (the Finish).
  if (c.made === 'pocketdoors') c.d = r3(fm.thick);
}
const fm0 = m => (m && m.thick) || 0.75;
// Own price when the price sheet has none for the product: these aren't priced like cabinets.
// A support panel is priced like an applied slab end panel (0.59.21): its material by the square foot plus the sheet's charge
// per panel for its height (Edit prices › Adders).
function madePrice(c, ps) {
  const d = madeDef(c); if (!d) return null;
  if (c.made === 'apfront' && ps && typeof priceFront === 'function' && typeof panelDoor === 'function') {
    // 0.61.5: each front at its own width, plus its appliance pull at the price sheet's hardware price (if it has one).
    const fr = apFronts(c), fx = apFixt(c), hw = q => { const p = apPull(c, fx, q, fr); return p && ps.hardware && ps.hardware.on ? +(ps.hardware.items || {})[p.name] || 0 : 0; };
    return { own: true, base: r3(fr.reduce((t, q) => t + priceFront(apStyle(c, { type: 'door', x0: q.x, x1: q.x + q.w, z0: q.z, z1: q.z + q.h }).ds, q.w * q.h / 144, ps, q.w, q.h).total + hw(q), 0)), perFt: 0 };
  }
  if (c.made === 'pocketdoors' && ps && typeof priceFront === 'function') {
    // 0.61.7: each door like a door of its style, plus the pocket systems and pulls at the sheet's hardware prices.
    const b = madeBuildParts(c), hwP = n => ps.hardware && ps.hardware.on ? +(ps.hardware.items || {})[n] || 0 : 0;
    const doors = b.panelFronts.reduce((t, o) => { const w = o.f.x1 - o.f.x0, h = o.f.z1 - o.f.z0; return t + priceFront(o.ds, w * h / 144, ps, w, h).total; }, 0);
    return { own: true, base: r3(doors + Object.entries(b.bom).reduce((t, [n, q]) => t + q * hwP(n), 0)), perFt: 0 };
  }
  if (c.made === 'panel' && c.autoOf) return { own: true, base: 0, perFt: 0 };
  if (c.made !== 'panel' || !ps || typeof matSqIn !== 'function') return { own: true, ...d.price };
  const m = mat(finishMat(c)) || mat(cabMatT(cabSet(c, 'cabMatT')).carcass);
  return { own: true, base: r3((m ? c.h * c.d * matSqIn(m, ps) : 0) + (typeof panelAdd === 'function' ? panelAdd(ps, c.h >= 60 ? 'Tall' : c.elev >= 30 ? 'Wall' : 'Base') : 0)), perFt: 0 };
}

/* ---------- Library ---------- */
// 0.61.0 (Ayden 2026-11-23: "an option to put down base panels and wall panels that arent automatic so i can change it"):
// a Base End Panel and a Wall End Panel, the same finished panel as the Support Panel at base and upper sizes. Placed by
// hand like a cabinet, so they can be moved, resized or deleted; the cabinet beside one gets no automatic panel there.
const MADE_PANEL_SIZES = [
  { id: 'made-panel-base', name: 'Base End Panel', cat: 'Base', h: 34.5, d: 24.75, elev: 0 },
  { id: 'made-panel-wall', name: 'Wall End Panel', cat: 'Wall', h: 30, d: 12.75, elev: 54 },
];
function madeLibItems() {
  const item = (k, d, o = {}) => ({ id: 'made-' + k, name: d.name, cat: d.cat, w: d.w, h: d.h, d: d.d, elev: d.elev, rows: [], params: {},
    construction: { toeKick: false, top: 'full' }, made: k, mp: clone(d.mp), noTop: true, folder: d.folder, group: 'made', ...o });
  return [...Object.entries(MADE).map(([k, d]) => item(k, d)), ...MADE_PANEL_SIZES.map(o => item('panel', MADE.panel, o))];
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
  // Panel fronts draw as doors of their style (frame and recessed field), not as flat boxes.
  const pullM = flat3('#2f3236');
  (b.panelFronts || []).forEach(o => {
    const M = mat3(typeof texLook === 'function' ? texLook(o.m, 'finished', c) : o.m, opts);
    // A pocket door (0.61.7) turns on its outside front corner and slides into its pocket (moveFront in view3d.js).
    let into = grp;
    if (o.pocket) {
      const hx = o.f.hinge === 'R' ? o.f.x1 : o.f.x0, pz = c.d, pivot = new THREE.Group(), fg = new THREE.Group();
      pivot.position.set(hx, 0, pz); fg.position.set(-hx, 0, -pz); pivot.add(fg); grp.add(pivot); into = fg;
      pivot.userData.open = { kind: 'pocket', sign: o.f.hinge === 'R' ? 1 : -1, f: o.f, base: { x: hx, z: pz }, dx: o.pocket.dx, dz: o.pocket.dz };
    }
    doorMeshes(o.ds, o.framed, o.f, c.d, M, M, 0, m => into.add(m));
    if (o.pull && o.pull.slim) into.add(box3(0.45, o.pull.len, 0.45, pullM, o.pull.x, o.pull.z, c.d + 0.55));
    else if (o.pull) apPullMeshes(o.pull, c.d, pullM, m => into.add(m));
  });
  [...b.parts, ...(b.show || [])].forEach(q => {
    if (q.front) return;
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
  if (c.made === 'pocketdoors' && typeof applyOpen === 'function') applyOpen(grp, openT[c.id] || 0);
  return grp;
}
// Elevation: each part's face as seen from the front, back to front.
function madeFrontSVG(c, ex, by, opts = {}) {
  const b = buildParts(c), mats = [], faces = [];
  (b.panelFronts || []).forEach(o => {
    const m = typeof texLook === 'function' ? texLook(o.m, 'finished', c) : o.m, { f, ds } = o, fw = f.x1 - f.x0, fh = f.z1 - f.z0;
    let svg = `<rect ${fillFor(m, 'ev-box')} x="${r3(ex + f.x0)}" y="${r3(by - f.z1)}" width="${r3(fw)}" height="${r3(fh)}"/>`;
    if (o.framed) svg += `<rect class="ev-inner nss" fill="none" x="${r3(ex + f.x0 + ds.stile)}" y="${r3(by - f.z1 + ds.rail)}" width="${r3(Math.max(0, fw - 2 * ds.stile))}" height="${r3(Math.max(0, fh - 2 * ds.rail))}"/>`;
    // 0.61.5: the appliance pull.
    const p = o.pull; if (p && p.slim) svg += `<rect class="ev-pull" fill="#2f3236" x="${r3(ex + p.x - 0.225)}" y="${r3(by - p.z - p.len / 2)}" width="0.45" height="${r3(p.len)}" rx="0.2"/>`;
    else if (p) svg += p.vert ? `<rect class="ev-pull" fill="#2f3236" x="${r3(ex + p.x - 0.375)}" y="${r3(by - p.z - p.len / 2)}" width="0.75" height="${r3(p.len)}" rx="0.3"/>` : `<rect class="ev-pull" fill="#2f3236" x="${r3(ex + p.x - p.len / 2)}" y="${r3(by - p.z - 0.375)}" width="${r3(p.len)}" height="0.75" rx="0.3"/>`;
    faces.push({ z: c.d + 1, m, svg });
  });
  [...b.parts, ...(b.show || [])].forEach(q => {
    if (q.front) return;
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
  return `<div class="psec box">${secHead('sliders', d.name, 'violet')}${d.fields.length ? `<div class="grid2">${d.fields.map(f).join('')}</div>` : `<div class="note">A finished panel standing on its own, cut from the Finish material. Size it on the Size tab: width is its thickness, depth how far it comes out from the wall.</div>`}${notes.length ? `<div class="note">${esc(notes.join('. '))}.</div>` : ''}</div>`;
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
    // Every sink on the run, cut like it shows in the plan and 3D (sinkCut). Pieces are laid out from the run's start
    // as seen from the front, so a top on the far side of its wall (side -1) runs the other way along the wall.
    const x0 = r.start - r.ovS, sinks = runSinks(r);
    const s = splitLen(r.len, cm), notes = [];
    if (r.pts || r.shape) notes.push('corner joint: cut the end to the plan');
    sinks.forEach(({ f, k }) => {
      if (k.y0 < 1.5) notes.push(`${fixtName(f)} cutout is ${fmtLen(Math.max(0, k.y0), 1)} from the back edge`);
      if (!k.open && k.front < 1.5) notes.push(`${fixtName(f)} cutout is ${fmtLen(k.front, 1)} from the front edge`);
    });
    for (let k = 0; k < layers; k++) {
      for (let j = 0; j < s.n; j++) {
        const a = j * s.len, ops = [];
        sinks.forEach(({ f, k: kc }) => {
          // Along the run from its start (left end seen from the front).
          const lo = r.side === 1 ? kc.x0 - x0 : x0 + r.len - kc.x1, hi = lo + kc.w;
          if (hi <= a || lo >= a + s.len) return;
          if (lo < a || hi > a + s.len) { if (!notes.some(n => n.startsWith(fixtName(f) + ' crosses'))) notes.push(`${fixtName(f)} crosses a seam; move the seam`); return; }
          const ax = r.side === 1 ? x0 + a : x0 + r.len - a - s.len;
          ops.push(sinkCutPath(kc, ax, r.depth, `${fixtName(f)} cutout ${fmtLen(kc.w, 1)} × ${fmtLen(kc.d, 1)}${kc.oval ? ' oval' : kc.r ? ', ' + fmtLen(kc.r, 1) + ' corners' : ''} (check the sink template)`, r.side !== 1, s.len));
        });
        if (k === layers - 1 && t.edge && t.edge !== 'square') ops.push({ type: 'edge', profile: t.edge, face: 'front', why: (TOP_EDGES.find(e => e[0] === t.edge) || [0, t.edge])[1] + ' front edge' });
        part(`Countertop core${layers > 1 ? ', layer ' + (k + 1) : ''}${s.n > 1 ? `, piece ${j + 1} of ${s.n}` : ''}`, s.len, r.depth, { ops });
      }
    }
    if (r.bs > 0) { const b = splitLen(r.len, cm); part('Backsplash core', b.len, r.bs, { kind: 'filler', qty: b.n }); }
    // Waterfall ends: a core panel per layer from the floor up under the top.
    ['S', 'E'].forEach(e => { if (r['wf' + e]) part(`Waterfall end (${e === 'S' ? 'start' : 'end'})${layers > 1 ? `, ${layers} layers` : ''}`, r.top, r.depth, { kind: 'filler', qty: layers }); });
    const sideAt = t.sideSplash === 'ends' || (t.sideSplash === 'sinks' && sinks.length);
    if (r.bs > 0) [['S', r.blockS], ['E', r.blockE]].forEach(([e, blocked]) => { if (r['ss' + e] || (sideAt && blocked)) part(`Side splash (${e === 'S' ? 'start' : 'end'})`, r.depth - cm.thick, r.bs, { kind: 'filler' }); });
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
</div>
    <div class="note help">With core layers, each run's layers, backsplash and side splashes are cut parts with the sink cutouts, and go to the CNC.</div></div>`;
}
// The shop's laminate top from the bids: laminate on 2 layers of 3/4" core, half bullnose, 4" splash, side splash at sinks, by the foot.
const LAM2_TOP = { id: 'top-lam2', name: 'Laminate on 2 layers 3/4" ply, half bullnose', mat: 'm-lam', thick: 1.5, frontOverhang: 1, endOverhang: 0.75, backsplash: 4, layers: 2, core: '', edge: 'halfbull', sideSplash: 'sinks' };
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
// Ayden 2026-11-23: an end grain butcher block top. The texture (textures/Tops/Endgrain Butcherblock.jpg) is drawn by
// tools/endgrain-texture.py, so it is the shop's own with no license strings. Added once per job (s.endgrain), so a
// deleted one stays deleted. The quote prices every top by the square foot, so the material cost only shows in Libraries.
const EG_MAT = { id: 'm-butcher-eg', name: 'Endgrain butcherblock', kind: 'top', thick: 1.75, sheetW: 25, sheetL: 120, grain: false, cost: 0, color: '#d7af7c', texture: 'textures/Tops/Endgrain Butcherblock.jpg', procedural: null, texScale: 24 };
const EG_TOP = { id: 'top-butcher-eg', name: 'Endgrain butcherblock', mat: EG_MAT.id, thick: 1.75, frontOverhang: 1.25, endOverhang: 1, backsplash: 0 };
function ensureEndgrainTop(s) {
  if (!s || s.endgrain || !Array.isArray(s.materials) || !Array.isArray(s.countertops)) return s;
  if (!s.materials.some(m => m.id === EG_MAT.id)) { const mb = s.materials.find(m => m.id === 'm-butcher'); s.materials.push({ ...EG_MAT, cost: mb ? mb.cost || 0 : 0 }); }
  if (!s.countertops.some(t => t.id === EG_TOP.id)) s.countertops.push({ ...EG_TOP });
  s.endgrain = 1; return s;
}
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

/* ---------- Fridge panels (0.59.32) ---------- */
// Ayden 2026-11-20: full-height panels on both sides of a fridge look better, so they go in by default (Layout › Automatic
// fridge panels, per job). A fridge is a Refrigerator appliance on a wall, or (bid jobs) a deep upper with no floor cabinet
// under it. Each side that has no wall, tall cabinet or panel beside it gets a Fridge Panel from the floor to the top of the
// cabinet over the fridge. Cabinets butted against the opening slide out the panel's thickness. They are ordinary Support
// Panels after that: delete one to leave that side bare, and turning the switch off takes them all out.
function fridgeOpenings() {
  const out = [], floorAt = (wl, sd, a0, a1) => S.cabinets.some(k => k.wall === wl && k.side === sd && k.elev < 1 && !k.made && !isFloatShelf(k) && k.off < a1 - 0.5 && k.off + k.w > a0 + 0.5);
  const overs = (wl, sd, a0, a1) => S.cabinets.filter(k => k.wall === wl && k.side === sd && k.cat === 'Wall' && !k.moz && !k.made && !isFloatShelf(k) && k.elev >= 55 && k.off < a1 - 0.5 && k.off + k.w > a0 + 0.5);
  const fxs = (typeof fixtList === 'function' ? fixtList() : S.fixtures || []).filter(f => f.wall && wall(f.wall));
  fxs.filter(f => f.kind === 'fridge').forEach(f => {
    const up = overs(f.wall, f.side, f.off, f.off + f.w);
    const a0 = Math.min(f.off, ...up.map(k => k.off)), a1 = Math.max(f.off + f.w, ...up.map(k => k.off + k.w));
    out.push({ wall: f.wall, side: f.side, a0, a1, up, fx: f });
  });
  // Bid jobs draw no fridge: the opening is the deep upper (20" or more) over open floor.
  S.cabinets.filter(k => k.cat === 'Wall' && !k.moz && !k.made && !isFloatShelf(k) && k.d >= 20 && k.elev >= 55 && k.w >= 24 && k.w <= 48 && !/micro|hood/i.test(k.name || '')).forEach(k => {
    const a0 = k.off, a1 = k.off + k.w;
    if (floorAt(k.wall, k.side, a0, a1) || out.some(o => o.wall === k.wall && o.side === k.side && o.a0 < a1 - 0.5 && o.a1 > a0 + 0.5)) return;
    if (fxs.some(f => f.wall === k.wall && f.off < a1 - 0.5 && f.off + f.w > a0 + 0.5 && f.kind !== 'fridge')) return;
    out.push({ wall: k.wall, side: k.side, a0, a1, up: overs(k.wall, k.side, a0, a1) });
  });
  return out;
}
// Adds the fridge panels for one room (all its fridges, or only fx). Returns { added, skipped }.
function addFridgePanels(rm, fx) {
  const lib = typeof libItem === 'function' && libItem('made-panel'); if (!lib) return { added: 0, skipped: 0 };
  return withRoom(rm, () => {
    let added = 0, skipped = 0;
    fridgeOpenings().filter(o => !fx || o.fx === fx).forEach(o => {
      const tops = o.up.map(k => k.elev + k.h), uppers = S.cabinets.filter(k => k.wall === o.wall && k.side === o.side && k.cat === 'Wall' && !isFloatShelf(k)).map(k => k.elev + k.h);
      const top = tops.length ? Math.max(...tops) : Math.max(84, o.fx ? o.fx.h : 0, ...uppers);
      [-1, 1].forEach(dir => {
        const edge = dir < 0 ? o.a0 : o.a1;
        const c = newCab(S, lib, o.wall, o.side, edge);
        Object.assign(c, { name: 'Fridge Panel', h: r3(top), elev: 0, autoFridge: true, notes: `Fridge panel, ${dir < 0 ? 'left' : 'right'} side` });
        if (rm.cabinets.some(k => k.fromBid) && !o.fx) c.fromBid = true;
        madeSync(c);
        const t = c.w; c.off = r3(dir < 0 ? edge - t : edge);
        // Depth: the cabinet over the fridge, or the floor cabinet beside it, with its door.
        const side = S.cabinets.filter(k => k.wall === o.wall && k.side === o.side && k.elev < 1 && !k.made && (dir < 0 ? Math.abs(k.off + k.w - o.a0) < 1.5 : Math.abs(k.off - o.a1) < 1.5));
        c.d = r3(Math.max(...o.up.map(k => faceOut(k)), ...side.map(k => faceOut(k)), 24.75));
        const L = wg(wall(o.wall)).L; if (c.off < -0.01 || c.off + c.w > L + 0.01) return;
        // What stands past this side, nearest first (gap from the opening's edge).
        const near = obstacles(o.wall, o.side, c, c.id).map(b => ({ ...b, gap: dir < 0 ? edge - b.a1 : b.a0 - edge })).filter(b => b.gap > -0.01 && !(o.fx && b.id === o.fx.id));
        // A wall, a tall cabinet or a panel already there: that side is covered.
        if (near.some(b => b.gap <= 1.01 && (b.kind === 'wall' || (b.kind === 'cab' && (k => k && (k.made === 'panel' || k.made === 'privacy' || (k.h >= 70 && k.elev < 1)))(cab(b.id)))))) return;
        const tight = near.filter(b => b.gap < t - 0.01);
        if (tight.some(b => b.kind !== 'cab')) { skipped++; return; }
        // Slide the cabinets in the way out by what the panel needs; put everything back if any of them can't go.
        const was = S.cabinets.map(k => [k, k.off]);
        const ok = [...new Set(tight.map(b => b.id))].every(id => { const k = cab(id); if (!k) return false; const gap = dir < 0 ? edge - (k.off + k.w) : k.off - edge; return gap >= t - 0.01 || shiftRun(k, dir * r3(t - gap)); });
        S.cabinets.push(c);
        if (!ok || conflicts(c)) {
          S.cabinets.pop(); was.forEach(([k, v]) => { k.off = v; });
          // No room that way (a wall or filler past the run): slide the cabinet over the fridge the other way instead.
          const free = r3(dir < 0 ? Math.max(...tight.map(b => b.a1)) : Math.min(...tight.map(b => b.a0)));
          const move = r3(dir < 0 ? free + t - edge : edge - (free - t));
          const ok2 = o.up.length && move > 0 && o.up.every(k => shiftRun(k, -dir * move));
          c.off = r3(dir < 0 ? free : free - t); S.cabinets.push(c);
          if (!ok2 || conflicts(c)) { S.cabinets.pop(); was.forEach(([k, v]) => { k.off = v; }); skipped++; return; }
          o.a0 = r3(o.a0 - dir * move); o.a1 = r3(o.a1 - dir * move);
        }
        added++;
      });
    });
    return { added, skipped };
  });
}
function removeFridgePanels() {
  let n = 0;
  (S.rooms || []).forEach(r => { const was = (r.cabinets || []).length; r.cabinets = (r.cabinets || []).filter(c => !c.autoFridge); n += was - r.cabinets.length; });
  return n;
}
// A fridge just placed gets its panels when the job has them on.
function fridgePlaced(f) {
  if (!f || f.kind !== 'fridge' || !lay().fridgePanels) return;
  const x = addFridgePanels(curRoom(), f);
  if (x.added && typeof flash === 'function') setTimeout(() => flash(`Added ${x.added} fridge panel${x.added === 1 ? '' : 's'}. Turn them off in the item bar (Fridge panels).`), 0);
}
