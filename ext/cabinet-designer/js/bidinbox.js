// Jobs from Bid Reader. Bid Reader's "Send to Cabinet Designer" drops "<job> - Cabinet Designer.zip" in
// Files › Cabinet Designer › From Bid Reader (the "inbox" in manifest.json). This reads that folder when the tab
// opens, comes back into view or gets focus, and once a minute, and imports each zip as a new job with
// importMozaik. The zip is a Mozaik job folder plus <job>/bid-reader-takeoff.json: every Build row of the
// takeoff in inches. From that file the floating shelves come in as the library's shelf product (Mozaik jobs
// can't carry them), and millwork and countertop rows go on Pricing › Quote as "From the bid" lines to price.
'use strict';
const BID_INBOX = 'Cabinet Designer/From Bid Reader', BID_DONE = BID_INBOX + '/Imported', BID_FAILED = BID_INBOX + '/Could not import';
// Jobs from bids go in their own folder on the Jobs screen, apart from sold work.
const BID_JOB_FOLDER = 'Bids';

/* ---------- The takeoff file inside the zip ---------- */
// The bid-reader-takeoff.json in what was picked (a zip, a zip in a zip, or the file itself), or null.
async function bidTakeoffOf(files) {
  const read = async (name, u8, depth) => {
    if (isZip(u8)) {
      if (depth > 2) return null;
      for (const f of await unzipTexts(u8.slice().buffer)) { const t = await read(f.name, f.data, depth + 1); if (t) return t; }
      return null;
    }
    if (!/(^|\/)bid-reader-takeoff\.json$/i.test(name)) return null;
    try { const t = JSON.parse(bytesText(u8)); return t && t.from === 'bid-reader' && Array.isArray(t.rows) ? t : null; } catch (_) { return null; }
  };
  for (const f of files) { const t = await read(f.name, new Uint8Array(await f.arrayBuffer()), 0); if (t) return t; }
  return null;
}
// Rows the takeoff brings that a Mozaik job can't: shelves are drawn, the rest are priced on the Quote.
const BID_SHELF = r => r.category === 'shelf';
const BID_PRICED = r => ['millwork', 'countertop', 'other', 'wood top'].includes(r.category) && !(r.category === 'wood top' && +r.W > 0);
// 0.57.0: and the rows Cabinet Designer now builds itself (desks, slat walls, microwave drawer bases... see bidPlan in bidprod.js).
const bidOwn = r => typeof bidPlan === 'function' && !!bidPlan(r);
// 0.63.86 (Ayden 2026-11-25: "have the appliances actually put in and sized correctly"; "you still dont understand
// windows"): Bid Reader's appliance and window rows become the real fixtures from the appliance library, placed and sized.
const BID_FIX = r => r && (r.category === 'appliance' || r.category === 'window');
const bidTakeoffItems = tk => (tk && tk.rows || []).filter(r => !BID_FIX(r) && (BID_SHELF(r) || BID_PRICED(r) || bidOwn(r)));
// The closest preset in the appliance library: its kind from the row's words, then the style words, then the nearest width.
function bidFixtPreset(r) {
  const t = [r.code, r.product, r.notes].filter(Boolean).join(' ').toLowerCase(), W = +r.W || 0, H = +r.H || 0;
  let kind = r.category === 'window' ? 'window' : '';
  if (!kind) kind = /dish ?washer|\bdw\b/.test(t) ? 'dw' : /hood|vent/.test(t) ? 'hood' : /micro|\bmw\b|\botr\b/.test(t) ? 'mw'
    : /cooktop|cook top|rangetop/.test(t) ? 'cooktop' : /wall oven|double oven|\boven\b(?!.*range)/.test(t) && !/range/.test(t) ? 'oven'
    : /range|stove/.test(t) ? 'range' : /under.?counter|beverage|wine|\buc\b/.test(t) && /fridge|refrig|cool|bev|wine/.test(t) ? 'ucfridge'
    : /fridge|refrig|\bref\b|freezer/.test(t) ? 'fridge' : /washer/.test(t) ? 'washer' : /dryer/.test(t) ? 'dryer' : /sink/.test(t) ? 'sink' : '';
  if (!kind || kind === 'sink') return null;
  let list = FIXT_LIB.filter(x => kind === 'cooktop' ? x.kind === 'sink' && x.cooktop : kind === 'mw' ? /microwave/i.test(x.folder || '') : kind === 'window' ? x.kind === 'window' : x.kind === kind);
  if (!list.length) return null;
  const words = [['side by side', /side.?by.?side|\bsxs\b|\bsbs\b/], ['french', /french/], ['bottom', /bottom/], ['slide', /slide/], ['free', /free.?stand/],
    ['pro', /\bpro\b|commercial/], ['under cabinet', /under.?cab/], ['chimney', /chimney|wall.?mount/], ['over the range', /otr|over.?the.?range/],
    ['countertop', /counter.?top/], ['induction', /induc/], ['gas', /\bgas\b/], ['single hung', /single.?hung/], ['picture', /picture/], ['casement', /casement/], ['(pr)', /panel.?ready|\(pr\)/]];
  const want = words.filter(([, re]) => re.test(t)).map(([w]) => w);
  const score = x => { const n = x.name.toLowerCase(); return want.filter(w => n.includes(w)).length * 1000 - (W ? Math.abs(x.w - W) : 0) - (H && kind !== 'window' ? Math.abs(x.h - H) / 10 : 0); };
  if (!want.length && kind === 'hood') list = list.filter(x => /under/i.test(x.name)).concat(list);
  if (!want.length && kind === 'range') list = list.filter(x => /free/i.test(x.name)).concat(list);
  if (!want.length && kind === 'mw') list = list.filter(x => /over the range/i.test(x.name)).concat(list);
  return list.slice().sort((a, b) => score(b) - score(a))[0];
}

