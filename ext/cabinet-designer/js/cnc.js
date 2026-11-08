// Part file for the CNC Cutlist extension (format "cabinet-cnc-parts", version 1).
// Converts the job's parts and machining into what CNC Cutlist nests and cuts.
// Anything the CNC can't cut yet with the Rover's tools is left off the file
// and listed in `skipped`, so nothing goes missing without a note.

const CNC_TOOLS = { vbit: '90SHARP', cutter: '3_8COMP' };
// Straight bits in the Rover tool set, biggest first (mm). A groove uses the
// biggest one that fits its width, in side by side passes if it's wider.
const CNC_STRAIGHT = [['1_2COMP', 12.7], ['3_8COMP', 9.525], ['1_4SPDN', 6.11], ['1_8DOWN', 3.175]];
// The straight bits from the CNC tools library when it is loaded, else the fixed list above.
const cncBits = () => { const l = typeof cncStraight === 'function' ? cncStraight() : []; return l.length ? l : CNC_STRAIGHT; };
// One route per pass, each a little deeper, from the tool's pass depth (O13).
const cncRoutes = (ops, base, depth) => (typeof cncPasses === 'function' ? cncPasses(base.tool, depth) : [depth]).forEach((d, i, all) => ops.push({ ...base, depth: d, ...(all.length > 1 ? { pass: i + 1, passes: all.length } : {}) }));
const CNC_TRIM = 6.35; // mm, 1/4" kept clear on every sheet edge
// Opposite faces. A part is machined with its busiest face up; ops on the
// opposite face become back side (flip) ops.
const CNC_OPPOSITE = { inside: 'outside', outside: 'inside', front: 'back', back: 'front', left: 'right', right: 'left', top: 'bottom', bottom: 'top', show: 'hidden', hidden: 'show' };

