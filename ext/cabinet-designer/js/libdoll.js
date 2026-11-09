/* ---------- Mini cabinets library: small cabinets for advertisements and mock kitchens ----------
   A separate product library (the library picker above the Products tree), like American Cabinets. History: 0.55.7 1:12
   dollhouse in 1/8" birch, 0.55.10 1:4 and 0.55.11 1:3 in 1/4" birch (CNC wants parts about 4" or bigger). 0.55.16
   (Ayden): cut from 3/4" melamine like real cabinets, and smaller: heights and depths at about 1:4 (base 8 5/8" x 6",
   uppers 9" x 4"), widths kept so the tops and bottoms stay 4" wide or more.
   They don't work like real cabinets:
   - one front panel per cabinet (p.onePieceFront): the doors and drawer fronts are V-grooved lines on one glued-on slab
     (no shaker recess: a pocket in melamine shows the core), so nothing small gets cut; no hinges, slides, pulls,
     Confirmats or dowels,
   - the box is glued: the back is 3/4" melamine set in between the sides, top and bottom, flush with their back edges
     (no nailers, no dado); the toe kick is a notch in the sides (no toe kick board; it would be 1" tall),
   - 1/4" dowel holes go through both sides at the same heights on every cabinet of a kind (the pantry has the base heights
     low and the upper heights high), so cabinets set side by side pin together, no glue, and the applied end panels have
     matching blind holes on their back so they pin onto an exposed side.
   Picking this library adds what it needs to the job once (ensureDollKit), using the job's own 3/4" melamine (white first). */