// Bid Reader's walls ({ len, turn } chained clockwise, islands free-standing) as Mozaik walls in inches, the
// same layout Bid Reader writes into the Mozaik job, so a room that only has shelves still gets its walls.
// The 9" ADA toe only when a row asks for it (Bid Reader 0.31.0, miss #23): an ADA row is 32.5" high with a normal toe.
const ADA_TOE = /\bADA\s*toe|\b9\s*(?:"|in(?:ch)?\b)?\s*toe|\btoe(?:\s*kick)?\s*(?:of\s*|at\s*)?9\b/i;

// Wall end caps from Bid Reader (0.61.7, Ayden 2026-11-23: "the bid reader didnt see the wall end caps"): a wall's caps
// [{ where: 'start'|'end'|'along', x, out }] become its Left/Right end cap (capS/capE) or a custom cap. The reader measures x
// from the cap's face and gives the clear length between caps, so a free wall end with a cap grows by half a wall (the
// cap stands half outside the wall line) and the boxes on a wall with a start cap move along by the same amount.
const BID_CAP_E = 4.5 / 2;
const bidCapsOf = w => (Array.isArray(w && w.caps) ? w.caps : []).filter(c => c && ['start', 'end', 'along'].includes(c.where));
function bidWalls(walls) {
  const dir = a => { const r = a * Math.PI / 180; return [Math.round(Math.cos(r)), Math.round(Math.sin(r))]; };
  const out = walls.map(() => null), chain = walls.map((w, i) => i).filter(i => !walls[i].island);
  let ang = chain.length > 1 ? 90 : 0, x = 0, y = chain.length > 1 ? -(+walls[chain[0]].len || 0) : 0, maxX = 0;
  chain.forEach((i, k) => {
    // 0.60.0: a wall after an "end" starts a run of its own (a unit's bath after its kitchen), set 10' to the right of
    // everything so far instead of chained on (they ran into each other).
    if (k > 0 && walls[chain[k - 1]].turn === 'end') {
      const rest = chain.slice(k), stop = rest.findIndex(j => walls[j].turn === 'end'), seg = stop < 0 ? rest : rest.slice(0, stop + 1);
      ang = seg.length > 1 ? 90 : 0; x = maxX + 120; y = seg.length > 1 ? -(+walls[i].len || 0) : 0;
    }
    // Caps only stand at a free end: the start of a chain, or the end of its last wall.
    const caps = bidCapsOf(walls[i]), freeS = k === 0 || walls[chain[k - 1]].turn === 'end', freeE = k === chain.length - 1 || walls[i].turn === 'end';
    const capS = freeS && caps.find(c => c.where === 'start'), capE = freeE && caps.find(c => c.where === 'end');
    if (capS) { const [ux, uy] = dir(ang); x -= ux * BID_CAP_E; y -= uy * BID_CAP_E; }
    const len = (+walls[i].len || 0) + (capS ? BID_CAP_E : 0) + (capE ? BID_CAP_E : 0); out[i] = { len, x, y, ang };
    if (capS || capE || caps.some(c => c.where === 'along')) out[i].bidCaps = { shift: capS ? BID_CAP_E : 0, S: capS ? +capS.out || 26 : 0, E: capE ? +capE.out || 26 : 0,
      along: caps.filter(c => c.where === 'along' && +c.x > 0).map(c => ({ a: +c.x + (capS ? BID_CAP_E : 0), len: +c.out || 26 })) };
    const [ux, uy] = dir(ang); x += ux * len; y += uy * len; maxX = Math.max(maxX, x, out[i].x);
    ang = ((walls[i].turn === 'left' ? ang + 90 : ang - 90) + 360) % 360;
  });
  walls.forEach((w, i) => {
    if (!w.island) return;
    const len = +w.len || 0, f = out[(parseInt(w.faces) || 0) - 1] || out[chain[0]];
    if (!f) { out[i] = { len, x: 0, y: 0, ang: 0, hidden: true }; return; }
    const [ux, uy] = dir(f.ang), [rx, ry] = dir(f.ang - 90), a = (+w.along || 0) + len, d = +w.distance || 90;
    out[i] = { len, x: f.x + ux * a + rx * d, y: f.y + uy * a + ry * d, ang: (f.ang + 180) % 360, hidden: true };
  });
  return out.filter(w => w && w.len > 0).map(w => ({ ...w, thick: w.hidden ? 0 : NaN, height: NaN }));
}

// A native takeoff from Bid Reader (0.27.0 and later, "native": true): no Mozaik files, so the cabinets are made
// here from the rows, in the same shape the Mozaik reader gives, and go through the same placing (mozRooms):
// each row's category picks Base, Wall or Tall, its code, product and notes pick the closest library product,
// and its wall, X and height place it. Rows with no X line up along their wall in table order, like Bid Reader
// draws them. Rows Cabinet Designer builds itself or prices (shelves, millwork, tops, desks...) are left to
// bidTakeoffAdd as before. Inches throughout.
const BID_CAB_TYPE = { base: 1, drawer: 1, sink: 1, vanity: 1, wall: 2, tall: 3, panel: 0, filler: 0, door: 0 };
const BID_DEF = { 1: [24, 34.5, 24], 2: [30, 30, 12], 3: [24, 84, 24] };
function bidNativeData(tk) {
  const own = new Set(bidTakeoffItems(tk));
  const rows = (tk.rows || []).filter(r => !own.has(r) && r.category in BID_CAB_TYPE);
  const names = [...new Set([...(tk.rooms || []).map(r => r.name), ...rows.map(r => String(r.room || '').trim() || 'Room')])];
  const rooms = names.map(name => {
    const t = (tk.rooms || []).find(r => bidRoomKey(r.name) === bidRoomKey(name)) || { walls: [] };
    const mine = rows.filter(r => bidRoomKey(r.room || 'Room') === bidRoomKey(name));
    const tw = (t.walls || []).slice();
    // Cabinets with no wall (or a room with no walls) go on a see-through line, like Bid Reader's Mozaik job.
    // That includes pieces Cabinet Designer builds itself (open vanities, microwave bases, desks...), which need a wall too.
    const builds = [...own].filter(r => bidRoomKey(r.room || 'Room') === bidRoomKey(name) && (k => k === 'lib' || k === 'made')((bidPlan(r) || {}).kind));
    const loose = [...mine, ...builds].filter(r => !(parseInt(r.wall) > 0 && tw[parseInt(r.wall) - 1]));
    if (loose.length) {
      const len = Math.max(48, loose.reduce((a, r) => a + (+r.W || 24) * Math.max(1, Math.round(+r.qty || 1)), 0));
      tw.push({ len, island: true, faces: 1, along: 0, distance: 72 });
    }
    const walls = bidWalls(tw);
    if (+t.height > 0) walls.forEach(w => { w.height = +t.height; });
    const looseWall = loose.length ? walls.length : 0, cursor = {}, prods = [];
    const upTop = +t.soffit > 0 ? +t.soffit : (+t.height > 0 ? +t.height : 96) - 3;
    mine.forEach(r => {
      let type = BID_CAB_TYPE[r.category];
      const text = [r.code, r.product, r.notes].filter(Boolean).join(' ');
      // 0.60.0: a filler or panel with no height off the floor that butts an upper on its wall is an upper filler.
      const noElev = !(r.elev !== '' && r.elev != null && isFinite(+r.elev) && +r.elev >= 0);
      const butts = o => BID_CAB_TYPE[o.category] === 2 && String(o.wall) === String(r.wall) && o.x !== '' && o.x != null && r.x !== '' && r.x != null
        && (Math.abs(+r.x - (+o.x + +o.W)) < 0.3 || Math.abs(+o.x - (+r.x + (+r.W || 0.75))) < 0.3);
      if (!type) type = (+r.H || 0) >= 66 ? 3 : (+r.elev || 0) >= 40 ? 2 : noElev && (+r.H || 0) < 60 && mine.some(butts) ? 2 : 1;
      const [dw, dh, dd] = BID_DEF[type];
      let w = +r.W > 0 ? +r.W : dw, h = +r.H > 0 ? +r.H : dh, d = +r.D > 0 ? +r.D : dd;
      // 0.59.27: a panel is its thickness along the wall and its depth out from it; rows that give the depth as the width
      // (24 x 3/4) are turned round, and a panel with no width is 3/4" thick, so it doesn't push the run along 24".
      if (r.category === 'panel') { if (w > d && w > 6 && d <= 3) [w, d] = [d, w]; if (!(+r.W > 0)) w = 0.75; }
      const wi = parseInt(r.wall) > 0 && tw[parseInt(r.wall) - 1] ? parseInt(r.wall) : looseWall, back = +r.side === 2;
      // 0.60.0: uppers with no height given top out at the soffit, else 3" under the ceiling (LARKUL rule 1.5; was 84").
      const elev = r.elev !== '' && r.elev != null && isFinite(+r.elev) && +r.elev >= 0 ? +r.elev : type === 2 ? Math.max(0, upTop - h) : 0;
      const key = wi + ':' + back + ':' + (type === 2 ? 'up' : 'low');
      const hasX = r.x !== '' && r.x != null && isFinite(+r.x);
      const name = r.product || r.code || r.category;
      const sub = r.category === 'filler' ? 7 : r.category === 'panel' ? 9 : NaN;
      for (let k = 0; k < Math.max(1, Math.round(+r.qty || 1)); k++) {
        const shift = (walls[wi - 1] && walls[wi - 1].bidCaps && !back && walls[wi - 1].bidCaps.shift) || 0;
        const x = hasX && k === 0 ? +r.x + shift : (cursor[key] || shift);
        cursor[key] = Math.max(cursor[key] || 0, x + w);
        // 0.63.75: desc is the row's category, code and product only. The notes are the reader's own words ("the drawn 1"
        // corner filler is left out", "right end open", "over the microwave"), and the import read them as the product: a
        // sink base whose notes said "filler" was taken for a filler and dropped, uppers that said "2 shelves" became hoods.
        prods.push({ name, desc: [r.category, r.code, r.product].filter(Boolean).join(' '), w, h, d, x, y: NaN, elev, outset: 0, rot: 0, wall: wi, back,
          type: type, sub, num: 0, inserts: [], fronts: [], fromBid: true,
          notes: [r.code, r.material, r.notes].filter(Boolean).join(' · '), ada: ADA_TOE.test(text), ends: bidEnds(r.notes) });
      }
    });
    // Appliances and windows on a wall, as the real fixtures (sized from the row, else the preset).
    const appls = [];
    (tk.rows || []).filter(r => BID_FIX(r) && bidRoomKey(r.room || 'Room') === bidRoomKey(name)).forEach(r => {
      const wi = parseInt(r.wall) > 0 && tw[parseInt(r.wall) - 1] ? parseInt(r.wall) : 0, pre = bidFixtPreset(r);
      if (!wi || !pre || !(r.x !== '' && r.x != null && isFinite(+r.x))) return;
      const shift = (walls[wi - 1] && walls[wi - 1].bidCaps && +r.side !== 2 && walls[wi - 1].bidCaps.shift) || 0;
      const win = pre.kind === 'window', given = r.elev !== '' && r.elev != null && isFinite(+r.elev) && +r.elev >= 0;
      appls.push({ src: win ? 'fixt' : 'appl', pid: pre.id, name: r.product || pre.name, type: 0, wall: wi, back: +r.side === 2,
        w: +r.W > 0 ? +r.W : pre.w, h: +r.H > 0 ? +r.H : pre.h, d: win ? 0 : +r.D > 0 ? +r.D : pre.d, x: +r.x + shift, elev: given ? +r.elev : pre.elev || 0 });
    });
    return { name, walls, prods, appls, hwNames: {} };
  });
  return { rooms, jobName: tk.job || '', inches: true };
}

// Ends the bid draws covered (0.61.7): "finished end left", "end panel (R)", "FE both", "right end cap"... in a row's notes
// turn that end's panel to Always, so the applied end panel is built in either Draw mode. "Wall end cap" (a short wall,
// sent as the wall's end_caps) and "left end open" don't count.
const BID_END_WORD = '(?:(?:finished|fin\\.?|applied)\\s*ends?(?:\\s*panels?)?|end\\s*(?:panel|cap)s?|f\\.?\\s?e\\.?(?:\\s?p\\.?)?)';
const BID_END_RE = {
  L: new RegExp(`\\b${BID_END_WORD}\\s*(?:on\\s*(?:the\\s*)?|at\\s*(?:the\\s*)?|[-:(,]\\s*)?(?:left|lh|l)\\b|\\b(?:left|lh)\\s*(?:side\\s*)?${BID_END_WORD}(?![a-z])`, 'i'),
  R: new RegExp(`\\b${BID_END_WORD}\\s*(?:on\\s*(?:the\\s*)?|at\\s*(?:the\\s*)?|[-:(,]\\s*)?(?:right|rh|r)\\b|\\b(?:right|rh)\\s*(?:side\\s*)?${BID_END_WORD}(?![a-z])`, 'i'),
  both: new RegExp(`\\b${BID_END_WORD}\\s*(?:on\\s*)?(?:both(?:\\s*(?:ends|sides))?|l\\s*(?:&|and|\\/)\\s*r|left\\s*(?:&|and|\\/)\\s*right)\\b|\\bboth\\s*(?:ends|sides)\\s*(?:finished|panel(?:l?ed)?)\\b`, 'i'),
};
// The same words taken out of a row's text before it picks a library product, so "finished end right" never picks the
// Mozaik "Wall Right" filler for an upper.
const bidNoEndWords = t => ['both', 'L', 'R'].reduce((a, k) => a.replace(new RegExp(BID_END_RE[k].source, 'gi'), ' '), String(t || ''))
  .replace(/\b(?:left|right)\s*end\s*(?:open|exposed|bare)\b|\bwall\s*end\s*caps?\b/gi, ' ');
function bidEnds(notes) {
  const t = String(notes || '').replace(/\bwall\s*end\s*caps?\b/gi, ' ').replace(/\[rule\]/gi, ' ');
  if (!t.trim()) return null;
  const both = BID_END_RE.both.test(t), o = {};
  if (both || BID_END_RE.L.test(t)) o.panelL = 'on';
  if (both || BID_END_RE.R.test(t)) o.panelR = 'on';
  return o.panelL || o.panelR ? o : null;
}

// The library product floating shelves become: one in the Floating Shelves group, a "floating" one first.
function bidShelfLib() {
  const ok = S.library.filter(l => l.cat !== 'Shape' && (libGroup(l) === 'shelf' || /shel(f|ves)/i.test(l.name || '')));
  return ok.find(l => /floating/i.test(l.name)) || ok.find(l => libGroup(l) === 'shelf') || ok[0] || null;
}
const bidRoomKey = n => String(n || '').trim().toLowerCase();
const bidName = r => [r.code, r.product && r.product !== r.code ? r.product : ''].filter(Boolean).join(' ') || r.category || 'Item';
const bidSize = r => ['W', 'H', 'D'].map(k => +r[k] > 0 ? fmtLen(+r[k]) : '').filter(Boolean).join(' × ');

// Adds the takeoff's shelves and priced rows to the rooms just made from the Mozaik job (S is the new job).
// Rooms the Mozaik job didn't have (only shelves or millwork in them) are made from the takeoff's walls.
// Returns what it did, for the message after the import.
function bidTakeoffAdd(rooms, tk) {
  const done = { shelves: 0, priced: 0, unplaced: 0, noShelf: 0, rooms: 0, built: 0, lines: 0, sinks: 0, supports: 0, fridge: 0, options: [], exact: S.job.bidDraw === 'exact' };
  const items = bidTakeoffItems(tk); if (!items.length) return done;
  // The new rooms stand in for the job's while this runs, so room lookups (neighbours, sinks, tops) find them.
  const keepRooms = S.rooms; S.rooms = rooms;
  try { return bidTakeoffRows(rooms, tk, items, done); } finally { S.rooms = keepRooms; }
}
function bidTakeoffRows(rooms, tk, items, done) {
  if (typeof bidAfter === 'function') bidAfter(rooms, tk, done);
  const buildAt = {};
  const tkRoom = n => (tk.rooms || []).find(r => bidRoomKey(r.name) === bidRoomKey(n));
  const roomFor = n => {
    const name = String(n || '').trim() || 'Room';
    let rm = rooms.find(r => bidRoomKey(r.name) === bidRoomKey(name));
    if (rm) return rm;
    const t = tkRoom(name) || { walls: [] };
    rm = mozRooms({ rooms: [{ name, walls: bidWalls(t.walls || []), prods: [], appls: [], hwNames: {} }], inches: true })[0];
    if (+t.height > 0) { rm.wallHeight = +t.height; rm.walls.forEach(w => { w.height = +t.height; }); }
    rm.block = rooms.length + 1; rooms.push(rm); done.rooms++;
    return rm;
  };
  const lib = bidShelfLib(), cursor = {};
  items.forEach(r => {
    if (r._drawn) return;
    const rm = roomFor(r.room), qty = Math.max(1, Math.round(+r.qty || 1));
    const plan = typeof bidPlan === 'function' ? bidPlan(r) : null;
    if (plan && withRoom(rm, () => bidBuild(rm, r, plan, buildAt, done)) !== false) return;
    if (BID_SHELF(r) && lib && +r.W > 0) {
      withRoom(rm, () => {
        const walls = rm.walls.filter(w => !w.island);
        const wi = parseInt(r.wall) || 0, given = wi > 0 && rm.walls[wi - 1] ? rm.walls[wi - 1] : null;
        for (let k = 0; k < qty; k++) {
          const w = +r.W, h = +r.H > 0 ? +r.H : lib.h, d = +r.D > 0 ? +r.D : lib.d;
          const hasX = k === 0 && r.x !== '' && r.x != null && isFinite(+r.x), hasElev = r.elev !== '' && r.elev != null && isFinite(+r.elev);
          // Elev from Bid Reader is the bottom of the shelf; without one it hangs at the library product's height.
          // Copies of a row go side by side along the wall, 2" apart.
          const elev = hasElev ? +r.elev : (lib.elev || 54);
          let at, y = elev;
          const len = x => Math.hypot(x.x2 - x.x1, x.y2 - x.y1);
          // A room with no walls gets one see-through line for its shelves, long enough for all of them.
          if (!given && !walls.length && !rm.walls.length) {
            const all = items.filter(o => BID_SHELF(o) && bidRoomKey(o.room || 'Room') === bidRoomKey(rm.name)).reduce((a, o) => a + (+o.W + 2) * Math.max(1, Math.round(+o.qty || 1)), 0);
            mozIsland(rm, { rot: 0, x: 0, y: 0, w: Math.max(all, w), h: 0, elev: 96 - h });
          }
          const wl = given || walls.reduce((a, b) => (!a || len(b) > len(a) ? b : a), null) || rm.walls[0];
          const side = +r.side === 2 ? -1 : 1, key = wl.id + ':' + side;
          // X (from the bid, or the running cursor) is measured from the inside face of the left wall, like
          // "From left wall": the wall's thickness is behind 0, not in front of it (0.57.3; it sat half a wall in).
          const F = wallFaces(wl.id, side), room = F.hi - F.lo;
          let x = hasX ? +r.x : (cursor[key] || 0);
          // Shelves without a spot that would run past the wall's end start a new row 14" higher.
          if (!hasX && x > 0 && x + w > room + 0.1) { x = 0; cursor[key + 'up'] = (cursor[key + 'up'] || 0) + 14; }
          if (!hasX) y += cursor[key + 'up'] || 0;
          cursor[key] = Math.max(cursor[key] || 0, x + w + 2);
          at = { wall: wl.id, side, off: offFromLeft(wl.id, side, x, w) };
          if (!given || !hasX) done.unplaced++;
          const c = newCab(S, lib, at.wall, at.side, at.off);
          Object.assign(c, { w, h, d, elev: r3(y), fromBid: true, notes: [r.code, r.material, r.notes].filter(Boolean).join(' · ') });
          if (typeof isFloatShelf === 'function' && isFloatShelf(c)) bidShelfExtras(c, r);
          rm.cabinets.push(c); done.shelves++;
        }
      });
      return;
    }
    if (BID_SHELF(r)) done.noShelf += qty;
    // Millwork, countertops and shelves with nothing to draw them with: a line on the Quote to put a price on.
    (rm.bidItems = rm.bidItems || []).push({ id: uid('bi'), code: r.code || '', name: bidName(r), cat: r.category || '', qty,
      size: bidSize(r), material: r.material || '', notes: r.notes || '', rate: '', ...(r.by ? { by: r.by } : {}) });
    done.priced++;
  });
  if (done.exact) return done;
  rooms.forEach(rm => { done.supports += bidShelfSupports(rm); });
  if (typeof addFridgePanels === 'function' && lay().fridgePanels) rooms.forEach(rm => { done.fridge += addFridgePanels(rm).added; });
  return done;
}
// 0.59.27 (Ayden 2026-11-19: "the bid reader keeps putting shelves without panels"): floating shelves stacked one over another
// (a pantry niche, open shelving), or set over a base cabinet, need something at each end to stand against: a wall, a cabinet
// as tall as the shelves, or a finished support panel. Each open end gets a Support Panel (madeprod.js) butted against the
// shelves: from the floor when a cabinet stands under them (it covers that cabinet's end too), else from the lowest shelf,
// up to the top shelf, or to the top of the uppers on that wall when they are within 6" above it; as deep as the deepest
// shelf or the cabinet face under them. A single floating shelf on concealed brackets with nothing under it stands on its own.
// Returns how many panels it added.
// onlyBid: just shelves that came from a bid (the once-per-job fix for jobs imported before 0.59.27).
function bidShelfSupports(rm, onlyBid) {
  const lib = typeof libItem === 'function' && libItem('made-panel'); if (!lib || typeof isFloatShelf !== 'function') return 0;
  return withRoom(rm, () => {
    let added = 0;
    const stacks = [];
    S.cabinets.filter(c => isFloatShelf(c) && wall(c.wall) && (!onlyBid || c.fromBid)).forEach(c => {
      let g = stacks.find(s => s.wall === c.wall && s.side === c.side && Math.abs(s.off - c.off) < 0.5 && Math.abs(s.w - c.w) < 0.5);
      if (!g) stacks.push(g = { wall: c.wall, side: c.side, off: c.off, w: c.w, list: [] });
      g.list.push(c);
    });
    stacks.forEach(g => {
      const ids = new Set(g.list.map(c => c.id)), lo = Math.min(...g.list.map(c => c.elev)), hi = Math.max(...g.list.map(c => c.elev + c.h));
      const sd = Math.max(...g.list.map(c => (c.outset || 0) + c.d));
      const under = S.cabinets.filter(k => !ids.has(k.id) && k.wall === g.wall && k.side === g.side && !isFloatShelf(k) && !k.made
        && k.elev + k.h <= lo + 0.01 && k.off < g.off + g.w - 0.01 && k.off + k.w > g.off + 0.01);
      if (g.list.length < 2 && !under.length) return;
      [-1, 1].forEach(dir => {
        const edge = dir < 0 ? g.off : g.off + g.w;
        // What touches this end, shelf by shelf: every shelf needs a wall or something standing beside it.
        const near = g.list.map(c => obstacles(c.wall, c.side, c, c.id).filter(o => !ids.has(o.id)).map(o => ({ ...o, gap: dir < 0 ? edge - o.a1 : o.a0 - edge })).filter(o => o.gap > -0.01));
        const held = near.every(list => list.some(o => o.gap <= 1.01 && (o.kind !== 'cab' || !isFloatShelf(cab(o.id) || {}))));
        if (held) return;
        // No room for a panel (something within a panel's thickness): leave it, it's as good as butted.
        const t = (mat(finishMat(g.list[0])) || {}).thick || 0.75;
        if (near.some(list => list.some(o => o.gap > 0.01 && o.gap < t - 0.01))) return;
        // A cabinet under the shelves that runs on past this end: the panel stands on its countertop instead of the floor.
        const past = under.filter(k => dir < 0 ? k.off < edge - 0.5 : k.off + k.w > edge + 0.5);
        const tp = typeof countertop === 'function' ? countertop(roomSet('countertop')) || {} : {};
        const z0 = !under.length ? lo : past.length ? Math.max(...past.map(k => k.elev + k.h + (k.cat === 'Base' && !k.noTop && rm.autoTops !== false ? +tp.thick || 0 : 0))) : 0;
        const tops = S.cabinets.filter(k => k.wall === g.wall && k.side === g.side && k.cat === 'Wall' && !isFloatShelf(k) && k.elev + k.h > hi && k.elev + k.h <= hi + 6.01).map(k => k.elev + k.h);
        const z1 = tops.length ? Math.max(...tops) : hi;
        const d = Math.max(sd, ...under.filter(k => !past.includes(k)).map(k => faceOut(k)));
        const c = newCab(S, lib, g.wall, g.side, edge);
        Object.assign(c, { h: r3(z1 - z0), d: r3(d), elev: r3(z0), fromBid: true, notes: 'Support panel at the open end of the floating shelves (added on import)' });
        if (typeof madeSync === 'function') madeSync(c);
        if (dir < 0) c.off = r3(edge - c.w);
        S.cabinets.push(c);
        if (typeof conflicts === 'function' && conflicts(c)) { S.cabinets.pop(); return; }
        added++;
      });
    });
    return added;
  });
}
function bidTakeoffNote(d) {
  if (!d) return '';
  const bits = [];
  if (d.shelves) bits.push(`${d.shelves} floating shel${d.shelves === 1 ? 'f' : 'ves'}${d.unplaced ? ` (${d.unplaced} without a spot on the bid, set along the longest wall)` : ''}`);
  if (d.priced) bits.push(`${d.priced} millwork or countertop line${d.priced === 1 ? '' : 's'} to price on Pricing › Quote`);
  if (d.built) bits.push(`${d.built} piece${d.built === 1 ? '' : 's'} Cabinet Designer now builds itself (desks, panels, vanities, open shelving, microwave bases) (check where each one sits)`);
  if (d.lines) bits.push(`${d.lines} window sill${d.lines === 1 ? '' : 's'} on Pricing › Quote › Job lines to price by the foot`);
  if (d.sinks) bits.push(`${d.sinks} sink${d.sinks === 1 ? '' : 's'} set on sink bases for the countertop cutouts`);
  if ((d.options || []).length) bits.push(d.options.join(', '));
  if (d.supports) bits.push(`${d.supports} support panel${d.supports === 1 ? '' : 's'} at open ends of floating shelves`);
  if (d.fridge) bits.push(`${d.fridge} fridge panel${d.fridge === 1 ? '' : 's'} beside the fridges`);
  if (d.noShelf) bits.push(`${d.noShelf} shel${d.noShelf === 1 ? 'f' : 'ves'} put on the Quote because the library has no floating shelf`);
  const how = d.exact ? ' Drawn exactly as the bid: automatic end panels, fillers and fridge panels are off (switches in the item bar).' : '';
  // 0.60.0: the overlap check run on import (bidRules), listed in the job notes.
  const ov = d.overlaps ? (d.overlaps.length ? ` Overlap check: ${d.overlaps.length} thing${d.overlaps.length === 1 ? '' : 's'} to fix, listed in Job › Notes.` : ' Overlap check: no overlaps.') : '';
  return (bits.length ? ' From the bid: ' + bits.join(', ') + '.' : '') + how + ov;
}

/* ---------- Pricing the lines from the bid ---------- */
// The room's priced lines from the bid, for priceJob. Lines with no price yet stay off the total.
function bidPriceLines(r) {
  return (r.bidItems || []).filter(it => +it.rate > 0).map(it => ({ name: `${it.name}${it.size ? ` (${it.size})` : ''}, ${it.qty} × ${money(+it.rate)}`, amount: it.qty * +it.rate, bid: true }));
}
// Pricing › Quote card: every line from the bid with a price-each box.
function bidQuoteCard() {
  const rs = S.rooms.filter(r => (r.bidItems || []).length); if (!rs.length) return '';
  const left = rs.reduce((a, r) => a + r.bidItems.filter(it => !(+it.rate > 0)).length, 0);
  const row = (r, it) => `<tr><td>${esc(it.name)}${it.material ? ` <span class="muted">${esc(it.material)}</span>` : ''}${it.notes ? `<div class="note">${esc(it.notes)}</div>` : ''}</td><td>${esc(it.cat)}</td><td class="n">${esc(it.size)}</td><td class="n">${it.qty}</td>
    <td>${ctl('bidi:' + r.id + ':' + it.id, 'rate', it.rate, 'num', { label: 'Price each for ' + it.name, ph: '0.00' })}</td><td class="n">${+it.rate > 0 ? money(it.qty * +it.rate) : '–'}</td>
    <td><button class="btn sm" data-act="bidi-del" data-id="${r.id}:${it.id}" title="Take this line off the job">${icon('trash')}</button></td></tr>`;
  return `<div class="psec box prx-room" id="prx-room-bid">${secHead('list', 'From the bid', 'amber')}<div class="prx-roomh"><span class="note">Millwork, countertops and other rows from Bid Reader that aren't drawn. Each priced line goes in its room's total.${left ? ` ${left} still need${left === 1 ? 's' : ''} a price.` : ''} Countertops drawn on the cabinets are already priced from Tops; only price a countertop line here when it's extra.</span></div>
    <div class="tscroll"><table class="t quote"><thead><tr><th>Item</th><th>Type</th><th class="r">Size</th><th class="r">Qty</th><th>Price each</th><th class="r">Comes to</th><th></th></tr></thead>
    <tbody>${rs.map(r => `<tr><td colspan="7" class="grouprow"><b>${esc(r.name)}</b></td></tr>${r.bidItems.map(it => row(r, it)).join('')}`).join('')}</tbody></table></div></div>`;
}
function bidItemRef(id) {
  const [rid, iid] = id.split(':'), r = roomById(rid);
  return r && (r.bidItems || []).find(x => x.id === iid) || null;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act="bidi-del"]'); if (!b) return;
  const [rid, iid] = b.dataset.id.split(':');
  mutate(() => { const r = roomById(rid); if (r) r.bidItems = (r.bidItems || []).filter(x => x.id !== iid); });
});

