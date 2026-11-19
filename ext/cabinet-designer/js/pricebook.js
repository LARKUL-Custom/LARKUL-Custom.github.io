// Price book: the shop's current prices and shop defaults in one JSON file, kept up to date on its own, so Claude
// (Bid Reader, takeoff threads) can price a bid with the real numbers without asking for them each time.
// It holds the price sheets, installers, materials with their cost, door and drawer styles, hardware, tops,
// molding, the product library with default sizes, the job defaults, and a price for every library product at its
// library size on each price sheet. It is written to the hub library only, Files › Cabinet Designer › Price book ›
// price-book.json, on this PC (no GitHub or other remote copy).
// It is rebuilt when anything in it changes (checked when the tab opens and every 2 minutes), never on a timer alone.
'use strict';
const PB_DIR = 'Cabinet Designer/Price book', PB_FILE = 'price-book.json';
const pb = { at: '', hash: '', busy: false, err: '' };

// Library data without pictures (textures and thumbnails are data URLs and say nothing about price).
function pbClean(v) {
  return JSON.parse(JSON.stringify(v, (k, x) => {
    if (['texture', 'procedural', 'img', 'image', 'thumb', 'preview', 'svg', 'photo'].includes(k)) return undefined;
    if (typeof x === 'string' && x.length > 1500 && /^data:/.test(x)) return undefined;
    return x;
  }));
}
const pbHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; };

// What the book is made from: the shop's price sheets and installers, and the libraries of the open job (every
// job starts from the shop's libraries, and library edits are saved with it).
function pbSource() {
  const job = S.job || {};
  return pbClean({
    priceSheets: PRICES, installers: INSTALLERS,
    defaults: { wallHeight: job.wallHeight, wallThick: job.wallThick, params: job.params, defaults: job.defaults },
    materials: S.materials, matTemplates: S.matTemplates, doorStyles: S.doorStyles, doorTemplates: S.doorTemplates, panels: S.panels,
    hardware: (S.hardware || []).map(h => { const { cabHoles, boxOps, cupExtra, plateHoles, ...rest } = h; return rest; }),
    countertops: S.countertops, moldings: S.moldings,
    products: (S.library || []).filter(l => l.cat !== 'Shape').map(l => ({ id: l.id, name: l.name, cat: l.cat, group: typeof libGroup === 'function' ? libGroup(l) : '', w: l.w, h: l.h, d: l.d, elev: l.elev,
      ...(l.made ? { made: l.made } : {}), ...(l.folder ? { folder: l.folder } : {}), params: l.params, construction: l.construction })),
  });
}

// Each library product priced at its library size on every price sheet, in a scratch room that is never saved.
function pbProductPrices() {
  const out = [];
  const room = newRoom(uid('pb'), 'Price book', [{ id: uid('w'), x1: 0, y1: 0, x2: 2000, y2: 0, thick: 4.5, height: 96 }]);
  const keepRooms = S.rooms, keepId = S.roomId;
  S.rooms = [...keepRooms, room];
  try {
    withRoom(room, () => {
      (S.library || []).filter(l => l.cat !== 'Shape').forEach(l => {
        const row = { id: l.id, name: l.name, cat: l.cat, w: l.w, h: l.h, d: l.d, prices: {} };
        try {
          room.cabinets = [newCab(S, l, room.walls[0].id, 1, 0)];
          PRICES.forEach(ps => {
            try {
              const p = priceCab(room.cabinets[0], ps), r2 = v => Math.round((+v || 0) * 100) / 100;
              row.prices[ps.name || ps.id] = { total: r2(p.total), ...(p.own ? { own: true } : { box: r2(p.box), doors: r2(p.doors), extras: r2(p.extras), ends: r2(p.ends), hardware: r2(p.hardware), materials: r2(p.materials), paint: r2(p.paint), edgebanding: r2(p.banding) }),
                perFt: l.w ? r2(p.total / (l.w / 12)) : null };
            } catch (e) { row.prices[ps.name || ps.id] = { error: String(e.message || e).slice(0, 120) }; }
          });
        } catch (e) { row.error = String(e.message || e).slice(0, 120); }
        out.push(row);
      });
    });
  } finally { S.rooms = keepRooms; S.roomId = keepId; }
  return out;
}

