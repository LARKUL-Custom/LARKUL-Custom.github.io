/* ---------- Shop library: what you save to a library stays, in every job and after every update ----------
   Each job carries its own copy of the libraries (materials, door styles, hardware, products, ...), so a job always
   prices and cuts the same. Before 0.61.2 that copy was the only one: an item saved in one job never reached jobs
   made or opened later from another one. Ayden 2026-11-23: "When saving things to library i need to make sure that
   they actually save for future updates as well."
   Now the shop keeps one master copy, outside any job, in Hub storage (this browser's storage outside the hub). It
   is a job-shaped object with no cabinets, so migrate() brings it up to date after an update just like a job.
   - Every save compares the open job's library items with how they were when it opened. Items added or changed are
     written to the shop copy, items deleted are taken out of it. Items you didn't touch never overwrite it.
   - Opening any job adds the shop's items it is missing. Items the job already has stay as they are, so an old job
     keeps its prices and cut list.
   - A new job takes the shop's version of every item, and leaves out items deleted from the shop.
   - Built-in items new in an update still come in through migrate(), in jobs and in the shop copy alike. */
'use strict';
const SHOP_LIB_KEY = 'shopLibrary';
const SHOP_ARRS = ['materials', 'doorStyles', 'doorTemplates', 'panels', 'hardware', 'countertops', 'moldings', 'edgebands', 'partTemplates', 'faceFrames', 'interiorLib', 'shapeLib', 'finishes'];
const SHOP_VALS = ['matGroupOrder', 'doorExport'];
const SHOP_MAPS = ['insertPrices'];
let shopLib = null;        // { lib: job-shaped object, gone: [unit keys deleted from the shop] }
let shopBase = null;       // Map unit key -> JSON, the open job's library as it was when opened (or last synced)
let shopTimer = null;

// The id lists inside a job: plain arrays, material templates by kind, and each product set ('lib.main', ...).
function shopColls(s) {
  const out = SHOP_ARRS.slice();
  Object.keys(s.matTemplates || {}).forEach(k => { if (Array.isArray(s.matTemplates[k])) out.push('matTemplates.' + k); });
  out.push('lib.main'); Object.keys(s.libSets || {}).forEach(k => { if (k !== 'main') out.push('lib.' + k); });
  if (s.libSet && s.libSet !== 'main' && !out.includes('lib.' + s.libSet)) out.push('lib.' + s.libSet);
  return out;
}
function shopArr(s, c, make) {
  if (c.startsWith('lib.')) {
    const id = c.slice(4);
    if (id === (s.libSet || 'main')) return s.library || (make ? (s.library = []) : null);
    const L = s.libSets || (make ? (s.libSets = {}) : {}); return L[id] || (make ? (L[id] = []) : null);
  }
  if (c.startsWith('matTemplates.')) { const k = c.slice(13), T = s.matTemplates || (make ? (s.matTemplates = {}) : {}); return T[k] || (make ? (T[k] = []) : null); }
  return Array.isArray(s[c]) ? s[c] : make ? (s[c] = []) : null;
}
const shopKey = (c, id) => c + '\u0001' + id;
const shopSplit = k => { const i = k.indexOf('\u0001'); return [k.slice(0, i), k.slice(i + 1)]; };
// Every library item of a job, as unit key -> JSON text.
function shopUnits(s) {
  const m = new Map();
  shopColls(s).forEach(c => (shopArr(s, c) || []).forEach(it => { if (it && it.id != null) m.set(shopKey(c, it.id), JSON.stringify(it)); }));
  SHOP_MAPS.forEach(c => Object.entries(s[c] || {}).forEach(([k, v]) => m.set(shopKey('map:' + c, k), JSON.stringify(v))));
  SHOP_VALS.forEach(c => { if (s[c] !== undefined) m.set(shopKey('val:' + c, ''), JSON.stringify(s[c])); });
  return m;
}
const shopCollOf = k => shopSplit(k)[0];
// Puts an item into a list next to the item it followed in `order` (a list of ids), else at the end.
function shopPlace(arr, item, order) {
  const i = arr.findIndex(x => x && x.id === item.id); if (i >= 0) { arr[i] = item; return; }
  const at = order ? order.indexOf(item.id) : -1;
  for (let j = at - 1; j >= 0; j--) { const p = arr.findIndex(x => x && x.id === order[j]); if (p >= 0) { arr.splice(p + 1, 0, item); return; } }
  arr.push(item);
}
// Writes one unit into a job-shaped object (the shop copy, or a new job).
function shopPut(s, k, val, order) {
  const [c, id] = shopSplit(k);
  if (c.startsWith('val:')) { s[c.slice(4)] = val; return; }
  if (c.startsWith('map:')) { const n = c.slice(4); (s[n] = s[n] || {})[id] = val; return; }
  shopPlace(shopArr(s, c, true), val, order);
}
function shopDrop(s, k) {
  const [c, id] = shopSplit(k);
  if (c.startsWith('val:')) { delete s[c.slice(4)]; return; }
  if (c.startsWith('map:')) { delete (s[c.slice(4)] || {})[id]; return; }
  const a = shopArr(s, c); if (a) { const i = a.findIndex(x => x && String(x.id) === id); if (i >= 0) a.splice(i, 1); }
}
const shopOrder = (s, c) => (shopArr(s, c) || []).map(x => x && x.id);

