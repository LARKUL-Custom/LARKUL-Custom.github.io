// Pricing: price sheets kept for the whole shop (not inside a job), and a quote for the drawn job from the one it uses.
'use strict';
let PRICES = [];
const money = v => '$' + (Math.round(v * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Inserts, doors and fronts, and materials are priced in their own libraries; the sheet keeps labor adders only.
const PRICE_ADDERS = [['perDrawer', 'Each drawer (box and slides labor)'], ['perShelf', 'Each adjustable shelf'], ['perFiller', 'Each filler']];
// Each panel, by height: applied end panels on top of their door style's price, loose panels on top of their material.
const PANEL_CATS = [['Base', 'Base height panel'], ['Wall', 'Wall height panel'], ['Tall', 'Tall panel']];
// Paint: square feet of painted surface, counting only the surfaces the sheet turns on.
const PAINT_PARTS = [['fronts', 'Doors and drawer fronts'], ['panels', 'Applied end panels'], ['fillers', 'Fillers'], ['toe', 'Toe skins'], ['interior', 'Finished interiors']];
const paintOf = ps => (ps.paint = { rate: 0, bothSides: true, fronts: true, panels: true, fillers: true, toe: true, interior: true, ...(ps.paint || {}) });
const sqft = v => (Math.round(v * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function paintCab(c, ps, b, fr) {
  const po = paintOf(ps), sq = { fronts: 0, panels: 0, fillers: 0, toe: 0, interior: 0 }, area = pt => pt.L * pt.W * pt.qty / 144;
  fr.forEach(f => { if (f.type !== 'open') sq.fronts += (f.x1 - f.x0) * (f.z1 - f.z0) / 144 * (po.bothSides ? 2 : 1); });
  b.parts.forEach(pt => {
    if (pt.cabId !== c.id) return;
    if (pt.kind === 'applied') sq.panels += area(pt);
    else if (pt.kind === 'filler') sq.fillers += area(pt);
    else if (pt.kind === 'toekick') sq.toe += area(pt);
    // A finished interior paints the inside face of the box, and both faces of shelves and dividers.
    else if (c.finInt && ['side', 'topbot', 'back'].includes(pt.kind)) sq.interior += area(pt);
    else if (c.finInt && ['shelf', 'divider'].includes(pt.kind)) sq.interior += 2 * area(pt);
  });
  PAINT_PARTS.forEach(([k]) => { if (!po[k]) sq[k] = 0; });
  sq.total = PAINT_PARTS.reduce((a, [k]) => a + sq[k], 0);
  return sq;
}
const CAT_FT = [['Base', 'Base cabinets'], ['Wall', 'Wall cabinets'], ['Tall', 'Tall and pantry']];
const ftLen = v => (Math.round(v * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
const addSq = list => PAINT_PARTS.concat([['total']]).reduce((o, [k]) => (o[k] = list.reduce((a, x) => a + x[k], 0), o), {});
// A starting sheet: rough shop numbers to edit, with doors, hardware and materials priced from this job's libraries.
function defaultPriceSheet(name = 'Standard pricing') {
  // Hardware with its own price (Ayden's Mozaik prices) starts there; the rest get rough shop numbers.
  const own = n => { for (const h of (S ? S.hardware : [])) {
    if (h.prices && n.startsWith(h.name + ' ')) { const L = parseFloat(n.slice(h.name.length + 1)); if (h.prices[L] != null) return +h.prices[L]; }
    if (h.cost != null && n === h.name) return +h.cost;
    if (h.plateCost != null && n === h.name + ' mounting plate') return +h.plateCost;
  } return null; };
  const hwPrice = n => own(n) ?? (/slide/i.test(n) ? 32 : /plate/i.test(n) ? 1.5 : /hinge/i.test(n) ? 5.5 : /pin/i.test(n) ? 0.15 : /pull|knob/i.test(n) ? 7 : /\bleg\b/i.test(n) ? 2.5 : /clip/i.test(n) ? 0.5 : 2);
  const hardware = {};
  if (S) allCabs().forEach(c => inRoomOf(c, () => Object.keys(buildParts(c).bom).forEach(k => { if (!(k in hardware)) hardware[k] = hwPrice(k); })));
  return {
    id: uid('ps'), name, markup: 0, tax: 0,
    cab: { Base: { base: 150, perFt: 120 }, Wall: { base: 100, perFt: 90 }, Tall: { base: 250, perFt: 220 } },
    products: {},
    adders: { perDrawer: 35, perShelf: 12, perFiller: 25 },
    panelAdd: { Base: 0, Wall: 0, Tall: 0 },
    doors: { on: true },
    materials: { on: false, waste: 15 },
    hardware: { on: true, items: hardware },
    tops: Object.fromEntries((S ? S.countertops : []).map(t => [t.id, 55])), molds: Object.fromEntries((S ? S.moldings : []).map(m => [m.id, 9])),
    extras: [{ name: 'Delivery and install', amount: 0, per: 'job' }],
    paint: { rate: 0, bothSides: true, fronts: true, panels: true, fillers: true, toe: true, interior: true },
  };
}
const priceSheet = () => PRICES.find(p => p.id === S.job.priceSheet) || PRICES[0];
async function loadPrices() {
  try { PRICES = inHub() ? ((await Hub.storage.get('priceSheets')) || []) : JSON.parse(localStorage.getItem(KEY + '.prices') || '[]'); } catch (_) { PRICES = []; }
  if (PRICES.value) PRICES = PRICES.value;
  if (!Array.isArray(PRICES)) PRICES = [];
  if (!PRICES.length) { PRICES.push(defaultPriceSheet()); savePrices(); }
}
let priceTimer = null;
function savePrices() {
  clearTimeout(priceTimer);
  priceTimer = setTimeout(() => {
    try { localStorage.setItem(KEY + '.prices', JSON.stringify(PRICES)); } catch (_) {}
    if (inHub()) Hub.storage.set('priceSheets', PRICES).catch(() => flash('Could not save the price sheets.'));
  }, 300);
}

/* ---------- Pricing the drawn job ---------- */
// Price of one cabinet, split into lines so the quote can show where it comes from.
function priceCab(c, ps) {
  const b = buildParts(c), fr = computeFronts(c), rule = { ...ps.cab[c.cat], ...(ps.products[c.libId] || {}) };
  const box = (+rule.base || 0) + (+rule.perFt || 0) * c.w / 12;
  ensureLibPrices(ps);
  let doors = 0;
  if (ps.doors.on) fr.forEach(f => {
    if (f.type === 'open') return;
    const { ds } = frontStyle(c, f);
    doors += priceFront(ds, (f.x1 - f.x0) * (f.z1 - f.z0) / 144, ps).total;
  });
  const ad = ps.adders, ins = c.inserts || [], p = effParams(c);
  const nDr = fr.filter(f => f.type === 'drawer').length;
  // Each insert has its own price in the insert library (a lazy susan is not a tray divider).
  const extras = nDr * (+ad.perDrawer || 0) + ins.reduce((a, it) => a + insertPrice(it), 0) + Math.max(0, p.shelfCount | 0) * (+ad.perShelf || 0);
  // Applied end panels are priced as a front in their door style, plus the sheet's charge for a panel that tall.
  const pds = panelDoor(c), panelParts = b.parts.filter(pt => pt.cabId === c.id && pt.kind === 'applied');
  const ends = panelParts.reduce((a, pt) => a + pt.qty * ((ps.doors.on ? priceFront(pds, pt.L * pt.W / 144, ps).total : 0) + panelAdd(ps, c.cat)), 0) + fillersOf(c).length * (+ad.perFiller || 0);
  let hardware = 0;
  if (ps.hardware.on) Object.entries(b.bom).forEach(([k, q]) => { hardware += q * (+ps.hardware.items[k] || 0); });
  let materials = 0;
  if (ps.materials.on) b.parts.forEach(pt => {
    // Door parts are paid for by the door's own material cost.
    const m = mat(pt.mat); if (!m || (ps.doors.on && (FRONT_KINDS.includes(pt.kind) || pt.kind === 'applied'))) return;
    materials += pt.L * pt.W * pt.qty * matSqIn(m, ps);
  });
  const sq = paintCab(c, ps, b, fr), paint = sq.total * (+paintOf(ps).rate || 0);
  // Per-cabinet extras from its Price tab: price per foot and per square foot of face, then an upcharge on the lot.
  const custom = (+c.pxFt || 0) * c.w / 12 + (+c.pxSq || 0) * c.w * c.h / 144, base = box + doors + extras + ends + hardware + materials + paint + custom, upcharge = base * (+c.pxUp || 0) / 100;
  return { box, doors, extras, ends, hardware, materials, sq, paint, custom, upcharge, total: base + upcharge };
}
const FRONT_KINDS = ['door', 'drawerFront', 'frame'];
// One door or front: the style's price per sq ft from the door library (or this job's own), never under its minimum, plus material.
function priceFront(ds, sq, ps) {
  const labor = Math.max(doorMin(ds), sq * doorRate(ds)), material = sq * doorMatRate(ds, ps);
  return { labor, material, total: labor + material };
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
  return pick(o, 'each', lib.each) + n * pick(o, 'per', lib.per);
}
const panelAdd = (ps, cat) => +((ps.panelAdd || {})[cat === 'Wall' || cat === 'Tall' ? cat : 'Base']) || 0;
// The door style applied end panels are made and priced as: the job or room pick, or else the cabinet's own door.
function panelDoor(c) {
  const id = cabSet(c, 'panelDoor'); if (id && S.doorStyles.some(d => d.id === id)) return doorStyle(id);
  const t = doorTpl(cabSet(c, 'doorT')); return doorStyle(c.cat === 'Wall' && t.wallDoor ? t.wallDoor : t.door);
}
// The panel library keeps the fit (overhang, scribe, to the floor); the look comes from the door style.
function panelFor(c) {
  const ps = panelStyle(cabSet(c, 'panelStyle')), ds = panelDoor(c), framed = ds.type !== 'slab';
  return { ...ps, mat: ds.mat, type: framed ? 'routed' : 'flat', frame: framed ? Math.max(+ds.stile || 0, +ds.rail || 0) : 0, pocketDepth: +ds.pocketDepth || 0.25, door: ds };
}
// Loose panels drawn as shapes in the room: their material plus the sheet's charge for a panel that tall.
function shapePanelCat(s) { const b = shapeBox(s.pts || []); return b.h > 48 ? 'Tall' : (+s.elev || 0) >= 30 ? 'Wall' : 'Base'; }
function priceShapes(ps) {
  return (S.shapes || []).map(s => {
    const m = mat(s.mat), b = shapeBox(s.pts || []), cat = shapePanelCat(s), o = shapeOutline(s.pts || []), area = o.length > 2 ? Math.abs(o.reduce((t, q, i) => { const r = o[(i + 1) % o.length]; return t + q.x * r.y - r.x * q.y; }, 0)) / 2 : b.w * b.h;
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
  if (ps && !ps.panelAdd) {
    const was = +((ps.counts || {}).panels) || 0; ps.panelAdd = { Base: was, Wall: was, Tall: was };
    if (ps.counts) { if (+ps.counts.fillers) ps.adders.perFiller = (+ps.adders.perFiller || 0) + +ps.counts.fillers; delete ps.counts.panels; delete ps.counts.fillers; }
    savePrices();
  }
  if (moved) save();
}
function priceJob(ps) {
  const rooms = S.rooms.map(r => withRoom(r, () => {
    const cabs = S.cabinets.map(c => ({ c, label: LBL[c.id], ...priceCab(c, ps) }));
    const tops = countertopRuns().filter(t => t.on).map(t => ({ name: `Countertop, ${wallName(wall(t.wall))} (${t.tpl.name})`, amount: t.len * t.depth / 144 * (+ps.tops[t.tpl.id] || 0) }));
    const molds = moldingRuns().map(m => ({ name: `Molding, ${wallName(wall(m.wall))} (${m.m.name})`, amount: m.len / 12 * (+ps.molds[m.m.id] || 0) }));
    const xs = ps.extras.filter(x => x.per === 'room').map(x => ({ name: x.name, amount: +x.amount || 0 }))
      .concat(ps.extras.filter(x => x.per === 'cabinet' && cabs.length).map(x => ({ name: `${x.name} (${cabs.length} × ${money(+x.amount || 0)})`, amount: (+x.amount || 0) * cabs.length })));
    const lines = [...tops, ...molds, ...priceShapes(ps), ...xs];
    return { r, cabs, lines, sq: addSq(cabs.map(k => k.sq)), total: cabs.reduce((a, k) => a + k.total, 0) + lines.reduce((a, k) => a + k.amount, 0) };
  }));
  const jobLines = ps.extras.filter(x => x.per === 'job').map(x => ({ name: x.name, amount: +x.amount || 0 }));
  const sub = rooms.reduce((a, r) => a + r.total, 0) + jobLines.reduce((a, k) => a + k.amount, 0);
  const markup = sub * (+ps.markup || 0) / 100, tax = (sub + markup) * (+ps.tax || 0) / 100;
  // Linear feet and cabinet total by type, for a price per foot. Cabinets only: tops, molding and charges are left out.
  const perFt = CAT_FT.map(([cat, name]) => { const ks = rooms.flatMap(R => R.cabs).filter(k => k.c.cat === cat && !k.c.noCount), ft = ks.reduce((a, k) => a + k.c.w, 0) / 12, total = ks.reduce((a, k) => a + k.total, 0); return { cat, name, n: ks.length, ft, total, rate: ft ? total / ft : 0 }; });
  return { rooms, jobLines, sub, markup, tax, total: sub + markup + tax, sq: addSq(rooms.map(R => R.sq)), perFt };
}
function quoteCSV(ps) {
  const q = priceJob(ps), rows = [['Room', 'Cabinet', 'Name', 'Size', 'Cabinet', 'Doors and fronts', 'Drawers, shelves, inserts', 'Panels and fillers', 'Hardware', 'Materials', 'Paint', 'Paint sq ft', 'Total']], m = v => (Math.round(v * 100) / 100).toFixed(2);
  q.rooms.forEach(R => {
    R.cabs.forEach(k => rows.push([R.r.name, k.label, k.c.name, `${fmtLen(k.c.w)} x ${fmtLen(k.c.h)} x ${fmtLen(k.c.d)}`, m(k.box), m(k.doors), m(k.extras), m(k.ends), m(k.hardware), m(k.materials), m(k.paint), k.sq.total.toFixed(1), m(k.total)]));
    R.lines.forEach(l => rows.push([R.r.name, '', l.name, '', '', '', '', '', '', '', '', '', m(l.amount)]));
  });
  const end = (name, v, sq = '') => rows.push(['', '', name, '', '', '', '', '', '', '', '', sq, v]);
  q.jobLines.forEach(l => rows.push(['Job', '', l.name, '', '', '', '', '', '', '', '', '', m(l.amount)]));
  end('Subtotal', m(q.sub), q.sq.total.toFixed(1));
  if (q.markup) end(`Markup ${ps.markup}%`, m(q.markup));
  if (q.tax) end(`Tax ${ps.tax}%`, m(q.tax));
  end('Total', m(q.total));
  q.perFt.filter(t => t.n).forEach(t => rows.push(['', '', `${t.name}: ${ftLen(t.ft)} ft, ${m(t.rate)} per ft`, '', '', '', '', '', '', '', '', '', m(t.total)]));
  return rows.map(r => r.map(csvq).join(',')).join('\n');
}

/* ---------- Pricing tab ---------- */
function renderPricing() {
  const ps = priceSheet(), view = ui.priceView || 'quote';
  // The sheet picker stays in view; making, copying, filing and deleting sheets sit in one menu.
  const head = `<div class="pagehead"><div><h2>Pricing</h2><p>Price sheets are kept for your whole shop and save as you edit, so every job prices the same way. Save a sheet as a file to keep a copy or move it to another computer.</p></div>
    <div class="row-actions"><label class="f wide pickps"><span>Price sheet</span><select data-act-change="ps-pick" aria-label="Price sheet">${(() => { const q = (ui.psFind || '').toLowerCase(), l = [...PRICES].sort((x, y) => String(x.name).localeCompare(String(y.name), undefined, { numeric: true })).filter(p => !q || p === ps || String(p.name).toLowerCase().includes(q)); return l.map(p => `<option value="${p.id}"${p.id === ps.id ? ' selected' : ''}>${esc(p.name)}</option>`).join(''); })()}</select></label>${PRICES.length > 5 ? `<label class="f"><span>Find</span><input type="search" class="ps-find" value="${esc(ui.psFind || '')}" placeholder="Part of a name" aria-label="Find a price sheet"></label>` : ''}
    <details class="psmenu"${ui.psConfirm ? ' open' : ''}><summary class="btn">${icon('sliders')}Sheets</summary><div class="menu">
      <button data-act="ps-new">${icon('plus')}New sheet</button><button data-act="ps-dup">${icon('copy')}Copy this sheet</button>
      <button data-act="ps-export">${icon('download')}Save sheet as file</button><label>${icon('upload')}Open sheet file<input type="file" accept=".json,application/json" data-ps-import hidden></label>
      ${PRICES.length > 1 ? `<button class="danger" data-act="ps-del">${icon('trash')}${ui.psConfirm ? 'Click again to delete' : 'Delete this sheet'}</button>` : ''}</div></details></div></div>
    <div class="subtabs" role="tablist">${[['quote', 'Quote', 'list'], ['edit', 'Edit prices', 'sliders'], ['order', 'Order', 'export']].map(([k, l, ic]) => `<button role="tab" data-act="price-view" data-id="${k}" aria-selected="${view === k}">${icon(ic)}${l}</button>`).join('')}</div>`;
  $('#tab-pricing').innerHTML = head + (view === 'edit' ? priceEditor(ps) : view === 'order' ? buyList() + exportHTML(false) : priceQuote(ps));
}
function toggleBtn(act, on, label, id) { return `<button class="btn toggle${on ? ' on' : ''}" data-act="${act}"${id ? ` data-id="${id}"` : ''} aria-pressed="${!!on}">${icon(on ? 'check' : 'plus')}${label}</button>`; }
function priceQuote(ps) {
  const q = priceJob(ps);
  // Paint is inside each cabinet's price, so every room's total is what to quote for that room.
  const paintNote = R => R.sq.total ? `<span class="note">Includes ${sqft(R.sq.total)} sq ft paint${+paintOf(ps).rate ? `, ${money(R.cabs.reduce((a, k) => a + k.paint, 0))}` : ''}</span>` : '';
  const room = R => `<div class="card"><div class="cardhead"><h3>${icon('home')}${esc(R.r.name)}</h3>${paintNote(R)}<b class="money">${money(R.total)}</b></div><div class="tscroll"><table class="t quote">
    <thead><tr><th>Cabinet</th><th>Size</th><th class="r">Cabinet</th>${ps.doors.on ? '<th class="r">Doors and fronts</th>' : ''}<th class="r">Drawers, shelves, inserts</th><th class="r">Panels, fillers</th>${ps.hardware.on ? '<th class="r">Hardware</th>' : ''}${ps.materials.on ? '<th class="r">Materials</th>' : ''}<th class="r">Paint sq ft</th><th class="r">Total</th></tr></thead>
    <tbody>${R.cabs.map(k => `<tr><td><span class="chip cab">${k.label}</span> ${esc(k.c.name)}</td><td class="n">${fmtLen(k.c.w)} × ${fmtLen(k.c.h)} × ${fmtLen(k.c.d)}</td><td class="n">${money(k.box)}</td>${ps.doors.on ? `<td class="n">${money(k.doors)}</td>` : ''}<td class="n">${money(k.extras)}</td><td class="n">${money(k.ends)}</td>${ps.hardware.on ? `<td class="n">${money(k.hardware)}</td>` : ''}${ps.materials.on ? `<td class="n">${money(k.materials)}</td>` : ''}<td class="n">${sqft(k.sq.total)}</td><td class="n"><b>${money(k.total)}</b></td></tr>`).join('') || '<tr><td colspan="11" class="muted">No cabinets yet</td></tr>'}
    ${R.lines.map(l => `<tr class="extra"><td colspan="2">${esc(l.name)}</td><td colspan="${4 + ps.doors.on + ps.hardware.on + ps.materials.on}"></td><td class="n">${money(l.amount)}</td></tr>`).join('')}</tbody></table></div></div>`;
  return `<div class="quotetop">
    <div class="qtile grand"><span>Total for ${esc(S.job.name)}</span><b>${money(q.total)}</b><small>${q.rooms.reduce((a, R) => a + R.cabs.length, 0)} cabinets · ${sqft(q.sq.total)} sq ft paint</small></div>
    ${q.perFt.map(t => `<div class="qtile cat-${t.cat}"><span>${t.name}</span><b>${t.n ? money(t.rate) + '<em>/ft</em>' : '–'}</b><small>${t.n ? `${ftLen(t.ft)} ft · ${money(t.total)}` : 'None in this job'}</small></div>`).join('')}
    </div>
    <div class="row-actions quotebar"><button class="btn primary" data-act="quote-print">${icon('print')}Print or save quote</button><button class="btn" data-act="quote-copy">${icon('copy')}Copy quote CSV</button>${inHub() ? `<button class="btn" data-act="quote-save">${icon('folder')}Save quote CSV to Files</button>` : ''}<span class="note help">Per foot is each type's cabinet total over its width in feet. Tops, molding and extra charges are not in it.</span></div>
    ${q.rooms.map(room).join('')}
    ${paintCard(ps, q)}
    <div class="card totals"><table class="t"><tbody>
      ${q.jobLines.map(l => `<tr><td>${esc(l.name)}</td><td class="n">${money(l.amount)}</td></tr>`).join('')}
      <tr><td>Subtotal</td><td class="n">${money(q.sub)}</td></tr>
      ${ps.markup ? `<tr><td>Markup ${ps.markup}%</td><td class="n">${money(q.markup)}</td></tr>` : ''}${ps.tax ? `<tr><td>Tax ${ps.tax}%</td><td class="n">${money(q.tax)}</td></tr>` : ''}
      <tr class="grand"><td>Total for ${esc(S.job.name)}</td><td class="n">${money(q.total)}</td></tr></tbody></table></div>`;
}
// Paint total for the job, with switches for which surfaces count.
function paintCard(ps, q) {
  const po = paintOf(ps);
  return `<div class="card paintcard"><div class="cardhead"><h3>${icon('palette')}Paint</h3><b class="money">${sqft(q.sq.total)} sq ft</b></div><div class="cardbody">
    <div class="row-actions">${PAINT_PARTS.map(([k, l]) => toggleBtn('ps-paint', po[k], l, k)).join('')}${toggleBtn('ps-paint', po.bothSides, 'Both sides of doors and fronts', 'bothSides')}</div>
    <div class="tscroll"><table class="t"><thead><tr><th>Surface</th>${q.rooms.length > 1 ? q.rooms.map(R => `<th class="r">${esc(R.r.name)}</th>`).join('') : ''}<th class="r">Sq ft</th></tr></thead><tbody>
    ${PAINT_PARTS.filter(([k]) => po[k]).map(([k, l]) => `<tr><td>${l}</td>${q.rooms.length > 1 ? q.rooms.map(R => `<td class="n">${sqft(R.sq[k])}</td>`).join('') : ''}<td class="n">${sqft(q.sq[k])}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No surfaces counted</td></tr>'}
    <tr class="grand"><td>Total</td>${q.rooms.length > 1 ? q.rooms.map(R => `<td class="n">${sqft(R.sq.total)}</td>`).join('') : ''}<td class="n">${sqft(q.sq.total)}</td></tr>
    ${+po.rate ? `<tr><td>Paint price, in the room totals</td>${q.rooms.length > 1 ? q.rooms.map(R => `<td class="n">${money(R.cabs.reduce((a, k) => a + k.paint, 0))}</td>`).join('') : ''}<td class="n">${money(q.rooms.reduce((a, R) => a + R.cabs.reduce((b, k) => b + k.paint, 0), 0))}</td></tr>` : ''}</tbody></table></div>
    <div class="note">Doors and fronts count their full size${po.bothSides ? ' on both faces' : ', one face'}. Panels, fillers and toe skins count their outside face. Finished interiors count the inside of the box and both faces of shelves.${+po.rate ? ` Priced at ${money(+po.rate)} per sq ft, already inside each cabinet's and each room's price.` : ' Set a price per sq ft on the price sheet to put paint into each room\'s price.'}</div></div></div>`;
}
function priceEditor(ps) {
  const R = 'psh:' + ps.id, P = path => 'pshp:' + ps.id + ':' + path, num = (ref, k, v, x = {}) => ctl(ref, k, v ?? '', 'num', { label: k, ...x });
  const used = {}; allCabs().forEach(c => inRoomOf(c, () => Object.keys(buildParts(c).bom).forEach(k => { used[k] = 1; })));
  const showProd = ui.psProd ?? Object.values(ps.products).some(o => o && (o.base !== undefined || o.perFt !== undefined));
  const hwNames = [...new Set([...Object.keys(used), ...Object.keys(ps.hardware.items)])].sort();
  return `${jobPriceCard(ps)}<div class="pricegrid">
  <div class="card"><div class="cardhead"><h3>${icon('tag')}Sheet</h3></div><div class="cardbody">
    ${fld('Name', R, 'name', ps.name, 'text', { wide: true })}${fld('Markup %', R, 'markup', ps.markup, 'num')}${fld('Tax %', R, 'tax', ps.tax, 'num')}</div></div>
  <div class="card"><div class="cardhead"><h3>${icon('box')}Cabinets by type</h3><span class="note">Base price plus a price per foot of width</span></div><div class="tscroll"><table class="t"><thead><tr><th>Type</th><th class="r">Base price</th><th class="r">Per foot</th></tr></thead><tbody>
    ${['Base', 'Wall', 'Tall'].map(cat => `<tr><td><span class="catpill cat-${cat}">${cat}</span></td><td style="width:110px">${num(P('cab.' + cat), 'base', ps.cab[cat].base)}</td><td style="width:110px">${num(P('cab.' + cat), 'perFt', ps.cab[cat].perFt)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="card wide"><div class="cardhead"><h3>${icon('stack')}Products</h3><span class="note">Give any library cabinet its own price. Blank uses its type.</span><button class="btn sm" data-act="ps-prod">${showProd ? 'Hide' : `Show all ${S.library.length}`}</button></div>${showProd ? `<div class="tscroll"><table class="t"><thead><tr><th>Product</th><th>Type</th><th class="r">Base price</th><th class="r">Per foot</th></tr></thead><tbody>
    ${S.library.map(l => { const o = ps.products[l.id] || {}; return `<tr><td>${esc(l.name)}</td><td><span class="catpill cat-${l.cat}">${l.cat}</span></td><td style="width:110px">${num(P('products.' + l.id), 'base', o.base, { blank: true, ph: String(ps.cab[l.cat].base) })}</td><td style="width:110px">${num(P('products.' + l.id), 'perFt', o.perFt, { blank: true, ph: String(ps.cab[l.cat].perFt) })}</td></tr>`; }).join('')}</tbody></table></div>` : ''}</div>
  <div class="card"><div class="cardhead"><h3>${icon('shelf')}Adders</h3></div><div class="cardbody">${PRICE_ADDERS.map(([k, l]) => fld(l, P('adders'), k, ps.adders[k], 'num')).join('')}
    <div class="note">Each insert has its own price in Libraries › Inserts.</div></div></div>
  <div class="card"><div class="cardhead"><h3>${icon('box')}Panels</h3><span class="note">Each panel, by height</span></div><div class="cardbody">${PANEL_CATS.map(([k, l]) => fld(l, P('panelAdd'), k, (ps.panelAdd || {})[k] ?? 0, 'num')).join('')}
    <div class="note">Applied end panels get this on top of their door style's price. Loose panels drawn in the room get it on top of their material.</div></div></div>
  <div class="card"><div class="cardhead"><h3>${icon('door')}Doors and fronts</h3>${toggleBtn('ps-doors', ps.doors.on, ps.doors.on ? 'Added to cabinets' : 'Not added')}</div><div class="cardbody">
    <div class="note">Each door style's price per sq ft and minimum are set in the door designer (Libraries › Doors). Change them for this job only under Library prices on this job.</div></div></div>
  <div class="card"><div class="cardhead"><h3>${icon('palette')}Materials</h3>${toggleBtn('ps-mats', ps.materials.on, ps.materials.on ? 'Added to cabinets' : 'Not added')}</div><div class="cardbody">
    <div class="note">Each material's price per sheet is set in Libraries › Materials. Each cabinet pays for the part of a sheet its parts use, plus waste.</div>
    ${fld('Waste %', P('materials'), 'waste', ps.materials.waste, 'num')}</div></div>
  <div class="card"><div class="cardhead"><h3>${icon('sliders')}Hardware</h3>${toggleBtn('ps-hw', ps.hardware.on, ps.hardware.on ? 'Added to cabinets' : 'Not added')}</div><div class="cardbody">
    <div class="note">Price each, for every hardware line on the cabinets' lists.</div>${hwNames.map(n => fld(esc(n), P('hardware.items'), n, ps.hardware.items[n] ?? 0, 'num')).join('')}</div></div>
  <div class="card"><div class="cardhead"><h3>${icon('palette')}Paint</h3></div><div class="cardbody">
    <div class="note">Price per square foot of painted surface. Leave it at 0 to only show the square footage. Pick which surfaces count on the quote.</div>${fld('Paint ($/sq ft)', P('paint'), 'rate', paintOf(ps).rate, 'num')}</div></div>
  <div class="card"><div class="cardhead"><h3>${icon('ruler')}Tops and molding</h3></div><div class="cardbody">
    ${S.countertops.map(t => fld(esc(t.name) + ' ($/sq ft)', P('tops'), t.id, ps.tops[t.id] ?? 0, 'num')).join('')}${S.moldings.map(m => fld(esc(m.name) + ' ($/ft)', P('molds'), m.id, ps.molds[m.id] ?? 0, 'num')).join('')}</div></div>
  <div class="card wide"><div class="cardhead"><h3>${icon('plus')}Extra charges</h3><button class="btn sm" data-act="ps-x-add">${icon('plus')}Add charge</button></div><div class="cardbody">
    ${ps.extras.map((x, i) => `<div class="xrow">${ctl(P('extras.' + i), 'name', x.name, 'text', { label: 'Charge name' })}${ctl(P('extras.' + i), 'amount', x.amount, 'num', { label: 'Amount' })}${ctl(P('extras.' + i), 'per', x.per, 'select', { label: 'Per', options: [{ v: 'job', l: 'Per job' }, { v: 'room', l: 'Per room' }, { v: 'cabinet', l: 'Per cabinet' }] })}<button class="btn sm danger" data-act="ps-x-del" data-id="${i}" aria-label="Remove charge">${icon('trash')}</button></div>`).join('') || '<div class="note">None</div>'}</div></div>
  </div>`;
}
// What this job uses from the door, insert and material libraries, at the library's price, with a box to change it for this job.
function libUsage(ps) {
  const doors = {}, ins = {}, mats = {}, add = (o, id, sq, n = 1) => { const u = o[id] = o[id] || { n: 0, sq: 0 }; u.n += n; u.sq += sq; };
  S.rooms.forEach(r => withRoom(r, () => {
    S.cabinets.forEach(c => {
      try { computeFronts(c).forEach(f => { if (f.type !== 'open') add(doors, frontStyle(c, f).ds.id, (f.x1 - f.x0) * (f.z1 - f.z0) / 144); }); } catch (_) {}
      const b = buildParts(c);
      b.parts.forEach(pt => { if (pt.cabId !== c.id) return; if (pt.kind === 'applied') add(doors, panelDoor(c).id, pt.L * pt.W * pt.qty / 144, pt.qty); if (pt.mat && !(ps.doors.on && (FRONT_KINDS.includes(pt.kind) || pt.kind === 'applied'))) add(mats, pt.mat, pt.L * pt.W * pt.qty / 144, pt.qty); });
      (c.inserts || []).forEach(it => add(ins, insertType(it.type).id, 0));
    });
    (S.shapes || []).forEach(s => { const bx = shapeBox(s.pts || []); if (s.mat) add(mats, s.mat, bx.w * bx.h / 144); });
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
  return `<div class="card wide jobprices"><div class="cardhead"><h3>${icon('tag')}Library prices on this job</h3><span class="note">${n ? `${n} changed for ${esc(S.job.name)} only` : 'Blank uses the library price'}</span>${n ? '<button class="btn sm" data-act="pov-clear">Use library prices</button>' : ''}</div>
    <div class="tscroll"><table class="t"><thead><tr><th>Item</th><th class="r">Used</th><th class="r">Library</th><th>This job</th><th class="r">Comes to</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="5" class="muted">Nothing from the libraries in this job yet</td></tr>'}</tbody></table></div></div>`;
}
// Resolves a price sheet ref: psh:<id> is the sheet, pshp:<id>:<a.b.c> an object inside it (made if missing).
function priceRef(ref) {
  const [k, id, path] = ref.split(':'), ps = PRICES.find(p => p.id === id); if (!ps) return null;
  if (k === 'psh') return ps;
  return path.split('.').reduce((o, key) => o && (o[key] = o[key] || {}), ps);
}
function priceAction(a, id) {
  const ps = priceSheet();
  switch (a) {
    case 'price-view': ui.priceView = id; break;
    case 'ps-new': { const n = defaultPriceSheet('New price sheet'); PRICES.push(n); S.job.priceSheet = n.id; save(); ui.priceView = 'edit'; break; }
    case 'ps-dup': { const n = { ...clone(ps), id: uid('ps'), name: ps.name + ' copy' }; PRICES.push(n); S.job.priceSheet = n.id; save(); break; }
    case 'ps-del': if (!ui.psConfirm) { ui.psConfirm = true; renderPricing(); return; } ui.psConfirm = false; PRICES = PRICES.filter(p => p !== ps); S.job.priceSheet = PRICES[0].id; save(); break;
    case 'ps-doors': ps.doors.on = !ps.doors.on; break;
    case 'ps-mats': ps.materials.on = !ps.materials.on; break;
    case 'ps-hw': ps.hardware.on = !ps.hardware.on; break;
    case 'ps-prod': ui.psProd = !(ui.psProd ?? Object.values(ps.products).some(o => o && (o.base !== undefined || o.perFt !== undefined))); renderPricing(); return;
    case 'ps-paint': { const po = paintOf(ps); po[id] = !po[id]; break; }
    case 'ps-export': saveFile(new Blob([JSON.stringify({ cabinetDesignerPriceSheet: 1, sheet: ps }, null, 2)], { type: 'application/json' }), `${fileSafe(ps.name)} price sheet.json`, 'Cabinet Designer/Price sheets'); return;
    case 'quote-print': showQuoteSheet(); return;
    case 'qs-print': window.print(); return;
    case 'qs-save': saveFile(new Blob([quoteFile(ps)], { type: 'text/html' }), `${fileSafe(S.job.name) || 'job'} quote.html`, 'Cabinet Designer'); return;
    case 'qs-close': closeQuoteSheet(); return;
    case 'qs-detail': ui.qsDetail = !ui.qsDetail; showQuoteSheet(); return;
    case 'qs-paint': ui.qsPaint = ui.qsPaint === false; showQuoteSheet(); return;
    case 'pov-clear': mutate(() => { delete S.job.priceOver; }); flash('This job uses the library prices again'); return;
    case 'ps-x-add': ps.extras.push({ name: 'New charge', amount: 0, per: 'job' }); break;
    case 'ps-x-del': ps.extras.splice(+id, 1); break;
    case 'quote-copy': { const t = quoteCSV(ps); try { navigator.clipboard.writeText(t).then(() => flash('Quote copied'), () => flash('Could not copy')); } catch (_) { flash('Could not copy'); } return; }
    case 'quote-save': Hub.files.upload(new File([quoteCSV(ps)], `${S.job.name.replace(/[^\w -]/g, '') || 'job'} quote.csv`), 'Cabinet Designer').then(() => flash('Saved to Files › Cabinet Designer'), e => flash('Could not save: ' + e.message)); return;
  }
  if (a !== 'price-view' && a !== 'ps-del') ui.psConfirm = false;
  savePrices(); renderPricing();
}

/* ---------- Saving sheets and quotes as files ---------- */
const fileSafe = n => String(n || '').replace(/[^\w -]/g, '').trim();
// Saves to Files in the hub, or downloads outside it.
function saveFile(blob, name, folder) {
  if (inHub()) return Hub.files.upload(new File([blob], name, { type: blob.type }), folder).then(() => flash(`Saved to Files › ${folder.replace('/', ' › ')}`), e => flash('Could not save: ' + e.message));
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
function quoteDoc(ps, detail, showPaint) {
  // Without the breakdown, markup is spread into every price so the customer sees finished prices that add up.
  const q = priceJob(ps), po = paintOf(ps), f = detail ? 1 : 1 + (q.sub ? q.markup / q.sub : 0), mm = v => money(v * f), date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const cols = detail ? [['box', 'Cabinet'], ...(ps.doors.on ? [['doors', 'Fronts']] : []), ['extras', 'Inserts'], ['ends', 'Panels'], ...(ps.hardware.on ? [['hardware', 'Hardware']] : []), ...(ps.materials.on ? [['materials', 'Materials']] : [])] : [];
  const types = q.perFt.filter(t => t.n), span = 3 + cols.length + (showPaint ? 1 : 0);
  const room = R => `<section><h2>${esc(R.r.name)}</h2><table><thead><tr><th>#</th><th>Cabinet</th><th>Size (W × H × D)</th>${cols.map(([, l]) => `<th class="r">${l}</th>`).join('')}${showPaint ? '<th class="r">Paint sq ft</th>' : ''}<th class="r">Price</th></tr></thead><tbody>
    ${R.cabs.map(k => `<tr><td class="tag">${esc(k.label)}</td><td>${esc(k.c.name)}</td><td>${fmtLen(k.c.w)} × ${fmtLen(k.c.h)} × ${fmtLen(k.c.d)}</td>${cols.map(([f]) => `<td class="r">${money(k[f])}</td>`).join('')}${showPaint ? `<td class="r">${sqft(k.sq.total)}</td>` : ''}<td class="r">${mm(k.total)}</td></tr>`).join('') || `<tr><td colspan="${span + 1}">No cabinets</td></tr>`}
    ${R.lines.map(l => `<tr class="line"><td></td><td colspan="${span - 1}">${esc(l.name)}</td><td class="r">${mm(l.amount)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="${span}">${esc(R.r.name)} total${showPaint && R.sq.total ? ` (includes ${sqft(R.sq.total)} sq ft paint)` : ''}</td><td class="r">${mm(R.total)}</td></tr></tfoot></table></section>`;
  const paint = showPaint ? `<section class="qp-side"><h2>Paint</h2><table><tbody>${PAINT_PARTS.filter(([k]) => po[k]).map(([k, l]) => `<tr><td>${l}${k === 'fronts' && po.bothSides ? ' (both faces)' : ''}</td><td class="r">${sqft(q.sq[k])} sq ft</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total painted surface</td><td class="r">${sqft(q.sq.total)} sq ft</td></tr></tfoot></table></section>` : '';
  return `<div class="qpage">
  <header class="qp-head"><div><h1>Quote</h1><div class="qp-job">${esc(S.job.name)}</div>${S.job.customer ? `<div class="qp-sub">For ${esc(S.job.customer)}</div>` : ''}</div>
    <div class="qp-meta"><div>${date}</div><div>${q.rooms.reduce((a, R) => a + R.cabs.length, 0)} cabinets, ${q.rooms.length} ${q.rooms.length === 1 ? 'room' : 'rooms'}</div></div></header>
  ${q.rooms.map(room).join('')}
  <table class="qp-totals"><tbody>${q.jobLines.map(l => `<tr><td>${esc(l.name)}</td><td class="r">${mm(l.amount)}</td></tr>`).join('')}
    <tr><td>Subtotal</td><td class="r">${mm(q.sub)}</td></tr>${q.markup && detail ? `<tr><td>Markup ${ps.markup}%</td><td class="r">${money(q.markup)}</td></tr>` : ''}${q.tax ? `<tr><td>Tax ${ps.tax}%</td><td class="r">${money(q.tax)}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td class="r">${money(q.total)}</td></tr></tbody></table>
  ${types.length ? `<section class="qp-side"><h2>Price per foot</h2><table><thead><tr><th>Type</th><th class="r">Linear ft</th><th class="r">Total</th><th class="r">Per ft</th></tr></thead><tbody>
    ${types.map(t => `<tr><td>${t.name}</td><td class="r">${ftLen(t.ft)}</td><td class="r">${mm(t.total)}</td><td class="r">${mm(t.rate)}</td></tr>`).join('')}</tbody></table></section>` : ''}
  ${paint}
  ${S.job.notes ? `<div class="qp-notes"><b>Notes</b>\n${esc(S.job.notes)}</div>` : ''}
  <div class="qp-foot">Prices from ${esc(ps.name)}. Sizes are width × height × depth in inches.</div></div>`;
}
const quoteOpts = () => [!!ui.qsDetail, ui.qsPaint !== false];
function quoteFile(ps) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(S.job.name)} quote</title><style>body{margin:0;background:#fff}${QUOTE_CSS}</style></head><body>${quoteDoc(ps, ...quoteOpts())}</body></html>`;
}
function showQuoteSheet() {
  let st = $('#quotecss'); if (!st) { st = document.createElement('style'); st.id = 'quotecss'; st.textContent = QUOTE_CSS; document.head.appendChild(st); }
  const [detail, paint] = quoteOpts(), el = $('#quotesheet');
  el.innerHTML = `<div class="lbbar"><b>Quote for ${esc(S.job.name)}</b><span class="note">Letter size, black on white. Print it, or pick Save as PDF in the print window.</span>
    <div class="row-actions">${toggleBtn('qs-detail', detail, 'Price breakdown')}${toggleBtn('qs-paint', paint, 'Paint sq ft')}<button class="btn primary" data-act="qs-print">${icon('print')}Print</button><button class="btn" data-act="qs-save">${icon('download')}Save quote file</button><button class="btn" data-act="qs-close">Close</button></div></div>
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
  if (a === 'price-view' || a === 'pov-clear' || a.startsWith('ps-') || a.startsWith('quote-') || a.startsWith('qs-')) { e.stopPropagation(); priceAction(a, el.dataset.id); }
}, true);
document.addEventListener('change', e => {
  const el = e.target.closest('[data-act-change="ps-pick"]'); if (!el) return;
  S.job.priceSheet = el.value; ui.psConfirm = false; save(); renderPricing();
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
  $('#tab-inserts').innerHTML = `<div class="pagehead"><div><h2>Inserts</h2><p>What each insert adds to a cabinet's price. Roll-outs and trays can also add a price for every piece in them. A job can use its own prices under Pricing › Edit prices.</p></div></div>
  <div class="card">${cardHead('Insert prices', '<span class="note">Used counts every cabinet in this job</span>')}<div class="tscroll"><table class="t"><thead><tr><th>Insert</th><th class="r">Used</th><th>Price each</th><th>Plus per piece</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
