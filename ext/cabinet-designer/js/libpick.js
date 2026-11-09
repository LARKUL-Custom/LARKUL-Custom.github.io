/* Library pages show one template at a time, picked by name from a dropdown with a Find box (like Mozaik),
   so a long library stays easy to get around. A newly added or duplicated template is picked for you. */
const PICK_SEEN = {};
function pickState() { ui.pick = ui.pick || {}; ui.pickQ = ui.pickQ || {}; return ui; }
function pickMatch(x, q) { return !q || String(x.name || '').toLowerCase().includes(q.toLowerCase()); }
function pickId(key, items) {
  pickState(); const ids = items.map(x => x.id), seen = PICK_SEEN[key];
  if (seen) { const fresh = ids.find(id => !seen.includes(id)); if (fresh) { ui.pick[key] = fresh; ui.pickQ[key] = ''; } }
  PICK_SEEN[key] = ids;
  const q = ui.pickQ[key] || '', cur = items.find(x => x.id === ui.pick[key]);
  if (!cur || !pickMatch(cur, q)) { const m = items.find(x => pickMatch(x, q)) || cur || items[0]; ui.pick[key] = m && m.id; }
  return ui.pick[key];
}
function pickBar(key, items, label) {
  const tools = libTools(key, items, label);
  if (items.length < 2) { pickId(key, items); return tools ? `<div class="pickbar">${tools}</div>` : ''; }
  const id = pickId(key, items), q = ui.pickQ[key] || '', list = items.filter(x => pickMatch(x, q));
  return `<div class="pickbar"><label class="f"><span>${esc(label)}</span><select class="pick-sel" data-key="${esc(key)}" aria-label="${esc(label)}">${groupedOptions(list.length ? list : items, id)}</select></label>
    <label class="f pick-findf"><span>Find</span><input type="search" class="pick-find" data-key="${esc(key)}" value="${esc(q)}" placeholder="Type part of a name"></label>
    <span class="muted">${q ? `${list.length} of ${items.length}` : `${items.length} in all`}</span>${tools}</div>`;
}
// L3: items with a group (header) are listed under it, like Mozaik's "Plywood", "MDF", "Melamine" headers.
function groupedOptions(items, id) {
  const opt = x => `<option value="${esc(x.id)}"${x.id === id ? ' selected' : ''}>${esc(x.name || x.id)}</option>`;
  if (!items.some(x => x.group)) return items.map(opt).join('');
  const g = {}; items.forEach(x => (g[x.group || ''] = g[x.group || ''] || []).push(x));
  return (g[''] || []).map(opt).join('') + Object.keys(g).filter(k => k).sort((a, b) => a.localeCompare(b)).map(k => `<optgroup label="${esc(k)}">${g[k].map(opt).join('')}</optgroup>`).join('');
}

