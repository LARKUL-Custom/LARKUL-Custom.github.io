// Products and options Bid Reader found in bids that Cabinet Designer lacked (Ayden 2026-11-18, 0.57.0):
// appliance openings sized from the appliance (microwave drawer base, microwave shelf), an open vanity on legs,
// open shelf units, the ADA 9" toe kick, finished exteriors (laminate outside, melamine inside), concealed brackets
// and in-wall blocking on floating shelves, and a panel above tall cabinets that stop short of the ceiling.
// Everything here builds through the normal cabinet builder (build.js); this file only adds the products,
// the options and the few hooks the builder calls.
'use strict';

/* ---------- Appliances that set an opening ---------- */
// Cutout sizes, inches. Sharp's microwave drawers (SMD2470 / SMD3070) want a 15" tall opening; check the
// appliance's own install sheet on a real job, and add others here.
const APPL_OPEN = [
  { id: 'mwd30', name: 'Microwave drawer 30" (Sharp SMD3070)', kind: 'drawer', w: 28.25, h: 15, d: 23 },
  { id: 'mwd24', name: 'Microwave drawer 24" (Sharp SMD2470)', kind: 'drawer', w: 22.25, h: 15, d: 23 },
  { id: 'mw-ct', name: 'Countertop microwave, 24" (typical)', kind: 'shelf', w: 24, h: 14, d: 17 },
  { id: 'mw-ctl', name: 'Countertop microwave, large', kind: 'shelf', w: 25, h: 15, d: 20 },
];
const applOpen = id => APPL_OPEN.find(a => a.id === id) || null;
// Room around a countertop microwave on a shelf: 1" each side and on top for air.
const APPL_AIR = 1;
// The opening's front row height. The row's front edge runs from the fixed shelf the appliance stands on up to the
// stretcher (top row) or the next front's gap, so the clear opening comes out at the appliance's cutout height.
function applRowH(c, p, r, ri) {
  const a = applOpen(r.appl), t = (mat(cabMatT(cabSet(c, 'cabMatT')).carcass) || S.materials[0]).thick;
  return r3(a.h + t + (ri === 0 ? -p.frontTopReveal : p.frontGap));
}
// A shelf for a countertop microwave: a finished open box the appliance fits in with air round it.
function applShelfSize(a, t = 0.75) {
  const up = v => Math.ceil(v * 2) / 2;
  return { w: up(a.w + 2 * t + 2 * APPL_AIR), h: up(a.h + 2 * t + APPL_AIR), d: up(Math.max(12, a.d + 1)) };
}
// Picking an appliance (Size tab): a drawer opening row takes its height; a microwave shelf takes the appliance's size
// and stays tucked up under the uppers (its top where it was).
function setAppl(c, id) {
  const a = applOpen(id); c.appl = a ? id : '';
  if (!a) { (c.rows || []).forEach(r => { delete r.appl; }); return; }
  if (a.kind === 'drawer') {
    let r = (c.rows || []).find(x => x.appl) || (c.rows || []).find(x => x.type === 'open');
    if (!r) { r = { type: 'open', h: '*', count: 1 }; c.rows.unshift(r); }
    r.appl = id; r.type = 'open'; r.count = 1;
    return;
  }
  const t = (mat(cabMatT(cabSet(c, 'cabMatT')).carcass) || S.materials[0]).thick, s = applShelfSize(a, t), top = c.elev + c.h;
  c.w = s.w; c.h = s.h; c.d = s.d; if (c.cat === 'Wall') c.elev = r3(Math.max(0, top - s.h));
}

