/* ---------- Interior library (cabinet editor, Interior tab) ----------
   Like the main Products library: picture tiles you drag onto an opening in the drawing, or click to put in the
   picked opening. Each drop adds one (one more shelf, one more roll-out, one more tray divider). What is in the
   opening is listed under it, and the × on a line takes one out. Inserts that fill an opening top to bottom
   (SHELF_BLOCKERS) never share it with adjustable shelves. */
// Kinds of interior item. Each library item is one of these, so the build knows how to make it.
const INT_KINDS = [['shelf', 'Adjustable shelf'], ['fixed', 'Fixed shelf'], ['rollout', 'Roll-out shelf'], ['rotray', 'Roll-out tray'], ['roshelf', 'Roll-out shelf, lip only'], ['trash', 'Waste bin pull-out'], ['traydiv', 'Tray divider'], ['lazy', 'Lazy susan'], ['rod', 'Closet rod'], ['separator', 'Separator'], ['pullout', 'Full-height pull-out'], ['other', 'Other insert'], ['divider', 'Vertical divider'], ['finint', 'Finished interior']];
const INT_FOLDERS = ['Shelves', 'Pull-outs', 'Blum inner drawers', 'Waste bins', 'Lazy susans', 'Organizers', 'Closet', 'Whole cabinet', 'Other'];
// Ayden's Mozaik insert library (2026 Larkul) and Mozaik's Blum inner drawers, with Mozaik's names so imported jobs
// match, its prices (CostEach), and the fixed sizes it gives as the smallest opening each one needs.
const MOZ_INT_LIB = [{"id":"mz-lazy-susan-round","name":"Lazy Susan Round","kind":"lazy","folder":"Lazy susans","part":"","price":195.0,"minW":"","minH":"","minD":"","src":"Mozaik"},
  {"id":"mz-lazy-susan-pie","name":"Lazy Susan Pie","kind":"lazy","folder":"Lazy susans","part":"","price":"","minW":32.0,"minH":"","minD":32.0,"src":"Mozaik"},
  {"id":"mz-tiered-drawer","name":"Tiered Drawer","kind":"rollout","folder":"Pull-outs","part":"","price":"","minW":"","minH":"","minD":21.0,"h":10,"src":"Mozaik"},
  {"id":"mz-hidden-side-db","name":"Hidden Side DB","kind":"rollout","folder":"Pull-outs","part":"","price":"","minW":"","minH":"","minD":"","h":4,"src":"Mozaik"},
  {"id":"mz-utensil","name":"Utensil","kind":"other","folder":"Organizers","part":"","price":"","minW":"","minH":"","minD":"","src":"Mozaik"},
  {"id":"mz-upper-trey-dividers","name":"Upper Trey Dividers","kind":"traydiv","folder":"Organizers","part":"","price":"","minW":"","minH":"","minD":"","src":"Mozaik"},
  {"id":"mz-base-tray-dividers","name":"Base Tray Dividers","kind":"traydiv","folder":"Organizers","part":"","price":"","minW":"","minH":"","minD":"","src":"Mozaik"},
  {"id":"mz-pac-spice-563h-narrow","name":"_PAC Spice 563H Narrow","kind":"pullout","folder":"Pull-outs","part":"","price":450.0,"minW":"","minH":"","minD":"","note":"Under 7 inches wide must use 563H and 5/8\" material or thinner www.PhillAnton.com","src":"Mozaik"},
  {"id":"mz-pac-spice-563h-wide","name":"_PAC Spice 563H Wide","kind":"pullout","folder":"Pull-outs","part":"","price":425.0,"minW":"","minH":"","minD":"","note":"Opening over 7 inches wide must use 563H and 5/8\" material or thinner","src":"Mozaik"},
  {"id":"mz-pac-spice-563h-wide-ball-bearing","name":"_PAC Spice 563H Wide_Ball Bearing","kind":"pullout","folder":"Pull-outs","part":"","price":425.0,"minW":"","minH":"","minD":"","note":"Opening over 7 inches wide must use 563H and 5/8\" material or thinner","src":"Mozaik"},
  {"id":"mz-trash-blum-563-double-563","name":"Trash Blum 563 (Double)563","kind":"trash","folder":"Waste bins","part":"","price":275.0,"minW":"","minH":18.875,"minD":21.25,"src":"Mozaik"},
  {"id":"mz-trash-pull-out-single-563","name":"Trash Pull Out (Single)563","kind":"trash","folder":"Waste bins","part":"","price":150.0,"minW":"","minH":18.875,"minD":21.25,"src":"Mozaik"},
  {"id":"mz-trash-pullout-double","name":"Trash Pullout (Double)","kind":"trash","folder":"Waste bins","part":"","price":"","minW":"","minH":"","minD":"","src":"Mozaik"},
  {"id":"mz-trash-pullout-single","name":"Trash Pullout (Single)","kind":"trash","folder":"Waste bins","part":"","price":"","minW":"","minH":"","minD":"","src":"Mozaik"},
  {"id":"mz-base-cabinet-organizer","name":"Base Cabinet Organizer","kind":"pullout","folder":"Pull-outs","part":"","price":"","minW":"","minH":"","minD":"","src":"Mozaik"},
  {"id":"mz-utensil-base-organizer","name":"Utensil Base Organizer","kind":"pullout","folder":"Pull-outs","part":"","price":"","minW":"","minH":"","minD":"","src":"Mozaik"},
  {"id":"mz-paper-towel-pullout","name":"Paper Towel Pullout","kind":"pullout","folder":"Pull-outs","part":"","price":"","minW":"","minH":"","minD":"","src":"Mozaik"},
  {"id":"mz-pac-spice-563h-narrow-new","name":"_PAC Spice 563H Narrow-New","kind":"pullout","folder":"Pull-outs","part":"","price":450.0,"minW":"","minH":"","minD":"","note":"Under 7 inches wide must use 563H and 5/8\" material or thinner www.PhillAnton.com","src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-m-500mm","name":"Blum Antaro Inner Drawer M 500mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":20.5,"h":3.9375,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-d-gallery-500mm","name":"Blum Antaro Inner Drawer D Gallery 500mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":20.5,"h":8.5625,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-m-450mm","name":"Blum Antaro Inner Drawer M 450mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":18.5,"h":3.9375,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-m-400mm","name":"Blum Antaro Inner Drawer M 400mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":16.5625,"h":3.9375,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-m-350mm","name":"Blum Antaro Inner Drawer M 350mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":14.5625,"h":3.9375,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-m-270mm","name":"Blum Antaro Inner Drawer M 270mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":11.4375,"h":3.9375,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-m-550mm","name":"Blum Antaro Inner Drawer M 550mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":22.4375,"h":3.9375,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-m-650mm","name":"Blum Antaro Inner Drawer M 650mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":26.375,"h":3.9375,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-d-gallery-450mm","name":"Blum Antaro Inner Drawer D Gallery 450mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":18.5,"h":8.5625,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-d-gallery-400mm","name":"Blum Antaro Inner Drawer D Gallery 400mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":16.5625,"h":8.5625,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-d-gallery-350mm","name":"Blum Antaro Inner Drawer D Gallery 350mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":14.5625,"h":8.5625,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-d-gallery-270mm","name":"Blum Antaro Inner Drawer D Gallery 270mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":11.4375,"h":8.5625,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-d-gallery-550mm","name":"Blum Antaro Inner Drawer D Gallery 550mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":22.4375,"h":8.5625,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-d-gallery-650mm","name":"Blum Antaro Inner Drawer D Gallery 650mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":26.375,"h":8.5625,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-c-gallery-500mm","name":"Blum Antaro Inner Drawer C Gallery 500mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":20.5,"h":7.3125,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-c-gallery-450mm","name":"Blum Antaro Inner Drawer C Gallery 450mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":18.5,"h":7.3125,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-c-gallery-400mm","name":"Blum Antaro Inner Drawer C Gallery 400mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":16.5625,"h":7.3125,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-c-gallery-350mm","name":"Blum Antaro Inner Drawer C Gallery 350mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":14.5625,"h":7.3125,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-c-gallery-270mm","name":"Blum Antaro Inner Drawer C Gallery 270mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":11.4375,"h":7.3125,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-c-gallery-550mm","name":"Blum Antaro Inner Drawer C Gallery 550mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":22.4375,"h":7.3125,"src":"Mozaik"},
  {"id":"mz-blum-antaro-inner-drawer-c-gallery-650mm","name":"Blum Antaro Inner Drawer C Gallery 650mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":26.375,"h":7.3125,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-m-500mm","name":"Blum Legrabox Inner Drawer M 500mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":20.5,"h":4.0,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-m-450mm","name":"Blum Legrabox Inner Drawer M 450mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":18.5,"h":4.0,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-m-400mm","name":"Blum Legrabox Inner Drawer M 400mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":16.5625,"h":4.0,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-m-350mm","name":"Blum Legrabox Inner Drawer M 350mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":14.5625,"h":4.0,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-m-270mm","name":"Blum Legrabox Inner Drawer M 270mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":11.4375,"h":4.0,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-m-550mm","name":"Blum Legrabox Inner Drawer M 550mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":22.4375,"h":4.0,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-m-600mm","name":"Blum Legrabox Inner Drawer M 600mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":24.4375,"h":4.0,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-pure-c-500mm","name":"Blum Legrabox Inner Drawer Pure C 500mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":20.5,"h":7.375,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-pure-c-450mm","name":"Blum Legrabox Inner Drawer Pure C 450mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":18.5,"h":7.375,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-pure-c-400mm","name":"Blum Legrabox Inner Drawer Pure C 400mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":16.5625,"h":7.375,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-pure-c-350mm","name":"Blum Legrabox Inner Drawer Pure C 350mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":14.5625,"h":7.375,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-pure-c-270mm","name":"Blum Legrabox Inner Drawer Pure C 270mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":11.4375,"h":7.375,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-pure-c-550mm","name":"Blum Legrabox Inner Drawer Pure C 550mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":22.4375,"h":7.375,"src":"Mozaik"},
  {"id":"mz-blum-legrabox-inner-drawer-pure-c-600mm","name":"Blum Legrabox Inner Drawer Pure C 600mm","kind":"rollout","folder":"Blum inner drawers","part":"","price":"","minW":"","minH":"","minD":24.4375,"h":7.375,"src":"Mozaik"}];
// The library starts with one plain item of each kind. The shop adds the real products it buys (brand, part number,
// price and the opening it needs), and those sit in folders with search and favorites, like the Products tree.
function defaultInteriorLib() {
  const it = (id, name, kind, folder, x = {}) => ({ id, name, kind, folder, part: '', price: '', minW: '', minH: '', minD: '', ...x });
  return [
    it('il-shelf', 'Adjustable shelf', 'shelf', 'Shelves'), it('il-fixed', 'Fixed shelf', 'fixed', 'Shelves'),
    it('il-rollout', 'Roll-out shelf', 'rollout', 'Pull-outs', { h: 4 }), it('il-rotray', 'Roll-out tray', 'rotray', 'Pull-outs', { h: 2.5 }), it('il-roshelf', 'Roll-out shelf, lip only', 'roshelf', 'Pull-outs', { h: 1.5 }),
    it('il-trash', 'Double 35 qt pull-out waste bin', 'trash', 'Waste bins', { minW: 15 }),
    it('il-lazy', 'Lazy susan, 2 shelf', 'lazy', 'Lazy susans'),
    it('il-traydiv', 'Tray divider', 'traydiv', 'Organizers'), it('il-separator', 'Separator', 'separator', 'Organizers'),
    it('il-rod', 'Closet rod', 'rod', 'Closet'),
    it('il-divider', 'Vertical divider', 'divider', 'Whole cabinet'), it('il-finint', 'Finished interior', 'finint', 'Whole cabinet'),
    ...clone(MOZ_INT_LIB),
  ];
}
function ensureInteriorLib(s) {
  if (!s) return s;
  if (!Array.isArray(s.interiorLib) || !s.interiorLib.length) s.interiorLib = defaultInteriorLib();
  // A library made before the Mozaik products came in gets them once (deleting one later keeps it deleted).
  else if (!s.interiorLibMz) { const have = new Set(s.interiorLib.map(x => x.id)); s.interiorLib.push(...clone(MOZ_INT_LIB.filter(x => !have.has(x.id)))); }
  s.interiorLibMz = 1; return s;
}
const intItem = id => (S.interiorLib || []).find(x => x.id === id);
const intItemOf = it => (it && it.item && intItem(it.item)) || (S.interiorLib || []).find(x => x.kind === (it && it.type));
const INT_PIC = {
  shelf: '<rect x="6" y="6" width="28" height="28" class="ip-box"/><path d="M8 20h24" class="ip-wood"/><path d="M9 17v6M31 17v6" class="ip-pin"/>',
  fixed: '<rect x="6" y="6" width="28" height="28" class="ip-box"/><path d="M6 20h28" class="ip-wood thick"/>',
  rollout: '<rect x="6" y="6" width="28" height="28" class="ip-box"/><path d="M9 24h22v6H9z" class="ip-fill"/><path d="M9 14h22v6H9z" class="ip-fill"/>',
  rotray: '<rect x="6" y="6" width="28" height="28" class="ip-box"/><path d="M9 26h22v4H9z" class="ip-fill"/>',
  roshelf: '<rect x="6" y="6" width="28" height="28" class="ip-box"/><path d="M9 28h22M9 26v2M31 26v2" class="ip-wood"/>',
  trash: '<rect x="6" y="6" width="28" height="28" class="ip-box"/><path d="M12 13h16l-2 17H14z" class="ip-fill"/><path d="M11 13h18" class="ip-wood"/>',
  traydiv: '<rect x="6" y="6" width="28" height="28" class="ip-box"/><path d="M14 9v22M20 9v22M26 9v22" class="ip-wood"/>',
  lazy: '<rect x="6" y="6" width="28" height="28" class="ip-box"/><ellipse cx="20" cy="15" rx="11" ry="3" class="ip-fill"/><ellipse cx="20" cy="26" rx="11" ry="3" class="ip-fill"/><path d="M20 15v11" class="ip-wood"/>',
  rod: '<rect x="6" y="6" width="28" height="28" class="ip-box"/><path d="M8 13h24" class="ip-rod"/><path d="M14 13l-3 7h6zM26 13l-3 7h6z" class="ip-hang"/>',
  separator: '<rect x="6" y="6" width="28" height="28" class="ip-box"/><path d="M20 20v14" class="ip-wood"/><path d="M6 20h28" class="ip-wood"/>',
  pullout: '<rect x="6" y="6" width="28" height="28" class="ip-box"/><path d="M15 9h10v22H15z" class="ip-fill"/><path d="M15 16h10M15 23h10" class="ip-wood"/>',
  divider: '<rect x="6" y="6" width="28" height="28" class="ip-box"/><path d="M20 6v28" class="ip-wood thick"/>',
  finint: '<rect x="6" y="6" width="28" height="28" class="ip-box fin"/><path d="M12 24l5 5 11-12" class="ip-check"/>',
};
const intPic = k => `<svg class="ip" viewBox="0 0 40 40" aria-hidden="true">${INT_PIC[k] || INT_PIC.shelf}</svg>`;
const intName = k => (INT_KINDS.find(x => x[0] === k) || [k, k])[1];
const rowInserts = (c, i) => (c.inserts || []).filter(it => it.row !== undefined && it.row !== '' && +it.row === i);

function loadIntFavs() { try { return JSON.parse(localStorage.getItem(KEY + '.intfavs') || '[]'); } catch (_) { return []; } }
function intLibrary(c, qr) {
  ensureInteriorLib(S);
  const row = (c.rows || [])[qr], ok = row && (row.type === 'door' || row.type === 'open');
  const any = (c.inserts || []).length || c.finInt || qeRowsShelved(c) || (c.rows || []).some(r => r.fixShelf);
  const favs = ui.intFavs || (ui.intFavs = loadIntFavs()), q = (ui.intFind || '').trim().toLowerCase(), fold = ui.intFold || (ui.intFold = Object.fromEntries(INT_FOLDERS.map(f => [f, true])));
  const fits = x => { const why = intFitWhy(c, qr, x); return !why; };
  const hit = x => !q || (x.name + ' ' + (x.part || '') + ' ' + (x.folder || '')).toLowerCase().includes(q);
  const item = x => `<div class="il-row"><button class="il-item${ok && !fits(x) ? ' nofit' : ''}" draggable="true" data-act="int-add" data-id="${esc(x.id)}" data-intdrag="${esc(x.id)}" title="${esc(x.name)}${x.part ? ' · ' + esc(x.part) : ''}${x.note ? ' · ' + esc(x.note) : ''}${ok && !fits(x) ? ' · ' + esc(intFitWhy(c, qr, x)) : ''}">${intPic(x.kind)}<span><b>${esc(x.name)}</b>${x.part || x.minW ? `<small>${[x.part, x.minW ? 'needs ' + fmtLen(+x.minW) + ' wide' : ''].filter(Boolean).map(esc).join(' · ')}</small>` : ''}</span></button><button class="favbtn${favs.includes(x.id) ? ' on' : ''}" data-act="int-fav" data-id="${esc(x.id)}" aria-label="Favorite ${esc(x.name)}">★</button></div>`;
  const list = (S.interiorLib || []).filter(hit);
  const folders = [...new Set([...INT_FOLDERS, ...list.map(x => x.folder || 'Other')])].filter(f => list.some(x => (x.folder || 'Other') === f));
  const head = (k, label, n, shut) => `<button class="lfold-h" data-act="int-fold" data-id="${esc(k)}" aria-expanded="${!shut}"><span class="arr" aria-hidden="true">${shut ? '▸' : '▾'}</span><span>${esc(label)}</span><span class="ct">${n}</span></button>`;
  const fav = list.filter(x => favs.includes(x.id));
  return `<div class="psec box intlib"><div class="il-head">${secHead('shelf', 'Interior library', 'teal')}<button class="btn sm danger" data-act="qe-clear-all" data-id="${c.id}" title="Take out every shelf, insert and divider. Doors, drawers and their boxes stay."${any ? '' : ' disabled'}>${icon('trash')}Clear interior</button></div>
    <div class="note">${ok ? `Drag onto an opening in the drawing, or click to add to opening ${qr + 1}.` : 'Pick a door or open opening in the drawing first.'}</div>
    <input type="search" id="intfind" class="il-find" placeholder="Search…" value="${esc(ui.intFind || '')}" aria-label="Search the interior library">
    <div class="il-tree">${fav.length ? `<div class="lfold">${head('★', '★ Favorites', fav.length, !q && fold['★'])}${!q && fold['★'] ? '' : fav.map(item).join('')}</div>` : ''}
    ${folders.map(f => { const fi = list.filter(x => (x.folder || 'Other') === f), shut = !q && fold[f]; return `<div class="lfold">${head(f, f, fi.length, shut)}${shut ? '' : fi.map(item).join('')}</div>`; }).join('') || '<div class="note show">Nothing matches.</div>'}</div>
    <button class="linkbtn" data-act="tab" data-id="inserts">Add your own products in Libraries › Inserts</button>
  </div>`;
}
// The opening's inside size, for the fit check: width between the sides, height of the opening, depth to the back.
function intOpening(c, i) {
  const p = effParams(c), lay = interiorLayout(c, p, computeFronts(c, p)), z = lay.zones.find(zz => zz.row === i);
  return z ? { w: lay.inW, h: z[1] - z[0], d: c.d - lay.t - (faceFrame(c) ? ffThick(c) : 0) } : null;
}
// Why item x does not fit opening i, or '' when it fits (blank minimums always fit).
function intFitWhy(c, i, x) {
  if (!x || ['divider', 'finint'].includes(x.kind)) return '';
  const o = intOpening(c, i); if (!o) return '';
  const need = [['minW', 'w', 'wide'], ['minH', 'h', 'tall'], ['minD', 'd', 'deep']].find(([k, f]) => +x[k] > 0 && o[f] + 0.01 < +x[k]);
  return need ? `needs ${fmtLen(+x[need[0]])} ${need[2]}, the opening is ${fmtLen(o[need[1]], 1)}` : '';
}
// What is in opening i, one line per kind, each with an × that takes one out.
function intContents(c, i) {
  const row = c.rows[i], lines = [], sh = qeRowShelves(c, i);
  if (sh) lines.push(['shelf', `${sh} adjustable shelf${sh > 1 ? 'ves' : ''}`, 'shelf']);
  if (row.fixShelf && i < c.rows.length - 1) lines.push(['fixed', 'Fixed shelf under it', 'fixed']);
  (c.inserts || []).forEach((it, k) => {
    if (!(it.row !== undefined && it.row !== '' && +it.row === i) || it.type === 'divider') return;
    const t = insertType(it.type), n = t.fields.includes('n') ? Math.max(1, it.n | 0) : 0;
    const nm = (intItemOf(it) || {}).name || intName(it.type), label = n ? `${n} × ${nm}` : (it.name || nm);
    const hf = t.fields.includes('h') ? `<label class="il-h"><span>Box height</span>${fctl('sub:inserts|cab:' + c.id, k + '.h', it.h, 'len', { label: 'Box height' })}</label>` : '';
    lines.push([it.type, label, 'ins:' + k, hf]);
  });
  return `<div class="il-in"><div class="il-head"><span class="eyebrow">In opening ${i + 1}</span>${intSelBtn()}${lines.length ? `<button class="btn sm" data-act="qe-clear-row" data-id="${i}" title="Take everything out of this opening">${icon('trash')}Clear</button>` : ''}</div>${lines.length ? lines.map(([k, l, ref, extra]) => intLine(i, k, l, ref, extra)).join('') + `<div class="note">Click lines to pick them, then Delete selected or press Delete.</div>` : '<div class="note show">Empty. Drag something in from the library.</div>'}</div>`;
}
// One line of what is inside. Clicking the name picks it (click more to pick several); × takes one out.
function intSelSet() {
  const id = (qeCab() || {}).id; if (ui.intSelCab !== id) { ui.intSel = []; ui.intSelCab = id; }
  return ui.intSel || (ui.intSel = []);
}
function intLine(i, k, l, ref, extra) {
  const key = i + ':' + ref, on = intSelSet().includes(key);
  return `<div class="il-line${on ? ' sel' : ''}"><button class="il-pick" data-act="int-sel" data-id="${esc(key)}" aria-pressed="${on}" title="${on ? 'Picked. Click again to unpick.' : 'Click to pick'}">${intPic(k)}<b>${esc(l)}</b></button>${extra || ''}<button class="btn sm" data-act="int-del" data-id="${esc(key)}" title="Take one out" aria-label="Take one out">×</button></div>`;
}
function intSelBtn() { const n = intSelSet().length; return n ? `<button class="btn sm danger" data-act="int-delsel" data-id="" title="Delete the picked lines (Delete key)">${icon('trash')}Delete selected (${n})</button>` : ''; }
function intWhole(c) {
  const div = (c.inserts || []).findIndex(it => it.type === 'divider'), lines = [];
  if (div >= 0) lines.push(['divider', 'Vertical divider', 'ins:' + div]);
  if (c.finInt) lines.push(['finint', 'Finished interior', 'finint']);
  return `<div class="il-in"><div class="eyebrow">Whole cabinet</div>${lines.map(([k, l, ref]) => intLine(-1, k, l, ref)).join('')}
    ${lines.length ? '' : '<div class="note show">Nothing for the whole box.</div>'}</div>`;
}

// Puts one of library item id (or a bare kind) into opening i. Returns a message when it can't go there.
function intApply(c, i, id) {
  const x = intItem(id) || (S.interiorLib || []).find(y => y.kind === id), k = x ? x.kind : id, row = c.rows[i];
  if (k === 'divider') { if ((c.inserts || []).some(it => it.type === 'divider')) return 'This cabinet already has a divider.'; (c.inserts = c.inserts || []).push({ type: 'divider', ...clone(insertType('divider').def) }); return ''; }
  if (k === 'finint') { if (c.finInt) return 'The interior is already finished.'; c.finInt = true; return ''; }
  if (!row || !(row.type === 'door' || row.type === 'open')) return 'Drawers and false fronts have no inside. Use a door or open opening.';
  const why = intFitWhy(c, i, x); if (why) return `${x.name} doesn't fit: it ${why}.`;
  const here = rowInserts(c, i), blocker = here.find(it => SHELF_BLOCKERS.includes(it.type));
  if (k === 'shelf') {
    if (blocker) return `The ${(intItemOf(blocker) || {}).name || intName(blocker.type).toLowerCase()} fills this opening, so a shelf can't go in too.`;
    qeFreezeShelves(c); row.shelves = Math.min(12, (row.shelves | 0) + 1); return '';
  }
  if (k === 'fixed') { if (i >= c.rows.length - 1) return 'The bottom opening sits on the cabinet bottom already.'; if (row.fixShelf) return 'It already has a fixed shelf under it.'; row.fixShelf = true; return ''; }
  const t = insertType(k), same = here.find(it => it.type === k && (it.item || '') === ((x && x.id) || ''));
  if (same) { if (!t.fields.includes('n')) return `Opening ${i + 1} already has this ${intName(k).toLowerCase()}.`; same.n = Math.max(1, same.n | 0) + 1; return ''; }
  let note = '';
  // A different item of a kind that only goes in once (another lazy susan, another rod) swaps in for it.
  const swap = here.filter(it => it.type === k && !t.fields.includes('n'));
  if (swap.length) { c.inserts = c.inserts.filter(it => !swap.includes(it)); note = (intItemOf(swap[0]) || {}).name || intName(k); }
  if (SHELF_BLOCKERS.includes(k)) {
    // It fills the opening: adjustable shelves and any other filling insert come out.
    if (qeRowShelves(c, i)) { qeFreezeShelves(c); row.shelves = 0; note = note || 'shelves'; }
    const out = rowInserts(c, i).filter(it => SHELF_BLOCKERS.includes(it.type));
    if (out.length) { c.inserts = c.inserts.filter(it => !out.includes(it)); note = note || (intItemOf(out[0]) || {}).name || intName(out[0].type).toLowerCase(); }
  }
  const add = { type: k, ...clone(t.def), ...(t.fields.includes('n') ? { n: 1 } : {}), row: i };
  if (x) { add.item = x.id; if (t.fields.includes('name')) add.name = x.name; if (+x.h > 0 && t.fields.includes('h')) add.h = +x.h; }
  (c.inserts = c.inserts || []).push(add);
  return note ? `Took out the ${note}: the ${(x && x.name) || intName(k).toLowerCase()} goes there now.` : '';
}
function intRemove(c, i, ref) {
  const row = c.rows[i];
  if (ref === 'shelf') { qeFreezeShelves(c); row.shelves = Math.max(0, (row.shelves | 0) - 1); }
  else if (ref === 'fixed') delete row.fixShelf;
  else if (ref === 'finint') c.finInt = false;
  else if (ref.startsWith('ins:')) {
    const k = +ref.slice(4), it = c.inserts[k]; if (!it) return;
    if (insertType(it.type).fields.includes('n') && (it.n | 0) > 1) it.n = (it.n | 0) - 1; else c.inserts.splice(k, 1);
  }
}
// Takes the whole line out: every shelf on a shelf line, the whole insert on an insert line.
function intRemoveAll(c, i, ref) {
  const row = c.rows[i];
  if (ref === 'shelf') { if (row) { qeFreezeShelves(c); row.shelves = 0; } }
  else if (ref === 'fixed') { if (row) delete row.fixShelf; }
  else if (ref === 'finint') c.finInt = false;
  else if (ref.startsWith('ins:')) c.inserts.splice(+ref.slice(4), 1);
}
function intDeleteSel() {
  const c = qeCab(), sel = intSelSet(); if (!c || !sel.length) return;
  // Inserts go from the highest index down so the others keep their place.
  const parts = sel.map(key => { const [si, ...r] = key.split(':'); return [+si, r.join(':')]; }).sort((a, b) => (b[1].startsWith('ins:') ? +b[1].slice(4) : -1) - (a[1].startsWith('ins:') ? +a[1].slice(4) : -1));
  mutate(() => parts.forEach(([i, ref]) => intRemoveAll(c, i, ref)));
  flash(`Deleted ${parts.length} picked item${parts.length > 1 ? 's' : ''}. Undo brings ${parts.length > 1 ? 'them' : 'it'} back.`);
  ui.intSel = []; renderQuick();
}
function intAct(a, id) {
  if (a === 'int-sel') { const s = intSelSet(); ui.intSel = s.includes(id) ? s.filter(x => x !== id) : [...s, id]; renderQuick(); return; }
  if (a === 'int-delsel') { intDeleteSel(); return; }
  if (a === 'int-fold') { ui.intFold[id] = !ui.intFold[id]; renderQuick(); return; }
  if (a === 'int-fav') { const f = ui.intFavs || (ui.intFavs = loadIntFavs()); ui.intFavs = f.includes(id) ? f.filter(x => x !== id) : [...f, id]; try { localStorage.setItem(KEY + '.intfavs', JSON.stringify(ui.intFavs)); } catch (_) {} renderQuick(); return; }
  const c = qeCab(); if (!c) return;
  ui.intSel = [];
  if (a === 'int-add') { let msg = ''; mutate(() => { msg = intApply(c, ui.qeRow | 0, id); }); if (msg) flash(msg); return; }
  const [si, ...rest] = id.split(':'), ref = rest.join(':');
  mutate(() => intRemove(c, +si, ref));
}
// Delete or Backspace deletes the picked lines while the Interior tab is open.
document.addEventListener('keydown', e => {
  if (!(e.key === 'Delete' || e.key === 'Backspace') || !ui.quick || ui.edTab !== 'interior' || !(ui.intSel || []).length) return;
  const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  e.preventDefault(); e.stopImmediatePropagation(); intDeleteSel();
}, true);
// Drag a tile onto an opening in the drawing.
document.addEventListener('dragstart', e => { const t = e.target.closest && e.target.closest('[data-intdrag]'); if (t) { e.dataTransfer.setData('text/x-int', t.dataset.intdrag); e.dataTransfer.effectAllowed = 'copy'; } });
document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('.qe-hit') && [...e.dataTransfer.types].includes('text/x-int')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
document.addEventListener('drop', e => {
  const hit = e.target.closest && e.target.closest('.qe-hit'), k = e.dataTransfer.getData('text/x-int'); if (!hit || !k) return;
  e.preventDefault(); const c = qeCab(); if (!c) return;
  ui.qeRow = +hit.dataset.id; let msg = ''; mutate(() => { msg = intApply(c, ui.qeRow, k); }); if (msg) flash(msg);
});

document.addEventListener('input', e => {
  if (e.target.id !== 'intfind') return;
  ui.intFind = e.target.value; renderQuick();
  const n = document.getElementById('intfind'); if (n) { n.focus(); try { n.setSelectionRange(n.value.length, n.value.length); } catch (_) {} }
});

/* ----- Libraries › Inserts: the interior products the shop buys ----- */
function interiorLibCard() {
  ensureInteriorLib(S);
  const used = id => allCabs().reduce((a, c) => a + (c.inserts || []).filter(it => it.item === id).length, 0);
  const rows = (S.interiorLib || []).map(x => { const R = 'ilib:' + x.id; return `<tr><td>${intPic(x.kind)}</td>
    <td>${ctl(R, 'name', x.name, 'text', { label: 'Name' })}</td>
    <td>${ctl(R, 'folder', x.folder || '', 'text', { label: 'Folder' })}</td>
    <td>${ctl(R, 'kind', x.kind, 'select', { label: 'Builds as', options: INT_KINDS.map(([v, l]) => ({ v, l })) })}</td>
    <td>${ctl(R, 'part', x.part || '', 'text', { label: 'Part number', ph: 'optional' })}</td>
    <td style="width:90px">${ctl(R, 'price', x.price ?? '', 'num', { label: 'Price', ph: 'auto', blank: true })}</td>
    <td style="width:80px">${ctl(R, 'minW', x.minW ?? '', 'len', { label: 'Needs width', blank: true, ph: 'any' })}</td>
    <td style="width:80px">${ctl(R, 'minH', x.minH ?? '', 'len', { label: 'Needs height', blank: true, ph: 'any' })}</td>
    <td style="width:80px">${ctl(R, 'minD', x.minD ?? '', 'len', { label: 'Needs depth', blank: true, ph: 'any' })}</td>
    <td class="n">${used(x.id)}</td><td><button class="btn sm danger" data-act="ilib-del" data-id="${esc(x.id)}" aria-label="Delete ${esc(x.name)}">×</button></td></tr>`; }).join('');
  return `<div class="card">${cardHead('Interior library', `<button class="btn sm primary" data-act="ilib-add">${icon('plus')}Add a product</button>`)}
    <div class="cardbody"><div class="note help">The products in the cabinet editor's Interior library. Give each real product you buy its own line, like each lazy susan size you stock: its name, the folder it shows in, how it builds, part number, price (blank uses the insert price below), and the smallest opening it fits (blank fits any).</div></div>
    <div class="tscroll"><table class="t ilibt"><thead><tr><th></th><th>Name</th><th>Folder</th><th>Builds as</th><th>Part number</th><th>Price</th><th>Width</th><th>Height</th><th>Depth</th><th class="r">Used</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act^="ilib-"]'); if (!b) return;
  e.stopPropagation();
  if (b.dataset.act === 'ilib-add') mutate(() => S.interiorLib.push({ id: uid('il'), name: 'New product', kind: 'lazy', folder: 'Lazy susans', part: '', price: '', minW: '', minH: '', minD: '' }));
  else if (b.dataset.act === 'ilib-del') mutate(() => { S.interiorLib = S.interiorLib.filter(x => x.id !== b.dataset.id); });
}, true);