'use strict';
const DOLL_PARAMS = {
  baseType: 'notch', toeKickHeight: 1, toeKickSetback: 0.75, toeSkin: 'off', backInset: 0, dadoDepth: 0, nailers: 'none',
  shelfCount: 0, frontGap: 0.125, frontSideReveal: 0.03125, frontTopReveal: 0.03125, frontBottomReveal: 0.03125,
  pinHoles: 0.25, onePieceFront: true,
};
function dollLibItems() {
  const R = (type, h, count = 1) => ({ type, h, count });
  // Dowel heights up from the cabinet bottom, the same on every cabinet of a kind so neighbours line up
  // (the pantry's top two match the uppers, whose tops line up with it).
  const PZ = { Base: [3, 6.75], Wall: [2.25, 6.75], Tall: [3, 6.75, 15.75, 20.25] };
  const mk = (id, name, cat, w, h, d, elev, rows) => ({
    id, name, cat, w, h, d, elev, rows, params: { ...DOLL_PARAMS, pinZ: PZ[cat] }, construction: { toeKick: cat !== 'Wall', top: 'full' }, folder: 'Mini cabinets',
    cabMatT: 'mini-mt', doorT: 'mini-door', finish: 'mini-fin', hinge: 'none', pull: 'none', partT: 'mini-pt', jointU: 'none', jointF: 'none',
    panelStyle: 'mini-panel', noTop: true, fillL: 'off', fillR: 'off', desc: 'Mini cabinet, 3/4 melamine',
  });
  return [
    mk('mini-b1', 'Mini Base 1 Door 1 Drawer', 'Base', 5.5, 8.625, 6, 0, [R('false', 1.5), { ...R('door', '*'), hinge: 'L' }]),
    mk('mini-b2', 'Mini Base 2 Door 1 Drawer', 'Base', 8, 8.625, 6, 0, [R('false', 1.5), R('door', '*', 2)]),
    mk('mini-b3dr', 'Mini Base 3 Drawer', 'Base', 5.5, 8.625, 6, 0, [R('false', 1.5), R('false', '*'), R('false', '*')]),
    mk('mini-sink', 'Mini Sink Base', 'Base', 9, 8.625, 6, 0, [R('false', 1.5), R('door', '*', 2)]),
    mk('mini-w1', 'Mini Wall 1 Door', 'Wall', 5.5, 9, 4, 13.5, [{ ...R('door', '*'), hinge: 'L' }]),
    mk('mini-w2', 'Mini Wall 2 Door', 'Wall', 8, 9, 4, 13.5, [R('door', '*', 2)]),
    mk('mini-pantry', 'Mini Tall Pantry', 'Tall', 6, 22.5, 6, 0, [R('door', 9, 2), R('door', '*', 2)]),
  ];
}
const DOLL_LIB = dollLibItems();
const MINI_MEL = { id: 'mini-mel', name: '3/4 White Melamine', kind: 'sheet', thick: 0.75, sheetW: 49, sheetL: 97, grain: false, cost: 60, color: '#f4f4f1', texture: null, procedural: null, texScale: 24 };
// What the mini products point at, added to a job once (anything Ayden changes or deletes after is his).
function ensureDollKit(s) {
  if (!s || !Array.isArray(s.materials)) return s;
  const add = (list, item) => { if (Array.isArray(list) && !list.some(x => x.id === item.id)) list.push(item); };
  // The job's own 3/4 melamine (white first), else ours.
  const own = s.materials.filter(x => (x.kind || 'sheet') === 'sheet' && /melamine/i.test(x.name || '') && Math.abs(+x.thick - 0.75) < 0.06);
  let mel = (own.find(x => /white/i.test(x.name)) || own[0] || {}).id;
  if (!mel) { add(s.materials, clone(s.matGrouped && typeof matGroupGuess === 'function' ? { ...MINI_MEL, group: matGroupGuess(MINI_MEL) } : MINI_MEL)); mel = MINI_MEL.id; }
  if (s.matTemplates) add(s.matTemplates.cabinet, { id: 'mini-mt', name: 'Mini cabinets 3/4 melamine', carcass: mel, back: mel, shelf: mel, toeKick: mel });
  add(s.finishes, { id: 'mini-fin', name: 'Mini cabinets 3/4 melamine', front: mel, panel: mel, sheet: mel, solid: mel });
  add(s.doorStyles, { id: 'mini-slab', name: 'Mini slab', type: 'slab', mat: mel, stile: 0, rail: 0, pocketDepth: 0, tenon: 0, panelMat: mel, source: 'make' });
  add(s.doorTemplates, { id: 'mini-door', name: 'Mini slab', door: 'mini-slab', drawer: 'mini-slab', falseFront: 'mini-slab', minFrameHeight: 0, pull: 'none', drawerPull: 'none', pullFromEdge: 0, pullFromEnd: 0, drawerPullFromTop: 0 });
  add(s.panels, { id: 'mini-panel', name: 'Mini end panel (pins on)', type: 'flat', mat: mel, frontOverhang: 0.75, scribe: 0, toFloor: true, frame: 0, pocketDepth: 0 });
  add(s.partTemplates, { id: 'mini-pt', name: 'Mini cabinets: no edgebanding', rules: {} });
  // 0.55.16: jobs that opened an older set (1:12, 1:4, 1:3 in birch) get the melamine products; the mini templates move to
  // the melamine and the slab, so mini cabinets already drawn are cut from 3/4 melamine too. 1:12 products with a cabinet
  // drawn from them stay.
  if (s.miniKit !== 4) {
    const used = new Set((s.rooms || []).flatMap(r => (r.cabinets || []).map(c => c.libId)));
    const fresh = L => { const keep = L.filter(l => !(/^mini-/.test(l.id) || (/^doll-/.test(l.id) && !used.has(l.id)))); return keep.concat(clone(DOLL_LIB)); };
    if (s.libSet === 'doll' && Array.isArray(s.library)) s.library = fresh(s.library);
    else if (s.libSets && Array.isArray(s.libSets.doll)) s.libSets.doll = fresh(s.libSets.doll);
    const mt = s.matTemplates && (s.matTemplates.cabinet || []).find(t => t.id === 'mini-mt'); if (mt) Object.assign(mt, { name: 'Mini cabinets 3/4 melamine', carcass: mel, back: mel, shelf: mel, toeKick: mel });
    const fn = (s.finishes || []).find(f => f.id === 'mini-fin'); if (fn) Object.assign(fn, { name: 'Mini cabinets 3/4 melamine', front: mel, panel: mel, sheet: mel, solid: mel });
    const sl = s.doorStyles.find(d => d.id === 'mini-slab'); if (sl) Object.assign(sl, { mat: mel, panelMat: mel });
    const dt = (s.doorTemplates || []).find(d => d.id === 'mini-door'); if (dt) Object.assign(dt, { name: 'Mini slab', door: 'mini-slab', drawer: 'mini-slab', falseFront: 'mini-slab', minFrameHeight: 0 });
    const pn = (s.panels || []).find(p => p.id === 'mini-panel'); if (pn) Object.assign(pn, { mat: mel, frontOverhang: 0.75 });
    // Mini cabinets already drawn take the melamine-thickness settings (dowel size, toe) from the new products.
    (s.rooms || []).forEach(r => (r.cabinets || []).forEach(c => { const l = DOLL_LIB.find(x => x.id === c.libId); if (l) c.libParams = { ...(c.libParams || {}), ...clone(l.params) }; }));
    s.miniKit = 4;
  }
  s.dollKit = 1;
  return s;
}