/* L2: the library tools beside the picker: copy, rename, group, move up/down, A-Z, delete, export and import. */
const LIB_REFS = { doorT: ['dtpl', () => S.doorTemplates], panel: ['panel', () => S.panels], top: ['top', () => S.countertops], mold: ['mold', () => S.moldings], ptpl: ['ptpl', () => S.partTemplates], mat: ['mat', () => S.materials], eb: ['eb', () => S.edgebands] };
function libRef(key) { if (LIB_REFS[key]) return LIB_REFS[key]; if (/^hw-/.test(key)) return ['hw', () => S.hardware, h => h.kind === key.slice(3)]; return null; }
function libTools(key, items, label) {
  const r = libRef(key); if (!r || !items.length) return '';
  const id = ui.pick && ui.pick[key] || items[0].id, cur = items.find(x => x.id === id) || items[0], groups = [...new Set(r[1]().map(x => x.group).filter(Boolean))].sort();
  const b = (act, ic, t) => `<button class="btn sm" data-act="${act}" data-id="${esc(key)}" title="${t}" aria-label="${t}">${icon(ic)}</button>`;
  return `<label class="f lp-group"><span>Group</span>${ctl(r[0] + ':' + cur.id, 'group', cur.group || '', 'text', { label: 'Group header', ph: 'No group', list: 'lpg-' + key })}${groups.length ? `<datalist id="lpg-${esc(key)}">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist>` : ''}</label>
    <div class="lp-tools" role="group" aria-label="${esc(label)} library">${b('lp-copy', 'copy', 'Copy')}${b('lp-ren', 'edit', 'Rename')}${b('lp-up', 'up', 'Move up')}${b('lp-down', 'down', 'Move down')}${b('lp-az', 'sort', 'Sort A to Z')}${b('lp-exp', 'download', 'Export')}<label class="btn sm" title="Import" aria-label="Import">${icon('upload')}<input type="file" class="lp-imp" data-key="${esc(key)}" accept=".json,application/json" hidden></label>${aiAskBtn(key, true)}${b('lp-del', 'trash', 'Delete')}</div>`;
}
function libCur(key) {
  const r = libRef(key); if (!r) return {};
  const arr = r[1](), mine = r[2] ? arr.filter(r[2]) : arr, id = ui.pick && ui.pick[key], cur = mine.find(x => x.id === id) || mine[0];
  return { r, arr, mine, cur };
}
function libAct(a, key) {
  // Row buttons in a table name the item too: "mat|m-abc".
  if (key && key.includes('|')) { const [k, id] = key.split('|'); pickState().pick[k] = id; key = k; }
  const { r, arr, mine, cur } = libCur(key); if (!cur) return false;
  const fresh = x => { const c = JSON.parse(JSON.stringify(x)); c.id = uid(String(x.id).split('-')[0] || r[0]); return c; };
  switch (a) {
    case 'lp-copy': mutate(() => { const c = fresh(cur); c.name = (cur.name || '') + ' copy'; arr.splice(arr.indexOf(cur) + 1, 0, c); pickState().pick[key] = c.id; }); return true;
    case 'lp-ren': { const n = document.querySelector(`[data-obj="${r[0]}:${CSS.escape(cur.id)}"][data-field="name"]`); if (n) { n.focus(); n.select && n.select(); } else flash('Type the new name in the Name box'); return true; }
    case 'lp-up': case 'lp-down': {
      const i = mine.indexOf(cur), j = a === 'lp-up' ? i - 1 : i + 1; if (j < 0 || j >= mine.length) return true;
      mutate(() => { const ai = arr.indexOf(cur), bi = arr.indexOf(mine[j]); arr[ai] = mine[j]; arr[bi] = cur; }); return true;
    }
    case 'lp-az': mutate(() => { const pos = mine.map(x => arr.indexOf(x)).sort((p, q) => p - q), sorted = [...mine].sort((p, q) => String(p.group || '').localeCompare(String(q.group || '')) || String(p.name || '').localeCompare(String(q.name || ''), undefined, { numeric: true })); pos.forEach((p, i) => arr[p] = sorted[i]); }); flash('Sorted A to Z'); return true;
    case 'lp-expall': libDownload(`${(S.job.name || 'shop').replace(/[^\w -]/g, '')} ${key}.json`, { format: 'cabinet-designer-library', kind: key, items: mine }); return true;
    case 'lp-exp': libDownload(`${(cur.name || key).replace(/[^\w -]/g, '')}.json`, { format: 'cabinet-designer-library', kind: key, items: [cur] }); return true;
    case 'lp-del': {
      if (mine.length < 2) { flash('Keep at least one'); return true; }
      const rest = JSON.stringify({ ...S, [Object.keys(S).find(k => S[k] === arr)]: arr.filter(x => x !== cur) });
      if (rest.includes(`"${cur.id}"`)) { flash(`${cur.name} is still used in this job. Pick something else where it's used first.`); return true; }
      mutate(() => { arr.splice(arr.indexOf(cur), 1); }); flash(`Deleted ${cur.name}`); return true;
    }
  }
  return false;
}
function libDownload(name, data) {
  const u = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })), a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
}
async function libImport(key, file) {
  let d; try { d = JSON.parse(await file.text()); } catch (e) { flash('That file is not a library file'); return; }
  const list = Array.isArray(d) ? d : Array.isArray(d.items) ? d.items : [d], r = libRef(key);
  if (d.kind && d.kind !== key) { flash(`That file holds ${d.kind} items, not these`); return; }
  const n = libAddItems(key, list);
  flash(n ? `Imported ${n}` : 'Nothing to import in that file');
}
// Adds items to a library (from a file or from Ask Claude). Ids and names that are taken get new ones; the last one added is picked.
function libAddItems(key, list) {
  const r = libRef(key); if (!r) return 0;
  const kind = /^hw-/.test(key) ? key.slice(3) : null, ok = list.filter(x => x && typeof x === 'object' && (!kind || x.kind === kind));
  if (!ok.length) return 0;
  mutate(() => { const arr = r[1](); ok.forEach(x => { const c = JSON.parse(JSON.stringify(x)); if (!c.id || arr.some(y => y.id === c.id)) c.id = uid(String(c.id || r[0]).split('-')[0] || r[0]); if (arr.some(y => y.name === c.name)) c.name += ' (imported)'; arr.push(c); pickState().pick[key] = c.id; }); });
  return ok.length;
}
document.addEventListener('change', e => { const f = e.target.closest && e.target.closest('.lp-imp'); if (f && f.files[0]) { libImport(f.dataset.key, f.files[0]); f.value = ''; } });
function picked(key, items) { if (items.length < 2) return items; const id = pickId(key, items); return items.filter(x => x.id === id); }
document.addEventListener('change', e => {
  const s = e.target.closest && e.target.closest('.pick-sel'); if (!s) return;
  pickState().pick[s.dataset.key] = s.value; render();
});
document.addEventListener('input', e => {
  const f = e.target.closest && e.target.closest('.pick-find'); if (!f) return;
  const key = f.dataset.key, pos = f.selectionStart; pickState().pickQ[key] = f.value; render();
  const n = document.querySelector(`.pick-find[data-key="${CSS.escape(key)}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} }
});

/* Tables (materials, edge bands): a Find box, group header rows, and copy / move buttons on each row. */
function libTableBar(key, label) {
  const q = (ui.pickQ || {})[key] || '';
  return `<div class="pickbar lt-bar"><label class="f pick-findf"><span>Find</span><input type="search" class="pick-find" data-key="${esc(key)}" value="${esc(q)}" placeholder="Type part of a name" aria-label="Find ${esc(label)}"></label>
    <div class="lp-tools" role="group" aria-label="${esc(label)} library"><button class="btn sm" data-act="lp-az" data-id="${esc(key)}">${icon('sort')}A to Z</button><button class="btn sm" data-act="lp-expall" data-id="${esc(key)}">${icon('download')}Export all</button><label class="btn sm">${icon('upload')}Import<input type="file" class="lp-imp" data-key="${esc(key)}" accept=".json,application/json" hidden></label>${aiAskBtn(key)}</div></div>`;
}
// Folding menus shared by the library pages (Products, Materials, Edgebanding): one open/closed list, kept between visits.
// Groups start closed; a search opens every group with a match.
function pageFold() { if (!ui.pageFold) { try { ui.pageFold = JSON.parse(localStorage.getItem(KEY + '.pfold') || '{}'); } catch (_) { ui.pageFold = {}; } } return ui.pageFold; }
const foldShut = k => !(pageFold()[k]);
function foldToggle(k) { const f = pageFold(); if (f[k]) delete f[k]; else f[k] = 1; try { localStorage.setItem(KEY + '.pfold', JSON.stringify(f)); } catch (_) {} }
function foldOpen(k) { const f = pageFold(); if (!f[k]) { f[k] = 1; try { localStorage.setItem(KEY + '.pfold', JSON.stringify(f)); } catch (_) {} } }
const foldHead = (k, label, n, shut, cls) => `<button class="${cls}" data-act="pg-fold" data-id="${esc(k)}" aria-expanded="${!shut}"><span class="arr" aria-hidden="true">${shut ? '▸' : '▾'}</span><span>${label}</span>${n ? `<span class="ct">${n}</span>` : ''}</button>`;
// The rows to show, in order, with a folding header before each group: [{hdr: 'MDF', n, shut}, item, item, …]. A closed group shows only its header.
function libRows(key, arr) {
  pickState(); const q = ui.pickQ[key] || '', shown = arr.filter(x => pickMatch(x, q) || String(x.group || '').toLowerCase().includes(q.toLowerCase()));
  if (!arr.some(x => x.group)) return shown;
  const out = [], gs = [...new Set(shown.map(x => x.group || ''))].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
  gs.forEach(g => { const items = shown.filter(x => (x.group || '') === g), fk = key + '/' + g, shut = !q && foldShut(fk); out.push({ hdr: g || 'No group', fk, n: items.length, shut }); if (!shut) items.forEach(x => out.push(x)); });
  return out;
}
// Typing a new group name moves the row there; open that group so the row stays in view.
document.addEventListener('change', e => { const t = e.target; if (!t || !t.dataset || t.dataset.field !== 'group') return; const k = String(t.dataset.obj || '').split(':')[0]; if (k === 'mat' || k === 'eb') foldOpen(k + '/' + String(t.value || '').trim()); }, true);
const libGroupRow = (h, cols) => `<tr class="grouphead"><td colspan="${cols}" class="grouprow">${foldHead(h.fk, esc(h.hdr), h.n, h.shut, 'grp-tog')}</td></tr>`;
const libRowBtns = (key, id) => `<span class="lp-row">${['copy|Copy', 'up|Move up', 'down|Move down'].map(t => { const [ic, l] = t.split('|'); return `<button class="btn sm" data-act="lp-${ic === 'copy' ? 'copy' : ic}" data-id="${esc(key + '|' + id)}" title="${l}" aria-label="${l}">${icon(ic)}</button>`; }).join('')}</span>`;