// scoped: only the Cutlist tab's room and what is picked to cut (js/cutpick.js); else the whole job.
function cncPartFile(scoped) {
  const d = exportData('mm'), r3 = v => Math.round(v * 1000) / 1000;
  const used = new Set(), parts = [], skipped = [];
  const inRoom = ri => !scoped || ui.cutRoom === 'all' || !roomById(ui.cutRoom) || S.rooms[ri].id === ui.cutRoom;
  const keep = (ri, cabId, kind) => inRoom(ri) && (!scoped || cutKeep(cutPartKey({ cabId, kind })));
  d.rooms.forEach((rm, ri) => rm.cabinets.forEach((c, ci) => c.parts.forEach((p, pi) => {
    if (!keep(ri, S.rooms[ri].cabinets[ci].id, p.kind)) return;
    const where = `${rm.name} · ${c.label} · ${p.name}`;
    const m = S.materials.find(x => x.id === p.material);
    if (!m || m.kind !== 'sheet') { skipped.push(`${where}: not a sheet material, left off`); return; }
    const L = p.length, W = p.width, T = p.thickness;
    // Our part frame: origin bottom left, y up. The designer draws y down from L1.
    const P = (x, y) => [r3(x), r3(W - y)];

    let outline = [[0, 0], [L, 0], [L, W], [0, W]], edgeKeys = ['L2', 'W2', 'L1', 'W1'];
    const notches = p.ops.filter(o => o.type === 'notch');
    // A shaped part (cabinet shape) brings its own outline, measured from its bottom left like ours.
    if (p.outline && p.outline.length >= 3) { outline = p.outline.map(q => [q.x, q.y]); edgeKeys = outline.map(() => null); }
    else if (notches.length) {
      const n = notches[0];
      if (notches.length > 1 || n.x !== 0 || n.y !== 0 || !(n.w > 0 && n.w < L && n.h > 0 && n.h < W)) {
        skipped.push(`${where}: part shape (notch) not supported yet, whole part left off`);
        return;
      }
      // Toe kick notch at the drawn top left corner (x = 0 end, L1 edge).
      outline = [[0, 0], [L, 0], [L, W], [n.w, W], [n.w, W - n.h], [0, W - n.h]];
      edgeKeys = ['L2', 'W2', 'L1', null, null, 'W1'];
    }
    outline = outline.map(([x, y]) => [r3(x), r3(y)]);

    const cuttable = p.ops.filter(o => o.type === 'bore' || o.type === 'groove' || o.type === 'path');
    const count = {};
    cuttable.forEach(o => { if (o.face) count[o.face] = (count[o.face] || 0) + 1; });
    const top = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    const faceOf = o => !o.face || o.face === top ? 'top' : o.face === CNC_OPPOSITE[top] ? 'back' : null;

    // A made door's recess and edges are cut by its style's panel tool group in CNC Cutlist.
    const group = p.cncGroup || '';
    const ops = [];
    for (const o of p.ops) {
      if (o.type === 'notch') continue;
      // Edge bores (O9): only when the machine can drill into an edge (CNC tools › Machine settings).
      if (o.type === 'hbore') {
        const M = typeof CNC_LIB !== 'undefined' ? CNC_LIB.machine : {};
        if (!M.edgeDrill) { skipped.push(`${where}: ${o.why || 'edge bore'} (edge bore) needs a machine that drills edges; turn it on in CNC tools`); continue; }
        const e = 0.5, dir = o.x <= e ? [1, 0] : o.x >= L - e ? [-1, 0] : o.y <= e ? [0, -1] : [0, 1];
        ops.push({ type: 'edgeDrill', point: P(o.x, o.y), direction: dir, diameter: o.dia, depth: o.depth, z: r3(o.inset) });
        continue;
      }
      const what = o.why || o.type;
      const face = faceOf(o);
      // Tool paths and pockets drawn in the part editor: the bit follows the points (moved off the line when asked); a pocket is cleared in passes.
      if (o.type === 'path' && face) {
        const lib = typeof cncTool === 'function' && cncTool(o.tool), bits = cncBits();
        const bit = lib ? [lib.id, lib.dia] : bits.find(([n]) => n === o.tool) || bits[1] || bits[0];
        const thruX = lib && lib.thruExtra && o.through ? lib.thruExtra : 0, depth = o.depth > 0 && o.depth < T ? o.depth : r3(T + thruX);
        const kind = o.cleanout ? { cleanout: true } : o.engrave ? { engrave: true } : {};
        if (o.pocket) { const ps = pocketPaths(o.pts, bit[1], o.pocketOpts); if (!ps.length) skipped.push(`${where}: ${what} pocket is smaller than the ${bit[0]} bit`); ps.forEach(path => cncRoutes(ops, { type: 'route', face, tool: bit[0], path: path.map(q => P(q.x, q.y)), ...(o.pocketOpts ? { pocket: o.pocketOpts.style } : {}) }, depth)); continue; }
        const sideOff = o.cleanout || o.engrave ? 0 : o.side === 'left' ? bit[1] / 2 : o.side === 'right' ? -bit[1] / 2 : 0, pts = offsetPath(o.pts, -sideOff, o.closed);
        cncRoutes(ops, { type: 'route', face, tool: bit[0], path: (o.closed ? [...pts, pts[0]] : pts).map(q => P(q.x, q.y)), ...kind }, depth);
        continue;
      }
      if (o.type !== 'bore' && o.type !== 'groove') { if (!(group && (o.type === 'pocket' || o.type === 'edge' || o.type === 'profile'))) skipped.push(`${where}: ${what} (${o.type}) not cut by the CNC yet`); continue; }
      if (!face) { skipped.push(`${where}: ${what} is on the ${o.face} face, which the CNC can't reach with this part's ${top} face up`); continue; }
      if (o.type === 'bore') {
        if (o.through) ops.push({ type: 'drill', face, diameter: o.dia, depth: r3(T), points: [P(o.x, o.y)] });
        else if (o.depth >= T) skipped.push(`${where}: ${what} hole is deeper than the part`);
        else {
          // V22: a brad point or Forstner tip cuts below the depth it is set to; take that off so the flat bottom lands where drawn.
          const M = typeof CNC_LIB !== 'undefined' ? CNC_LIB.machine : {}, tip = o.dia >= 15 ? +M.forstnerTip || 0 : +M.bradTip || 0;
          ops.push({ type: 'drill', face, diameter: o.dia, depth: r3(Math.max(0.5, Math.min(T - 0.5, o.depth + tip))), points: [P(o.x, o.y)] });
        }
        continue;
      }
      // Grooves.
      if (!(o.depth > 0 && o.depth < T)) { skipped.push(`${where}: ${what} groove depth ${o.depth} mm doesn't fit the part`); continue; }
      if (o.tool === '90° V-bit') { ops.push({ type: 'groove', face, tool: CNC_TOOLS.vbit, depth: o.depth, path: [P(o.x1, o.y1), P(o.x2, o.y2)] }); continue; }
      if (o.tool && o.tool !== 'flat bit') { skipped.push(`${where}: ${what} needs a ${o.tool}, which isn't in the Rover tool set`); continue; }
      const bit = cncBits().find(([, dia]) => dia <= o.width + 0.01);
      if (!bit) { skipped.push(`${where}: ${what} groove is ${r3(o.width)} mm wide, narrower than the smallest bit`); continue; }
      const paths = cncGroovePaths(o, L, W, bit[1]);
      if (!paths) { skipped.push(`${where}: ${what} groove is shorter than the ${bit[0]} bit`); continue; }
      paths.forEach(path => cncRoutes(ops, { type: 'route', face, tool: bit[0], path: path.map(([x, y]) => P(x, y)) }, o.depth));
    }

    const kind = partKind(p.kind), frontKey = Object.keys(kind.edges).find(k => /^front$/i.test(kind.edges[k]));
    const frontEdge = frontKey ? edgeKeys.indexOf(frontKey) : -1;
    used.add(m.id);
    parts.push({
      id: `${ri + 1}-${c.label}-${pi + 1}`, name: p.name, cabinet: c.label, ...(c.category ? { cabinetType: String(c.category).toLowerCase() } : {}), material: m.id, quantity: p.qty,
      outline, grain: m.grain ? 'x' : 'none', ...(frontEdge >= 0 ? { frontEdge } : {}), ...(group ? { panelGroup: group } : {}), ops,
    });
  })));
  // Custom shapes cut as their outline, with no machining.
  d.rooms.forEach((rm, ri) => (rm.shapes || []).forEach((s, si) => {
    if (!keep(ri, S.rooms[ri].shapes[si].id, 'shape')) return;
    const m = S.materials.find(x => x.id === s.material);
    if (!m || m.kind !== 'sheet') { skipped.push(`${rm.name} · ${s.name}: not a sheet material, left off`); return; }
    used.add(m.id);
    parts.push({ id: `${ri + 1}-S${si + 1}`, name: s.name, cabinet: 'Shapes', material: m.id, quantity: 1, outline: s.outline, grain: m.grain ? 'x' : 'none', ops: [] });
  }));
  // Color and texture go along so the CNC program shows what each part is cut from.
  const look = id => {
    const sm = S.materials.find(x => x.id === id);
    if (!sm) return {};
    let tx = null;
    try { tx = typeof texURL === 'function' ? texURL(sm) : null; } catch (e) { tx = null; }
    const f = Number(sm.feedRate);
    return { ...(f >= 10 && f <= 200 && f !== 100 ? { feedRate: Math.round(f) } : {}), ...(sm.color ? { color: sm.color } : {}), ...(tx && tx.startsWith('data:image/') ? { texture: tx } : {}), textureSize: (sm.texScale || 24) * 25.4 };
  };
  const materials = d.materials.filter(m => used.has(m.id)).map(m => ({
    id: m.id, name: m.name, thickness: m.thickness, grain: !!m.grain,
    sheet: { length: Math.max(m.sheetLength, m.sheetWidth), width: Math.min(m.sheetLength, m.sheetWidth), trim: CNC_TRIM },
    ...look(m.id),
  }));
  // The tool library and machine settings go along, so CNC Cutlist cuts with the same tools, tabs and ramps (O12, O14).
  const lib = typeof CNC_LIB !== 'undefined' ? { tools: CNC_LIB.tools.map(t => ({ ...t })), machine: { ...CNC_LIB.machine } } : {};
  return { file: { format: 'cabinet-cnc-parts', version: 1, units: 'mm', job: { name: d.job.name }, ...lib, materials, parts }, skipped };
}

// Centre paths for a straight groove cut with a bit of diameter `dia`: enough
// side by side passes to clear its width, each stopped a bit radius short of an
// end that lies inside the part so the slot stays the drawn length.
function cncGroovePaths(o, L, W, dia) {
  const rad = dia / 2, dx = o.x2 - o.x1, dy = o.y2 - o.y1, len = Math.hypot(dx, dy);
  if (!len) return null;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const inside = (x, y) => x > 0.01 && x < L - 0.01 && y > 0.01 && y < W - 0.01;
  const a = inside(o.x1, o.y1) ? rad : 0, b = inside(o.x2, o.y2) ? rad : 0;
  if (len - a - b < 0.01) return null;
  const spread = Math.max(0, o.width - dia), n = spread > 0.01 ? Math.ceil(spread / (0.8 * dia)) + 1 : 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
    out.push([[o.x1 + ux * a + nx * off, o.y1 + uy * a + ny * off], [o.x2 - ux * b + nx * off, o.y2 - uy * b + ny * off]]);
  }
  return out;
}
