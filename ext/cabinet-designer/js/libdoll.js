/* ---------- Mini cabinets library (1:3 scale): small cabinets for advertisements and mock kitchens ----------
   A separate product library (the library picker above the Products tree), like American Cabinets. The shop's standard
   products at 1:3 (4" = 1'), cut from 1/4" Baltic birch. 0.55.7 had them at 1:12 (dollhouse); Ayden's CNC needs parts about
   4" or bigger to hold them, so 0.55.10 moved to 1:4 and 0.55.11 to 1:3 (uppers 4" deep, so every part is 4" or more).
   They don't work like real cabinets:
   - one front panel per cabinet (p.onePieceFront): the doors and drawer fronts are V-grooved lines on one glued-on panel,
     each door gets a shallow shaker recess, so nothing tiny gets cut; no hinges, slides, pulls, Confirmats or dowels,
   - the box is glued: the back is the same 1/4" as the box, set in between the sides, top and bottom, flush with their
     back edges (no nailers, no dado); the toe kick is a notch in the sides (no toe kick board; it would be 1 5/16" tall),
   - 1/8" pin holes go through both sides at the same heights on every cabinet of a kind (the pantry has the base heights
     low and the upper heights high), so cabinets set side by side pin together with 1/8" dowel or rod, no glue, and the
     applied end panels have matching blind holes on their back so they pin onto an exposed side.
   Picking this library adds the 1/4" material, a cabinet material template, finish, door styles, door template, end panel
   style and edgebanding template it needs to the job (ensureDollKit), once. */