/* ---------- Microwave openings (0.58.29) ---------- */
// Ayden's Mozaik library (2026 Larkul) has two: "Microwave Upper Open" (Appliance Uppers), a wall cabinet with a pair
// of doors over an open bottom the microwave stands in on the cabinet bottom, and "Microwave drawer" (Base), an open top
// the microwave drawer sits in on a fixed shelf over a drawer. Each has a fixed shelf at the opening and a third nailer
// there. The open row is marked mw; its clear height (c.mwH, Size tab) sets the row, and the doors or drawer get the rest.
// Clear height = from the cabinet bottom (upper) or the fixed shelf (base) up to the fixed shelf (upper) or the top.
// Defaults are Mozaik's openings, rounded: 404.6 mm upper, 389.5 mm base.
const MW_CLEAR = { Wall: 16, Base: 15.375 };
// 'bottom' for an open row at the bottom of an upper (under doors), 'top' for one at the top of a base (over a drawer).
function mwSpot(c, i) {
  const rows = c.rows || [], r = rows[i];
  if (!r || !r.mw || r.type !== 'open' || rows.length < 2 || c.moz || c.made) return '';
  return i === rows.length - 1 ? 'bottom' : i === 0 ? 'top' : '';
}
const mwClear = c => +c.mwH > 0 ? +c.mwH : (MW_CLEAR[c.cat] || 16);
const mwT = c => (mat(cabMatT(cabSet(c, 'cabMatT')).carcass) || S.materials[0]).thick;
// The open row's front height for that clear height. Mozaik puts the fixed shelf's bottom face half a gap past the
// front edge next to it: under the doors' bottom edge on the upper (the doors cover the shelf), under the drawer's
// top edge on the base (the shelf shows in the opening).
function mwRowH(c, p, i) {
  const t = mwT(c), g = p.frontGap;
  return mwSpot(c, i) === 'bottom' ? r3(mwClear(c) - p.frontBottomReveal - g / 2 + t) : r3(mwClear(c) - p.frontTopReveal - 1.5 * g + 2 * t);
}
// The centre height of the fixed shelf under row i (front f), or null when row i has no microwave shelf.
function mwShelfZ(c, p, i, f, t) {
  if (!(c.rows || []).some(r => r.mw)) return null;
  const g = p.frontGap;
  if (mwSpot(c, i + 1) === 'bottom') return f.z0 - g / 2 + t / 2;
  if (mwSpot(c, i) === 'top') return f.z0 - 1.5 * g + t / 2;
  return null;
}

