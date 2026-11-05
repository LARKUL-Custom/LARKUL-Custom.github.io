// Core: units, registries, the sample job, state, persistence and undo.
// Every script in this extension is a classic script, so top-level names are shared.
'use strict';
const MM = 1 / 25.4;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = p => (p || 'x') + '-' + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r3 = v => Math.round(v * 1000) / 1000;
const clone = o => JSON.parse(JSON.stringify(o));
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/* ---------- Units: inches inside, fractions on screen ---------- */
function fmtLen(x, q) {
  if (x === '' || x === undefined || x === null || !isFinite(x)) return '';
  const neg = x < 0; const n = Math.round(Math.abs(x) * 32);
  const whole = Math.floor(n / 32); let f = n % 32, d = 32;
  while (f && f % 2 === 0) { f /= 2; d /= 2; }
  const s = f ? (whole ? whole + ' ' : '') + f + '/' + d : String(whole);
  return (neg ? '-' : '') + s + (q ? '"' : '');
}
function parseLen(str) {
  if (typeof str === 'number') return str;
  str = String(str).trim().toLowerCase().replace(/["”]/g, '').trim();
  if (!str) return NaN;
  let mm = false;
  if (/mm$/.test(str)) { mm = true; str = str.replace(/mm$/, '').trim(); }
  let m, v;
  if ((m = str.match(/^(-?\d+)[\s-]+(\d+)\/(\d+)$/))) v = (+m[1] < 0 ? -1 : 1) * (Math.abs(+m[1]) + m[2] / m[3]);
  else if ((m = str.match(/^(\d+)\/(\d+)$/))) v = m[1] / m[2];
  else if (/^-?\d*\.?\d+$/.test(str)) v = parseFloat(str);
  else v = NaN;
  return mm ? v * MM : v;
}

/* ---------- Registries ---------- */
const PARAM_DEFS = [
  { k: 'baseType', g: 'base', label: 'Cabinet base', type: 'select', cats: ['Base', 'Tall'], options: [{ v: 'feet', l: 'Feet (leveler legs)' }, { v: 'notch', l: 'Toe kick notch in the sides' }] },
  { k: 'toeSkin', g: 'base', label: 'Toe skin', type: 'select', cats: ['Base', 'Tall'], options: [{ v: 'on', l: 'Add automatically' }, { v: 'off', l: 'Leave off' }] },
  { k: 'toeKickHeight', g: 'base', label: 'Toe kick / feet height', type: 'len', cats: ['Base', 'Tall'] },
  { k: 'toeKickSetback', g: 'base', label: 'Toe kick / toe skin setback', type: 'len', cats: ['Base', 'Tall'] },
  { k: 'toeSkinMaxL', g: 'base', label: 'Toe skin stock length (longer ones split)', type: 'len', cats: ['Base', 'Tall'] },
  { k: 'feetCount', g: 'base', label: 'Feet per cabinet (0 = automatic)', type: 'int', cats: ['Base', 'Tall'] },
  { k: 'stretcherWidth', g: 'box', label: 'Top stretcher width', type: 'len', cats: ['Base'] },
  { k: 'nailers', g: 'box', label: 'Wall nailers', type: 'select', options: [{ v: 'none', l: 'None' }, { v: 'top', l: 'Top, at the back' }, { v: 'bottom', l: 'Bottom, at the back' }, { v: 'both', l: 'Top and bottom' }] },
  { k: 'nailerWidth', g: 'box', label: 'Nailer width', type: 'len' },
  { k: 'backInset', g: 'box', label: 'Back inset from rear', type: 'len' },
  { k: 'dadoDepth', g: 'box', label: 'Back dado depth', type: 'len' },
  { k: 'shelfCount', g: 'shelves', label: 'Adjustable shelves', type: 'int' },
  { k: 'shelfMinSep', g: 'shelves', label: 'Fill with shelves, at least this apart (0 = use the count)', type: 'len' },
  { k: 'backLBMinW', g: 'shelves', label: 'Rear line bore on cabinets wider than (0 = off)', type: 'len' },
  { k: 'backLBThru', g: 'shelves', label: 'Rear line bore holes', type: 'select', options: [{ v: 'blind', l: 'Blind (pin depth)' }, { v: 'thru', l: 'Through the side' }] },
  { k: 'shelfFrontSetback', g: 'shelves', label: 'Shelf front setback', type: 'len' },
  { k: 'pinZoneInset', g: 'shelves', label: 'Shelf pin zone inset', type: 'len' },
  { k: 'shelfDrill', g: 'shelves', label: 'Adjustable shelf holes', type: 'select', options: [{ v: 'set', l: 'A set of holes at each shelf' }, { v: 'line', l: 'Line bore the whole opening' }] },
  { k: 'shelfHoles', g: 'shelves', label: 'Holes per set (each row)', type: 'int' },
  { k: 'frontGap', g: 'fronts', label: 'Gap between fronts', type: 'len' },
  { k: 'frontSideReveal', g: 'fronts', label: 'Front side reveal', type: 'len' },
  { k: 'frontTopReveal', g: 'fronts', label: 'Front top reveal', type: 'len' },
  { k: 'frontBottomReveal', g: 'fronts', label: 'Front bottom reveal', type: 'len' },
  { k: 'hingeSide', g: 'fronts', label: 'Single door hinge side', type: 'select', options: ['L', 'R'] },
  { k: 'hingeInset', g: 'fronts', label: 'Hinge from door end', type: 'len' },
  { k: 'drawerBox', g: 'drawers', label: 'Drawer box joints', type: 'select', options: [{ v: 'butt', l: 'Sides overlap the front and back' }, { v: 'dovetail', l: 'Dovetail (sides between front and back)' }, { v: 'nofront', l: 'No box front (face screws to the bottom)' }] },
  { k: 'dovetailPin', g: 'drawers', label: 'Dovetail pin depth', type: 'len' },
  { k: 'drawerBottomDado', g: 'drawers', label: 'Drawer bottom dado', type: 'len' },
];
// Parameter groups, by what they are for.
const PARAM_GROUPS = [['base', 'Feet and toe kick'], ['box', 'Cabinet construction'], ['shelves', 'Shelves'], ['fronts', 'Doors and drawer fronts'], ['drawers', 'Drawer boxes']];
const SHOP_PARAMS = {
  baseType: 'feet', toeSkin: 'on', feetCount: 0, toeKickHeight: 4, toeKickSetback: 3, stretcherWidth: 4, nailers: 'none', nailerWidth: 3.5, backInset: 0.75, dadoDepth: 0.375,
  shelfCount: 1, shelfFrontSetback: 0.25, pinZoneInset: 2.5, shelfDrill: 'set', shelfHoles: 5, frontGap: 0.125, frontSideReveal: 0.0625,
  frontTopReveal: 0, frontBottomReveal: 0, hingeSide: 'L', hingeInset: 4, drawerBottomDado: 0.25, toeSkinMaxL: 96, shelfMinSep: 0, backLBMinW: 0, backLBThru: 'blind', drawerBox: 'butt', dovetailPin: 0.5,
};
const R = (type, h, count = 1) => ({ type, h, count });
const FACE_PRESETS = [
  { id: '1door', name: '1 Door', rows: [R('door', '*')] },
  { id: '2door', name: '2 Door', rows: [R('door', '*', 2)] },
  { id: '1dr1d', name: '1 Drawer, 1 Door', rows: [R('drawer', 6), R('door', '*')] },
  { id: '1dr2d', name: '1 Drawer, 2 Door', rows: [R('drawer', 6), R('door', '*', 2)] },
  { id: '2drw', name: '2 Drawer', rows: [R('drawer', '*'), R('drawer', '*')] },
  { id: '3drw', name: '3 Drawer', rows: [R('drawer', 6), R('drawer', '*'), R('drawer', '*')] },
  { id: '4drw', name: '4 Drawer', rows: [R('drawer', 5), R('drawer', 6), R('drawer', '*'), R('drawer', '*')] },
  { id: 'sink', name: 'False front, 2 Door', rows: [R('false', 6), R('door', '*', 2)] },
  { id: 'open', name: 'Open (no fronts)', rows: [R('open', '*')] },
  { id: '2over2', name: '2 Door over 2 Door', rows: [R('door', 36, 2), R('door', '*', 2)] },
  { id: 'door3dr', name: '2 Door over 3 Drawer', rows: [R('door', '*', 2), R('drawer', 10), R('drawer', 10), R('drawer', 10)] },
];
// Interior inserts a cabinet can hold. Roll-outs, dividers and tray dividers make parts; the rest go on the hardware list.
const INSERT_TYPES = [
  { id: 'rollout', name: 'Roll-out shelves', fields: ['n', 'h'], def: { n: 2, h: 4 }, hint: 'Drawer boxes on slides behind the doors, spaced evenly in the bottom door opening.' },
  { id: 'divider', name: 'Vertical divider', fields: ['x'], def: { x: '*' }, hint: 'Full-height partition. Adjustable shelves are split in two.' },
  { id: 'traydiv', name: 'Tray dividers', fields: ['n'], def: { n: 3 }, hint: 'Upright slats for baking sheets and trays.' },
  { id: 'trash', name: 'Pull-out waste bin', fields: ['name'], def: { name: 'Double 35 qt pull-out waste bin' } },
  { id: 'lazy', name: 'Lazy susan', fields: ['name'], def: { name: 'Lazy susan, 2 shelf' } },
  { id: 'rotray', name: 'Roll-out trays', fields: ['n', 'h'], def: { n: 1, h: 2.5 }, hint: 'Low-sided roll-outs on slides behind the doors.' },
  { id: 'roshelf', name: 'Roll-out shelves (lip only)', fields: ['n', 'h'], def: { n: 1, h: 1.5 }, hint: 'A shelf on slides with a small lip all round.' },
  { id: 'rod', name: 'Closet rod', fields: ['name'], def: { name: 'Closet rod' }, hint: 'A rod across the opening, with a pair of flanges. Goes on the hardware list with its length.' },
  { id: 'separator', name: 'Separator', fields: ['x'], def: { x: '*' }, hint: 'An upright panel splitting this one opening.' },
  { id: 'pullout', name: 'Full-height pull-out', fields: ['name'], def: { name: 'Pull-out' }, hint: 'A pull-out that fills its opening, like a spice, paper towel or organizer pull-out. Goes on the hardware list.' },
  { id: 'other', name: 'Other insert', fields: ['name'], def: { name: 'Insert' }, hint: 'Goes on the hardware list only.' },
];
// Part kinds for edgebanding. Edges follow the part's machining coordinates:
// L1 runs along the length at y = 0, L2 along the length at y = width, W1 across the width at x = 0, W2 at x = length.
const EDGE_KEYS = ['L1', 'L2', 'W1', 'W2'];
const PART_KINDS = [
  { id: 'side', name: 'Cabinet sides', edges: { L1: 'Front', L2: 'Back', W1: 'Bottom', W2: 'Top' } },
  { id: 'topbot', name: 'Top and bottom', edges: { L1: 'Front', L2: 'Back', W1: 'Left end', W2: 'Right end' } },
  { id: 'stretcher', name: 'Front stretcher', edges: { L1: 'Front', L2: 'Back', W1: 'Left end', W2: 'Right end' } },
  { id: 'rearStretcher', name: 'Rear stretcher', edges: { L1: 'Front', L2: 'Back', W1: 'Left end', W2: 'Right end' } },
  { id: 'back', name: 'Back', edges: { L1: 'Left', L2: 'Right', W1: 'Bottom', W2: 'Top' } },
  { id: 'toekick', name: 'Toe kick', edges: { L1: 'Bottom', L2: 'Top', W1: 'Left end', W2: 'Right end' } },
  { id: 'shelf', name: 'Adjustable shelves', edges: { L1: 'Front', L2: 'Back', W1: 'Left end', W2: 'Right end' } },
  { id: 'divider', name: 'Dividers', edges: { L1: 'Front', L2: 'Back', W1: 'Bottom', W2: 'Top' } },
  { id: 'door', name: 'Doors and false fronts', edges: { L1: 'Left', L2: 'Right', W1: 'Bottom', W2: 'Top' } },
  { id: 'drawerFront', name: 'Drawer fronts', edges: { L1: 'Left', L2: 'Right', W1: 'Bottom', W2: 'Top' } },
  { id: 'frame', name: '5-piece stiles, rails and panels', edges: { L1: 'Long edge 1', L2: 'Long edge 2', W1: 'End 1', W2: 'End 2' } },
  { id: 'drawerBox', name: 'Drawer and roll-out box sides, fronts, backs', edges: { L1: 'Bottom', L2: 'Top', W1: 'Front end', W2: 'Back end' } },
  { id: 'drawerBottom', name: 'Drawer bottoms', edges: { L1: 'Long edge 1', L2: 'Long edge 2', W1: 'End 1', W2: 'End 2' } },
  { id: 'spacer', name: 'Roll-out spacers', edges: { L1: 'Bottom', L2: 'Top', W1: 'Front end', W2: 'Back end' } },
  { id: 'applied', name: 'Applied end panels', edges: { L1: 'Long edge 1', L2: 'Long edge 2', W1: 'Bottom', W2: 'Top' } },
  { id: 'filler', name: 'Fillers', edges: { L1: 'Long edge 1', L2: 'Long edge 2', W1: 'Bottom', W2: 'Top' } },
  { id: 'faceFrame', name: 'Face frame stiles and rails', edges: { L1: 'Inside edge', L2: 'Outside edge', W1: 'End 1', W2: 'End 2' } },
];
const partKind = id => PART_KINDS.find(k => k.id === id) || PART_KINDS[0];
const EB_ROLL = { cost: 25, ft: 600 };
function defaultEdgebands() {
  return [
    { id: 'eb-maple', name: 'Maple veneer 0.5 mm', thickMM: 0.5, width: 0.875, color: '#e2c896' },
    { id: 'eb-oak', name: 'White oak veneer 0.5 mm', thickMM: 0.5, width: 0.875, color: '#c9a77a' },
    { id: 'eb-pvc', name: 'PVC 1 mm, match fronts', thickMM: 1, width: 0.875, color: '#f1f0ec' },
    { id: 'eb-birch', name: 'Birch veneer 0.5 mm', thickMM: 0.5, width: 0.75, color: '#e6d3ad' },
  ];
}
function defaultPartTemplates() {
  const e = (L1 = '', L2 = '', W1 = '', W2 = '') => ({ L1, L2, W1, W2 }), all = b => e(b, b, b, b);
  return [
    { id: 'pt-std', name: 'Standard: front edges', rules: {
      side: e('eb-maple'), topbot: e('eb-maple'), stretcher: e('eb-maple'), shelf: e('eb-maple'), divider: e('eb-maple'), spacer: e('', '', 'eb-maple'),
      door: all('eb-pvc'), drawerFront: all('eb-pvc'), applied: all('eb-pvc'), drawerBox: e('', 'eb-birch') } },
    { id: 'pt-exposed', name: 'Exposed: fronts plus top and bottom ends', rules: {
      side: e('eb-maple', '', 'eb-maple', 'eb-maple'), topbot: e('eb-maple'), stretcher: e('eb-maple'), shelf: e('eb-maple'), divider: e('eb-maple', '', '', 'eb-maple'), spacer: e('', '', 'eb-maple'),
      door: all('eb-pvc'), drawerFront: all('eb-pvc'), applied: all('eb-pvc'), drawerBox: e('', 'eb-birch'), toekick: e('', '', 'eb-maple', 'eb-maple') } },
    { id: 'pt-none', name: 'No edgebanding', rules: {} },
  ];
}
// Older saves get the edgebanding library and a job default.
function ensureEdgeLibs(s) {
  if (!Array.isArray(s.edgebands)) s.edgebands = defaultEdgebands();
  // Each band is priced by the roll: Ayden's white banding is $25 for a 600 ft roll.
  s.edgebands.forEach(b => { if (b.rollCost == null) b.rollCost = EB_ROLL.cost; if (b.rollFt == null) b.rollFt = EB_ROLL.ft; });
  if (!Array.isArray(s.partTemplates) || !s.partTemplates.length) s.partTemplates = defaultPartTemplates();
  if (s.job && s.job.defaults && !s.job.defaults.partT) s.job.defaults.partT = s.partTemplates[0].id;
  return s;
}
// Door designer: frame, panel and panel design options. Older door styles get these defaults.
const DOOR_DEFAULTS = {
  stile: 2.25, rail: 2.25, midRails: 0, midRailW: 0, midStiles: 0, midStileW: 0, pocketDepth: 0.25, tenon: 0.375,
  panelType: 'flat', raiseW: 1.5, design: 'none', grooveSpacing: 3, grooveW: 0.25, grooveDepth: 0.125, edgeProfile: 'square', insideProfile: 'square',
  // Made in the shop (cut list and CNC) or bought from a door maker (door order only).
  source: 'make', vHinge: 'none',
  // Split doors: opening sizes top to bottom (splitH) and left to right (splitW); a number, a formula of W and H, or blank to share.
  splitH: [], splitW: [], fieldPanels: [], cat: '', rate: 14, min: 20, matCost: '',
  // Size rules: a front outside these (blank = no limit) takes the swap style instead, e.g. a short shaker drawer front becomes a slab.
  minW: '', maxW: '', minH: '', maxH: '', swap: '',
  // Two-piece doors: the rabbet the panel drops into from the back, and the play around the panel.
  recessW: 0.375, recessD: 0.375, panelGap: 0.0625,
};
// Gallery groups in the door designer. A style with no category is placed by its shape.
const DOOR_CATS = [{ v: 'slab', l: 'Slab' }, { v: 'shaker', l: 'Shaker styles' }, { v: 'specialty', l: 'Specialty styles' }, { v: 'split', l: 'Split styles' }];
function doorCat(d) {
  if (d.cat && DOOR_CATS.some(c => c.v === d.cat)) return d.cat;
  if (d.type !== 'slab' && (d.midRails || d.midStiles || d.midRailsF || d.midStilesF)) return 'split';
  if (d.type === 'slab') return d.design === 'none' ? 'slab' : 'specialty';
  return d.panelType === 'flat' && d.design === 'none' && d.insideProfile === 'square' ? 'shaker' : 'specialty';
}
const DOOR_SOURCES = [{ v: 'make', l: 'Made in shop (cut list and CNC)' }, { v: 'buyout', l: 'Buyout (ordered from a door maker)' }];
const VENDOR_HINGE = [{ v: 'none', l: 'None' }, { v: 'bored', l: 'Door maker bores the cups' }];
// How buyout doors are exported (S.doorExport): Bywater's CSV import, or the door maker order form layout.
const DOOR_EXPORTS = [{ v: 'bywater', l: 'Bywater' }, { v: 'form', l: 'Order form' }];
const doorExportOf = s => DOOR_EXPORTS.some(x => x.v === s.doorExport) ? s.doorExport : 'bywater';
// Bywater's dropdown values, letter for letter (their import fails on anything else). First of each list is the shop standard.
const BYWATER = {
  product: ['Engineered Panel', 'Hardwood Slab'],
  folder: ['Left'],
  wood: ['Oak White', 'Oak White (Rift)', 'Oak White (Qtr Sawn)', 'Oak White (Rustic)', 'Oak Red', 'Maple', 'Maple Soft (Paint Grade)', 'Alder', 'Black Walnut', 'Cherry', 'Hickory Calico', 'Poplar', 'Sapele'],
  face: ['Vertical Grain', 'Horizontal Grain', 'V-Groove 2" Apart', '1/8" Square Groove 2" Apart'],
  profile: ['P4- 1/4" Flat Panel', 'P3- 3/8" Flat Panel', 'P2- 4 Step', 'P5- Scoop', 'P27- Ogee'],
  panel: ['1/4" Oak White Veneer', '1/4" MDF No Veneer', '3/8" MDF No Veneer', '3/4" HDM No Veneer', '1/4" Oak White (Rift) Veneer', '1/4" Maple Veneer'],
  sr: ['SR3- Square', 'SR1- 1/4" Bead', 'SR4- Bevel', 'SR6- Centered Square', 'SR22- Inverted Square'],
  edge: ['E2- None', 'E4- Eased Top', 'E5- 1/4" Bevel', 'E7- 1/4" Round', 'E18- 1/8" Radius'],
};
const DOOR_TYPES = [{ v: 'slab', l: 'Slab (one flat piece)' }, { v: 'routed', l: 'One-piece routed (CNC carves the frame look)' }, { v: 'twopiece', l: 'Two-piece (CNC cuts the 3/4 frame, separate recessed panel)' }, { v: 'fivepiece', l: 'Stiles and rails with a separate panel' }];
// Doors whose frame is cut from one sheet on the CNC.
const cncFramed = ds => ds.type === 'routed' || ds.type === 'twopiece';
const PANEL_TYPES = [{ v: 'flat', l: 'Flat panel' }, { v: 'raised', l: 'Raised panel' }, { v: 'insert', l: 'Separate panel (set in from the back)' }, { v: 'glass', l: 'Glass' }, { v: 'open', l: 'Open (no panel)' }];
const PANEL_DESIGNS = [{ v: 'none', l: 'Plain' }, { v: 'vgroove', l: 'Vertical V-grooves' }, { v: 'hgroove', l: 'Horizontal V-grooves' }, { v: 'beadboard', l: 'Beadboard' }, { v: 'xbrace', l: 'X brace (farmhouse)' }];
const EDGE_PROFILES = [{ v: 'square', l: 'Square' }, { v: 'eased', l: 'Eased' }, { v: 'bevel', l: 'Bevel' }, { v: 'roundover', l: 'Roundover' }, { v: 'ogee', l: 'Ogee' }];
const DOOR_PRESETS = [
  { id: 'shaker', name: 'Shaker', type: 'routed', stile: 2.25, rail: 2.25, panelType: 'flat', design: 'none' },
  { id: 'raised', name: 'Raised panel', type: 'fivepiece', stile: 2.5, rail: 2.5, panelType: 'raised', raiseW: 1.75, insideProfile: 'ogee', edgeProfile: 'roundover' },
  { id: 'glass', name: 'Glass shaker', type: 'fivepiece', stile: 2.25, rail: 2.25, panelType: 'glass' },
  { id: 'vslab', name: 'V-groove slab', type: 'slab', design: 'vgroove', grooveSpacing: 3 },
  { id: 'bead', name: 'Beadboard shaker', type: 'routed', stile: 2.5, rail: 2.5, panelType: 'flat', design: 'beadboard', grooveSpacing: 1.5 },
  { id: 'twopanel', name: 'Two-panel shaker', type: 'routed', stile: 2.25, rail: 2.25, midRails: 1, panelType: 'flat' },
  { id: 'threepanel', name: 'Three-panel shaker', type: 'routed', stile: 2.25, rail: 2.25, midRails: 2, panelType: 'flat' },
  { id: 'toplite', name: 'Short top panel shaker', type: 'routed', stile: 2.25, rail: 2.25, midRails: 1, panelType: 'flat', splitH: ['H/4', ''] },
  { id: 'twopc', name: 'Two-piece shaker (3/8 HDF panel)', type: 'twopiece', stile: 2.25, rail: 2.25, panelType: 'flat', panelMat: 'm-hdf38' },
  { id: 'pair', name: 'Two-wide shaker', type: 'routed', stile: 2.25, rail: 2.25, midStiles: 1, panelType: 'flat' },
  { id: 'farm', name: 'Farmhouse X', type: 'fivepiece', stile: 3, rail: 3, panelType: 'flat', design: 'xbrace', grooveW: 2 },
];
// Inserts that fill a door opening, so it can't also have adjustable shelves.
const SHELF_BLOCKERS = ['rollout', 'rotray', 'roshelf', 'traydiv', 'trash', 'lazy', 'pullout'];
const insertType = id => INSERT_TYPES.find(t => t.id === id) || INSERT_TYPES[INSERT_TYPES.length - 1];
const HW_KINDS = [['slide', 'Drawer slides'], ['hinge', 'Hinges'], ['pull', 'Pulls and knobs'], ['shelfpin', 'Shelf pins'], ['joint', 'Joint templates'], ['leg', 'Legs'], ['other', 'Other hardware']];
// Joint templates: how the box is fastened together. Female holes go in the face of the side (or the panel a divider lands on),
// male holes in the end of the panel that butts into it. A depth of 0 drills through. Sizes are inches.
const JOINT_LOC = { front: 2, back: 2, maxGap: 8 };
function defaultJoints() {
  return [
    { id: 'jt-confirmat', kind: 'joint', name: 'Confirmat', cost: 0.03, applies: { Base: true, Wall: true, Tall: true, fin: false, unfin: true },
      female: { dia: 0.1969, depth: 0 }, male: { dia: 0.1969, depth: 1.75, center: true }, breakDado: 0,
      ends: { ...JOINT_LOC }, dividers: { ...JOINT_LOC }, stretchers: { n: 2 } },
    { id: 'jt-dowel', kind: 'joint', name: 'Dowels', cost: 0, applies: { Base: true, Wall: true, Tall: true, fin: true, unfin: false },
      female: { dia: 0.315, depth: 0.5003 }, male: { dia: 0.315, depth: 1, center: true }, breakDado: 1,
      ends: { front: 2, back: 2, maxGap: 6 }, dividers: { front: 2, back: 2, maxGap: 6 }, stretchers: { n: 2 } },
  ];
}
// Leg layout like Mozaik's Legs tab. Insets are from the outside of the cabinet: toe (front), finished end, unfinished end, back.
const LEG_DEF = { inToe: 3.9685, inFin: 2.1969, inUnfin: 1.4094, inBack: 3.9685, maxSep: 0, noBack: false, holeDia: 0.3937, holeDepth: 0.4724, width: 2.2441, depth: 2.5827 };
// Ayden's shop hardware, copied from his Mozaik exports (2026-11-02): Blum CLIP top BLUMOTION with the old plate, 71B35xx
// full overlay, drilling two 8 mm dowels beside the cup; hinges 4" from the door ends, at most 36" apart.
const CLIPTOP_MOZAIK = { kind: 'hinge', name: 'Blum CLIP top BLUMOTION 110° full overlay', cupDiaMM: 35, cupDepthMM: 13, cupEdgeMM: 5,
  cupExtra: [{ dx: -22.5, dy: 9.5, dia: 8, depth: 13 }, { dx: 22.5, dy: 9.5, dia: 8, depth: 13 }],
  plateHoles: [{ dz: -16, y: 37, dia: 5, depth: 12.7 }, { dz: 16, y: 37, dia: 5, depth: 12.7 }], max2: 42, max3: 80, cost: 5, plateCost: 0 };
// Hafele Axilo 78 square screw-in leg: centre 39.5 mm in from the toe skin, ends and back; four 5 mm marks per leg on
// a 64 mm square, offset 13 mm toward the cabinet's middle; at most 34" apart; $4.50 each.
const AXILO78_MOZAIK = { kind: 'leg', name: 'Hafele Axilo 78 square screw-in', feet: true, inToe: 5.3151, inFin: 2.3151, inUnfin: 2.3051, inBack: 4, maxSep: 34,
  noBack: false, holeDia: 0.1969, holeDepth: 0.0394, width: 4.1339, depth: 3.1102, holesMM: [{ x: -19, y: 32 }, { x: 45, y: 32 }, { x: 45, y: -32 }, { x: -19, y: -32 }], cost: 4.5 };
// Older saves get the joint templates, real legs and the job's picks.
function ensureJoinery(s) {
  if (!Array.isArray(s.hardware)) return s;
  if (!s.hardware.some(h => h.kind === 'joint')) s.hardware.push(...defaultJoints());
  s.hardware.forEach(h => { if (h.feet && h.kind !== 'leg') { h.kind = 'leg'; } if (h.kind === 'leg') { h.feet = true; Object.entries(LEG_DEF).forEach(([k, v]) => { if (!(k in h)) h[k] = v; }); } });
  if (!s.hardware.some(h => h.kind === 'leg')) s.hardware.push({ id: 'hw-leg', kind: 'leg', feet: true, name: 'Adjustable cabinet leg', ...LEG_DEF });
  const d = s.job && s.job.defaults; if (d) {
    const js = s.hardware.filter(h => h.kind === 'joint');
    if (!d.jointU) d.jointU = (js.find(h => h.applies && h.applies.unfin) || js[0]).id;
    if (!d.jointF) d.jointF = (js.find(h => h.applies && h.applies.fin) || js[0]).id;
    if (!d.leg) d.leg = s.hardware.find(h => h.kind === 'leg').id;
  }
  return s;
}

/* ---------- Sample job ---------- */
function seed() {
  const lib = (id, name, cat, w, h, d, elev, rows, params, construction) => ({ id, name, cat, w, h, d, elev, rows, params, construction: construction || defaultConstruction(cat) });
  const S = {
    v: 3,
    job: {
      name: 'Sample house', customer: '', notes: '', wallThick: 4.5, wallHeight: 96,
      params: { ...SHOP_PARAMS },
      defaults: { cabMatT: 'mt-maple', drawerMatT: 'dt-bb58', doorT: 'door-shaker', pull: '', slide: 'hw-563h', hinge: 'hw-cliptop', shelfpin: 'hw-pin5', panelStyle: 'p-routed', countertop: 'top-quartz', molding: 'mo-crown', partT: 'pt-std' },
    },
    materials: [
      { id: 'm-ply', name: '3/4 Prefinished Maple Ply', kind: 'sheet', thick: 0.71875, sheetW: 49, sheetL: 97, grain: true, cost: 118, color: '#e6d3b3', texture: null, procedural: 'maple', texScale: 24 },
      { id: 'm-back', name: '1/4 Maple Ply (backs)', kind: 'sheet', thick: 0.25, sheetW: 49, sheetL: 97, grain: true, cost: 52, color: '#e9d8bb', texture: null, procedural: 'maple', texScale: 24 },
      { id: 'm-bb', name: '5/8 Baltic Birch', kind: 'sheet', thick: 0.625, sheetW: 49, sheetL: 96, grain: false, cost: 74, color: '#eadcc0', texture: null, procedural: 'birch', texScale: 18 },
      { id: 'm-bb12', name: '1/2 Baltic Birch', kind: 'sheet', thick: 0.5, sheetW: 49, sheetL: 96, grain: false, cost: 62, color: '#eadcc0', texture: null, procedural: 'birch', texScale: 18 },
      { id: 'm-bot', name: '1/4 Baltic Birch', kind: 'sheet', thick: 0.25, sheetW: 49, sheetL: 96, grain: false, cost: 36, color: '#eadcc0', texture: null, procedural: 'birch', texScale: 18 },
      { id: 'm-mdf', name: '3/4 MDF (paint grade)', kind: 'sheet', thick: 0.75, sheetW: 49, sheetL: 97, grain: false, cost: 46, color: '#f1f0ec', texture: null, procedural: null, texScale: 24 },
      { id: 'm-hdf38', name: '3/8 HDF (door panels)', kind: 'sheet', thick: 0.375, sheetW: 49, sheetL: 97, grain: false, cost: 38, color: '#b89a74', texture: null, procedural: null, texScale: 24 },
      { id: 'm-mdf-sage', name: '3/4 MDF painted sage', kind: 'sheet', thick: 0.75, sheetW: 49, sheetL: 97, grain: false, cost: 46, color: '#8f9f86', texture: null, procedural: null, texScale: 24 },
      { id: 'm-wo', name: '3/4 Rift White Oak Ply', kind: 'sheet', thick: 0.75, sheetW: 49, sheetL: 97, grain: true, cost: 168, color: '#c9a77a', texture: null, procedural: 'oak', texScale: 30 },
      { id: 'm-quartz', name: '3 cm Quartz, white', kind: 'top', thick: 1.1875, sheetW: 63, sheetL: 120, grain: false, cost: 1400, color: '#f2f1ee', texture: null, procedural: 'stone', texScale: 40 },
      { id: 'm-lam', name: 'Laminate top', kind: 'top', thick: 1.5, sheetW: 25.5, sheetL: 144, grain: false, cost: 190, color: '#7c7468', texture: null, procedural: null, texScale: 24 },
      { id: 'm-butcher', name: 'Maple butcher block', kind: 'top', thick: 1.5, sheetW: 25, sheetL: 120, grain: true, cost: 420, color: '#d6b07c', texture: null, procedural: 'maple', texScale: 24 },
    ],
    matTemplates: {
      cabinet: [
        { id: 'mt-maple', name: 'Prefinished maple cabinet', carcass: 'm-ply', back: 'm-back', shelf: 'm-ply', toeKick: 'm-ply' },
        { id: 'mt-oak', name: 'White oak cabinet (furniture grade)', carcass: 'm-wo', back: 'm-back', shelf: 'm-wo', toeKick: 'm-wo' },
      ],
      drawer: [
        { id: 'dt-bb58', name: '5/8 Baltic birch boxes', sides: 'm-bb', bottom: 'm-bot' },
        { id: 'dt-bb12', name: '1/2 Baltic birch boxes', sides: 'm-bb12', bottom: 'm-bot' },
      ],
    },
    doorStyles: [
      { id: 'd-slab-wo', name: 'Slab, white oak', type: 'slab', mat: 'm-wo', stile: 0, rail: 0, pocketDepth: 0, tenon: 0, panelMat: 'm-back' },
      { id: 'd-slab-mdf', name: 'Slab, paint grade', type: 'slab', mat: 'm-mdf', stile: 0, rail: 0, pocketDepth: 0, tenon: 0, panelMat: 'm-back' },
      { id: 'd-rshaker', name: 'Routed shaker (one-piece MDF)', type: 'routed', mat: 'm-mdf', stile: 2.25, rail: 2.25, pocketDepth: 0.25, tenon: 0, panelMat: 'm-back' },
      { id: 'd-rshaker-sage', name: 'Routed shaker, sage', type: 'routed', mat: 'm-mdf-sage', stile: 2.25, rail: 2.25, pocketDepth: 0.25, tenon: 0, panelMat: 'm-back' },
      { id: 'd-5pc', name: '5-piece shaker, white oak', type: 'fivepiece', mat: 'm-wo', stile: 2.25, rail: 2.25, pocketDepth: 0, tenon: 0.375, panelMat: 'm-back' },
      { id: 'd-raised', name: 'Raised panel, white oak', type: 'fivepiece', mat: 'm-wo', stile: 2.5, rail: 2.5, pocketDepth: 0, tenon: 0.375, panelMat: 'm-wo', panelType: 'raised', raiseW: 1.75, insideProfile: 'ogee', edgeProfile: 'roundover' },
      { id: 'd-vslab', name: 'V-groove slab, paint grade', type: 'slab', mat: 'm-mdf', stile: 0, rail: 0, pocketDepth: 0, tenon: 0, panelMat: 'm-back', design: 'vgroove', grooveSpacing: 3, grooveW: 0.25, grooveDepth: 0.125 },
    ],
    doorTemplates: [
      { id: 'door-shaker', name: 'Shaker, paint grade', door: 'd-rshaker', drawer: 'd-rshaker', falseFront: 'd-slab-mdf', minFrameHeight: 7, pull: 'hw-pull128', drawerPull: 'hw-pull128', pullFromEdge: 2, pullFromEnd: 3, drawerPullFromTop: 0 },
      { id: 'door-sage', name: 'Shaker, sage', door: 'd-rshaker-sage', drawer: 'd-rshaker-sage', falseFront: 'd-rshaker-sage', minFrameHeight: 7, pull: 'hw-pull128', drawerPull: 'hw-pull128', pullFromEdge: 2, pullFromEnd: 3, drawerPullFromTop: 0 },
      { id: 'door-oak', name: 'Rift oak slab', door: 'd-slab-wo', drawer: 'd-slab-wo', falseFront: 'd-slab-wo', minFrameHeight: 99, pull: 'hw-pull96', drawerPull: 'hw-pull96', pullFromEdge: 2, pullFromEnd: 3, drawerPullFromTop: 2 },
      { id: 'door-5pc', name: '5-piece oak, slab drawers', door: 'd-5pc', drawer: 'd-slab-wo', falseFront: 'd-slab-wo', minFrameHeight: 99, pull: 'hw-knob', drawerPull: 'hw-pull128', pullFromEdge: 2, pullFromEnd: 3, drawerPullFromTop: 0 },
    ],
    panels: [
      { id: 'p-flat', name: 'Flat end panel, oak', type: 'flat', mat: 'm-wo', frontOverhang: 0.75, scribe: 0.5, toFloor: true, frame: 0, pocketDepth: 0 },
      { id: 'p-routed', name: 'Routed shaker end', type: 'routed', mat: 'm-mdf', frontOverhang: 0.75, scribe: 0.5, toFloor: true, frame: 3, pocketDepth: 0.25 },
    ],
    hardware: [
      { id: 'hw-563h', ...clone(TANDEM_563H) },
      { id: 'hw-ball', kind: 'slide', name: 'Full-ext ball bearing side mount', notes: '1/2" clearance per side, for 1/2" drawer sides.', lengths: [12, 14, 16, 18, 20, 22],
        sideThickMM: 12.7, widthDeductMM: 25.4, bottomRecessMM: 6.35, bottomClearMM: 6, topClearMM: 20, rearClearMM: 10,
        cabHoles: [{ ref: 'front', y: 37, z: 22, dia: 5, depth: 12 }, { ref: 'rear32', y: 0, z: 22, dia: 5, depth: 12 }],
        boxOps: [{ part: 'side', type: 'bore', edge: '', x: 37, y: 22, inset: 0, dia: 3, depth: 8 }], bomExtra: '' },
      { id: 'hw-cliptop', ...clone(CLIPTOP_MOZAIK) },
      { id: 'hw-inserta', kind: 'hinge', name: 'Blum Clip Top Inserta 110° (press-in dowels)', cupDiaMM: 35, cupDepthMM: 13, cupEdgeMM: 5,
        cupExtra: [{ dx: -22.5, dy: 9.5, dia: 8, depth: 11.5 }, { dx: 22.5, dy: 9.5, dia: 8, depth: 11.5 }], plateHoles: [{ dz: -16, y: 37, dia: 5, depth: 12 }, { dz: 16, y: 37, dia: 5, depth: 12 }], max2: 40, max3: 60 },
      { id: 'hw-pull128', kind: 'pull', name: 'Bar pull 128 mm, matte black', ccMM: 128, lengthMM: 168, holeDiaMM: 5, finish: '#2b2b2b' },
      { id: 'hw-pull96', kind: 'pull', name: 'Bar pull 96 mm, brass', ccMM: 96, lengthMM: 136, holeDiaMM: 5, finish: '#b08d4f' },
      { id: 'hw-knob', kind: 'pull', name: 'Round knob 32 mm', ccMM: 0, lengthMM: 32, holeDiaMM: 5, finish: '#b08d4f' },
      { id: 'hw-pin5', kind: 'shelfpin', name: '5 mm shelf pin, System 32', pinDiaMM: 5, pinDepthMM: 10, pinSetbackMM: 37, pitchMM: 32 },
      { id: 'hw-leg', ...clone(AXILO78_MOZAIK) },
      ...defaultJoints(),
    ],
    countertops: [
      { id: 'top-quartz', name: '3 cm quartz', mat: 'm-quartz', thick: 1.1875, frontOverhang: 1.5, endOverhang: 1, backsplash: 4 },
      { id: 'top-lam', name: 'Post-form laminate', mat: 'm-lam', thick: 1.5, frontOverhang: 1, endOverhang: 0.75, backsplash: 0 },
      { id: 'top-butcher', name: 'Maple butcher block', mat: 'm-butcher', thick: 1.5, frontOverhang: 1.25, endOverhang: 1, backsplash: 0 },
    ],
    moldings: [
      { id: 'mo-crown', name: '3 1/2" crown', profile: 'crown', h: 3.5, d: 2.25, fill: false, mat: 'm-mdf' },
      { id: 'mo-cove', name: '2" cove', profile: 'cove', h: 2, d: 1.25, fill: false, mat: 'm-mdf' },
      { id: 'mo-fill', name: 'Flat batten to ceiling', profile: 'flat', h: 6, d: 0.75, fill: true, mat: 'm-mdf' },
      { id: 'mo-light', name: 'Light rail 1 1/2"', profile: 'flat', h: 1.5, d: 0.75, fill: false, mat: 'm-mdf', bottom: true },
    ],
    library: [
      lib('b-1d1dr', 'Base 1 Door 1 Drawer', 'Base', 18, 34.5, 24, 0, FACE_PRESETS[2].rows, { shelfCount: 1 }),
      lib('b-2d1dr', 'Base 2 Door 1 Drawer', 'Base', 30, 34.5, 24, 0, FACE_PRESETS[3].rows, { shelfCount: 1 }),
      lib('b-3dr', 'Base 3 Drawer', 'Base', 18, 34.5, 24, 0, FACE_PRESETS[5].rows, { shelfCount: 0 }),
      lib('b-sink', 'Sink Base', 'Base', 36, 34.5, 24, 0, FACE_PRESETS[7].rows, { shelfCount: 0 }),
      lib('w-1d', 'Wall 1 Door', 'Wall', 18, 36, 12, 54, FACE_PRESETS[0].rows, { shelfCount: 2 }),
      lib('w-2d', 'Wall 2 Door', 'Wall', 30, 36, 12, 54, FACE_PRESETS[1].rows, { shelfCount: 2 }),
      lib('w-hood', 'Wall Hood Cabinet', 'Wall', 30, 18, 24, 66, FACE_PRESETS[1].rows, { shelfCount: 0 }),
      lib('t-pantry', 'Tall Pantry', 'Tall', 24, 90, 24, 0, FACE_PRESETS[9].rows, { shelfCount: 4 }),
      ...cornerLibItems(),
    ],
    rooms: [
      newRoom('r1', 'Kitchen', [
        { id: 'w1', x1: 0, y1: 96, x2: 0, y2: 0, thick: 4.5, height: 96 },
        { id: 'w2', x1: 0, y1: 0, x2: 150, y2: 0, thick: 4.5, height: 96 },
        { id: 'w3', x1: 150, y1: 0, x2: 150, y2: 120, thick: 4.5, height: 96 },
      ]),
      newRoom('r2', 'Laundry', [
        { id: 'w4', x1: 0, y1: 72, x2: 0, y2: 0, thick: 4.5, height: 96 },
        { id: 'w5', x1: 0, y1: 0, x2: 96, y2: 0, thick: 4.5, height: 96 },
      ], { doorT: 'door-sage', countertop: 'top-butcher' }),
    ],
    roomId: 'r1',
    designer: null,
  };
  // The sample shows its tops already built.
  S.rooms.forEach(r => { r.autoTops = true; });
  ensureEdgeLibs(S); ensureJoinery(S); ensureFaceFrames(S); if (typeof ensureInteriorLib === 'function') ensureInteriorLib(S); if (typeof ensureMozLib === 'function') ensureMozLib(S); attachRoom(S);
  S.shapeLib = defaultShapeLib(S); S.formulas = {}; S.job.vars = [];
  const put = (libId, wall, off, o = {}) => S.cabinets.push(Object.assign(newCab(S, S.library.find(l => l.id === libId), wall, 1, off), o));
  // Runs start a filler's width off the wall (see LAYOUT_DEFAULTS); open ends get panels automatically.
  put('b-3dr', 'w2', 3.75);
  put('b-1d1dr', 'w2', 21.75, { w: 21 });
  put('b-sink', 'w2', 42.75);
  put('b-2d1dr', 'w2', 78.75);
  put('b-2d1dr', 'w2', 108.75, { w: 36 });
  put('w-1d', 'w2', 3.75, { molding: 'mo-crown' });
  put('w-1d', 'w2', 21.75, { w: 21, params: { hingeSide: 'R' }, molding: 'mo-crown' });
  put('w-2d', 'w2', 78.75, { molding: 'mo-crown' });
  put('w-2d', 'w2', 108.75, { w: 36, molding: 'mo-crown' });
  put('b-2d1dr', 'w3', 26.25);
  put('b-3dr', 'w3', 56.25, { w: 24 });
  put('t-pantry', 'w3', 93.75, { molding: 'mo-crown' });
  S.roomId = 'r2';
  put('b-sink', 'w5', 3.75, { w: 30 });
  put('b-3dr', 'w5', 33.75, { w: 24 });
  put('w-2d', 'w5', 3.75, { w: 30, h: 30, elev: 60 });
  put('w-1d', 'w5', 33.75, { w: 24, h: 30, elev: 60 });
  S.roomId = 'r1';
  return S;
}
// New rooms start with no countertops; Auto build countertops on the Tops tab lays them. Rooms saved before that keep theirs.
function newRoom(id, name, walls, settings) {
  return { id, name, walls: walls || [], cabinets: [], shapes: [], ctRuns: {}, genTops: [], genMolds: [], lights: [], fixtures: [], autoTops: false, settings: settings || {}, params: {}, wallThick: 4.5, wallHeight: 96 };
}
function defaultConstruction(cat) { return { toeKick: cat !== 'Wall', top: cat === 'Base' ? 'stretchers' : 'full' }; }
function newCab(S, lib, wallId, side, off) {
  // Blank template and hardware fields follow the room's settings (see cabSet()).
  return {
    id: uid('c'), libId: lib.id, name: lib.name, cat: lib.cat, w: lib.w, h: lib.h, d: lib.d, elev: lib.elev,
    wall: wallId, side, off,
    cabMatT: lib.cabMatT || '', drawerMatT: lib.drawerMatT || '', doorT: lib.doorT || '',
    slide: lib.slide || '', hinge: lib.hinge || '', pull: '', panelStyle: lib.panelStyle || '', partT: lib.partT || '',
    panelL: lib.appliedL ? 'on' : '', panelR: lib.appliedR ? 'on' : '', molding: null,
    construction: clone(lib.construction || defaultConstruction(lib.cat)),
    rows: clone(lib.rows), libParams: { ...(lib.params || {}) }, params: {}, custom: clone(lib.custom || []), vars: clone(lib.vars || []), inserts: clone(lib.inserts || []),
    ...(lib.corner ? { corner: clone(lib.corner) } : {}), ...(lib.moz ? { moz: lib.moz } : {}),
    // Parts and operations changed on the product in the library come with every copy placed.
    ...['partEdits', 'addParts', 'shape', 'mozPrm'].reduce((o, k) => (lib[k] !== undefined && (o[k] = clone(lib[k])), o), {}),
  };
}

/* ---------- State, persistence, undo ---------- */
const KEY = 'cabinet-designer.v2';
const inHub = () => !!(window.Hub && window.Hub.id);
let S = null;
let undoStack = [], redoStack = [];
let saveTimer = null, saveNote = '';
// Walls, cabinets and countertop overrides live in each room; S.walls and friends point at the open room.
const ROOM_KEYS = ['walls', 'cabinets', 'shapes', 'ctRuns', 'genTops', 'genMolds', 'lights', 'fixtures'];
function attachRoom(st) {
  ROOM_KEYS.forEach(k => {
    if ((Object.getOwnPropertyDescriptor(st, k) || {}).get) return;
    const r = () => st.rooms.find(x => x.id === st.roomId) || st.rooms[0];
    Object.defineProperty(st, k, { get: () => r()[k], set: v => { r()[k] = v; }, enumerable: false, configurable: true });
  });
  return st;
}
const SETTING_FIELDS = ['cabMatT', 'drawerMatT', 'doorT', 'finish', 'pull', 'slide', 'hinge', 'panelStyle', 'panelDoor', 'partT', 'jointU', 'jointF', 'faceFrame'];
// Older saves had one room and stored the job default on every cabinet. Blank those so cabinets follow room settings.
// Blum TANDEM plus BLUMOTION 563H, frameless, from Blum's 563H/563 installation sheet (2016).
// Runner screws: top row 37 mm above the runner bottom (the opening bottom), the box sits 14 mm above it, so 23 mm above the box bottom.
const TANDEM_563H = {
  kind: 'slide', name: 'Blum TANDEM plus BLUMOTION 563H',
  notes: 'Full extension concealed runners, soft close, for 16 mm (5/8") drawer sides. Drawer width = opening - 10 mm; inside drawer width must be opening - 42 mm. Max drawer height = opening - 20 mm. Locking devices: T51.1901 R/L (side-to-side adjust), T51.1801 R/L (no side-to-side), T51.1901.PS (depth adjust). Screws 606N/606P or 662.1150.HG system screws. Drill rear hooks and locking device pilots with template T65.1600.01.',
  lengths: [12, 15, 18, 21],
  partNos: { 12: '563H3050B', 15: '563H3810B', 18: '563H4570B', 21: '563H5330B' },
  runnerMM: { 12: 319, 15: 395, 18: 471, 21: 548 },
  minDepthMM: { 12: 328, 15: 404, 18: 480, 21: 557 },
  // Rear screw holes and prices from Ayden's Mozaik guide (Blum TANDEM 563H, 1/2" slides = 3/4 material), 0.42.2.
  holeSets: { 12: [37, 261], 15: [37, 261], 18: [37, 69, 261], 21: [37, 69, 261] },
  prices: { 12: 24, 15: 25, 18: 26, 21: 27 },
  sideThickMM: 16, widthDeductMM: 10, bottomRecessMM: 13, bottomClearMM: 14, topClearMM: 6, rearClearMM: 23,
  cabHoles: [{ ref: 'set', i: 1, y: 0, z: 24, dia: 5, depth: 12.7 }, { ref: 'set', i: 2, y: 0, z: 24, dia: 5, depth: 12.7 }, { ref: 'set', i: 3, y: 0, z: 24, dia: 5, depth: 12.7 }],
  boxOps: [{ part: 'side', type: 'hbore', edge: 'rear', x: 0, y: 11, inset: 7, dia: 6, depth: 10 }],
  bomExtra: 'Blum TANDEM locking devices T51.1901R + T51.1901L (pair)',
};
function migrate(s) {
  if (!s || typeof s !== 'object') return null;
  if (s.v === 2 && Array.isArray(s.cabinets)) {
    const d = s.job.defaults, strip = o => SETTING_FIELDS.forEach(k => { if (o && o[k] === d[k]) o[k] = ''; });
    s.cabinets.forEach(strip); (s.library || []).forEach(strip); strip(s.designer);
    d.pull = d.pull || '';
    s.rooms = [{ ...newRoom('r1', 'Room 1', s.walls), cabinets: s.cabinets, ctRuns: s.ctRuns || {}, wallThick: s.job.wallThick || 4.5, wallHeight: s.job.wallHeight || 96 }];
    s.roomId = 'r1'; delete s.walls; delete s.cabinets; delete s.ctRuns; s.v = 3;
  }
  if (s.v !== 3 || !Array.isArray(s.rooms) || !s.rooms.length) return null;
  // Applied panels were yes or no; now each end is automatic, always or never.
  s.rooms.forEach(r => r.cabinets.forEach(c => {
    ['L', 'R'].forEach(e => { if (!('panel' + e in c)) c['panel' + e] = c['applied' + e] ? 'on' : ''; delete c['applied' + e]; });
  }));
  // Feet and toe skin came later: older jobs pick up the shop defaults.
  (s.hardware || []).forEach(h => { if (h.id === 'hw-leg' && !('feet' in h)) { h.feet = true; delete h.perCabinet; } });
  // The 563H runner had placeholder sizes until 0.32.0; jobs pick up the real ones from Blum's sheet.
  (s.hardware || []).forEach(h => { if (h.id === 'hw-563h' && !h.holeSets) Object.assign(h, clone(TANDEM_563H)); });
  // 0.42.2: the shop's Mozaik hinge, 563H holes and Axilo 78 leg replace the starting values, unless a job already changed them.
  if (!s.hwMozaik) {
    (s.hardware || []).forEach(h => {
      if (h.id === 'hw-cliptop' && !(h.cupExtra || []).length && h.max2 === 40) Object.assign(h, clone(CLIPTOP_MOZAIK));
      if (h.id === 'hw-563h' && h.holeSets && JSON.stringify(h.holeSets[18]) === '[37,261,453]') { h.holeSets = clone(TANDEM_563H.holeSets); h.prices = clone(TANDEM_563H.prices); h.cabHoles = clone(TANDEM_563H.cabHoles); }
      if (h.id === 'hw-leg' && /axilo 48|adjustable cabinet leg/i.test(h.name || '') && Math.abs((+h.inToe || 0) - LEG_DEF.inToe) < 0.01) Object.assign(h, clone(AXILO78_MOZAIK));
    });
    if (s.job && s.job.params && s.job.params.hingeInset === 3.5) s.job.params.hingeInset = 4;
    s.hwMozaik = 1;
  }
  if (s.job && s.job.params) Object.entries(SHOP_PARAMS).forEach(([k, v]) => { if (!(k in s.job.params)) s.job.params[k] = v; });
  // Formulas and job variables came later.
  s.formulas = s.formulas || {}; if (s.job) s.job.vars = s.job.vars || [];
  // Hand-placed tops and molding runs came with 0.13.1.
  s.rooms.forEach(r => { r.shapes = r.shapes || []; r.genTops = r.genTops || []; r.genMolds = r.genMolds || []; r.lights = r.lights || []; r.fixtures = r.fixtures || []; });
  if (!s.shapeLib) s.shapeLib = defaultShapeLib(s);
  // Molding profiles live on the molding (0.21.2); 3/8 HDF for two-piece door panels came with 0.21.0.
  (s.moldings || []).forEach(m => { if (m.profile === 'shape' && !(m.pts || []).length) { const l = s.shapeLib.find(x => x.id === m.shape); m.pts = l ? clone(l.pts) : moldStartPts(); } delete m.shape; });
  s.shapeLib = s.shapeLib.filter(l => l.id !== 'sh-crown');
  if (s.materials && !s.materials.some(m => m.id === 'm-hdf38')) s.materials.push({ id: 'm-hdf38', name: '3/8 HDF (door panels)', kind: 'sheet', thick: 0.375, sheetW: 49, sheetL: 97, grain: false, cost: 38, color: '#b89a74', texture: null, procedural: null, texScale: 24 });
  if (typeof ensureInteriorLib === 'function') ensureInteriorLib(s);
  if (typeof ensureMozLib === 'function') ensureMozLib(s);
  return attachRoom(ensureShapeNames(ensureMatSets(ensureMatGroups(ensureFinishes(ensureFaceFrames(ensureCornerLib(ensureJoinery(ensureEdgeLibs(s)))))))));
}
function loadLocal() { try { return migrate(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return null; } }
// The open job lives in its own file (see jobs.js); browser storage keeps a working copy too.
const loadState = () => bootJobs();
function save() {
  if (typeof keepAllOffCeiling === 'function') keepAllOffCeiling();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* the job file is the real copy */ }
  }, 400);
  saveJobSoon();
}
function snapshot() { undoStack.push(JSON.stringify(S)); if (undoStack.length > 80) undoStack.shift(); redoStack = []; }
function mutate(fn, defer) {
  ui.intSel = []; // picked interior lines point at places that may move
  snapshot(); fn(); attachRoom(S); if (typeof recalcFormulas === 'function') recalcFormulas(); save();
  if (defer) setTimeout(() => { const id = document.activeElement && document.activeElement.id; render(); if (id) { const el = document.getElementById(id); if (el) el.focus(); } }, 0);
  else render();
}
function undoRedo(dir) {
  const from = dir < 0 ? undoStack : redoStack, to = dir < 0 ? redoStack : undoStack;
  if (!from.length) return;
  ui.intSel = [];
  const keepRoom = S.roomId;
  to.push(JSON.stringify(S)); S = attachRoom(JSON.parse(from.pop()));
  if (S.rooms.some(r => r.id === keepRoom)) S.roomId = keepRoom;
  fixSel(); save(); render();
}