function priceBook(src) {
  return {
    from: 'cabinet-designer', version: 1, cdVersion: (typeof APP_VERSION !== 'undefined' && APP_VERSION) || '',
    updated: new Date().toISOString(), job: (S.job || {}).name || '', units: 'inches and US dollars',
    readme: 'Cabinet Designer prices and defaults. productPrices = each library product at its library size on each price sheet, standing alone (both ends finished, so ends are high for a cabinet in a run), before job-level markup, tax, percent charges and installation (installers give install $/ft by Base/Wall/Tall). priceSheets hold markup, tax, labor adders, paint and top rates; materials hold sheet costs.',
    ...src, productPrices: pbProductPrices(),
  };
}

// Rebuilds and saves the book when its source changed (or force).
async function publishPriceBook(force) {
  if (!S || pb.busy || typeof inHub !== 'function' || !inHub()) return;
  if (typeof ui !== 'undefined' && (ui.drawing || ui.placing || ui.drawWalls)) return;
  let src;
  try { src = pbSource(); } catch (_) { return; }
  const hash = pbHash(JSON.stringify(src));
  if (!force && hash === pb.hash) return;
  pb.busy = true; pb.err = '';
  try {
    const book = priceBook(src), txt = JSON.stringify(book, null, 1);
    // The hub library copy: upload beside it, then swap it in.
    await Hub.files.mkdir('Cabinet Designer').catch(() => {});
    await Hub.files.mkdir(PB_DIR).catch(() => {});
    const [up] = await Hub.files.upload([new File([txt], 'saving.tmp', { type: 'application/json' })], PB_DIR, () => {});
    await Hub.files.delete(`${PB_DIR}/${PB_FILE}`).catch(() => {});
    await Hub.files.rename(up.path, `${PB_DIR}/${PB_FILE}`);
    pb.hash = hash; pb.at = book.updated;
    try { Hub.storage.set('pricebookHash', { hash, at: pb.at }).catch(() => {}); } catch (_) {}
  } catch (e) { pb.err = e.message || String(e); }
  finally { pb.busy = false; pbRefreshCard(); }
}

/* ---------- Pricing › Price book card ---------- */
function priceBookCard() {
  const when = v => v ? new Date(v).toLocaleString() : 'not yet';
  return `<div class="psec box" id="pb-card">${typeof secHead === 'function' ? secHead('link', 'Price book (for Claude)', 'teal') : '<h3>Price book (for Claude)</h3>'}
    <p class="note">Your current prices, materials, defaults and a price for every library product, kept up to date on their own so Claude can price bids with your real numbers. Saved to Files › Cabinet Designer › Price book › price-book.json on this PC each time something in them changes. It stays on this PC.</p>
    <p class="note">Last updated: <b>${esc(when(pb.at))}</b>${pb.err ? `<br><span class="warn">${esc(pb.err)}</span>` : ''}</p>
    <button class="btn sm primary" data-act="pb-now"${pb.busy ? ' disabled' : ''}>${pb.busy ? 'Saving…' : 'Update now'}</button></div>`;
}
function pbRefreshCard() {
  const el = document.getElementById('pb-card'); if (!el) return;
  const tmp = document.createElement('div'); tmp.innerHTML = priceBookCard(); el.replaceWith(tmp.firstElementChild);
}
function pbMount() {
  const main = document.querySelector('#tab-pricing .prx-body'); if (!main || document.getElementById('pb-card')) return;
  const tmp = document.createElement('div'); tmp.innerHTML = priceBookCard(); main.append(tmp.firstElementChild);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act="pb-now"]'); if (b) publishPriceBook(true);
});

(function watchPriceBook() {
  const start = async () => {
    if (!S || typeof PRICES === 'undefined' || !Array.isArray(PRICES) || !PRICES.length || typeof priceCab !== 'function') return setTimeout(start, 1000);
    if (typeof inHub !== 'function' || !inHub()) return;
    try { let v = await Hub.storage.get('pricebookHash'); v = v && v.value !== undefined ? v.value : v; if (v && typeof v === 'object') { pb.hash = String(v.hash || ''); pb.at = String(v.at || ''); } } catch (_) {}
    publishPriceBook(false);
    setInterval(() => publishPriceBook(false), 120000);
    // The Pricing tab is redrawn often; put the card back each time.
    const tab = document.getElementById('tab-pricing');
    if (tab) new MutationObserver(() => pbMount()).observe(tab, { childList: true });
    pbMount();
  };
  setTimeout(start, 3000);
})();