/* ---------- The products ---------- */
const R1 = (type, h, count = 1, x = {}) => ({ type, h, count, ...x });
function bidLibItems() {
  const con = cat => ({ toeKick: cat !== 'Wall', top: cat === 'Base' ? 'stretchers' : 'full' });
  const mk = (id, name, cat, w, h, d, elev, rows, params, x = {}) => ({ id, name, cat, w, h, d, elev, rows, params, construction: con(cat), ...x });
  const shelf = applShelfSize(applOpen('mw-ct'));
  return [
    // 1. Microwave drawer bases: Ayden's Mozaik one below (9.) replaced the first one, sized from a Sharp drawer (0.58.33).
    // 2. A vanity standing on legs: a drawer on top, open under it down to the bottom (the shelf). Seen all over, so finished.
    mk('b-vanity-legs', 'Open Vanity on Legs', 'Base', 30, 34.5, 21, 0, [R1('drawer', 6), R1('open', '*')], { shelfCount: 0, toeSkin: 'off', toeKickHeight: 6 }, { finished: true, finInt: true, wrap: true, folder: 'Vanities' }),
    mk('b-vanity-legs-sink', 'Open Vanity on Legs, Sink', 'Base', 30, 34.5, 21, 0, [R1('false', 6), R1('open', '*')], { shelfCount: 0, toeSkin: 'off', toeKickHeight: 6 }, { finished: true, finInt: true, wrap: true, sinkOn: 'sk-bath', folder: 'Vanities' }),
    // 7. Open shelving, wrapped in the finish material inside and out; shelves per opening on the Interior tab.
    mk('t-open-pantry', 'Open Shelf Unit, Tall', 'Tall', 30, 84, 16, 0, [R1('open', '*', 1, { shelves: 5 })], { shelfCount: 5 }, { finished: true, finInt: true, wrap: true, folder: 'Open Shelving' }),
    mk('b-open-shelf', 'Open Shelf Unit, Base', 'Base', 30, 34.5, 16, 0, [R1('open', '*', 1, { shelves: 1 })], { shelfCount: 1 }, { finished: true, finInt: true, wrap: true, folder: 'Open Shelving' }),
    mk('w-open-shelf', 'Open Shelf Unit, Wall', 'Wall', 30, 30, 12, 54, [R1('open', '*', 1, { shelves: 2 })], { shelfCount: 2 }, { finished: true, finInt: true, wrap: true, folder: 'Open Shelving' }),
    // 8. A microwave shelf hung under the uppers: an open box sized from the appliance, wrapped all round.
    // 9. Ayden's Mozaik microwave cabinets (sizes from the 2026 Larkul library): the opening height is set on the Size tab.
    mk('w-mw-upper', 'Microwave Upper Open', 'Wall', 24, 36, 14, 54, [R1('door', '*', 2), R1('open', 16.5, 1, { mw: true })], { shelfCount: 1 }, { folder: 'Appliance Uppers' }),
    mk('b-mw-drawer', 'Microwave Drawer', 'Base', 27, 34.5, 24, 0, [R1('open', 16.5, 1, { mw: true }), R1('drawer', '*')], { shelfCount: 0 }, { folder: 'Appliance Bases' }),
    // ADA: 32 1/2" tall with a 9" toe kick, so a 1 1/2" laminate top comes out at 34".
    mk('b-mw-drawer-ada', 'Microwave Drawer ADA', 'Base', 27, 32.5, 24, 0, [R1('open', 16.5, 1, { mw: true }), R1('drawer', '*')], { shelfCount: 0, ada: 'on' }, { folder: 'Appliance Bases' }),
    // Pocket door cabinets (Ayden 2026-11-23): the doors swing open and slide back into pockets inside (pocket.js).
    mk('t-pocket', 'Pocket Door Tall', 'Tall', 36, 84, 24, 0, [R1('door', '*', 2)], { shelfCount: 3 }, { pocket: 'on', folder: 'Pocket Doors' }),
    mk('b-pocket', 'Pocket Door Base', 'Base', 36, 34.5, 24, 0, [R1('door', '*', 2)], { shelfCount: 1 }, { pocket: 'on', folder: 'Pocket Doors' }),
    mk('w-mw-shelf', 'Microwave Shelf', 'Wall', shelf.w, shelf.h, shelf.d, r3(54 - shelf.h), [R1('open', '*')], { shelfCount: 0 }, { appl: 'mw-ct', finished: true, finInt: true, wrap: true, folder: 'Open Shelving' }),
  ];
}
// Added to a job's library once each, like the Mozaik products; a product deleted from the library stays deleted.
function ensureBidLib(s) {
  if (!s) return s;
  const lib = s.libSet && s.libSet !== 'main' ? ((s.libSets = s.libSets || {}).main = s.libSets.main || []) : (s.library = s.library || []);
  const had = new Set(s.bidLibKeys || []);
  bidLibItems().forEach(l => { if (had.has(l.id)) return; had.add(l.id); if (!lib.some(x => x.id === l.id)) lib.push(l); });
  // 0.58.33 (Ayden 2026-11-19): the first Microwave Drawer Base and its ADA copy leave the library once; cabinets
  // already placed from them keep building as they were.
  if (!had.has('-mwd30')) { had.add('-mwd30'); for (let i = lib.length - 1; i >= 0; i--) if (['b-mwd30', 'b-mwd30-ada'].includes(lib[i].id)) lib.splice(i, 1); }
  s.bidLibKeys = [...had];
  if (typeof ensureMadeLib === 'function') ensureMadeLib(s, lib);
  if (typeof ensureLamTop === 'function') ensureLamTop(s);
  if (typeof ensureCmold === 'function') ensureCmold(s);
  if (typeof ensureEndgrainTop === 'function') ensureEndgrainTop(s);
  return s;
}