/* ---------- Lookups ---------- */
// '_designer' is the cabinet open in the Designer, so the cabinet editor's face and interior tools work there too.
const cab = id => id === '_designer' ? desCabLive() : S.cabinets.find(c => c.id === id);
const wall = id => S.walls.find(w => w.id === id);
// SKINS: look-only stand-ins made by the Textures tab (textures.js), so drawings can find them by id too.
const SKINS = {};
const mat = id => S.materials.find(m => m.id === id) || (id && SKINS[id]) || undefined;
// Product libraries: the job's own, plus backup sets (like American Cabinets) to swap to when a job wants them.
// The set not in use waits in S.libSets, so its edits are kept, and cabinets placed from it still find their product.
const PRODUCT_LIBS = [{ id: 'main', name: 'My library' }, { id: 'american', name: 'American Cabinets', items: () => typeof AMERICAN_LIB !== 'undefined' ? AMERICAN_LIB : [] }];
const libItem = id => S.library.find(l => l.id === id) || Object.values(S.libSets || {}).reduce((a, L) => a || (L || []).find(l => l.id === id), null);
function swapLibrary(id) {
  const cur = S.libSet || 'main', def = PRODUCT_LIBS.find(x => x.id === id); if (!def || id === cur) return;
  ui.placing = null; ui.libPeek = null;
  mutate(() => {
    S.libSets = S.libSets || {}; S.libSets[cur] = S.library;
    S.library = S.libSets[id] || clone(def.items ? def.items() : []);
    delete S.libSets[id]; S.libSet = id;
    ui.libSel = S.library[0] && S.library[0].id;
  });
  flash('Products now come from ' + def.name + '. Cabinets already drawn stay as they are.');
}
const doorStyle = id => withFinish({ ...DOOR_DEFAULTS, ...(S.doorStyles.find(d => d.id === id) || S.doorStyles[0]) }, null);
const doorTpl = id => S.doorTemplates.find(d => d.id === id) || S.doorTemplates[0];
const cabMatT = id => S.matTemplates.cabinet.find(t => t.id === id) || S.matTemplates.cabinet[0];
const drawerMatT = id => S.matTemplates.drawer.find(t => t.id === id) || S.matTemplates.drawer[0];
// Material templates (0.48.2): one pick for the job that sets its door template, cabinet materials and drawer materials together, like Mozaik's.
const MAT_SET_KEYS = ['doorT', 'finish', 'cabMatT', 'drawerMatT'];
// The finish a door template's base door was made in before finishes existed.
function finFromTpl(s, id) {
  const t = (s.doorTemplates || []).find(x => x.id === id) || (s.doorTemplates || [])[0], d = t && (s.doorStyles || []).find(x => x.id === t.door);
  const f = d && (s.finishes || []).find(x => x.front === d.mat); return f ? f.id : ((s.job || {}).defaults || {}).finish || '';
}
function ensureMatSets(s) {
  const mt = s.matTemplates; if (!mt) return s;
  if (Array.isArray(mt.job)) { mt.job.forEach(t => { if (!t.finish) t.finish = finFromTpl(s, t.doorT); }); return s; }
  const has = (list, id) => (list || []).some(x => x.id === id), ok = t => has(s.doorTemplates, t.doorT) && has(mt.cabinet, t.cabMatT) && has(mt.drawer, t.drawerMatT);
  const list = [
    { id: 'ms-paint', name: 'Paint grade shaker, maple cabinet', doorT: 'door-shaker', cabMatT: 'mt-maple', drawerMatT: 'dt-bb58' },
    { id: 'ms-sage', name: 'Sage shaker, maple cabinet', doorT: 'door-sage', cabMatT: 'mt-maple', drawerMatT: 'dt-bb58' },
    { id: 'ms-oak', name: 'Rift oak slab, white oak cabinet', doorT: 'door-oak', cabMatT: 'mt-oak', drawerMatT: 'dt-bb12' },
  ].filter(ok);
  list.forEach(t => { t.finish = finFromTpl(s, t.doorT); });
  // The job's own picks become a template too, so nothing is lost when another one is picked.
  const d = (s.job && s.job.defaults) || {}, cur = { doorT: d.doorT, finish: d.finish, cabMatT: d.cabMatT, drawerMatT: d.drawerMatT };
  if (ok(cur) && !list.some(t => MAT_SET_KEYS.every(k => t[k] === cur[k]))) {
    const nm = (l, id) => (l.find(x => x.id === id) || {}).name || '';
    list.unshift({ id: 'ms-job', name: `${nm(s.doorTemplates, cur.doorT)}, ${nm(mt.cabinet, cur.cabMatT)}`, ...cur });
  }
  list.forEach(t => { if (!t.finish) t.finish = finFromTpl(s, t.doorT); });
  mt.job = list;
  return s;
}
// Older jobs: one finish per material their door styles used, and the job, rooms and cabinets pick the finish their doors were in,
// so nothing they cut changes. The 0.48.3 finish pick held a material id; it becomes that material's finish.
// Material groups (Libraries › Materials folds by them, like Mozaik). A job made before groups gets each material
// sorted once by its kind and name; Ayden can change any group after.
function matGroupGuess(m) {
  const n = String(m.name || '').toLowerCase();
  if (m.kind === 'top') return 'Countertops';
  if (m.kind === 'solid') return 'Solid wood';
  if (/melamine|\btfl\b|\blpl\b|thermofused/.test(n)) return 'Melamine';
  if (/baltic/.test(n)) return 'Baltic birch';
  if (/\bhdf\b|hardboard/.test(n)) return 'HDF';
  if (/\bmdf\b/.test(n)) return 'MDF';
  if (/\bply|plywood/.test(n)) return 'Plywood';
  return 'Other';
}
function ensureMatGroups(s) {
  if (!s || !Array.isArray(s.materials) || s.matGrouped) return s;
  if (!s.materials.some(m => m.group)) s.materials.forEach(m => { m.group = matGroupGuess(m); });
  s.matGrouped = 1; return s;
}
function ensureFinishes(s) {
  if (!s || !Array.isArray(s.materials) || !Array.isArray(s.doorStyles)) return s;
  if (Array.isArray(s.finishes)) return s;
  const mats = s.materials, byId = id => mats.find(m => m.id === id), list = [];
  const nameOf = m => (m.name || 'Finish').replace(/^\s*[\d\/.]+\s*(mm|cm|"|in)?\s+/i, '').replace(/\s+(ply|plywood)\b/i, '').replace(/\s*\((doors?|backs?|door panels)\)/i, '').trim() || m.name;
  const add = (front, panel, name) => {
    let f = list.find(x => x.front === front); if (f) return f;
    const m = byId(front); if (!m) return null;
    f = { id: 'fin-' + front.replace(/^m-/, ''), name: name || nameOf(m), front, panel: panel && byId(panel) ? panel : front, sheet: front, solid: front };
    list.push(f); return f;
  };
  s.doorStyles.forEach(d => add(d.mat, d.type === 'fivepiece' || d.type === 'twopiece' ? d.panelMat : ''));
  if (!list.length && mats[0]) add(mats[0].id);
  // An Alder finish to start from, using the shop's alder materials when the library has them.
  if (!list.some(f => /alder/i.test(f.name))) {
    const al = mats.filter(m => /alder/i.test(m.name || '') && (m.kind || 'sheet') === 'sheet');
    if (!al.length) {
      al.push({ id: 'm-alder', name: '3/4 Alder Ply', kind: 'sheet', thick: 0.75, sheetW: 49, sheetL: 97, grain: true, cost: 150, color: '#c98f63', texture: null, procedural: 'oak', texScale: 26 },
        { id: 'm-alder14', name: '1/4 Alder Ply (door panels)', kind: 'sheet', thick: 0.25, sheetW: 49, sheetL: 97, grain: true, cost: 70, color: '#cb9468', texture: null, procedural: 'oak', texScale: 26 });
      mats.push(...al);
    }
    const thick = al.slice().sort((a, b) => (b.thick || 0) - (a.thick || 0)), thin = al.find(m => (m.thick || 1) < 0.4);
    list.push({ id: 'fin-alder', name: 'Alder', front: thick[0].id, panel: (thin || thick[0]).id, sheet: thick[0].id, solid: thick[0].id });
  }
  s.finishes = list;
  // Picks: the finish each door template's base door was in, unless a 0.48.3 finish material was set.
  const tplFin = id => { const t = (s.doorTemplates || []).find(x => x.id === id) || (s.doorTemplates || [])[0]; const d = t && s.doorStyles.find(x => x.id === t.door); return d ? (add(d.mat) || {}).id || '' : ''; };
  const fromMat = id => id && byId(id) ? (add(id) || {}).id || '' : id && list.some(f => f.id === id) ? id : '';
  const d = s.job && s.job.defaults; if (!d) return s;
  const jobFin = fromMat(d.finish) || tplFin(d.doorT) || list[0].id; d.finish = jobFin;
  (s.rooms || []).forEach(r => {
    r.settings = r.settings || {};
    const own = fromMat(r.settings.finish) || (r.settings.doorT ? tplFin(r.settings.doorT) : '');
    if (own && own !== jobFin) r.settings.finish = own; else delete r.settings.finish;
    const roomFin = r.settings.finish || jobFin;
    (r.cabinets || []).forEach(c => { const own2 = fromMat(c.finish) || (c.doorT ? tplFin(c.doorT) : ''); if (own2 && own2 !== roomFin) c.finish = own2; else delete c.finish; });
  });
  return s;
}
// Door names say the shape only, since the finish gives the material (0.48.4): "Slab, white oak" is "Slab".
const MAT_WORDS = ['paint grade', 'stain grade', 'painted', 'paint', 'prefinished', 'plywood', 'ply', 'veneer', 'melamine', 'thermofoil', 'laminate',
  'rift sawn', 'rift', 'quartersawn', 'quarter sawn', 'flat sawn', 'plain sawn', 'white oak', 'red oak', 'oak', 'alder', 'knotty', 'maple', 'cherry', 'walnut', 'hickory',
  'birch', 'poplar', 'ash', 'pine', 'mahogany', 'sapele', 'beech', 'teak', 'cedar', 'mdf', 'hdf', 'sage'];
function shapeName(n, extra) {
  const words = [...(extra || []), ...MAT_WORDS].sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  let t = String(n || '').replace(new RegExp(`\\b(${words.join('|')})\\b`, 'gi'), ' ');
  t = t.replace(/\(\s*[-,\s]*\)/g, '').replace(/\(\s*([^()]*?)[-\s,]*\)/g, (m, a) => a.trim() ? `(${a.trim()})` : '').replace(/\s+([,)])/g, '$1').replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ').replace(/^[\s,\-–]+|[\s,\-–]+$/g, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : String(n || '');
}
// Renames door styles and door templates once; styles or templates that end up the same are merged and every pick moves to the one kept.
function ensureShapeNames(s) {
  if (!s || s.shapeNames || !Array.isArray(s.doorStyles)) return s;
  const extra = (s.finishes || []).flatMap(f => String(f.name || '').toLowerCase().split(/[\s,()]+/)).filter(w => w.length > 2 && !/^(grade|the|and|finish|new)$/.test(w));
  const remap = {}, strip = (o, drop) => JSON.stringify(Object.keys(o).filter(k => !drop.includes(k) && !/^v[A-Z]/.test(k)).sort().map(k => [k, o[k]]));
  const ROLE = [['falseFront', 'false fronts'], ['drawer', 'drawer fronts'], ['door', 'doors'], ['wallDoor', 'wall doors']];
  const merge = (list, drop, tpl) => {
    const kept = [];
    list.forEach(o => {
      o.name = shapeName(o.name, extra);
      // The same shape (and price) is one style, whatever it was called; templates must also match by name.
      const twin = kept.find(k => strip(k, drop) === strip(o, drop) && (!tpl || k.name.toLowerCase() === o.name.toLowerCase()));
      if (twin) { remap[o.id] = twin.id; return; }
      const clash = kept.find(k => k.name.toLowerCase() === o.name.toLowerCase());
      if (clash && tpl) { const r = ROLE.find(([k]) => o[k] && o[k] !== clash[k]), ds = r && s.doorStyles.find(d => d.id === o[r[0]]); if (ds) o.name += `, ${ds.name.toLowerCase()} ${r[1]}`; }
      let n = 2; const base = o.name; while (kept.some(k => k.name.toLowerCase() === o.name.toLowerCase())) o.name = `${base} ${n++}`;
      kept.push(o);
    });
    return kept;
  };
  s.doorStyles = merge(s.doorStyles, ['id', 'name', 'mat', 'panelMat', 'group']);
  const walk = (o, skip) => { if (!o || typeof o !== 'object' || o === skip) return; Object.keys(o).forEach(k => { const v = o[k]; if (typeof v === 'string' && remap[v]) o[k] = remap[v]; else walk(v, skip); }); };
  (s.doorTemplates || []).forEach(t => walk(t));
  if (Array.isArray(s.doorTemplates)) s.doorTemplates = merge(s.doorTemplates, ['id', 'name', 'group'], true);
  Object.keys(s).forEach(k => { if (k !== 'doorStyles') walk(s[k]); });
  s.shapeNames = 1;
  return s;
}
const matSets = () => { if (!Array.isArray(S.matTemplates.job)) ensureMatSets(S); return S.matTemplates.job; };
const panelStyle = id => S.panels.find(p => p.id === id) || S.panels[0];
const hw = id => S.hardware.find(h => h.id === id);
const hwOf = kind => S.hardware.filter(h => h.kind === kind);
const hwPick = (id, kind) => { const h = hw(id); return h && h.kind === kind ? h : hwOf(kind)[0]; };
const countertop = id => S.countertops.find(t => t.id === id) || S.countertops[0];
const molding = id => S.moldings.find(m => m.id === id);
const partTpl = id => S.partTemplates.find(t => t.id === id) || S.partTemplates[0];
const edgeband = id => S.edgebands.find(b => b.id === id);
// Base and tall cabinets sit on feet with a separate toe skin, or have a toe kick notched into the sides.
const onFeet = (c, p) => hasToe(c) && (p || effParams(c)).baseType !== 'notch';
const feetCount = (c, p) => { const n = (p || effParams(c)).feetCount | 0; return n > 0 ? n : c.w > 36 ? 6 : 4; };
const hasToe = c => c.construction ? !!c.construction.toeKick : (c.cat === 'Base' || c.cat === 'Tall');
const effParams = c => Object.assign({}, SHOP_PARAMS, S.job.params, curRoom().params || {}, c.libParams || c.params0 || {}, c.params || {});
/* ---------- Rooms and settings ---------- */
const curRoom = () => S.rooms.find(r => r.id === S.roomId) || S.rooms[0];
const roomById = id => S.rooms.find(r => r.id === id);
// Job setting, overridden by the room, overridden by the cabinet. A blank value means "follow the level above".
const roomSet = (k, r = curRoom()) => ((r && r.settings) || {})[k] || S.job.defaults[k] || '';
const cabSet = (c, k) => (c && c[k]) || roomSet(k);
/* ---------- Finishes (0.48.4): the material is picked by finish name, never by door style ----------
   Each finish (Alder, Paint grade…) says what every finished part is cut from: fronts (doors and drawer fronts), door panels,
   finished sheet parts (finished ends, finished interiors, applied end panels, fillers) and solid parts (face frames).
   The job picks one, a room or a cabinet can pick another. Unfinished parts use the cabinet material template. */
const FINISH_ROLES = [['front', 'Doors and drawer fronts'], ['panel', 'Door panels'], ['sheet', 'Finished panels and ends'], ['solid', 'Face frames']];
const finishList = () => { if (!Array.isArray(S.finishes)) ensureFinishes(S); return S.finishes; };
function finishOf(c) { const l = finishList(), id = cabSet(c, 'finish'); return l.find(f => f.id === id) || l[0] || null; }
const finishRole = (c, role) => { const f = finishOf(c); return f ? f[role] || f.front || f.sheet : ''; };
// A door style is shape only: its material comes from the finish of the cabinet (or the open room when there is none).
function withFinish(ds, c) {
  const f = S && Array.isArray(S.finishes) ? finishOf(c) : null; if (!f) return ds;
  const front = f.front || f.sheet, panel = ds.panelType === 'raised' ? front : f.panel || front;
  return { ...ds, mat: front, panelMat: panel };
}
// Runs fn with another room open, so S.walls and S.cabinets point at it.
function withRoom(r, fn) { const prev = S.roomId; S.roomId = r.id; try { return fn(); } finally { S.roomId = prev; } }
const allCabs = () => S.rooms.flatMap(r => r.cabinets);
const wallName = w => w ? 'Wall ' + (S.walls.indexOf(w) + 1) : 'No wall';
let LBL = {};
// Cabinet labels: job numbers by default (room 6 is #601, #602 ...), or type letters (B1, W1) if the job asks for them.
function labels() {
  const out = {}, nums = S.job.labelStyle !== 'type';
  if (nums) ensureNums();
  S.rooms.forEach(r => { const n = {}; r.cabinets.forEach(c => { n[c.cat] = (n[c.cat] || 0) + 1; out[c.id] = nums ? '#' + c.num : c.cat[0] + n[c.cat]; }); });
  return out;
}
// Each room owns a block of 100 numbers. A cabinet keeps its number once it has one, so numbers sent out stay put;
// new cabinets take the next free one. Copies of rooms or cabinets get fresh numbers.
const wallOrder = (r, c) => { const i = r.walls.findIndex(w => w.id === c.wall); return i < 0 ? 999 : i; };
function numOrder(r) { return r.cabinets.slice().sort((a, b) => wallOrder(r, a) - wallOrder(r, b) || (a.cat === 'Wall') - (b.cat === 'Wall') || a.off - b.off); }
function ensureNums() {
  const all = S.rooms.map(r => r.block), seen = new Set();
  S.rooms.forEach((r, i) => {
    if (!(r.block > 0) || seen.has(r.block)) {
      const had = r.block > 0; let b = 1; while (seen.has(b) || all.includes(b)) b++;
      r.block = all[i] = b; if (had) r.cabinets.forEach(c => { c.num = null; });
    }
    seen.add(r.block);
    const used = new Set(), base = r.block * 100;
    r.cabinets.forEach(c => { if (c.num > base && c.num < base + 100 && !used.has(c.num)) used.add(c.num); else c.num = null; });
    numOrder(r).forEach(c => { if (c.num) return; let n = base + 1; while (used.has(n)) n++; c.num = n; used.add(n); });
  });
}
// Numbers in wall order, left to right, bases before uppers.
function renumberRoom(r) { r.cabinets.forEach(c => { c.num = null; }); ensureNums(); }
