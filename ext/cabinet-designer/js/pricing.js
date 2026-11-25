// Pricing: price sheets kept for the whole shop (not inside a job), and a quote for the drawn job from the one it uses.
'use strict';
let PRICES = [];
// 0.58.27: one number formatter kept, not a new one per number (toLocaleString with options builds one each call). Same text.
const NF0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const NF2 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), NF1 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = v => '$' + NF2.format(Math.round(v * 100) / 100);
// Inserts, doors and fronts, and materials are priced in their own libraries; the sheet keeps labor adders only.
const PRICE_ADDERS = [['scribeWall', 'Each wall marked Scribe (fillers and panels scribed to it)'], ['perDrawer', 'Each drawer, extra (box and labor are in the box price below; slides are hardware)'], ['perShelf', 'Each adjustable shelf'], ['perLamBottom', 'Each laminated wall cabinet bottom, labor'], ['lamSq', 'Laminate for laminated bottoms, $ per sq ft (waste added)'], ['perFiller', 'Each filler, on top of its material (cutting to fit)'], ['perPull', 'Each pull or knob (drilling and putting on)'], ['perBracket', 'Each concealed floating shelf bracket'], ['perBlocking', 'In-wall blocking, each floating shelf']];
// Each panel, by height: applied end panels on top of their door style's price, loose panels on top of their material.
const PANEL_CATS = [['Base', 'Base height panel'], ['Wall', 'Wall height panel'], ['Tall', 'Tall panel']];
// Paint: square feet of painted surface, counting only the surfaces the sheet turns on.
const PAINT_PARTS = [['fronts', 'Doors and drawer fronts'], ['panels', 'Applied end panels'], ['fillers', 'Fillers and face frames'], ['toe', 'Toe skins'], ['interior', 'Finished interiors']];
const paintOf = ps => (ps.paint = { rate: 0, ebRate: EB_RATE, bothSides: true, fronts: true, panels: true, fillers: true, toe: true, interior: true, ...(ps.paint || {}) });
// 0.56.7 (Ayden 2026-11-18): a material is painted/stained or prefinished (Libraries › Materials › Finishing). Surfaces cut from a
// prefinished material (melamine, prefinished ply) are not painted: they count as edgebanding at the sheet's much lower
// Edgebanding rate. A material with no pick is guessed from its name, the same way every time.
const EB_RATE = 1;
const PREFIN_RX = /melamine|\btfl\b|\blpl\b|\bhpl\b|thermofused|thermofoil|laminate|formica|pre-?finished|\bpf\b|uv[- ]?coated/i;
const matFinGuess = m => !m || m.kind === 'top' ? 'paint' : PREFIN_RX.test(m.name || '') ? 'pre' : 'paint';
const matFin = m => m && (m.fin === 'pre' || m.fin === 'paint') ? m.fin : matFinGuess(m);
const prefin = id => { const m = mat(id); return !!m && matFin(m) === 'pre'; };
const sqft = v => NF1.format(Math.round(v * 10) / 10);
function paintCab(c, ps, b, fr) {
  const po = paintOf(ps), sq = { fronts: 0, panels: 0, fillers: 0, toe: 0, interior: 0 }, eb = { fronts: 0, panels: 0, fillers: 0, toe: 0, interior: 0 }, area = pt => pt.L * pt.W * pt.qty / 144;
  // Each surface goes to paint, or to edgebanding when its material is prefinished.
  const add = (k, v, matId) => { (prefin(matId) ? eb : sq)[k] += v; };
  // Bought fronts (Bywater melamine) come finished and edged: no paint, no edgebanding.
  fr.forEach(f => { if (f.type === 'open') return; const { ds } = frontStyle(c, f); if (!ds.bought) add('fronts', (f.x1 - f.x0) * (f.z1 - f.z0) / 144 * (po.bothSides ? 2 : 1), ds.mat); });
  // Bought panels are finished like bought doors: Bywater melamine ones come done, the rest get painted.
  (b.buyPanels || []).forEach(pt => { if (!(pt.ds && pt.ds.bought)) add('panels', area(pt), pt.mat); });
  b.parts.forEach(pt => {
    if (pt.cabId !== c.id) return;
    if (pt.kind === 'applied') add('panels', area(pt), pt.mat);
    else if (pt.kind === 'filler' || pt.kind === 'faceFrame') add('fillers', area(pt), pt.mat);
    else if (pt.kind === 'toekick') add('toe', area(pt), pt.mat);
    // A Finished product's box is finished like an applied panel.
    else if (c.finished && ['side', 'topbot'].includes(pt.kind)) add('panels', area(pt), pt.mat);
    // A finished interior paints the inside face of the box, and both faces of shelves and dividers.
    else if (c.finInt && ['side', 'topbot', 'back'].includes(pt.kind)) add('interior', area(pt), pt.mat);
    else if (c.finInt && ['shelf', 'divider'].includes(pt.kind)) add('interior', 2 * area(pt), pt.mat);
  });
  PAINT_PARTS.forEach(([k]) => { if (!po[k]) sq[k] = eb[k] = 0; });
  sq.total = PAINT_PARTS.reduce((a, [k]) => a + sq[k], 0);
  sq.eb = PAINT_PARTS.reduce((a, [k]) => a + eb[k], 0);
  return sq;
}
const CAT_FT = [['Base', 'Base cabinets'], ['Wall', 'Wall cabinets'], ['Tall', 'Tall and pantry']];
// 0.60.6 (Ayden 2026-11-20): installers also charge Specialty by the foot (hoods, slat walls, benches, floating shelves,
// mantels, anything classified Specialty). An installer with no Specialty price installs them as Base/Wall/Tall, as before.
const INST_FT = [...CAT_FT, ['Specialty', 'Specialty items']];
const SPEC_GROUPS = ['special', 'hood', 'shelf', 'mantel'];
const isSpecialty = c => { const l = c && c.libId && typeof libItem === 'function' && libItem(c.libId); return !!l && typeof libGroup === 'function' && SPEC_GROUPS.includes(libGroup(l)); };
const ftLen = v => (Math.round(v * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
const addSq = list => PAINT_PARTS.concat([['total'], ['eb']]).reduce((o, [k]) => (o[k] = list.reduce((a, x) => a + x[k], 0), o), {});
// Set values copied from Ayden's Mozaik pricing sheet (Detailed Pricing.mzkprice), turned from metric to feet:
// finishing $53.82/sq m = $5/sq ft, install $131.23/m = $40/ft (base, wall) and $328.08/m = $100/ft (tall).
const MZK = {
  groupMarkup: { doors: 15, materials: 10, hardware: 0 },
  install: { Base: 40, Wall: 40, Tall: 100 },
  paintRate: 5,
  extras: [{ name: 'Fuel and delivery', amount: 1.5, per: 'pct' }, { name: 'Marketing', amount: 0.5, per: 'pct' }, { name: 'Designer commission', amount: 1, per: 'pct' }],
  payments: [{ name: 'Due at design confirmation', pct: 60 }, { name: 'Due at delivery', pct: 30 }, { name: 'Due at job completion', pct: 10 }],
};
const GROUP_MARKUPS = [['doors', 'Doors and fronts'], ['materials', 'Materials'], ['hardware', 'Hardware']];
// Sheets made before the Mozaik values get the ones they are missing, once. Prices already set are kept.
function ensureMzk(ps) {
  if (ps.mzk) return false;
  if (!ps.groupMarkup) ps.groupMarkup = { ...MZK.groupMarkup };
  if (!ps.install) ps.install = { ...MZK.install };
  if (!ps.payments) ps.payments = MZK.payments.map(x => ({ ...x }));
  const po = paintOf(ps); if (!+po.rate) po.rate = MZK.paintRate;
  // Install is now by the foot and delivery is a percent, so an empty "Delivery and install" charge goes.
  ps.extras = (ps.extras || []).filter(x => !(x.name === 'Delivery and install' && !+x.amount));
  MZK.extras.forEach(x => { if (!ps.extras.some(y => String(y.name).toLowerCase() === x.name.toLowerCase())) ps.extras.push({ ...x }); });
  ps.mzk = 1; return true;
}
// Dollars of edge banding on one part: each banded edge's length at its roll's price per foot.
function bandCost(pt) {
  return EDGE_KEYS.reduce((a, k) => { const b = pt.band && pt.band[k] && edgeband(pt.band[k]); if (!b) return a;
    const per = (+(b.rollCost ?? EB_ROLL.cost) || 0) / (+(b.rollFt ?? EB_ROLL.ft) || 1); return a + (k[0] === 'L' ? pt.L : pt.W) / 12 * per; }, 0);
}
const gMark = (ps, g) => 1 + (+((ps.groupMarkup || {})[g]) || 0) / 100;
// A starting sheet: rough shop numbers to edit, with doors, hardware and materials priced from this job's libraries.
function defaultPriceSheet(name = 'Standard pricing') {
  // Hardware with its own price (Ayden's Mozaik prices) starts there; the rest get rough shop numbers.
  const own = n => { for (const h of (S ? S.hardware : [])) {
    if (h.prices && n.startsWith(h.name + ' ')) { const L = parseFloat(n.slice(h.name.length + 1)); if (h.prices[L] != null) return +h.prices[L]; }
    if (h.cost != null && n === h.name) return +h.cost;
    if (h.plateCost != null && n === h.name + ' mounting plate') return +h.plateCost;
  } return null; };
  const hwPrice = n => own(n) ?? (/pocket door system/i.test(n) ? 300 : /slide/i.test(n) ? 32 : /plate/i.test(n) ? 1.5 : /hinge/i.test(n) ? 5.5 : /pin/i.test(n) ? 0.15 : /pull|knob/i.test(n) ? 7 : /\bleg\b/i.test(n) ? 2 : /clip/i.test(n) ? 0.5 : 2);
  const hardware = {};
  if (S) allCabs().forEach(c => inRoomOf(c, () => Object.keys(buildParts(c).bom).forEach(k => { if (!(k in hardware)) hardware[k] = hwPrice(k); })));
  return {
    id: uid('ps'), name, markup: 0, tax: 0, mzk: 1,
    // Set values from Ayden's Mozaik "Detailed Pricing" sheet.
    groupMarkup: { ...MZK.groupMarkup }, payments: MZK.payments.map(x => ({ ...x })),
    cab: { Base: { base: 150, perFt: 120 }, Wall: { base: 100, perFt: 90 }, Tall: { base: 250, perFt: 220 } },
    products: {},
    adders: { scribeWall: 50, perDrawer: 0, perShelf: 12, perFiller: 35, perPull: 3 },
    panelAdd: { Base: 25, Wall: 25, Tall: 25 },
    doors: { on: true },
    materials: { on: false, waste: 15 },
    hardware: { on: true, items: hardware },
    tops: Object.fromEntries((S ? S.countertops : []).map(t => [t.id, 55])), molds: Object.fromEntries((S ? S.moldings : []).map(m => [m.id, 9])),
    extras: MZK.extras.map(x => ({ ...x })),
    paint: { rate: MZK.paintRate, bothSides: true, fronts: true, panels: true, fillers: true, toe: true, interior: true },
  };
}
const priceSheet = () => PRICES.find(p => p.id === S.job.priceSheet) || PRICES[0];

/* ---------- Installers ---------- */
// 0.58.4 (Ayden 2026-11-18): installation is no longer on the price sheet. The shop keeps a list of installers, each with
// their own price per foot by cabinet type, and each job picks one (or No installer) on its Quote. The install prices the
// sheets had became the installer "Richard", the default, so every saved job prices exactly as before.
// A job with no pick uses the installer its sheet's install prices moved to (ps.instBy), then the default.
let INSTALLERS = [];
const blankInstaller = (name, rates = { Base: 0, Wall: 0, Tall: 0 }) => ({ id: uid('inst'), name, rates: { ...rates } });
// 0.58.18 (Ayden 2026-11-19, Saw Struck's sheet): an installer's price list, priced by what the job has. Each line is
// a price for one thing the program can count; a minimum per job tops the installation up to it. Charges it can't count
// (scribing, cuts of molding, caulking, per-quote work) stay in the installer's notes.
const INST_COUNTS = [
  ['base', 'Base cabinets', 'each'], ['wall', 'Wall cabinets up to 42 x 42', 'each'], ['wallBig', 'Wall cabinets over 42 x 42', 'each'],
  ['tall', 'Tall cabinets', 'each'], ['hood', 'Hoods', 'each'], ['filler', 'Fillers', 'each'], ['panel', 'Base and wall end panels', 'each'],
  ['panelTall', 'Tall end panels', 'each'], ['door', 'Doors (with hinges)', 'each'], ['drawer', 'Drawer fronts', 'each'],
  ['pull', 'Pulls and knobs', 'each'], ['shelf', 'Floating shelves', 'per 4 sq ft'], ['top8', 'Countertops', 'per 8 sq ft'], ['job', 'Per job', 'flat'],
  // 0.59.36: island panels (island ends, island backs) by the 48" piece, like Saw Struck's sheet.
  ['island', 'Island panels', 'per 48"'],
  // 0.58.20 (Ayden 2026-11-19: "guesstimate the caulking and everything else"): rough counts from the drawing, marked est. on the quote.
  ['moldCut', 'Molding cuts (estimate)', 'per cut'], ['caulk', 'Caulking runs (estimate)', 'per cut'], ['scribe', 'Filler and panel scribing (estimate)', 'per edge'],
  ['scribeTall', 'Tall end panel scribing (estimate)', 'per panel'], ['topScribe', 'Countertop scribing (estimate)', 'per 48" of edge'],
  ['islandScribe', 'Island panel scribing (estimate)', 'per 48"'],
];
// How the estimates are counted (shown on Edit prices): each is a guess from what is drawn, to be checked on the job.
const INST_EST = { moldCut: 'Each molding run: 2 cuts for the front piece and 2 for each return.', caulk: 'One per molding run (along the ceiling) and one per countertop run (along the wall).',
  scribe: 'One edge per filler and per base or wall end panel.', scribeTall: 'One per tall end panel.', topScribe: 'Each countertop run: its length along the wall in 48" pieces.',
  islandScribe: 'Each island panel, in 48" pieces (same as the island panel count).' };
const instCount = k => INST_COUNTS.find(x => x[0] === k);
// What one room has, counted for the installer's price list. cabs are the room's priced cabinets, own its own-price products.
// 0.59.36 (Ayden 2026-11-20, Saw Struck's sheet checked line by line): shelves (floating, Sheppard bracket, mantels) and
// Mozaik filler products are no longer counted as cabinet boxes; panels that are products (Island End Panel, applied
// doors) or drawn as shapes (island back) are counted; shelves go by 4 sq ft pieces; false fronts are drawer fronts.
function instCounts(cabs, own) {
  const n = Object.fromEntries(INST_COUNTS.map(([k]) => [k, 0]));
  const grp = c => { const l = c.libId && typeof libItem === 'function' && libItem(c.libId); return l && typeof libGroup === 'function' ? libGroup(l) : ''; };
  const pieces = (len, per) => Math.max(1, Math.ceil(len / per - 1e-9));
  const shelfN = c => pieces((c.w * c.d) / 144, 4);
  const isIsland = (name, wl) => /island/i.test(name || '') || !!(wl && (wl.island || wl.hidden));
  const wallOf = id => (id && typeof wall === 'function' ? wall(id) : null);
  const panelOne = (name, wl, h, len) => { if (isIsland(name, wl)) n.island += pieces(len, 48); else n[h > 48 ? 'panelTall' : 'panel']++; };
  cabs.filter(k => !k.c.noCount).forEach(({ c }) => {
    const g = grp(c);
    if (g === 'hood' || /\bhood/i.test(c.name || '')) n.hood++;
    else if (g === 'shelf' || g === 'mantel') n.shelf += shelfN(c);
    else if (g === 'filler') n.filler++;
    else if (c.cat === 'Tall') n.tall++; else if (c.cat === 'Wall') n[c.w > 42 || c.h > 42 ? 'wallBig' : 'wall']++; else n.base++;
  });
  cabs.forEach(({ c }) => {
    n.filler += (typeof fillersOf === 'function' ? fillersOf(c).length : 0);
    const b = buildParts(c); panelPartsOf(b, c).forEach(pt => { n[c.cat === 'Tall' ? 'panelTall' : 'panel'] += pt.qty || 1; });
    computeFronts(c).forEach(f => { if (f.type === 'door') n.door++; else if (f.type === 'drawer' || f.type === 'false') n.drawer++; if (pullPlacement(c, f)) n.pull++; });
  });
  own.forEach(({ c }) => {
    if (c.made === 'panel' && c.autoOf) return;
    if (c.made === 'panel') { panelOne(c.name, wallOf(c.wall), c.h, c.d); return; }
    const l = c.libId && typeof libItem === 'function' && libItem(c.libId);
    if (/floating|shelf|mantel/i.test(c.name || '') || (l && ['shelf', 'mantel'].includes(libGroup(l)))) n.shelf += shelfN(c);
  });
  // Panels drawn as shapes (an island back, Mozaik end panels): by their size, island ones by the 48" piece.
  (S.shapes || []).forEach(s => { if (s.plane && s.plane !== 'upright') return; const b = shapeBox(s.pts || []); panelOne(s.name, wallOf(s.wall), b.h, b.w); });
  const tops = countertopRuns().filter(t => t.on), molds = moldingRuns();
  n.top8 = tops.reduce((a, t) => a + Math.ceil((t.area ?? t.len * t.depth) / 144 / 8 - 1e-9), 0);
  n.moldCut = molds.reduce((a, m) => a + 2 + 2 * ((m.retS ? 1 : 0) + (m.retE ? 1 : 0)), 0);
  n.caulk = molds.length + tops.length;
  n.scribe = n.filler + n.panel; n.scribeTall = n.panelTall; n.islandScribe = n.island;
  n.topScribe = tops.reduce((a, t) => a + Math.ceil(t.len / 48 - 1e-9), 0);
  return n;
}
// Installers read from a pricing guide by Ask Claude: only the known fields are kept, as numbers.
function instAddItems(list) {
  const nums = o => Object.fromEntries(INST_FT.map(([k]) => [k, Math.max(0, +((o || {})[k]) || 0)]));
  const added = list.map(x => { const i = blankInstaller(String(x.name || 'New installer').trim() || 'New installer', nums(x.rates));
    const items = (Array.isArray(x.items) ? x.items : []).filter(it => it && instCount(it.per) && +it.amount > 0)
      .map(it => ({ per: it.per, amount: +it.amount, ...(it.name ? { name: String(it.name).trim() } : {}) }));
    if (items.length) i.items = items; if (+x.min > 0) i.min = +x.min;
    if (x.notes) i.notes = String(x.notes).trim(); return i; });
  INSTALLERS.push(...added); savePrices(); if (typeof renderPricing === 'function') renderPricing(); return added.length;
}
const SAW_EST = [['moldCut', 25, 'Moldings, per cut'], ['caulk', 5, 'Caulking, per cut'], ['scribe', 15, 'Scribing fillers and panels, per edge'],
  ['scribeTall', 25, 'Scribing tall end panels'], ['topScribe', 25, 'Scribing counter tops, per edge']];
// 0.59.36: the island panel lines from his sheet, which the first import left in the notes.
const SAW_ISLAND = [['island', 25, 'Island panels (48" increments)'], ['islandScribe', 25, 'Scribing island panels (48" increments)']];
// Saw Struck (Curtis Perrin), from the pricing sheet Ayden sent 2026-11-19. Added once; after that it is the shop's to change.
const SAW_STRUCK = { name: 'Saw Struck (Curtis Perrin)', rates: { Base: 0, Wall: 0, Tall: 0 }, min: 250,
  items: [['base', 50, 'Bases, per box with toe skin'], ['wall', 50, 'Uppers, per box up to 42 x 42'], ['wallBig', 75, 'Large uppers, per box'], ['hood', 75, 'Hoods, per box'],
    ['tall', 75, 'Tall cabinets, per box'], ['filler', 10, 'Fillers'], ['panel', 10, 'Base and wall panels'], ['panelTall', 25, 'Tall end panels'],
    ['door', 4, 'Door and hinge install'], ['drawer', 8, 'Drawer front install'], ['pull', 5, 'Handles/knobs (standard)'], ['shelf', 50, 'Floating shelves, per 0-4 sq ft'], ['top8', 25, 'Counter tops, per 0-8 sq ft'], ...SAW_ISLAND, ...SAW_EST]
    .map(([per, amount, name]) => ({ per, amount, name })),
  notes: `Estimated from the drawing (check on the job): molding cuts $25, caulking $5 per cut, scribing fillers and panels $15 per edge, tall end panels $25, countertops $25 per edge (48").
Not priced, add by hand when the job has them: island build/bracing per quote; valance $25 per item (48") plus $25 scribing; scribe molding $10 per piece; columns $25 per column (48") plus $25 per edge scribing; cupped or specialty pulls per quote.
Tall cabinets are not on the sheet: priced at $75 like large uppers. Check with Curtis.
Phone (801) 319-8839, sawstruckcarpentry@gmail.com.` };
function ensureSawStruck() {
  const had = INSTALLERS.find(i => i.seedSaw);
  if (had) {
    let ch = false; had.items = had.items || [];
    const addAll = list => list.forEach(([per, amount, name]) => { if (!had.items.some(it => it.per === per)) had.items.push({ per, amount, name }); });
    // 0.58.20: Saw Struck's scribing, molding cuts and caulking go on his price list as estimates, once.
    if (!had.sawEst) { addAll(SAW_EST); had.sawEst = 1; ch = true; }
    // 0.59.36: island panels and their scribing go on the list, shelves say per 0-4 sq ft, and the notes lose the island line.
    if (!had.sawFix36) {
      addAll(SAW_ISLAND);
      had.items.forEach(it => { if (it.per === 'shelf' && it.name === 'Floating shelves (0-4 sq ft)') it.name = 'Floating shelves, per 0-4 sq ft'; });
      if (had.notes) had.notes = had.notes.replace(' island panels $25 per panel (48" increments) plus $25 scribing;', '');
      had.sawFix36 = 1; ch = true;
    }
    return ch;
  }
  const i = blankInstaller(SAW_STRUCK.name, SAW_STRUCK.rates); Object.assign(i, { items: SAW_STRUCK.items.map(x => ({ ...x })), min: SAW_STRUCK.min, notes: SAW_STRUCK.notes, seedSaw: 1, sawEst: 1, sawFix36: 1 });
  INSTALLERS.push(i); return true;
}
const sameRates = (a, b) => CAT_FT.every(([k]) => (+(a || {})[k] || 0) === (+(b || {})[k] || 0));
const defInstaller = () => INSTALLERS.find(i => i.def) || INSTALLERS[0] || null;
function jobInstaller(ps, job = S.job) {
  if (job.noInstall || job.installer === 'none') return null;
  return INSTALLERS.find(i => i.id === job.installer) || INSTALLERS.find(i => i.id === (ps && ps.instBy)) || defInstaller();
}
// 0.59.14 (Ayden 2026-11-19: "choose installers per room or % of job"): a room can have its own installer (Quote, room header),
// '' = the job's, 'none' = no installer in that room. Rooms with no pick price exactly as before.
function roomInstaller(ps, r) {
  const v = r && r.installer; if (!v) return jobInstaller(ps);
  return v === 'none' ? null : INSTALLERS.find(i => i.id === v) || jobInstaller(ps);
}
const anyInstaller = ps => S.rooms.some(r => roomInstaller(ps, r));
// Moves a sheet's old install prices to an installer with the same prices, or a new one, and takes them off the sheet.
function takeInstall(ps) {
  if (!ps.install) return false;
  let ins = INSTALLERS.find(i => sameRates(i.rates, ps.install));
  if (!ins) { ins = blankInstaller(INSTALLERS.length ? `Richard (${ps.name})` : 'Richard', ps.install); if (!INSTALLERS.length) ins.def = true; INSTALLERS.push(ins); }
  ps.instBy = ins.id; delete ps.install; return true;
}
// 0.59.4 (Ayden 2026-11-19): hardware lines saved under an old name (see hwKeyNow in core.js) go into the line with the
// name it has now. Where both were there the current line's price stands (in the shop's sheets both had the same price).
function mergeHwKeys(ps) {
  const it = ps && ps.hardware && ps.hardware.items; if (!it || typeof hwKeyNow !== 'function') return false;
  let moved = false;
  Object.keys(it).forEach(k => { const n = hwKeyNow(k); if (n === k) return; if (!(n in it)) it[n] = it[k]; delete it[k]; moved = true; });
  return moved;
}
// Ayden's real hardware costs (2026-11-19), set once on each sheet: Blum hinge $3.50 and plate $1 each, 563H guides
// 15" $25, 18" $23, 21" $22 a pair, T51.1901 locks $5 a pair, pulls and knobs $5 each plus $3 each to drill and put on.
function hwCosts1119(ps) {
  if (!ps || !ps.hardware || ps.hwCost1119) return false;
  const it = ps.hardware.items || (ps.hardware.items = {}), T = TANDEM_563H, H = CLIPTOP_MOZAIK.name;
  it[H] = 3.5; it[H + ' mounting plate'] = 1; if (H + ' face frame mounting plate' in it) it[H + ' face frame mounting plate'] = 1;
  [[15, 25], [18, 23], [21, 22]].forEach(([L, v]) => { it[slideBomName(T, L)] = v; });
  it[T.bomExtra] = 5;
  (S ? S.hardware : []).filter(h => h.kind === 'pull').forEach(h => { it[h.name] = 5; });
  if (ps.adders && ps.adders.perPull === undefined) ps.adders.perPull = 3;
  ps.hwCost1119 = 1; return true;
}
// 0.59.6 (Ayden 2026-11-19): every cabinet leg line is $2 each (he pays $1.60), once per sheet.
function legCost2(ps) {
  if (!ps || !ps.hardware || ps.legCost2) return false;
  const it = ps.hardware.items || (ps.hardware.items = {});
  (S ? S.hardware : []).filter(h => h.kind === 'leg').forEach(h => { it[h.name] = 2; });
  Object.keys(it).forEach(k => { if (/\bleg\b/i.test(k)) it[k] = 2; });
  ps.legCost2 = 1; return true;
}
async function loadPrices() {
  try { PRICES = inHub() ? ((await Hub.storage.get('priceSheets')) || []) : JSON.parse(localStorage.getItem(KEY + '.prices') || '[]'); } catch (_) { PRICES = []; }
  if (PRICES.value) PRICES = PRICES.value;
  if (!Array.isArray(PRICES)) PRICES = [];
  try { INSTALLERS = inHub() ? ((await Hub.storage.get('installers')) || []) : JSON.parse(localStorage.getItem(KEY + '.installers') || '[]'); } catch (_) { INSTALLERS = []; }
  if (INSTALLERS && INSTALLERS.value) INSTALLERS = INSTALLERS.value;
  if (!Array.isArray(INSTALLERS)) INSTALLERS = [];
  let changed = false;
  if (!PRICES.length) { PRICES.push(defaultPriceSheet()); changed = true; }
  else if (PRICES.map(ensureMzk).some(Boolean)) changed = true;
  if (PRICES.map(takeInstall).some(Boolean)) changed = true;
  if (PRICES.map(mergeHwKeys).some(Boolean)) changed = true;
  if (!INSTALLERS.length) { const r = blankInstaller('Richard', MZK.install); r.def = true; INSTALLERS.push(r); changed = true; }
  if (ensureSawStruck()) changed = true;
  // 0.60.6 (Ayden 2026-11-20): Richard installs specialty items at $50 per foot. Set once; after that it is the shop's to change.
  INSTALLERS.filter(i => /^Richard\b/.test(i.name || '') && !i.specFt).forEach(i => { i.rates = i.rates || {}; if (!(+i.rates.Specialty > 0)) i.rates.Specialty = 50; i.specFt = 1; changed = true; });
  if (changed) savePrices();
}
let priceTimer = null;
function savePrices() {
  clearTimeout(priceTimer);
  priceTimer = setTimeout(() => {
    try { localStorage.setItem(KEY + '.prices', JSON.stringify(PRICES)); localStorage.setItem(KEY + '.installers', JSON.stringify(INSTALLERS)); } catch (_) {}
    if (inHub()) { Hub.storage.set('priceSheets', PRICES).catch(() => flash('Could not save the price sheets.')); Hub.storage.set('installers', INSTALLERS).catch(() => flash('Could not save the installers.')); }
  }, 300);
}

/* ---------- Pricing the drawn job ---------- */
// Price of one cabinet, split into lines so the quote can show where it comes from.
// A product priced on its own (a floating shelf, a mantel): its row on the sheet's Products card is its whole price.
// It isn't a cabinet: no doors, materials, hardware or paint, no installation, and it's left out of the cabinet counts.
// Desks, slat walls and the other shop-built pieces (madeprod.js) are priced on their own from the start.
const ownRule = (c, ps) => { const o = (ps.products || {})[c.libId]; return o && o.own ? o : !o && c.made && typeof madePrice === 'function' ? madePrice(c, ps) : null; };
function priceCab(c, ps) {
  const own = ownRule(c, ps);
  if (own) {
    const each = (+own.base || 0) + (+own.perFt || 0) * c.w / 12 + (+own.perSq || 0) * c.w * c.h / 144 + (typeof shelfExtrasPrice === 'function' ? shelfExtrasPrice(c, ps) : 0), custom = (+c.pxFt || 0) * c.w / 12 + (+c.pxSq || 0) * c.w * c.h / 144, upcharge = (each + custom) * (+c.pxUp || 0) / 100;
    const sq = { fronts: 0, panels: 0, fillers: 0, toe: 0, interior: 0, total: 0, eb: 0 };
    return { own: true, each, box: 0, doors: 0, extras: 0, ends: 0, hardware: 0, materials: 0, sq, paint: 0, banding: 0, custom, upcharge, total: each + custom + upcharge };
  }
  const b = buildParts(c), fr = computeFronts(c), rule = { ...ps.cab[c.cat], ...(ps.products[c.libId] || {}) };
  const box = (+rule.base || 0) + (+rule.perFt || 0) * c.w / 12;
  ensureLibPrices(ps);
  let doors = 0, cDoors = 0;
  if (ps.doors.on) fr.forEach(f => {
    if (f.type === 'open') return;
    const { ds } = frontStyle(c, f);
    const pf = priceFront(ds, (f.x1 - f.x0) * (f.z1 - f.z0) / 144, ps, f.x1 - f.x0, f.z1 - f.z0); doors += pf.total;
    // Estimated profit: a bought front costs what the door maker charges; a shop-made one its material.
    cDoors += ds.bought ? pf.total : pf.material;
  });
  doors *= gMark(ps, 'doors');
  const ad = ps.adders, ins = c.inserts || [], p = effParams(c);
  const nDr = fr.filter(f => f.type === 'drawer').length;
  // Each insert has its own price in the insert library (a lazy susan is not a tray divider).
  // Pulls and knobs: what the hardware list counts of the job's pull hardware, at the sheet's drilling charge each.
  const pullNames = new Set(S.hardware.filter(h => h.kind === 'pull').map(h => h.name)), nPull = Object.entries(b.bom).reduce((a, [k, q]) => a + (pullNames.has(k) ? q : 0), 0);
  // 0.59.11: each drawer box has its own price by drawer material (Edit prices › Adders), on top of Each drawer.
  const boxEach = nDr ? dbxPrice(ps, cabDrawerMatT(c)) : 0;
  const extras = nPull * (+ad.perPull || 0) + nDr * ((+ad.perDrawer || 0) + boxEach) + ins.reduce((a, it) => a + insertPrice(it), 0) + Math.max(0, p.shelfCount | 0) * (+ad.perShelf || 0) + (typeof shelfExtrasPrice === 'function' ? shelfExtrasPrice(c, ps) : 0);
  // Applied end panels are priced as a front in their door style, plus the sheet's charge for a panel that tall.
  const pds = panelDoor(c), panelParts = panelPartsOf(b, c);
  // 0.59.21 (Ayden 2026-11-19): a flat slab end panel is its material by the sq ft plus the sheet's charge per panel ($25), like a
  // loose panel. A panel in a framed door style (shaker...) is priced as that door, as before.
  const slabP = pds.type === 'slab';
  const ends = panelParts.reduce((a, pt) => { const m = mat(pt.mat); return a + pt.qty * (pt.ds ? (ps.doors.on ? priceFront(pt.ds, pt.L * pt.W / 144, ps, pt.W, pt.L).total * gMark(ps, 'doors') : 0) : slabP ? (m ? pt.L * pt.W * matSqIn(m, ps) : 0) + panelAdd(ps, c.cat) : ps.doors.on ? priceFront(pt.pds || pds, pt.L * pt.W / 144, ps, pt.W, pt.L).total * gMark(ps, 'doors') : 0); }, 0) + fillerPrice(c, b, ps);
  let hardware = 0;
  if (ps.hardware.on) Object.entries(b.bom).forEach(([k, q]) => { hardware += q * (+ps.hardware.items[k] || 0); });
  hardware *= gMark(ps, 'hardware');
  // 0.59.35 Estimated profit (Pricing › Quote, never printed): what the cabinet costs the shop in sheet goods, banding and hardware.
  let cMat = 0, cHw = 0;
  b.parts.forEach(pt => { const m = mat(pt.mat); if (!m || FRONT_KINDS.includes(pt.kind)) return; cMat += pt.L * pt.W * pt.qty * matSqIn(m, ps) + bandCost(pt) * pt.qty; });
  Object.entries(b.bom).forEach(([k, q]) => { cHw += q * (+ps.hardware.items[k] || 0); });
  const cIns = ins.reduce((a, it) => a + insertPrice(it), 0);
  // 0.59.37: what the shop's labor estimate counts: parts, sheet area by material, doors, drawers, panels, fillers.
  const bought = frontBought(c), lab = { parts: 0, area: {}, doors: 0, drawers: 0, panels: 0, fillers: fillersOf(c).length };
  b.parts.forEach(pt => { if (pt.cabId != null && pt.cabId !== c.id) return; const q = pt.qty || 1; lab.parts += q; if (pt.kind === 'applied') lab.panels += q;
    const m = mat(pt.mat); if (m && (m.kind || 'sheet') === 'sheet' && !(FRONT_KINDS.includes(pt.kind) && bought)) lab.area[m.id] = (lab.area[m.id] || 0) + pt.L * pt.W * q; });
  fr.forEach(f => { if (f.type === 'door') lab.doors++; else if (f.type === 'drawer') lab.drawers++; });
  let materials = 0;
  if (ps.materials.on) b.parts.forEach(pt => {
    // Door parts are paid for by the door's own material cost.
    const m = mat(pt.mat); if (!m || (ps.doors.on && (FRONT_KINDS.includes(pt.kind) || pt.kind === 'applied'))) return;
    // Edge banding, priced by the roll in Libraries › Edgebanding, rides with the materials.
    materials += pt.L * pt.W * pt.qty * matSqIn(m, ps) + bandCost(pt) * pt.qty;
  });
  materials *= gMark(ps, 'materials');
  const sq = paintCab(c, ps, b, fr), paint = sq.total * (+paintOf(ps).rate || 0), banding = sq.eb * (+paintOf(ps).ebRate || 0);
  // Per-cabinet extras from its Price tab: price per foot and per square foot of face, then an upcharge on the lot.
  const custom = (+c.pxFt || 0) * c.w / 12 + (+c.pxSq || 0) * c.w * c.h / 144, base = box + doors + extras + ends + hardware + materials + paint + banding + custom, upcharge = base * (+c.pxUp || 0) / 100;
  return { box, doors, extras, ends, hardware, materials, sq, paint, banding, custom, upcharge, total: base + upcharge, bom: b.bom, cost: { mat: cMat, doors: cDoors, hw: cHw, ins: cIns, lab } };
}
// Drawer box prices, each (Ayden 2026-11-19): 3/4 melamine about $25-30, 5/8 Baltic birch ply about $70, solid wood about $110.
// Picked by the drawer material's name unless the price sheet has its own number for it (Edit prices › Adders).
const DBX_PRICES = [[/melamine/i, 28], [/solid|hardwood/i, 110], [/birch|ply/i, 70]];
const dbxDefault = t => { const n = (t && t.name) || '', hit = DBX_PRICES.find(([re]) => re.test(n)); return hit ? hit[1] : 0; };
const dbxPrice = (ps, t) => { if (!t) return 0; const v = (ps.drawerBox || {})[t.id]; return v !== '' && v != null && isFinite(+v) ? +v : dbxDefault(t); };
// 0.59.22 (Ayden 2026-11-19: fillers "need to be closer to 40 because we have to cut them to fit"): each wall filler is its
// material by the sq ft plus the sheet's charge per filler ($35 by default), so about $37-40.
function fillerPrice(c, b, ps) {
  const n = fillersOf(c).length; if (!n) return 0;
  const parts = b.parts.filter(pt => pt.cabId === c.id && pt.kind === 'filler' && /^Filler \(/.test(pt.name || ''));
  const matAmt = parts.reduce((a, pt) => { const m = mat(pt.mat); return a + (m ? pt.L * pt.W * (pt.qty || 1) * matSqIn(m, ps) : 0); }, 0);
  return matAmt + n * (+ps.adders.perFiller || 0);
}
// 0.59.34 (Ayden 2026-11-20: "finished bottoms on the uppers... laminate the bottoms during the process... charge for the laminate
// paper cost plus labor"): a wall cabinet set to Laminated bottom (Settings › Construction, or the cabinet) pays the laminate
// for its bottom by the sq ft, with the sheet's waste, plus labor each. The bottom is still cut from the cabinet material.
// A cabinet with a finished exterior already has its bottom cut from the Finish material, so it is not charged again.
function lamBottomOf(c) {
  if (c.cat !== 'Wall' || c.moz || c.made || effParams(c).lamBottom !== 'on' || (typeof finExterior === 'function' && finExterior(c))) return 0;
  const b = buildParts(c).parts.find(pt => pt.cabId === c.id && pt.name === 'Bottom'); return b ? b.L * b.W * (b.qty || 1) / 144 : 0;
}
const FRONT_KINDS = ['door', 'drawerFront', 'frame'];
// A cabinet whose door template's doors are bought (Bywater...): its front parts are not cut in the shop.
const frontBought = c => { const f0 = computeFronts(c).find(f => f.type !== 'open'), ds = f0 && frontStyle(c, f0).ds; return !!(ds && (ds.bought || ds.source === 'buyout')); };
// One door or front: its size times the style's price per sq ft (from the door library, or this job's own) plus material.
// 0.55.34 (Ayden 2026-11-11): the style's Minimum per front ($20 by default) is a floor under that whole price, so a tiny
// front that would cost next to nothing costs the minimum. Before, the minimum replaced the labor and material went on top.
function priceFront(ds, sq, ps, w, h) {
  // A front bought in its material (Bywater 5 Piece Melamine): a price per piece, per sq ft and per foot around the edge,
  // plus each panel past the first. Without the size, the front is taken as square.
  // The Bywater 5 piece melamine shaker style carries its own numbers (bwEach, bwSq, bwFt, bwPanelAdd, bwSheetSq).
  const bm = ds.bought === 'style' ? { doorEach: ds.bwEach, doorSq: ds.bwSq, doorFt: ds.bwFt, doorPanel: ds.bwPanelAdd, sheetSq: ds.bwSheetSq } : ds.bought && boughtMat(ds.bought);
  if (bm) {
    if (!(w > 0 && h > 0)) w = h = Math.sqrt(sq * 144);
    const fr = typeof doorMids === 'function' && ds.type !== 'slab' ? doorMids(ds, w, h) : { nR: 0, nS: 0 }, extra = (fr.nR + 1) * (fr.nS + 1) - 1;
    const labor = (+bm.doorEach || 0) + sq * (+bm.doorSq || 0) + 2 * (w + h) / 12 * (+bm.doorFt || 0) + Math.max(0, extra) * (+bm.doorPanel || 0);
    // Special order colors: Bywater adds the full sheets of that color, so the sheet's cost per sq ft (with waste) goes on top.
    const material = bm.sheetSq != null ? sq * (+bm.sheetSq || 0) * (1 + (+((ps || {}).materials || {}).waste || 0) / 100) : bm.doorSpecial ? sq * matSqIn(bm, ps) * 144 : 0;
    return { labor, material, total: labor + material };
  }
  // 0.63.35: each mid stile or rail added past the style's own (split rules or the Face tab) adds the style's Each extra mid.
  const material = sq * doorMatRate(ds, ps), total = Math.max(doorMin(ds), sq * doorRate(ds) + material) + (ds._extraMids | 0) * (+ds.midAdd || 0);
  return { labor: total - material, material, total };
}
// Material cost per square foot of door: the style's own number (what a buyout door costs you, say),
// or else its material's sheet price spread over the sheet, plus waste.
function doorMatRate(ds, ps) {
  if (ds.matCost !== '' && ds.matCost != null && isFinite(+ds.matCost)) return +ds.matCost;
  const m = mat(ds.mat); if (!m) return 0;
  return matSqIn(m, ps) * 144;
}

/* ---------- Prices kept in the libraries, with this job's own where it has one ---------- */
// S.job.priceOver = { door: { <style id>: { rate } }, mat: { <material id>: { cost } }, ins: { <insert type>: { each, per } } }
const jobOver = (g, id) => ((S.job.priceOver || {})[g] || {})[id] || {};
const pick = (o, k, v) => o[k] !== '' && o[k] != null && isFinite(+o[k]) ? +o[k] : +v || 0;
const doorRate = ds => pick(jobOver('door', ds.id), 'rate', ds.rate);
const doorMin = ds => +ds.min || 0;
const matCost = m => pick(jobOver('mat', m.id), 'cost', m.cost);
// Dollars per square inch of a material, with the sheet's waste.
const matSqIn = (m, ps) => matCost(m) / (((m.sheetW || 49) * (m.sheetL || 97)) || 1) * (1 + (+((ps || {}).materials || {}).waste || 0) / 100);
const insLib = type => (S.insertPrices || {})[type] || {};
function insertPrice(it) {
  const t = insertType(it.type), lib = insLib(t.id), o = jobOver('ins', t.id), n = t.fields.includes('n') ? Math.max(0, +it.n || 0) : 0;
  // A library product with its own price uses it in place of the insert's price.
  const x = it.item && typeof intItem === 'function' && intItem(it.item), own = x && x.price !== '' && x.price !== undefined && x.price !== null && !isNaN(+x.price);
  return (own ? +x.price : pick(o, 'each', lib.each)) + n * pick(o, 'per', lib.per);
}
const panelAdd = (ps, cat) => +((ps.panelAdd || {})[cat === 'Wall' || cat === 'Tall' ? cat : 'Base']) || 0;
// The door style applied end panels are made and priced as: the job or room pick, or else the cabinet's own door.
// 0.59.22 (Ayden 2026-11-19: "applied end panels are usually flat slabs but if they want their door style... i would change it"):
// with no pick a panel is a flat slab (the door template's slab false front, else the first slab); 'same' = the door style.
function panelSlabId(t) { const ff = t && S.doorStyles.find(d => d.id === t.falseFront && d.type === 'slab'); return (ff || S.doorStyles.find(d => d.type === 'slab') || {}).id; }
function panelDoorPick(id, t, cat) {
  if (id && id !== 'same' && S.doorStyles.some(d => d.id === id)) return id;
  const door = cat === 'Wall' && t.wallDoor ? t.wallDoor : t.door;
  return id === 'same' ? door : panelSlabId(t) || door;
}
function panelDoor(c) { return withFinish(doorStyle(panelDoorPick(cabSet(c, 'panelDoor'), doorTpl(cabSet(c, 'doorT')), c.cat)), c); }
// 0.63.22 (Ayden 2026-11-24: "when i change the applied panels to the door style panels arent changing"): how an end panel
// w deep and h tall looks in that style. framed = a frame and field wide and tall enough to show (else it draws as a slab).
// 0.63.35: end = which end of cabinet c the panel is on (its own mid stiles and rails, and island or not); a made panel
// product passes no end and keeps its own on itself. The style's split rules and those counts are worked in (splitDs).
function panelLook(c, w, h, ds, end) {
  ds = ds || panelDoor(c);
  const framed = ds.type !== 'slab' && w >= 2 * (+ds.stile || 0) + 2 && h >= 2 * (+ds.rail || 0) + 2;
  if (framed && typeof splitDs === 'function') { const k = panelSplitOf(c, end); ds = splitDs(ds, w, h, k.kind, k.man); }
  return { ds, framed };
}
// 0.63.35 (Ayden 2026-11-24: "this is on the island end panel so i cant add vertical stiles or extra rails"): a panel's own
// mid stiles and rails { S, R } and its kind for the split rules ('island' or 'panel'). A cabinet keeps them per end
// (c.pSplit.L / .R); a Base or Wall End Panel or Support Panel on itself (c.pSplit), and its Island end panel pick (c.islandP:
// true, false, or unset = on an island wall or named island).
function panelSplitOf(c, end) {
  if (!c) return { kind: 'panel', man: null };
  const w = c.wall && typeof wall === 'function' ? wall(c.wall) : null, onIsland = !!(w && (w.island || w.hidden));
  if (end === 'L' || end === 'R') return { kind: onIsland ? 'island' : 'panel', man: (c.pSplit || {})[end] || null };
  const ip = c.islandP, isl = ip === true || ip === '1' ? true : ip === false || ip === '0' ? false : onIsland || /island/i.test(c.name || '');
  return { kind: isl ? 'island' : 'panel', man: c.pSplit && (c.pSplit.S != null || c.pSplit.R != null) ? c.pSplit : null };
}
// 0.63.22 (Ayden 2026-11-24: "if the panels have door styles and the materials not hdm they need to be buyout doors",
// "we only make hdm doors in house"): an end panel in a framed door style is made in the shop only from HDM. In any other
// material (maple, alder...), or in a buyout style, it is ordered from the door maker: not cut, on the door order, priced
// as a front of that style. A flat slab panel is always cut in the shop.
// HDM and MDF are the same sheet here (the shop's library calls it "3/4 MDF (paint grade)").
const shopMadeDoorMat = m => /\b(hdm|mdf)\b/i.test((m && m.name) || '');
function panelBuys(ds, matId) { return !!ds && ds.type !== 'slab' && (ds.source === 'buyout' || !shopMadeDoorMat(mat(matId))); }
// The style a bought panel is ordered and priced in.
const buyStyle = ds => ds.source === 'buyout' ? ds : { ...ds, source: 'buyout' };
// A cabinet's applied panels, cut and bought: the parts (kind 'applied') plus the ones ordered (b.buyPanels).
const panelPartsOf = (b, c) => [...b.parts.filter(pt => pt.cabId === c.id && pt.kind === 'applied'), ...(b.buyPanels || [])];
// The panel library keeps the fit (overhang, scribe, to the floor); the look comes from the door style.
function panelFor(c) {
  const ps = panelStyle(cabSet(c, 'panelStyle')), ds = panelDoor(c), framed = ds.type !== 'slab';
  return { ...ps, mat: finishRole(c, 'sheet') || ds.mat, type: framed ? 'routed' : 'flat', frame: framed ? Math.max(+ds.stile || 0, +ds.rail || 0) : 0, pocketDepth: +ds.pocketDepth || 0.25, door: ds };
}
// Loose panels drawn as shapes in the room: their material plus the sheet's charge for a panel that tall.
function shapePanelCat(s) { const b = shapeBox(s.pts || []); return b.h > 48 ? 'Tall' : (+s.elev || 0) >= 30 ? 'Wall' : 'Base'; }
function priceShapes(ps) {
  return (S.shapes || []).map(s => {
    // 0.63.24: a miter-folded leg is four fronts of its door style (bought or made).
    const P = typeof shapePost === 'function' && shapePost(s);
    if (P) return { name: `Leg, ${s.name || 'shape'} (${fmtLen(P.W, 1)} × ${fmtLen(P.D, 1)} × ${fmtLen(P.H, 1)}, ${P.ds.name}${P.buy ? ', buyout' : ''})`, amount: ps.doors && ps.doors.on ? P.faces.reduce((t, f) => t + priceFront(f.ds || P.ds, f.w * f.h / 144, ps, f.w, f.h).total * gMark(ps, 'doors'), 0) : 0 };
    const m = shapeMat(s), b = shapeBox(s.pts || []), cat = shapePanelCat(s), o = shapeOutline(s.pts || []), area = o.length > 2 ? Math.abs(o.reduce((t, q, i) => { const r = o[(i + 1) % o.length]; return t + q.x * r.y - r.x * q.y; }, 0)) / 2 : b.w * b.h;
    const amount = (m ? area * matSqIn(m, ps) : 0) + panelAdd(ps, cat);
    return { name: `Panel, ${s.name || 'shape'} (${fmtLen(b.w, 1)} × ${fmtLen(b.h, 1)}, ${cat.toLowerCase()})`, amount };
  });
}
// Moves prices that used to live on the price sheet into the job's libraries, once. Later door styles start from their type.
const DOOR_RATE0 = { slab: 12, routed: 16, twopiece: 18, fivepiece: 22 };
function ensureLibPrices(ps) {
  if (!S) return;
  ps = ps || priceSheet(); const old = ps || {}, od = old.doors || {}, om = old.materials || {}, oa = old.adders || {};
  let moved = false;
  S.doorStyles.forEach(d => {
    if (d.rate !== undefined) return;
    const cf = d.costFactor === '' || d.costFactor == null || !isFinite(+d.costFactor) ? 1 : +d.costFactor, r = (od.rates || {})[d.id];
    d.rate = Math.round((r != null ? +r : DOOR_RATE0[doorStyle(d.id).type] || 14) * cf * 100) / 100;
    d.min = od.min != null ? +od.min || 0 : 20; delete d.costFactor; moved = true;
  });
  if (!S.insertPrices) {
    const ro = oa.perRollout ?? 85, other = oa.perOtherInsert ?? 60;
    S.insertPrices = Object.fromEntries(INSERT_TYPES.map(t => [t.id, { each: /^(rollout|rotray|roshelf)$/.test(t.id) ? ro : other, per: 0 }]));
    if (om.sheets) S.materials.forEach(m => { const v = om.sheets[m.id]; if (v != null && isFinite(+v)) m.cost = +v; });
    moved = true;
  }
  // 0.58.8 (Ayden 2026-11-19: countertops aren't his main thing): every top is one price per square foot, $70 to start.
  if (ps && !ps.topSq) { ps.topSq = { rate: 70 }; savePrices(); }
  if (hwCosts1119(ps)) savePrices();
  if (legCost2(ps)) savePrices();
  // 0.58.3: Cmold (flat crown) starts at $4/ft, once per price sheet; after that the sheet's own price stands.
  if (ps && ps.molds && !ps.cmold4 && S.moldings.some(m => m.id === 'mo-cmold')) { ps.molds['mo-cmold'] = 4; ps.cmold4 = 1; savePrices(); }
  // 0.63.46: the new base molding starts at the same $9/ft as the other moldings.
  if (ps && ps.molds && !ps.base9 && S.moldings.some(m => m.id === 'mo-base')) { if (!(ps.molds['mo-base'] > 0)) ps.molds['mo-base'] = 9; ps.base9 = 1; savePrices(); }
  // 0.57.0: concealed floating shelf brackets and in-wall blocking start at rough shop prices.
  // 0.59.15 (Ayden 2026-11-19): the drawer box price already has the box and its labor, and slides are hardware, so the old
  // $35 Each drawer charge would count the labor twice. Sheets still on $35 go to $0 once; a different number is kept.
  if (ps && ps.adders && !ps.dbxLabor) { if (+ps.adders.perDrawer === 35) ps.adders.perDrawer = 0; ps.dbxLabor = 1; savePrices(); }
  // 0.59.34: laminated wall cabinet bottoms start at $25 labor each and the Wilsonart average, $5.33 a sq ft.
  if (ps && ps.adders && ps.adders.perLamBottom === undefined) { ps.adders.perLamBottom = 25; if (ps.adders.lamSq === undefined) ps.adders.lamSq = 5.33; savePrices(); }
  if (ps && ps.adders && (ps.adders.perBracket === undefined || ps.adders.perBlocking === undefined)) { if (ps.adders.perBracket === undefined) ps.adders.perBracket = 15; if (ps.adders.perBlocking === undefined) ps.adders.perBlocking = 35; savePrices(); }
  if (ps && !ps.panelAdd) {
    const was = +((ps.counts || {}).panels) || 0; ps.panelAdd = { Base: was, Wall: was, Tall: was };
    if (ps.counts) { if (+ps.counts.fillers) ps.adders.perFiller = (+ps.adders.perFiller || 0) + +ps.counts.fillers; delete ps.counts.panels; delete ps.counts.fillers; }
    savePrices();
  }
  // 0.59.22: fillers are material plus a charge each; sheets still on the old $25 go to $35 once.
  // 0.63.4: scribing to a wall marked Scribe starts at $50 a wall, once per sheet.
  if (ps && ps.adders && ps.adders.scribeWall === undefined) { ps.adders.scribeWall = 50; savePrices(); }
  if (ps && ps.adders && !ps.fillMat) { if (+ps.adders.perFiller === 25) ps.adders.perFiller = 35; ps.fillMat = 1; savePrices(); }
  // 0.59.21: panels are priced by material plus a charge each; sheets with no charge yet get $25 once.
  if (ps && !ps.panelMat) { const pa = ps.panelAdd || (ps.panelAdd = { Base: 0, Wall: 0, Tall: 0 }); if (['Base', 'Wall', 'Tall'].every(k => !+pa[k])) Object.assign(pa, { Base: 25, Wall: 25, Tall: 25 }); ps.panelMat = 1; savePrices(); }
  if (moved) save();
}
function priceJob(ps) {
  const rooms = S.rooms.map(r => withRoom(r, () => {
    // 0.61.3: automatic end panel pieces are priced with their cabinet, so they make no line or install footage of their own.
    const all = S.cabinets.filter(c => !c.autoOf).map(c => ({ c, label: LBL[c.id], ...priceCab(c, ps) })), cabs = all.filter(k => !k.own);
    // Products priced on their own go on the room as lines of their own, never in with the cabinets.
    const own = all.filter(k => k.own).map(k => ({ name: `${k.label} ${k.c.name} (${fmtLen(k.c.w, 1)} wide)`, amount: k.total, own: true }));
    // Tops and molding are one line each for the room, not one per wall (Ayden 2026-11-06). The kinds used go in brackets.
    const oneLine = (name, runs, kind, amt, top) => { if (!runs.length) return []; const kinds = [...new Set(runs.map(kind))]; return [{ name: `${name} (${kinds.join(', ')})`, amount: runs.reduce((a, x) => a + amt(x), 0), ...(top ? { top: true } : {}) }]; };
    const tops = oneLine('Countertops', countertopRuns().filter(t => t.on), t => t.tpl.name, t => (t.area ?? t.len * t.depth) / 144 * topSqFor(ps, r), true);
    const molds = oneLine('Molding', moldingRuns(), m => m.m.name, m => m.len / 12 * (+ps.molds[m.m.id] || 0));
    const xs = ps.extras.filter(x => x.per === 'room').map(x => ({ name: x.name, amount: +x.amount || 0 }))
      .concat(ps.extras.filter(x => x.per === 'cabinet' && cabs.length).map(x => ({ name: `${x.name} (${cabs.length} × ${money(+x.amount || 0)})`, amount: (+x.amount || 0) * cabs.length })));
    // Installation by the foot of each type, at the job's installer's prices, like Mozaik's per-length install rows.
    // A job can have No installer (the customer installs, or it's a pickup).
    // An installer priced as a % of the job charges that % of the room (its cabinets and other lines) instead of per foot and price list.
    const who = roomInstaller(ps, r), pctI = who && +who.pct > 0 ? +who.pct : 0, specOn = !!who && +((who.rates || {}).Specialty) > 0;
    // With a Specialty price, specialty products (own-price ones too, like floating shelves) go on that line instead of their type's.
    const ftOf = cat => cat === 'Specialty' ? all.filter(k => !k.c.noCount && isSpecialty(k.c)) : cabs.filter(k => k.c.cat === cat && !k.c.noCount && !(specOn && isSpecialty(k.c)));
    const inst = !who || pctI ? [] : INST_FT.map(([cat, name]) => { const ft = (cat === 'Specialty' && !specOn ? [] : ftOf(cat)).reduce((a, k) => a + k.c.w, 0) / 12, r = +((who.rates || {})[cat]) || 0;
      return ft && r ? { name: `Installation, ${name.toLowerCase()} (${ftLen(ft)} ft × ${money(r)})`, amount: ft * r, inst: true } : null; }).filter(Boolean);
    // The installer's price list, by what this room has (a per-job line goes on the job, not each room).
    const list = who && !pctI && (who.items || []).filter(it => +it.amount && it.per !== 'job' && instCount(it.per));
    if (list && list.length) { const n = instCounts(cabs, all.filter(k => k.own)); list.forEach(it => { const q = n[it.per]; if (!q) return; const [, label, unit] = instCount(it.per);
      inst.push({ name: `Installation, ${(it.name || label).replace(/^./, ch => ch.toLowerCase())} (${INST_EST[it.per] ? 'est. ' : ''}${q} × ${money(+it.amount)}${['per 8 sq ft', 'per 4 sq ft', 'per 48"'].includes(unit) ? ' ' + unit : ''})`, amount: q * +it.amount, inst: true }); }); }
    const lb = cabs.map(k => lamBottomOf(k.c)).filter(Boolean), ad = ps.adders || {}, lbRate = (+ad.lamSq || 0) * (1 + (+((ps.materials || {}).waste) || 0) / 100);
    const lamB = lb.length ? [{ name: `Laminated wall cabinet bottoms (${lb.length} × ${money(+ad.perLamBottom || 0)} labor, ${sqft(lb.reduce((a, x) => a + x, 0))} sq ft laminate)`, amount: lb.length * (+ad.perLamBottom || 0) + lb.reduce((a, x) => a + x, 0) * lbRate, cost: lb.reduce((a, x) => a + x, 0) * lbRate }] : [];
    // 0.63.4: each wall in the room marked Scribe (Wall finish box on the wall).
    const scrN = typeof scribedWalls === 'function' ? scribedWalls().length : 0, scrR = +ad.scribeWall || 0;
    const scr = scrN && scrR ? [{ name: `Scribe to walls (${scrN} × ${money(scrR)})`, amount: scrN * scrR }] : [];
    const pre = [...own, ...lamB, ...scr, ...tops, ...molds, ...priceShapes(ps), ...(typeof bidPriceLines === 'function' ? bidPriceLines(r) : [])];
    if (pctI) { const amt = (cabs.reduce((a, k) => a + k.total, 0) + pre.reduce((a, l) => a + l.amount, 0) + xs.reduce((a, l) => a + l.amount, 0)) * pctI / 100; if (amt) inst.push({ name: `Installation (${pctI}% of the room)`, amount: amt, inst: true }); }
    if (who) inst.forEach(l => { l.instId = who.id; });
    const lines = [...pre, ...inst, ...xs];
    const hw = {}; cabs.forEach(k => Object.entries(k.bom || {}).forEach(([n, x]) => { hw[n] = (hw[n] || 0) + x; }));
    return { r, cabs, lines, hw, sq: addSq(cabs.map(k => k.sq)), total: cabs.reduce((a, k) => a + k.total, 0) + lines.reduce((a, k) => a + k.amount, 0) };
  }));
  const jobLines = ps.extras.filter(x => x.per === 'job').map(x => ({ name: x.name, amount: +x.amount || 0 })).concat(typeof jobLinePrices === 'function' ? jobLinePrices() : []);
  // The installer's flat per-job charge, then their minimum: installation is topped up to it. With installers picked per room,
  // each installer used gets their own per-job charge and minimum; with none picked it is the job's installer, as before.
  const jw = jobInstaller(ps), perRoom = S.rooms.some(r => r.installer);
  const used = !perRoom ? (jw ? [jw] : []) : [...new Set(rooms.map(R => roomInstaller(ps, R.r)).filter(Boolean))];
  used.forEach(who => {
    const tag = used.length > 1 ? `, ${who.name}` : '';
    (who.items || []).filter(it => it.per === 'job' && +it.amount).forEach(it => jobLines.push({ name: `Installation, ${(it.name || 'per job').replace(/^./, ch => ch.toLowerCase())}${tag}`, amount: +it.amount, inst: true, instId: who.id }));
    const did = rooms.reduce((a, R) => a + R.lines.filter(l => l.inst && (!perRoom || l.instId === who.id)).reduce((b, l) => b + l.amount, 0), 0) + jobLines.filter(l => l.inst && (!perRoom || l.instId === who.id)).reduce((a, l) => a + l.amount, 0);
    if (+who.min > did) jobLines.push({ name: `Installation minimum${tag} (${money(+who.min)} per job)`, amount: +who.min - did, inst: true, instId: who.id });
  });
  // Percent charges (fuel and delivery, commission) are taken on everything above them, before markup and tax.
  const base = rooms.reduce((a, r) => a + r.total, 0) + jobLines.reduce((a, k) => a + k.amount, 0);
  const pct = ps.extras.map((x, xi) => ({ x, xi })).filter(({ x }) => x.per === 'pct' && +x.amount).map(({ x, xi }) => ({ name: `${x.name} ${+x.amount}%`, amount: base * +x.amount / 100, xi }));
  jobLines.push(...pct);
  const sub = base + pct.reduce((a, k) => a + k.amount, 0);
  const markup = sub * (+ps.markup || 0) / 100, tax = (sub + markup) * (+ps.tax || 0) / 100;
  // Linear feet and cabinet total by type, for a price per foot. Cabinets only: tops, molding and charges are left out.
  const perFt = CAT_FT.map(([cat, name]) => { const ks = rooms.flatMap(R => R.cabs).filter(k => k.c.cat === cat && !k.c.noCount), ft = ks.reduce((a, k) => a + k.c.w, 0) / 12, total = ks.reduce((a, k) => a + k.total, 0); return { cat, name, n: ks.length, ft, total, rate: ft ? total / ft : 0 }; });
  const total = sub + markup + tax, payments = (ps.payments || []).map((x, pi) => ({ x, pi })).filter(({ x }) => +x.pct).map(({ x, pi }) => ({ name: x.name, pct: +x.pct, amount: total * x.pct / 100, pi }));
  return { rooms, jobLines, sub, markup, tax, total, payments, sq: addSq(rooms.map(R => R.sq)), perFt };
}
function quoteCSV(ps) {
  const q = priceJob(ps), rows = [['Room', 'Cabinet', 'Name', 'Size', 'Cabinet', 'Doors and fronts', 'Drawers, shelves, inserts', 'Panels and fillers', 'Hardware', 'Materials', 'Paint', 'Paint sq ft', 'Edgebanding', 'Edgebanding sq ft', 'Total']], m = v => (Math.round(v * 100) / 100).toFixed(2);
  q.rooms.forEach(R => {
    R.cabs.forEach(k => rows.push([R.r.name, k.label, k.c.name, `${fmtLen(k.c.w)} x ${fmtLen(k.c.h)} x ${fmtLen(k.c.d)}`, m(k.box), m(k.doors), m(k.extras), m(k.ends), m(k.hardware), m(k.materials), m(k.paint), k.sq.total.toFixed(1), m(k.banding || 0), (k.sq.eb || 0).toFixed(1), m(k.total)]));
    R.lines.forEach(l => rows.push([R.r.name, '', l.name, '', '', '', '', '', '', '', '', '', '', '', m(l.amount)]));
  });
  const end = (name, v, sq = '') => rows.push(['', '', name, '', '', '', '', '', '', '', '', sq, '', '', v]);
  q.jobLines.forEach(l => rows.push(['Job', '', l.name, '', '', '', '', '', '', '', '', '', '', '', m(l.amount)]));
  end('Subtotal', m(q.sub), q.sq.total.toFixed(1));
  if (q.markup) end(`Markup ${ps.markup}%`, m(q.markup));
  if (q.tax) end(`Tax ${ps.tax}%`, m(q.tax));
  end('Total', m(q.total));
  q.payments.forEach(x => end(`${x.name} (${x.pct}%)`, m(x.amount)));
  q.perFt.filter(t => t.n).forEach(t => rows.push(['', '', `${t.name}: ${ftLen(t.ft)} ft, ${m(t.rate)} per ft`, '', '', '', '', '', '', '', '', '', m(t.total)]));
  return rows.map(r => r.map(csvq).join(',')).join('\n');
}

/* ---------- Pricing tab ---------- */
// Laid out like the cabinet editor and Settings: the job's numbers down the left, the work in the middle
// under one row of tabs, and every button down the right.
function renderPricing() {
  const ps = priceSheet(), view = ui.priceView || 'quote', q = priceJob(ps);
  const sheetPick = `<label class="prx-sheet"><span>Price sheet</span><select data-act-change="ps-pick" aria-label="Price sheet">${(() => { const fq = (ui.psFind || '').toLowerCase(), l = [...PRICES].sort((x, y) => String(x.name).localeCompare(String(y.name), undefined, { numeric: true })).filter(p => !fq || p === ps || String(p.name).toLowerCase().includes(fq)); return l.map(p => `<option value="${p.id}"${p.id === ps.id ? ' selected' : ''}>${esc(p.name)}</option>`).join(''); })()}</select></label>${PRICES.length > 5 ? `<input type="search" class="ps-find" value="${esc(ui.psFind || '')}" placeholder="Find a sheet" aria-label="Find a price sheet">` : ''}`;
  const tabs = `<div class="setx-tabs prx-tabs" role="tablist">${[['quote', 'Quote', 'list'], ['edit', 'Edit prices', 'sliders'], ['order', 'Order', 'download'], ...(typeof profitCard === 'function' ? [['profit', 'Profit', 'tag']] : [])].map(([k, l, ic]) => `<button role="tab" data-act="price-view" data-id="${k}" aria-selected="${view === k}">${icon(ic)}${l}</button>`).join('')}</div>`;
  const body = view === 'profit' && typeof profitCard === 'function' ? profitCard(ps, q) : view === 'edit' ? priceEditor(ps) : view === 'order' ? `<div class="prx-order">${buyList()}</div>${exportHTML(false)}` : priceQuote(ps, q);
  const b = (act, ic, l, x = '') => `<button class="btn${x}" data-act="${act}">${icon(ic)}${l}</button>`;
  const acts = `<div class="prx-acts">
    ${b('quote-print', 'print', 'Print or save quote', ' primary')}
    ${b('quote-copy', 'copy', 'Copy quote CSV')}${inHub() ? b('quote-save', 'folder', 'Save quote to Files') : ''}
    <span class="edx-sep"></span><div class="prx-acth">Price sheet</div>
    ${b('ps-new', 'plus', 'New sheet')}${b('ps-dup', 'copy', 'Copy this sheet')}${b('ps-export', 'download', 'Save sheet as file')}
    <label class="btn">${icon('upload')}Open sheet file<input type="file" accept=".json,application/json" data-ps-import hidden></label>
    <span class="ed-gap"></span>${PRICES.length > 1 ? `<button class="btn danger" data-act="ps-del">${icon('trash')}${ui.psConfirm ? 'Click again to delete' : 'Delete this sheet'}</button>` : ''}</div>`;
  $('#tab-pricing').innerHTML = `<div class="prx"><aside class="prx-side">${priceSide(ps, q, view)}</aside>
    <section class="prx-main"><div class="prx-top"><h2>Pricing</h2>${tabs}<div class="prx-r">${sheetPick}${installerPick(ps)}</div></div><div class="prx-body ${view}">${body}</div></section>${acts}</div>`;
}
// The left column: the job total, price per foot by type, the totals with markup, tax and payments, and where to jump.
function priceSide(ps, q, view) {
  const nCab = q.rooms.reduce((a, R) => a + R.cabs.length, 0);
  const tone = { Base: 'amber', Wall: 'blue', Tall: 'violet' };
  const tiles = q.perFt.map(t => `<div class="prx-ft ${tone[t.cat] || 'teal'}"><span>${esc(t.name)}</span><b>${t.n ? money(t.rate) + '<em>/ft</em>' : '–'}</b><small>${t.n ? `${ftLen(t.ft)} ft · ${money(t.total)}` : 'None in this job'}</small></div>`).join('');
  // The percents are edited right here (Ayden 2026-11-18); they save to the price sheet like Edit prices does.
  const pin = (ref, f, v, label) => `<span class="prx-pct">${ctl(ref, f, v ?? 0, 'num', { label })}%</span>`, R = 'psh:' + ps.id, X = i => `pshp:${ps.id}:extras.${i}`;
  const pcts = ps.extras.map((x, i) => ({ x, i })).filter(({ x }) => x.per === 'pct').map(({ x, i }) => { const l = q.jobLines.find(k => k.xi === i);
    return `<tr><td>${esc(x.name)} ${pin(X(i), 'amount', x.amount, x.name + ' percent')}</td><td class="n">${money(l ? l.amount : 0)}</td></tr>`; }).join('');
  const topAmt = q.rooms.reduce((a, Rm) => a + Rm.lines.filter(l => l.top).reduce((b, l) => b + l.amount, 0), 0);
  const topRow = q.rooms.some(Rm => Rm.lines.some(l => l.top)) || S.job.topSq != null ? `<tr class="prx-topsq"><td>Countertops <span class="prx-pct">$${ctl('job', 'topSq', topSqJob(ps), 'num', { label: 'Countertops dollars per square foot for the job', blank: true, ph: topSqRate(ps) })}/sq ft</span></td><td class="n">${money(topAmt)}</td></tr>` : '';
  const tot = `<table class="prx-tot"><tbody>${topRow}${q.jobLines.filter(l => l.xi == null).map(l => `<tr><td>${esc(l.name)}</td><td class="n">${money(l.amount)}</td></tr>`).join('')}${pcts}
    <tr><td>Subtotal</td><td class="n">${money(q.sub)}</td></tr><tr><td>Markup ${pin(R, 'markup', ps.markup, 'Markup percent')}</td><td class="n">${money(q.markup)}</td></tr><tr><td>Tax ${pin(R, 'tax', ps.tax, 'Tax percent')}</td><td class="n">${money(q.tax)}</td></tr>
    <tr class="grand"><td>Total</td><td class="n">${money(q.total)}</td></tr>${(ps.payments || []).map((x, i) => { const p = q.payments.find(y => y.pi === i);
      return `<tr class="pay"><td>${esc(x.name)} ${pin(`pshp:${ps.id}:payments.${i}`, 'pct', x.pct, x.name + ' percent')}</td><td class="n">${money(p ? p.amount : 0)}</td></tr>`; }).join('')}</tbody></table>`;
  const jump = view === 'edit' ? `<nav class="prx-nav"><div class="prx-navh">Jump to</div>${PRICE_SECS.map(([k, l, ic]) => `<a href="#ps-${k}" data-act="prx-jump" data-id="${k}">${icon(ic)}${l}</a>`).join('')}</nav>`
    : view === 'quote' ? `<nav class="prx-nav"><div class="prx-navh">Rooms</div>${q.rooms.map((R, i) => `<a href="#prx-room-${i}" data-act="prx-jump" data-id="room-${i}">${icon('home')}<span>${esc(R.r.name)}</span><b>${money(R.total)}</b></a>`).join('')}<a href="#prx-room-hw" data-act="prx-jump" data-id="room-hw">${icon('tag')}<span>Hardware</span><b>${NF0.format(q.rooms.reduce((a, R) => a + Object.values(R.hw || {}).reduce((b, x) => b + x, 0), 0))} pcs</b></a><a href="#prx-room-paint" data-act="prx-jump" data-id="room-paint">${icon('palette')}<span>Paint</span><b>${sqft(q.sq.total)} sq ft</b></a></nav>` : '';
  return `<div class="prx-grand"><span>Total for ${esc(S.job.name)}</span><b>${money(q.total)}</b><small>${nCab} cabinets · ${sqft(q.sq.total)} sq ft paint</small></div>
    <div class="prx-fts">${tiles}</div>${tot}${jump}`;
}
const topSqRate = ps => { const v = ((ps || {}).topSq || {}).rate; return v !== '' && v != null && isFinite(+v) ? +v : 70; };
// Countertop $/sq ft: a room's own rate, else the job's (Pricing › Quote, left side), else the price sheet's (Ayden 2026-11-19).
const numOr = (v, d) => v !== '' && v != null && isFinite(+v) ? +v : d;
const topSqJob = ps => numOr(S.job.topSq, topSqRate(ps));
const topSqFor = (ps, r) => numOr(r && r.topSq, topSqJob(ps));
const PRICE_SECS = [['lib', 'Library prices', 'tag'], ['sheet', 'Markup and tax', 'tag'], ['install', 'Installers', 'home'], ['cab', 'Cabinets by type', 'box'], ['prod', 'Products', 'stack'], ['add', 'Adders', 'shelf'], ['panel', 'Panels', 'box'], ['doors', 'Doors and fronts', 'door'], ['mats', 'Materials', 'palette'], ['hw', 'Hardware', 'sliders'], ['paint', 'Paint', 'palette'], ['tops', 'Tops and molding', 'ruler'], ['extra', 'Extra charges', 'plus'], ['pay', 'Payment schedule', 'list']];
// Quote's installer pick, down the right with the quote buttons.
function installerPick(ps) {
  const cur = jobInstaller(ps), opt = (v, l) => `<option value="${esc(v)}"${(cur ? cur.id : 'none') === v ? ' selected' : ''}>${esc(l)}</option>`;
  return `<label class="prx-inst"><span>Installer</span><select data-act-change="quote-inst" aria-label="Installer for this job">${INSTALLERS.map(i => opt(i.id, i.name)).join('')}${opt('none', 'No installer')}<optgroup label="──────────"><option value="__add">+ Add installer…</option><option value="__import">Import pricing guide…</option></optgroup></select></label>`;
}
// Scrolls to an installer's row on Edit prices and puts the cursor in its name.
function instFocus(id) { setTimeout(() => { const n = document.querySelector(`[data-obj="inst:${id}"][data-field="name"]`); if (n) { n.scrollIntoView({ block: 'center' }); n.focus(); n.select(); } }, 60); }
// Edit prices › Installers: every installer with their price per foot. Shared by all price sheets.
function installersCard(ps) {
  const cur = jobInstaller(ps), one = INSTALLERS.length < 2;
  const rows = INSTALLERS.map(i => { const R = 'inst:' + i.id, P = 'instp:' + i.id + ':rates';
    const open = ui.instOpen === i.id, nl = (i.items || []).length;
    const list = !open ? '' : `<tr class="inst-list"><td colspan="8"><div class="inst-lb">
      <table class="t"><thead><tr><th>Charge for</th><th>Name on the quote</th><th class="r">Price</th><th></th></tr></thead><tbody>${(i.items || []).map((it, j) => { const L = `instp:${i.id}:items.${j}`;
        return `<tr><td>${ctl(L, 'per', it.per, 'select', { label: 'Charge for', options: INST_COUNTS.map(([v, l, u]) => ({ v, l: `${l}, ${u}` })) })}</td><td>${ctl(L, 'name', it.name || '', 'text', { label: 'Name on the quote' })}</td><td style="width:96px">${ctl(L, 'amount', it.amount ?? 0, 'num', { label: 'Price' })}</td><td><button class="btn sm" data-act="ps-inst-idel" data-id="${esc(i.id)}:${j}" aria-label="Remove">×</button></td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">No price list. Per-foot prices only.</td></tr>'}</tbody></table>
      ${(i.items || []).some(it => INST_EST[it.per]) ? `<div class="note">Estimates, counted from the drawing: ${(i.items || []).filter(it => INST_EST[it.per]).map(it => `<b>${esc(instCount(it.per)[1].replace(' (estimate)', ''))}</b>: ${INST_EST[it.per]}`).join(' ')}</div>` : ''}
      <div class="row-actions"><button class="btn sm" data-act="ps-inst-iadd" data-id="${esc(i.id)}">${icon('plus')}Add a price</button><label class="f inst-min"><span>Minimum per job ($)</span>${ctl(R, 'min', i.min ?? 0, 'num', { label: 'Minimum per job' })}</label></div>
      <label class="f wide"><span>Notes (charges the program can't count)</span><textarea rows="5" data-obj="${esc(R)}" data-field="notes" data-type="text" aria-label="${esc(i.name)} notes">${esc(i.notes || '')}</textarea></label></div></td></tr>`;
    return `<tr><td>${ctl(R, 'name', i.name, 'text', { label: 'Installer name' })}</td>${INST_FT.map(([k, l]) => `<td style="width:84px">${ctl(P, k, (i.rates || {})[k] ?? 0, 'num', { label: `${i.name} ${l} $/ft` })}</td>`).join('')}
      <td style="width:84px">${ctl(R, 'pct', i.pct ?? '', 'num', { label: `${i.name} percent of the job`, blank: true, ph: '' })}</td>
      <td><button class="btn sm" data-act="ps-inst-open" data-id="${esc(i.id)}" aria-expanded="${open}">${icon('chevr', open ? 'rot90' : '')}${nl ? `Price list (${nl})` : 'Price list'}</button></td>
      <td>${i === defInstaller() ? '<span class="chip">Default</span>' : `<button class="btn sm" data-act="ps-inst-def" data-id="${esc(i.id)}">Make default</button>`}</td>
      <td>${one ? '' : `<button class="btn sm${ui.instConfirm === i.id ? ' danger' : ''}" data-act="ps-inst-del" data-id="${esc(i.id)}" aria-label="Delete ${esc(i.name)}">${ui.instConfirm === i.id ? 'Click again' : '×'}</button>`}</td></tr>${list}`; }).join('');
  return `<div class="psec box prx-sec wide" id="ps-install">${secHead('home', 'Installers', 'blue')}<div class="prx-h"><span class="note">Each installer's price per foot of cabinet width, and a price list for what the job has (boxes, doors, panels…). Shared by every price sheet. ${esc(S.job.name)} uses ${cur ? esc(cur.name) : 'no installer'}; pick on its Quote.</span><button class="btn sm" data-act="ps-inst-add">${icon('plus')}Add installer</button><button class="btn sm" data-act="ai-open" data-id="inst" title="Claude reads an installer's pricing guide (picture, PDF, link or text) and adds them">${icon('upload')}Import pricing guide</button></div>
    <div class="tscroll"><table class="t"><thead><tr><th>Installer</th>${INST_FT.map(([k]) => `<th class="r">${k} $/ft</th>`).join('')}<th class="r" title="Installation as a percent of each room's price, instead of per foot and the price list">% of job</th><th></th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="note">A job that never picked an installer uses the default. Fill in % of job to charge installation as that percent of each room's price instead of per foot and the price list (the minimum still applies). Each room can have its own installer, picked in its header on the Quote.</div></div>`;
}
function toggleBtn(act, on, label, id) { return `<button class="btn toggle${on ? ' on' : ''}" data-act="${act}"${id ? ` data-id="${id}"` : ''} aria-pressed="${!!on}">${icon(on ? 'check' : 'plus')}${label}</button>`; }
function priceQuote(ps, q = priceJob(ps)) {
  // Paint is inside each cabinet's price, so every room's total is what to quote for that room.
  const paintNote = R => R.sq.total ? `<span class="note">Includes ${sqft(R.sq.total)} sq ft paint${+paintOf(ps).rate ? `, ${money(R.cabs.reduce((a, k) => a + k.paint, 0))}` : ''}</span>` : '';
  // A room can fold to one line (name and total) so every room's price shows at a glance. Folding only hides the table.
  const room = (R, i) => { const shut = roomShut(R.r); return `<div class="psec box prx-room${shut ? ' shut' : ''}" id="prx-room-${i}"><button class="sechead teal prx-fold" data-act="prx-fold" data-id="${esc(R.r.id)}" aria-expanded="${!shut}" title="${shut ? 'Show' : 'Hide'} this room's cabinets">${icon('chevr', shut ? '' : 'rot90')}<span>${esc(R.r.name)}</span>${shut ? `<span class="prx-n">${R.cabs.length} ${R.cabs.length === 1 ? 'cabinet' : 'cabinets'}</span>` : ''}</button><div class="prx-roomh">${shut ? '' : paintNote(R)}${!shut && R.lines.some(l => l.top) ? `<span class="prx-pct prx-roomtop">Tops $${ctl('room:' + R.r.id, 'topSq', R.r.topSq ?? '', 'num', { label: R.r.name + ' countertops dollars per square foot', blank: true, ph: topSqJob(ps) })}/sq ft</span>` : ''}${INSTALLERS.length ? `<span class="prx-pct prx-roominst">Installer ${ctl('room:' + R.r.id, 'installer', R.r.installer || '', 'select', { label: R.r.name + ' installer', options: [{ v: '', l: `Same as the job${jobInstaller(ps) ? ` (${jobInstaller(ps).name})` : ' (none)'}` }, ...INSTALLERS.map(i => ({ v: i.id, l: i.name })), { v: 'none', l: 'No installer' }] })}</span>` : ''}<b class="money">${money(R.total)}</b></div>${shut ? '</div>' : `<div class="tscroll"><table class="t quote">
    <thead><tr><th>Cabinet</th><th>Size</th><th class="r">Cabinet</th>${ps.doors.on ? '<th class="r">Doors and fronts</th>' : ''}<th class="r">Drawers, shelves, inserts</th><th class="r">Panels, fillers</th>${ps.hardware.on ? '<th class="r">Hardware</th>' : ''}${ps.materials.on ? '<th class="r">Materials</th>' : ''}<th class="r">Paint sq ft</th><th class="r">Total</th></tr></thead>
    <tbody>${R.cabs.map(k => `<tr><td><span class="chip cab">${k.label}</span> ${esc(k.c.name)}</td><td class="n">${fmtLen(k.c.w)} × ${fmtLen(k.c.h)} × ${fmtLen(k.c.d)}</td><td class="n">${money(k.box)}</td>${ps.doors.on ? `<td class="n">${money(k.doors)}</td>` : ''}<td class="n">${money(k.extras)}</td><td class="n">${money(k.ends)}</td>${ps.hardware.on ? `<td class="n">${money(k.hardware)}</td>` : ''}${ps.materials.on ? `<td class="n">${money(k.materials)}</td>` : ''}<td class="n">${sqft(k.sq.total)}</td><td class="n"><b>${money(k.total)}</b></td></tr>`).join('') || (R.lines.some(l => l.own) ? '' : '<tr><td colspan="11" class="muted">No cabinets yet</td></tr>')}
    ${R.lines.map(l => `<tr class="extra"><td colspan="2">${esc(l.name)}</td><td colspan="${4 + ps.doors.on + ps.hardware.on + ps.materials.on}"></td><td class="n">${money(l.amount)}</td></tr>`).join('')}</tbody></table></div></div>`}`; };
  const anyOpen = q.rooms.some(R => !roomShut(R.r));
  const fold = q.rooms.length > 1 ? `<button class="btn" data-act="prx-fold-all" data-id="${anyOpen ? 'shut' : 'open'}">${icon('chevr', anyOpen ? '' : 'rot90')}${anyOpen ? 'Collapse all rooms' : 'Expand all rooms'}</button>` : '';
  return `<div class="prx-qh"><div class="note help">Per foot is each type's cabinet total over its width in feet. Tops, molding, installation and extra charges are not in it.</div>${fold}</div>${typeof whatIfCard === 'function' ? whatIfCard(ps, q) : ''}${q.rooms.map(room).join('')}${typeof bidQuoteCard === 'function' ? bidQuoteCard() : ''}${typeof jobLinesCard === 'function' ? jobLinesCard() : ''}${hardwareCard(ps, q)}${paintCard(ps, q)}`;
}
// Which rooms are folded on Pricing › Quote, per job, kept on this computer. Only the view; prices are untouched.
const PRX_FOLD_KEY = () => KEY + '.prxfold';
function prxFold() { if (!ui.prxFold) { try { ui.prxFold = JSON.parse(localStorage.getItem(PRX_FOLD_KEY()) || '{}'); } catch (_) { ui.prxFold = {}; } } return ui.prxFold; }
const roomFoldKey = r => (S.job.id || S.job.name || '') + '/' + r.id;
function roomShut(r) { return !!prxFold()[roomFoldKey(r)]; }
function setRoomShut(r, on) { const f = prxFold(), k = roomFoldKey(r); if (on) f[k] = 1; else delete f[k]; try { localStorage.setItem(PRX_FOLD_KEY(), JSON.stringify(f)); } catch (_) {} }
// Paint total for the job, with switches for which surfaces count.
// 0.59.4 (Ayden 2026-11-19): how many hinges, guides and every other piece of hardware, per room and for the whole job,
// with the sheet's price each. Grouped like the hardware library (hinges, drawer guides, pulls, the rest).
function hardwareCard(ps, q) {
  const tot = {}; q.rooms.forEach(R => Object.entries(R.hw || {}).forEach(([n, x]) => { tot[n] = (tot[n] || 0) + x; }));
  const names = Object.keys(tot); if (!names.length) return '';
  const kindOf = n => { const h = S.hardware.find(x => n === x.name || n.startsWith(x.name + ' ') || n === x.bomExtra); return h ? h.kind : ''; };
  const ORDER = [['hinge', 'Hinges and plates'], ['slide', 'Drawer guides and locks'], ['pull', 'Pulls and knobs'], ['', 'Other hardware']];
  const grp = n => { const k = kindOf(n); return ORDER.findIndex(([g]) => g === k) >= 0 ? k : ''; };
  const many = q.rooms.length > 1, each = n => +((ps.hardware || {}).items || {})[n] || 0, on = ps.hardware && ps.hardware.on;
  const cnt = v => v ? NF0.format(Math.round(v * 100) / 100) : '–';
  const head = `<tr><th>Hardware</th>${many ? q.rooms.map(R => `<th class="r">${esc(R.r.name)}</th>`).join('') : ''}<th class="r">Job total</th>${on ? '<th class="r">Each</th><th class="r">Cost</th>' : ''}</tr>`;
  const body = ORDER.map(([g, label]) => { const ns = names.filter(n => grp(n) === g).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); if (!ns.length) return '';
    // A group's heading has its cost only: hinges and plates (or guides and locks) added together is not a useful count.
    return `<tr class="prx-hwg"><td><b>${label}</b></td>${many ? q.rooms.map(() => '<td></td>').join('') : ''}<td></td>${on ? `<td></td><td class="n"><b>${money(ns.reduce((a, n) => a + tot[n] * each(n), 0))}</b></td>` : ''}</tr>`
      + ns.map(n => `<tr><td>${esc(n)}</td>${many ? q.rooms.map(R => `<td class="n">${cnt((R.hw || {})[n])}</td>`).join('') : ''}<td class="n">${cnt(tot[n])}</td>${on ? `<td class="n">${money(each(n))}</td><td class="n">${money(tot[n] * each(n))}</td>` : ''}</tr>`).join(''); }).join('');
  return `<div class="psec box hwcard" id="prx-room-hw">${secHead('tag', 'Hardware', 'teal')}<div><div class="tscroll"><table class="t">
    <thead>${head}</thead><tbody>${body}</tbody></table></div>
    <div class="note">Counted from every cabinet's hardware list. Cost is before the hardware markup; prices each are set in Edit prices › Hardware.</div></div></div>`;
}
function paintCard(ps, q) {
  const po = paintOf(ps);
  return `<div class="psec box paintcard" id="prx-room-paint">${secHead('palette', `Paint · ${sqft(q.sq.total)} sq ft`, 'violet')}<div>
    <div class="row-actions">${PAINT_PARTS.map(([k, l]) => toggleBtn('ps-paint', po[k], l, k)).join('')}${toggleBtn('ps-paint', po.bothSides, 'Both sides of doors and fronts', 'bothSides')}</div>
    <div class="tscroll"><table class="t"><thead><tr><th>Surface</th>${q.rooms.length > 1 ? q.rooms.map(R => `<th class="r">${esc(R.r.name)}</th>`).join('') : ''}<th class="r">Sq ft</th></tr></thead><tbody>
    ${PAINT_PARTS.filter(([k]) => po[k]).map(([k, l]) => `<tr><td>${l}</td>${q.rooms.length > 1 ? q.rooms.map(R => `<td class="n">${sqft(R.sq[k])}</td>`).join('') : ''}<td class="n">${sqft(q.sq[k])}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No surfaces counted</td></tr>'}
    <tr class="grand"><td>Total</td>${q.rooms.length > 1 ? q.rooms.map(R => `<td class="n">${sqft(R.sq.total)}</td>`).join('') : ''}<td class="n">${sqft(q.sq.total)}</td></tr>
    ${+po.rate ? `<tr><td>Paint price, in the room totals</td>${q.rooms.length > 1 ? q.rooms.map(R => `<td class="n">${money(R.cabs.reduce((a, k) => a + k.paint, 0))}</td>`).join('') : ''}<td class="n">${money(q.rooms.reduce((a, R) => a + R.cabs.reduce((b, k) => b + k.paint, 0), 0))}</td></tr>` : ''}
    ${q.sq.eb ? `<tr><td>Prefinished, edgebanding only</td>${q.rooms.length > 1 ? q.rooms.map(R => `<td class="n">${sqft(R.sq.eb)}</td>`).join('') : ''}<td class="n">${sqft(q.sq.eb)}</td></tr>${+po.ebRate ? `<tr><td>Edgebanding price, in the room totals</td>${q.rooms.length > 1 ? q.rooms.map(R => `<td class="n">${money(R.cabs.reduce((a, k) => a + (k.banding || 0), 0))}</td>`).join('') : ''}<td class="n">${money(q.rooms.reduce((a, R) => a + R.cabs.reduce((b, k) => b + (k.banding || 0), 0), 0))}</td></tr>` : ''}` : ''}</tbody></table></div>
    <div class="note">Doors and fronts count their full size${po.bothSides ? ' on both faces' : ', one face'}. Panels, fillers and toe skins count their outside face. Finished interiors count the inside of the box and both faces of shelves. Surfaces cut from a prefinished material (set in Libraries › Materials) are not painted; they count as edgebanding at ${money(+po.ebRate || 0)} per sq ft.${+po.rate ? ` Priced at ${money(+po.rate)} per sq ft, already inside each cabinet's and each room's price.` : ' Set a price per sq ft on the price sheet to put paint into each room\'s price.'}</div></div></div>`;
}
function priceEditor(ps) {
  const R = 'psh:' + ps.id, P = path => 'pshp:' + ps.id + ':' + path, num = (ref, k, v, x = {}) => ctl(ref, k, v ?? '', 'num', { label: k, ...x });
  const used = {}; allCabs().forEach(c => inRoomOf(c, () => Object.keys(buildParts(c).bom).forEach(k => { used[k] = 1; })));
  const priced = o => o && (o.own || o.base !== undefined || o.perFt !== undefined), showProd = !!ui.psProd;
  // Folded, the card still lists every product that has a price of its own; Show all opens the whole library.
  const prods = S.library.filter(l => l.cat !== 'Shape' && (showProd || priced(ps.products[l.id]))).sort((a, b) => !!(ps.products[b.id] || {}).own - !!(ps.products[a.id] || {}).own);
  const hwNames = [...new Set([...Object.keys(used), ...Object.keys(ps.hardware.items)])].sort();
  return `${jobPriceCard(ps)}<div class="pricegrid">
  <div class="psec box prx-sec" id="ps-sheet">${secHead('tag', 'Markup and tax', 'teal')}<div class="prx-h"></div><div class="cardbody">
    ${fld('Name', R, 'name', ps.name, 'text', { wide: true })}${fld('Markup %', R, 'markup', ps.markup, 'num')}${fld('Tax %', R, 'tax', ps.tax, 'num')}
    <div class="note">Markup on top of each group's cost, inside the cabinet prices:</div>${GROUP_MARKUPS.map(([k, l]) => fld(l + ' markup %', P('groupMarkup'), k, (ps.groupMarkup || {})[k] ?? 0, 'num')).join('')}</div></div>
  ${installersCard(ps)}
  <div class="psec box prx-sec" id="ps-cab">${secHead('box', 'Cabinets by type', 'amber')}<div class="prx-h"><span class="note">Base price plus a price per foot of width</span></div><div class="tscroll"><table class="t"><thead><tr><th>Type</th><th class="r">Base price</th><th class="r">Per foot</th></tr></thead><tbody>
    ${['Base', 'Wall', 'Tall'].map(cat => `<tr><td><span class="catpill cat-${cat}">${cat}</span></td><td style="width:110px">${num(P('cab.' + cat), 'base', ps.cab[cat].base)}</td><td style="width:110px">${num(P('cab.' + cat), 'perFt', ps.cab[cat].perFt)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="psec box prx-sec wide" id="ps-prod">${secHead('stack', 'Products', 'violet')}<div class="prx-h"><span class="note">Give any library product its own price. Blank uses its type. Tick Own price for items like floating shelves.</span><button class="btn sm" data-act="ps-prod">${showProd ? 'Show priced only' : `Show all ${S.library.filter(l => l.cat !== 'Shape').length}`}</button></div>${prods.length ? `<div class="tscroll"><table class="t"><thead><tr><th>Product</th><th>Type</th><th title="Priced only by this row: not a cabinet, not in the cabinet count, no installation, doors, materials or hardware">Own price</th><th class="r">Base price</th><th class="r">Per foot</th></tr></thead><tbody>
    ${prods.map(l => { const o = ps.products[l.id] || {}, ph = k => String(o.own ? 0 : ps.cab[l.cat][k]); return `<tr${o.own ? ' class="own"' : ''}><td>${esc(l.name)}</td><td><span class="catpill cat-${l.cat}">${l.cat}</span></td><td style="width:90px">${ctl(P('products.' + l.id), 'own', !!o.own, 'bool', { label: l.name + ' has its own price' })}</td><td style="width:110px">${num(P('products.' + l.id), 'base', o.base, { blank: true, ph: ph('base') })}</td><td style="width:110px">${num(P('products.' + l.id), 'perFt', o.perFt, { blank: true, ph: ph('perFt') })}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="cardbody"><div class="note">No product has its own price yet. Show all to set one.</div></div>'}</div>
  <div class="psec box prx-sec" id="ps-add">${secHead('shelf', 'Adders', 'blue')}<div class="prx-h"></div><div class="cardbody">${PRICE_ADDERS.map(([k, l]) => fld(l, P('adders'), k, ps.adders[k], 'num')).join('')}
    <div class="prx-dbx"><div class="eyebrow">Drawer box, each, by drawer material</div><table class="t"><tbody>${S.matTemplates.drawer.map(t => `<tr><td>${esc(t.name)}</td><td style="width:110px">${num(P('drawerBox'), t.id, (ps.drawerBox || {})[t.id], { blank: true, ph: String(dbxDefault(t)), label: t.name + ' box price' })}</td></tr>`).join('')}</tbody></table>
    <div class="note">Box and labor for each drawer (slides are priced as hardware). Blank uses the shop price for that kind of box: melamine $28, Baltic birch or ply $70, solid wood $110.</div></div>
    <div class="note">Each insert has its own price in Libraries › Inserts.</div></div></div>
  <div class="psec box prx-sec" id="ps-panel">${secHead('box', 'Panels', 'teal')}<div class="prx-h"><span class="note">Each panel, by height</span></div><div class="cardbody">${PANEL_CATS.map(([k, l]) => fld(l, P('panelAdd'), k, (ps.panelAdd || {})[k] ?? 0, 'num')).join('')}
    <div class="note">Each flat slab end panel and loose panel is its material by the sq ft plus this. An end panel in a framed door style (Settings › Cabinet and panels) is priced as that door instead.</div></div></div>
  <div class="psec box prx-sec" id="ps-doors">${secHead('door', 'Doors and fronts', 'amber')}<div class="prx-h">${toggleBtn('ps-doors', ps.doors.on, ps.doors.on ? 'Added to cabinets' : 'Not added')}</div><div class="cardbody">
    <div class="note">Each door style's price per sq ft and minimum are set in the door designer (Libraries › Doors). Change them for this job only under Library prices on this job.</div></div></div>
  <div class="psec box prx-sec" id="ps-mats">${secHead('palette', 'Materials', 'violet')}<div class="prx-h">${toggleBtn('ps-mats', ps.materials.on, ps.materials.on ? 'Added to cabinets' : 'Not added')}</div><div class="cardbody">
    <div class="note">Each material's price per sheet is set in Libraries › Materials. Each cabinet pays for the part of a sheet its parts use, plus waste.</div>
    ${fld('Waste %', P('materials'), 'waste', ps.materials.waste, 'num')}<div class="note">Edge banding is priced by the roll in Libraries › Edgebanding.</div></div></div>
  <div class="psec box prx-sec" id="ps-hw">${secHead('sliders', 'Hardware', 'amber')}<div class="prx-h">${toggleBtn('ps-hw', ps.hardware.on, ps.hardware.on ? 'Added to cabinets' : 'Not added')}</div><div class="cardbody">
    <div class="note">Price each, for every hardware line on the cabinets' lists.</div>${hwNames.map(n => fld(esc(n), P('hardware.items'), n, ps.hardware.items[n] ?? 0, 'num')).join('')}</div></div>
  <div class="psec box prx-sec" id="ps-paint">${secHead('palette', 'Paint', 'blue')}<div class="prx-h"></div><div class="cardbody">
    <div class="note">Price per square foot of painted surface. Leave it at 0 to only show the square footage. Pick which surfaces count on the quote.</div>${fld('Paint ($/sq ft)', P('paint'), 'rate', paintOf(ps).rate, 'num')}
    <div class="note">Parts cut from a prefinished material (melamine, prefinished plywood) are not painted. They are charged this lower rate instead. Each material says which it is in Libraries › Materials.</div>${fld('Edgebanding, prefinished ($/sq ft)', P('paint'), 'ebRate', paintOf(ps).ebRate, 'num')}</div></div>
  <div class="psec box prx-sec" id="ps-tops">${secHead('ruler', 'Tops and molding', 'violet')}<div class="prx-h"></div><div class="cardbody">
    ${fld('Countertops ($/sq ft)', P('topSq'), 'rate', topSqRate(ps), 'num')}<div class="note">One price for every countertop style, by the square foot of top.</div>${S.moldings.map(m => fld(esc(m.name) + ' ($/ft)', P('molds'), m.id, ps.molds[m.id] ?? 0, 'num')).join('')}</div></div>
  <div class="psec box prx-sec wide" id="ps-extra">${secHead('plus', 'Extra charges', 'teal')}<div class="prx-h"><button class="btn sm" data-act="ps-x-add">${icon('plus')}Add charge</button></div><div class="cardbody">
    ${ps.extras.map((x, i) => `<div class="xrow">${ctl(P('extras.' + i), 'name', x.name, 'text', { label: 'Charge name' })}${ctl(P('extras.' + i), 'amount', x.amount, 'num', { label: 'Amount' })}${ctl(P('extras.' + i), 'per', x.per, 'select', { label: 'Per', options: [{ v: 'job', l: 'Per job' }, { v: 'room', l: 'Per room' }, { v: 'cabinet', l: 'Per cabinet' }, { v: 'pct', l: '% of the job' }] })}<button class="btn sm danger" data-act="ps-x-del" data-id="${i}" aria-label="Remove charge">${icon('trash')}</button></div>`).join('') || '<div class="note">None</div>'}</div></div>
  <div class="psec box prx-sec wide" id="ps-pay">${secHead('list', 'Payment schedule', 'rose')}<div class="prx-h">${(() => { const t = (ps.payments || []).reduce((a, x) => a + (+x.pct || 0), 0); return `<span class="note"${t !== 100 ? ' style="color:var(--danger,#c62828)"' : ''}>Adds up to ${t}%</span>`; })()}<button class="btn sm" data-act="ps-pay-add">${icon('plus')}Add payment</button></div><div class="cardbody">
    ${(ps.payments || []).map((x, i) => `<div class="xrow pay">${ctl(P('payments.' + i), 'name', x.name, 'text', { label: 'Payment' })}${ctl(P('payments.' + i), 'pct', x.pct, 'num', { label: 'Percent of total' })}<button class="btn sm danger" data-act="ps-pay-del" data-id="${i}" aria-label="Remove payment">${icon('trash')}</button></div>`).join('') || '<div class="note">None</div>'}</div></div>
  </div>`;
}
// What this job uses from the door, insert and material libraries, at the library's price, with a box to change it for this job.
function libUsage(ps) {
  const doors = {}, ins = {}, mats = {}, add = (o, id, sq, n = 1) => { const u = o[id] = o[id] || { n: 0, sq: 0 }; u.n += n; u.sq += sq; };
  S.rooms.forEach(r => withRoom(r, () => {
    S.cabinets.forEach(c => {
      try { computeFronts(c).forEach(f => { if (f.type !== 'open') add(doors, frontStyle(c, f).ds.id, (f.x1 - f.x0) * (f.z1 - f.z0) / 144); }); } catch (_) {}
      const b = buildParts(c);
      (b.buyPanels || []).forEach(pt => add(doors, pt.ds.id, pt.L * pt.W * pt.qty / 144, pt.qty));
      b.parts.forEach(pt => { if (pt.cabId !== c.id) return; if (pt.kind === 'applied') add(doors, panelDoor(c).id, pt.L * pt.W * pt.qty / 144, pt.qty); if (pt.mat && !(ps.doors.on && (FRONT_KINDS.includes(pt.kind) || pt.kind === 'applied'))) add(mats, pt.mat, pt.L * pt.W * pt.qty / 144, pt.qty); });
      (c.inserts || []).forEach(it => add(ins, insertType(it.type).id, 0));
    });
    (S.shapes || []).forEach(s => { const bx = shapeBox(s.pts || []); const sm = shapeMatId(s); if (sm) add(mats, sm, bx.w * bx.h / 144); });
  }));
  return { doors, ins, mats };
}
function jobPriceCard(ps) {
  ensureLibPrices(ps);
  const u = libUsage(ps), O = g => id => 'pov:' + g + ':' + id, ov = (ref, k, v, ph, label) => ctl(ref, k, v ?? '', 'num', { blank: true, ph: String(ph), label });
  const lib = tab => `<button class="linkbtn" data-act="tab" data-id="${tab}">Edit library</button>`;
  const rows = [];
  const dIds = Object.keys(u.doors).filter(id => S.doorStyles.some(d => d.id === id));
  if (dIds.length) rows.push(`<tr><td colspan="5" class="grouprow"><b>Door styles (doors, fronts and applied panels), $/sq ft</b> ${lib('doors')}</td></tr>`, ...dIds.map(id => { const d = doorStyle(id), x = u.doors[id]; return `<tr><td>${esc(d.name)}${d.source === 'buyout' ? ' <span class="muted">buyout</span>' : ''}</td><td class="n">${x.n} · ${sqft(x.sq)} sq ft</td><td class="n">${money(+d.rate || 0)}</td><td style="width:120px">${ov(O('door')(id), 'rate', jobOver('door', id).rate, +d.rate || 0, d.name + ' price for this job')}</td><td class="n">${ps.doors.on ? money(x.sq * doorRate(d)) : '<span class="muted">Not added</span>'}</td></tr>`; }));
  const iIds = Object.keys(u.ins);
  if (iIds.length) rows.push(`<tr><td colspan="5" class="grouprow"><b>Inserts, each</b> ${lib('inserts')}</td></tr>`, ...iIds.map(id => { const t = insertType(id), l = insLib(id), o = jobOver('ins', id), per = t.fields.includes('n'); return `<tr><td>${esc(t.name)}</td><td class="n">${u.ins[id].n}</td><td class="n">${money(+l.each || 0)}${per && +l.per ? ` + ${money(+l.per)} per piece` : ''}</td><td style="width:120px">${ov(O('ins')(id), 'each', o.each, +l.each || 0, t.name + ' price for this job')}${per ? ov(O('ins')(id), 'per', o.per, +l.per || 0, t.name + ' per piece for this job') : ''}</td><td class="n">${money(allCabs().reduce((a, c) => a + (c.inserts || []).filter(it => insertType(it.type).id === id).reduce((b, it) => b + insertPrice(it), 0), 0))}</td></tr>`; }));
  const mIds = Object.keys(u.mats).filter(id => mat(id));
  if (mIds.length) rows.push(`<tr><td colspan="5" class="grouprow"><b>Materials, $/sheet</b> ${lib('materials')}</td></tr>`, ...mIds.map(id => { const m = mat(id), x = u.mats[id]; return `<tr><td>${swatch(m, 16)} ${esc(m.name)}</td><td class="n">${x.n} parts · ${sqft(x.sq)} sq ft</td><td class="n">${money(+m.cost || 0)}</td><td style="width:120px">${ov(O('mat')(id), 'cost', jobOver('mat', id).cost, +m.cost || 0, m.name + ' price for this job')}</td><td class="n">${ps.materials.on ? money(x.sq * 144 * matSqIn(m, ps)) : '<span class="muted">Not added</span>'}</td></tr>`; }));
  const n = ['door', 'mat', 'ins'].reduce((a, g) => a + Object.values((S.job.priceOver || {})[g] || {}).filter(o => Object.values(o).some(v => v !== '' && v != null)).length, 0);
  return `<div class="psec box prx-sec wide" id="ps-lib">${secHead('tag', 'Library prices on this job', 'green')}<div class="prx-h"><span class="note">${n ? `${n} changed for ${esc(S.job.name)} only` : 'Blank uses the library price'}</span>${n ? '<button class="btn sm" data-act="pov-clear">Use library prices</button>' : ''}</div>
    <div class="tscroll"><table class="t"><thead><tr><th>Item</th><th class="r">Used</th><th class="r">Library</th><th>This job</th><th class="r">Comes to</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="5" class="muted">Nothing from the libraries in this job yet</td></tr>'}</tbody></table></div></div>`;
}
// Resolves a price sheet ref: psh:<id> is the sheet, pshp:<id>:<a.b.c> an object inside it (made if missing).
function priceRef(ref) {
  const [k, id, path] = ref.split(':');
  // inst:<id> is an installer, instp:<id>:rates its prices.
  if (k === 'inst' || k === 'instp') { const i = INSTALLERS.find(x => x.id === id); if (!i) return null; return k === 'inst' ? i : path.split('.').reduce((o, key) => o && (o[key] = o[key] || {}), i); }
  const ps = PRICES.find(p => p.id === id); if (!ps) return null;
  if (k === 'psh') return ps;
  return path.split('.').reduce((o, key) => o && (o[key] = o[key] || {}), ps);
}
function priceAction(a, id) {
  const ps = priceSheet();
  switch (a) {
    case 'price-view': ui.priceView = id; break;
    case 'prx-fold': { const r = S.rooms.find(x => x.id === id); if (r) setRoomShut(r, !roomShut(r)); renderPricing(); return; }
    case 'prx-fold-all': S.rooms.forEach(r => setRoomShut(r, id === 'shut')); renderPricing(); return;
    case 'prx-jump': { if (id.startsWith('room-') && id !== 'room-paint' && id !== 'room-hw') { const R = S.rooms[+id.slice(5)]; if (R && roomShut(R)) { setRoomShut(R, false); renderPricing(); } } const el = document.getElementById((id.startsWith('room-') ? 'prx-' : 'ps-') + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    case 'ps-new': { const n = defaultPriceSheet('New price sheet'); PRICES.push(n); S.job.priceSheet = n.id; save(); ui.priceView = 'edit'; break; }
    case 'ps-dup': { const n = { ...clone(ps), id: uid('ps'), name: ps.name + ' copy' }; PRICES.push(n); S.job.priceSheet = n.id; save(); break; }
    case 'ps-del': if (!ui.psConfirm) { ui.psConfirm = true; renderPricing(); return; } ui.psConfirm = false; PRICES = PRICES.filter(p => p !== ps); S.job.priceSheet = PRICES[0].id; save(); break;
    case 'ps-doors': ps.doors.on = !ps.doors.on; break;
    case 'ps-mats': ps.materials.on = !ps.materials.on; break;
    case 'ps-hw': ps.hardware.on = !ps.hardware.on; break;
    case 'ps-prod': ui.psProd = !ui.psProd; renderPricing(); return;
    case 'ps-paint': { const po = paintOf(ps); po[id] = !po[id]; break; }
    case 'ps-export': saveFile(new Blob([JSON.stringify({ cabinetDesignerPriceSheet: 1, sheet: ps }, null, 2)], { type: 'application/json' }), `${fileSafe(ps.name)} price sheet.json`, 'Cabinet Designer/Price sheets'); return;
    case 'quote-print': showQuoteSheet(); return;
    case 'ps-inst-open': ui.instOpen = ui.instOpen === id ? null : id; renderPricing(); return;
    case 'ps-inst-iadd': { const i = INSTALLERS.find(x => x.id === id); if (i) (i.items = i.items || []).push({ per: 'base', amount: 0 }); break; }
    case 'ps-inst-idel': { const [iid, j] = id.split(':'), i = INSTALLERS.find(x => x.id === iid); if (i && i.items) i.items.splice(+j, 1); break; }
    case 'ps-inst-add': { const n = blankInstaller('New installer'); INSTALLERS.push(n); ui.instConfirm = null; savePrices(); renderPricing(); instFocus(n.id); return; }
    // The default is what every job with no pick uses, so sheets stop pointing at the installer their old prices went to.
    case 'ps-inst-def': INSTALLERS.forEach(i => { if (i.id === id) i.def = true; else delete i.def; }); PRICES.forEach(p => { delete p.instBy; }); ui.instConfirm = null; break;
    case 'ps-inst-del': {
      if (INSTALLERS.length < 2) return;
      if (ui.instConfirm !== id) { ui.instConfirm = id; renderPricing(); return; }
      ui.instConfirm = null; const was = INSTALLERS.find(i => i.id === id); INSTALLERS = INSTALLERS.filter(i => i.id !== id);
      if (was && was.def) INSTALLERS[0].def = true;
      PRICES.forEach(p => { if (p.instBy === id) delete p.instBy; });
      if (S.job.installer === id) mutate(() => { delete S.job.installer; });
      flash(`Deleted ${was ? was.name : 'installer'}`); break;
    }
    case 'qs-print': window.print(); return;
    case 'qs-save': saveFile(new Blob([quoteFile(ps)], { type: 'text/html' }), `${fileSafe(S.job.name) || 'job'} quote.html`, 'Cabinet Designer'); return;
    case 'qs-close': closeQuoteSheet(); return;
    case 'qs-detail': ui.qsDetail = !ui.qsDetail; showQuoteSheet(); return;
    case 'qs-paint': ui.qsPaint = ui.qsPaint === false; showQuoteSheet(); return;
    case 'pov-clear': mutate(() => { delete S.job.priceOver; }); flash('This job uses the library prices again'); return;
    case 'ps-x-add': ps.extras.push({ name: 'New charge', amount: 0, per: 'job' }); break;
    case 'ps-x-del': ps.extras.splice(+id, 1); break;
    case 'ps-pay-add': (ps.payments = ps.payments || []).push({ name: 'Payment', pct: 0 }); break;
    case 'ps-pay-del': (ps.payments || []).splice(+id, 1); break;
    case 'quote-copy': { const t = quoteCSV(ps); try { navigator.clipboard.writeText(t).then(() => flash('Quote copied'), () => flash('Could not copy')); } catch (_) { flash('Could not copy'); } return; }
    case 'quote-save': hubSaveOver(new File([quoteCSV(ps)], `${S.job.name.replace(/[^\w -]/g, '') || 'job'} quote.csv`), 'Cabinet Designer').then(() => flash('Saved to Files › Cabinet Designer'), e => flash('Could not save: ' + e.message)); return;
  }
  if (a !== 'price-view' && a !== 'ps-del') ui.psConfirm = false;
  savePrices(); renderPricing();
}

/* ---------- Saving sheets and quotes as files ---------- */
const fileSafe = n => String(n || '').replace(/[^\w -]/g, '').trim();
// Saves to Files in the hub, or downloads outside it.
function saveFile(blob, name, folder) {
  if (inHub()) return hubSaveOver(new File([blob], name, { type: blob.type }), folder).then(() => flash(`Saved to Files › ${folder.replace('/', ' › ')}`), e => flash('Could not save: ' + e.message));
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000); flash('Downloaded ' + name);
}
// Opens a price sheet file as a new sheet, so it never overwrites one you already have.
function importPriceSheet(file) {
  file.text().then(t => {
    const d = JSON.parse(t), sh = d && (d.sheet || d);
    if (!sh || typeof sh !== 'object' || !sh.cab || !sh.doors) throw new Error('not a Cabinet Designer price sheet');
    const base = defaultPriceSheet(), n = { ...base, ...sh, id: uid('ps'), name: String(sh.name || 'Price sheet') + (PRICES.some(p => p.name === sh.name) ? ' (opened)' : '') };
    ['cab', 'adders', 'doors', 'materials', 'hardware', 'paint'].forEach(k => { n[k] = { ...base[k], ...(sh[k] || {}) }; });
    if (!sh.mzk) { delete n.mzk; ['groupMarkup', 'install', 'payments'].forEach(k => { if (!(k in sh)) delete n[k]; }); n.extras = sh.extras || []; ensureMzk(n); }
    // A sheet file from before installers: its install prices go to the installer that has them (or a new one).
    if (n.instBy && !INSTALLERS.some(i => i.id === n.instBy)) delete n.instBy;
    takeInstall(n);
    PRICES.push(n); S.job.priceSheet = n.id; save(); savePrices(); renderPricing(); flash(`Opened ${n.name}`);
  }).catch(e => flash('Could not open that file: ' + e.message));
}

/* ---------- Printable quote ---------- */
// Black on white, letter size. The same page is printed, and saved as a file you can open and print later.
const QUOTE_CSS = `
.qpage{background:#fff;color:#000;font:10.5pt/1.35 "Helvetica Neue",Arial,sans-serif;width:8.5in;max-width:100%;margin:0 auto;padding:.5in;box-sizing:border-box}
.qpage *{color:#000}
.qp-head{display:flex;justify-content:space-between;gap:24px;border-bottom:2pt solid #000;padding-bottom:10px;margin-bottom:14px}
.qp-head h1{font-size:22pt;margin:0 0 2px;letter-spacing:.02em}
.qp-job{font-size:13pt;font-weight:700}
.qp-meta{text-align:right;font-size:9.5pt}
.qp-meta div,.qp-head .qp-sub{margin-top:2px}
.qpage h2{font-size:12pt;margin:16px 0 4px;padding-bottom:2px;border-bottom:1pt solid #000}
.qpage table{width:100%;border-collapse:collapse;margin:0 0 4px}
.qpage th{font-size:8.5pt;text-transform:uppercase;letter-spacing:.04em;text-align:left;border-bottom:1pt solid #000;padding:3px 5px}
.qpage td{padding:3px 5px;border-bottom:.5pt solid #999;vertical-align:top}
.qpage .r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.qpage .tag{font-weight:700;white-space:nowrap}
.qpage tr.line td{font-style:italic}
.qpage tfoot td{border-bottom:0;border-top:1pt solid #000;font-weight:700}
.qp-totals{width:3.6in;margin:14px 0 0 auto}
.qp-totals td{border-bottom:.5pt solid #999}
.qp-totals tr.grand td{font-size:13pt;font-weight:700;border-top:2pt solid #000;border-bottom:0;padding-top:6px}
.qp-side{width:4.2in;max-width:100%}
.qp-notes{margin-top:16px;white-space:pre-wrap;font-size:9.5pt}
.qp-foot{margin-top:24px;font-size:8.5pt;border-top:.5pt solid #999;padding-top:6px}
.qpage tr,.qp-totals,.qp-side{page-break-inside:avoid;break-inside:avoid}
.qpage thead{display:table-header-group}
@page{size:letter;margin:.5in}
@media screen and (max-width:760px){.qpage{padding:16px;font-size:9.5pt}.qp-head{flex-direction:column;gap:6px}.qp-meta{text-align:left}.qp-totals,.qp-side{width:100%}}
@media print{.qpage{width:auto;padding:0;margin:0}}`;
// Two copies. The customer copy (the default) shows what each cabinet costs and what the painting costs, and nothing
// that gives away how the price is built: no per foot prices, no markup, no percentage charges, no sheet name.
// Markup and the percentage charges are spread into every price so the lines still add up to the total.
// The shop copy (Shop copy on) shows the full breakdown.
// The customer copy drops a line's working, like "(16.25 ft × $40.00)", and keeps what it is.
const lineName = n => String(n).replace(/\s*\([^()]*×[^()]*\)/g, '');
function quoteDoc(ps, detail, showPaint) {
  const q = priceJob(ps), po = paintOf(ps), date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const jl = q.jobLines.reduce((a, l) => a + (+l.amount || 0), 0), base = q.sub - jl;
  const f = detail ? 1 : base > 0 ? (q.sub + q.markup) / base : 1, mm = v => money(v * f);
  const paintOn = !detail && +po.rate > 0, paintOf_ = k => paintOn ? (+k.paint || 0) : 0;
  const cols = detail ? [['box', 'Cabinet'], ...(ps.doors.on ? [['doors', 'Fronts']] : []), ['extras', 'Inserts'], ['ends', 'Panels'], ...(ps.hardware.on ? [['hardware', 'Hardware']] : []), ...(ps.materials.on ? [['materials', 'Materials']] : [])] : [];
  const sqCol = detail && showPaint;
  const types = q.perFt.filter(t => t.n), span = 3 + cols.length + (sqCol ? 1 : 0);
  const room = R => { const rp = R.cabs.reduce((a, k) => a + paintOf_(k), 0);
    return `<section><h2>${esc(R.r.name)}</h2><table><thead><tr><th>#</th><th>Cabinet</th><th>Size (W × H × D)</th>${cols.map(([, l]) => `<th class="r">${l}</th>`).join('')}${sqCol ? '<th class="r">Paint sq ft</th>' : ''}<th class="r">Price</th></tr></thead><tbody>
    ${R.cabs.map(k => `<tr><td class="tag">${esc(k.label)}</td><td>${esc(k.c.name)}</td><td>${fmtLen(k.c.w)} × ${fmtLen(k.c.h)} × ${fmtLen(k.c.d)}</td>${cols.map(([c]) => `<td class="r">${money(k[c])}</td>`).join('')}${sqCol ? `<td class="r">${sqft(k.sq.total)}</td>` : ''}<td class="r">${mm(k.total - paintOf_(k))}</td></tr>`).join('') || `<tr><td colspan="${span + 1}">No cabinets</td></tr>`}
    ${rp ? `<tr class="line"><td></td><td colspan="${span - 1}">Painting</td><td class="r">${mm(rp)}</td></tr>` : ''}
    ${R.lines.map(l => `<tr class="line"><td></td><td colspan="${span - 1}">${esc(detail ? l.name : lineName(l.name))}</td><td class="r">${mm(l.amount)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="${span}">${esc(R.r.name)} total${sqCol && R.sq.total ? ` (includes ${sqft(R.sq.total)} sq ft paint)` : ''}</td><td class="r">${mm(R.total)}</td></tr></tfoot></table></section>`; };
  const paint = sqCol ? `<section class="qp-side"><h2>Paint</h2><table><tbody>${PAINT_PARTS.filter(([k]) => po[k]).map(([k, l]) => `<tr><td>${l}${k === 'fronts' && po.bothSides ? ' (both faces)' : ''}</td><td class="r">${sqft(q.sq[k])} sq ft</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total painted surface</td><td class="r">${sqft(q.sq.total)} sq ft</td></tr></tfoot></table></section>` : '';
  const roomsSum = q.rooms.reduce((a, R) => a + R.total, 0);
  const totals = detail ? `${q.jobLines.map(l => `<tr><td>${esc(l.name)}</td><td class="r">${money(l.amount)}</td></tr>`).join('')}
    <tr><td>Subtotal</td><td class="r">${money(q.sub)}</td></tr>${q.markup ? `<tr><td>Markup ${ps.markup}%</td><td class="r">${money(q.markup)}</td></tr>` : ''}`
    : `<tr><td>Subtotal</td><td class="r">${mm(roomsSum)}</td></tr>`;
  return `<div class="qpage">
  <header class="qp-head"><div><h1>${detail ? 'Quote, shop copy' : 'Quote'}</h1><div class="qp-job">${esc(S.job.name)}</div>${S.job.customer ? `<div class="qp-sub">For ${esc(S.job.customer)}</div>` : ''}</div>
    <div class="qp-meta"><div>${date}</div><div>${q.rooms.reduce((a, R) => a + R.cabs.length, 0)} cabinets, ${q.rooms.length} ${q.rooms.length === 1 ? 'room' : 'rooms'}</div></div></header>
  ${q.rooms.map(room).join('')}
  <table class="qp-totals"><tbody>${totals}${q.tax ? `<tr><td>Tax ${ps.tax}%</td><td class="r">${money(q.tax)}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td class="r">${money(q.total)}</td></tr></tbody></table>
  ${(() => { const W = typeof whatIfPrintRows === 'function' ? whatIfPrintRows(ps, q) : []; return W.length ? `<table class="qp-totals qp-wi"><thead><tr><th>Options</th><th class="r">Difference</th><th class="r">New total</th></tr></thead><tbody>${W.map(R => `<tr><td>${esc(R.name)}</td><td class="r">${wiSigned(R.diff)}</td><td class="r">${money(R.total)}</td></tr>`).join('')}</tbody></table>` : ''; })()}
  ${q.payments.length ? `<table class="qp-totals"><thead><tr><th>Payment schedule</th><th class="r">Amount</th></tr></thead><tbody>${q.payments.map(x => `<tr><td>${esc(x.name)} (${x.pct}%)</td><td class="r">${money(x.amount)}</td></tr>`).join('')}</tbody></table>` : ''}
  ${detail && types.length ? `<section class="qp-side"><h2>Price per foot</h2><table><thead><tr><th>Type</th><th class="r">Linear ft</th><th class="r">Total</th><th class="r">Per ft</th></tr></thead><tbody>
    ${types.map(t => `<tr><td>${t.name}</td><td class="r">${ftLen(t.ft)}</td><td class="r">${money(t.total)}</td><td class="r">${money(t.rate)}</td></tr>`).join('')}</tbody></table></section>` : ''}
  ${paint}
  ${S.job.notes ? `<div class="qp-notes"><b>Notes</b>\n${esc(S.job.notes)}</div>` : ''}
  <div class="qp-foot">${detail ? `Shop copy, not for the customer. Prices from ${esc(ps.name)}. ` : ''}Sizes are width × height × depth in inches.</div></div>`;
}
const quoteOpts = () => [!!ui.qsDetail, ui.qsPaint !== false];
function quoteFile(ps) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(S.job.name)} quote</title><style>body{margin:0;background:#fff}${QUOTE_CSS}</style></head><body>${quoteDoc(ps, ...quoteOpts())}</body></html>`;
}
function showQuoteSheet() {
  let st = $('#quotecss'); if (!st) { st = document.createElement('style'); st.id = 'quotecss'; st.textContent = QUOTE_CSS; document.head.appendChild(st); }
  const [detail, paint] = quoteOpts(), el = $('#quotesheet');
  el.innerHTML = `<div class="lbbar"><b>Quote for ${esc(S.job.name)}</b><span class="note">Letter size, black on white. Print it, or pick Save as PDF in the print window.</span>
    <div class="row-actions">${toggleBtn('qs-detail', detail, detail ? 'Shop copy, full breakdown' : 'Show the shop copy')}${detail ? toggleBtn('qs-paint', paint, 'Paint sq ft') : ''}<button class="btn primary" data-act="qs-print">${icon('print')}Print</button><button class="btn" data-act="qs-save">${icon('download')}Save quote file</button><button class="btn" data-act="qs-close">Close</button></div>${typeof overlapsNote === 'function' ? overlapsNote() : ''}</div>
  ${quoteDoc(priceSheet(), detail, paint)}`;
  el.hidden = false; document.body.classList.add('printing-quote');
}
// The quote's page size rules come off when it closes, so they don't change how labels print.
function closeQuoteSheet() { const st = $('#quotecss'); if (st) st.remove(); $('#quotesheet').hidden = true; document.body.classList.remove('printing-quote'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#quotesheet') && !$('#quotesheet').hidden) closeQuoteSheet(); });
document.addEventListener('change', e => {
  const inp = e.target.closest('input[data-ps-import]'); if (!inp || !inp.files[0]) return;
  importPriceSheet(inp.files[0]); inp.value = '';
});
document.addEventListener('click', e => {
  // The Sheets menu closes on any click outside it, and after any of its own buttons.
  document.querySelectorAll('.psmenu[open]').forEach(d => { if (!d.contains(e.target) || (e.target.closest('.menu button') && !e.target.closest('[data-act="ps-del"]'))) d.open = false; });
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act;
  if (a === 'price-view' || a === 'prx-jump' || a === 'prx-fold' || a === 'prx-fold-all' || a === 'pov-clear' || a.startsWith('ps-') || a.startsWith('quote-') || a.startsWith('qs-')) { e.stopPropagation(); if (a === 'prx-jump') e.preventDefault(); priceAction(a, el.dataset.id); }
}, true);
document.addEventListener('change', e => {
  const el = e.target.closest('[data-act-change="ps-pick"]'); if (!el) return;
  S.job.priceSheet = el.value; ui.psConfirm = false; save(); renderPricing();
});
// The job's installer: one pick, No installer included. Saved on the job, so it is in undo.
document.addEventListener('change', e => {
  const el = e.target.closest('[data-act-change="quote-inst"]'); if (!el) return;
  const v = el.value;
  // The two last options make an installer: a blank one to fill in, or one Claude reads from a pricing guide.
  if (v === '__add') { const n = blankInstaller('New installer'); INSTALLERS.push(n); savePrices(); mutate(() => { delete S.job.noInstall; S.job.installer = n.id; }); ui.priceView = 'edit'; renderPricing(); instFocus(n.id); return; }
  if (v === '__import') { renderPricing(); if (typeof openAsk === 'function') openAsk('inst'); return; }
  mutate(() => { delete S.job.noInstall; S.job.installer = v; });
  const w = INSTALLERS.find(i => i.id === v); flash(w ? `${w.name} installs this job` : 'No installer on this job');
});

// L1: type to narrow the price sheet list.
document.addEventListener('input', e => { const f = e.target.closest && e.target.closest('.ps-find'); if (!f) return; ui.psFind = f.value; renderPricing(); const n = document.querySelector('.ps-find'); if (n) { n.focus(); try { n.setSelectionRange(n.value.length, n.value.length); } catch (_) {} } });

/* ---------- Libraries › Inserts: each insert has its own price ---------- */
function renderInserts() {
  ensureLibPrices();
  const n = {}; allCabs().forEach(c => (c.inserts || []).forEach(it => { const id = insertType(it.type).id; n[id] = (n[id] || 0) + 1; }));
  const rows = INSERT_TYPES.map(t => {
    const R = 'insp:' + t.id, l = insLib(t.id), per = t.fields.includes('n');
    return `<tr><td><b>${esc(t.name)}</b>${t.hint ? `<div class="note help">${esc(t.hint)}</div>` : ''}</td><td class="n">${n[t.id] || 0}</td>
      <td style="width:120px">${ctl(R, 'each', l.each ?? 0, 'num', { label: t.name + ' price each' })}</td>
      <td style="width:120px">${per ? ctl(R, 'per', l.per ?? 0, 'num', { label: t.name + ' price per piece' }) : '<span class="muted">–</span>'}</td></tr>`;
  }).join('');
  ensureInteriorLib(S);
  const view = ['prices', 'mozaik'].includes(ui.insView) ? ui.insView : 'products';
  const tabRow = `<div class="mlx-tabs" role="tablist">${[['products', 'Your products', (S.interiorLib || []).length, 'shelf'], ['mozaik', 'Mozaik libraries', typeof MOZ_INS === 'undefined' ? 0 : MOZ_INS.length, 'download'], ['prices', 'Insert prices', INSERT_TYPES.length, 'tag']].map(([k, l, c, ic]) => `<button role="tab" data-act="ins-view" data-id="${k}" aria-selected="${view === k}">${icon(ic)}<span>${l}</span><span class="ct">${c}</span></button>`).join('')}</div>`;
  $('#tab-inserts').innerHTML = `<div class="pagehead"><div><h2>Inserts</h2><p>Your products are what the cabinet editor's Interior tab offers. Mozaik libraries holds every insert from your Mozaik insert libraries, ready to add. Insert prices are what each kind adds when a product has no price of its own.</p></div><div class="row-actions">${view === 'products' ? `<button class="btn primary" data-act="ilib-add">${icon('plus')}Add a product</button>` : ''}</div></div>
  ${tabRow}${view === 'products' ? intProductsView() : view === 'mozaik' ? mozCatalogView() : `<div class="card">${cardHead('Insert prices', '<span class="note">Used counts every cabinet in this job</span>')}<div class="tscroll"><table class="t"><thead><tr><th>Insert</th><th class="r">Used</th><th>Price each</th><th>Plus per piece</th></tr></thead><tbody>${rows}</tbody></table></div></div>`}`;
}