/* ---------- Options ---------- */
// ADA toe kick: 9" high and at least 6" deep, wherever the cabinet's own toe height says otherwise.
function adaParams(o) { if (o.ada === 'on') { o.toeKickHeight = 9; o.toeKickSetback = Math.max(6, +o.toeKickSetback || 0); } return o; }
// Finished exterior (laminate outside, melamine inside): exposed ends are cut from the Finish material instead of
// getting an applied end panel, and a wall cabinet's bottom is finished too.
const finExterior = c => !c.moz && !c.made && effParams(c).exterior === 'finish';
// Ceiling over a cabinet; mainui.js has the real one (it follows a sloped ceiling).
const ceilingOver = c => typeof ceilOver === 'function' ? ceilOver(c) : (wall(c.wall) || {}).height || 96;
const ABOVE_MAX = 18;

// Called by buildParts just before finished parts take the Finish material.
function bidBuildExtras(c, parts, warn, part, x) {
  const p = x.p;
  if (finExterior(c) && c.cat === 'Wall') { const b = parts.find(q => q.cabId === c.id && q.name === 'Bottom'); if (b) b.finEnd = true; }
  if (p.ada === 'on' && x.legs) warn.push(`ADA toe kick: the legs have to reach ${fmtLen(p.toeKickHeight, 1)}. Check the leg's range, or use the ladder base.`);
  // A panel from the top of a tall cabinet up to the ceiling when the gap is under 18" (Ayden's bids call for it).
  if (p.abovePanel === 'on' && c.cat === 'Tall' && c.wall) {
    const gap = r3(ceilingOver(c) - (c.elev + c.h));
    if (gap > 0.25 && gap < ABOVE_MAX) {
      const fm = mat(finishMat(c)) || x.cm;
      part('Panel above', fm, r3(c.w), gap, { kind: 'filler' }).fin = true;
    }
  }
}
// Floating shelves (Mozaik shelf products): concealed brackets and in-wall blocking, each its own line.
const SHELF_BRK = 'Concealed floating shelf bracket', BLOCKING = 'In-wall blocking (floating shelf)';
const isFloatShelf = c => !!(c && c.moz && typeof mozDef === 'function' && (mozDef(c.moz) || {}).group === 'shelf');
function shelfExtras(c, b) {
  if (!isFloatShelf(c)) return b;
  const n = Math.max(0, +c.shelfBrk | 0);
  if (n) b.bom[SHELF_BRK] = (b.bom[SHELF_BRK] || 0) + n;
  if (c.blocking) b.bom[BLOCKING] = (b.bom[BLOCKING] || 0) + 1;
  return b;
}
// Their price, on top of an own-priced shelf: each bracket and the blocking from the sheet's Adders.
function shelfExtrasPrice(c, ps) {
  if (!isFloatShelf(c)) return 0;
  const ad = ps.adders || {};
  return Math.max(0, +c.shelfBrk | 0) * (+ad.perBracket || 0) + (c.blocking ? +ad.perBlocking || 0 : 0);
}