/* ----- Storage ----- */
async function shopRead() {
  let v = null;
  try { v = typeof inHub === 'function' && inHub() ? await Hub.storage.get(SHOP_LIB_KEY) : JSON.parse(localStorage.getItem(KEY + '.' + SHOP_LIB_KEY) || 'null'); } catch (_) {}
  if (v && v.value !== undefined && !v.lib) v = v.value;
  return v && v.lib && typeof v.lib === 'object' ? v : null;
}
function shopWrite() {
  if (!shopLib) return Promise.resolve();
  shopLib.at = new Date().toISOString();
  try { localStorage.setItem(KEY + '.' + SHOP_LIB_KEY, JSON.stringify(shopLib)); } catch (_) {}
  if (typeof inHub === 'function' && inHub()) return Hub.storage.set(SHOP_LIB_KEY, shopLib).catch(() => flash('Could not save the shop library.'));
  return Promise.resolve();
}
// Loads the shop copy and brings it up to this version (new built-in items, fixes), like any job.
async function shopLibLoad() {
  const v = await shopRead(); if (!v) return;
  let lib = null; try { lib = migrate(v.lib); } catch (_) {}
  if (lib) shopLib = { lib, gone: Array.isArray(v.gone) ? v.gone : [] };
}
// A job-shaped copy of a job's libraries: no cabinets, the main product set in use.
function shopShell(s) {
  const p = JSON.parse(JSON.stringify(s));
  p.rooms = [newRoom('r1', 'Room 1', [])]; p.roomId = 'r1'; p.designer = null;
  p.job = { ...p.job, name: 'Shop library', customer: '', notes: '' }; ['priceOver', 'lines', 'status', 'stageAt', 'was', 'tag'].forEach(k => delete p.job[k]);
  if (p.libSet && p.libSet !== 'main') { p.libSets = p.libSets || {}; p.libSets[p.libSet] = p.library; p.library = p.libSets.main || []; delete p.libSets.main; p.libSet = 'main'; }
  return attachRoom(p);
}

