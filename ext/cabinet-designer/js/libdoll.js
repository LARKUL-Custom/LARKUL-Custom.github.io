/* ---------- Dollhouse library (0.55.4): 1:12 scale cabinets for advertisements and mock kitchens ----------
   A separate product library (the library picker above the Products tree), like American Cabinets. The cabinets are the
   shop's standard products at 1:12 (1" = 1'), cut from 1/8" Baltic birch. They don't work like real cabinets:
   - no Blum hinges, slides, pulls, Confirmats or dowels (all far bigger than the parts); every front is glued on,
   - the box is glued: the back is the same 1/8" as the box (the shop's 3/4 back at scale), set in between the sides, top
     and bottom, flush with their back edges, so no back edge shows from the side; no nailers, no dado; toe kick is a notch,
   - 1/16" pin holes go through both sides at the same four spots on every cabinet of a height, so cabinets set side by side
     pin together with 1/16" brass rod (no glue) to make a mock kitchen, and the tiny end panels have matching blind holes
     on their back so they pin onto an exposed side.
   Picking this library adds the 1/8" material, a cabinet material template, finish, door style, door template, end panel
   style and edgebanding template it needs to the job (ensureDollKit), once. */
'use strict';
const DOLL_SCALE = 12;
const DOLL_PARAMS = {
  baseType: 'notch', toeKickHeight: 0.3125, toeKickSetback: 0.25, toeSkin: 'on', backInset: 0, dadoDepth: 0, nailers: 'none',
  shelfCount: 0, frontGap: 0.03125, frontSideReveal: 0.015625, frontTopReveal: 0.03125, frontBottomReveal: 0.03125,
  pinHoles: 0.0625,
};
function dollLibItems() {
  const R = (type, h, count = 1) => ({ type, h, count });
  // Pin heights up from the cabinet bottom, the same on every cabinet of a kind so neighbours line up.
  const PZ = { Base: [0.953, 2.234], Wall: [0.75, 2.25], Tall: [0.953, 2.234, 5.25, 6.75] };
  const mk = (id, name, cat, w, h, d, elev, rows) => ({
    id, name, cat, w, h, d, elev, rows, params: { ...DOLL_PARAMS, pinZ: PZ[cat] }, construction: { toeKick: cat !== 'Wall', top: 'full' }, folder: 'Dollhouse 1:12',
    cabMatT: 'doll-mt', doorT: 'doll-door', finish: 'doll-fin', hinge: 'none', pull: 'none', partT: 'doll-pt', jointU: 'none', jointF: 'none',
    panelStyle: 'doll-panel', noTop: true, fillL: 'off', fillR: 'off', desc: `1:12 of a ${w * DOLL_SCALE}" ${cat.toLowerCase()} cabinet`,
  });
  return [
    mk('doll-b1', 'Dollhouse Base 1 Door 1 Drawer', 'Base', 1.5, 2.875, 2, 0, [R('false', 0.5), { ...R('door', '*'), hinge: 'L' }]),
    mk('doll-b2', 'Dollhouse Base 2 Door 1 Drawer', 'Base', 2.5, 2.875, 2, 0, [R('false', 0.5), R('door', '*', 2)]),
    mk('doll-b3dr', 'Dollhouse Base 3 Drawer', 'Base', 1.5, 2.875, 2, 0, [R('false', 0.5), R('false', '*'), R('false', '*')]),
    mk('doll-sink', 'Dollhouse Sink Base', 'Base', 3, 2.875, 2, 0, [R('false', 0.5), R('door', '*', 2)]),
    mk('doll-w1', 'Dollhouse Wall 1 Door', 'Wall', 1.5, 3, 1, 4.5, [{ ...R('door', '*'), hinge: 'L' }]),
    mk('doll-w2', 'Dollhouse Wall 2 Door', 'Wall', 2.5, 3, 1, 4.5, [R('door', '*', 2)]),
    mk('doll-pantry', 'Dollhouse Tall Pantry', 'Tall', 2, 7.5, 2, 0, [R('door', 3, 2), R('door', '*', 2)]),
  ];
}
const DOLL_LIB = dollLibItems();
// What the dollhouse products point at, added to a job once (anything Ayden changes or deletes after is his).
function ensureDollKit(s) {
  if (!s || !Array.isArray(s.materials)) return s;
  const add = (list, item) => { if (Array.isArray(list) && !list.some(x => x.id === item.id)) list.push(item); };
  add(s.materials, { id: 'doll-m', name: '1/8 Baltic birch (dollhouse)', kind: 'sheet', thick: 0.125, sheetW: 24, sheetL: 48, grain: true, cost: 12, color: '#e3cfa8', texture: null, procedural: 'maple', texScale: 6, group: 'Dollhouse' });
  if (s.matTemplates) add(s.matTemplates.cabinet, { id: 'doll-mt', name: 'Dollhouse 1/8 birch', carcass: 'doll-m', back: 'doll-m', shelf: 'doll-m', toeKick: 'doll-m' });
  add(s.finishes, { id: 'doll-fin', name: 'Dollhouse 1/8 birch', front: 'doll-m', panel: 'doll-m', sheet: 'doll-m', solid: 'doll-m' });
  add(s.doorStyles, { id: 'doll-shaker', name: 'Dollhouse shaker (routed)', type: 'routed', mat: 'doll-m', stile: 0.25, rail: 0.25, pocketDepth: 0.03125, tenon: 0, panelMat: 'doll-m', source: 'make', minPanel: 0.5 });
  add(s.doorStyles, { id: 'doll-slab', name: 'Dollhouse slab', type: 'slab', mat: 'doll-m', stile: 0, rail: 0, pocketDepth: 0, tenon: 0, panelMat: 'doll-m', source: 'make' });
  add(s.doorTemplates, { id: 'doll-door', name: 'Dollhouse shaker', door: 'doll-shaker', drawer: 'doll-shaker', falseFront: 'doll-shaker', minFrameHeight: 1, pull: 'none', drawerPull: 'none', pullFromEdge: 0, pullFromEnd: 0, drawerPullFromTop: 0 });
  add(s.panels, { id: 'doll-panel', name: 'Dollhouse end panel (pins on)', type: 'flat', mat: 'doll-m', frontOverhang: 0.125, scribe: 0, toFloor: true, frame: 0, pocketDepth: 0 });
  add(s.partTemplates, { id: 'doll-pt', name: 'Dollhouse: no edgebanding', rules: {} });
  s.dollKit = 1;
  return s;
}