/* ---------- Size tab ---------- */
function bidSizeBox(c) {
  if (c.made) return typeof madeBox === 'function' ? madeBox(c) : '';
  const R = 'cab:' + c.id; let s = '';
  const hasOpen = (c.rows || []).some(r => r.type === 'open'), mwI = (c.rows || []).findIndex((r, i) => mwSpot(c, i));
  if (mwI >= 0) {
    const up = mwSpot(c, mwI) === 'bottom';
    s += `<div class="psec box">${secHead('box', 'Microwave opening', 'violet')}<div class="grid2">${fld('Opening height', R, 'mwH', mwClear(c), 'len')}</div>
      <div class="note">Clear height ${up ? 'from the cabinet bottom up to the fixed shelf. The doors above' : 'from the fixed shelf up to the top. The drawer below'} get the rest.</div></div>`;
  } else if (c.appl || (hasOpen && !c.moz)) {
    const list = APPL_OPEN.filter(a => c.cat === 'Wall' ? a.kind === 'shelf' : a.kind === 'drawer');
    s += `<div class="psec box">${secHead('box', 'Appliance in the opening', 'violet')}<div class="grid2">${fld('Appliance', R, 'appl', c.appl || '', 'select', { options: [{ v: '', l: 'None' }, ...list.map(a => ({ v: a.id, l: a.name }))] })}</div>
      <div class="note">${c.appl ? (c.cat === 'Wall' ? 'The shelf is sized to fit it with 1" of air round it.' : 'The open row is sized to its cutout, on a fixed shelf.') : 'Pick one and the opening is sized to it.'}</div></div>`;
  }
  if (isFloatShelf(c)) {
    s += `<div class="psec box">${secHead('shelf', 'Brackets and blocking', 'violet')}<div class="grid2">${fld('Concealed brackets', R, 'shelfBrk', c.shelfBrk || 0, 'int')}<label class="f"><span>In-wall blocking</span>${ctl(R, 'blocking', !!c.blocking, 'bool', { label: 'In-wall blocking' })}</label></div>
      <div class="note">Each goes on the hardware list and is priced from Pricing › Adders.</div></div>`;
  }
  if (c.cat === 'Base' && !c.moz) {
    const sk = typeof fixtList === 'function' ? fixtList().find(f => fixtSink(f) && f.wall === c.wall && f.side === c.side && f.off + f.w / 2 > c.off && f.off + f.w / 2 < c.off + c.w) : null;
    s += `<div class="psec box">${secHead('plan', 'Sink cutout', 'violet')}<div class="row-actions">${sk ? `<span class="note">${esc(fixtName(sk))} sits on this cabinet; the countertop is cut for it.</span>` : `<button class="btn sm" data-act="bid-sink" data-id="${c.id}">${icon('plus')}Add a sink on this cabinet</button>`}</div></div>`;
  }
  return s;
}
// A sink centred on a base cabinet, so the top over it gets its cutout.
function sinkOnCab(c, pid) {
  if (!c || !c.wall || typeof fixtNew !== 'function') return null;
  const want = pid || (/vanit/i.test(c.name || '') || c.d < 22 ? 'sk-bath' : c.w >= 33 ? 'sk-um2' : 'sk-um1');
  const f = fixtNew(want); if (!f) return null;
  f.w = Math.min(f.w, Math.max(10, c.w - 6)); f.wall = c.wall; f.side = c.side; f.off = r3(c.off + (c.w - f.w) / 2);
  S.fixtures = S.fixtures || []; S.fixtures.push(f); return f;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act="bid-sink"]'); if (!b) return;
  const c = cab(b.dataset.id); if (!c) return;
  mutate(() => { sinkOnCab(c); });
});