'use strict';
const DOLL_SCALE = 3;
const DOLL_PARAMS = {
  baseType: 'notch', toeKickHeight: 1.3125, toeKickSetback: 1, toeSkin: 'off', backInset: 0, dadoDepth: 0, nailers: 'none',
  shelfCount: 0, frontGap: 0.125, frontSideReveal: 0.03125, frontTopReveal: 0.03125, frontBottomReveal: 0.03125,
  pinHoles: 0.125, onePieceFront: true,
};
function dollLibItems() {
  const R = (type, h, count = 1) => ({ type, h, count });
  // Pin heights up from the cabinet bottom, the same on every cabinet of a kind so neighbours line up
  // (the pantry's top two match the uppers, whose tops line up with it).
  const PZ = { Base: [4, 9], Wall: [3, 9], Tall: [4, 9, 21, 27] };
  const mk = (id, name, cat, w, h, d, elev, rows) => ({
    id, name, cat, w, h, d, elev, rows, params: { ...DOLL_PARAMS, pinZ: PZ[cat] }, construction: { toeKick: cat !== 'Wall', top: 'full' }, folder: 'Mini 1:3',
    cabMatT: 'mini-mt', doorT: 'mini-door', finish: 'mini-fin', hinge: 'none', pull: 'none', partT: 'mini-pt', jointU: 'none', jointF: 'none',
    panelStyle: 'mini-panel', noTop: true, fillL: 'off', fillR: 'off', desc: `1:3 of a ${w * DOLL_SCALE}" ${cat.toLowerCase()} cabinet`,
  });
  return [
    mk('mini-b1', 'Mini Base 1 Door 1 Drawer', 'Base', 6, 11.5, 8, 0, [R('false', 2), { ...R('door', '*'), hinge: 'L' }]),
    mk('mini-b2', 'Mini Base 2 Door 1 Drawer', 'Base', 10, 11.5, 8, 0, [R('false', 2), R('door', '*', 2)]),
    mk('mini-b3dr', 'Mini Base 3 Drawer', 'Base', 6, 11.5, 8, 0, [R('false', 2), R('false', '*'), R('false', '*')]),
    mk('mini-sink', 'Mini Sink Base', 'Base', 12, 11.5, 8, 0, [R('false', 2), R('door', '*', 2)]),
    mk('mini-w1', 'Mini Wall 1 Door', 'Wall', 6, 12, 4, 18, [{ ...R('door', '*'), hinge: 'L' }]),
    mk('mini-w2', 'Mini Wall 2 Door', 'Wall', 10, 12, 4, 18, [R('door', '*', 2)]),
    mk('mini-pantry', 'Mini Tall Pantry', 'Tall', 8, 30, 8, 0, [R('door', 12, 2), R('door', '*', 2)]),
  ];
}
const DOLL_LIB = dollLibItems();
// What the mini products point at, added to a job once (anything Ayden changes or deletes after is his).
// A job that opened the 0.55.7 1:12 set gets the 1:4 products in its place (1:12 ones drawn in a room stay).
function ensureDollKit(s) {
  if (!s || !Array.isArray(s.materials)) return s;
  const add = (list, item) => { if (Array.isArray(list) && !list.some(x => x.id === item.id)) list.push(item); };
  add(s.materials, { id: 'mini-m', name: '1/4 Baltic birch (mini cabinets)', kind: 'sheet', thick: 0.25, sheetW: 48, sheetL: 96, grain: true, cost: 30, color: '#e3cfa8', texture: null, procedural: 'maple', texScale: 10, group: 'Mini cabinets' });
  if (s.matTemplates) add(s.matTemplates.cabinet, { id: 'mini-mt', name: 'Mini cabinets 1/4 birch', carcass: 'mini-m', back: 'mini-m', shelf: 'mini-m', toeKick: 'mini-m' });
  add(s.finishes, { id: 'mini-fin', name: 'Mini cabinets 1/4 birch', front: 'mini-m', panel: 'mini-m', sheet: 'mini-m', solid: 'mini-m' });
  add(s.doorStyles, { id: 'mini-shaker', name: 'Mini shaker (recess in the one-piece front)', type: 'routed', mat: 'mini-m', stile: 0.75, rail: 0.75, pocketDepth: 0.0625, tenon: 0, panelMat: 'mini-m', source: 'make', minPanel: 1 });
  add(s.doorStyles, { id: 'mini-slab', name: 'Mini slab', type: 'slab', mat: 'mini-m', stile: 0, rail: 0, pocketDepth: 0, tenon: 0, panelMat: 'mini-m', source: 'make' });
  add(s.doorTemplates, { id: 'mini-door', name: 'Mini shaker', door: 'mini-shaker', drawer: 'mini-shaker', falseFront: 'mini-shaker', minFrameHeight: 3, pull: 'none', drawerPull: 'none', pullFromEdge: 0, pullFromEnd: 0, drawerPullFromTop: 0 });
  add(s.panels, { id: 'mini-panel', name: 'Mini end panel (pins on)', type: 'flat', mat: 'mini-m', frontOverhang: 0.25, scribe: 0, toFloor: true, frame: 0, pocketDepth: 0 });
  add(s.partTemplates, { id: 'mini-pt', name: 'Mini cabinets: no edgebanding', rules: {} });
  // Jobs that opened the 1:12 set (0.55.7) or the 1:4 set (0.55.10) get the 1:3 products in their place; products with a
  // cabinet drawn from them stay. The 1:4 shaker frame and drawer front size move to the 1:3 ones if not changed.
  if (s.miniKit !== 3) {
    const used = new Set((s.rooms || []).flatMap(r => (r.cabinets || []).map(c => c.libId)));
    const fresh = L => { const keep = L.filter(l => !/^(doll|mini)-/.test(l.id) || used.has(l.id)); return keep.concat(clone(DOLL_LIB).filter(l => !keep.some(x => x.id === l.id))); };
    if (s.libSet === 'doll' && Array.isArray(s.library)) s.library = fresh(s.library);
    else if (s.libSets && Array.isArray(s.libSets.doll)) s.libSets.doll = fresh(s.libSets.doll);
    const st = s.doorStyles.find(d => d.id === 'mini-shaker'); if (st && st.stile === 0.5625 && st.rail === 0.5625) { st.stile = 0.75; st.rail = 0.75; }
    const dt = (s.doorTemplates || []).find(d => d.id === 'mini-door'); if (dt && dt.minFrameHeight === 2.5) dt.minFrameHeight = 3;
    s.miniKit = 3;
  }
  s.dollKit = 1;
  return s;
}