/* ---------- Reading the inbox ---------- */
let bidBusy = false, bidAt = 0;
const bidFreeName = (names, name) => {
  if (!names.has(name)) return name;
  const m = name.match(/^(.*?)(\.[^.]+)?$/); let i = 2;
  while (names.has(`${m[1]} (${i})${m[2] || ''}`)) i++;
  return `${m[1]} (${i})${m[2] || ''}`;
};
async function checkBidInbox(force) {
  if (!inHub() || !S || bidBusy || (!force && Date.now() - bidAt < 3000)) return;
  // Not while something is being drawn or dragged; the next look picks it up.
  if (ui.drawing || ui.placing || ui.drawWalls) return;
  bidBusy = true; bidAt = Date.now();
  try {
    let list = []; try { list = (await Hub.files.list(BID_INBOX)) || []; } catch (_) { return; }
    const zips = list.filter(f => f.type !== 'folder' && f.type !== 'dir' && /\.zip$/i.test(f.name || f.path || ''));
    if (!zips.length) return;
    await Hub.files.mkdir(BID_DONE).catch(() => {});
    for (const f of zips) {
      // Moved to Imported first, so another window on the hub doesn't import it too.
      const done = new Set(((await Hub.files.list(BID_DONE).catch(() => [])) || []).map(x => x.name));
      const to = BID_DONE + '/' + bidFreeName(done, f.name);
      try { await Hub.files.rename(f.path, to); } catch (_) { continue; }
      let ok = null, why = '';
      try {
        const blob = await (await fetch(Hub.files.url(to) + '&_=' + Date.now(), { cache: 'no-store' })).blob();
        ok = await importMozaik([new File([blob], f.name, { type: 'application/zip' })], { folder: BID_JOB_FOLDER, from: 'Bid Reader' });
      } catch (e) { why = e.message; }
      if (!ok) {
        await Hub.files.mkdir(BID_FAILED).catch(() => {});
        const bad = new Set(((await Hub.files.list(BID_FAILED).catch(() => [])) || []).map(x => x.name));
        await Hub.files.rename(to, BID_FAILED + '/' + bidFreeName(bad, f.name)).catch(() => {});
        flash(`Could not import ${f.name} from Bid Reader${why ? ': ' + why : ''}. It was moved to Files › ${BID_FAILED.replace(/\//g, ' › ')}.`);
      }
    }
  } finally { bidBusy = false; }
}
(function watchBidInbox() {
  // Starts once the app has loaded its job; the hub keeps this page open while other tabs show.
  const start = () => {
    if (!S || typeof importMozaik !== 'function') return setTimeout(start, 500);
    if (!inHub()) return;
    checkBidInbox(true);
    setInterval(() => checkBidInbox(), 60000);
    addEventListener('focus', () => checkBidInbox());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkBidInbox(); });
    // The hub hides other tabs' pages rather than closing them, so coming into view means the tab was opened.
    try { new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) checkBidInbox(); }).observe(document.body); } catch (_) {}
  };
  start();
})();