/* ---------- Bid Reader rows onto these products ---------- */
// Bid Reader's takeoff rows (bid-reader-takeoff.json) that Cabinet Designer now builds itself. Bid Reader 0.25.0 and later
// marks the cabinet rows it leaves out of the Mozaik job for this (row.cd); rows a Mozaik job never carries (millwork,
// countertops, shelves, other) are always ours. Returns { kind, ... } or null.
const bidTxt = r => [r.code, r.product, r.notes, r.material].filter(Boolean).join(' ').toLowerCase();
const bidNum = (t, rx) => { const m = t.match(rx); return m ? +m[1] : null; };
// Feet and inches as written on plans: 1'-0", 12", 6'.
function bidLen(s) {
  const m = String(s || '').match(/(\d+(?:\.\d+)?)\s*'\s*-?\s*(\d+(?:\.\d+)?)?\s*"?/); if (m) return +m[1] * 12 + (+m[2] || 0);
  const n = String(s || '').match(/(\d+(?:\.\d+)?)\s*"/); return n ? +n[1] : null;
}
function bidPlan(r) {
  const t = bidTxt(r), cat = r.category || '', H = +r.H || 0, ada = /\bada\b|accessib/.test(t);
  const ours = !!r.cd || ['millwork', 'countertop', 'shelf', 'other', 'wood top'].includes(cat);
  if (/window\s*sill|\bsills?\b/.test(t)) return { kind: 'sill' };
  if (/\bcrown\b/.test(t) && !/cabinet|box/.test(cat)) return { kind: 'crown' };
  if (!ours) return null;
  if (/microwave\s*drawer|\bmwd\b|mw\s*drawer/.test(t)) return { kind: 'lib', lib: ada ? 'b-mw-drawer-ada' : 'b-mw-drawer' };
  if (/microwave|\bmw\b/.test(t) && /shelf|open/.test(t)) return { kind: 'lib', lib: 'w-mw-shelf', appl: 'mw-ct' };
  if (/wall[- ]?hung|rakks|\behv\b|vanity\s*(counter)?top|lav(atory)?\s*top/.test(t) && /vanity|lav|ada|top|counter/.test(t)) return { kind: 'made', made: 'adatop', sink: /sink|lav|bowl/.test(t) };
  if (/vanity/.test(t) && /legs?|open/.test(t)) return { kind: 'lib', lib: /sink|lav|bowl/.test(t) ? 'b-vanity-legs-sink' : 'b-vanity-legs' };
  if (/\bslat/.test(t)) return { kind: 'made', made: 'slatwall' };
  if (/privacy|divider\s*panel/.test(t)) return { kind: 'made', made: 'privacy', radius: bidLen((t.match(/(\d+'\s*-?\s*\d*"?|\d+")\s*(radius|rad\b|r\b)/) || t.match(/radius\s*(?:of)?\s*(\d+'\s*-?\s*\d*"?|\d+")/) || [])[1]) };
  if (/\bdesk\b/.test(t) && !/reception|teller|banker|check[- ]writing|transaction/.test(t)) return { kind: 'made', made: 'desk' };
  if (/open\s*shel(f|v)|pantry\s*shel|shelf\s*unit|open\s*pantry/.test(t) && cat !== 'shelf') return { kind: 'lib', lib: H > 60 ? 't-open-pantry' : (+r.elev || 0) > 40 || cat === 'wall' ? 'w-open-shelf' : 'b-open-shelf', shelves: bidNum(t, /(\d+)\s*(?:adj(?:ustable)?\.?\s*)?shel/) };
  return null;
}
// Bid-wide options read from the rows' text: laminate outside / melamine inside, a panel above tall cabinets.
const bidExterior = r => /laminate\s*(ext|out)|(ext|out)\w*\s*(p\.?\s*)?lam|melamine\s*(int|in)/.test(bidTxt(r));
const bidAbove = r => /panel\s*above|above\s*tall|to\s*(the\s*)?ceiling/.test(bidTxt(r)) && /panel|lam/.test(bidTxt(r));
// Where a row goes: its wall and X from the bid, else along the longest wall after what's there.
function bidSpot(rm, r, w, cursor) {
  const walls = rm.walls.filter(x => !x.island), len = x => Math.hypot(x.x2 - x.x1, x.y2 - x.y1);
  const wi = parseInt(r.wall) || 0, given = wi > 0 && rm.walls[wi - 1] ? rm.walls[wi - 1] : null;
  const side = +r.side === 2 ? -1 : 1, hasX = r.x !== '' && r.x != null && isFinite(+r.x);
  // Without a spot on the bid: the first wall, longest first, with room left at its end for it.
  // X runs from the inside face of the viewer's left wall, like "From left wall" (0.57.3: it was from the wall's centerline end,
  // so a shelf at X 0 sat half the corner wall's thickness inside it).
  const room = x => { const f = wallFaces(x.id, side); return f.hi - f.lo; };
  const after = x => Math.max(cursor[x.id + ':' + side] || 0, (u => u ? u + 2 : 0)(rm.cabinets.filter(c => c.wall === x.id && c.side === side && (r.lvl === 'up' ? c.cat !== 'Base' : c.cat !== 'Wall')).reduce((a, c) => Math.max(a, fromEnd(c, 'L') + c.w), 0)));
  const byLen = walls.slice().sort((a, b) => len(b) - len(a));
  const wl = given || byLen.find(x => after(x) + w <= room(x) + 0.01) || byLen[0] || rm.walls[0];
  if (!wl) return null;
  const key = wl.id + ':' + side;
  const x = hasX && given ? +r.x : (after(wl) + w <= room(wl) + 0.01 ? after(wl) : 0);
  cursor[key] = Math.max(cursor[key] || 0, x + w + 2);
  return { wall: wl.id, side, off: offFromLeft(wl.id, side, x, w), placed: !!given && hasX };
}
// Builds one planned row in room rm (S.rooms holds the new rooms while this runs). Returns what it made, for the note.
function bidBuild(rm, r, plan, cursor, done) {
  const qty = Math.max(1, Math.round(+r.qty || 1)), W = +r.W > 0 ? +r.W : 0, H = +r.H > 0 ? +r.H : 0, D = +r.D > 0 ? +r.D : 0;
  const elev = r.elev !== '' && r.elev != null && isFinite(+r.elev) ? +r.elev : null;
  if (plan.kind === 'sill') {
    if (typeof addJobLine === 'function') addJobLine({ name: 'Window sill' + (rm.name ? ` (${rm.name})` : ''), unit: 'ft', qty, len: W || 36, rate: '', material: r.material || (/solid\s*surf|\bss-?\d/i.test(bidTxt(r)) ? 'Solid surface' : '') , fromBid: true });
    done.lines++; return;
  }
  if (plan.kind === 'crown') {
    // A crown run along the tops of the uppers: every wall cabinet in the room, priced by the foot.
    const m = bidCrown(r); let n = 0;
    rm.cabinets.forEach(c => { if (c.cat === 'Wall' && !c.moz && !c.made && !c.wrap) { c.molding = m.id; n++; } });
    rm.settings = rm.settings || {}; rm.settings.molding = m.id;
    done.options.push(n ? `crown (${m.name}) on ${n} upper${n === 1 ? '' : 's'} in ${rm.name}` : `crown (${m.name}) set for ${rm.name}; no uppers to put it on yet`);
    return;
  }
  const lib = libItem(plan.kind === 'made' ? 'made-' + plan.made : plan.lib); if (!lib) return false;
  for (let k = 0; k < qty; k++) {
    const w0 = W || lib.w, at = bidSpot(rm, k ? { ...r, x: '' } : r, plan.made === 'privacy' ? 1 : w0, cursor); if (!at) return false;
    const c = newCab(S, lib, at.wall, at.side, at.off);
    Object.assign(c, { fromBid: true, notes: [r.code, r.material, r.notes].filter(Boolean).join(' · ') });
    if (plan.made === 'privacy') { if (D || W) c.d = D > 3 ? D : W || c.d; if (H) c.h = H; if (plan.radius) c.mp = { ...c.mp, radius: plan.radius }; }
    else if (plan.made === 'slatwall') { if (W) c.w = W; if (H) c.h = H; }
    else if (plan.made === 'adatop') { if (W) c.w = W; if (D) c.d = D; c.mp = { ...c.mp, sink: plan.sink ? 'sk-bath' : '' }; }
    else { if (W) c.w = W; if (D) c.d = D; if (H && plan.made !== 'desk' && plan.lib !== 'w-mw-shelf') c.h = H; if (H && plan.made === 'desk') c.h = H; }
    if (plan.appl) { c.appl = plan.appl; if (plan.lib === 'w-mw-shelf') { const prev = c.elev + c.h; setAppl(c, plan.appl); c.elev = elev != null ? elev : r3(prev - c.h); } }
    // A microwave shelf without a spot goes under an upper wide enough that has nothing under it yet.
    if (plan.lib === 'w-mw-shelf' && !at.placed) {
      const up = rm.cabinets.find(u => u.cat === 'Wall' && !u.wrap && !u.moz && u.w >= c.w && !rm.cabinets.some(o => o !== u && o.wall === u.wall && o.side === u.side && o.wrap && o.off < u.off + u.w && o.off + o.w > u.off));
      if (up) { c.wall = up.wall; c.side = up.side; c.off = r3(up.off + (up.w - c.w) / 2); c.elev = r3(up.elev - c.h); }
    }
    if (plan.shelves) c.rows = c.rows.map(x => x.type === 'open' ? { ...x, shelves: plan.shelves } : x);
    if (elev != null && plan.lib !== 'w-mw-shelf' && !(plan.made === 'desk')) c.elev = elev;
    if (typeof madeSync === 'function') madeSync(c);
    rm.cabinets.push(c); done.built++; if (!at.placed) done.unplaced++;
    if (lib.sinkOn) withRoom(rm, () => sinkOnCab(c, lib.sinkOn));
  }
}
// The crown molding for a row: one named for crown, its material from the row's when the materials list has it.
function bidCrown(r) {
  let m = S.moldings.find(x => /crown/i.test(x.name) && x.fromBid) || S.moldings.find(x => x.profile === 'crown') || S.moldings[0];
  const want = String(r.material || '').trim(), mm = want && S.materials.find(x => x.name.toLowerCase().includes(want.toLowerCase()) || want.toLowerCase().includes(x.name.toLowerCase()));
  if (mm && m.mat !== mm.id) { m = { ...clone(m), id: uid('mo'), name: `${m.name}, ${mm.name}`, mat: mm.id, fromBid: true }; S.moldings.push(m); }
  return m;
}
// After the rows: options that apply room by room, laminate counters, sinks on sink bases, floating shelf brackets.
function bidAfter(rooms, tk, done) {
  const rows = tk.rows || [], key = n => String(n || '').trim().toLowerCase();
  rooms.forEach(rm => withRoom(rm, () => {
    const mine = rows.filter(r => key(r.room || 'Room') === key(rm.name));
    if (mine.some(r => bidExterior(r))) {
      let n = 0; rm.cabinets.forEach(c => { if (c.cat === 'Wall' && !c.moz && !c.made) { c.params = { ...(c.params || {}), exterior: 'finish' }; n++; } });
      if (n) done.options.push(`laminate outside / melamine inside on ${n} upper${n === 1 ? '' : 's'} in ${rm.name} (pick the laminate as the Finish)`);
    }
    if (mine.some(r => bidAbove(r))) { rm.params = { ...(rm.params || {}), abovePanel: 'on' }; done.options.push(`panels above tall cabinets in ${rm.name}`); }
    // Laminate counters drawn on the cabinets: the shop's laminate top on 2 layers of ply.
    const tops = mine.filter(r => r.category === 'countertop' && !bidPlan(r));
    if (tops.some(r => /p\.?\s*lam|plastic\s*lam|laminate|\bpl-?\d|formica|wilsonart/.test(bidTxt(r))) && rm.cabinets.some(c => c.cat === 'Base') && S.countertops.some(t => t.id === 'top-lam2')) {
      rm.settings = { ...(rm.settings || {}), countertop: 'top-lam2' }; rm.autoTops = true; done.options.push(`laminate tops on 2 layers of ply in ${rm.name}`);
      tops.forEach(r => { r._drawn = true; });
    }
    // Every sink base gets a sink, so the top over it is cut for it.
    rm.cabinets.forEach(c => {
      if (c.cat !== 'Base' || !/sink|lav/i.test(c.name || '') || !c.wall) return;
      const has = (rm.fixtures || []).some(f => fixtSink(f) && f.wall === c.wall && f.side === c.side && f.off + f.w / 2 > c.off && f.off + f.w / 2 < c.off + c.w);
      if (!has && sinkOnCab(c)) done.sinks++;
    });
  }));
}
// A floating shelf from the bid: its concealed bracket count (from the notes, else one per 16" stud, 2 at least) and blocking.
function bidShelfExtras(c, r) {
  const t = bidTxt(r), n = bidNum(t, /(\d+)\s*(?:\)\s*)?(?:concealed\s*|hidden\s*|floating\s*)?(?:shelf\s*)?brackets?/);
  c.shelfBrk = n || Math.max(2, Math.round(c.w / 16)); c.blocking = true;
}