/* ----- Opening a job: it gets the shop's items it's missing; what it has stays ----- */
function shopLibOpen(s) {
  if (!s) return s;
  if (!shopLib) { shopLib = { lib: shopShell(s), gone: [] }; shopWrite(); } // first run: the open job is the starting shop library
  else {
    const have = shopUnits(s), L = shopLib.lib;
    shopUnits(L).forEach((v, k) => {
      if (have.has(k)) return;
      const c = shopCollOf(k);
      if (c.startsWith('lib.') && c !== 'lib.main' && !shopArr(s, c)) return; // a backup product set comes when it's switched to
      shopPut(s, k, JSON.parse(v), c.includes(':') ? null : shopOrder(L, c));
    });
  }
  shopBase = shopUnits(s);
  return s;
}
// After S is swapped for a whole other state (backup import, sample reset, another computer's save).
function shopLibRebase() { if (S) shopBase = shopUnits(S); }

/* ----- New job: the shop's version of every item; deleted items stay out unless something points at them ----- */
function shopLibNew(s) {
  if (!s || !shopLib) return s;
  const L = shopLib.lib;
  shopUnits(L).forEach((v, k) => {
    const c = shopCollOf(k);
    if (c.startsWith('lib.') && c !== 'lib.main' && !shopArr(s, c)) return;
    shopPut(s, k, JSON.parse(v), c.includes(':') ? null : shopOrder(L, c));
  });
  const gone = shopLib.gone.filter(k => !k.startsWith('val:'));
  if (gone.length) {
    const have = shopUnits(s);
    gone.forEach(k => {
      if (!have.has(k)) return;
      const id = shopSplit(k)[1], txt = JSON.stringify(s), needle = JSON.stringify(id);
      if (txt.split(needle).length - 1 > 1) return; // still used by a template, default or another item
      shopDrop(s, k);
    });
  }
  return s;
}

/* ----- Saving: what you added, changed or deleted in the open job goes to the shop copy ----- */
function shopLibSoon() { clearTimeout(shopTimer); shopTimer = setTimeout(shopLibSync, 800); }
// Runs at once in memory (so switching jobs right after a change never loses it); the write to storage follows.
function shopLibSync() {
  clearTimeout(shopTimer);
  if (!S || !shopLib || !shopBase) return 0;
  const cur = shopUnits(S), ops = [];
  const baseColls = new Set([...shopBase.keys()].map(shopCollOf)), colls = new Set(shopColls(S));
  cur.forEach((v, k) => {
    if (shopBase.get(k) === v) return;
    // A product set that wasn't in the job when it opened (just switched to) is a starting point, not an edit.
    const c = shopCollOf(k); if (!shopBase.has(k) && c.startsWith('lib.') && !baseColls.has(c)) return;
    ops.push(['put', k, v]);
  });
  shopBase.forEach((v, k) => {
    if (cur.has(k)) return;
    const c = shopCollOf(k);
    if (c.startsWith('lib.') && !colls.has(c)) return; // the set was switched away, not deleted
    ops.push(['del', k]);
  });
  shopBase = cur;
  if (!ops.length) return 0;
  const L = shopLib.lib, gone = new Set(shopLib.gone);
  ops.forEach(([op, k, v]) => {
    const c = shopCollOf(k), order = c.includes(':') ? null : shopOrder(S, c);
    if (op === 'put') { shopPut(L, k, JSON.parse(v), order); gone.delete(k); }
    else { shopDrop(L, k); gone.add(k); }
  });
  shopLib.gone = [...gone].slice(-1000);
  shopWrite();
  return ops.length;
}
// A product set not in the job yet (American Cabinets, ...): its built-in items with the shop's edits on top.
function shopLibSet(id, items) {
  if (!shopLib) return null;
  const c = 'lib.' + id, mine = shopArr(shopLib.lib, c) || [], gone = shopLib.gone.filter(k => shopCollOf(k) === c);
  if (!mine.length && !gone.length) return null;
  const out = JSON.parse(JSON.stringify(items || [])), order = mine.map(x => x.id);
  mine.forEach(it => shopPlace(out, JSON.parse(JSON.stringify(it)), order));
  gone.forEach(k => shopDrop({ library: out, libSet: id }, k));
  return out;
}
