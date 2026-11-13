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
const bidTakeoffItems = tk => (tk && tk.rows || []).filter(r => BID_SHELF(r) || BID_PRICED(r));

// Bid Reader's walls ({ len, turn } chained clockwise, islands free-standing) as Mozaik walls in inches, the
// same layout Bid Reader writes into the Mozaik job, so a room that only has shelves still gets its walls.
function bidWalls(walls) {
  const dir = a => { const r = a * Math.PI / 180; return [Math.round(Math.cos(r)), Math.round(Math.sin(r))]; };
  const out = walls.map(() => null), chain = walls.map((w, i) => i).filter(i => !walls[i].island);
  let ang = chain.length > 1 ? 90 : 0, x = 0, y = chain.length > 1 ? -(+walls[chain[0]].len || 0) : 0;
  chain.forEach(i => {
    const len = +walls[i].len || 0; out[i] = { len, x, y, ang };
    const [ux, uy] = dir(ang); x += ux * len; y += uy * len;
    ang = ((walls[i].turn === 'left' ? ang + 90 : ang - 90) + 360) % 360;
  });
  walls.forEach((w, i) => {
    if (!w.island) return;
    const len = +w.len || 0, f = out[(parseInt(w.faces) || 0) - 1] || out[chain[0]];
    if (!f) { out[i] = { len, x: 0, y: 0, ang: 0, hidden: true }; return; }
    const [ux, uy] = dir(f.ang), [rx, ry] = dir(f.ang - 90), a = (+w.along || 0) + len, d = +w.distance || 48;
    out[i] = { len, x: f.x + ux * a + rx * d, y: f.y + uy * a + ry * d, ang: (f.ang + 180) % 360, hidden: true };
  });
  return out.filter(w => w && w.len > 0).map(w => ({ ...w, thick: w.hidden ? 0 : NaN, height: NaN }));
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
  const done = { shelves: 0, priced: 0, unplaced: 0, noShelf: 0, rooms: 0 };
  const items = bidTakeoffItems(tk); if (!items.length) return done;
  const tkRoom = n => (tk.rooms || []).find(r => bidRoomKey(r.name) === bidRoomKey(n));
  const roomFor = n => {
    const name = String(n || '').trim() || 'Room';
    let rm = rooms.find(r => bidRoomKey(r.name) === bidRoomKey(name));
    if (rm) return rm;
    const t = tkRoom(name) || { walls: [] };
    rm = mozRooms({ rooms: [{ name, walls: bidWalls(t.walls || []), prods: [], appls: [], hwNames: {} }] })[0];
    if (+t.height > 0) { rm.wallHeight = +t.height; rm.walls.forEach(w => { w.height = +t.height; }); }
    rm.block = rooms.length + 1; rooms.push(rm); done.rooms++;
    return rm;
  };
  const lib = bidShelfLib(), cursor = {};
  items.forEach(r => {
    const rm = roomFor(r.room), qty = Math.max(1, Math.round(+r.qty || 1));
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
          let off = hasX ? +r.x : (cursor[key] || 0);
          // Shelves without a spot that would run past the wall's end start a new row 14" higher.
          if (!hasX && off > 0 && off + w > len(wl) + 0.1) { off = 0; cursor[key + 'up'] = (cursor[key + 'up'] || 0) + 14; }
          if (!hasX) y += cursor[key + 'up'] || 0;
          cursor[key] = Math.max(cursor[key] || 0, off + w + 2);
          at = { wall: wl.id, side, off: r3(off) };
          if (!given || !hasX) done.unplaced++;
          const c = newCab(S, lib, at.wall, at.side, at.off);
          Object.assign(c, { w, h, d, elev: r3(y), fromBid: true, notes: [r.code, r.material, r.notes].filter(Boolean).join(' · ') });
          rm.cabinets.push(c); done.shelves++;
        }
      });
      return;
    }
    if (BID_SHELF(r)) done.noShelf += qty;
    // Millwork, countertops and shelves with nothing to draw them with: a line on the Quote to put a price on.
    (rm.bidItems = rm.bidItems || []).push({ id: uid('bi'), code: r.code || '', name: bidName(r), cat: r.category || '', qty,
      size: bidSize(r), material: r.material || '', notes: r.notes || '', rate: '' });
    done.priced++;
  });
  return done;
}
function bidTakeoffNote(d) {
  if (!d) return '';
  const bits = [];
  if (d.shelves) bits.push(`${d.shelves} floating shel${d.shelves === 1 ? 'f' : 'ves'}${d.unplaced ? ` (${d.unplaced} without a spot on the bid, set along the longest wall)` : ''}`);
  if (d.priced) bits.push(`${d.priced} millwork or countertop line${d.priced === 1 ? '' : 's'} to price on Pricing › Quote`);
  if (d.noShelf) bits.push(`${d.noShelf} shel${d.noShelf === 1 ? 'f' : 'ves'} put on the Quote because the library has no floating shelf`);
  return bits.length ? ' From the bid: ' + bits.join(', ') + '.' : '';
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
